/* =====================================================================
 *  PRETO RICO — Service Worker (PWA)
 *  - Guarda em cache só os arquivos estáticos do site (HTML, CSS, JS, ícones).
 *  - Chamadas ao backend (script.google.com / googleusercontent) vão SEMPRE
 *    para a rede, sem cache: os dados continuam vindo da planilha.
 *  - Ao publicar uma versão nova do site, aumente CACHE_VERSION
 *    (ex.: "pretorico-v2") para os aparelhos baixarem os arquivos novos.
 * ===================================================================== */
const CACHE_VERSION = 'pretorico-v7';

// Cada página no seu lugar: o sistema, o agendamento da tatuagem e a área do mensalista
const paginaDe = url => { const m = url.pathname.match(/(agendar|mensalista)\.html$/); return m ? `./${m[1]}.html` : './index.html'; };

const STATIC_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './api.js',
  './agendar.html',
  './agendar.js',
  './mensalista.html',
  './mensalista.js',
  './pwa.js',
  './logo.png',
  './logo-recibo.png',
  './manifest.webmanifest',
  './favicon.ico',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

// Domínios que nunca passam pelo cache (backend Apps Script)
const NETWORK_ONLY_HOSTS = ['script.google.com', 'script.googleusercontent.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

// Remove caches de versões antigas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Backend: sempre rede (não intercepta)
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  // Só arquivos do próprio site e só GET
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Página (navegação): rede primeiro, para receber atualizações; sem internet, usa o cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          // Cada página no seu lugar (o sistema e a página de agendamento do cliente)
          const pagina = paginaDe(url);
          if (res && res.ok) caches.open(CACHE_VERSION).then(c => c.put(pagina, copy));
          return res;
        })
        .catch(() => caches.match(paginaDe(url)).then(r => r || caches.match('./')))
    );
    return;
  }

  // Demais arquivos estáticos: responde do cache e atualiza em segundo plano
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
