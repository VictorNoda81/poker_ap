import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./url";

const BASE = "https://kpyhggnrbliwqmfgtija.supabase.co";

describe("normalizeSupabaseUrl", () => {
  it("deixa a URL base intacta", () => {
    expect(normalizeSupabaseUrl(BASE)).toBe(BASE);
  });

  it("corta o /rest/v1/ que o painel do Supabase exibe", () => {
    // É exatamente este formato que aparece em Project Settings > API.
    expect(normalizeSupabaseUrl(`${BASE}/rest/v1/`)).toBe(BASE);
    expect(normalizeSupabaseUrl(`${BASE}/rest/v1`)).toBe(BASE);
  });

  it("corta os outros sufixos de API do Supabase", () => {
    expect(normalizeSupabaseUrl(`${BASE}/auth/v1`)).toBe(BASE);
    expect(normalizeSupabaseUrl(`${BASE}/storage/v1/`)).toBe(BASE);
    expect(normalizeSupabaseUrl(`${BASE}/functions/v1`)).toBe(BASE);
  });

  it("remove barras e espaços sobrando", () => {
    expect(normalizeSupabaseUrl(`  ${BASE}///  `)).toBe(BASE);
  });

  it("não confunde sufixo no meio do caminho com sufixo no fim", () => {
    // Só corta se estiver no FIM — um domínio que por acaso contenha o texto
    // não pode ser mutilado.
    expect(normalizeSupabaseUrl("https://rest.v1.exemplo.com")).toBe(
      "https://rest.v1.exemplo.com",
    );
  });

  it("corta apenas um sufixo, não encadeia", () => {
    expect(normalizeSupabaseUrl(`${BASE}/rest/v1/rest/v1`)).toBe(`${BASE}/rest/v1`);
  });
});
