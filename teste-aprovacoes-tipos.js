/* ============================================================================
   TELA DE APROVAÇÃO — ABAS, TIPO DE COMPRA, APROVADAS / REPROVADAS POR MÊS
   03/10 (escolha do Guilherme): abas primeiro — Esperando você | Aprovadas |
   Reprovadas, com o total de tudo —; embaixo, Todos | Normal | Urgente |
   Mensal com o total DAQUELA aba ("Todos" marcado ao abrir); busca à direita.
   Aprovadas e Reprovadas se separam por mês, com filtro de mês. Um pedido por
   linha; o pacote do lote mensal é UMA linha.
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
const OUT = '2026-10-02T15:00:00Z', SET = '2026-09-20T15:00:00Z', SET2 = '2026-09-05T15:00:00Z';
const H = (id, numero, tipo, resposta, em = OUT, extra = {}) => Object.assign({ id, numero, etapa: 'gerencial', resposta,
  motivo: resposta === 'aprovado' ? null : 'Fora do orçamento', decidido_em: em, aberto_em: em, facilitador: 'Ana',
  centro_custo_nome: 'FABRICA', situacao: 'em cotação', decidido_por: 'G', fui_eu: true, tipo_compra: tipo }, extra);
const HIST = [H('h1', 'C2609-00201', 'normal', 'aprovado'), H('h2', 'C2609-00202', 'mensal', 'aprovado'), H('h3', 'C2609-00203', 'mensal', 'aprovado'),
              H('h4a', 'C2609-00204', 'urgente', 'aprovado', '2026-10-01T15:00:00Z', { id: 'h4', etapa: 'lider' }),   /* 06/10: aprovou na liderança e reprovou na gerencial */
              H('h4', 'C2609-00204', 'urgente', 'reprovado'), H('h5', 'C2609-00205', 'mensal', 'reprovado'),
              H('h6', 'C2609-00150', 'normal', 'aprovado', SET), H('h7', 'C2609-00120', 'normal', 'aprovado', SET2)];
/* pacote do lote: 3 decisões no banco (uma por pedido), uma linha na tela */
const PK = { lote_id: 'L1', gerencia_id: 'a-brandao', gerencia: 'ALVARO BRANDAO', competencia: '2026-10-01', etapa: 'financeiro' };
const HIST_LOTE = HIST.concat([
  H('p1', 'C2610-00014', 'mensal', 'aprovado', '2026-10-02T19:08:37Z', Object.assign({ centro_custo_nome: 'ESCRITORIO' }, PK)),
  H('p2', 'C2610-00015', 'mensal', 'aprovado', '2026-10-02T19:08:37Z', Object.assign({ centro_custo_nome: 'FABRICA' }, PK)),
  H('p3', 'C2610-00016', 'mensal', 'aprovado', '2026-10-02T19:08:37Z', Object.assign({ centro_custo_nome: 'FABRICA' }, PK)),
  H('q1', 'C2610-00030', 'mensal', 'reprovado', '2026-10-02T19:10:00Z', Object.assign({}, PK, { gerencia_id: 'junior', gerencia: 'JUNIOR' }))]);

