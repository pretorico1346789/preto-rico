/* =====================================================================
 *  PRETO RICO — Instalação como app (PWA)
 *  Independente do app.js/api.js: não mexe na lógica do sistema.
 *  - Registra o service worker.
 *  - Mostra o botão "Instalar app" só quando o navegador permitir
 *    (evento beforeinstallprompt — Chrome/Edge no PC e Android).
 *  - No iPhone/iPad (Safari), mostra a dica "Compartilhar > Adicionar à Tela de Início".
 * ===================================================================== */
(function () {
  'use strict';

  // 1) Service worker (caminho relativo: funciona em /preto-rico/)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .catch(function (err) { console.warn('Service worker não registrado:', err); });
    });
  }

  var DISMISS_KEY = 'pr_pwa_dica_fechada';
  function jaFechou() { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; } }
  function marcarFechado() { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* sem storage */ } }

  var instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // Estilo do botão/dica (discreto, nas cores do sistema)
  var css = document.createElement('style');
  css.textContent =
    '.pr-pwa{position:fixed;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:9999;' +
    'display:flex;align-items:center;gap:6px;font-family:Poppins,system-ui,sans-serif;font-size:13px;' +
    'background:#111111;color:#FFC20E;border:1px solid #FFC20E;border-radius:999px;padding:7px 12px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
    '.pr-pwa button{background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:0}' +
    '.pr-pwa .pr-pwa-x{opacity:.7;margin-left:4px}' +
    '.pr-pwa-dica{max-width:min(320px,calc(100vw - 24px));border-radius:14px;line-height:1.35}' +
    '@media print{.pr-pwa{display:none!important}}';
  document.head.appendChild(css);

  function criarCaixa(classeExtra) {
    var box = document.createElement('div');
    box.className = 'pr-pwa' + (classeExtra ? ' ' + classeExtra : '');
    box.setAttribute('role', 'status');
    return box;
  }

  function botaoFechar(box) {
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'pr-pwa-x';
    x.setAttribute('aria-label', 'Fechar');
    x.textContent = '✕';
    x.addEventListener('click', function () { box.remove(); marcarFechado(); });
    return x;
  }

  // 2) Chrome/Edge: botão "Instalar app"
  var promptAdiado = null;
  var caixaInstalar = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    promptAdiado = e;
    if (instalado || caixaInstalar) return;
    caixaInstalar = criarCaixa();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pr-instalar';
    btn.textContent = '⬇ Instalar app';
    btn.addEventListener('click', function () {
      if (!promptAdiado) return;
      promptAdiado.prompt();
      promptAdiado.userChoice.finally(function () {
        promptAdiado = null;
        if (caixaInstalar) { caixaInstalar.remove(); caixaInstalar = null; }
      });
    });
    caixaInstalar.appendChild(btn);
    caixaInstalar.appendChild(botaoFechar(caixaInstalar));
    document.body.appendChild(caixaInstalar);
  });

  window.addEventListener('appinstalled', function () {
    instalado = true;
    if (caixaInstalar) { caixaInstalar.remove(); caixaInstalar = null; }
  });

  // 3) iPhone/iPad no Safari: dica manual
  var ua = navigator.userAgent || '';
  var ehIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ehIOS && !instalado && !jaFechou()) {
    window.addEventListener('load', function () {
      var dica = criarCaixa('pr-pwa-dica');
      var txt = document.createElement('span');
      txt.textContent = 'Instale o app: toque em Compartilhar ⬆️ > Adicionar à Tela de Início';
      dica.appendChild(txt);
      dica.appendChild(botaoFechar(dica));
      document.body.appendChild(dica);
    });
  }
})();
