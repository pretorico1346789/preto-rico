/**
 * =====================================================================
 *  PRETO RICO — Sistema de Gestão Integrado
 *  Backend REST em Google Apps Script + Google Sheets
 * =====================================================================
 *  INSTALAÇÃO
 *   1. Crie uma planilha no Google Sheets > Extensões > Apps Script.
 *   2. Cole este arquivo como "Codigo.gs" e salve.
 *   3. Selecione a função setup() e clique em Executar (autorize o acesso).
 *      Ela cria todas as abas, o usuário Master (PIN 1234) e a chave API_SECRET.
 *      A chave aparece em Executar > Registros de execução e fica salva em
 *      Configurações do projeto > Propriedades do script.
 *   4. Implantar > Nova implantação > Tipo "App da Web"
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *   5. Copie a URL terminada em /exec e cole no sistema (tela de login >
 *      "Configurar servidor") junto com o API_SECRET.
 *   Sempre que alterar este código: Implantar > Gerenciar implantações >
 *   Editar > Nova versão (a URL continua a mesma).
 *
 *  SEGURANÇA
 *   - Toda requisição exige o parâmetro k (API_SECRET).
 *   - Após o login por PIN, o servidor emite um token assinado (HMAC-SHA256)
 *     válido por 12h. Cada ação de escrita confere o nível do usuário (RBAC).
 *   - Preço de custo, margem e financeiro NUNCA saem do servidor para
 *     usuários que não sejam Master.
 *   - Desconto abaixo do preço cadastrado exige token de autorização emitido
 *     pela validação do PIN Master (validade de 5 minutos).
 * =====================================================================
 */

/* ---------- Estrutura das abas ---------- */
const SCHEMA = {
  Usuarios:             ['ID', 'Nome', 'PIN_Acesso', 'Nivel', 'Modulos_Permitidos', 'Status'],
  Clientes:             ['ID', 'Nome', 'Telefone_WhatsApp', 'Tipo', 'Status_Mensalidade', 'Valor_Mensalidade', 'Dia_Vencimento', 'Atividade_Origem', 'Ultimo_Pagamento'],
  Agenda_Barbearia:     ['ID', 'DataHora', 'ID_Cliente', 'Nome_Cliente', 'ID_Barbeiro', 'Servico', 'Valor', 'Comissao_Valor', 'Status'],
  Agenda_Tatuagem:      ['ID', 'DataHora', 'ID_Cliente', 'Nome_Cliente', 'ID_Tatuador', 'Descricao_Servico', 'Valor_Total', 'Comissao_Master', 'Status'],
  Estoque:              ['ID', 'Atividade', 'Produto', 'Qtd', 'Minimo', 'Preco_Custo', 'Preco_Venda'],
  Vendas_PDV:           ['ID_Venda', 'DataHora', 'ID_Usuario', 'Atividade', 'Total_Venda', 'Preco_Custo_Total', 'Forma_Pagamento', 'Status_Crediario', 'ID_Cliente', 'Nome_Cliente'],
  Vendas_Itens:         ['ID_Venda', 'ID_Produto', 'Nome_Produto', 'Qtd', 'Preco_Custo_Unit', 'Preco_Venda_Unit', 'Subtotal'],
  Financeiro_Contas:    ['ID', 'Tipo', 'Descricao', 'Valor', 'Vencimento', 'Categoria', 'Banco', 'Status', 'Data_Pagamento', 'Fitid_OFX'],
  Fechamento_Comissoes: ['ID', 'Data', 'ID_Profissional', 'Atividade', 'Total_Produzido', 'Valor_Comissao', 'Valor_Master', 'Status_Pagamento'],
  // Abas auxiliares (pagamentos de mensalidade/crediário, conciliação OFX e configurações)
  Recebimentos:         ['ID', 'DataHora', 'Tipo', 'ID_Cliente', 'Nome_Cliente', 'Atividade', 'Valor', 'Forma_Pagamento', 'ID_Usuario', 'Referencia'],
  Conciliacao:          ['ID', 'Fitid', 'Data', 'Valor', 'Memo', 'Tipo_Ref', 'ID_Ref', 'Data_Aprovacao'],
  Config:               ['Chave', 'Valor']
};

