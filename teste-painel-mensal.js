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

ok('1 opção Mensal ligada', await p.$eval('#f-tipo option[value=mensal]', o => !o.disabled && o.textContent.trim() === 'Mensal'));
ok('1 todos: ordem normal', JSON.stringify(await cols()) === JSON.stringify(['Liderança imediata','Compras · cotação','Aprovação gerencial','Aprovação financeiro','Ordem de compra']), JSON.stringify(await cols()));
ok('1 todos: card mensal com etiqueta', /Mensal/.test(await p.textContent('.card[data-id="M-02"]')) && !/Mensal/.test(await p.textContent('.card[data-id="N-03"]')));

await p.selectOption('#f-tipo', 'mensal'); await p.waitForTimeout(300);
ok('2 mensal: colunas na ordem da mensal', JSON.stringify(await cols()) === JSON.stringify(['Liderança imediata','Aprovação gerencial','Compras · cotação','Aprovação financeiro','Ordem de compra']), JSON.stringify(await cols()));
ok('2 mensal: título diz compra mensal', /compra mensal/.test(await p.textContent('#quadro-titulo')));
ok('2 mensal: dica explica o fluxo', /gerência aprova antes da cotação/.test(await p.textContent('#quadro-dica')));
ok('2 mensal: só pedidos mensais', await p.locator('.card[data-id^="N-"]').count() === 0 && await p.locator('.card[data-id^="M-"]').count() === 4);
ok('2 mensal: sem etiqueta repetida', !/Mensal/.test(await p.textContent('.card[data-id="M-02"]')));
const colDe = id => p.$eval('.card[data-id="' + id + '"]', c => c.closest('.col').querySelector('h3').textContent.trim());
ok('2 M-02 na gerencial (2ª coluna)', await colDe('M-02') === 'Aprovação gerencial');
ok('2 M-03 na cotação (3ª coluna)', await colDe('M-03') === 'Compras · cotação');
ok('2 reprovada mensal embaixo', /M-06/.test(await p.textContent('#closed-area')) && /Fora do orçamento do mês/.test(await p.textContent('#closed-area')));

/* trilha do modal pelo fluxo do pedido */
await p.click('.card[data-id="M-03"]'); await p.waitForTimeout(300);
const trilha = await p.$$eval('#modal .step', s => s.map(x => x.textContent.trim() + (x.classList.contains('cur') ? '*' : '')));
ok('3 modal mensal: trilha Liderança → Gerencial → Cotação*', JSON.stringify(trilha.slice(0, 3)) === JSON.stringify(['Liderança','Gerencial','Cotação*']), JSON.stringify(trilha));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

await p.selectOption('#f-tipo', ''); await p.waitForTimeout(300);
await p.click('.card[data-id="N-02"]'); await p.waitForTimeout(300);
const trilhaN = await p.$$eval('#modal .step', s => s.map(x => x.textContent.trim() + (x.classList.contains('cur') ? '*' : '')));
ok('3 modal normal: trilha Liderança → Cotação*', JSON.stringify(trilhaN.slice(0, 3)) === JSON.stringify(['Liderança','Cotação*','Gerencial']), JSON.stringify(trilhaN));
await p.keyboard.press('Escape');

/* limpar filtros volta ao quadro normal */
await p.selectOption('#f-tipo', 'mensal'); await p.click('#f-clear'); await p.waitForTimeout(300);
ok('4 limpar filtros volta à ordem normal', (await cols())[1] === 'Compras · cotação' && !/compra mensal/.test(await p.textContent('#quadro-titulo')));

/* celular */
await p.setViewportSize({ width: 390, height: 800 }); await p.selectOption('#f-tipo', 'mensal'); await p.waitForTimeout(300);
ok('5 celular sem rolagem lateral da página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
