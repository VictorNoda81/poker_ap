"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { RankingRow } from "@/lib/domain/ranking";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

type Order = "nome" | "ranking";

/**
 * Diretório de jogadores: busca por nome e alternância entre ordem alfabética
 * e ordem do ranking da temporada atual.
 */
export function PlayersDirectory({ rows }: { rows: RankingRow[] }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>("nome");

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    const list = needle
      ? rows.filter((row) => normalize(row.player.fullName).includes(needle))
      : [...rows];

    return list.sort((a, b) =>
      order === "nome"
        ? a.player.fullName.localeCompare(b.player.fullName, "pt-BR")
        : a.position - b.position,
    );
  }, [rows, query, order]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="w-full sm:max-w-xs">
          <span className="sr-only">Buscar jogador pelo nome</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar jogador…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-chalk placeholder:text-chalk-dim/60 focus:border-cap-red focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-chalk-dim">Ordenar por</span>
          {(["nome", "ranking"] as Order[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrder(value)}
              aria-pressed={order === value}
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                order === value
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-chalk-dim">{formatNumber(filtered.length)} jogadores</p>

      {filtered.length === 0 ? (
        <p className="card px-4 py-10 text-center text-sm text-chalk-dim">
          Nenhum jogador encontrado para “{query}”.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <li key={row.player.id}>
              <Link
                href={`/jogadores/${row.player.id}`}
                className="card flex h-full flex-col gap-2 p-4 transition-colors hover:border-cap-red/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold leading-tight text-chalk">
                    {row.player.fullName}
                  </span>
                  {row.stagesPlayed > 0 ? (
                    <span
                      className={`tnum shrink-0 text-sm font-black ${
                        row.position === 1
                          ? "text-gold-bright"
                          : row.position === 2
                            ? "text-silver"
                            : row.position === 3
                              ? "text-bronze"
                              : "text-chalk-dim"
                      }`}
                    >
                      {row.position}º
                    </span>
                  ) : null}
                </div>

                <PlayerTypeBadge
                  type={row.player.type}
                  memberNumber={row.player.memberNumber}
                  invitedByName={row.player.invitedByName}
                />

                {row.stagesPlayed > 0 ? (
                  <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Pontos
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {formatNumber(row.totalPoints)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Etapas
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {row.stagesPlayed}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Saldo
                      </dt>
                      <dd
                        className={`tnum mt-0.5 text-sm font-bold ${
                          row.balance > 0
                            ? "text-emerald-400"
                            : row.balance < 0
                              ? "text-cap-red-light"
                              : "text-chalk-dim"
                        }`}
                      >
                        {row.totalPaid === 0 && row.totalReceived === 0
                          ? "—"
                          : formatBRLSigned(row.balance)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-auto border-t border-white/5 pt-3 text-xs text-chalk-dim">
                    Ainda sem participação nesta temporada
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
