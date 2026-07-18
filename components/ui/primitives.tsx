import Link from "next/link";
import { CardsIcon } from "@/components/brand/icons";
import type { PlayerType } from "@/lib/domain/ranking";

/** Cabeçalho de página: título grande, subtítulo e ações à direita. */
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-cap-red-light">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-chalk sm:text-3xl">{title}</h1>
        {subtitle ? <div className="mt-2 text-sm text-chalk-dim">{subtitle}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Cartão de número em destaque (arrecadação, reserva, etc.). */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "gold" | "positive" | "negative";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold-bright"
      : tone === "positive"
        ? "text-emerald-400"
        : tone === "negative"
          ? "text-cap-red-light"
          : "text-chalk";

  return (
    <div className="card relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-chalk-dim">
          {label}
        </p>
        {icon ? <span className="text-chalk-dim/40">{icon}</span> : null}
      </div>
      <p className={`tnum mt-2 text-xl font-extrabold sm:text-2xl ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-chalk-dim">{hint}</p> : null}
    </div>
  );
}

/** Etiqueta de tipo do jogador. */
export function PlayerTypeBadge({
  type,
  memberNumber,
  invitedByName,
}: {
  type: PlayerType;
  memberNumber?: string | null;
  invitedByName?: string | null;
}) {
  if (type === "socio") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-300">
        Sócio
        {memberNumber ? <span className="tnum opacity-70">nº {memberNumber}</span> : null}
      </span>
    );
  }

  if (type === "convidado") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-sky-300">
        Convidado
        {invitedByName ? <span className="opacity-70">· {invitedByName}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300">
      A definir
    </span>
  );
}

/** Estado vazio com marca d'água de cartas. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <CardsIcon className="h-12 w-12 text-chalk-dim/25" />
      <p className="text-base font-semibold text-chalk">{title}</p>
      {description ? <p className="max-w-md text-sm text-chalk-dim">{description}</p> : null}
      {action}
    </div>
  );
}

/**
 * Tela exibida quando o Supabase ainda não foi configurado.
 * Sem isso, `npm run dev` num clone limpo quebraria com erro de conexão.
 */
export function SetupNotice() {
  return (
    <div className="card mx-auto max-w-2xl p-6 sm:p-8">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-cap-red-light">
        Configuração pendente
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-chalk">Conecte o Supabase</h1>
      <p className="mt-3 text-sm text-chalk-dim">
        O app está rodando, mas ainda não sabe onde buscar os dados. Para colocar o ranking no ar:
      </p>
      <ol className="mt-4 space-y-2 text-sm text-chalk-dim">
        {[
          "Crie um projeto em supabase.com",
          "Copie .env.example para .env.local e preencha as chaves",
          "Rode as migrations de supabase/migrations no SQL Editor",
          "Rode npm run seed para importar a temporada 2026",
        ].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cap-red text-[0.7rem] font-bold text-white">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-chalk-dim">
        O passo a passo completo está no <code className="text-chalk">README.md</code>.
      </p>
    </div>
  );
}

/** Aviso de erro amigável, usado quando uma consulta falha. */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="card border-cap-red/40 bg-cap-red/5 p-6">
      <p className="text-sm font-semibold text-cap-red-light">Não foi possível carregar os dados</p>
      <p className="mt-2 text-sm text-chalk-dim">{message}</p>
      <p className="mt-3 text-xs text-chalk-dim">
        Confira as variáveis de ambiente e se as migrations foram aplicadas.
      </p>
    </div>
  );
}

/** Link discreto em estilo "voltar". */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-chalk-dim transition-colors hover:text-cap-red-light"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
