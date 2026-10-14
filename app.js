/* ==========================================================================
   PRETO RICO — app.js
   Frontend SPA: navegação, RBAC, telas dos módulos, PDV, comissões,
   conciliação OFX e recibos. Depende de api.js (objeto global Api).
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. UTILITÁRIOS
   ========================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = Api.num;
const r2 = Api.r2;
const uid = Api.uid;
const same = (a, b) => String(a) === String(b);
const pad = n => String(n).padStart(2, '0');
const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDT = (d = new Date()) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = s => String(s || '').slice(0, 10);
const monthOf = s => String(s || '').slice(0, 7);
const timeOf = s => String(s || '').slice(11, 16);
const inRange = (s, de, ate) => { const d = dayOf(s); return !!d && d >= de && d <= ate; };
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); };
const addMonth = (mo, n) => { const [y, m] = mo.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthStart = () => monthOf(isoDate()) + '-01';
const monthEnd = mo => { const [y, m] = mo.split('-').map(Number); return `${mo}-${pad(new Date(y, m, 0).getDate())}`; };
const fmtDate = s => {
  if (!s) return '—';
  const [d, t] = String(s).split('T');
  const [y, m, dd] = d.split('-');
  return dd ? `${dd}/${m}/${y}${t ? ' ' + t.slice(0, 5) : ''}` : String(s);
};
const fmtMonth = mo => { const [y, m] = mo.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
const sum = (rows, f) => rows.reduce((s, r) => s + num(typeof f === 'function' ? f(r) : r[f]), 0);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const parseJSON = (v, def) => { if (Array.isArray(v) || (v && typeof v === 'object')) return v; try { return JSON.parse(v); } catch (e) { return def; } };
const groupBy = (rows, f) => rows.reduce((m, r) => { const k = f(r); (m[k] = m[k] || []).push(r); return m; }, {});

/* ==========================================================================
   2. CONSTANTES E ESTADO
   ========================================================================== */
const MODULES = {
  inicio:     { label: 'Início', short: 'Início', icon: '🏠' },
  dashboard:  { label: 'Painel Financeiro', short: 'Painel', icon: '📊' },
  barbearia:  { label: 'Barbearia', short: 'Barbearia', icon: '💈' },
  tabacaria:  { label: 'Tabacaria & Roupas', short: 'Tabacaria', icon: '🛍️' },
  celulares:  { label: 'Celulares & Acess.', short: 'Celulares', icon: '📱' },
  tatuagem:   { label: 'Estúdio Tattoo', short: 'Tattoo', icon: '🖋️' },
  financeiro: { label: 'Financeiro', short: 'Financeiro', icon: '💰' },
  clientes:   { label: 'Clientes', short: 'Clientes', icon: '👥' },
  usuarios:   { label: 'Usuários', short: 'Usuários', icon: '🔐' },
  config:     { label: 'Configurações', short: 'Config.', icon: '⚙️' }
};
/** Teto de módulos por nível — Modulos_Permitidos só pode restringir dentro disso. */
const LEVEL_CAP = {
  Master: Object.keys(MODULES),
  Barbeiro: ['inicio', 'barbearia', 'clientes'],
  Caixa: ['inicio', 'tabacaria', 'celulares', 'clientes'],
  Tatuador: ['inicio', 'tatuagem', 'clientes']
};
const LEVELS = Object.keys(LEVEL_CAP);
const STORE_ACT = { tabacaria: 'Tabacaria', celulares: 'Celulares' };
const ACT_LABEL = { Barbearia: 'Barbearia', Tabacaria: 'Tabacaria & Roupas', Celulares: 'Celulares & Acess.', Tatuagem: 'Tatuagem' };
const PAY = [
  { id: 'Pix', label: 'Pix', icon: '⚡' },
  { id: 'Cartao', label: 'Cartão', icon: '💳' },
  { id: 'Dinheiro', label: 'Dinheiro', icon: '💵' },
  { id: 'Crediario', label: 'Fiado', icon: '📒' }
];
const payLabel = id => (PAY.find(p => p.id === id) || { label: id || '—' }).label;
const DEFAULT_SERVICOS = [
  { nome: 'Corte', preco: 40, comissao: 50 },
  { nome: 'Barba', preco: 30, comissao: 50 },
  { nome: 'Corte + Barba', preco: 60, comissao: 50 },
  { nome: 'Pigmentação', preco: 25, comissao: 40 },
  { nome: 'Sobrancelha', preco: 15, comissao: 50 }
];
const STATUS_TONE = {
  Agendado: 'info', Concluido: 'ok', Cancelado: 'danger', Pendente: 'warn', Pago: 'ok', 'Em dia': 'ok',
  Atrasado: 'danger', Aberto: 'warn', Quitado: 'ok', Ativo: 'ok', Inativo: 'muted', A: 'ok', B: 'warn', C: 'muted'
};
const STATUS_LABEL = { Concluido: 'Concluído', Crediario: 'Fiado', Cartao: 'Cartão' };

const S = {
  user: null, view: null, tabs: {}, cal: {}, filters: {},
  cart: { tabacaria: [], celulares: [] }, pay: { tabacaria: 'Pix', celulares: 'Pix' },
  cli: { tabacaria: '', celulares: '' }, pdvAuth: {}, ofx: null
};

/* ---------- Acesso a dados ---------- */
const T = name => Api.table(name);
const users = () => T('Usuarios');
const userName = id => users().find(u => same(u.ID, id))?.Nome || (id ? String(id) : '—');
const profs = nivel => users().filter(u => u.Nivel === nivel && u.Status !== 'Inativo');
const clientes = () => T('Clientes').slice().sort((a, b) => String(a.Nome).localeCompare(b.Nome));
const cliente = id => T('Clientes').find(c => same(c.ID, id));
const cfgVal = (k, def) => Api.config(k, def);
const servicos = () => { const s = cfgVal('servicos', null); return Array.isArray(s) && s.length ? s : DEFAULT_SERVICOS; };
const empresa = () => ({ nome: 'Preto Rico', doc: '', end: '', tel: '', ...(cfgVal('empresa', {}) || {}) });

/* ---------- Permissões ---------- */
const isMaster = () => S.user?.Nivel === 'Master';
const lvl = () => S.user?.Nivel;
function allowedModules() {
  const u = S.user;
  if (!u) return [];
  const cap = LEVEL_CAP[u.Nivel] || ['inicio'];
  if (u.Nivel === 'Master') return cap;
  const list = parseJSON(u.Modulos_Permitidos, []);
  if (!Array.isArray(list) || !list.length) return cap;
  return cap.filter(m => m === 'inicio' || list.includes(m));
}

/* ==========================================================================
   3. COMPONENTES DE INTERFACE
   ========================================================================== */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'danger' ? 5500 : 3200);
}

/** Executa uma ação assíncrona mostrando erro amigável. Retorna undefined em caso de falha. */
async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, 'ok');
    return r === undefined ? true : r;
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'danger');
    return undefined;
  }
}

const badge = (text, tone) => `<span class="badge badge-${tone || 'muted'}">${esc(text)}</span>`;
const sBadge = s => s ? badge(STATUS_LABEL[s] || s, STATUS_TONE[s]) : '';
const kpi = (label, value, tone, sub) => `<div class="kpi kpi-${tone || 'default'}"><span class="kpi-label">${esc(label)}</span><strong class="kpi-value">${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
const opts = (list, v) => list.map(o => {
  const [val, lab] = Array.isArray(o) ? o : [o, STATUS_LABEL[o] || o];
  return `<option value="${esc(val)}" ${same(val, v) ? 'selected' : ''}>${esc(lab)}</option>`;
}).join('');

/**
 * Tabela zebrada responsiva.
 * cols: [{ label, html(row), cls }]
 */
function table(cols, rows, { empty = 'Nenhum registro encontrado.', foot = '' } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.cls || ''}" data-label="${esc(c.label)}">${c.html(r) ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot>${foot}</tfoot>` : ''}
  </table></div>`;
}
const footRow = (cells) => `<tr>${cells.map(c => `<td class="${c.cls || ''}" data-label="${esc(c.label || '')}">${c.html ?? ''}</td>`).join('')}</tr>`;

/** Delegação de cliques: elementos com data-act="nome" chamam acts[nome](dataset, el). */
function bind(el, acts) {
  el.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b || !el.contains(b)) return;
    const fn = acts[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b.dataset, b, e); }
  };
}

/** Inputs com data-f="chave" atualizam o objeto de filtro e redesenham. */
function bindFilters(el, f, rerender, extra) {
  el.onchange = e => {
    const k = e.target.dataset.f;
    if (k) { f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; rerender(); return; }
    extra && extra(e);
  };
}

/** Barra de período com atalhos Hoje / Mês. */
function periodBar(f, extra = '') {
  return `<div class="toolbar">
    <label>De<input type="date" data-f="de" value="${esc(f.de)}"></label>
    <label>Até<input type="date" data-f="ate" value="${esc(f.ate)}"></label>
    <button type="button" class="btn" data-act="p-hoje">Hoje</button>
    <button type="button" class="btn" data-act="p-mes">Este mês</button>
    ${extra}
  </div>`;
}
const periodActs = (f, rerender) => ({
  'p-hoje': () => { f.de = f.ate = isoDate(); rerender(); },
  'p-mes': () => { f.de = monthStart(); f.ate = isoDate(); rerender(); }
});

/* ---------- Modais ---------- */
function openModal({ title, body = '', actions = [], size = '', onOpen, onSubmit }) {
  const node = $('#tpl-modal').content.firstElementChild.cloneNode(true);
  const form = $('form', node);
  if (size) form.classList.add('modal-' + size);
  $('.modal-title', node).textContent = title;
  $('.modal-body', node).innerHTML = body;
  const foot = $('.modal-foot', node);
  const close = () => node.remove();
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = a.submit ? 'submit' : 'button';
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    if (!a.submit) b.onclick = () => (a.onClick ? a.onClick(form, close) : close());
    foot.appendChild(b);
  });
  form.onsubmit = async e => {
    e.preventDefault();
    if (!onSubmit) return;
    if (!form.reportValidity()) return;
    const btn = $('[type=submit]', form);
    if (btn) btn.disabled = true;
    try {
      const r = await onSubmit(form, close);
      if (r !== false) close();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'danger');
    } finally { if (btn) btn.disabled = false; }
  };
  node.addEventListener('mousedown', e => { if (e.target === node) close(); });
  node.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(node);
  onOpen && onOpen(form, close);
  const first = $('input:not([type=hidden]):not([readonly]), select, textarea', form);
  if (first && window.matchMedia('(min-width: 900px)').matches) first.focus();
  return { node, form, close };
}

function fieldHTML(f, values) {
  const v = values[f.name] ?? f.value ?? '';
  const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 6);
  const a = [
    `id="${id}"`, `name="${f.name}"`,
    f.required ? 'required' : '', f.readonly ? 'readonly' : '',
    f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '',
    f.step ? `step="${f.step}"` : '', f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
    f.pattern ? `pattern="${f.pattern}"` : '', f.list ? `list="${f.list}"` : '',
    f.inputmode ? `inputmode="${f.inputmode}"` : '', f.maxlength ? `maxlength="${f.maxlength}"` : ''
  ].join(' ');
  let input;
  if (f.type === 'select') input = `<select ${a}>${opts(f.options, v)}</select>`;
  else if (f.type === 'textarea') input = `<textarea ${a}>${esc(v)}</textarea>`;
  else if (f.type === 'checks') {
    const sel = parseJSON(v, []) || [];
    input = `<div class="checks">${f.options.map(([val, lab]) => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(val)}" ${sel.includes(val) ? 'checked' : ''}> ${esc(lab)}</label>`).join('')}</div>`;
  } else input = `<input type="${f.type || 'text'}" ${a} value="${esc(v)}">`;
  return `<div class="field ${f.full ? 'full' : ''}" ${f.hidden ? 'hidden' : ''} data-field="${f.name}">
    <label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.help ? `<small class="help">${f.help}</small>` : ''}</div>`;
}

function readForm(form, fields) {
  const d = {};
  fields.forEach(f => {
    if (f.type === 'checks') d[f.name] = $$(`input[name="${f.name}"]:checked`, form).map(i => i.value);
    else {
      const el = form.elements[f.name];
      if (!el) return;
      d[f.name] = f.type === 'number' ? (el.value === '' ? '' : num(el.value)) : String(el.value).trim();
    }
  });
  return d;
}

/** Formulário em modal a partir de uma lista de campos. */
function formModal({ title, fields, values = {}, submitLabel = 'Salvar', size, onSubmit, intro = '' }) {
  return openModal({
    title, size,
    body: `${intro}<div class="form-grid">${fields.map(f => fieldHTML(f, values)).join('')}</div>`,
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: submitLabel, cls: 'primary big', submit: true }],
    onOpen: form => {
      fields.forEach(f => {
        if (!f.onInput) return;
        const els = $$(`[name="${f.name}"]`, form);
        els.forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => f.onInput(form.elements, form)));
      });
    },
    onSubmit: async form => onSubmit(readForm(form, fields), form)
  });
}

