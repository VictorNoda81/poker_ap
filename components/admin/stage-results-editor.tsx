"use client";

import { useMemo, useState } from "react";
import { saveStageResults } from "@/app/admin/actions";
import { GhostButton, PrimaryButton, inputClass } from "@/components/admin/ui";
import { formatBRL, parseMoney, round2 } from "@/lib/domain/money";
import {
  suggestFinalPrizes,
  suggestStagePrizes,
  validatePrizeDistribution,
  type PrizeSettings,
} from "@/lib/domain/prizes";
import { pointsForPlacement, suggestAmountPaid } from "@/lib/domain/scoring";
import { buildStageMessage, type ShareEntry } from "@/lib/domain/share";
import type { RankingPlayer } from "@/lib/domain/ranking";
import { WhatsAppShare } from "@/components/share/whatsapp-share";

export interface EditorSettings extends PrizeSettings {
  rebuy: number;
  pointsBelowCutoff: number;
}

export interface EditorEntry {
  playerId: string;
  placement: number | null;
  amountPaid: number | null;
  rebuys: number | null;
  hadAddon: boolean | null;
  prizeAmount: number;
  needsReview: boolean;
  reviewNote: string | null;
}

/** Linha do formulário — tudo em string, do jeito que o admin digita. */
interface Row {
  playerId: string;
  placement: string;
  rebuys: string;
  hadAddon: boolean;
  amountPaid: string;
  needsReview: boolean;
  reviewNote: string | null;
}

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

function toRow(entry: EditorEntry): Row {
  return {
    playerId: entry.playerId,
    placement: entry.placement === null ? "" : String(entry.placement),
    rebuys: entry.rebuys === null ? "" : String(entry.rebuys),
    hadAddon: entry.hadAddon ?? false,
    amountPaid: entry.amountPaid === null ? "" : String(entry.amountPaid),
    needsReview: entry.needsReview,
    reviewNote: entry.reviewNote,
  };
}

