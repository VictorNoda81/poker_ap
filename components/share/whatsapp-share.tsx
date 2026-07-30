"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/domain/share";

/** Ícone simples do WhatsApp (SVG próprio, sem dependência externa). */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.8c2.17 0 4.2.84 5.74 2.38a8.06 8.06 0 0 1 2.37 5.73c0 4.47-3.64 8.11-8.12 8.11a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.11.82.83-3.04-.2-.31a8.05 8.05 0 0 1-1.24-4.29c0-4.47 3.64-8.11 8.16-8.11Zm4.69 11.53c-.26-.13-1.52-.75-1.75-.83-.24-.09-.41-.13-.58.13-.17.26-.67.83-.82 1-.15.17-.3.19-.56.06-.26-.13-1.09-.4-2.08-1.28-.77-.68-1.28-1.53-1.44-1.79-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.8-1.92-.21-.5-.42-.43-.58-.44l-.5-.01c-.17 0-.45.06-.68.32-.24.26-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.66.13.17 1.82 2.78 4.4 3.9.62.26 1.1.42 1.47.54.62.2 1.18.17 1.63.1.5-.07 1.52-.62 1.74-1.22.21-.6.21-1.11.15-1.22-.06-.11-.24-.17-.5-.3Z" />
    </svg>
  );
}

/**
 * Botão que gera uma mensagem de WhatsApp e oferece copiar ou abrir o app.
 *
 * `buildMessage` é chamado no clique, não na renderização — assim a mensagem
 * reflete o estado ATUAL da tela (colocações que o admin acabou de digitar),
 * sem o componente precisar conhecer os dados.
 *
 * Não enviamos nada: o link wa.me só abre o WhatsApp com o texto pronto; quem
 * escolhe o destinatário e aperta enviar é a pessoa.
 */
export function WhatsAppShare({
  label = "Compartilhar no WhatsApp",
  buildMessage,
}: {
  label?: string;
  buildMessage: () => string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function gerar() {
    setMessage(buildMessage());
    setCopied(false);
  }

  async function copiar() {
    if (message === null) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Alguns navegadores bloqueiam a área de transferência; o texto continua
      // visível no campo para copiar na mão.
      setCopied(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={gerar}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/20"
      >
        <WhatsAppIcon className="h-4 w-4" />
        {label}
      </button>

      {message !== null ? (
        <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3">
          <textarea
            readOnly
            value={message}
            rows={Math.min(16, message.split("\n").length + 1)}
            onFocus={(event) => event.currentTarget.select()}
            className="tnum w-full resize-y rounded-md border border-ink-800 bg-ink-900 p-3 font-mono text-xs leading-relaxed text-chalk focus:border-cap-red focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copiar}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-ink-600 hover:text-chalk"
            >
              {copied ? "✓ Copiado" : "Copiar texto"}
            </button>
            <a
              href={whatsappLink(message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/20"
            >
              <WhatsAppIcon className="h-3.5 w-3.5" />
              Abrir no WhatsApp
            </a>
            <button
              type="button"
              onClick={gerar}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-ink-600 hover:text-chalk"
            >
              Atualizar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