function confirmModal(msg, { ok = 'Confirmar', cls = 'primary', title = 'Confirmar' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal({
      title, body: `<p style="font-size:1.05rem">${msg}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: (f, close) => { done = true; close(); resolve(false); } },
        { label: ok, cls: cls + ' big', onClick: (f, close) => { done = true; close(); resolve(true); } }
      ]
    });
    new MutationObserver((_, obs) => { if (!document.body.contains(m.node)) { obs.disconnect(); if (!done) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

/* ---------- Teclado numérico (login e PIN Master) ---------- */
function mountKeypad(el, { onSubmit, maxLen = 6, okLabel = 'Entrar' }) {
  let pin = '';
  el.innerHTML = `<div class="keypad">
    <div class="pin-dots">${Array.from({ length: maxLen }, () => '<span></span>').join('')}</div>
    <div class="keys">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="key" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="key alt" data-k="del">⌫ Apagar</button>
      <button type="button" class="key" data-k="0">0</button>
      <button type="button" class="key ok" data-k="ok">✔ ${esc(okLabel)}</button>
    </div></div>`;
  const dots = $('.pin-dots', el);
  const paint = () => $$('span', dots).forEach((s, i) => s.classList.toggle('on', i < pin.length));
  const api = {
    reset(shake) {
      pin = ''; paint();
      if (shake) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
    }
  };
  const press = k => {
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') { if (pin.length >= 4) onSubmit(pin, api); return; }
    else if (pin.length < maxLen) pin += k;
    paint();
    if (pin.length === maxLen) onSubmit(pin, api);
  };
  el.onclick = e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
  api.key = press;
  return api;
}

let activeKeypad = null; // recebe o teclado físico
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const top = $$('body > .modal:not([hidden])').pop();
    if (top) { top.id === 'pin-modal' ? $('[data-pin-cancel]').click() : top.id === 'receipt-modal' ? closeReceipt() : top.remove(); }
    return;
  }
  if (!activeKeypad || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (/^\d$/.test(e.key)) activeKeypad.key(e.key);
  else if (e.key === 'Backspace') activeKeypad.key('del');
  else if (e.key === 'Enter') activeKeypad.key('ok');
});

/** Abre o modal de PIN e resolve com o PIN digitado (ou null se cancelado). */
function askPin(title = 'Autorização Master', sub = 'Peça para o dono digitar a senha.') {
  return new Promise(resolve => {
    const modal = $('#pin-modal');
    $('#pin-title').textContent = title;
    $('#pin-sub').textContent = sub;
    modal.hidden = false;
    const prev = activeKeypad;
    const finish = v => { modal.hidden = true; activeKeypad = prev; resolve(v); };
    activeKeypad = mountKeypad($('#pin-keypad'), { okLabel: 'OK', onSubmit: pin => finish(pin) });
    $('[data-pin-cancel]', modal).onclick = () => finish(null);
  });
}

/** Pede o PIN Master e devolve token de autorização de desconto. */
async function askMasterAuth(motivo) {
  const pin = await askPin('Autorização Master', motivo || 'Desconto abaixo do preço cadastrado. Peça ao dono para digitar a senha.');
  if (!pin) return null;
  try {
    const auth = await Api.validarPin(pin);
    toast('Desconto autorizado ✔', 'ok');
    return auth;
  } catch (e) { toast(e.message, 'danger'); return null; }
}

/* ---------- Recibos e impressão ---------- */
function receiptHTML({ titulo, id, data, cliente: cli, operador, itens = [], total, extras = [], obs }) {
  const e = empresa();
  return `<div class="rcpt">
    <img src="logo-recibo.png" class="rcpt-logo" alt="">
    <div class="rcpt-c"><strong>${esc(e.nome)}</strong>${e.doc ? `<br>${esc(e.doc)}` : ''}${e.end ? `<br>${esc(e.end)}` : ''}${e.tel ? `<br>${esc(e.tel)}` : ''}</div>
    <div class="rcpt-sep"></div>
    <div class="rcpt-c"><strong>${esc(titulo)}</strong></div>
    ${id ? `<div>Nº ${esc(id)}</div>` : ''}
    <div>Data: ${fmtDate(data || isoDT())}</div>
    ${cli ? `<div>Cliente: ${esc(cli)}</div>` : ''}
    ${operador ? `<div>Atendente: ${esc(operador)}</div>` : ''}
    <div class="rcpt-sep"></div>
    <table>${itens.map(([d, q, v]) => `<tr><td>${q != null && q !== '' ? esc(q) + 'x ' : ''}${esc(d)}</td><td class="r">${money(v)}</td></tr>`).join('')}</table>
    <div class="rcpt-sep"></div>
    <div class="rcpt-total"><span>TOTAL</span><span>${money(total)}</span></div>
    ${extras.map(([l, v]) => `<div class="rcpt-row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`).join('')}
    ${obs ? `<div class="rcpt-sep"></div><div>${esc(obs)}</div>` : ''}
    <div class="rcpt-sep"></div>
    <div class="rcpt-c rcpt-foot">Obrigado pela preferência!<br>Documento sem valor fiscal</div>
  </div>`;
}

function reportHTML(title, sub, inner, sign = []) {
  const e = empresa();
  return `<div class="report">
    <h2>${esc(e.nome)} — ${esc(title)}</h2>
    <div class="sub">${sub}<br>Emitido em ${fmtDate(isoDT())} por ${esc(S.user?.Nome || '')}</div>
    ${inner}
    ${sign.length ? `<div class="sign">${sign.map(s => `<div>${esc(s)}</div>`).join('')}</div>` : ''}
  </div>`;
}

function showReceipt(html, title = '🧾 Recibo') {
  const m = $('#receipt-modal');
  $('.modal-title', m).textContent = title;
  $('#receipt').innerHTML = html;
  m.hidden = false;
}
function closeReceipt() { $('#receipt-modal').hidden = true; }
function printNow(html) {
  $('#print-area').innerHTML = html;
  const clear = () => { $('#print-area').innerHTML = ''; window.removeEventListener('afterprint', clear); };
  window.addEventListener('afterprint', clear);
  window.print();
}

/* ---------- WhatsApp ---------- */
function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d && !d.startsWith('55')) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
const fillTpl = (tpl, data) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');
function openWA(phone, text) { window.open(waLink(phone, text), '_blank', 'noopener'); }

/* ==========================================================================
   4. LOGIN
   ========================================================================== */
async function showLogin() {
  S.user = null;
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-step-user').hidden = false;
  $('#login-step-pin').hidden = true;
  activeKeypad = null;
  $('#login-mode').textContent = Api.isRemote() ? '☁️ Conectado à planilha' : '💾 Modo local (sem servidor)';
  const list = $('#login-users');
  list.innerHTML = '<div class="spinner"></div>';
  let us;
  try { us = await Api.usuariosLogin(); }
  catch (e) {
    list.innerHTML = `<div class="empty">Não foi possível conectar ao servidor.<br><small>${esc(e.message)}</small><br><br>
      <button type="button" class="btn primary" id="login-retry">Tentar de novo</button></div>`;
    $('#login-retry').onclick = showLogin;
    return;
  }
  if (!us.length) { list.innerHTML = '<div class="empty">Nenhum usuário ativo. Rode setup() na planilha.</div>'; return; }
  list.innerHTML = us.map(u => `<button type="button" class="user-card" data-id="${esc(u.ID)}">
      <span class="avatar">${esc(initials(u.Nome))}</span><strong>${esc(u.Nome)}</strong><small>${esc(u.Nivel)}</small></button>`).join('');
  list.onclick = e => {
    const b = e.target.closest('.user-card');
    if (!b) return;
    const u = us.find(x => same(x.ID, b.dataset.id));
    $('#login-step-user').hidden = true;
    $('#login-step-pin').hidden = false;
    $('#login-name').textContent = 'Olá, ' + u.Nome.split(' ')[0] + '!';
    activeKeypad = mountKeypad($('#login-keypad'), {
      onSubmit: async (pin, kp) => {
        try {
          await Api.login(u.ID, pin);
          enterApp();
        } catch (err) { kp.reset(true); toast(err.message, 'danger'); }
      }
    });
  };
}

function serverConfigModal() {
  const c = Api.getCfg();
  formModal({
    title: '⚙️ Servidor (Google Apps Script)',
    intro: `<p class="muted">Cole a URL da implantação (termina em <b>/exec</b>) e a chave <b>API_SECRET</b> gerada pelo setup(). Deixe em branco para usar o modo local (dados só neste aparelho).</p>`,
    values: c,
    fields: [
      { name: 'url', label: 'URL do App da Web', full: true, placeholder: 'https://script.google.com/macros/s/.../exec' },
      { name: 'k', label: 'Chave de segurança (API_SECRET)', full: true }
    ],
    submitLabel: 'Testar e salvar',
    onSubmit: async d => {
      if (d.url) {
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(d.url)) throw new Error('A URL deve ser do script.google.com.');
        await Api.ping(d.url, d.k);
        toast('Conexão OK ✔', 'ok');
      }
      Api.setCfg(d);
      Api.logout();
      showLogin();
    }
  });
}

function enterApp() {
  const ses = Api.session();
  if (!ses?.user) return showLogin();
  S.user = ses.user;
  if (!Api.isRemote()) {
    const fresh = users().find(u => same(u.ID, S.user.ID));
    if (!fresh || fresh.Status === 'Inativo') { Api.logout(); return showLogin(); }
    const { PIN_Acesso, ...pub } = fresh;
    S.user = pub;
  }
  activeKeypad = null;
  $('#login').hidden = true;
  $('#app').hidden = false;
  buildNav();
  updateSync();
  route();
  if (Api.isRemote()) doSync(true);
  setTimeout(autoBackupTick, 1500);
}

function logout() {
  Api.logout();
  S.cart = { tabacaria: [], celulares: [] };
  S.filters = {};
  location.hash = '';
  showLogin();
}

/* ==========================================================================
   5. NAVEGAÇÃO
   ========================================================================== */
const RENDER = {}; // preenchido nas seções de cada módulo

function buildNav() {
  const mods = allowedModules();
  const item = m => `<a href="#${m}" class="nav-item" data-view="${m}"><span class="nav-ic">${MODULES[m].icon}</span><span>${MODULES[m].label}</span></a>`;
  $('#nav').innerHTML = mods.map(item).join('');
  const quick = mods.slice(0, 4);
  $('#bottom-nav').innerHTML = quick.map(m => `<a href="#${m}" class="nav-item" data-view="${m}"><span class="nav-ic">${MODULES[m].icon}</span><span>${MODULES[m].short}</span></a>`).join('')
    + (mods.length > 4 ? `<button type="button" class="nav-item" data-global="menu"><span class="nav-ic">☰</span><span>Mais</span></button>` : '');
  $('#user-chip').innerHTML = `<span class="avatar">${esc(initials(S.user.Nome))}</span><div><strong>${esc(S.user.Nome)}</strong><small>${esc(S.user.Nivel)}</small></div>`;
  $('#dl-clientes').innerHTML = clientes().map(c => `<option value="${esc(c.Nome)}">`).join('');
}

function route() {
  if (!S.user) return;
  const [v, t] = location.hash.slice(1).split('/');
  const mods = allowedModules();
  const view = mods.includes(v) ? v : 'inicio';
  show(view, t);
}

function show(view, tab) {
  const sec = $('#view-' + view);
  $$('.view').forEach(s => { s.hidden = s !== sec; });
  const tabs = $$('.tab', sec).filter(b => {
    const ok = !b.dataset.roles || b.dataset.roles.split(',').includes(lvl());
    b.hidden = !ok;
    return ok;
  });
  if (tabs.length) {
    const names = tabs.map(b => b.dataset.tab);
    if (!names.includes(tab)) tab = names.includes(S.tabs[view]) ? S.tabs[view] : names[0];
    tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  } else tab = '_';
  S.view = view;
  S.tabs[view] = tab;
  $$('.nav-item[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#topbar-title').textContent = sec.dataset.title;
  document.title = `${sec.dataset.title} · Preto Rico`;
  document.body.classList.remove('menu-open');
  const body = $('.view-body', sec);
  const fn = RENDER[view] && RENDER[view][tab];
  body.onclick = body.onchange = body.oninput = null;
  if (fn) fn(body); else body.innerHTML = '<div class="empty">Em construção.</div>';
}

const refresh = () => { if (S.view) { buildNavLight(); show(S.view, S.tabs[S.view]); } };
function buildNavLight() { $('#dl-clientes').innerHTML = clientes().map(c => `<option value="${esc(c.Nome)}">`).join(''); }
function go(view, tab) {
  const h = '#' + view + (tab ? '/' + tab : '');
  if (location.hash === h) show(view, tab); else location.hash = h;
}

/* ---------- Sincronização ---------- */
function updateSync() {
  const el = $('#sync-status');
  const n = Api.pending();
  el.className = 'sync-pill ' + (!Api.isRemote() ? 'offline' : n ? 'pending' : 'online');
  el.textContent = !Api.isRemote() ? '💾 Local' : n ? `⏳ ${n} pendente(s)` : (navigator.onLine ? '☁️ Online' : '📴 Sem internet');
}

let syncing = false;
async function doSync(silent) {
  if (!Api.isRemote() || syncing) return;
  syncing = true;
  $('#sync-status').textContent = '🔄 Sincronizando...';
  try {
    const r = await Api.sync();
    (r.errors || []).forEach(m => toast('Não sincronizado: ' + m, 'danger'));
    if (!silent) toast('Dados atualizados ✔', 'ok');
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if (!$('body > .modal.dyn, body > .modal:not([id])') && !typing) refresh();
  } catch (e) {
    if (!silent) toast('Sem conexão com o servidor: ' + e.message, 'warn');
  } finally { syncing = false; updateSync(); }
}

/* ==========================================================================
   6. INÍCIO (tela simples com botões grandes)
   ========================================================================== */
RENDER.inicio = { _: renderInicio };

function renderInicio(el) {
  const hoje = isoDate();
  const nome = S.user.Nome.split(' ')[0];
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const mods = allowedModules();
  const tile = (href, ic, title, sub, hero) => `<a class="tile ${hero ? 'hero' : ''}" href="${href}"><span class="tile-ic">${ic}</span><div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div></a>`;
  let tiles = '', resumo = '', alerts = [];

  if (lvl() === 'Barbeiro') {
    const meus = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, S.user.ID) && dayOf(a.DataHora) === hoje);
    const feitos = meus.filter(a => a.Status === 'Concluido');
    const prox = meus.filter(a => a.Status === 'Agendado').sort((a, b) => a.DataHora.localeCompare(b.DataHora));
    tiles = tile('#barbearia/lancar', '✂️', 'Lançar corte', 'Toque e registre o serviço', true)
      + tile('#barbearia/agenda', '📅', 'Agenda', `${prox.length} cliente(s) aguardando hoje`)
      + tile('#barbearia/relatorio', '💵', 'Minha comissão', 'Ver quanto já ganhei');
    resumo = kpi('Cortes hoje', feitos.length, 'gold') + kpi('Minha comissão hoje', money(sum(feitos, 'Comissao_Valor')), 'ok');
    if (prox[0]) alerts.push(['info', '⏰', `Próximo: <b>${esc(prox[0].Nome_Cliente)}</b> às ${timeOf(prox[0].DataHora)} — ${esc(prox[0].Servico)}`]);
  } else if (lvl() === 'Tatuador') {
    const minhas = T('Agenda_Tatuagem').filter(a => same(a.ID_Tatuador, S.user.ID));
    const hojeS = minhas.filter(a => dayOf(a.DataHora) === hoje && a.Status !== 'Cancelado');
    const mes = minhas.filter(a => a.Status === 'Concluido' && monthOf(a.DataHora) === monthOf(hoje));
    tiles = tile('#tatuagem/agenda', '📅', 'Minha agenda', `${hojeS.length} sessão(ões) hoje`, true)
      + tile('#tatuagem/fechamento', '💵', 'Meu fechamento', 'Produção e repasse da sala');
    resumo = kpi('Produzido no mês', money(sum(mes, 'Valor_Total')), 'gold') + kpi('Repasse ao Master', money(sum(mes, 'Comissao_Master')), 'warn');
  } else {
    if (mods.includes('tabacaria')) tiles += tile('#tabacaria/pdv', '🛍️', 'Vender Tabacaria / Roupas', 'Abrir o caixa', true);
    if (mods.includes('celulares')) tiles += tile('#celulares/pdv', '📱', 'Vender Celulares', 'Abrir o caixa', true);
    if (isMaster()) {
      tiles += tile('#barbearia/lancar', '💈', 'Barbearia', 'Lançar cortes e agenda')
        + tile('#tatuagem/agenda', '🖋️', 'Estúdio Tattoo', 'Agenda de sessões')
        + tile('#dashboard', '📊', 'Painel financeiro', 'Faturamento e lucro')
        + tile('#financeiro/contas', '📄', 'Contas a pagar', 'Despesas e vencimentos')
        + tile('#financeiro/ofx', '🏦', 'Conciliação bancária', 'Importar extrato OFX')
        + tile('#usuarios', '🔐', 'Usuários', 'Acessos e senhas');
    } else {
      if (mods.includes('tabacaria')) tiles += tile('#tabacaria/crediario', '📒', 'Fiado Tabacaria', 'Receber de clientes');
      if (mods.includes('celulares')) tiles += tile('#celulares/crediario', '📒', 'Fiado Celulares', 'Receber de clientes');
      if (mods.includes('tabacaria')) tiles += tile('#tabacaria/estoque', '📦', 'Ver estoque', 'O que tem na loja');
      if (mods.includes('clientes')) tiles += tile('#clientes', '👥', 'Clientes', 'Cadastrar cliente');
    }
    const vendasHoje = T('Vendas_PDV').filter(v => dayOf(v.DataHora) === hoje && (isMaster() || same(v.ID_Usuario, S.user.ID)));
    resumo = kpi(isMaster() ? 'Vendas das lojas hoje' : 'Minhas vendas hoje', money(sum(vendasHoje, 'Total_Venda')), 'gold', `${vendasHoje.length} venda(s)`);
    if (isMaster()) {
      const d = computeFinance(hoje, hoje, '');
      resumo += kpi('Faturamento hoje', money(d.bruto), 'ok') + kpi('Lucro hoje', money(d.lucro), d.lucro >= 0 ? 'ok' : 'danger');
      const crit = T('Estoque').filter(p => stockLevel(p) === 'danger');
      if (crit.length) alerts.push(['danger', '📦', `<b>${crit.length}</b> produto(s) com estoque crítico. <a href="#tabacaria/reposicao">Ver reposição</a>`]);
      const venc = T('Financeiro_Contas').filter(c => c.Status !== 'Pago' && c.Vencimento && c.Vencimento <= hoje);
      if (venc.length) alerts.push(['danger', '📄', `<b>${venc.length}</b> conta(s) vencida(s) ou vencendo hoje: ${money(sum(venc, 'Valor'))}. <a href="#financeiro/contas">Abrir</a>`]);
      const atras = T('Clientes').filter(c => c.Tipo === 'Mensalista' && statusMensal(c) === 'Atrasado');
      if (atras.length) alerts.push(['warn', '⭐', `<b>${atras.length}</b> mensalista(s) em atraso. <a href="#barbearia/mensalistas">Cobrar no WhatsApp</a>`]);
    } else {
      const low = T('Estoque').filter(p => stockLevel(p) !== 'ok');
      if (low.length) alerts.push(['warn', '📦', `<b>${low.length}</b> produto(s) acabando. Avise o dono.`]);
    }
  }
  if (Api.pending()) alerts.push(['warn', '⏳', `${Api.pending()} lançamento(s) aguardando internet para sincronizar.`]);
  if (!alerts.length) alerts.push(['ok', '✅', 'Tudo em ordem por aqui!']);

  el.innerHTML = `
    <div class="hello"><span class="avatar">${esc(initials(S.user.Nome))}</span>
      <div><h1>${saud}, ${esc(nome)}!</h1><p>O que você quer fazer agora?</p></div></div>
    <div class="tiles">${tiles}</div>
    <div class="kpis">${resumo}</div>
    <div class="alerts">${alerts.map(([t, ic, m]) => `<div class="alert ${t}"><span class="ic">${ic}</span><div>${m}</div></div>`).join('')}</div>`;
}

/* ==========================================================================
   7. DASHBOARD FINANCEIRO (MASTER)
   ========================================================================== */
RENDER.dashboard = { _: renderDashboard };

/** Consolida faturamento, custos, comissões, despesas e lucro do período. */
function computeFinance(de, ate, act) {
  const acts = { Barbearia: 0, Tabacaria: 0, Celulares: 0, Tatuagem: 0 };
  let bruto = 0, cmv = 0, comissoes = 0;
  const want = a => !act || act === a;
  T('Vendas_PDV').filter(v => inRange(v.DataHora, de, ate) && want(v.Atividade)).forEach(v => {
    bruto += num(v.Total_Venda); cmv += num(v.Preco_Custo_Total); acts[v.Atividade] = (acts[v.Atividade] || 0) + num(v.Total_Venda);
  });
  if (want('Barbearia')) {
    T('Agenda_Barbearia').filter(a => a.Status === 'Concluido' && inRange(a.DataHora, de, ate)).forEach(a => {
      bruto += num(a.Valor); comissoes += num(a.Comissao_Valor); acts.Barbearia += num(a.Valor);
    });
    T('Recebimentos').filter(r => r.Tipo === 'Mensalidade' && inRange(r.DataHora, de, ate)).forEach(r => { bruto += num(r.Valor); acts.Barbearia += num(r.Valor); });
  }
  if (want('Tatuagem')) {
    T('Agenda_Tatuagem').filter(a => a.Status === 'Concluido' && inRange(a.DataHora, de, ate)).forEach(a => {
      bruto += num(a.Valor_Total); comissoes += num(a.Valor_Total) - num(a.Comissao_Master); acts.Tatuagem += num(a.Valor_Total);
    });
  }
  const despesas = sum(T('Financeiro_Contas').filter(c => c.Status === 'Pago' && inRange(c.Data_Pagamento, de, ate) && (!act || c.Categoria === act)), 'Valor');
  const lucro = bruto - cmv - comissoes - despesas;
  return { bruto, cmv, comissoes, despesas, lucro, margem: bruto ? lucro / bruto * 100 : 0, acts };
}

function renderDashboard(el) {
  const f = S.filters.dash ||= { de: monthStart(), ate: isoDate(), act: '' };
  const d = computeFinance(f.de, f.ate, f.act);
  // últimos 14 dias
  const dias = Array.from({ length: 14 }, (_, i) => addDays(isoDate(), i - 13));
  const serie = dias.map(x => computeFinance(x, x, f.act).bruto);
  const max = Math.max(1, ...serie);
  const actMax = Math.max(1, ...Object.values(d.acts));
  const hoje = isoDate();
  const vencidas = T('Financeiro_Contas').filter(c => c.Status !== 'Pago' && c.Vencimento && c.Vencimento <= addDays(hoje, 7));
  const crit = T('Estoque').filter(p => stockLevel(p) !== 'ok');

  el.innerHTML = periodBar(f, `<label>Atividade<select data-f="act">${opts([['', 'Todas'], ...Object.entries(ACT_LABEL)], f.act)}</select></label>`)
    + `<div class="kpis">
      ${kpi('Faturamento bruto', money(d.bruto), 'gold')}
      ${kpi('Custo das mercadorias', money(d.cmv), 'warn')}
      ${kpi('Comissões / repasses', money(d.comissoes), 'info')}
      ${kpi('Despesas pagas', money(d.despesas), 'danger')}
      ${kpi('Lucro líquido', money(d.lucro), d.lucro >= 0 ? 'ok' : 'danger', 'Margem ' + pct(d.margem))}
    </div>
    <div class="grid-2">
      <div class="card"><h3>📈 Faturamento — últimos 14 dias</h3>
        <div class="bars">${serie.map((v, i) => `<div class="bar" title="${fmtDate(dias[i])}: ${money(v)}"><i style="height:${(v / max * 100).toFixed(1)}%"></i><small>${dias[i].slice(8)}</small></div>`).join('')}</div>
      </div>
      <div class="card"><h3>🏪 Faturamento por atividade</h3>
        ${Object.entries(d.acts).map(([a, v]) => `<div class="hbar"><span>${esc(ACT_LABEL[a] || a)}</span><div class="track"><div class="fill" style="width:${(v / actMax * 100).toFixed(1)}%"></div></div><b>${money(v)}</b></div>`).join('')}
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><h3>📄 Contas vencidas / próximos 7 dias</h3><a class="btn small" href="#financeiro/contas">Abrir</a></div>
        ${table([
          { label: 'Vencimento', html: c => `<span class="${c.Vencimento < hoje ? 't-danger' : ''}">${fmtDate(c.Vencimento)}</span>` },
          { label: 'Descrição', html: c => esc(c.Descricao) },
          { label: 'Valor', cls: 'right', html: c => money(c.Valor) }
        ], vencidas.sort((a, b) => a.Vencimento.localeCompare(b.Vencimento)), { empty: 'Nenhuma conta para os próximos dias 🎉' })}
      </div>
      <div class="card"><div class="card-head"><h3>📦 Estoque baixo / crítico</h3><a class="btn small" href="#tabacaria/reposicao">Reposição</a></div>
        ${table([
          { label: 'Produto', html: p => esc(p.Produto) },
          { label: 'Loja', html: p => esc(ACT_LABEL[p.Atividade] || p.Atividade) },
          { label: 'Qtd', cls: 'right', html: p => `${num(p.Qtd)} / mín ${num(p.Minimo)}` },
          { label: 'Status', html: p => stockBadge(p) }
        ], crit, { empty: 'Estoque em dia ✔' })}
      </div>
    </div>`;
  bind(el, periodActs(f, () => renderDashboard(el)));
  bindFilters(el, f, () => renderDashboard(el));
}

/* ==========================================================================
   8. BARBEARIA
   ========================================================================== */
RENDER.barbearia = {
  lancar: barbLancar, agenda: barbAgenda, mensalistas: barbMensalistas,
  relatorio: barbRelatorio, servicos: barbServicos
};

const canEditBarb = a => isMaster() || same(a.ID_Barbeiro, S.user.ID);

async function saveAgBarb(row) {
  const s = servicos().find(x => x.nome === row.Servico);
  const pctCom = s ? num(s.comissao) : num(cfgVal('comissao_barbeiro_padrao', 50));
  row.ID = row.ID || uid('AB');
  row.Comissao_Valor = r2(num(row.Valor) * pctCom / 100);
  await Api.exec('salvarAgendamento', { tipo: 'barbearia', row });
}

function clienteFields(extraOnPick) {
  return [
    {
      name: 'ID_Cliente', label: 'Cliente cadastrado', type: 'select',
      options: [['', '— Cliente avulso —'], ...clientes().map(c => [c.ID, c.Nome])],
      onInput: els => { const c = cliente(els.ID_Cliente.value); if (c) { els.Nome_Cliente.value = c.Nome; extraOnPick && extraOnPick(c, els); } }
    },
    { name: 'Nome_Cliente', label: 'Nome do cliente', required: true, list: 'dl-clientes' }
  ];
}

function agendaBarbForm(row = {}) {
  const isBarb = lvl() === 'Barbeiro';
  const servs = servicos();
  const barbers = isBarb ? [S.user] : profs('Barbeiro');
  if (!barbers.length) return toast('Cadastre um barbeiro em Usuários primeiro.', 'warn');
  formModal({
    title: row.ID ? '✏️ Editar agendamento' : '📅 Novo agendamento',
    values: { Status: 'Agendado', Servico: servs[0]?.nome, Valor: servs[0]?.preco, ...row, ID_Barbeiro: row.ID_Barbeiro || barbers[0].ID },
    fields: [
      { name: 'DataHora', label: 'Dia e hora', type: 'datetime-local', required: true },
      { name: 'ID_Barbeiro', label: 'Barbeiro', type: 'select', options: barbers.map(u => [u.ID, u.Nome]), required: true },
      ...clienteFields(),
      { name: 'Servico', label: 'Serviço', type: 'select', options: servs.map(s => s.nome), required: true,
        onInput: els => { const s = servs.find(x => x.nome === els.Servico.value); if (s) els.Valor.value = s.preco; } },
      { name: 'Valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true, inputmode: 'decimal' },
      { name: 'Status', label: 'Situação', type: 'select', options: ['Agendado', 'Concluido', 'Cancelado'] }
    ],
    onSubmit: async d => {
      await saveAgBarb({ ...row, ...d });
      toast('Agendamento salvo ✔', 'ok');
      refresh();
    }
  });
}

function barbReceipt(a) {
  showReceipt(receiptHTML({
    titulo: 'RECIBO — BARBEARIA', id: a.ID, data: a.DataHora, cliente: a.Nome_Cliente,
    operador: userName(a.ID_Barbeiro), itens: [[a.Servico, 1, a.Valor]], total: a.Valor
  }));
}

async function setAgStatus(tipo, a, status) {
  const ok = await run(() => Api.exec('salvarAgendamento', { tipo, row: { ...a, Status: status } }), status === 'Concluido' ? 'Serviço concluído ✔' : 'Atualizado');
  if (ok) refresh();
}

function agendaItem(a, tipo) {
  const bar = tipo === 'barbearia';
  const edit = bar ? canEditBarb(a) : (isMaster() || same(a.ID_Tatuador, S.user.ID));
  const c = cliente(a.ID_Cliente);
  return `<div class="ag-item ${esc(a.Status)}">
    <div class="ag-time">${timeOf(a.DataHora)}</div>
    <div>
      <div class="ag-title">${esc(a.Nome_Cliente)} ${sBadge(a.Status)}</div>
      <div class="ag-meta">${bar ? `${esc(a.Servico)} · ${esc(userName(a.ID_Barbeiro))} · <b>${money(a.Valor)}</b>`
        : `${esc(a.Descricao_Servico)} · ${esc(userName(a.ID_Tatuador))} · <b>${money(a.Valor_Total)}</b> · Master ${money(a.Comissao_Master)}`}</div>
      <div class="ag-actions">
        ${edit && a.Status === 'Agendado' ? `<button type="button" class="btn small ok" data-act="concluir" data-id="${esc(a.ID)}">✔ Concluir</button>` : ''}
        ${edit && a.Status === 'Agendado' ? `<button type="button" class="btn small ghost" data-act="cancelar" data-id="${esc(a.ID)}">✕ Cancelar</button>` : ''}
        ${edit ? `<button type="button" class="btn small ghost" data-act="editar" data-id="${esc(a.ID)}">✏️ Editar</button>` : ''}
        ${a.Status === 'Concluido' ? `<button type="button" class="btn small ghost" data-act="recibo" data-id="${esc(a.ID)}">🧾 Recibo</button>` : ''}
        ${c?.Telefone_WhatsApp && a.Status === 'Agendado' ? `<button type="button" class="btn small wa" data-act="wa" data-id="${esc(a.ID)}">WhatsApp</button>` : ''}
      </div>
    </div></div>`;
}

function calendar(month, sel, counts) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const today = isoDate();
  let cells = '';
  for (let i = 0; i < start; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${pad(d)}`;
    const n = counts[ds] || 0;
    cells += `<button type="button" class="cal-cell ${ds === sel ? 'sel' : ''} ${ds === today ? 'today' : ''}" data-act="day" data-day="${ds}">${d}${n ? `<em>${n}</em>` : ''}</button>`;
  }
  return `<div class="cal"><div class="cal-head">
      <button type="button" class="icon-btn" data-act="prev">‹</button><strong>${fmtMonth(month)}</strong>
      <button type="button" class="icon-btn" data-act="next">›</button></div>
    <div class="cal-grid">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div></div>`;
}

function barbAgenda(el) {
  const st = S.cal.barb ||= { month: monthOf(isoDate()), day: isoDate(), barb: lvl() === 'Barbeiro' ? S.user.ID : '' };
  const all = T('Agenda_Barbearia').filter(a => !st.barb || same(a.ID_Barbeiro, st.barb));
  const counts = {};
  all.filter(a => a.Status !== 'Cancelado').forEach(a => { const d = dayOf(a.DataHora); counts[d] = (counts[d] || 0) + 1; });
  const list = all.filter(a => dayOf(a.DataHora) === st.day).sort((a, b) => String(a.DataHora).localeCompare(b.DataHora));
  const rerender = () => barbAgenda(el);
  el.innerHTML = `<div class="toolbar">
      <button type="button" class="btn primary big" data-act="novo">➕ Agendar cliente</button>
      <label>Barbeiro<select data-f="barb">${opts([['', 'Todos'], ...profs('Barbeiro').map(u => [u.ID, u.Nome])], st.barb)}</select></label>
    </div>
    <div class="split">
      <div class="card">${calendar(st.month, st.day, counts)}</div>
      <div class="card"><div class="card-head"><h3>${fmtDate(st.day)} — ${list.length} horário(s)</h3>
        <span class="muted">${money(sum(list.filter(a => a.Status !== 'Cancelado'), 'Valor'))}</span></div>
        <div class="ag-list">${list.map(a => agendaItem(a, 'barbearia')).join('') || '<div class="empty">Nenhum horário neste dia.</div>'}</div>
      </div>
    </div>`;
  const find = id => T('Agenda_Barbearia').find(a => same(a.ID, id));
  bind(el, {
    prev: () => { st.month = addMonth(st.month, -1); rerender(); },
    next: () => { st.month = addMonth(st.month, 1); rerender(); },
    day: d => { st.day = d.day; rerender(); },
    novo: () => agendaBarbForm({ DataHora: st.day + 'T' + pad(Math.min(20, Math.max(9, new Date().getHours() + 1))) + ':00' }),
    editar: d => agendaBarbForm(find(d.id)),
    concluir: d => setAgStatus('barbearia', find(d.id), 'Concluido'),
    cancelar: async d => { if (await confirmModal('Cancelar este horário?', { ok: 'Sim, cancelar', cls: 'danger' })) setAgStatus('barbearia', find(d.id), 'Cancelado'); },
    recibo: d => barbReceipt(find(d.id)),
    wa: d => {
      const a = find(d.id), c = cliente(a.ID_Cliente);
      openWA(c?.Telefone_WhatsApp, `Olá ${a.Nome_Cliente}! 💈 Confirmando seu horário na Preto Rico: ${fmtDate(a.DataHora)} — ${a.Servico}. Até lá!`);
    }
  });
  bindFilters(el, st, rerender);
}

function barbLancar(el) {
  const isBarb = lvl() === 'Barbeiro';
  const barbers = isBarb ? [S.user] : profs('Barbeiro');
  const st = S.filters.lancar ||= { barb: '', cliente: '' };
  if (isBarb) st.barb = S.user.ID;
  if (!st.barb && barbers[0]) st.barb = barbers[0].ID;
  const hoje = isoDate();
  const cortes = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, st.barb) && dayOf(a.DataHora) === hoje && a.Status === 'Concluido')
    .sort((a, b) => String(b.DataHora).localeCompare(a.DataHora));
  const espera = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, st.barb) && dayOf(a.DataHora) === hoje && a.Status === 'Agendado');

  el.innerHTML = `
    <div class="kpis">${kpi('Cortes hoje', cortes.length, 'gold')}${kpi('Produzido hoje', money(sum(cortes, 'Valor')))}${kpi(isBarb ? 'Minha comissão hoje' : 'Comissão do barbeiro', money(sum(cortes, 'Comissao_Valor')), 'ok')}</div>
    <div class="card">
      <h3>1️⃣ Quem atendeu e qual cliente?</h3>
      <div class="form-inline">
        ${!isBarb ? `<label>Barbeiro<select id="lc-barb">${opts(barbers.map(b => [b.ID, b.Nome]), st.barb)}</select></label>` : ''}
        <label>Nome do cliente (opcional)<input id="lc-cli" list="dl-clientes" value="${esc(st.cliente)}" placeholder="Ex.: João da Silva"></label>
      </div>
      <h3>2️⃣ Toque no serviço feito</h3>
      <div class="service-grid">${servicos().map((s, i) => `<button type="button" class="service-btn" data-act="lancar" data-i="${i}">
        <strong>${esc(s.nome)}</strong><span>${money(s.preco)}</span><small>Comissão ${num(s.comissao)}% = ${money(num(s.preco) * num(s.comissao) / 100)}</small></button>`).join('')}</div>
    </div>
    ${espera.length ? `<div class="card"><h3>⏰ Clientes agendados hoje</h3><div class="ag-list">${espera.map(a => agendaItem(a, 'barbearia')).join('')}</div></div>` : ''}
    <div class="card"><h3>✅ Lançados hoje</h3>
      ${table([
        { label: 'Hora', html: a => timeOf(a.DataHora) },
        { label: 'Cliente', html: a => esc(a.Nome_Cliente) },
        { label: 'Serviço', html: a => esc(a.Servico) },
        { label: 'Valor', cls: 'right', html: a => money(a.Valor) },
        { label: 'Comissão', cls: 'right', html: a => money(a.Comissao_Valor) },
        { label: '', cls: 'actions', html: a => `<button type="button" class="btn small ghost" data-act="recibo" data-id="${esc(a.ID)}">🧾</button><button type="button" class="btn small danger-ghost" data-act="desfazer" data-id="${esc(a.ID)}">Desfazer</button>` }
      ], cortes, { empty: 'Nenhum corte lançado hoje ainda.' })}
    </div>`;

  el.onchange = e => { if (e.target.id === 'lc-barb') { st.barb = e.target.value; barbLancar(el); } };
  el.oninput = e => { if (e.target.id === 'lc-cli') st.cliente = e.target.value; };
  const find = id => T('Agenda_Barbearia').find(a => same(a.ID, id));
  bind(el, {
    lancar: async (d, btn) => {
      const s = servicos()[d.i];
      if (!st.barb) return toast('Escolha o barbeiro.', 'warn');
      const nome = st.cliente.trim() || 'Cliente balcão';
      const c = T('Clientes').find(x => norm(x.Nome) === norm(nome));
      btn.disabled = true;
      const ok = await run(() => saveAgBarb({ DataHora: isoDT(), ID_Barbeiro: st.barb, ID_Cliente: c?.ID || '', Nome_Cliente: c?.Nome || nome, Servico: s.nome, Valor: s.preco, Status: 'Concluido' }),
        `✔ ${s.nome} lançado para ${c?.Nome || nome}`);
      if (ok) { st.cliente = ''; barbLancar(el); } else btn.disabled = false;
    },
    recibo: d => barbReceipt(find(d.id)),
    desfazer: async d => {
      if (await confirmModal('Desfazer este lançamento? Ele ficará como cancelado.', { ok: 'Desfazer', cls: 'danger' })) setAgStatus('barbearia', find(d.id), 'Cancelado');
    },
    concluir: d => setAgStatus('barbearia', find(d.id), 'Concluido'),
    cancelar: d => setAgStatus('barbearia', find(d.id), 'Cancelado'),
    editar: d => agendaBarbForm(find(d.id)),
    wa: d => { const a = find(d.id); openWA(cliente(a.ID_Cliente)?.Telefone_WhatsApp, `Olá ${a.Nome_Cliente}! Estamos te esperando na Preto Rico 💈`); }
  });
}

