/**
 * Gera os ícones do app (PWA + aba do navegador) a partir de `data/icone-app.jpeg`.
 *
 *   npm run icones
 *
 * A arte é uma ficha de poker vermelha, num quadrado de cantos arredondados,
 * sobre fundo BRANCO. O fundo precisa sair — mas o logo do clube, no miolo da
 * ficha, também é branco. Por isso não dá para simplesmente trocar "todo branco
 * por transparente": isso furaria o logo.
 *
 * A solução é um flood fill a partir das bordas: só o branco LIGADO à moldura
 * vira transparente. O branco de dentro da ficha, cercado de vermelho, nunca é
 * alcançado e fica intacto.
 *
 * Três variantes, porque os sistemas tratam ícones de formas diferentes:
 *   - "any"      : a ficha com o fundo transparente, como está
 *   - "maskable" : o Android recorta em círculo/squircle, então a arte precisa
 *                  caber na zona segura central e o resto é preenchido de
 *                  vermelho, senão sobra um quadrado branco em volta
 *   - apple      : sem transparência — no iOS o transparente vira preto
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(ROOT, "data", "icone-app.jpeg");
const SAIDA = path.join(ROOT, "public", "icons");

/**
 * O que conta como fundo: pixel CINZA (pouca saturação) e claro o bastante.
 *
 * Não basta testar "branco puro": o original tem uma sombra suave em volta do
 * ícone, que ia de branco a cinza médio e sobrevivia ao corte, virando um
 * filete escuro quando o ícone era colocado sobre o vermelho.
 *
 * A arte real é vermelha (saturada) ou quase preta (escura), então nenhuma das
 * duas cai nesta regra.
 */
const FUNDO_CLARO_MINIMO = 165;
const FUNDO_SATURACAO_MAXIMA = 28;

interface Recorte {
  data: Buffer;
  width: number;
  height: number;
  /** Cor de fundo da arte (o vermelho da moldura), para as variantes opacas. */
  fundo: { r: number; g: number; b: number };
}

/**
 * Cor da moldura vermelha: mediana dos pixels avermelhados na faixa superior da
 * arte. Se nada avermelhado aparecer, cai no vermelho da marca do clube.
 */
