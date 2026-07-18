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
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
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
