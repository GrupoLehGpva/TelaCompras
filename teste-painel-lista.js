/* FUNIL · VISÃO EM LISTA (30/09)
   O mesmo funil em linhas: agrupado por etapa na ordem do fluxo, com subtotal;
   ordenação clicando no título da coluna; os mesmos filtros e botões de tipo do
   quadro; linha abre o detalhe; a escolha Quadro/Lista fica guardada. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n,c,d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : JSON.stringify(d)));
const dia = n => new Date(Date.now() - n*864e5).toISOString();
const futuro = n => new Date(Date.now() + n*864e5).toISOString().slice(0,10);
const L = (numero, extra={}) => Object.assign({
  numero, tipo_compra:'normal', etapa_atual:'lider', status:'aguardando aprovacao', aberto_em:dia(5), entrou_na_etapa_em:dia(1),
  facilitador:'Ana Paula', solicitante_nome:'Ana Paula', empresa:'WIENFRIED MATTHIAS LEH - PR', centro_custo:'20', cc_nome:'FABRICA', motivo:'m',
  itens:[{ desc:'Contratação de empresa especializada para a montagem dos silos ' + numero, qtd:1, un:'UN', fam:'MG' }], decisoes:[], cotacoes:[], ordens:[], canal:'telas', movimentos:[],
  data_necessidade: futuro(10)
}, extra);
const LINHAS = [
  L('C-LID', { aprovador_atual_nome:'ALVARO BRANDAO FILHO' }),
  L('C-COT', { etapa_atual:'cotacao', status:'em cotacao', tipo_compra:'urgente', entrou_na_etapa_em:dia(7) }),
  L('C-GER1', { etapa_atual:'gerencial', valor_cotado:900, fornecedor_cotado:'ROLAMAX', aprovador_atual_nome:'BRANDÃO', entrou_na_etapa_em:dia(0.5) }),
  L('C-GER2', { etapa_atual:'gerencial', valor_cotado:100, fornecedor_cotado:'H&A MANUTENÇÃO INDUSTRIAL E MONTAGENS LTDA', aprovador_atual_nome:'BRANDÃO', entrou_na_etapa_em:dia(3) }),
  L('C-FIN', { etapa_atual:'financeiro', valor_cotado:5000, fornecedor_cotado:'SUL', aprovador_atual_nome:'Financeiro (Wienfried, Elisangela, Isabela)' }),
  L('M-GER', { etapa_atual:'gerencial', tipo_compra:'mensal', aprovador_atual_nome:'BRANDÃO' }),
  L('C-REP', { etapa_atual:null, status:'reprovado', decisoes:[{ etapa:'lider', resp:'reprovado', motivo:'Sem verba', por:'X', em:dia(2) }] }),
];
(async () => {
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:1600, height:1000 } });
const p = await ctx.newPage();
p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue();
  if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, quem:'Diretoria', solicitacoes:LINHAS }) });
  return r.fulfill({ status:200, contentType:'application/json', body:'[]' }); });
await p.goto('file://' + __dirname + '/painel.html?t=pa-teste'); await p.waitForTimeout(900);
await p.selectOption('#f-per', 'all'); await p.waitForTimeout(200);

ok('0 abre no quadro', await p.locator('#board-area .board').count() === 1 && await p.getAttribute('#f-vista [data-vista=quadro]', 'aria-pressed') === 'true');
ok('0 Quadro|Lista ao lado do título', await p.evaluate(() => document.getElementById('f-vista').closest('.sec-h').contains(document.getElementById('quadro-titulo'))));
await p.click('#f-vista [data-vista=lista]'); await p.waitForTimeout(300);
ok('1 vira lista', await p.locator('#board-area table.lista').count() === 1 && await p.locator('#board-area .board').count() === 0);
ok('1 botão Lista marcado', await p.getAttribute('#f-vista [data-vista=lista]', 'aria-pressed') === 'true');
ok('1 dica fala de linha', /numa linha/.test(await p.textContent('#quadro-dica')));
const cab = await p.$$eval('table.lista thead th', t => t.map(x => x.textContent.trim()));
ok('1 colunas relevantes', JSON.stringify(cab) === JSON.stringify(['Nº','Solicitação','Tipo','Etapa','Com quem','Na etapa','Valor','Fornecedor','Precisa até','Aberta em']), JSON.stringify(cab));
const grupos = await p.$$eval('table.lista tr.grupo td', t => t.map(x => x.textContent.trim()));
ok('2 grupos por etapa na ordem do fluxo', grupos.length === 5 && /^Liderança imediata · 1/.test(grupos[0]) && /^Compras · cotação · 1/.test(grupos[1]) && /^Aprovação gerencial · 3/.test(grupos[2]) && /^Aprovação financeiro · 1/.test(grupos[3]) && /^Ordem de compra · 0/.test(grupos[4]), JSON.stringify(grupos));
ok('2 subtotal do grupo', /R\$\s?1\.000|R\$\s?1 mil|1 mil/.test(grupos[2]) && /1 sem valor/.test(grupos[2]), grupos[2]);
const ids = await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id));
ok('2 só em andamento (reprovada fica embaixo)', ids.length === 6 && !ids.includes('C-REP'), JSON.stringify(ids));
ok('2 gerencial: mais atrasado primeiro', ids.indexOf('C-GER2') < ids.indexOf('C-GER1'), JSON.stringify(ids));
const linha = await p.$$eval('tr[data-id="C-GER1"] td', t => t.map(x => x.textContent.trim()));
ok('3 linha com etapa, quem, valor, fornecedor e quem pediu', linha[3] === 'Gerencial' && linha[4] === 'BRANDÃO' && /900,00/.test(linha[6]) && linha[7] === 'ROLAMAX' && /Ana Paula · FABRICA/.test(linha[1]), JSON.stringify(linha));
ok('3 largura: cabe inteira numa tela de 1440', await (async () => { await p.setViewportSize({ width:1440, height:900 }); await p.waitForTimeout(200);
   const r = await p.evaluate(() => { const w = document.querySelector('.lista-scroll'); return w.scrollWidth <= w.clientWidth + 1; }); await p.setViewportSize({ width:1600, height:1000 }); return r; })());
ok('3 urgente e mensal em destaque', /Urgente/.test(await p.textContent('tr[data-id="C-COT"] td:nth-child(3)')) && /Mensal/.test(await p.textContent('tr[data-id="M-GER"] td:nth-child(3)')));
ok('3 prazo da etapa colorido', await p.locator('tr[data-id="C-COT"] .pill.crit').count() === 1);
ok('3 rodapé com total', /6 solicitações em andamento/.test(await p.textContent('table.lista tfoot')) && /6\.000,00/.test(await p.textContent('table.lista tfoot')) && /3 sem valor/.test(await p.textContent('table.lista tfoot')), await p.textContent('table.lista tfoot'));

/* ordenar */
await p.click('[data-ord=valor]'); await p.waitForTimeout(200);
let ord = await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id));
ok('4 ordenar por valor: sem grupos, crescente', await p.locator('tr.grupo').count() === 0 && ord.slice(-3).join() === 'C-GER2,C-GER1,C-FIN', JSON.stringify(ord));
ok('4 cabeçalho marca a ordem', await p.getAttribute('th:has([data-ord=valor])', 'aria-sort') === 'ascending');
await p.click('[data-ord=valor]'); await p.waitForTimeout(200);
ord = await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id));
ok('4 segundo clique: decrescente', ord[0] === 'C-FIN' && await p.getAttribute('th:has([data-ord=valor])', 'aria-sort') === 'descending', JSON.stringify(ord));
ok('4 ordenado: aviso com o botão de voltar', /Ordenado por Valor ↓ decrescente/.test(await p.textContent('.ord-aviso')) && await p.isVisible('#ord-volta'));
await p.click('[data-ord=valor]'); await p.waitForTimeout(200);
ok('4 terceiro clique: volta aos grupos', await p.locator('tr.grupo').count() === 5 && await p.locator('.ord-aviso').count() === 0);
await p.click('[data-ord=num]'); await p.waitForTimeout(200);
ok('4b ordenar por Nº: aviso aparece', /Ordenado por Nº ↑ crescente/.test(await p.textContent('.ord-aviso')) && await p.locator('tr.grupo').count() === 0);
await p.click('#ord-volta'); await p.waitForTimeout(200);
ok('4b botão "Voltar à lista por etapa" devolve os grupos', await p.locator('tr.grupo').count() === 5 && await p.locator('.ord-aviso').count() === 0 && await p.getAttribute('th:has([data-ord=num])', 'aria-sort') === 'none');
await p.click('[data-ord=na]'); await p.waitForTimeout(200);
await p.click('[data-ord=na]'); await p.waitForTimeout(200);
ok('4 na etapa decrescente: mais parado primeiro', (await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id)))[0] === 'C-COT');
await p.click('[data-ord=na]'); await p.waitForTimeout(200);

