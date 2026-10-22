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
  Agenda_Barbearia:     ['ID', 'DataHora', 'ID_Cliente', 'Nome_Cliente', 'ID_Barbeiro', 'Servico', 'Valor', 'Comissao_Valor', 'Status',
                         'Mensalista', 'Origem', 'Duracao_Min', 'Criado_Por'],
  Agenda_Tatuagem:      ['ID', 'DataHora', 'ID_Cliente', 'Nome_Cliente', 'ID_Tatuador', 'Descricao_Servico', 'Valor_Total', 'Comissao_Master', 'Status', 'Tipo', 'Duracao_Min',
                         'Inicio_Real', 'Fim_Real', 'Tempo_Min', 'Criado_Por', 'Alterado_Por', 'Alterado_Em', 'Alteracao', 'Visto_Por',
                         'Origem', 'Telefone', 'Menor'],
  Estoque:              ['ID', 'Atividade', 'Produto', 'Qtd', 'Minimo', 'Preco_Custo', 'Preco_Venda', 'ID_Dono'],
  Vendas_PDV:           ['ID_Venda', 'DataHora', 'ID_Usuario', 'Atividade', 'Total_Venda', 'Preco_Custo_Total', 'Forma_Pagamento', 'Status_Crediario', 'ID_Cliente', 'Nome_Cliente'],
  Vendas_Itens:         ['ID_Venda', 'ID_Produto', 'Nome_Produto', 'Qtd', 'Preco_Custo_Unit', 'Preco_Venda_Unit', 'Subtotal'],
  Financeiro_Contas:    ['ID', 'Tipo', 'Descricao', 'Valor', 'Vencimento', 'Categoria', 'Banco', 'Status', 'Data_Pagamento', 'Fitid_OFX'],
  Fechamento_Comissoes: ['ID', 'Data', 'ID_Profissional', 'Atividade', 'Total_Produzido', 'Valor_Comissao', 'Valor_Master', 'Status_Pagamento'],
  // Abas auxiliares (pagamentos de mensalidade/crediário, conciliação OFX e configurações)
  // Pagamentos de cada sessão de tatuagem (à vista ou parcelado)
  Tattoo_Pagamentos:    ['ID', 'ID_Sessao', 'ID_Tatuador', 'Nome_Cliente', 'Parcela', 'Vencimento', 'Valor', 'Forma_Pagamento', 'Status', 'Data_Pagamento', 'Obs', 'Lancado_Por', 'Alterado_Em', 'Comprovante'],
  // Repasses da comissão do Master informados pelo tatuador e confirmados pelo Master
  Tattoo_Repasses:      ['ID', 'ID_Tatuador', 'Mes', 'Valor', 'Data', 'Forma_Pagamento', 'Obs', 'Status', 'Lancado_Por', 'Confirmado_Por', 'Confirmado_Em', 'Alterado_Em'],
  // Mensalidades que o mensalista pagou por Pix pelo link e enviou o comprovante (o balcão confere)
  Mensal_Pagamentos:    ['ID', 'DataHora', 'ID_Cliente', 'Nome_Cliente', 'Referencia', 'Valor', 'Comprovante', 'Status', 'Conferido_Por', 'Conferido_Em', 'ID_Recebimento', 'Obs'],
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

const DEFAULT_TIPOS_TATTOO = [
  { nome: 'Pequena / Fine line', preco: 250, duracao: 60, pct: 30 },
  { nome: 'Média (até 15 cm)', preco: 500, duracao: 180, pct: 30 },
  { nome: 'Grande (sessão)', preco: 900, duracao: 300, pct: 30 },
  { nome: 'Cobertura (cover-up)', preco: 700, duracao: 240, pct: 30 },
  { nome: 'Retoque', preco: 0, duracao: 60, pct: 0 }
];

const DEFAULT_SERVICOS = [
  { nome: 'Corte', preco: 40, duracao: 30, comissao: 50 },
  { nome: 'Barba', preco: 30, duracao: 30, comissao: 50 },
  { nome: 'Corte + Barba', preco: 60, duracao: 60, comissao: 50 },
  { nome: 'Pigmentação', preco: 25, duracao: 30, comissao: 40 },
  { nome: 'Sobrancelha', preco: 15, duracao: 15, comissao: 50 }
];

/** Abas que cada nível pode LER (getAll). */
const READ_ACCESS = {
  Master: '*',
  Barbeiro: ['Usuarios', 'Clientes', 'Agenda_Barbearia', 'Recebimentos', 'Config', 'Fechamento_Comissoes'],
  Caixa: ['Usuarios', 'Clientes', 'Estoque', 'Vendas_PDV', 'Vendas_Itens', 'Recebimentos', 'Config', 'Agenda_Tatuagem', 'Tattoo_Pagamentos', 'Agenda_Barbearia', 'Mensal_Pagamentos'],
  Tatuador: ['Usuarios', 'Clientes', 'Agenda_Tatuagem', 'Tattoo_Pagamentos', 'Tattoo_Repasses', 'Config', 'Fechamento_Comissoes', 'Estoque', 'Vendas_PDV', 'Vendas_Itens']
};

