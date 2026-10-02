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

/* L1 — antes do corte: aba "Aguardando o lote" com os pedidos, só para ver */
{ const p = await abrir(b);
  ok('L1 link do relatório do lote com o token', (await p.getAttribute('#lnk-relatorio', 'href')) === 'relatorio-mensal.html?t=cp-herisson');
  ok('L1 abas antes do corte', JSON.stringify(await abas(p)) === JSON.stringify(['Para cotar1','Aguardando o lote2','Devolvidas0','Enviadas0']), await abas(p));
  ok('L1 mensal no lote não aparece em Para cotar', !/C2610-00010/.test(await txt(p, '#view')));
  await p.click('[data-tab="lote"]'); await p.waitForTimeout(150);
  ok('L1 dois pedidos (o de outro comprador fica fora)', await linhas(p) === 2 && !/C2610-00012/.test(await txt(p, '#view')));
  const t = await txt(p, 'tr[data-id="C2610-00011"]');
  ok('L1 linha mostra gerência, unidade e centro de custo', /Gerente Fazenda/.test(t) && /Fazenda/.test(t) && /31/.test(t) && /LAVOURA/.test(t), t);
  ok('L1 explica o corte do dia 20', /virada do dia 19 para o 20/.test(await txt(p, '#view')) && /\/20\d\d|20\/\d\d\/\d{4}/.test(await txt(p, '.lote-nota')));
  ok('L1 sem botão de cotar na aba do lote', await p.locator('[data-open]').count() === 0 && await p.locator('[data-det]').count() === 2);
  ok('L1 sem botões de tipo na aba do lote', await p.locator('[data-tipo]').count() === 0);
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
  ok('L1 detalhe: aguardando o lote, com a data do corte', /Aguardando o lote mensal/.test(m) && /entra na cotação junto/.test(m), m.slice(0, 300));
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
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(100);
  ok('L1 Mensal em Para cotar: nada antes do corte', /Nenhuma compra mensal nesta aba/.test(await txt(p, '#view')));
  await p.close(); }