/* filtros e tipo valem na lista */
await p.click('#f-tipo [data-tipo=urgente]'); await p.waitForTimeout(200);
ok('5 botão Urgente filtra a lista', JSON.stringify(await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id))) === '["C-COT"]');
await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(200);
const gm = await p.$$eval('table.lista tr.grupo td', t => t.map(x => x.textContent.trim().split(' · ')[0]));
ok('5 mensal: grupos na ordem da mensal', JSON.stringify(gm) === JSON.stringify(['Liderança imediata','Aprovação gerencial','Aguardando o lote','Compras · cotação','Aprovação financeiro','Ordem de compra']) || JSON.stringify(gm) === JSON.stringify(['Liderança imediata','Aprovação gerencial','Aguardando o lote','Compras','Aprovação financeiro','Ordem de compra']), JSON.stringify(gm));
await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(200);
await p.fill('#f-q', 'ger1'); await p.waitForTimeout(300);
ok('5 busca filtra a lista', JSON.stringify(await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id))) === '["C-GER1"]');
await p.fill('#f-q', 'zzz-nada'); await p.waitForTimeout(300);
ok('5 sem resultado: aviso com limpar', /Nenhuma solicitação com esses filtros/.test(await p.textContent('#board-area')) && await p.locator('#empty-clear').count() === 1);
await p.click('#empty-clear'); await p.waitForTimeout(300);
ok('5 limpar filtros mantém a lista', await p.locator('table.lista').count() === 1 && await p.locator('table.lista tbody tr[data-id]').count() === 6);