/** Ações de escrita (POST) e níveis autorizados. levels:null = pública (só exige k). */
const ACTIONS = {
  login:                { levels: null, fn: login_ },
  validarPin:           { levels: null, fn: validarPin_ },
  upsert:               { levels: LEVELS, fn: upsertAction_ },
  remove:               { levels: ['Master'], fn: removeAction_ },
  salvarVenda:          { levels: ['Master', 'Caixa', 'Tatuador'], fn: salvarVenda_ },
  atualizarEstoque:     { levels: ['Master', 'Tatuador'], fn: atualizarEstoque_ },
  salvarAgendamento:    { levels: LEVELS, fn: salvarAgendamento_ },
  marcarSessao:         { levels: ['Master', 'Tatuador', 'Caixa'], fn: marcarSessao_ },
  vistoAviso:           { levels: ['Master', 'Tatuador', 'Caixa'], fn: vistoAviso_ },
  salvarPagamentoTattoo:{ levels: ['Master', 'Tatuador', 'Caixa'], fn: salvarPagamentoTattoo_ },
  restaurarBackup:      { levels: ['Master'], fn: restaurarBackup_ },
  salvarPerfilTatuador: { levels: ['Master', 'Tatuador'], fn: salvarPerfilTatuador_ },
  salvarRepasse:        { levels: ['Master', 'Tatuador'], fn: salvarRepasse_ },
  verComprovante:       { levels: ['Master', 'Tatuador', 'Caixa'], fn: verComprovante_ },
  agendaPublica:        { levels: null, fn: agendaPublica_ },
  linkMensalista:       { levels: ['Master', 'Caixa', 'Barbeiro'], fn: linkMensalista_ },
  conferirPagamentoMensal: { levels: ['Master', 'Caixa'], fn: conferirPagamentoMensal_ },
  areaMensalista:       { levels: null, fn: areaMensalista_ },
  agendarMensalista:    { levels: null, fn: agendarMensalista_ },
  cancelarMensalista:   { levels: null, fn: cancelarMensalista_ },
  pagarMensalista:      { levels: null, fn: pagarMensalista_ },
  solicitarAgendamento: { levels: null, fn: solicitarAgendamento_ },
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
  const tat = u.Nivel === 'Tatuador';
  if ((t === 'Agenda_Tatuagem' || t === 'Tattoo_Pagamentos' || t === 'Tattoo_Repasses') && tat) rows = rows.filter(r => String(r.ID_Tatuador) === String(u.ID));
  if (t === 'Estoque' && tat) rows = rows.filter(r => r.Atividade === 'Tatuagem' && (!r.ID_Dono || String(r.ID_Dono) === String(u.ID)));
  if (t === 'Estoque' && u.Nivel === 'Caixa') rows = rows.filter(r => r.Atividade !== 'Tatuagem');
  if (t === 'Vendas_PDV' && tat) rows = rows.filter(r => r.Atividade === 'Tatuagem' && String(r.ID_Usuario) === String(u.ID));
  if (t === 'Vendas_Itens' && tat) {
    const minhas = {};
    readTable_('Vendas_PDV').forEach(v => { if (v.Atividade === 'Tatuagem' && String(v.ID_Usuario) === String(u.ID)) minhas[String(v.ID_Venda)] = true; });
    rows = rows.filter(r => minhas[String(r.ID_Venda)]);
  }
  if (t === 'Fechamento_Comissoes') rows = rows.filter(r => String(r.ID_Profissional) === String(u.ID));
  if (t === 'Recebimentos' && u.Nivel === 'Barbeiro') rows = rows.filter(r => r.Tipo === 'Mensalidade');
  // Os produtos do tatuador são dele: ele vê o próprio custo e a própria margem
  if (tat && (t === 'Vendas_PDV' || t === 'Vendas_Itens')) return rows;
  if (tat && t === 'Estoque') return rows.map(r => String(r.ID_Dono) === String(u.ID) ? r : omit_(r, COST_FIELDS));
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
  const strip = u.Nivel === 'Master' || u.Nivel === 'Tatuador' ? ['PIN_Acesso'] : COST_FIELDS.concat(['PIN_Acesso']);
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
  if (u.Nivel === 'Tatuador' && venda.Atividade !== 'Tatuagem') throw new Error('O tatuador só vende os produtos do estúdio.');
  if (u.Nivel === 'Caixa' && venda.Atividade === 'Tatuagem') throw new Error('Os produtos do estúdio são vendidos pelo próprio tatuador.');
  const descontoOk = u.Nivel === 'Master' || (p.auth && checkDescAuth_(p.auth));
  venda.ID_Venda = venda.ID_Venda || newId_('V');
  if (findById_('Vendas_PDV', venda.ID_Venda)) throw new Error('Venda já registrada.');

  let total = 0, custo = 0;
  itens.forEach(it => {
    const prod = byId[String(it.ID_Produto)];
    if (!prod) throw new Error('Produto não encontrado: ' + it.Nome_Produto);
    if (venda.Atividade && prod.Atividade !== venda.Atividade) throw new Error('"' + prod.Produto + '" não é desta loja.');
    if (u.Nivel === 'Tatuador' && prod.ID_Dono && String(prod.ID_Dono) !== String(u.ID)) throw new Error('"' + prod.Produto + '" é de outro tatuador.');
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
function atualizarEstoque_(p, u) {
  let row;
  const tat = u && u.Nivel === 'Tatuador';
  if (tat && !configGet_('tattoo_produtos_do_tatuador', true)) throw new Error('Só o Master cadastra e altera produtos.');
  const meu = prod => prod.Atividade === 'Tatuagem' && String(prod.ID_Dono) === String(u.ID);
  if (p.row) {
    if (!p.row.Produto) throw new Error('Informe o nome do produto.');
    if (tat) {
      const ex = p.row.ID ? findById_('Estoque', p.row.ID) : null;
      if (ex && !meu(ex)) throw new Error('Você só altera os seus produtos.');
      p.row.Atividade = 'Tatuagem'; p.row.ID_Dono = u.ID;
    }
    if (p.row.Atividade === 'Tatuagem' && !p.row.ID_Dono) throw new Error('Escolha o tatuador dono do produto.');
    row = upsert_('Estoque', p.row);
  } else {
    const prod = findById_('Estoque', p.ID);
    if (!prod) throw new Error('Produto não encontrado.');
    if (tat && !meu(prod)) throw new Error('Você só altera os seus produtos.');
    row = upsert_('Estoque', { ID: prod.ID, Qtd: num_(prod.Qtd) + num_(p.delta) });
  }
  return { result: { row: row }, changes: { Estoque: [row] } };
}

function salvarAgendamento_(p, u) {
  const tat = p.tipo === 'tatuagem';
  const t = tat ? 'Agenda_Tatuagem' : 'Agenda_Barbearia';
  const ownerCol = tat ? 'ID_Tatuador' : 'ID_Barbeiro';
  // Tatuagem: Master, Tatuador e Caixa (atendente). Barbearia: Master, Barbeiro e Caixa (atendente).
  if ((tat && u.Nivel === 'Barbeiro') || (!tat && u.Nivel === 'Tatuador')) throw new Error('Sem permissão para esta agenda.');
  const row = Object.assign({}, p.row || {});
  if (!row.DataHora) throw new Error('Informe data e hora.');
  const ex = row.ID ? findById_(t, row.ID) : null;
  if (u.Nivel === 'Barbeiro' || u.Nivel === 'Tatuador') {
    if (ex && String(ex[ownerCol]) !== String(u.ID)) throw new Error('Este agendamento é de outro profissional.');
    row[ownerCol] = u.ID;
  }
  if (tat) prepTattoo_(row, ex, u);
  else prepBarb_(row, ex, u);
  const saved = upsert_(t, row);
  return { result: { tipo: p.tipo, row: saved }, changes: { [t]: [saved] } };
}

/* ---------- Tatuagem: comissão, histórico de alterações e avisos ---------- */
const TATTOO_CONTROLE = ['Inicio_Real', 'Fim_Real', 'Tempo_Min', 'Criado_Por', 'Alterado_Por', 'Alterado_Em', 'Alteracao', 'Visto_Por'];

/** % da sala vem da tabela de tipos (só o Master edita). Sem tipo, vale a % padrão. */
function comissaoTattoo_(tipo, valor) {
  const tipos = configGet_('tipos_tatuagem', DEFAULT_TIPOS_TATTOO);
  const tp = (Array.isArray(tipos) ? tipos : []).find(x => x.nome === tipo);
  const pct = tp && tp.pct !== '' && tp.pct !== undefined && tp.pct !== null ? num_(tp.pct) : num_(configGet_('comissao_master_tattoo', 30));
  return round2_(num_(valor) * pct / 100);
}

function prepTattoo_(row, ex, u) {
  TATTOO_CONTROLE.forEach(k => delete row[k]); // campos de controle só o servidor grava
  if (!row.ID_Tatuador && !(ex && ex.ID_Tatuador)) throw new Error('Escolha o tatuador.');
  const valor = row.Valor_Total !== undefined ? num_(row.Valor_Total) : num_(ex && ex.Valor_Total);
  if (u.Nivel !== 'Master') row.Comissao_Master = comissaoTattoo_(row.Tipo !== undefined ? row.Tipo : ex && ex.Tipo, valor);
  if (num_(row.Comissao_Master) > valor + 0.001) throw new Error('A comissão não pode ser maior que o valor total.');
  if (!ex) {
    row.Criado_Por = u.ID;
    marcaAviso_(row, u, 'Sessão agendada');
    return;
  }
  const resumo = diffTattoo_(ex, row);
  if (resumo) marcaAviso_(row, u, resumo);
}

function diffTattoo_(ex, row) {
  const campos = [['DataHora', 'Data/hora'], ['Valor_Total', 'Valor'], ['Status', 'Situação'], ['Duracao_Min', 'Duração'], ['ID_Tatuador', 'Tatuador'], ['Tipo', 'Tipo']];
  const fmt = (k, v) => k === 'Valor_Total' ? 'R$ ' + round2_(num_(v)).toFixed(2).replace('.', ',') : k === 'DataHora' ? String(v || '').replace('T', ' ') : k === 'Status' ? statusTattoo_(v) : String(v === undefined ? '' : v);
  const igual = (k, a, b) => (k === 'Valor_Total' || k === 'Duracao_Min') ? Math.abs(num_(a) - num_(b)) < 0.001 : String(a || '') === String(b || '');
  return campos.filter(([k]) => row[k] !== undefined && !igual(k, ex[k], row[k]))
    .map(([k, l]) => l + ': ' + fmt(k, ex[k]) + ' → ' + fmt(k, row[k])).join('; ');
}

function statusTattoo_(s) { return s === 'Concluido' ? 'Executado' : s || ''; }

/** Grava quem alterou e zera os "vistos": a outra parte recebe o aviso. */
function marcaAviso_(row, u, texto) {
  row.Alterado_Por = u.ID;
  row.Alterado_Em = nowIso_();
  row.Alteracao = texto + ' — por ' + u.Nome;
  row.Visto_Por = JSON.stringify([String(u.ID)]);
}

function sessaoPermitida_(id, u) {
  const s = findById_('Agenda_Tatuagem', id);
  if (!s) throw new Error('Sessão não encontrada.');
  if (u.Nivel === 'Tatuador' && String(s.ID_Tatuador) !== String(u.ID)) throw new Error('Esta sessão é de outro tatuador.');
  return s;
}

const minutosEntre_ = (a, b) => Math.round((new Date(String(b) + ':00').getTime() - new Date(String(a) + ':00').getTime()) / 60000);
const horaValida_ = q => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(q || ''));

/** Tatuador (ou atendente) marca início e fim do serviço. "quando" vem do aparelho, para valer também offline. */
function marcarSessao_(p, u) {
  const s = sessaoPermitida_(p.id, u);
  const quando = horaValida_(p.quando) ? p.quando : nowIso_();
  const upd = { ID: s.ID };
  if (p.evento === 'inicio') {
    upd.Inicio_Real = quando; upd.Fim_Real = ''; upd.Tempo_Min = '';
    upd.Status = 'Em andamento';
    marcaAviso_(upd, u, 'Serviço iniciado às ' + quando.slice(11));
  } else if (p.evento === 'fim') {
    const ini = horaValida_(p.inicio) ? p.inicio : horaValida_(s.Inicio_Real) ? s.Inicio_Real : quando;
    if (minutosEntre_(ini, quando) < 0) throw new Error('O fim não pode ser antes do início.');
    upd.Inicio_Real = ini; upd.Fim_Real = quando;
    upd.Tempo_Min = Math.max(0, minutosEntre_(ini, quando));
    upd.Status = 'Concluido';
    marcaAviso_(upd, u, 'Serviço executado (' + ini.slice(11) + ' às ' + quando.slice(11) + ')');
  } else throw new Error('Evento inválido.');
  const saved = upsert_('Agenda_Tatuagem', upd);
  return { result: { row: saved }, changes: { Agenda_Tatuagem: [saved] } };
}

function vistoAviso_(p, u) {
  const s = sessaoPermitida_(p.id, u);
  let vistos = [];
  try { vistos = JSON.parse(s.Visto_Por || '[]'); } catch (e) { vistos = []; }
  if (vistos.indexOf(String(u.ID)) < 0) vistos.push(String(u.ID));
  const saved = upsert_('Agenda_Tatuagem', { ID: s.ID, Visto_Por: JSON.stringify(vistos) });
  return { result: { row: saved }, changes: { Agenda_Tatuagem: [saved] } };
}

/** Lança, edita, dá baixa ou cancela parcelas de uma sessão. A comissão do Master não depende disso. */
function salvarPagamentoTattoo_(p, u) {
  const lista = p.rows || (p.row ? [p.row] : []);
  if (!lista.length) throw new Error('Nenhum pagamento informado.');
  const s = sessaoPermitida_(lista[0].ID_Sessao, u);
  const money = v => 'R$ ' + round2_(num_(v)).toFixed(2).replace('.', ',');
  const saved = lista.map(r0 => {
    const r = Object.assign({}, r0);
    if (String(r.ID_Sessao) !== String(s.ID)) throw new Error('Pagamentos de sessões diferentes.');
    if (['Aberto', 'Pago', 'Cancelado'].indexOf(r.Status) < 0) r.Status = 'Aberto';
    if (r.Status !== 'Cancelado' && num_(r.Valor) <= 0) throw new Error('Valor da parcela inválido.');
    r.ID_Tatuador = s.ID_Tatuador;
    r.Nome_Cliente = s.Nome_Cliente;
    r.Valor = round2_(num_(r.Valor));
    if (r.Status === 'Pago') r.Data_Pagamento = r.Data_Pagamento || today_();
    else r.Data_Pagamento = '';
    r.Lancado_Por = u.ID;
    r.Alterado_Em = nowIso_();
    return upsert_('Tattoo_Pagamentos', r);
  });
  const desc = saved.map(r => (r.Status === 'Pago' ? 'recebido ' : r.Status === 'Cancelado' ? 'cancelado ' : 'a receber ') + money(r.Valor)).join(', ');
  const upd = { ID: s.ID };
  marcaAviso_(upd, u, 'Pagamento: ' + desc);
  const sess = upsert_('Agenda_Tatuagem', upd);
  return { result: { rows: saved }, changes: { Tattoo_Pagamentos: saved, Agenda_Tatuagem: [sess] } };
}

/* ---------- Perfil do tatuador: Pix, horário de atendimento e textos dos avisos ao cliente ---------- */
const DEFAULT_TEXTOS_TATTOO = {
  sanitario: 'Cuidados e condições sanitárias: o estúdio usa material descartável e esterilizado, aberto na sua frente. Venha alimentado(a), hidratado(a) e descansado(a). Não beba álcool nem tome remédios que afinem o sangue (como AAS) nas 24 horas antes. Avise se tiver alergia, diabetes, problema de coagulação, gravidez ou outra condição de saúde.',
  menor: 'Menor de idade: só tatuamos menores de 18 anos acompanhados do pai, da mãe ou do responsável legal, com documento com foto de ambos e autorização assinada no estúdio.',
  falta: 'Faltas e remarcação: a entrada de {entrada}% garante o seu horário. Se não comparecer, a entrada não será devolvida. Para desmarcar ou remarcar sem perder a entrada, avise com pelo menos 24 horas de antecedência.',
  cuidados: 'Depois da tatuagem: lave com sabonete neutro, use a pomada indicada, não coce, não tome sol e não entre em piscina ou mar por 15 dias.'
};
const DEFAULT_HORARIO_TATTOO = { dias: [1, 2, 3, 4, 5, 6], inicio: '10:00', fim: '20:00' };

function perfilTatuador_(id) {
  const p = configGet_('tatuador_' + id, {}) || {};
  return {
    pix: String(p.pix || ''), titular: String(p.titular || ''), banco: String(p.banco || ''),
    horario: Object.assign({}, DEFAULT_HORARIO_TATTOO, p.horario || {}),
    textos: Object.assign({}, DEFAULT_TEXTOS_TATTOO, p.textos || {})
  };
}

function salvarPerfilTatuador_(p, u) {
  const id = u.Nivel === 'Tatuador' ? u.ID : p.ID_Tatuador;
  const t = findById_('Usuarios', id);
  if (!t || t.Nivel !== 'Tatuador') throw new Error('Tatuador não encontrado.');
  const src = p.perfil || {};
  const txt = v => String(v === undefined || v === null ? '' : v).slice(0, 3000);
  const hora = v => /^\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : '';
  const h = src.horario || {};
  const perfil = {
    pix: txt(src.pix).slice(0, 120), titular: txt(src.titular).slice(0, 120), banco: txt(src.banco).slice(0, 80),
    horario: {
      dias: (Array.isArray(h.dias) ? h.dias : DEFAULT_HORARIO_TATTOO.dias).map(Number).filter(d => d >= 0 && d <= 6),
      inicio: hora(h.inicio) || DEFAULT_HORARIO_TATTOO.inicio, fim: hora(h.fim) || DEFAULT_HORARIO_TATTOO.fim
    },
    textos: {}
  };
  Object.keys(DEFAULT_TEXTOS_TATTOO).forEach(k => { perfil.textos[k] = txt((src.textos || {})[k]) || DEFAULT_TEXTOS_TATTOO[k]; });
  const row = upsert_('Config', { Chave: 'tatuador_' + id, Valor: JSON.stringify(perfil) });
  return { result: { row: row }, changes: { Config: [row] } };
}

/* ---------- Repasse das comissões ao Master (o tatuador informa, o Master confirma) ---------- */
function salvarRepasse_(p, u) {
  const r = Object.assign({}, p.row || {});
  const ex = r.ID ? findById_('Tattoo_Repasses', r.ID) : null;
  const master = u.Nivel === 'Master';
  if (!master) {
    if (ex && String(ex.ID_Tatuador) !== String(u.ID)) throw new Error('Este repasse é de outro tatuador.');
    if (ex && ex.Status === 'Confirmado') throw new Error('Repasse já confirmado pelo Master. Peça a ele para alterar.');
    r.ID_Tatuador = u.ID;
    r.Status = r.Status === 'Cancelado' ? 'Cancelado' : 'Informado';
    delete r.Confirmado_Por; delete r.Confirmado_Em;
  } else {
    if (['Informado', 'Confirmado', 'Cancelado'].indexOf(r.Status) < 0) r.Status = 'Confirmado';
    if (r.Status === 'Confirmado' && !(ex && ex.Status === 'Confirmado')) { r.Confirmado_Por = u.ID; r.Confirmado_Em = nowIso_(); }
    if (r.Status !== 'Confirmado') { r.Confirmado_Por = ''; r.Confirmado_Em = ''; }
  }
  const tat = findById_('Usuarios', r.ID_Tatuador || (ex && ex.ID_Tatuador));
  if (!tat || tat.Nivel !== 'Tatuador') throw new Error('Escolha o tatuador.');
  if (!/^\d{4}-\d{2}$/.test(String(r.Mes || (ex && ex.Mes) || ''))) throw new Error('Informe o mês da comissão.');
  if (r.Status !== 'Cancelado' && num_(r.Valor !== undefined ? r.Valor : ex && ex.Valor) <= 0) throw new Error('Informe o valor repassado.');
  r.ID = r.ID || newId_('RP');
  if (r.Valor !== undefined) r.Valor = round2_(num_(r.Valor));
  r.Data = r.Data || today_();
  r.Lancado_Por = ex ? ex.Lancado_Por : u.ID;
  r.Alterado_Em = nowIso_();
  const saved = upsert_('Tattoo_Repasses', r);
  return { result: { row: saved }, changes: { Tattoo_Repasses: [saved] } };
}

/* ---------- Agendamento pelo link (cliente, sem login) ---------- */
const COMPROVANTE_PASTA = 'Preto Rico - Comprovantes';

function tatuadorPublico_(id) {
  const t = findById_('Usuarios', id);
  if (!t || t.Nivel !== 'Tatuador' || t.Status === 'Inativo') throw new Error('Link de agendamento inválido ou desativado.');
  return t;
}
function ocupadosTattoo_(idTat) {
  const tipos = configGet_('tipos_tatuagem', DEFAULT_TIPOS_TATTOO) || [];
  const hoje = today_();
  return readTable_('Agenda_Tatuagem')
    .filter(a => String(a.ID_Tatuador) === String(idTat) && a.Status !== 'Cancelado' && String(a.DataHora).slice(0, 10) >= hoje)
    .map(a => {
      const tp = (Array.isArray(tipos) ? tipos : []).find(x => x.nome === a.Tipo);
      return { ini: String(a.DataHora).slice(0, 16), min: num_(a.Duracao_Min) || num_(tp && tp.duracao) || 120 };
    });
}

/** Dados públicos para a página de agendamento: sem nomes de clientes nem valores de outras sessões. */
function agendaPublica_(p) {
  const t = tatuadorPublico_(p.t);
  const perfil = perfilTatuador_(t.ID);
  const tipos = (configGet_('tipos_tatuagem', DEFAULT_TIPOS_TATTOO) || []).map(x => ({ nome: x.nome, preco: num_(x.preco), duracao: num_(x.duracao) || 120 }));
  const emp = configGet_('empresa', {}) || {};
  return {
    tatuador: { ID: t.ID, Nome: t.Nome }, empresa: { nome: emp.nome || 'Preto Rico', tel: emp.tel || '', end: emp.end || '' },
    tipos: tipos, entradaPct: num_(configGet_('tattoo_entrada_pct', 30)),
    pix: perfil.pix, titular: perfil.titular, banco: perfil.banco, horario: perfil.horario, textos: perfil.textos,
    ocupados: ocupadosTattoo_(t.ID), agora: nowIso_()
  };
}

function solicitarAgendamento_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Servidor ocupado, tente novamente.');
  try {
    const t = tatuadorPublico_(p.t);
    const tel = String(p.telefone || '').replace(/\D/g, '');
    const nome = String(p.nome || '').trim().slice(0, 80);
    if (nome.length < 3) throw new Error('Informe o seu nome completo.');
    if (tel.length < 10 || tel.length > 13) throw new Error('Informe um WhatsApp válido com DDD.');
    if (!p.aceite) throw new Error('É preciso ler e aceitar os avisos.');
    // Limite contra abuso: 3 pedidos por telefone por hora e 40 pedidos por hora no total
    const cache = CacheService.getScriptCache();
    const kTel = 'ag_tel_' + tel, kAll = 'ag_all';
    const nTel = Number(cache.get(kTel) || 0), nAll = Number(cache.get(kAll) || 0);
    if (nTel >= 3 || nAll >= 40) throw new Error('Muitos pedidos em pouco tempo. Tente mais tarde ou chame o estúdio no WhatsApp.');
    const tipos = configGet_('tipos_tatuagem', DEFAULT_TIPOS_TATTOO) || [];
    const tipo = (Array.isArray(tipos) ? tipos : []).find(x => x.nome === p.tipo);
    if (!tipo) throw new Error('Escolha o tipo de tatuagem.');
    const dh = String(p.dataHora || '');
    if (!horaValida_(dh)) throw new Error('Escolha o dia e o horário.');
    const dur = num_(tipo.duracao) || 120;
    const perfil = perfilTatuador_(t.ID);
    const dia = new Date(dh.slice(0, 10) + 'T12:00:00').getDay();
    const ini = dh.slice(11), fimMin = minutosEntre_(dh.slice(0, 11) + '00:00', dh) + dur;
    const hm = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    if (perfil.horario.dias.indexOf(dia) < 0 || hm(ini) < hm(perfil.horario.inicio) || fimMin > hm(perfil.horario.fim)) throw new Error('Horário fora do atendimento do tatuador.');
    if (minutosEntre_(nowIso_(), dh) < 120) throw new Error('Escolha um horário com pelo menos 2 horas de antecedência.');
    const conflito = ocupadosTattoo_(t.ID).some(o => {
      const a = minutosEntre_(dh, o.ini); // início da outra em relação à nova
      return a < dur && -a < o.min;
    });
    if (conflito) throw new Error('Este horário acabou de ser ocupado. Escolha outro.');
    // Comprovante da entrada
    const arq = salvarComprovante_(p.comprovante, 'comprovante-' + dh.slice(0, 10) + '-' + tel);
    // Cliente: reaproveita o cadastro pelo WhatsApp
    const cli = readTable_('Clientes').find(x => String(x.Telefone_WhatsApp || '').replace(/\D/g, '').slice(-11) === tel.slice(-11))
      || upsert_('Clientes', { ID: newId_('C'), Nome: nome, Telefone_WhatsApp: tel, Tipo: 'Avulso', Atividade_Origem: 'Tatuagem' });
    const valor = num_(tipo.preco);
    const pct = num_(configGet_('tattoo_entrada_pct', 30));
    const entrada = round2_(valor * pct / 100);
    const menor = !!p.menor;
    const obs = [menor ? 'MENOR DE IDADE — responsável: ' + String(p.responsavel || '').slice(0, 80) : '', String(p.ideia || '').slice(0, 500)].filter(Boolean).join(' · ');
    const row = {
      ID: newId_('AT'), DataHora: dh, ID_Cliente: cli.ID, Nome_Cliente: nome, ID_Tatuador: t.ID,
      Descricao_Servico: obs || 'Pedido pelo link', Valor_Total: valor, Comissao_Master: comissaoTattoo_(tipo.nome, valor),
      Status: 'Solicitado', Tipo: tipo.nome, Duracao_Min: dur, Origem: 'Link', Telefone: tel, Menor: menor ? 'Sim' : 'Não',
      Criado_Por: 'CLIENTE', Alterado_Por: 'CLIENTE', Alterado_Em: nowIso_(),
      Alteracao: 'Pedido de agendamento pelo link, com comprovante da entrada — por ' + nome + ' (cliente)', Visto_Por: '[]'
    };
    const sess = upsert_('Agenda_Tatuagem', row);
    upsert_('Tattoo_Pagamentos', {
      ID: newId_('TP'), ID_Sessao: sess.ID, ID_Tatuador: t.ID, Nome_Cliente: nome, Parcela: 'Entrada ' + pct + '%', Vencimento: today_(),
      Valor: entrada, Forma_Pagamento: 'Pix', Status: 'Aberto', Obs: 'Comprovante enviado pelo cliente: conferir e dar baixa', Comprovante: arq,
      Lancado_Por: 'CLIENTE', Alterado_Em: nowIso_()
    });
    cache.put(kTel, String(nTel + 1), 3600); cache.put(kAll, String(nAll + 1), 3600);
    return { id: sess.ID, entrada: entrada, tatuador: t.Nome };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 *  BARBEARIA — atendimento pelo balcão e área do mensalista (link)
 *  O mensalista recebe um link pessoal (mensalista.html?c=CÓDIGO) pelo
 *  WhatsApp. Nele ele escolhe o barbeiro, vê os dias e horários vagos e
 *  ocupados, marca ou desmarca o próprio horário e paga a mensalidade por
 *  Pix (dados cadastrados pelo Master), enviando o comprovante para o
 *  balcão conferir. O código é assinado pelo servidor e só vale enquanto
 *  o cliente estiver cadastrado como Mensalista.
 * ===================================================================== */
const DEFAULT_HORARIO_BARB = { dias: [1, 2, 3, 4, 5, 6], inicio: '09:00', fim: '20:00' };
const BARB_REGRAS = { antecedenciaMin: 30, diasMax: 30, maxAbertos: 2, cancelarMin: 60 };

function duracaoServico_(nome) {
  const s = (configGet_('servicos', DEFAULT_SERVICOS) || []).find(x => x.nome === nome);
  return num_(s && s.duracao) || 30;
}

/** Barbeiro, mensalista e comissão de cada horário da barbearia (lançado no balcão ou na agenda). */
function prepBarb_(row, ex, u) {
  const b = findById_('Usuarios', row.ID_Barbeiro || (ex && ex.ID_Barbeiro));
  if (!b || b.Nivel !== 'Barbeiro') throw new Error('Escolha o barbeiro.');
  delete row.Origem; delete row.Criado_Por;
  if (!ex) { row.Origem = 'Balcão'; row.Criado_Por = u.ID; }
  const mens = row.Mensalista !== undefined ? row.Mensalista : ex && ex.Mensalista;
  if (mens === 'Sim') {
    const c = findById_('Clientes', row.ID_Cliente !== undefined ? row.ID_Cliente : ex && ex.ID_Cliente);
    if (!c || c.Tipo !== 'Mensalista') throw new Error('Escolha o mensalista.');
    row.ID_Cliente = c.ID; row.Nome_Cliente = c.Nome;
  } else if (row.Mensalista !== undefined) row.Mensalista = '';
  const serv = row.Servico !== undefined ? row.Servico : ex && ex.Servico;
  row.Comissao_Valor = comissaoServico_(serv, row.Valor !== undefined ? row.Valor : ex && ex.Valor);
  if (!num_(row.Duracao_Min) && !(ex && num_(ex.Duracao_Min))) row.Duracao_Min = duracaoServico_(serv);
}

function horarioBarb_() {
  const h = configGet_('horario_barbearia', {}) || {};
  const hora = v => /^\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : '';
  return {
    dias: (Array.isArray(h.dias) ? h.dias : DEFAULT_HORARIO_BARB.dias).map(Number).filter(d => d >= 0 && d <= 6),
    inicio: hora(h.inicio) || DEFAULT_HORARIO_BARB.inicio, fim: hora(h.fim) || DEFAULT_HORARIO_BARB.fim
  };
}

/** Horários ocupados de um barbeiro de hoje em diante (só início e duração, sem nomes). */
function ocupadosBarb_(idB, agenda) {
  const hoje = today_();
  return (agenda || readTable_('Agenda_Barbearia'))
    .filter(a => String(a.ID_Barbeiro) === String(idB) && a.Status !== 'Cancelado' && String(a.DataHora).slice(0, 10) >= hoje)
    .map(a => ({ ini: String(a.DataHora).slice(0, 16), min: num_(a.Duracao_Min) || duracaoServico_(a.Servico) }));
}

function statusMensal_(c) {
  const hoje = today_();
  if (String(c.Ultimo_Pagamento || '').slice(0, 7) >= hoje.slice(0, 7)) return 'Em dia';
  return Number(hoje.slice(8, 10)) > (num_(c.Dia_Vencimento) || 10) ? 'Atrasado' : 'Pendente';
}

function mensalistaDoLink_(code) {
  const parts = readToken_(code);
  if (!parts || parts[0] !== 'M') throw new Error('Link inválido. Peça um novo link à barbearia.');
  const c = findById_('Clientes', parts[1]);
  if (!c || c.Tipo !== 'Mensalista') throw new Error('Este link não está mais ativo. Fale com a barbearia.');
  return c;
}

function limite_(chave, max, msg) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(chave) || 0);
  if (n >= max) throw new Error(msg);
  return () => cache.put(chave, String(n + 1), 3600);
}

/** Grava a foto ou o PDF de um comprovante na pasta do Drive e devolve o ID do arquivo. */
function salvarComprovante_(c, nome) {
  c = c || {};
  const mime = String(c.mime || '');
  if (!c.base64 || !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) throw new Error('Envie o comprovante do Pix (foto ou PDF).');
  if (String(c.base64).length > 6 * 1024 * 1024) throw new Error('Arquivo do comprovante muito grande (máximo 4 MB).');
  const it = DriveApp.getFoldersByName(COMPROVANTE_PASTA);
  const pasta = it.hasNext() ? it.next() : DriveApp.createFolder(COMPROVANTE_PASTA);
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  return pasta.createFile(Utilities.newBlob(Utilities.base64Decode(c.base64), mime, nome + '.' + ext)).getId();
}

/** Gera o link pessoal do mensalista (Master, atendente ou barbeiro). */
function linkMensalista_(p) {
  const c = findById_('Clientes', p.id);
  if (!c || c.Tipo !== 'Mensalista') throw new Error('Este cliente não é mensalista.');
  return { result: { code: makeToken_('M|' + c.ID) }, changes: {} };
}

/** Dados da área do mensalista: só os horários ocupados, sem nomes de outros clientes. */
function areaMensalista_(p) {
  const c = mensalistaDoLink_(p.c);
  const agenda = readTable_('Agenda_Barbearia');
  const barbs = readTable_('Usuarios').filter(u => u.Nivel === 'Barbeiro' && u.Status !== 'Inativo');
  const nomeB = {};
  barbs.forEach(b => { nomeB[String(b.ID)] = b.Nome; });
  const ocupados = {};
  barbs.forEach(b => { ocupados[b.ID] = ocupadosBarb_(b.ID, agenda); });
  const hoje = today_();
  const meus = agenda.filter(a => String(a.ID_Cliente) === String(c.ID));
  const pix = configGet_('barbearia_pix', {}) || {};
  const emp = configGet_('empresa', {}) || {};
  return {
    cliente: { Nome: c.Nome, Valor: num_(c.Valor_Mensalidade), Dia: num_(c.Dia_Vencimento) || 10, Ultimo: c.Ultimo_Pagamento || '', status: statusMensal_(c) },
    empresa: { nome: emp.nome || 'Preto Rico', tel: emp.tel || '', end: emp.end || '' },
    barbeiros: barbs.map(b => ({ ID: b.ID, Nome: b.Nome })),
    servicos: (configGet_('servicos', DEFAULT_SERVICOS) || []).map(s => ({ nome: s.nome, duracao: num_(s.duracao) || 30 })),
    horario: horarioBarb_(), regras: BARB_REGRAS, ocupados: ocupados,
    proximos: meus.filter(a => a.Status === 'Agendado' && String(a.DataHora).slice(0, 10) >= hoje)
      .sort((a, b) => String(a.DataHora).localeCompare(String(b.DataHora)))
      .map(a => ({ ID: a.ID, DataHora: String(a.DataHora).slice(0, 16), Servico: a.Servico, Barbeiro: nomeB[String(a.ID_Barbeiro)] || '' })),
    ultimos: meus.filter(a => a.Status === 'Concluido').sort((a, b) => String(b.DataHora).localeCompare(String(a.DataHora))).slice(0, 5)
      .map(a => ({ DataHora: String(a.DataHora).slice(0, 16), Servico: a.Servico, Barbeiro: nomeB[String(a.ID_Barbeiro)] || '' })),
    enviados: readTable_('Mensal_Pagamentos').filter(x => String(x.ID_Cliente) === String(c.ID) && x.Status === 'Informado').map(x => ({ Referencia: x.Referencia, Valor: num_(x.Valor), DataHora: x.DataHora })),
    pix: { chave: String(pix.pix || ''), titular: String(pix.titular || ''), banco: String(pix.banco || '') },
    agora: nowIso_()
  };
}

function agendarMensalista_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Servidor ocupado, tente novamente.');
  try {
    const c = mensalistaDoLink_(p.c);
    const conta = limite_('mens_ag_' + c.ID, 6, 'Muitas tentativas em pouco tempo. Tente mais tarde ou chame a barbearia no WhatsApp.');
    const b = findById_('Usuarios', p.barbeiro);
    if (!b || b.Nivel !== 'Barbeiro' || b.Status === 'Inativo') throw new Error('Escolha o barbeiro.');
    const serv = (configGet_('servicos', DEFAULT_SERVICOS) || []).find(x => x.nome === p.servico);
    if (!serv) throw new Error('Escolha o serviço.');
    const dh = String(p.dataHora || '');
    if (!horaValida_(dh)) throw new Error('Escolha o dia e o horário.');
    const dur = num_(serv.duracao) || 30;
    const h = horarioBarb_();
    const hm = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const dia = new Date(dh.slice(0, 10) + 'T12:00:00').getDay();
    if (h.dias.indexOf(dia) < 0 || hm(dh.slice(11)) < hm(h.inicio) || hm(dh.slice(11)) + dur > hm(h.fim)) throw new Error('Horário fora do atendimento da barbearia.');
    const ate = minutosEntre_(nowIso_(), dh);
    if (ate < BARB_REGRAS.antecedenciaMin) throw new Error('Escolha um horário com pelo menos ' + BARB_REGRAS.antecedenciaMin + ' minutos de antecedência.');
    if (ate > BARB_REGRAS.diasMax * 1440) throw new Error('Dá para marcar até ' + BARB_REGRAS.diasMax + ' dias à frente.');
    const agenda = readTable_('Agenda_Barbearia');
    const abertos = agenda.filter(a => String(a.ID_Cliente) === String(c.ID) && a.Status === 'Agendado' && String(a.DataHora).slice(0, 16) >= nowIso_());
    if (abertos.length >= BARB_REGRAS.maxAbertos) throw new Error('Você já tem ' + abertos.length + ' horário(s) marcado(s). Desmarque um para marcar outro.');
    const conflito = ocupadosBarb_(b.ID, agenda).some(o => { const a = minutosEntre_(dh, o.ini); return a < dur && -a < o.min; });
    if (conflito) throw new Error('Este horário acabou de ser ocupado. Escolha outro.');
    const row = upsert_('Agenda_Barbearia', {
      ID: newId_('AB'), DataHora: dh, ID_Cliente: c.ID, Nome_Cliente: c.Nome, ID_Barbeiro: b.ID, Servico: serv.nome,
      Valor: num_(serv.preco), Comissao_Valor: comissaoServico_(serv.nome, serv.preco), Status: 'Agendado',
      Mensalista: 'Sim', Origem: 'Link', Duracao_Min: dur, Criado_Por: 'CLIENTE'
    });
    conta();
    return { id: row.ID, barbeiro: b.Nome, dataHora: dh, servico: serv.nome };
  } finally {
    lock.releaseLock();
  }
}

