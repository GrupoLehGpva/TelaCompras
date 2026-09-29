/* MESA DE COTAÇÃO LIGADA AO BANCO (etapa 4, 29/09)
   Roda mesa-cotacao.html (raiz) contra um banco de mentira que imita as funções
   de verdade: fila_do_comprador, pedido_telas, salvar_mapa, enviar_mapa,
   reprovar_na_cotacao, registrar_orcamentos, buscar_fornecedor. Todos os cliques. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : (typeof d === 'string' ? d : JSON.stringify(d))));
const URL_ = 'file://' + __dirname + '/mesa-cotacao.html';
const TOKEN = 'cp-herisson';
const dia = n => new Date(Date.now() - n * 864e5).toISOString();
const futuro = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const FORN = [
  { id:'f1', nome:'ROLAMAX', razao_social:'ROLAMAX LTDA', cidade:'Guarapuava', uf:'PR' },
  { id:'f2', nome:'CASA DO ROLAMENTO', razao_social:'CASA DO ROLAMENTO LTDA', cidade:'Guarapuava', uf:'PR' },
  { id:'f3', nome:'DISTRIBUIDORA SUL', razao_social:'DISTRIBUIDORA SUL SA', cidade:'Curitiba', uf:'PR' },
];
function banco(){
  const P = (o) => Object.assign({ versao:1, etapa_atual:'cotacao', tipo_compra:'normal', definicao_fornecedor:'cotacao', facilitador:'Ana Paula',
    unidade:'Fábrica', setor:'Ração', centro_custo:'20', centro_custo_nome:'FABRICA', empresa_nome:'EMPRESA 1', solicitante_nome:'João',
    aberto_em:dia(3), desde:dia(1), data_necessidade:futuro(10), comprador_responsavel:'HERISSON', e_meu:true, com_quem:null,
    mapa:null, anexos:[], linha:[{ acao:'criado', quem:'Ana Paula', em:dia(3) }, { acao:'aprovado', etapa:'lider', etapa_seguinte:'cotacao', quem:'Brandão', em:dia(1) }] }, o);
  return { pedidos:[
    P({ id:'u1', numero:'C2609-03001', motivo:'Rolamentos da peletizadora', itens:[
      { id:'i1', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UN', quantidade:4, fora_catalogo:false, familia:'MG' },
      { id:'i2', codigo:'1207', descricao:'RETENTOR 35X52', unidade:'UN', quantidade:2, fora_catalogo:false, familia:'MG' }] }),
    P({ id:'u2', numero:'C2609-03002', motivo:'Balança <img src=x onerror="window.__x=1">', tipo_compra:'urgente', definicao_fornecedor:'unico',
        justificativa_fornecedor:'Assistência autorizada', itens:[{ id:'i3', codigo:null, descricao:'Calibração da balança', unidade:'Serviço', quantidade:1, fora_catalogo:true, familia:'FORA' }] }),
    P({ id:'u3', numero:'C2609-03003', motivo:'Limpeza de outubro', tipo_compra:'mensal', itens:[{ id:'i4', codigo:'7360', descricao:'SABAO EM PO', unidade:'UN', quantidade:10, fora_catalogo:false, familia:'HL' }],
        devolvida:{ motivo:'Frete alto do fornecedor 2', por:'Carla Financeiro', etapa:'financeiro', em:dia(0.1) } }),
    P({ id:'u4', numero:'C2609-03004', motivo:'Enviada antes', etapa_atual:'gerencial', com_quem:'Gerente W', total:500,
        itens:[{ id:'i5', codigo:'1310', descricao:'GRAXA 1KG', unidade:'UN', quantidade:5, fora_catalogo:false, familia:'MG' }] }),
    P({ id:'u5', numero:'C2609-03005', motivo:'De outro comprador', e_meu:false, comprador_responsavel:'ADELSON',
        itens:[{ id:'i6', codigo:'1', descricao:'X', unidade:'UN', quantidade:1, fora_catalogo:false, familia:'MG' }] }),
  ], chamadas:[], storage:[] };
}
/* mapa da u3 (devolvida) e da u4 (enviada), no formato do banco */
function semear(B){
  const u3 = B.pedidos.find(p => p.id === 'u3');
  u3.mapa = { estado:'devolvida', versao:4, observacao:'Obs antiga', forn:[{ familia:'HL', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:3, condicao:'28 dias' }],
    precos:[{ item_id:'i4', coluna:1, preco:12.5 }], escolhas:[{ item_id:'i4', coluna:1 }] };
  const u4 = B.pedidos.find(p => p.id === 'u4');
  u4.mapa = { estado:'enviada', versao:3, observacao:'ok', forn:[{ familia:'MG', coluna:1, fornecedor_id:'f2', nome:'CASA DO ROLAMENTO', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista' }],
    precos:[{ item_id:'i5', coluna:1, preco:100 }], escolhas:[{ item_id:'i5', coluna:1 }] };
}
function resumo(p){
  const m = p.mapa || { forn:[], precos:[], escolhas:[] };
  const bloq = [], avis = [], fams = {};
  const unico = p.definicao_fornecedor === 'unico';
  p.itens.forEach(i => {
    const e = m.escolhas.find(x => x.item_id === i.id);
    const n = m.precos.filter(x => x.item_id === i.id).length;
    if (!e) bloq.push({ msg:'Escolha o fornecedor do item "' + i.descricao + '".' });
    else if (!m.precos.find(x => x.item_id === i.id && x.coluna === e.coluna)) bloq.push({ msg:'sem preço' });
    if (!unico && n < 3) avis.push({ tipo:'poucos_precos', msg:'"' + i.descricao + '" tem ' + n + ' preço(s); o padrão são 3.' });
    const ps = m.precos.filter(x => x.item_id === i.id).map(x => x.preco);
    const pe = e && (m.precos.find(x => x.item_id === i.id && x.coluna === e.coluna) || {}).preco;
    if (pe != null && ps.length > 1 && pe > Math.min(...ps)) avis.push({ tipo:'nao_menor', msg:'A escolha de "' + i.descricao + '" não é o menor preço.' });
  });
  let total = 0;
  [...new Set(p.itens.map(i => i.familia))].forEach(fam => {
    const fs = [];
    [1,2,3].forEach(col => {
      const f = m.forn.find(x => x.familia === fam && x.coluna === col);
      const ganhos = p.itens.filter(i => i.familia === fam && m.escolhas.find(x => x.item_id === i.id && x.coluna === col));
      const sub = ganhos.reduce((t, i) => t + ((m.precos.find(x => x.item_id === i.id && x.coluna === col) || {}).preco || 0) * i.quantidade, 0);
      const tot = ganhos.length ? Math.round((sub * (1 - ((f && f.desconto_pct) || 0) / 100) + ((f && f.frete) || 0)) * 100) / 100 : 0;
      if (ganhos.length){
        if (!f || !f.nome) bloq.push({ msg:'Falta o nome' }); else if (!f.fornecedor_id) bloq.push({ msg:'não está no cadastro' });
        if (!f || f.frete === null) bloq.push({ msg:'frete' }); if (!f || f.prazo_dias === null) bloq.push({ msg:'prazo' }); if (!f || !f.condicao) bloq.push({ msg:'condição' });
      }
      if (f || ganhos.length) fs.push(Object.assign({ coluna:col, itens_ganhos:ganhos.length, subtotal:sub, total:tot }, f ? { fornecedor_id:f.fornecedor_id, nome:f.nome, desconto_pct:f.desconto_pct, frete:f.frete, prazo_dias:f.prazo_dias, condicao:f.condicao } : {}));
      total += tot;
    });
    fams[fam] = fs;
  });
  return { total, familias:Object.keys(fams).map(k => ({ familia:k, fornecedores:fams[k] })), bloqueios:bloq, avisos:avis, pode_enviar:!bloq.length };
}
function responder(B, nome, c){
  const achar = id => B.pedidos.find(p => p.id === id);
  if (nome === 'fornecedores_ativos') return 3568;
  if (nome === 'buscar_fornecedor') return FORN.filter(f => f.nome.toLowerCase().includes(String(c.termo).toLowerCase()));
  if (c.p_token !== TOKEN) return { ok:false, erro:'token_invalido', mensagem:'Este link não vale mais.' };
  if (nome === 'fila_do_comprador') return { ok:true, comprador:'HERISSON LUCAS LAPCZAK', pedidos:B.pedidos.filter(p => ['cotacao','gerencial','financeiro'].includes(p.etapa_atual)).map(p => ({
    id:p.id, numero:p.numero, versao:p.versao, aba:p.etapa_atual !== 'cotacao' ? 'enviadas' : (p.mapa && p.mapa.estado === 'devolvida' ? 'devolvidas' : 'para_cotar'),
    tipo_compra:p.tipo_compra, urgente:p.tipo_compra === 'urgente', definicao_fornecedor:p.definicao_fornecedor, assunto:p.motivo, motivo:p.motivo,
    solicitante_nome:p.solicitante_nome, aberto_em:p.aberto_em, justificativa_fornecedor:p.justificativa_fornecedor || null, local_entrega:null,
    empresa_nome:p.empresa_nome, centro_custo:p.centro_custo, setor:p.setor, itens:p.itens, orcamentos:p.anexos.filter(a => /^Orçamento · /.test(a.nome)).length,
    data_necessidade:p.data_necessidade, facilitador:p.facilitador, unidade:p.unidade, centro_custo_nome:p.centro_custo_nome,
    comprador_responsavel:p.comprador_responsavel, e_meu:p.e_meu, total_itens:p.itens.length, etapa_atual:p.etapa_atual, com_quem:p.com_quem,
    desde:p.desde, mapa_estado:p.mapa ? p.mapa.estado : null, mapa_versao:p.mapa ? p.mapa.versao : null, total:p.total || null,
    devolucao:p.devolvida || null })) };
  const p = achar(c.p_id);
  if (!p) return { ok:false, erro:'nao_encontrado', mensagem:'Pedido não encontrado.' };
  if (nome === 'pedido_telas') return { ok:true, pedido:{ id:p.id, numero:p.numero, versao:p.versao, etapa_atual:p.etapa_atual, local_entrega:'Almoxarifado', empresa_nome:p.empresa_nome, com_quem:p.com_quem },
    itens:p.itens, anexos:p.anexos, linha_do_tempo:p.linha,
    mapa:p.mapa ? { estado:p.mapa.estado, versao:p.mapa.versao, observacao:p.mapa.observacao, resumo:resumo(p), precos:p.mapa.precos, escolhas:p.mapa.escolhas } : null };
  if (nome === 'salvar_mapa'){
    if (p.etapa_atual !== 'cotacao') return { ok:false, erro:'fora_da_cotacao', mensagem:'Este pedido não está em cotação.' };
    if ((p.mapa ? p.mapa.versao : 0) !== c.p_versao_mapa) return { ok:false, erro:'versao_mudou', mensagem:'O mapa foi salvo em outra aba.' };
    for (const f of c.p_mapa.fornecedores) if (f.fornecedor_id && !FORN.find(x => x.id === f.fornecedor_id)) return { ok:false, erro:'fornecedor_invalido', mensagem:'Fornecedor não encontrado no cadastro.' };
    const forn = c.p_mapa.fornecedores.map(f => Object.assign({}, f, { nome:f.fornecedor_id ? FORN.find(x => x.id === f.fornecedor_id).nome : f.fornecedor_nome }));
    p.mapa = { estado:p.mapa ? p.mapa.estado : 'rascunho', versao:(p.mapa ? p.mapa.versao : 0) + 1, observacao:c.p_mapa.observacao || null, forn, precos:c.p_mapa.precos, escolhas:c.p_mapa.escolhas };
    return { ok:true, versao_mapa:p.mapa.versao, estado:p.mapa.estado, resumo:resumo(p) };
  }
  if (nome === 'enviar_mapa'){
    if (!p.mapa) return { ok:false, erro:'mapa_vazio', mensagem:'Preencha e salve o mapa antes de enviar.' };
    if (p.mapa.versao !== c.p_versao_mapa) return { ok:false, erro:'versao_mudou', mensagem:'O mapa mudou.' };
    const r = resumo(p);
    if (r.bloqueios.length) return { ok:false, erro:'cotacao_incompleta', mensagem:'Falta resolver ' + r.bloqueios.length + ' ponto(s) antes de enviar.', bloqueios:r.bloqueios };
    const reenvio = p.mapa.estado === 'devolvida';
    const obs = reenvio ? (c.p_observacao || '').trim() : ((c.p_observacao || '').trim() || p.mapa.observacao);
    if ((r.avisos.some(a => a.tipo === 'nao_menor') || reenvio) && !obs) return { ok:false, erro:'observacao_obrigatoria', mensagem:'Escreva uma observação ao aprovador.' };
    const prox = p.tipo_compra === 'mensal' ? 'financeiro' : 'gerencial';
    p.etapa_atual = prox; p.total = r.total; p.com_quem = prox === 'gerencial' ? 'Gerente W' : 'Carla Financeiro';
    p.mapa.estado = 'enviada'; p.mapa.versao++; p.mapa.observacao = obs; delete p.devolvida;
    return { ok:true, etapa:prox, com_quem:p.com_quem, total:r.total, mensagem:'Cotação enviada para ' + (prox === 'gerencial' ? 'a aprovação gerencial' : 'a aprovação financeira') + ' (' + p.com_quem + ').' };
  }
  if (nome === 'reprovar_na_cotacao'){
    if (!String(c.p_motivo || '').trim()) return { ok:false, erro:'sem_motivo', mensagem:'Escreva o motivo.' };
    if (c.p_versao !== p.versao) return { ok:false, erro:'versao_mudou', mensagem:'Este pedido foi alterado, atualize a tela.' };
    p.etapa_atual = null; return { ok:true, status:'reprovado', mensagem:'Pedido reprovado. Quem pediu foi avisado com o motivo.' };
  }
  if (nome === 'registrar_orcamentos'){
    (c.p_anexos || []).forEach((a, k) => { if (a.caminho.startsWith(p.id + '/orcamento-')) p.anexos.push({ id:'an' + p.anexos.length, nome:'Orçamento · ' + a.nome, mime:a.mime, tamanho:a.tamanho }); });
    return { ok:true, gravados:(c.p_anexos || []).length, orcamentos:p.anexos.filter(a => /^Orçamento · /.test(a.nome)) };
  }
  return [];
}
async function abrir(b, qs, { vp={ width:1600, height:1000 }, prep=null, erroRpc=null }={}){
  const p = await b.newPage({ viewport:vp });
  p.B = banco(); semear(p.B); if (prep) prep(p.B);
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await p.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u.includes('/storage/v1/object/anexos/')){ p.B.storage.push(decodeURI(u.split('/object/anexos/')[1])); return r.fulfill({ status:200, contentType:'application/json', body:'{"Key":"ok"}' }); }
    if (u.includes('/rest/v1/rpc/')){
      const nome = u.split('/rpc/')[1].split('?')[0];
      let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e){}
      p.B.chamadas.push({ nome, c });
      if (erroRpc && erroRpc(nome, c, p.B)) return r.abort();
      return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(responder(p.B, nome, c)) });
    }
    return r.abort();
  });
  await p.goto(URL_ + qs); await p.waitForTimeout(700);
  return p;
}
const ch = (p, n) => p.B.chamadas.filter(x => x.nome === n);
const txt = (p, sel) => p.textContent(sel);

