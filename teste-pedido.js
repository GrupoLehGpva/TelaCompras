const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const ARQ = 'file:///home/claude/TelaCompras/pedido.html';
const falhas = [];
const ok = (c,cond,det='') => { if(!cond) falhas.push(c + (det?' — '+det:'')); };

const SOL = {
  id:'11111111-1111-1111-1111-111111111111', numero:'SC-2026-0042',
  solicitante:'Maria de Souza', aberto_em:'2026-08-28T13:04:00Z',
  local_entrega:'G103', local_entrega_nome:null, centro_custo:'CC-103-MOR',
  tipo_compra:'programada', definicao_fornecedor:'unico',
  justificativa_fornecedor:'Só a concessionária fornece esta medida.',
  data_necessidade:'2026-09-15', motivo:'Reposição mensal da casa dos moradores',
  status:'solicitado'
};
const ITENS = [
  {codigo:'LP-0220', descricao:'Sabonete em barra 90 g', unidade:'Unidade', quantidade:30},
  {codigo:'LP-0304', descricao:'Vassoura de piaçava nº 4', unidade:'Unidade', quantidade:6},
  {codigo:'LP-0311', descricao:'Detergente neutro 5 L', unidade:'Litro', quantidade:20}
];
const SERVICO = [{codigo:null, descricao:'Manutenção do telhado do galpão de máquinas da Granja 103.', unidade:'Serviço', quantidade:1}];

async function abrir(b, {sol=SOL, itens=ITENS, url=ARQ+'?id='+SOL.id, tema='light'}={}){
  const p = await b.newPage({viewport:{width:1000,height:1000}, colorScheme:tema, deviceScaleFactor:2});
  p.on('pageerror', e=> falhas.push('ERRO DE PÁGINA: '+e.message));
  await mock.instalar(p, { pedido: sol, itens });
  await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(600);
  return p;
}

