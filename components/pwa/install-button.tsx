"use client";

import { useEffect, useState } from "react";

/** Evento não-padrão do Chrome/Edge, sem tipo no lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Botão "Instalar app".
 *
 * Chrome e Edge disparam `beforeinstallprompt` e permitem abrir o diálogo de
 * instalação. O Safari do iPhone não implementa esse evento — lá a instalação
 * é manual, pelo menu Compartilhar, então mostramos as instruções em vez do
 * botão. Sem esse caminho, metade dos jogadores não conseguiria instalar.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosSafari, setIosSafari] = useState(false);
  const [instalado, setInstalado] = useState(false);
  const [mostrarAjudaIos, setMostrarAjudaIos] = useState(false);

  useEffect(() => {
    // Já está rodando como app instalado? Então não oferece instalar.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Propriedade só do Safari iOS.
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalado(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const ehIos = /iPad|iPhone|iPod/.test(ua);
    const ehSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIosSafari(ehIos && ehSafari);

    const capturar = (event: Event) => {
      // Impede o banner automático para mostrarmos o botão no lugar certo.
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", capturar);
    window.addEventListener("appinstalled", () => setInstalado(true));

    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  if (instalado) return null;
  if (!prompt && !iosSafari) return null;

  async function instalar() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // O evento só pode ser usado uma vez.
    setPrompt(null);
    if (outcome === "accepted") setInstalado(true);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => (iosSafari ? setMostrarAjudaIos((v) => !v) : instalar())}
        className="inline-flex items-center gap-2 rounded-lg border border-cap-red/40 bg-cap-red/10 px-3 py-1.5 text-xs font-bold text-cap-red-light transition-colors hover:bg-cap-red/20"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M10 3v10m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 15v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" strokeLinecap="round" />
        </svg>
        Instalar app
      </button>

      {mostrarAjudaIos ? (
        <p className="max-w-xs text-xs leading-relaxed text-chalk-dim">
          No iPhone: toque em <strong className="text-chalk">Compartilhar</strong> na barra do
          Safari e depois em <strong className="text-chalk">Adicionar à Tela de Início</strong>.
        </p>
      ) : null}
    </div>
  );
}
