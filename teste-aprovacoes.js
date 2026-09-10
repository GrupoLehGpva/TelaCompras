/* ============================================================================
   BATERIA DA FILA DE APROVAÇÃO — todos os botões, todos os desfechos.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/aprovacoes.html';
const falhas = [], notas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

const hoje  = new Date().toISOString();
const ontem = new Date(Date.now() - 2*864e5).toISOString();
const FILA = [
  {id:'a1', numero:'SC-2026-1001', card_id:'c1', etapa_atual:'lider',
   facilitador:'Guilherme Pimpão', solicitante_nome:'João da Silva',
   centro_custo:'20', centro_custo_nome:'FABRICA DE RAÇÕES', tipo_compra:'urgente',
   data_necessidade:'2026-12-01', motivo:'Pneu careca reprovado na inspeção',
   observacao:null, aberto_em:hoje, total_itens:2},
  {id:'a2', numero:'SC-2026-1002', card_id:'c2', etapa_atual:'gerencial',
   facilitador:'Maria de Souza', solicitante_nome:null,
   centro_custo:'1994', centro_custo_nome:'CONFINAMENTO DE BOVINOS', tipo_compra:'normal',
   data_necessidade:'2026-11-10', motivo:'Reposição de sal mineral',
   observacao:null, aberto_em:ontem, total_itens:5},
  {id:'a3', numero:'SC-2026-1003', card_id:'c3', etapa_atual:'lider',
   facilitador:'Ana Paula', solicitante_nome:null,
   centro_custo:'3176', centro_custo_nome:'COMERCIAL', tipo_compra:'programada',
   data_necessidade:'2026-10-05', motivo:'Material de escritório do trimestre',
   observacao:null, aberto_em:ontem, total_itens:9}
];
const QUEM = [{id:'brandao', nome:'Brandão', etapas:['lider','gerencial']}];

let TOKEN_ATUAL = 'tk-brandao';
async function tela(b, {token='tk-brandao', quem=QUEM, fila=FILA, decisao={ok:true}, falhaRpc=null, demora=0}={}){
  TOKEN_ATUAL = token;
  const p = await b.newPage();
  p.__posts = [];
  await p.route('**/rest/v1/rpc/**', r => {
    const u = r.request().url();
    if(falhaRpc) return r.fulfill({status:500,contentType:'application/json',body:'{"message":"boom"}'});
    if(u.includes('aprovador_do_token'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(quem)});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fila)});
  });
  await p.route('**n8n.cloud/**', r => {
    /* O corpo de verdade, não uma reconstrução. Esta bateria já traduzia query
       string para o formato que ela esperava — e por isso não enxergou que a
       tela e o endpoint falavam línguas diferentes. Agora o que o teste vê é o
       que o servidor receberia. */
    let corpo = {};
    try { corpo = JSON.parse(r.request().postData() || '{}'); }
    catch(e){ corpo = { __nao_era_json: r.request().url() }; }
    p.__posts.push(Object.assign({ metodo: r.request().method() }, corpo));
    if(decisao === 'cai') return r.abort();
    if(decisao === 500)   return r.fulfill({status:500,contentType:'application/json',body:'{}'});
    /* `demora` segura a resposta para dar tempo de observar o que a tela mostra
       ENQUANTO espera — que é o estado que ninguém testa e o usuário sempre vê. */
    const responder = () => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(decisao)});
    if(demora) return new Promise(res => setTimeout(()=>{ responder(); res(); }, demora));
    return responder();
  });
  await p.goto(base + (token ? '?t=' + encodeURIComponent(token) : ''), {waitUntil:'load'});
  await p.waitForTimeout(600);
  return p;
}
const linhas = p => p.locator('#corpoFila tr').count();