(async () => {
const b = await chromium.launch();

/* 1 — sem token / token inválido */
{ let p = await abrir(b, '');
  ok('1 sem token: avisa link incompleto', /link está incompleto/.test(await txt(p, '#view')));
  ok('1 sem token: não chama o banco', ch(p, 'fila_do_comprador').length === 0);
  await p.close();
  p = await abrir(b, '?t=cp-velho');
  ok('1 token inválido: avisa', /Este link não vale mais/.test(await txt(p, '#view')));
  await p.close();
  p = await abrir(b, '?t=' + TOKEN, { erroRpc:n => n === 'fila_do_comprador' });
  ok('1 sem rede: oferece tentar de novo', await p.locator('#bt-tentar').count() === 1);
  await p.close(); }

/* 2 — fila */
{ const p = await abrir(b, '?t=' + TOKEN);
  const f = ch(p, 'fila_do_comprador')[0];
  ok('2 token no corpo, não na URL', f && f.c.p_token === TOKEN);
  ok('2 nome do comprador', /HERISSON LUCAS LAPCZAK/.test(await txt(p, '#quem-nome')));
  const abas = await p.$$eval('[data-tab]', bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  ok('2 abas com contagem (outro comprador fora)', JSON.stringify(abas) === JSON.stringify(['Para cotar2', 'Devolvidas1', 'Enviadas1']), abas);
  ok('2 pedido de outro comprador não aparece', !/C2609-03005/.test(await txt(p, '#view')));
  ok('2 urgente primeiro', (await p.$$eval('table.fila tbody tr', t => t.map(x => x.dataset.id)))[0] === 'C2609-03002');
  ok('2 tipo: serviço e item único', /Serviço/.test(await txt(p, 'tr[data-id="C2609-03002"]')) && /Lista · 2 itens/.test(await txt(p, 'tr[data-id="C2609-03001"]')));
  ok('2 fornecedor único marcado', /Fornecedor único/.test(await txt(p, 'tr[data-id="C2609-03002"]')));
  ok('2 motivo não vira HTML', !(await p.evaluate(() => window.__x)) && await p.locator('table.fila img').count() === 0);
  await p.click('[data-tipo="urgente"]'); await p.waitForTimeout(150);
  ok('2 filtro urgente', await p.locator('table.fila tbody tr').count() === 1);
  await p.click('[data-tipo=""]'); await p.fill('#f-q', 'retentor'); await p.waitForTimeout(150);
  ok('2 busca por item', await p.locator('table.fila tbody tr').count() === 1);
  await p.fill('#f-q', ''); await p.waitForTimeout(100);
  await p.click('[data-tab="dev"]'); await p.waitForTimeout(100);
  ok('2 aba devolvidas', /C2609-03003/.test(await txt(p, 'table.fila')) && /Devolvida/.test(await txt(p, 'table.fila')));
  await p.click('[data-tab="env"]'); await p.waitForTimeout(100);
  ok('2 aba enviadas com valor', /C2609-03004/.test(await txt(p, 'table.fila')) && /gerencial/.test(await txt(p, 'table.fila')));
  await p.click('#bt-atualizar'); await p.waitForTimeout(400);
  ok('2 atualizar relê a fila', ch(p, 'fila_do_comprador').length === 2);
  await p.close(); }

/* 3 — detalhe */
{ const p = await abrir(b, '?t=' + TOKEN, { prep:B => B.pedidos[0].anexos.push({ id:'a1', nome:'foto.jpg', tamanho:2048 }) });
  await p.click('tr[data-id="C2609-03001"]'); await p.waitForTimeout(500);
  ok('3 detalhe pede pedido_telas', ch(p, 'pedido_telas').some(x => x.c.p_id === 'u1' && x.c.p_token === TOKEN));
  const m = await txt(p, '#modal');
  ok('3 histórico do banco', /Solicitação aberta/.test(m) && /Aprovado em liderança imediata/.test(m), m.slice(0, 300));
  ok('3 anexos com link seguro', (await p.getAttribute('#modal .anexos-lista a', 'href')) === 'https://grupoleh.app.n8n.cloud/webhook/anexo?id=a1');
  ok('3 botão reprovar no detalhe', await p.locator('#m-reprovar').count() === 1);
  ok('3 última da lista: próxima desligada', await p.locator('#m-next').isDisabled());
  await p.click('#m-prev'); await p.waitForTimeout(500);
  ok('3 anterior abre a outra', /C2609-03002/.test(await txt(p, '#modal .eyebrow')));
  await p.keyboard.press('Escape');
  ok('3 Escape fecha', await p.locator('#overlay').isHidden());
  await p.close(); }

/* 4 — mapa: busca de fornecedor, preços, escolha, gravação */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(600);
  ok('4 abriu o mapa', await p.locator('#map-wrap table.map').count() === 1);
  await p.click('#n-MG-0'); await p.type('#n-MG-0', 'ro', { delay:30 }); await p.waitForTimeout(600);
  ok('4 busca no cadastro', ch(p, 'buscar_fornecedor').length >= 1 && await p.locator('.sug [data-sug]').count() >= 2);
  await p.click('.sug [data-fid="f1"]'); await p.waitForTimeout(200);
  ok('4 escolheu do cadastro', (await p.inputValue('#n-MG-0')) === 'ROLAMAX');
  await p.fill('#n-MG-1', 'Fornecedor sem cadastro'); await p.waitForTimeout(200);
  ok('4 nome digitado pede escolha da lista', /Escolha na lista do cadastro/.test(await txt(p, '#st-MG-1')));
  await p.fill('#p-MG-i1-0', '100'); await p.fill('#p-MG-i2-0', '50'); await p.fill('#p-MG-i1-1', '90');
  await p.click('#k-MG-i1-1'); await p.click('#k-MG-i2-0');
  await p.fill('#f-MG-0', '0'); await p.fill('#z-MG-0', '5'); await p.fill('#c-MG-0', '28 dias');
  await p.waitForTimeout(1800);
  const sv = ch(p, 'salvar_mapa');
  ok('4 salvou sozinho', sv.length >= 1, sv.length);
  const u = sv[sv.length - 1] && sv[sv.length - 1].c;
  ok('4 fornecedor do cadastro vai com id', u && u.p_mapa.fornecedores.some(f => f.coluna === 1 && f.fornecedor_id === 'f1' && f.frete === 0 && f.prazo_dias === 5 && f.condicao === '28 dias'), u && u.p_mapa.fornecedores);
  ok('4 fornecedor digitado vai sem id', u && u.p_mapa.fornecedores.some(f => f.coluna === 2 && !f.fornecedor_id && f.fornecedor_nome === 'Fornecedor sem cadastro'));
  ok('4 preços como número', u && u.p_mapa.precos.some(x => x.item_id === 'i1' && x.coluna === 1 && x.preco === 100) && u.p_mapa.precos.some(x => x.item_id === 'i1' && x.coluna === 2 && x.preco === 90));
  ok('4 escolhas na coluna do banco (1 a 3)', u && JSON.stringify(u.p_mapa.escolhas.sort((a,b) => a.item_id < b.item_id ? -1 : 1)) === JSON.stringify([{ item_id:'i1', coluna:2 }, { item_id:'i2', coluna:1 }]), u && u.p_mapa.escolhas);
  ok('4 versões encadeadas', sv.every((x, k) => x.c.p_versao_mapa === k));
  ok('4 barra diz salvo', /Rascunho salvo às/.test(await txt(p, '#saved')));
  /* enviar com pendência: fornecedor 2 venceu sem cadastro e sem condições */
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('4 enviar mostra pendências', !(await p.locator('#pend').isHidden()) && /pela busca do cadastro/.test(await txt(p, '#pend')));
  ok('4 enviar não chamou o banco', ch(p, 'enviar_mapa').length === 0);
  await p.keyboard.press('Escape');
  /* troca o fornecedor 2 por um do cadastro e completa */
  await p.fill('#n-MG-1', ''); await p.type('#n-MG-1', 'ca', { delay:30 }); await p.waitForTimeout(500);
  await p.click('.sug [data-fid="f2"]');
  await p.fill('#f-MG-1', '10'); await p.fill('#z-MG-1', '3'); await p.fill('#c-MG-1', 'À vista');
  await p.click('#bt-salvar'); await p.waitForTimeout(900);
  ok('4 salvar e voltar leva à fila', await p.locator('table.fila').count() === 1);
  ok('4 fila mostra continuar', /Continuar/.test(await txt(p, 'tr[data-id="C2609-03001"]')));
  /* reabre: o mapa vem do banco */
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  ok('4 reabriu com o que foi salvo', (await p.inputValue('#n-MG-1')) === 'CASA DO ROLAMENTO' && (await p.inputValue('#p-MG-i1-1')) === '90,00'
     && (await p.getAttribute('#k-MG-i1-1', 'aria-pressed')) === 'true' && (await p.inputValue('#c-MG-1')) === 'À vista');
  /* enviar: escolhe o preço mais alto no item 1 (não é o menor) → observação obrigatória */
  await p.click('#k-MG-i1-0'); await p.waitForTimeout(200);
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('4 modal de envio para a gerencial', /Enviar para aprovação gerencial/.test(await txt(p, '#modal')));
  await p.click('#dlg-ok'); await p.waitForTimeout(200);
  ok('4 observação obrigatória quando não é o menor preço', /mínimo 5 letras/.test(await txt(p, '#e-dlg-obs')) && ch(p, 'enviar_mapa').length === 0);
  await p.fill('#dlg-obs', 'Só dois fornecedores atendem a região.');
  await p.click('#dlg-ok'); await p.waitForTimeout(1200);
  const env = ch(p, 'enviar_mapa')[0];
  ok('4 enviar_mapa com versão e observação', env && env.c.p_id === 'u1' && env.c.p_observacao === 'Só dois fornecedores atendem a região.' && env.c.p_versao_mapa === p.B.pedidos[0].mapa.versao - 1, env);
  ok('4 foi para enviadas com aviso', /C2609-03001 enviada/.test(await txt(p, '#view')) && (await p.getAttribute('[data-tab="env"]', 'aria-selected')) === 'true');
  /* enviada: só leitura */
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  ok('4 enviada abre só para leitura', /Enviada para aprovação gerencial/.test(await txt(p, '#view')) && await p.locator('#bt-enviar').count() === 0 && await p.locator('#p-MG-i1-0').isDisabled());
  ok('4 enviada sem botão reprovar', await p.locator('#bt-reprovar').count() === 0);
  await p.click('#bt-back'); await p.waitForTimeout(400);
  await p.close(); }

/* 5 — devolvida: reenvio exige observação nova */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-tab="dev"]'); await p.click('[data-open="C2609-03003"]'); await p.waitForTimeout(700);
  ok('5 banner com o motivo da devolução', /Devolvida por Carla Financeiro/.test(await txt(p, '#view')) && /Frete alto/.test(await txt(p, '#view')));
  ok('5 mensal, fornecedor restaurado', (await p.inputValue('#n-HL-0')) === 'ROLAMAX' && (await p.inputValue('#p-HL-i4-0')) === '12,50');
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('5 reenvio para a financeira (mensal)', /Reenviar para aprovação financeira/.test(await txt(p, '#modal')));
  ok('5 observação antiga não vem preenchida', (await p.inputValue('#dlg-obs')) === '');
  await p.click('#dlg-ok'); await p.waitForTimeout(200);
  ok('5 sem observação não reenvia', ch(p, 'enviar_mapa').length === 0);
  await p.fill('#dlg-obs', 'Frete negociado para zero.'); await p.click('#dlg-ok'); await p.waitForTimeout(1200);
  ok('5 reenviou', ch(p, 'enviar_mapa').length === 1 && p.B.pedidos[2].etapa_atual === 'financeiro');
  await p.close(); }

