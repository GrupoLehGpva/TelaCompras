/* INDICADORES DE COMPRAS (indicadores.html) — 29/09/2026
   Tela de BI da diretoria, irmã do funil (painel.html). Lê a mesma função
   painel_diretoria(token) e calcula tudo no navegador.

   Esta bateria monta um banco de mentira com os casos que importam (caminho das
   telas e do ClickUp, compra mensal, urgente, fornecedor único, reprovado na
   liderança e na cotação, cancelado, devolvido ao comprador, pedido parado há
   mais de 7 dias, data de necessidade vencida, duas propostas) e confere CADA
   número contra a conta feita à mão, em relógio parado — e clica em tudo:
   períodos, filtros, barras que filtram, Ver tabela, pedidos parados, planilha,
   Atualizar, dica do mouse, estados de erro e o botão entre funil ⇄ indicadores.

       node teste-indicadores.js
*/
const { chromium } = require('playwright');
const falhas = []; let n = 0;
const ok = (nome, cond, det) => { n++; if (!cond) falhas.push(nome + ' — ' + (det === undefined ? '' : JSON.stringify(det).slice(0, 400))); };

const AGORA = new Date('2026-09-29T20:00:00Z');                 /* 17:00 em Brasília */
const dia = d => new Date(AGORA.getTime() - d * 864e5).toISOString();
const it = (desc, fam, qtd = 1, un = 'UN') => ({ desc, fam, qtd, un, fora: !fam, p1: null, p2: null, p3: null });
const dec = (etapa, d, por, resp = 'aprovado', motivo = null) => ({ etapa, resp, por, em: dia(d), motivo, valor: null });
const mv = (acao, etapa, d, por, motivo = null) => ({ acao, etapa, por, motivo, em: dia(d) });
const SUI = { cc_unidade: 'SUÍNOS', empresa: 'EMPRESA A' }, AGR = { cc_unidade: 'AGRICULTURA', empresa: 'EMPRESA B' };
function P(numero, o){
  return Object.assign({ numero, canal: 'telas', status: 'aguardando aprovacao', etapa_atual: 'lider', tipo_compra: 'normal', prioridade: 'normal',
    centro_custo: '1', cc_nome: 'GRANJA 1', facilitador: 'Ana Paula', comprador_nome: 'HERISSON', aprovador_atual_nome: null,
    definicao_fornecedor: 'cotacao', data_necessidade: '2026-10-15', decidido_em: null, cotacao_em: null, entrou_na_etapa_em: null,
    cancelado_em: null, valor_cotado: null, fornecedor_cotado: null, itens: [it('ITEM ' + numero, 'MG')], decisoes: [], cotacoes: [],
    ordens: [], movimentos: [], anexos: [] }, SUI, o);
}
const LINHAS = [
  P('T-LID', { aberto_em: dia(1), aprovador_atual_nome: 'ANA LÍDER', data_necessidade: '2026-10-10' }),
  P('T-COT', { status: 'em cotacao', etapa_atual: 'cotacao', tipo_compra: 'urgente', aberto_em: dia(10), entrou_na_etapa_em: dia(9),
    decisoes: [dec('lider', 9, 'ANA LÍDER')], data_necessidade: '2026-09-25', itens: [it('SAL', 'IA', 1000, 'KG')] }),
  P('T-GER', Object.assign({}, AGR, { etapa_atual: 'gerencial', aberto_em: dia(8), entrou_na_etapa_em: dia(5), aprovador_atual_nome: 'BRUNO GERENTE',
    centro_custo: '2', cc_nome: 'FAZENDA SUL', valor_cotado: 20000, fornecedor_cotado: 'ROLAMAX', cotacao_em: dia(5),
    decisoes: [dec('lider', 7.5, 'ANA LÍDER')],
    movimentos: [mv('cotacao_enviada', 'cotacao', 7, 'HERISSON'), mv('devolvido', 'gerencial', 6, 'BRUNO GERENTE', 'Negociar frete'), mv('cotacao_enviada', 'cotacao', 5, 'HERISSON', 'Frete zerado')] })),
  P('M-FIN', { tipo_compra: 'mensal', etapa_atual: 'financeiro', aberto_em: dia(6), entrou_na_etapa_em: dia(2.5), aprovador_atual_nome: 'WIENFRIED',
    centro_custo: '3', cc_nome: 'GRANJA 2', valor_cotado: 50000, cotacao_em: dia(3),
    decisoes: [dec('lider', 5.5, 'ANA LÍDER'), dec('gerencial', 5, 'BRUNO GERENTE')], movimentos: [mv('cotacao_enviada', 'cotacao', 3, 'HERISSON')],
    itens: [it('MILHO', 'IA', 100, 'KG'), it('PARAFUSO', 'MG', 10)] }),
  P('C-OK1', Object.assign({}, AGR, { canal: 'clickup', status: 'aprovado', etapa_atual: null, aberto_em: dia(12), centro_custo: '2', cc_nome: 'FAZENDA SUL',
    definicao_fornecedor: 'unico', data_necessidade: '2026-09-25', cotacao_em: dia(9), decidido_em: dia(7), valor_cotado: 100000,
    decisoes: [dec('lider', 11, 'ANA LÍDER'), dec('gerencial', 8, 'BRUNO GERENTE'), dec('financeiro', 7, 'WIENFRIED')],
    cotacoes: [{ forn: 'X', status: 'respondida', enviada: dia(10), respondida: dia(9.5), total: 100000 }, { forn: 'Y', status: 'respondida', enviada: dia(10), respondida: dia(9.5), total: 130000 }] })),
  P('C-OK2', { canal: 'clickup', status: 'aprovado', etapa_atual: null, aberto_em: dia(40), cotacao_em: dia(37), decidido_em: dia(35), valor_cotado: 10000,
    decisoes: [dec('lider', 39, 'ANA LÍDER'), dec('gerencial', 36, 'BRUNO GERENTE'), dec('financeiro', 35, 'WIENFRIED')] }),
  P('C-REP', { canal: 'clickup', status: 'reprovado', etapa_atual: null, aberto_em: dia(3), decidido_em: dia(2),
    decisoes: [dec('lider', 2, 'ANA LÍDER', 'reprovado', 'Sem verba')] }),
  P('T-REPCOT', { status: 'reprovado', etapa_atual: null, tipo_compra: 'urgente', aberto_em: dia(4), decidido_em: dia(3),
    decisoes: [dec('lider', 3.5, 'ANA LÍDER'), dec('compras', 3, 'HERISSON', 'reprovado', 'Item sem fornecedor')] }),
  P('T-CAN', { status: 'cancelado', etapa_atual: null, aberto_em: dia(2), cancelado_em: dia(1), solicitante_nome: '=cmd',
    movimentos: [mv('cancelado', null, 1, 'Carlos', 'Comprei de outro jeito')] }),
  P('T-OK3', { status: 'aprovado', etapa_atual: null, cc_unidade: 'ESCRITÓRIO', empresa: 'EMPRESA C', centro_custo: '4', cc_nome: 'ADM',
    aberto_em: dia(5), cotacao_em: dia(4), decidido_em: dia(2), valor_cotado: 5000, data_necessidade: '2026-09-26', itens: [it('NOTEBOOK', 'ME')],
    decisoes: [dec('lider', 4.8, 'ANA LÍDER'), dec('gerencial', 3, 'BRUNO GERENTE'), dec('financeiro', 2, 'WIENFRIED')],
    movimentos: [mv('cotacao_enviada', 'cotacao', 4, 'HERISSON')] }),
];