/** Coluna-chave de cada aba (padrão "ID"). null = aba somente de inclusão. */
const KEYS = { Vendas_PDV: 'ID_Venda', Vendas_Itens: null, Config: 'Chave' };
const keyOf_ = t => (t in KEYS ? KEYS[t] : 'ID');

const DATE_ONLY = ['Vencimento', 'Data_Pagamento', 'Ultimo_Pagamento', 'Data_Aprovacao'];
const COST_FIELDS = ['Preco_Custo', 'Preco_Custo_Total', 'Preco_Custo_Unit'];
const LEVELS = ['Master', 'Barbeiro', 'Caixa', 'Tatuador'];
const TOKEN_TTL_H = 12;
const AUTH_TTL_MIN = 5;

const DEFAULT_SERVICOS = [
  { nome: 'Corte', preco: 40, comissao: 50 },
  { nome: 'Barba', preco: 30, comissao: 50 },
  { nome: 'Corte + Barba', preco: 60, comissao: 50 },
  { nome: 'Pigmentação', preco: 25, comissao: 40 },
  { nome: 'Sobrancelha', preco: 15, comissao: 50 }
];

/** Abas que cada nível pode LER (getAll). */
const READ_ACCESS = {
  Master: '*',
  Barbeiro: ['Usuarios', 'Clientes', 'Agenda_Barbearia', 'Recebimentos', 'Config', 'Fechamento_Comissoes'],
  Caixa: ['Usuarios', 'Clientes', 'Estoque', 'Vendas_PDV', 'Vendas_Itens', 'Recebimentos', 'Config'],
  Tatuador: ['Usuarios', 'Clientes', 'Agenda_Tatuagem', 'Config', 'Fechamento_Comissoes']
};

/** Ações de escrita (POST) e níveis autorizados. levels:null = pública (só exige k). */
const ACTIONS = {
  login:                { levels: null, fn: login_ },
  validarPin:           { levels: null, fn: validarPin_ },
  upsert:               { levels: LEVELS, fn: upsertAction_ },
  remove:               { levels: ['Master'], fn: removeAction_ },
  salvarVenda:          { levels: ['Master', 'Caixa'], fn: salvarVenda_ },
  atualizarEstoque:     { levels: ['Master'], fn: atualizarEstoque_ },
  salvarAgendamento:    { levels: ['Master', 'Barbeiro', 'Tatuador'], fn: salvarAgendamento_ },
  darBaixaConta:        { levels: ['Master'], fn: darBaixaConta_ },
  salvarUsuario:        { levels: ['Master'], fn: salvarUsuario_ },
  salvarAjustePreco:    { levels: ['Master'], fn: salvarAjustePreco_ },
  registrarRecebimento: { levels: ['Master', 'Caixa', 'Barbeiro'], fn: registrarRecebimento_ },
  gerarFechamento:      { levels: ['Master'], fn: gerarFechamento_ },
  conciliar:            { levels: ['Master'], fn: conciliar_ },
  salvarConfig:         { levels: ['Master'], fn: salvarConfig_ }
};

/* =====================================================================
 *  SETUP
 * ===================================================================== */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(name => ensureSheet_(ss, name));
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_SECRET')) props.setProperty('API_SECRET', Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!readTable_('Usuarios').length) {
    upsert_('Usuarios', { ID: 'U1', Nome: 'Master', PIN_Acesso: '1234', Nivel: 'Master', Modulos_Permitidos: '[]', Status: 'Ativo' });
  }
  if (!findById_('Config', 'servicos')) upsert_('Config', { Chave: 'servicos', Valor: JSON.stringify(DEFAULT_SERVICOS) });
  instalarBackupDiario();
  Logger.log('API_SECRET = ' + props.getProperty('API_SECRET'));
  Logger.log('Usuário inicial: Master / PIN 1234 (altere no sistema).');
}

/* =====================================================================
 *  BACKUP NA NUVEM (Google Drive)
 *  Todo dia às 23h uma cópia completa da planilha vai para a pasta
 *  "Preto Rico - Backups" no Drive da conta dona da planilha.
 *  Mantém as 30 cópias mais recentes. Instalado automaticamente pelo setup().
 * ===================================================================== */