(async ()=>{
const b = await chromium.launch();

// 1 — lista de itens
{ const p = await abrir(b);
  ok('1 título traz o número', (await p.textContent('#tituloTopo')).includes('SC-2026-0042'));
  const ficha = await p.textContent('#fichaCabecalho');
  ok('1 centro legível', /Casa dos moradores/.test(ficha));
  ok('1 data em pt-BR', /15\/09\/2026/.test(ficha), ficha);
  ok('1 natureza lista', /Lista de itens/.test(ficha));
  ok('1 justificativa aparece', await p.locator('#cartaoJustificativa').isVisible());
  const linhas = await p.locator('#corpoTabela tr').count();
  ok('1 três linhas', linhas===3, 'linhas='+linhas);
  ok('1 soma das quantidades', /56/.test(await p.textContent('#soma')), await p.textContent('#soma'));
  await p.screenshot({path:'t-pedido-lista.png', fullPage:true});
  // filtro
  await p.fill('#filtro','detergente'); await p.waitForTimeout(150);
  ok('1 filtro reduz', (await p.locator('#corpoTabela tr').count())===1);
  ok('1 contagem mostra o recorte', /1 de 3/.test(await p.textContent('#contagem')));
  await p.fill('#filtro','zzz'); await p.waitForTimeout(150);
  ok('1 filtro sem resultado avisa', await p.locator('#tabelaVazia').isVisible());
  await p.fill('#filtro',''); await p.waitForTimeout(150);
  // ordenação
  await p.click('thead th[data-col="quantidade"]');
  let q1 = await p.locator('#corpoTabela tr td.num').first().textContent();
  await p.click('thead th[data-col="quantidade"]');
  let q2 = await p.locator('#corpoTabela tr td.num').first().textContent();
  ok('1 ordena crescente e decrescente', q1.trim()==='6' && q2.trim()==='30', q1+'/'+q2);
  await p.close(); }

// 2 — serviço
{ const p = await abrir(b, {itens:SERVICO});
  ok('2 escopo aparece', await p.locator('#cartaoEscopo').isVisible());
  ok('2 tabela some no serviço', !(await p.locator('#cartaoItens').isVisible()));
  const ficha = await p.textContent('#fichaCabecalho');
  ok('2 natureza serviço', /Escopo de serviço/.test(ficha));
  await p.screenshot({path:'t-pedido-servico.png', fullPage:true});
  await p.close(); }

// 3 — não encontrada
{ const p = await abrir(b, {sol:null});
  ok('3 avisa não encontrada', /não encontrada/i.test(await p.textContent('#erro')));
  await p.close(); }

// 4 — link sem parâmetro
{ const p = await abrir(b, {url:ARQ});
  ok('4 avisa link incompleto', /incompleto/i.test(await p.textContent('#erro')));
  await p.close(); }

// 5 — abrir por número
{ const p = await abrir(b, {url:ARQ+'?sc=SC-2026-0042'});
  ok('5 abre por número', (await p.textContent('#tituloTopo')).includes('SC-2026-0042'));
  await p.close(); }

// 6 — banco fora do ar
{ const p = await b.newPage({viewport:{width:900,height:800}});
  await p.route('**/rest/v1/**', r => r.fulfill({status:500, body:'erro interno'}));
  await p.goto(ARQ+'?id=x',{waitUntil:'load'}); await p.waitForTimeout(500);
  ok('6 erro de banco é explicado', /não consegui ler/i.test(await p.textContent('#erro')));
  await p.close(); }

// 7 — descrição com HTML não executa
{ const p = await abrir(b, {itens:[{codigo:'X', descricao:'<img src=x onerror=window.__XSS=1>', unidade:'Unidade', quantidade:1}]});
  ok('7 HTML na descrição não executa', !(await p.evaluate(()=> !!window.__XSS)));
  await p.close(); }

// 8 — tema escuro
{ const p = await abrir(b, {tema:'dark'});
  const fundo = await p.evaluate(()=> getComputedStyle(document.body).backgroundColor);
  ok('8 fundo escuro explícito', fundo === 'rgb(8, 19, 28)', fundo);
  await p.screenshot({path:'t-pedido-escuro.png'});
  await p.close(); }

// 9 — celular sem rolagem horizontal na página
{ const p = await b.newPage({viewport:{width:375,height:800}});
  await mock.instalar(p, { pedido: SOL, itens: ITENS });
  await p.goto(ARQ+'?id='+SOL.id,{waitUntil:'load'}); await p.waitForTimeout(600);
  const l = await p.evaluate(()=> ({doc:document.documentElement.scrollWidth, win:window.innerWidth}));
  ok('9 celular sem rolagem horizontal', l.doc <= l.win+1, JSON.stringify(l));
  await p.screenshot({path:'t-pedido-celular.png', fullPage:true});
  await p.close(); }

// 10 — CSV
{ const p = await abrir(b);
  const csv = await p.evaluate(()=>{
    const linhas = [['Código','Descrição','Unidade','Quantidade']]
      .concat(itensVisiveis().map(i => [i.codigo||'', i.descricao||'', i.unidade||'', String(i.quantidade||'').replace('.',',')]));
    return linhas.map(l=>l.join(';')).join('\n');
  });
  ok('10 CSV tem cabeçalho e 3 linhas', csv.split('\n').length===4, csv.split('\n').length+' linhas');
  await p.close(); }

// concordância da unidade na tabela do pedido
{ const p = await abrir(b, {itens:[
    {codigo:'A', descricao:'Um só',   unidade:'Unidade', quantidade:1},
    {codigo:'B', descricao:'Vários',  unidade:'Unidade', quantidade:30},
    {codigo:'C', descricao:'Litros',  unidade:'Litro',   quantidade:20},
    {codigo:'D', descricao:'Pares',   unidade:'Par',     quantidade:2},
    {codigo:'E', descricao:'Sigla',   unidade:'kg',      quantidade:10}]});
  // a tabela do pedido tem unidade e quantidade em colunas separadas
  const linhas = await p.locator('tbody tr').evaluateAll(trs =>
    trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())));
  const un = Object.fromEntries(linhas.map(c => [c[0], c.slice(1).join(' ')]));
  [['A','Unidade'],['B','Unidades'],['C','Litros'],['D','Pares'],['E','kg']].forEach(([cod,esp])=>
    ok('concordância ' + cod, (un[cod]||'').includes(esp),
       'esperava "' + esp + '" na linha ' + cod + ', veio: ' + (un[cod]||'(nada)')));
  ok('concordância sem singular errado', !/\bUnidade\b/.test(un['B']||''), 'linha B ficou no singular');
  await p.close(); }

