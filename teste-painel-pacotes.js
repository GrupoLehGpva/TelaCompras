/* FUNIL · ETAPA 2 (03/10)
   · etapa "Concluído": o pedido só sai de Ordem de compra quando TODAS as OCs dele estão no GR;
   · card da OC com os itens que foram para o GR e os orçamentos do comprador;
   · lote mensal em pacotes por gerência (da cotação em diante), com os pedidos dentro. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n,c,d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : JSON.stringify(d)));
const dia = n => new Date(Date.now() - n*864e5).toISOString();
const L = (numero, extra={}) => Object.assign({
  numero, tipo_compra:'normal', etapa_atual:null, status:'aprovado', aberto_em:dia(6),
  facilitador:'Ana Paula', empresa:'EMPRESA 1', centro_custo:'20', cc_nome:'FABRICA', motivo:'m',
  itens:[{ desc:'ITEM ' + numero, qtd:2, un:'UN', fam:'MG' }], decisoes:[], cotacoes:[], ordens:[], canal:'telas', movimentos:[], anexos:[]
}, extra);
const OC = (extra) => Object.assign({ id:'o' + Math.random().toString(36).slice(2), situacao:'no gr', numero_gr:'4120', total:500, criada:dia(2), lancada:dia(1),
  forn:'ROLAMAX', ambiente:'producao', forma_pagamento:'Boleto', condicao:'28 dias', itens:[] }, extra);
const LOTE = (ger, nome, extra={}) => Object.assign({ id:'lt1', competencia:'2026-10-01', estado:'encerrado', numero:'L2610-' + ger, gerencia_id:ger, gerencia:nome,
  pacote_estado:'aguardando', pacote_total:3400 }, extra);
const ORC = { nome:'Orçamento · rolamax.pdf', caminho:'u9/orcamento-1.pdf', mime:'application/pdf', tamanho:2048, enviado_em:dia(3) };
const FOTO = { nome:'foto.jpg', caminho:'u9/foto.jpg', mime:'image/jpeg', tamanho:1024, enviado_em:dia(5) };
const ocLote = OC({ id:'olote', forn:'DISTRIBUIDORA SUL', total:900, numero_gr:'5001', pacote:'L2610-g4', itens:[{ nome:'GRAXA', qtd:10, unit:90, total:900 }] });
const LINHAS = [
  /* OC: uma no GR e outra a lançar → continua em Ordem de compra */
  L('T-OC', { valor_cotado:700, ordens:[OC({ itens:[{ nome:'ROLAMENTO 6205', qtd:4, unit:100, total:400 }, { nome:'RETENTOR <b>X</b>', qtd:2, unit:50, total:100 }] }),
                                       OC({ situacao:'a lancar', numero_gr:null, lancada:null, total:200, forn:'CASA', itens:[] })],
              anexos:[FOTO, ORC] }),
  /* todas no GR → Concluído */
  L('T-CONC', { valor_cotado:300, destino:'estoque', ordens:[OC({ total:300, itens:[{ nome:'SAL', qtd:300, unit:1, total:300 }] }), OC({ situacao:'cancelada', total:1 })] }),
  /* orçamento sem OC ainda (gerencial) */
  L('T-GER', { etapa_atual:'gerencial', status:'aguardando aprovacao', valor_cotado:80, anexos:[ORC] }),
  /* lote mensal: g1 com 2 pedidos no financeiro, g2 com 1; g3 concluído; g4 na OC */
  L('M1', { tipo_compra:'mensal', etapa_atual:'financeiro', status:'aguardando aprovacao', valor_cotado:1000, centro_custo:'20', cc_nome:'FABRICA', lote:LOTE('g1','GERENTE UM'), entrou_na_etapa_em:dia(1) }),
  L('M2', { tipo_compra:'mensal', etapa_atual:'financeiro', status:'aguardando aprovacao', valor_cotado:2400, centro_custo:'31', cc_nome:'LAVOURA', lote:LOTE('g1','GERENTE UM'), entrou_na_etapa_em:dia(1),
            itens:[{ desc:'SABAO EM PO', qtd:10, un:'UN', fam:'HL' }] }),
  L('M3', { tipo_compra:'mensal', etapa_atual:'financeiro', status:'aguardando aprovacao', valor_cotado:500, lote:LOTE('g2','GERENTE DOIS', { pacote_total:500 }), entrou_na_etapa_em:dia(1) }),
  L('M5', { tipo_compra:'mensal', valor_cotado:50, lote:LOTE('g3','GERENTE TRES', { pacote_estado:'aprovado', pacote_total:50 }), ordens:[OC({ total:50, pacote:'L2610-g3' })] }),
  L('M6', { tipo_compra:'mensal', valor_cotado:900, lote:LOTE('g4','GERENTE QUATRO', { pacote_estado:'aprovado', pacote_total:900 }), ordens:[Object.assign({}, ocLote, { situacao:'a lancar', numero_gr:null, lancada:null })] }),
  L('M7', { tipo_compra:'mensal', etapa_atual:'cotacao', status:'em cotacao', lote:LOTE('g1','GERENTE UM', { pacote_estado:null, pacote_total:null }) }),
  /* 05/10: aberto no mês passado e ainda em andamento (aparece com o filtro do mês); concluído do mês passado não */
  L('T-VELHO', { etapa_atual:'gerencial', status:'aguardando aprovacao', aberto_em:dia(40), entrou_na_etapa_em:dia(0.2), valor_cotado:10 }),
  L('T-VELHO-CONC', { aberto_em:dia(40), ordens:[OC({ total:10 })] }),
  /* 05/10: card mostra o preço escolhido na cotação (Mesa) e o fornecedor; item antigo cai no menor preço */
  L('T-PRECO', { etapa_atual:'gerencial', status:'aguardando aprovacao', entrou_na_etapa_em:dia(0.2),
                 itens:[{ desc:'LISINA (25 KG)', qtd:4000, un:'KG', fam:'IA', esc:{ preco:12.5, forn:'CARGILL' } },
                        { desc:'ITEM ANTIGO', qtd:2, un:'UN', fam:'MG', p1:30, p2:20, p3:null }] }),
  /* mensal aguardando o lote: continua solto */
  L('M8', { tipo_compra:'mensal', etapa_atual:'lote', status:'aguardando aprovacao' }),
];
/* M7 está em cotação no mesmo lote? Não: outro lote (numero diferente), para não misturar etapas. */
LINHAS.find(x => x.numero === 'M7').lote.numero = 'L2611-g1';
(async () => {
const b = await chromium.launch();
const abrir = async (vp = { width:1600, height:1000 }) => {
  const p = await b.newPage({ viewport:vp });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.assinados = [];
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, quem:'Diretoria', solicitacoes:LINHAS }) });
    if (u.includes('/storage/v1/object/sign/') && r.request().method() === 'POST'){ p.assinados.push(decodeURI(u.split('/sign/anexos/')[1])); return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ signedURL:'/object/sign/anexos/x?token=t' }) }); }
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await p.goto('file://' + __dirname + '/painel.html?t=pd-teste'); await p.waitForTimeout(900);
  await p.selectOption('#f-per', 'all'); await p.waitForTimeout(200);
  return p;
};
const p = await abrir();
const colDe = id => p.$eval('#board-area .card[data-id="' + id + '"]', c => c.closest('.col').querySelector('h3').textContent.trim()).catch(() => null);
const cards = col => p.$$eval('#board-area .col', (cs, col) => { const c = cs.find(x => x.querySelector('h3').textContent.trim() === col); return c ? [...c.querySelectorAll('.card')].map(x => x.dataset.id) : null; }, col);

