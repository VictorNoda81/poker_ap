import type { Metadata, Viewport } from "next";
import { PwaClient } from "@/components/pwa/pwa-client";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Liga de Poker · Clube Alto dos Pinheiros",
    template: "%s · Liga de Poker CAP",
  },
  description:
    "Ranking oficial, histórico de etapas e estatísticas da liga de poker do Clube Alto dos Pinheiros.",
  applicationName: "Poker CAP",
  appleWebApp: {
    // Faz o app abrir em tela cheia quando adicionado à tela de início do
    // iPhone — o Safari não lê o manifest para isso, precisa destas meta tags.
    capable: true,
    title: "Poker CAP",
    statusBarStyle: "black-translucent",
  },
  icons: {
    // `icon` PRECISA estar aqui. Declarar o campo `icons` desliga a convenção
    // de arquivo do Next (app/icon.png), então sem esta linha o HTML saía com
    // apple-touch-icon e mais nada — e a aba do browser ficava sem ícone.
    // Dois tamanhos: 128 para a aba, 192 para atalho de desktop e favoritos.
    icon: [
      { url: "/icon.png", sizes: "128x128", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: {
    // Impede o iOS de transformar números de sócio e pontuações em links de
    // telefone.
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ea1116",
  // Respeita o recorte da tela em celulares com notch quando em tela cheia.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="felt-surface flex min-h-screen flex-col">
        <PwaClient />
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