/* ---------- Mensalistas ---------- */
function statusMensal(c) {
  if (monthOf(c.Ultimo_Pagamento) >= monthOf(isoDate())) return 'Em dia';
  return new Date().getDate() > num(c.Dia_Vencimento || 10) ? 'Atrasado' : 'Pendente';
}
const MSG_MENSAL = 'Olá {nome}! 💈 Aqui é da Preto Rico. Passando para lembrar que sua mensalidade de {valor} vence no dia {dia}. Pode pagar por Pix ou direto no balcão. Obrigado!';
const MSG_ATRASO = 'Olá {nome}! 💈 Aqui é da Preto Rico. Sua mensalidade de {valor} (vencimento dia {dia}) está em aberto. Consegue acertar hoje? Qualquer dúvida é só chamar!';

function clienteForm(row = {}, defaults = {}) {
  const fields = [
    { name: 'Nome', label: 'Nome completo', required: true, full: true },
    { name: 'Telefone_WhatsApp', label: 'WhatsApp (com DDD)', type: 'tel', placeholder: '(11) 99999-9999', inputmode: 'tel' },
    { name: 'Tipo', label: 'Tipo de cliente', type: 'select', options: ['Avulso', 'Mensalista', 'Crediario'] },
    { name: 'Atividade_Origem', label: 'Onde é cliente', type: 'select', options: Object.keys(ACT_LABEL).map(a => [a, ACT_LABEL[a]]) },
    { name: 'Valor_Mensalidade', label: 'Valor da mensalidade (R$)', type: 'number', step: '0.01', min: 0, inputmode: 'decimal' },
    { name: 'Dia_Vencimento', label: 'Dia do vencimento', type: 'number', min: 1, max: 31 }
  ];
  formModal({
    title: row.ID ? '✏️ Editar cliente' : '👤 Novo cliente',
    values: { Tipo: 'Avulso', Atividade_Origem: 'Barbearia', Dia_Vencimento: 10, ...defaults, ...row },
    fields,
    onSubmit: async d => {
      const r = { ...row, ...d, ID: row.ID || uid('C') };
      if (r.Tipo === 'Mensalista' && !num(r.Valor_Mensalidade)) throw new Error('Informe o valor da mensalidade.');
      await Api.exec('upsert', { table: 'Clientes', row: r });
      toast('Cliente salvo ✔', 'ok');
      refresh();
    }
  });
}

function pagarMensalidade(c) {
  formModal({
    title: `💵 Receber mensalidade — ${c.Nome}`,
    values: { Valor: c.Valor_Mensalidade, Forma_Pagamento: 'Pix', Data: isoDate() },
    fields: [
      { name: 'Valor', label: 'Valor recebido (R$)', type: 'number', step: '0.01', min: 0.01, required: true, inputmode: 'decimal' },
      { name: 'Forma_Pagamento', label: 'Forma de pagamento', type: 'select', options: PAY.filter(p => p.id !== 'Crediario').map(p => [p.id, p.label]) },
      { name: 'Data', label: 'Data do pagamento', type: 'date', required: true }
    ],
    submitLabel: 'Confirmar pagamento',
    onSubmit: async d => {
      const row = {
        ID: uid('RC'), DataHora: d.Data + 'T' + timeOf(isoDT()), Tipo: 'Mensalidade', ID_Cliente: c.ID, Nome_Cliente: c.Nome,
        Atividade: 'Barbearia', Valor: d.Valor, Forma_Pagamento: d.Forma_Pagamento, ID_Usuario: S.user.ID, Referencia: monthOf(d.Data)
      };
      await Api.exec('registrarRecebimento', { row });
      toast('Mensalidade registrada ✔', 'ok');
      refresh();
      showReceipt(receiptHTML({ titulo: 'RECIBO — MENSALIDADE', id: row.ID, data: row.DataHora, cliente: c.Nome, operador: S.user.Nome,
        itens: [[`Mensalidade ${fmtMonth(row.Referencia)}`, '', row.Valor]], total: row.Valor, extras: [['Pagamento', payLabel(row.Forma_Pagamento)]] }));
    }
  });
}

function barbMensalistas(el) {
  const f = S.filters.mens ||= { st: '' };
  const all = T('Clientes').filter(c => c.Tipo === 'Mensalista').map(c => ({ ...c, _st: statusMensal(c) }));
  const rows = all.filter(c => !f.st || c._st === f.st).sort((a, b) => num(a.Dia_Vencimento) - num(b.Dia_Vencimento));
  const by = s => all.filter(c => c._st === s);
  el.innerHTML = `<div class="kpis">
      ${kpi('Mensalistas', all.length, 'gold')}
      ${kpi('Em dia', by('Em dia').length, 'ok', money(sum(by('Em dia'), 'Valor_Mensalidade')))}
      ${kpi('A vencer', by('Pendente').length, 'warn', money(sum(by('Pendente'), 'Valor_Mensalidade')))}
      ${kpi('Atrasados', by('Atrasado').length, 'danger', money(sum(by('Atrasado'), 'Valor_Mensalidade')))}
    </div>
    <div class="toolbar">
      <button type="button" class="btn primary" data-act="novo">➕ Novo mensalista</button>
      <label>Situação<select data-f="st">${opts([['', 'Todos'], ['Em dia', 'Em dia'], ['Pendente', 'A vencer'], ['Atrasado', 'Atrasado']], f.st)}</select></label>
    </div>
    ${table([
      { label: 'Cliente', html: c => `<b>${esc(c.Nome)}</b>` },
      { label: 'WhatsApp', html: c => esc(c.Telefone_WhatsApp || '—') },
      { label: 'Valor', cls: 'right', html: c => money(c.Valor_Mensalidade) },
      { label: 'Vence dia', cls: 'center', html: c => esc(c.Dia_Vencimento) },
      { label: 'Último pagto.', html: c => fmtDate(c.Ultimo_Pagamento) },
      { label: 'Situação', html: c => badge(c._st === 'Pendente' ? 'A vencer' : c._st, STATUS_TONE[c._st]) },
      { label: '', cls: 'actions', html: c => `
        ${c._st !== 'Em dia' ? `<button type="button" class="btn small ok" data-act="pagar" data-id="${esc(c.ID)}">💵 Recebi</button>` : ''}
        <button type="button" class="btn small wa" data-act="wa" data-id="${esc(c.ID)}">Notificar WhatsApp</button>
        <button type="button" class="btn small ghost" data-act="editar" data-id="${esc(c.ID)}">✏️</button>` }
    ], rows, { empty: 'Nenhum mensalista cadastrado.' })}`;
  bind(el, {
    novo: () => clienteForm({}, { Tipo: 'Mensalista', Atividade_Origem: 'Barbearia' }),
    editar: d => clienteForm(cliente(d.id)),
    pagar: d => pagarMensalidade(cliente(d.id)),
    wa: d => {
      const c = cliente(d.id);
      if (!c.Telefone_WhatsApp) return toast('Cliente sem WhatsApp cadastrado.', 'warn');
      const st = statusMensal(c);
      const tpl = st === 'Atrasado' ? cfgVal('msg_atraso', MSG_ATRASO) : cfgVal('msg_mensalidade', MSG_MENSAL);
      openWA(c.Telefone_WhatsApp, fillTpl(tpl, { nome: c.Nome.split(' ')[0], valor: money(c.Valor_Mensalidade), dia: c.Dia_Vencimento, status: st }));
    }
  });
  bindFilters(el, f, () => barbMensalistas(el));
}

/* ---------- Relatório de comissões da barbearia ---------- */
function barbRelatorio(el) {
  const isBarb = lvl() === 'Barbeiro';
  const f = S.filters.barbRel ||= { de: monthStart(), ate: isoDate(), barb: '' };
  if (isBarb) f.barb = S.user.ID;
  const rows = T('Agenda_Barbearia').filter(a => a.Status === 'Concluido' && inRange(a.DataHora, f.de, f.ate) && (!f.barb || same(a.ID_Barbeiro, f.barb)));
  const porBarb = groupBy(rows, a => a.ID_Barbeiro);
  const rerender = () => barbRelatorio(el);
  const blocks = Object.entries(porBarb).map(([id, list]) => {
    const porServ = Object.entries(groupBy(list, a => a.Servico)).map(([s, l]) => ({ s, q: l.length, tot: sum(l, 'Valor'), com: sum(l, 'Comissao_Valor') }));
    const tot = sum(list, 'Valor'), com = sum(list, 'Comissao_Valor');
    return { id, html: `<div class="card"><div class="card-head"><h3>💈 ${esc(userName(id))}</h3>
        <div class="btn-row"><button type="button" class="btn small" data-act="imprimir" data-id="${esc(id)}">🖨️ Imprimir</button>
        ${isMaster() ? `<button type="button" class="btn small primary" data-act="fechar" data-id="${esc(id)}">Gerar fechamento</button>` : ''}</div></div>
      <div class="kpis">${kpi('Atendimentos', list.length, 'gold')}${kpi('Produzido', money(tot))}${kpi('Comissão', money(com), 'ok')}${isMaster() ? kpi('Fica para a casa', money(tot - com), 'info') : ''}</div>
      ${servTable(porServ, tot, com)}</div>`, list, porServ, tot, com };
  });
  el.innerHTML = periodBar(f, isBarb ? '' : `<label>Barbeiro<select data-f="barb">${opts([['', 'Todos'], ...profs('Barbeiro').map(u => [u.ID, u.Nome])], f.barb)}</select></label>`)
    + (blocks.map(b => b.html).join('') || '<div class="empty">Nenhum serviço concluído no período.</div>');

  bind(el, {
    ...periodActs(f, rerender),
    imprimir: d => {
      const b = blocks.find(x => same(x.id, d.id));
      showReceipt(reportHTML(`Comissões Barbearia — ${userName(d.id)}`, `Período: ${fmtDate(f.de)} a ${fmtDate(f.ate)}`,
        servTable(b.porServ, b.tot, b.com, true) + detailTable(b.list), [userName(d.id), 'Preto Rico']), '🖨️ Relatório de comissão');
    },
    fechar: async d => {
      const b = blocks.find(x => same(x.id, d.id));
      await gerarFechamento({ Data: `${f.de} a ${f.ate}`, ID_Profissional: d.id, Atividade: 'Barbearia', Total_Produzido: r2(b.tot), Valor_Comissao: r2(b.com), Valor_Master: r2(b.tot - b.com) });
    }
  });
  bindFilters(el, f, rerender);
}