async function tela(b, { fila = FILA, hist = HIST, histNovoFalha = false, vw = 1440 } = {}) {
  const p = await b.newPage({ viewport: { width: vw, height: 900 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__rpc = []; p.__lim = [];
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    p.__rpc.push(nome);
    const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (nome === 'aprovador_do_token') return j([{ id: 'g', nome: 'GERENTE', etapas: ['lider', 'gerencial'] }]);
    if (nome === 'fila_de_aprovacao') return j(fila);
    if (nome === 'fila_do_aprovador') return j({ ok: true, pedidos: fila.map(s => ({ id: s.id, canal: 'telas', versao: 1, pode_devolver: false, destino: { n1: 'estoque', u1: 'consumo' }[s.id] || null })), em_edicao: [] });
    if (nome.startsWith('historico')) p.__lim.push(JSON.parse(r.request().postData() || '{}').p_limite);
    if (nome === 'historico_do_aprovador') return histNovoFalha ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"nao existe"}' }) : j(hist);
    if (nome === 'historico_de_aprovacoes') return j(hist.map(h => { const x = { ...h }; delete x.tipo_compra; return x; }));
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await p.goto(base + '?t=ap-g', { waitUntil: 'load' }); await p.waitForTimeout(600);
  return p;
}
const tipos = p => p.$$eval('#segTipo [data-tipo]', bs => bs.map(b => b.dataset.tipo + ':' + b.getAttribute('aria-pressed') + ':' + b.querySelector('.c').textContent));
const linhas = (p, sel) => p.locator(sel + ' tr:not(.mes-sep):not(.pac-det)').count();
const nums = (p, sel) => p.$$eval(sel + ' tr:not(.mes-sep):not(.pac-det)', t => t.map(x => (x.querySelector('a, .btn-pacote') || {}).textContent));
const meses = p => p.$$eval('#corpoHist tr.mes-sep', t => t.map(x => x.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
const b = await chromium.launch();
const T = (todos, n, u, m, sel = '') => JSON.stringify([':' + (sel === '') + ':' + todos, 'normal:' + (sel === 'normal') + ':' + n,
  'urgente:' + (sel === 'urgente') + ':' + u, 'mensal:' + (sel === 'mensal') + ':' + m]);

/* 1 — abas primeiro, tipo depois; "Todos" marcado; busca à direita */
{ const p = await tela(b);
  const pos = await p.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const abas = r(document.querySelector('.abas')), tipo = r(document.getElementById('segTipo')), busca = r(document.getElementById('filtro')), lin = r(document.querySelector('.nivel-tipo'));
    return { abasY: abas.top, tipoY: tipo.top, buscaY: busca.top, buscaX: busca.right, linX: lin.right };
  });
  { const lin = await p.$$eval('table.fila tbody tr', t => t.map(x => x.textContent.replace(/\s+/g, ' ')));
    const de = n => lin.find(x => x.includes(n)) || '';
    ok('1 consumo ou estoque marcado na fila (03/10)', /Estoque/.test(de('C2610-00101')) && /Consumo/.test(de('C2610-00103')) && !/Estoque|Consumo/.test(de('C2610-00104')), lin); }
  ok('1 abas acima dos tipos', pos.abasY < pos.tipoY, JSON.stringify(pos));
  ok('1 busca na linha dos tipos, encostada à direita', Math.abs(pos.buscaY - pos.tipoY) < 12 && Math.abs(pos.buscaX - pos.linX) < 2, JSON.stringify(pos));
  ok('1 botões: Todos, Normal, Urgente, Mensal', JSON.stringify(await p.$$eval('#segTipo [data-tipo]', bs => bs.map(x => x.firstChild.textContent.trim()))) === JSON.stringify(['Todos', 'Normal', 'Urgente', 'Mensal']));
  ok('1 abre em Todos, com o total de cada tipo da fila', JSON.stringify(await tipos(p)) === T(6, 2, 1, 3), JSON.stringify(await tipos(p)));
  ok('1 aba mostra o total de tudo', (await p.textContent('#contaFila')) === '6');
  { const st = await p.evaluate(() => { const g = getComputedStyle(document.getElementById('segTipo')); return g.backgroundColor + '|' + g.borderRadius + '|' + g.padding; });
    ok('1 mesmo desenho do funil (faixa cinza arredondada)', st === 'rgb(231, 236, 238)|10px|4px', st); }
  ok('1 já mostra os totais de Aprovadas e Reprovadas ao abrir', (await p.textContent('#contaAprov')) === '5' && (await p.textContent('#contaRep')) === '2' && !(await p.locator('#painelFila').isHidden()));
  const selos = await p.$$eval('#corpoFila tr', t => t.map(x => (x.querySelector('.selo-tipo, .selo-urgente') || {}).textContent));
  ok('2 Todos: todas as linhas, cada uma diz o tipo', JSON.stringify(selos) === JSON.stringify(['Normal', 'Normal', 'Urgente', 'Mensal', 'Mensal', 'Mensal']), JSON.stringify(selos));
  /* 3 — filtrar e voltar a Todos; os números não mudam */
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('3 Mensal: só as 3 mensais', await linhas(p, '#corpoFila') === 3 && (await nums(p, '#corpoFila')).every(n => /0010[456]/.test(n)), JSON.stringify(await nums(p, '#corpoFila')));
  ok('3 números iguais, Mensal marcado', JSON.stringify(await tipos(p)) === T(6, 2, 1, 3, 'mensal') && (await p.textContent('#contaFila')) === '6', JSON.stringify(await tipos(p)));
  ok('3 marcado em branco com sombra', await p.$eval('#segTipo [data-tipo=mensal]', b => getComputedStyle(b).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(b).boxShadow !== 'none'));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('3 clicar de novo no marcado continua nele', await linhas(p, '#corpoFila') === 3);
  await p.click('#segTipo [data-tipo=urgente]'); await p.waitForTimeout(150);
  ok('3 troca para Urgente', await linhas(p, '#corpoFila') === 1 && JSON.stringify(await tipos(p)) === T(6, 2, 1, 3, 'urgente'));
  await p.click('#segTipo [data-tipo=""]'); await p.waitForTimeout(150);
  ok('3 Todos volta a mostrar tudo', await linhas(p, '#corpoFila') === 6 && JSON.stringify(await tipos(p)) === T(6, 2, 1, 3));
  /* 4 — tipo + busca + "Só as de hoje" convivem; números fixos */
  await p.click('#segTipo [data-tipo=normal]'); await p.fill('#filtro', '00102'); await p.waitForTimeout(150);
  ok('4 tipo e busca juntos; a busca não mexe nos números', await linhas(p, '#corpoFila') === 1 && JSON.stringify(await tipos(p)) === T(6, 2, 1, 3, 'normal'), JSON.stringify(await tipos(p)));
  await p.fill('#filtro', ''); await p.click('#chipHoje'); await p.waitForTimeout(150);
  ok('4 só as de hoje + tipo', await linhas(p, '#corpoFila') === 2);
  await p.click('#chipTodas'); await p.waitForTimeout(100);
  /* 5 — aprovar selecionadas respeita o tipo */
  await p.click('#marcarTodas'); await p.waitForTimeout(100);
  ok('5 marcar todas marca só as normais visíveis', /Aprovar 2 selecionadas/.test(await p.textContent('#btnLote')), await p.textContent('#btnLote'));
  await p.click('#marcarTodas'); await p.click('#segTipo [data-tipo=""]'); await p.waitForTimeout(100);
  await p.click('#marcarTodas'); await p.waitForTimeout(100);
  ok('5 em Todos, marca as 6', /Aprovar 6 selecionadas/.test(await p.textContent('#btnLote')), await p.textContent('#btnLote'));
  await p.close(); }

/* 6 — tipo vazio e fila vazia explicam */
{ const p = await tela(b, { fila: FILA.filter(s => s.tipo_compra !== 'mensal') });
  ok('6 contagem zero no Mensal', JSON.stringify(await tipos(p)) === T(3, 2, 1, 0));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('6 aviso "Nenhuma compra mensal esperando por você."', await p.locator('#filaVazia').isVisible() && /Nenhuma compra mensal esperando por você/.test(await p.textContent('#filaVazia')));
  await p.close(); }
{ const p = await tela(b, { fila: [] });
  ok('6 fila vazia: Todos marcado, zeros, "Nada esperando por você."', JSON.stringify(await tipos(p)) === T(0, 0, 0, 0) && /Nada esperando por você/.test(await p.textContent('#filaVazia')));
  await p.close(); }

/* 7 — Aprovadas e Reprovadas: números da aba, por mês */
{ const p = await tela(b);
  await p.click('#abaHist'); await p.waitForTimeout(400);
  ok('7 buscou o histórico novo, com meses inteiros', p.__rpc.filter(n => n === 'historico_do_aprovador').length === 1 && !p.__rpc.includes('historico_de_aprovacoes') && p.__lim[0] === 2000, JSON.stringify(p.__lim));
  ok('7 abas com o total de tudo', (await p.textContent('#contaAprov')) === '5' && (await p.textContent('#contaRep')) === '2' && (await p.textContent('#contaFila')) === '6');
  ok('7 botões com o total das Aprovadas', JSON.stringify(await tipos(p)) === T(5, 3, 0, 2), JSON.stringify(await tipos(p)));
  ok('7 Todos: aprovadas de todos os tipos, mais recente primeiro', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00201', 'C2609-00202', 'C2609-00203', 'C2609-00150', 'C2609-00120']), JSON.stringify(await nums(p, '#corpoHist')));
  ok('7 separadas por mês, com a quantidade', JSON.stringify(await meses(p)) === JSON.stringify(['Outubro de 2026 · 3', 'Setembro de 2026 · 2']), JSON.stringify(await meses(p)));
  ok('7 seletor de mês: todos + os meses que têm decisão', JSON.stringify(await p.$$eval('#histMes option', o => o.map(x => x.textContent))) === JSON.stringify(['Todos os meses', 'outubro de 2026', 'setembro de 2026']));
  ok('7 resumo', /5 aprovadas/.test(await p.textContent('#histResumo')), await p.textContent('#histResumo'));
  await p.selectOption('#histMes', '2026-09'); await p.waitForTimeout(150);
  ok('7 filtro de mês: só setembro, sem separador', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00150', 'C2609-00120']) && (await meses(p)).length === 0);
  ok('7 com mês escolhido, os botões contam o mês', JSON.stringify(await tipos(p)) === T(2, 2, 0, 0), JSON.stringify(await tipos(p)));
  ok('7 resumo do mês', /2 aprovadas em setembro de 2026/.test(await p.textContent('#histResumo')), await p.textContent('#histResumo'));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('7 mês sem esse tipo: aviso claro', await p.locator('#histVazio').isVisible() && /Nenhuma compra mensal aprovada em setembro de 2026/.test(await p.textContent('#histVazio')), await p.textContent('#histVazio'));
  await p.selectOption('#histMes', ''); await p.waitForTimeout(150);
  ok('7 Aprovadas + Mensal (todos os meses)', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00202', 'C2609-00203']));
  await p.click('#abaRep'); await p.waitForTimeout(200);
  ok('7 o tipo escolhido vale nas Reprovadas; botões com o total delas', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00205']) && JSON.stringify(await tipos(p)) === T(2, 0, 1, 1, 'mensal'), JSON.stringify(await tipos(p)));
  ok('7 Reprovadas: motivo não aparece na lista (fica no pedido aberto)', !/Fora do orçamento/.test(await p.textContent('#corpoHist')) && /Reprovada/.test(await p.textContent('#corpoHist')) && await p.locator('#corpoHist .hist-motivo').count() === 0);
  await p.click('#segTipo [data-tipo=normal]'); await p.waitForTimeout(150);
  ok('7 sem reprovada normal: aviso', await p.locator('#histVazio').isVisible() && /Nenhuma compra normal reprovada/.test(await p.textContent('#histVazio')));
  await p.click('#segTipo [data-tipo=""]'); await p.waitForTimeout(150);
  ok('7 Todos nas Reprovadas', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00204', 'C2609-00205']));
  { const et = await p.$$eval('#corpoHist tr:not(.mes-sep)', t => t.map(x => [...x.querySelectorAll('.etapa')].map(e => e.textContent.trim())));
    ok('7 reprovada mostra só a etapa em que foi reprovada', et.length === 2 && et.every(l => l.length === 1) && et.every(l => /gerencial/i.test(l[0])), JSON.stringify(et)); }
  /* 7b — a busca vale no histórico e não mexe nos números */
  await p.click('#abaHist'); await p.fill('#filtro', '00150'); await p.waitForTimeout(150);
  ok('7b busca no histórico', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00150']) && JSON.stringify(await tipos(p)) === T(5, 3, 0, 2));
  await p.fill('#filtro', 'nada-disso'); await p.waitForTimeout(150);
  ok('7b busca sem resultado explica', /Nada com esse filtro/.test(await p.textContent('#histVazio')));
  await p.fill('#filtro', ''); await p.waitForTimeout(100);
  await p.click('#abaFila'); await p.waitForTimeout(200);
  ok('7 volta à fila: números da fila', await linhas(p, '#corpoFila') === 6 && await p.locator('#painelHist').isHidden() && JSON.stringify(await tipos(p)) === T(6, 2, 1, 3));
  ok('7 histórico buscado uma vez só', p.__rpc.filter(n => n.startsWith('historico')).length === 1);
  await p.click('#abaHist'); await p.waitForTimeout(200);
  const href = await p.locator('#corpoHist a').first().getAttribute('href');
  ok('7 link do histórico com token', /pedido\.html\?id=h1/.test(href) && /t=ap-g/.test(href), href);
  await p.close(); }

/* 8 — histórico novo indisponível: cai no antigo (sem tipo = normal), sem erro */
{ const p = await tela(b, { histNovoFalha: true });
  await p.click('#abaRep'); await p.waitForTimeout(500);
  ok('8 usou o histórico antigo', p.__rpc.includes('historico_de_aprovacoes') && await linhas(p, '#corpoHist') === 2 && p.__lim.every(x => x === 2000), JSON.stringify(p.__lim));
  ok('8 sem selo de tipo (não sabe o tipo)', await p.locator('#corpoHist .selo-tipo').count() === 0);
  await p.close(); }

/* 9 — histórico vazio */
{ const p = await tela(b, { hist: [] });
  await p.click('#abaHist'); await p.waitForTimeout(400);
  ok('9 vazio explica, sem seletor de mês', /ainda não decidiu nenhuma/.test(await p.textContent('#histVazio')) && (await p.textContent('#contaAprov')) === '0' && await p.locator('#barraHist').isHidden());
  ok('9 botões zerados', JSON.stringify(await tipos(p)) === T(0, 0, 0, 0), JSON.stringify(await tipos(p)));
  await p.close(); }

/* 10 — lote mensal: o pacote é uma linha no histórico, com os pedidos dentro */
{ const p = await tela(b, { hist: HIST_LOTE });
  await p.click('#abaHist'); await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(300);
  ok('10 pacote aprovado vira uma linha só', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['Lote 10/2026', 'C2609-00202', 'C2609-00203']), JSON.stringify(await nums(p, '#corpoHist')));
  ok('10 contagem conta o pacote como um', (await p.textContent('#contaAprov')) === '6' && JSON.parse(await tipos(p).then(JSON.stringify))[3] === 'mensal:true:3', (await p.textContent('#contaAprov')) + JSON.stringify(await tipos(p)));
  const lp = p.locator('#corpoHist tr', { hasText: 'Lote 10/2026' });
  ok('10 linha do pacote: gerência, 3 pedidos, 2 centros', /Pacote · 3 pedidos/.test(await lp.textContent()) && /ALVARO BRANDAO/.test(await lp.textContent()) && /2 centros de custo/.test(await lp.textContent()), await lp.textContent());
  ok('10 pacote fechado: pedidos escondidos', await p.locator('#corpoHist tr.pac-det').count() === 0 && (await p.getAttribute('[data-hpac]', 'aria-expanded')) === 'false');
  await p.click('[data-hpac]'); await p.waitForTimeout(150);
  const det = await p.$$eval('#corpoHist tr.pac-det a', a => a.map(x => x.textContent + '|' + x.getAttribute('href')));
  ok('10 abrir o pacote lista os pedidos com link e token', det.length === 3 && det[0].startsWith('C2610-00014|pedido.html?id=p1') && det.every(x => /t=ap-g/.test(x)), JSON.stringify(det));
  ok('10 aberto: aria-expanded', (await p.getAttribute('[data-hpac]', 'aria-expanded')) === 'true');
  await p.fill('#filtro', '00016'); await p.waitForTimeout(150);
  ok('10 busca acha o pacote pelo número de um pedido dele', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['Lote 10/2026']));
  await p.fill('#filtro', ''); await p.click('[data-hpac]'); await p.waitForTimeout(150);
  ok('10 fecha de novo', await p.locator('#corpoHist tr.pac-det').count() === 0);
  await p.click('#abaRep'); await p.waitForTimeout(150);
  ok('10 pacote reprovado separado, da outra gerência', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['Lote 10/2026', 'C2609-00205']) && /JUNIOR/.test(await p.textContent('#corpoHist')) && /Pacote · 1 pedido(?!s)/.test(await p.textContent('#corpoHist')));
  await p.close(); }

/* 10b — um pedido, uma linha: liderança e gerência pela mesma pessoa (vídeo de 02/10) */
{ const dup = [H('d1', 'C2610-00014', 'mensal', 'aprovado', '2026-10-01T12:00:00Z', { etapa:'lider' }),
               H('d1', 'C2610-00014', 'mensal', 'aprovado', '2026-10-02T12:00:00Z', { etapa:'gerencial' }),
               H('d2', 'C2609-00018', 'urgente', 'aprovado', '2026-09-28T12:00:00Z', { etapa:'lider' }),
               H('d2', 'C2609-00018', 'urgente', 'aprovado', '2026-10-01T12:00:00Z', { etapa:'gerencial' }),
               H('d3', 'C2609-00030', 'normal', 'aprovado', '2026-09-20T12:00:00Z', { etapa:'lider' }),
               H('d3', 'C2609-00030', 'normal', 'reprovado', '2026-09-21T12:00:00Z', { etapa:'gerencial' })];
  const p = await tela(b, { hist: dup });
  await p.click('#abaHist'); await p.waitForTimeout(300);
  ok('10b Todos: cada pedido uma vez, abas contam pedidos', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2610-00014', 'C2609-00018']) && (await p.textContent('#contaAprov')) === '2' && (await p.textContent('#contaRep')) === '1' && JSON.stringify(await tipos(p)) === T(2, 0, 1, 1), JSON.stringify(await tipos(p)));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('10b etapa diz as duas', JSON.stringify(await p.$$eval('#corpoHist .etapas .etapa', e => e.map(x => x.textContent))) === JSON.stringify(['Liderança', 'Gerencial']));
  await p.click('#segTipo [data-tipo=urgente]'); await p.waitForTimeout(150);
  ok('10b urgente: uma linha, no mês da última decisão', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00018']) && JSON.stringify(await meses(p)) === JSON.stringify(['Outubro de 2026 · 1']), JSON.stringify(await meses(p)));
  await p.click('#abaRep'); await p.click('#segTipo [data-tipo=""]'); await p.waitForTimeout(150);
  ok('10b vale a decisão mais recente (reprovou depois): está nas Reprovadas', JSON.stringify(await nums(p, '#corpoHist')) === JSON.stringify(['C2609-00030']));
  await p.close(); }

/* 11 — larguras: sem rolagem lateral; tipos e busca numa linha */
for (const w of [1366, 1440, 1920]) {
  const p = await tela(b, { vw: w });
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('11 ' + w + 'px sem rolagem lateral da página', sobra <= 0, 'sobra ' + sobra);
  const alt = await p.evaluate(() => document.querySelector('.nivel-tipo').getBoundingClientRect().height);
  ok('11 ' + w + 'px tipos e busca numa linha', alt < 50, 'altura ' + alt);
  await p.close();
}
{ const p = await tela(b, { vw: 390 });
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('11 celular sem rolagem lateral da página', sobra <= 0, 'sobra ' + sobra);
  ok('11 celular: busca em linha própria, largura toda', await p.evaluate(() => document.getElementById('filtro').getBoundingClientRect().width > 300));
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(150);
  ok('11 celular filtra', await linhas(p, '#corpoFila') === 3);
  await p.click('#abaHist'); await p.waitForTimeout(300);
  ok('11 celular: histórico sem rolagem lateral da página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close(); }

await b.close();
console.log(falhas.length ? '===== FALHAS (' + falhas.length + ') =====\n' + falhas.join('\n') : '===== FALHAS (0) =====');
process.exit(falhas.length ? 1 : 0);
})();