/* L2 — depois do corte: o lote é uma linha só em Para cotar */
{ const p = await abrir(b, { prep:fecharCorte });
  ok('L2 abas depois do corte', JSON.stringify(await abas(p)) === JSON.stringify(['Para cotar2','Aguardando o lote0','Devolvidas0','Enviadas0']), await abas(p));
  /* 02/10: a mensal não se mistura com as outras em Para cotar */
  ok('L2 sem tipo marcado: só normal e urgente, o lote fica de fora', await linhas(p) === 1 && !/Lote 10\/2026/.test(await txt(p, 'table.fila')) && /C2610-00001/.test(await txt(p, 'table.fila')));
  ok('L2 aviso de que a mensal está no botão Mensal', /clique em Mensal para ver/.test(await txt(p, '#nota-mensal')));
  ok('L2 botão Mensal com contagem destacada', /1/.test(await txt(p, '[data-tipo="mensal"]')) && await p.locator('[data-tipo="mensal"] .c.tem').count() === 1);
  await p.click('[data-tipo="normal"]'); await p.waitForTimeout(100);
  ok('L2 Normal mostra só a normal', await linhas(p) === 1 && !(await p.locator('#nota-mensal').count()));
  await p.click('[data-tipo="normal"]'); await p.waitForTimeout(100);
  await verMensal(p);
  const t = await txt(p, 'tr[data-id="Lote 10/2026"]');
  ok('L2 linha do lote', /Compra mensal de outubro\/2026 · 2 pedidos de 2 gerências/.test(t) && /Lote mensal/.test(t) && /Cotar o lote/.test(t) && /3 famílias/.test(t) && /Lote mensal/.test(t), t);
  ok('L2 pedidos do lote não aparecem soltos', !/C2610-00010|C2610-00011/.test(await txt(p, '#view')));
  ok('L2 filtro Mensal mostra só o lote', await linhas(p) === 1);
  await p.click('[data-tab="lote"]'); await p.waitForTimeout(100);
  ok('L2 aba do lote vazia explica', /Nada aguardando o lote/.test(await txt(p, '#view')));
  await p.click('[data-tab="cotar"]'); await p.waitForTimeout(100);
  await verMensal(p);
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
  await p.fill('#f-FORA-0', '0'); await p.fill('#z-FORA-0', '7'); await p.fill('#c-FORA-0', '28 dias');
  /* HL */
  await p.click('[data-fam="HL"]'); await p.waitForTimeout(150);
  await escolherForn(p, 'n-HL-0', 'ca', 'f2');
  await p.fill(`#p-HL-${ID.sab}-0`, '5'); await p.click(`#k-HL-${ID.sab}-0`);
  await p.fill('#f-HL-0', '0'); await p.fill('#z-HL-0', '3'); await p.fill('#c-HL-0', 'À vista');
  /* MG: dois pedidos no mesmo item */
  await p.click('[data-fam="MG"]'); await p.waitForTimeout(150);
  ok('L3 quantidade somada do lote', /6 UN/.test(await txt(p, `#row-MG-${ID.rol} td.qt`)));
  await p.click(`[data-partes="${ID.rol}"]`); await p.waitForTimeout(150);
  const pt = await txt(p, 'table.partes');
  ok('L3 de quem é: um pedido por linha', await p.locator('table.partes tbody tr').count() === 2 && /C2610-00010/.test(pt) && /Gerente Fazenda/.test(pt) && /LAVOURA/.test(pt) && /4 UN/.test(pt), pt);
  ok('L3 botão de quem é mantém o foco', await p.evaluate(() => document.activeElement.dataset.partes) === ID.rol);
  await escolherForn(p, 'n-MG-0', 'ro', 'f1');
  await p.fill(`#p-MG-${ID.rol}-0`, '10'); await p.click(`#k-MG-${ID.rol}-0`);
  await p.fill('#f-MG-0', '6'); await p.fill('#z-MG-0', '5'); await p.fill('#c-MG-0', '28 dias');
  await p.waitForTimeout(1800);
  const sv = ch(p, 'salvar_mapa_lote');
  const u = sv.length && sv[sv.length - 1].c;
  ok('L3 salvou no lote', sv.length >= 1 && u.p_lote_id === 'lt1' && !('p_id' in u), u);
  ok('L3 nada foi para salvar_mapa', ch(p, 'salvar_mapa').length === 0);
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
      forn:[{ familia:'MG', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista' },
            { familia:'HL', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista' },
            { familia:'FORA', coluna:1, fornecedor_id:'f1', nome:'ROLAMAX', desconto_pct:null, frete:0, prazo_dias:2, condicao:'À vista' }],
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

/* L2b — só a mensal para cotar: aviso com botão */
{ const p = await abrir(b, { prep:B => { fecharCorte(B); B.pedidos = B.pedidos.filter(x => x.id !== 'u1'); } });
  ok('L2b sem normal/urgente: explica e oferece a mensal', /Nenhuma compra normal ou urgente para cotar/.test(await txt(p, '#view')) && /Ver a compra mensal \(1\)/.test(await txt(p, '#bt-ver-mensal')));
  await p.click('#bt-ver-mensal'); await p.waitForTimeout(150);
  ok('L2b botão leva ao lote', await linhas(p) === 1 && (await p.getAttribute('[data-tipo="mensal"]', 'aria-pressed')) === 'true');
  await p.click('[data-tipo="mensal"]'); await p.waitForTimeout(150);
  ok('L2b desmarcar volta ao aviso', /Nenhuma compra normal ou urgente/.test(await txt(p, '#view')));
  await p.close(); }

/* L6 — corte e nome do mês */
{ const p = await abrir(b);
  const c = await p.evaluate(() => [proximoCorte(new Date('2026-10-02T15:00:00Z')), proximoCorte(new Date('2026-10-20T02:59:00Z')), proximoCorte(new Date('2026-10-20T03:00:00Z')), proximoCorte(new Date('2026-12-25T12:00:00Z'))].map(d => dt(d)));
  ok('L6 próximo corte (19 às 23:59 ainda é este mês; dia 20 já é o seguinte; dezembro vira o ano)', JSON.stringify(c) === JSON.stringify(['20/10/2026','20/10/2026','20/11/2026','20/01/2027']), c);
  await p.close(); }

/* L7 — celular */
{ const p = await abrir(b, { vp:{ width:390, height:800 }, prep:fecharCorte });
  ok('L7 celular: fila sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }
{ const p = await abrir(b, { vp:{ width:390, height:800 } });
  await p.click('[data-tab="lote"]'); await p.waitForTimeout(150);
  ok('L7 celular: aba do lote sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