const BACKUP_PASTA = 'Preto Rico - Backups';
const BACKUP_MANTER = 30;

function instalarBackupDiario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupDiario')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(23).create();
  Logger.log('Backup diário na nuvem ativado (todo dia às 23h).');
}

function backupDiario() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_PASTA);
  const pasta = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_PASTA);
  const nome = 'Backup ' + ss.getName() + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  DriveApp.getFileById(ss.getId()).makeCopy(nome, pasta);
  const arquivos = [];
  const fi = pasta.getFiles();
  while (fi.hasNext()) arquivos.push(fi.next());
  arquivos.sort((a, b) => b.getDateCreated() - a.getDateCreated())
    .slice(BACKUP_MANTER)
    .forEach(f => f.setTrashed(true));
}

function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const headers = SCHEMA[name];
  const lastCol = sh.getLastColumn();
  const current = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  const missing = headers.filter(h => current.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  // Tudo como texto: evita conversão automática de datas, PINs com zero à esquerda etc.
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), headers.length)).setNumberFormat('@');
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#111111').setFontColor('#FFC20E');
  sh.setFrozenRows(1);
  return sh;
}

/* =====================================================================
 *  HTTP
 * ===================================================================== */
function doGet(e) {
  return respond_(() => routeGet_((e && e.parameter) || {}));
}

function doPost(e) {
  return respond_(() => {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    let body;
    try { body = JSON.parse(raw); } catch (err) { throw new Error('JSON inválido.'); }
    return routePost_(body);
  });
}

function respond_(fn) {
  let out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    console.error(err && err.stack || err);
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function routeGet_(p) {
  checkKey_(p.k);
  switch (p.action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() };
    case 'usuariosLogin':
      return readTable_('Usuarios')
        .filter(u => u.Status !== 'Inativo')
        .map(u => ({ ID: u.ID, Nome: u.Nome, Nivel: u.Nivel }));
    case 'getAll':
      return getAll_(auth_(p.t));
    case 'getTable': {
      const u = auth_(p.t);
      if (!SCHEMA[p.table]) throw new Error('Aba inexistente: ' + p.table);
      return visibleRows_(p.table, u) || [];
    }
    case 'relatorio': {
      const u = auth_(p.t);
      requireLevel_(u, ['Master']);
      return relatorio_(p.de, p.ate);
    }
    default:
      throw new Error('Ação GET desconhecida: ' + p.action);
  }
}

function routePost_(body) {
  checkKey_(body.k);
  const def = ACTIONS[body.action];
  if (!def) throw new Error('Ação desconhecida: ' + body.action);
  const p = body.payload || {};
  if (!def.levels) return def.fn(p);
  const user = auth_(body.t);
  requireLevel_(user, def.levels);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Servidor ocupado, tente novamente.');
  try {
    return sanitizeOut_(def.fn(p, user), user);
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 *  SEGURANÇA
 * ===================================================================== */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function checkKey_(k) {
  const secret = prop_('API_SECRET');
  if (!secret) throw new Error('Backend não configurado: execute setup() no Apps Script.');
  if (!k || String(k) !== secret) throw new Error('Chave de API inválida.');
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, prop_('TOKEN_SECRET')));
}

function makeToken_(payload) {
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + sign_(payload);
}

function readToken_(t) {
  const parts = String(t || '').split('.');
  if (parts.length !== 2) return null;
  let payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { return null; }
  if (sign_(payload) !== parts[1]) return null;
  return payload.split('|');
}

/** Valida o token de sessão e devolve o usuário (relido da planilha). */
function auth_(t) {
  if (!t) throw new Error('Sessão expirada. Faça login novamente.');
  const parts = readToken_(t);
  if (!parts || parts[0] !== 'S') throw new Error('Sessão inválida. Faça login novamente.');
  if (Date.now() > Number(parts[2])) throw new Error('Sessão expirada. Faça login novamente.');
  const u = findById_('Usuarios', parts[1]);
  if (!u || u.Status === 'Inativo') throw new Error('Usuário inativo ou removido.');
  return u;
}

