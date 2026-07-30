"use client";

import { useState } from "react";

/** Linha do ranking reduzida ao que o cartaz precisa. */
export interface RankingShareRow {
  position: number;
  name: string;
  points: number;
  stagesPlayed: number;
  wins: number;
}

/** Paleta do app, em hex — o canvas não lê as variáveis CSS do tema. */
const COR = {
  fundoTopo: "#0e4332",
  fundoBase: "#0a2b20",
  vermelho: "#ea1116",
  ouro: "#f5d472",
  prata: "#cfd6dc",
  bronze: "#d68a45",
  giz: "#f2f6f3",
  gizFraco: "#a6bcae",
} as const;

/**
 * Limite de área de canvas seguro para todos os navegadores. O iOS Safari
 * recusa canvas com área acima de ~16,7 milhões de px (imagem sai em branco).
 * Como o ranking completo pode ter 60+ linhas, a resolução é reduzida quando
 * necessário para caber — o texto continua legível, só menos "retina".
 */
const AREA_MAXIMA = 16_000_000;

function corDaPosicao(pos: number): string {
  if (pos === 1) return COR.ouro;
  if (pos === 2) return COR.prata;
  if (pos === 3) return COR.bronze;
  return COR.giz;
}

/** Desenha o cartaz do ranking (todas as linhas recebidas) num canvas. */
function desenharCartaz(
  title: string,
  subtitle: string,
  rows: RankingShareRow[],
): HTMLCanvasElement {
  const W = 1080;
  const margem = 64;
  const topo = 260;
  const alturaLinha = 88;
  const rodape = 96;
  const H = topo + rows.length * alturaLinha + rodape;

  // Escala máxima 2 (nitidez), reduzida se a área estourar o limite do iOS.
  const escala = Math.min(2, Math.sqrt(AREA_MAXIMA / (W * H)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(W * escala);
  canvas.height = Math.floor(H * escala);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(escala, escala);

  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, COR.fundoTopo);
  fundo.addColorStop(1, COR.fundoBase);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COR.vermelho;
  ctx.fillRect(0, 0, W, 12);

  // Naipe decorativo grande e sutil no canto inferior.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = COR.giz;
  ctx.font = "700 220px Georgia, serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("♠", W - 20, H - 20);
  ctx.restore();

  // Títulos.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.vermelho;
  ctx.font = "800 26px Arial, sans-serif";
  ctx.fillText("LIGA DE POKER · CAP", margem, 80);

  ctx.fillStyle = COR.giz;
  ctx.font = "800 56px Arial, sans-serif";
  ctx.fillText(title, margem, 150);

  ctx.fillStyle = COR.gizFraco;
  ctx.font = "400 26px Arial, sans-serif";
  ctx.fillText(subtitle, margem, 195);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margem, topo - 30);
  ctx.lineTo(W - margem, topo - 30);
  ctx.stroke();

  rows.forEach((row, i) => {
    const y = topo + i * alturaLinha;
    const centro = y + alturaLinha / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(margem - 16, y, W - 2 * (margem - 16), alturaLinha);
    }

    const cor = corDaPosicao(row.position);

    ctx.beginPath();
    ctx.arc(margem + 28, centro, 28, 0, Math.PI * 2);
    ctx.fillStyle = row.position <= 3 ? cor : "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.fillStyle = row.position <= 3 ? "#0a2b20" : COR.gizFraco;
    ctx.font = "800 28px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(row.position), margem + 28, centro + 1);

    ctx.textAlign = "left";
    ctx.fillStyle = COR.giz;
    ctx.font = `${row.position <= 3 ? "800" : "600"} 32px Arial, sans-serif`;
    const nome = row.name.length > 28 ? row.name.slice(0, 27) + "…" : row.name;
    ctx.fillText(nome, margem + 80, centro - 8);

    ctx.fillStyle = COR.gizFraco;
    ctx.font = "400 20px Arial, sans-serif";
    const vit = row.wins > 0 ? ` · ${row.wins} ${row.wins === 1 ? "vitória" : "vitórias"}` : "";
    ctx.fillText(`${row.stagesPlayed} etapas${vit}`, margem + 80, centro + 20);

    ctx.textAlign = "right";
    ctx.fillStyle = cor;
    ctx.font = "800 38px Arial, sans-serif";
    ctx.fillText(String(row.points), W - margem, centro - 3);
    ctx.fillStyle = COR.gizFraco;
    ctx.font = "600 16px Arial, sans-serif";
    ctx.fillText("PONTOS", W - margem, centro + 20);
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COR.gizFraco;
  ctx.font = "600 22px Arial, sans-serif";
  ctx.fillText("Clube Alto dos Pinheiros", W / 2, H - rodape / 2);

  return canvas;
}

function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Botão "Compartilhar": gera a imagem do ranking COMPLETO e abre a folha de
 * compartilhamento do sistema (Web Share). Onde o navegador não sabe
 * compartilhar arquivo (desktop antigo), baixa o PNG — em ambos os casos a
 * imagem sai pronta para mandar no grupo, sem poluir a tela com preview.
 */
export function RankingShare({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: RankingShareRow[];
}) {
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Ranking completo: todos os que jogaram ao menos uma etapa.
  const usadas = rows.filter((r) => r.stagesPlayed > 0);

  async function compartilhar() {
    if (usadas.length === 0 || busy) return;
    setBusy(true);
    setAviso(null);
    try {
      const canvas = desenharCartaz(title, subtitle, usadas);
      const blob = await canvasParaBlob(canvas);
      if (!blob) {
        setAviso("Não foi possível gerar a imagem neste navegador.");
        return;
      }

      const nomeArquivo = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`;
      const file = new File([blob], nomeArquivo, { type: "image/png" });

      // Caminho principal: folha de compartilhamento do sistema (celular).
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title, text: `${title} — ${subtitle}` });
          return;
        } catch (err) {
          // Cancelar o diálogo NÃO é erro: só encerra sem baixar.
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }

      // Sem Web Share (ou falhou): baixa o arquivo.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
      setAviso("Imagem baixada — ela está na sua pasta de downloads.");
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
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-4 w-4">
          <circle cx="15" cy="5" r="2.2" />
          <circle cx="5" cy="10" r="2.2" />
          <circle cx="15" cy="15" r="2.2" />
          <path d="M6.9 8.8 13.1 6.2M6.9 11.2l6.2 2.6" strokeLinecap="round" />
        </svg>
        {busy ? "Gerando…" : "Compartilhar ranking"}
      </button>
      {aviso ? <p className="text-xs text-chalk-dim">{aviso}</p> : null}
    </div>
  );
}
