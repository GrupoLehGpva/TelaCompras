/* RELATÓRIO DO LOTE MENSAL (fase 4, 02/10)
   relatorio-mensal.html contra um banco de mentira (relatorio_lote_mensal):
   resumo, quanto cada um pediu (4 agrupamentos), item a item, o que foi cortado,
   filtros, troca de mês, planilhas, acesso (diretoria, gerência, sem acesso). */
const { chromium } = require('playwright');
const fs = require('fs');
const XLSX = require('xlsx');
const XLSX_JS = fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8');
const falhas = []; const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : (typeof d === 'string' ? d : JSON.stringify(d))));
const URL_ = 'file://' + __dirname + '/relatorio-mensal.html';

const IT = (o) => Object.assign({ situacao:'aprovado', status:'aprovado', unidade_negocio:'Fábrica', centro_custo:'20', centro_custo_nome:'FABRICA', gerencia_id:'g1', gerencia:'Gerente Fábrica',
  familia:'MG', codigo:'1201', unidade:'UN', qtd_pedida:4, qtd_aprovada:4, incluido:false, cortado:false, valor:40, valor_cortado:null, fornecedor:'ROLAMAX' }, o);
function mesOut(){
  return { ok:true, quem:{ tipo:'diretoria', nome:'DIRETORIA' }, ve_tudo:true, competencia:'2026-10-01',
    competencias:[{ competencia:'2026-11-01', estado:'aberto' }, { competencia:'2026-10-01', estado:'encerrado' }],
    lote:{ id:'lt1', estado:'encerrado', corte_em:'2026-10-20T03:00:00Z', total_pedidos:3,
      pacotes:[{ gerencia_id:'g1', gerencia:'Gerente Fábrica', total:100, estado:'aprovado' }, { gerencia_id:'g2', gerencia:'Gerente Fazenda', total:70, estado:'reprovado', motivo:'Acima do orçamento' }] },
    itens:[
      IT({ pedido_id:'pA', numero:'C2610-00010', descricao:'ROLAMENTO 6205', valor:40 }),
      IT({ pedido_id:'pA', numero:'C2610-00010', descricao:'CABO DE AÇO', familia:'FORA', codigo:null, unidade:'M', qtd_pedida:30, qtd_aprovada:30, valor:60, fornecedor:'DISTRIBUIDORA SUL' }),
      IT({ pedido_id:'pA', numero:'C2610-00010', descricao:'LIXA <b>80</b>', codigo:'1300', qtd_pedida:7, qtd_aprovada:0, cortado:true, valor:null, fornecedor:null }),
      IT({ pedido_id:'pD', numero:'C2610-00013', descricao:'LUVA', codigo:'2200', familia:'ST', centro_custo:'21', centro_custo_nome:'RACAO', qtd_pedida:10, qtd_aprovada:6, valor:18.5, fornecedor:'CASA' }),
      IT({ pedido_id:'pD', numero:'C2610-00013', descricao:'ÓCULOS', codigo:'2201', familia:'ST', centro_custo:'21', centro_custo_nome:'RACAO', qtd_pedida:0, qtd_aprovada:2, incluido:true, valor:12, fornecedor:'CASA' }),
      IT({ pedido_id:'pB', numero:'C2610-00011', descricao:'SABAO EM PO', codigo:'7360', familia:'HL', status:'reprovado', situacao:'reprovado', qtd_pedida:10, qtd_aprovada:0,
           gerencia_id:'g2', gerencia:'Gerente Fazenda', unidade_negocio:'Fazenda', centro_custo:'31', centro_custo_nome:'LAVOURA', valor:null, valor_cortado:70, fornecedor:'CASA' }),
    ],
    cortes:[
      { tipo:'item', pedido_id:'pA', numero:'C2610-00010', gerencia_id:'g1', gerencia:'Gerente Fábrica', unidade_negocio:'Fábrica', centro_custo:'20', centro_custo_nome:'FABRICA', familia:'MG',
        descricao:'LIXA <b>80</b>', unidade:'UN', quantidade:7, valor:null, motivo:'Já tem no <i>estoque</i>', por:'Brandão', etapa:'gerencial', em:'2026-10-05T12:00:00Z' },
      { tipo:'quantidade', pedido_id:'pD', numero:'C2610-00013', gerencia_id:'g1', gerencia:'Gerente Fábrica', unidade_negocio:'Fábrica', centro_custo:'21', centro_custo_nome:'RACAO', familia:'ST',
        descricao:'LUVA', unidade:'UN', quantidade:4, valor:null, motivo:'Quantidade ajustada pela gerência: 10 → 6 UN', por:'Brandão', etapa:'gerencial', em:'2026-10-06T12:00:00Z' },
      { tipo:'pedido', pedido_id:'pB', numero:'C2610-00011', gerencia_id:'g2', gerencia:'Gerente Fazenda', unidade_negocio:'Fazenda', centro_custo:'31', centro_custo_nome:'LAVOURA', familia:'HL',
        descricao:'SABAO EM PO', unidade:'UN', quantidade:10, valor:70, motivo:'Acima do orçamento; revisar', por:'WIENFRIED', etapa:'financeiro', em:'2026-10-22T12:00:00Z' },
    ] };
}
function mesNov(){
  return { ok:true, quem:{ tipo:'diretoria', nome:'DIRETORIA' }, ve_tudo:true, competencia:'2026-11-01',
    competencias:mesOut().competencias, lote:{ estado:'aberto', corte_em:'2026-11-20T03:00:00Z' },
    itens:[ IT({ pedido_id:'pX', numero:'C2611-00001', descricao:'GRAXA', status:'aguardando lote', situacao:'aguardando lote', valor:null, fornecedor:null }) ], cortes:[] };
}
async function abrir(b, { token='dir-1', resp=null, vp={ width:1440, height:900 }, semExcel=false }={}){
  const p = await b.newPage({ viewport:vp, acceptDownloads:true });
  p.chamadas = [];
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await p.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u === 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'){
      p.excelPedido = (p.excelPedido || 0) + 1;
      return semExcel ? r.abort() : r.fulfill({ status:200, contentType:'application/javascript', body:XLSX_JS });
    }
    if (u.includes('/rest/v1/rpc/relatorio_lote_mensal')){
      const c = JSON.parse(r.request().postData() || '{}'); p.chamadas.push(c);
      const x = resp ? resp(c) : (c.p_competencia === '2026-11-01' ? mesNov() : mesOut());
      return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
    }
    return r.abort();
  });
  await p.goto(URL_ + (token ? '?t=' + token : '')); await p.waitForTimeout(500);
  return p;
}
const txt = (p, s) => p.textContent(s);
const linhas = (p, s) => p.locator(s + ' tbody tr').count();
const cel = (p, s) => p.$$eval(s + ' tbody tr', t => t.map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim())));