function requireLevel_(u, levels) {
  if (levels.indexOf(u.Nivel) < 0) throw new Error('Acesso negado para o nível ' + u.Nivel + '.');
}

/** Limita tentativas de PIN: 5 erros em 10 minutos bloqueiam a chave. */
function throttle_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0);
  if (n >= 5) throw new Error('Muitas tentativas. Aguarde 10 minutos.');
  return {
    fail: () => cache.put(key, String(n + 1), 600),
    clear: () => cache.remove(key)
  };
}

function publicUser_(u) {
  return { ID: u.ID, Nome: u.Nome, Nivel: u.Nivel, Modulos_Permitidos: u.Modulos_Permitidos, Status: u.Status };
}

function login_(p) {
  const th = throttle_('login_' + p.id);
  const u = findById_('Usuarios', p.id);
  if (!u || u.Status === 'Inativo' || String(u.PIN_Acesso) !== String(p.pin)) {
    th.fail();
    throw new Error('PIN incorreto.');
  }
  th.clear();
  const exp = Date.now() + TOKEN_TTL_H * 3600 * 1000;
  return { user: publicUser_(u), token: makeToken_(['S', u.ID, exp].join('|')) };
}

/** Valida o PIN de qualquer Master ativo e devolve token de autorização de desconto. */
function validarPin_(p) {
  const th = throttle_('pinmaster');
  const m = readTable_('Usuarios').find(u => u.Nivel === 'Master' && u.Status !== 'Inativo' && String(u.PIN_Acesso) === String(p.pin));
  if (!m) { th.fail(); throw new Error('PIN Master inválido.'); }
  th.clear();
  const exp = Date.now() + AUTH_TTL_MIN * 60 * 1000;
  return { auth: makeToken_(['D', m.ID, exp].join('|')), master: m.Nome };
}

function checkDescAuth_(t) {
  const parts = readToken_(t);
  return !!(parts && parts[0] === 'D' && Date.now() <= Number(parts[2]));
}

/* =====================================================================
 *  LEITURA (com filtro por nível)
 * ===================================================================== */
function getAll_(u) {
  const tables = {};
  Object.keys(SCHEMA).forEach(t => {
    const rows = visibleRows_(t, u);
    if (rows) tables[t] = rows;
  });
  return { tables: tables, user: publicUser_(u) };
}

function canRead_(t, u) {
  const acc = READ_ACCESS[u.Nivel];
  return acc === '*' || (acc && acc.indexOf(t) >= 0);
}

function visibleRows_(t, u) {
  if (!canRead_(t, u)) return null;
  return filterRows_(t, readTable_(t), u);
}

function filterRows_(t, rows, u) {
  if (t === 'Usuarios') {
    rows = rows.map(x => u.Nivel === 'Master' ? omit_(x, ['PIN_Acesso']) : { ID: x.ID, Nome: x.Nome, Nivel: x.Nivel, Status: x.Status });
  }
  if (u.Nivel === 'Master') return rows;
  if (t === 'Agenda_Tatuagem') rows = rows.filter(r => String(r.ID_Tatuador) === String(u.ID));
  if (t === 'Fechamento_Comissoes') rows = rows.filter(r => String(r.ID_Profissional) === String(u.ID));
  if (t === 'Recebimentos' && u.Nivel === 'Barbeiro') rows = rows.filter(r => r.Tipo === 'Mensalidade');
  return rows.map(r => omit_(r, COST_FIELDS));
}

/** Remove custos/PINs da resposta de escrita para quem não é Master. */
function sanitizeOut_(res, u) {
  res = res || {};
  const changes = res.changes || {};
  const clean = {};
  Object.keys(changes).forEach(t => {
    if (canRead_(t, u)) clean[t] = filterRows_(t, changes[t], u);
  });
  res.changes = clean;
  const strip = u.Nivel === 'Master' ? ['PIN_Acesso'] : COST_FIELDS.concat(['PIN_Acesso']);
  res.result = JSON.parse(JSON.stringify(res.result === undefined ? null : res.result), (k, v) => strip.indexOf(k) >= 0 ? undefined : v);
  return res;
}

/* =====================================================================
 *  AÇÕES DE ESCRITA — todas retornam { result, changes:{Aba:[linhas]}, removed:{Aba:[ids]} }
 * ===================================================================== */
