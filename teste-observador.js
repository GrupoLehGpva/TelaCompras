/* ============================================================================
   MODO OBSERVADOR (01/10)
   aprovacoes.html?o=<token do funil>&a=<aprovador> e pedido.html?…&o=&a=
   Mostram a tela real do aprovador, sem o token dele e sem decidir nada.
   Tudo passa por observar_como; nenhuma chamada de decisão sai da tela.
   ========================================================================== */
const { chromium } = require('playwright');
const APROV = 'file://' + __dirname + '/aprovacoes.html';
const PEDIDO = 'file://' + __dirname + '/pedido.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + (d||''));

const ID = '22222222-2222-2222-2222-222222222222';
const hoje = new Date().toISOString();
const FILA = {
  'a-brandao': [
    {id:ID, numero:'C2609-00003', card_id:null, etapa_atual:'gerencial', facilitador:'Alisson',
     centro_custo:'20', centro_custo_nome:'FABRICA', tipo_compra:'normal', data_necessidade:'2026-12-01',
     motivo:'Notebooks', aberto_em:hoje, total_itens:2, valor_cotado:'20440.00', fornecedor_cotado:'SMARTECH'},
    {id:'t2', numero:'C2610-00001', card_id:null, etapa_atual:'lider', facilitador:'Ana',
     centro_custo:'20', centro_custo_nome:'FABRICA', tipo_compra:'normal', data_necessidade:'2026-12-01',
     motivo:'Luvas', aberto_em:hoje, total_itens:1}],
  'junior': [
    {id:'j1', numero:'C2609-00024', card_id:null, etapa_atual:'gerencial', facilitador:'Paulo',
     centro_custo:'30', centro_custo_nome:'LOJA', tipo_compra:'normal', data_necessidade:'2026-12-01',
     motivo:'Tintas', aberto_em:hoje, total_itens:1, valor_cotado:'500.00', fornecedor_cotado:'X'}]
};
const APROVADORES = [
  {id:'a-brandao', nome:'ALVARO BRANDAO FILHO', etapas:['lider','gerencial'], na_fila:2},
  {id:'junior', nome:'JOSE DE CARVALHO JUNIOR', etapas:['lider','gerencial'], na_fila:1},
  {id:'wienfried', nome:'WIENFRIED MATTHIAS LEH', etapas:['financeiro'], na_fila:0}];
const MAPA = { ok:true, observador:true, pode:{aprovar:false, reprovar:false, devolver:false},
  itens:[{id:'i1', codigo:'1201', descricao:'NOTEBOOK', unidade:'UNID', quantidade:2, familia:'TI'}],
  mapa:{ estado:'enviado', precos:[{item_id:'i1',coluna:1,preco:10220}], escolhas:[{item_id:'i1',coluna:1}],
    resumo:{ total:20440, avisos:[], familias:[{familia:'TI', total:20440, fornecedores:[
      {coluna:1, nome:'SMARTECH', itens_ganhos:1, desconto_pct:0, frete:0, prazo_dias:10, condicao:'28 dias', total:20440}]}]}}};
const PED = { id:ID, numero:'C2609-00003', canal:'telas', versao:4, etapa_atual:'gerencial', solicitante:'Alisson',
  aberto_em:'2026-09-20T13:00:00Z', centro_custo:'20', tipo_compra:'normal', definicao_fornecedor:'cotacao',
  data_necessidade:'2026-12-01', motivo:'Notebooks', empresa_id:'wienfried-pr', status:'aguardando aprovacao' };

