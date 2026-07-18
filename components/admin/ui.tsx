/** Peças reutilizadas pelas telas do admin. */

/**
 * Mensagem de sucesso/erro vinda da query string.
 *
 * As Server Actions redirecionam com `?ok=` ou `?erro=` em vez de devolver
 * estado — assim a mensagem sobrevive ao reload e não precisa de useState.
 */
export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;

  return (
    <p
      role="status"
      className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
        erro
          ? "border-cap-red/40 bg-cap-red/10 text-cap-red-light"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      {erro ?? ok}
    </p>
  );
}

export function AdminCard({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {title ? (
        <header className="mb-4">
          <h2 className="text-base font-bold text-chalk">{title}</h2>
          {description ? <p className="mt-1 text-sm text-chalk-dim">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-chalk-dim">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-chalk placeholder:text-chalk-dim/50 focus:border-cap-red focus:outline-none";

export const inputNumberClass = `${inputClass} tnum text-right`;

export function PrimaryButton({
  children,
  type = "submit",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      {...rest}
      className="rounded-lg bg-cap-red px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cap-red-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  type = "button",
  tone = "default",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger" }) {
  return (
    <button
      type={type}
      {...rest}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "border-cap-red/40 text-cap-red-light hover:bg-cap-red/10"
          : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
      } ${className}`}
    >
      {children}
    </button>
  );
}
