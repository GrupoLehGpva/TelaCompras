/* ============================================================================
   BATERIA DO HISTÓRICO DE APROVAÇÕES

   O pedido era "sem poluir as aprovações que precisam ser feitas". Isso não é
   estilo, é comportamento: o que já foi decidido não pode aparecer junto do que
   espera decisão, e a busca do histórico não pode acontecer para quem nem abriu
   a aba. As duas coisas são testadas aqui.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/aprovacoes.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + d);

const hoje = new Date().toISOString();
const FILA = [
  {id:'a1', numero:'SC-2026-1001', card_id:'c1', etapa_atual:'lider',
   facilitador:'Guilherme Pimpão', solicitante_nome:'João da Silva',
   centro_custo:'20', centro_custo_nome:'FÁBRICA DE RAÇÕES', tipo_compra:'urgente',
   data_necessidade:'2026-12-01', motivo:'Pneu careca', observacao:null,
   aberto_em:hoje, total_itens:2}
];
const QUEM = [{id:'brandao', nome:'Brandão', etapas:['lider','gerencial']}];
const HIST = [
  {id:'h1', numero:'SC-2026-0901', etapa:'lider', resposta:'aprovado', motivo:null,
   decidido_em:'2026-09-01T13:00:00Z', aberto_em:'2026-08-25T09:00:00Z',
   facilitador:'Maria de Souza',
   centro_custo_nome:'CONFINAMENTO DE BOVINOS', situacao:'em cotação'},
  {id:'h2', numero:'SC-2026-0902', etapa:'gerencial', resposta:'reprovado',
   motivo:'Já temos esse item em estoque na Granja 103.',
   decidido_em:'2026-08-28T18:30:00Z', aberto_em:'2026-08-20T09:00:00Z',
   facilitador:'Ana Paula',
   centro_custo_nome:'COMERCIAL', situacao:'reprovado'}
];

async function tela(b, {hist = HIST, falhaHist = false, decisao = {ok:true}} = {}){
  const p = await b.newPage();
  p.__rpcs = [];
  await p.route('**/rest/v1/rpc/**', r => {
    const u = r.request().url();
    p.__rpcs.push(u.split('/rpc/')[1]);
    const j = corpo => r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(corpo)});
    if(u.includes('aprovador_do_token'))        return j(QUEM);
    if(u.includes('historico_de_aprovacoes'))   return falhaHist
      ? r.fulfill({status:500, contentType:'application/json', body:'{"message":"boom"}'})
      : j(hist);
    if(u.includes('fila_de_aprovacao'))         return j(FILA);
    return j([]);
  });
  await p.route('**n8n.cloud/**', r =>
    r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(decisao)}));
  await p.goto(base + '?t=tk-brandao', {waitUntil:'load'});
  await p.waitForTimeout(500);
  return p;
}
const conta = (p, sel) => p.locator(sel).count();
const pediuHistorico = p => p.__rpcs.filter(n => n.startsWith('historico')).length;

(async () => {
const b = await chromium.launch();

/* 1 — a tela abre na fila, e o histórico nem foi buscado */
let p = await tela(b);
ok('1 abre na fila',        await p.locator('#painelFila').isVisible(), 'não abriu na fila');
ok('1 histórico escondido', !(await p.locator('#painelHist').isVisible()), 'histórico apareceu sem pedir');
ok('1 não busca à toa',     pediuHistorico(p) === 0, 'buscou o histórico sem ninguém abrir a aba');
ok('1 conta bate',          (await p.locator('#contaFila').textContent()) === String(FILA.length),
   'conta: ' + await p.locator('#contaFila').textContent());
ok('1 fila desenhada',      await conta(p, '#corpoFila tr') === 1, 'linhas: ' + await conta(p, '#corpoFila tr'));
ok('1 sem linha de histórico na fila', await conta(p, '#corpoHist tr') === 0, 'histórico vazou para a fila');

/* 2 — abrir a aba busca uma vez e desenha */
await p.click('#abaHist');
await p.waitForTimeout(400);
ok('2 troca de painel',   await p.locator('#painelHist').isVisible() && !(await p.locator('#painelFila').isVisible()),
   'os dois painéis ao mesmo tempo, ou nenhum');
ok('2 buscou uma vez',    pediuHistorico(p) === 1, 'buscas: ' + pediuHistorico(p));
ok('2 desenhou tudo',     await conta(p, '#corpoHist tr') === HIST.length,
   'linhas: ' + await conta(p, '#corpoHist tr'));
ok('2 filtro some',       !(await p.locator('#filtro').isVisible()), 'o filtro da fila ficou na tela do histórico');
ok('2 aprovar em lote some', !(await p.locator('#btnLote').isVisible()), 'o botão de aprovar em lote ficou visível');
ok('2 aba marcada',       (await p.locator('#abaHist').getAttribute('aria-selected')) === 'true'
                       && (await p.locator('#abaFila').getAttribute('aria-selected')) === 'false', 'aba não marcou');