function upsertAction_(p, u) {
  const t = p.table;
  if (!SCHEMA[t]) throw new Error('Aba inexistente: ' + t);
  if (t === 'Usuarios') throw new Error('Use a ação salvarUsuario.');
  if (u.Nivel !== 'Master' && t !== 'Clientes') throw new Error('Sem permissão para alterar ' + t + '.');
  const row = upsert_(t, p.row || {});
  return { result: { row: row }, changes: { [t]: [row] } };
}

function removeAction_(p, u) {
  const t = p.table;
  if (!SCHEMA[t] || !keyOf_(t)) throw new Error('Aba inválida para exclusão.');
  if (t === 'Usuarios' && String(p.id) === String(u.ID)) throw new Error('Você não pode excluir o próprio usuário.');
  deleteRow_(t, p.id);
  return { result: { id: p.id }, removed: { [t]: [p.id] } };
}

function salvarVenda_(p, u) {
  const venda = p.venda || {};
  const itens = p.itens || [];
  if (!itens.length) throw new Error('Venda sem itens.');
  if (venda.Forma_Pagamento === 'Crediario' && !venda.ID_Cliente) throw new Error('Venda no crediário exige cliente.');
  const estoque = readTable_('Estoque');
  const byId = {};
  estoque.forEach(e => { byId[String(e.ID)] = e; });
  const descontoOk = u.Nivel === 'Master' || (p.auth && checkDescAuth_(p.auth));
  venda.ID_Venda = venda.ID_Venda || newId_('V');
  if (findById_('Vendas_PDV', venda.ID_Venda)) throw new Error('Venda já registrada.');

  let total = 0, custo = 0;
  itens.forEach(it => {
    const prod = byId[String(it.ID_Produto)];
    if (!prod) throw new Error('Produto não encontrado: ' + it.Nome_Produto);
    const qtd = num_(it.Qtd), pv = num_(it.Preco_Venda_Unit);
    if (qtd <= 0) throw new Error('Quantidade inválida: ' + prod.Produto);
    if (pv < num_(prod.Preco_Venda) - 0.001 && !descontoOk) throw new Error('Desconto em "' + prod.Produto + '" exige autorização Master.');
    if (num_(prod.Qtd) < qtd) throw new Error('Estoque insuficiente: ' + prod.Produto + ' (disponível ' + num_(prod.Qtd) + ').');
    it.ID_Venda = venda.ID_Venda;
    it.Nome_Produto = prod.Produto;
    it.Preco_Custo_Unit = num_(prod.Preco_Custo);
    it.Subtotal = round2_(qtd * pv);
    total += it.Subtotal;
    custo += qtd * it.Preco_Custo_Unit;
    prod.Qtd = num_(prod.Qtd) - qtd;
  });

  venda.ID_Usuario = u.ID;
  venda.DataHora = venda.DataHora || nowIso_();
  venda.Total_Venda = round2_(total);
  venda.Preco_Custo_Total = round2_(custo);
  venda.Status_Crediario = venda.Forma_Pagamento === 'Crediario' ? 'Aberto' : '';

  const saved = upsert_('Vendas_PDV', venda);
  const savedItens = itens.map(it => appendObj_('Vendas_Itens', it));
  const touched = {};
  itens.forEach(it => { touched[String(it.ID_Produto)] = true; });
  const prods = Object.keys(touched).map(id => upsert_('Estoque', { ID: id, Qtd: byId[id].Qtd }));
  return {
    result: { venda: saved, itens: savedItens },
    changes: { Vendas_PDV: [saved], Vendas_Itens: savedItens, Estoque: prods }
  };
}

/** p.row = cadastro completo do produto  |  p.ID + p.delta = entrada/saída manual. */
function atualizarEstoque_(p) {
  let row;
  if (p.row) {
    if (!p.row.Produto) throw new Error('Informe o nome do produto.');
    row = upsert_('Estoque', p.row);
  } else {
    const prod = findById_('Estoque', p.ID);
    if (!prod) throw new Error('Produto não encontrado.');
    row = upsert_('Estoque', { ID: prod.ID, Qtd: num_(prod.Qtd) + num_(p.delta) });
  }
  return { result: { row: row }, changes: { Estoque: [row] } };
}

