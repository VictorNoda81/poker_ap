/**
 * Junta todas as migrations num arquivo só, para colar de uma vez no SQL
 * Editor do Supabase.
 *
 *   npm run sql
 *
 * O Supabase não tem um comando de "aplicar migrations" pela API REST — só o
 * SQL Editor ou a CLI. Este script existe para tirar o atrito de abrir vários
 * arquivos na ordem certa.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");
const OUTPUT = path.join(ROOT, "supabase", "migrations-completas.sql");

const arquivos = readdirSync(DIR)
  .filter((nome) => nome.endsWith(".sql"))
  .sort(); // 0001_, 0002_, ... — a ordem numérica é a ordem de aplicação

if (arquivos.length === 0) {
  console.error("✖ Nenhuma migration encontrada em supabase/migrations/");
  process.exit(1);
}

const cabecalho = [
  "-- ===========================================================================",
  "-- Liga de Poker do CAP — todas as migrations, na ordem",
  "--",
  `-- Gerado por: npm run sql  (${arquivos.join(" + ")})`,
  "-- Cole TUDO no SQL Editor do Supabase e clique em Run.",
  "-- Rode uma vez só: repetir dá erro de 'já existe', o que é esperado.",
  "-- ===========================================================================",
  "",
  "",
].join("\n");

const corpo = arquivos
  .map((nome) => readFileSync(path.join(DIR, nome), "utf8").trimEnd())
  .join("\n\n\n");

writeFileSync(OUTPUT, `${cabecalho}${corpo}\n`, "utf8");

console.log(`✓ ${arquivos.length} migrations juntadas em:`);
console.log(`  ${OUTPUT}\n`);
console.log("Para copiar direto para a área de transferência (PowerShell):");
console.log(`  Get-Content "${OUTPUT}" -Raw | Set-Clipboard\n`);