// facilitador, solicitante e observação na tela do pedido
{ const p = await abrir(b, {sol: Object.assign({}, SOL, {
    facilitador:'Guilherme Pimpão', solicitante:'Alguém Antigo',
    solicitante_nome:'João da Silva — Granja 103',
    observacao:'Combinar com o Zé antes de descarregar.'})});
  const cab = await p.locator('#fichaCabecalho').textContent();
  ok('facilitador na ficha', /Guilherme Pimpão/.test(cab), 'sem facilitador: ' + cab.slice(0,140));
  ok('legado não aparece', !/Alguém Antigo/.test(cab), 'mostrou a coluna antiga');
  ok('solicitante na ficha', /João da Silva/.test(cab), 'sem solicitante');
  ok('cartão de observação', await p.locator('#cartaoObservacao').isVisible(), 'cartão de observação não apareceu');
  ok('texto da observação', /Combinar com o Zé/.test(await p.locator('#observacaoTexto').textContent()||''), 'observação vazia');
  await p.close(); }

// sem observação, o cartão não aparece
{ const p = await abrir(b, {sol: Object.assign({}, SOL, {facilitador:'Fulano'})});
  ok('sem observação, sem cartão', !(await p.locator('#cartaoObservacao').isVisible()), 'cartão apareceu vazio');
  await p.close(); }

/* ============================================================================
   BARRA DE APROVAÇÃO — só existe quando a tela é aberta pela fila
   ========================================================================== */
async function comFila(b, {fila, decisao={ok:true}, token='tk-brandao', id=SOL.id, demora=0}={}){
  const p = await b.newPage();
  p.__chamadas = [];
  await mock.instalar(p, { pedido: SOL, itens: ITENS, fila: fila||[] });
  /* Grava o CORPO, não a query: a tela manda POST com JSON. Se alguém voltar a
     mandar por query string, estes testes param de ver o que precisam ver e
     falham — que é o comportamento certo. */
  await p.route('**n8n.cloud/**', r => {
    let corpo = {};
    try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = { __sem_corpo: r.request().url() }; }
    p.__chamadas.push(corpo);
    if(decisao === 'cai') return r.abort();
    /* `demora` segura a resposta: é o único jeito de testar o que a tela mostra
       ENQUANTO espera — o estado que o usuário sempre vê e ninguém testa. */
    const responder = () => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(decisao)});
    if(demora) return new Promise(res => setTimeout(()=>{ responder(); res(); }, demora));
    return responder();
  });
  await p.goto(ARQ + '?id=' + id + (token ? '&t=' + token + '&e=lider' : ''), {waitUntil:'load'});
  await p.waitForTimeout(900);
  return p;
}
const NA_FILA = [{id:SOL.id, numero:SOL.numero, card_id:'card-1', etapa_atual:'lider'}];

// sem token, nenhuma barra
{ const p = await comFila(b, {fila:NA_FILA, token:''});
  ok('aprovação sem token não aparece', !(await p.locator('#barraAprova').isVisible()), 'barra apareceu sem token');
  await p.close(); }

