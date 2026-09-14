/* Bateria da tela de decisão. */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const base = 'file://' + __dirname + '/decisao.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

const SOL = [{ id:'aaaa-1111', numero:'C2609-00001', solicitante:'Maria de Souza',
  centro_custo:'3180', centro_custo_nome:null, data_necessidade:'2026-12-01', motivo:'teste' }];
const ITENS = [{descricao:'Pneu 295/80 R22.5', unidade:'Unidade', quantidade:4},
               {descricao:'Detergente neutro 5 L', unidade:'Litro', quantidade:20}];
const CENTRO = [{nome:'2024/2025 - BLZ-01 - SOJA OLIMPO - 209,2 ha', unidade:'AGRICULTURA - PIAUÍ'}];

const ITENS_PLURAL = [
  {descricao:'Item A', unidade:'Unidade', quantidade:1},
  {descricao:'Item B', unidade:'Unidade', quantidade:5},
  {descricao:'Item C', unidade:'Par',     quantidade:2},
  {descricao:'Item D', unidade:'Galão',   quantidade:3},
  {descricao:'Item E', unidade:'kg',      quantidade:10},
  {descricao:'Item F', unidade:'Serviço', quantidade:1},
  {descricao:'Item G', unidade:'Caixa',   quantidade:0}
];
async function servir_plural(p){
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    const corpo = mock.corpoPorUrl(u, { pedido: SOL[0], itens: ITENS_PLURAL, centros: CENTRO });
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corpo)});
  });
}

async function abrir(b, qs, semBanco){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => {
    if(semBanco) return r.abort();
    const u = r.request().url();
    const corpo = mock.corpoPorUrl(u, { pedido: SOL[0], itens: ITENS, centros: CENTRO });
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corpo)});
  });
  await p.goto(base + qs, {waitUntil:'load'});
  await p.waitForTimeout(700);
  return p;
}