/* 1 Concluído */
ok('1 coluna Concluído depois da OC', JSON.stringify(await p.$$eval('#board-area .col h3', h => h.map(x => x.textContent.trim())).then(a => a.slice(-2))) === '["Ordem de compra","Concluído"]');
ok('1 OC com uma ainda a lançar fica em Ordem de compra', await colDe('T-OC') === 'Ordem de compra');
ok('1 todas as OCs no GR (cancelada não conta) → Concluído', await colDe('T-CONC') === 'Concluído');
ok('1 concluído sem prazo nem "com quem"', await p.locator('.card[data-id="T-CONC"] .pill').count() === 0 && await p.locator('.card[data-id="T-CONC"] .who').count() === 0);
ok('1 coluna Concluído sem prazo', !/prazo/.test(await p.$$eval('#board-area .col', cs => cs.find(c => c.querySelector('h3').textContent.trim() === 'Concluído').querySelector('.col-sub').textContent)));
await p.click('.card[data-id="T-CONC"]'); await p.waitForTimeout(300);
{ const m = await p.textContent('#modal');
  ok('1 modal do concluído', /Concluído/.test(await p.textContent('#modal .holder')) && /OC lançada no GR/.test(m) && await p.locator('#modal .step.cur').count() === 1 && /Concluído/.test(await p.textContent('#modal .step.cur')), m.slice(0, 300));
  ok('1 consumo ou estoque no detalhe (03/10)', /Consumo ou estoque\s*Estoque/.test(m), m);
  ok('1 OC cancelada não aparece no card', (await p.locator('#modal .oc-lista li').count()) === 1);
  ok('1 valor = OCs vivas (cancelada não soma)', /R\$\s?300,00/.test(await p.textContent('#modal .kv .v.big')), await p.textContent('#modal .kv .v.big')); }
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