function servTable(porServ, tot, com, print) {
  const cols = [
    { label: 'Serviço', html: r => esc(r.s) },
    { label: 'Qtd', cls: 'right', html: r => r.q },
    { label: 'Total', cls: 'right', html: r => money(r.tot) },
    { label: 'Comissão', cls: 'right', html: r => money(r.com) }
  ];
  const foot = footRow([{ html: 'TOTAL' }, { cls: 'right', html: porServ.reduce((s, r) => s + r.q, 0), label: 'Qtd' }, { cls: 'right', html: money(tot), label: 'Total' }, { cls: 'right', html: money(com), label: 'Comissão' }]);
  if (print) return `<table><tr>${cols.map(c => `<th class="${c.cls === 'right' ? 'r' : ''}">${c.label}</th>`).join('')}</tr>${porServ.map(r => `<tr>${cols.map(c => `<td class="${c.cls === 'right' ? 'r' : ''}">${c.html(r)}</td>`).join('')}</tr>`).join('')}<tr><th>TOTAL</th><th class="r">${porServ.reduce((s, r) => s + r.q, 0)}</th><th class="r">${money(tot)}</th><th class="r">${money(com)}</th></tr></table>`;
  return table(cols, porServ, { foot });
}
function detailTable(list) {
  return `<table><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th class="r">Valor</th><th class="r">Comissão</th></tr>${list.slice().sort((a, b) => a.DataHora.localeCompare(b.DataHora))
    .map(a => `<tr><td>${fmtDate(a.DataHora)}</td><td>${esc(a.Nome_Cliente)}</td><td>${esc(a.Servico)}</td><td class="r">${money(a.Valor)}</td><td class="r">${money(a.Comissao_Valor)}</td></tr>`).join('')}</table>`;
}

/** Cria (ou substitui) o fechamento de comissão de um profissional no período. */
async function gerarFechamento(data) {
  const ex = T('Fechamento_Comissoes').find(x => x.Data === data.Data && same(x.ID_Profissional, data.ID_Profissional) && x.Atividade === data.Atividade);
  if (ex && ex.Status_Pagamento === 'Pago') return toast('Este fechamento já foi pago.', 'warn');
  if (ex && !(await confirmModal('Já existe um fechamento para este período. Atualizar com os valores atuais?', { ok: 'Atualizar' }))) return;
  const row = { Status_Pagamento: 'Pendente', ...data, ID: ex?.ID || uid('FC') };
  if (await run(() => Api.exec('gerarFechamento', { rows: [row] }), 'Fechamento gerado ✔ (veja em Financeiro › Fechamentos)')) refresh();
}

/* ---------- Serviços e preços ---------- */
function barbServicos(el) {
  const list = S.filters.servEdit ||= servicos().map(s => ({ ...s }));
  el.innerHTML = `<div class="card"><div class="card-head"><h3>🧾 Serviços, preços e % de comissão do barbeiro</h3></div>
    ${table([
      { label: 'Serviço', html: (s) => `<input data-i="${list.indexOf(s)}" data-k="nome" value="${esc(s.nome)}">` },
      { label: 'Preço (R$)', html: s => `<input type="number" step="0.01" min="0" data-i="${list.indexOf(s)}" data-k="preco" value="${esc(s.preco)}">` },
      { label: 'Comissão (%)', html: s => `<input type="number" step="1" min="0" max="100" data-i="${list.indexOf(s)}" data-k="comissao" value="${esc(s.comissao)}">` },
      { label: '', cls: 'actions', html: s => `<button type="button" class="btn small danger-ghost" data-act="rm" data-i="${list.indexOf(s)}">Remover</button>` }
    ], list, { empty: 'Nenhum serviço.' })}
    <div class="btn-row" style="margin-top:1rem">
      <button type="button" class="btn" data-act="add">➕ Adicionar serviço</button>
      <button type="button" class="btn primary big" data-act="salvar">💾 Salvar tabela</button>
    </div></div>`;
  el.oninput = e => { const i = e.target.dataset.i, k = e.target.dataset.k; if (i != null && k) list[i][k] = k === 'nome' ? e.target.value : num(e.target.value); };
  bind(el, {
    add: () => { list.push({ nome: 'Novo serviço', preco: 0, comissao: 50 }); barbServicos(el); },
    rm: d => { list.splice(Number(d.i), 1); barbServicos(el); },
    salvar: async () => {
      const clean = list.filter(s => String(s.nome).trim()).map(s => ({ nome: String(s.nome).trim(), preco: num(s.preco), comissao: num(s.comissao) }));
      if (await run(() => Api.exec('salvarConfig', { Chave: 'servicos', Valor: clean }), 'Tabela de serviços salva ✔')) { delete S.filters.servEdit; barbServicos(el); }
    }
  });
}

/* ==========================================================================
   9. LOJAS (Tabacaria & Roupas / Celulares & Acessórios) — mesmo motor
   ========================================================================== */
const storeTabs = view => ({
  pdv: el => storePDV(el, view),
  crediario: el => storeCrediario(el, view),
  estoque: el => storeEstoque(el, view),
  reposicao: el => storeReposicao(el, view)
});
RENDER.tabacaria = storeTabs('tabacaria');
RENDER.celulares = storeTabs('celulares');

/** Verde = OK, Amarelo = Baixo (≤ mínimo), Vermelho = Crítico (zerado ou ≤ metade do mínimo). */
function stockLevel(p) {
  const q = num(p.Qtd), m = num(p.Minimo);
  if (q <= 0 || q <= m * 0.5) return 'danger';
  if (q <= m) return 'warn';
  return 'ok';
}
const STOCK_LABEL = { ok: 'OK', warn: 'Baixo', danger: 'Crítico' };
const stockBadge = p => badge(STOCK_LABEL[stockLevel(p)], stockLevel(p));
const produto = id => T('Estoque').find(p => same(p.ID, id));

/* ---------- PDV ---------- */
function storePDV(el, view) {
  const act = STORE_ACT[view];
  const q = S.filters['q_' + view] || '';
  el.innerHTML = `<div class="pdv">
      <div class="card">
        <input class="search" id="pdv-q" type="search" placeholder="🔍 Digite o nome do produto..." value="${esc(q)}" autocomplete="off">
        <div class="prod-grid" id="pdv-results">${prodCards(view, q)}</div>
      </div>
      <div class="card pdv-right" id="pdv-cart">${cartHTML(view)}</div>
    </div>
    <button type="button" class="cart-fab" id="cart-fab" data-act="verCarrinho">${cartFab(view)}</button>
    <div class="card" id="pdv-hoje">${vendasHojeHTML(act)}</div>`;

  el.oninput = e => {
    if (e.target.id === 'pdv-q') {
      S.filters['q_' + view] = e.target.value;
      $('#pdv-results', el).innerHTML = prodCards(view, e.target.value);
    }
  };
  el.onchange = async e => {
    const t = e.target;
    if (t.classList.contains('line-price')) {
      const line = S.cart[view][Number(t.dataset.i)];
      const novo = r2(num(t.value));
      if (novo < line.base - 0.001 && !isMaster() && !line.autorizado) {
        const auth = await askMasterAuth(`"${line.nome}" de ${money(line.base)} por ${money(novo)}. Peça ao dono para digitar a senha.`);
        if (!auth) { t.value = line.price.toFixed(2); return; }
        S.pdvAuth[view] = auth;
        line.autorizado = true;
      }
      line.price = novo;
      renderCart();
    }
    if (t.id === 'pdv-cli') S.cli[view] = t.value;
  };
  const renderCart = () => {
    $('#pdv-cart', el).innerHTML = cartHTML(view);
    $('#cart-fab', el).innerHTML = cartFab(view);
  };

  bind(el, {
    add: d => {
      const p = produto(d.id);
      const cart = S.cart[view];
      const line = cart.find(l => same(l.id, p.ID));
      const qtd = (line?.qty || 0) + 1;
      if (qtd > num(p.Qtd)) return toast(`Só tem ${num(p.Qtd)} unidade(s) de ${p.Produto} no estoque.`, 'warn');
      if (line) line.qty = qtd;
      else cart.push({ id: p.ID, nome: p.Produto, base: num(p.Preco_Venda), price: num(p.Preco_Venda), qty: 1 });
      renderCart();
    },
    inc: d => {
      const l = S.cart[view][d.i];
      if (l.qty + 1 > num(produto(l.id)?.Qtd)) return toast('Quantidade maior que o estoque.', 'warn');
      l.qty++; renderCart();
    },
    dec: d => { const c = S.cart[view]; c[d.i].qty--; if (c[d.i].qty <= 0) c.splice(d.i, 1); renderCart(); },
    rm: d => { S.cart[view].splice(d.i, 1); renderCart(); },
    pay: d => { S.pay[view] = d.pay; renderCart(); },
    limpar: async () => { if (await confirmModal('Limpar o carrinho?', { ok: 'Limpar', cls: 'danger' })) { S.cart[view] = []; S.pdvAuth[view] = ''; renderCart(); } },
    novoCli: () => clienteForm({}, { Tipo: 'Crediario', Atividade_Origem: act }),
    finalizar: (d, btn) => finalizarVenda(view, btn),
    verCarrinho: () => $('#pdv-cart', el).scrollIntoView({ behavior: 'smooth', block: 'start' }),
    recibo: d => vendaReceipt(d.id)
  });
}

/** Botão flutuante (celular) que mostra o total e leva ao carrinho. */
function cartFab(view) {
  const cart = S.cart[view];
  const n = cart.reduce((s, l) => s + l.qty, 0);
  return n ? `🛒 Ver carrinho (${n}) · <b>${money(cart.reduce((s, l) => s + l.qty * l.price, 0))}</b>` : '';
}

function prodCards(view, q) {
  const act = STORE_ACT[view];
  let list = T('Estoque').filter(p => p.Atividade === act);
  if (q) list = list.filter(p => norm(p.Produto).includes(norm(q)));
  list = list.sort((a, b) => String(a.Produto).localeCompare(b.Produto)).slice(0, 60);
  if (!list.length) return `<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado.</div>`;
  return list.map(p => `<button type="button" class="prod" data-act="add" data-id="${esc(p.ID)}" ${num(p.Qtd) <= 0 ? 'disabled' : ''}>
      <span class="dot dot-${stockLevel(p)}"></span>
      <strong>${esc(p.Produto)}</strong>
      <span class="stock">${num(p.Qtd) <= 0 ? 'Sem estoque' : num(p.Qtd) + ' em estoque'}</span>
      <span class="price">${money(p.Preco_Venda)}</span></button>`).join('');
}

function cartHTML(view) {
  const cart = S.cart[view];
  const pay = S.pay[view];
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
  if (!cart.length) return `<h3>🛒 Carrinho</h3><div class="cart-empty"><span>🛒</span>Toque nos produtos ao lado para adicionar.</div>`;
  const cli = clientes();
  return `<h3>🛒 Carrinho</h3>
    ${cart.map((l, i) => `<div class="cart-line">
      <div class="name">${esc(l.nome)}${l.price < l.base ? `<small>Desconto autorizado (de ${money(l.base)})</small>` : ''}</div>
      <b class="right">${money(l.qty * l.price)}</b>
      <div class="qty"><button type="button" data-act="dec" data-i="${i}">−</button><b>${l.qty}</b><button type="button" data-act="inc" data-i="${i}">+</button>
        <button type="button" class="btn small danger-ghost" data-act="rm" data-i="${i}">🗑</button></div>
      <input class="line-price" type="number" step="0.01" min="0" data-i="${i}" value="${l.price.toFixed(2)}" aria-label="Preço unitário" inputmode="decimal">
    </div>`).join('')}
    <div class="cart-total"><span>TOTAL</span><strong>${money(total)}</strong></div>
    <div class="cart-section-title">Como o cliente vai pagar?</div>
    <div class="choice-grid">${PAY.map(p => `<button type="button" class="choice ${pay === p.id ? 'sel' : ''}" data-act="pay" data-pay="${p.id}"><span>${p.icon}</span>${p.label}</button>`).join('')}</div>
    ${pay === 'Crediario' ? `<div class="cart-section-title">Cliente do fiado</div>
      <select id="pdv-cli">${opts([['', '— Escolha o cliente —'], ...cli.map(c => [c.ID, c.Nome])], S.cli[view])}</select>
      <button type="button" class="btn small ghost" data-act="novoCli" style="margin-top:.4rem">➕ Cadastrar cliente</button>` : ''}
    <div class="btn-row" style="margin-top:1rem">
      <button type="button" class="btn ghost" data-act="limpar">Limpar</button>
      <button type="button" class="btn primary big" style="flex:1" data-act="finalizar">✔ Finalizar venda</button>
    </div>`;
}

async function finalizarVenda(view, btn) {
  const cart = S.cart[view];
  if (!cart.length) return toast('O carrinho está vazio.', 'warn');
  const pay = S.pay[view];
  const cliId = pay === 'Crediario' ? S.cli[view] : '';
  if (pay === 'Crediario' && !cliId) return toast('Escolha o cliente do fiado.', 'warn');
  const cli = cliente(cliId);
  const payload = {
    venda: { ID_Venda: uid('V'), DataHora: isoDT(), ID_Usuario: S.user.ID, Atividade: STORE_ACT[view], Forma_Pagamento: pay, ID_Cliente: cliId, Nome_Cliente: cli?.Nome || '' },
    itens: cart.map(l => ({ ID_Produto: l.id, Nome_Produto: l.nome, Qtd: l.qty, Preco_Venda_Unit: l.price })),
    auth: S.pdvAuth[view] || ''
  };
  if (btn) btn.disabled = true;
  const res = await run(() => Api.exec('salvarVenda', payload));
  if (btn) btn.disabled = false;
  if (!res) return;
  S.cart[view] = []; S.pdvAuth[view] = ''; S.pay[view] = 'Pix'; S.cli[view] = '';
  toast(`Venda de ${money(res.venda.Total_Venda)} registrada ✔`, 'ok');
  refresh();
  vendaReceipt(res.venda.ID_Venda, res);
}

function vendaReceipt(id, res) {
  const v = res?.venda || T('Vendas_PDV').find(x => same(x.ID_Venda, id));
  const itens = res?.itens || T('Vendas_Itens').filter(i => same(i.ID_Venda, id));
  if (!v) return;
  showReceipt(receiptHTML({
    titulo: `RECIBO DE VENDA — ${(ACT_LABEL[v.Atividade] || v.Atividade).toUpperCase()}`, id: v.ID_Venda, data: v.DataHora,
    cliente: v.Nome_Cliente, operador: userName(v.ID_Usuario),
    itens: itens.map(i => [i.Nome_Produto, num(i.Qtd), i.Subtotal]), total: v.Total_Venda,
    extras: [['Pagamento', payLabel(v.Forma_Pagamento)]],
    obs: v.Forma_Pagamento === 'Crediario' ? 'Compra no crediário (fiado). Assinatura: ____________________' : ''
  }));
}

function vendasHojeHTML(act) {
  const vs = T('Vendas_PDV').filter(v => v.Atividade === act && dayOf(v.DataHora) === isoDate() && (isMaster() || same(v.ID_Usuario, S.user.ID)))
    .sort((a, b) => String(b.DataHora).localeCompare(a.DataHora));
  return `<div class="card-head"><h3>🧾 ${isMaster() ? 'Vendas de hoje' : 'Minhas vendas de hoje'}</h3><b class="t-gold">${money(sum(vs, 'Total_Venda'))}</b></div>
    ${table([
      { label: 'Hora', html: v => timeOf(v.DataHora) },
      { label: 'Pagamento', html: v => badge(payLabel(v.Forma_Pagamento), v.Forma_Pagamento === 'Crediario' ? 'warn' : 'gold') },
      { label: 'Cliente', html: v => esc(v.Nome_Cliente || '—') },
      ...(isMaster() ? [{ label: 'Atendente', html: v => esc(userName(v.ID_Usuario)) }] : []),
      { label: 'Total', cls: 'right', html: v => `<b>${money(v.Total_Venda)}</b>` },
      { label: '', cls: 'actions', html: v => `<button type="button" class="btn small" data-act="recibo" data-id="${esc(v.ID_Venda)}">🧾 Recibo</button>` }
    ], vs, { empty: 'Nenhuma venda hoje ainda.' })}`;
}

/* ---------- Crediário (fiado) ---------- */
function crediarioSaldos(act) {
  const map = {};
  const get = (id, nome) => (map[id] ||= { id, nome, compras: 0, pago: 0, ult: '', abertas: 0 });
  T('Vendas_PDV').filter(v => v.Atividade === act && v.Forma_Pagamento === 'Crediario').forEach(v => {
    const m = get(v.ID_Cliente, v.Nome_Cliente);
    m.compras += num(v.Total_Venda);
    if (v.DataHora > m.ult) m.ult = v.DataHora;
  });
  T('Recebimentos').filter(r => r.Tipo === 'Crediario' && r.Atividade === act).forEach(r => { get(r.ID_Cliente, r.Nome_Cliente).pago += num(r.Valor); });
  return Object.values(map).map(m => ({ ...m, nome: cliente(m.id)?.Nome || m.nome, saldo: r2(m.compras - m.pago) }));
}

function storeCrediario(el, view) {
  const act = STORE_ACT[view];
  const f = S.filters['cred_' + view] ||= { abertos: true };
  const all = crediarioSaldos(act);
  const rows = all.filter(m => !f.abertos || m.saldo > 0.009).sort((a, b) => b.saldo - a.saldo);
  el.innerHTML = `<div class="kpis">
      ${kpi('Total a receber', money(sum(all, m => Math.max(0, m.saldo))), 'warn')}
      ${kpi('Clientes devendo', all.filter(m => m.saldo > 0.009).length, 'gold')}
    </div>
    <div class="toolbar">
      <button type="button" class="btn primary" data-act="nova">🛒 Nova compra no fiado</button>
      <label class="check"><input type="checkbox" data-f="abertos" ${f.abertos ? 'checked' : ''}> Mostrar só quem está devendo</label>
    </div>
    ${table([
      { label: 'Cliente', html: m => `<b>${esc(m.nome)}</b>` },
      { label: 'Última compra', html: m => fmtDate(dayOf(m.ult)) },
      { label: 'Comprou', cls: 'right', html: m => money(m.compras) },
      { label: 'Já pagou', cls: 'right', html: m => money(m.pago) },
      { label: 'Deve', cls: 'right', html: m => `<b class="${m.saldo > 0.009 ? 't-danger' : 't-ok'}">${money(m.saldo)}</b>` },
      { label: '', cls: 'actions', html: m => `
        ${m.saldo > 0.009 ? `<button type="button" class="btn small ok" data-act="baixa" data-id="${esc(m.id)}">💵 Receber</button>` : ''}
        <button type="button" class="btn small" data-act="hist" data-id="${esc(m.id)}">📜 Histórico</button>
        ${m.saldo > 0.009 && cliente(m.id)?.Telefone_WhatsApp ? `<button type="button" class="btn small wa" data-act="wa" data-id="${esc(m.id)}">Cobrar</button>` : ''}` }
    ], rows, { empty: 'Ninguém devendo no fiado 🎉' })}`;
  const find = id => all.find(m => same(m.id, id));
  bind(el, {
    nova: () => { S.pay[view] = 'Crediario'; go(view, 'pdv'); },
    baixa: d => baixaCrediario(find(d.id), act),
    hist: d => historicoCrediario(find(d.id), act),
    wa: d => {
      const m = find(d.id);
      openWA(cliente(m.id)?.Telefone_WhatsApp, `Olá ${m.nome.split(' ')[0]}! Aqui é da Preto Rico (${ACT_LABEL[act]}). Seu saldo no crediário está em ${money(m.saldo)}. Quando puder, passe aqui ou pague por Pix. Obrigado!`);
    }
  });
  bindFilters(el, f, () => storeCrediario(el, view));
}

function baixaCrediario(m, act) {
  formModal({
    title: `💵 Receber do fiado — ${m.nome}`,
    intro: `<div class="kpis">${kpi('Saldo devedor', money(m.saldo), 'danger')}</div>`,
    values: { Valor: m.saldo.toFixed(2), Forma_Pagamento: 'Pix' },
    fields: [
      { name: 'Valor', label: 'Valor recebido (R$) — pode ser parcial', type: 'number', step: '0.01', min: 0.01, max: m.saldo, required: true, inputmode: 'decimal' },
      { name: 'Forma_Pagamento', label: 'Forma de pagamento', type: 'select', options: PAY.filter(p => p.id !== 'Crediario').map(p => [p.id, p.label]) }
    ],
    submitLabel: 'Confirmar recebimento',
    onSubmit: async d => {
      const row = { ID: uid('RC'), DataHora: isoDT(), Tipo: 'Crediario', ID_Cliente: m.id, Nome_Cliente: m.nome, Atividade: act, Valor: d.Valor, Forma_Pagamento: d.Forma_Pagamento, ID_Usuario: S.user.ID, Referencia: 'Baixa crediário' };
      await Api.exec('registrarRecebimento', { row });
      const resta = r2(m.saldo - num(d.Valor));
      toast(resta > 0 ? `Recebido! Ainda faltam ${money(resta)}.` : 'Dívida quitada ✔', 'ok');
      refresh();
      showReceipt(receiptHTML({ titulo: 'RECIBO — PAGAMENTO DE CREDIÁRIO', id: row.ID, data: row.DataHora, cliente: m.nome, operador: S.user.Nome,
        itens: [[`Pagamento crediário ${ACT_LABEL[act]}`, '', row.Valor]], total: row.Valor,
        extras: [['Pagamento', payLabel(row.Forma_Pagamento)], ['Saldo anterior', money(m.saldo)], ['Saldo restante', money(Math.max(0, resta))]] }));
    }
  });
}

