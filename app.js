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
  Caixa: ['inicio', 'barbearia', 'tabacaria', 'celulares', 'tatuagem', 'clientes'],
  Tatuador: ['inicio', 'tatuagem', 'clientes']
};
const LEVELS = Object.keys(LEVEL_CAP);
const STORE_ACT = { barbearia: 'Barbearia', tabacaria: 'Tabacaria', celulares: 'Celulares', tatuagem: 'Tatuagem' };
const ACT_LABEL = { Barbearia: 'Barbearia', Tabacaria: 'Tabacaria & Roupas', Celulares: 'Celulares & Acess.', Tatuagem: 'Tatuagem' };
const PAY = [
  { id: 'Pix', label: 'Pix', icon: '⚡' },
  { id: 'Cartao', label: 'Cartão', icon: '💳' },
  { id: 'Dinheiro', label: 'Dinheiro', icon: '💵' },
  { id: 'Crediario', label: 'Fiado', icon: '📒' }
];
const payLabel = id => (PAY.find(p => p.id === id) || { label: id || '—' }).label;
const DEFAULT_SERVICOS = [
  { nome: 'Corte', preco: 40, duracao: 30, comissao: 50 },
  { nome: 'Barba', preco: 30, duracao: 30, comissao: 50 },
  { nome: 'Corte + Barba', preco: 60, duracao: 60, comissao: 50 },
  { nome: 'Pigmentação', preco: 25, duracao: 30, comissao: 40 },
  { nome: 'Sobrancelha', preco: 15, duracao: 15, comissao: 50 }
];
const STATUS_TONE = {
  Agendado: 'info', 'Em andamento': 'warn', Concluido: 'ok', Cancelado: 'danger', Pendente: 'warn', Pago: 'ok', 'Em dia': 'ok',
  Atrasado: 'danger', Aberto: 'warn', Quitado: 'ok', Ativo: 'ok', Inativo: 'muted', A: 'ok', B: 'warn', C: 'muted'
};
const STATUS_LABEL = { Concluido: 'Concluído', Crediario: 'Fiado', Cartao: 'Cartão' };