/* 2 card da OC: itens + orçamento */
await p.click('.card[data-id="T-OC"]'); await p.waitForTimeout(300);
{ const sec = await p.textContent('#modal .oc-sec');
  ok('2 valor do pedido = soma das OCs', /R\$\s?700,00/.test(await p.textContent('#modal .kv .v.big')) && /Ordens de compra/.test(await p.textContent('#modal .grid2')));
  ok('2 título com duas OCs', /Ordens de compra · 2/.test(sec), sec.slice(0, 80));
  ok('2 itens da OC com qtd, unitário e total', await p.locator('#modal .oc-sec li:first-child table.oc-itens tbody tr').count() === 2 && /ROLAMENTO 6205/.test(sec) && /R\$\s?100,00/.test(sec) && /R\$\s?400,00/.test(sec), sec);
  ok('2 nome do item não vira HTML', await p.locator('#modal .oc-itens b').count() === 0 && /RETENTOR <b>X<\/b>/.test(sec));
  ok('2 OC ainda sem itens avisa', /Os itens aparecem quando a OC for montada/.test(sec));
  ok('2 orçamento dentro do card da OC', /Orçamentos dos fornecedores \(1\)/.test(sec) && /rolamax\.pdf/.test(sec));
  const anx = await p.textContent('#modal .m-sec:has(h3:text-matches("Anexos do solicitante"))');
  ok('2 orçamento sai dos anexos do solicitante', /foto\.jpg/.test(anx) && !/rolamax/.test(anx) && /Anexos do solicitante 1/.test(anx.replace(/\s+/g, ' ')), anx);
  await p.click('#modal .oc-sec .anexo-cab'); await p.waitForTimeout(400);
  ok('2 abrir o orçamento pede o arquivo certo', p.assinados.slice(-1)[0] === ORC.caminho, p.assinados);
  await p.click('#modal .m-sec:has(h3:text-matches("Anexos do solicitante")) .anexo-cab'); await p.waitForTimeout(400);
  ok('2 abrir a foto pede o arquivo certo', p.assinados.slice(-1)[0] === FOTO.caminho, p.assinados); }
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.click('.card[data-id="T-GER"]'); await p.waitForTimeout(300);
ok('2 pedido antigo sem consumo/estoque', /Consumo ou estoque\s*não informado/.test(await p.textContent('#modal')));
ok('2 sem OC: orçamentos numa seção própria', /Orçamentos dos fornecedores/.test(await p.textContent('#modal .oc-sec')) && !/Ordem de compra/.test(await p.textContent('#modal .oc-sec')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

/* 3 pacotes do lote */
const fin = await cards('Aprovação financeiro');
ok('3 financeiro: um card por gerência', JSON.stringify(fin) === JSON.stringify(['pacote:L2610-g1:fin', 'pacote:L2610-g2:fin']) || JSON.stringify(fin) === JSON.stringify(['pacote:L2610-g2:fin', 'pacote:L2610-g1:fin']), fin);
ok('3 pedidos do lote não aparecem soltos', await p.locator('.card[data-id="M1"], .card[data-id="M2"], .card[data-id="M3"]').count() === 0);
{ const c = await p.textContent('.card[data-id="pacote:L2610-g1:fin"]');
  ok('3 card do pacote: número, pedidos, gerência, valor aprovado do pacote', /L2610-g1/.test(c) && /Pacote · 2 pedidos/.test(c) && /Lote 10\/2026 · GERENTE UM/.test(c) && /R\$\s?3\.400,00/.test(c) && /FABRICA, LAVOURA/.test(c), c); }
ok('3 pacote em cotação soma os pedidos', /Sem valor ainda/.test(await p.textContent('.card[data-id="pacote:L2611-g1:cot"]')));
ok('3 pacote concluído', await colDe('pacote:L2610-g3:conc') === 'Concluído');
ok('3 pacote na OC', await colDe('pacote:L2610-g4:oc') === 'Ordem de compra');
ok('3 mensal aguardando o lote continua solta', await colDe('M8') === 'Aguardando o lote');
ok('3 coluna conta os cards', /^2$/.test((await p.$$eval('#board-area .col', cs => cs.find(c => c.querySelector('h3').textContent.trim() === 'Aprovação financeiro').querySelector('.c').textContent)).trim()));

/* 4 modal do pacote → pedido → voltar */
await p.click('.card[data-id="pacote:L2610-g1:fin"]'); await p.waitForTimeout(300);
{ const m = await p.textContent('#modal');
  ok('4 modal do pacote', /L2610-g1/.test(m) && /pacote do lote mensal/.test(m) && /Esperando o financeiro/.test(m) && /GERENTE UM/.test(m) && /10\/2026/.test(m), m.slice(0, 500));
  ok('4 valor = soma dos pedidos, e o aprovado do pacote à parte', /Valor \(soma dos pedidos\)\s*R\$\s?3\.400,00/.test(m) && /Aprovado no pacote da gerência\s*R\$\s?3\.400,00/.test(m), m.slice(0, 600));
  ok('4 pedidos do pacote com link', await p.locator('#modal [data-ped]').count() === 2 && /SABAO EM PO/.test(m));
  ok('4 trilha da mensal no financeiro', /Financeiro/.test(await p.textContent('#modal .step.cur'))); }
await p.click('#modal [data-ped="M2"]'); await p.waitForTimeout(300);
ok('4 abriu o pedido do pacote', /M2/.test(await p.textContent('#modal .eyebrow')) && await p.locator('#m-voltar').count() === 1 && /pedidos do pacote/.test(await p.textContent('#modal .pos')));
ok('4 pedido mostra o pacote', /Pacote L2610-g1/.test((await p.textContent('#modal')).replace(/\s+/g, ' ')));
await p.click('#m-prev'); await p.waitForTimeout(200);
ok('4 anterior anda entre os pedidos do pacote', /M1/.test(await p.textContent('#modal .eyebrow')));
await p.click('#m-voltar'); await p.waitForTimeout(300);
ok('4 voltar ao pacote', /L2610-g1/.test(await p.textContent('#modal .eyebrow')) && await p.locator('#m-voltar').count() === 0);
await p.click('#m-next'); await p.waitForTimeout(200);
ok('4 próxima do pacote vai para o próximo card', /L2610-g2/.test(await p.textContent('#modal .eyebrow')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok('4 Escape fecha', await p.locator('#overlay').isHidden());
await p.click('.card[data-id="pacote:L2610-g4:oc"]'); await p.waitForTimeout(300);
ok('4 pacote na OC mostra a OC com itens', /DISTRIBUIDORA SUL/.test(await p.textContent('#modal .oc-sec')) && /GRAXA/.test(await p.textContent('#modal .oc-sec')) && /Aprovado pelo financeiro/.test(await p.textContent('#modal')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
/* abrir pedido e fechar: o próximo modal não fica preso ao pacote */
await p.click('.card[data-id="pacote:L2610-g1:fin"]'); await p.waitForTimeout(200);
await p.click('#modal [data-ped="M1"]'); await p.waitForTimeout(200);
await p.click('#m-ok'); await p.waitForTimeout(200);
await p.click('.card[data-id="T-OC"]'); await p.waitForTimeout(200);
ok('4 depois de fechar, sem "voltar ao pacote"', await p.locator('#m-voltar').count() === 0 && /na lista atual/.test(await p.textContent('#modal .pos')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

/* 5 filtros valem por pedido */
await p.selectOption('#f-cc', 'LAVOURA'); await p.waitForTimeout(200);
ok('5 filtro de centro de custo: o valor do pacote é só do pedido que ficou', /R\$\s?2\.400,00/.test(await p.textContent('.card[data-id="pacote:L2610-g1:fin"]')) && !/3\.400/.test(await p.textContent('.card[data-id="pacote:L2610-g1:fin"]')));
ok('5 filtro de centro de custo: o pacote fica só com o pedido que bate', /Pacote · 1 pedido/.test(await p.textContent('.card[data-id="pacote:L2610-g1:fin"]')) && await p.locator('.card[data-id="pacote:L2610-g2:fin"]').count() === 0);
await p.selectOption('#f-cc', ''); await p.waitForTimeout(200);
await p.fill('#f-q', 'L2610-g1'); await p.waitForTimeout(300);
ok('5 busca pelo número do pacote', await p.locator('#board-area .card').count() === 1 && await p.locator('.card[data-id="pacote:L2610-g1:fin"]').count() === 1);
await p.fill('#f-q', 'gerente dois'); await p.waitForTimeout(300);
ok('5 busca pela gerência', await p.locator('.card[data-id="pacote:L2610-g2:fin"]').count() === 1);
await p.fill('#f-q', ''); await p.waitForTimeout(300);
await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(300);
ok('5 tipo Mensal mostra os pacotes', await p.locator('.card.pacote').count() === 5 && await p.locator('.card[data-id="T-OC"]').count() === 0);
await p.click('#f-tipo [data-tipo=mensal]'); await p.waitForTimeout(200);

/* 6 lista */
await p.click('#f-vista [data-vista=lista]'); await p.waitForTimeout(300);
{ const tr = await p.textContent('tr[data-id="pacote:L2610-g1:fin"]');
  ok('6 lista: pacote numa linha', /L2610-g1/.test(tr) && /Pacote com 2 pedidos/.test(tr) && /Mensal/.test(tr), tr);
  ok('6 lista: grupo Concluído', (await p.$$eval('tr.grupo', t => t.map(x => x.textContent))).some(x => /^Concluído · 3/.test(x.trim())));
  ok('6 rodapé conta cada pedido', /solicitações no quadro \(pacotes do lote contam cada pedido\)/.test(await p.textContent('table.lista tfoot')), await p.textContent('table.lista tfoot'));
  await p.click('tr[data-id="pacote:L2610-g1:fin"]'); await p.waitForTimeout(300);
  ok('6 lista: clique abre o pacote', /pacote do lote mensal/.test(await p.textContent('#modal')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-ord=num]'); await p.waitForTimeout(200);
  { const ids = await p.$$eval('table.lista tbody tr[data-id] td:first-child', t => t.map(x => x.textContent.trim()));
    ok('6 ordenar por Nº usa o número do pacote', JSON.stringify(ids) === JSON.stringify(ids.slice().sort()), ids); }
  await p.click('#ord-volta'); await p.waitForTimeout(200);
  await p.click('[data-ord=etapa]'); await p.waitForTimeout(200);
  ok('6 ordenar por etapa: concluído por último', (await p.$$eval('table.lista tbody tr[data-id]', t => t.map(x => x.dataset.id))).slice(-2).every(x => /CONC|g3/.test(x)));
}
await p.click('#f-vista [data-vista=quadro]'); await p.waitForTimeout(200);
await p.close();

/* 8 período (05/10): em andamento aparece sempre; o período recorta só os encerrados */
{ const q = await abrir();
  const mesAtual = await q.$$eval('#f-per option', o => o.map(x => x.value).filter(v => v !== 'all')[0]);   // o mês mais recente
  await q.selectOption('#f-per', mesAtual); await q.waitForTimeout(300);
  ok('8 aberto no mês passado e em andamento aparece no filtro do mês', await q.locator('.card[data-id="T-VELHO"]').count() === 1);
  ok('8 concluído do mês passado sai com o filtro do mês', await q.locator('.card[data-id="T-VELHO-CONC"]').count() === 0);
  await q.selectOption('#f-per', 'all'); await q.waitForTimeout(300);
  ok('8 todo o período mostra o concluído antigo', await q.locator('.card[data-id="T-VELHO-CONC"]').count() === 1);
  await q.close(); }

/* 9 preço da cotação no card (05/10) */
{ const q = await abrir();
  await q.click('.card[data-id="T-PRECO"]'); await q.waitForTimeout(300);
  const linhas = await q.$$eval('#modal table.items tbody tr', t => t.map(x => x.textContent.replace(/\s+/g, ' ')));
  ok('9 item da Mesa: unitário e total da cotação', /LISINA/.test(linhas[0]) && /R\$\s?12,50/.test(linhas[0]) && /R\$\s?50\.000,00/.test(linhas[0]), linhas);
  ok('9 item da Mesa: fornecedor escolhido', /CARGILL/.test(linhas[0]), linhas);
  ok('9 item antigo: menor preço', /R\$\s?20,00/.test(linhas[1]) && /R\$\s?40,00/.test(linhas[1]) && !/CARGILL/.test(linhas[1]), linhas);
  ok('9 valor do card soma os itens', /R\$\s?50\.040,00/.test(await q.textContent('#modal')), (await q.textContent('#modal')).slice(0, 400));
  await q.close(); }

/* 7 celular */
{ const q = await abrir({ width:390, height:800 });
  await q.click('.card[data-id="pacote:L2610-g1:fin"]'); await q.waitForTimeout(300);
  ok('7 celular: modal do pacote sem rolagem lateral', await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await q.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
