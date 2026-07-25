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
 * digitar "regis" encontra "Régis".
 */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
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

/**
 * Enquanto houver etapa sem o valor gasto lançado, "Pago", "Saldo" e "ROI" não
 * são calculáveis: somar prêmios contra um gasto parcial mostraria lucro que
 * não existe. Nesses casos a tabela exibe "—".
 */
function gastoIncompleto(row: RankingRow): boolean {
  return row.stagesMissingFinancials > 0;
}

/**
 * Mesma lógica de "Pago": enquanto houver etapa sem re-buy/add-on lançados, os
 * totais mentiriam — um jogador com 6 etapas e só 1 lançada apareceria com
 * "1 re-buy", parecendo mais econômico que quem teve tudo registrado.
 *
 * A liga só passou a registrar re-buy e add-on em 2026; as etapas importadas
 * das planilhas não têm essa informação, então hoje quase tudo exibe "—".
 */
function extrasIncompletos(row: RankingRow): boolean {
  return row.stagesPlayed === 0 || row.stagesMissingExtras > 0;
}

/** ROI = quanto recebeu ÷ quanto gastou. null quando o gasto não é conhecido. */
function roiOf(row: RankingRow): number | null {
  if (gastoIncompleto(row) || row.totalPaid <= 0) return null;
  return row.totalReceived / row.totalPaid;
}

type SortKey =
  | "position"
  | "nome"
  | "pontos"
  | "etapas"
  | "mediaPts"
  | "classMedia"
  | "primeiro"
  | "segundo"
  | "terceiro"
  | "melhor"
  | "rebuys"
  | "addons"
  | "mediaRebuys"
  | "pago"
  | "arrecadado"
  | "saldo"
  | "roi";

interface Column {
  key: SortKey;
  label: string;
  /** Alinhamento do conteúdo. */
  align: "left" | "right" | "center";
  /** Só aparece quando a tabela mostra dados financeiros. */
  financial?: boolean;
  /** Menor é melhor (colocações) — ordena crescente por padrão. */
  lowerIsBetter?: boolean;
  title?: string;
}

const COLUMNS: Column[] = [
  { key: "position", label: "#", align: "left", lowerIsBetter: true },
  { key: "nome", label: "Jogador", align: "left", lowerIsBetter: true },
  { key: "pontos", label: "Pontos", align: "right" },
  { key: "etapas", label: "Etapas", align: "right" },
  { key: "mediaPts", label: "Média pts", align: "right", title: "Pontos por etapa jogada" },
  {
    key: "classMedia",
    label: "Class. média",
    align: "right",
    lowerIsBetter: true,
    title: "Colocação média por etapa com posição registrada",
  },
  { key: "primeiro", label: "1º", align: "right", title: "Vezes em 1º lugar numa etapa" },
  { key: "segundo", label: "2º", align: "right", title: "Vezes em 2º lugar numa etapa" },
  { key: "terceiro", label: "3º", align: "right", title: "Vezes em 3º lugar numa etapa" },
  {
    key: "melhor",
    label: "Melhor",
    align: "right",
    lowerIsBetter: true,
    title: "Melhor colocação numa etapa (e quantas vezes a atingiu)",
  },
  {
    key: "rebuys",
    label: "Re-buys",
    align: "right",
    lowerIsBetter: true,
    title: "Re-buys somados na temporada. Só aparece com todas as etapas lançadas.",
  },
  {
    key: "addons",
    label: "Add-ons",
    align: "right",
    lowerIsBetter: true,
    title: "Etapas em que pegou add-on",
  },
  {
    key: "mediaRebuys",
    label: "RB/etapa",
    align: "right",
    lowerIsBetter: true,
    title: "Re-buys por etapa jogada",
  },
  // Prêmio é o que o jogador GANHOU — sempre visível. Pago, Saldo e ROI revelam
  // quanto ele gastou; ficam atrás da opção do admin (`financial`).
  { key: "arrecadado", label: "Prêmio", align: "right" },
  { key: "pago", label: "Pago", align: "right", financial: true },
  { key: "saldo", label: "Saldo", align: "right", financial: true },
  {
    key: "roi",
    label: "ROI",
    align: "right",
    financial: true,
    title: "Prêmio ÷ pago. 1,00× significa empatar.",
  },
];

