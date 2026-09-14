/* ============================================================================
   BATERIA DA TELA DE ACOMPANHAMENTO

   Esta tela tem uma regra que vale mais que todas as outras: ela é SÓ DE
   LEITURA. Se um dia aparecer aqui um botão que muda alguma coisa, é bug —
   quem pediu acompanha, quem decide decide na tela dele. O teste 6 existe só
   para isso.

   A segunda regra é a de sempre: o token é de UMA pessoa. Token trocado não
   pode trazer a lista de outra.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/acompanhar.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + d);

const hoje = new Date().toISOString();
const EU = [{ id:'elisabeth', nome:'ELISABETH STOCK', setor:'Administrativo', gerencia:'Administrativa' }];

const LISTA = [
  { id:'s1', numero:'CP-0001', assunto:'Bomba dágua da caixa do galpão',
    centro_custo_nome:'FÁBRICA DE RAÇÕES', total_itens:1, aberto_em:hoje,
    data_necessidade:'2026-12-01', etapa_atual:'lider', status:'aguardando aprovacao',
    decidido_em:null, situacao:'Esperando a liderança', com_quem:'ALVARO BRANDAO FILHO',
    encerrada:false, motivo_recusa:null },
  { id:'s2', numero:'CP-0002', assunto:'Correias do elevador de grãos',
    centro_custo_nome:'CONFINAMENTO DE BOVINOS', total_itens:2, aberto_em:hoje,
    data_necessidade:'2026-10-15', etapa_atual:'cotacao', status:'em cotacao',
    decidido_em:null, situacao:'Em cotação', com_quem:'com o comprador',
    encerrada:false, motivo_recusa:null },
  { id:'s3', numero:'CP-0003', assunto:'EPI para a equipe de campo',
    centro_custo_nome:'AÇOUGUE NORICUM', total_itens:3, aberto_em:hoje,
    data_necessidade:'2026-11-20', etapa_atual:null, status:'aprovado',
    decidido_em:hoje, situacao:'Liberado para compra', com_quem:null,
    encerrada:true, motivo_recusa:null },
  { id:'s4', numero:'CP-0004', assunto:'Troca do chuveiro da casa dos moradores',
    centro_custo_nome:'COMERCIAL', total_itens:1, aberto_em:hoje,
    data_necessidade:'2026-09-30', etapa_atual:null, status:'reprovado',
    decidido_em:hoje, situacao:'Reprovado', com_quem:null,
    encerrada:true, motivo_recusa:'Já temos esse item em estoque na Granja 103.',
    recusado_por:'ALVARO BRANDAO FILHO', recusado_em:hoje, etapa_recusa:'lider' },
  /* Reprovada SEM motivo gravado: existe de verdade na base, são as recusas
     anteriores ao rastro de decisões. A tela não pode oferecer um botão que
     abre janela vazia. */
  { id:'s5', numero:'CP-0005', assunto:'Manutenção do telhado do galpão',
    centro_custo_nome:'AÇOUGUE NORICUM', total_itens:1, aberto_em:hoje,
    data_necessidade:'2026-09-30', etapa_atual:null, status:'reprovado',
    decidido_em:hoje, situacao:'Reprovado', com_quem:null,
    encerrada:true, motivo_recusa:null, recusado_por:null, recusado_em:null, etapa_recusa:null }
];

async function tela(b, { token='fc-elisabeth', quem=EU, lista=LISTA, falhaRpc=false, viewport=null } = {}){
  const p = await b.newPage();
  if(viewport) await p.setViewportSize(viewport);
  p.__rpcs = [];
  await p.route('**/rest/v1/rpc/**', r => {
    const u = r.request().url();
    p.__rpcs.push(u.split('/rpc/')[1]);
    if(falhaRpc) return r.fulfill({status:500, contentType:'application/json', body:'{"message":"boom"}'});
    const j = c => r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(c)});
    if(u.includes('facilitador_do_token')) return j(quem);
    if(u.includes('minhas_solicitacoes'))  return j(lista);
    return j([]);
  });
  await p.goto(base + (token ? '?t=' + encodeURIComponent(token) : ''), {waitUntil:'load'});
  await p.waitForTimeout(500);
  return p;
}
const conta = (p, sel) => p.locator(sel).count();