function historicoCrediario(m, act) {
  const compras = T('Vendas_PDV').filter(v => v.Atividade === act && v.Forma_Pagamento === 'Crediario' && same(v.ID_Cliente, m.id))
    .map(v => ({ data: v.DataHora, desc: 'Compra ' + T('Vendas_Itens').filter(i => same(i.ID_Venda, v.ID_Venda)).map(i => `${num(i.Qtd)}x ${i.Nome_Produto}`).join(', '), val: num(v.Total_Venda) }));
  const pags = T('Recebimentos').filter(r => r.Tipo === 'Crediario' && r.Atividade === act && same(r.ID_Cliente, m.id))
    .map(r => ({ data: r.DataHora, desc: 'Pagamento (' + payLabel(r.Forma_Pagamento) + ')', val: -num(r.Valor) }));
  let saldo = 0;
  const rows = [...compras, ...pags].sort((a, b) => String(a.data).localeCompare(b.data)).map(r => ({ ...r, saldo: (saldo = r2(saldo + r.val)) }));
  openModal({
    title: `📜 Histórico — ${m.nome}`, size: 'lg',
    body: table([
      { label: 'Data', html: r => fmtDate(r.data) },
      { label: 'Descrição', html: r => esc(r.desc) },
      { label: 'Valor', cls: 'right', html: r => `<span class="${r.val < 0 ? 't-ok' : 't-danger'}">${money(Math.abs(r.val))}</span>` },
      { label: 'Saldo', cls: 'right', html: r => `<b>${money(r.saldo)}</b>` }
    ], rows),
    actions: [{ label: 'Fechar', cls: 'primary' }]
  });
}

/* ---------- Estoque ---------- */
function storeEstoque(el, view) {
  const act = STORE_ACT[view];
  const f = S.filters['est_' + view] ||= { q: '', st: '' };
  const master = isMaster();
  const all = T('Estoque').filter(p => p.Atividade === act);
  const cnt = s => all.filter(p => stockLevel(p) === s).length;
  el.innerHTML = `<div class="kpis">
      ${kpi('Produtos', all.length, 'gold')}${kpi('OK', cnt('ok'), 'ok')}${kpi('Baixo', cnt('warn'), 'warn')}${kpi('Crítico', cnt('danger'), 'danger')}
      ${master ? kpi('Valor em estoque (custo)', money(sum(all, p => num(p.Qtd) * num(p.Preco_Custo))), 'info') : ''}
    </div>
    <div class="toolbar">
      ${master ? '<button type="button" class="btn primary" data-act="novo">➕ Novo produto</button>' : ''}
      <label class="grow">Buscar<input type="search" id="est-q" value="${esc(f.q)}" placeholder="Nome do produto"></label>
      <label>Situação<select data-f="st">${opts([['', 'Todas'], ['ok', '🟢 OK'], ['warn', '🟡 Baixo'], ['danger', '🔴 Crítico']], f.st)}</select></label>
    </div>
    <div id="est-table"></div>`;
  const draw = () => {
    const order = { danger: 0, warn: 1, ok: 2 };
    const rows = all.filter(p => (!f.q || norm(p.Produto).includes(norm(f.q))) && (!f.st || stockLevel(p) === f.st))
      .sort((a, b) => order[stockLevel(a)] - order[stockLevel(b)] || String(a.Produto).localeCompare(b.Produto));
    const cols = [
      { label: 'Produto', html: p => `<b>${esc(p.Produto)}</b>` },
      { label: 'Qtd', cls: 'right', html: p => num(p.Qtd) },
      { label: 'Mínimo', cls: 'right', html: p => num(p.Minimo) },
      ...(master ? [
        { label: 'Custo', cls: 'right', html: p => money(p.Preco_Custo) },
        { label: 'Venda', cls: 'right', html: p => money(p.Preco_Venda) },
        { label: 'Margem', cls: 'right', html: p => num(p.Preco_Venda) ? pct((num(p.Preco_Venda) - num(p.Preco_Custo)) / num(p.Preco_Venda) * 100) : '—' }
      ] : [{ label: 'Preço', cls: 'right', html: p => money(p.Preco_Venda) }]),
      { label: 'Situação', html: p => stockBadge(p) },
      ...(master ? [{ label: '', cls: 'actions', html: p => `
        <button type="button" class="btn small ok" data-act="entrada" data-id="${esc(p.ID)}">＋ Entrada</button>
        <button type="button" class="btn small" data-act="preco" data-id="${esc(p.ID)}">💲 Preço</button>
        <button type="button" class="btn small ghost" data-act="editar" data-id="${esc(p.ID)}">✏️</button>
        <button type="button" class="btn small danger-ghost" data-act="excluir" data-id="${esc(p.ID)}">🗑</button>` }] : [])
    ];
    $('#est-table', el).innerHTML = table(cols, rows, { empty: 'Nenhum produto.' });
  };
  draw();
  el.oninput = e => { if (e.target.id === 'est-q') { f.q = e.target.value; draw(); } };
  bindFilters(el, f, () => storeEstoque(el, view));
  bind(el, {
    novo: () => produtoForm({ Atividade: act }),
    editar: d => produtoForm(produto(d.id)),
    entrada: d => {
      const p = produto(d.id);
      formModal({
        title: `📦 Movimentar estoque — ${p.Produto}`,
        intro: `<p class="muted">Estoque atual: <b>${num(p.Qtd)}</b>. Use número negativo para retirar (perda, uso interno).</p>`,
        values: { delta: 1 },
        fields: [{ name: 'delta', label: 'Quantidade a somar', type: 'number', step: '1', required: true, full: true }],
        onSubmit: async x => { await Api.exec('atualizarEstoque', { ID: p.ID, delta: x.delta }); toast('Estoque atualizado ✔', 'ok'); refresh(); }
      });
    },
    preco: d => {
      const p = produto(d.id);
      formModal({
        title: `💲 Ajustar preço — ${p.Produto}`,
        values: { Preco_Custo: p.Preco_Custo, Preco_Venda: p.Preco_Venda },
        fields: [
          { name: 'Preco_Custo', label: 'Preço de custo (R$)', type: 'number', step: '0.01', min: 0 },
          { name: 'Preco_Venda', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true }
        ],
        onSubmit: async x => { await Api.exec('salvarAjustePreco', { ID: p.ID, ...x }); toast('Preço atualizado ✔', 'ok'); refresh(); }
      });
    },
    excluir: async d => {
      const p = produto(d.id);
      if (await confirmModal(`Excluir o produto <b>${esc(p.Produto)}</b>?`, { ok: 'Excluir', cls: 'danger' })
        && await run(() => Api.exec('remove', { table: 'Estoque', id: p.ID }), 'Produto excluído')) refresh();
    }
  });
}

function produtoForm(row = {}) {
  formModal({
    title: row.ID ? '✏️ Editar produto' : '📦 Novo produto',
    values: { Qtd: 0, Minimo: 5, ...row },
    fields: [
      { name: 'Produto', label: 'Nome do produto', required: true, full: true },
      { name: 'Atividade', label: 'Loja', type: 'select', options: Object.values(STORE_ACT).map(a => [a, ACT_LABEL[a]]) },
      { name: 'Qtd', label: 'Quantidade em estoque', type: 'number', step: '1', min: 0, required: true },
      { name: 'Minimo', label: 'Estoque mínimo', type: 'number', step: '1', min: 0, required: true },
      { name: 'Preco_Custo', label: 'Preço de custo (R$)', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'Preco_Venda', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    onSubmit: async d => {
      if (num(d.Preco_Venda) < num(d.Preco_Custo) && !(await confirmModal('O preço de venda está menor que o custo. Salvar mesmo assim?'))) return false;
      await Api.exec('atualizarEstoque', { row: { ...row, ...d, ID: row.ID || uid('P') } });
      toast('Produto salvo ✔', 'ok');
      refresh();
    }
  });
}

/* ---------- Reposição com Curva ABC ---------- */
function curvaABC(act, dias, crit) {
  const desde = addDays(isoDate(), -dias);
  const vendas = new Set(T('Vendas_PDV').filter(v => v.Atividade === act && dayOf(v.DataHora) >= desde).map(v => String(v.ID_Venda)));
  const agg = {};
  T('Vendas_Itens').filter(i => vendas.has(String(i.ID_Venda))).forEach(i => {
    const a = agg[i.ID_Produto] ||= { qtd: 0, fat: 0, lucro: 0 };
    a.qtd += num(i.Qtd); a.fat += num(i.Subtotal); a.lucro += num(i.Subtotal) - num(i.Qtd) * num(i.Preco_Custo_Unit);
  });
  const rows = T('Estoque').filter(p => p.Atividade === act).map(p => ({ p, ...(agg[p.ID] || { qtd: 0, fat: 0, lucro: 0 }) }));
  const total = rows.reduce((s, r) => s + Math.max(0, r[crit]), 0) || 1;
  rows.sort((a, b) => b[crit] - a[crit]);
  let acum = 0;
  rows.forEach(r => {
    const antes = acum;
    acum += Math.max(0, r[crit]) / total * 100;
    r.acum = acum;
    r.classe = r[crit] <= 0 ? 'C' : antes < 80 ? 'A' : antes < 95 ? 'B' : 'C';
    const diario = r.qtd / dias;
    const alvo = Math.max(num(r.p.Minimo) * 2, Math.ceil(diario * 30));
    r.sug = Math.max(0, Math.ceil(alvo - num(r.p.Qtd)));
    r.repor = num(r.p.Qtd) <= num(r.p.Minimo) || (r.classe === 'A' && num(r.p.Qtd) < diario * 15);
  });
  return rows;
}

function storeReposicao(el, view) {
  const act = STORE_ACT[view];
  const f = S.filters['abc_' + view] ||= { dias: '30', crit: 'lucro', so: true };
  const rows = curvaABC(act, Number(f.dias), f.crit);
  const list = rows.filter(r => !f.so || (r.repor && r.sug > 0));
  const custoTotal = sum(list, r => r.sug * num(r.p.Preco_Custo));
  el.innerHTML = `<div class="toolbar">
      <label>Período de vendas<select data-f="dias">${opts([['30', '30 dias'], ['60', '60 dias'], ['90', '90 dias']], f.dias)}</select></label>
      <label>Curva ABC por<select data-f="crit">${opts([['lucro', 'Lucro gerado'], ['fat', 'Faturamento'], ['qtd', 'Quantidade vendida']], f.crit)}</select></label>
      <label class="check"><input type="checkbox" data-f="so" ${f.so ? 'checked' : ''}> Só itens a repor</label>
      <button type="button" class="btn" data-act="imprimir">🖨️ Imprimir lista</button>
      <button type="button" class="btn wa" data-act="wa">Enviar no WhatsApp</button>
    </div>
    <div class="kpis">${kpi('Itens a repor', list.filter(r => r.sug > 0).length, 'warn')}${kpi('Custo estimado da compra', money(custoTotal), 'info')}
      ${kpi('Classe A', rows.filter(r => r.classe === 'A').length, 'ok', 'até 80% do resultado')}</div>
    ${table([
      { label: 'Classe', html: r => badge(r.classe, STATUS_TONE[r.classe]) },
      { label: 'Produto', html: r => `<b>${esc(r.p.Produto)}</b>` },
      { label: 'Vendido', cls: 'right', html: r => r.qtd },
      { label: 'Faturamento', cls: 'right', html: r => money(r.fat) },
      { label: 'Lucro', cls: 'right', html: r => money(r.lucro) },
      { label: '% acum.', cls: 'right', html: r => pct(r.acum) },
      { label: 'Estoque', cls: 'right', html: r => `${num(r.p.Qtd)} ${stockBadge(r.p)}` },
      { label: 'Comprar', cls: 'right', html: r => `<b class="t-gold">${r.sug}</b>` }
    ], list, { empty: 'Nada para repor agora ✔' })}`;
  const texto = () => `*Lista de reposição — ${ACT_LABEL[act]}* (${fmtDate(isoDate())})\n` + list.filter(r => r.sug > 0).map(r => `• ${r.sug}x ${r.p.Produto}`).join('\n');
  bind(el, {
    imprimir: () => showReceipt(reportHTML(`Lista de Reposição — ${ACT_LABEL[act]}`, `Curva ABC por ${f.crit === 'lucro' ? 'lucro' : f.crit === 'fat' ? 'faturamento' : 'quantidade'} · últimos ${f.dias} dias`,
      `<table><tr><th>Classe</th><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th><th class="r">Comprar</th><th class="r">Custo est.</th></tr>
      ${list.filter(r => r.sug > 0).map(r => `<tr><td>${r.classe}</td><td>${esc(r.p.Produto)}</td><td class="r">${num(r.p.Qtd)}</td><td class="r">${num(r.p.Minimo)}</td><td class="r"><b>${r.sug}</b></td><td class="r">${money(r.sug * num(r.p.Preco_Custo))}</td></tr>`).join('')}
      <tr><th colspan="5">TOTAL ESTIMADO</th><th class="r">${money(custoTotal)}</th></tr></table>`), '🖨️ Lista de reposição'),
    wa: () => window.open('https://wa.me/?text=' + encodeURIComponent(texto()), '_blank', 'noopener')
  });
  bindFilters(el, f, () => storeReposicao(el, view));
}

/* ==========================================================================
   10. ESTÚDIO DE TATUAGEM
   ========================================================================== */
RENDER.tatuagem = { agenda: tatAgenda, fechamento: tatFechamento };

const weekStart = iso => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return addDays(iso, -dt.getDay()); };

function tatForm(row = {}) {
  const isTat = lvl() === 'Tatuador';
  const tats = isTat ? [S.user] : profs('Tatuador');
  if (!tats.length) return toast('Cadastre um tatuador em Usuários primeiro.', 'warn');
  const pctPadrao = num(cfgVal('comissao_master_tattoo', 30));
  const valor = num(row.Valor_Total);
  const pctAtual = valor ? r2(num(row.Comissao_Master) / valor * 100) : pctPadrao;
  const calc = els => { els.Comissao_Master.value = r2(num(els.Valor_Total.value) * num(els.pct.value) / 100).toFixed(2); };
  formModal({
    title: row.ID ? '✏️ Editar sessão' : '🖋️ Nova sessão de tatuagem',
    values: { Status: 'Agendado', pct: pctAtual, ...row, ID_Tatuador: row.ID_Tatuador || tats[0].ID },
    fields: [
      { name: 'DataHora', label: 'Dia e hora', type: 'datetime-local', required: true },
      { name: 'ID_Tatuador', label: 'Tatuador', type: 'select', options: tats.map(u => [u.ID, u.Nome]), required: true },
      ...clienteFields(),
      { name: 'Descricao_Servico', label: 'Descrição (local, tamanho, estilo)', type: 'textarea', full: true, required: true },
      { name: 'Valor_Total', label: 'Valor total (R$)', type: 'number', step: '0.01', min: 0, required: true, onInput: calc, inputmode: 'decimal' },
      { name: 'pct', label: '% da sala (Master)', type: 'number', step: '0.1', min: 0, max: 100, onInput: calc },
      { name: 'Comissao_Master', label: 'Comissão do Master (R$)', type: 'number', step: '0.01', min: 0, required: true, help: 'Valor que o tatuador repassa ao dono da sala.' },
      { name: 'Status', label: 'Situação', type: 'select', options: ['Agendado', 'Concluido', 'Cancelado'] }
    ],
    onSubmit: async d => {
      const { pct: _p, ...rest } = d;
      if (num(rest.Comissao_Master) > num(rest.Valor_Total)) throw new Error('A comissão não pode ser maior que o valor total.');
      await Api.exec('salvarAgendamento', { tipo: 'tatuagem', row: { ...row, ...rest, ID: row.ID || uid('AT') } });
      toast('Sessão salva ✔', 'ok');
      refresh();
    }
  });
}

function tatAgenda(el) {
  const st = S.cal.tat ||= { start: weekStart(isoDate()), tat: '' };
  const isTat = lvl() === 'Tatuador';
  const rows = T('Agenda_Tatuagem').filter(a => (isTat ? same(a.ID_Tatuador, S.user.ID) : (!st.tat || same(a.ID_Tatuador, st.tat))));
  const dias = Array.from({ length: 7 }, (_, i) => addDays(st.start, i));
  const semana = rows.filter(a => dias.includes(dayOf(a.DataHora)));
  const conc = semana.filter(a => a.Status === 'Concluido');
  const hoje = isoDate();
  const rerender = () => tatAgenda(el);
  const label = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  el.innerHTML = `<div class="toolbar">
      <button type="button" class="btn primary big" data-act="novo">➕ Nova sessão</button>
      <button type="button" class="icon-btn" data-act="prev">‹</button>
      <button type="button" class="btn" data-act="hoje">Esta semana</button>
      <button type="button" class="icon-btn" data-act="next">›</button>
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], st.tat)}</select></label>` : ''}
    </div>
    <div class="kpis">${kpi('Sessões na semana', semana.filter(a => a.Status !== 'Cancelado').length, 'gold')}
      ${kpi('Produzido (concluídas)', money(sum(conc, 'Valor_Total')), 'ok')}${kpi('Comissão Master', money(sum(conc, 'Comissao_Master')), 'warn')}</div>
    <div class="week">${dias.map(d => {
      const list = rows.filter(a => dayOf(a.DataHora) === d).sort((a, b) => String(a.DataHora).localeCompare(b.DataHora));
      return `<div class="week-col ${d === hoje ? 'today' : ''}"><div class="week-head">${label(d)}</div>
        <div class="ag-list">${list.map(a => agendaItem(a, 'tatuagem')).join('') || '<small class="muted">Livre</small>'}</div></div>`;
    }).join('')}</div>`;
  const find = id => T('Agenda_Tatuagem').find(a => same(a.ID, id));
  bind(el, {
    novo: () => tatForm({ DataHora: (dias.includes(hoje) ? hoje : st.start) + 'T14:00' }),
    prev: () => { st.start = addDays(st.start, -7); rerender(); },
    next: () => { st.start = addDays(st.start, 7); rerender(); },
    hoje: () => { st.start = weekStart(hoje); rerender(); },
    editar: d => tatForm(find(d.id)),
    concluir: d => setAgStatus('tatuagem', find(d.id), 'Concluido'),
    cancelar: async d => { if (await confirmModal('Cancelar esta sessão?', { ok: 'Sim, cancelar', cls: 'danger' })) setAgStatus('tatuagem', find(d.id), 'Cancelado'); },
    recibo: d => {
      const a = find(d.id);
      showReceipt(receiptHTML({ titulo: 'RECIBO — ESTÚDIO DE TATUAGEM', id: a.ID, data: a.DataHora, cliente: a.Nome_Cliente, operador: userName(a.ID_Tatuador),
        itens: [[a.Descricao_Servico, 1, a.Valor_Total]], total: a.Valor_Total }));
    },
    wa: d => { const a = find(d.id); openWA(cliente(a.ID_Cliente)?.Telefone_WhatsApp, `Olá ${a.Nome_Cliente}! 🖋️ Confirmando sua sessão de tatuagem na Preto Rico: ${fmtDate(a.DataHora)}. Venha alimentado e hidratado!`); }
  });
  bindFilters(el, st, rerender);
}

function tatFechamento(el) {
  const isTat = lvl() === 'Tatuador';
  const f = S.filters.tatF ||= { modo: 'mes', dia: isoDate(), mes: monthOf(isoDate()), tat: '' };
  if (isTat) f.tat = S.user.ID;
  const match = a => a.Status === 'Concluido' && (f.modo === 'dia' ? dayOf(a.DataHora) === f.dia : monthOf(a.DataHora) === f.mes) && (!f.tat || same(a.ID_Tatuador, f.tat));
  const rows = T('Agenda_Tatuagem').filter(match);
  const per = f.modo === 'dia' ? fmtDate(f.dia) : fmtMonth(f.mes);
  const periodoKey = f.modo === 'dia' ? f.dia : f.mes;
  const grupos = Object.entries(groupBy(rows, a => a.ID_Tatuador)).map(([id, list]) => ({ id, list, prod: sum(list, 'Valor_Total'), master: sum(list, 'Comissao_Master') }));
  const rerender = () => tatFechamento(el);
  const meus = T('Fechamento_Comissoes').filter(x => x.Atividade === 'Tatuagem' && (!f.tat || same(x.ID_Profissional, f.tat)));
  el.innerHTML = `<div class="toolbar">
      <label>Tipo<select data-f="modo">${opts([['dia', 'Fechamento diário'], ['mes', 'Fechamento mensal']], f.modo)}</select></label>
      ${f.modo === 'dia' ? `<label>Dia<input type="date" data-f="dia" value="${esc(f.dia)}"></label>` : `<label>Mês<input type="month" data-f="mes" value="${esc(f.mes)}"></label>`}
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], f.tat)}</select></label>` : ''}
    </div>
    ${grupos.map(g => `<div class="card"><div class="card-head"><h3>🖋️ ${esc(userName(g.id))} — ${esc(per)}</h3>
        <div class="btn-row"><button type="button" class="btn small" data-act="imprimir" data-id="${esc(g.id)}">🖨️ Imprimir</button>
        ${isMaster() ? `<button type="button" class="btn small primary" data-act="fechar" data-id="${esc(g.id)}">Gerar fechamento</button>` : ''}</div></div>
      <div class="kpis">${kpi('Sessões', g.list.length, 'gold')}${kpi('Total produzido', money(g.prod))}${kpi('Repassar ao Master', money(g.master), 'warn')}${kpi('Fica com o tatuador', money(g.prod - g.master), 'ok')}</div>
      ${table([
        { label: 'Data', html: a => fmtDate(a.DataHora) },
        { label: 'Cliente', html: a => esc(a.Nome_Cliente) },
        { label: 'Serviço', html: a => esc(a.Descricao_Servico) },
        { label: 'Valor', cls: 'right', html: a => money(a.Valor_Total) },
        { label: 'Master', cls: 'right', html: a => money(a.Comissao_Master) }
      ], g.list)}</div>`).join('') || '<div class="empty">Nenhuma sessão concluída no período.</div>'}
    <div class="card"><h3>📋 Fechamentos registrados</h3>${fechTable(meus)}</div>`;
  bind(el, {
    imprimir: d => {
      const g = grupos.find(x => same(x.id, d.id));
      showReceipt(reportHTML(`Fechamento Tatuagem — ${userName(g.id)}`, `Período: ${per}`,
        `<table><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th class="r">Valor</th><th class="r">Master</th></tr>
        ${g.list.map(a => `<tr><td>${fmtDate(a.DataHora)}</td><td>${esc(a.Nome_Cliente)}</td><td>${esc(a.Descricao_Servico)}</td><td class="r">${money(a.Valor_Total)}</td><td class="r">${money(a.Comissao_Master)}</td></tr>`).join('')}
        <tr><th colspan="3">TOTAIS</th><th class="r">${money(g.prod)}</th><th class="r">${money(g.master)}</th></tr></table>
        <p><b>Repasse ao Master: ${money(g.master)}</b> · Líquido do tatuador: ${money(g.prod - g.master)}</p>`, [userName(g.id), 'Preto Rico (Master)']), '🖨️ Fechamento');
    },
    fechar: d => {
      const g = grupos.find(x => same(x.id, d.id));
      gerarFechamento({ Data: periodoKey, ID_Profissional: g.id, Atividade: 'Tatuagem', Total_Produzido: r2(g.prod), Valor_Comissao: r2(g.prod - g.master), Valor_Master: r2(g.master) });
    },
    pago: d => marcarFechPago(d.id)
  });
  bindFilters(el, f, rerender);
}

