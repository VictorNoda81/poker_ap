"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MedalIcon } from "@/components/brand/icons";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import type { PlayerType } from "@/lib/domain/ranking";

/** Espelha `StageEntryDetail`, mas serializável para o client component. */
export interface StageResultRow {
  playerId: string;
  fullName: string;
  type: PlayerType;
  memberNumber: string | null;
  invitedByName: string | null;
  displayPlacement: number;
  points: number;
  rebuys: number | null;
  hadAddon: boolean | null;
  amountPaid: number | null;
  prizeAmount: number;
  needsReview: boolean;
  reviewNote: string | null;
}

type SortKey =
  | "colocacao"
  | "jogador"
  | "pontos"
  | "rebuys"
  | "addon"
  | "pago"
  | "premio"
  | "saldo";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; lowerIsBetter?: boolean }[] = [
  { key: "colocacao", label: "Col.", align: "left", lowerIsBetter: true },
  { key: "jogador", label: "Jogador", align: "left", lowerIsBetter: true },
  { key: "pontos", label: "Pontos", align: "right" },
  { key: "rebuys", label: "Re-buys", align: "right", lowerIsBetter: true },
  { key: "addon", label: "Add-on", align: "right", lowerIsBetter: true },
  { key: "pago", label: "Pago", align: "right" },
  { key: "premio", label: "Prêmio", align: "right" },
  { key: "saldo", label: "Saldo", align: "right" },
];

function placementClass(placement: number): string {
  if (placement === 1) return "text-gold-bright";
  if (placement === 2) return "text-silver";
  if (placement === 3) return "text-bronze";
  return "text-chalk-dim";
}

function saldoOf(row: StageResultRow): number | null {
  return row.amountPaid === null ? null : row.prizeAmount - row.amountPaid;
}

function sortValue(row: StageResultRow, key: SortKey): number | string | null {
  switch (key) {
    case "colocacao":
      return row.displayPlacement;
    case "jogador":
      return row.fullName;
    case "pontos":
      return row.points;
    case "rebuys":
      return row.rebuys;
    // null (não lançado) cai para o fim da ordenação, como nas outras colunas.
    case "addon":
      return row.hadAddon === null ? null : row.hadAddon ? 1 : 0;
    case "pago":
      return row.amountPaid;
    case "premio":
      return row.prizeAmount;
    case "saldo":
      return saldoOf(row);
  }
}

export function StageResultsTable({ rows }: { rows: StageResultRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("colocacao");
  const [asc, setAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
      return;
    }
    setSortKey(key);
    setAsc(Boolean(COLUMNS.find((c) => c.key === key)?.lowerIsBetter));
  }

  const ordenadas = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "pt-BR") * dir;
      }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir || a.fullName.localeCompare(b.fullName, "pt-BR");
    });
  }, [rows, sortKey, asc]);

  return (
    <>
      <p className="mb-2 text-xs text-chalk-dim">Toque num título para ordenar.</p>
      <div className="card table-scroll">
        <table className="w-full min-w-[43rem] table-fixed border-collapse text-sm">
          {/* Colunas estreitas de propósito: no celular, uma coluna de nome larga
              empurrava os Pontos para longe do jogador. Nomes compridos truncam
              com "…" e aparecem inteiros no title. A última coluna não tem
              largura — ela absorve a sobra em vez de o nome esticar. */}
          <colgroup>
            <col className="w-[3.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[6.5rem]" />
            <col />
          </colgroup>

          <thead>
            <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.1em] text-chalk-dim">
              {COLUMNS.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (asc ? "ascending" : "descending") : "none"}
                    className={`px-1.5 py-2.5 font-bold ${c.align === "right" ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-chalk ${
                        active ? "text-cap-red-light" : ""
                      } ${c.align === "right" ? "flex-row-reverse" : ""}`}
                    >
                      {c.label}
                      <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                        {asc ? "▲" : "▼"}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th aria-hidden="true" className="px-0" />
            </tr>
          </thead>

          <tbody>
            {ordenadas.map((row) => {
              const saldo = saldoOf(row);
              return (
                <tr
                  key={row.playerId}
                  className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
                >
                  <td className="px-1.5 py-2.5">
                    <span
                      className={`tnum inline-flex items-center gap-1.5 text-base font-black ${placementClass(row.displayPlacement)}`}
                    >
                      {row.displayPlacement <= 3 ? (
                        <MedalIcon
                          className="h-4 w-4"
                          place={row.displayPlacement as 1 | 2 | 3}
                        />
                      ) : null}
                      {row.displayPlacement}º
                    </span>
                  </td>

                  <td className="px-1.5 py-2.5">
                    <Link
                      href={`/jogadores/${row.playerId}`}
                      title={row.fullName}
                      className="block truncate font-semibold text-chalk transition-colors hover:text-cap-red-light"
                    >
                      {row.fullName}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <PlayerTypeBadge
                        type={row.type}
                        memberNumber={row.memberNumber}
                        invitedByName={row.invitedByName}
                      />
                      {row.needsReview ? (
                        <span
                          title={row.reviewNote ?? undefined}
                          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-300"
                        >
                          revisar
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="tnum px-1.5 py-2.5 text-right text-base font-bold text-chalk">
                    {formatNumber(row.points)}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.rebuys === null ? "—" : row.rebuys}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.hadAddon === null ? "—" : row.hadAddon ? "sim" : "não"}
                  </td>
                  <td className="tnum whitespace-nowrap px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.amountPaid === null ? "—" : formatBRL(row.amountPaid)}
                  </td>
                  <td
                    className={`tnum whitespace-nowrap px-1.5 py-2.5 text-right ${
                      row.prizeAmount > 0 ? "font-bold text-gold" : "text-chalk-dim"
                    }`}
                  >
                    {row.prizeAmount > 0 ? formatBRL(row.prizeAmount) : "—"}
                  </td>
                  <td
                    className={`tnum whitespace-nowrap px-1.5 py-2.5 text-right font-semibold ${
                      saldo === null
                        ? "text-chalk-dim"
                        : saldo > 0
                          ? "text-emerald-400"
                          : saldo < 0
                            ? "text-cap-red-light"
                            : "text-chalk-dim"
                    }`}
                  >
                    {saldo === null ? "—" : formatBRL(saldo)}
                  </td>
                  <td aria-hidden="true" className="px-0" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
