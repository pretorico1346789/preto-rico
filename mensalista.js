/* =====================================================================
 *  PRETO RICO — Área do mensalista da barbearia (página pública)
 *  O mensalista abre o link pessoal que a barbearia mandou no WhatsApp
 *  (mensalista.html?c=CÓDIGO). Nele ele:
 *   - escolhe o barbeiro e o serviço e vê, dia a dia, os horários vagos
 *     e os ocupados da agenda daquele barbeiro;
 *   - marca ou desmarca o próprio horário;
 *   - paga a mensalidade por Pix (dados cadastrados pelo Master) e envia o
 *     comprovante para o balcão conferir.
 *  Não usa login e não mostra nada de outros clientes: o servidor só
 *  devolve os horários ocupados, sem nomes.
 * ===================================================================== */
(() => {
  const SRV = window.PRETO_RICO_SERVIDOR || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const hhmm = t => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
  const fmtDia = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); };
  const fmtMes = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
  const code = new URLSearchParams(location.search).get('c') || '';
  const ST_LABEL = { 'Em dia': ['Em dia', 'ok'], Pendente: ['A vencer', 'warn'], Atrasado: ['Atrasada', 'danger'] };
  const PASSO = 30; // intervalo entre os horários mostrados (min)

  const S = { tela: 'inicio', info: null, barb: null, serv: null, dia: '', hora: '', arquivo: null, enviando: false, feito: null };

  async function post(action, payload) {
    if (!SRV.url) throw new Error('A área do mensalista não está disponível agora.');
    const r = await fetch(SRV.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload: { c: code, ...payload }, k: SRV.k }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Erro no servidor.');
    return j.data;
  }
  const carregar = async () => { S.info = await post('areaMensalista', {}); };
  const agora = () => new Date(S.info.agora + ':00');

  /** Todos os horários do dia para o barbeiro escolhido: vago (pode marcar) ou ocupado. */
  function slotsDoDia(dia) {
    const h = S.info.horario, dur = S.serv.duracao, R = S.info.regras;
    const ocup = (S.info.ocupados[S.barb.ID] || []).filter(o => o.ini.slice(0, 10) === dia).map(o => [toMin(o.ini.slice(11)), toMin(o.ini.slice(11)) + o.min]);
    const out = [];
    for (let t = toMin(h.inicio); t + dur <= toMin(h.fim); t += PASSO) {
      const quando = new Date(`${dia}T${hhmm(t)}:00`);
      if (quando - agora() < R.antecedenciaMin * 60e3) continue; // já passou ou está em cima da hora
      out.push({ hora: hhmm(t), livre: !ocup.some(([a, b]) => t < b && a < t + dur) });
    }
    return out;
  }
  function proximosDias() {
    const base = new Date(S.info.agora.slice(0, 10) + 'T12:00:00');
    return Array.from({ length: S.info.regras.diasMax + 1 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; })
      .filter(d => S.info.horario.dias.map(Number).includes(d.getDay())).map(isoDate);
  }
  /** Mês da mensalidade a pagar: o atual, ou o próximo se o atual já estiver pago. */
  const mesAPagar = () => {
    const hoje = S.info.agora.slice(0, 7);
    if (S.info.cliente.Ultimo.slice(0, 7) < hoje) return hoje;
    const [y, m] = hoje.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  };

  function lerArquivo(file) {
    return new Promise((res, rej) => {
      if (file.type === 'application/pdf') {
        if (file.size > 4 * 1024 * 1024) return rej(new Error('PDF muito grande (máximo 4 MB).'));
        const fr = new FileReader(); fr.onload = () => res({ nome: file.name, mime: file.type, base64: String(fr.result).split(',')[1] }); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); return;
      }
      if (!/^image\//.test(file.type)) return rej(new Error('Envie uma foto ou um PDF do comprovante.'));
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        res({ nome: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      };
      img.onerror = () => rej(new Error('Não foi possível ler a foto. Tente outra.'));
      img.src = URL.createObjectURL(file);
    });
  }

  const erroBox = '<div class="alert danger" id="ag-erro" hidden></div>';
  function erro(msg) { const e = $('#ag-erro'); if (e) { e.textContent = msg; e.hidden = !msg; } }
  const voltar = (para = 'inicio') => `<button type="button" class="btn ghost big" data-tela="${para}">‹ Voltar</button>`;
  const badge = (t, tone) => `<span class="badge badge-${tone}">${esc(t)}</span>`;

  function render() {
    const el = $('#ag-app'), i = S.info, c = i.cliente;
    if (S.tela === 'inicio') {
      const [stl, stt] = ST_LABEL[c.status] || [c.status, 'muted'];
      const enviado = i.enviados.length;
      el.innerHTML = `${S.feito ? `<div class="alert ok"><span class="ic">✅</span><div>${S.feito}</div></div>` : ''}
        <div class="card"><div class="mn-st"><div><b>Mensalidade ${money(c.Valor)}</b><br><small class="muted">Vence todo dia ${c.Dia}</small></div>
          <div>${enviado ? badge('Pix enviado, aguardando conferência', 'info') : badge(stl, stt)}</div></div></div>
        <div class="mn-big">
          <button type="button" class="btn primary big" data-tela="barbeiro"><span>📅</span>Marcar horário</button>
          <button type="button" class="btn big" data-tela="pagar"><span>💳</span>Pagar mensalidade</button>
        </div>
        <div class="card"><h2>Seus próximos horários</h2>
          <div class="mn-list">${i.proximos.map(a => `<div><span><b>${esc(fmtDia(a.DataHora))}</b> às <b>${a.DataHora.slice(11)}</b><br><small class="muted">${esc(a.Servico)} com ${esc(a.Barbeiro)}</small></span>
            <button type="button" class="btn small danger-ghost" data-desmarcar="${esc(a.ID)}">Desmarcar</button></div>`).join('') || '<p class="muted">Nenhum horário marcado.</p>'}</div>
          ${erroBox}</div>
        ${i.ultimos.length ? `<div class="card"><h2>Seus últimos cortes</h2><div class="mn-list">${i.ultimos.map(a => `<div><span>${esc(fmtDia(a.DataHora))}<br><small class="muted">${esc(a.Servico)} com ${esc(a.Barbeiro)}</small></span></div>`).join('')}</div></div>` : ''}`;
    } else if (S.tela === 'barbeiro') {
      el.innerHTML = `<div class="card"><h2>1. Com qual barbeiro?</h2>
        ${i.barbeiros.map((b, k) => `<button type="button" class="ag-opt ${S.barb === b ? 'sel' : ''}" data-barb="${k}"><b>💈 ${esc(b.Nome)}</b></button>`).join('') || '<p class="muted">Nenhum barbeiro disponível agora.</p>'}
        <div class="ag-nav">${voltar()}</div></div>`;
    } else if (S.tela === 'servico') {
      el.innerHTML = `<div class="card"><h2>2. Qual serviço?</h2><p class="muted small">Com ${esc(S.barb.Nome)}</p>
        ${i.servicos.map((s, k) => `<button type="button" class="ag-opt ${S.serv === s ? 'sel' : ''}" data-serv="${k}"><b>${esc(s.nome)}</b><small>cerca de ${s.duracao} min</small></button>`).join('')}
        <div class="ag-nav">${voltar('barbeiro')}</div></div>`;
    } else if (S.tela === 'dia') {
      const dias = proximosDias();
      if (!S.dia) S.dia = dias.find(d => slotsDoDia(d).some(x => x.livre)) || dias[0] || '';
      const slots = S.dia ? slotsDoDia(S.dia) : [];
      el.innerHTML = `<div class="card"><h2>3. Escolha o dia e o horário</h2>
        <p class="muted small">${esc(S.serv.nome)} com ${esc(S.barb.Nome)}</p>
        <div class="ag-days">${dias.map(d => { const n = slotsDoDia(d).filter(x => x.livre).length; const [, m, dd] = d.split('-').map(Number); const dt = new Date(d + 'T12:00:00');
          return `<button type="button" class="ag-day ${S.dia === d ? 'sel' : ''} ${n ? '' : 'lotado'}" data-dia="${d}"><small>${dt.toLocaleDateString('pt-BR', { weekday: 'short' })}</small><br><b>${pad(dd)}/${pad(m)}</b><small class="n">${n ? n + ' vago' + (n > 1 ? 's' : '') : 'lotado'}</small></button>`; }).join('')}</div>
        ${S.dia ? `<p style="margin-top:.8rem"><b>${esc(fmtDia(S.dia))}</b></p>
          <div class="legenda"><span>🟡 vago: toque para marcar</span><span class="muted">▫️ riscado: ocupado</span></div>
          <div class="ag-slots">${slots.map(x => x.livre
            ? `<button type="button" class="ag-slot ${S.hora === x.hora ? 'sel' : ''}" data-hora="${x.hora}">${x.hora}<small>vago</small></button>`
            : `<button type="button" class="ag-slot ocup" disabled>${x.hora}<small>ocupado</small></button>`).join('') || '<p class="muted">Sem horários neste dia.</p>'}</div>` : '<p class="muted">A barbearia não tem dias de atendimento cadastrados. Chame no WhatsApp.</p>'}
        ${erroBox}<div class="ag-nav">${voltar('servico')}<button type="button" class="btn primary big" data-marcar="1" ${S.hora && !S.enviando ? '' : 'disabled'}>${S.enviando ? 'Marcando...' : '✔ Marcar horário'}</button></div></div>`;
    } else if (S.tela === 'pagar') {
      const ref = mesAPagar();
      el.innerHTML = `<div class="card"><h2>💳 Pagar a mensalidade de ${esc(fmtMes(ref))}</h2>
        <p>Valor: <b style="font-size:1.3rem" class="t-gold">${money(c.Valor)}</b></p>
        ${i.pix.chave ? `<p class="muted small">1. Faça um Pix para a chave${i.pix.titular ? ` de <b>${esc(i.pix.titular)}</b>` : ''}${i.pix.banco ? ` · ${esc(i.pix.banco)}` : ''}:</p>
          <div class="ag-pix" id="ag-pix">${esc(i.pix.chave)}</div>
          <button type="button" class="btn" style="margin-top:.5rem" data-copiar="1">📋 Copiar chave Pix</button>
          <p style="margin-top:1rem"><b>2. Depois de pagar, envie a foto ou o PDF do comprovante:</b></p>
          <label class="ag-file ${S.arquivo ? 'ok' : ''}">${S.arquivo ? '✅ ' + esc(S.arquivo.nome) + '<br><small>Toque para trocar</small>' : '📎 Toque para escolher o comprovante'}
            <input type="file" id="f-comp" accept="image/*,application/pdf" hidden></label>`
          : '<div class="alert warn"><span class="ic">⚠️</span><div>A barbearia ainda não cadastrou a chave Pix. Pague no balcão ou chame no WhatsApp.</div></div>'}
        ${erroBox}<div class="ag-nav">${voltar()}${i.pix.chave ? `<button type="button" class="btn primary big" data-pagar="1" ${S.arquivo && !S.enviando ? '' : 'disabled'}>${S.enviando ? 'Enviando...' : '✔ Enviar comprovante'}</button>` : ''}</div></div>`;
    }
  }

  async function acao(fn, okMsg) {
    S.enviando = true; render(); erro('');
    try {
      const r = await fn();
      await carregar();
      S.enviando = false; S.feito = okMsg(r); S.tela = 'inicio'; S.hora = ''; S.dia = ''; S.arquivo = null; render(); window.scrollTo(0, 0);
    } catch (e) {
      S.enviando = false;
      if (/ocupado|Escolha outro/.test(e.message)) { try { await carregar(); S.hora = ''; } catch (x) { /* mantém */ } }
      render(); erro(e.message);
    }
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.tela) { S.tela = d.tela; S.feito = null; if (d.tela === 'barbeiro') { S.dia = ''; S.hora = ''; } render(); window.scrollTo(0, 0); }
    else if (d.barb) { S.barb = S.info.barbeiros[Number(d.barb)]; S.tela = 'servico'; render(); }
    else if (d.serv) { S.serv = S.info.servicos[Number(d.serv)]; S.dia = ''; S.hora = ''; S.tela = 'dia'; render(); }
    else if (d.dia) { S.dia = d.dia; S.hora = ''; render(); }
    else if (d.hora) { S.hora = d.hora; render(); }
    else if (d.marcar) acao(() => post('agendarMensalista', { barbeiro: S.barb.ID, servico: S.serv.nome, dataHora: `${S.dia}T${S.hora}` }),
      r => `Horário marcado: <b>${esc(fmtDia(r.dataHora))} às ${r.dataHora.slice(11)}</b> com ${esc(r.barbeiro)} (${esc(r.servico)}). Se não puder ir, desmarque aqui com pelo menos 1 hora de antecedência.`);
    else if (d.desmarcar) {
      if (!confirm('Desmarcar este horário?')) return;
      acao(() => post('cancelarMensalista', { id: d.desmarcar }), () => 'Horário desmarcado.');
    }
    else if (d.pagar) acao(() => post('pagarMensalista', { referencia: mesAPagar(), comprovante: S.arquivo }),
      r => `Comprovante enviado! A barbearia vai conferir o Pix de ${money(r.valor)} (${esc(fmtMes(r.referencia))}) e dar baixa.`);
    else if (d.copiar) { try { await navigator.clipboard.writeText(S.info.pix.chave); b.textContent = '✔ Chave copiada'; } catch (x) { const r = document.createRange(); r.selectNode($('#ag-pix')); getSelection().removeAllRanges(); getSelection().addRange(r); } }
  });
  document.addEventListener('change', async e => {
    if (e.target.id === 'f-comp' && e.target.files[0]) {
      try { S.arquivo = await lerArquivo(e.target.files[0]); render(); } catch (x) { erro(x.message); }
    }
  });

  (async () => {
    if (!code) { $('#ag-app').innerHTML = '<div class="card"><p>Link incompleto. Peça um novo link à barbearia.</p></div>'; return; }
    try {
      await carregar();
      $('#ag-sub').textContent = `Olá, ${S.info.cliente.Nome.split(' ')[0]}! · ${S.info.empresa.nome}`;
      render();
    } catch (e) { $('#ag-app').innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; }
  })();
})();
