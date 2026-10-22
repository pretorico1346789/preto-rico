/* =====================================================================
 *  PRETO RICO — Página pública de agendamento de tatuagem
 *  O cliente abre o link que o tatuador, o atendente ou o Master mandou
 *  (agendar.html?t=ID_DO_TATUADOR), escolhe o tipo, o dia e um horário
 *  livre, paga a entrada por Pix e envia o comprovante. O pedido entra na
 *  agenda como "Pedido pelo link" para o estúdio conferir e confirmar.
 *  Não usa login e não vê nada de outros clientes: o servidor só devolve
 *  os horários ocupados.
 * ===================================================================== */
(() => {
  const SRV = window.PRETO_RICO_SERVIDOR || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? pad(r) : ''}` : `${r} min`; };
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const fmtDia = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); };
  const fill = (t, d) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => d[k] ?? '');
  const tatId = new URLSearchParams(location.search).get('t') || '';

  const S = { step: 0, info: null, tipo: null, dia: '', hora: '', menor: false, dados: { nome: '', telefone: '', responsavel: '', ideia: '' }, arquivo: null, aceite: false, enviando: false };
  const STEPS = ['Tipo', 'Dia e hora', 'Seus dados', 'Entrada', 'Avisos'];

  async function post(action, payload) {
    if (!SRV.url) throw new Error('O agendamento online não está disponível.');
    const r = await fetch(SRV.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload, k: SRV.k }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Erro no servidor.');
    return j.data;
  }

  /** Horários livres de um dia: dentro do atendimento, sem sobrepor sessões e com 2 h de antecedência. */
  function slotsDoDia(dia) {
    const h = S.info.horario, dur = S.tipo.duracao;
    const ini = toMin(h.inicio), fim = toMin(h.fim);
    const agora = new Date(S.info.agora.replace(' ', 'T') + ':00');
    const ocup = S.info.ocupados.filter(o => o.ini.slice(0, 10) === dia).map(o => [toMin(o.ini.slice(11)), toMin(o.ini.slice(11)) + o.min]);
    const out = [];
    for (let t = ini; t + dur <= fim; t += 30) {
      const quando = new Date(`${dia}T${pad(Math.floor(t / 60))}:${pad(t % 60)}:00`);
      if (quando - agora < 2 * 3600e3) continue;
      if (ocup.some(([a, b]) => t < b && a < t + dur)) continue;
      out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
    }
    return out;
  }
  function proximosDias(n = 45) {
    const base = new Date(S.info.agora.slice(0, 10) + 'T12:00:00');
    return Array.from({ length: n }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return d; })
      .filter(d => S.info.horario.dias.map(Number).includes(d.getDay())).map(isoDate);
  }
  const entrada = () => Math.round(S.tipo.preco * S.info.entradaPct) / 100;
  const avisos = () => {
    const t = S.info.textos, d = { entrada: S.info.entradaPct, nome: S.dados.nome.split(' ')[0] };
    return [['🧼 Condições sanitárias', fill(t.sanitario, d)], ...(S.menor ? [['🧒 Menor de idade', fill(t.menor, d)]] : []), ['📅 Falta e desmarcação', fill(t.falta, d)], ['🩹 Depois da tatuagem', fill(t.cuidados, d)]];
  };

  /** Reduz fotos grandes antes de enviar (comprovantes ficam legíveis com 1600 px). */
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

  function erro(msg) { const e = $('#ag-erro'); if (e) { e.textContent = msg; e.hidden = !msg; } }
  function nav(podeVoltar, labelNext = 'Continuar ›', habil = true) {
    return `<div class="alert danger" id="ag-erro" hidden></div>
      <div class="ag-nav">${podeVoltar ? '<button type="button" class="btn ghost big" data-go="back">‹ Voltar</button>' : ''}
      <button type="button" class="btn primary big" data-go="next" ${habil ? '' : 'disabled'}>${labelNext}</button></div>`;
  }

  function render() {
    $('#ag-steps').innerHTML = STEPS.map((_, i) => `<i class="${i <= S.step ? 'on' : ''}"></i>`).join('');
    const el = $('#ag-app');
    const i = S.info;
    if (S.step === 0) {
      el.innerHTML = `<div class="card"><h2>1. Qual tatuagem você quer fazer?</h2>
        ${i.tipos.map((t, k) => `<button type="button" class="ag-opt ${S.tipo === t ? 'sel' : ''}" data-tipo="${k}"><b>${esc(t.nome)}</b>
          <small>${t.preco ? 'A partir de ' + money(t.preco) : 'Valor a combinar'} · cerca de ${fmtDur(t.duracao)}${t.preco ? ` · entrada de ${money(Math.round(t.preco * i.entradaPct) / 100)} (${i.entradaPct}%)` : ''}</small></button>`).join('')}
        ${nav(false, 'Continuar ›', !!S.tipo)}</div>`;
    } else if (S.step === 1) {
      const dias = proximosDias();
      if (!S.dia) S.dia = dias.find(d => slotsDoDia(d).length) || '';
      const slots = S.dia ? slotsDoDia(S.dia) : [];
      el.innerHTML = `<div class="card"><h2>2. Escolha o dia e o horário</h2>
        <p class="muted small">${esc(S.tipo.nome)} · cerca de ${fmtDur(S.tipo.duracao)}</p>
        <div class="ag-days">${dias.map(d => { const n = slotsDoDia(d).length; const [y, m, dd] = d.split('-').map(Number); const dt = new Date(y, m - 1, dd);
          return `<button type="button" class="ag-day ${S.dia === d ? 'sel' : ''}" data-dia="${d}" ${n ? '' : 'disabled'}><small>${dt.toLocaleDateString('pt-BR', { weekday: 'short' })}</small><br><b>${pad(dd)}/${pad(m)}</b></button>`; }).join('')}</div>
        ${S.dia ? `<p style="margin-top:.8rem"><b>${esc(fmtDia(S.dia))}</b></p>
          <div class="ag-slots">${slots.map(h => `<button type="button" class="ag-slot ${S.hora === h ? 'sel' : ''}" data-hora="${h}">${h}</button>`).join('') || '<p class="muted">Sem horário livre neste dia.</p>'}</div>` : '<p class="muted">Sem horários livres nos próximos dias. Chame o estúdio no WhatsApp.</p>'}
        ${nav(true, 'Continuar ›', !!S.hora)}</div>`;
    } else if (S.step === 2) {
      const d = S.dados;
      el.innerHTML = `<div class="card"><h2>3. Seus dados</h2><div class="form-grid">
        <div class="field full"><label for="f-nome">Nome completo *</label><input id="f-nome" value="${esc(d.nome)}" autocomplete="name"></div>
        <div class="field full"><label for="f-tel">WhatsApp com DDD *</label><input id="f-tel" value="${esc(d.telefone)}" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999"></div>
        <div class="field full"><label>Você tem menos de 18 anos?</label><div class="choice-grid" style="grid-template-columns:1fr 1fr">
          <button type="button" class="choice ${!S.menor ? 'sel' : ''}" data-menor="0">Não</button><button type="button" class="choice ${S.menor ? 'sel' : ''}" data-menor="1">Sim</button></div></div>
        ${S.menor ? `<div class="field full"><label for="f-resp">Nome do pai, da mãe ou do responsável *</label><input id="f-resp" value="${esc(d.responsavel)}"></div>
          <div class="alert warn full"><span class="ic">🧒</span><div>${esc(fill(i.textos.menor, { entrada: i.entradaPct }))}</div></div>` : ''}
        <div class="field full"><label for="f-ideia">Conte sua ideia (local do corpo, tamanho, estilo)</label><textarea id="f-ideia" rows="3">${esc(d.ideia)}</textarea></div>
      </div>${nav(true)}</div>`;
    } else if (S.step === 3) {
      el.innerHTML = `<div class="card"><h2>4. Pague a entrada de ${i.entradaPct}% e envie o comprovante</h2>
        <p>Valor da entrada: <b style="font-size:1.3rem" class="t-gold">${money(entrada())}</b>${S.tipo.preco ? ` <small class="muted">(${i.entradaPct}% de ${money(S.tipo.preco)})</small>` : ''}</p>
        ${i.pix ? `<p class="muted small">Chave Pix${i.titular ? ` de <b>${esc(i.titular)}</b>` : ''}${i.banco ? ` · ${esc(i.banco)}` : ''}:</p>
          <div class="ag-pix" id="ag-pix">${esc(i.pix)}</div>
          <button type="button" class="btn" style="margin-top:.5rem" data-copiar="1">📋 Copiar chave Pix</button>` : '<div class="alert warn"><span class="ic">⚠️</span><div>Peça a chave Pix ao estúdio pelo WhatsApp.</div></div>'}
        <p style="margin-top:1rem"><b>Depois de pagar, envie a foto ou o PDF do comprovante:</b></p>
        <label class="ag-file ${S.arquivo ? 'ok' : ''}">${S.arquivo ? '✅ ' + esc(S.arquivo.nome) + '<br><small>Toque para trocar</small>' : '📎 Toque para escolher o comprovante'}
          <input type="file" id="f-comp" accept="image/*,application/pdf" hidden></label>
        ${nav(true, 'Continuar ›', !!S.arquivo)}</div>`;
    } else if (S.step === 4) {
      el.innerHTML = `<div class="card"><h2>5. Leia os avisos e confirme</h2>
        ${avisos().map(([t, x]) => `<div class="ag-aviso"><b>${t}</b><br>${esc(x)}</div>`).join('')}
        <div class="ag-resumo card" style="margin-top:.8rem"><b>Resumo do pedido</b><br>
          ${esc(S.tipo.nome)} com ${esc(i.tatuador.Nome)}<br>${esc(fmtDia(S.dia))} às <b>${S.hora}</b><br>
          Entrada: <b>${money(entrada())}</b> (comprovante anexado)</div>
        <label class="check" style="font-size:1.05rem;margin-top:.6rem"><input type="checkbox" id="f-aceite" ${S.aceite ? 'checked' : ''}> Li e concordo com os avisos acima</label>
        ${nav(true, S.enviando ? 'Enviando...' : '✔ Enviar pedido', S.aceite && !S.enviando)}</div>`;
    } else {
      el.innerHTML = `<div class="card" style="text-align:center"><div style="font-size:3rem">✅</div><h2>Pedido enviado!</h2>
        <p>${esc(i.tatuador.Nome)} vai conferir o comprovante e confirmar o seu horário pelo WhatsApp.</p>
        <p class="ag-resumo"><b>${esc(fmtDia(S.dia))} às ${S.hora}</b><br>${esc(S.tipo.nome)}</p>
        <p class="muted small">Lembre-se: para desmarcar sem perder a entrada, avise com pelo menos 24 horas de antecedência.</p></div>`;
    }
  }

  function guardarDados() {
    if (S.step !== 2) return;
    S.dados.nome = $('#f-nome').value.trim(); S.dados.telefone = $('#f-tel').value.trim();
    S.dados.ideia = $('#f-ideia').value.trim(); if ($('#f-resp')) S.dados.responsavel = $('#f-resp').value.trim();
  }

  async function avancar() {
    erro('');
    if (S.step === 2) {
      guardarDados();
      if (S.dados.nome.length < 3) return erro('Informe o seu nome completo.');
      const tel = S.dados.telefone.replace(/\D/g, '');
      if (tel.length < 10 || tel.length > 13) return erro('Informe um WhatsApp válido com DDD.');
      if (S.menor && S.dados.responsavel.length < 3) return erro('Informe o nome do responsável.');
    }
    if (S.step === 4) {
      S.enviando = true; render();
      try {
        await post('solicitarAgendamento', { t: tatId, tipo: S.tipo.nome, dataHora: `${S.dia}T${S.hora}`, nome: S.dados.nome, telefone: S.dados.telefone,
          menor: S.menor, responsavel: S.dados.responsavel, ideia: S.dados.ideia, aceite: S.aceite, comprovante: S.arquivo });
        S.step = 5; S.enviando = false; render(); return;
      } catch (e) {
        S.enviando = false; render(); erro(e.message);
        if (/ocupado|Escolha outro/.test(e.message)) { try { S.info = await post('agendaPublica', { t: tatId }); } catch (x) { /* mantém */ } }
        return;
      }
    }
    S.step++; render(); window.scrollTo(0, 0);
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tipo) { S.tipo = S.info.tipos[Number(b.dataset.tipo)]; S.dia = ''; S.hora = ''; render(); }
    else if (b.dataset.dia) { S.dia = b.dataset.dia; S.hora = ''; render(); }
    else if (b.dataset.hora) { S.hora = b.dataset.hora; render(); }
    else if (b.dataset.menor) { guardarDados(); S.menor = b.dataset.menor === '1'; render(); }
    else if (b.dataset.copiar) { try { await navigator.clipboard.writeText(S.info.pix); b.textContent = '✔ Chave copiada'; } catch (x) { const r = document.createRange(); r.selectNode($('#ag-pix')); getSelection().removeAllRanges(); getSelection().addRange(r); } }
    else if (b.dataset.go === 'back') { guardarDados(); S.step--; render(); }
    else if (b.dataset.go === 'next') avancar();
  });
  document.addEventListener('change', async e => {
    if (e.target.id === 'f-aceite') { S.aceite = e.target.checked; render(); }
    if (e.target.id === 'f-comp' && e.target.files[0]) {
      try { S.arquivo = await lerArquivo(e.target.files[0]); render(); } catch (x) { erro(x.message); }
    }
  });

  (async () => {
    if (!tatId) { $('#ag-app').innerHTML = '<div class="card"><p>Link incompleto. Peça um novo link ao estúdio.</p></div>'; return; }
    try {
      S.info = await post('agendaPublica', { t: tatId });
      $('#ag-sub').textContent = `${S.info.tatuador.Nome} · ${S.info.empresa.nome}`;
      if (!S.info.tipos.length) throw new Error('O estúdio ainda não cadastrou os tipos de tatuagem.');
      render();
    } catch (e) { $('#ag-app').innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; }
  })();
})();