function fechTable(rows) {
  return table([
    { label: 'Período', html: x => esc(String(x.Data).replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')) },
    { label: 'Profissional', html: x => esc(userName(x.ID_Profissional)) },
    { label: 'Atividade', html: x => esc(x.Atividade) },
    { label: 'Produzido', cls: 'right', html: x => money(x.Total_Produzido) },
    { label: 'Profissional recebe', cls: 'right', html: x => money(x.Valor_Comissao) },
    { label: 'Master', cls: 'right', html: x => money(x.Valor_Master) },
    { label: 'Situação', html: x => sBadge(x.Status_Pagamento) },
    ...(isMaster() ? [{ label: '', cls: 'actions', html: x => x.Status_Pagamento !== 'Pago' ? `<button type="button" class="btn small ok" data-act="pago" data-id="${esc(x.ID)}">✔ Marcar pago</button>` : '' }] : [])
  ], rows.slice().sort((a, b) => String(b.Data).localeCompare(a.Data)), { empty: 'Nenhum fechamento registrado.' });
}

async function marcarFechPago(id) {
  const x = T('Fechamento_Comissoes').find(r => same(r.ID, id));
  if (x && await run(() => Api.exec('gerarFechamento', { rows: [{ ...x, Status_Pagamento: 'Pago' }] }), 'Fechamento marcado como pago ✔')) refresh();
}

/* ==========================================================================
   11. FINANCEIRO (MASTER)
   ========================================================================== */
RENDER.financeiro = { caixa: finCaixa, contas: finContas, ofx: finOFX, comissoes: finComissoes };

/* ---------- Fechamento de caixa diário ---------- */
function finCaixa(el) {
  const f = S.filters.caixa ||= { dia: isoDate(), user: '' };
  const vendas = T('Vendas_PDV').filter(v => dayOf(v.DataHora) === f.dia && (!f.user || same(v.ID_Usuario, f.user)));
  const recs = T('Recebimentos').filter(r => dayOf(r.DataHora) === f.dia && (!f.user || same(r.ID_Usuario, f.user)));
  const ops = {};
  const get = id => (ops[id] ||= { id, Pix: 0, Cartao: 0, Dinheiro: 0, Crediario: 0, vendas: 0, receb: 0 });
  vendas.forEach(v => { const o = get(v.ID_Usuario); o[v.Forma_Pagamento] = (o[v.Forma_Pagamento] || 0) + num(v.Total_Venda); o.vendas += num(v.Total_Venda); });
  recs.forEach(r => { const o = get(r.ID_Usuario); o[r.Forma_Pagamento] = (o[r.Forma_Pagamento] || 0) + num(r.Valor); o.receb += num(r.Valor); });
  const rows = Object.values(ops).map(o => ({ ...o, entrada: o.Pix + o.Cartao + o.Dinheiro }));
  const tot = k => sum(rows, k);
  const movs = [
    ...vendas.map(v => ({ h: v.DataHora, op: v.ID_Usuario, desc: `Venda ${ACT_LABEL[v.Atividade] || v.Atividade}${v.Nome_Cliente ? ' — ' + v.Nome_Cliente : ''}`, forma: v.Forma_Pagamento, val: v.Total_Venda, id: v.ID_Venda })),
    ...recs.map(r => ({ h: r.DataHora, op: r.ID_Usuario, desc: `${r.Tipo === 'Mensalidade' ? 'Mensalidade' : 'Receb. fiado'} — ${r.Nome_Cliente}`, forma: r.Forma_Pagamento, val: r.Valor }))
  ].sort((a, b) => String(a.h).localeCompare(b.h));
  const operadores = users().filter(u => ['Master', 'Caixa', 'Barbeiro'].includes(u.Nivel));
  const colsResumo = [
    { label: 'Operador', html: o => `<b>${esc(userName(o.id))}</b>` },
    { label: 'Pix', cls: 'right', html: o => money(o.Pix) },
    { label: 'Cartão', cls: 'right', html: o => money(o.Cartao) },
    { label: 'Dinheiro', cls: 'right', html: o => money(o.Dinheiro) },
    { label: 'Fiado (a prazo)', cls: 'right', html: o => money(o.Crediario) },
    { label: 'Entrou no caixa', cls: 'right', html: o => `<b>${money(o.entrada)}</b>` }
  ];
  el.innerHTML = `<div class="toolbar">
      <label>Dia<input type="date" data-f="dia" value="${esc(f.dia)}"></label>
      <label>Operador<select data-f="user">${opts([['', 'Todos'], ...operadores.map(u => [u.ID, u.Nome])], f.user)}</select></label>
      <button type="button" class="btn" data-act="imprimir">🖨️ Imprimir fechamento</button>
    </div>
    <div class="kpis">${kpi('⚡ Pix', money(tot('Pix')), 'info')}${kpi('💳 Cartão', money(tot('Cartao')), 'gold')}${kpi('💵 Dinheiro', money(tot('Dinheiro')), 'ok')}
      ${kpi('📒 Fiado', money(tot('Crediario')), 'warn')}${kpi('Total recebido', money(tot('entrada')), 'ok', 'Pix + Cartão + Dinheiro')}</div>
    <div class="card"><h3>👤 Por operador</h3>${table(colsResumo, rows, {
      empty: 'Nenhum movimento neste dia.',
      foot: footRow([{ html: 'TOTAL' }, { cls: 'right', label: 'Pix', html: money(tot('Pix')) }, { cls: 'right', label: 'Cartão', html: money(tot('Cartao')) }, { cls: 'right', label: 'Dinheiro', html: money(tot('Dinheiro')) }, { cls: 'right', label: 'Fiado', html: money(tot('Crediario')) }, { cls: 'right', label: 'Total', html: money(tot('entrada')) }])
    })}</div>
    <div class="card"><h3>📜 Movimentos do dia</h3>${table([
      { label: 'Hora', html: m => timeOf(m.h) },
      { label: 'Operador', html: m => esc(userName(m.op)) },
      { label: 'Descrição', html: m => esc(m.desc) },
      { label: 'Forma', html: m => badge(payLabel(m.forma), m.forma === 'Crediario' ? 'warn' : 'gold') },
      { label: 'Valor', cls: 'right', html: m => money(m.val) },
      { label: '', cls: 'actions', html: m => m.id ? `<button type="button" class="btn small" data-act="recibo" data-id="${esc(m.id)}">🧾</button>` : '' }
    ], movs, { empty: 'Sem movimentos.' })}</div>`;
  bind(el, {
    recibo: d => vendaReceipt(d.id),
    imprimir: () => showReceipt(reportHTML('Fechamento de Caixa', `Dia ${fmtDate(f.dia)}${f.user ? ' · Operador: ' + userName(f.user) : ''}`,
      `<table><tr><th>Operador</th><th class="r">Pix</th><th class="r">Cartão</th><th class="r">Dinheiro</th><th class="r">Fiado</th><th class="r">Recebido</th></tr>
      ${rows.map(o => `<tr><td>${esc(userName(o.id))}</td><td class="r">${money(o.Pix)}</td><td class="r">${money(o.Cartao)}</td><td class="r">${money(o.Dinheiro)}</td><td class="r">${money(o.Crediario)}</td><td class="r">${money(o.entrada)}</td></tr>`).join('')}
      <tr><th>TOTAL</th><th class="r">${money(tot('Pix'))}</th><th class="r">${money(tot('Cartao'))}</th><th class="r">${money(tot('Dinheiro'))}</th><th class="r">${money(tot('Crediario'))}</th><th class="r">${money(tot('entrada'))}</th></tr></table>
      <table><tr><th>Hora</th><th>Operador</th><th>Descrição</th><th>Forma</th><th class="r">Valor</th></tr>
      ${movs.map(m => `<tr><td>${timeOf(m.h)}</td><td>${esc(userName(m.op))}</td><td>${esc(m.desc)}</td><td>${payLabel(m.forma)}</td><td class="r">${money(m.val)}</td></tr>`).join('')}</table>`,
      ['Operador', 'Conferente (Master)']), '🖨️ Fechamento de caixa')
  });
  bindFilters(el, f, () => finCaixa(el));
}

/* ---------- Contas a pagar / despesas ---------- */
const CATEGORIAS = ['Fixa', 'Variável', 'Fornecedor', 'Barbearia', 'Tabacaria', 'Celulares', 'Tatuagem', 'Impostos', 'Outros'];

function contaForm(row = {}) {
  formModal({
    title: row.ID ? '✏️ Editar conta' : '📄 Nova conta / despesa',
    values: { Tipo: 'Despesa', Categoria: 'Fixa', Status: 'Pendente', Vencimento: isoDate(), repetir: 1, ...row },
    fields: [
      { name: 'Descricao', label: 'Descrição', required: true, full: true, placeholder: 'Ex.: Aluguel, energia, fornecedor X' },
      { name: 'Tipo', label: 'Tipo', type: 'select', options: [['Despesa', 'Despesa'], ['Custo', 'Custo'], ['Conta_Pagar', 'Conta a pagar']] },
      { name: 'Categoria', label: 'Categoria', type: 'select', options: CATEGORIAS },
      { name: 'Valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0.01, required: true, inputmode: 'decimal' },
      { name: 'Vencimento', label: 'Vencimento', type: 'date', required: true },
      { name: 'Banco', label: 'Banco / conta' },
      { name: 'Status', label: 'Situação', type: 'select', options: ['Pendente', 'Pago'] },
      ...(!row.ID ? [{ name: 'repetir', label: 'Repetir por quantos meses?', type: 'number', min: 1, max: 24, help: 'Use para contas fixas (aluguel, internet...).' }] : [])
    ],
    onSubmit: async d => {
      const n = Math.max(1, Math.min(24, num(d.repetir) || 1));
      delete d.repetir;
      for (let i = 0; i < n; i++) {
        const venc = i ? addMonthDate(d.Vencimento, i) : d.Vencimento;
        const r = { ...row, ...d, ID: i === 0 && row.ID ? row.ID : uid('F'), Vencimento: venc, Descricao: n > 1 ? `${d.Descricao} (${i + 1}/${n})` : d.Descricao };
        if (r.Status === 'Pago' && !r.Data_Pagamento) r.Data_Pagamento = isoDate();
        if (r.Status === 'Pendente') r.Data_Pagamento = '';
        await Api.exec('upsert', { table: 'Financeiro_Contas', row: r });
      }
      toast('Conta salva ✔', 'ok');
      refresh();
    }
  });
}
function addMonthDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const dt = new Date(y, m - 1 + n, Math.min(d, last));
  return isoDate(dt);
}

function finContas(el) {
  const f = S.filters.contas ||= { st: 'Pendente', mes: '' };
  const hoje = isoDate();
  const all = T('Financeiro_Contas');
  const rows = all.filter(c => (!f.st || (f.st === 'Atrasada' ? c.Status !== 'Pago' && c.Vencimento < hoje : c.Status === f.st))
    && (!f.mes || monthOf(c.Vencimento) === f.mes)).sort((a, b) => String(a.Vencimento).localeCompare(b.Vencimento));
  const pend = all.filter(c => c.Status !== 'Pago');
  const atras = pend.filter(c => c.Vencimento < hoje);
  const pagoMes = all.filter(c => c.Status === 'Pago' && monthOf(c.Data_Pagamento) === monthOf(hoje));
  el.innerHTML = `<div class="kpis">
      ${kpi('A pagar', money(sum(pend, 'Valor')), 'warn', pend.length + ' conta(s)')}
      ${kpi('Atrasadas', money(sum(atras, 'Valor')), 'danger', atras.length + ' conta(s)')}
      ${kpi('Pago este mês', money(sum(pagoMes, 'Valor')), 'ok')}
    </div>
    <div class="toolbar">
      <button type="button" class="btn primary" data-act="nova">➕ Nova conta</button>
      <label>Situação<select data-f="st">${opts([['', 'Todas'], ['Pendente', 'Pendentes'], ['Atrasada', 'Atrasadas'], ['Pago', 'Pagas']], f.st)}</select></label>
      <label>Mês de vencimento<input type="month" data-f="mes" value="${esc(f.mes)}"></label>
    </div>
    ${table([
      { label: 'Vencimento', html: c => `<span class="${c.Status !== 'Pago' && c.Vencimento < hoje ? 't-danger' : ''}">${fmtDate(c.Vencimento)}</span>` },
      { label: 'Descrição', html: c => `<b>${esc(c.Descricao)}</b>${c.Fitid_OFX ? ' <span class="badge badge-info">OFX</span>' : ''}` },
      { label: 'Tipo', html: c => esc(String(c.Tipo).replace('_', ' ')) },
      { label: 'Categoria', html: c => esc(c.Categoria) },
      { label: 'Banco', html: c => esc(c.Banco || '—') },
      { label: 'Valor', cls: 'right', html: c => `<b>${money(c.Valor)}</b>` },
      { label: 'Situação', html: c => c.Status === 'Pago' ? sBadge('Pago') + `<br><small class="muted">${fmtDate(c.Data_Pagamento)}</small>` : (c.Vencimento < hoje ? badge('Atrasada', 'danger') : sBadge('Pendente')) },
      { label: '', cls: 'actions', html: c => `${c.Status !== 'Pago' ? `<button type="button" class="btn small ok" data-act="baixa" data-id="${esc(c.ID)}">✔ Dar baixa</button>` : ''}
        <button type="button" class="btn small ghost" data-act="editar" data-id="${esc(c.ID)}">✏️</button>
        <button type="button" class="btn small danger-ghost" data-act="excluir" data-id="${esc(c.ID)}">🗑</button>` }
    ], rows, { empty: 'Nenhuma conta encontrada.', foot: rows.length ? footRow([{ html: 'TOTAL' }, {}, {}, {}, {}, { cls: 'right', label: 'Valor', html: money(sum(rows, 'Valor')) }, {}, {}]) : '' })}`;
  const find = id => all.find(c => same(c.ID, id));
  bind(el, {
    nova: () => contaForm(),
    editar: d => contaForm(find(d.id)),
    baixa: d => {
      const c = find(d.id);
      formModal({
        title: `✔ Dar baixa — ${c.Descricao}`, values: { Data_Pagamento: isoDate(), Banco: c.Banco },
        intro: `<div class="kpis">${kpi('Valor', money(c.Valor), 'gold')}</div>`,
        fields: [{ name: 'Data_Pagamento', label: 'Data do pagamento', type: 'date', required: true }, { name: 'Banco', label: 'Pago pelo banco/conta' }],
        submitLabel: 'Confirmar pagamento',
        onSubmit: async x => { await Api.exec('darBaixaConta', { ID: c.ID, ...x }); toast('Conta paga ✔', 'ok'); refresh(); }
      });
    },
    excluir: async d => {
      if (await confirmModal('Excluir esta conta?', { ok: 'Excluir', cls: 'danger' }) && await run(() => Api.exec('remove', { table: 'Financeiro_Contas', id: d.id }), 'Conta excluída')) refresh();
    }
  });
  bindFilters(el, f, () => finContas(el));
}

/* ---------- Conciliação bancária OFX ---------- */

/** Leitor OFX (SGML 1.x e XML 2.x): extrai <STMTTRN> com TRNAMT, DTPOSTED, MEMO e FITID. */
function parseOFX(text) {
  const tag = (blk, t) => { const m = blk.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const date = s => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '';
  const amount = s => { s = String(s).trim(); if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.'); return num(s); };
  const blocks = text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  const trns = blocks.map(b => ({
    fitid: tag(b, 'FITID') || `${tag(b, 'DTPOSTED')}_${tag(b, 'TRNAMT')}_${tag(b, 'MEMO')}`.slice(0, 80),
    tipo: tag(b, 'TRNTYPE'), data: date(tag(b, 'DTPOSTED')), valor: amount(tag(b, 'TRNAMT')),
    memo: tag(b, 'MEMO') || tag(b, 'NAME') || '(sem descrição)'
  })).filter(t => t.data && t.valor);
  return { banco: tag(text, 'ORG') || tag(text, 'BANKID'), conta: tag(text, 'ACCTID'), inicio: date(tag(text, 'DTSTART')), fim: date(tag(text, 'DTEND')), trns };
}

const dayDiff = (a, b) => Math.abs((new Date(a + 'T12:00') - new Date(b + 'T12:00')) / 864e5);

/** Motor de match: sugere vínculos para cada transação, do mais provável ao menos provável. */
function ofxCandidates(t, usados) {
  const c = [];
  const eq = (a, b) => Math.abs(num(a) - Math.abs(num(b))) < 0.011;
  const push = (tipo, id, label, dist) => { if (!usados.has(tipo + ':' + id)) c.push({ key: tipo + ':' + id, tipo, id, label, score: 100 - dist * 10 }); };
  if (t.valor < 0) {
    T('Financeiro_Contas').filter(x => x.Status !== 'Pago' && eq(x.Valor, t.valor) && dayDiff(x.Vencimento, t.data) <= 10)
      .forEach(x => push('Conta', x.ID, `📄 ${x.Descricao} · venc. ${fmtDate(x.Vencimento)}`, dayDiff(x.Vencimento, t.data)));
  } else {
    T('Vendas_PDV').filter(v => ['Pix', 'Cartao'].includes(v.Forma_Pagamento) && eq(v.Total_Venda, t.valor) && dayDiff(dayOf(v.DataHora), t.data) <= 3)
      .forEach(v => push('Venda', v.ID_Venda, `🛒 Venda ${payLabel(v.Forma_Pagamento)} ${ACT_LABEL[v.Atividade] || ''} · ${fmtDate(v.DataHora)}`, dayDiff(dayOf(v.DataHora), t.data)));
    T('Recebimentos').filter(r => ['Pix', 'Cartao'].includes(r.Forma_Pagamento) && eq(r.Valor, t.valor) && dayDiff(dayOf(r.DataHora), t.data) <= 5)
      .forEach(r => push('Recebimento', r.ID, `${r.Tipo === 'Mensalidade' ? '⭐ Mensalidade' : '📒 Fiado'} ${r.Nome_Cliente} · ${fmtDate(r.DataHora)}`, dayDiff(dayOf(r.DataHora), t.data)));
    T('Clientes').filter(m => m.Tipo === 'Mensalista' && eq(m.Valor_Mensalidade, t.valor) && monthOf(m.Ultimo_Pagamento) < monthOf(t.data))
      .forEach(m => push('Mensalista', m.ID, `⭐ Mensalidade em aberto — ${m.Nome}`, 2));
    // Lotes diários (maquininha/Pix que caem somados)
    for (let i = 0; i <= 2; i++) {
      const d = addDays(t.data, -i);
      ['Pix', 'Cartao'].forEach(fp => {
        const tot = sum(T('Vendas_PDV').filter(v => v.Forma_Pagamento === fp && dayOf(v.DataHora) === d), 'Total_Venda');
        if (tot && eq(tot, t.valor)) push('Lote' + fp, `${fp}:${d}`, `📦 Lote de vendas ${payLabel(fp)} do dia ${fmtDate(d)}`, i + 0.5);
      });
    }
  }
  return c.sort((a, b) => b.score - a.score);
}

function finOFX(el) {
  const st = S.ofx;
  const conc = T('Conciliacao');
  const doneFit = new Set([...conc.map(c => String(c.Fitid)), ...T('Financeiro_Contas').filter(c => c.Fitid_OFX).map(c => String(c.Fitid_OFX))]);
  const usados = new Set(conc.map(c => c.Tipo_Ref + ':' + c.ID_Ref));
  let body = `<div class="card">
      <label class="upload"><input type="file" id="ofx-file" accept=".ofx,.OFX,application/x-ofx,text/plain"> 📂 Toque aqui e escolha o arquivo .OFX do banco</label>
      <p class="muted small" style="margin-top:.6rem">O arquivo é lido somente neste navegador. O sistema compara cada lançamento do extrato com vendas Pix/Cartão, mensalidades, fiado e contas a pagar.</p>
    </div>`;
  if (st) {
    st.trns.forEach(t => {
      t.done = doneFit.has(String(t.fitid));
      t.cands = t.done ? [] : ofxCandidates(t, usados);
      if (t.sel === undefined || (t.sel && !t.cands.some(c => c.key === t.sel))) t.sel = t.cands[0]?.key || '';
    });
    const pend = st.trns.filter(t => !t.done);
    const sugeridos = pend.filter(t => t.sel);
    body += `<div class="kpis">
        ${kpi('Lançamentos no extrato', st.trns.length, 'gold', `${esc(st.banco || 'Banco')} · conta ${esc(st.conta || '—')}`)}
        ${kpi('Entradas', money(sum(st.trns.filter(t => t.valor > 0), 'valor')), 'ok')}
        ${kpi('Saídas', money(Math.abs(sum(st.trns.filter(t => t.valor < 0), 'valor'))), 'danger')}
        ${kpi('Já conciliados', st.trns.length - pend.length, 'info')}
        ${kpi('Com sugestão', sugeridos.length, 'warn')}
      </div>
      <div class="toolbar">
        <button type="button" class="btn primary big" data-act="todos" ${sugeridos.length ? '' : 'disabled'}>✔ Aprovar todas as sugestões (${sugeridos.length})</button>
        <button type="button" class="btn ghost" data-act="limpar">Fechar extrato</button>
      </div>
      ${table([
        { label: 'Data', html: t => fmtDate(t.data) },
        { label: 'Histórico', html: t => `${esc(t.memo)}<br><small class="muted">FITID ${esc(t.fitid)}</small>` },
        { label: 'Valor', cls: 'right', html: t => `<span class="${t.valor > 0 ? 'amt-in' : 'amt-out'}">${money(t.valor)}</span>` },
        { label: 'Vínculo sugerido', html: t => t.done ? badge('Conciliado', 'ok')
            : t.cands.length ? `<select class="match-sel" data-i="${st.trns.indexOf(t)}">${opts([['', '— sem vínculo —'], ...t.cands.map(c => [c.key, c.label])], t.sel)}</select>`
            : '<span class="muted">Nenhum lançamento compatível</span>' },
        { label: '', cls: 'actions', html: t => t.done ? '' : `
            ${t.sel ? `<button type="button" class="btn small ok" data-act="aprovar" data-i="${st.trns.indexOf(t)}">✔ Aprovar</button>` : ''}
            ${t.valor < 0 && !t.sel ? `<button type="button" class="btn small" data-act="despesa" data-i="${st.trns.indexOf(t)}">➕ Lançar despesa</button>` : ''}
            <button type="button" class="btn small ghost" data-act="ignorar" data-i="${st.trns.indexOf(t)}">Ignorar</button>` }
      ], st.trns.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.data.localeCompare(b.data)), { empty: 'Nenhuma transação encontrada no arquivo.' })}`;
  }
  body += `<div class="card"><h3>📚 Últimas conciliações aprovadas</h3>${table([
    { label: 'Data', html: c => fmtDate(c.Data) },
    { label: 'Histórico', html: c => esc(c.Memo) },
    { label: 'Valor', cls: 'right', html: c => money(c.Valor) },
    { label: 'Vínculo', html: c => esc(c.Tipo_Ref) + ' ' + `<small class="muted">${esc(c.ID_Ref)}</small>` },
    { label: 'Aprovado em', html: c => fmtDate(c.Data_Aprovacao) }
  ], conc.slice().sort((a, b) => String(b.Data_Aprovacao).localeCompare(a.Data_Aprovacao)).slice(0, 30), { empty: 'Nenhuma conciliação ainda.' })}</div>`;
  el.innerHTML = body;

  el.onchange = async e => {
    if (e.target.id === 'ofx-file') {
      const file = e.target.files[0];
      if (!file) return;
      let text = await readFileText(file, 'utf-8');
      if (text.includes('\uFFFD')) text = await readFileText(file, 'iso-8859-1');
      const parsed = parseOFX(text);
      if (!parsed.trns.length) return toast('Arquivo sem transações <STMTTRN> válidas.', 'danger');
      S.ofx = parsed;
      toast(`${parsed.trns.length} lançamentos lidos ✔`, 'ok');
      finOFX(el);
    }
    if (e.target.classList.contains('match-sel')) { st.trns[e.target.dataset.i].sel = e.target.value; finOFX(el); }
  };

  const aprovar = async t => {
    const cand = t.cands.find(c => c.key === t.sel);
    if (!cand) return false;
    const payload = { row: { ID: uid('CC'), Fitid: t.fitid, Data: t.data, Valor: t.valor, Memo: t.memo, Tipo_Ref: cand.tipo, ID_Ref: cand.id, Data_Aprovacao: isoDate() }, Banco: st.banco };
    if (cand.tipo === 'Conta') payload.contaId = cand.id;
    await Api.exec('conciliar', payload);
    if (cand.tipo === 'Mensalista') {
      const m = cliente(cand.id);
      await Api.exec('registrarRecebimento', { row: { ID: uid('RC'), DataHora: t.data + 'T12:00', Tipo: 'Mensalidade', ID_Cliente: m.ID, Nome_Cliente: m.Nome, Atividade: 'Barbearia', Valor: t.valor, Forma_Pagamento: 'Pix', ID_Usuario: S.user.ID, Referencia: 'OFX ' + t.fitid } });
    }
    return true;
  };
  bind(el, {
    aprovar: async d => { if (await run(() => aprovar(st.trns[d.i]), 'Conciliado ✔')) finOFX(el); },
    todos: async () => {
      const list = st.trns.filter(t => !t.done && t.sel);
      if (!(await confirmModal(`Aprovar ${list.length} conciliação(ões) sugerida(s)?`, { ok: 'Aprovar todas' }))) return;
      let ok = 0;
      for (const t of list) { if (await run(() => aprovar(t))) ok++; }
      toast(`${ok} conciliação(ões) aprovada(s) ✔`, 'ok');
      finOFX(el);
    },
    ignorar: async d => {
      const t = st.trns[d.i];
      if (await run(() => Api.exec('conciliar', { row: { ID: uid('CC'), Fitid: t.fitid, Data: t.data, Valor: t.valor, Memo: t.memo, Tipo_Ref: 'Ignorado', ID_Ref: '-', Data_Aprovacao: isoDate() } }), 'Marcado como revisado')) finOFX(el);
    },
    despesa: d => {
      const t = st.trns[d.i];
      formModal({
        title: '➕ Lançar despesa a partir do extrato',
        values: { Descricao: t.memo, Categoria: 'Variável', Tipo: 'Despesa' },
        intro: `<div class="kpis">${kpi('Valor', money(Math.abs(t.valor)), 'danger', fmtDate(t.data))}</div>`,
        fields: [
          { name: 'Descricao', label: 'Descrição', required: true, full: true },
          { name: 'Tipo', label: 'Tipo', type: 'select', options: [['Despesa', 'Despesa'], ['Custo', 'Custo'], ['Conta_Pagar', 'Conta a pagar']] },
          { name: 'Categoria', label: 'Categoria', type: 'select', options: CATEGORIAS }
        ],
        onSubmit: async x => {
          const id = uid('F');
          await Api.exec('conciliar', {
            row: { ID: uid('CC'), Fitid: t.fitid, Data: t.data, Valor: t.valor, Memo: t.memo, Tipo_Ref: 'Conta', ID_Ref: id, Data_Aprovacao: isoDate() },
            novaConta: { ID: id, ...x, Valor: Math.abs(t.valor), Vencimento: t.data, Banco: st.banco, Status: 'Pago', Data_Pagamento: t.data, Fitid_OFX: t.fitid }
          });
          toast('Despesa lançada e conciliada ✔', 'ok');
          finOFX(el);
        }
      });
    },
    limpar: () => { S.ofx = null; finOFX(el); }
  });
}

function readFileText(file, enc) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file, enc); });
}

