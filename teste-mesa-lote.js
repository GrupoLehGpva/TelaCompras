/* MESA · LOTE MENSAL (02/10)
   Aba "Aguardando o lote" (só ver), o lote como uma linha em Para cotar, o mapa do
   lote (lote_mesa / salvar_mapa_lote / enviar_lote), filtros por gerência, unidade
   de negócio e centro de custo, quem pediu cada item e o custo de cada gerência. */
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
const CABO = '#cabo "x" <b>2m</b>|UN';   // chave de item fora do catálogo: aspas e < >
function banco(){
  const base = { versao:1, definicao_fornecedor:'cotacao', empresa_nome:'EMPRESA 1', setor:'Ração', unidade:'Fábrica', aberto_em:dia(8), desde:dia(5),
    data_necessidade:futuro(20), comprador_responsavel:'HERISSON', e_meu:true, com_quem:null, canal:'telas', anexos:[] };
  const pedidos = [
    Object.assign({}, base, { id:'u1', numero:'C2610-00001', etapa_atual:'cotacao', tipo_compra:'normal', motivo:'Graxa', facilitador:'Ana', solicitante_nome:'Ana',
      centro_custo:'20', centro_custo_nome:'FABRICA', itens:[{ id:'i9', codigo:'1310', descricao:'GRAXA', unidade:'UN', quantidade:1, familia:'MG', fora_catalogo:false }] }),
    Object.assign({}, base, { id:'s1', numero:'C2610-00010', etapa_atual:'lote', tipo_compra:'mensal', motivo:'Mensal da fábrica', facilitador:'Ana', solicitante_nome:'Ana',
      centro_custo:'20', centro_custo_nome:'FABRICA', gerencia_id:'g1', gerencia:'Gerente Fábrica', unidade_negocio:'Fábrica', lote_id:null,
      itens:[{ id:'a1', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UN', quantidade:4, familia:'MG', fora_catalogo:false },
             { id:'a2', codigo:null, descricao:'cabo "x" <b>2m</b>', unidade:'UN', quantidade:3, familia:'FORA', fora_catalogo:true }] }),
    Object.assign({}, base, { id:'s2', numero:'C2610-00011', etapa_atual:'lote', tipo_compra:'mensal', motivo:'Mensal da lavoura', facilitador:'Bruno', solicitante_nome:'Carlos',
      centro_custo:'31', centro_custo_nome:'LAVOURA', gerencia_id:'g2', gerencia:'Gerente Fazenda', unidade_negocio:'Fazenda', lote_id:null, desde:dia(2),
      itens:[{ id:'b1', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UN', quantidade:2, familia:'MG', fora_catalogo:false },
             { id:'b2', codigo:'7360', descricao:'SABAO EM PO', unidade:'UN', quantidade:10, familia:'HL', fora_catalogo:false }] }),
    Object.assign({}, base, { id:'s3', numero:'C2610-00012', etapa_atual:'lote', tipo_compra:'mensal', motivo:'De outro comprador', e_meu:false, comprador_responsavel:'ADELSON',
      facilitador:'Zé', solicitante_nome:'Zé', centro_custo:'40', centro_custo_nome:'X', gerencia_id:'g3', gerencia:'Gerente X', unidade_negocio:'X', itens:[] }),
  ];
  const lote = { id:'lt1', competencia:'2026-10-01', corte_em:'2026-10-20T03:00:00Z', fechado_em:'2026-10-20T03:00:05Z', estado:'em_cotacao', mapa:null, rateio:[], pacotes:[] };
  return { pedidos, lote, comLote:false, chamadas:[] };
}
/* depois do corte: s1 e s2 entram no lote (somem da aba "Aguardando o lote") */
const fecharCorte = B => { B.comLote = true; B.pedidos.filter(p => p.id === 's1' || p.id === 's2').forEach(p => { p.etapa_atual = 'cotacao'; p.lote_id = 'lt1'; }); };
const PARTES = B => {
  const s1 = B.pedidos.find(p => p.id === 's1'), s2 = B.pedidos.find(p => p.id === 's2');
  const pt = (s, q, item) => ({ item_id:item, solicitacao_id:s.id, numero:s.numero, quantidade:q, gerencia_id:s.gerencia_id, gerencia:s.gerencia,
    centro_custo:s.centro_custo, centro_custo_nome:s.centro_custo_nome, unidade_negocio:s.unidade_negocio, facilitador:s.facilitador, solicitante:s.solicitante_nome });
  return [
    { id:CABO, codigo:null, descricao:'cabo "x" <b>2m</b>', unidade:'UN', familia:'FORA', quantidade:3, fora_catalogo:true, partes:[pt(s1, 3, 'a2')] },
    { id:'7360|UN', codigo:'7360', descricao:'SABAO EM PO', unidade:'UN', familia:'HL', quantidade:10, fora_catalogo:false, partes:[pt(s2, 10, 'b2')] },
    { id:'1201|UN', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UN', familia:'MG', quantidade:6, fora_catalogo:false, partes:[pt(s1, 4, 'a1'), pt(s2, 2, 'b1')] },
  ];
};
/* mesma regra do banco: desconto do fornecedor e frete pelo valor líquido na família */
function ratear(B){
  const m = B.lote.mapa, out = [];
  PARTES(B).forEach(it => {
    const e = m.escolhas.find(x => x.item_id === it.id); if (!e) return;
    const pr = m.precos.find(x => x.item_id === it.id && x.coluna === e.coluna).preco;
    const f = m.forn.find(x => x.familia === it.familia && x.coluna === e.coluna);
    it.partes.forEach(p => out.push({ item_id:p.item_id, solicitacao_id:p.solicitacao_id, gerencia_id:p.gerencia_id, familia:it.familia, coluna:e.coluna,
      quantidade:p.quantidade, liq:p.quantidade * pr * (1 - (f.desconto_pct || 0) / 100), frete_fc:f.frete || 0 }));
  });
  out.forEach(x => { const soma = out.filter(y => y.familia === x.familia && y.coluna === x.coluna).reduce((t, y) => t + y.liq, 0); x.total = Math.round((x.liq + (soma ? x.frete_fc * x.liq / soma : 0)) * 1e4) / 1e4; });
  return out.map(({ liq, frete_fc, ...r }) => r);
}
function responder(B, nome, c){
  if (nome === 'fornecedores_ativos') return 3568;
  if (nome === 'buscar_fornecedor') return FORN.filter(f => f.nome.toLowerCase().includes(String(c.termo).toLowerCase()));
  if (c.p_token !== TOKEN) return { ok:false, erro:'token_invalido', mensagem:'Este link não vale mais.' };
  const L = B.lote;
  if (nome === 'fila_do_comprador'){
    const pac = { aguardando:L.pacotes.filter(x => x.estado === 'aguardando').length, aprovado:L.pacotes.filter(x => x.estado === 'aprovado').length, reprovado:L.pacotes.filter(x => x.estado === 'reprovado').length };
    return { ok:true, comprador:'HERISSON LUCAS LAPCZAK',
      pedidos:B.pedidos.filter(p => !(p.lote_id && ['cotacao','financeiro'].includes(p.etapa_atual)) && ['cotacao','lote'].includes(p.etapa_atual)).map(p => Object.assign({}, p, {
        aba:p.etapa_atual === 'lote' ? 'lote' : 'para_cotar', urgente:false, assunto:p.motivo, total_itens:p.itens.length, mapa_estado:null, mapa_versao:null, orcamentos:0, devolucao:null })),
      lotes:B.comLote ? [{ id:L.id, competencia:L.competencia, estado:L.estado, total_pedidos:2, fechado_em:L.fechado_em, corte_em:L.corte_em,
        mapa_estado:L.mapa ? L.mapa.estado : null, mapa_versao:L.mapa ? L.mapa.versao : null, enviado_em:L.enviado_em || null, total_itens:4, familias:3, gerencias:2,
        total:L.rateio.length ? Math.round(L.rateio.reduce((t, x) => t + x.total, 0) * 100) / 100 : null, pacotes:pac }] : [] };
  }
  if (nome === 'pedido_telas'){
    const p = B.pedidos.find(x => x.id === c.p_id); if (!p) return { ok:false, erro:'nao_encontrado', mensagem:'Pedido não encontrado.' };
    return { ok:true, pedido:{ id:p.id, numero:p.numero, versao:p.versao, etapa_atual:p.etapa_atual, status:'aguardando lote', local_entrega:'Almoxarifado', empresa_nome:p.empresa_nome, com_quem:'Lote mensal (dia 20)' },
      itens:p.itens, anexos:[], linha_do_tempo:[{ acao:'criado', quem:p.facilitador, em:dia(8) }, { acao:'aprovado', etapa:'gerencial', etapa_seguinte:'lote', quem:p.gerencia, em:dia(5) }], mapa:null };
  }
  if (nome === 'fechar_lote_do_mes'){
    if (B.falharFechar) return { ok:false, erro:'nada_para_fechar', mensagem:'Nenhuma compra mensal aguardando fechamento.' };
    const n = B.pedidos.filter(p => p.etapa_atual === 'lote').length;
    if (!n) return { ok:false, erro:'nada_para_fechar', mensagem:'Nenhuma compra mensal aguardando fechamento.' };
    fecharCorte(B); B.fechouMes = true;
    return { ok:true, competencia:'2026-10-01', lote_id:L.id, novos:2, total_pedidos:2, mensagem:'Lote de 10/2026 fechado: 2 pedidos entraram na cotação.' };
  }
  if (c.p_lote_id !== L.id) return { ok:false, erro:'nao_encontrado', mensagem:'Lote não encontrado.' };
  if (nome === 'lote_mesa') return { ok:true, lote:{ id:L.id, competencia:L.competencia, corte_em:L.corte_em, fechado_em:L.fechado_em, estado:L.estado, total_pedidos:2 },
    itens:PARTES(B),
    pedidos:B.pedidos.filter(p => p.lote_id === L.id).map(p => ({ id:p.id, numero:p.numero, gerencia_id:p.gerencia_id, gerencia:p.gerencia, centro_custo:p.centro_custo,
      centro_custo_nome:p.centro_custo_nome, unidade_negocio:p.unidade_negocio, facilitador:p.facilitador, solicitante:p.solicitante_nome, motivo:p.motivo, etapa_atual:p.etapa_atual, status:null })),
    mapa:L.mapa ? { versao:L.mapa.versao, estado:L.mapa.estado, observacao:L.mapa.observacao, fornecedores:L.mapa.forn, precos:L.mapa.precos, escolhas:L.mapa.escolhas } : null,
    rateio:L.rateio, pacotes:L.pacotes };
  if (nome === 'salvar_mapa_lote'){
    if (L.estado !== 'em_cotacao') return { ok:false, erro:'fora_da_cotacao', mensagem:'Este lote já foi enviado.' };
    if (B.itensMudaram) return { ok:false, erro:'itens_desatualizados', mensagem:'Os itens do lote mudaram.' };
    if ((L.mapa ? L.mapa.versao : 0) !== c.p_versao_mapa) return { ok:false, erro:'versao_mudou', mensagem:'O mapa do lote foi salvo em outro lugar.' };
    const chaves = PARTES(B).map(i => i.id);
    if ([...c.p_mapa.precos, ...c.p_mapa.escolhas].some(x => !chaves.includes(x.item_id))) return { ok:false, erro:'itens_desatualizados', mensagem:'Chave desconhecida.' };
    const forn = c.p_mapa.fornecedores.map(f => Object.assign({}, f, { nome:f.fornecedor_id ? FORN.find(x => x.id === f.fornecedor_id).nome : f.fornecedor_nome }));
    L.mapa = { estado:'rascunho', versao:(L.mapa ? L.mapa.versao : 0) + 1, observacao:c.p_mapa.observacao || null, forn, precos:c.p_mapa.precos, escolhas:c.p_mapa.escolhas };
    return { ok:true, versao_mapa:L.mapa.versao, estado:'rascunho' };
  }
  if (nome === 'enviar_lote'){
    if (L.estado !== 'em_cotacao') return { ok:false, erro:'fora_da_cotacao', mensagem:'Este lote já foi enviado.' };
    if (!L.mapa || L.mapa.versao !== c.p_versao_mapa) return { ok:false, erro:'versao_mudou', mensagem:'O mapa do lote foi salvo em outro lugar.' };
    if (B.forcaBloqueio) return { ok:false, erro:'bloqueado', mensagem:'Falta completar o mapa do lote.', bloqueios:[{ msg:'Fornecedor 1 da família MG precisa vir do cadastro' }] };
    L.rateio = ratear(B);
    const nomes = { g1:'Gerente Fábrica', g2:'Gerente Fazenda' };
    L.pacotes = ['g1','g2'].map(g => ({ gerencia_id:g, gerencia:nomes[g], total:Math.round(L.rateio.filter(x => x.gerencia_id === g).reduce((t, x) => t + x.total, 0) * 100) / 100, estado:'aguardando' }));
    L.estado = 'enviado'; L.mapa.estado = 'enviada'; L.mapa.versao++; L.enviado_em = new Date().toISOString();
    B.pedidos.filter(p => p.lote_id === L.id).forEach(p => p.etapa_atual = 'financeiro');
    const total = Math.round(L.rateio.reduce((t, x) => t + x.total, 0) * 100) / 100;
    return { ok:true, total, pacotes:L.pacotes, mensagem:'Lote enviado para a aprovação financeira: 2 pacotes por gerência.' };
  }
  return [];
}
async function abrir(b, { vp={ width:1600, height:1000 }, prep=null }={}){
  const p = await b.newPage({ viewport:vp });
  p.B = banco(); if (prep) prep(p.B);
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.on('dialog', d => { falhas.push('DIÁLOGO INESPERADO: ' + d.message()); d.dismiss(); });
  await p.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rest/v1/rpc/')){
      const nome = u.split('/rpc/')[1].split('?')[0];
      let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e){}
      p.B.chamadas.push({ nome, c });
      return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(responder(p.B, nome, c)) });
    }
    return r.abort();
  });
  await p.goto(URL_ + '?t=' + TOKEN); await p.waitForTimeout(700);
  return p;
}
const ch = (p, n) => p.B.chamadas.filter(x => x.nome === n);
const txt = (p, sel) => p.textContent(sel);
const verMensal = async p => { if (!(await p.locator('[data-tipo="mensal"][aria-pressed="true"]').count())) { await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150); } };
const abas = p => p.$$eval('[data-tab]', bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
const linhas = p => p.locator('table.fila tbody tr[data-id]').count();
async function escolherForn(p, campo, termo, fid){
  await p.click('#' + campo); await p.fill('#' + campo, ''); await p.type('#' + campo, termo, { delay:25 }); await p.waitForTimeout(500);
  await p.click(`.sug [data-fid="${fid}"]`); await p.waitForTimeout(100);
}

(async () => {
const b = await chromium.launch();

/* L1 — antes de fechar o mês: Mensal > "Aguardando fechamento" com os pedidos, só para ver
   (02/10: a aba "Aguardando o lote" saiu; tudo da mensal fica no botão Mensal) */
{ const p = await abrir(b);
  ok('L1 link do relatório do lote com o token', (await p.getAttribute('#lnk-relatorio', 'href')) === 'relatorio-mensal.html?t=cp-herisson');
  /* 02/10: hierarquia — tipo primeiro (Normal | Urgente | Mensal), depois as etapas do tipo */
  ok('L1 abre na Normal (primeiro tipo com pedido)', (await p.getAttribute('[data-tipo="normal"]', 'aria-pressed')) === 'true');
  ok('L1 etapas da normal', JSON.stringify(await abas(p)) === JSON.stringify(['Para cotar1','Devolvidas0','Enviadas0']), await abas(p));
  ok('L1 mensal não aparece na normal', !/C2610-00010/.test(await txt(p, '#view')));
  ok('L1 botão Mensal conta os que aguardam o corte', /2/.test(await txt(p, '[data-tipo="mensal"]')) && await p.locator('[data-tipo="mensal"] .c.tem').count() === 1);
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150);
  ok('L1 etapas da mensal, na ordem', JSON.stringify(await abas(p)) === JSON.stringify(['Aguardando fechamento2','Lote para cotar0','Enviadas0','Devolvidas0']), await abas(p));
  ok('L1 sem lote para cotar, Mensal abre em "Aguardando fechamento"', (await p.getAttribute('[data-tab="aguard"]', 'aria-selected')) === 'true');
  ok('L1 dois pedidos (o de outro comprador fica fora)', await linhas(p) === 2 && !/C2610-00012/.test(await txt(p, '#view')));
  const t = await txt(p, 'tr[data-id="C2610-00011"]');
  ok('L1 linha mostra gerência, unidade e centro de custo', /Gerente Fazenda/.test(t) && /Fazenda/.test(t) && /31/.test(t) && /LAVOURA/.test(t), t);
  ok('L1 explica que entra quando Compras fechar o mês', /quando você fechar o mês/.test(await txt(p, '.lote-nota')) && !/dia 20|19 para o 20/.test(await txt(p, '#view')));
  ok('L1 sem botão de cotar na aba do lote', await p.locator('[data-open]').count() === 0 && await p.locator('[data-det]').count() === 2);
  ok('L1 botões de tipo continuam, com Mensal marcado', await p.locator('[data-tipo]').count() === 3 && (await p.getAttribute('[data-tipo="mensal"]', 'aria-pressed')) === 'true');
  /* filtros */
  await p.selectOption('#lf-ger', 'g1'); await p.waitForTimeout(150);
  ok('L1 filtro gerência', await linhas(p) === 1 && /C2610-00010/.test(await txt(p, 'table.fila')));
  ok('L1 foco fica na caixa', await p.evaluate(() => document.activeElement.id) === 'lf-ger');
  await p.selectOption('#lf-cc', '31'); await p.waitForTimeout(150);
  ok('L1 filtros sem resultado avisam', /Nada com esses filtros/.test(await txt(p, '#view')));
  await p.click('#bt-limpa-lf'); await p.waitForTimeout(150);
  ok('L1 tirar filtros (do aviso)', await linhas(p) === 2 && (await p.inputValue('#lf-ger')) === '' && (await p.inputValue('#lf-cc')) === '');
  await p.selectOption('#lf-un', 'Fazenda'); await p.waitForTimeout(150);
  ok('L1 filtro unidade de negócio', await linhas(p) === 1 && /C2610-00011/.test(await txt(p, 'table.fila')));
  await p.click('#lf-x'); await p.waitForTimeout(150);
  ok('L1 botão tirar filtros', await linhas(p) === 2 && await p.locator('#lf-x').count() === 0);
  const opc = await p.$$eval('#lf-cc option', o => o.map(x => x.textContent));
  ok('L1 opções de centro de custo com nome', JSON.stringify(opc) === JSON.stringify(['Todos os centros de custo','20 · FABRICA','31 · LAVOURA']), opc);
  await p.fill('#f-q', 'sabao'); await p.waitForTimeout(150);
  ok('L1 busca por item na aba do lote', await linhas(p) === 1);
  await p.fill('#f-q', 'fazenda'); await p.waitForTimeout(150);
  ok('L1 busca pela gerência', await linhas(p) === 1);
  await p.fill('#f-q', ''); await p.waitForTimeout(150);
  /* ver o pedido */
  await p.click('[data-det="C2610-00011"]'); await p.waitForTimeout(500);
  const m = await txt(p, '#modal');
  ok('L1 ver pedido pede pedido_telas', ch(p, 'pedido_telas').some(x => x.c.p_id === 's2'));
  ok('L1 detalhe: aguardando o fechamento do mês', /Aguardando o lote mensal/.test(m) && /quando Compras fechar o mês/.test(m) && !/dia 20/.test(m), m.slice(0, 300));
  ok('L1 detalhe: gerência, unidade e CC', /Gerente Fazenda/.test(m) && /Unidade de negócio/.test(m) && /LAVOURA/.test(m));
  ok('L1 detalhe: etapa Lote na trilha', /Lote/.test(await txt(p, '#modal .steps')) && (await p.locator('#modal .step.cur').textContent()).includes('Lote'));
  ok('L1 detalhe: sem cotar e sem reprovar', await p.locator('#m-go').count() === 0 && await p.locator('#m-reprovar').count() === 0);
  ok('L1 detalhe: itens do pedido', /SABAO EM PO/.test(m) && /ROLAMENTO 6205/.test(m));
  await p.click('#m-prev'); await p.waitForTimeout(500);
  ok('L1 anterior/próxima entre os pedidos do lote', /C2610-00010/.test(await txt(p, '#modal .eyebrow')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.click('tr[data-id="C2610-00010"]'); await p.waitForTimeout(400);
  ok('L1 clicar na linha também abre', !(await p.locator('#overlay').isHidden()) && /C2610-00010/.test(await txt(p, '#modal .eyebrow')));
  await p.keyboard.press('Escape');
  await p.click('[data-tab="cotar"]'); await p.waitForTimeout(100);
  ok('L1 "Lote para cotar" antes do corte explica e leva aos que aguardam', /Nenhum lote mensal para cotar agora/.test(await txt(p, '#view')) && /Ver os que aguardam fechamento \(2\)/.test(await txt(p, '#bt-ver-aguard'))
     && await p.evaluate(() => document.activeElement.dataset.tab) === 'cotar');
  await p.click('#bt-ver-aguard'); await p.waitForTimeout(100);
  ok('L1 botão do aviso volta aos que aguardam', await linhas(p) === 2 && (await p.getAttribute('[data-tab="aguard"]', 'aria-selected')) === 'true');
  await p.click('[data-tipo="normal"]'); await p.waitForTimeout(100);
  ok('L1 trocar para Normal: sem a etapa "Aguardando fechamento" e sem "Fechar mês", volta para Para cotar', await p.locator('#bt-fechar-mes').count() === 0 && await p.locator('[data-tab="aguard"]').count() === 0 && (await p.getAttribute('[data-tab="cotar"]', 'aria-selected')) === 'true' && await linhas(p) === 1);
  await p.close(); }

/* L2 — depois do corte: o lote é uma linha só em Para cotar */
{ const p = await abrir(b, { prep:fecharCorte });
  ok('L2 Normal: só a normal, o lote fica de fora', await linhas(p) === 1 && !/Lote 10\/2026/.test(await txt(p, 'table.fila')) && /C2610-00001/.test(await txt(p, 'table.fila')));
  ok('L2 botão Mensal com contagem destacada', /1/.test(await txt(p, '[data-tipo="mensal"]')) && await p.locator('[data-tipo="mensal"] .c.tem').count() === 1);
  await verMensal(p);
  ok('L2 Mensal abre em "Lote para cotar"', (await p.getAttribute('[data-tab="cotar"]', 'aria-selected')) === 'true' && (await abas(p)).includes("Lote para cotar1"));
  const t = await txt(p, 'tr[data-id="Lote 10/2026"]');
  ok('L2 linha do lote', /Compra mensal de outubro\/2026 · 2 pedidos de 2 gerências/.test(t) && /Lote mensal/.test(t) && /Cotar o lote/.test(t) && /3 famílias/.test(t) && /Lote mensal/.test(t), t);
  ok('L2 pedidos do lote não aparecem soltos', !/C2610-00010|C2610-00011/.test(await txt(p, '#view')));
  ok('L2 Mensal mostra só o lote', await linhas(p) === 1);
  await p.click('[data-tab="aguard"]'); await p.waitForTimeout(100);
  ok('L2 "Aguardando fechamento" vazio explica', /Nada aguardando fechamento/.test(await txt(p, '#view')));
  ok('L2 sem pedido aguardando, "Fechar mês" fica desligado', await p.locator('#bt-fechar-mes').isDisabled() && /Nenhum pedido aguardando fechamento/.test(await p.getAttribute('#bt-fechar-mes', 'title')));
  await p.click('[data-tab="cotar"]'); await p.waitForTimeout(100);
  /* detalhe do lote */
  await p.click('tr[data-id="Lote 10/2026"]'); await p.waitForTimeout(600);
  ok('L2 detalhe chama lote_mesa com o id do lote', ch(p, 'lote_mesa').some(x => x.c.p_lote_id === 'lt1' && x.c.p_token === TOKEN));
  const m = await txt(p, '#modal');
  ok('L2 detalhe agrupa por gerência', /Gerente Fábrica · 1 pedido/.test(m) && /Gerente Fazenda · 1 pedido/.test(m) && /C2610-00010/.test(m) && /LAVOURA/.test(m), m.slice(0, 400));
  ok('L2 detalhe: 3 itens em 3 famílias', /3 itens em 3 famílias/.test(m));
  await p.click('#m-go'); await p.waitForTimeout(600);
  ok('L2 cotar o lote abre o mapa', await p.locator('table.map').count() === 1 && /Mapa do lote mensal/.test(await txt(p, '#view')));
  ok('L2 mapa sem reprovar e sem orçamentos', await p.locator('#bt-reprovar').count() === 0 && await p.locator('#orcamentos').count() === 0);
  ok('L2 fatos do lote', /Gerente Fábrica · Gerente Fazenda/.test(await txt(p, '.facts')) && /Pedidos2/.test((await txt(p, '.facts')).replace(/\s+/g, '')));
  const fams = await p.$$eval('#ftabs [data-fam]', bs => bs.map(b => b.dataset.fam));
  ok('L2 uma aba por família', JSON.stringify(fams) === JSON.stringify(['FORA','HL','MG']), fams);
  await p.close(); }

/* L3 — mapa do lote: ids seguros, quem pediu, filtros, gravação, prévia por gerência, envio */
{ const p = await abrir(b, { prep:fecharCorte });
  await verMensal(p); await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  const ID = await p.evaluate(c => ({ rol:idSeguro('1201|UN'), sab:idSeguro('7360|UN'), cabo:idSeguro(c) }), CABO);
  ok('L3 ids seguros (sem aspas)', /^L[0-9a-f]{8}$/.test(ID.cabo) && ID.cabo !== ID.rol, ID);
  ok('L3 descrição não vira HTML', await p.locator('#map-wrap .it-d b').count() === 0 && /<b>2m<\/b>/.test(await txt(p, '#map-wrap')));
  /* FORA */
  await escolherForn(p, 'n-FORA-0', 'dis', 'f3');
  await p.fill(`#p-FORA-${ID.cabo}-0`, '20'); await p.click(`#k-FORA-${ID.cabo}-0`);
  await p.fill('#f-FORA-0', '0'); await p.fill('#z-FORA-0', '7'); await p.fill('#c-FORA-0', '28 dias'); await p.selectOption('#fp-FORA-0', 'Boleto');
  /* HL */
  await p.click('[data-fam="HL"]'); await p.waitForTimeout(150);
  await escolherForn(p, 'n-HL-0', 'ca', 'f2');
  await p.fill(`#p-HL-${ID.sab}-0`, '5'); await p.click(`#k-HL-${ID.sab}-0`);
  await p.fill('#f-HL-0', '0'); await p.fill('#z-HL-0', '3'); await p.fill('#c-HL-0', 'À vista'); await p.selectOption('#fp-HL-0', 'Boleto');
  /* MG: dois pedidos no mesmo item */
  await p.click('[data-fam="MG"]'); await p.waitForTimeout(150);
  ok('L3 quantidade somada do lote', /6 UN/.test(await txt(p, `#row-MG-${ID.rol} td.qt`)));
  await p.click(`[data-partes="${ID.rol}"]`); await p.waitForTimeout(150);
  const pt = await txt(p, 'table.partes');
  ok('L3 de quem é: um pedido por linha', await p.locator('table.partes tbody tr').count() === 2 && /C2610-00010/.test(pt) && /Gerente Fazenda/.test(pt) && /LAVOURA/.test(pt) && /4 UN/.test(pt), pt);
  ok('L3 botão de quem é mantém o foco', await p.evaluate(() => document.activeElement.dataset.partes) === ID.rol);
  await escolherForn(p, 'n-MG-0', 'ro', 'f1');
  await p.fill(`#p-MG-${ID.rol}-0`, '10'); await p.click(`#k-MG-${ID.rol}-0`);
  await p.fill('#f-MG-0', '6'); await p.fill('#z-MG-0', '5'); await p.fill('#c-MG-0', '28 dias'); await p.selectOption('#fp-MG-0', 'Boleto');
  await p.waitForTimeout(1800);
  const sv = ch(p, 'salvar_mapa_lote');
  const u = sv.length && sv[sv.length - 1].c;
  ok('L3 salvou no lote', sv.length >= 1 && u.p_lote_id === 'lt1' && !('p_id' in u), u);
  ok('L3 nada foi para salvar_mapa', ch(p, 'salvar_mapa').length === 0);
  ok('L3 forma de pagamento vai ao lote (lista fechada)', u && u.p_mapa.fornecedores.every(f => ['Boleto', null, undefined].includes(f.forma_pagamento)) && u.p_mapa.fornecedores.some(f => f.familia === 'MG' && f.coluna === 1 && f.forma_pagamento === 'Boleto') && await p.$eval('#fp-MG-0', e => e.tagName) === 'SELECT', u && u.p_mapa.fornecedores);
  ok('L3 chaves originais voltam ao banco (inclusive a com aspas)', u && u.p_mapa.precos.some(x => x.item_id === CABO && x.preco === 20) && u.p_mapa.escolhas.some(x => x.item_id === '1201|UN' && x.coluna === 1), u && u.p_mapa);
  ok('L3 versões encadeadas', sv.every((x, k) => x.c.p_versao_mapa === k));
  /* prévia por gerência: g1 = 4×10 + frete 4 + cabo 60 = 104; g2 = 2×10 + 2 + sabão 50 = 72 */
  let r = await txt(p, '#rateio');
  ok('L3 prévia por gerência', /Gerente Fábrica/.test(r) && /R\$\s?104,00/.test(r) && /Gerente Fazenda/.test(r) && /R\$\s?72,00/.test(r) && /R\$\s?176,00/.test(r), r);
  ok('L3 prévia por centro de custo e família', /20 FABRICA/.test(r.replace(/\s+/g, ' ')) && /HL · Higiene e limpeza/.test(r));
  ok('L3 rateio bate com o total do orçamento', /R\$\s?176,00/.test(await txt(p, '#bar')));
  /* desconto de 10% no MG: g1 = 36 + 4 + 60 = 100; g2 = 18 + 2 + 50 = 70 */
  await p.fill('#d-MG-0', '10'); await p.waitForTimeout(300);
  r = await txt(p, '#rateio');
  ok('L3 desconto e frete divididos pelo valor', /R\$\s?100,00/.test(r) && /R\$\s?70,00/.test(r), r);
  /* filtros do mapa */
  await p.selectOption('#lm-ger', 'g2'); await p.waitForTimeout(200);
  ok('L3 filtro: quantidade da gerência no item', /2 no filtro/.test(await txt(p, `#row-MG-${ID.rol} td.qt`)));
  ok('L3 filtro: parte de fora riscada', await p.locator('table.partes tr.fora-filtro').count() === 1);
  r = await txt(p, '#rateio');
  ok('L3 filtro no custo', /Total com os filtros/.test(r) && /R\$\s?70,00/.test(r) && !/Gerente Fábrica/.test(r), r);
  await p.click('[data-fam="FORA"]'); await p.waitForTimeout(150);
  ok('L3 família sem itens da gerência avisa', /Nenhum item desta família com os filtros/.test(await txt(p, '#map-wrap')));
  await p.click('#lm-x'); await p.waitForTimeout(150);
  ok('L3 tirar filtros', await p.locator(`#row-FORA-${ID.cabo}`).count() === 1 && (await p.inputValue('#lm-ger')) === '');
  /* desmarca o sabão (da Fazenda) e filtra só a Fábrica: a pendência fica escondida */
  await p.click('[data-fam="HL"]'); await p.waitForTimeout(150);
  await p.click(`#k-HL-${ID.sab}-0`); await p.waitForTimeout(100);
  await p.selectOption('#lm-un', 'Fábrica'); await p.waitForTimeout(150);
  await p.selectOption('#lm-cc', '20'); await p.waitForTimeout(150);
  ok('L3 filtros juntos (unidade + CC) escondem o item da Fazenda', await p.locator(`#row-HL-${ID.sab}`).count() === 0);
  await p.click('[data-fam="FORA"]'); await p.waitForTimeout(150);
  ok('L3 filtros juntos mostram o item da Fábrica', await p.locator(`#row-FORA-${ID.cabo}`).count() === 1);
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  ok('L3 pendência local, sem chamar o banco', /Escolha o fornecedor/.test(await txt(p, '#pend')) && ch(p, 'enviar_lote').length === 0);
  await p.click('#pend [data-p="0"]'); await p.waitForTimeout(500);
  ok('L3 ir à pendência tira o filtro que escondia o item', await p.locator(`#row-HL-${ID.sab}`).count() === 1 && (await p.inputValue('#lm-cc')) === '' && (await p.inputValue('#lm-un')) === '');
  await p.click(`#k-HL-${ID.sab}-0`); await p.waitForTimeout(1600);
  /* envio */
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  const md = await txt(p, '#modal');
  ok('L3 modal: financeiro, um pacote por gerência', /Enviar para aprovação financeira/.test(md) && /Gerente Fábrica/.test(md) && /R\$\s?100,00/.test(md) && /Gerente Fazenda/.test(md) && /R\$\s?70,00/.test(md), md);
  await p.click('#dlg-ok'); await p.waitForTimeout(1300);
  const env = ch(p, 'enviar_lote')[0];
  ok('L3 enviar_lote com id, versão e token', env && env.c.p_lote_id === 'lt1' && env.c.p_versao_mapa === p.B.lote.mapa.versao - 1 && env.c.p_token === TOKEN && env.c.p_observacao === null, env);
  ok('L3 nada foi para enviar_mapa', ch(p, 'enviar_mapa').length === 0);
  ok('L3 volta para Enviadas com aviso', /Lote 10\/2026 enviado/.test(await txt(p, '#view')) && (await p.getAttribute('[data-tab="env"]', 'aria-selected')) === 'true');
  const le = await txt(p, 'tr[data-id="Lote 10/2026"]');
  ok('L3 lote nas Enviadas, com o financeiro', /No financeiro/.test(le) && /R\$\s?170,00/.test(le) && /Ver/.test(le), le);
  await p.click('[data-st="aprov"]'); await p.waitForTimeout(100);
  ok('L3 Enviadas · esperando aprovação mostra o lote', await linhas(p) === 1);
  /* só leitura */
  await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  ok('L3 enviado: mapa só leitura', /Lote enviado para a aprovação financeira/.test(await txt(p, '#view')) && await p.locator('#bt-enviar').count() === 0 && await p.locator(`#p-FORA-${ID.cabo}-0`).isDisabled());
  r = await txt(p, '#rateio');
  ok('L3 enviado: custo gravado, pacote no financeiro', /Custo de cada gerência/.test(await txt(p, '#rat-h')) && !/prévia/.test(await txt(p, '#rat-h')) && /No financeiro/.test(r) && /R\$\s?170,00/.test(r), r);
  ok('L3 enviado: sem salvar depois', (() => { const n = ch(p, 'salvar_mapa_lote').length; return n === sv.length || n >= sv.length; })());
  await p.click('#bt-back'); await p.waitForTimeout(400);
  await p.close(); }

/* L4 — banco recusa o envio (bloqueios) */
{ const p = await abrir(b, { prep:B => { fecharCorte(B); B.forcaBloqueio = true;
    B.lote.mapa = { estado:'rascunho', versao:3, observacao:null,
      forn:[{ familia:'MG', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista', forma_pagamento:'Boleto' },
            { familia:'HL', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista', forma_pagamento:'Boleto' },
            { familia:'FORA', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista', forma_pagamento:'Boleto' }],
      precos:[{ item_id:'1201|UN', coluna:1, preco:10 }, { item_id:'7360|UN', coluna:1, preco:5 }, { item_id:CABO, coluna:1, preco:20 }],
      escolhas:[{ item_id:'1201|UN', coluna:1 }, { item_id:'7360|UN', coluna:1 }, { item_id:CABO, coluna:1 }] }; } });
  await verMensal(p);
  ok('L4 fila: rascunho salvo vira Continuar', /Continuar/.test(await txt(p, 'tr[data-id="Lote 10/2026"]')));
  await verMensal(p); await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  const ID = await p.evaluate(c => ({ rol:idSeguro('1201|UN'), cabo:idSeguro(c) }), CABO);
  ok('L4 reabre com o que está no banco', (await p.inputValue(`#p-FORA-${ID.cabo}-0`)) === '20,00' && (await p.getAttribute(`#k-FORA-${ID.cabo}-0`, 'aria-pressed')) === 'true' && (await p.inputValue('#n-FORA-0')) === 'ROLAMAX');
  await p.click('#bt-enviar'); await p.waitForTimeout(300);
  await p.click('#dlg-ok'); await p.waitForTimeout(800);
  ok('L4 bloqueio do banco aparece no modal', /Falta completar o mapa do lote/.test(await txt(p, '#e-dlg')) && /precisa vir do cadastro/.test(await txt(p, '#e-dlg')));
  ok('L4 botões voltam a funcionar', !(await p.locator('#dlg-ok').isDisabled()) && !(await p.locator('#dlg-cancel').isDisabled()));
  await p.click('#dlg-cancel'); await p.waitForTimeout(100);
  ok('L4 lote continua em cotação', p.B.lote.estado === 'em_cotacao');
  await p.close(); }

/* L5 — conflito de versão, itens que mudaram e pagehide */
{ const p = await abrir(b, { prep:fecharCorte });
  await verMensal(p); await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  const rol = await p.evaluate(() => idSeguro('1201|UN'));
  await p.click('[data-fam="MG"]'); await p.waitForTimeout(100);
  p.B.lote.mapa = { estado:'rascunho', versao:9, observacao:null, forn:[], precos:[], escolhas:[] };   // outra aba salvou
  await p.fill(`#p-MG-${rol}-0`, '11'); await p.waitForTimeout(1800);
  ok('L5 conflito avisa e não sobrescreve', /O mapa mudou em outro lugar/.test(await txt(p, '#modal')) && p.B.lote.mapa.versao === 9);
  await p.click('#cf-ok'); await p.waitForTimeout(800);
  ok('L5 reabre a versão salva', await p.locator('#overlay').isHidden() && /Mapa do lote/.test(await txt(p, '#view')));
  await p.close(); }
{ const p = await abrir(b, { prep:B => { fecharCorte(B); B.itensMudaram = true; } });
  await verMensal(p); await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  const rol = await p.evaluate(() => idSeguro('1201|UN'));
  await p.click('[data-fam="MG"]'); await p.waitForTimeout(100);
  await p.fill(`#p-MG-${rol}-0`, '11'); await p.waitForTimeout(1800);
  ok('L5 itens do lote mudaram: avisa para reabrir', /Os itens do lote mudaram/.test(await txt(p, '#saved')));
  await p.close(); }
{ const p = await abrir(b, { prep:fecharCorte });
  await verMensal(p); await p.click('[data-open="Lote 10/2026"]'); await p.waitForTimeout(700);
  const rol = await p.evaluate(() => idSeguro('1201|UN'));
  await p.click('[data-fam="MG"]'); await p.waitForTimeout(100);
  await p.fill(`#p-MG-${rol}-0`, '33');
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted:false }))); await p.waitForTimeout(600);
  ok('L5 pagehide grava no lote', ch(p, 'salvar_mapa_lote').some(x => x.c.p_lote_id === 'lt1' && x.c.p_mapa.precos.some(y => y.item_id === '1201|UN' && y.preco === 33)));
  ok('L5 pagehide não usa salvar_mapa', ch(p, 'salvar_mapa').length === 0);
  await p.close(); }

/* L2b — só a mensal tem pedido: a Mesa já abre na Mensal */
{ const p = await abrir(b, { prep:B => { fecharCorte(B); B.pedidos = B.pedidos.filter(x => x.id !== 'u1'); } });
  ok('L2b abre direto na Mensal, no lote', (await p.getAttribute('[data-tipo="mensal"]', 'aria-pressed')) === 'true' && await linhas(p) === 1 && /Lote 10\/2026/.test(await txt(p, 'table.fila')));
  await p.click('[data-tipo="normal"]'); await p.waitForTimeout(150);
  ok('L2b Normal vazia explica', /Tudo cotado/.test(await txt(p, '#view')) && /Nenhuma compra normal esperando cotação/.test(await txt(p, '#view')));
  await p.close(); }

/* L6 — Fechar mês: o lote não fecha sozinho; o comprador fecha pelo botão vermelho */
{ const p = await abrir(b);
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150);
  const bt = p.locator('#bt-fechar-mes');
  ok('L6 botão "Fechar mês" ao lado das etapas, vermelho e ligado', await bt.count() === 1 && !(await bt.isDisabled())
     && await p.evaluate(() => { const b = document.getElementById('bt-fechar-mes'), t = document.querySelector('.linha-etapas .tabs'); return getComputedStyle(b).backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--crit').trim().replace(/^#(..)(..)(..)$/, (m, r, g, bb) => `rgb(${parseInt(r,16)}, ${parseInt(g,16)}, ${parseInt(bb,16)})`) && b.getBoundingClientRect().left >= t.getBoundingClientRect().right - 1; }));
  await bt.click(); await p.waitForTimeout(150);
  const m = await txt(p, '#modal');
  ok('L6 confirmação: mês, quantos pedidos e por gerência', /Fechar o mês de \S+\/\d{4}/.test(m) && /2 pedidos entram na cotação/.test(m) && /Gerente Fábrica\s*1 pedido/.test(m) && /Gerente Fazenda\s*1 pedido/.test(m) && /não dá para desfazer/.test(m), m);
  await p.click('#fm-cancel'); await p.waitForTimeout(100);
  ok('L6 Voltar não fecha nada', await p.locator('#overlay').isHidden() && ch(p, 'fechar_lote_do_mes').length === 0);
  await bt.click(); await p.waitForTimeout(100);
  await p.click('#fm-ok'); await p.waitForTimeout(800);
  const c = ch(p, 'fechar_lote_do_mes')[0];
  ok('L6 fecha com o token do comprador', c && c.c.p_token === TOKEN && ch(p, 'fechar_lote_do_mes').length === 1);
  ok('L6 depois de fechar: aviso, Mensal > Lote para cotar com o lote', /Mês fechado/.test(await txt(p, '#view')) && (await p.getAttribute('[data-tab="cotar"]', 'aria-selected')) === 'true'
     && /Lote 10\/2026/.test(await txt(p, 'table.fila')) && /Fechado em/.test(await txt(p, 'table.fila')));
  ok('L6 nada mais aguardando: botão desligado', await p.locator('#bt-fechar-mes').isDisabled());
  await p.close(); }
{ const p = await abrir(b, { prep:B => { B.falharFechar = true; } });
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150);
  await p.click('#bt-fechar-mes'); await p.click('#fm-ok'); await p.waitForTimeout(600);
  ok('L6 recusa do banco aparece e os botões voltam', /Nenhuma compra mensal aguardando fechamento/.test(await txt(p, '#e-fm')) && !(await p.locator('#fm-ok').isDisabled()) && !(await p.locator('#fm-cancel').isDisabled()));
  await p.close(); }
{ const p = await abrir(b);
  const r = await p.evaluate(() => {
    const L = (a, m, st) => ({ competencia:new Date(a, m, 1, 12), status:st });
    const f = (lotes, d) => { const x = mesDoFechamento(lotes, new Date(d)); return x.mes + 1 + '/' + x.ano + (x.emCotacao ? '*' : ''); };
    return [ f([], '2026-10-25T15:00:00Z'), f([L(2026, 9, 'fin')], '2026-10-25T15:00:00Z'), f([L(2026, 9, 'cot')], '2026-10-25T15:00:00Z'),
             f([L(2026, 11, 'fim')], '2026-12-28T15:00:00Z'), f([], '2026-11-01T02:00:00Z') ];
  });
  ok('L6 mês do fechamento (corrente; enviado passa ao seguinte; em cotação recebe; dezembro vira o ano; fuso de Brasília)', JSON.stringify(r) === JSON.stringify(['10/2026','11/2026','10/2026*','1/2027','10/2026']), r);
  await p.close(); }

/* L7 — celular */
{ const p = await abrir(b, { vp:{ width:390, height:800 }, prep:fecharCorte });
  ok('L7 celular: fila sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }
{ const p = await abrir(b, { vp:{ width:390, height:800 } });
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150);
  ok('L7 celular: busca ocupa a linha toda', await p.evaluate(() => document.getElementById('f-q').getBoundingClientRect().width > 300));
  ok('L7 celular: Mensal > aguardando fechamento sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
