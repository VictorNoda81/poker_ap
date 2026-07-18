/**
 * Extrai o logo do Clube Alto de Pinheiros que vem embutido na planilha
 * `data/2026.xlsx` e grava em `public/logo-cap.png`.
 *
 *   npm run extract-logo
 *
 * Existe para o repositório não depender de um arquivo solto fora dele: quem
 * clonar o projeto regenera o logo a partir da própria planilha.
 *
 * Um .xlsx é um arquivo ZIP, e o logo mora em `xl/media/image1.png`. Em vez de
 * puxar uma biblioteca de zip só para isso, lemos o formato na mão — são
 * poucas dezenas de linhas e o `zlib` já vem no Node.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WORKBOOK = path.join(ROOT, "data", "2026.xlsx");
const OUTPUT = path.join(ROOT, "public", "logo-cap.png");
const TARGET = "xl/media/image1.png";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Lê um arquivo de dentro de um ZIP, sem dependências externas. */
function readZipEntry(zip: Buffer, entryName: string): Buffer | null {
  // 1. Localiza o "End of Central Directory", que fica no fim do arquivo.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Arquivo não parece ser um ZIP válido.");

  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  // 2. Percorre o diretório central procurando o arquivo desejado.
  for (let i = 0; i < entryCount; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;

    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (name === entryName) {
      // 3. O cabeçalho local repete nome/extra com tamanhos possivelmente
      //    diferentes, então lemos de lá para achar onde os dados começam.
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return Buffer.from(data); // armazenado sem compressão
      if (method === 8) return inflateRawSync(data); // deflate
      throw new Error(`Método de compressão não suportado: ${method}`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

const logo = readZipEntry(readFileSync(WORKBOOK), TARGET);

if (!logo) {
  console.error(`✖ Não encontrei ${TARGET} dentro de ${path.relative(ROOT, WORKBOOK)}.`);
  process.exit(1);
}

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, logo);
console.log(`✓ Logo gravado em ${path.relative(ROOT, OUTPUT)} (${logo.length} bytes)`);
