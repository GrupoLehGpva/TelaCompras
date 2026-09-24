/* ============================================================================
   TELA DO PEDIDO — CAMINHO DAS TELAS (sem ClickUp)
   Aberta pela fila do aprovador (?t=). Para pedido das telas: mostra a cotação
   enviada, decide pelo banco com a versão, devolve ao comprador onde a regra
   deixa e explica quando o facilitador está editando.
   ========================================================================== */
const { chromium } = require('playwright');
const ARQ = 'file://' + __dirname + '/pedido.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + (d||''));

const ID = '22222222-2222-2222-2222-222222222222';
const PED = (x={}) => Object.assign({
  id:ID, numero:'C2609-02001', canal:'telas', versao:7, etapa_atual:'gerencial',
  solicitante:'Ana Paula', aberto_em:'2026-09-20T13:00:00Z', centro_custo:'20',
  tipo_compra:'normal', definicao_fornecedor:'cotacao', data_necessidade:'2026-12-01',
  motivo:'Rolamentos da peletizadora', empresa_id:'wienfried-pr', status:'solicitado'
}, x);
const ITENS = [{codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UNID', quantidade:4}];
/* Mapa com três fornecedores: o comprador escolheu ROLAMAX para dois itens e a
   CASA para a graxa (a ROLAMAX não cotou a graxa). PERDEU cotou tudo e não
   ganhou nada — e precisa aparecer do mesmo jeito. */
const IT_MAPA = [
  {id:'i1', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UNID', quantidade:4, familia:'MM'},
  {id:'i2', codigo:'1207', descricao:'RETENTOR 35X52X7', unidade:'UNID', quantidade:4, familia:'MM'},
  {id:'i3', codigo:'1310', descricao:'GRAXA LITIO 1KG', unidade:'UNID', quantidade:2, familia:'MM'}];
const P = (item_id, coluna, preco) => ({item_id, coluna, preco});
const MAPA = { ok:true, itens:IT_MAPA, mapa:{ estado:'enviado', versao:2, observacao:'Fornecedor 2 tem prazo maior, mas <b>frete</b> grátis',
  precos:[P('i1',1,100),P('i2',1,120), P('i1',2,110),P('i2',2,125),P('i3',2,84), P('i1',3,130),P('i2',3,140),P('i3',3,95)],
  escolhas:[{item_id:'i1',coluna:1},{item_id:'i2',coluna:1},{item_id:'i3',coluna:2}],
  resumo:{ total:1022, avisos:[{msg:'Só um fornecedor cotou a família 12.'}], familias:[
    {familia:'MM', total:1022, fornecedores:[
      {coluna:1, nome:'ROLAMAX', itens_ganhos:2, desconto_pct:5, frete:0, prazo_dias:7, condicao:'28 dias', total:836},
      {coluna:2, nome:'CASA DO ROLAMENTO', itens_ganhos:1, desconto_pct:0, frete:18, prazo_dias:3, condicao:'à vista', total:186},
      {coluna:3, nome:'PERDEU LTDA', itens_ganhos:0, desconto_pct:0, frete:0, prazo_dias:10, condicao:'28 dias', total:0}]}]}}};
/* Um fornecedor ganhou tudo: é a melhor opção indicada. */
const MAPA_UNICO = { ok:true, itens:IT_MAPA.slice(0,2), mapa:{ estado:'enviado', observacao:null,
  precos:[P('i1',1,100),P('i2',1,120),P('i1',2,110),P('i2',2,125)],
  escolhas:[{item_id:'i1',coluna:1},{item_id:'i2',coluna:1}],
  resumo:{ total:836, avisos:[], familias:[{familia:'MM', fornecedores:[
    {coluna:1, nome:'ROLAMAX', itens_ganhos:2, desconto_pct:5, frete:0, prazo_dias:7, condicao:'28 dias', total:836},
    {coluna:2, nome:'CASA DO ROLAMENTO', itens_ganhos:0, desconto_pct:0, frete:18, prazo_dias:3, condicao:'à vista', total:0}]}]}}};

async function abrir(b, {ped=PED(), fila=null, mapa=MAPA, decide=()=>({ok:true, mensagem:'Segue para a aprovação financeira.'}), token='ap-teste'}={}){
  const p = await b.newPage({viewport:{width:1100,height:1000}});
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__rpc = []; p.__n8n = [];
  const filaPadrao = [{id:ID, numero:ped.numero, etapa_atual:ped.etapa_atual, card_id:null}];
  await p.route('**/rest/v1/**', r => {
    const u = r.request().url();
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(!u.includes('/rpc/')) return j([]);
    const nome = u.split('/rpc/')[1].split('?')[0];
    let corpo = {}; try{ corpo = JSON.parse(r.request().postData()||'{}'); }catch(e){}
    p.__rpc.push({nome, corpo});
    if(nome === 'abrir_pedido') return j({ok:true, pedido:ped, itens:ITENS, anexos:[]});
    if(nome === 'fila_de_aprovacao') return j(fila === null ? filaPadrao : fila);
    if(nome === 'pedido_telas') return j(mapa);
    if(nome === 'decidir_pedido') return j(decide(corpo));
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => { p.__n8n.push(r.request().url()); r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"arquivos":[]}'}); });
  await p.goto(ARQ + '?id=' + ID + (token ? '&t=' + token : ''), {waitUntil:'load'});
  await p.waitForTimeout(700);
  return p;
}
const dec = p => p.__rpc.filter(x => x.nome === 'decidir_pedido');
const naoDecisaoN8n = p => p.__n8n.filter(u => /decisao-tela/.test(u));

(async () => {
const b = await chromium.launch();

/* 1 — gerencial, pedido das telas: cotação e os três botões */
{ const p = await abrir(b);
  ok('1 barra de decisão', await p.locator('#barraAprova').isVisible());
  ok('1 aprovar e reprovar', await p.locator('#btnAprovar').isVisible() && await p.locator('#btnReprovar').isVisible());
  ok('1 devolver aparece na gerencial', await p.locator('#btnDevolver').isVisible());
  ok('1 cartão da cotação', await p.locator('#cartaoCotacao').isVisible());
  const t = await p.locator('#cotacaoCorpo').textContent() || '';
  const cab = await p.locator('.cot-mapa thead th.forn').allTextContents();
  ok('1 todos os fornecedores aparecem', cab.length === 3 && /ROLAMAX/.test(cab[0]) && /CASA/.test(cab[1]) && /PERDEU/.test(cab[2]), JSON.stringify(cab));
  ok('1 indicados destacados', /Indicado para 2 itens/.test(cab[0]) && /Indicado para 1 item/.test(cab[1]) && !/Indicado/.test(cab[2]) &&
     await p.locator('.cot-mapa thead th.forn.indicado').count() === 2, JSON.stringify(cab));
  ok('1 três células escolhidas', await p.locator('.cot-mapa td.escolhido').count() === 3);
  const graxa = await p.locator('.cot-mapa tbody tr', {hasText:'GRAXA'}).locator('td').allTextContents();
  ok('1 graxa: ROLAMAX não cotou, CASA escolhida', /não cotou/.test(graxa[0]) && /84,00/.test(graxa[1]) && /168,00/.test(graxa[1]) &&
     await p.locator('.cot-mapa tbody tr', {hasText:'GRAXA'}).locator('td').nth(1).evaluate(e => e.classList.contains('escolhido')), JSON.stringify(graxa));
  const tot = await p.locator('.cot-mapa tr.total-forn td').allTextContents();
  ok('1 total se comprar tudo de cada um', /836,00/.test(tot[0]) && /faltam 1 item/.test(tot[0]) && /1\.126,00/.test(tot[1]) && /1\.270,00/.test(tot[2]), JSON.stringify(tot));
  ok('1 escolha do comprador resumida', /Escolha do comprador: ROLAMAX \(2 itens, R\$\s?836,00\) \+ CASA DO ROLAMENTO \(1 item, R\$\s?186,00\)/.test(t), t);
  ok('1 total da cotação escolhida', /Total da cotação escolhida: R\$\s?1\.022,00/.test(t), t);
  ok('1 desconto, frete, prazo e condição', /5%/.test(t) && /18,00/.test(t) && /7 dias/.test(t) && /à vista/.test(t), t);
  ok('1 observação do comprador', /Observação do comprador/.test(t), t);
  ok('1 observação escapada', await p.locator('#cotacaoCorpo .cot-obs b').count() === 1, 'HTML da observação virou tag');
  ok('1 pontos de atenção', /Só um fornecedor cotou/.test(t), t);
  const pt = p.__rpc.find(x => x.nome === 'pedido_telas');
  ok('1 pedido_telas com token e id', pt && pt.corpo.p_token === 'ap-teste' && pt.corpo.p_id === ID, JSON.stringify(pt));
  await p.close(); }

/* 1.2 — um fornecedor com todos os itens: melhor opção indicada */
{ const p = await abrir(b, {mapa:MAPA_UNICO});
  const cab = await p.locator('.cot-mapa thead th.forn').allTextContents();
  ok('1.2 melhor opção indicada', /Melhor opção indicada/.test(cab[0]) && !/Indicado|Melhor/.test(cab[1]), JSON.stringify(cab));
  await p.close(); }

/* 1.3 — nome de fornecedor e de item não viram HTML */
{ const m = JSON.parse(JSON.stringify(MAPA)); m.mapa.resumo.familias[0].fornecedores[0].nome = '<img src=x onerror="window.__x=1">';
  m.itens[0].descricao = '<b>x</b>';
  const p = await abrir(b, {mapa:m});
  ok('1.3 escapa', await p.locator('.cot-mapa img').count() === 0 && await p.locator('.cot-mapa th.item b').count() === 0 && !(await p.evaluate(()=>window.__x)));
  await p.close(); }

/* 1.5 — a cotação vem logo depois do resumo, antes dos itens (no fim ela ficava sob a barra) */
{ const p = await abrir(b);
  const ordem = await p.evaluate(() => [...document.querySelectorAll('main > section')].map(s => s.id || 'resumo'));
  ok('1.5 cotação antes dos itens', ordem.indexOf('cartaoCotacao') === 1 && ordem.indexOf('cartaoCotacao') < ordem.indexOf('cartaoItens'), ordem.join(','));
  await p.close(); }

/* 2 — aprovar: pelo banco, com a versão */
{ const p = await abrir(b);
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  const d = dec(p)[0];
  ok('2 decidir_pedido com versão', d && d.corpo.p_versao === 7 && d.corpo.p_decisao === 'aprovado' && d.corpo.p_id === ID, JSON.stringify(d));
  ok('2 não foi ao n8n', naoDecisaoN8n(p).length === 0);
  ok('2 barra diz aprovado', /Aprovado\./.test(await p.locator('#textoAprova').textContent()||''));
  ok('2 mostra a mensagem do banco', /aprovação financeira/.test(await p.locator('#textoAprova').textContent()||''));
  ok('2 botões somem', !(await p.locator('#btnAprovar').isVisible()) && !(await p.locator('#btnDevolver').isVisible()));
  await p.click('#btnAprovar', {force:true}).catch(()=>{}); await p.waitForTimeout(200);
  ok('2 sem segunda decisão', dec(p).length === 1, 'decidiu de novo');
  await p.close(); }

/* 3 — devolver: modo próprio, motivo obrigatório */
{ const p = await abrir(b);
  await p.click('#btnDevolver');
  ok('3 título devolver', /Devolver ao comprador/.test(await p.locator('#tituloModal').textContent()||''));
  ok('3 rótulo', /O que o comprador precisa rever/.test(await p.locator('#rotuloMotivo').textContent()||''));
  ok('3 nota', /Mesa de Cotação/.test(await p.locator('#notaMotivo').textContent()||''));
  await p.click('#btnConfirmarReprova');
  ok('3 vazio barrado', await p.locator('#erroMotivo').isVisible() && /precisa ser revisto/.test(await p.locator('#erroMotivo').textContent()||''));
  await p.fill('#motivoReprova', 'Negociar o frete antes de reenviar');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(400);
  const d = dec(p)[0];
  ok('3 devolvido com motivo', d && d.corpo.p_decisao === 'devolvido' && /frete/.test(d.corpo.p_motivo), JSON.stringify(d));
  ok('3 barra devolvido', /Devolvido ao comprador\./.test(await p.locator('#textoAprova').textContent()||''));
  await p.close(); }

/* 4 — cancelar o modal de devolver e reprovar: volta a ser reprovar */
{ const p = await abrir(b);
  await p.click('#btnDevolver'); await p.click('#btnCancelar');
  await p.click('#btnReprovar');
  ok('4 modo reprovar', /Reprovar solicitação/.test(await p.locator('#tituloModal').textContent()||'') &&
     (await p.locator('#btnConfirmarReprova').textContent()||'').trim() === 'Reprovar');
  ok('4 nota fala do histórico', /histórico do pedido/.test(await p.locator('#notaMotivo').textContent()||''));
  await p.fill('#motivoReprova', 'Temos esse rolamento no estoque');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(400);
  ok('4 reprovado', dec(p)[0] && dec(p)[0].corpo.p_decisao === 'reprovado');
  ok('4 barra reprovado', /Reprovado\./.test(await p.locator('#textoAprova').textContent()||''));
  await p.close(); }

/* 5 — versão mudou: não deixa decidir de novo e pede recarregar */
{ const p = await abrir(b, {decide:()=>({ok:false, erro:'versao_mudou', mensagem:'mudou'})});
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('5 avisa que foi alterado', /Este pedido foi alterado/.test(await p.locator('#textoAprova').textContent()||''));
  ok('5 pede recarregar', /Recarregue/.test(await p.locator('#textoAprova').textContent()||''));
  ok('5 sem botões', !(await p.locator('#btnAprovar').isVisible()));
  await p.close(); }

/* 6 — outra recusa: mostra a mensagem e deixa tentar de novo */
{ let n = 0;
  const p = await abrir(b, {decide:()=> (++n === 1 ? {ok:false, erro:'fora_da_vez', mensagem:'Não é a sua vez.'} : {ok:true})});
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('6 mostra a mensagem', /Não é a sua vez/.test(await p.locator('#textoAprova').textContent()||''));
  ok('6 botões voltam habilitados', await p.locator('#btnAprovar').isEnabled() && await p.locator('#btnDevolver').isVisible() && await p.locator('#btnDevolver').isEnabled());
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('6 segunda tentativa passa', dec(p).length === 2 && /Aprovado\./.test(await p.locator('#textoAprova').textContent()||''));
  await p.close(); }

/* 7 — liderança: sem devolver (não há cotação ainda) */
{ const p = await abrir(b, {ped:PED({etapa_atual:'lider'}), mapa:{ok:true, mapa:null}});
  ok('7 sem devolver na liderança', !(await p.locator('#btnDevolver').isVisible()));
  ok('7 sem cartão de cotação', !(await p.locator('#cartaoCotacao').isVisible()));
  await p.close(); }

/* 8 — mensal: devolver só no financeiro */
{ let p = await abrir(b, {ped:PED({tipo_compra:'mensal', etapa_atual:'gerencial'})});
  ok('8 mensal na gerencial sem devolver', !(await p.locator('#btnDevolver').isVisible()));
  await p.close();
  p = await abrir(b, {ped:PED({tipo_compra:'mensal', etapa_atual:'financeiro'})});
  ok('8 mensal no financeiro devolve', await p.locator('#btnDevolver').isVisible());
  await p.close(); }

/* 9 — em edição pelo facilitador: explica em vez de "não é com você" */
{ const p = await abrir(b, {ped:PED({etapa_atual:'edicao', em_edicao_desde:'2026-09-24T13:10:00Z'}), fila:[]});
  const t = await p.locator('#textoAprova').textContent() || '';
  ok('9 diz em edição', /Em edição pelo facilitador/.test(t), t);
  ok('9 diz até quando', /sozinho às \d\d:\d\d/.test(t), t);
  ok('9 sem botões', !(await p.locator('#btnAprovar').isVisible()));
  ok('9 sem decidir', dec(p).length === 0);
  await p.close(); }

/* 10 — pedido do ClickUp segue pelo n8n, sem cartão de cotação nem devolver */
{ const p = await abrir(b, {ped:PED({canal:'clickup', card_id:'card1'}), fila:[{id:ID, numero:'C2609-02001', etapa_atual:'gerencial', card_id:'card1'}]});
  ok('10 sem devolver', !(await p.locator('#btnDevolver').isVisible()));
  ok('10 sem pedido_telas', !p.__rpc.some(x => x.nome === 'pedido_telas'));
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('10 foi ao n8n', naoDecisaoN8n(p).length === 1, JSON.stringify(p.__n8n));
  ok('10 não chamou decidir_pedido', dec(p).length === 0);
  await p.close(); }

/* 11 — cotação que falha ao carregar não quebra a decisão */
{ const p = await abrir(b, {mapa:{ok:false, erro:'sem_acesso'}});
  ok('11 sem cartão', !(await p.locator('#cartaoCotacao').isVisible()));
  ok('11 botões seguem', await p.locator('#btnAprovar').isVisible());
  await p.close(); }

/* 13 — pedido das telas fora da fila: não passa pela porta do comprador do ClickUp */
{ const p = await abrir(b, {ped:PED({etapa_atual:'cotacao'}), fila:[]});
  ok('13 não perguntou decisao_permitida', !p.__rpc.some(x => x.nome === 'decisao_permitida'), JSON.stringify(p.__rpc.map(x=>x.nome)));
  ok('13 diz que não espera por ele', /não está esperando a sua aprovação/.test(await p.locator('#textoAprova').textContent()||''));
  ok('13 sem botões', !(await p.locator('#btnReprovar').isVisible()));
  ok('13 caminho de volta', await p.locator('#voltarTopo').isVisible());
  await p.close(); }

/* 12 — sem token (link de leitura): nada de decisão */
{ const p = await abrir(b, {token:''});
  ok('12 sem barra', !(await p.locator('#barraAprova').isVisible()));
  ok('12 sem cotação', !(await p.locator('#cartaoCotacao').isVisible()));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