function corDaMoldura(
  data: Buffer,
  channels: number,
  width: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { r: number; g: number; b: number } {
  const altura = maxY - minY;
  const vermelhos: number[][] = [];

  for (let y = minY + Math.round(altura * 0.02); y < minY + Math.round(altura * 0.09); y += 1) {
    for (let x = minX + Math.round((maxX - minX) * 0.3); x < maxX - Math.round((maxX - minX) * 0.3); x += 2) {
      const p = (y * width + x) * channels;
      const [r, g, b, a] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
      // Vermelho de verdade: forte no R e claramente acima de G e B.
      if (a > 200 && r > 110 && r > g * 1.8 && r > b * 1.8) vermelhos.push([r, g, b]);
    }
  }

  if (vermelhos.length === 0) return { r: 234, g: 17, b: 22 }; // vermelho do CAP

  const mediana = (i: number) => {
    const valores = vermelhos.map((c) => c[i]).sort((a, b) => a - b);
    return valores[Math.floor(valores.length / 2)];
  };
  return { r: mediana(0), g: mediana(1), b: mediana(2) };
}

/**
 * Remove o fundo branco por flood fill a partir das bordas e recorta a imagem
 * no retângulo do que sobrou.
 */
async function recortarArte(): Promise<Recorte> {
  const { data, info } = await sharp(readFileSync(ORIGEM))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const ehFundo = (i: number) => {
    const p = i * channels;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maior = Math.max(r, g, b);
    const menor = Math.min(r, g, b);
    return maior >= FUNDO_CLARO_MINIMO && maior - menor <= FUNDO_SATURACAO_MAXIMA;
  };

  // Flood fill (BFS) a partir de todos os pixels de borda que são brancos.
  const visitado = new Uint8Array(width * height);
  const fila = new Int32Array(width * height);
  let inicio = 0;
  let fim = 0;

  const enfileirar = (i: number) => {
    if (visitado[i] || !ehFundo(i)) return;
    visitado[i] = 1;
    fila[fim++] = i;
  };

  for (let x = 0; x < width; x += 1) {
    enfileirar(x);
    enfileirar((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enfileirar(y * width);
    enfileirar(y * width + width - 1);
  }

  while (inicio < fim) {
    const i = fila[inicio++];
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) enfileirar(i - 1);
    if (x < width - 1) enfileirar(i + 1);
    if (y > 0) enfileirar(i - width);
    if (y < height - 1) enfileirar(i + width);
  }

  // Zera o alfa do fundo e mede o retângulo da MOLDURA VERMELHA.
  //
  // O recorte é feito pela moldura, não por "tudo que não é fundo": em volta do
  // quadrado há uma sombra escura de 1-2 px que o flood fill não come (é escura
  // demais para parecer fundo) e que, sobre o vermelho das variantes opacas,
  // aparecia como um filete preto nas laterais. A moldura é o vermelho saturado
  // que vai até a borda real do ícone.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < width * height; i += 1) {
    if (visitado[i]) {
      data[i * channels + 3] = 0;
      continue;
    }
    const p = i * channels;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const saturado = r > 90 && r - Math.max(g, b) > 45;
    if (!saturado) continue;

    const x = i % width;
    const y = (i - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (maxX < 0) throw new Error("Não encontrei a moldura vermelha na arte.");

  // Recuo mínimo, só para descartar a casquinha de 1-2 px do contorno.
  const recuo = Math.round(Math.min(maxX - minX, maxY - minY) * 0.005);
  minX += recuo;
  maxX -= recuo;
  minY += recuo;
  maxY -= recuo;

  // O vermelho da moldura: amostra a faixa do TOPO da arte, no centro — ali é
  // moldura em toda a largura, porque a ficha (círculo) começa mais abaixo.
  // Pega a mediana de várias linhas para não depender de um pixel só.
  const fundo = corDaMoldura(data, channels, width, minX, maxX, minY, maxY);

  const recorte = await sharp(data, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();

  return {
    data: recorte,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    fundo,
  };
}

/** Ícone com fundo transparente (a arte ocupa quase todo o quadrado). */
async function transparente(arte: Buffer, tamanho: number, ocupacao: number) {
  const lado = Math.round(tamanho * ocupacao);
  // O background do resize é obrigatório: o padrão do sharp para "contain" é
  // PRETO OPACO, e as barras de letterbox viravam dois filetes pretos nas
  // laterais (a arte não é perfeitamente quadrada).
  const redimensionada = await sharp(arte)
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: tamanho,
      height: tamanho,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: redimensionada, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** Ícone opaco: fundo vermelho da própria arte + a ficha por cima. */
async function opaco(
  arte: Buffer,
  tamanho: number,
  ocupacao: number,
  fundo: { r: number; g: number; b: number },
) {
  const lado = Math.round(tamanho * ocupacao);
  // Letterbox transparente para o vermelho de baixo aparecer (ver acima).
  const redimensionada = await sharp(arte)
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: tamanho,
      height: tamanho,
      channels: 4,
      background: { ...fundo, alpha: 1 },
    },
  })
    .composite([{ input: redimensionada, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const arte = await recortarArte();
  console.log(
    `Arte recortada: ${arte.width}×${arte.height} · ` +
      `fundo rgb(${arte.fundo.r}, ${arte.fundo.g}, ${arte.fundo.b})\n`,
  );

  const arquivos: [string, Buffer][] = [
    // "any": a ficha inteira, fundo transparente.
    ["icon-192.png", await transparente(arte.data, 192, 1)],
    ["icon-512.png", await transparente(arte.data, 512, 1)],
    // "maskable": o Android recorta em círculo — a arte fica na zona segura
    // (80% do lado) e o vermelho preenche o resto.
    ["icon-maskable-192.png", await opaco(arte.data, 192, 0.78, arte.fundo)],
    ["icon-maskable-512.png", await opaco(arte.data, 512, 0.78, arte.fundo)],
    // iOS: sem transparência; ele mesmo arredonda os cantos.
    ["apple-touch-icon.png", await opaco(arte.data, 180, 1, arte.fundo)],
  ];

  for (const [nome, buffer] of arquivos) {
    writeFileSync(path.join(SAIDA, nome), buffer);
    console.log(`✓ ${nome}`);
  }

  // Favicon da aba do navegador.
  writeFileSync(path.join(ROOT, "app", "icon.png"), await transparente(arte.data, 128, 1));
  console.log("✓ app/icon.png (favicon)");

  console.log("\nÍcones gerados em public/icons/\n");
}

main().catch((error) => {
  console.error("✖ Erro ao gerar ícones:", error);
  process.exit(1);
});