/* ---------- Fechamentos de comissão ---------- */
function finComissoes(el) {
  const f = S.filters.fech ||= { st: 'Pendente' };
  const rows = T('Fechamento_Comissoes').filter(x => !f.st || x.Status_Pagamento === f.st);
  const pend = T('Fechamento_Comissoes').filter(x => x.Status_Pagamento !== 'Pago');
  el.innerHTML = `<div class="kpis">
      ${kpi('Barbeiros a receber', money(sum(pend.filter(x => x.Atividade === 'Barbearia'), 'Valor_Comissao')), 'warn')}
      ${kpi('Tatuadores a repassar ao Master', money(sum(pend.filter(x => x.Atividade === 'Tatuagem'), 'Valor_Master')), 'info')}
    </div>
    <div class="toolbar">
      <label>Situação<select data-f="st">${opts([['', 'Todos'], ['Pendente', 'Pendentes'], ['Pago', 'Pagos']], f.st)}</select></label>
      <a class="btn" href="#barbearia/relatorio">💈 Gerar da barbearia</a>
      <a class="btn" href="#tatuagem/fechamento">🖋️ Gerar da tatuagem</a>
    </div>
    ${fechTable(rows)}`;
  bind(el, { pago: d => marcarFechPago(d.id) });
  bindFilters(el, f, () => finComissoes(el));
}

/* ==========================================================================
   12. CLIENTES
   ========================================================================== */
RENDER.clientes = { _: renderClientes };

function renderClientes(el) {
  const f = S.filters.cli ||= { q: '', tipo: '' };
  el.innerHTML = `<div class="toolbar">
      <button type="button" class="btn primary big" data-act="novo">➕ Novo cliente</button>
      <label class="grow">Buscar<input type="search" id="cli-q" value="${esc(f.q)}" placeholder="Nome ou telefone"></label>
      <label>Tipo<select data-f="tipo">${opts([['', 'Todos'], 'Avulso', 'Mensalista', ['Crediario', 'Crediário']], f.tipo)}</select></label>
    </div><div id="cli-table"></div>`;
  const draw = () => {
    const rows = clientes().filter(c => (!f.tipo || c.Tipo === f.tipo) && (!f.q || norm(c.Nome).includes(norm(f.q)) || String(c.Telefone_WhatsApp).replace(/\D/g, '').includes(f.q.replace(/\D/g, '') || '#')));
    $('#cli-table', el).innerHTML = table([
      { label: 'Nome', html: c => `<b>${esc(c.Nome)}</b>` },
      { label: 'WhatsApp', html: c => esc(c.Telefone_WhatsApp || '—') },
      { label: 'Tipo', html: c => badge(c.Tipo === 'Crediario' ? 'Crediário' : c.Tipo, c.Tipo === 'Mensalista' ? 'gold' : c.Tipo === 'Crediario' ? 'warn' : 'muted') },
      { label: 'Origem', html: c => esc(ACT_LABEL[c.Atividade_Origem] || c.Atividade_Origem || '—') },
      { label: 'Mensalidade', html: c => c.Tipo === 'Mensalista' ? `${money(c.Valor_Mensalidade)} · dia ${esc(c.Dia_Vencimento)}` : '—' },
      { label: '', cls: 'actions', html: c => `
        ${c.Telefone_WhatsApp ? `<button type="button" class="btn small wa" data-act="wa" data-id="${esc(c.ID)}">WhatsApp</button>` : ''}
        <button type="button" class="btn small ghost" data-act="editar" data-id="${esc(c.ID)}">✏️</button>
        ${isMaster() ? `<button type="button" class="btn small danger-ghost" data-act="excluir" data-id="${esc(c.ID)}">🗑</button>` : ''}` }
    ], rows, { empty: 'Nenhum cliente encontrado.' });
  };
  draw();
  el.oninput = e => { if (e.target.id === 'cli-q') { f.q = e.target.value; draw(); } };
  bindFilters(el, f, () => renderClientes(el));
  bind(el, {
    novo: () => clienteForm(),
    editar: d => clienteForm(cliente(d.id)),
    wa: d => { const c = cliente(d.id); openWA(c.Telefone_WhatsApp, `Olá ${c.Nome.split(' ')[0]}! Aqui é da Preto Rico 👋`); },
    excluir: async d => {
      if (await confirmModal(`Excluir o cliente <b>${esc(cliente(d.id).Nome)}</b>?`, { ok: 'Excluir', cls: 'danger' }) && await run(() => Api.exec('remove', { table: 'Clientes', id: d.id }), 'Cliente excluído')) refresh();
    }
  });
}

/* ==========================================================================
   13. USUÁRIOS E PERMISSÕES (MASTER)
   ========================================================================== */
RENDER.usuarios = { _: renderUsuarios };

function usuarioForm(row = {}) {
  const modOpts = Object.keys(MODULES).filter(m => m !== 'inicio').map(m => [m, `${MODULES[m].icon} ${MODULES[m].label}`]);
  formModal({
    title: row.ID ? `✏️ Editar ${row.Nome}` : '🔐 Novo usuário',
    values: { Nivel: 'Caixa', Status: 'Ativo', ...row, PIN_Acesso: '', Modulos_Permitidos: parseJSON(row.Modulos_Permitidos, []) },
    fields: [
      { name: 'Nome', label: 'Nome', required: true },
      { name: 'PIN_Acesso', label: row.ID ? 'Novo PIN (deixe vazio para manter)' : 'PIN de acesso (4 a 6 números)', type: 'password', pattern: '\\d{4,6}', required: !row.ID, inputmode: 'numeric', maxlength: 6 },
      { name: 'Nivel', label: 'Nível de acesso', type: 'select', options: LEVELS },
      { name: 'Status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'] },
      { name: 'Modulos_Permitidos', label: 'Módulos liberados', type: 'checks', options: modOpts, full: true,
        help: 'Deixe tudo desmarcado para usar o padrão do nível. O nível sempre limita o acesso: Barbeiro → Barbearia; Caixa → Lojas; Tatuador → Tatuagem; Master → tudo.' }
    ],
    onSubmit: async d => {
      const r = { ...row, ...d, ID: row.ID || uid('U') };
      if (!d.PIN_Acesso) delete r.PIN_Acesso;
      if (same(r.ID, S.user.ID) && r.Status === 'Inativo') throw new Error('Você não pode desativar o próprio usuário.');
      await Api.exec('salvarUsuario', { row: r });
      toast('Usuário salvo ✔', 'ok');
      refresh();
    }
  });
}

function renderUsuarios(el) {
  el.innerHTML = `<div class="toolbar"><button type="button" class="btn primary big" data-act="novo">➕ Novo usuário</button></div>
    ${table([
      { label: 'Nome', html: u => `<b>${esc(u.Nome)}</b>` },
      { label: 'Nível', html: u => badge(u.Nivel, u.Nivel === 'Master' ? 'gold' : 'info') },
      { label: 'Módulos', html: u => { const l = parseJSON(u.Modulos_Permitidos, []); return l?.length ? l.map(m => MODULES[m]?.icon || '').join(' ') : '<small class="muted">padrão do nível</small>'; } },
      { label: 'Situação', html: u => sBadge(u.Status || 'Ativo') },
      { label: '', cls: 'actions', html: u => `<button type="button" class="btn small ghost" data-act="editar" data-id="${esc(u.ID)}">✏️ Editar</button>
        ${!same(u.ID, S.user.ID) ? `<button type="button" class="btn small ${u.Status === 'Inativo' ? 'ok' : 'danger-ghost'}" data-act="toggle" data-id="${esc(u.ID)}">${u.Status === 'Inativo' ? 'Ativar' : 'Desativar'}</button>` : ''}` }
    ], users().slice().sort((a, b) => LEVELS.indexOf(a.Nivel) - LEVELS.indexOf(b.Nivel) || String(a.Nome).localeCompare(b.Nome)))}
    <div class="card" style="margin-top:1rem"><h3>ℹ️ O que cada nível pode fazer</h3>
      <p class="muted">👑 <b>Master</b>: tudo — custos, lucro, fechamentos, usuários.<br>💈 <b>Barbeiro</b>: agenda e lançamento de cortes, só a própria comissão.<br>
      🛒 <b>Caixa</b>: vendas, fiado e consulta de estoque, sem ver custo nem lucro. Desconto exige senha do Master.<br>🖋️ <b>Tatuador</b>: própria agenda e fechamento com a comissão da sala.</p></div>`;
  bind(el, {
    novo: () => usuarioForm(),
    editar: d => usuarioForm(users().find(u => same(u.ID, d.id))),
    toggle: async d => {
      const u = users().find(x => same(x.ID, d.id));
      const { PIN_Acesso, ...rest } = u;
      if (await run(() => Api.exec('salvarUsuario', { row: { ...rest, Status: u.Status === 'Inativo' ? 'Ativo' : 'Inativo' } }), 'Usuário atualizado')) refresh();
    }
  });
}

/* ==========================================================================
   14. CONFIGURAÇÕES (MASTER)
   ========================================================================== */
RENDER.config = { _: renderConfig };

