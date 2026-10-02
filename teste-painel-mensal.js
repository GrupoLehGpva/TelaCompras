/* FUNIL DA DIRETORIA · COMPRA MENSAL (29/09)
   Com o filtro Tipo de compra = Mensal o quadro mostra as colunas na ordem da
   mensal (liderança → gerencial → cotação → financeiro → OC); em "Todos" o card
   mensal ganha a etiqueta; o modal mostra a trilha pelo fluxo do próprio pedido. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n,c,d) => c ? null : falhas.push(n + ' — ' + (d || ''));
const dia = n => new Date(Date.now() - n*864e5).toISOString();
const L = (numero, tipo, etapa, extra={}) => Object.assign({
  numero, tipo_compra: tipo, etapa_atual: etapa, status: 'aguardando aprovacao', aberto_em: dia(3),
  facilitador: 'Ana Paula', empresa: 'EMPRESA 1', centro_custo: '20', cc_nome: 'FABRICA', motivo: 'm',
  itens: [{ desc: 'ITEM ' + numero, qtd: 1, un: 'UN', fam: 'MG' }], decisoes: [], cotacoes: [], ordens: []
}, extra);
const LINHAS = [
  L('N-01', 'normal', 'lider'), L('N-02', 'normal', 'cotacao', { status: 'em cotacao' }), L('N-03', 'normal', 'gerencial'),
  L('M-01', 'mensal', 'lider'), L('M-02', 'mensal', 'gerencial'), L('M-03', 'mensal', 'cotacao', { status: 'em cotacao' }),
  L('M-04', 'mensal', 'financeiro'),
  L('M-05', 'mensal', 'lote', { status: 'aguardando lote' }),
  L('M-06', 'mensal', null, { status: 'reprovado', decisoes: [{ etapa: 'gerencial', resp: 'reprovado', motivo: 'Fora do orçamento do mês', por: 'W', em: dia(1) }] }),
];
(async () => {
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1000 } });
p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
await p.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file:')) return r.continue();
  if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.goto('file://' + __dirname + '/painel.html?t=pd-teste'); await p.waitForTimeout(900);
const cols = () => p.$$eval('#board-area .col h3', hs => hs.map(h => h.textContent.trim()));

/* 30/09: tipo de compra virou 3 botões logo abaixo de "Solicitações por etapa" */
/* 02/10: só Normal, Urgente e Mensal — sem o botão "Todas". Nenhum marcado = todos. */
ok('1 três botões de tipo, nenhum marcado', JSON.stringify(await p.$$eval('#f-tipo [data-tipo]', bs => bs.map(b => b.dataset.tipo + ':' + b.getAttribute('aria-pressed'))))
   === JSON.stringify(['normal:false','urgente:false','mensal:false']));
ok('1 sem botão "Todas"', await p.locator('#f-tipo [data-tipo=""]').count() === 0 && !/Todas/.test(await p.textContent('#f-tipo')));
ok('1 sem caixa de seleção de tipo', await p.locator('select#f-tipo').count() === 0 && await p.locator('.filters [data-tipo]').count() === 0);
ok('1 botões logo acima do título', await p.evaluate(() => { const h = document.getElementById('quadro-titulo').closest('.sec-h'); return h.previousElementSibling && h.previousElementSibling.id === 'f-tipo'; }));
{ const conta = await p.$$eval('#f-tipo [data-conta]', cs => cs.map(c => c.textContent));
  ok('1 cada tipo mostra quantos há', conta.length === 3 && conta.every(c => /^\d+$/.test(c)) && Number(conta[2]) === 5, JSON.stringify(conta)); }
