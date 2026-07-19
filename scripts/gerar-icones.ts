/**
 * Gera os ícones do PWA a partir do logo do clube.
 *
 *   npm run icones
 *
 * O logo é 853×190 e contém a marca vermelha (à esquerda) e o texto "CLUBE
 * ALTO DOS PINHEIROS" (à direita). Num ícone de 192px o texto vira borrão,
 * então recortamos só a marca e centralizamos sobre um fundo escuro, igual ao
 * do app.
 *
 * Três variantes, porque os sistemas tratam ícones de formas diferentes:
 *   - "any"      : usado como está, com a arte ocupando bastante área
 *   - "maskable" : o Android recorta em círculo/squircle, então a arte precisa
 *                  caber na "zona segura" central (80% do lado). Sem isso, o
 *                  Android põe a imagem inteira dentro de um quadrado branco.
 *   - apple      : sem transparência, porque o iOS não aplica máscara e um
 *                  fundo transparente vira preto sólido.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = path.join(ROOT, "public", "logo-cap.png");
const SAIDA = path.join(ROOT, "public", "icons");

/** Recorte da marca vermelha dentro do logo (medido pixel a pixel). */
const MARCA = { left: 0, top: 0, width: 580, height: 190 };

/** Fundo dos ícones — o mesmo tom das superfícies do app. */
const FUNDO = { r: 14, g: 14, b: 18, alpha: 1 };

interface Variante {
  arquivo: string;
  tamanho: number;
  /** Fração do lado ocupada pela arte. Menor = mais respiro nas bordas. */
  ocupacao: number;
}

const VARIANTES: Variante[] = [
  // "any": pode encostar mais nas bordas, ninguém vai recortar.
  { arquivo: "icon-192.png", tamanho: 192, ocupacao: 0.82 },
  { arquivo: "icon-512.png", tamanho: 512, ocupacao: 0.82 },
  // "maskable": zona segura é o círculo central de 80% — ficamos abaixo disso.
  { arquivo: "icon-maskable-192.png", tamanho: 192, ocupacao: 0.6 },
  { arquivo: "icon-maskable-512.png", tamanho: 512, ocupacao: 0.6 },
  // iOS já aplica cantos arredondados por conta própria.
  { arquivo: "apple-touch-icon.png", tamanho: 180, ocupacao: 0.76 },
];

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  const marca = await sharp(LOGO).extract(MARCA).toBuffer();
  const meta = await sharp(marca).metadata();
  const proporcao = (meta.width ?? 580) / (meta.height ?? 190);

  for (const { arquivo, tamanho, ocupacao } of VARIANTES) {
    // A marca é bem mais larga que alta, então a largura é o limite.
    const larguraArte = Math.round(tamanho * ocupacao);
    const alturaArte = Math.round(larguraArte / proporcao);

    const arte = await sharp(marca)
      .resize(larguraArte, alturaArte, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO },
    })
      .composite([{ input: arte, gravity: "centre" }])
      .png()
      .toFile(path.join(SAIDA, arquivo));

    console.log(`✓ ${arquivo.padEnd(28)} ${tamanho}×${tamanho}  arte ${larguraArte}×${alturaArte}`);
  }

  // Favicon: mesmo tratamento dos demais, para a aba do navegador mostrar a
  // mesma imagem que o ícone instalado. Recortar um pedaço da marca deixaria
  // uma forma truncada, que não se reconhece como nada.
  const larguraFavicon = Math.round(64 * 0.86);
  const arteFavicon = await sharp(marca)
    .resize(larguraFavicon, Math.round(larguraFavicon / proporcao))
    .toBuffer();

  await sharp({ create: { width: 64, height: 64, channels: 4, background: FUNDO } })
    .composite([{ input: arteFavicon, gravity: "centre" }])
    .png()
    .toFile(path.join(ROOT, "app", "icon.png"));
  console.log(`✓ ${"app/icon.png".padEnd(28)} 64×64    favicon`);

  console.log("\nÍcones gerados em public/icons/\n");
}

main().catch((error) => {
  console.error("✖ Erro ao gerar ícones:", error);
  process.exit(1);
});