function salvarAgendamento_(p, u) {
  const tat = p.tipo === 'tatuagem';
  const t = tat ? 'Agenda_Tatuagem' : 'Agenda_Barbearia';
  const ownerCol = tat ? 'ID_Tatuador' : 'ID_Barbeiro';
  if ((u.Nivel === 'Barbeiro' && tat) || (u.Nivel === 'Tatuador' && !tat)) throw new Error('Sem permissão para esta agenda.');
  const row = p.row || {};
  if (!row.DataHora) throw new Error('Informe data e hora.');
  if (u.Nivel !== 'Master') {
    if (row.ID) {
      const ex = findById_(t, row.ID);
      if (ex && String(ex[ownerCol]) !== String(u.ID)) throw new Error('Este agendamento é de outro profissional.');
    }
    row[ownerCol] = u.ID;
  }
  if (!tat) row.Comissao_Valor = comissaoServico_(row.Servico, row.Valor);
  const saved = upsert_(t, row);
  return { result: { tipo: p.tipo, row: saved }, changes: { [t]: [saved] } };
}

function comissaoServico_(nome, valor) {
  const servs = configGet_('servicos', DEFAULT_SERVICOS);
  const s = servs.find(x => x.nome === nome);
  const pct = s ? num_(s.comissao) : num_(configGet_('comissao_barbeiro_padrao', 50));
  return round2_(num_(valor) * pct / 100);
}

function darBaixaConta_(p) {
  const conta = findById_('Financeiro_Contas', p.ID);
  if (!conta) throw new Error('Conta não encontrada.');
  const row = upsert_('Financeiro_Contas', {
    ID: conta.ID, Status: 'Pago',
    Data_Pagamento: p.Data_Pagamento || today_(),
    Banco: p.Banco || conta.Banco,
    Fitid_OFX: p.Fitid_OFX || conta.Fitid_OFX
  });
  return { result: { row: row }, changes: { Financeiro_Contas: [row] } };
}

function salvarUsuario_(p, u) {
  const row = Object.assign({}, p.row || {});
  if (!row.Nome) throw new Error('Informe o nome.');
  if (row.Nivel && LEVELS.indexOf(row.Nivel) < 0) throw new Error('Nível inválido.');
  const existing = row.ID ? findById_('Usuarios', row.ID) : null;
  if (!row.PIN_Acesso) delete row.PIN_Acesso;
  else if (!/^\d{4,6}$/.test(String(row.PIN_Acesso))) throw new Error('O PIN deve ter de 4 a 6 números.');
  if (!existing && !row.PIN_Acesso) throw new Error('Defina um PIN para o novo usuário.');
  if (Array.isArray(row.Modulos_Permitidos)) row.Modulos_Permitidos = JSON.stringify(row.Modulos_Permitidos);
  // Impede ficar sem nenhum Master ativo
  if (existing && existing.Nivel === 'Master' && (row.Nivel !== 'Master' || row.Status === 'Inativo')) {
    const masters = readTable_('Usuarios').filter(x => x.Nivel === 'Master' && x.Status !== 'Inativo' && String(x.ID) !== String(row.ID));
    if (!masters.length) throw new Error('É preciso manter ao menos um Master ativo.');
  }
  if (existing && String(existing.ID) === String(u.ID) && row.Status === 'Inativo') throw new Error('Você não pode desativar o próprio usuário.');
  const saved = upsert_('Usuarios', row);
  return { result: { row: saved }, changes: { Usuarios: [saved] } };
}

function salvarAjustePreco_(p) {
  const prod = findById_('Estoque', p.ID);
  if (!prod) throw new Error('Produto não encontrado.');
  const upd = { ID: prod.ID };
  if (p.Preco_Venda !== undefined && p.Preco_Venda !== '') upd.Preco_Venda = round2_(num_(p.Preco_Venda));
  if (p.Preco_Custo !== undefined && p.Preco_Custo !== '') upd.Preco_Custo = round2_(num_(p.Preco_Custo));
  const row = upsert_('Estoque', upd);
  return { result: { row: row }, changes: { Estoque: [row] } };
}