ok('1 número colorido só quando há pedido', await p.$eval('#f-tipo [data-tipo=mensal] .c', c => c.classList.contains('tem')));
/* 02/10: com pedido aguardando o lote mensal, a coluna aparece também no quadro geral */
ok('1 todos: ordem normal + lote (há mensal aguardando)', JSON.stringify(await cols()) === JSON.stringify(['Liderança imediata','Compras · cotação','Aprovação gerencial','Aguardando o lote','Aprovação financeiro','Ordem de compra']), JSON.stringify(await cols()));
ok('1 M-05 na coluna do lote', await p.$eval('.card[data-id="M-05"]', c => c.closest('.col').querySelector('h3').textContent.trim()) === 'Aguardando o lote');
ok('1 lote diz com quem', /Lote mensal \(entra na cotação quando Compras fechar o mês\)/.test(await p.textContent('.card[data-id="M-05"]')));
ok('1 todos: card mensal com etiqueta', /Mensal/.test(await p.textContent('.card[data-id="M-02"]')) && !/Mensal/.test(await p.textContent('.card[data-id="N-03"]')));

await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(300);
ok('2 mensal: colunas na ordem da mensal (com o lote)', JSON.stringify(await cols()) === JSON.stringify(['Liderança imediata','Aprovação gerencial','Aguardando o lote','Compras · cotação','Aprovação financeiro','Ordem de compra']), JSON.stringify(await cols()));
ok('2 mensal: título diz compra mensal', /compra mensal/.test(await p.textContent('#quadro-titulo')));
ok('2 mensal: dica explica o fluxo', /gerência aprova, o pedido espera Compras fechar o mês/.test(await p.textContent('#quadro-dica')));
ok('2 mensal: só pedidos mensais', await p.locator('.card[data-id^="N-"]').count() === 0 && await p.locator('.card[data-id^="M-"]').count() === 5);
ok('2 mensal: sem etiqueta repetida', !/Mensal/.test(await p.textContent('.card[data-id="M-02"]')));
const colDe = id => p.$eval('.card[data-id="' + id + '"]', c => c.closest('.col').querySelector('h3').textContent.trim());
ok('2 M-02 na gerencial (2ª coluna)', await colDe('M-02') === 'Aprovação gerencial');
ok('2 M-03 na cotação (3ª coluna)', await colDe('M-03') === 'Compras · cotação');
ok('2 reprovada mensal embaixo', /M-06/.test(await p.textContent('#closed-area')) && /Fora do orçamento do mês/.test(await p.textContent('#closed-area')));

/* trilha do modal pelo fluxo do pedido */
await p.click('.card[data-id="M-03"]'); await p.waitForTimeout(300);
const trilha = await p.$$eval('#modal .step', s => s.map(x => x.textContent.trim() + (x.classList.contains('cur') ? '*' : '')));
ok('3 modal mensal: trilha Liderança → Gerencial → Lote → Cotação*', JSON.stringify(trilha.slice(0, 4)) === JSON.stringify(['Liderança','Gerencial','Lote','Cotação*']), JSON.stringify(trilha));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

ok('2b botão Mensal marcado', await p.getAttribute('#f-tipo [data-tipo=mensal]', 'aria-pressed') === 'true');
await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(300);   /* clicar de novo = todos */
ok('2b clicar de novo mostra todos', await p.getAttribute('#f-tipo [data-tipo=mensal]', 'aria-pressed') === 'false' && await p.locator('.card[data-id^="N-"]').count() > 0);
await p.click('#f-tipo [data-tipo=normal]'); await p.waitForTimeout(300);
ok('2c Normal: só normais, um botão marcado por vez', await p.locator('.card[data-id^="M-"]').count() === 0 && await p.locator('#f-tipo [aria-pressed=true]').count() === 1);
await p.click('#f-tipo [data-tipo=normal]'); await p.waitForTimeout(300);
ok('2d clicar de novo no Normal volta a mostrar tudo', await p.locator('#f-tipo [aria-pressed=true]').count() === 0 && await p.locator('.card[data-id^="M-"]').count() > 0 && await p.locator('.card[data-id^="N-"]').count() > 0);
await p.click('#f-tipo [data-tipo=normal]'); await p.waitForTimeout(300);
await p.click('#f-tipo [data-tipo=urgente]'); await p.waitForTimeout(300);
ok('2c trocar de Normal para Urgente', await p.getAttribute('#f-tipo [data-tipo=urgente]', 'aria-pressed') === 'true' && await p.getAttribute('#f-tipo [data-tipo=normal]', 'aria-pressed') === 'false');
await p.click('#f-tipo [data-tipo=urgente]'); await p.waitForTimeout(300);
await p.click('.card[data-id="N-02"]'); await p.waitForTimeout(300);
const trilhaN = await p.$$eval('#modal .step', s => s.map(x => x.textContent.trim() + (x.classList.contains('cur') ? '*' : '')));
ok('3 modal normal: trilha Liderança → Cotação*', JSON.stringify(trilhaN.slice(0, 3)) === JSON.stringify(['Liderança','Cotação*','Gerencial']), JSON.stringify(trilhaN));
await p.keyboard.press('Escape');

