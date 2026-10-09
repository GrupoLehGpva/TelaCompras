/* FUNIL · REENVIAR AO GR (09/10)
   OC que não entrou no GR (recusada pelo GR ou não montada) mostra o motivo; para o comprador,
   botão "Reenviar ao GR" com confirmação. Link do aviso no Slack: painel.html?t=…&p=<nº>. */
const { chromium } = require('playwright');
const falhas = []; let total = 0;
const ok = (n, c, d) => { total++; if (!c) falhas.push(n + ' — ' + (d === undefined ? '' : JSON.stringify(d))); };
const dia = n => new Date(Date.now() - n*864e5).toISOString();
const L = (numero, extra={}) => Object.assign({
  numero, tipo_compra:'normal', etapa_atual:null, status:'aprovado', aberto_em:dia(3),
  facilitador:'Ana Paula', empresa:'EMPRESA 1', centro_custo:'20', cc_nome:'FABRICA', motivo:'m',
  itens:[{ desc:'ITEM ' + numero, qtd:1, un:'UN', fam:'MG' }], decisoes:[], cotacoes:[], ordens:[], canal:'telas', movimentos:[], anexos:[]
}, extra);
const OC = extra => Object.assign({ id:'o' + Math.random().toString(36).slice(2), situacao:'no gr', numero_gr:'4120', total:500, criada:dia(1), lancada:dia(1),
  forn:'ROLAMAX', ambiente:'producao', forma_pagamento:'Boleto', condicao:'28 dias', itens:[] }, extra);
const LOTE = { id:'lt5', competencia:'2026-10-01', estado:'encerrado', numero:'L2610-g5', gerencia_id:'g5', gerencia:'GERENTE CINCO', pacote_estado:'aprovado', pacote_total:900 };
const LINHAS = [
  L('R1', { valor_cotado:2100, ordens:[OC({ situacao:'recusada', numero_gr:null, lancada:null, forn:'E L INFORMATICA', erro:'Centro de investimento não informado!' })] }),
  L('R2', { valor_cotado:900, ordens:[OC({ situacao:'recusada', numero_gr:null, lancada:null, forn:null, total:null, condicao:null, forma_pagamento:null,
            erro:'Pedido não pode virar OC: o fornecedor "H&A <b>X</b>" não está no cadastro de fornecedores' })] }),
  L('R3', { valor_cotado:100, ordens:[OC({ situacao:'incerta', numero_gr:null, lancada:null, erro:'A conexão caiu sem resposta' })] }),
  L('R4', { valor_cotado:100, ordens:[OC({ situacao:'a lancar', numero_gr:null, lancada:null }), OC({})] }),
  L('R5', { valor_cotado:100, ordens:[OC({ situacao:'recusada', ambiente:'homologacao', numero_gr:null, lancada:null, erro:'teste' }), OC({ situacao:'a lancar', numero_gr:null })] }),
  L('R6', { valor_cotado:100, ordens:[OC({ situacao:'recusada', numero_gr:null, lancada:null, erro:'Erro qualquer' })] }),
  L('M1', { tipo_compra:'mensal', valor_cotado:900, lote:LOTE, ordens:[OC({ situacao:'recusada', numero_gr:null, lancada:null, pacote:'L2610-g5', forn:'DISTRIBUIDORA', erro:'Fornecedor inativo' })] }),
];
const RESP = {
  R1: { ok:true, mensagem:'Reenviado. A OC vai ao GR em até 1 minuto.' },
  R2: { ok:false, erro:'ainda_bloqueado', mensagem:'Ainda falta corrigir antes de reenviar.', bloqueios:['o fornecedor "H&A" não está no cadastro de fornecedores'] },
  'L2610-g5': { ok:true, mensagem:'Reenviado. A OC vai ao GR em até 1 minuto.' },
};
(async () => {
const b = await chromium.launch();
const abrir = async (q, pode = true) => {
  const p = await b.newPage({ viewport:{ width:1500, height:1000 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.chamadas = [];
  await p.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, quem:'Herisson', pode_reenviar:pode, solicitacoes:LINHAS }) });
    if (u.includes('/rpc/oc_reenviar_gr')){
      const corpo = JSON.parse(r.request().postData()); p.chamadas.push(corpo);
      if (corpo.p_numero === 'R6') return r.abort('failed');
      return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RESP[corpo.p_numero] || { ok:false, mensagem:'?' }) });
    }
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await p.goto('file://' + __dirname + '/painel.html?t=pd-teste' + (q || '')); await p.waitForTimeout(900);
  return p;
};
const secOC = p => p.locator('#modal .oc-sec');