/* 6 — reprovar */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  await p.click('#bt-reprovar'); await p.waitForTimeout(200);
  await p.click('#rp-ok'); await p.waitForTimeout(150);
  ok('6 motivo obrigatório', /mínimo 5 letras/.test(await txt(p, '#e-rp')) && ch(p, 'reprovar_na_cotacao').length === 0);
  await p.fill('#rp-mot', 'Item já existe no estoque'); await p.click('#rp-ok'); await p.click('#rp-ok').catch(() => {}); await p.waitForTimeout(900);
  const r = ch(p, 'reprovar_na_cotacao');
  ok('6 uma chamada, com versão e motivo', r.length === 1 && r[0].c.p_versao === 1 && r[0].c.p_motivo === 'Item já existe no estoque', r);
  ok('6 volta à fila com aviso e sem o pedido', /C2609-03001 reprovado/.test(await txt(p, '#view')) && await p.locator('tr[data-id="C2609-03001"]').count() === 0);
  await p.close(); }

/* 7 — fornecedor único: uma coluna */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03002"]'); await p.waitForTimeout(700);
  ok('7 uma coluna só', await p.locator('#n-FORA-0').count() === 1 && await p.locator('#n-FORA-1').count() === 0);
  ok('7 justificativa em destaque', /Assistência autorizada/.test(await txt(p, '#view')) && /Fornecedor único/.test(await txt(p, '#view')));
  await p.click('#n-FORA-0'); await p.type('#n-FORA-0', 'di', { delay:30 }); await p.waitForTimeout(500);
  await p.click('.sug [data-fid="f3"]'); await p.fill('#p-FORA-i3-0', '800'); await p.click('#k-FORA-i3-0');
  await p.fill('#f-FORA-0', '0'); await p.fill('#z-FORA-0', '10'); await p.fill('#c-FORA-0', 'À vista'); await p.waitForTimeout(1500);
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('7 envio diz que é fornecedor único', /Fornecedor único/.test(await txt(p, '#modal .unico-envio')));
  ok('7 fornecedor único não pede 3 cotações', !/O aprovador vai ver estes pontos/.test(await txt(p, '#modal')) && /opcional/.test(await txt(p, '#modal label[for="dlg-obs"]')));
  await p.click('#dlg-ok'); await p.waitForTimeout(1200);
  ok('7 fornecedor único enviado', ch(p, 'enviar_mapa').length === 1 && p.B.pedidos[1].etapa_atual === 'gerencial');
  await p.close(); }

