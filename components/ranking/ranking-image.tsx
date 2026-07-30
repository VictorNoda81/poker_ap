"use client";

import { useState } from "react";

/** Linha do ranking reduzida ao que o cartaz precisa. */
export interface RankingImageRow {
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
  vermelhoEscuro: "#b70d11",
  ouro: "#f5d472",
  prata: "#cfd6dc",
  bronze: "#d68a45",
  giz: "#f2f6f3",
  gizFraco: "#a6bcae",
  linha: "rgba(255,255,255,0.08)",
} as const;

function corDaPosicao(pos: number): string {
  if (pos === 1) return COR.ouro;
  if (pos === 2) return COR.prata;
  if (pos === 3) return COR.bronze;
  return COR.giz;
}

/**
 * Desenha o cartaz do ranking num canvas e devolve o elemento pronto.
 *
 * Tudo é pixel puro (sem HTML-para-imagem), então não depende de biblioteca
 * externa nem esbarra na CSP: funciona igual em qualquer navegador.
 *
 * `scale` multiplica a resolução para a imagem sair nítida (retina/impressão)
 * sem mudar o layout — todas as medidas são em "px lógicos".
 */
function desenharCartaz(
  title: string,
  subtitle: string,
  rows: RankingImageRow[],
  scale = 2,
): HTMLCanvasElement {
  const W = 1080;
  const margem = 64;
  const topo = 260; // cabeçalho vermelho + títulos
  const alturaLinha = 92;
  const rodape = 96;
  const H = topo + rows.length * alturaLinha + rodape;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Fundo em degradê de feltro.
  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, COR.fundoTopo);
  fundo.addColorStop(1, COR.fundoBase);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  // Faixa vermelha do topo.
  ctx.fillStyle = COR.vermelho;
  ctx.fillRect(0, 0, W, 12);

  // Naipe decorativo grande, bem sutil, no canto.
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

  // Linha divisória sob o cabeçalho.
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margem, topo - 30);
  ctx.lineTo(W - margem, topo - 30);
  ctx.stroke();

  // Linhas do ranking.
  rows.forEach((row, i) => {
    const y = topo + i * alturaLinha;
    const centro = y + alturaLinha / 2;

    // Fundo alternado bem discreto.
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(margem - 16, y, W - 2 * (margem - 16), alturaLinha);
    }

    const cor = corDaPosicao(row.position);

    // Ficha/medalhão da posição.
    ctx.beginPath();
    ctx.arc(margem + 30, centro, 30, 0, Math.PI * 2);
    ctx.fillStyle = row.position <= 3 ? cor : "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.fillStyle = row.position <= 3 ? "#0a2b20" : COR.gizFraco;
    ctx.font = "800 30px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(row.position), margem + 30, centro + 1);

    // Nome.
    ctx.textAlign = "left";
    ctx.fillStyle = COR.giz;
    ctx.font = `${row.position <= 3 ? "800" : "600"} 34px Arial, sans-serif`;
    const nome = row.name.length > 26 ? row.name.slice(0, 25) + "…" : row.name;
    ctx.fillText(nome, margem + 84, centro - 8);

    // Subinfo: etapas e vitórias.
    ctx.fillStyle = COR.gizFraco;
    ctx.font = "400 22px Arial, sans-serif";
    const vit = row.wins > 0 ? ` · ${row.wins} ${row.wins === 1 ? "vitória" : "vitórias"}` : "";
    ctx.fillText(`${row.stagesPlayed} etapas${vit}`, margem + 84, centro + 22);

    // Pontos, à direita.
    ctx.textAlign = "right";
    ctx.fillStyle = cor;
    ctx.font = "800 40px Arial, sans-serif";
    ctx.fillText(String(row.points), W - margem, centro - 4);
    ctx.fillStyle = COR.gizFraco;
    ctx.font = "600 18px Arial, sans-serif";
    ctx.fillText("PONTOS", W - margem, centro + 22);
  });

  // Rodapé.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COR.gizFraco;
  ctx.font = "600 22px Arial, sans-serif";
  ctx.fillText("Clube Alto dos Pinheiros", W / 2, H - rodape / 2);

  return canvas;
}

/**
 * Botão que gera uma imagem PNG do ranking para baixar/compartilhar.
 *
 * `limit` corta a lista para o cartaz não virar um pôster gigante; o padrão
 * mostra o pelotão da frente, que é o que se manda no grupo.
 */
export function RankingImage({
  title,
  subtitle,
  rows,
  limit = 15,
}: {
  title: string;
  subtitle: string;
  rows: RankingImageRow[];
  limit?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const usadas = (limit > 0 ? rows.slice(0, limit) : rows).filter((r) => r.stagesPlayed > 0);

  async function gerar() {
    if (usadas.length === 0) return;
    setBusy(true);
    try {
      const canvas = desenharCartaz(title, subtitle, usadas);
      const url = canvas.toDataURL("image/png");
      setPreview(url);

      // Dispara o download.
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  if (usadas.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={gerar}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-semibold text-gold-bright transition-colors hover:bg-gold/20 disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-4 w-4">
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
          <circle cx="7" cy="8" r="1.5" />
          <path d="M3 14l4-4 3 3 3-4 4 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "Gerando…" : "Baixar imagem do ranking"}
      </button>

      {preview ? (
        <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3">
          <p className="mb-2 text-xs text-chalk-dim">
            Imagem baixada. No celular, toque e segure para salvar ou compartilhar no WhatsApp.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`Ranking — ${title}`}
            className="mx-auto max-h-[70vh] w-auto rounded-md border border-ink-800"
          />
        </div>
      ) : null}
    </div>
  );
}