/* 3 — o que a linha mostra */
{ const linha1 = await p.locator('#corpoHist tr').nth(0).textContent();
  const linha2 = await p.locator('#corpoHist tr').nth(1).textContent();
  ok('3 mostra aprovada',  /Aprovada/.test(linha1),  'linha 1: ' + linha1);
  ok('3 mostra reprovada', /Reprovada/.test(linha2), 'linha 2: ' + linha2);
  ok('3 mostra o motivo',  /Granja 103/.test(linha2), 'o motivo da reprovação sumiu: ' + linha2);
  ok('3 mostra onde está', /em cotação/.test(linha1), 'não disse onde o pedido está hoje: ' + linha1);
  ok('3 etapa por extenso', /Liderança/.test(linha1) && /Gerencial/.test(linha2), 'etapa crua na tela');
  // Pedido do Grupo Leh: a data em que o pedido foi FEITO, não só a da decisão.
  // Sozinha, a data da decisão não diz quanto tempo aquilo ficou parado.
  ok('3 mostra quando foi aberta', /25\/08\/2026/.test(linha1), 'a data de abertura não apareceu: ' + linha1);
  ok('3 mostra quando foi decidida', /01\/09\/2026/.test(linha1), 'a data da decisão sumiu: ' + linha1);
  ok('3 as duas datas, nesta ordem',
     linha1.indexOf('25/08/2026') < linha1.indexOf('01/09/2026'),
     'aberta precisa vir antes de decidida: ' + linha1);
  ok('3 etapa ganhou cor', await p.locator('#corpoHist tr').nth(0).locator('.etapa.lider').count() === 1,
     'a etapa do histórico ficou sem a cor da etapa');
  const href = await p.locator('#corpoHist tr').nth(0).locator('a').getAttribute('href');
  ok('3 abre o pedido',    /pedido\.html\?id=h1/.test(href || ''), 'link: ' + href);
  ok('3 leva o token',     /t=tk-brandao/.test(href || ''), 'link sem token, a barra de aprovação não aparece: ' + href); }

/* 4 — voltar e abrir de novo não busca outra vez */
await p.click('#abaFila'); await p.waitForTimeout(200);
await p.click('#abaHist'); await p.waitForTimeout(300);
ok('4 não busca de novo', pediuHistorico(p) === 1, 'buscas: ' + pediuHistorico(p));
ok('4 volta a desenhar',  await conta(p, '#corpoHist tr') === HIST.length, 'linhas sumiram na volta');
await p.close();

/* 5 — histórico vazio explica, em vez de tabela em branco */
p = await tela(b, {hist: []});
await p.click('#abaHist'); await p.waitForTimeout(400);
ok('5 vazio avisa',  await p.locator('#histVazio').isVisible(), 'tabela vazia sem explicação');
ok('5 vazio sem tabela', !(await p.locator('#histRolagem').isVisible()), 'mostrou cabeçalho de tabela sem linha');
await p.close();

/* 6 — banco fora do ar no histórico não derruba a fila */
p = await tela(b, {falhaHist: true});
await p.click('#abaHist'); await p.waitForTimeout(500);
ok('6 falha avisa', /Não consegui carregar o histórico/.test(await p.locator('#histVazio').textContent() || ''),
   'texto: ' + await p.locator('#histVazio').textContent());
await p.click('#abaFila'); await p.waitForTimeout(200);
ok('6 fila sobrevive', await conta(p, '#corpoFila tr') === 1, 'a fila quebrou junto com o histórico');
await p.close();

/* 7 — depois de decidir, o histórico precisa ser buscado de novo:
       é exatamente aí que a pessoa vai olhar. */
p = await tela(b);
await p.click('#abaHist'); await p.waitForTimeout(400);
const antes = pediuHistorico(p);
await p.click('#abaFila'); await p.waitForTimeout(200);
await p.locator('#corpoFila tr').first().locator('button', {hasText:'Aprovar'}).first().click();
await p.waitForTimeout(800);
await p.click('#abaHist'); await p.waitForTimeout(400);
ok('7 recarrega depois de decidir', pediuHistorico(p) === antes + 1,
   'buscas antes: ' + antes + ', depois: ' + pediuHistorico(p));
await p.close();

/* 8 — largura de celular: nada some, e a página não rola para o lado */
p = await b.newPage();
await p.setViewportSize({width:390, height:844});
await p.route('**/rest/v1/rpc/**', r => {
  const u = r.request().url();
  const j = c => r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(c)});
  if(u.includes('aprovador_do_token'))      return j(QUEM);
  if(u.includes('historico_de_aprovacoes')) return j(HIST);
  return j(FILA);
});
await p.goto(base + '?t=tk-brandao', {waitUntil:'load'});
await p.waitForTimeout(500);
await p.click('#abaHist'); await p.waitForTimeout(400);
{ const m = await p.evaluate(() => ({doc: document.documentElement.scrollWidth, win: innerWidth}));
  ok('8 celular não rola para o lado', m.doc <= m.win + 1, m.doc + ' > ' + m.win);
  ok('8 celular desenha', await conta(p, '#corpoHist tr') === HIST.length, 'linhas: ' + await conta(p, '#corpoHist tr')); }
await p.screenshot({path:'t-historico.png', fullPage:true});
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' · ' + f));
process.exit(falhas.length ? 1 : 0);
})();