/** Pagamento de mensalidade (atualiza cliente) ou baixa de crediário (quita vendas quando saldo zera). */
function registrarRecebimento_(p, u) {
  const r = Object.assign({}, p.row || {});
  if (['Mensalidade', 'Crediario'].indexOf(r.Tipo) < 0) throw new Error('Tipo de recebimento inválido.');
  if (u.Nivel === 'Barbeiro' && r.Tipo !== 'Mensalidade') throw new Error('Sem permissão.');
  if (num_(r.Valor) <= 0) throw new Error('Valor inválido.');
  if (!r.ID_Cliente) throw new Error('Informe o cliente.');
  r.ID_Usuario = u.ID;
  r.DataHora = r.DataHora || nowIso_();
  const changes = { Recebimentos: [upsert_('Recebimentos', r)] };

  if (r.Tipo === 'Mensalidade') {
    changes.Clientes = [upsert_('Clientes', { ID: r.ID_Cliente, Ultimo_Pagamento: String(r.DataHora).slice(0, 10), Status_Mensalidade: 'Em dia' })];
  } else {
    const vendas = readTable_('Vendas_PDV').filter(v => v.Forma_Pagamento === 'Crediario' && String(v.ID_Cliente) === String(r.ID_Cliente) && v.Atividade === r.Atividade);
    const compras = vendas.reduce((s, v) => s + num_(v.Total_Venda), 0);
    const pagos = readTable_('Recebimentos').filter(x => x.Tipo === 'Crediario' && String(x.ID_Cliente) === String(r.ID_Cliente) && x.Atividade === r.Atividade)
      .reduce((s, x) => s + num_(x.Valor), 0);
    if (compras - pagos <= 0.009) {
      changes.Vendas_PDV = vendas.filter(v => v.Status_Crediario !== 'Quitado')
        .map(v => upsert_('Vendas_PDV', { ID_Venda: v.ID_Venda, Status_Crediario: 'Quitado' }));
    }
  }
  return { result: { row: changes.Recebimentos[0] }, changes: changes };
}

function gerarFechamento_(p) {
  const rows = (p.rows || []).map(r => upsert_('Fechamento_Comissoes', r));
  return { result: { rows: rows }, changes: { Fechamento_Comissoes: rows } };
}

/** Aprova uma conciliação OFX: grava o vínculo e baixa/cria a conta quando for débito. */
function conciliar_(p) {
  const row = Object.assign({}, p.row || {});
  if (!row.Fitid) throw new Error('FITID ausente.');
  const ja = readTable_('Conciliacao').find(c => String(c.Fitid) === String(row.Fitid));
  if (ja) throw new Error('Esta transação já foi conciliada.');
  row.Data_Aprovacao = row.Data_Aprovacao || today_();
  const changes = { Conciliacao: [upsert_('Conciliacao', row)] };
  if (p.novaConta) {
    changes.Financeiro_Contas = [upsert_('Financeiro_Contas', p.novaConta)];
  } else if (p.contaId) {
    changes.Financeiro_Contas = darBaixaConta_({ ID: p.contaId, Data_Pagamento: row.Data, Banco: p.Banco, Fitid_OFX: row.Fitid }).changes.Financeiro_Contas;
  }
  return { result: { row: changes.Conciliacao[0] }, changes: changes };
}

function salvarConfig_(p) {
  if (!p.Chave) throw new Error('Chave ausente.');
  const valor = typeof p.Valor === 'string' ? p.Valor : JSON.stringify(p.Valor);
  const row = upsert_('Config', { Chave: p.Chave, Valor: valor });
  return { result: { row: row }, changes: { Config: [row] } };
}

/* =====================================================================
 *  RELATÓRIO (GET action=relatorio&de=AAAA-MM-DD&ate=AAAA-MM-DD)
 * ===================================================================== */