(async () => {
const b = await chromium.launch();

/* 1 — acesso */
{ let p = await abrir(b, { token:'' });
  ok('1 sem token: link incompleto, sem chamar o banco', /link está incompleto/.test(await txt(p, '#view')) && p.chamadas.length === 0); await p.close();
  p = await abrir(b, { resp:() => ({ ok:false, erro:'token_invalido', mensagem:'Este link não vale mais.' }) });
  ok('1 token inválido', /Este link não vale mais/.test(await txt(p, '#view'))); await p.close();
  p = await abrir(b, { resp:() => ({ ok:false, erro:'sem_acesso', mensagem:'O relatório do lote é da diretoria, do financeiro, das gerências e de Compras.' }) });
  ok('1 facilitador: sem acesso, explicado', /não está no seu acesso/.test(await txt(p, '#view')) && /diretoria, do financeiro/.test(await txt(p, '#view'))); await p.close();
  }
{ const p = await b.newPage(); p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  let n = 0;
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/')){ n++; if (n === 1) return r.abort(); return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(mesOut()) }); } return r.abort(); });
  await p.goto(URL_ + '?t=dir-1'); await p.waitForTimeout(400);
  ok('1 sem rede: oferece tentar de novo', await p.locator('#bt-tentar').count() === 1);
  await p.click('#bt-tentar'); await p.waitForTimeout(400);
  ok('1 tentar de novo carrega', /Lote mensal de outubro\/2026/.test(await txt(p, '#titulo')));
  await p.close(); }

/* 2 — mês fechado: cabeçalho, resumo, quanto cada um pediu */
{ const p = await abrir(b);
  ok('2 token no corpo, mês vazio = deixa o banco escolher', p.chamadas[0].p_token === 'dir-1' && p.chamadas[0].p_competencia === null);
  ok('2 título do mês', (await txt(p, '#titulo')) === 'Lote mensal de outubro/2026');
  ok('2 diretoria: navegação do funil com o token', !(await p.locator('#nav-telas').isHidden()) && /painel\.html\?t=dir-1/.test(await p.getAttribute('#lnk-funil', 'href')) && /indicadores\.html\?t=dir-1/.test(await p.getAttribute('#lnk-indicadores', 'href')));
  const est = await txt(p, '.estado-lote');
  ok('2 estado do lote e pacotes', /Encerrado/.test(est) && /Fechado por Compras em 20\/10\/2026/.test(est) && !/dia 19|dia 20/.test(est) && /Gerente Fábrica · aprovado · R\$\s?100,00/.test(est) && /Gerente Fazenda · reprovado/.test(est), est);
  const res = (await p.innerText('.resumo')).replace(/\s+/g, ' ');
  ok('2 resumo: pedidos, itens, valor comprado, cortes', /Pedidos 3/i.test(res) && /Itens pedidos 6/i.test(res) && /4 aprovados/.test(res) && /R\$\s?130,50/.test(res) && /O que foi cortado 3/i.test(res) && /R\$\s?70,00 reprovados no financeiro/.test(res), res);
  const q = await cel(p, '#tb-quanto');
  ok('2 por gerência: ordenado pelo valor', q.length === 2 && q[0][0].startsWith('Gerente Fábrica') && q[0][1] === '2' && q[0][2] === '5' && q[0][3] === '4' && q[0][4] === '2' && /130,50/.test(q[0][5])
     && q[1][0].startsWith('Gerente Fazenda') && q[1][5] === '—' && /70,00/.test(q[1][6]), q);
  ok('2 total', /Total/.test(await txt(p, '#tb-quanto tfoot')) && /R\$\s?130,50/.test(await txt(p, '#tb-quanto tfoot')) && /\b3\b/.test(await p.innerText('#tb-quanto tfoot')));
  await p.click('[data-dim="familia"]'); await p.waitForTimeout(100);
  let f = await cel(p, '#tb-quanto');
  ok('2 por família', f.length === 4 && f.some(r => /^Fora do catálogo/.test(r[0]) && /60,00/.test(r[5])) && f.some(r => /^ST · Segurança do trabalho/.test(r[0]) && /30,50/.test(r[5])), f);
  ok('2 botão do agrupamento marcado e com foco', (await p.getAttribute('[data-dim="familia"]', 'aria-pressed')) === 'true' && await p.evaluate(() => document.activeElement.dataset.dim) === 'familia');
  await p.click('[data-dim="cc"]'); await p.waitForTimeout(100);
  f = await cel(p, '#tb-quanto');
  ok('2 por centro de custo', f.length === 3 && f.some(r => /^20 · FABRICA/.test(r[0])) && f.some(r => /^31 · LAVOURA/.test(r[0])), f);
  await p.click('[data-dim="unidade"]'); await p.waitForTimeout(100);
  f = await cel(p, '#tb-quanto');
  ok('2 por unidade de negócio', f.length === 2 && f[0][0].startsWith('Fábrica') && f[1][0].startsWith('Fazenda'), f);
  /* filtros */
  await p.selectOption('#f-ger', 'g2'); await p.waitForTimeout(150);
  ok('2 filtro gerência no resumo', /Pedidos 1/i.test((await p.innerText('.resumo')).replace(/\s+/g, ' ')) && /Total com os filtros/.test(await txt(p, '#tb-quanto tfoot')));
  ok('2 filtro gerência nos pacotes', !/Gerente Fábrica/.test(await txt(p, '.estado-lote')));
  ok('2 foco fica na caixa', await p.evaluate(() => document.activeElement.id) === 'f-ger');
  await p.selectOption('#f-fam', 'MG'); await p.waitForTimeout(150);
  ok('2 filtros sem resultado avisam', /Nada com esses filtros/.test(await txt(p, '#view')));
  await p.click('#bt-limpa'); await p.waitForTimeout(150);
  ok('2 tirar filtros', /Pedidos 3/i.test((await p.innerText('.resumo')).replace(/\s+/g, ' ')) && (await p.inputValue('#f-ger')) === '');
  await p.selectOption('#f-cc', '21'); await p.waitForTimeout(150);
  ok('2 filtro centro de custo', /Pedidos 1/i.test((await p.innerText('.resumo')).replace(/\s+/g, ' ')));
  await p.click('#bt-limpa-f'); await p.waitForTimeout(150);
  ok('2 botão tirar filtros', await p.locator('#bt-limpa-f').count() === 0);
  const opc = await p.$$eval('#f-fam option', o => o.map(x => x.textContent));
  ok('2 famílias com nome', opc.includes('HL · Higiene e limpeza') && opc.includes('Fora do catálogo'), opc);

  /* 3 — item a item */
  await p.click('[data-aba="itens"]'); await p.waitForTimeout(100);
  const it = await cel(p, '#tb-itens');
  ok('3 seis itens', it.length === 6, it.length);
  const lin = n => it.find(r => r[5].startsWith(n)) || [];
  ok('3 item aprovado', lin('ROLAMENTO')[10] === 'Aprovado' && /40,00/.test(lin('ROLAMENTO')[9]) && lin('ROLAMENTO')[6] === '4 UN');
  ok('3 item cortado', lin('LIXA')[10] === 'Cortado pela gerência' && lin('LIXA')[9] === '—' && lin('LIXA')[7] === '0 UN');
  ok('3 quantidade reduzida', lin('LUVA')[10] === 'Quantidade reduzida' && lin('LUVA')[6] === '10 UN' && lin('LUVA')[7] === '6 UN');
  ok('3 incluído pela gerência', lin('ÓCULOS')[10] === 'Incluído pela gerência');
  ok('3 reprovado: valor riscado', lin('SABAO')[10] === 'Reprovado' && await p.locator('#tb-itens s').count() === 1 && /70,00/.test(lin('SABAO')[9]));
  ok('3 descrição não vira HTML', await p.locator('#tb-itens b').count() === 0 && /LIXA <b>80<\/b>/.test(await txt(p, '#tb-itens')));
  ok('3 contagem na aba', /Itemaitem6/.test((await txt(p, '[data-aba="itens"]')).replace(/\s+/g, '')));

  /* 4 — o que foi cortado */
  await p.click('[data-aba="cortes"]'); await p.waitForTimeout(100);
  const co = await cel(p, '#tb-cortes');
  ok('4 três cortes, com tipo, motivo e quem', co.length === 3 && co[0][1] === 'Item reprovado pela gerência' && /Já tem no <i>estoque<\/i>/.test(co[0][8]) && co[0][9] === 'Brandão'
     && co[1][1] === 'Quantidade reduzida' && co[1][6] === '4 UN' && co[2][1] === 'Pedido reprovado (financeiro)' && /70,00/.test(co[2][7]), co);
  ok('4 motivo não vira HTML', await p.locator('#tb-cortes i').count() === 0);
  await p.selectOption('#f-ger', 'g2'); await p.waitForTimeout(100);
  ok('4 filtro nos cortes', await linhas(p, '#tb-cortes') === 1 && (await p.getAttribute('[data-aba="cortes"]', 'aria-selected')) === 'true');
  await p.selectOption('#f-ger', ''); await p.waitForTimeout(100);

  /* 5 — planilhas */
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bt-csv-cortes')]);
  let c = fs.readFileSync(await dl.path(), 'utf8');
  ok('5 planilha de cortes: nome, BOM, ponto e vírgula, vírgula decimal', dl.suggestedFilename() === 'lote-mensal-2026-10-cortes.csv' && c.charCodeAt(0) === 0xfeff
     && /^﻿Quando;O quê;Etapa;Pedido;/.test(c) && /;10;70;/.test(c) && /Acima do orçamento; revisar/.test(c) && /"Acima do orçamento; revisar"/.test(c) && c.split('\r\n').length === 4, c.slice(0, 300));
  ok('5 Excel só carrega quando pede a planilha', !p.excelPedido);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bt-xlsx-itens')]);
  let wb = XLSX.readFile(await dl.path());
  const aba = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:null });
  ok('5 Excel de itens: aba com todos e uma por centro de custo, em ordem', dl.suggestedFilename() === 'lote-mensal-2026-10-itens.xlsx'
     && JSON.stringify(wb.SheetNames) === JSON.stringify(['Todos os itens', '20 FABRICA', '21 RACAO', '31 LAVOURA']), wb.SheetNames);
  const todos = aba('Todos os itens'), a20 = aba('20 FABRICA'), a21 = aba('21 RACAO'), a31 = aba('31 LAVOURA');
  ok('5 aba "Todos": cabeçalho, 6 itens e a linha de total', todos[0][0] === 'Pedido' && todos[0][14] === 'Situação' && todos.length === 8
     && todos[7][0] === 'Total' && todos[7][12] === 130.5 && todos[7][13] === 70, todos[7]);
  ok('5 cada aba só com os itens do seu centro de custo', a20.length === 5 && a20.slice(1, 4).every(l => l[3] === '20') && a20[4][12] === 100
     && a21.length === 4 && a21.slice(1, 3).every(l => l[3] === '21') && a21[3][12] === 30.5
     && a31.length === 3 && a31[1][3] === '31' && a31[1][13] === 70 && /Reprovado/i.test(a31[1][14]), [a20, a21, a31]);
  ok('5 números ficam números (Excel soma), com o formato de real', typeof a21[1][9] === 'number' && a21[1][12] === 18.5
     && /R\$/.test(wb.Sheets['21 RACAO'].M2.w || ''), wb.Sheets['21 RACAO'].M2);
  ok('5 Excel de itens: avisa quantas abas', /3 abas por centro de custo e uma com todos/.test(await txt(p, '#toast')), await txt(p, '#toast'));
  await p.selectOption('#f-cc', '21'); await p.waitForTimeout(100);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bt-xlsx-itens')]);
  wb = XLSX.readFile(await dl.path());
  ok('5 Excel respeita os filtros (só o centro escolhido)', JSON.stringify(wb.SheetNames) === JSON.stringify(['Todos os itens', '21 RACAO']) && /1 aba por centro de custo/.test(await txt(p, '#toast')), wb.SheetNames);
  ok('5 a biblioteca do Excel carrega uma vez só', p.excelPedido === 1, p.excelPedido);
  await p.selectOption('#f-cc', ''); await p.waitForTimeout(100);
  await p.selectOption('#f-ger', 'g2'); await p.selectOption('#f-fam', 'MG'); await p.waitForTimeout(100);
  await p.click('#bt-xlsx-itens'); await p.waitForTimeout(200);
  ok('5 nada para baixar avisa', /Nada para baixar/.test(await txt(p, '#toast')));
  await p.click('#bt-limpa'); await p.waitForTimeout(100);

  /* 6 — trocar de mês */
  await p.selectOption('#f-mes', '2026-11-01'); await p.waitForTimeout(400);
  ok('6 troca de mês pede o mês escolhido', p.chamadas[p.chamadas.length - 1].p_competencia === '2026-11-01');
  ok('6 mês aberto: avisa e sem valor', /Lote mensal de novembro\/2026/.test(await txt(p, '#titulo')) && /ainda não fechou/.test(await txt(p, '#view')) && /Ainda não fechou/.test(await txt(p, '.estado-lote')) && /Ainda não fechado: os pedidos entram na cotação quando Compras fechar o mês/.test(await txt(p, '.estado-lote'))
     && /sai da cotação do lote/.test(await txt(p, '.resumo')), await txt(p, '.resumo'));
  ok('6 a aba escolhida continua', (await p.getAttribute('[data-aba="cortes"]', 'aria-selected')) === 'true' && /Nada foi cortado/.test(await txt(p, '#view')));
  ok('6 opção do mês aberto diz que não fechou', /novembro\/2026 \(ainda não fechou\)/.test(await txt(p, '#f-mes')));
  await p.close(); }

