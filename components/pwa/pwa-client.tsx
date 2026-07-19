"use client";

import { useEffect, useState } from "react";

/**
 * Registra o service worker e avisa quando o app está sem conexão.
 *
 * O aviso importa: quando offline, o service worker devolve a última versão
 * vista da página. Sem a faixa, o ranking apareceria normalmente e a pessoa
 * não teria como saber que está olhando dado velho.
 */
export function PwaClient() {
  const [semRede, setSemRede] = useState(false);
  const [servidoDoCache, setServidoDoCache] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // O service worker avisa quando entregou uma página do cache porque a
      // rede falhou. Isso cobre o caso em que o celular tem wifi mas o
      // servidor está inacessível — aí `navigator.onLine` continua true.
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.tipo === "servido-do-cache") setServidoDoCache(true);
      });
    }

    if ("serviceWorker" in navigator) {
      // Registrar depois do load evita competir por banda com o carregamento
      // inicial da página.
      const registrar = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          // Falha ao registrar não pode quebrar o app: sem service worker ele
          // continua funcionando, só perde o modo offline.
        });
      };

      if (document.readyState === "complete") registrar();
      else window.addEventListener("load", registrar);
    }

    const atualizar = () => {
      setSemRede(!navigator.onLine);
      // Voltar a ficar online torna o aviso de cache obsoleto.
      if (navigator.onLine) setServidoDoCache(false);
    };
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);

    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  if (!semRede && !servidoDoCache) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-amber-500/95 px-4 py-2 text-center text-xs font-semibold text-black"
    >
      {semRede
        ? "Sem conexão — os dados podem estar desatualizados."
        : "Servidor fora de alcance — mostrando a última versão salva."}
    </div>
  );
}
