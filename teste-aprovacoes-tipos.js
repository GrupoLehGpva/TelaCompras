/* ============================================================================
   TELA DE APROVAÇÃO — TIPO DE COMPRA E APROVADAS / REPROVADAS (02/10)
   Botões Normal | Urgente | Mensal (padrão do funil e da Mesa: sem "Todas",
   clicar no marcado desmarca) e as abas Esperando você | Aprovadas | Reprovadas,
   para todos os tipos, com o tipo marcado em cada linha.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/aprovacoes.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

const hoje = new Date().toISOString();
const L = (id, numero, tipo, etapa = 'gerencial') => ({ id, numero, card_id: null, etapa_atual: etapa, facilitador: 'Ana',
  centro_custo: '20', centro_custo_nome: 'FABRICA', tipo_compra: tipo, data_necessidade: '2026-12-01', motivo: 'Motivo ' + numero,
  aberto_em: hoje, total_itens: 2, valor_cotado: '100.00', fornecedor_cotado: 'X' });
const FILA = [L('n1', 'C2610-00101', 'normal'), L('n2', 'C2610-00102', 'normal', 'lider'), L('u1', 'C2610-00103', 'urgente'),
              L('m1', 'C2610-00104', 'mensal'), L('m2', 'C2610-00105', 'mensal'), L('m3', 'C2610-00106', 'mensal', 'lider')];
const H = (id, numero, tipo, resposta) => ({ id, numero, etapa: 'gerencial', resposta, motivo: resposta === 'aprovado' ? null : 'Fora do orçamento',
  decidido_em: hoje, aberto_em: hoje, facilitador: 'Ana', centro_custo_nome: 'FABRICA', situacao: 'em cotação', decidido_por: 'G', fui_eu: true, tipo_compra: tipo });
const HIST = [H('h1', 'C2609-00201', 'normal', 'aprovado'), H('h2', 'C2609-00202', 'mensal', 'aprovado'), H('h3', 'C2609-00203', 'mensal', 'aprovado'),
              H('h4', 'C2609-00204', 'urgente', 'reprovado'), H('h5', 'C2609-00205', 'mensal', 'reprovado')];

async function tela(b, { fila = FILA, hist = HIST, histNovoFalha = false, vw = 1440 } = {}) {
  const p = await b.newPage({ viewport: { width: vw, height: 900 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__rpc = [];
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    p.__rpc.push(nome);
    const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (nome === 'aprovador_do_token') return j([{ id: 'g', nome: 'GERENTE', etapas: ['lider', 'gerencial'] }]);
    if (nome === 'fila_de_aprovacao') return j(fila);
    if (nome === 'fila_do_aprovador') return j({ ok: true, pedidos: fila.map(s => ({ id: s.id, canal: 'telas', versao: 1, pode_devolver: false })), em_edicao: [] });
    if (nome === 'historico_do_aprovador') return histNovoFalha ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"nao existe"}' }) : j(hist);
    if (nome === 'historico_de_aprovacoes') return j(hist.map(h => { const x = { ...h }; delete x.tipo_compra; return x; }));
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await p.goto(base + '?t=ap-g', { waitUntil: 'load' }); await p.waitForTimeout(600);
  return p;
}
const tipos = p => p.$$eval('#segTipo [data-tipo]', bs => bs.map(b => b.dataset.tipo + ':' + b.getAttribute('aria-pressed') + ':' + b.querySelector('.c').textContent));
const linhas = (p, sel) => p.locator(sel + ' tr').count();
const nums = (p, sel) => p.$$eval(sel + ' tr', t => t.map(x => (x.querySelector('a') || {}).textContent));

(async () => {
const b = await chromium.launch();

/* 1 — botões de tipo na fila */
{ const p = await tela(b);
  ok('1 três botões, nenhum marcado, com contagem', JSON.stringify(await tipos(p)) === JSON.stringify(['normal:false:2', 'urgente:false:1', 'mensal:false:3']), JSON.stringify(await tipos(p)));
  ok('1 sem "Todas"', !/Todas/.test(await p.textContent('#segTipo')));
  ok('1 abas: Esperando você, Aprovadas, Reprovadas', /Esperando você/.test(await p.textContent('#abaFila')) && /Aprovadas/.test(await p.textContent('#abaHist')) && /Reprovadas/.test(await p.textContent('#abaRep')));
  { const st = await p.evaluate(() => { const g = getComputedStyle(document.getElementById('segTipo')); return g.backgroundColor + '|' + g.borderRadius + '|' + g.padding; });
    ok('1 mesmo desenho do funil (faixa cinza arredondada)', st === 'rgb(231, 236, 238)|10px|4px', st); }
    ok('1 não busca o histórico à toa', !p.__rpc.some(n => n.startsWith('historico')));
  /* 2 — tipo marcado em cada linha */
  const selos = await p.$$eval('#corpoFila tr', t => t.map(x => (x.querySelector('.selo-tipo, .selo-urgente') || {}).textContent));
  ok('2 cada linha diz o tipo', JSON.stringify(selos) === JSON.stringify(['Normal', 'Normal', 'Urgente', 'Mensal', 'Mensal', 'Mensal']), JSON.stringify(selos));
  /* 3 — filtrar por tipo */
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('3 Mensal: só as 3 mensais', await linhas(p, '#corpoFila') === 3 && (await nums(p, '#corpoFila')).every(n => /0010[456]/.test(n)), JSON.stringify(await nums(p, '#corpoFila')));
  ok('3 Mensal marcado', (await tipos(p))[2] === 'mensal:true:3');
  ok('3 marcado em branco com sombra', await p.$eval('#segTipo [data-tipo=mensal]', b => getComputedStyle(b).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(b).boxShadow !== 'none'));
  ok('3 contagem da aba não muda', (await p.textContent('#contaFila')) === '6');
  await p.click('#segTipo [data-tipo=urgente]'); await p.waitForTimeout(150);
  ok('3 troca para Urgente', await linhas(p, '#corpoFila') === 1 && (await tipos(p))[1] === 'urgente:true:1' && (await tipos(p))[2] === 'mensal:false:3');
  await p.click('#segTipo [data-tipo=urgente]'); await p.waitForTimeout(150);
  ok('3 clicar de novo mostra todos', await linhas(p, '#corpoFila') === 6 && (await tipos(p)).every(t => t.includes(':false:')));
  /* 4 — tipo + busca + "Só as de hoje" convivem */
  await p.click('#segTipo [data-tipo=normal]'); await p.fill('#filtro', '00102'); await p.waitForTimeout(150);
  ok('4 tipo e busca juntos', await linhas(p, '#corpoFila') === 1 && (await tipos(p))[0] === 'normal:true:1', JSON.stringify(await tipos(p)));
  await p.fill('#filtro', ''); await p.waitForTimeout(100);
  /* 5 — aprovar selecionadas respeita o filtro */
  await p.click('#marcarTodas'); await p.waitForTimeout(100);
  ok('5 marcar todas marca só as normais visíveis', /Aprovar 2 selecionadas/.test(await p.textContent('#btnLote')), await p.textContent('#btnLote'));
  await p.click('#marcarTodas'); await p.click('#segTipo [data-tipo=normal]'); await p.waitForTimeout(100);
  await p.close(); }

