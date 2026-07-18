import type { Metadata, Viewport } from "next";
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
  icons: { icon: "/logo-cap.png" },
};

export const viewport: Viewport = {
  themeColor: "#ea1116",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="felt-surface flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