/* 7 — gerência vê só a dela; comprador sem a navegação da diretoria; voltar para a tela de origem */
{ const p = await abrir(b, { resp:() => Object.assign(mesOut(), { quem:{ tipo:'aprovador', nome:'JUNIOR' }, ve_tudo:false }) });
  ok('7 gerência: diz que vê só a dela', /JUNIOR · só a sua gerência/.test(await txt(p, '#quem')));
  ok('7 sem navegação da diretoria', await p.locator('#nav-telas').isHidden());
  ok('7 gerência/financeiro: volta para as aprovações com o token', await p.locator('#lnk-voltar').isVisible()
     && /Voltar para as aprovações/.test(await txt(p, '#lnk-voltar')) && (await p.getAttribute('#lnk-voltar', 'href')) === 'aprovacoes.html?t=dir-1');
  await p.close(); }
{ const p = await abrir(b, { token:'cp-9 x', resp:() => Object.assign(mesOut(), { quem:{ tipo:'comprador', nome:'HERISSON' } }) });
  ok('7 Compras: volta para a Mesa de Cotação com o token', await p.locator('#lnk-voltar').isVisible()
     && /Voltar para a Mesa de Cotação/.test(await txt(p, '#lnk-voltar')) && (await p.getAttribute('#lnk-voltar', 'href')) === 'mesa-cotacao.html?t=cp-9%20x'
     && await p.locator('#nav-telas').isHidden());
  await Promise.all([p.waitForURL(/mesa-cotacao\.html\?t=cp-9%20x/), p.click('#lnk-voltar')]);
  ok('7 clicar em voltar abre a Mesa', /mesa-cotacao\.html\?t=cp-9%20x$/.test(p.url()), p.url());
  await p.close(); }
{ const p = await abrir(b);
  ok('7 diretoria: sem "voltar" (tem a navegação própria)', await p.locator('#lnk-voltar').isHidden() && await p.locator('#nav-telas').isVisible());
  await p.close(); }
{ const p = await abrir(b, { semExcel:true });
  await p.click('#bt-xlsx-itens'); await p.waitForTimeout(400);
  ok('7 sem internet para o Excel: avisa e o botão volta', /Não consegui montar a planilha do Excel/.test(await txt(p, '#toast')) && !(await p.isDisabled('#bt-xlsx-itens')));
  await p.click('#bt-xlsx-itens'); await p.waitForTimeout(400);
  ok('7 tenta de novo na segunda vez', p.excelPedido === 2, p.excelPedido);
  await p.close(); }

/* 8 — mês vazio */
{ const p = await abrir(b, { resp:() => Object.assign(mesNov(), { itens:[], cortes:[] }) });
  ok('8 mês sem compras', /Nenhuma compra mensal em novembro\/2026/.test(await txt(p, '#view')));
  await p.close(); }

/* 9 — celular */
{ const p = await abrir(b, { vp:{ width:390, height:800 } });
  ok('9 celular: página sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.click('[data-aba="itens"]'); await p.waitForTimeout(100);
  ok('9 celular: tabela larga rola dentro da caixa', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
