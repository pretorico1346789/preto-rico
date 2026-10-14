/* ==========================================================================
   PRETO RICO — api.js
   Camada de dados: integração REST com o Google Apps Script, cache local,
   modo offline (localStorage) e fila de sincronização.

   Fluxo de escrita (Api.exec):
     • Servidor configurado  → POST; o servidor devolve { result, changes, removed }
                               e o cache local é atualizado com essas mudanças.
     • Sem internet          → a ação é aplicada localmente e entra na fila;
                               Api.sync() reenvia quando a conexão voltar.
     • Sem servidor (demo)   → tudo roda localmente no navegador.
   ========================================================================== */
'use strict';

class ApiError extends Error {}

const Api = (() => {
  const LS = { cfg: 'pr_cfg', db: 'pr_db', queue: 'pr_queue', session: 'pr_session' };

  /** Abas e suas colunas-chave (null = somente inclusão). */
  const TABLES = {
    Usuarios: 'ID', Clientes: 'ID', Agenda_Barbearia: 'ID', Agenda_Tatuagem: 'ID',
    Estoque: 'ID', Vendas_PDV: 'ID_Venda', Vendas_Itens: null, Financeiro_Contas: 'ID',
    Fechamento_Comissoes: 'ID', Recebimentos: 'ID', Conciliacao: 'ID', Config: 'Chave'
  };

  /* ---------- Persistência local ---------- */
  const read = (k, def) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('localStorage indisponível', e); }
  };

  let cfg = read(LS.cfg, { url: '', k: '' });
  let db = read(LS.db, {});
  let queue = read(LS.queue, []);
  let session = read(LS.session, null);
  const listeners = new Set();

  Object.keys(TABLES).forEach(t => { if (!Array.isArray(db[t])) db[t] = []; });

  const persist = () => write(LS.db, db);
  const emit = info => listeners.forEach(fn => { try { fn(info || {}); } catch (e) { console.error(e); } });
  const isRemote = () => !!(cfg.url && cfg.k);

  /* ---------- Utilidades ---------- */
  const num = v => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const r2 = n => Math.round(n * 100) / 100;
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  const nowIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const same = (a, b) => String(a) === String(b);

  /* ---------- Primitivas locais ---------- */
  function table(t) { return db[t] || []; }

  function localUpsert(t, row) {
    const key = TABLES[t];
    if (!db[t]) db[t] = [];
    if (!key) { db[t].push({ ...row }); return row; }
    if (row[key] === undefined || row[key] === '') row[key] = uid(t.slice(0, 2).toUpperCase());
    const i = db[t].findIndex(r => same(r[key], row[key]));
    if (i >= 0) { db[t][i] = { ...db[t][i], ...row }; return db[t][i]; }
    db[t].push({ ...row });
    return db[t][db[t].length - 1];
  }

  function localRemove(t, id) {
    const key = TABLES[t];
    db[t] = table(t).filter(r => !same(r[key], id));
  }

  function applyChanges(data) {
    const ch = (data && data.changes) || {};
    Object.keys(ch).forEach(t => (ch[t] || []).forEach(r => localUpsert(t, r)));
    const rm = (data && data.removed) || {};
    Object.keys(rm).forEach(t => (rm[t] || []).forEach(id => localRemove(t, id)));
  }

  const findBy = (t, id) => table(t).find(r => same(r[TABLES[t]], id));
  const currentUser = () => session && session.user;

  /* ---------- Ações locais (modo offline/demo) — espelham o Codigo.gs ---------- */
  const Local = {
    upsert(p) {
      if (p.table === 'Usuarios') throw new ApiError('Use salvarUsuario.');
      return { row: localUpsert(p.table, { ...p.row }) };
    },

    remove(p) { localRemove(p.table, p.id); return { id: p.id }; },

    salvarVenda(p) {
      const venda = p.venda || {}, itens = p.itens || [];
      if (!itens.length) throw new ApiError('Venda sem itens.');
      if (venda.Forma_Pagamento === 'Crediario' && !venda.ID_Cliente) throw new ApiError('Venda no crediário exige cliente.');
      const master = currentUser()?.Nivel === 'Master';
      venda.ID_Venda = venda.ID_Venda || uid('V');
      let total = 0, custo = 0;
      const plan = itens.map(it => {
        const prod = findBy('Estoque', it.ID_Produto);
        if (!prod) throw new ApiError('Produto não encontrado: ' + it.Nome_Produto);
        const q = num(it.Qtd), pv = num(it.Preco_Venda_Unit);
        if (q <= 0) throw new ApiError('Quantidade inválida: ' + prod.Produto);
        if (pv < num(prod.Preco_Venda) - 0.001 && !master && !p.auth) throw new ApiError(`Desconto em "${prod.Produto}" exige autorização Master.`);
        if (num(prod.Qtd) < q) throw new ApiError(`Estoque insuficiente: ${prod.Produto} (disponível ${num(prod.Qtd)}).`);
        return { it, prod, q, pv };
      });
      plan.forEach(({ it, prod, q, pv }) => {
        it.ID_Venda = venda.ID_Venda;
        it.Nome_Produto = prod.Produto;
        it.Preco_Custo_Unit = num(prod.Preco_Custo);
        it.Subtotal = r2(q * pv);
        total += it.Subtotal;
        custo += q * it.Preco_Custo_Unit;
        prod.Qtd = num(prod.Qtd) - q;
        db.Vendas_Itens.push({ ...it });
      });
      venda.ID_Usuario = venda.ID_Usuario || currentUser()?.ID || '';
      venda.DataHora = venda.DataHora || nowIso();
      venda.Total_Venda = r2(total);
      venda.Preco_Custo_Total = r2(custo);
      venda.Status_Crediario = venda.Forma_Pagamento === 'Crediario' ? 'Aberto' : '';
      localUpsert('Vendas_PDV', venda);
      return { venda: { ...venda }, itens: itens.map(i => ({ ...i })) };
    },

    atualizarEstoque(p) {
      if (p.row) {
        if (!p.row.Produto) throw new ApiError('Informe o nome do produto.');
        return { row: localUpsert('Estoque', { ...p.row }) };
      }
      const prod = findBy('Estoque', p.ID);
      if (!prod) throw new ApiError('Produto não encontrado.');
      prod.Qtd = num(prod.Qtd) + num(p.delta);
      return { row: prod };
    },

    salvarAgendamento(p) {
      const t = p.tipo === 'tatuagem' ? 'Agenda_Tatuagem' : 'Agenda_Barbearia';
      if (!p.row.DataHora) throw new ApiError('Informe data e hora.');
      return { tipo: p.tipo, row: localUpsert(t, { ...p.row }) };
    },

    darBaixaConta(p) {
      const c = findBy('Financeiro_Contas', p.ID);
      if (!c) throw new ApiError('Conta não encontrada.');
      Object.assign(c, { Status: 'Pago', Data_Pagamento: p.Data_Pagamento || nowIso().slice(0, 10) });
      if (p.Banco) c.Banco = p.Banco;
      if (p.Fitid_OFX) c.Fitid_OFX = p.Fitid_OFX;
      return { row: c };
    },

    salvarUsuario(p) {
      const row = { ...p.row };
      if (!row.Nome) throw new ApiError('Informe o nome.');
      const ex = row.ID ? findBy('Usuarios', row.ID) : null;
      if (!row.PIN_Acesso) delete row.PIN_Acesso;
      else if (!/^\d{4,6}$/.test(String(row.PIN_Acesso))) throw new ApiError('O PIN deve ter de 4 a 6 números.');
      if (!ex && !row.PIN_Acesso) throw new ApiError('Defina um PIN para o novo usuário.');
      if (Array.isArray(row.Modulos_Permitidos)) row.Modulos_Permitidos = JSON.stringify(row.Modulos_Permitidos);
      if (ex && ex.Nivel === 'Master' && (row.Nivel !== 'Master' || row.Status === 'Inativo')) {
        const others = table('Usuarios').filter(u => u.Nivel === 'Master' && u.Status !== 'Inativo' && !same(u.ID, row.ID));
        if (!others.length) throw new ApiError('É preciso manter ao menos um Master ativo.');
      }
      return { row: localUpsert('Usuarios', row) };
    },

    salvarAjustePreco(p) {
      const prod = findBy('Estoque', p.ID);
      if (!prod) throw new ApiError('Produto não encontrado.');
      if (p.Preco_Venda !== undefined && p.Preco_Venda !== '') prod.Preco_Venda = r2(num(p.Preco_Venda));
      if (p.Preco_Custo !== undefined && p.Preco_Custo !== '') prod.Preco_Custo = r2(num(p.Preco_Custo));
      return { row: prod };
    },

    registrarRecebimento(p) {
      const r = { ...p.row };
      if (num(r.Valor) <= 0) throw new ApiError('Valor inválido.');
      if (!r.ID_Cliente) throw new ApiError('Informe o cliente.');
      r.ID = r.ID || uid('RC');
      r.DataHora = r.DataHora || nowIso();
      r.ID_Usuario = r.ID_Usuario || currentUser()?.ID || '';
      localUpsert('Recebimentos', r);
      if (r.Tipo === 'Mensalidade') {
        localUpsert('Clientes', { ID: r.ID_Cliente, Ultimo_Pagamento: String(r.DataHora).slice(0, 10), Status_Mensalidade: 'Em dia' });
      } else {
        const vendas = table('Vendas_PDV').filter(v => v.Forma_Pagamento === 'Crediario' && same(v.ID_Cliente, r.ID_Cliente) && v.Atividade === r.Atividade);
        const compras = vendas.reduce((s, v) => s + num(v.Total_Venda), 0);
        const pagos = table('Recebimentos').filter(x => x.Tipo === 'Crediario' && same(x.ID_Cliente, r.ID_Cliente) && x.Atividade === r.Atividade)
          .reduce((s, x) => s + num(x.Valor), 0);
        if (compras - pagos <= 0.009) vendas.forEach(v => { v.Status_Crediario = 'Quitado'; });
      }
      p.row = r; // mantém ID/DataHora na fila de sincronização
      return { row: r };
    },

    gerarFechamento(p) {
      return { rows: (p.rows || []).map(r => localUpsert('Fechamento_Comissoes', { ...r })) };
    },

    conciliar(p) {
      if (table('Conciliacao').some(c => same(c.Fitid, p.row.Fitid))) throw new ApiError('Esta transação já foi conciliada.');
      const row = localUpsert('Conciliacao', { ...p.row });
      if (p.novaConta) localUpsert('Financeiro_Contas', { ...p.novaConta });
      else if (p.contaId) Local.darBaixaConta({ ID: p.contaId, Data_Pagamento: row.Data, Banco: p.Banco, Fitid_OFX: row.Fitid });
      return { row };
    },

    salvarConfig(p) {
      const Valor = typeof p.Valor === 'string' ? p.Valor : JSON.stringify(p.Valor);
      return { row: localUpsert('Config', { Chave: p.Chave, Valor }) };
    }
  };

  /* ---------- HTTP ---------- */
  async function parse(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Resposta inválida do servidor. Confira a URL /exec.'); }
    if (!j.ok) {
      if (/Sess[aã]o (expirada|inv[aá]lida)/i.test(j.error || '')) emit({ type: 'session-expired' });
      throw new ApiError(j.error || 'Erro no servidor');
    }
    return j.data;
  }

  async function httpGet(params) {
    const qs = new URLSearchParams({ ...params, k: cfg.k, t: session?.token || '' });
    return parse(await fetch(cfg.url + '?' + qs.toString(), { redirect: 'follow' }));
  }

  async function httpPost(action, payload) {
    // text/plain evita o preflight CORS que o Apps Script não suporta
    const body = JSON.stringify({ action, payload, k: cfg.k, t: session?.token || '' });
    return parse(await fetch(cfg.url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body
    }));
  }

  /* ---------- API pública ---------- */

  /** Executa uma ação de escrita (online, enfileirada ou local). */
  async function exec(action, payload = {}) {
    if (!Local[action]) throw new Error('Ação desconhecida: ' + action);
    if (isRemote()) {
      try {
        const data = await httpPost(action, payload);
        applyChanges(data);
        persist(); emit({ type: 'change' });
        return data.result;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        // Falha de rede: aplica localmente e guarda para enviar depois
        const res = Local[action](payload);
        queue.push({ action, payload, ts: Date.now() });
        write(LS.queue, queue); persist(); emit({ type: 'queued' });
        return res;
      }
    }
    const res = Local[action](payload);
    persist(); emit({ type: 'change' });
    return res;
  }

  /** Reenvia a fila e baixa os dados atualizados do servidor. */
  async function sync() {
    if (!isRemote() || !session?.token) return { skipped: true };
    const errors = [];
    while (queue.length) {
      const op = queue[0];
      try { await httpPost(op.action, op.payload); }
      catch (e) {
        if (!(e instanceof ApiError)) throw e; // ainda sem conexão: mantém a fila
        errors.push(`${op.action}: ${e.message}`);
      }
      queue.shift(); write(LS.queue, queue);
    }
    const data = await httpGet({ action: 'getAll' });
    Object.keys(TABLES).forEach(t => { db[t] = data.tables[t] || []; });
    if (data.user && session) { session.user = data.user; write(LS.session, session); }
    persist(); emit({ type: 'sync' });
    return { errors };
  }

  async function usuariosLogin() {
    if (isRemote()) return httpGet({ action: 'usuariosLogin' });
    return table('Usuarios').filter(u => u.Status !== 'Inativo').map(u => ({ ID: u.ID, Nome: u.Nome, Nivel: u.Nivel }));
  }

  async function login(id, pin) {
    if (isRemote()) {
      session = await httpPost('login', { id, pin });
    } else {
      const u = table('Usuarios').find(x => same(x.ID, id) && x.Status !== 'Inativo');
      if (!u || String(u.PIN_Acesso) !== String(pin)) throw new ApiError('PIN incorreto.');
      const { PIN_Acesso, ...pub } = u;
      session = { user: pub, token: 'local' };
    }
    write(LS.session, session);
    return session.user;
  }

  function logout() { session = null; try { localStorage.removeItem(LS.session); } catch (e) { /* sem storage */ } }

  /** Valida PIN Master para desconto; devolve token de autorização. */
  async function validarPin(pin) {
    if (isRemote()) return (await httpPost('validarPin', { pin })).auth;
    const ok = table('Usuarios').some(u => u.Nivel === 'Master' && u.Status !== 'Inativo' && String(u.PIN_Acesso) === String(pin));
    if (!ok) throw new ApiError('PIN Master inválido.');
    return 'local-' + Date.now();
  }

  async function ping(url, k) {
    const qs = new URLSearchParams({ action: 'ping', k });
    return parse(await fetch(url + '?' + qs.toString(), { redirect: 'follow' }));
  }

  function config(key, def) {
    const row = table('Config').find(r => r.Chave === key);
    if (!row) return def;
    try { return JSON.parse(row.Valor); } catch (e) { return row.Valor; }
  }

  return {
    TABLES, uid, num, r2,
    table, exec, sync, login, logout, validarPin, usuariosLogin, ping, config,
    isRemote,
    session: () => session,
    pending: () => queue.length,
    getCfg: () => ({ ...cfg }),
    setCfg(c) {
      cfg = { url: String(c.url || '').trim(), k: String(c.k || '').trim() };
      write(LS.cfg, cfg);
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Popula o banco local (modo demonstração) quando está vazio. */
    seed(data, force = false) {
      if (!force && table('Usuarios').length) return false;
      Object.keys(TABLES).forEach(t => { db[t] = (data[t] || []).map(r => ({ ...r })); });
      persist(); return true;
    },
    exportJSON: () => JSON.stringify({ exportado: new Date().toISOString(), db }, null, 2),
    importJSON(text) {
      const j = JSON.parse(text);
      const src = j.db || j;
      Object.keys(TABLES).forEach(t => { db[t] = Array.isArray(src[t]) ? src[t] : []; });
      persist(); emit({ type: 'sync' });
    }
  };
})();