/* 6 — fila sem um tipo: aviso claro */
{ const p = await tela(b, { fila: FILA.filter(s => s.tipo_compra !== 'mensal') });
  ok('6 contagem zero no Mensal', (await tipos(p))[2] === 'mensal:false:0');
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('6 aviso "Nenhuma compra mensal esperando por você."', await p.locator('#filaVazia').isVisible() && /Nenhuma compra mensal esperando por você/.test(await p.textContent('#filaVazia')));
  await p.close(); }

/* 7 — Aprovadas e Reprovadas, para todos os tipos */
{ const p = await tela(b);
  await p.click('#abaHist'); await p.waitForTimeout(400);
  ok('7 buscou o histórico novo (com tipo)', p.__rpc.filter(n => n === 'historico_do_aprovador').length === 1 && !p.__rpc.includes('historico_de_aprovacoes'));
  ok('7 Aprovadas: as 3 aprovadas', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00201', 'C2609-00202', 'C2609-00203']));
  ok('7 contas nas abas', (await p.textContent('#contaAprov')) === '3' && (await p.textContent('#contaRep')) === '2');
  ok('7 tipos contados nas aprovadas', JSON.stringify(await tipos(p)) === JSON.stringify(['normal:false:1', 'urgente:false:0', 'mensal:false:2']), JSON.stringify(await tipos(p)));
  const selos = await p.$$eval('#corpoHist tr', t => t.map(x => (x.querySelector('.selo-tipo') || {}).textContent));
  ok('7 cada linha diz o tipo', JSON.stringify(selos) === JSON.stringify(['Normal', 'Mensal', 'Mensal']), JSON.stringify(selos));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('7 Aprovadas + Mensal', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00202', 'C2609-00203']));
  await p.click('#abaRep'); await p.waitForTimeout(200);
  ok('7 o tipo escolhido vale nas Reprovadas', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00205']) && (await tipos(p))[2] === 'mensal:true:1');
  ok('7 Reprovadas mostra o motivo', /Fora do orçamento/.test(await p.textContent('#corpoHist')) && /Reprovada/.test(await p.textContent('#corpoHist')));
  await p.click('#segTipo [data-tipo=normal]'); await p.waitForTimeout(150);
  ok('7 sem reprovada normal: aviso', await p.locator('#histVazio').isVisible() && /Nenhuma compra normal reprovada/.test(await p.textContent('#histVazio')));
  await p.click('#segTipo [data-tipo=normal]'); await p.waitForTimeout(150);
  ok('7 sem tipo: as 2 reprovadas', await linhas(p, '#corpoHist') === 2);
  await p.click('#abaFila'); await p.waitForTimeout(200);
  ok('7 volta à fila com tudo', await linhas(p, '#corpoFila') === 6 && await p.locator('#painelHist').isHidden());
  ok('7 histórico buscado uma vez só', p.__rpc.filter(n => n.startsWith('historico')).length === 1);
  /* links do histórico levam ao pedido com o token */
  await p.click('#abaHist'); await p.waitForTimeout(200);
  const href = await p.locator('#corpoHist a').first().getAttribute('href');
  ok('7 link do histórico com token', /pedido\.html\?id=h1/.test(href) && /t=ap-g/.test(href), href);
  await p.close(); }

/* 8 — histórico novo indisponível: cai no antigo, sem o selo de tipo, sem erro */
{ const p = await tela(b, { histNovoFalha: true });
  await p.click('#abaRep'); await p.waitForTimeout(500);
  ok('8 usou o histórico antigo', p.__rpc.includes('historico_de_aprovacoes') && await linhas(p, '#corpoHist') === 2);
  ok('8 sem selo de tipo (não sabe o tipo)', await p.locator('#corpoHist .selo-tipo').count() === 0);
  await p.close(); }

/* 9 — histórico vazio */
{ const p = await tela(b, { hist: [] });
  await p.click('#abaHist'); await p.waitForTimeout(400);
  ok('9 vazio explica', /ainda não decidiu nenhuma/.test(await p.textContent('#histVazio')) && (await p.textContent('#contaAprov')) === '0');
  await p.close(); }

/* 10 — larguras: sem rolagem lateral; botões numa linha */
for (const w of [1366, 1440, 1920]) {
  const p = await tela(b, { vw: w });
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('10 ' + w + 'px sem rolagem lateral da página', sobra <= 0, 'sobra ' + sobra);
  const alt = await p.evaluate(() => document.getElementById('segTipo').getBoundingClientRect().height);
  ok('10 ' + w + 'px botões numa linha', alt < 50, 'altura ' + alt);
  await p.close();
}
{ const p = await tela(b, { vw: 390 });
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('10 celular sem rolagem lateral da página', sobra <= 0, 'sobra ' + sobra);
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('10 celular filtra', await linhas(p, '#corpoFila') === 3);
  await p.close(); }

await b.close();
console.log(falhas.length ? '===== FALHAS (' + falhas.length + ') =====\n' + falhas.join('\n') : '===== FALHAS (0) =====');
process.exit(falhas.length ? 1 : 0);
})();