function renderConfig(el) {
  const e = empresa();
  const c = Api.getCfg();
  el.innerHTML = `<div class="grid-2">
    <div class="card"><h3>🏪 Dados do recibo</h3>
      <div class="form-grid">
        <div class="field full"><label>Nome da empresa</label><input id="cf-nome" value="${esc(e.nome)}"></div>
        <div class="field"><label>CNPJ / CPF</label><input id="cf-doc" value="${esc(e.doc)}"></div>
        <div class="field"><label>Telefone</label><input id="cf-tel" value="${esc(e.tel)}"></div>
        <div class="field full"><label>Endereço</label><input id="cf-end" value="${esc(e.end)}"></div>
        <div class="field"><label>% padrão da sala (tatuagem)</label><input id="cf-tat" type="number" min="0" max="100" value="${esc(cfgVal('comissao_master_tattoo', 30))}"></div>
      </div>
      <button type="button" class="btn primary" data-act="salvarEmp" style="margin-top:1rem">💾 Salvar</button>
    </div>
    <div class="card"><h3>💬 Mensagens de WhatsApp (mensalistas)</h3>
      <p class="muted small">Use {nome}, {valor} e {dia}.</p>
      <div class="field"><label>Lembrete de vencimento</label><textarea id="cf-msg1">${esc(cfgVal('msg_mensalidade', MSG_MENSAL))}</textarea></div>
      <div class="field" style="margin-top:.6rem"><label>Cobrança de atraso</label><textarea id="cf-msg2">${esc(cfgVal('msg_atraso', MSG_ATRASO))}</textarea></div>
      <button type="button" class="btn primary" data-act="salvarMsg" style="margin-top:1rem">💾 Salvar mensagens</button>
    </div>
    <div class="card"><h3>☁️ Servidor (Google Sheets)</h3>
      <p>Modo atual: <b>${Api.isRemote() ? 'Conectado à planilha' : 'Local (somente neste aparelho)'}</b></p>
      ${c.url ? `<p class="muted small" style="word-break:break-all">${esc(c.url)}</p>` : ''}
      <p>Pendentes de envio: <b>${Api.pending()}</b></p>
      <div class="btn-row"><button type="button" class="btn" data-act="server">⚙️ Alterar servidor</button>
        ${Api.isRemote() ? '<button type="button" class="btn primary" data-act="sync">🔄 Sincronizar agora</button>' : ''}</div>
    </div>
    <div class="card" id="cf-autobk">${autoBackupCard()}</div>
    <div class="card"><h3>💾 Backup manual</h3>
      <p class="muted small">Exporte uma cópia dos dados deste aparelho em JSON. A importação só é usada no modo local.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="export">⬇️ Exportar backup</button>
        ${!Api.isRemote() ? `<label class="btn">⬆️ Importar backup<input type="file" id="cf-import" accept=".json" hidden></label>
        <button type="button" class="btn danger-ghost" data-act="demo">Restaurar dados de demonstração</button>` : ''}
      </div>
    </div></div>`;
  const saveCfg = (k, v) => Api.exec('salvarConfig', { Chave: k, Valor: v });
  bind(el, {
    salvarEmp: async () => {
      const ok = await run(async () => {
        await saveCfg('empresa', { nome: $('#cf-nome').value.trim() || 'Preto Rico', doc: $('#cf-doc').value.trim(), tel: $('#cf-tel').value.trim(), end: $('#cf-end').value.trim() });
        await saveCfg('comissao_master_tattoo', num($('#cf-tat').value));
      }, 'Configurações salvas ✔');
      if (ok) renderConfig(el);
    },
    salvarMsg: () => run(async () => { await saveCfg('msg_mensalidade', $('#cf-msg1').value); await saveCfg('msg_atraso', $('#cf-msg2').value); }, 'Mensagens salvas ✔'),
    server: serverConfigModal,
    sync: () => doSync(false),
    export: () => {
      const blob = new Blob([Api.exportJSON()], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `preto-rico-backup-${isoDate()}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    demo: async () => {
      if (await confirmModal('Apagar os dados locais e restaurar a demonstração?', { ok: 'Restaurar', cls: 'danger' })) { Api.seed(demoData(), true); logout(); }
    },
    bkAtivar: async () => { if (await run(AutoBackup.ativar, 'Backup automático ativado neste computador ✔')) renderConfig(el); },
    bkAgora: async () => { if (await run(() => AutoBackup.rodar(true), 'Backup salvo na pasta ✔')) renderConfig(el); },
    bkDesativar: async () => {
      if (await confirmModal('Desativar o backup automático neste computador? Os arquivos já salvos continuam na pasta.', { ok: 'Desativar', cls: 'danger' })) { await AutoBackup.desativar(); renderConfig(el); }
    }
  });
  AutoBackup.status().then(() => { const c = $('#cf-autobk', el); if (c) c.innerHTML = autoBackupCard(); });
  el.onchange = async ev => {
    if (ev.target.id === 'cf-import') {
      const file = ev.target.files[0];
      if (!file) return;
      if (await run(async () => Api.importJSON(await readFileText(file, 'utf-8')), 'Backup importado ✔')) refresh();
    }
  };
}

/* ==========================================================================
   14b. BACKUP AUTOMÁTICO NO COMPUTADOR
   Usa a File System Access API (Chrome/Edge no computador): o Master escolhe
   uma pasta uma única vez e o sistema grava uma cópia JSON por dia nela,
   mantendo os 30 arquivos mais recentes. Celulares não têm essa API, então
   neles o sistema funciona só pela rede, sem backup local.
   ========================================================================== */
const AutoBackup = (() => {
  const LS_LAST = 'pr_backup_last';
  const INTERVALO = 6 * 3600 * 1000; // no máximo uma gravação a cada 6 horas
  const MANTER = 30;
  let estado = { suportado: !!window.showDirectoryPicker, ativo: false, pasta: '', permissao: '', ultimo: 0 };

  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('pr_backup', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const kv = async (mode, fn) => {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  };
  const getDir = () => kv('readonly', s => s.get('dir')).catch(() => null);
  const lastRun = () => { try { return Number(localStorage.getItem(LS_LAST) || 0); } catch (e) { return 0; } };

  async function status() {
    const dir = estado.suportado ? await getDir() : null;
    estado.ativo = !!dir;
    estado.pasta = dir?.name || '';
    estado.permissao = dir ? await dir.queryPermission({ mode: 'readwrite' }) : '';
    estado.ultimo = lastRun();
    return estado;
  }

  async function ativar() {
    if (!estado.suportado) throw new Error('Este aparelho não permite backup automático. Use o Google Chrome ou o Edge no computador do caixa.');
    const dir = await window.showDirectoryPicker({ id: 'preto-rico-backup', mode: 'readwrite', startIn: 'documents' });
    await kv('readwrite', s => s.put(dir, 'dir'));
    await rodar(true);
  }

  async function desativar() {
    await kv('readwrite', s => s.delete('dir'));
    try { localStorage.removeItem(LS_LAST); } catch (e) { /* sem storage */ }
    await status();
  }

  /** Grava o backup do dia. force=true ignora o intervalo e pode pedir permissão (precisa de um toque). */
  async function rodar(force = false) {
    if (!estado.suportado) return false;
    const dir = await getDir();
    if (!dir) return false;
    if (!force && Date.now() - lastRun() < INTERVALO) return false;
    let perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && force) perm = await dir.requestPermission({ mode: 'readwrite' });
    estado.permissao = perm;
    if (perm !== 'granted') { if (force) throw new Error('O navegador não liberou a pasta de backup.'); return false; }
    if (Api.isRemote()) { try { await Api.sync(); } catch (e) { /* sem internet: grava o que está no aparelho */ } }
    const nome = `preto-rico-backup-${isoDate()}.json`;
    const fh = await dir.getFileHandle(nome, { create: true });
    const w = await fh.createWritable();
    await w.write(Api.exportJSON());
    await w.close();
    // mantém só os mais recentes
    const arquivos = [];
    for await (const [n, h] of dir.entries()) if (h.kind === 'file' && /^preto-rico-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)) arquivos.push(n);
    arquivos.sort().reverse().slice(MANTER).forEach(n => dir.removeEntry(n).catch(() => {}));
    try { localStorage.setItem(LS_LAST, String(Date.now())); } catch (e) { /* sem storage */ }
    estado.ultimo = Date.now();
    return true;
  }

  return { status, ativar, desativar, rodar, get estado() { return estado; } };
})();

function autoBackupCard() {
  const e = AutoBackup.estado;
  if (!e.suportado) return `<h3>🖥️ Backup automático</h3>
    <p class="muted">Este aparelho só acessa o sistema pela rede, sem backup local. Para ativar o backup automático, entre como Master no computador do caixa usando Google Chrome ou Edge.</p>`;
  if (!e.ativo) return `<h3>🖥️ Backup automático neste computador</h3>
    <p class="muted">Escolha uma pasta do computador (por exemplo, Documentos › Backup Preto Rico). O sistema grava uma cópia por dia e guarda as últimas 30.</p>
    <button type="button" class="btn primary big" data-act="bkAtivar">📁 Ativar e escolher a pasta</button>`;
  return `<h3>🖥️ Backup automático neste computador</h3>
    <p>${badge('Ativo', 'ok')} Pasta: <b>${esc(e.pasta)}</b></p>
    <p class="muted small">Último backup: ${e.ultimo ? fmtDate(isoDT(new Date(e.ultimo))) : 'ainda não feito'}${e.permissao !== 'granted' ? ' · o navegador pede para liberar a pasta de novo' : ''}</p>
    <div class="btn-row"><button type="button" class="btn primary" data-act="bkAgora">💾 Fazer backup agora</button>
      <button type="button" class="btn danger-ghost" data-act="bkDesativar">Desativar</button></div>`;
}

/** Roda em segundo plano ao entrar no sistema; se o navegador pedir, mostra aviso na tela inicial. */
async function autoBackupTick() {
  try {
    const st = await AutoBackup.status();
    if (!st.ativo) return;
    if (st.permissao === 'granted') { await AutoBackup.rodar(false); return; }
    if (Date.now() - st.ultimo > 20 * 3600 * 1000 && S.view === 'inicio') {
      const box = $('#view-inicio .alerts');
      if (box && !$('#bk-alert')) {
        box.insertAdjacentHTML('afterbegin', `<div class="alert warn" id="bk-alert"><span class="ic">💾</span><div>Backup do computador pendente. <button type="button" class="btn small primary" id="bk-liberar">Liberar e salvar backup</button></div></div>`);
        $('#bk-liberar').onclick = async () => { if (await run(() => AutoBackup.rodar(true), 'Backup salvo ✔')) $('#bk-alert')?.remove(); };
      }
    }
  } catch (e) { console.warn('Backup automático:', e); }
}

/* ==========================================================================
   15. DADOS DE DEMONSTRAÇÃO (modo local)
   ========================================================================== */
function demoData() {
  const hoje = isoDate();
  const d = n => addDays(hoje, n);
  const ag = (id, dia, hora, cli, barb, serv, valor, status) => ({ ID: id, DataHora: `${dia}T${hora}`, ID_Cliente: cli[0], Nome_Cliente: cli[1], ID_Barbeiro: barb, Servico: serv, Valor: valor, Comissao_Valor: r2(valor * (serv === 'Pigmentação' ? 0.4 : 0.5)), Status: status });
  const C1 = ['C1', 'Carlos Henrique'], C2 = ['C2', 'Rafael Souza'], C3 = ['C3', 'Marcos Lima'], C4 = ['C4', 'Diego Alves'];
  const vendas = [], itens = [];
  const P = {
    P1: ['Tabacaria', 'Essência Zomo 50g', 30, 5, 9, 18], P2: ['Tabacaria', 'Carvão de coco 1kg', 4, 8, 15, 30], P3: ['Tabacaria', 'Seda King Size', 40, 10, 1.2, 3],
    P4: ['Tabacaria', 'Camiseta Preto Rico', 12, 5, 35, 79.9], P5: ['Tabacaria', 'Boné Aba Reta', 2, 4, 28, 69.9], P6: ['Tabacaria', 'Isqueiro Clipper', 25, 10, 4.5, 12],
    P7: ['Celulares', 'Película 3D iPhone', 40, 10, 3, 25], P8: ['Celulares', 'Capinha Silicone', 3, 10, 6, 35], P9: ['Celulares', 'Carregador Turbo 20W', 8, 5, 22, 69.9],
    P10: ['Celulares', 'Fone Bluetooth TWS', 1, 3, 45, 129.9], P11: ['Celulares', 'Cabo USB-C 1m', 30, 10, 5, 25]
  };
  const estoque = Object.entries(P).map(([ID, [Atividade, Produto, Qtd, Minimo, Preco_Custo, Preco_Venda]]) => ({ ID, Atividade, Produto, Qtd, Minimo, Preco_Custo, Preco_Venda }));
  const venda = (id, dia, hora, user, act, forma, lista, cli) => {
    let tot = 0, custo = 0;
    lista.forEach(([pid, q]) => {
      const p = estoque.find(x => x.ID === pid);
      const sub = r2(q * p.Preco_Venda);
      tot += sub; custo += q * p.Preco_Custo;
      itens.push({ ID_Venda: id, ID_Produto: pid, Nome_Produto: p.Produto, Qtd: q, Preco_Custo_Unit: p.Preco_Custo, Preco_Venda_Unit: p.Preco_Venda, Subtotal: sub });
    });
    vendas.push({ ID_Venda: id, DataHora: `${dia}T${hora}`, ID_Usuario: user, Atividade: act, Total_Venda: r2(tot), Preco_Custo_Total: r2(custo), Forma_Pagamento: forma, Status_Crediario: forma === 'Crediario' ? 'Aberto' : '', ID_Cliente: cli?.[0] || '', Nome_Cliente: cli?.[1] || '' });
  };
  venda('V1', d(-6), '10:15', 'U3', 'Tabacaria', 'Pix', [['P1', 2], ['P2', 1]]);
  venda('V2', d(-5), '15:40', 'U3', 'Celulares', 'Cartao', [['P9', 1], ['P7', 1]]);
  venda('V3', d(-3), '11:05', 'U3', 'Tabacaria', 'Crediario', [['P4', 1], ['P6', 2]], C3);
  venda('V4', d(-2), '17:20', 'U3', 'Celulares', 'Dinheiro', [['P11', 2], ['P8', 1]]);
  venda('V5', d(-1), '19:00', 'U3', 'Tabacaria', 'Pix', [['P1', 3], ['P3', 5]]);
  venda('V6', hoje, '09:45', 'U3', 'Celulares', 'Pix', [['P7', 2]]);
  venda('V7', d(-4), '16:00', 'U3', 'Celulares', 'Crediario', [['P10', 1]], C4);
  return {
    Usuarios: [
      { ID: 'U1', Nome: 'Dono Master', PIN_Acesso: '1234', Nivel: 'Master', Modulos_Permitidos: '[]', Status: 'Ativo' },
      { ID: 'U2', Nome: 'João Barbeiro', PIN_Acesso: '1111', Nivel: 'Barbeiro', Modulos_Permitidos: '[]', Status: 'Ativo' },
      { ID: 'U5', Nome: 'Pedro Navalha', PIN_Acesso: '5555', Nivel: 'Barbeiro', Modulos_Permitidos: '[]', Status: 'Ativo' },
      { ID: 'U3', Nome: 'Ana Caixa', PIN_Acesso: '2222', Nivel: 'Caixa', Modulos_Permitidos: '[]', Status: 'Ativo' },
      { ID: 'U4', Nome: 'Léo Tattoo', PIN_Acesso: '3333', Nivel: 'Tatuador', Modulos_Permitidos: '[]', Status: 'Ativo' }
    ],
    Clientes: [
      { ID: 'C1', Nome: 'Carlos Henrique', Telefone_WhatsApp: '11988887777', Tipo: 'Mensalista', Status_Mensalidade: 'Em dia', Valor_Mensalidade: 120, Dia_Vencimento: 5, Atividade_Origem: 'Barbearia', Ultimo_Pagamento: monthOf(hoje) + '-04' },
      { ID: 'C2', Nome: 'Rafael Souza', Telefone_WhatsApp: '11977776666', Tipo: 'Mensalista', Status_Mensalidade: 'Pendente', Valor_Mensalidade: 100, Dia_Vencimento: 1, Atividade_Origem: 'Barbearia', Ultimo_Pagamento: addMonthDate(hoje, -1) },
      { ID: 'C5', Nome: 'Bruno Costa', Telefone_WhatsApp: '11966665555', Tipo: 'Mensalista', Status_Mensalidade: 'Pendente', Valor_Mensalidade: 150, Dia_Vencimento: 28, Atividade_Origem: 'Barbearia', Ultimo_Pagamento: addMonthDate(hoje, -1) },
      { ID: 'C3', Nome: 'Marcos Lima', Telefone_WhatsApp: '11955554444', Tipo: 'Crediario', Atividade_Origem: 'Tabacaria' },
      { ID: 'C4', Nome: 'Diego Alves', Telefone_WhatsApp: '11944443333', Tipo: 'Crediario', Atividade_Origem: 'Celulares' }
    ],
    Agenda_Barbearia: [
      ag('AB1', d(-2), '10:00', C1, 'U2', 'Corte', 40, 'Concluido'), ag('AB2', d(-2), '11:00', C2, 'U5', 'Corte + Barba', 60, 'Concluido'),
      ag('AB3', d(-1), '14:00', C3, 'U2', 'Pigmentação', 25, 'Concluido'), ag('AB4', hoje, '09:00', C4, 'U2', 'Barba', 30, 'Concluido'),
      ag('AB5', hoje, '16:00', C1, 'U2', 'Corte', 40, 'Agendado'), ag('AB6', hoje, '17:30', ['', 'Cliente avulso'], 'U5', 'Corte + Barba', 60, 'Agendado'),
      ag('AB7', d(1), '10:30', C2, 'U5', 'Corte', 40, 'Agendado')
    ],
    Agenda_Tatuagem: [
      { ID: 'AT1', DataHora: `${d(-3)}T14:00`, ID_Cliente: 'C4', Nome_Cliente: 'Diego Alves', ID_Tatuador: 'U4', Descricao_Servico: 'Leão realista antebraço', Valor_Total: 800, Comissao_Master: 240, Status: 'Concluido' },
      { ID: 'AT2', DataHora: `${d(-1)}T15:00`, ID_Cliente: '', Nome_Cliente: 'Juliana Prado', ID_Tatuador: 'U4', Descricao_Servico: 'Fineline costela', Valor_Total: 350, Comissao_Master: 105, Status: 'Concluido' },
      { ID: 'AT3', DataHora: `${d(1)}T13:00`, ID_Cliente: 'C2', Nome_Cliente: 'Rafael Souza', ID_Tatuador: 'U4', Descricao_Servico: 'Fechamento de braço (sessão 2)', Valor_Total: 1200, Comissao_Master: 360, Status: 'Agendado' }
    ],
    Estoque: estoque,
    Vendas_PDV: vendas,
    Vendas_Itens: itens,
    Financeiro_Contas: [
      { ID: 'F1', Tipo: 'Despesa', Descricao: 'Aluguel do salão', Valor: 2500, Vencimento: monthOf(hoje) + '-10', Categoria: 'Fixa', Banco: 'Nubank', Status: 'Pendente', Data_Pagamento: '', Fitid_OFX: '' },
      { ID: 'F2', Tipo: 'Conta_Pagar', Descricao: 'Energia elétrica', Valor: 480.35, Vencimento: d(3), Categoria: 'Fixa', Banco: '', Status: 'Pendente', Data_Pagamento: '', Fitid_OFX: '' },
      { ID: 'F3', Tipo: 'Custo', Descricao: 'Fornecedor de essências', Valor: 650, Vencimento: d(-5), Categoria: 'Tabacaria', Banco: 'Itaú', Status: 'Pago', Data_Pagamento: d(-5), Fitid_OFX: '' },
      { ID: 'F4', Tipo: 'Despesa', Descricao: 'Internet fibra', Valor: 129.9, Vencimento: d(8), Categoria: 'Fixa', Banco: '', Status: 'Pendente', Data_Pagamento: '', Fitid_OFX: '' }
    ],
    Fechamento_Comissoes: [],
    Recebimentos: [
      { ID: 'RC1', DataHora: `${monthOf(hoje)}-04T10:00`, Tipo: 'Mensalidade', ID_Cliente: 'C1', Nome_Cliente: 'Carlos Henrique', Atividade: 'Barbearia', Valor: 120, Forma_Pagamento: 'Pix', ID_Usuario: 'U1', Referencia: monthOf(hoje) }
    ],
    Conciliacao: [],
    Config: [
      { Chave: 'servicos', Valor: JSON.stringify(DEFAULT_SERVICOS) },
      { Chave: 'empresa', Valor: JSON.stringify({ nome: 'Preto Rico', doc: '', end: '', tel: '' }) },
      { Chave: 'comissao_master_tattoo', Valor: '30' }
    ]
  };
}

/* ==========================================================================
   16. INICIALIZAÇÃO
   ========================================================================== */
function applyTheme(t) {
  const theme = t || (() => { try { return localStorage.getItem('pr_theme'); } catch (e) { return null; } })() || 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('pr_theme', theme); } catch (e) { /* sem storage */ }
}

function init() {
  applyTheme();
  if (!Api.isRemote()) Api.seed(demoData());

  // Ações globais (menu, tema, sair, sincronizar)
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-global]');
    if (g) {
      const a = g.dataset.global;
      if (a === 'menu') document.body.classList.add('menu-open');
      if (a === 'menu-close') document.body.classList.remove('menu-open');
      if (a === 'theme') applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      if (a === 'logout') confirmModal('Deseja sair do sistema?', { ok: 'Sair', cls: 'danger' }).then(ok => ok && logout());
      if (a === 'sync') Api.isRemote() ? doSync(false) : toast('Modo local: os dados ficam salvos neste aparelho.', '');
      return;
    }
    const tab = e.target.closest('.tab[data-tab]');
    if (tab) go(tab.closest('.view').id.replace('view-', ''), tab.dataset.tab);
  });

  $('#login-back').onclick = showLogin;
  $('#login-cfg').onclick = serverConfigModal;
  $$('[data-receipt-close]').forEach(b => { b.onclick = closeReceipt; });
  $('#receipt-print').onclick = () => printNow($('#receipt').innerHTML);
  $('#receipt-modal').addEventListener('mousedown', e => { if (e.target.id === 'receipt-modal') closeReceipt(); });

  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { updateSync(); doSync(true); });
  window.addEventListener('offline', updateSync);
  Api.onChange(info => {
    if (info.type === 'session-expired') { toast('Sua sessão expirou. Entre novamente.', 'warn'); logout(); }
    if (S.user) updateSync();
  });
  // sincronização periódica (a cada 2 minutos) quando conectado
  setInterval(() => { if (S.user && Api.isRemote() && document.visibilityState === 'visible') doSync(true); }, 120000);
  // backup automático do computador (verifica a cada hora; grava no máximo a cada 6 h)
  setInterval(() => { if (S.user) autoBackupTick(); }, 3600000);

  if (Api.session()?.user) enterApp(); else showLogin();
}

document.addEventListener('DOMContentLoaded', init);