/** Valor numérico de cada coluna, para a ordenação. */
function sortValue(row: RankingRow, key: SortKey): number | string | null {
  switch (key) {
    case "position":
      return row.displayPosition || Number.MAX_SAFE_INTEGER;
    case "nome":
      return row.player.fullName;
    case "pontos":
      return row.totalPoints;
    case "etapas":
      return row.stagesPlayed;
    case "mediaPts":
      return row.averagePoints;
    case "classMedia":
      return row.averagePlacement;
    case "primeiro":
      return row.wins;
    case "segundo":
      return row.seconds;
    case "terceiro":
      return row.thirds;
    case "melhor":
      return row.bestPlacement;
    case "rebuys":
      return extrasIncompletos(row) ? null : row.totalRebuys;
    case "addons":
      return extrasIncompletos(row) ? null : row.totalAddons;
    case "mediaRebuys":
      return extrasIncompletos(row) ? null : row.averageRebuys;
    case "pago":
      return row.totalPaid;
    case "arrecadado":
      return row.totalReceived;
    case "saldo":
      return row.balance;
    case "roi":
      return roiOf(row);
  }
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
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [asc, setAsc] = useState(true);

  const columns = useMemo(
    () => COLUMNS.filter((c) => showFinancials || !c.financial),
    [showFinancials],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
      return;
    }
    setSortKey(key);
    // Começa na direção mais útil: colocações crescente, o resto decrescente.
    const col = COLUMNS.find((c) => c.key === key);
    setAsc(Boolean(col?.lowerIsBetter));
  }

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    const list = rows.filter((row) => {
      if (typeFilter !== "todos" && row.player.type !== (typeFilter as PlayerType)) return false;
      // Sem busca ativa, esconde quem ainda não jogou nenhuma etapa.
      if (!needle && !showAll && row.stagesPlayed === 0) return false;
      if (!needle) return true;
      return normalize(row.player.fullName).includes(needle);
    });

    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);

      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "pt-BR") * dir;
      }
      // Quem não tem o dado (null) vai sempre para o fim, em qualquer direção.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir || a.player.fullName.localeCompare(b.player.fullName, "pt-BR");
    });
  }, [rows, query, typeFilter, showAll, sortKey, asc]);

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
        {" · toque num título para ordenar"}
      </p>

      {/* ---------------------------------------------------------------- */}
      {/* Tabela                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="card table-scroll">
        <table
          className={`w-full table-fixed border-collapse text-sm ${
            showFinancials ? "min-w-[76rem]" : "min-w-[58rem]"
          }`}
        >
          {/* Larguras fixas + uma coluna final sem largura: o espaço que sobra
              vai para ela, em vez de a coluna do nome esticar e afastar os
              números. As colunas de dinheiro são mais largas porque
              "R$ 4.971,78" não pode quebrar em duas linhas. */}
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                className={
                  c.key === "nome"
                    ? "w-[8rem]"
                    : c.key === "position"
                      ? "w-[2.75rem]"
                      : // Colunas em reais: largas o bastante para "R$ 4.971,78"
                        // não quebrar em duas linhas.
                        c.key === "arrecadado" || c.key === "pago" || c.key === "saldo"
                        ? "w-[6.75rem]"
                        : "w-[4.5rem]"
                }
              />
            ))}
            <col />
          </colgroup>

          <thead>
            <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.1em] text-chalk-dim">
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (asc ? "ascending" : "descending") : "none"}
                    className={`px-1.5 py-2.5 font-bold ${
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      title={c.title}
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
            {filtered.map((row) => {
              const semGasto = gastoIncompleto(row) || row.totalPaid === 0;
              const roi = roiOf(row);
              return (
                <tr
                  key={row.player.id}
                  className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
                >
                  <td
                    className={`tnum px-1.5 py-2.5 text-base font-black ${positionClass(row.displayPosition)}`}
                  >
                    {row.stagesPlayed === 0 ? "—" : row.displayPosition}
                  </td>

                  <td className="px-1.5 py-2.5">
                    <Link
                      href={`/jogadores/${row.player.id}`}
                      title={row.player.fullName}
                      className="block truncate font-semibold text-chalk transition-colors hover:text-cap-red-light"
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

                  <td className="tnum px-1.5 py-2.5 text-right text-base font-bold text-chalk">
                    {formatNumber(row.totalPoints)}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">{row.stagesPlayed}</td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.stagesPlayed === 0 ? "—" : formatNumber(row.averagePoints, 1)}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.averagePlacement === null
                      ? "—"
                      : `${formatNumber(row.averagePlacement, 1)}º`}
                  </td>

                  <td className="tnum px-1.5 py-2.5 text-right font-semibold text-gold-bright">
                    {row.wins || "—"}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right font-semibold text-silver">
                    {row.seconds || "—"}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right font-semibold text-bronze">
                    {row.thirds || "—"}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {row.bestPlacement === null ? (
                      "—"
                    ) : (
                      <>
                        <span className="font-bold text-chalk">{row.bestPlacement}º</span>
                        {row.bestPlacementCount > 1 ? (
                          <span className="text-chalk-dim"> ×{row.bestPlacementCount}</span>
                        ) : null}
                      </>
                    )}
                  </td>

                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {extrasIncompletos(row) ? "—" : row.totalRebuys}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {extrasIncompletos(row) ? "—" : row.totalAddons}
                  </td>
                  <td className="tnum px-1.5 py-2.5 text-right text-chalk-dim">
                    {extrasIncompletos(row) || row.averageRebuys === null
                      ? "—"
                      : formatNumber(row.averageRebuys, 1)}
                  </td>

                  {/* Prêmio: sempre visível — é o que o jogador ganhou. */}
                  <td className="tnum whitespace-nowrap px-1.5 py-2.5 text-right font-semibold text-gold">
                    {row.totalReceived === 0 ? "—" : formatBRL(row.totalReceived)}
                  </td>

                  {showFinancials ? (
                    <>
                      <td className="tnum whitespace-nowrap px-1.5 py-2.5 text-right text-chalk-dim">
                        {semGasto ? "—" : formatBRL(row.totalPaid)}
                      </td>
                      <td
                        className={`tnum whitespace-nowrap px-1.5 py-2.5 text-right font-bold ${
                          semGasto ? "text-chalk-dim" : balanceClass(row.balance)
                        }`}
                      >
                        {semGasto ? "—" : formatBRLSigned(row.balance)}
                      </td>
                      <td
                        className={`tnum px-1.5 py-2.5 text-right font-semibold ${
                          roi === null
                            ? "text-chalk-dim"
                            : roi >= 1
                              ? "text-emerald-400"
                              : "text-cap-red-light"
                        }`}
                      >
                        {roi === null ? "—" : `${formatNumber(roi, 2)}×`}
                      </td>
                    </>
                  ) : null}
                  <td aria-hidden="true" className="px-0" />
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