/* 1 link do Slack abre o card direto */
let p = await abrir('&p=R1');
ok('1 ?p= abre o modal do pedido', !(await p.locator('#overlay').isHidden()) && /R1/.test(await p.locator('#modal .eyebrow').textContent()));
ok('1 motivo do GR aparece', /Motivo: Centro de investimento não informado!/.test(await secOC(p).textContent()));
ok('1 OC recusada com borda de alerta', await p.locator('#modal li.oc-falhou').count() === 1);
const bt = p.locator('#modal [data-reenviar="R1"]');
ok('1 botão Reenviar ao GR', await bt.count() === 1 && (await bt.textContent()).trim() === 'Reenviar ao GR');
/* 2 confirmação: 1º clique não chama o banco */
await bt.click(); await p.waitForTimeout(150);
ok('2 1º clique pede confirmação', (await bt.textContent()).trim() === 'Confirmar reenvio ao GR' && p.chamadas.length === 0);
await p.waitForTimeout(5300);
ok('2 confirmação expira e volta ao rótulo', (await bt.textContent()).trim() === 'Reenviar ao GR' && p.chamadas.length === 0);
await bt.click(); await p.waitForTimeout(100); await bt.click(); await p.waitForTimeout(500);
ok('2 2º clique chama oc_reenviar_gr com token e número', p.chamadas.length === 1 && p.chamadas[0].p_numero === 'R1' && p.chamadas[0].p_token === 'pd-teste', p.chamadas);
ok('2 sucesso esconde o botão e mostra a mensagem', await bt.isHidden() && /vai ao GR em até 1 minuto/.test(await p.locator('#modal [data-res="R1"]').textContent()));
ok('2 toast de sucesso', /reenviada/.test(await p.locator('#toast').textContent()));
await p.close();

/* 3 não montada: motivo sem o prefixo técnico; ainda bloqueado mostra a lista e mantém o botão */
p = await abrir('&p=R2');
const t2 = await secOC(p).textContent();
ok('3 OC não montada aparece', /OC não montada/.test(t2) && /não chegou a ir ao GR/.test(t2));
ok('3 motivo sem "Pedido não pode virar OC"', /Motivo: o fornecedor "H&A <b>X<\/b>" não está/.test(t2) && !/Pedido não pode virar OC/.test(t2), t2);
ok('3 sem tag HTML injetada', await p.locator('#modal .oc-erro b').count() === 0);
const bt2 = p.locator('#modal [data-reenviar="R2"]');
await bt2.click(); await bt2.click(); await p.waitForTimeout(500);
const r2 = await p.locator('#modal [data-res="R2"]').textContent();
ok('3 ainda bloqueado: mensagem + o que falta', /Ainda falta corrigir/.test(r2) && /não está no cadastro de fornecedores/.test(r2), r2);
ok('3 ainda bloqueado: botão continua e volta ao rótulo', await bt2.isVisible() && !(await bt2.isDisabled()) && (await bt2.textContent()).trim() === 'Reenviar ao GR');
await p.close();

/* 4 sem botão: incerta, na fila, só homologação, OC no GR */
p = await abrir();
await p.selectOption('#f-per', 'all'); await p.waitForTimeout(200);
for (const n of ['R3','R4','R5']){
  await p.evaluate(n => abrirModal(n, [achar(n)]), n); await p.waitForTimeout(150);
  ok('4 ' + n + ' sem botão de reenvio', await p.locator('#modal [data-reenviar]').count() === 0 && await p.locator('#modal .reenvio-info').count() === 0);
  await p.evaluate(() => fecharModal());
}
/* 5 falha de rede */
await p.evaluate(() => abrirModal('R6', [achar('R6')])); await p.waitForTimeout(150);
const bt6 = p.locator('#modal [data-reenviar="R6"]');
await bt6.click(); await bt6.click(); await p.waitForTimeout(600);
ok('5 sem conexão: mensagem e botão de volta', /Não consegui falar com o banco/.test(await p.locator('#modal [data-res="R6"]').textContent()) && !(await bt6.isDisabled()));
await p.evaluate(() => fecharModal());
await p.close();

/* 6 pacote do lote: botão reenvia pelo número do pacote */
p = await abrir('&p=L2610-g5');
ok('6 ?p=<pacote> abre o pacote', /pacote do lote mensal/.test(await p.locator('#modal .eyebrow').textContent()));
const bt7 = p.locator('#modal [data-reenviar="L2610-g5"]');
await bt7.click(); await bt7.click(); await p.waitForTimeout(500);
ok('6 reenvio do pacote manda o nº do pacote', p.chamadas.length === 1 && p.chamadas[0].p_numero === 'L2610-g5', p.chamadas);
await p.close();

/* 7 quem não é comprador: vê o motivo e o aviso, sem botão */
p = await abrir('&p=R1', false);
ok('7 sem permissão: sem botão', await p.locator('#modal [data-reenviar]').count() === 0);
ok('7 sem permissão: aviso de que o comprador reenvia', /o comprador reenvia por aqui/.test(await secOC(p).textContent()));
ok('7 motivo continua visível', /Centro de investimento não informado/.test(await secOC(p).textContent()));
await p.close();

/* 8 número que não existe */
p = await abrir('&p=C9999');
await p.waitForTimeout(200);
ok('8 número inexistente: modal fechado e aviso', await p.locator('#overlay').isHidden() && /não encontrado/.test(await p.locator('#toast').textContent()));
/* 9 celular */
await p.close();
p = await abrir('&p=R1'); await p.setViewportSize({ width:390, height:800 }); await p.waitForTimeout(200);
ok('9 celular sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await p.setViewportSize({ width:1100, height:900 }); await p.waitForTimeout(200);
await p.locator('#modal .oc-sec').screenshot({ path: process.env.SHOT || '/tmp/reenvio.png' });
await p.close();
await b.close();
console.log(falhas.length ? falhas.length + ' de ' + total + ' falharam:\n' + falhas.join('\n') : 'OK ' + total + '/' + total);
process.exit(falhas.length ? 1 : 0);
})();