function cancelarMensalista_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Servidor ocupado, tente novamente.');
  try {
    const c = mensalistaDoLink_(p.c);
    const a = findById_('Agenda_Barbearia', p.id);
    if (!a || String(a.ID_Cliente) !== String(c.ID) || a.Status !== 'Agendado') throw new Error('Horário não encontrado.');
    if (minutosEntre_(nowIso_(), String(a.DataHora).slice(0, 16)) < BARB_REGRAS.cancelarMin) throw new Error('Falta menos de 1 hora: para desmarcar, chame a barbearia no WhatsApp.');
    upsert_('Agenda_Barbearia', { ID: a.ID, Status: 'Cancelado' });
    return { id: a.ID };
  } finally {
    lock.releaseLock();
  }
}

/** O mensalista paga por Pix e envia o comprovante; o balcão confere e dá baixa. */
function pagarMensalista_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Servidor ocupado, tente novamente.');
  try {
    const c = mensalistaDoLink_(p.c);
    const conta = limite_('mens_pg_' + c.ID, 3, 'Muitos envios em pouco tempo. Tente mais tarde ou chame a barbearia no WhatsApp.');
    const ref = /^\d{4}-\d{2}$/.test(String(p.referencia || '')) ? String(p.referencia) : today_().slice(0, 7);
    const ja = readTable_('Mensal_Pagamentos').find(x => String(x.ID_Cliente) === String(c.ID) && x.Referencia === ref && x.Status === 'Informado');
    if (ja) throw new Error('O comprovante deste mês já foi enviado. A barbearia vai conferir.');
    const arq = salvarComprovante_(p.comprovante, 'mensalidade-' + ref + '-' + String(c.Nome).replace(/[^\wÀ-ú]+/g, '-').slice(0, 40));
    const row = upsert_('Mensal_Pagamentos', {
      ID: newId_('MP'), DataHora: nowIso_(), ID_Cliente: c.ID, Nome_Cliente: c.Nome, Referencia: ref,
      Valor: round2_(num_(c.Valor_Mensalidade)), Comprovante: arq, Status: 'Informado'
    });
    conta();
    return { id: row.ID, referencia: ref, valor: num_(row.Valor) };
  } finally {
    lock.releaseLock();
  }
}