(async () => {
const b = await chromium.launch();
const CARD = 'https://app.clickup.com/t/86abc123';

// 1 — aprovado na liderança
let p = await abrir(b, '?d=aprovado&e=lider&sc=C2609-00001&id=aaaa-1111&card=' + encodeURIComponent(CARD));
ok('1 título', (await p.locator('#titulo').textContent()) === 'Aprovado', 'veio ' + await p.locator('#titulo').textContent());
ok('1 próximo passo', /cotar com os fornecedores/.test(await p.locator('#passo').textContent()), 'passo errado');
ok('1 classe', await p.locator('#veredito.v-ok').count() === 1, 'sem a classe de aprovado');
ok('1 selo do número', (await p.locator('#seloNumero').textContent()) === 'C2609-00001', 'selo errado');

// 2 — resumo veio do banco
ok('2 resumo visível', await p.locator('#cartaoPedido').isVisible(), 'resumo não apareceu');
ok('2 centro resolvido', /SOJA OLIMPO/.test(await p.locator('#fichaPedido').textContent()), 'centro não resolvido');
ok('2 itens na tabela', (await p.locator('.itens-resumo tbody tr').count()) === 2, 'itens faltando');
ok('2 quantidade formatada', /4 Unidades/.test(await p.locator('.itens-resumo').textContent()), 'quantidade errada');
ok('2 plural da unidade', /20 Litros/.test(await p.locator('.itens-resumo').textContent()), 'não pluralizou o litro');

// 3 — botões
ok('3 botão do card', (await p.locator('.acoes a').first().getAttribute('href')) === CARD, 'link do card errado');
ok('3 botão do pedido', /pedido\.html\?id=aaaa-1111/.test(await p.locator('.acoes a').nth(1).getAttribute('href')), 'link do pedido errado');
ok('3 abre em nova aba', (await p.locator('.acoes a').first().getAttribute('target')) === '_blank', 'card sem target');
await p.close();

// 4 — reprovado
p = await abrir(b, '?d=reprovado&e=gerencial&sc=C2609-00001');
ok('4 título', (await p.locator('#titulo').textContent()) === 'Reprovado', 'veio ' + await p.locator('#titulo').textContent());
ok('4 classe', await p.locator('#veredito.v-nao').count() === 1, 'sem a classe de reprovado');
ok('4 orienta comentar', /comente no card/.test(await p.locator('#passo').textContent()), 'não orienta o motivo');
await p.close();

// 5 — já decidido (clique duplo)
p = await abrir(b, '?d=ja&e=financeiro&sc=C2609-00001');
ok('5 título', /já tinha sido decidida/.test(await p.locator('#titulo').textContent()), 'veio ' + await p.locator('#titulo').textContent());
ok('5 diz que nada mudou', /Nada mudou agora/.test(await p.locator('#passo').textContent()), 'não deixa claro');
await p.close();

// 6 — erro
p = await abrir(b, '?d=erro');
ok('6 título', /Não consegui registrar/.test(await p.locator('#titulo').textContent()), 'veio ' + await p.locator('#titulo').textContent());
ok('6 sem resumo', !(await p.locator('#cartaoPedido').isVisible()), 'mostrou resumo num erro');
await p.close();

// 7 — sem parâmetro nenhum não pode parecer sucesso
p = await abrir(b, '');
ok('7 cai no erro', await p.locator('#veredito.v-erro').count() === 1, 'link vazio não caiu no erro');
ok('7 sem botões', (await p.locator('.acoes a').count()) === 0, 'apareceu botão sem dados');
await p.close();

// 8 — etapa desconhecida não quebra
p = await abrir(b, '?d=aprovado&e=xpto&sc=C2609-00001');
ok('8 texto genérico', /segue no fluxo/.test(await p.locator('#passo').textContent()), 'não caiu no texto genérico');
await p.close();

// 9 — card apontando para fora do ClickUp é recusado
p = await abrir(b, '?d=aprovado&e=lider&sc=C2609-00001&card=' + encodeURIComponent('https://evil.example.com/x'));
const hrefs = await p.locator('.acoes a').evaluateAll(as => as.map(a=>a.getAttribute('href')));
ok('9 recusa domínio estranho', !hrefs.some(h => /evil/.test(h||'')), 'aceitou link de fora: ' + hrefs.join(','));
await p.close();
p = await abrir(b, '?d=aprovado&e=lider&card=' + encodeURIComponent('javascript:alert(1)'));
ok('9 recusa javascript:', (await p.locator('.acoes a').count()) === 0, 'aceitou javascript:');
await p.close();

// 10 — XSS pelos parâmetros
const xss = '"><img src=x onerror=alert(1)>';
p = await abrir(b, '?d=aprovado&e=lider&sc=' + encodeURIComponent(xss));
ok('10 sem injeção', (await p.locator('img[onerror]').count()) === 0, 'injetou HTML pelo sc');
ok('10 mostra como texto', (await p.locator('#seloNumero').textContent()).includes('<img'), 'não escapou');
await p.close();

// 11 — banco fora do ar: veredito continua de pé
p = await abrir(b, '?d=aprovado&e=lider&sc=C2609-00001&id=aaaa-1111', true);
ok('11 veredito sobrevive', (await p.locator('#titulo').textContent()) === 'Aprovado', 'veredito sumiu sem banco');
ok('11 resumo escondido', !(await p.locator('#cartaoPedido').isVisible()), 'mostrou resumo vazio');
ok('11 botão do pedido fica', (await p.locator('.acoes a').count()) >= 1, 'perdeu os botões');
await p.close();

// 12 — celular sem rolagem lateral, e tema escuro
p = await b.newPage();
await p.setViewportSize({width:375,height:720});
await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mock.corpoPorUrl(r.request().url(), {pedido: SOL[0]}))}));
await p.goto(base + '?d=aprovado&e=lider&sc=C2609-00001&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(600);
const larg = await p.evaluate(()=>({doc:document.documentElement.scrollWidth, win:window.innerWidth}));
ok('12 sem rolagem lateral', larg.doc <= larg.win + 1, larg.doc + ' > ' + larg.win);
await p.close();

p = await b.newPage();
await p.emulateMedia({colorScheme:'dark'});
await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await p.goto(base + '?d=aprovado&e=lider', {waitUntil:'load'});
await p.waitForTimeout(400);
const cor = await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
ok('13 tema escuro', /rgb\(8, 19, 28\)/.test(cor), 'fundo veio ' + cor);
await p.close();

// 14 — concordância da unidade em vários formatos
p = await b.newPage();
await servir_plural(p);
await p.goto(base + '?d=aprovado&e=lider&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(700);
const tab = await p.locator('.itens-resumo').textContent();
[['1 Unidade',true],['5 Unidades',true],['2 Pares',true],['3 Galões',true],
 ['10 kg',true],['1 Serviço',true],['0 Caixas',true]].forEach(([esperado])=>{
  ok('14 ' + esperado, tab.includes(esperado), 'não achei "' + esperado + '" em: ' + tab.replace(/\s+/g,' ').slice(0,220));
});
ok('14 sem singular sobrando', !/[^s]\s*5 Unidade[^s]/.test(tab), 'sobrou singular');
await p.close();

// 15 — facilitador, solicitante e observação no resumo
p = await b.newPage();
await p.route('**supabase.co/**', r => {
  const u = r.request().url();
  const corpo = mock.corpoPorUrl(u, { itens: ITENS, centros: CENTRO,
    pedido: Object.assign({}, SOL[0], {
      facilitador:'Guilherme Pimpão', solicitante:'Alguém Antigo',
      solicitante_nome:'João da Silva — Granja 103',
      observacao:'Combinar com o Zé antes de descarregar.' }) });
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corpo)});
});
await p.goto(base + '?d=aprovado&e=lider&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(800);
{ const f = await p.locator('#fichaPedido').textContent();
  ok('15 facilitador', /Guilherme Pimpão/.test(f), 'sem facilitador: ' + f.slice(0,120));
  ok('15 facilitador vence o legado', !/Alguém Antigo/.test(f), 'mostrou a coluna antiga');
  ok('15 solicitante', /João da Silva/.test(f), 'sem solicitante');
  ok('15 observação', /Combinar com o Zé/.test(f), 'sem observação'); }
await p.close();

// 16 — solicitação antiga, sem as colunas novas, cai no legado
p = await b.newPage();
await p.route('**supabase.co/**', r => {
  const u = r.request().url();
  const corpo = mock.corpoPorUrl(u, { itens: ITENS, centros: CENTRO,
    pedido: Object.assign({}, SOL[0], {solicitante:'Maria Antiga'}) });
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corpo)});
});
await p.goto(base + '?d=aprovado&e=lider&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(800);
{ const f = await p.locator('#fichaPedido').textContent();
  ok('16 cai no legado', /Maria Antiga/.test(f), 'perdeu o nome da solicitação antiga');
  ok('16 sem linha vazia de solicitante', !/Solicitante\s*—/.test(f), 'inventou linha vazia');
  ok('16 sem observação vazia', !/Observação/.test(f), 'inventou observação vazia'); }
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
