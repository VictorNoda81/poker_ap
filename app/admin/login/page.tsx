import { redirect } from "next/navigation";
import { SpadeIcon } from "@/components/brand/icons";
import {
  checkPassword,
  checkRateLimit,
  isAdmin,
  recordLoginAttempt,
  startSession,
} from "@/lib/auth";
import { formatarEspera } from "@/lib/domain/rate-limit";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar no painel" };

type SearchParams = { searchParams: Promise<{ erro?: string; espera?: string }> };

async function login(formData: FormData) {
  "use server";

  // O limite é checado ANTES de olhar a senha: sem isso, o custo de tentar
  // continuaria baixo e o limite não protegeria de nada.
  const limite = await checkRateLimit();
  if (limite.bloqueado) {
    redirect(`/admin/login?erro=bloqueado&espera=${limite.liberaEmSegundos}`);
  }

  const password = String(formData.get("senha") ?? "");
  // Campo vazio não gasta tentativa: é engano de quem digita, não ataque.
  if (!password) redirect("/admin/login?erro=vazia");

  let ok = false;
  try {
    ok = checkPassword(password);
  } catch {
    redirect("/admin/login?erro=config");
  }

  await recordLoginAttempt(ok);

  if (!ok) {
    const restantes = Math.max(0, limite.restantes - 1);
    redirect(`/admin/login?erro=invalida&espera=${restantes}`);
  }

  await startSession();
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: SearchParams) {
  if (await isAdmin()) redirect("/admin");

  const { erro, espera } = await searchParams;

  let mensagem: string | null = null;
  if (erro === "vazia") {
    mensagem = "Digite a senha para continuar.";
  } else if (erro === "config") {
    mensagem = "ADMIN_PASSWORD não está configurada no servidor. Veja o .env.example.";
  } else if (erro === "bloqueado") {
    const segundos = Number(espera) || 60;
    mensagem = `Muitas tentativas. Tente novamente em ${formatarEspera(segundos)}.`;
  } else if (erro === "invalida") {
    const restantes = Number(espera);
    mensagem =
      Number.isFinite(restantes) && restantes > 0
        ? `Senha incorreta. ${restantes} tentativa${restantes === 1 ? "" : "s"} restante${restantes === 1 ? "" : "s"}.`
        : "Senha incorreta.";
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card felt-grain relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-cap-red/15 to-transparent blur-2xl" />

        <div className="relative">
          <SpadeIcon className="h-8 w-8 text-cap-red" />
          <h1 className="mt-4 text-2xl font-extrabold text-chalk">Painel do administrador</h1>
          <p className="mt-2 text-sm text-chalk-dim">
            Área restrita da Liga de Poker do CAP. Informe a senha para gerenciar temporadas,
            jogadores e resultados.
          </p>

          <form action={login} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="senha"
                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-chalk-dim"
              >
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-chalk focus:border-cap-red focus:outline-none"
              />
            </div>

            {mensagem ? (
              <p
                role="alert"
                className="rounded-lg border border-cap-red/40 bg-cap-red/10 px-3 py-2 text-sm text-cap-red-light"
              >
                {mensagem}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-cap-red px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cap-red-dark"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