/* 8 — orçamentos */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  await p.setInputFiles('#orc-arq', [{ name:'orc rolamax.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4') },
                                     { name:'planilha.xlsx', mimeType:'application/vnd.ms-excel', buffer:Buffer.from('x') }]);
  await p.waitForTimeout(800);
  ok('8 subiu na pasta do pedido', p.B.storage.length === 1 && /^u1\/orcamento-.+\.pdf$/.test(p.B.storage[0]), p.B.storage);
  const rg = ch(p, 'registrar_orcamentos')[0];
  ok('8 registrou com token', rg && rg.c.p_token === TOKEN && rg.c.p_id === 'u1' && rg.c.p_anexos[0].caminho === p.B.storage[0]);
  ok('8 lista o orçamento', /orc rolamax\.pdf/.test(await txt(p, '#orcamentos')));
  ok('8 recusa tipo errado e diz por quê', /planilha\.xlsx \(só PDF ou foto\)/.test(await txt(p, '#orc-st')));
  await p.close(); }

/* 9 — conflito de versão e falha de rede ao salvar */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  p.B.pedidos[0].mapa = { estado:'rascunho', versao:7, forn:[], precos:[], escolhas:[] };   // outra aba salvou
  await p.fill('#p-MG-i1-0', '10'); await p.waitForTimeout(1800);
  ok('9 conflito avisa e não sobrescreve', /O mapa mudou em outro lugar/.test(await txt(p, '#modal')) && p.B.pedidos[0].mapa.versao === 7);
  await p.click('#cf-ok'); await p.waitForTimeout(800);
  ok('9 abre a versão salva', await p.locator('#overlay').isHidden() && (await p.inputValue('#p-MG-i1-0')) === '');
  await p.close(); }
{ let cair = true;
  const p = await abrir(b, '?t=' + TOKEN, { erroRpc:n => n === 'salvar_mapa' && cair });
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  await p.fill('#p-MG-i1-0', '10'); await p.waitForTimeout(1800);
  ok('9 sem rede: avisa que não salvou', /Não consegui salvar/.test(await txt(p, '#saved')));
  cair = false; await p.waitForTimeout(6500);
  ok('9 tenta de novo sozinho e salva', /Rascunho salvo às/.test(await txt(p, '#saved')) && p.B.pedidos[0].mapa && p.B.pedidos[0].mapa.precos.length === 1);
  await p.close(); }