(async () => {
const b = await chromium.launch();

/* 1 — sem token não mostra lista de ninguém */
let p = await tela(b, {token:''});
ok('1 sem token avisa',  await p.locator('#erro').isVisible(), 'não avisou');
ok('1 sem token explica', /vir do aviso que você recebe no Slack/.test(await p.locator('#erro').textContent()||''),
   'texto: ' + await p.locator('#erro').textContent());
ok('1 sem token sem lista', !(await p.locator('#conteudo').isVisible()), 'mostrou lista sem token');
ok('1 nem consulta o banco', p.__rpcs.length === 0, 'chamou: ' + p.__rpcs.join(','));
await p.close();

/* 2 — token que o banco não reconhece */
p = await tela(b, {quem:[]});
ok('2 token estranho avisa', /Não reconheci este link/.test(await p.locator('#erro').textContent()||''),
   'texto: ' + await p.locator('#erro').textContent());
ok('2 token estranho sem lista', !(await p.locator('#conteudo').isVisible()), 'mostrou lista de alguém');
ok('2 nem pede as solicitações', !p.__rpcs.some(n => n.startsWith('minhas')),
   'pediu a lista mesmo sem reconhecer o dono');
await p.close();

/* 3 — banco fora do ar não deixa tela em branco */
p = await tela(b, {falhaRpc:true});
ok('3 banco fora avisa', await p.locator('#erro').isVisible(), 'tela em branco com o banco fora');
await p.close();

/* 4 — a lista, separada entre o que anda e o que acabou */
p = await tela(b);
ok('4 mostra o dono',   /ELISABETH STOCK/.test(await p.locator('#seloNome').textContent()||''),
   'selo: ' + await p.locator('#seloNome').textContent());
ok('4 título é pessoal', /Solicitações de ELISABETH/.test(await p.locator('#tituloTopo').textContent()||''),
   'título: ' + await p.locator('#tituloTopo').textContent());
ok('4 duas em andamento', await conta(p,'#corpoAndamento tr') === 2,
   'linhas: ' + await conta(p,'#corpoAndamento tr'));
ok('4 três encerradas',   await conta(p,'#corpoEncerradas tr') === 3,
   'linhas: ' + await conta(p,'#corpoEncerradas tr'));
ok('4 conta só as abertas', /2 em andamento/.test(await p.locator('#seloTotal').textContent()||''),
   'selo: ' + await p.locator('#seloTotal').textContent());
ok('4 encerradas aparecem depois', await p.locator('#tituloEncerradas').isVisible(),
   'a seção de encerradas ficou escondida com 2 linhas dentro');

/* 5 — o que cada linha precisa dizer */
{ const l1 = await p.locator('#corpoAndamento tr').nth(0).textContent();
  const l2 = await p.locator('#corpoAndamento tr').nth(1).textContent();
  const l4 = await p.locator('#corpoEncerradas tr').nth(1).textContent();
  ok('5 diz onde está',   /Esperando a liderança/.test(l1), 'linha 1: ' + l1);
  ok('5 diz com quem',    /ALVARO BRANDAO FILHO/.test(l1), 'não disse de quem está esperando: ' + l1);
  ok('5 cotação é do comprador', /com o comprador/.test(l2), 'linha 2: ' + l2);
  ok('5 oferece o motivo da recusa', /Ver motivo/.test(l4), 'não ofereceu o motivo: ' + l4);
  const href = await p.locator('#corpoAndamento tr').nth(0).locator('a').getAttribute('href');
  ok('5 abre o pedido',   /pedido\.html\?id=s1/.test(href||''), 'link: ' + href);
  ok('5 NÃO leva token de aprovador', !/[?&]t=/.test(href||''),
     'o link levou token e ia acender a barra de aprovação: ' + href); }

/* 6 — a regra da tela: nada aqui muda nada.
       Botão passou a ser permitido (o "Ver motivo"), mas TODO botão precisa
       estar marcado como de leitura. É assim que um botão de ação acrescentado
       no futuro reprova aqui em vez de passar despercebido. */
{ const botoes   = await p.locator('button').count();
  const leitura  = await p.locator('button.so-leitura').count();
  const inputs   = await p.locator('input:not([type=search])').count();
  const forms    = await p.locator('form').count();
  ok('6 todo botão é de leitura', botoes === leitura,
     (botoes - leitura) + ' botão(ões) sem a marca de leitura numa tela que não muda nada');
  ok('6 sem campo',   inputs === 0, 'apareceram ' + inputs + ' campos além do filtro');
  ok('6 sem formulário', forms === 0, 'apareceu formulário numa tela de leitura');
  const chamadas = p.__rpcs.filter(n => !/^facilitador_do_token|^minhas_solicitacoes/.test(n));
  ok('6 só lê', chamadas.length === 0, 'chamou além da leitura: ' + chamadas.join(',')); }

/* 6.5 — a janela do motivo: abre, mostra o que precisa, e fecha */
{ const antes = p.__rpcs.length;
  await p.locator('#corpoEncerradas tr').nth(1).locator('.ver-motivo').click();
  await p.waitForTimeout(250);
  ok('6.5 janela abre',     await p.locator('#fundoModal').isVisible(), 'a janela não abriu');
  ok('6.5 mostra o motivo', /Granja 103/.test(await p.locator('#textoMotivo').textContent()||''),
     'texto: ' + await p.locator('#textoMotivo').textContent());
  const sub = await p.locator('#subModal').textContent() || '';
  ok('6.5 diz quem reprovou', /ALVARO BRANDAO FILHO/.test(sub), 'subtítulo: ' + sub);
  ok('6.5 diz em qual etapa', /na aprovação da liderança imediata/.test(sub), 'subtítulo: ' + sub);
  ok('6.5 diz o número',      /CP-0004/.test(sub), 'subtítulo: ' + sub);
  ok('6.5 não chama o servidor', p.__rpcs.length === antes,
     'abrir o motivo foi ao banco — ele já veio com a lista');
  await p.click('#btnFechar'); await p.waitForTimeout(200);
  ok('6.5 fecha no botão', !(await p.locator('#fundoModal').isVisible()), 'não fechou');
  await p.locator('#corpoEncerradas tr').nth(1).locator('.ver-motivo').click();
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('6.5 fecha no Esc', !(await p.locator('#fundoModal').isVisible()), 'Esc não fechou'); }

/* 6.6 — reprovada sem motivo gravado não oferece botão que abre nada */
{ const l5 = await p.locator('#corpoEncerradas tr').nth(2).textContent() || '';
  ok('6.6 diz que não há motivo', /Motivo não registrado/.test(l5), 'linha: ' + l5);
  ok('6.6 sem botão vazio',
     await p.locator('#corpoEncerradas tr').nth(2).locator('.ver-motivo').count() === 0,
     'ofereceu "Ver motivo" para um pedido que não tem motivo gravado'); }

/* 7 — filtro */
await p.fill('#filtro', 'correias');
await p.waitForTimeout(250);
ok('7 filtra',        await conta(p,'#corpoAndamento tr') === 1, 'linhas: ' + await conta(p,'#corpoAndamento tr'));
ok('7 esconde o resto', await conta(p,'#corpoEncerradas tr') === 0, 'encerradas continuaram visíveis no filtro');
await p.fill('#filtro', 'zzzz');
await p.waitForTimeout(250);
ok('7 nada com o filtro', /Nada com esse filtro/.test(await p.locator('#vazioAndamento b').textContent()||''),
   'texto: ' + await p.locator('#vazioAndamento b').textContent());
await p.fill('#filtro', '');
await p.waitForTimeout(250);
await p.close();

/* 8 — quem nunca pediu nada */
p = await tela(b, {lista:[]});
ok('8 vazio explica', /Nenhuma solicitação em andamento/.test(await p.locator('#vazioAndamento b').textContent()||''),
   'texto: ' + await p.locator('#vazioAndamento b').textContent());
ok('8 vazio sem erro', !(await p.locator('#erro').isVisible()), 'tratou lista vazia como erro');
ok('8 sem seção de encerradas', !(await p.locator('#tituloEncerradas').isVisible()), 'mostrou encerradas vazia');
await p.close();

/* 9 — celular: nada some e a página não rola para o lado */
p = await tela(b, {viewport:{width:390, height:844}});
{ const m = await p.evaluate(() => ({doc: document.documentElement.scrollWidth, win: innerWidth}));
  ok('9 celular não rola para o lado', m.doc <= m.win + 1, m.doc + ' > ' + m.win);
  ok('9 celular desenha', await conta(p,'#corpoAndamento tr') === 2, 'linhas: ' + await conta(p,'#corpoAndamento tr'));
  ok('9 tabela rola dentro', await p.evaluate(()=>{
    const r = document.querySelector('.rolagem'); return r.scrollWidth > r.clientWidth;
  }), 'a tabela não ficou rolável no celular'); }
await p.screenshot({path:'t-acompanhar-celular.png', fullPage:true});
await p.close();

/* 10 — tema escuro */
p = await b.newPage();
await p.emulateMedia({colorScheme:'dark'});
await p.route('**/rest/v1/rpc/**', r => r.fulfill({status:200, contentType:'application/json',
  body: JSON.stringify(r.request().url().includes('facilitador_do_token') ? EU : LISTA)}));
await p.goto(base + '?t=fc-elisabeth', {waitUntil:'load'});
await p.waitForTimeout(500);
ok('10 tema escuro', /rgb\(8, 19, 28\)/.test(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor)),
   'fundo: ' + await p.evaluate(()=>getComputedStyle(document.body).backgroundColor));
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' · ' + f));
process.exit(falhas.length ? 1 : 0);
})();