/** Balcão confere o comprovante: confirma (lança a mensalidade) ou recusa. */
function conferirPagamentoMensal_(p, u) {
  const pg = findById_('Mensal_Pagamentos', p.id);
  if (!pg) throw new Error('Pagamento não encontrado.');
  if (pg.Status !== 'Informado') throw new Error('Este pagamento já foi conferido.');
  const changes = {};
  const upd = { ID: pg.ID, Conferido_Por: u.ID, Conferido_Em: nowIso_() };
  if (p.aprovar) {
    const valor = num_(p.valor) > 0 ? round2_(num_(p.valor)) : num_(pg.Valor);
    const rec = registrarRecebimento_({ row: {
      ID: newId_('RC'), DataHora: nowIso_(), Tipo: 'Mensalidade', ID_Cliente: pg.ID_Cliente, Nome_Cliente: pg.Nome_Cliente,
      Atividade: 'Barbearia', Valor: valor, Forma_Pagamento: 'Pix', Referencia: pg.Referencia
    } }, u);
    Object.assign(changes, rec.changes);
    Object.assign(upd, { Status: 'Confirmado', Valor: valor, ID_Recebimento: rec.result.row.ID });
  } else {
    Object.assign(upd, { Status: 'Recusado', Obs: String(p.motivo || '').slice(0, 300) });
  }
  changes.Mensal_Pagamentos = [upsert_('Mensal_Pagamentos', upd)];
  return { result: { row: changes.Mensal_Pagamentos[0] }, changes: changes };
}