/* 10 — fechar a aba com mudança pendente grava mesmo assim */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  await p.fill('#p-MG-i1-0', '33');
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted:false }))); await p.waitForTimeout(600);
  ok('10 pagehide salva a mudança', ch(p, 'salvar_mapa').some(x => x.c.p_mapa.precos.some(y => y.preco === 33)));
  await p.close(); }

/* 12 — um fornecedor basta: envia sem observação (29/09) */
{ const p = await abrir(b, '?t=' + TOKEN);
  await p.click('[data-open="C2609-03001"]'); await p.waitForTimeout(700);
  await p.click('#n-MG-0'); await p.type('#n-MG-0', 'ro', { delay:30 }); await p.waitForTimeout(500);
  await p.click('.sug [data-fid="f1"]');
  await p.fill('#p-MG-i1-0', '100'); await p.fill('#p-MG-i2-0', '50');
  await p.click('#k-MG-i1-0'); await p.click('#k-MG-i2-0');
  await p.fill('#f-MG-0', '0'); await p.fill('#z-MG-0', '5'); await p.fill('#c-MG-0', '28 dias');
  await p.waitForTimeout(1600);
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('12 aviso de 1 de 3 aparece para o aprovador', /O aprovador vai ver estes pontos/.test(await txt(p, '#modal')) && /1 de 3/.test(await txt(p, '#modal')));
  ok('12 observação opcional', /opcional/.test(await txt(p, '#modal label[for="dlg-obs"]')));
  await p.click('#dlg-ok'); await p.waitForTimeout(1200);
  const env = ch(p, 'enviar_mapa');
  ok('12 enviou sem observação', env.length === 1 && env[0].c.p_observacao === null && p.B.pedidos[0].etapa_atual === 'gerencial', env);
  await p.close(); }