let resposta = () => ({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS });
let chamadas = 0;
async function abrir(b, url, { largura = 1600, esquema = 'light' } = {}){
  const ctx = await b.newContext({ viewport: { width: largura, height: 1000 }, colorScheme: esquema, timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA (' + url + '): ' + e.message));
  await p.clock.install({ time: AGORA });
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/painel_diretoria')){ chamadas++; const x = resposta(); if (x === 'rede') return r.abort(); if (typeof x === 'number') return r.fulfill({ status: x, body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) }); }
    return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await p.goto('file://' + __dirname + '/' + url); await p.waitForTimeout(500);
  return p;
}
const txt = (p, sel) => p.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' ').trim()).catch(() => null);
const nb = s => (s || '').replace(/\u00a0/g, ' ');
const ns = s => nb(s).replace(/\s+/g, '');   /* sem espaço nenhum: o innerText cola trechos em linha */

(async () => {
const b = await chromium.launch();

/* ===== 1. Acesso e erros ===== */
{ const p = await abrir(b, 'indicadores.html');
  ok('1 sem token: pede o link', /precisa do seu link/.test(await txt(p, '#conteudo')), await txt(p, '#conteudo'));
  ok('1 sem token: sem botão tentar de novo', await p.locator('#err-retry').count() === 0);
  ok('1 sem token: CSV desligado', await p.isDisabled('#btn-csv'));
  await p.context().close(); }
{ resposta = () => ({ ok: false, erro: 'sem_acesso', mensagem: 'x' });
  const p = await abrir(b, 'indicadores.html?t=pd-errado');
  ok('1 sem acesso', /não dá acesso/.test(await txt(p, '#conteudo')) && /Sem acesso/.test(await txt(p, '#live')));
  await p.context().close(); }
{ resposta = () => 'rede';
  const p = await abrir(b, 'indicadores.html?t=pd-teste');
  ok('1 rede fora: mensagem', /Não foi possível falar com o banco/.test(await txt(p, '#conteudo')));
  resposta = () => ({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS });
  await p.click('#err-retry'); await p.waitForTimeout(400);
  ok('1 tentar de novo carrega', /Posição da carteira/.test(await txt(p, '#conteudo')));
  await p.context().close(); }
{ resposta = () => 404;
  const p = await abrir(b, 'indicadores.html?t=pd-teste');
  ok('1 função ausente (404)', /painel_diretoria/.test(await txt(p, '#conteudo')));
  await p.context().close(); }
{ resposta = () => ({ ok: true, quem: 'Diretoria', solicitacoes: [] });
  const p = await abrir(b, 'indicadores.html?t=pd-teste');
  ok('1 banco vazio', /Nenhum pedido no banco ainda/.test(await txt(p, '#conteudo')));
  await p.context().close(); }
resposta = () => ({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS });

/* ===== 2. Números, últimos 30 dias (padrão) ===== */
const p = await abrir(b, 'indicadores.html?t=pd-teste');
ok('2 período padrão = 30 dias', await p.inputValue('#f-per') === 'd30');
ok('2 status', /Diretoria · 10 pedidos no banco · atualizado às 17:00/.test(await txt(p, '#live')), await txt(p, '#live'));
ok('2 CSV ligado', !(await p.isDisabled('#btn-csv')));
ok('2 link do funil leva o token', (await p.getAttribute('#lnk-funil', 'href')) === 'painel.html?t=pd-teste');
ok('2 valor em andamento', nb(await txt(p, '#v-carteira')) === 'R$ 70.000,00', await txt(p, '#v-carteira'));
const hero = nb(await txt(p, '#c-hero'));
ok('2 hero: 4 em andamento, 2 sem preço, 2 parados, 1 vencido', /4 pedidos em andamento/.test(hero) && /2 ainda sem preço/.test(hero) && /2 parados há mais de 3 dias/.test(hero) && /1 já passou da data/.test(hero), hero);
const onde = nb(await txt(p, '#c-onde'));
ok('2 onde estão', /Em liderança · 1/.test(onde) && /Em cotação · 1/.test(onde) && /Em gerencial · 1/.test(onde) && /Em financeiro · 1/.test(onde), onde);
const lei = nb(await txt(p, '#c-leituras'));
ok('2 leitura: parados', /2 pedidos parados há mais de 3 dias \(1 há mais de 7\), somando R\$ 20\.000,00/.test(lei), lei);
ok('2 leitura: data vencida', /1 pedido em andamento já passou da data de necessidade/.test(lei), lei);
ok('2 leitura: etapa mais demorada', /Etapa mais demorada nos últimos 30 dias: compras · cotação, com média de 1,1 dias/.test(lei), lei);
ok('2 leitura: concentração', /AGRICULTURA concentra 69% do valor/.test(lei), lei);
ok('2 leitura: fornecedor único', /95% do valor aprovado nos últimos 30 dias foi com fornecedor único/.test(lei), lei);
ok('2 leitura: taxa', /Taxa de aprovação nos últimos 30 dias: 50% \(2 aprovados, 2 reprovados\)/.test(lei), lei);
ok('2 pedidos abertos + delta', /Pedidosabertos9▲800%/.test(ns(await txt(p, '#t-pedidos'))), await txt(p, '#t-pedidos'));
ok('2 valor aprovado + delta', /R\$105mil▲950%/.test(ns(await txt(p, '#t-aprovado'))) && /2 pedidos aprovados/.test(await txt(p, '#t-aprovado')), await txt(p, '#t-aprovado'));
ok('2 valor médio', /R\$ 52,5 mil/.test(nb(await txt(p, '#t-ticket'))), await txt(p, '#t-ticket'));
ok('2 taxa de aprovação', /50%/.test(await txt(p, '#t-taxa')) && /2 aprovados · 2 reprovados · 1 cancelado$/.test(await txt(p, '#t-taxa')), await txt(p, '#t-taxa'));
ok('2 tempo até aprovar', /4 dias/.test(await txt(p, '#t-lead')), await txt(p, '#t-lead'));
ok('2 urgentes', /22%/.test(await txt(p, '#t-urg')) && /2 de 9/.test(await txt(p, '#t-urg')), await txt(p, '#t-urg'));
const sit = nb(await txt(p, '#c-situacao'));
ok('2 situação', /Aprovado · ordem de compra · 2/.test(sit) && /Reprovado · 2/.test(sit) && /Cancelado · 1/.test(sit), sit);
const fn = await p.$$eval('#c-funil .fn-row', rs => rs.map(r => r.querySelector('.n').textContent));
ok('2 funil 9 → 6 → 4 → 3 → 2', JSON.stringify(fn) === '["9","6","4","3","2"]', fn);
const tempo = nb(await txt(p, '#c-tempo'));
ok('2 tempo por etapa', /Liderança imediata16 horas7 passagens/.test(tempo.replace(/ /g, '')) || (/16 horas/.test(tempo) && /1,1 dias/.test(tempo) && /21 horas/.test(tempo) && /1 dia/.test(tempo)), tempo);
const par = await p.$$eval('#c-parados tbody tr', rs => rs.map(r => [r.cells[0].textContent.trim(), r.querySelector('.pill:last-child') ? r.cells[4].querySelector('.pill').className : '', r.cells[4].textContent.trim()]));
ok('2 parados: ordem e cores', JSON.stringify(par.map(x => x[0])) === '["T-COT","T-GER","M-FIN","T-LID"]' && /crit/.test(par[0][1]) && /warn/.test(par[1][1]) && /neutral/.test(par[2][1]), par);
ok('2 parados: 9 dias / 5 dias / 2 dias / 1 dia', par.map(x => x[2]).join('|') === '9 dias|5 dias|2 dias|1 dia', par.map(x => x[2]));
const und = nb(await txt(p, '#c-unidade .viz'));
ok('2 por unidade', /AGRICULTURAR\$120mil2pedidos·69%/.test(ns(und)) && /SUÍNOSR\$50mil6pedidos·29%/.test(ns(und)) && /ESCRITÓRIOR\$5mil1pedido·3%/.test(ns(und)), und);
ok('2 por empresa', /EMPRESA B/.test(await txt(p, '#c-empresa')) && /EMPRESA C/.test(await txt(p, '#c-empresa')));
const fam = nb(await txt(p, '#c-familia .viz'));
ok('2 por família', /MG7pedidos7itens/.test(ns(fam)) && /IA2pedidos2itens/.test(ns(fam)) && /ME1pedido1item/.test(ns(fam)), fam);
ok('2 tipo de compra', /Normal · 6/.test(nb(await txt(p, '#c-tipo'))) && /Urgente · 2/.test(nb(await txt(p, '#c-tipo'))) && /Mensal · 1/.test(nb(await txt(p, '#c-tipo'))), await txt(p, '#c-tipo'));
ok('2 fornecedor único', /11%/.test(await txt(p, '#c-unico')) && /95%/.test(await txt(p, '#c-unico')), await txt(p, '#c-unico'));
ok('2 data de necessidade', /50%/.test(await txt(p, '#c-necessidade')) && /\(1 de 2\)/.test(await txt(p, '#c-necessidade')) && /Agora: 1 pedido em andamento/.test(nb(await txt(p, '#c-necessidade'))), await txt(p, '#c-necessidade'));
const aps = await p.$$eval('#c-aprovadores tbody tr', rs => rs.map(r => [...r.cells].map(c => c.textContent.trim()).join('|')));
ok('2 aprovadores', aps[0] === 'ANA LÍDER|Liderança|7|6|1|0|16 horas|1' && aps[1] === 'BRUNO GERENTE|Gerencial|4|3|0|1|21 horas|1' && aps[2] === 'WIENFRIED|Financeiro|2|2|0|0|1 dia|1', aps);
const rep = nb(await txt(p, '#c-reprovacoes'));
ok('2 reprovações', /Na liderança 1 pedido/.test(rep) && /Na cotação 1 pedido/.test(rep) && /Cancelados por quem pediu 1 pedido/.test(rep) && /Sem verba/.test(rep) && /Item sem fornecedor/.test(rep) && /Comprei de outro jeito/.test(rep), rep);
ok('2 reprovações: último primeiro', /^Reprovações.*T-CAN.*C-REP.*T-REPCOT/.test(rep), rep);
const cot = nb(await txt(p, '#c-cotacao'));
ok('2 cotação', /Cotações enviadas 5/.test(cot) && /Tempo médio de cotação 1,3 dias/.test(cot) && /Na fila de cotação agora 1 mais antigo há 9 dias/.test(cot) && /Devolvidos ao comprador 1/.test(cot) && /R\$ 30 mil 1 pedido com 2\+ propostas/.test(cot), cot);
ok('2 colunas por dia', /Pedidos abertos por dia/.test(await txt(p, '#c-abertos')) && await p.locator('#c-abertos .cols .c').count() === 30, await p.locator('#c-abertos .cols .c').count());

/* ===== 3. Períodos ===== */
await p.selectOption('#f-per', 'd7'); await p.waitForTimeout(150);
ok('3 7 dias: 6 pedidos, ▲ 100%', /Pedidosabertos6▲100%/.test(ns(await txt(p, '#t-pedidos'))), await txt(p, '#t-pedidos'));
ok('3 7 dias: rótulo', /Nos últimos 7 dias · comparação vs. 7 dias anteriores/.test(await txt(p, '#rot-periodo')), await txt(p, '#rot-periodo'));
await p.selectOption('#f-per', 'all'); await p.waitForTimeout(150);
ok('3 todo o período: 10, sem comparação', /Pedidos abertos 10/.test(nb(await txt(p, '#t-pedidos'))) && !/▲|▼/.test(await txt(p, '#t-pedidos')) && /Em todo o período$/.test(await txt(p, '#rot-periodo')), await txt(p, '#t-pedidos'));
ok('3 todo o período: valor aprovado 115 mil', /R\$ 115 mil/.test(nb(await txt(p, '#t-aprovado'))), await txt(p, '#t-aprovado'));
ok('3 todo o período: 41 dias → por dia, desde o 1º pedido', /Pedidos abertos por dia/.test(await txt(p, '#c-abertos')) && await p.locator('#c-abertos .cols .c').count() === 41, await p.locator('#c-abertos .cols .c').count());
await p.selectOption('#f-per', 'mes'); await p.waitForTimeout(150);
ok('3 este mês', /Pedidos abertos 9/.test(nb(await txt(p, '#t-pedidos'))) && /Neste mês/.test(await txt(p, '#rot-periodo')), await txt(p, '#t-pedidos'));
await p.selectOption('#f-per', 'ano'); await p.waitForTimeout(150);
ok('3 este ano', /Pedidos abertos 10/.test(nb(await txt(p, '#t-pedidos'))), await txt(p, '#t-pedidos'));
await p.selectOption('#f-per', 'd90'); await p.waitForTimeout(150);
ok('3 90 dias', /Pedidos abertos 10/.test(nb(await txt(p, '#t-pedidos'))), await txt(p, '#t-pedidos'));
const meses = await p.$$eval('#f-per optgroup option', os => os.map(o => o.value));
ok('3 meses fechados', JSON.stringify(meses) === '["m:2026-09","m:2026-08"]', meses);
await p.selectOption('#f-per', 'm:2026-08'); await p.waitForTimeout(150);
ok('3 agosto: 1 pedido', /Pedidos abertos 1/.test(nb(await txt(p, '#t-pedidos'))) && /Em Agosto\/2026 · comparação vs. mês anterior/.test(await txt(p, '#rot-periodo')), await txt(p, '#t-pedidos'));
ok('3 posição de agora não muda com o período', nb(await txt(p, '#v-carteira')) === 'R$ 70.000,00');
await p.selectOption('#f-per', 'd30'); await p.waitForTimeout(150);

/* ===== 4. Filtros (selects) e Limpar ===== */
await p.selectOption('#f-und', 'AGRICULTURA'); await p.waitForTimeout(150);
ok('4 unidade: 2 pedidos, R$ 100 mil aprovado', /Pedidos abertos 2/.test(nb(await txt(p, '#t-pedidos'))) && /R\$ 100 mil/.test(nb(await txt(p, '#t-aprovado'))), await txt(p, '#t-pedidos'));
ok('4 unidade: carteira só da unidade', nb(await txt(p, '#v-carteira')) === 'R$ 20.000,00');
await p.selectOption('#f-emp', 'EMPRESA A'); await p.waitForTimeout(150);
ok('4 sem resultado: aviso + limpar', /Nenhum pedido com esses filtros/.test(await txt(p, '#conteudo')));
await p.click('#empty-clear'); await p.waitForTimeout(150);
ok('4 limpar pelo aviso', await p.inputValue('#f-und') === '' && await p.inputValue('#f-emp') === '' && /Pedidos abertos 9/.test(nb(await txt(p, '#t-pedidos'))), [await p.inputValue('#f-und'), await p.inputValue('#f-emp'), await txt(p, '#t-pedidos')]);
await p.selectOption('#f-cc', 'GRANJA 2'); await p.waitForTimeout(150);
ok('4 centro de custo', /Pedidos abertos 1/.test(nb(await txt(p, '#t-pedidos'))));
await p.selectOption('#f-cc', ''); await p.selectOption('#f-tipo', 'urgente'); await p.waitForTimeout(150);
ok('4 tipo urgente', /Pedidos abertos 2/.test(nb(await txt(p, '#t-pedidos'))) && /100%/.test(await txt(p, '#t-urg')));
await p.selectOption('#f-tipo', 'mensal'); await p.waitForTimeout(150);
ok('4 tipo mensal', /Pedidos abertos 1/.test(nb(await txt(p, '#t-pedidos'))) && nb(await txt(p, '#v-carteira')) === 'R$ 50.000,00');
await p.selectOption('#f-tipo', ''); await p.selectOption('#f-fam', 'IA'); await p.waitForTimeout(150);
ok('4 família IA', /Pedidos abertos 2/.test(nb(await txt(p, '#t-pedidos'))));
await p.selectOption('#f-per', 'all'); await p.click('#f-clear'); await p.waitForTimeout(150);
ok('4 limpar filtros volta tudo (e o período para 30 dias)', await p.inputValue('#f-fam') === '' && await p.inputValue('#f-per') === 'd30' && /Pedidos abertos 9/.test(nb(await txt(p, '#t-pedidos'))));
ok('4 aviso "Filtros limpos"', /Filtros limpos/.test(await txt(p, '#toast')));
const opcoesUnd = await p.$$eval('#f-und option', os => os.map(o => o.value));
ok('4 opções de unidade', JSON.stringify(opcoesUnd) === '["","AGRICULTURA","ESCRITÓRIO","SUÍNOS"]', opcoesUnd);

/* ===== 5. Clique no gráfico filtra (e clique de novo tira) ===== */
await p.click('#c-unidade .hb-row[data-valor="SUÍNOS"]'); await p.waitForTimeout(150);
ok('5 clique na unidade filtra', await p.inputValue('#f-und') === 'SUÍNOS' && /Pedidos abertos 6/.test(nb(await txt(p, '#t-pedidos'))) && /Filtro aplicado: Unidade de negócio = SUÍNOS/.test(await txt(p, '#toast')));
await p.click('#c-unidade .hb-row[data-valor="SUÍNOS"]'); await p.waitForTimeout(150);
ok('5 clique de novo tira', await p.inputValue('#f-und') === '' && /Filtro retirado/.test(await txt(p, '#toast')));
await p.click('#c-cc .hb-row[data-valor="FAZENDA SUL"]'); await p.waitForTimeout(150);
ok('5 clique no centro de custo', await p.inputValue('#f-cc') === 'FAZENDA SUL' && /Pedidos abertos 2/.test(nb(await txt(p, '#t-pedidos'))));
await p.click('#c-cc .hb-row[data-valor="FAZENDA SUL"]'); await p.waitForTimeout(150);
await p.click('#c-empresa .hb-row[data-valor="EMPRESA C"]'); await p.waitForTimeout(150);
ok('5 clique na empresa', await p.inputValue('#f-emp') === 'EMPRESA C' && /Pedidos abertos 1/.test(nb(await txt(p, '#t-pedidos'))));
await p.click('#c-empresa .hb-row[data-valor="EMPRESA C"]'); await p.waitForTimeout(150);
await p.click('#c-familia .hb-row[data-valor="ME"]'); await p.waitForTimeout(150);
ok('5 clique na família', await p.inputValue('#f-fam') === 'ME' && /Pedidos abertos 1/.test(nb(await txt(p, '#t-pedidos'))));
await p.click('#c-familia .hb-row[data-valor="ME"]'); await p.waitForTimeout(150);
await p.click('#c-tipo .seg[data-valor="urgente"]'); await p.waitForTimeout(150);
ok('5 clique no tipo', await p.inputValue('#f-tipo') === 'urgente' && /Pedidos abertos 2/.test(nb(await txt(p, '#t-pedidos'))));
await p.click('#c-tipo .seg[data-valor="urgente"]'); await p.waitForTimeout(150);
ok('5 tudo sem filtro de novo', await p.inputValue('#f-tipo') === '' && /Pedidos abertos 9/.test(nb(await txt(p, '#t-pedidos'))));

/* ===== 6. Ver tabela em todos os cartões ===== */
const cards = await p.$$eval('#conteudo [data-vista]', bs => bs.map(x => x.dataset.vista));
ok('6 cartões com tabela', cards.length === 12, cards);
for (const id of cards){
  await p.click(`[data-vista="${id}"]`); await p.waitForTimeout(60);
  const vis = await p.evaluate(i => { const c = document.getElementById(i); return [c.querySelector('.viz').hidden, c.querySelector('.tab').hidden, c.querySelector('[data-vista]').textContent]; }, id);
  ok('6 ' + id + ' mostra a tabela', vis[0] === true && vis[1] === false && vis[2] === 'Ver gráfico', vis);
}
await p.selectOption('#f-per', 'd7'); await p.waitForTimeout(150);
ok('6 tabela continua aberta depois de filtrar', await p.evaluate(() => !document.querySelector('#c-unidade .tab').hidden));
const tabUnd = await p.$$eval('#c-unidade .tab tbody tr', rs => rs.map(r => [...r.cells].map(c => c.textContent.trim()).join('|')));
ok('6 tabela da unidade (7 dias)', tabUnd.some(l => /^SUÍNOS\|5\|/.test(l)) && tabUnd.some(l => /^ESCRITÓRIO\|1\|/.test(l)), tabUnd);
for (const id of cards){
  await p.click(`[data-vista="${id}"]`); await p.waitForTimeout(40);
  ok('6 ' + id + ' volta ao gráfico', await p.evaluate(i => !document.getElementById(i).querySelector('.viz').hidden && document.getElementById(i).querySelector('.tab').hidden, id));
}
await p.selectOption('#f-per', 'd30'); await p.waitForTimeout(150);

/* ===== 7. Dica do mouse ===== */
/* hover rola a página até o elemento, e rolar esconde a dica — como a pessoa faz: rola, depois mexe o mouse */
async function passar(sel){ await p.locator(sel).scrollIntoViewIfNeeded(); await p.waitForTimeout(60); const bb = await p.locator(sel).boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80); }
await passar('#c-unidade .hb-row[data-valor="AGRICULTURA"]');
{ const h = await p.innerHTML('#tip'); ok('7 dica aparece, em linhas', !(await p.isHidden('#tip')) && /^AGRICULTURA<br>R\$(&nbsp;| )120\.000,00 · 2 pedidos<br>Clique para filtrar$/.test(h), [h, await p.isHidden('#tip')]); }
await p.mouse.move(5, 5); await p.waitForTimeout(80);
ok('7 dica some', await p.isHidden('#tip'));
await passar('#c-abertos .cols .c:nth-last-child(2)');
ok('7 dica da coluna', /28\/09: 1 pedido aberto/.test(await txt(p, '#tip')), await txt(p, '#tip'));
await p.focus('#c-unidade .hb-row'); await p.waitForTimeout(80);
ok('7 dica no foco', !(await p.isHidden('#tip')));
await p.keyboard.press('Escape'); await p.waitForTimeout(50);
ok('7 Esc esconde a dica', await p.isHidden('#tip'));

/* ===== 8. Planilha CSV ===== */
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-csv')]);
const fs = require('fs'); const csv = fs.readFileSync(await dl.path(), 'utf8');
const lin = csv.replace(/^﻿/, '').split('\r\n');
ok('8 nome do arquivo', dl.suggestedFilename() === 'indicadores-compras-2026-09-29.csv', dl.suggestedFilename());
ok('8 BOM + cabeçalho', csv.charCodeAt(0) === 0xfeff && lin[0].startsWith('Número;Aberto em;Tipo de compra;Situação'), lin[0]);
ok('8 9 pedidos', lin.length === 10, lin.length);
ok('8 valor com vírgula', lin.some(l => l.startsWith('T-GER;') && /;20000,00;/.test(l)), lin.find(l => l.startsWith('T-GER')));
ok('8 fórmula não vira fórmula', lin.some(l => l.startsWith('T-CAN;') && /;'=cmd;/.test(l)), lin.find(l => l.startsWith('T-CAN')));
ok('8 aviso', /9 pedidos baixados/.test(await txt(p, '#toast')));

/* ===== 9. Atualizar ===== */
const antes = chamadas;
await p.click('#btn-refresh'); await p.waitForTimeout(300);
ok('9 atualizar chama o banco de novo', chamadas === antes + 1 && /Dados atualizados/.test(await txt(p, '#toast')));
resposta = () => 'rede';
await p.click('#btn-refresh'); await p.waitForTimeout(300);
ok('9 falha ao atualizar mantém os dados', /Não foi possível atualizar agora/.test(await txt(p, '#live')) && nb(await txt(p, '#v-carteira')) === 'R$ 70.000,00');
resposta = () => ({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS });

/* ===== 10. Pedido parado abre no funil ===== */
const href = await p.getAttribute('#c-parados tbody tr:first-child', 'data-href');
ok('10 link do parado', href === 'painel.html?t=pd-teste&q=T-COT', href);
await p.click('#c-parados tbody tr:first-child'); await p.waitForTimeout(700);
ok('10 clicou → funil', /painel\.html\?t=pd-teste&q=T-COT$/.test(p.url()), p.url());
ok('10 funil já busca o pedido, em todo o período', await p.inputValue('#f-q') === 'T-COT' && await p.inputValue('#f-per') === 'all', [await p.inputValue('#f-q'), await p.inputValue('#f-per')]);
ok('10 funil mostra só ele', await p.locator('#board-area .card').count() === 1 && await p.locator('#board-area .card[data-id="T-COT"]').count() === 1);
ok('10 botão Indicadores no funil leva o token', (await p.getAttribute('#lnk-indicadores', 'href')) === 'indicadores.html?t=pd-teste');
await p.click('#lnk-indicadores'); await p.waitForTimeout(700);
ok('10 funil → indicadores', /indicadores\.html\?t=pd-teste$/.test(p.url()) && nb(await txt(p, '#v-carteira')) === 'R$ 70.000,00', p.url());
await p.click('#lnk-funil'); await p.waitForTimeout(700);
ok('10 indicadores → funil (sem busca)', /painel\.html\?t=pd-teste$/.test(p.url()) && await p.inputValue('#f-q') === '', p.url());
await p.goBack(); await p.waitForTimeout(600);
await p.focus('#c-parados tbody tr:nth-child(2)'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
ok('10 Enter no parado também abre', /q=T-GER$/.test(p.url()), p.url());
await p.context().close();

/* ===== 11. Larguras, tema escuro, sem rolagem de lado ===== */
for (const [w, esq] of [[1920, 'light'], [1366, 'light'], [1024, 'dark'], [390, 'dark'], [390, 'light']]){
  const q = await abrir(b, 'indicadores.html?t=pd-teste', { largura: w, esquema: esq });
  const larg = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(`11 ${w}px ${esq}: sem rolagem para o lado`, larg[0] <= larg[1], larg);
  const fundo = await q.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(`11 ${w}px ${esq}: fundo do tema`, esq === 'dark' ? fundo === 'rgb(8, 25, 42)' : fundo === 'rgb(241, 244, 245)', fundo);
  ok(`11 ${w}px ${esq}: tudo desenhado`, await q.locator('#conteudo .card').count() >= 14, await q.locator('#conteudo .card').count());
  await q.context().close();
}
{ const q = await abrir(b, 'painel.html?t=pd-teste', { largura: 390 });
  const larg = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok('11 funil 390px com o botão novo: sem rolagem para o lado', larg[0] <= larg[1], larg);
  ok('11 funil: botão Indicadores visível', await q.isVisible('#lnk-indicadores'));
  await q.context().close(); }

await b.close();
console.log(n + ' verificações');
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' x ' + f));
process.exit(falhas.length ? 1 : 0);
})();