const S = {
  user: null, view: null, tabs: {}, cal: {}, filters: {},
  cart: { barbearia: [], tabacaria: [], celulares: [], tatuagem: [] }, pay: { barbearia: 'Pix', tabacaria: 'Pix', celulares: 'Pix', tatuagem: 'Pix' },
  cli: { barbearia: '', tabacaria: '', celulares: '', tatuagem: '' }, pdvAuth: {}, ofx: null
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
  document.body.appendChild(m); // fica por cima de outra janela aberta (ex.: pagamentos)
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
    intro: `<p class="muted">Cole a URL da implantação (termina em <b>/exec</b>) e a chave <b>API_SECRET</b> gerada pelo setup(). Deixe em branco para voltar ao servidor padrão do Preto Rico.</p>`,
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
  S.cart = { tabacaria: [], celulares: [], tatuagem: [] };
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
    const viaLink = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, S.user.ID) && a.Origem === 'Link' && a.Status === 'Agendado' && dayOf(a.DataHora) >= hoje);
    if (viaLink.length) alerts.push(['info', '🔗', `<b>${viaLink.length}</b> horário(s) marcados por mensalista no link. <a href="#barbearia/agenda">Ver agenda</a>`]);
  } else if (lvl() === 'Tatuador') {
    const minhas = T('Agenda_Tatuagem').filter(a => same(a.ID_Tatuador, S.user.ID));
    const hojeS = minhas.filter(a => dayOf(a.DataHora) === hoje && a.Status !== 'Cancelado');
    const mes = minhas.filter(a => a.Status === 'Concluido' && monthOf(a.DataHora) === monthOf(hoje));
    const emAnd = minhas.find(a => a.Status === 'Em andamento');
    tiles = tile('#tatuagem/agenda', emAnd ? '⏱️' : '📅', emAnd ? 'Serviço em andamento' : 'Minha agenda', emAnd ? `${emAnd.Nome_Cliente} · toque para finalizar` : `${hojeS.length} sessão(ões) hoje`, true)
      + tile('#tatuagem/pagamentos', '💳', 'Pagamentos', 'Receber e parcelar')
      + tile('#tatuagem/loja', '🛍️', 'Vender produto', 'Pomadas e cuidados')
      + tile('#tatuagem/fechamento', '💵', 'Meu fechamento', 'Semana, mês ou período')
      + tile('#tatuagem/repasses', '🤝', 'Repasses ao Master', 'Comissão do mês')
      + tile('#tatuagem/avisos', '📲', 'Avisos e link', 'Mandar ao cliente')
      + tile('#tatuagem/relatorios', '📊', 'Relatórios', 'Trabalhos, tempo e estoque');
    resumo = kpi('Produzido no mês', money(sum(mes, 'Valor_Total')), 'gold') + kpi('Comissão do Master no mês', money(sum(mes, 'Comissao_Master')), 'warn');
  } else {
    if (!isMaster() && mods.includes('barbearia')) {
      tiles += tile('#barbearia/lancar', '✂️', 'Lançar corte', 'Avulso ou mensalista', true)
        + tile('#barbearia/agenda', '📅', 'Agenda da barbearia', 'Marcar horário com o barbeiro')
        + tile('#barbearia/mensalistas', '⭐', 'Mensalistas', 'Link, Pix e histórico')
        + tile('#barbearia/vender', '🛒', 'Vender na barbearia', 'Produtos do balcão');
    }
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
      if (mods.includes('tatuagem')) tiles += tile('#tatuagem/agenda', '🖋️', 'Agenda da tatuagem', 'Marcar sessão para o tatuador');
      if (mods.includes('clientes')) tiles += tile('#clientes', '👥', 'Clientes', 'Cadastrar cliente');
    }
    const vendasHoje = T('Vendas_PDV').filter(v => dayOf(v.DataHora) === hoje && v.Atividade !== 'Tatuagem' && (isMaster() || same(v.ID_Usuario, S.user.ID)));
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
  if (mods.includes('barbearia') && ['Master', 'Caixa'].includes(lvl())) {
    const pix = T('Mensal_Pagamentos').filter(x => x.Status === 'Informado');
    if (pix.length) alerts.unshift(['warn', '💳', `<b>${pix.length}</b> mensalista(s) mandaram o comprovante do Pix: ${money(sum(pix, 'Valor'))}. <a href="#barbearia/mensalistas">Conferir</a>`]);
    const link = T('Agenda_Barbearia').filter(a => a.Origem === 'Link' && a.Status === 'Agendado' && dayOf(a.DataHora) === hoje);
    if (link.length) alerts.push(['info', '🔗', `<b>${link.length}</b> horário(s) de hoje marcados pelo mensalista no link. <a href="#barbearia/agenda">Ver agenda</a>`]);
  }
  if (mods.includes('tatuagem')) {
    const av = tatAvisos();
    if (av.length) alerts.unshift(['danger', '🔔', `<b>${av.length}</b> sessão(ões) de tatuagem alterada(s) por outra pessoa. <a href="#tatuagem/agenda">Ver e dar ciente</a>`]);
    const ped = tatVisiveis().filter(a => a.Status === 'Solicitado');
    if (ped.length) alerts.unshift(['warn', '🔗', `<b>${ped.length}</b> pedido(s) de agendamento pelo link com comprovante para conferir. <a href="#tatuagem/agenda">Confirmar</a>`]);
    if (lvl() === 'Tatuador') {
      const mesAnt = addMonth(monthOf(hoje), -1);
      const dev = sum(T('Agenda_Tatuagem').filter(a => same(a.ID_Tatuador, S.user.ID) && a.Status === 'Concluido' && monthOf(a.DataHora) === mesAnt), 'Comissao_Master');
      const rep = sum(T('Tattoo_Repasses').filter(r => r.Mes === mesAnt && r.Status !== 'Cancelado'), 'Valor');
      if (dev - rep > 0.009) alerts.push(['warn', '🤝', `Falta repassar <b>${money(dev - rep)}</b> da comissão de ${esc(fmtMonth(mesAnt))} ao Master. <a href="#tatuagem/repasses">Registrar repasse</a>`]);
    }
    if (isMaster()) {
      const inf = T('Tattoo_Repasses').filter(r => r.Status === 'Informado');
      if (inf.length) alerts.push(['info', '🤝', `<b>${inf.length}</b> repasse(s) de tatuador para confirmar: ${money(sum(inf, 'Valor'))}. <a href="#tatuagem/repasses">Conferir</a>`]);
    }
    const venc = T('Tattoo_Pagamentos').filter(p => p.Status === 'Aberto' && p.Vencimento && p.Vencimento < hoje && (lvl() !== 'Tatuador' || same(p.ID_Tatuador, S.user.ID)));
    if (venc.length) alerts.push(['warn', '💳', `<b>${venc.length}</b> parcela(s) de tatuagem vencida(s): ${money(sum(venc, 'Valor'))}. <a href="#tatuagem/pagamentos">Cobrar</a>`]);
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
  // Produtos do estúdio de tatuagem são do tatuador: não entram no faturamento do Master
  T('Vendas_PDV').filter(v => inRange(v.DataHora, de, ate) && want(v.Atividade) && v.Atividade !== 'Tatuagem').forEach(v => {
    bruto += num(v.Total_Venda); cmv += num(v.Preco_Custo_Total); acts[v.Atividade] = (acts[v.Atividade] || 0) + num(v.Total_Venda);
  });
  if (want('Barbearia')) {
    // Corte de mensalista já entrou na mensalidade: conta só a comissão do barbeiro
    T('Agenda_Barbearia').filter(a => a.Status === 'Concluido' && inRange(a.DataHora, de, ate)).forEach(a => {
      const v = a.Mensalista === 'Sim' ? 0 : num(a.Valor);
      bruto += v; comissoes += num(a.Comissao_Valor); acts.Barbearia += v;
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
  vender: el => storePDV(el, 'barbearia'), estoque: el => storeEstoque(el, 'barbearia'),
  relatorio: barbRelatorio, servicos: barbServicos
};

const canEditBarb = a => isMaster() || same(a.ID_Barbeiro, S.user.ID);

async function saveAgBarb(row) {
  const s = servicos().find(x => x.nome === row.Servico);
  const pctCom = s ? num(s.comissao) : num(cfgVal('comissao_barbeiro_padrao', 50));
  row.ID = row.ID || uid('AB');
  row.Comissao_Valor = r2(num(row.Valor) * pctCom / 100);
  if (!num(row.Duracao_Min)) row.Duracao_Min = num(s?.duracao) || 30;
  // Cliente cadastrado como mensalista: o horário entra no histórico dele
  if (row.Mensalista === undefined && row.ID_Cliente) row.Mensalista = cliente(row.ID_Cliente)?.Tipo === 'Mensalista' ? 'Sim' : '';
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
  const mens = a.Mensalista === 'Sim';
  showReceipt(receiptHTML({
    titulo: 'RECIBO — BARBEARIA', id: a.ID, data: a.DataHora, cliente: a.Nome_Cliente,
    operador: userName(a.ID_Barbeiro), itens: [[a.Servico + (mens ? ' (mensalista)' : ''), 1, mens ? 0 : a.Valor]], total: mens ? 0 : a.Valor,
    extras: mens ? [['Pagamento', 'Incluído na mensalidade']] : undefined
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
      <div class="ag-title">${esc(a.Nome_Cliente)} ${sBadge(a.Status)}${bar && a.Mensalista === 'Sim' ? ' ' + badge('⭐ Mensalista', 'gold') : ''}${bar && a.Origem === 'Link' ? ' ' + badge('🔗 Marcou pelo link', 'info') : ''}</div>
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
  const st = S.filters.lancar ||= { barb: '', cliente: '', mensal: false, mensalId: '' };
  if (isBarb) st.barb = S.user.ID;
  if (!st.barb && barbers[0]) st.barb = barbers[0].ID;
  const hoje = isoDate();
  const mensalistas = clientes().filter(c => c.Tipo === 'Mensalista');
  const cortes = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, st.barb) && dayOf(a.DataHora) === hoje && a.Status === 'Concluido')
    .sort((a, b) => String(b.DataHora).localeCompare(a.DataHora));
  const espera = T('Agenda_Barbearia').filter(a => same(a.ID_Barbeiro, st.barb) && dayOf(a.DataHora) === hoje && a.Status === 'Agendado');
  const mSel = st.mensal ? cliente(st.mensalId) : null;

  el.innerHTML = `
    <div class="kpis">${kpi('Cortes hoje', cortes.length, 'gold')}${kpi('Produzido hoje', money(sum(cortes, 'Valor')))}${kpi(isBarb ? 'Minha comissão hoje' : 'Comissão do barbeiro', money(sum(cortes, 'Comissao_Valor')), 'ok')}</div>
    <div class="card">
      <h3>1️⃣ Quem atendeu e qual cliente?</h3>
      <div class="form-inline">
        ${!isBarb ? `<label>Barbeiro<select id="lc-barb">${opts(barbers.map(b => [b.ID, b.Nome]), st.barb)}</select></label>` : ''}
      </div>
      <div class="cart-section-title">O cliente é mensalista?</div>
      <div class="choice-grid" style="grid-template-columns:1fr 1fr;max-width:420px">
        <button type="button" class="choice ${!st.mensal ? 'sel' : ''}" data-act="mensal" data-v="0"><span>👤</span>Não, avulso</button>
        <button type="button" class="choice ${st.mensal ? 'sel' : ''}" data-act="mensal" data-v="1"><span>⭐</span>Sim, mensalista</button>
      </div>
      <div class="form-inline" style="margin-top:.6rem">
        ${st.mensal
          ? `<label>Qual mensalista?<select id="lc-mens">${opts([['', '— Escolha o mensalista —'], ...mensalistas.map(c => [c.ID, c.Nome])], st.mensalId)}</select></label>`
          : `<label>Nome do cliente (opcional)<input id="lc-cli" list="dl-clientes" value="${esc(st.cliente)}" placeholder="Ex.: João da Silva"></label>`}
      </div>
      ${mSel ? `<p class="muted small" style="margin-top:.4rem">⭐ O corte entra no histórico de <b>${esc(mSel.Nome)}</b> e não é cobrado no balcão (já está na mensalidade). Mensalidade: ${badge(statusMensal(mSel) === 'Pendente' ? 'A vencer' : statusMensal(mSel), STATUS_TONE[statusMensal(mSel)])}</p>` : ''}
      ${st.mensal && !mensalistas.length ? '<p class="muted">Nenhum mensalista cadastrado ainda.</p>' : ''}
      <h3>2️⃣ Toque no serviço feito</h3>
      <div class="service-grid">${servicos().map((s, i) => `<button type="button" class="service-btn" data-act="lancar" data-i="${i}">
        <strong>${esc(s.nome)}</strong><span>${st.mensal ? '⭐ Mensalista' : money(s.preco)}</span><small>Comissão ${num(s.comissao)}% = ${money(num(s.preco) * num(s.comissao) / 100)}</small></button>`).join('')}</div>
    </div>
    ${espera.length ? `<div class="card"><h3>⏰ Clientes agendados hoje</h3><div class="ag-list">${espera.map(a => agendaItem(a, 'barbearia')).join('')}</div></div>` : ''}
    <div class="card"><h3>✅ Lançados hoje</h3>
      ${table([
        { label: 'Hora', html: a => timeOf(a.DataHora) },
        { label: 'Cliente', html: a => esc(a.Nome_Cliente) + (a.Mensalista === 'Sim' ? ' ⭐' : '') },
        { label: 'Serviço', html: a => esc(a.Servico) },
        { label: 'Valor', cls: 'right', html: a => a.Mensalista === 'Sim' ? '<small class="muted">mensalidade</small>' : money(a.Valor) },
        { label: 'Comissão', cls: 'right', html: a => money(a.Comissao_Valor) },
        { label: '', cls: 'actions', html: a => `<button type="button" class="btn small ghost" data-act="recibo" data-id="${esc(a.ID)}">🧾</button><button type="button" class="btn small danger-ghost" data-act="desfazer" data-id="${esc(a.ID)}">Desfazer</button>` }
      ], cortes, { empty: 'Nenhum corte lançado hoje ainda.' })}
    </div>`;

  el.onchange = e => {
    if (e.target.id === 'lc-barb') { st.barb = e.target.value; barbLancar(el); }
    if (e.target.id === 'lc-mens') { st.mensalId = e.target.value; barbLancar(el); }
  };
  el.oninput = e => { if (e.target.id === 'lc-cli') st.cliente = e.target.value; };
  const find = id => T('Agenda_Barbearia').find(a => same(a.ID, id));
  bind(el, {
    mensal: d => { st.mensal = d.v === '1'; barbLancar(el); },
    lancar: async (d, btn) => {
      const s = servicos()[d.i];
      if (!st.barb) return toast('Escolha o barbeiro.', 'warn');
      let c, nome;
      if (st.mensal) {
        c = cliente(st.mensalId);
        if (!c) return toast('Escolha o mensalista.', 'warn');
        nome = c.Nome;
      } else {
        nome = st.cliente.trim() || 'Cliente balcão';
        c = T('Clientes').find(x => norm(x.Nome) === norm(nome));
      }
      btn.disabled = true;
      const mensal = st.mensal || c?.Tipo === 'Mensalista';
      const ok = await run(() => saveAgBarb({ DataHora: isoDT(), ID_Barbeiro: st.barb, ID_Cliente: c?.ID || '', Nome_Cliente: c?.Nome || nome, Servico: s.nome, Valor: s.preco, Status: 'Concluido', Mensalista: mensal ? 'Sim' : '' }),
        `✔ ${s.nome} lançado para ${c?.Nome || nome}${mensal ? ' (mensalista)' : ''}`);
      if (ok) { st.cliente = ''; st.mensalId = ''; st.mensal = false; barbLancar(el); } else btn.disabled = false;
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

const MSG_LINK = 'Olá {nome}! 💈 Aqui é da Preto Rico. Este é o seu link de mensalista: por ele você escolhe o barbeiro, vê os horários vagos, marca o seu corte e paga a mensalidade por Pix.';

/** Link pessoal do mensalista (gerado pelo servidor; só funciona com internet). */
async function linkMensalista(c) {
  const r = await Api.exec('linkMensalista', { id: c.ID }, { online: true });
  return new URL(`mensalista.html?c=${encodeURIComponent(r.code)}`, location.href.split('#')[0]).href;
}

/** Mensagem de WhatsApp para o mensalista, já com o link de agendamento e pagamento. */
async function mensalWAModal(c, tipo) {
  let link = '';
  try { link = await linkMensalista(c); } catch (e) { toast(e.message + ' A mensagem vai sem o link.', 'warn'); }
  const st = statusMensal(c);
  const tpl = tipo === 'link' ? MSG_LINK : st === 'Atrasado' ? cfgVal('msg_atraso', MSG_ATRASO) : cfgVal('msg_mensalidade', MSG_MENSAL);
  let txt = fillTpl(tpl, { nome: String(c.Nome).split(' ')[0], valor: money(c.Valor_Mensalidade), dia: c.Dia_Vencimento, status: st });
  if (link) txt += `\n\n📅 Marcar horário e 💳 pagar a mensalidade: ${link}`;
  openModal({
    title: `📲 Mensagem para ${c.Nome}`,
    body: `<div class="field"><label for="mw-txt">Mensagem (pode mudar antes de enviar)</label><textarea id="mw-txt" rows="8">${esc(txt)}</textarea></div>
      ${link ? `<div class="field" style="margin-top:.6rem"><label for="mw-link">Link pessoal do mensalista</label><input id="mw-link" readonly value="${esc(link)}"></div>
        <p class="muted small">Pelo link ele escolhe o barbeiro, vê os dias e horários vagos e ocupados, marca ou desmarca o horário e paga por Pix enviando o comprovante. O link para de funcionar se ele deixar de ser mensalista.</p>` : ''}
      ${!c.Telefone_WhatsApp ? '<div class="alert warn"><span class="ic">⚠️</span><div>Cliente sem WhatsApp cadastrado: copie o link e mande por outro meio.</div></div>' : ''}
      ${!cfgVal('barbearia_pix', {})?.pix ? `<div class="alert warn"><span class="ic">⚠️</span><div>A chave Pix da barbearia ainda não foi cadastrada (Master: <b>Barbearia › Serviços e preços</b>).</div></div>` : ''}`,
    actions: [
      ...(link ? [{ label: '📋 Copiar link', cls: 'ghost', onClick: async () => { try { await navigator.clipboard.writeText(link); } catch (e) { $('#mw-link').select(); document.execCommand('copy'); } toast('Link copiado ✔', 'ok'); } }] : []),
      ...(c.Telefone_WhatsApp ? [{ label: '📲 Enviar no WhatsApp', cls: 'primary big', onClick: (f, close) => { openWA(c.Telefone_WhatsApp, $('#mw-txt').value); close(); } }] : [{ label: 'Fechar', cls: 'primary' }])
    ]
  });
}

/** Histórico do mensalista: cortes (balcão, agenda e link) e mensalidades pagas. */
function historicoMensal(c) {
  const desc = (a, b) => String(b.DataHora).localeCompare(String(a.DataHora));
  const cortes = T('Agenda_Barbearia').filter(a => same(a.ID_Cliente, c.ID)).sort(desc);
  const feitos = cortes.filter(a => a.Status === 'Concluido');
  const pags = T('Recebimentos').filter(r => r.Tipo === 'Mensalidade' && same(r.ID_Cliente, c.ID)).sort(desc);
  const mes = monthOf(isoDate());
  const body = `<div class="kpis">${kpi('Cortes neste mês', feitos.filter(a => monthOf(a.DataHora) === mes).length, 'gold')}${kpi('Cortes no total', feitos.length)}
      ${kpi('Último pagamento', fmtDate(c.Ultimo_Pagamento) || '—', STATUS_TONE[statusMensal(c)])}</div>
    <h3>✂️ Cortes e horários</h3>
    ${table([
      { label: 'Data', html: a => fmtDate(a.DataHora) },
      { label: 'Serviço', html: a => esc(a.Servico) },
      { label: 'Barbeiro', html: a => esc(userName(a.ID_Barbeiro)) },
      { label: 'Como', html: a => esc(a.Origem === 'Link' ? 'Pelo link' : a.Origem === 'Balcão' ? 'Balcão' : 'Agenda') },
      { label: 'Situação', html: a => sBadge(a.Status) }
    ], cortes, { empty: 'Nenhum corte registrado ainda.' })}
    <h3 style="margin-top:1rem">💵 Mensalidades pagas</h3>
    ${table([
      { label: 'Data', html: r => fmtDate(r.DataHora) },
      { label: 'Mês', html: r => esc(fmtMonth(r.Referencia || monthOf(r.DataHora))) },
      { label: 'Valor', cls: 'right', html: r => money(r.Valor) },
      { label: 'Forma', html: r => esc(payLabel(r.Forma_Pagamento)) }
    ], pags, { empty: 'Nenhum pagamento registrado.' })}`;
  openModal({ title: `📜 Histórico — ${c.Nome}`, size: 'lg', body,
    actions: [{ label: '🖨️ Imprimir', cls: 'ghost', onClick: () => showReceipt(reportHTML(`Histórico do mensalista — ${c.Nome}`, `Mensalidade ${money(c.Valor_Mensalidade)} · vence dia ${c.Dia_Vencimento}`,
      `<table><tr><th>Data</th><th>Serviço</th><th>Barbeiro</th><th>Situação</th></tr>${cortes.map(a => `<tr><td>${fmtDate(a.DataHora)}</td><td>${esc(a.Servico)}</td><td>${esc(userName(a.ID_Barbeiro))}</td><td>${esc(STATUS_LABEL[a.Status] || a.Status)}</td></tr>`).join('')}</table>
       <h3>Mensalidades</h3><table><tr><th>Data</th><th>Mês</th><th class="r">Valor</th></tr>${pags.map(r => `<tr><td>${fmtDate(r.DataHora)}</td><td>${esc(fmtMonth(r.Referencia || monthOf(r.DataHora)))}</td><td class="r">${money(r.Valor)}</td></tr>`).join('')}</table>`,
      [c.Nome, 'Preto Rico']), '🖨️ Histórico') }, { label: 'Fechar', cls: 'primary' }] });
}

/** Pix enviados pelo link: o balcão confere o comprovante e confirma ou recusa. */
function conferirPixMensal(pg, aprovar) {
  const c = cliente(pg.ID_Cliente) || { Nome: pg.Nome_Cliente };
  formModal({
    title: aprovar ? `✔ Confirmar Pix — ${pg.Nome_Cliente}` : `✕ Recusar comprovante — ${pg.Nome_Cliente}`,
    intro: aprovar ? `<p>Confira no extrato do banco se o Pix de <b>${money(pg.Valor)}</b> caiu. Ao confirmar, a mensalidade de <b>${esc(fmtMonth(pg.Referencia))}</b> fica paga.</p>`
      : '<p>O pagamento não será lançado. Diga ao cliente o motivo.</p>',
    values: { valor: pg.Valor, motivo: 'O Pix não apareceu no extrato.' },
    fields: aprovar ? [{ name: 'valor', label: 'Valor que caiu (R$)', type: 'number', step: '0.01', min: 0.01, required: true, full: true, inputmode: 'decimal' }]
      : [{ name: 'motivo', label: 'Motivo', required: true, full: true }],
    submitLabel: aprovar ? 'Confirmar pagamento' : 'Recusar',
    onSubmit: async d => {
      await Api.exec('conferirPagamentoMensal', { id: pg.ID, aprovar, valor: d.valor, motivo: d.motivo }, { online: true });
      toast(aprovar ? 'Mensalidade confirmada ✔' : 'Comprovante recusado', aprovar ? 'ok' : 'warn');
      refresh();
      const first = String(c.Nome).split(' ')[0];
      const tel = c.Telefone_WhatsApp;
      if (tel && await confirmModal('Avisar o cliente no WhatsApp?', { ok: '📲 Avisar' })) {
        openWA(tel, aprovar ? `Olá ${first}! 💈 Recebemos o seu Pix de ${money(d.valor)}. A mensalidade de ${fmtMonth(pg.Referencia)} está paga. Obrigado!`
          : `Olá ${first}! 💈 Não conseguimos confirmar o seu Pix da mensalidade de ${fmtMonth(pg.Referencia)}: ${d.motivo} Pode conferir e mandar de novo pelo link?`);
      }
    }
  });
}

function barbMensalistas(el) {
  const f = S.filters.mens ||= { st: '', q: '' };
  const all = T('Clientes').filter(c => c.Tipo === 'Mensalista').map(c => ({ ...c, _st: statusMensal(c) }));
  const rows = all.filter(c => (!f.st || c._st === f.st) && (!f.q || norm(c.Nome).includes(norm(f.q)))).sort((a, b) => num(a.Dia_Vencimento) - num(b.Dia_Vencimento));
  const by = s => all.filter(c => c._st === s);
  const pend = T('Mensal_Pagamentos').filter(x => x.Status === 'Informado').sort((a, b) => String(a.DataHora).localeCompare(String(b.DataHora)));
  const semPix = !cfgVal('barbearia_pix', {})?.pix;
  el.innerHTML = `${pend.length ? `<div class="card has-aviso"><h3>💳 Pix enviados pelo link — conferir no extrato</h3>
      ${table([
        { label: 'Cliente', html: x => `<b>${esc(x.Nome_Cliente)}</b>` },
        { label: 'Mês', html: x => esc(fmtMonth(x.Referencia)) },
        { label: 'Valor', cls: 'right', html: x => money(x.Valor) },
        { label: 'Enviado em', html: x => fmtDate(x.DataHora) },
        { label: '', cls: 'actions', html: x => `<button type="button" class="btn small ghost" data-act="comp" data-id="${esc(x.ID)}">👁 Comprovante</button>
          <button type="button" class="btn small ok" data-act="pixOk" data-id="${esc(x.ID)}">✔ Confirmar</button>
          <button type="button" class="btn small danger-ghost" data-act="pixNao" data-id="${esc(x.ID)}">✕ Recusar</button>` }
      ], pend)}</div>` : ''}
    <div class="kpis">
      ${kpi('Mensalistas', all.length, 'gold')}
      ${kpi('Em dia', by('Em dia').length, 'ok', money(sum(by('Em dia'), 'Valor_Mensalidade')))}
      ${kpi('A vencer', by('Pendente').length, 'warn', money(sum(by('Pendente'), 'Valor_Mensalidade')))}
      ${kpi('Atrasados', by('Atrasado').length, 'danger', money(sum(by('Atrasado'), 'Valor_Mensalidade')))}
    </div>
    ${semPix && isMaster() ? `<div class="alert warn"><span class="ic">⚠️</span><div>Cadastre a chave Pix da barbearia em <a href="#barbearia/servicos">Serviços e preços</a> para o mensalista pagar pelo link.</div></div>` : ''}
    <div class="toolbar">
      <button type="button" class="btn primary" data-act="novo">➕ Novo mensalista</button>
      <label class="grow">Buscar<input type="search" id="mens-q" value="${esc(f.q)}" placeholder="Nome do mensalista"></label>
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
        <button type="button" class="btn small" data-act="link" data-id="${esc(c.ID)}">🔗 Link</button>
        <button type="button" class="btn small ghost" data-act="hist" data-id="${esc(c.ID)}">📜 Histórico</button>
        <button type="button" class="btn small wa" data-act="wa" data-id="${esc(c.ID)}">Cobrar no WhatsApp</button>
        <button type="button" class="btn small ghost" data-act="editar" data-id="${esc(c.ID)}">✏️</button>` }
    ], rows, { empty: 'Nenhum mensalista cadastrado.' })}`;
  const pg = id => pend.find(x => same(x.ID, id));
  el.oninput = e => { if (e.target.id === 'mens-q') { f.q = e.target.value; clearTimeout(el._t); el._t = setTimeout(() => { barbMensalistas(el); const i = $('#mens-q', el); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } };
  bind(el, {
    novo: () => clienteForm({}, { Tipo: 'Mensalista', Atividade_Origem: 'Barbearia' }),
    editar: d => clienteForm(cliente(d.id)),
    pagar: d => pagarMensalidade(cliente(d.id)),
    hist: d => historicoMensal(cliente(d.id)),
    link: d => mensalWAModal(cliente(d.id), 'link'),
    wa: d => mensalWAModal(cliente(d.id), 'cobrar'),
    comp: d => run(() => verComprovante(d.id, 'Mensal_Pagamentos')),
    pixOk: d => conferirPixMensal(pg(d.id), true),
    pixNao: d => conferirPixMensal(pg(d.id), false)
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
const DEFAULT_HORARIO_BARB = { dias: [1, 2, 3, 4, 5, 6], inicio: '09:00', fim: '20:00' };
const horarioBarb = () => ({ ...DEFAULT_HORARIO_BARB, ...(cfgVal('horario_barbearia', {}) || {}) });

function barbServicos(el) {
  const list = S.filters.servEdit ||= servicos().map(s => ({ duracao: 30, ...s }));
  const pix = { pix: '', titular: '', banco: '', ...(cfgVal('barbearia_pix', {}) || {}) };
  const h = horarioBarb();
  el.innerHTML = `<div class="card"><div class="card-head"><h3>🧾 Serviços, preços, tempo e % de comissão do barbeiro</h3></div>
    ${table([
      { label: 'Serviço', html: (s) => `<input data-i="${list.indexOf(s)}" data-k="nome" value="${esc(s.nome)}">` },
      { label: 'Preço (R$)', html: s => `<input type="number" step="0.01" min="0" data-i="${list.indexOf(s)}" data-k="preco" value="${esc(s.preco)}">` },
      { label: 'Tempo (min)', html: s => `<input type="number" step="5" min="5" data-i="${list.indexOf(s)}" data-k="duracao" value="${esc(s.duracao ?? 30)}">` },
      { label: 'Comissão (%)', html: s => `<input type="number" step="1" min="0" max="100" data-i="${list.indexOf(s)}" data-k="comissao" value="${esc(s.comissao)}">` },
      { label: '', cls: 'actions', html: s => `<button type="button" class="btn small danger-ghost" data-act="rm" data-i="${list.indexOf(s)}">Remover</button>` }
    ], list, { empty: 'Nenhum serviço.' })}
    <p class="muted small">O tempo de cada serviço é usado para mostrar ao mensalista quais horários estão vagos.</p>
    <div class="btn-row" style="margin-top:1rem">
      <button type="button" class="btn" data-act="add">➕ Adicionar serviço</button>
      <button type="button" class="btn primary big" data-act="salvar">💾 Salvar tabela</button>
    </div></div>
    <div class="card"><div class="card-head"><h3>🔗 Link do mensalista: Pix e horário de atendimento</h3></div>
      <p class="muted">O mensalista paga a mensalidade por este Pix e marca horário dentro destes dias e horas.</p>
      <div class="form-grid">
        <div class="field"><label for="bp-pix">Chave Pix da barbearia</label><input id="bp-pix" value="${esc(pix.pix)}" placeholder="CNPJ, celular, e-mail ou chave aleatória"></div>
        <div class="field"><label for="bp-tit">Nome de quem recebe</label><input id="bp-tit" value="${esc(pix.titular)}"></div>
        <div class="field"><label for="bp-banco">Banco</label><input id="bp-banco" value="${esc(pix.banco)}"></div>
        <div class="field full"><label>Dias de atendimento</label><div class="btn-row">${DIAS_SEMANA.map((n, i) => `<label class="check"><input type="checkbox" class="bp-dia" value="${i}" ${h.dias.map(Number).includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
        <div class="field"><label for="bp-ini">Abre às</label><input id="bp-ini" type="time" value="${esc(h.inicio)}"></div>
        <div class="field"><label for="bp-fim">Fecha às</label><input id="bp-fim" type="time" value="${esc(h.fim)}"></div>
      </div>
      <div class="btn-row" style="margin-top:1rem"><button type="button" class="btn primary big" data-act="salvarLink">💾 Salvar Pix e horário</button></div>
    </div>`;
  el.oninput = e => { const i = e.target.dataset.i, k = e.target.dataset.k; if (i != null && k) list[i][k] = k === 'nome' ? e.target.value : num(e.target.value); };
  bind(el, {
    add: () => { list.push({ nome: 'Novo serviço', preco: 0, duracao: 30, comissao: 50 }); barbServicos(el); },
    rm: d => { list.splice(Number(d.i), 1); barbServicos(el); },
    salvar: async () => {
      const clean = list.filter(s => String(s.nome).trim()).map(s => ({ nome: String(s.nome).trim(), preco: num(s.preco), duracao: Math.max(5, num(s.duracao) || 30), comissao: num(s.comissao) }));
      if (await run(() => Api.exec('salvarConfig', { Chave: 'servicos', Valor: clean }), 'Tabela de serviços salva ✔')) { delete S.filters.servEdit; barbServicos(el); }
    },
    salvarLink: async () => {
      const dias = [...el.querySelectorAll('.bp-dia:checked')].map(x => Number(x.value));
      const ini = $('#bp-ini', el).value, fim = $('#bp-fim', el).value;
      if (!dias.length) return toast('Marque ao menos um dia de atendimento.', 'warn');
      if (!ini || !fim || ini >= fim) return toast('O horário de fechar precisa ser depois do de abrir.', 'warn');
      const ok = await run(async () => {
        await Api.exec('salvarConfig', { Chave: 'barbearia_pix', Valor: { pix: $('#bp-pix', el).value.trim(), titular: $('#bp-tit', el).value.trim(), banco: $('#bp-banco', el).value.trim() } });
        await Api.exec('salvarConfig', { Chave: 'horario_barbearia', Valor: { dias, inicio: ini, fim } });
      }, 'Pix e horário salvos ✔');
      if (ok) barbServicos(el);
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
    <div class="choice-grid">${PAY.filter(p => !['tatuagem', 'barbearia'].includes(view) || p.id !== 'Crediario').map(p => `<button type="button" class="choice ${pay === p.id ? 'sel' : ''}" data-act="pay" data-pay="${p.id}"><span>${p.icon}</span>${p.label}</button>`).join('')}</div>
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
  const master = gereLoja(act);
  const all = T('Estoque').filter(p => p.Atividade === act);
  const tatMaster = isMaster() && act === 'Tatuagem';
  const cnt = s => all.filter(p => stockLevel(p) === s).length;
  el.innerHTML = `<div class="kpis">
      ${kpi('Produtos', all.length, 'gold')}${kpi('OK', cnt('ok'), 'ok')}${kpi('Baixo', cnt('warn'), 'warn')}${kpi('Crítico', cnt('danger'), 'danger')}
      ${master ? kpi('Valor em estoque (custo)', money(sum(all, p => num(p.Qtd) * num(p.Preco_Custo))), 'info') : ''}
    </div>
    <div class="toolbar">
      ${master ? '<button type="button" class="btn primary" data-act="novo">➕ Novo produto</button>' : ''}
      <label class="grow">Buscar<input type="search" id="est-q" value="${esc(f.q)}" placeholder="Nome do produto"></label>
      <label>Situação<select data-f="st">${opts([['', 'Todas'], ['ok', '🟢 OK'], ['warn', '🟡 Baixo'], ['danger', '🔴 Crítico']], f.st)}</select></label>
      <button type="button" class="btn" data-act="relEst">🖨️ Relatório de estoque</button>
    </div>
    <div id="est-table"></div>`;
  const draw = () => {
    const order = { danger: 0, warn: 1, ok: 2 };
    const rows = all.filter(p => (!f.q || norm(p.Produto).includes(norm(f.q))) && (!f.st || stockLevel(p) === f.st))
      .sort((a, b) => order[stockLevel(a)] - order[stockLevel(b)] || String(a.Produto).localeCompare(b.Produto));
    const cols = [
      { label: 'Produto', html: p => `<b>${esc(p.Produto)}</b>` },
      ...(tatMaster ? [{ label: 'Tatuador', html: p => esc(p.ID_Dono ? userName(p.ID_Dono) : '—') }] : []),
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
        ${isMaster() ? `<button type="button" class="btn small danger-ghost" data-act="excluir" data-id="${esc(p.ID)}">🗑</button>` : ''}` }] : [])
    ];
    $('#est-table', el).innerHTML = table(cols, rows, { empty: 'Nenhum produto.' });
  };
  draw();
  el.oninput = e => { if (e.target.id === 'est-q') { f.q = e.target.value; draw(); } };
  bindFilters(el, f, () => storeEstoque(el, view));
  bind(el, {
    relEst: () => {
      const mes = monthOf(isoDate());
      const ids = new Set(T('Vendas_PDV').filter(v => v.Atividade === act && monthOf(v.DataHora) === mes).map(v => String(v.ID_Venda)));
      imprimirEstoque(act, T('Vendas_Itens').filter(i => ids.has(String(i.ID_Venda))), fmtMonth(mes));
    },
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
        onSubmit: async x => { await Api.exec(isMaster() ? 'salvarAjustePreco' : 'atualizarEstoque', isMaster() ? { ID: p.ID, ...x } : { row: { ...p, ...x } }); toast('Preço atualizado ✔', 'ok'); refresh(); }
      });
    },
    excluir: async d => {
      const p = produto(d.id);
      if (await confirmModal(`Excluir o produto <b>${esc(p.Produto)}</b>?`, { ok: 'Excluir', cls: 'danger' })
        && await run(() => Api.exec('remove', { table: 'Estoque', id: p.ID }), 'Produto excluído')) refresh();
    }
  });
}

/** Quem cadastra produtos, preços e estoque: o Master em todas as lojas; o tatuador nos próprios produtos, se o Master permitir. */
const gereLoja = act => isMaster() || (act === 'Tatuagem' && lvl() === 'Tatuador' && cfgVal('tattoo_produtos_do_tatuador', true) !== false);

function produtoForm(row = {}) {
  const isTat = lvl() === 'Tatuador';
  const tats = profs('Tatuador');
  const donoField = { name: 'ID_Dono', label: 'Tatuador dono do produto', type: 'select', options: [['', '— Escolha —'], ...tats.map(u => [u.ID, u.Nome])], hidden: (row.Atividade || 'Tabacaria') !== 'Tatuagem',
    help: 'Os produtos do estúdio são do tatuador: a venda fica 100% com ele, sem comissão ao Master.' };
  formModal({
    title: row.ID ? '✏️ Editar produto' : '📦 Novo produto',
    values: { Qtd: 0, Minimo: 5, ...row, ...(isTat ? { Atividade: 'Tatuagem', ID_Dono: S.user.ID } : {}) },
    fields: [
      { name: 'Produto', label: 'Nome do produto', required: true, full: true },
      { name: 'Atividade', label: 'Loja', type: 'select', options: (isTat ? ['Tatuagem'] : Object.values(STORE_ACT)).map(a => [a, ACT_LABEL[a]]),
        onInput: (els, form) => { const d = $('[data-field="ID_Dono"]', form); if (d) d.hidden = els.Atividade.value !== 'Tatuagem'; } },
      ...(isTat ? [] : [donoField]),
      { name: 'Qtd', label: 'Quantidade em estoque', type: 'number', step: '1', min: 0, required: true },
      { name: 'Minimo', label: 'Estoque mínimo', type: 'number', step: '1', min: 0, required: true },
      { name: 'Preco_Custo', label: 'Preço de custo (R$)', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'Preco_Venda', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true }
    ],
    onSubmit: async d => {
      if (isTat) Object.assign(d, { Atividade: 'Tatuagem', ID_Dono: S.user.ID });
      if (d.Atividade !== 'Tatuagem') d.ID_Dono = '';
      else if (!d.ID_Dono) throw new Error('Escolha o tatuador dono do produto.');
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
RENDER.tatuagem = {
  agenda: tatAgenda, pagamentos: tatPagamentos,
  loja: el => storePDV(el, 'tatuagem'), estoque: el => storeEstoque(el, 'tatuagem'),
  avisos: el => tatAvisosCliente(el), repasses: el => tatRepasses(el),
  fechamento: tatFechamento, relatorios: tatRelatorios, tipos: el => tatTipos(el)
};

const weekStart = iso => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return addDays(iso, -dt.getDay()); };

/* ---------- Tipos de tatuagem (editáveis pelo Master, salvos em Config › tipos_tatuagem) ---------- */
const DEFAULT_TIPOS_TATTOO = [
  { nome: 'Pequena / Fine line', preco: 250, duracao: 60, pct: 30 },
  { nome: 'Média (até 15 cm)', preco: 500, duracao: 180, pct: 30 },
  { nome: 'Grande (sessão)', preco: 900, duracao: 300, pct: 30 },
  { nome: 'Cobertura (cover-up)', preco: 700, duracao: 240, pct: 30 },
  { nome: 'Retoque', preco: 0, duracao: 60, pct: 0 }
];
const tiposTattoo = () => { const t = cfgVal('tipos_tatuagem', null); return Array.isArray(t) && t.length ? t : DEFAULT_TIPOS_TATTOO; };
const DURACOES = [30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600];
const fmtDur = m => { m = Math.round(num(m)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? pad(r) : ''}` : `${r} min`; };
/** Duração planejada da sessão: campo próprio, senão a do tipo, senão 2 h. */
const tatDur = a => num(a.Duracao_Min) || num((tiposTattoo().find(t => t.nome === a.Tipo) || {}).duracao) || 120;
const minOf = s => { const t = timeOf(s) || '00:00'; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** % da sala: Master define na tabela de tipos; sem tipo, vale a % padrão. */
const pctTipo = nome => { const t = tiposTattoo().find(x => x.nome === nome); return t && t.pct !== '' && t.pct !== undefined ? num(t.pct) : num(cfgVal('comissao_master_tattoo', 30)); };

/* ---------- Situação, avisos e financeiro de cada sessão ---------- */
const TAT_STATUS = [['Solicitado', 'Pedido pelo link'], ['Agendado', 'Agendado'], ['Em andamento', 'Em andamento'], ['Concluido', 'Executado'], ['Cancelado', 'Cancelado']];
const TAT_TONE = { Solicitado: 'gold', Agendado: 'info', 'Em andamento': 'warn', Concluido: 'ok', Cancelado: 'danger' };
const tatBadge = s => badge((TAT_STATUS.find(x => x[0] === s) || [s, s])[1], TAT_TONE[s]);
const tatCls = s => s === 'Em andamento' ? 'Andamento' : esc(s);
const listaIds = v => { const a = parseJSON(v, []); return Array.isArray(a) ? a.map(String) : []; };
/** Aviso para mim: outra pessoa mudou a sessão (data, valor, situação, pagamento) e eu ainda não dei "Ciente". */
const tatAviso = a => !!a.Alterado_Por && !same(a.Alterado_Por, S.user.ID) && !listaIds(a.Visto_Por).includes(String(S.user.ID));
const tatVisiveis = () => T('Agenda_Tatuagem').filter(a => lvl() !== 'Tatuador' || same(a.ID_Tatuador, S.user.ID));
const tatAvisos = () => tatVisiveis().filter(tatAviso);
const canEditTat = a => isMaster() || lvl() === 'Caixa' || same(a.ID_Tatuador, S.user.ID);
const pagsSessao = a => T('Tattoo_Pagamentos').filter(p => same(p.ID_Sessao, a.ID) && p.Status !== 'Cancelado');
function tatFin(a) {
  const ps = pagsSessao(a);
  const pago = r2(sum(ps.filter(p => p.Status === 'Pago'), 'Valor'));
  const aberto = ps.filter(p => p.Status === 'Aberto');
  const prox = aberto.map(p => p.Vencimento).filter(Boolean).sort()[0] || '';
  return { pago, saldo: r2(num(a.Valor_Total) - pago), aberto: r2(sum(aberto, 'Valor')), semPlano: r2(num(a.Valor_Total) - pago - sum(aberto, 'Valor')), prox, parcelas: ps };
}
const TAT_PAY = PAY.filter(p => p.id !== 'Crediario');

function tatForm(row = {}) {
  const isTat = lvl() === 'Tatuador';
  const master = isMaster();
  const tats = isTat ? [S.user] : profs('Tatuador');
  if (!tats.length) return toast('Cadastre um tatuador em Usuários primeiro.', 'warn');
  const tipos = tiposTattoo();
  const valor = num(row.Valor_Total);
  const pctAtual = valor && row.ID ? r2(num(row.Comissao_Master) / valor * 100) : pctTipo(row.Tipo);
  const calc = els => {
    if (master) els.Comissao_Master.value = r2(num(els.Valor_Total.value) * num(els.pct.value) / 100).toFixed(2);
    else $('#tat-com').textContent = money(r2(num(els.Valor_Total.value) * pctTipo(els.Tipo.value) / 100));
  };
  const durOpts = [...new Set([...DURACOES, num(row.Duracao_Min) || 120])].sort((a, b) => a - b).map(m => [String(m), fmtDur(m)]);
  const tipoOpts = [['', '— Escolha o tipo —'], ...tipos.map(t => t.nome)];
  if (row.Tipo && !tipos.some(t => t.nome === row.Tipo)) tipoOpts.push(row.Tipo);
  const m = formModal({
    title: row.ID ? '✏️ Editar sessão' : '🖋️ Nova sessão de tatuagem',
    intro: row.ID && !master ? '<p class="muted small">Quem estiver na outra ponta (tatuador ou atendente) recebe um aviso se a data, o valor ou a situação mudarem.</p>' : '',
    values: { Status: 'Agendado', pct: pctAtual, ...row, Duracao_Min: String(tatDur(row)), ID_Tatuador: row.ID_Tatuador || tats[0].ID },
    fields: [
      { name: 'DataHora', label: 'Dia e hora', type: 'datetime-local', required: true },
      { name: 'Duracao_Min', label: 'Duração prevista', type: 'select', options: durOpts },
      { name: 'ID_Tatuador', label: 'Tatuador', type: 'select', options: tats.map(u => [u.ID, u.Nome]), required: true },
      ...clienteFields(),
      { name: 'Tipo', label: 'Tipo de tatuagem', type: 'select', options: tipoOpts,
        onInput: els => {
          const t = tipos.find(x => x.nome === els.Tipo.value);
          if (!t) return calc(els);
          if (num(t.preco)) els.Valor_Total.value = num(t.preco);
          if (master && t.pct !== undefined && t.pct !== '') els.pct.value = num(t.pct);
          if (num(t.duracao)) {
            const v = String(num(t.duracao));
            if (![...els.Duracao_Min.options].some(o => o.value === v)) els.Duracao_Min.add(new Option(fmtDur(v), v));
            els.Duracao_Min.value = v;
          }
          calc(els);
        } },
      { name: 'Descricao_Servico', label: 'Descrição (local, tamanho, estilo)', type: 'textarea', full: true, required: true },
      { name: 'Valor_Total', label: 'Valor cobrado do cliente (R$)', type: 'number', step: '0.01', min: 0, required: true, onInput: calc, inputmode: 'decimal',
        help: master ? '' : 'Comissão do Master: <b id="tat-com"></b> (pela tabela de tipos)' },
      ...(master ? [
        { name: 'pct', label: '% da sala (Master)', type: 'number', step: '0.1', min: 0, max: 100, onInput: calc },
        { name: 'Comissao_Master', label: 'Comissão do Master (R$)', type: 'number', step: '0.01', min: 0, required: true, help: 'Devida ao Master dentro do mês, mesmo que o cliente pague a prazo.' }
      ] : []),
      { name: 'Status', label: 'Situação', type: 'select', options: TAT_STATUS }
    ],
    onSubmit: async d => {
      const { pct: _p, ...rest } = d;
      if (master && num(rest.Comissao_Master) > num(rest.Valor_Total)) throw new Error('A comissão não pode ser maior que o valor total.');
      if (!master) rest.Comissao_Master = r2(num(rest.Valor_Total) * pctTipo(rest.Tipo) / 100);
      rest.Duracao_Min = num(rest.Duracao_Min) || 120;
      const conflito = T('Agenda_Tatuagem').find(a => !same(a.ID, row.ID) && a.Status !== 'Cancelado' && same(a.ID_Tatuador, rest.ID_Tatuador)
        && dayOf(a.DataHora) === dayOf(rest.DataHora)
        && minOf(rest.DataHora) < minOf(a.DataHora) + tatDur(a) && minOf(a.DataHora) < minOf(rest.DataHora) + rest.Duracao_Min);
      if (conflito && !(await confirmModal(`Este horário bate com a sessão de <b>${esc(conflito.Nome_Cliente)}</b> às ${timeOf(conflito.DataHora)}. Salvar mesmo assim?`, { ok: 'Salvar assim mesmo' }))) return false;
      await Api.exec('salvarAgendamento', { tipo: 'tatuagem', row: { ...row, ...rest, ID: row.ID || uid('AT') } });
      toast('Sessão salva ✔', 'ok');
      refresh();
    }
  });
  if (m && !master) calc(m.form.elements);
  // Edição: botão para excluir de vez (só Master; o servidor também confere)
  if (row.ID && master && m) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn danger-ghost'; b.textContent = '🗑️ Excluir';
    b.style.marginRight = 'auto';
    b.onclick = async () => {
      if (!(await confirmModal('Excluir esta sessão de vez? Para manter o histórico, prefira "Cancelar".', { ok: 'Excluir', cls: 'danger' }))) return;
      if (await run(() => Api.exec('remove', { table: 'Agenda_Tatuagem', id: row.ID }), 'Sessão excluída')) { m.close(); refresh(); }
    };
    $('.modal-foot', m.node).prepend(b);
  }
}

/** Cartão de uma sessão com situação, horários reais, financeiro, aviso e ações. */
function tatItem(a) {
  const edit = canEditTat(a);
  const f = tatFin(a);
  const aviso = tatAviso(a);
  const c = cliente(a.ID_Cliente);
  const id = esc(a.ID);
  const comp = T('Tattoo_Pagamentos').find(p => same(p.ID_Sessao, a.ID) && p.Comprovante && p.Status !== 'Cancelado');
  const real = [a.Inicio_Real ? `▶ Início ${timeOf(a.Inicio_Real)}` : '', a.Fim_Real ? `■ Fim ${timeOf(a.Fim_Real)}` : '', a.Fim_Real ? `⏱ ${fmtDur(a.Tempo_Min)}` : ''].filter(Boolean).join(' · ');
  return `<div class="ag-item ${tatCls(a.Status)} ${aviso ? 'has-aviso' : ''}">
    <div class="ag-time">${timeOf(a.DataHora)}</div>
    <div>
      <div class="ag-title">${esc(a.Nome_Cliente)} ${tatBadge(a.Status)} ${a.Menor === 'Sim' ? badge('Menor de idade', 'warn') : ''} ${aviso ? badge('⚠ Alterado', 'danger') : ''}</div>
      <div class="ag-meta">${a.Tipo ? esc(a.Tipo) + ' · ' : ''}${esc(a.Descricao_Servico)} · ${esc(userName(a.ID_Tatuador))}</div>
      <div class="ag-meta"><b>${money(a.Valor_Total)}</b> · Master ${money(a.Comissao_Master)} · Recebido ${money(f.pago)}${f.saldo > 0.009 && a.Status !== 'Cancelado' ? ` · <b class="t-danger">Falta ${money(f.saldo)}</b>` : ''}</div>
      ${real ? `<div class="ag-meta">${real}</div>` : ''}
      ${a.Alteracao ? `<div class="ag-meta ${aviso ? 't-danger' : 'muted'}">📝 ${esc(a.Alteracao)}${a.Alterado_Em ? ' · ' + fmtDate(a.Alterado_Em) : ''}</div>` : ''}
      <div class="ag-actions">
        ${aviso ? `<button type="button" class="btn small primary" data-act="ciente" data-id="${id}">👍 Ciente</button>` : ''}
        ${a.Status === 'Solicitado' && comp ? `<button type="button" class="btn small" data-act="comprovante" data-id="${esc(comp.ID)}">👁 Comprovante</button>` : ''}
        ${edit && a.Status === 'Solicitado' ? `<button type="button" class="btn small ok" data-act="confirmar" data-id="${id}">✔ Confirmar sessão</button>
          <button type="button" class="btn small danger-ghost" data-act="recusar" data-id="${id}">✕ Recusar</button>` : ''}
        ${edit && a.Status === 'Agendado' ? `<button type="button" class="btn small ok" data-act="iniciar" data-id="${id}">▶ Iniciar</button>` : ''}
        ${edit && (a.Status === 'Em andamento' || a.Status === 'Agendado') ? `<button type="button" class="btn small ok" data-act="finalizar" data-id="${id}">■ Finalizar</button>` : ''}
        ${edit && a.Status !== 'Cancelado' ? `<button type="button" class="btn small" data-act="pagar" data-id="${id}">💳 Pagamentos</button>` : ''}
        ${edit && a.Status === 'Agendado' ? `<button type="button" class="btn small ghost" data-act="cancelar" data-id="${id}">✕ Cancelar</button>` : ''}
        ${edit ? `<button type="button" class="btn small ghost" data-act="editar" data-id="${id}">✏️ Editar</button>` : ''}
        ${a.Status === 'Concluido' ? `<button type="button" class="btn small ghost" data-act="recibo" data-id="${id}">🧾 Recibo</button>` : ''}
        ${['Agendado', 'Solicitado', 'Em andamento'].includes(a.Status) ? `<button type="button" class="btn small wa" data-act="avisosCli" data-id="${id}">📲 Avisos</button>` : ''}
      </div>
    </div></div>`;
}

/** Ações de uma sessão, usadas na agenda, nos pagamentos e nos avisos. */
function tatAcoes() {
  const find = id => T('Agenda_Tatuagem').find(a => same(a.ID, id));
  return {
    editar: d => tatForm(find(d.id)),
    iniciar: async d => {
      if (await run(() => Api.exec('marcarSessao', { id: d.id, evento: 'inicio', quando: isoDT() }), 'Serviço iniciado ▶')) refresh();
    },
    finalizar: d => tatFinalizar(find(d.id)),
    cancelar: async d => {
      if (await confirmModal('Cancelar esta sessão?', { ok: 'Sim, cancelar', cls: 'danger' })
        && await run(() => Api.exec('salvarAgendamento', { tipo: 'tatuagem', row: { ...find(d.id), Status: 'Cancelado' } }), 'Sessão cancelada')) refresh();
    },
    ciente: async d => { if (await run(() => Api.exec('vistoAviso', { id: d.id }), 'Aviso marcado como visto')) refresh(); },
    pagar: d => tatPagModal(find(d.id)),
    recibo: d => {
      const a = find(d.id);
      const f = tatFin(a);
      showReceipt(receiptHTML({ titulo: 'RECIBO — ESTÚDIO DE TATUAGEM', id: a.ID, data: a.DataHora, cliente: a.Nome_Cliente, operador: userName(a.ID_Tatuador),
        itens: [[a.Tipo ? `${a.Tipo} — ${a.Descricao_Servico}` : a.Descricao_Servico, 1, a.Valor_Total]], total: a.Valor_Total,
        obs: f.saldo > 0.009 ? `Pago: ${money(f.pago)} · Saldo a pagar: ${money(f.saldo)}` : 'Pago integralmente' }));
    },
    wa: d => { const a = find(d.id); openWA(cliente(a.ID_Cliente)?.Telefone_WhatsApp, `Olá ${a.Nome_Cliente}! 🖋️ Confirmando sua sessão de tatuagem na Preto Rico: ${fmtDate(a.DataHora)}. Venha alimentado e hidratado!`); },
    avisosCli: d => { const a = find(d.id); avisosClienteModal({ tatId: a.ID_Tatuador, sessao: a }); },
    comprovante: d => run(() => verComprovante(d.id)),
    confirmar: async d => {
      const a = find(d.id);
      const ent = T('Tattoo_Pagamentos').find(p => same(p.ID_Sessao, a.ID) && p.Comprovante && p.Status === 'Aberto');
      const ok = await confirmModal(`Confirmar a sessão de <b>${esc(a.Nome_Cliente)}</b> em ${fmtDate(a.DataHora)}?${ent ? `<br><br>A entrada de <b>${money(ent.Valor)}</b> será marcada como recebida. Confira o Pix no banco antes.` : ''}`, { ok: '✔ Confirmar' });
      if (!ok) return;
      const feito = await run(async () => {
        await Api.exec('salvarAgendamento', { tipo: 'tatuagem', row: { ...a, Status: 'Agendado' } });
        if (ent) await Api.exec('salvarPagamentoTattoo', { rows: [{ ...ent, Status: 'Pago', Data_Pagamento: isoDate(), Obs: 'Entrada por Pix (comprovante conferido)' }] });
        return true;
      }, 'Sessão confirmada ✔');
      if (feito) {
        refresh();
        const fone = a.Telefone || cliente(a.ID_Cliente)?.Telefone_WhatsApp;
        if (fone && await confirmModal('Avisar o cliente pelo WhatsApp que a sessão está confirmada?', { ok: '📲 Avisar' }))
          openWA(fone, `Olá ${String(a.Nome_Cliente).split(' ')[0]}! Sua sessão de tatuagem na Preto Rico está CONFIRMADA ✅ ${fmtDate(a.DataHora)} com ${userName(a.ID_Tatuador)}.${ent ? ` Recebemos a entrada de ${money(ent.Valor)}.` : ''}\n\n${textoAviso(perfilTat(a.ID_Tatuador).textos.falta)}`);
      }
    },
    recusar: d => {
      const a = find(d.id);
      const ent = T('Tattoo_Pagamentos').find(p => same(p.ID_Sessao, a.ID) && p.Comprovante && p.Status === 'Aberto');
      formModal({ title: `✕ Recusar pedido — ${a.Nome_Cliente}`, intro: '<p class="muted">O horário fica livre de novo. Se o cliente já pagou a entrada, combine a devolução com ele.</p>',
        fields: [{ name: 'motivo', label: 'Motivo (vai na mensagem ao cliente)', full: true, placeholder: 'Ex.: horário indisponível, comprovante não confere' }],
        submitLabel: 'Recusar pedido',
        onSubmit: async x => {
          await Api.exec('salvarAgendamento', { tipo: 'tatuagem', row: { ...a, Status: 'Cancelado' } });
          if (ent) await Api.exec('salvarPagamentoTattoo', { rows: [{ ...ent, Status: 'Cancelado', Obs: 'Pedido recusado' + (x.motivo ? ': ' + x.motivo : '') }] });
          toast('Pedido recusado', 'ok'); refresh();
          const fone = a.Telefone || cliente(a.ID_Cliente)?.Telefone_WhatsApp;
          if (fone) openWA(fone, `Olá ${String(a.Nome_Cliente).split(' ')[0]}! Não conseguimos confirmar sua sessão de ${fmtDate(a.DataHora)}${x.motivo ? ' (' + x.motivo + ')' : ''}. Chame a gente para escolher outro horário. 🖋️`);
        } });
    }
  };
}

/** Fim do serviço: confere início e fim e calcula o tempo gasto. */
function tatFinalizar(a) {
  formModal({
    title: `■ Finalizar sessão — ${a.Nome_Cliente}`,
    intro: '<p class="muted">Confira a hora em que o serviço começou e terminou. O sistema calcula o tempo gasto.</p>',
    values: { inicio: a.Inicio_Real || a.DataHora, fim: isoDT() },
    fields: [
      { name: 'inicio', label: 'Começou', type: 'datetime-local', required: true },
      { name: 'fim', label: 'Terminou', type: 'datetime-local', required: true }
    ],
    submitLabel: '✔ Serviço executado',
    onSubmit: async x => {
      if (x.fim < x.inicio) throw new Error('O fim não pode ser antes do início.');
      await Api.exec('marcarSessao', { id: a.ID, evento: 'fim', inicio: x.inicio, quando: x.fim });
      toast('Serviço executado ✔', 'ok');
      refresh();
      const atual = T('Agenda_Tatuagem').find(s => same(s.ID, a.ID)) || a;
      if (tatFin(atual).saldo > 0.009) setTimeout(() => tatPagModal(atual), 200);
    }
  });
}

/* ---------- Pagamentos da sessão (à vista ou a prazo) ---------- */
function tatPagModal(a) {
  if (!a) return;
  const f = tatFin(a);
  const hoje = isoDate();
  const parcelas = T('Tattoo_Pagamentos').filter(p => same(p.ID_Sessao, a.ID)).sort((x, y) => String(x.Vencimento || x.Data_Pagamento).localeCompare(y.Vencimento || y.Data_Pagamento));
  const m = openModal({
    title: `💳 Pagamentos — ${a.Nome_Cliente}`, size: 'lg',
    body: `<div class="kpis">${kpi('Valor do serviço', money(a.Valor_Total), 'gold')}${kpi('Recebido', money(f.pago), 'ok')}
        ${kpi('Parcelas a receber', money(f.aberto), 'warn')}${kpi('Sem parcela lançada', money(Math.max(0, f.semPlano)), f.semPlano > 0.009 ? 'danger' : 'default')}</div>
      <p class="muted small">A comissão do Master (${money(a.Comissao_Master)}) é paga dentro do mês da sessão, mesmo que o cliente pague a prazo.</p>
      ${table([
        { label: 'Parcela', html: p => esc(p.Parcela || '—') },
        { label: 'Vencimento', html: p => p.Vencimento ? `<span class="${p.Status === 'Aberto' && p.Vencimento < hoje ? 't-danger' : ''}">${fmtDate(p.Vencimento)}</span>` : '—' },
        { label: 'Valor', cls: 'right', html: p => `<b>${money(p.Valor)}</b>` },
        { label: 'Forma', html: p => esc(payLabel(p.Forma_Pagamento)) },
        { label: 'Situação', html: p => p.Status === 'Pago' ? badge('Pago ' + fmtDate(p.Data_Pagamento), 'ok') : p.Status === 'Cancelado' ? badge('Cancelado', 'muted') : badge(p.Vencimento && p.Vencimento < hoje ? 'Vencido' : 'A receber', p.Vencimento && p.Vencimento < hoje ? 'danger' : 'warn') },
        { label: 'Obs.', html: p => esc(p.Obs || '') },
        { label: '', cls: 'actions', html: p => p.Status === 'Cancelado' ? '' : `
          ${p.Status === 'Aberto' ? `<button type="button" class="btn small ok" data-act="baixa" data-id="${esc(p.ID)}">✔ Dar baixa</button>` : ''}
          ${p.Status === 'Pago' ? `<button type="button" class="btn small" data-act="reciboP" data-id="${esc(p.ID)}">🧾 Recibo</button>` : ''}
          ${p.Comprovante ? `<button type="button" class="btn small" data-act="compP" data-id="${esc(p.ID)}">👁</button>` : ''}
          <button type="button" class="btn small ghost" data-act="editarP" data-id="${esc(p.ID)}">✏️</button>
          <button type="button" class="btn small danger-ghost" data-act="cancelarP" data-id="${esc(p.ID)}">✕</button>` }
      ], parcelas, { empty: 'Nenhum pagamento lançado ainda.' })}
      <div class="btn-row" style="margin-top:1rem">
        <button type="button" class="btn primary" data-act="novoP">➕ Lançar pagamento</button>
        ${f.semPlano > 0.009 ? `<button type="button" class="btn" data-act="parcelar">📆 Parcelar o que falta (${money(f.semPlano)})</button>` : ''}
      </div>`,
    actions: [{ label: 'Fechar', cls: 'primary' }]
  });
  const reabrir = () => { m.close(); refresh(); const s = T('Agenda_Tatuagem').find(x => same(x.ID, a.ID)); if (s) tatPagModal(s); };
  const salvar = rows => Api.exec('salvarPagamentoTattoo', { rows: rows.map(r => ({ ID_Sessao: a.ID, ...r })) });
  const pag = id => parcelas.find(p => same(p.ID, id));
  const formP = (p = {}) => formModal({
    title: p.ID ? '✏️ Editar pagamento' : '➕ Lançar pagamento',
    values: { Status: 'Pago', Forma_Pagamento: 'Pix', Valor: p.ID ? p.Valor : Math.max(0, f.semPlano) || '', Vencimento: hoje, Data_Pagamento: hoje, ...p },
    fields: [
      { name: 'Valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0.01, required: true, inputmode: 'decimal' },
      { name: 'Status', label: 'Situação', type: 'select', options: [['Pago', 'Já recebido'], ['Aberto', 'A receber (a prazo)']] },
      { name: 'Forma_Pagamento', label: 'Forma', type: 'select', options: TAT_PAY.map(x => [x.id, x.label]) },
      { name: 'Vencimento', label: 'Vencimento (se a prazo)', type: 'date' },
      { name: 'Data_Pagamento', label: 'Data do recebimento', type: 'date' },
      { name: 'Parcela', label: 'Parcela (ex.: 1/3, sinal)' },
      { name: 'Obs', label: 'Observação', full: true }
    ],
    onSubmit: async x => {
      if (x.Status === 'Aberto' && !x.Vencimento) throw new Error('Informe o vencimento da parcela a prazo.');
      await salvar([{ ...p, ...x, ID: p.ID || uid('TP') }]);
      toast('Pagamento salvo ✔', 'ok');
      reabrir();
    }
  });
  bind($('.modal-body', m.node), {
    novoP: () => formP(),
    editarP: d => formP(pag(d.id)),
    reciboP: d => reciboPagamento(pag(d.id)),
    compP: d => run(() => verComprovante(d.id)),
    baixa: d => {
      const p = pag(d.id);
      formModal({
        title: `✔ Dar baixa — ${money(p.Valor)}`,
        values: { Data_Pagamento: hoje, Forma_Pagamento: p.Forma_Pagamento || 'Pix', Valor: p.Valor },
        fields: [
          { name: 'Valor', label: 'Valor recebido (R$)', type: 'number', step: '0.01', min: 0.01, required: true, help: 'Se o cliente pagou menos, o restante continua a receber.' },
          { name: 'Forma_Pagamento', label: 'Forma', type: 'select', options: TAT_PAY.map(x => [x.id, x.label]) },
          { name: 'Data_Pagamento', label: 'Data', type: 'date', required: true }
        ],
        submitLabel: '✔ Confirmar recebimento',
        onSubmit: async x => {
          const rows = [{ ...p, ...x, Status: 'Pago' }];
          const resto = r2(num(p.Valor) - num(x.Valor));
          if (resto > 0.009) rows.push({ ID: uid('TP'), Parcela: (p.Parcela ? p.Parcela + ' (resto)' : 'Resto'), Vencimento: p.Vencimento || hoje, Valor: resto, Forma_Pagamento: p.Forma_Pagamento, Status: 'Aberto' });
          await salvar(rows);
          toast('Recebimento registrado ✔', 'ok');
          reabrir();
          const pago = T('Tattoo_Pagamentos').find(x => same(x.ID, p.ID));
          if (pago && await confirmModal('Recebimento registrado. Emitir o recibo para o cliente?', { ok: '🧾 Emitir recibo' })) reciboPagamento(pago);
        }
      });
    },
    cancelarP: async d => {
      if (await confirmModal('Cancelar este pagamento? Ele fica no histórico como cancelado.', { ok: 'Cancelar pagamento', cls: 'danger' })
        && await run(() => salvar([{ ...pag(d.id), Status: 'Cancelado' }]), 'Pagamento cancelado')) reabrir();
    },
    parcelar: () => formModal({
      title: `📆 Parcelar ${money(f.semPlano)}`,
      values: { n: 2, primeiro: addDays(hoje, 30), Forma_Pagamento: 'Pix' },
      fields: [
        { name: 'n', label: 'Número de parcelas', type: 'number', min: 1, max: 24, step: 1, required: true },
        { name: 'primeiro', label: 'Primeiro vencimento', type: 'date', required: true },
        { name: 'Forma_Pagamento', label: 'Forma prevista', type: 'select', options: TAT_PAY.map(x => [x.id, x.label]) }
      ],
      onSubmit: async x => {
        const n = Math.max(1, Math.min(24, Math.round(num(x.n))));
        const base = Math.floor(f.semPlano / n * 100) / 100;
        const [y, mo, dd] = x.primeiro.split('-').map(Number);
        const rows = Array.from({ length: n }, (_, i) => ({
          ID: uid('TP'), Parcela: `${i + 1}/${n}`, Status: 'Aberto', Forma_Pagamento: x.Forma_Pagamento,
          Vencimento: isoDate(new Date(y, mo - 1 + i, dd)),
          Valor: i === n - 1 ? r2(f.semPlano - base * (n - 1)) : base
        }));
        await salvar(rows);
        toast(`${n} parcela(s) lançada(s) ✔`, 'ok');
        reabrir();
      }
    })
  });
}

/** Detalhes da sessão (clique no calendário) com as ações de sempre. */
function tatDetalhe(a, acts) {
  const m = openModal({ title: '🖋️ Sessão de tatuagem', body: `<div class="ag-list">${tatItem(a)}</div>
    <p class="muted small" style="margin-top:.6rem">${fmtDate(a.DataHora)} · previsto ${fmtDur(tatDur(a))}${a.Tipo ? ' · ' + esc(a.Tipo) : ''}</p>`,
    actions: [{ label: 'Fechar', cls: 'ghost' }] });
  bind($('.modal-body', m.node), Object.fromEntries(Object.entries(acts).map(([k, fn]) => [k, (...x) => { m.close(); fn(...x); }])));
}

/** Avisos de alteração ainda não vistos (aparece no topo da agenda e na tela Início). */
function tatAvisosHTML() {
  const av = tatAvisos().sort((a, b) => String(b.Alterado_Em).localeCompare(a.Alterado_Em));
  if (!av.length) return '';
  return `<div class="card aviso-card"><div class="card-head"><h3>🔔 ${av.length} aviso(s) de alteração</h3>
      <button type="button" class="btn small" data-act="cienteTodos">👍 Ciente de todos</button></div>
    <div class="ag-list">${av.map(tatItem).join('')}</div></div>`;
}

function tatAgenda(el) {
  const st = S.cal.tat ||= { start: weekStart(isoDate()), tat: '', modo: 'calendario' };
  st.modo ||= 'calendario';
  const isTat = lvl() === 'Tatuador';
  const rows = tatVisiveis().filter(a => isTat || !st.tat || same(a.ID_Tatuador, st.tat));
  const dias = Array.from({ length: 7 }, (_, i) => addDays(st.start, i));
  const semana = rows.filter(a => dias.includes(dayOf(a.DataHora)));
  const conc = semana.filter(a => a.Status === 'Concluido');
  const hoje = isoDate();
  const rerender = () => tatAgenda(el);
  const label = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  const fim = addDays(st.start, 6);
  const titulo = `${fmtDate(st.start)} a ${fmtDate(fim)}`;

  // ---- Calendário semanal por horário ----
  const SLOT = 30, PX = 26; // 30 min = 26 px
  let h0 = 8 * 60, h1 = 22 * 60;
  semana.forEach(a => { const s = minOf(a.DataHora); h0 = Math.min(h0, Math.floor(s / 60) * 60); h1 = Math.max(h1, Math.ceil((s + tatDur(a)) / 60) * 60); });
  h1 = Math.min(h1, 24 * 60);
  const altura = (h1 - h0) / SLOT * PX;
  const blocos = d => {
    const list = semana.filter(a => dayOf(a.DataHora) === d).sort((a, b) => minOf(a.DataHora) - minOf(b.DataHora));
    // Sessões que se sobrepõem ficam lado a lado
    const fins = [], lane = {};
    list.forEach(a => { const s = minOf(a.DataHora); let i = fins.findIndex(f => f <= s); if (i < 0) { i = fins.length; fins.push(0); } fins[i] = s + tatDur(a); lane[a.ID] = i; });
    const n = Math.max(1, fins.length);
    return list.map(a => {
      const top = (minOf(a.DataHora) - h0) / SLOT * PX, h = Math.max(PX, tatDur(a) / SLOT * PX - 2);
      const w = 100 / n, left = lane[a.ID] * w;
      return `<button type="button" class="wk-ev ${tatCls(a.Status)}" data-act="ver" data-id="${esc(a.ID)}"
        style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px)" title="${esc(a.Nome_Cliente)} — ${esc(a.Descricao_Servico)}">
        <b>${tatAviso(a) ? '⚠ ' : ''}${timeOf(a.DataHora)} ${esc(a.Nome_Cliente)}</b><span>${esc(a.Tipo || a.Descricao_Servico)}</span>${!isTat && !st.tat ? `<span>${esc(userName(a.ID_Tatuador))}</span>` : ''}</button>`;
    }).join('');
  };
  const horas = [];
  for (let t = h0; t < h1; t += 60) horas.push(t);
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const calendario = `<div class="wk-wrap"><div class="wk" style="--wk-h:${altura}px;--wk-slot:${PX}px">
      <div class="wk-corner"></div>
      ${dias.map(d => `<div class="wk-head ${d === hoje ? 'today' : ''}">${label(d)}</div>`).join('')}
      <div class="wk-times">${horas.map(t => `<div style="height:${PX * 2}px">${pad(t / 60)}:00</div>`).join('')}</div>
      ${dias.map(d => `<div class="wk-day ${d === hoje ? 'today' : ''}" data-day="${d}" data-act="slot">
        ${d === hoje && agoraMin >= h0 && agoraMin < h1 ? `<i class="wk-now" style="top:${(agoraMin - h0) / SLOT * PX}px"></i>` : ''}
        ${blocos(d)}</div>`).join('')}
    </div></div>
    <p class="muted small" style="margin-top:.5rem">Toque num horário vazio para agendar · toque numa sessão para iniciar, finalizar, lançar pagamento, editar ou cancelar.</p>`;

  const lista = `<div class="week">${dias.map(d => {
      const list = rows.filter(a => dayOf(a.DataHora) === d).sort((a, b) => String(a.DataHora).localeCompare(b.DataHora));
      return `<div class="week-col ${d === hoje ? 'today' : ''}"><div class="week-head">${label(d)}</div>
        <div class="ag-list">${list.map(tatItem).join('') || '<small class="muted">Livre</small>'}</div></div>`;
    }).join('')}</div>`;

  el.innerHTML = `${tatAvisosHTML()}<div class="toolbar">
      <button type="button" class="btn primary big" data-act="novo">➕ Nova sessão</button>
      <button type="button" class="btn" data-act="link">🔗 Link para o cliente agendar</button>
      <button type="button" class="icon-btn" data-act="prev" aria-label="Semana anterior">‹</button>
      <button type="button" class="btn" data-act="hoje">Esta semana</button>
      <button type="button" class="icon-btn" data-act="next" aria-label="Próxima semana">›</button>
      <strong class="wk-title">${esc(titulo)}</strong>
      <label>Ver<select data-f="modo">${opts([['calendario', '📅 Calendário'], ['lista', '📋 Lista']], st.modo)}</select></label>
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], st.tat)}</select></label>` : ''}
    </div>
    ${(() => { const ped = tatVisiveis().filter(a => a.Status === 'Solicitado'); return ped.length ? `<div class="alert warn"><span class="ic">🔗</span><div><b>${ped.length}</b> pedido(s) de agendamento pelo link esperando confirmação: ${ped.map(a => `${esc(a.Nome_Cliente)} (${fmtDate(a.DataHora)})`).join(', ')}. Confira o comprovante e confirme.</div></div>` : ''; })()}
    <div class="kpis">${kpi('Sessões na semana', semana.filter(a => a.Status !== 'Cancelado').length, 'gold')}
      ${kpi('Em andamento', semana.filter(a => a.Status === 'Em andamento').length, 'warn')}
      ${kpi('Produzido (executadas)', money(sum(conc, 'Valor_Total')), 'ok')}${kpi('Comissão Master', money(sum(conc, 'Comissao_Master')), 'info')}</div>
    ${st.modo === 'lista' ? lista : calendario}`;

  const find = id => T('Agenda_Tatuagem').find(a => same(a.ID, id));
  const acoes = tatAcoes();
  bind(el, {
    ...acoes,
    cienteTodos: async () => {
      const ok = await run(async () => { for (const a of tatAvisos()) await Api.exec('vistoAviso', { id: a.ID }); return true; }, 'Avisos marcados como vistos');
      if (ok) refresh();
    },
    novo: () => tatForm({ DataHora: (dias.includes(hoje) ? hoje : st.start) + 'T14:00', ID_Tatuador: isTat ? S.user.ID : st.tat || undefined }),
    link: () => linkAgendamentoModal(isTat ? S.user.ID : st.tat),
    prev: () => { st.start = addDays(st.start, -7); rerender(); },
    next: () => { st.start = addDays(st.start, 7); rerender(); },
    hoje: () => { st.start = weekStart(hoje); rerender(); },
    ver: d => { const a = find(d.id); if (a) tatDetalhe(a, acoes); },
    slot: (d, b, e) => {
      const y = e.clientY - b.getBoundingClientRect().top;
      const t = Math.min(h1 - SLOT, h0 + Math.max(0, Math.floor(y / PX)) * SLOT);
      tatForm({ DataHora: `${d.day}T${pad(Math.floor(t / 60))}:${pad(t % 60)}`, ID_Tatuador: isTat ? S.user.ID : st.tat || undefined });
    }
  });
  bindFilters(el, st, rerender);
  // Rola até o dia de hoje no celular
  const wrap = $('.wk-wrap', el);
  if (wrap && window.matchMedia('(max-width: 900px)').matches) {
    const iHoje = dias.indexOf(hoje);
    if (iHoje > 0) wrap.scrollLeft = iHoje * ($('.wk-day', el)?.offsetWidth || 0);
  }
}

/* ---------- Aba Pagamentos: o que cada cliente ainda deve ---------- */
function tatPagamentos(el) {
  const f = S.filters.tatPag ||= { so: 'saldo', tat: '' };
  const isTat = lvl() === 'Tatuador';
  const hoje = isoDate();
  const sess = tatVisiveis().filter(a => a.Status !== 'Cancelado' && (isTat || !f.tat || same(a.ID_Tatuador, f.tat)))
    .map(a => ({ a, f: tatFin(a) }))
    .filter(x => f.so === 'todas' || x.f.saldo > 0.009)
    .sort((x, y) => String(x.f.prox || x.a.DataHora).localeCompare(y.f.prox || y.a.DataHora));
  const parcAbertas = T('Tattoo_Pagamentos').filter(p => p.Status === 'Aberto' && (isTat ? same(p.ID_Tatuador, S.user.ID) : !f.tat || same(p.ID_Tatuador, f.tat)));
  const vencidas = parcAbertas.filter(p => p.Vencimento && p.Vencimento < hoje);
  const recebMes = T('Tattoo_Pagamentos').filter(p => p.Status === 'Pago' && monthOf(p.Data_Pagamento) === monthOf(hoje) && (isTat ? same(p.ID_Tatuador, S.user.ID) : !f.tat || same(p.ID_Tatuador, f.tat)));
  el.innerHTML = `<div class="kpis">${kpi('A receber dos clientes', money(sum(sess.filter(x => x.f.saldo > 0), x => x.f.saldo)), 'warn')}
      ${kpi('Parcelas vencidas', `${vencidas.length} · ${money(sum(vencidas, 'Valor'))}`, vencidas.length ? 'danger' : 'ok')}
      ${kpi('Recebido neste mês', money(sum(recebMes, 'Valor')), 'ok')}</div>
    <div class="toolbar">
      <label>Mostrar<select data-f="so">${opts([['saldo', 'Só quem deve'], ['todas', 'Todas as sessões']], f.so)}</select></label>
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], f.tat)}</select></label>` : ''}
    </div>
    <div class="card">${table([
      { label: 'Sessão', html: x => fmtDate(x.a.DataHora) },
      { label: 'Cliente', html: x => `<b>${esc(x.a.Nome_Cliente)}</b>${tatAviso(x.a) ? ' ' + badge('⚠', 'danger') : ''}` },
      ...(!isTat ? [{ label: 'Tatuador', html: x => esc(userName(x.a.ID_Tatuador)) }] : []),
      { label: 'Situação', html: x => tatBadge(x.a.Status) },
      { label: 'Valor', cls: 'right', html: x => money(x.a.Valor_Total) },
      { label: 'Recebido', cls: 'right', html: x => money(x.f.pago) },
      { label: 'Falta', cls: 'right', html: x => x.f.saldo > 0.009 ? `<b class="t-danger">${money(x.f.saldo)}</b>` : badge('Quitado', 'ok') },
      { label: 'Próx. vencimento', html: x => x.f.prox ? `<span class="${x.f.prox < hoje ? 't-danger' : ''}">${fmtDate(x.f.prox)}</span>` : '—' },
      { label: '', cls: 'actions', html: x => canEditTat(x.a) ? `<button type="button" class="btn small primary" data-act="pagar" data-id="${esc(x.a.ID)}">💳 Pagamentos</button>` : '' }
    ], sess, { empty: f.so === 'saldo' ? 'Nenhum cliente devendo. 🎉' : 'Nenhuma sessão.' })}</div>`;
  bind(el, tatAcoes());
  bindFilters(el, f, () => tatPagamentos(el));
}

/* ---------- Período (semana, mês ou datas) usado no fechamento e nos relatórios ---------- */
function tatPeriodo(f) {
  if (f.modo === 'semana') return { de: f.sem, ate: addDays(f.sem, 6), nome: `Semana de ${fmtDate(f.sem)} a ${fmtDate(addDays(f.sem, 6))}`, chave: `${f.sem} a ${addDays(f.sem, 6)}` };
  if (f.modo === 'mes') return { de: f.mes + '-01', ate: monthEnd(f.mes), nome: fmtMonth(f.mes), chave: f.mes };
  const de = f.de <= f.ate ? f.de : f.ate, ate = f.de <= f.ate ? f.ate : f.de;
  return { de, ate, nome: `${fmtDate(de)} a ${fmtDate(ate)}`, chave: `${de} a ${ate}` };
}
function tatPeriodoBar(f, extra = '', rotulo = 'Fechamento') {
  return `<div class="toolbar">
    <label>${rotulo}<select data-f="modo">${opts([['semana', 'Semanal'], ['mes', 'Mensal'], ['periodo', 'Por período (datas)']], f.modo)}</select></label>
    ${f.modo === 'semana' ? `<button type="button" class="icon-btn" data-act="semPrev" aria-label="Semana anterior">‹</button>
        <strong class="wk-title">${fmtDate(f.sem)} a ${fmtDate(addDays(f.sem, 6))}</strong>
        <button type="button" class="icon-btn" data-act="semNext" aria-label="Próxima semana">›</button>`
      : f.modo === 'mes' ? `<label>Mês<input type="month" data-f="mes" value="${esc(f.mes)}"></label>`
      : `<label>De<input type="date" data-f="de" value="${esc(f.de)}"></label><label>Até<input type="date" data-f="ate" value="${esc(f.ate)}"></label>`}
    ${extra}</div>`;
}
const tatPeriodoActs = (f, rerender) => ({
  semPrev: () => { f.sem = addDays(f.sem, -7); rerender(); },
  semNext: () => { f.sem = addDays(f.sem, 7); rerender(); }
});
const novoFiltroTat = () => ({ modo: 'semana', sem: weekStart(isoDate()), mes: monthOf(isoDate()), de: monthStart(), ate: isoDate(), tat: '', tipo: '', st: 'Concluido' });
const inPer = (s, p) => { const d = dayOf(s); return d >= p.de && d <= p.ate; };

function tatFechamento(el) {
  const isTat = lvl() === 'Tatuador';
  const f = S.filters.tatF ||= novoFiltroTat();
  if (isTat) f.tat = S.user.ID;
  const per = tatPeriodo(f);
  const rows = T('Agenda_Tatuagem').filter(a => a.Status === 'Concluido' && inPer(a.DataHora, per) && (!f.tat || same(a.ID_Tatuador, f.tat)));
  const grupos = Object.entries(groupBy(rows, a => a.ID_Tatuador)).map(([id, list]) => {
    const fins = list.map(tatFin);
    return { id, list, prod: sum(list, 'Valor_Total'), master: sum(list, 'Comissao_Master'), pago: sum(fins, 'pago'), falta: sum(fins, x => Math.max(0, x.saldo)), tempo: sum(list, 'Tempo_Min') };
  });
  const rerender = () => tatFechamento(el);
  const meus = T('Fechamento_Comissoes').filter(x => x.Atividade === 'Tatuagem' && (!f.tat || same(x.ID_Profissional, f.tat)));
  el.innerHTML = `${tatPeriodoBar(f, !isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], f.tat)}</select></label>` : '')}
    <div class="alert info"><span class="ic">ℹ️</span><div>A comissão do Master é devida dentro do mês da sessão, mesmo que o cliente pague a prazo. "A receber" é o que os clientes ainda devem ao tatuador.</div></div>
    ${grupos.map(g => `<div class="card"><div class="card-head"><h3>🖋️ ${esc(userName(g.id))} — ${esc(per.nome)}</h3>
        <div class="btn-row"><button type="button" class="btn small" data-act="imprimir" data-id="${esc(g.id)}">🖨️ Imprimir</button>
        ${isMaster() ? `<button type="button" class="btn small primary" data-act="fechar" data-id="${esc(g.id)}">Gerar fechamento</button>` : ''}</div></div>
      <div class="kpis">${kpi('Sessões executadas', g.list.length, 'gold', fmtDur(g.tempo) + ' trabalhadas')}${kpi('Total cobrado', money(g.prod))}
        ${kpi('Comissão do Master', money(g.master), 'warn', 'pagar dentro do mês')}${kpi('Fica com o tatuador', money(g.prod - g.master), 'ok')}
        ${kpi('Já recebido dos clientes', money(g.pago), 'info')}${kpi('Clientes ainda devem', money(g.falta), g.falta > 0.009 ? 'danger' : 'default')}</div>
      ${table([
        { label: 'Data', html: a => fmtDate(a.DataHora) },
        { label: 'Cliente', html: a => esc(a.Nome_Cliente) },
        { label: 'Tipo', html: a => esc(a.Tipo || '—') },
        { label: 'Tempo', cls: 'right', html: a => a.Tempo_Min !== '' && a.Tempo_Min !== undefined ? fmtDur(a.Tempo_Min) : '—' },
        { label: 'Valor', cls: 'right', html: a => money(a.Valor_Total) },
        { label: 'Recebido', cls: 'right', html: a => money(tatFin(a).pago) },
        { label: 'Master', cls: 'right', html: a => money(a.Comissao_Master) }
      ], g.list)}</div>`).join('') || '<div class="empty">Nenhuma sessão executada no período.</div>'}
    <div class="card"><h3>📋 Fechamentos registrados</h3>${fechTable(meus)}</div>`;
  bind(el, {
    ...tatPeriodoActs(f, rerender),
    imprimir: d => {
      const g = grupos.find(x => same(x.id, d.id));
      showReceipt(reportHTML(`Fechamento Tatuagem — ${userName(g.id)}`, `Período: ${per.nome}`,
        `<table><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th class="r">Tempo</th><th class="r">Valor</th><th class="r">Recebido</th><th class="r">Master</th></tr>
        ${g.list.map(a => `<tr><td>${fmtDate(a.DataHora)}</td><td>${esc(a.Nome_Cliente)}</td><td>${esc(a.Tipo || a.Descricao_Servico)}</td><td class="r">${a.Tempo_Min ? fmtDur(a.Tempo_Min) : '—'}</td><td class="r">${money(a.Valor_Total)}</td><td class="r">${money(tatFin(a).pago)}</td><td class="r">${money(a.Comissao_Master)}</td></tr>`).join('')}
        <tr><th colspan="3">TOTAIS (${g.list.length} sessões)</th><th class="r">${fmtDur(g.tempo)}</th><th class="r">${money(g.prod)}</th><th class="r">${money(g.pago)}</th><th class="r">${money(g.master)}</th></tr></table>
        <p><b>Comissão do Master: ${money(g.master)}</b> (pagar dentro do mês) · Líquido do tatuador: ${money(g.prod - g.master)} · Clientes ainda devem: ${money(g.falta)}</p>`, [userName(g.id), 'Preto Rico (Master)']), '🖨️ Fechamento');
    },
    fechar: d => {
      const g = grupos.find(x => same(x.id, d.id));
      gerarFechamento({ Data: per.chave, ID_Profissional: g.id, Atividade: 'Tatuagem', Total_Produzido: r2(g.prod), Valor_Comissao: r2(g.prod - g.master), Valor_Master: r2(g.master) });
    },
    pago: d => marcarFechPago(d.id)
  });
  bindFilters(el, f, rerender);
}

/* ---------- Relatórios gerenciais (Master e tatuador) ---------- */
function baixarArquivo(nome, texto, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([tipo.startsWith('text/csv') ? '﻿' + texto : texto], { type: tipo });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvLinha = cols => cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
const csvNum = n => r2(num(n)).toFixed(2).replace('.', ',');

function tatRelatorios(el) {
  const isTat = lvl() === 'Tatuador';
  const master = isMaster();
  const f = S.filters.tatR ||= { ...novoFiltroTat(), modo: 'semana' };
  if (isTat) f.tat = S.user.ID;
  const per = tatPeriodo(f);
  const sess = T('Agenda_Tatuagem').filter(a => inPer(a.DataHora, per) && (!f.tat || same(a.ID_Tatuador, f.tat))
    && (!f.tipo || a.Tipo === f.tipo) && (!f.st || a.Status === f.st))
    .sort((a, b) => String(a.DataHora).localeCompare(b.DataHora));
  const linhas = sess.map(a => ({ a, f: tatFin(a), tempo: num(a.Tempo_Min) }));
  const porTipo = Object.entries(groupBy(linhas, x => x.a.Tipo || 'Sem tipo')).map(([tipo, l]) => ({
    tipo, n: l.length, valor: sum(l, x => x.a.Valor_Total), com: sum(l, x => x.a.Comissao_Master), tempo: sum(l, 'tempo'),
    medio: l.filter(x => x.tempo).length ? sum(l, 'tempo') / l.filter(x => x.tempo).length : 0
  })).sort((a, b) => b.valor - a.valor);
  // Estatística de tempo por tipo: todas as sessões executadas com início e fim lançados
  const prevTipo = nome => num((tiposTattoo().find(t => t.nome === nome) || {}).duracao);
  const estTempo = Object.entries(groupBy(T('Agenda_Tatuagem').filter(a => a.Status === 'Concluido' && num(a.Tempo_Min) > 0 && (!f.tat || same(a.ID_Tatuador, f.tat))), a => a.Tipo || 'Sem tipo'))
    .map(([tipo, l]) => { const ts = l.map(a => num(a.Tempo_Min)); const med = sum(ts, x => x) / ts.length; return { tipo, n: l.length, med, min: Math.min(...ts), max: Math.max(...ts), prev: prevTipo(tipo), porHora: sum(l, 'Valor_Total') / (sum(ts, x => x) / 60) }; })
    .sort((a, b) => b.n - a.n);
  // Loja do estúdio
  const vendas = T('Vendas_PDV').filter(v => v.Atividade === 'Tatuagem' && inPer(v.DataHora, per) && (!f.tat || same(v.ID_Usuario, f.tat)));
  const idsV = new Set(vendas.map(v => String(v.ID_Venda)));
  const itens = T('Vendas_Itens').filter(i => idsV.has(String(i.ID_Venda)));
  const tot = { n: linhas.length, valor: sum(linhas, x => x.a.Valor_Total), com: sum(linhas, x => x.a.Comissao_Master), pago: sum(linhas, x => x.f.pago), falta: sum(linhas, x => Math.max(0, x.f.saldo)), tempo: sum(linhas, 'tempo') };
  const rerender = () => tatRelatorios(el);
  const colsTrab = [
    { label: 'Data e hora', html: x => fmtDate(x.a.DataHora) },
    ...(!isTat ? [{ label: 'Tatuador', html: x => esc(userName(x.a.ID_Tatuador)) }] : []),
    { label: 'Cliente', html: x => esc(x.a.Nome_Cliente) },
    { label: 'Tipo de serviço', html: x => esc(x.a.Tipo || '—') },
    { label: 'Situação', html: x => tatBadge(x.a.Status) },
    { label: 'Valor cobrado', cls: 'right', html: x => money(x.a.Valor_Total) },
    { label: 'Comissão Master', cls: 'right', html: x => money(x.a.Comissao_Master) },
    { label: 'Recebido', cls: 'right', html: x => money(x.f.pago) },
    { label: 'Falta', cls: 'right', html: x => x.f.saldo > 0.009 ? money(x.f.saldo) : '—' },
    { label: 'Tempo gasto', cls: 'right', html: x => x.tempo ? fmtDur(x.tempo) : `<span class="muted">prev. ${fmtDur(tatDur(x.a))}</span>` }
  ];
  el.innerHTML = `${tatPeriodoBar(f, `
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], f.tat)}</select></label>` : ''}
      <label>Tipo<select data-f="tipo">${opts([['', 'Todos'], ...tiposTattoo().map(t => t.nome)], f.tipo)}</select></label>
      <label>Situação<select data-f="st">${opts([['', 'Todas'], ...TAT_STATUS], f.st)}</select></label>`, 'Relatório')}
    <div class="kpis">${kpi('Trabalhos', tot.n, 'gold', fmtDur(tot.tempo) + ' trabalhadas')}${kpi('Valor cobrado', money(tot.valor))}
      ${kpi('Comissão do Master', money(tot.com), 'warn')}${kpi('Recebido', money(tot.pago), 'ok')}${kpi('Falta receber', money(tot.falta), tot.falta > 0.009 ? 'danger' : 'default')}
      ${kpi('Produtos vendidos (sem comissão)', money(sum(vendas, 'Total_Venda')), 'info', `${vendas.length} venda(s) · 100% do tatuador`)}</div>
    <div class="card"><div class="card-head"><h3>🖋️ Trabalhos — ${esc(per.nome)}</h3>
      <div class="btn-row"><button type="button" class="btn small" data-act="impTrab">🖨️ Imprimir</button><button type="button" class="btn small" data-act="csvTrab">⬇️ Planilha</button></div></div>
      ${table(colsTrab, linhas, { empty: 'Nenhum trabalho no período.' })}</div>
    <div class="card"><h3>🎨 Resumo por tipo de serviço</h3>${table([
      { label: 'Tipo', html: r => `<b>${esc(r.tipo)}</b>` },
      { label: 'Qtd', cls: 'right', html: r => r.n },
      { label: 'Valor cobrado', cls: 'right', html: r => money(r.valor) },
      { label: 'Comissão Master', cls: 'right', html: r => money(r.com) },
      { label: 'Tempo total', cls: 'right', html: r => r.tempo ? fmtDur(r.tempo) : '—' },
      { label: 'Tempo médio', cls: 'right', html: r => r.medio ? fmtDur(r.medio) : '—' }
    ], porTipo, { empty: 'Sem dados.' })}</div>
    <div class="card"><h3>⏱️ Quanto tempo leva cada tipo de serviço</h3>
      <p class="muted small">Calculado com o início e o fim lançados em todas as sessões executadas${f.tat ? ' de ' + esc(userName(f.tat)) : ''}. Use para acertar a duração prevista na agenda.</p>
      ${table([
        { label: 'Tipo', html: r => `<b>${esc(r.tipo)}</b>` },
        { label: 'Sessões medidas', cls: 'right', html: r => r.n },
        { label: 'Tempo médio', cls: 'right', html: r => `<b>${fmtDur(r.med)}</b>` },
        { label: 'Mais rápida', cls: 'right', html: r => fmtDur(r.min) },
        { label: 'Mais demorada', cls: 'right', html: r => fmtDur(r.max) },
        { label: 'Previsto na tabela', cls: 'right', html: r => r.prev ? fmtDur(r.prev) : '—' },
        { label: 'Diferença', cls: 'right', html: r => r.prev ? `<span class="${r.med > r.prev ? 't-danger' : 't-ok'}">${r.med > r.prev ? '+' : '−'}${fmtDur(Math.abs(r.med - r.prev))}</span>` : '—' },
        { label: 'Valor por hora', cls: 'right', html: r => isFinite(r.porHora) ? money(r.porHora) : '—' }
      ], estTempo, { empty: 'Ainda não há sessões com início e fim lançados.' })}</div>
    <div class="card"><div class="card-head"><h3>📦 Estoque e vendas da loja do estúdio</h3>
      <div class="btn-row"><button type="button" class="btn small" data-act="impEst">🖨️ Relatório de estoque</button></div></div>
      ${estoqueTabela('Tatuagem', itens)}</div>`;
  bind(el, {
    ...tatPeriodoActs(f, rerender),
    impTrab: () => showReceipt(reportHTML('Relatório de trabalhos — Tatuagem', `Período: ${per.nome}${f.tat ? ' · Tatuador: ' + esc(userName(f.tat)) : ''}`,
      `<table><tr><th>Data/hora</th>${!isTat ? '<th>Tatuador</th>' : ''}<th>Cliente</th><th>Tipo</th><th class="r">Valor</th><th class="r">Comissão</th><th class="r">Recebido</th><th class="r">Tempo</th></tr>
      ${linhas.map(x => `<tr><td>${fmtDate(x.a.DataHora)}</td>${!isTat ? `<td>${esc(userName(x.a.ID_Tatuador))}</td>` : ''}<td>${esc(x.a.Nome_Cliente)}</td><td>${esc(x.a.Tipo || '—')}</td><td class="r">${money(x.a.Valor_Total)}</td><td class="r">${money(x.a.Comissao_Master)}</td><td class="r">${money(x.f.pago)}</td><td class="r">${x.tempo ? fmtDur(x.tempo) : '—'}</td></tr>`).join('')}
      <tr><th colspan="${isTat ? 3 : 4}">TOTAIS (${tot.n})</th><th class="r">${money(tot.valor)}</th><th class="r">${money(tot.com)}</th><th class="r">${money(tot.pago)}</th><th class="r">${fmtDur(tot.tempo)}</th></tr></table>
      <h3>Por tipo de serviço</h3><table><tr><th>Tipo</th><th class="r">Qtd</th><th class="r">Valor</th><th class="r">Comissão</th><th class="r">Tempo médio</th></tr>
      ${porTipo.map(r => `<tr><td>${esc(r.tipo)}</td><td class="r">${r.n}</td><td class="r">${money(r.valor)}</td><td class="r">${money(r.com)}</td><td class="r">${r.medio ? fmtDur(r.medio) : '—'}</td></tr>`).join('')}</table>`), '🖨️ Relatório'),
    csvTrab: () => baixarArquivo(`tatuagem-trabalhos-${per.de}-a-${per.ate}.csv`, [
      csvLinha(['Data', 'Hora', 'Tatuador', 'Cliente', 'Tipo de serviço', 'Descrição', 'Situação', 'Valor cobrado', 'Comissão Master', 'Recebido', 'Falta', 'Início real', 'Fim real', 'Tempo gasto (min)']),
      ...linhas.map(x => csvLinha([fmtDate(dayOf(x.a.DataHora)), timeOf(x.a.DataHora), userName(x.a.ID_Tatuador), x.a.Nome_Cliente, x.a.Tipo, x.a.Descricao_Servico,
        (TAT_STATUS.find(s => s[0] === x.a.Status) || [, x.a.Status])[1], csvNum(x.a.Valor_Total), csvNum(x.a.Comissao_Master), csvNum(x.f.pago), csvNum(Math.max(0, x.f.saldo)),
        fmtDate(x.a.Inicio_Real), fmtDate(x.a.Fim_Real), x.tempo || '']))
    ].join('\r\n')),
    impEst: () => imprimirEstoque('Tatuagem', itens, per.nome)
  });
  bindFilters(el, f, rerender);
}

/* ---------- Recibo em PDF (biblioteca carregada só quando precisa, do próprio site) ---------- */
let pdfLib = null;
function carregarPDF() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return pdfLib ||= new Promise((res, rej) => {
    const sc = Object.assign(document.createElement('script'), { src: 'vendor/html2pdf.bundle.min.js' });
    sc.onload = () => res(window.html2pdf);
    sc.onerror = () => { pdfLib = null; rej(new Error('Não foi possível gerar o PDF agora. Use o botão Imprimir e escolha "Salvar como PDF".')); };
    document.head.appendChild(sc);
  });
}
/** Gera e baixa um PDF com o recibo ou relatório (no celular abre para compartilhar). */
async function baixarPDF(html, titulo = 'recibo') {
  const lib = await carregarPDF();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;color:#000;padding:6mm;width:' + (/class="report/.test(html) ? '190mm' : '80mm');
  box.innerHTML = html;
  document.body.appendChild(box);
  const nome = `${slugNome(String(titulo).replace(/^[^\p{L}\p{N}]+/u, ''))}-${isoDate()}.pdf`;
  try {
    await lib().set({ margin: 4, filename: nome, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: /class="report/.test(html) ? 'a4' : [86, Math.max(120, box.offsetHeight * 0.3)], orientation: 'portrait' } }).from(box).save();
  } finally { box.remove(); }
  return true;
}

/** Recibo de um pagamento (parcela, entrada ou à vista) de uma sessão. */
function reciboPagamento(p) {
  const a = T('Agenda_Tatuagem').find(s => same(s.ID, p.ID_Sessao)) || {};
  const f = a.ID ? tatFin(a) : { saldo: 0 };
  showReceipt(receiptHTML({
    titulo: 'RECIBO DE PAGAMENTO — TATUAGEM', id: p.ID, data: (p.Data_Pagamento || isoDate()) + 'T' + (timeOf(p.Alterado_Em) || '12:00'),
    cliente: p.Nome_Cliente || a.Nome_Cliente, operador: userName(a.ID_Tatuador || p.ID_Tatuador),
    itens: [[`${p.Parcela ? p.Parcela + ' — ' : ''}${a.Tipo || 'Tatuagem'}${a.DataHora ? ' (sessão ' + fmtDate(a.DataHora) + ')' : ''}`, '', p.Valor]], total: p.Valor,
    extras: [['Forma', payLabel(p.Forma_Pagamento)], ['Valor do serviço', money(a.Valor_Total)], ['Total já pago', money(f.pago || p.Valor)], ['Saldo a pagar', money(Math.max(0, f.saldo))]],
    obs: p.Obs || ''
  }), '🧾 Recibo de pagamento');
}

/** Abre o comprovante que o cliente mandou pelo link. */
async function verComprovante(idPag, tabela) {
  const r = await Api.exec('verComprovante', { id: idPag, tabela }, { online: true });
  const url = `data:${r.mime};base64,${r.base64}`;
  const corpo = r.mime === 'application/pdf'
    ? `<iframe src="${url}" style="width:100%;height:70vh;border:0" title="Comprovante"></iframe>`
    : `<img src="${url}" alt="Comprovante" style="max-width:100%;display:block;margin:auto">`;
  const m = openModal({ title: '👁 Comprovante do cliente', size: 'lg', body: corpo + `<p class="muted small" style="margin-top:.6rem">Confira no extrato do banco antes de confirmar a sessão.</p>`,
    actions: [{ label: '⬇️ Baixar', cls: 'ghost', onClick: () => { const a = Object.assign(document.createElement('a'), { href: url, download: r.nome || 'comprovante' }); document.body.appendChild(a); a.click(); a.remove(); } }, { label: 'Fechar', cls: 'primary' }] });
  return m;
}

/* ---------- Perfil do tatuador: Pix, horário e textos dos avisos (editáveis pelo tatuador) ---------- */
const DEFAULT_TEXTOS_TATTOO = {
  sanitario: 'Cuidados e condições sanitárias: o estúdio usa material descartável e esterilizado, aberto na sua frente. Venha alimentado(a), hidratado(a) e descansado(a). Não beba álcool nem tome remédios que afinem o sangue (como AAS) nas 24 horas antes. Avise se tiver alergia, diabetes, problema de coagulação, gravidez ou outra condição de saúde.',
  menor: 'Menor de idade: só tatuamos menores de 18 anos acompanhados do pai, da mãe ou do responsável legal, com documento com foto de ambos e autorização assinada no estúdio.',
  falta: 'Faltas e remarcação: a entrada de {entrada}% garante o seu horário. Se não comparecer, a entrada não será devolvida. Para desmarcar ou remarcar sem perder a entrada, avise com pelo menos 24 horas de antecedência.',
  cuidados: 'Depois da tatuagem: lave com sabonete neutro, use a pomada indicada, não coce, não tome sol e não entre em piscina ou mar por 15 dias.'
};
const TEXTOS_LABEL = { sanitario: '🧼 Condições sanitárias', menor: '🧒 Menor de idade', falta: '📅 Falta e desmarcação (24 h)', cuidados: '🩹 Cuidados depois da tatuagem' };
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const entradaPct = () => num(cfgVal('tattoo_entrada_pct', 30));
function perfilTat(id) {
  const p = cfgVal('tatuador_' + id, {}) || {};
  return { pix: p.pix || '', titular: p.titular || '', banco: p.banco || '',
    horario: { dias: [1, 2, 3, 4, 5, 6], inicio: '10:00', fim: '20:00', ...(p.horario || {}) },
    textos: { ...DEFAULT_TEXTOS_TATTOO, ...(p.textos || {}) } };
}
const textoAviso = (txt, d = {}) => fillTpl(txt, { entrada: entradaPct(), ...d });
const linkAgendamento = id => new URL(`agendar.html?t=${encodeURIComponent(id)}`, location.href.split('#')[0]).href;

/** Monta a mensagem de WhatsApp com os avisos escolhidos para uma sessão ou cliente. */
function avisosClienteModal({ tatId, sessao, cli }) {
  const perf = perfilTat(tatId);
  const nome = (sessao?.Nome_Cliente || cli?.Nome || '').split(' ')[0];
  const fone = cliente(sessao?.ID_Cliente)?.Telefone_WhatsApp || sessao?.Telefone || cli?.Telefone_WhatsApp || '';
  const marcados = new Set(['sanitario', 'falta', ...(sessao?.Menor === 'Sim' ? ['menor'] : [])]);
  formModal({
    title: `📲 Avisos para ${nome || 'o cliente'}`,
    intro: `<p class="muted small">Escolha os avisos. O WhatsApp abre com a mensagem pronta${fone ? ` para <b>${esc(fone)}</b>` : ''}.</p>`,
    values: { quais: JSON.stringify([...marcados]), fone },
    fields: [
      { name: 'quais', label: 'Avisos', type: 'checks', full: true, options: Object.entries(TEXTOS_LABEL) },
      { name: 'fone', label: 'WhatsApp do cliente', inputmode: 'tel', required: true },
      { name: 'link', label: 'Incluir o link para agendar', type: 'select', options: [['nao', 'Não'], ['sim', 'Sim']] }
    ],
    submitLabel: '📲 Abrir WhatsApp',
    onSubmit: d => {
      if (!d.quais.length && d.link !== 'sim') throw new Error('Escolha pelo menos um aviso.');
      const partes = [`Olá${nome ? ' ' + nome : ''}! Aqui é ${userName(tatId)}, do estúdio de tatuagem Preto Rico 🖋️`];
      if (sessao?.DataHora && sessao.Status !== 'Cancelado') partes.push(`Sua sessão: ${fmtDate(sessao.DataHora)}${sessao.Tipo ? ' · ' + sessao.Tipo : ''}.`);
      d.quais.forEach(k => partes.push(textoAviso(perf.textos[k], { nome })));
      if (d.link === 'sim') partes.push(`Para agendar, escolha o horário e envie o comprovante da entrada aqui: ${linkAgendamento(tatId)}`);
      openWA(d.fone, partes.join('\n\n'));
    }
  });
}

/** Link para o cliente escolher o horário e mandar o comprovante da entrada. */
function linkAgendamentoModal(tatPadrao) {
  const isTat = lvl() === 'Tatuador';
  const tats = isTat ? [S.user] : profs('Tatuador');
  if (!tats.length) return toast('Cadastre um tatuador em Usuários primeiro.', 'warn');
  if (!Api.isRemote()) toast('No modo local (demonstração) o link não recebe pedidos.', 'warn');
  let id = tatPadrao || tats[0].ID;
  const corpo = () => {
    const perf = perfilTat(id);
    return `${!isTat ? `<div class="field"><label>Tatuador</label><select id="lk-tat">${opts(tats.map(u => [u.ID, u.Nome]), id)}</select></div>` : ''}
      <p>O cliente abre o link, escolhe o tipo, o dia e o horário livre, paga a entrada de <b>${entradaPct()}%</b> por Pix e manda o comprovante. O pedido aparece na agenda como <b>Pedido pelo link</b> para você confirmar.</p>
      <div class="field"><label>Link</label><input id="lk-url" readonly value="${esc(linkAgendamento(id))}"></div>
      ${!perf.pix ? `<div class="alert warn" style="margin-top:.6rem"><span class="ic">⚠️</span><div>Cadastre a chave Pix em <b>📲 Avisos ao cliente</b> antes de mandar o link.</div></div>` : ''}`;
  };
  const m = openModal({ title: '🔗 Link de agendamento', body: `<div id="lk-body">${corpo()}</div>`,
    actions: [
      { label: '📋 Copiar', cls: 'ghost', onClick: async () => { const v = $('#lk-url').value; try { await navigator.clipboard.writeText(v); toast('Link copiado ✔', 'ok'); } catch (e) { $('#lk-url').select(); document.execCommand('copy'); toast('Link copiado ✔', 'ok'); } } },
      { label: '📲 Enviar no WhatsApp', cls: 'primary big', onClick: (f, close) => { close(); avisosClienteModal({ tatId: id }); setTimeout(() => { const s = $('.modal [name="link"]'); if (s) s.value = 'sim'; }, 50); } }
    ] });
  m.node.addEventListener('change', e => { if (e.target.id === 'lk-tat') { id = e.target.value; $('#lk-body', m.node).innerHTML = corpo(); } });
}

/* ---------- Aba Avisos ao cliente ---------- */
function tatAvisosCliente(el) {
  const isTat = lvl() === 'Tatuador';
  const f = S.filters.tatAv ||= { tat: isTat ? S.user.ID : (profs('Tatuador')[0] || {}).ID || '' };
  if (isTat) f.tat = S.user.ID;
  const podeEditar = isTat || isMaster();
  if (!f.tat) { el.innerHTML = '<div class="empty">Cadastre um tatuador em Usuários primeiro.</div>'; return; }
  const perf = perfilTat(f.tat);
  const prox = T('Agenda_Tatuagem').filter(a => same(a.ID_Tatuador, f.tat) && ['Agendado', 'Solicitado'].includes(a.Status) && dayOf(a.DataHora) >= isoDate())
    .sort((a, b) => String(a.DataHora).localeCompare(b.DataHora)).slice(0, 30);
  el.innerHTML = `<div class="toolbar">
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts(profs('Tatuador').map(u => [u.ID, u.Nome]), f.tat)}</select></label>` : ''}
      <button type="button" class="btn primary big" data-act="link">🔗 Link para o cliente agendar</button>
      <button type="button" class="btn" data-act="enviarLivre">📲 Mandar avisos para um cliente</button>
    </div>
    <div class="card"><h3>📅 Próximas sessões</h3>${table([
      { label: 'Data', html: a => fmtDate(a.DataHora) },
      { label: 'Cliente', html: a => `<b>${esc(a.Nome_Cliente)}</b>${a.Menor === 'Sim' ? ' ' + badge('Menor', 'warn') : ''}` },
      { label: 'Situação', html: a => tatBadge(a.Status) },
      { label: '', cls: 'actions', html: a => `<button type="button" class="btn small wa" data-act="enviar" data-id="${esc(a.ID)}">📲 Mandar avisos</button>` }
    ], prox, { empty: 'Nenhuma sessão marcada.' })}</div>
    <div class="card"><div class="card-head"><h3>✏️ Textos dos avisos${!isTat ? ' — ' + esc(userName(f.tat)) : ''}</h3></div>
      <p class="muted small">${podeEditar ? 'Você pode mudar estes textos quando quiser. ' : ''}Use {entrada} para a % da entrada (hoje ${entradaPct()}%) e {nome} para o nome do cliente. Eles aparecem na página de agendamento e nas mensagens de WhatsApp.</p>
      <div class="form-grid">${Object.entries(TEXTOS_LABEL).map(([k, l]) => `<div class="field full"><label>${esc(l)}</label>
        <textarea data-txt="${k}" rows="4" ${podeEditar ? '' : 'readonly'}>${esc(perf.textos[k])}</textarea></div>`).join('')}</div></div>
    <div class="card"><h3>💸 Dados para a entrada (Pix) e horário de atendimento</h3>
      <div class="form-grid">
        <div class="field"><label>Chave Pix</label><input id="av-pix" value="${esc(perf.pix)}" ${podeEditar ? '' : 'readonly'} placeholder="CPF, celular, e-mail ou chave aleatória"></div>
        <div class="field"><label>Nome do titular</label><input id="av-tit" value="${esc(perf.titular)}" ${podeEditar ? '' : 'readonly'}></div>
        <div class="field"><label>Banco</label><input id="av-banco" value="${esc(perf.banco)}" ${podeEditar ? '' : 'readonly'}></div>
        <div class="field"><label>Atende das</label><input id="av-ini" type="time" value="${esc(perf.horario.inicio)}" ${podeEditar ? '' : 'readonly'}></div>
        <div class="field"><label>Até as</label><input id="av-fim" type="time" value="${esc(perf.horario.fim)}" ${podeEditar ? '' : 'readonly'}></div>
        <div class="field full"><label>Dias de atendimento</label><div class="checks">${DIAS_SEMANA.map((d, i) => `<label class="check"><input type="checkbox" data-dia="${i}" ${perf.horario.dias.map(Number).includes(i) ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}> ${d}</label>`).join('')}</div></div>
      </div>
      ${podeEditar ? `<div class="btn-row" style="margin-top:1rem"><button type="button" class="btn primary big" data-act="salvar">💾 Salvar avisos e dados</button>
        <button type="button" class="btn ghost" data-act="padrao">Voltar aos textos padrão</button></div>` : ''}</div>`;
  const ler = () => ({
    pix: $('#av-pix', el).value.trim(), titular: $('#av-tit', el).value.trim(), banco: $('#av-banco', el).value.trim(),
    horario: { inicio: $('#av-ini', el).value, fim: $('#av-fim', el).value, dias: $$('[data-dia]', el).filter(c => c.checked).map(c => Number(c.dataset.dia)) },
    textos: Object.fromEntries($$('[data-txt]', el).map(t => [t.dataset.txt, t.value.trim()]))
  });
  bind(el, {
    link: () => linkAgendamentoModal(f.tat),
    enviarLivre: () => {
      const cs = clientes();
      formModal({ title: '📲 Mandar avisos', fields: [{ name: 'cli', label: 'Cliente', type: 'select', options: [['', '— Digitar o número —'], ...cs.map(c => [c.ID, c.Nome])] }],
        submitLabel: 'Continuar', onSubmit: d => { setTimeout(() => avisosClienteModal({ tatId: f.tat, cli: cliente(d.cli) }), 50); } });
    },
    enviar: d => avisosClienteModal({ tatId: f.tat, sessao: T('Agenda_Tatuagem').find(a => same(a.ID, d.id)) }),
    salvar: async () => {
      const p = ler();
      if (p.horario.inicio >= p.horario.fim) return toast('O horário final precisa ser depois do inicial.', 'warn');
      if (!p.horario.dias.length) return toast('Marque pelo menos um dia de atendimento.', 'warn');
      if (await run(() => Api.exec('salvarPerfilTatuador', { ID_Tatuador: f.tat, perfil: p }), 'Avisos e dados salvos ✔')) tatAvisosCliente(el);
    },
    padrao: async () => {
      if (!(await confirmModal('Voltar todos os textos para o padrão do sistema?', { ok: 'Voltar ao padrão' }))) return;
      $$('[data-txt]', el).forEach(t => { t.value = DEFAULT_TEXTOS_TATTOO[t.dataset.txt]; });
      toast('Textos padrão colocados. Toque em Salvar para gravar.', '');
    }
  });
  bindFilters(el, f, () => tatAvisosCliente(el));
}

/* ---------- Aba Repasses: comissão do Master devida no mês x repassada ---------- */
function tatRepasses(el) {
  const isTat = lvl() === 'Tatuador';
  const f = S.filters.tatRep ||= { mes: monthOf(isoDate()), tat: '' };
  if (isTat) f.tat = S.user.ID;
  const tats = isTat ? [S.user] : profs('Tatuador').filter(u => !f.tat || same(u.ID, f.tat));
  const reps = T('Tattoo_Repasses').filter(r => r.Status !== 'Cancelado');
  const devidoMes = (id, mes) => sum(T('Agenda_Tatuagem').filter(a => same(a.ID_Tatuador, id) && a.Status === 'Concluido' && monthOf(a.DataHora) === mes), 'Comissao_Master');
  const repMes = (id, mes, st) => sum(reps.filter(r => same(r.ID_Tatuador, id) && r.Mes === mes && (!st || r.Status === st)), 'Valor');
  // saldo dos meses anteriores (até 12 meses)
  const anteriores = id => { let s = 0; for (let i = 1; i <= 12; i++) { const m = addMonth(f.mes, -i); s += Math.max(0, r2(devidoMes(id, m) - repMes(id, m))); } return r2(s); };
  const linhas = tats.map(u => {
    const dev = r2(devidoMes(u.ID, f.mes)), conf = r2(repMes(u.ID, f.mes, 'Confirmado')), inf = r2(repMes(u.ID, f.mes, 'Informado'));
    return { u, dev, conf, inf, falta: r2(Math.max(0, dev - conf - inf)), atras: anteriores(u.ID) };
  });
  const lista = T('Tattoo_Repasses').filter(r => r.Mes === f.mes && (!f.tat || same(r.ID_Tatuador, f.tat))).sort((a, b) => String(b.Data).localeCompare(a.Data));
  const rerender = () => tatRepasses(el);
  el.innerHTML = `<div class="toolbar">
      <button type="button" class="icon-btn" data-act="mPrev" aria-label="Mês anterior">‹</button>
      <strong class="wk-title">${esc(fmtMonth(f.mes))}</strong>
      <button type="button" class="icon-btn" data-act="mNext" aria-label="Próximo mês">›</button>
      ${!isTat ? `<label>Tatuador<select data-f="tat">${opts([['', 'Todos'], ...profs('Tatuador').map(u => [u.ID, u.Nome])], f.tat)}</select></label>` : ''}
      <button type="button" class="btn primary big" data-act="novo">➕ ${isTat ? 'Registrar repasse ao Master' : 'Lançar repasse recebido'}</button>
    </div>
    <div class="alert info"><span class="ic">ℹ️</span><div>A comissão do Master é a das sessões <b>executadas no mês</b> e deve ser repassada dentro do mês, mesmo que o cliente pague a prazo. A venda de produtos não tem comissão.</div></div>
    ${linhas.map(l => `<div class="card"><div class="card-head"><h3>🖋️ ${esc(l.u.Nome)}</h3></div>
      <div class="kpis">${kpi('Comissão do mês', money(l.dev), 'gold')}${kpi('Repassado e confirmado', money(l.conf), 'ok')}
        ${kpi('Informado, aguardando o Master', money(l.inf), 'info')}${kpi('Falta repassar', money(l.falta), l.falta > 0.009 ? 'danger' : 'ok')}
        ${l.atras > 0.009 ? kpi('Pendente de meses anteriores', money(l.atras), 'danger') : ''}</div></div>`).join('') || '<div class="empty">Nenhum tatuador.</div>'}
    <div class="card"><h3>📋 Repasses de ${esc(fmtMonth(f.mes))}</h3>${table([
      { label: 'Data', html: r => fmtDate(r.Data) },
      ...(!isTat ? [{ label: 'Tatuador', html: r => esc(userName(r.ID_Tatuador)) }] : []),
      { label: 'Valor', cls: 'right', html: r => `<b>${money(r.Valor)}</b>` },
      { label: 'Forma', html: r => esc(payLabel(r.Forma_Pagamento)) },
      { label: 'Situação', html: r => r.Status === 'Confirmado' ? badge('Confirmado pelo Master', 'ok') : r.Status === 'Cancelado' ? badge('Cancelado', 'muted') : badge('Aguardando o Master', 'warn') },
      { label: 'Obs.', html: r => esc(r.Obs || '') },
      { label: '', cls: 'actions', html: r => `
        ${isMaster() && r.Status === 'Informado' ? `<button type="button" class="btn small ok" data-act="confirmar" data-id="${esc(r.ID)}">✔ Confirmar recebimento</button>` : ''}
        ${r.Status !== 'Cancelado' ? `<button type="button" class="btn small" data-act="recibo" data-id="${esc(r.ID)}">🧾 Recibo</button>` : ''}
        ${(isMaster() || r.Status === 'Informado') && r.Status !== 'Cancelado' ? `<button type="button" class="btn small ghost" data-act="editar" data-id="${esc(r.ID)}">✏️</button>
          <button type="button" class="btn small danger-ghost" data-act="cancelar" data-id="${esc(r.ID)}">✕</button>` : ''}` }
    ], lista, { empty: 'Nenhum repasse neste mês.' })}</div>`;
  const rep = id => T('Tattoo_Repasses').find(r => same(r.ID, id));
  const form = (r = {}) => {
    const tatId = r.ID_Tatuador || f.tat || (linhas[0] && linhas[0].u.ID);
    const l = linhas.find(x => same(x.u.ID, tatId));
    formModal({
      title: r.ID ? '✏️ Editar repasse' : '➕ Repasse da comissão ao Master',
      values: { Mes: f.mes, Data: isoDate(), Forma_Pagamento: 'Pix', Valor: r.ID ? r.Valor : (l ? l.falta : '') || '', ID_Tatuador: tatId, ...r },
      fields: [
        ...(!isTat ? [{ name: 'ID_Tatuador', label: 'Tatuador', type: 'select', options: profs('Tatuador').map(u => [u.ID, u.Nome]), required: true }] : []),
        { name: 'Mes', label: 'Comissão do mês', type: 'month', required: true },
        { name: 'Valor', label: 'Valor repassado (R$)', type: 'number', step: '0.01', min: 0.01, required: true, inputmode: 'decimal' },
        { name: 'Data', label: 'Data do repasse', type: 'date', required: true },
        { name: 'Forma_Pagamento', label: 'Forma', type: 'select', options: TAT_PAY.map(x => [x.id, x.label]) },
        { name: 'Obs', label: 'Observação', full: true }
      ],
      intro: isTat ? '<p class="muted small">O Master recebe o aviso e confirma o recebimento.</p>' : '',
      onSubmit: async d => {
        await Api.exec('salvarRepasse', { row: { ...r, ...d, ID: r.ID || uid('RP'), ...(isMaster() ? { Status: r.Status || 'Confirmado' } : {}) } });
        toast('Repasse salvo ✔', 'ok'); refresh();
      }
    });
  };
  bind(el, {
    mPrev: () => { f.mes = addMonth(f.mes, -1); rerender(); },
    mNext: () => { f.mes = addMonth(f.mes, 1); rerender(); },
    novo: () => form(),
    editar: d => form(rep(d.id)),
    confirmar: async d => { if (await run(() => Api.exec('salvarRepasse', { row: { ...rep(d.id), Status: 'Confirmado' } }), 'Repasse confirmado ✔')) refresh(); },
    cancelar: async d => {
      if (await confirmModal('Cancelar este repasse? Ele fica no histórico como cancelado.', { ok: 'Cancelar repasse', cls: 'danger' })
        && await run(() => Api.exec('salvarRepasse', { row: { ...rep(d.id), Status: 'Cancelado' } }), 'Repasse cancelado')) refresh();
    },
    recibo: d => {
      const r = rep(d.id);
      showReceipt(receiptHTML({ titulo: 'RECIBO DE REPASSE DE COMISSÃO', id: r.ID, data: r.Data + 'T' + (timeOf(r.Alterado_Em) || '12:00'), cliente: 'Preto Rico (Master)', operador: userName(r.ID_Tatuador),
        itens: [[`Comissão da sala — ${fmtMonth(r.Mes)}`, '', r.Valor]], total: r.Valor,
        extras: [['Forma', payLabel(r.Forma_Pagamento)], ['Situação', r.Status === 'Confirmado' ? `Confirmado por ${userName(r.Confirmado_Por)} em ${fmtDate(r.Confirmado_Em)}` : 'Aguardando confirmação do Master']],
        obs: r.Obs || '' }), '🧾 Recibo de repasse');
    }
  });
  bindFilters(el, f, rerender);
}

/* ---------- Relatório de estoque (todas as lojas) ---------- */
/** Tabela de estoque com o que foi vendido no período (itens = Vendas_Itens do período). */
function estoqueTabela(act, itens) {
  const master = isMaster();
  const vend = {};
  itens.forEach(i => { const v = vend[i.ID_Produto] ||= { q: 0, fat: 0 }; v.q += num(i.Qtd); v.fat += num(i.Subtotal); });
  const prods = T('Estoque').filter(p => p.Atividade === act).sort((a, b) => String(a.Produto).localeCompare(b.Produto));
  return table([
    { label: 'Produto', html: p => `<b>${esc(p.Produto)}</b>` },
    { label: 'Em estoque', cls: 'right', html: p => num(p.Qtd) },
    { label: 'Mínimo', cls: 'right', html: p => num(p.Minimo) },
    { label: 'Situação', html: p => stockBadge(p) },
    { label: 'Vendidos', cls: 'right', html: p => vend[p.ID]?.q || 0 },
    { label: 'Faturado', cls: 'right', html: p => money(vend[p.ID]?.fat || 0) },
    { label: 'Preço', cls: 'right', html: p => money(p.Preco_Venda) },
    ...(master ? [{ label: 'Valor em estoque (custo)', cls: 'right', html: p => money(num(p.Qtd) * num(p.Preco_Custo)) }] : [])
  ], prods, { empty: 'Nenhum produto cadastrado nesta loja.' });
}

function imprimirEstoque(act, itens, periodo) {
  const master = isMaster();
  const vend = {};
  itens.forEach(i => { const v = vend[i.ID_Produto] ||= { q: 0, fat: 0 }; v.q += num(i.Qtd); v.fat += num(i.Subtotal); });
  const prods = T('Estoque').filter(p => p.Atividade === act).sort((a, b) => String(a.Produto).localeCompare(b.Produto));
  showReceipt(reportHTML(`Relatório de estoque — ${ACT_LABEL[act] || act}`, `Vendas do período: ${periodo}`,
    `<table><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th><th>Situação</th><th class="r">Vendidos</th><th class="r">Faturado</th>${master ? '<th class="r">Custo total</th>' : ''}</tr>
    ${prods.map(p => `<tr><td>${esc(p.Produto)}</td><td class="r">${num(p.Qtd)}</td><td class="r">${num(p.Minimo)}</td><td>${STOCK_LABEL[stockLevel(p)]}</td><td class="r">${vend[p.ID]?.q || 0}</td><td class="r">${money(vend[p.ID]?.fat || 0)}</td>${master ? `<td class="r">${money(num(p.Qtd) * num(p.Preco_Custo))}</td>` : ''}</tr>`).join('')}
    <tr><th>TOTAIS (${prods.length} produtos)</th><th class="r">${sum(prods, 'Qtd')}</th><th></th><th></th><th class="r">${sum(Object.values(vend), 'q')}</th><th class="r">${money(sum(Object.values(vend), 'fat'))}</th>${master ? `<th class="r">${money(sum(prods, p => num(p.Qtd) * num(p.Preco_Custo)))}</th>` : ''}</tr></table>
    <p>Itens com estoque baixo ou crítico: <b>${prods.filter(p => stockLevel(p) !== 'ok').map(p => esc(p.Produto)).join(', ') || 'nenhum'}</b></p>`), '🖨️ Estoque');
}

function tatTipos(el) {
  const list = S.filters.tatTipos ||= tiposTattoo().map(t => ({ ...t }));
  el.innerHTML = `<div class="card"><div class="card-head"><h3>🎨 Tipos de tatuagem</h3></div>
    <p class="muted small">Só o Master altera esta tabela. Ao escolher o tipo na sessão, o sistema preenche o valor e a duração, e calcula a comissão do Master pela % da sala.</p>
    ${table([
      { label: 'Tipo', html: t => `<input data-i="${list.indexOf(t)}" data-k="nome" value="${esc(t.nome)}">` },
      { label: 'Valor base (R$)', html: t => `<input type="number" step="0.01" min="0" data-i="${list.indexOf(t)}" data-k="preco" value="${esc(t.preco)}">` },
      { label: 'Duração (min)', html: t => `<input type="number" step="15" min="15" data-i="${list.indexOf(t)}" data-k="duracao" value="${esc(t.duracao)}">` },
      { label: '% da sala', html: t => `<input type="number" step="1" min="0" max="100" data-i="${list.indexOf(t)}" data-k="pct" value="${esc(t.pct)}">` },
      { label: '', cls: 'actions', html: t => `<button type="button" class="btn small danger-ghost" data-act="rm" data-i="${list.indexOf(t)}">Remover</button>` }
    ], list, { empty: 'Nenhum tipo cadastrado.' })}
    <div class="btn-row" style="margin-top:1rem">
      <button type="button" class="btn" data-act="add">➕ Adicionar tipo</button>
      <button type="button" class="btn primary big" data-act="salvar">💾 Salvar tipos</button>
    </div></div>`;
  el.oninput = e => { const i = e.target.dataset.i, k = e.target.dataset.k; if (i != null && k) list[i][k] = k === 'nome' ? e.target.value : num(e.target.value); };
  bind(el, {
    add: () => { list.push({ nome: 'Novo tipo', preco: 0, duracao: 120, pct: num(cfgVal('comissao_master_tattoo', 30)) }); tatTipos(el); },
    rm: d => { list.splice(Number(d.i), 1); tatTipos(el); },
    salvar: async () => {
      const clean = list.filter(t => String(t.nome).trim()).map(t => ({ nome: String(t.nome).trim(), preco: num(t.preco), duracao: num(t.duracao) || 120, pct: Math.min(100, Math.max(0, num(t.pct))) }));
      const nomes = clean.map(t => t.nome.toLowerCase());
      if (new Set(nomes).size !== nomes.length) return toast('Há tipos com o mesmo nome.', 'warn');
      if (await run(() => Api.exec('salvarConfig', { Chave: 'tipos_tatuagem', Valor: clean }), 'Tipos de tatuagem salvos ✔')) { delete S.filters.tatTipos; tatTipos(el); }
    }
  });
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
  const vendas = T('Vendas_PDV').filter(v => dayOf(v.DataHora) === f.dia && v.Atividade !== 'Tatuagem' && (!f.user || same(v.ID_Usuario, f.user)));
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
      🛒 <b>Caixa</b>: vendas, fiado e consulta de estoque, sem ver custo nem lucro. Desconto exige senha do Master.<br>🖋️ <b>Tatuador</b>: própria agenda, início e fim do serviço, pagamentos dos clientes, venda dos produtos do estúdio, fechamento e relatórios. Não altera preços, produtos nem %.<br>🛒 O <b>Caixa</b> também marca sessões de tatuagem e lança pagamentos.</p></div>`;
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
        <div class="field"><label>% de entrada no agendamento pelo link</label><input id="cf-entrada" type="number" min="0" max="100" value="${esc(cfgVal('tattoo_entrada_pct', 30))}"></div>
        <div class="field full"><label class="check"><input type="checkbox" id="cf-prodtat" ${cfgVal('tattoo_produtos_do_tatuador', true) !== false ? 'checked' : ''}> O tatuador cadastra os próprios produtos, preços e estoque (a venda é dele, sem comissão)</label></div>
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
    <div class="card"><h3>💾 Backup manual e restauração</h3>
      <p class="muted small">Trocou de aparelho ou reinstalou? Basta entrar com o seu PIN: os dados estão na nuvem. Use a restauração só se precisar recuperar dados de um arquivo de backup (funciona no celular e no computador).</p>
      <div class="btn-row">
        <label class="btn primary">⬆️ Restaurar de um arquivo<input type="file" id="cf-restore" accept=".json,application/json" hidden></label>
        ${!Api.isRemote() ? '<button type="button" class="btn danger-ghost" data-act="demo">Restaurar dados de demonstração</button>' : ''}
      </div>
      <div class="field" style="margin-top:.8rem"><label>Baixar backup agora</label>
        <div class="btn-row"><select id="cf-bk-qual">${opts([...BK_PASTAS.map(b => [b.slug, b.pasta.replace(/^\d+ /, '')]), ...users().filter(u => u.Nivel === 'Tatuador').map(u => ['tat:' + u.ID, 'Tatuador: ' + u.Nome])], 'geral')}</select>
        <button type="button" class="btn" data-act="export">⬇️ Baixar</button></div></div>
    </div></div>`;
  const saveCfg = (k, v) => Api.exec('salvarConfig', { Chave: k, Valor: v });
  bind(el, {
    salvarEmp: async () => {
      const ok = await run(async () => {
        await saveCfg('empresa', { nome: $('#cf-nome').value.trim() || 'Preto Rico', doc: $('#cf-doc').value.trim(), tel: $('#cf-tel').value.trim(), end: $('#cf-end').value.trim() });
        await saveCfg('comissao_master_tattoo', num($('#cf-tat').value));
        await saveCfg('tattoo_entrada_pct', Math.min(100, Math.max(0, num($('#cf-entrada').value))));
        await saveCfg('tattoo_produtos_do_tatuador', $('#cf-prodtat').checked);
      }, 'Configurações salvas ✔');
      if (ok) renderConfig(el);
    },
    salvarMsg: () => run(async () => { await saveCfg('msg_mensalidade', $('#cf-msg1').value); await saveCfg('msg_atraso', $('#cf-msg2').value); }, 'Mensagens salvas ✔'),
    server: serverConfigModal,
    sync: () => doSync(false),
    export: () => {
      const v = $('#cf-bk-qual', el).value;
      const tat = v.startsWith('tat:') ? users().find(u => same(u.ID, v.slice(4))) : null;
      const bk = tat ? BK_PASTAS[4] : BK_PASTAS.find(x => x.slug === v) || BK_PASTAS[0];
      const nome = tat ? `preto-rico-tatuador-${slugNome(tat.Nome)}-${isoDate()}.json` : `preto-rico-${bk.slug}-${isoDate()}.json`;
      baixarArquivo(nome, arquivoBackup(Api.snapshot(), bk, tat), 'application/json');
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
    if (ev.target.id === 'cf-restore') {
      const file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try { await restaurarArquivo(file); } catch (e) { toast(e.message || String(e), 'danger'); }
    }
  };
}

/* ==========================================================================
   14b. BACKUP AUTOMÁTICO NO COMPUTADOR DO MASTER
   Usa a File System Access API (Chrome/Edge no computador): o Master escolhe
   uma pasta uma única vez e o sistema grava nela, a cada dia, um arquivo por
   atividade em subpastas próprias (00 Geral, 01 Barbearia, 02 Tabacaria...,
   04 Estúdio Tattoo e uma subpasta por tatuador). Cada arquivo é cumulativo:
   traz todos os movimentos e cadastros até aquele dia, então o mais recente
   sozinho restaura tudo. Só roda na sessão do Master; celulares não guardam
   backup (só o cache do que está aberto).
   ========================================================================== */
const BK_PASTAS = [
  { pasta: '00 Geral (completo)', act: '', slug: 'geral' },
  { pasta: '01 Barbearia', act: 'Barbearia', slug: 'barbearia' },
  { pasta: '02 Tabacaria e Roupas', act: 'Tabacaria', slug: 'tabacaria' },
  { pasta: '03 Celulares e Acessorios', act: 'Celulares', slug: 'celulares' },
  { pasta: '04 Estudio Tattoo', act: 'Tatuagem', slug: 'tatuagem' }
];
const slugNome = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sem-nome';
const pastaTatuador = u => `04 Estudio Tattoo - ${String(u.Nome).replace(/[\\/:*?"<>|]/g, '').trim()}`;

/** Recorte dos dados de uma atividade (ou de um tatuador). Nunca leva PINs. */
function recorteAtividade(db, act, tatId) {
  const sem = rows => (rows || []).map(r => ({ ...r }));
  const users = sem(db.Usuarios).map(({ PIN_Acesso, ...u }) => u);
  if (!act) return { ...Object.fromEntries(Object.entries(db).map(([t, r]) => [t, sem(r)])), Usuarios: users };
  const cfgKeys = { Barbearia: ['servicos', 'msg_mensalidade', 'msg_atraso', 'barbearia_pix', 'horario_barbearia', 'empresa'], Tatuagem: ['tipos_tatuagem', 'comissao_master_tattoo', 'tattoo_entrada_pct', 'tattoo_produtos_do_tatuador', 'empresa'] }[act] || ['empresa'];
  const vendas = sem(db.Vendas_PDV).filter(v => v.Atividade === act && (!tatId || same(v.ID_Usuario, tatId)));
  const idsV = new Set(vendas.map(v => String(v.ID_Venda)));
  const out = {
    Estoque: sem(db.Estoque).filter(p => p.Atividade === act),
    Vendas_PDV: vendas,
    Vendas_Itens: sem(db.Vendas_Itens).filter(i => idsV.has(String(i.ID_Venda))),
    Recebimentos: sem(db.Recebimentos).filter(r => r.Atividade === act && (!tatId || same(r.ID_Usuario, tatId))),
    Fechamento_Comissoes: sem(db.Fechamento_Comissoes).filter(x => x.Atividade === act && (!tatId || same(x.ID_Profissional, tatId))),
    Config: sem(db.Config).filter(c => cfgKeys.includes(c.Chave))
  };
  if (act === 'Barbearia') {
    out.Agenda_Barbearia = sem(db.Agenda_Barbearia);
    out.Mensal_Pagamentos = sem(db.Mensal_Pagamentos);
    out.Recebimentos = sem(db.Recebimentos).filter(r => r.Atividade === act || r.Tipo === 'Mensalidade');
    out.Usuarios = users.filter(u => u.Nivel === 'Barbeiro');
  }
  if (act === 'Tatuagem') {
    out.Agenda_Tatuagem = sem(db.Agenda_Tatuagem).filter(a => !tatId || same(a.ID_Tatuador, tatId));
    out.Tattoo_Pagamentos = sem(db.Tattoo_Pagamentos).filter(p => !tatId || same(p.ID_Tatuador, tatId));
    out.Tattoo_Repasses = sem(db.Tattoo_Repasses).filter(p => !tatId || same(p.ID_Tatuador, tatId));
    out.Estoque = out.Estoque.filter(p => !tatId || !p.ID_Dono || same(p.ID_Dono, tatId));
    out.Config = out.Config.concat(sem(db.Config).filter(c => String(c.Chave).startsWith('tatuador_') && (!tatId || c.Chave === 'tatuador_' + tatId)));
    out.Usuarios = users.filter(u => tatId ? same(u.ID, tatId) : u.Nivel === 'Tatuador');
  }
  const cliIds = new Set(Object.values(out).flat().map(r => r.ID_Cliente).filter(Boolean).map(String));
  out.Clientes = sem(db.Clientes).filter(c => cliIds.has(String(c.ID)) || (act !== 'Tatuagem' && c.Atividade_Origem === act) || (act === 'Barbearia' && c.Tipo === 'Mensalista'));
  return out;
}
const arquivoBackup = (db, b, tat) => JSON.stringify({
  sistema: 'Preto Rico', tipo: tat ? 'tatuador' : b.act ? 'atividade' : 'completo',
  atividade: b.act || 'Todas', tatuador: tat ? { ID: tat.ID, Nome: tat.Nome } : null,
  exportado: new Date().toISOString(), db: recorteAtividade(db, b.act, tat?.ID)
}, null, 1);
/** Lista de arquivos que o backup grava: um por atividade e um por tatuador. */
function backupsDoDia(db) {
  const dia = isoDate();
  const list = BK_PASTAS.map(b => ({ pasta: b.pasta, nome: `preto-rico-${b.slug}-${dia}.json`, texto: () => arquivoBackup(db, b) }));
  (db.Usuarios || []).filter(u => u.Nivel === 'Tatuador').forEach(u => list.push({
    pasta: pastaTatuador(u), nome: `preto-rico-tatuador-${slugNome(u.Nome)}-${dia}.json`, texto: () => arquivoBackup(db, BK_PASTAS[4], u)
  }));
  return list;
}

const AutoBackup = (() => {
  const LS_LAST = 'pr_backup_last';
  const INTERVALO = 3 * 3600 * 1000; // no máximo uma gravação a cada 3 horas (o arquivo do dia é atualizado)
  const MANTER = 90;
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
    if (!isMaster()) throw new Error('Só o Master ativa o backup automático.');
    if (!estado.suportado) throw new Error('Este aparelho não permite backup automático. Use o Google Chrome ou o Edge no computador do Master.');
    const dir = await window.showDirectoryPicker({ id: 'preto-rico-backup', mode: 'readwrite', startIn: 'documents' });
    await kv('readwrite', s => s.put(dir, 'dir'));
    await rodar(true);
  }

  async function desativar() {
    await kv('readwrite', s => s.delete('dir'));
    try { localStorage.removeItem(LS_LAST); } catch (e) { /* sem storage */ }
    await status();
  }

  /** Grava os backups do dia. force=true ignora o intervalo e pode pedir permissão (precisa de um toque). */
  async function rodar(force = false) {
    if (!estado.suportado || !isMaster()) return false;
    const dir = await getDir();
    if (!dir) return false;
    if (!force && Date.now() - lastRun() < INTERVALO) return false;
    let perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && force) perm = await dir.requestPermission({ mode: 'readwrite' });
    estado.permissao = perm;
    if (perm !== 'granted') { if (force) throw new Error('O navegador não liberou a pasta de backup.'); return false; }
    if (Api.isRemote()) { try { await Api.sync(); } catch (e) { /* sem internet: grava o que está no aparelho */ } }
    const db = Api.snapshot();
    for (const arq of backupsDoDia(db)) {
      const sub = await dir.getDirectoryHandle(arq.pasta, { create: true });
      const fh = await sub.getFileHandle(arq.nome, { create: true });
      const w = await fh.createWritable();
      await w.write(arq.texto());
      await w.close();
      // mantém só os mais recentes de cada pasta
      const prefixo = arq.nome.slice(0, -'YYYY-MM-DD.json'.length);
      const antigos = [];
      for await (const [n, h] of sub.entries()) if (h.kind === 'file' && n.startsWith(prefixo) && /\d{4}-\d{2}-\d{2}\.json$/.test(n)) antigos.push(n);
      antigos.sort().reverse().slice(MANTER).forEach(n => sub.removeEntry(n).catch(() => {}));
    }
    try { localStorage.setItem(LS_LAST, String(Date.now())); } catch (e) { /* sem storage */ }
    estado.ultimo = Date.now();
    return true;
  }

  return { status, ativar, desativar, rodar, get estado() { return estado; } };
})();

function autoBackupCard() {
  const e = AutoBackup.estado;
  const pastas = `<p class="muted small">Dentro da pasta ficam: ${BK_PASTAS.map(b => `<b>${esc(b.pasta)}</b>`).join(', ')} e uma pasta para cada tatuador. Cada arquivo do dia traz tudo até aquele dia; ficam os últimos ${90} dias.</p>`;
  if (!e.suportado) return `<h3>🖥️ Backup automático</h3>
    <p class="muted">Este aparelho não grava backup (celulares só guardam o que está aberto na tela). Para ativar, entre como Master no seu computador usando Google Chrome ou Edge.</p>`;
  if (!e.ativo) return `<h3>🖥️ Backup automático neste computador</h3>
    <p class="muted">Escolha uma pasta do computador (por exemplo, <b>C:\\SGPR\\backups</b>). O sistema grava sozinho, todo dia, um arquivo por atividade.</p>${pastas}
    <button type="button" class="btn primary big" data-act="bkAtivar">📁 Ativar e escolher a pasta</button>`;
  return `<h3>🖥️ Backup automático neste computador</h3>
    <p>${badge('Ativo', 'ok')} Pasta: <b>${esc(e.pasta)}</b></p>${pastas}
    <p class="muted small">Último backup: ${e.ultimo ? fmtDate(isoDT(new Date(e.ultimo))) : 'ainda não feito'}${e.permissao !== 'granted' ? ' · o navegador pede para liberar a pasta de novo' : ''}</p>
    <div class="btn-row"><button type="button" class="btn primary" data-act="bkAgora">💾 Fazer backup agora</button>
      <button type="button" class="btn danger-ghost" data-act="bkDesativar">Desativar</button></div>`;
}

/** Roda em segundo plano na sessão do Master; se o navegador pedir, mostra aviso na tela inicial. */
async function autoBackupTick() {
  try {
    if (!isMaster()) return;
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

/** Restaurar um arquivo de backup (geral, de uma atividade ou de um tatuador), no celular ou no PC. */
async function restaurarArquivo(file) {
  let j;
  try { j = JSON.parse(await readFileText(file, 'utf-8')); } catch (e) { throw new Error('Este arquivo não é um backup do Preto Rico.'); }
  const tables = j.db || j;
  const contagem = Object.entries(tables).filter(([, r]) => Array.isArray(r) && r.length);
  if (!contagem.length) throw new Error('O arquivo não tem dados para restaurar.');
  const desc = j.tatuador ? `do tatuador <b>${esc(j.tatuador.Nome)}</b>` : j.atividade && j.atividade !== 'Todas' ? `da atividade <b>${esc(ACT_LABEL[j.atividade] || j.atividade)}</b>` : '<b>completo</b>';
  const ok = await confirmModal(`Backup ${desc}${j.exportado ? ` de ${fmtDate(isoDT(new Date(j.exportado)))}` : ''}:<br>
    <small>${contagem.map(([t, r]) => `${esc(t.replace(/_/g, ' '))}: ${r.length}`).join(' · ')}</small><br><br>
    O sistema junta estes dados aos atuais: o que já existe é atualizado e o que falta é recriado. Nada é apagado. Senhas (PIN) não vêm do arquivo.`, { ok: '⬆️ Restaurar', title: 'Restaurar backup' });
  if (!ok) return false;
  const r = await Api.exec('restaurarBackup', { tables }, { online: true });
  if (Api.isRemote()) await doSync(false);
  const res = r?.resumo || r || {};
  const novos = Object.values(res).reduce((s, x) => s + num(x?.novos), 0), atual = Object.values(res).reduce((s, x) => s + num(x?.atualizados), 0);
  toast(`Backup restaurado ✔ ${novos} novo(s), ${atual} atualizado(s)`, 'ok');
  refresh();
  return true;
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
    P10: ['Celulares', 'Fone Bluetooth TWS', 1, 3, 45, 129.9], P11: ['Celulares', 'Cabo USB-C 1m', 30, 10, 5, 25],
    P12: ['Barbearia', 'Pomada modeladora', 15, 4, 18, 45], P13: ['Barbearia', 'Óleo para barba', 10, 3, 15, 39.9]
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
      { ID: 'U6', Nome: 'Bruno Atendente', PIN_Acesso: '6666', Nivel: 'Caixa', Modulos_Permitidos: '["barbearia","tatuagem","celulares","clientes"]', Status: 'Ativo' },
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
      { ID: 'AT1', DataHora: `${d(-3)}T14:00`, ID_Cliente: 'C4', Nome_Cliente: 'Diego Alves', ID_Tatuador: 'U4', Descricao_Servico: 'Leão realista antebraço', Valor_Total: 800, Comissao_Master: 240, Status: 'Concluido', Tipo: 'Grande (sessão)', Duracao_Min: 300 },
      { ID: 'AT2', DataHora: `${d(-1)}T15:00`, ID_Cliente: '', Nome_Cliente: 'Juliana Prado', ID_Tatuador: 'U4', Descricao_Servico: 'Fineline costela', Valor_Total: 350, Comissao_Master: 105, Status: 'Concluido', Tipo: 'Pequena / Fine line', Duracao_Min: 90 },
      { ID: 'AT3', DataHora: `${d(1)}T13:00`, ID_Cliente: 'C2', Nome_Cliente: 'Rafael Souza', ID_Tatuador: 'U4', Descricao_Servico: 'Fechamento de braço (sessão 2)', Valor_Total: 1200, Comissao_Master: 360, Status: 'Agendado', Tipo: 'Grande (sessão)', Duracao_Min: 300 }
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
      { Chave: 'comissao_master_tattoo', Valor: '30' },
      { Chave: 'tipos_tatuagem', Valor: JSON.stringify(DEFAULT_TIPOS_TATTOO) }
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
  $('#receipt-pdf').onclick = () => run(() => baixarPDF($('#receipt').innerHTML, $('#receipt-modal .modal-title').textContent), 'PDF salvo ✔');
  $('#receipt-modal').addEventListener('mousedown', e => { if (e.target.id === 'receipt-modal') closeReceipt(); });

  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { updateSync(); doSync(true); });
  window.addEventListener('offline', updateSync);
  Api.onChange(info => {
    if (info.type === 'session-expired') { toast(info.blocked ? 'Seu acesso foi desativado pelo Master. Fale com o dono.' : 'Sua sessão expirou. Entre novamente.', info.blocked ? 'danger' : 'warn'); if (S.user) logout(); }
    if (S.user) updateSync();
  });
  // sincronização periódica (a cada 2 minutos) quando conectado
  setInterval(() => { if (S.user && Api.isRemote() && document.visibilityState === 'visible') doSync(true); }, 120000);
  // backup automático do computador (verifica a cada hora; grava no máximo a cada 6 h)
  setInterval(() => { if (S.user) autoBackupTick(); }, 3600000);

  if (Api.session()?.user) enterApp(); else showLogin();
}

document.addEventListener('DOMContentLoaded', init);