(async () => {
const b = await chromium.launch();

/* 1 — sem token */
let p = await tela(b, {token:''});
ok('1 sem token avisa', await p.locator('#erro').isVisible(), 'não avisou');
ok('1 sem token explica', /precisa vir do aviso que você recebe no Slack/.test(await p.locator('#erro').textContent()||''), 'texto: ' + await p.locator('#erro').textContent());
ok('1 sem token sem fila', !(await p.locator('#conteudo').isVisible()), 'mostrou a fila sem token');
await p.close();

/* 2 — token desconhecido */
p = await tela(b, {quem:[]});
ok('2 token estranho avisa', /Não reconheci este link/.test(await p.locator('#erro').textContent()||''), 'texto: ' + await p.locator('#erro').textContent());
ok('2 token estranho sem fila', !(await p.locator('#conteudo').isVisible()), 'mostrou fila de alguém');
await p.close();

/* 3 — banco fora do ar */
p = await tela(b, {falhaRpc:true});
ok('3 banco fora avisa', await p.locator('#erro').isVisible(), 'tela em branco com o banco fora');
await p.close();

/* 4 — a fila carrega */
p = await tela(b);
ok('4 três linhas', (await linhas(p)) === 3, 'linhas: ' + await linhas(p));
ok('4 nome do aprovador', (await p.locator('#seloAprovador').textContent()) === 'Brandão', 'selo: ' + await p.locator('#seloAprovador').textContent());
ok('4 título com o nome', /Brandão/.test(await p.locator('#tituloTopo').textContent()||''), 'título errado');
ok('4 total na fila', /3 na fila/.test(await p.locator('#seloTotal').textContent()||''), 'total: ' + await p.locator('#seloTotal').textContent());
ok('4 selo de hoje', (await p.locator('.hoje').count()) === 1, 'selos "hoje": ' + await p.locator('.hoje').count());
ok('4 etapa por linha', (await p.locator('.etapa.lider').count()) === 2 && (await p.locator('.etapa.gerencial').count()) === 1, 'etapas erradas');
ok('4 link do pedido', /pedido\.html\?id=a1&t=tk-brandao&e=lider/.test(await p.locator('#corpoFila a').first().getAttribute('href')||''), 'link: ' + await p.locator('#corpoFila a').first().getAttribute('href'));
ok('4 lote começa travado', await p.locator('#btnLote').isDisabled(), 'botão de lote veio habilitado sem seleção');
ok('4 vazio escondido', !(await p.locator('#filaVazia').isVisible()), 'mostrou o vazio com fila cheia');

/* 5 — filtro */
await p.fill('#filtro', 'pneu'); await p.waitForTimeout(200);
ok('5 filtra por assunto', (await linhas(p)) === 1, 'linhas: ' + await linhas(p));
await p.fill('#filtro', 'CONFINAMENTO'); await p.waitForTimeout(200);
ok('5 filtra por centro', (await linhas(p)) === 1, 'linhas: ' + await linhas(p));
await p.fill('#filtro', 'Ana'); await p.waitForTimeout(200);
ok('5 filtra por quem pediu', (await linhas(p)) === 1, 'linhas: ' + await linhas(p));
await p.fill('#filtro', 'zzzzz'); await p.waitForTimeout(200);
ok('5 filtro sem resultado', (await linhas(p)) === 0 && await p.locator('#filaVazia').isVisible(), 'não mostrou o vazio');
ok('5 vazio de filtro tem outro texto', /Nada com esse filtro/.test(await p.locator('#filaVazia b').textContent()||''), 'texto: ' + await p.locator('#filaVazia b').textContent());
await p.fill('#filtro', ''); await p.waitForTimeout(200);
ok('5 limpar filtro volta tudo', (await linhas(p)) === 3, 'linhas: ' + await linhas(p));

/* 6 — chips */
await p.click('#chipHoje'); await p.waitForTimeout(200);
ok('6 só de hoje', (await linhas(p)) === 1, 'linhas: ' + await linhas(p));
ok('6 chip fica ativo', await p.locator('#chipHoje.ativo').count() === 1, 'chip não marcou');
await p.click('#chipTodas'); await p.waitForTimeout(200);
ok('6 volta para todas', (await linhas(p)) === 3, 'linhas: ' + await linhas(p));

/* 7 — seleção */
await p.locator('#corpoFila input[type=checkbox]').first().check(); await p.waitForTimeout(150);
ok('7 lote habilita', !(await p.locator('#btnLote').isDisabled()), 'lote continuou travado');
ok('7 lote conta 1', /Aprovar 1 selecionada/.test(await p.locator('#btnLote').textContent()||''), 'texto: ' + await p.locator('#btnLote').textContent());
ok('7 linha destacada', (await p.locator('#corpoFila tr.marcada').count()) === 1, 'linha não destacou');
await p.click('#marcarTodas'); await p.waitForTimeout(150);
ok('7 marcar todas', /Aprovar 3 selecionadas/.test(await p.locator('#btnLote').textContent()||''), 'texto: ' + await p.locator('#btnLote').textContent());
await p.click('#marcarTodas'); await p.waitForTimeout(150);
ok('7 desmarcar todas', await p.locator('#btnLote').isDisabled(), 'não desmarcou');
await p.close();

/* 8 — aprovar uma linha */
p = await tela(b);
await p.locator('#corpoFila .btn-linha.sim').first().click();
await p.waitForTimeout(600);
ok('8 saiu da fila', (await linhas(p)) === 2, 'linhas: ' + await linhas(p));
ok('8 aviso verde', /aprovada/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso: ' + await p.locator('#avisoTopo').textContent());
{ const env = p.__posts[0] || {};
  ok('8 vai por POST', env.metodo === 'POST', 'método: ' + env.metodo);
  ok('8 mandou o certo', env.token==='tk-brandao' && env.solicitacao_id==='a1' &&
     env.card_id==='c1' && env.etapa==='lider' && env.decisao==='aprovado' && env.motivo==='',
     'payload: ' + JSON.stringify(env));
  /* O token é o que o servidor confere contra o banco (decisao_permitida).
     Sem ele o endpoint recusa — e sem este teste ninguém percebe se sumir. */
  ok('8 leva o token do aprovador', !!env.token, 'foi sem token'); }
ok('8 total atualiza', /2 na fila/.test(await p.locator('#seloTotal').textContent()||''), 'total: ' + await p.locator('#seloTotal').textContent());
await p.close();

/* 9 — aprovar em lote */
p = await tela(b);
await p.click('#marcarTodas'); await p.waitForTimeout(150);
await p.click('#btnLote'); await p.waitForTimeout(900);
ok('9 fila esvazia', (await linhas(p)) === 0, 'linhas: ' + await linhas(p));
ok('9 três chamadas', p.__posts.length === 3, 'chamadas: ' + p.__posts.length);
ok('9 aviso plural', /3 solicitações aprovadas/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso: ' + await p.locator('#avisoTopo').textContent());
ok('9 vazio aparece', await p.locator('#filaVazia').isVisible(), 'não mostrou o vazio');
ok('9 lote volta a travar', await p.locator('#btnLote').isDisabled(), 'lote continuou habilitado');
await p.close();

/* 10 — reprovar: motivo obrigatório */
p = await tela(b);
await p.locator('#corpoFila .btn-linha.nao').first().click(); await p.waitForTimeout(250);
ok('10 abre a caixa', await p.locator('#fundoModal').isVisible(), 'caixa não abriu');
ok('10 diz qual pedido', /SC-2026-1001/.test(await p.locator('#subModal').textContent()||''), 'sub: ' + await p.locator('#subModal').textContent());
await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
ok('10 barra sem motivo', await p.locator('#erroMotivo').isVisible(), 'aceitou sem motivo');
ok('10 caixa continua', await p.locator('#fundoModal').isVisible(), 'fechou mesmo sem motivo');
ok('10 nada enviado', p.__posts.length === 0, 'mandou decisão sem motivo');
await p.fill('#motivoReprova', 'curto'); await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
ok('10 barra motivo curto', await p.locator('#erroMotivo').isVisible(), 'aceitou motivo de 5 letras');
ok('10 nada enviado ainda', p.__posts.length === 0, 'mandou com motivo curto');
await p.fill('#motivoReprova', 'Já temos esse item em estoque na Granja 103.');
await p.click('#btnConfirmarReprova'); await p.waitForTimeout(700);
ok('10 caixa fecha', !(await p.locator('#fundoModal').isVisible()), 'caixa ficou aberta');
ok('10 saiu da fila', (await linhas(p)) === 2, 'linhas: ' + await linhas(p));
ok('10 motivo vai junto', /estoque na Granja 103/.test((p.__posts[0]||{}).motivo||''), 'payload: ' + JSON.stringify(p.__posts[0]));
ok('10 decisão é reprovado', (p.__posts[0]||{}).decisao === 'reprovado', 'decisão: ' + (p.__posts[0]||{}).decisao);
ok('10 aviso de reprovada', /reprovada/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso: ' + await p.locator('#avisoTopo').textContent());
await p.close();

/* 11 — fechar a caixa sem decidir */
for(const modo of ['cancelar','esc','fora']){
  p = await tela(b);
  await p.locator('#corpoFila .btn-linha.nao').first().click(); await p.waitForTimeout(200);
  if(modo === 'cancelar') await p.click('#btnCancelar');
  if(modo === 'esc')      await p.keyboard.press('Escape');
  if(modo === 'fora')     await p.locator('#fundoModal').click({position:{x:5,y:5}});
  await p.waitForTimeout(250);
  ok('11 fecha por ' + modo, !(await p.locator('#fundoModal').isVisible()), 'caixa continuou aberta');
  ok('11 ' + modo + ' não decide', p.__posts.length === 0 && (await linhas(p)) === 3, 'mexeu na fila');
  await p.close();
}

/* 12 — servidor recusa a decisão */
p = await tela(b, {decisao:{ok:false, mensagem:'esta solicitação já foi decidida'}});
await p.locator('#corpoFila .btn-linha.sim').first().click(); await p.waitForTimeout(600);
ok('12 continua na fila', (await linhas(p)) === 3, 'sumiu da fila mesmo recusado');
ok('12 aviso vermelho', await p.locator('#avisoTopo.ruim').count() === 1, 'aviso não foi de erro');
ok('12 mostra o motivo', /já foi decidida/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso: ' + await p.locator('#avisoTopo').textContent());
await p.close();

/* 13 — endpoint fora do ar */
p = await tela(b, {decisao:'cai'});
await p.locator('#corpoFila .btn-linha.sim').first().click(); await p.waitForTimeout(700);
ok('13 continua na fila', (await linhas(p)) === 3, 'sumiu da fila com o endpoint fora');
ok('13 avisa a falha', await p.locator('#avisoTopo.ruim').count() === 1, 'não avisou');
await p.close();

/* 14 — lote com uma recusa no meio */
let n = 0;
p = await b.newPage(); p.__posts = [];
await p.route('**/rest/v1/rpc/**', r => r.fulfill({status:200,contentType:'application/json',
  body: JSON.stringify(r.request().url().includes('aprovador_do_token') ? QUEM : FILA)}));
await p.route('**n8n.cloud/**', r => { n++;
  let corpo = {};
  try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = {}; }
  p.__posts.push(corpo);
  return r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(n === 2 ? {ok:false,mensagem:'card já saiu da coluna'} : {ok:true})}); });
await p.goto(base + '?t=tk-brandao', {waitUntil:'load'}); await p.waitForTimeout(600);
await p.click('#marcarTodas'); await p.waitForTimeout(150);
await p.click('#btnLote'); await p.waitForTimeout(1000);
ok('14 só a recusada fica', (await linhas(p)) === 1, 'linhas: ' + await linhas(p));
ok('14 avisa qual falhou', /card já saiu da coluna/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso: ' + await p.locator('#avisoTopo').textContent());
await p.close();

/* 15 — duplo clique não manda duas vezes */
p = await tela(b);
/* Tem que ser o MESMO botão duas vezes. `.first()` depois do primeiro clique já
   aponta para outra linha — dois pedidos ali seriam dois itens diferentes, não
   duplicata. */
{ const bt = p.locator('#corpoFila tr[data-id="a1"] .btn-linha.sim');
  await Promise.all([bt.click({timeout:3000}).catch(()=>{}), bt.click({force:true,timeout:3000}).catch(()=>{})]);
  await p.waitForTimeout(900);
  const paraA1 = p.__posts.filter(x=>x.solicitacao_id === 'a1').length;
  ok('15 uma chamada só para a mesma linha', paraA1 === 1, 'chamadas para a1: ' + paraA1);
  const ids = p.__posts.map(x=>x.solicitacao_id);
  ok('15 nenhuma duplicata', ids.length === new Set(ids).size, 'ids: ' + ids.join(',')); }
await p.close();

/* 16 — conteúdo hostil vindo do banco */
p = await tela(b, {fila:[Object.assign({}, FILA[0], {
  motivo:'<img src=x onerror=window.__xss=1>', facilitador:'<script>window.__xss2=1</script>',
  centro_custo_nome:'"><b>oi</b>'})]});
ok('16 sem imagem injetada', (await p.locator('#corpoFila img[onerror]').count()) === 0, 'injetou pelo motivo');
ok('16 sem script injetado', (await p.locator('#corpoFila script').count()) === 0, 'injetou script');
ok('16 sem execução', await p.evaluate(()=>!window.__xss && !window.__xss2), 'o payload rodou');
ok('16 mostra como texto', /<b>oi<\/b>/.test(await p.locator('#corpoFila').textContent()||''), 'não escapou');
await p.close();

/* 17 — celular e tema escuro */
p = await b.newPage();
await p.setViewportSize({width:390,height:780});
await p.route('**/rest/v1/rpc/**', r => r.fulfill({status:200,contentType:'application/json',
  body: JSON.stringify(r.request().url().includes('aprovador_do_token') ? QUEM : FILA)}));
await p.goto(base + '?t=tk-brandao', {waitUntil:'load'}); await p.waitForTimeout(600);
{ const l = await p.evaluate(()=>({d:document.documentElement.scrollWidth, w:window.innerWidth}));
  ok('17 sem rolagem lateral', l.d <= l.w + 1, l.d + ' > ' + l.w);
  ok('17 tabela rola dentro', await p.evaluate(()=>{
    const r = document.querySelector('.rolagem'); return r.scrollWidth > r.clientWidth;
  }), 'a tabela não ficou rolável no celular'); }
await p.close();

p = await b.newPage();
await p.emulateMedia({colorScheme:'dark'});
await p.route('**/rest/v1/rpc/**', r => r.fulfill({status:200,contentType:'application/json',
  body: JSON.stringify(r.request().url().includes('aprovador_do_token') ? QUEM : FILA)}));
await p.goto(base + '?t=tk-brandao', {waitUntil:'load'}); await p.waitForTimeout(500);
ok('17 tema escuro', /rgb\(8, 19, 28\)/.test(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor)), 'fundo: ' + await p.evaluate(()=>getComputedStyle(document.body).backgroundColor));
await p.close();

/* 18 — fila vazia de verdade */
p = await tela(b, {fila:[]});
ok('18 estado vazio', await p.locator('#filaVazia').isVisible(), 'não mostrou o vazio');
ok('18 texto do vazio', /Nada esperando por você/.test(await p.locator('#filaVazia b').textContent()||''), 'texto: ' + await p.locator('#filaVazia b').textContent());
ok('18 sem erro', !(await p.locator('#erro').isVisible()), 'tratou fila vazia como erro');
await p.close();

/* 19 — o que a tela mostra ENQUANTO o servidor não respondeu.
       Pedido do Grupo Leh: botão apagado sem explicação passa por tela travada,
       e tela que parece travada leva a clicar de novo. */
p = await tela(b, {demora: 1500});
await p.locator('#corpoFila tr').first().locator('button', {hasText:'Aprovar'}).first().click();
await p.waitForTimeout(350);                       // no meio do caminho, de propósito
ok('19 avisa no topo',   await p.locator('#avisoTopo').isVisible(), 'nada avisou que estava processando');
ok('19 diz o que faz',   /Registrando a decisão/.test(await p.locator('#avisoTopo').textContent()||''),
   'texto: ' + await p.locator('#avisoTopo').textContent());
ok('19 tem a rodinha',   await p.locator('#avisoTopo .girando').count() === 1, 'sem indicador de movimento');
ok('19 a linha avisa',   /Registrando/.test(await p.locator('#corpoFila tr').first().textContent()||''),
   'a linha clicada não disse nada');
ok('19 botão some',      await p.locator('#corpoFila tr').first().locator('button').count() === 0,
   'o botão continuou clicável durante o envio');
ok('19 lote também',     /Registrando/.test(await p.locator('#btnLote').textContent()||''),
   'botão de lote: ' + await p.locator('#btnLote').textContent());
await p.waitForTimeout(1600);                      // agora a resposta chegou
ok('19 aviso vira resultado', /aprovada/i.test(await p.locator('#avisoTopo').textContent()||''),
   'depois de pronto, o aviso ficou em "Registrando": ' + await p.locator('#avisoTopo').textContent());
ok('19 linha sai da fila', await p.locator('#corpoFila tr').count() === FILA.length - 1,
   'linhas: ' + await p.locator('#corpoFila tr').count());
await p.close();

/* 20 — falhou no meio: a linha VOLTA a ser clicável, senão o pedido fica preso */
p = await tela(b, {decisao: 500, demora: 400});
await p.locator('#corpoFila tr').first().locator('button', {hasText:'Aprovar'}).first().click();
await p.waitForTimeout(1200);
ok('20 volta a poder clicar', await p.locator('#corpoFila tr').first().locator('button').count() === 2,
   'a linha ficou travada em "Registrando" depois do erro');
ok('20 explica a falha', /Não consegui registrar/.test(await p.locator('#avisoTopo').textContent()||''),
   'texto: ' + await p.locator('#avisoTopo').textContent());
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
if(notas.length){ console.log('\n===== ATENÇÃO ====='); notas.forEach(x=>console.log(' ! ' + x)); }
})();