// com token, mas o pedido não está na fila daquela pessoa
{ const p = await comFila(b, {fila:[]});
  ok('fora da fila ainda volta', await p.locator('#voltarTopo').isVisible(), 'quem clicou na linha errada ficou sem saída');
  ok('fora da fila avisa', await p.locator('#barraAprova').isVisible(), 'não avisou');
  ok('fora da fila sem botões', !(await p.locator('#btnAprovar').isVisible()), 'mostrou botão para quem não é o aprovador');
  ok('fora da fila explica', /não está esperando a sua aprovação/.test(await p.locator('#textoAprova').textContent()||''), 'texto: ' + await p.locator('#textoAprova').textContent());
  await p.close(); }

// na fila: botões aparecem
{ const p = await comFila(b, {fila:NA_FILA});
  ok('na fila mostra botões', await p.locator('#btnAprovar').isVisible() && await p.locator('#btnReprovar').isVisible(), 'sem botões');
  ok('volta para a fila', /aprovacoes\.html\?t=tk-brandao/.test(await p.locator('#voltarTopo').getAttribute('href')||''), 'link: ' + await p.locator('#voltarTopo').getAttribute('href'));
  ok('voltar aparece', await p.locator('#voltarTopo').isVisible(), 'o caminho de volta não apareceu');
  // Pedido para o Grupo Leh: o voltar fica no alto e à esquerda, não no rodapé.
  { const v = await p.locator('#voltarTopo').boundingBox();
    const t = await p.locator('table, section, main').first().boundingBox();
    ok('voltar fica acima do conteúdo', v && t && v.y < t.y, 'voltar em y=' + (v&&v.y) + ', conteúdo em y=' + (t&&t.y));
    ok('voltar fica à esquerda', v && v.x < 200, 'voltar em x=' + (v&&v.x)); }
  await p.click('#btnAprovar'); await p.waitForTimeout(700);
  ok('aprovar chama o endpoint', p.__chamadas.length === 1, 'chamadas: ' + p.__chamadas.length);
  ok('aprovar manda o certo', p.__chamadas[0] && p.__chamadas[0].card_id === 'card-1'
     && p.__chamadas[0].decisao === 'aprovado' && p.__chamadas[0].etapa === 'lider'
     && p.__chamadas[0].token === 'tk-brandao' && p.__chamadas[0].solicitacao_id === SOL.id,
     'corpo: ' + JSON.stringify(p.__chamadas[0]));
  ok('mostra o resultado', /Aprovado\./.test(await p.locator('#textoAprova').textContent()||''), 'texto: ' + await p.locator('#textoAprova').textContent());
  ok('botões somem depois', !(await p.locator('#btnAprovar').isVisible()), 'botão continuou');
  await p.close(); }

// o que a barra mostra ENQUANTO o servidor não respondeu
{ const p = await comFila(b, {fila:NA_FILA, demora:1500});
  await p.click('#btnAprovar');
  await p.waitForTimeout(350);
  const t = await p.locator('#textoAprova').textContent() || '';
  ok('avisa que está registrando', /Registrando/.test(t), 'texto: ' + t);
  ok('mostra a rodinha', await p.locator('#textoAprova .girando').count() === 1, 'sem indicador de movimento');
  ok('botões escondidos', !(await p.locator('#btnAprovar').isVisible()), 'dava para clicar de novo enquanto enviava');
  await p.waitForTimeout(1600);
  ok('vira resultado', /Aprovado\./.test(await p.locator('#textoAprova').textContent()||''),
     'ficou preso em Registrando: ' + await p.locator('#textoAprova').textContent());
  await p.close(); }

