"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Painel", exact: true },
  { href: "/admin/etapas", label: "Etapas" },
  { href: "/admin/jogadores", label: "Jogadores" },
  { href: "/admin/temporadas", label: "Temporadas" },
  { href: "/admin/final", label: "Etapa Final" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação do admin" className="table-scroll -mx-1">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-cap-red/15 text-cap-red-light"
                    : "text-chalk-dim hover:bg-ink-850 hover:text-chalk"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