/* limpar filtros volta ao quadro normal */
await p.click('#f-tipo [data-tipo=mensal]'); await p.click('#f-clear'); await p.waitForTimeout(300);
ok('4 limpar filtros volta à ordem normal', (await cols())[1] === 'Compras · cotação' && !/compra mensal/.test(await p.textContent('#quadro-titulo')));

/* sem nenhum pedido mensal no banco: o quadro mensal aparece vazio, com aviso (29/09) */
{ const q = await b.newPage({ viewport: { width: 1920, height: 1000 } });
  q.on('pageerror', e => falhas.push('ERRO DE PÁGINA (vazio): ' + e.message));
  await q.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, solicitacoes: LINHAS.filter(l => l.tipo_compra !== 'mensal') }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  await q.goto('file://' + __dirname + '/painel.html?t=pd-teste'); await q.waitForTimeout(900);
  await q.click('#f-tipo [data-tipo=mensal]'); await q.waitForTimeout(300);
  const c = await q.$$eval('#board-area .col h3', hs => hs.map(h => h.textContent.trim()));
  ok('6 sem mensal: colunas da mensal aparecem vazias', JSON.stringify(c) === JSON.stringify(['Liderança imediata','Aprovação gerencial','Aguardando o lote','Compras · cotação','Aprovação financeiro','Ordem de compra']), JSON.stringify(c));
  ok('6 sem mensal: aviso de que ainda não há compra mensal', /Ainda não há compra mensal/.test(await q.textContent('#board-area')));
  await q.click('#f-tipo [data-tipo=urgente]'); await q.fill('#f-q', 'zzzz-nada'); await q.waitForTimeout(400);
  ok('6 filtro sem resultado: colunas + aviso com limpar', await q.locator('#board-area .col').count() === 5 && /Nenhuma solicitação com esses filtros/.test(await q.textContent('#board-area')));
  await q.click('#empty-clear'); await q.waitForTimeout(300);
  ok('6 limpar filtros pelo aviso', await q.locator('.card').count() === 3 && await q.locator('#f-tipo [aria-pressed=true]').count() === 0);
  await q.close(); }

/* quadro com tamanho fixo e rolagem própria, mesmo com muitos pedidos (29/09) */
{ const q = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const muitos = []; for (let k = 0; k < 60; k++) muitos.push(L('X-' + String(k).padStart(2,'0'), 'normal', 'lider'));
  await q.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitacoes: muitos }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  await q.goto('file://' + __dirname + '/painel.html?t=pd-teste'); await q.waitForTimeout(900);
  const m = await q.evaluate(() => { const b = document.querySelector('.board-scroll'); const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), sh: b.scrollHeight, ov: getComputedStyle(b).overflowY, pagina: document.documentElement.scrollHeight }; });
  ok('7 quadro com altura fixa e rolagem própria', m.ov === 'auto' && m.h >= 480 && m.h <= 1200 && m.sh > m.h + 100, JSON.stringify(m));
  ok('7 a página não cresce com os cards', m.pagina < 900 + 700, JSON.stringify(m));
  await q.$eval('.board-scroll', b => b.scrollTop = 2000); await q.waitForTimeout(200);
  const topo = await q.evaluate(() => { const b = document.querySelector('.board-scroll').getBoundingClientRect(); const h = document.querySelector('.col-h').getBoundingClientRect(); return h.top - b.top; });
  ok('7 nome da coluna fica parado no topo ao rolar', topo >= -2 && topo < 40, topo);
  await q.close(); }

/* celular */
await p.setViewportSize({ width: 390, height: 800 }); await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(300);
ok('5 celular sem rolagem lateral da página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