// reprovar exige motivo
{ const p = await comFila(b, {fila:NA_FILA});
  await p.click('#btnReprovar'); await p.waitForTimeout(250);
  ok('reprovar abre a caixa', await p.locator('#fundoModal').isVisible(), 'caixa não abriu');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
  ok('barra sem motivo', await p.locator('#erroMotivo').isVisible(), 'aceitou sem motivo');
  ok('nada enviado', p.__chamadas.length === 0, 'mandou sem motivo');
  await p.fill('#motivoReprova', 'curto'); await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
  ok('barra motivo curto', p.__chamadas.length === 0, 'mandou com motivo curto');
  await p.fill('#motivoReprova', 'Já temos esse item em estoque na Granja 103.');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(700);
  ok('reprovar manda o motivo', /estoque na Granja 103/.test((p.__chamadas[0]||{}).motivo||''), 'corpo: ' + JSON.stringify(p.__chamadas[0]));
  ok('reprovar vai como reprovado', (p.__chamadas[0]||{}).decisao === 'reprovado', 'decisao: ' + (p.__chamadas[0]||{}).decisao);
  ok('reprovar leva o token do aprovador', (p.__chamadas[0]||{}).token === 'tk-brandao', 'token: ' + (p.__chamadas[0]||{}).token);
  ok('mostra reprovado', /Reprovado\./.test(await p.locator('#textoAprova').textContent()||''), 'texto: ' + await p.locator('#textoAprova').textContent());
  await p.close(); }

// Esc e Cancelar fecham sem decidir
for(const modo of ['esc','cancelar']){
  const p = await comFila(b, {fila:NA_FILA});
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  if(modo==='esc') await p.keyboard.press('Escape'); else await p.click('#btnCancelar');
  await p.waitForTimeout(250);
  ok('fecha por ' + modo, !(await p.locator('#fundoModal').isVisible()), 'caixa ficou aberta');
  ok(modo + ' não decide', p.__chamadas.length === 0, 'decidiu ao fechar');
  ok(modo + ' mantém os botões', await p.locator('#btnAprovar').isVisible(), 'perdeu os botões');
  await p.close();
}

// servidor recusa: botões voltam para tentar de novo
{ const p = await comFila(b, {fila:NA_FILA, decisao:{ok:false, mensagem:'esta solicitação já foi decidida'}});
  await p.click('#btnAprovar'); await p.waitForTimeout(700);
  ok('recusa avisa', /já foi decidida/.test(await p.locator('#textoAprova').textContent()||''), 'texto: ' + await p.locator('#textoAprova').textContent());
  ok('recusa devolve os botões', await p.evaluate(()=>!document.getElementById('btnAprovar').disabled), 'botão ficou travado');
  await p.close(); }

// endpoint fora do ar
{ const p = await comFila(b, {fila:NA_FILA, decisao:'cai'});
  await p.click('#btnAprovar'); await p.waitForTimeout(900);
  ok('rede caiu avisa', /Não consegui registrar/.test(await p.locator('#textoAprova').textContent()||''), 'texto: ' + await p.locator('#textoAprova').textContent());
  ok('rede caiu devolve os botões', await p.evaluate(()=>!document.getElementById('btnAprovar').disabled), 'botão ficou travado');
  await p.close(); }

// duplo clique não decide duas vezes
{ const p = await comFila(b, {fila:NA_FILA});
  await Promise.all([
    p.click('#btnAprovar', {timeout:3000}).catch(()=>{}),
    p.click('#btnAprovar', {force:true, timeout:3000}).catch(()=>{})
  ]);
  await p.waitForTimeout(900);
  ok('duplo clique manda uma vez', p.__chamadas.length === 1, 'chamadas: ' + p.__chamadas.length);
  await p.close(); }

// a fila fora do ar não pode derrubar a leitura do pedido
{ const p = await b.newPage();
  await mock.instalar(p, { pedido: SOL, itens: ITENS });
  await p.route('**/rest/v1/rpc/fila_de_aprovacao**', r => r.abort());
  await p.goto(ARQ + '?id=' + SOL.id + '&t=tk-brandao&e=lider', {waitUntil:'load'});
  await p.waitForTimeout(900);
  ok('pedido abre mesmo sem a fila', await p.locator('#conteudo').isVisible(), 'a tela do pedido quebrou');
  ok('sem fila, sem barra', !(await p.locator('#barraAprova').isVisible()), 'mostrou barra sem conseguir conferir a fila');
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ '+f));
})();
