import type { MetadataRoute } from "next";

/**
 * Manifest do PWA — servido pelo Next em /manifest.webmanifest.
 *
 * É este arquivo que permite "Adicionar à tela de início" e faz o app abrir
 * em janela própria, sem a barra de endereço do navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Liga de Poker · Clube Alto dos Pinheiros",
    // Nome curto é o que cabe embaixo do ícone na tela de início.
    short_name: "Poker CAP",
    description:
      "Ranking oficial, histórico de etapas e estatísticas da liga de poker do Clube Alto dos Pinheiros.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Cor da barra de status e da tela de abertura.
    theme_color: "#ea1116",
    background_color: "#08080a",
    categories: ["sports", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // O Android recorta o ícone em círculo/squircle. Sem uma variante
      // "maskable", ele encaixa a imagem inteira dentro de um quadrado branco.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Atalhos no menu de toque longo sobre o ícone.
    shortcuts: [
      {
        name: "Ranking da temporada",
        short_name: "Ranking",
        url: "/",
      },
      {
        name: "Etapas",
        short_name: "Etapas",
        url: "/etapas",
      },
      {
        name: "Jogadores",
        short_name: "Jogadores",
        url: "/jogadores",
      },
    ],
  };
}