/* 13 — a fila se atualiza sozinha quando a liderança aprova um pedido novo */
{ const p = await abrir(b, '?t=' + TOKEN);
  ok('13 antes: 2 para cotar', /Paracotar2/.test((await txt(p, '[data-tab="cotar"]')).replace(/\s+/g, '')));
  const novo = JSON.parse(JSON.stringify(p.B.pedidos[0])); Object.assign(novo, { id:'u9', numero:'C2609-03009', motivo:'Chegou agora', mapa:null });
  p.B.pedidos.push(novo);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(700);
  ok('13 pedido novo aparece sem clicar em Atualizar', await p.locator('tr[data-id="C2609-03009"]').count() === 1);
  ok('13 avisa que chegou pedido novo', /1 pedido novo para cotar/.test(await txt(p, '#toast')));
  /* com a busca em uso não redesenha por baixo */
  await p.click('#f-q'); await p.type('#f-q', 'rol');
  const n = ch(p, 'fila_do_comprador').length;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(600);
  ok('13 relê mas não tira o foco da busca', ch(p, 'fila_do_comprador').length === n + 1 && await p.evaluate(() => document.activeElement.id) === 'f-q' && (await p.inputValue('#f-q')) === 'rol');
  await p.close(); }

/* 11 — celular */
{ const p = await abrir(b, '?t=' + TOKEN, { vp:{ width:390, height:800 } });
  ok('11 celular: fila sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