export function StageResultsEditor({
  stageId,
  stageLabel,
  players,
  settings,
  pointsTable,
  initialEntries,
  isFinal,
  accumulatedReserve,
  rankingShare = 0,
  initialGrossOverride,
  initialAdminFeePerPlayer,
  initialOtherCosts,
}: {
  stageId: string;
  /** Nome da etapa ("Etapa 7 - Jul/26"), usado na mensagem de WhatsApp. */
  stageLabel: string;
  players: RankingPlayer[];
  settings: EditorSettings;
  pointsTable: Record<number, number>;
  initialEntries: EditorEntry[];
  isFinal: boolean;
  /** Reserva acumulada da temporada — só usada na Etapa Final. */
  /**
   * Na Etapa Final: o pote que vai de fato para a MESA — já sem a parte dos
   * líderes do ranking. Ver `splitFinalPot`.
   */
  accumulatedReserve: number;
  /** Só para exibição: quanto do acumulado foi separado para os líderes. */
  rankingShare?: number;
  initialGrossOverride: number | null;
  /** null = usa a taxa padrão da temporada. */
  initialAdminFeePerPlayer: number | null;
  initialOtherCosts: number;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialEntries.map(toRow));
  // Premiacao por colocacao (1o a 10o). So guarda o que o admin SOBRESCREVEU;
  // posicoes intactas seguem a regra padrao (que acompanha a arrecadacao).
  // Ao abrir uma etapa ja salva, comeca com os premios que ela tinha.
  const [premios, setPremios] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const e of initialEntries) {
      if (e.placement !== null && e.placement >= 1 && e.placement <= 10 && e.prizeAmount > 0) {
        init[e.placement] = String(e.prizeAmount);
      }
    }
    return init;
  });
  const [search, setSearch] = useState("");
  const [manualGross, setManualGross] = useState(initialGrossOverride !== null);
  const [grossInput, setGrossInput] = useState(
    initialGrossOverride === null ? "" : String(initialGrossOverride),
  );
  const [taxaInput, setTaxaInput] = useState(
    String(initialAdminFeePerPlayer ?? settings.adminFeePerPlayer),
  );
  const [custosInput, setCustosInput] = useState(
    initialOtherCosts > 0 ? String(initialOtherCosts) : "",
  );

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const chosen = useMemo(() => new Set(rows.map((row) => row.playerId)), [rows]);

  const available = useMemo(() => {
    const needle = normalize(search.trim());
    return players
      .filter((player) => !chosen.has(player.id))
      .filter((player) => !needle || normalize(player.fullName).includes(needle));
  }, [players, chosen, search]);

  // --- Números derivados ----------------------------------------------------

  /** Soma do que os participantes gastaram, ignorando campos ainda vazios. */
  const sumPaid = useMemo(
    () => round2(rows.reduce((sum, row) => sum + (parseMoney(row.amountPaid) ?? 0), 0)),
    [rows],
  );

  const missingPaid = rows.filter((row) => parseMoney(row.amountPaid) === null).length;

  const gross = manualGross ? (parseMoney(grossInput) ?? 0) : sumPaid;

  const taxaPorJogador = parseMoney(taxaInput) ?? settings.adminFeePerPlayer;
  const outrosCustos = parseMoney(custosInput) ?? 0;

  const breakdown = useMemo(() => {
    const placements = rows
      .map((row) => Number(row.placement))
      .filter((placement) => [1, 2, 3, 4, 5].includes(placement));

    const available = placements.length > 0 ? [...new Set(placements)].sort() : [1, 2, 3, 4, 5];
    const custos = {
      gross,
      participants: rows.length,
      adminFeePerPlayer: taxaPorJogador,
      otherCosts: outrosCustos,
    };

    return isFinal
      ? suggestFinalPrizes(accumulatedReserve, custos, settings, available)
      : suggestStagePrizes(custos, settings, available);
  }, [rows, gross, isFinal, accumulatedReserve, settings, taxaPorJogador, outrosCustos]);

  const POSICOES_PREMIADAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // Distribuicao padrao SEMPRE com 1o a 5o presentes, para a tabela de premiacao
  // mostrar o padrao completo mesmo antes de as colocacoes serem lancadas.
  const breakdownPadrao = useMemo(() => {
    const custos = {
      gross,
      participants: rows.length,
      adminFeePerPlayer: taxaPorJogador,
      otherCosts: outrosCustos,
    };
    return isFinal
      ? suggestFinalPrizes(accumulatedReserve, custos, settings, [1, 2, 3, 4, 5])
      : suggestStagePrizes(custos, settings, [1, 2, 3, 4, 5]);
  }, [gross, rows.length, isFinal, accumulatedReserve, settings, taxaPorJogador, outrosCustos]);

  /** Valor da regra padrao para uma colocacao (0 nas posicoes que ela nao premia). */
  const premioPadrao = (pos: number): number =>
    breakdownPadrao.byPlacement.find((p) => p.placement === pos)?.amount ?? 0;

  /** Premio efetivo de uma colocacao: o que o admin editou, senao a regra padrao. */
  const premioDaColocacao = (placement: number | null): number => {
    if (placement === null || placement < 1 || placement > 10) return 0;
    const override = premios[placement];
    return override !== undefined ? (parseMoney(override) ?? 0) : premioPadrao(placement);
  };

  const somaPremios = round2(POSICOES_PREMIADAS.reduce((s, pos) => s + premioDaColocacao(pos), 0));

  // Premios lancados = soma do que cada colocacao PRESENTE recebe (empate conta
  // as duas). E o valor que confere contra a arrecadacao.
  const prizeTotal = round2(
    rows.reduce((sum, row) => {
      const p = row.placement.trim() === "" ? null : Number(row.placement);
      return sum + premioDaColocacao(p !== null && p >= 1 ? p : null);
    }, 0),
  );

  // Na Final não há reserva nova — o bolo é o acumulado, então a conferência
  // compara contra o pool total em vez da arrecadação da etapa.
  const deducoes = round2(breakdown.adminFeeTotal + breakdown.otherCosts);
  const check = isFinal
    ? validatePrizeDistribution(round2(accumulatedReserve + gross), deducoes, 0, [prizeTotal])
    : validatePrizeDistribution(gross, deducoes, breakdown.reserve, [prizeTotal]);

  // --- Manipulação das linhas ----------------------------------------------

  /**
   * Mensagem de WhatsApp a partir do estado ATUAL da grade. Colocação em branco
   * = ainda na mesa; preenchida = eliminado naquela posição. Recalculada a cada
   * clique, então serve de parcial durante a etapa e de final ao terminar.
   */
  function buildStageWhatsApp(): string {
    const entries: ShareEntry[] = rows.map((row) => {
      const placement = row.placement.trim() === "" ? null : Number(row.placement);
      return {
        name: playersById.get(row.playerId)?.fullName ?? "Jogador",
        placement: placement !== null && placement >= 1 ? placement : null,
        points: pointsForPlacement(
          placement !== null && placement >= 1 ? placement : null,
          pointsTable,
          settings.pointsBelowCutoff,
        ),
      };
    });
    return buildStageMessage(stageLabel, entries);
  }

  /** Muda re-buys ou add-on e recalcula o gasto do jogador na mesma hora. */
  function setExtras(playerId: string, patch: Partial<Pick<Row, "rebuys" | "hadAddon">>) {
    setRows((current) =>
      current.map((row) => {
        if (row.playerId !== playerId) return row;
        const next = { ...row, ...patch };
        const rebuys = next.rebuys.trim() === "" ? 0 : Number(next.rebuys) || 0;
        next.amountPaid = String(
          suggestAmountPaid(settings.buyin, settings.rebuy, rebuys, settings.addon, next.hadAddon),
        );
        return next;
      }),
    );
  }

  function resetPremios() {
    setPremios({});
  }

  function update(playerId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.playerId === playerId ? { ...row, ...patch } : row)),
    );
  }

  function addPlayer(playerId: string) {
    setRows((current) => [
      ...current,
      {
        playerId,
        placement: "",
        rebuys: "",
        hadAddon: false,
        // Todo participante paga ao menos o buy-in — já entra pré-preenchido.
        amountPaid: String(settings.buyin),
        needsReview: false,
        reviewNote: null,
      },
    ]);
  }

  function removePlayer(playerId: string) {
    setRows((current) => current.filter((row) => row.playerId !== playerId));
  }

  function sortByPlacement() {
    setRows((current) =>
      [...current].sort((a, b) => {
        const aPlace = a.placement === "" ? Number.POSITIVE_INFINITY : Number(a.placement);
        const bPlace = b.placement === "" ? Number.POSITIVE_INFINITY : Number(b.placement);
        if (aPlace !== bPlace) return aPlace - bPlace;
        const aName = playersById.get(a.playerId)?.fullName ?? "";
        const bName = playersById.get(b.playerId)?.fullName ?? "";
        return aName.localeCompare(bName, "pt-BR");
      }),
    );
  }

  /** Recalcula o gasto de todas as linhas a partir de re-buys e add-on. */
  function recalcAllPaid() {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        amountPaid: String(
          suggestAmountPaid(
            settings.buyin,
            settings.rebuy,
            Number(row.rebuys) || 0,
            settings.addon,
            row.hadAddon,
          ),
        ),
      })),
    );
  }

  // --- Payload para a Server Action ----------------------------------------

  const payload = rows.map((row) => {
    const placementValue = row.placement.trim() === "" ? null : Number(row.placement);
    // Colocação vazia OU 16 ou pior: guardamos null quando o admin não informou
    // a posição exata, já que a pontuação é a mesma na faixa.
    const placement =
      placementValue === null || !Number.isFinite(placementValue) || placementValue < 1
        ? null
        : placementValue;

    return {
      playerId: row.playerId,
      placement,
      points: pointsForPlacement(placement, pointsTable, settings.pointsBelowCutoff),
      amountPaid: parseMoney(row.amountPaid),
      rebuys: row.rebuys.trim() === "" ? null : Number(row.rebuys),
      hadAddon: row.rebuys.trim() === "" && !row.hadAddon ? null : row.hadAddon,
      prizeAmount: premioDaColocacao(placement),
    };
  });

  const duplicatePlacements = useMemo(() => {
    const seen = new Map<number, number>();
    for (const row of rows) {
      const placement = Number(row.placement);
      if (!row.placement.trim() || !Number.isFinite(placement)) continue;
      seen.set(placement, (seen.get(placement) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, count]) => count > 1).map(([placement]) => placement);
  }, [rows]);

  return (
    <form action={saveStageResults} className="space-y-5">
      <input type="hidden" name="etapa" value={stageId} />
      <input type="hidden" name="participantes" value={JSON.stringify(payload)} />
      {manualGross ? (
        <input type="hidden" name="arrecadacaoManual" value={String(gross)} />
      ) : null}
      <input type="hidden" name="taxaPorJogador" value={String(taxaPorJogador)} />
      <input type="hidden" name="outrosCustos" value={String(outrosCustos)} />

      {/* ------------------------------------------------------------------ */}
      {/* Adicionar participantes                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-chalk">Participantes</h2>
            <p className="mt-1 text-sm text-chalk-dim">
              {rows.length} selecionados de {players.length} cadastrados.
            </p>
          </div>
          {rows.length > 1 ? (
            <GhostButton onClick={sortByPlacement}>Ordenar por colocação</GhostButton>
          ) : null}
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar jogador para adicionar…"
          className={inputClass}
        />

        {available.length > 0 ? (
          <div className="mt-3 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {available.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => addPlayer(player.id)}
                className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
              >
                + {player.fullName}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-chalk-dim">
            {search
              ? "Nenhum jogador disponível com esse nome."
              : "Todos os jogadores cadastrados já estão nesta etapa."}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Grade de lançamento                                                 */}
      {/* ------------------------------------------------------------------ */}
      {rows.length === 0 ? (
        <p className="card px-4 py-10 text-center text-sm text-chalk-dim">
          Nenhum participante adicionado ainda. Use a busca acima.
        </p>
      ) : (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
            <h2 className="text-sm font-bold text-chalk">Resultado e financeiro</h2>
            <div className="flex flex-wrap gap-2">
              <GhostButton onClick={recalcAllPaid} className="px-3 py-1.5 text-xs">
                Recalcular gastos pelos re-buys
              </GhostButton>
            </div>
          </div>

          {/* Parcial para o grupo: colocação em branco = ainda na mesa. Pode
              gerar quantas vezes quiser, à medida que a etapa avança. */}
          <div className="border-b border-ink-800 px-4 py-3">
            <WhatsAppShare label="Parcial da etapa para o WhatsApp" buildMessage={buildStageWhatsApp} />
          </div>

          <div className="table-scroll">
            <table className="w-full min-w-[54rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-[0.62rem] uppercase tracking-[0.1em] text-chalk-dim">
                  <th scope="col" className="px-3 py-2.5 font-bold">Jogador</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">Colocação</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">Pontos</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">Re-buys</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold">Add-on</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-bold">Gasto (R$)</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-bold">Prêmio (R$)</th>
                  <th scope="col" className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const player = playersById.get(row.playerId);
                  const placement = row.placement.trim() === "" ? null : Number(row.placement);
                  const points = pointsForPlacement(
                    placement !== null && placement >= 1 ? placement : null,
                    pointsTable,
                    settings.pointsBelowCutoff,
                  );
                  const duplicada =
                    placement !== null && duplicatePlacements.includes(placement);

                  return (
                    <tr key={row.playerId} className="border-b border-ink-850/60 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-semibold text-chalk">
                          {player?.fullName ?? "Jogador removido"}
                        </span>
                        {row.needsReview ? (
                          <span
                            title={row.reviewNote ?? undefined}
                            className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.58rem] font-semibold text-amber-300"
                          >
                            revisar
                          </span>
                        ) : null}
                        {row.reviewNote ? (
                          <p className="mt-0.5 text-[0.68rem] text-amber-300/70">{row.reviewNote}</p>
                        ) : null}
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={row.placement}
                          onChange={(event) =>
                            update(row.playerId, { placement: event.target.value })
                          }
                          placeholder="16º+"
                          aria-label={`Colocação de ${player?.fullName ?? ""}`}
                          className={`tnum w-20 rounded-lg border bg-ink-950 px-2 py-1.5 text-center text-sm text-chalk focus:outline-none ${
                            duplicada
                              ? "border-amber-500/60 focus:border-amber-400"
                              : "border-ink-700 focus:border-cap-red"
                          }`}
                        />
                      </td>

                      <td className="tnum px-2 py-2 text-center font-bold text-chalk">{points}</td>

                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={row.rebuys}
                          onChange={(event) => setExtras(row.playerId, { rebuys: event.target.value })}
                          placeholder="0"
                          aria-label={`Re-buys de ${player?.fullName ?? ""}`}
                          className="tnum w-16 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1.5 text-center text-sm text-chalk focus:border-cap-red focus:outline-none"
                        />
                      </td>

                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.hadAddon}
                          onChange={(event) =>
                            setExtras(row.playerId, { hadAddon: event.target.checked })
                          }
                          aria-label={`Add-on de ${player?.fullName ?? ""}`}
                          className="h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
                        />
                      </td>

                      <td className="px-2 py-2 text-right">
                        <input
                          value={row.amountPaid}
                          onChange={(event) =>
                            update(row.playerId, { amountPaid: event.target.value })
                          }
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Valor gasto por ${player?.fullName ?? ""}`}
                          className="tnum w-24 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1.5 text-right text-sm text-chalk focus:border-cap-red focus:outline-none"
                        />
                      </td>

                      <td className="tnum px-2 py-2 text-right font-bold text-gold">
                        {(() => {
                          const p = row.placement.trim() === "" ? null : Number(row.placement);
                          const valor = premioDaColocacao(p !== null && p >= 1 ? p : null);
                          return valor > 0 ? formatBRL(valor) : "—";
                        })()}
                      </td>

                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removePlayer(row.playerId)}
                          aria-label={`Remover ${player?.fullName ?? ""}`}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-chalk-dim transition-colors hover:text-cap-red-light"
                        >
                          remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="border-t border-ink-800 px-4 py-3 text-xs text-chalk-dim">
            Re-buys em branco = não registrado, e a etapa fica de fora das estatísticas de re-buy do
            jogador. Quem jogou sem comprar ficha precisa de um <strong className="text-chalk">0</strong>{" "}
            digitado — é o que diferencia “jogou limpo” de “ninguém anotou”, e o ranking usa isso
            como critério de desempate.
            <br />
            Deixe a colocação em branco para “16º ou pior”: a pontuação é a mesma em toda a faixa e o app deduz a posição pelos pontos da etapa. Se você souber a ordem real do fundo da mesa, preencha (17º, 22º…) — aí o valor digitado vale e entra na classificação média do jogador.
            O valor gasto é o campo que vale; re-buys e add-on servem só para calculá-lo.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Conferência financeira                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="card p-5">
        <h2 className="mb-4 text-base font-bold text-chalk">Conferência</h2>

        <label className="mb-4 flex items-start gap-2.5 text-sm text-chalk-dim">
          <input
            type="checkbox"
            checked={manualGross}
            onChange={(event) => setManualGross(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
          />
          <span>
            Informar a arrecadação total manualmente
            <span className="mt-0.5 block text-xs text-chalk-dim/70">
              Use quando você sabe o total do pote mas não o gasto de cada jogador — é o caso das
              etapas importadas da planilha.
            </span>
          </span>
        </label>

        {manualGross ? (
          <div className="mb-4 max-w-xs">
            <label
              htmlFor="grossInput"
              className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim"
            >
              Arrecadação total (R$)
            </label>
            <input
              id="grossInput"
              value={grossInput}
              onChange={(event) => setGrossInput(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={`${inputClass} tnum text-right`}
            />
            {missingPaid > 0 ? (
              <p className="mt-1 text-xs text-chalk-dim">
                Soma dos gastos lançados: {formatBRL(sumPaid)} ({missingPaid} sem valor).
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Custos da etapa: saem da arrecadação antes dos 10% da reserva. */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="taxaInput"
              className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim"
            >
              Taxa de administração por jogador (R$)
            </label>
            <input
              id="taxaInput"
              value={taxaInput}
              onChange={(event) => setTaxaInput(event.target.value)}
              inputMode="decimal"
              placeholder={String(settings.adminFeePerPlayer)}
              className={`${inputClass} tnum text-right`}
            />
            <p className="mt-1 text-xs text-chalk-dim">
              {rows.length} jogadores × {formatBRL(taxaPorJogador)} ={" "}
              <strong className="text-chalk">{formatBRL(breakdown.adminFeeTotal)}</strong>
            </p>
          </div>
          <div>
            <label
              htmlFor="custosInput"
              className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim"
            >
              Outros custos (R$)
            </label>
            <input
              id="custosInput"
              value={custosInput}
              onChange={(event) => setCustosInput(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={`${inputClass} tnum text-right`}
            />
            <p className="mt-1 text-xs text-chalk-dim">Troféu, garçons e afins.</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric label="Arrecadação" value={formatBRL(gross)} />
          <Metric label="Taxa de administração" value={`− ${formatBRL(breakdown.adminFeeTotal)}`} />
          <Metric label="Outros custos" value={`− ${formatBRL(breakdown.otherCosts)}`} />
          <Metric label="Prêmio do 5º" value={`− ${formatBRL(breakdown.fifthPrize)}`} />
          {isFinal ? (
            <Metric
              label={
                rankingShare > 0
                  ? `Pote na mesa (acumulado − ${formatBRL(rankingShare)} dos líderes)`
                  : "Pote acumulado na mesa"
              }
              value={formatBRL(accumulatedReserve)}
              tone="gold"
            />
          ) : (
            <Metric
              label={`Reserva Etapa Final (${settings.finalReservePct}% de ${formatBRL(breakdown.reserveBase)})`}
              value={formatBRL(breakdown.reserve)}
              tone="gold"
            />
          )}
          <Metric label="A distribuir" value={formatBRL(breakdown.distributable)} />
          <Metric
            label="Prêmios lançados"
            value={formatBRL(prizeTotal)}
            tone={check.balanced ? "positive" : "warn"}
          />
        </dl>

        {/* Premiacao por colocacao — editavel, dirige o premio de cada jogador. */}
        <div className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-chalk-dim">
              Premiação por colocação (1º a 10º)
            </p>
            <GhostButton onClick={resetPremios} className="px-2.5 py-1 text-[0.7rem]">
              Restaurar padrão
            </GhostButton>
          </div>
          <p className="mb-3 text-xs text-chalk-dim">
            Pré-preenchida com a regra padrão. Edite os valores como quiser: o prêmio de cada
            jogador é preenchido automaticamente pela colocação. Posições sem valor pagam nada.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {POSICOES_PREMIADAS.map((pos) => (
              <div key={pos}>
                <label
                  htmlFor={`premio-${pos}`}
                  className="mb-1 block text-center text-[0.62rem] font-bold text-chalk-dim"
                >
                  {pos}º
                </label>
                <input
                  id={`premio-${pos}`}
                  value={premios[pos] ?? (premioPadrao(pos) > 0 ? String(premioPadrao(pos)) : "")}
                  onChange={(event) =>
                    setPremios((cur) => ({ ...cur, [pos]: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={`Prêmio do ${pos}º lugar`}
                  className="tnum w-full rounded-lg border border-ink-700 bg-ink-900 px-1.5 py-1.5 text-right text-sm text-gold focus:border-cap-red focus:outline-none"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-chalk-dim">
            Soma da premiação por colocação:{" "}
            <strong className="tnum text-chalk">{formatBRL(somaPremios)}</strong>
            {breakdown.shortfall ? (
              <span className="ml-2 text-amber-300">
                As deduções passam da arrecadação — confira os valores.
              </span>
            ) : null}
          </p>
        </div>

        {/* Avisos — nenhum deles bloqueia o salvamento. */}
        <div className="mt-4 space-y-2">
          {breakdown.shortfall ? (
            <p className="rounded-lg border border-cap-red/40 bg-cap-red/10 px-3 py-2 text-sm text-cap-red-light">
              As deduções (taxa, custos e prêmio do 5º) passam da arrecadação desta etapa. Confira
              os valores antes de salvar.
            </p>
          ) : null}
          {prizeTotal > 0 || gross > 0 ? (
            <p
              className={`rounded-lg border px-3 py-2 text-sm ${
                check.balanced
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-300"
              }`}
            >
              {check.message}
              {!check.balanced ? (
                <>
                  {" "}
                  Diferença de{" "}
                  <strong className="tnum">{formatBRL(Math.abs(check.difference))}</strong>.
                </>
              ) : null}
            </p>
          ) : null}

          {duplicatePlacements.length > 0 ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
              Colocação repetida: {duplicatePlacements.map((p) => `${p}º`).join(", ")}. Confira
              antes de salvar — dois jogadores não deveriam ocupar a mesma posição.
            </p>
          ) : null}

          {missingPaid > 0 && !manualGross ? (
            <p className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-chalk-dim">
              {missingPaid} participantes estão sem o valor gasto. A arrecadação mostrada considera
              apenas os valores preenchidos.
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton>Salvar resultado</PrimaryButton>
        <span className="text-xs text-chalk-dim">
          Salvar substitui os participantes desta etapa pela lista acima.
        </span>
      </div>
    </form>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gold" | "positive" | "warn";
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold"
      : tone === "positive"
        ? "text-emerald-400"
        : tone === "warn"
          ? "text-amber-300"
          : "text-chalk";

  return (
    <div>
      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-chalk-dim">
        {label}
      </dt>
      <dd className={`tnum mt-1 text-lg font-extrabold ${toneClass}`}>{value}</dd>
    </div>
  );
}