function relatorio_(de, ate) {
  de = de || today_().slice(0, 8) + '01';
  ate = ate || today_();
  const inR = s => { const d = String(s || '').slice(0, 10); return d >= de && d <= ate; };
  const out = { de: de, ate: ate, atividades: {} };
  const add = (a, k, v) => { out.atividades[a] = out.atividades[a] || { bruto: 0, custo: 0, comissoes: 0 }; out.atividades[a][k] += v; };
  readTable_('Vendas_PDV').filter(v => inR(v.DataHora)).forEach(v => { add(v.Atividade, 'bruto', num_(v.Total_Venda)); add(v.Atividade, 'custo', num_(v.Preco_Custo_Total)); });
  readTable_('Agenda_Barbearia').filter(a => a.Status === 'Concluido' && inR(a.DataHora)).forEach(a => { add('Barbearia', 'bruto', num_(a.Valor)); add('Barbearia', 'comissoes', num_(a.Comissao_Valor)); });
  readTable_('Recebimentos').filter(r => r.Tipo === 'Mensalidade' && inR(r.DataHora)).forEach(r => add('Barbearia', 'bruto', num_(r.Valor)));
  readTable_('Agenda_Tatuagem').filter(a => a.Status === 'Concluido' && inR(a.DataHora)).forEach(a => { add('Tatuagem', 'bruto', num_(a.Valor_Total)); add('Tatuagem', 'comissoes', num_(a.Valor_Total) - num_(a.Comissao_Master)); });
  out.despesas = readTable_('Financeiro_Contas').filter(c => c.Status === 'Pago' && inR(c.Data_Pagamento)).reduce((s, c) => s + num_(c.Valor), 0);
  let bruto = 0, custos = 0;
  Object.keys(out.atividades).forEach(a => { const x = out.atividades[a]; bruto += x.bruto; custos += x.custo + x.comissoes; });
  out.bruto = round2_(bruto);
  out.lucro = round2_(bruto - custos - out.despesas);
  return out;
}

/* =====================================================================
 *  ACESSO À PLANILHA
 * ===================================================================== */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ensureSheet_(ss, name);
}

function readTable_(name) {
  const values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const tz = Session.getScriptTimeZone();
  return values.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = cellOut_(r[i], h, tz); });
      return o;
    });
}

function cellOut_(v, h, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, DATE_ONLY.indexOf(h) >= 0 ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
  return v;
}

function cellIn_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function findById_(name, id) {
  const key = keyOf_(name);
  return readTable_(name).find(r => String(r[key]) === String(id)) || null;
}

/** Insere ou atualiza (mescla campos) pela coluna-chave. */
function upsert_(name, obj) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const key = keyOf_(name);
  if (!key) return appendObj_(name, obj);
  const ki = headers.indexOf(key);
  if (obj[key] === undefined || obj[key] === '') obj[key] = newId_(name.slice(0, 2).toUpperCase());
  let idx = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][ki]) === String(obj[key])) { idx = i; break; }
  }
  const tz = Session.getScriptTimeZone();
  const base = idx > 0 ? values[idx].map((v, i) => cellIn_(cellOut_(v, headers[i], tz))) : headers.map(() => '');
  const row = headers.map((h, i) => (Object.prototype.hasOwnProperty.call(obj, h) && obj[h] !== undefined) ? cellIn_(obj[h]) : base[i]);
  const rowNum = idx > 0 ? idx + 1 : sh.getLastRow() + 1;
  const range = sh.getRange(rowNum, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  return rowObj_(headers, row);
}

function appendObj_(name, obj) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(h => cellIn_(obj[h]));
  const range = sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  return rowObj_(headers, row);
}

function deleteRow_(name, id) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const ki = values[0].map(String).indexOf(keyOf_(name));
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][ki]) === String(id)) { sh.deleteRow(i + 1); return true; }
  }
  throw new Error('Registro não encontrado.');
}

function rowObj_(headers, row) {
  const o = {};
  headers.forEach((h, i) => { if (h) o[h] = row[i]; });
  return o;
}

function configGet_(k, def) {
  const r = findById_('Config', k);
  if (!r) return def;
  try { return JSON.parse(r.Valor); } catch (e) { return r.Valor; }
}

/* ---------- Utilidades ---------- */
function num_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function round2_(n) { return Math.round(n * 100) / 100; }
function omit_(o, keys) { const c = Object.assign({}, o); keys.forEach(k => delete c[k]); return c; }
function newId_(prefix) { return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm"); }