/** Abre o comprovante enviado pelo cliente (só para quem pode ver a sessão). */
function verComprovante_(p, u) {
  const mens = p.tabela === 'Mensal_Pagamentos';
  if (mens) requireLevel_(u, ['Master', 'Caixa']);
  const pg = findById_(mens ? 'Mensal_Pagamentos' : 'Tattoo_Pagamentos', p.id);
  if (!pg || !pg.Comprovante) throw new Error('Este pagamento não tem comprovante.');
  if (!mens) sessaoPermitida_(pg.ID_Sessao, u);
  const blob = DriveApp.getFileById(pg.Comprovante).getBlob();
  return { result: { nome: blob.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) }, changes: {} };
}

/* ---------- Restauração de backup (arquivo do computador ou do celular) ---------- */
/** Mescla as linhas do backup na planilha: atualiza o que existe e inclui o que falta. Nada é apagado. */
function restaurarBackup_(p) {
  const src = p.tables || {};
  const resumo = {};
  Object.keys(src).forEach(t => {
    if (!SCHEMA[t] || !Array.isArray(src[t]) || !src[t].length) return;
    resumo[t] = mesclarLinhas_(t, src[t]);
  });
  return { result: { resumo: resumo }, changes: {} };
}

function mesclarLinhas_(name, rows) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const key = keyOf_(name);
  let novos = 0, atualizados = 0;
  if (!key) {
    const sig = r => [r.ID_Venda, r.ID_Produto, num_(r.Qtd), num_(r.Preco_Venda_Unit)].join('|');
    const tem = {};
    values.slice(1).forEach(v => { tem[sig(rowObj_(headers, v))] = true; });
    const add = rows.filter(r => r && !tem[sig(r)]).map(r => headers.map(h => cellIn_(r[h])));
    if (add.length) {
      const rg = sh.getRange(values.length + 1, 1, add.length, headers.length);
      rg.setNumberFormat('@'); rg.setValues(add);
    }
    return { novos: add.length, atualizados: 0 };
  }
  const ki = headers.indexOf(key);
  const idx = {};
  values.forEach((v, i) => { if (i) idx[String(v[ki])] = i; });
  rows.forEach(r0 => {
    if (!r0) return;
    const r = Object.assign({}, r0);
    const id = String(r[key] === undefined ? '' : r[key]);
    if (!id) return;
    if (name === 'Usuarios') delete r.PIN_Acesso; // PIN nunca vem do arquivo
    if (idx[id] !== undefined) {
      const linha = values[idx[id]];
      headers.forEach((h, j) => { if (Object.prototype.hasOwnProperty.call(r, h) && r[h] !== undefined) linha[j] = cellIn_(r[h]); });
      atualizados++;
    } else {
      if (name === 'Usuarios') r.Status = 'Inativo'; // usuário recriado sem PIN: o Master define o PIN e ativa
      values.push(headers.map(h => cellIn_(r[h])));
      idx[id] = values.length - 1;
      novos++;
    }
  });
  const rg = sh.getRange(1, 1, values.length, headers.length);
  rg.setNumberFormat('@');
  rg.setValues(values);
  return { novos: novos, atualizados: atualizados };
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
  // Produtos do estúdio de tatuagem são do tatuador: não entram no faturamento do Master
  readTable_('Vendas_PDV').filter(v => inR(v.DataHora) && v.Atividade !== 'Tatuagem').forEach(v => { add(v.Atividade, 'bruto', num_(v.Total_Venda)); add(v.Atividade, 'custo', num_(v.Preco_Custo_Total)); });
  // Corte de mensalista já entrou na mensalidade: conta só a comissão do barbeiro
  readTable_('Agenda_Barbearia').filter(a => a.Status === 'Concluido' && inR(a.DataHora)).forEach(a => { if (a.Mensalista !== 'Sim') add('Barbearia', 'bruto', num_(a.Valor)); add('Barbearia', 'comissoes', num_(a.Comissao_Valor)); });
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
