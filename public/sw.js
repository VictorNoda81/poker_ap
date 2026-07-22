/**
 * Service worker da Liga de Poker do CAP.
 *
 * Objetivo: o app abrir instantaneamente e não mostrar a tela de dinossauro
 * quando o celular perde sinal no clube.
 *
 * Estratégias, e o porquê de cada uma:
 *
 *   Assets do build (/_next/static, ícones)  -> cache primeiro
 *     Têm hash no nome; quando mudam, mudam de URL. Cachear para sempre é
 *     seguro e é o que faz a abertura ser instantânea.
 *
 *   Navegação nas páginas públicas           -> rede primeiro, cache de reserva
 *     O ranking muda a cada etapa lançada, então a rede sempre tem prioridade.
 *     O cache só entra em cena quando não há conexão — e a página avisa que os
 *     dados podem estar desatualizados.
 *
 *   /admin e qualquer POST                   -> nunca cacheado
 *     Painel administrativo com dado velho leva a lançar etapa errada. E
 *     resposta de formulário cacheada é receita para bug difícil de achar.
 */

const VERSAO = "v4";
const CACHE_ESTATICO = `cap-poker-estatico-${VERSAO}`;
const CACHE_PAGINAS = `cap-poker-paginas-${VERSAO}`;
const PAGINA_OFFLINE = "/offline";

const PRECACHE = [PAGINA_OFFLINE, "/icons/icon-192.png", "/logo-cap.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      // Um item que falhe não pode abortar a instalação inteira.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith("cap-poker-") && !nome.endsWith(VERSAO))
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Avisa todas as abas abertas de que o conteúdo entregue veio do cache.
 * A página usa isso para mostrar a faixa de "dados podem estar desatualizados".
 */
function avisarClientes() {
  self.clients.matchAll({ type: "window" }).then((clientes) => {
    for (const cliente of clientes) {
      cliente.postMessage({ tipo: "servido-do-cache" });
    }
  });
}

/** true para o que nunca deve ser servido do cache. */
function nuncaCachear(url, request) {
  if (request.method !== "GET") return true;
  if (url.pathname.startsWith("/admin")) return true;
  if (url.pathname.startsWith("/api")) return true;
  // Consultas ao Supabase saem por outra origem e devem sempre ir à rede.
  if (url.origin !== self.location.origin) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (nuncaCachear(url, request)) return;

  // --- Assets versionados: cache primeiro -----------------------------------
  const ehAssetVersionado =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo-cap.png";

  if (ehAssetVersionado) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(
        (emCache) =>
          emCache ||
          fetch(request).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              caches.open(CACHE_ESTATICO).then((cache) => cache.put(request, copia));
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  // --- Navegação: rede primeiro, cache de reserva ---------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_PAGINAS).then((cache) => cache.put(request, copia));
          }
          return resposta;
        })
        .catch(async () => {
          // Sem rede: devolve a última versão vista desta página; se nunca foi
          // aberta, cai na página de offline.
          //
          // `ignoreVary` é obrigatório aqui. O Next responde com
          // `Vary: rsc, next-router-state-tree, ...`, e o `caches.match` honra
          // Vary por padrão — como uma requisição de navegação carrega
          // cabeçalhos diferentes dos que estavam na resposta guardada, o
          // match falha silenciosamente e o usuário vê a tela de erro do
          // navegador em vez da página offline.
          const emCache = await caches.match(request, { ignoreVary: true });
          if (emCache) {
            // Avisa a página que o conteúdo veio do cache. Sem isso, quando o
            // celular tem wifi mas o servidor está inacessível, o app mostraria
            // um ranking antigo com cara de atual: `navigator.onLine` continua
            // true, porque só reflete a interface de rede.
            avisarClientes();
            return emCache;
          }

          const offline = await caches.match(PAGINA_OFFLINE, { ignoreVary: true });
          if (offline) return offline;

          // Último recurso: uma resposta mínima, para nunca devolver undefined
          // ao respondWith (o que viraria erro de rede).
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Sem conexão</title>" +
              "<body style='background:#0f3d2d;color:#f2f6f3;font-family:system-ui;" +
              "display:grid;place-items:center;height:100vh;margin:0'>" +
              "<p>Sem conexão.</p>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }),
    );
  }
});
