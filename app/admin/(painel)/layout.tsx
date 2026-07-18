import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { endSession, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await endSession();
  redirect("/admin/login");
}

/**
 * Layout de TODAS as telas protegidas do admin.
 *
 * A barreira fica aqui e é repetida dentro de cada Server Action: o layout
 * bloqueia a navegação, mas só a checagem dentro da action bloqueia um POST
 * direto ao endpoint.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 border-b border-ink-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-cap-red-light">
            Administração
          </p>
          <p className="mt-1 text-sm text-chalk-dim">
            Alterações feitas aqui aparecem na hora na área pública.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
          >
            Ver site
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      <AdminNav />

      <div className="mt-6">{children}</div>
    </div>
  );
}