/* O mock imita observar_como: confere o token do funil e responde como o banco. */
function rotear(p, {acesso=true}={}){
  p.__rpc = []; p.__n8n = [];
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  return Promise.all([
    p.route('**/rest/v1/**', r => {
      const u = r.request().url();
      const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
      if(!u.includes('/rpc/')) return j([]);
      const nome = u.split('/rpc/')[1].split('?')[0];
      let c = {}; try{ c = JSON.parse(r.request().postData()||'{}'); }catch(e){}
      p.__rpc.push({nome, corpo:c});
      if(nome === 'abrir_pedido') return j({ok:true, pedido:PED, itens:[{codigo:'1201',descricao:'NOTEBOOK',unidade:'UNID',quantidade:2}], anexos:[]});
      if(nome !== 'observar_como') return j({ok:false, erro:'chamada_fora_do_observador:' + nome});
      if(!acesso || c.p_token !== 'pa-obs') return j({ok:false, erro:'sem_acesso'});
      if(c.p_funcao === 'aprovadores') return j({ok:true, observador:'Guilherme', aprovadores:APROVADORES});
      const ap = APROVADORES.find(a => a.id === c.p_aprovador);
      if(!ap) return j({ok:false, erro:'aprovador_nao_encontrado'});
      if(c.p_funcao === 'aprovador_do_token') return j([{id:ap.id, nome:ap.nome, etapas:ap.etapas}]);
      if(c.p_funcao === 'fila_de_aprovacao') return j(FILA[ap.id] || []);
      if(c.p_funcao === 'fila_do_aprovador') return j({ok:true, pedidos:(FILA[ap.id]||[]).map(s => ({id:s.id, canal:'telas', versao:4, pode_devolver:s.etapa_atual==='gerencial'})), em_edicao:[]});
      if(c.p_funcao === 'historico_de_aprovacoes') return j([{id:'h1', numero:'C2609-00020', etapa:'gerencial', resposta:'aprovado', decidido_em:hoje, aberto_em:hoje, facilitador:'X', centro_custo_nome:'FABRICA', situacao:'aprovado', fui_eu:true}]);
      if(c.p_funcao === 'pedido_telas') return j(MAPA);
      return j({ok:false, erro:'funcao_nao_permitida'});
    }),
    p.route('**n8n.cloud/**', r => { p.__n8n.push(r.request().url()); r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"arquivos":[]}'}); })
  ]);
}
const decisoes = p => p.__rpc.filter(x => /decidir|decisao_permitida/.test(x.nome) || /decidir|decisao/.test(x.corpo.p_funcao || '')).length + p.__n8n.filter(u => /decisao/.test(u)).length;
const semToken = p => p.__rpc.every(x => !('p_token' in x.corpo) || x.corpo.p_token === 'pa-obs' || x.nome === 'abrir_pedido');

(async () => {
const b = await chromium.launch();

/* 1 — sem ?a=: abre a fila de quem tem mais pedidos, com a faixa e a lista */
{ const p = await b.newPage({viewport:{width:1440,height:900}}); await rotear(p);
  await p.goto(APROV + '?o=pa-obs', {waitUntil:'load'}); await p.waitForTimeout(600);
  ok('1 faixa do observador', await p.locator('#faixaObs').isVisible());
  ok('1 abre a do Brandão (mais na fila)', await p.locator('#obsAprovador').inputValue() === 'a-brandao');
  const ops = await p.locator('#obsAprovador option').allTextContents();
  ok('1 três aprovadores com etapas e contagem', ops.length === 3 && /Gerencial/.test(ops[0]) && /2 na fila/.test(ops[0]) && /Financeiro/.test(ops[2]), JSON.stringify(ops));
  ok('1 título com o nome', /ALVARO BRANDAO FILHO/.test(await p.locator('#tituloTopo').textContent()));
  ok('1 as duas linhas da fila', await p.locator('#corpoFila tr').count() === 2);
  ok('1 valor cotado aparece', /20\.440,00/.test(await p.locator('#corpoFila').textContent()));
  /* 2 — botões aparecem como para o gerente, desligados */
  const bts = p.locator('#corpoFila .btn-linha');
  ok('2 botões visíveis (aprovar, reprovar, devolver)', await bts.count() === 5, String(await bts.count()));
  ok('2 todos desligados', await bts.evaluateAll(l => l.every(b => b.disabled)));
  ok('2 caixas de seleção desligadas', await p.locator('#corpoFila input[type=checkbox]').evaluateAll(l => l.every(c => c.disabled)) && await p.locator('#marcarTodas').isDisabled());
  ok('2 aprovar selecionadas desligado', await p.locator('#btnLote').isDisabled());
  await bts.first().click({force:true}); await p.waitForTimeout(200);
  ok('2 clique forçado não abre nada', await p.locator('#fundoModal').isHidden() && decisoes(p) === 0);
  await p.evaluate(() => { decidir(FILA, 'aprovado', ''); abrirReprova(FILA[0], 'reprovar'); }); await p.waitForTimeout(200);
  ok('2 nem chamando a função por dentro', await p.locator('#fundoModal').isHidden() && decisoes(p) === 0);
  /* 3 — link do pedido leva o acesso do observador, não token */
  const href = await p.locator('#corpoFila a.numero-sc').first().getAttribute('href');
  ok('3 link do pedido com o=&a=', /[?&]o=pa-obs/.test(href) && /[?&]a=a-brandao/.test(href) && !/[?&]t=/.test(href), href);
  /* 4 — histórico pelo observador */
  await p.click('#abaHist'); await p.waitForTimeout(300);
  ok('4 histórico carrega', /C2609-00020/.test(await p.locator('#corpoHist').textContent()));
  const hl = await p.locator('#corpoHist a').first().getAttribute('href');
  ok('4 link do histórico com o=&a=', /o=pa-obs/.test(hl) && !/[?&]t=/.test(hl), hl);
  ok('4 só observar_como com o token do funil', semToken(p) && p.__rpc.every(x => x.nome === 'observar_como'));
  /* 5 — trocar o aprovador recarrega com ?a= */
  await p.selectOption('#obsAprovador', 'junior'); await p.waitForTimeout(700);
  ok('5 trocou para o Junior', /a=junior/.test(p.url()) && /JOSE DE CARVALHO/.test(await p.locator('#tituloTopo').textContent()) && await p.locator('#corpoFila tr').count() === 1, p.url());
  await p.close(); }

/* 6 — aprovador sem fila: lista vazia, sem erro */
{ const p = await b.newPage(); await rotear(p);
  await p.goto(APROV + '?o=pa-obs&a=wienfried', {waitUntil:'load'}); await p.waitForTimeout(600);
  ok('6 fila vazia do Wienfried', await p.locator('#filaVazia').isVisible() && await p.locator('#obsAprovador').inputValue() === 'wienfried');
  await p.close(); }

/* 7 — link sem acesso ao observador */
{ const p = await b.newPage(); await rotear(p, {acesso:false});
  await p.goto(APROV + '?o=pa-qualquer', {waitUntil:'load'}); await p.waitForTimeout(600);
  ok('7 recusa com mensagem', await p.locator('#erro').isVisible() && /modo observador/.test(await p.locator('#erro').textContent()) && await p.locator('#conteudo').isHidden());
  await p.close(); }

/* 8 — ?t= continua sendo o aprovador normal (o=… é ignorado) */
{ const p = await b.newPage(); p.__rpc = [];
  await p.route('**/rest/v1/rpc/**', r => { const n = r.request().url().split('/rpc/')[1]; p.__rpc.push(n);
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(n === 'aprovador_do_token') return j([{id:'g', nome:'Gerente', etapas:['gerencial']}]);
    if(n === 'fila_de_aprovacao') return j(FILA['a-brandao']);
    return j({ok:true, pedidos:[], em_edicao:[]}); });
  await p.goto(APROV + '?t=ap-x&o=pa-obs', {waitUntil:'load'}); await p.waitForTimeout(900);
  ok('8 aprovador normal: sem faixa', await p.locator('#faixaObs').isHidden());
  const lig = await p.locator('#corpoFila .btn-linha').evaluateAll(l => l.map(b => b.disabled));
  ok('8 aprovador normal: botões ligados', lig.length > 0 && lig.every(d => !d), JSON.stringify(lig));
  ok('8 aprovador normal: não chama observar_como', !p.__rpc.includes('observar_como'), JSON.stringify(p.__rpc));
  await p.close(); }

/* 9 — tela do pedido no modo observador */
{ const p = await b.newPage({viewport:{width:1100,height:1000}}); await rotear(p);
  await p.goto(PEDIDO + '?id=' + ID + '&o=pa-obs&a=a-brandao&e=gerencial', {waitUntil:'load'}); await p.waitForTimeout(800);
  ok('9 barra do observador', await p.locator('#barraAprova').isVisible() && /Modo observador/.test(await p.locator('#textoAprova').textContent()));
  ok('9 três botões visíveis e desligados', await p.locator('#btnAprovar').isVisible() && await p.locator('#btnReprovar').isVisible() &&
     await p.locator('#btnDevolver').isVisible() && await p.locator('#btnAprovar').isDisabled() && await p.locator('#btnReprovar').isDisabled() && await p.locator('#btnDevolver').isDisabled());
  ok('9 mapa da cotação aparece', await p.locator('#cartaoCotacao').isVisible() && /SMARTECH/.test(await p.locator('#cotacaoCorpo').textContent()));
  await p.locator('#btnAprovar').click({force:true}); await p.locator('#btnReprovar').click({force:true}); await p.waitForTimeout(200);
  await p.evaluate(() => { decidir('aprovado', ''); abrirReprova('reprovar'); }); await p.waitForTimeout(200);
  ok('9 nada decide nem abre o motivo', decisoes(p) === 0 && await p.locator('#fundoModal').isHidden());
  const volta = await p.locator('#voltarTopo').getAttribute('href');
  ok('9 voltar leva à fila do observador', /aprovacoes\.html\?o=pa-obs&a=a-brandao/.test(volta), volta);
  ok('9 só observar_como e abrir_pedido', p.__rpc.every(x => ['observar_como','abrir_pedido'].includes(x.nome)) && semToken(p), JSON.stringify(p.__rpc.map(x=>x.nome)));
  await p.close(); }

/* 10 — pedido que não está na fila do aprovador observado */
{ const p = await b.newPage(); await rotear(p);
  await p.goto(PEDIDO + '?id=' + ID + '&o=pa-obs&a=junior', {waitUntil:'load'}); await p.waitForTimeout(800);
  ok('10 avisa que não está na fila deste aprovador', /não está na fila deste aprovador/.test(await p.locator('#textoAprova').textContent()) &&
     await p.locator('#btnAprovar').isHidden());
  ok('10 sem decisao_permitida', !p.__rpc.some(x => x.nome === 'decisao_permitida'));
  await p.close(); }

/* 11 — pedido.html sem a= não liga o observador (fica só leitura simples) */
{ const p = await b.newPage(); await rotear(p);
  await p.goto(PEDIDO + '?id=' + ID + '&o=pa-obs', {waitUntil:'load'}); await p.waitForTimeout(700);
  ok('11 sem barra de decisão', await p.locator('#barraAprova').isHidden() && !p.__rpc.some(x => x.nome === 'observar_como'));
  await p.close(); }

/* 12 — celular: faixa cabe sem rolagem lateral */
{ const p = await b.newPage({viewport:{width:390,height:800}}); await rotear(p);
  await p.goto(APROV + '?o=pa-obs', {waitUntil:'load'}); await p.waitForTimeout(600);
  const bx = await p.locator('#faixaObs').boundingBox();
  ok('12 faixa dentro da tela no celular', bx && bx.x >= 0 && bx.x + bx.width <= 390, JSON.stringify(bx));
  await p.close(); }

await b.close();
console.log(falhas.length ? 'FALHAS (' + falhas.length + ')\n' + falhas.join('\n') : 'FALHAS (0) — modo observador ok');
process.exit(falhas.length ? 1 : 0);
})();
