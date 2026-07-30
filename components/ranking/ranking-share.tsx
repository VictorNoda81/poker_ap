"use client";

import { useState } from "react";
import { formatBRL, formatBRLSigned, formatNumber } from "@/lib/domain/money";

/** Uma linha do ranking com todas as métricas, para a tabela do PDF. */
export interface RankingPdfRow {
  position: number;
  name: string;
  type: "socio" | "convidado" | "indefinido";
  points: number;
  stagesPlayed: number;
  averagePoints: number;
  averagePlacement: number | null;
  wins: number;
  seconds: number;
  thirds: number;
  bestPlacement: number | null;
  bestPlacementCount: number;
  totalRebuys: number;
  totalAddons: number;
  averageRebuys: number | null;
  /** Enquanto > 0, os números de re-buy não fecham → mostra "—". */
  stagesMissingExtras: number;
  totalReceived: number;
  totalPaid: number;
  balance: number;
  /** Enquanto > 0, Pago/Saldo/ROI não são calculáveis → mostra "—". */
  stagesMissingFinancials: number;
}

const TIPO_LABEL: Record<RankingPdfRow["type"], string> = {
  socio: "Sócio",
  convidado: "Convidado",
  indefinido: "A definir",
};

const OURO: [number, number, number] = [224, 186, 69];
const VERDE: [number, number, number] = [14, 67, 50];
const VERMELHO: [number, number, number] = [234, 17, 22];
const CINZA_CLARO: [number, number, number] = [242, 246, 243];
const TEXTO: [number, number, number] = [20, 30, 26];

function melhorTexto(row: RankingPdfRow): string {
  if (row.bestPlacement === null) return "—";
  return row.bestPlacementCount > 1
    ? `${row.bestPlacement}º ×${row.bestPlacementCount}`
    : `${row.bestPlacement}º`;
}

/** Monta o documento PDF do ranking completo e devolve o Blob. */
async function gerarPdf(
  title: string,
  subtitle: string,
  rows: RankingPdfRow[],
  showFinances: boolean,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();

  doc.setProperties({ title: `Ranking — ${title}`, subject: subtitle });

  // Cabeçalho.
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, larguraPagina, 22, "F");
  doc.setFillColor(...VERMELHO);
  doc.rect(0, 0, larguraPagina, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${subtitle}  ·  Liga de Poker · Clube Alto dos Pinheiros`, 14, 18);

  // Colunas: sempre as métricas de jogo; Pago/Saldo/ROI só quando permitido.
  const head = [
    "#",
    "Jogador",
    "Tipo",
    "Pontos",
    "Etapas",
    "Média pts",
    "Class. média",
    "1º",
    "2º",
    "3º",
    "Melhor",
    "Re-buys",
    "Add-ons",
    "RB/etapa",
    "Prêmio",
    ...(showFinances ? ["Pago", "Saldo", "ROI"] : []),
  ];

  const body = rows.map((row) => {
    const semExtras = row.stagesMissingExtras > 0;
    const semGasto = row.stagesMissingFinancials > 0 || row.totalPaid === 0;
    const roi = semGasto || row.totalPaid <= 0 ? null : row.totalReceived / row.totalPaid;

    const linha = [
      String(row.position),
      row.name,
      TIPO_LABEL[row.type],
      formatNumber(row.points),
      String(row.stagesPlayed),
      formatNumber(row.averagePoints, 1),
      row.averagePlacement === null ? "—" : `${formatNumber(row.averagePlacement, 1)}º`,
      String(row.wins),
      String(row.seconds),
      String(row.thirds),
      melhorTexto(row),
      semExtras ? "—" : String(row.totalRebuys),
      semExtras ? "—" : String(row.totalAddons),
      semExtras || row.averageRebuys === null ? "—" : formatNumber(row.averageRebuys, 1),
      row.totalReceived === 0 ? "—" : formatBRL(row.totalReceived),
    ];
    if (showFinances) {
      linha.push(
        semGasto ? "—" : formatBRL(row.totalPaid),
        semGasto ? "—" : formatBRLSigned(row.balance),
        roi === null ? "—" : `${formatNumber(roi, 2)}×`,
      );
    }
    return linha;
  });

  autoTable(doc, {
    head: [head],
    body,
    startY: 26,
    margin: { left: 8, right: 8 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.4,
      textColor: TEXTO,
      lineColor: [220, 226, 222],
      lineWidth: 0.1,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: VERDE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: CINZA_CLARO },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { halign: "left", cellWidth: 44 },
      2: { halign: "left", cellWidth: 20 },
      // As demais (números) alinhadas à direita.
    },
    // Alinha à direita tudo que é número (da coluna 3 em diante).
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      // Destaque dourado para os três primeiros na coluna da posição.
      if (data.section === "body" && data.column.index === 0) {
        const pos = Number(data.cell.raw);
        if (pos >= 1 && pos <= 3) {
          data.cell.styles.fillColor = OURO;
          data.cell.styles.textColor = VERDE;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    // Rodapé com paginação em cada página.
    didDrawPage: (data) => {
      const total = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      const pagina = data.pageNumber;
      const alturaPagina = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(140, 150, 145);
      doc.text(
        `Página ${pagina} de ${total}`,
        larguraPagina - 8,
        alturaPagina - 5,
        { align: "right" },
      );
      doc.text("poker-ap-mauve.vercel.app", 8, alturaPagina - 5);
    },
  });

  return doc.output("blob");
}

/**
 * Botão "Compartilhar": gera o PDF do ranking COMPLETO com todas as métricas e
 * abre a folha de compartilhamento do sistema (Web Share). Onde o navegador não
 * compartilha arquivo (desktop antigo), baixa o PDF.
 *
 * O jsPDF é importado sob demanda dentro do clique — não entra no bundle
 * inicial da página, só carrega quando alguém realmente compartilha.
 */
export function RankingShare({
  title,
  subtitle,
  rows,
  showFinances = true,
}: {
  title: string;
  subtitle: string;
  rows: RankingPdfRow[];
  showFinances?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const usadas = rows.filter((r) => r.stagesPlayed > 0);

  async function compartilhar() {
    if (usadas.length === 0 || busy) return;
    setBusy(true);
    setAviso(null);
    try {
      const blob = await gerarPdf(title, subtitle, usadas, showFinances);
      const nomeArquivo = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.pdf`;
      const file = new File([blob], nomeArquivo, { type: "application/pdf" });

      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title, text: `${title} — ${subtitle}` });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
      setAviso("PDF baixado — ele está na sua pasta de downloads.");
    } catch {
      setAviso("Não foi possível gerar o PDF neste navegador.");
    } finally {
      setBusy(false);
    }
  }

  if (usadas.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={compartilhar}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-semibold text-gold-bright transition-colors hover:bg-gold/20 disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-4 w-4">
          <path d="M5 2.5h6l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          <path d="M11 2.5v4h4" strokeLinejoin="round" />
          <path d="M7 11h6M7 14h4" strokeLinecap="round" />
        </svg>
        {busy ? "Gerando PDF…" : "Compartilhar ranking (PDF)"}
      </button>
      {aviso ? <p className="text-xs text-chalk-dim">{aviso}</p> : null}
    </div>
  );
}
