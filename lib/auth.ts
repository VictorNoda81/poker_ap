/**
 * Autenticação do painel de administração.
 *
 * Não há cadastro de usuários: existe UMA senha, guardada em `ADMIN_PASSWORD`.
 * Ao acertá-la, o servidor emite um cookie httpOnly contendo apenas a data de
 * expiração e uma assinatura HMAC feita com `SESSION_SECRET`. Como o conteúdo
 * é assinado, ninguém consegue forjar um cookie válido sem o segredo — e como
 * a senha nunca é gravada no cookie, ela não trafega depois do login.
 */

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  JANELA_MINUTOS,
  avaliarLimite,
  type EstadoLimite,
  type TentativaLogin,
} from "./domain/rate-limit";
import { getAdminClient } from "./supabase/admin";

const COOKIE_NAME = "cap_poker_admin";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET ausente ou muito curto. Gere um valor com: openssl rand -hex 32",
    );
  }
  return secret;
}

/**
 * A chave de assinatura mistura o SESSION_SECRET com um resumo da senha atual.
 *
 * O efeito prático: trocar ADMIN_PASSWORD invalida na hora todos os cookies já
 * emitidos. Sem isso, quem estivesse logado continuaria dentro por até 12h
 * mesmo depois da troca — justamente o cenário em que você troca a senha
 * porque ela vazou.
 */
function getSigningKey(): string {
  const passwordDigest = createHash("sha256")
    .update(process.env.ADMIN_PASSWORD ?? "")
    .digest("hex");
  return `${getSessionSecret()}:${passwordDigest}`;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("hex");
}

/**
 * Comparação em tempo constante, para o tempo de resposta não revelar quantos
 * caracteres da senha estavam certos.
 */
function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  // timingSafeEqual exige buffers do mesmo tamanho; comparamos o tamanho antes
  // (que já é público pela própria natureza da entrada).
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** true se a senha informada bate com ADMIN_PASSWORD. */
export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD não configurada. Veja .env.example.");
  }
  return safeEquals(password, expected);
}

function createToken(): string {
  const expiresAt = String(Date.now() + SESSION_DURATION_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  if (!safeEquals(signature, sign(expiresAt))) return false;
  return Number(expiresAt) > Date.now();
}

/** Grava o cookie de sessão. Chamado após validar a senha. */
export async function startSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** true quando há uma sessão de admin válida. */
export async function isAdmin(): Promise<boolean> {
  try {
    const store = await cookies();
    return verifyToken(store.get(COOKIE_NAME)?.value);
  } catch {
    return false;
  }
}

// ===========================================================================
// Limite de tentativas
// ===========================================================================

/**
 * Identifica a origem da tentativa por um HMAC do IP.
 *
 * Guardar o hash em vez do IP evita transformar a tabela num registro de
 * endereços de quem acessou o painel, sem perder a capacidade de agrupar
 * tentativas da mesma origem.
 *
 * Atrás da Vercel, o IP real vem em `x-forwarded-for` — o primeiro da lista,
 * já que os seguintes são proxies intermediários.
 */
async function getOriginHash(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || store.get("x-real-ip") || "desconhecido";
  return createHmac("sha256", getSessionSecret()).update(ip).digest("hex");
}

/** Estado atual do limite para quem está fazendo a requisição. */
export async function checkRateLimit(): Promise<EstadoLimite> {
  try {
    const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();

    const { data, error } = await getAdminClient()
      .from("admin_login_attempts")
      .select("succeeded, created_at")
      .eq("ip_hash", await getOriginHash())
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const tentativas: TentativaLogin[] = (data ?? []).map((linha) => ({
      at: new Date(linha.created_at as string),
      succeeded: Boolean(linha.succeeded),
    }));

    return avaliarLimite(tentativas);
  } catch {
    // Falha ao consultar o banco não pode trancar o admin para fora: se o
    // Supabase está indisponível, o painel não teria o que editar mesmo.
    // Liberamos a tentativa — a senha continua sendo exigida.
    return { bloqueado: false, restantes: 3, liberaEmSegundos: 0 };
  }
}

/**
 * Registra uma tentativa.
 *
 * Tentativas feitas DURANTE o bloqueio não entram: como a janela é deslizante,
 * gravá-las renovaria o bloqueio a cada nova tentativa e ele nunca expiraria —
 * inclusive para o dono da senha.
 */
export async function recordLoginAttempt(succeeded: boolean): Promise<void> {
  try {
    const db = getAdminClient();
    await db.from("admin_login_attempts").insert({
      ip_hash: await getOriginHash(),
      succeeded,
    });

    // Limpeza oportunista: o histórico não serve para nada depois de 24h.
    const ontem = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await db.from("admin_login_attempts").delete().lt("created_at", ontem);
  } catch {
    // Não conseguir registrar não deve impedir o login de acontecer.
  }
}

/**
 * Barreira usada por TODA página e Server Action do admin.
 *
 * Chamar isto dentro de cada Server Action é essencial: proteger apenas o
 * layout impediria a navegação, mas não impediria alguém de invocar a action
 * diretamente por POST.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