/* detalhe */
await p.click('tr[data-id="C-GER1"]'); await p.waitForTimeout(300);
ok('6 linha abre o detalhe', !(await p.isHidden('#overlay')) && /C-GER1/.test(await p.textContent('#modal')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.focus('tr[data-id="C-FIN"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
ok('6 Enter na linha abre o detalhe', /C-FIN/.test(await p.textContent('#modal')));
await p.keyboard.press('Escape');

/* a escolha fica guardada */
await p.reload(); await p.waitForTimeout(900);
ok('7 recarregar abre na lista', await p.locator('table.lista').count() === 1);
await p.click('#f-vista [data-vista=quadro]'); await p.waitForTimeout(300);
ok('7 volta ao quadro', await p.locator('#board-area .board').count() === 1 && /num card/.test(await p.textContent('#quadro-dica')));
await p.reload(); await p.waitForTimeout(900);
ok('7 e o quadro fica guardado', await p.locator('#board-area .board').count() === 1);

/* celular: a tabela rola dentro dela, a página não */
await p.click('#f-vista [data-vista=lista]'); await p.setViewportSize({ width:390, height:800 }); await p.waitForTimeout(300);
ok('8 celular: sem rolagem lateral da página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
ok('8 celular: Quadro|Lista visível', await p.isVisible('#f-vista'));

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
