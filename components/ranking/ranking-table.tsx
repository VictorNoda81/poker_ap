"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRL, formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { PlayerType, RankingRow } from "@/lib/domain/ranking";

type Filter = "todos" | "socio" | "convidado" | "indefinido";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "socio", label: "Sócios" },
  { value: "convidado", label: "Convidados" },
  { value: "indefinido", label: "A definir" },
];

/**
 * Remove acentos para a busca por nome funcionar sem exigir acentuação:
 * digitar "regis" encontra "Régis". A faixa U+0300–U+036F são os sinais
 * diacríticos que a decomposição NFD separa das letras.
 */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase();
}

function positionClass(position: number): string {
  if (position === 1) return "text-gold-bright";
  if (position === 2) return "text-silver";
  if (position === 3) return "text-bronze";
  return "text-chalk-dim";
}

function balanceClass(balance: number): string {
  if (balance > 0) return "text-emerald-400";
  if (balance < 0) return "text-cap-red-light";
  return "text-chalk-dim";
}

export function RankingTable({
  rows,
  showFinancials = true,
}: {
  rows: RankingRow[];
  showFinancials?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<Filter>("todos");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return rows.filter((row) => {
      if (typeFilter !== "todos" && row.player.type !== (typeFilter as PlayerType)) return false;
      // Sem busca ativa, esconde quem ainda não jogou nenhuma etapa —
      // eles aparecem ao marcar "mostrar todos".
      if (!needle && !showAll && row.stagesPlayed === 0) return false;
      if (!needle) return true;
      return normalize(row.player.fullName).includes(needle);
    });
  }, [rows, query, typeFilter, showAll]);

  const hiddenCount = rows.filter((row) => row.stagesPlayed === 0).length;

  return (
    <section aria-label="Classificação geral">
      {/* ---------------------------------------------------------------- */}
      {/* Filtros                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Buscar jogador pelo nome</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar jogador…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 pl-9 text-sm text-chalk placeholder:text-chalk-dim/60 focus:border-cap-red focus:outline-none"
          />
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chalk-dim/60"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
          </svg>
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setTypeFilter(filter.value)}
              aria-pressed={typeFilter === filter.value}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                typeFilter === filter.value
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-chalk-dim">
        {filtered.length === rows.length
          ? `${formatNumber(filtered.length)} jogadores`
          : `${formatNumber(filtered.length)} de ${formatNumber(rows.length)} jogadores`}
        {hiddenCount > 0 && !showAll && !query ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="font-semibold text-cap-red-light underline-offset-2 hover:underline"
            >
              mostrar {hiddenCount} sem participação
            </button>
          </>
        ) : null}
      </p>

      {/* ---------------------------------------------------------------- */}
      {/* Tabela                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="card table-scroll">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.12em] text-chalk-dim">
              <th scope="col" className="px-3 py-3 font-bold">#</th>
              <th scope="col" className="px-3 py-3 font-bold">Jogador</th>
              <th scope="col" className="px-3 py-3 text-right font-bold">Pontos</th>
              <th scope="col" className="px-3 py-3 text-right font-bold">Etapas</th>
              <th scope="col" className="px-3 py-3 text-right font-bold">Média pts</th>
              <th scope="col" className="px-3 py-3 text-right font-bold">Class. média</th>
              {showFinancials ? (
                <>
                  <th scope="col" className="px-3 py-3 text-right font-bold">Pago</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold">Arrecadado</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold">Saldo</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const semFinanceiro = row.totalPaid === 0 && row.totalReceived === 0;
              return (
                <tr
                  key={row.player.id}
                  className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
                >
                  <td className={`tnum px-3 py-3 text-base font-black ${positionClass(row.position)}`}>
                    {row.stagesPlayed === 0 ? "—" : row.position}
                  </td>

                  <td className="px-3 py-3">
                    <Link
                      href={`/jogadores/${row.player.id}`}
                      className="font-semibold text-chalk transition-colors hover:text-cap-red-light"
                    >
                      {row.player.fullName}
                    </Link>
                    <div className="mt-1">
                      <PlayerTypeBadge
                        type={row.player.type}
                        memberNumber={row.player.memberNumber}
                        invitedByName={row.player.invitedByName}
                      />
                    </div>
                  </td>

                  <td className="tnum px-3 py-3 text-right text-base font-bold text-chalk">
                    {formatNumber(row.totalPoints)}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-chalk-dim">{row.stagesPlayed}</td>
                  <td className="tnum px-3 py-3 text-right text-chalk-dim">
                    {row.stagesPlayed === 0 ? "—" : formatNumber(row.averagePoints, 1)}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-chalk-dim">
                    {row.averagePlacement === null
                      ? "—"
                      : `${formatNumber(row.averagePlacement, 1)}º`}
                  </td>

                  {showFinancials ? (
                    <>
                      <td className="tnum px-3 py-3 text-right text-chalk-dim">
                        {semFinanceiro ? "—" : formatBRL(row.totalPaid)}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-chalk-dim">
                        {semFinanceiro ? "—" : formatBRL(row.totalReceived)}
                      </td>
                      <td
                        className={`tnum px-3 py-3 text-right font-bold ${
                          semFinanceiro ? "text-chalk-dim" : balanceClass(row.balance)
                        }`}
                      >
                        {semFinanceiro ? "—" : formatBRLSigned(row.balance)}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-chalk-dim">
            Nenhum jogador encontrado para “{query}”.
          </p>
        ) : null}
      </div>
    </section>
  );
}
