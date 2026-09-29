/* FUNIL DA DIRETORIA · PEDIDOS DO CAMINHO DAS TELAS (29/09)
   Achados no teste de todos os fluxos no banco de verdade:
   · pedido cancelado ficava parado na coluna Liderança;
   · pedido cotado na Mesa aparecia "Sem valor ainda" e "nenhuma cotação enviada".
   Agora: cancelado vai para "Reprovadas e canceladas"; o valor e o fornecedor
   cotados aparecem; o histórico mostra cotação enviada, devolução, edição e
   cancelamento; o tempo na etapa conta de quando o pedido entrou nela. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n,c,d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : JSON.stringify(d)));
const dia = n => new Date(Date.now() - n*864e5).toISOString();
const L = (numero, extra={}) => Object.assign({
  numero, tipo_compra: 'normal', etapa_atual: 'lider', status: 'aguardando aprovacao', aberto_em: dia(6),
  facilitador: 'Ana Paula', empresa: 'EMPRESA 1', centro_custo: '20', cc_nome: 'FABRICA', motivo: 'm',
  itens: [{ desc: 'ITEM ' + numero, qtd: 2, un: 'UN', fam: 'MG' }], decisoes: [], cotacoes: [], ordens: [], canal: 'telas', movimentos: []
}, extra);
const LINHAS = [
  L('T-CAN', { status: 'cancelado', etapa_atual: null, cancelado_em: dia(1),
    movimentos: [{ acao: 'cancelado', etapa: null, por: 'Ana Paula', motivo: 'Comprei de outro jeito', em: dia(1) }] }),
  L('T-GER', { etapa_atual: 'gerencial', status: 'aguardando aprovacao', aprovador_atual_nome: 'BRANDÃO',
    valor_cotado: 200, fornecedor_cotado: 'ROLAMAX', cotacao_em: dia(0.5), entrou_na_etapa_em: dia(0.2),
    decisoes: [{ etapa: 'lider', resp: 'aprovado', por: 'BRANDÃO', em: dia(5) }, { etapa: 'gerencial', resp: 'aprovado', por: 'BRANDÃO', em: dia(4) }],
    movimentos: [
      { acao: 'cotacao_enviada', etapa: 'cotacao', por: 'HERISSON', motivo: null, em: dia(4.5) },
      { acao: 'devolvido', etapa: 'gerencial', por: 'BRANDÃO', motivo: 'Negociar frete', em: dia(3) },
      { acao: 'cotacao_enviada', etapa: 'cotacao', por: 'HERISSON', motivo: 'Frete zerado', em: dia(0.5) }] }),
  L('T-COT', { etapa_atual: 'cotacao', status: 'em cotacao', entrou_na_etapa_em: dia(0.1) }),
  L('C-REP', { canal: 'clickup', status: 'reprovado', etapa_atual: null, movimentos: undefined,
    decisoes: [{ etapa: 'lider', resp: 'reprovado', motivo: 'Sem verba', por: 'X', em: dia(2) }] }),
  L('C-COT', { canal: 'clickup', etapa_atual: 'gerencial', movimentos: undefined, cotacoes: [{ forn: 'ACME', status: 'respondida', enviada: dia(4), respondida: dia(3), total: 900 }] }),
];
(async () => {
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
await p.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file:')) return r.continue();
  if (u.includes('/rpc/painel_diretoria')) return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, quem: 'Diretoria', solicitacoes: LINHAS }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.goto('file://' + __dirname + '/painel.html?t=pd-teste'); await p.waitForTimeout(900);
await p.selectOption('#f-per', 'all'); await p.waitForTimeout(200);
const colDe = id => p.$eval('#board-area .card[data-id="' + id + '"]', c => c.closest('.col').querySelector('h3').textContent.trim()).catch(() => null);

/* 1 cancelado sai do quadro e vai para o encerrado */
ok('1 cancelado não fica no quadro', await p.locator('#board-area .card[data-id="T-CAN"]').count() === 0);
const fech = await p.textContent('#closed-area');
ok('1 cancelado na lista de encerrados, com motivo', /T-CAN/.test(fech) && /Cancelada pelo solicitante/.test(fech) && /Comprei de outro jeito/.test(fech), fech);
ok('1 reprovado do ClickUp continua na lista', /C-REP/.test(fech) && /Sem verba/.test(fech));
ok('1 título e contagem', /Reprovadas e canceladas/.test(await p.textContent('body')) && /1 reprovada · 1 cancelada/.test(await p.textContent('#closed-hint')), await p.textContent('#closed-hint'));

/* 2 pedido cotado na Mesa mostra o valor e o fornecedor */
ok('2 cotado está na gerencial', await colDe('T-GER') === 'Aprovação gerencial');
ok('2 card mostra o valor cotado', /R\$\s?200,00/.test(await p.textContent('.card[data-id="T-GER"]')), await p.textContent('.card[data-id="T-GER"]'));
ok('2 pedido do ClickUp continua com a menor cotação', /R\$\s?900,00/.test(await p.textContent('.card[data-id="C-COT"]')));
ok('2 tempo na etapa conta de quando entrou (hoje)', /(0|1|2|3|4|5) ?h|hoje|0 dia|min/i.test(await p.textContent('.card[data-id="T-GER"] .pill')), await p.textContent('.card[data-id="T-GER"] .pill'));

await p.click('.card[data-id="T-GER"]'); await p.waitForTimeout(300);
const m = await p.textContent('#modal');
ok('3 modal: Cotações = Mesa de cotação · ROLAMAX', /Mesa de cotação · ROLAMAX/.test(m), m.slice(0, 600));
ok('3 modal: origem do valor', /Valor cotado/.test(m));
ok('3 histórico: cotação enviada, devolução com motivo, reenvio com observação',
   /Cotação enviada pelo comprador/.test(m) && /Devolvido ao comprador em aprovação gerencial/.test(m) && /Motivo: Negociar frete/.test(m) && /Observação: Frete zerado/.test(m), m);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

await p.click('.card[data-id="T-COT"]'); await p.waitForTimeout(300);
ok('4 em cotação na Mesa: "ainda na cotação"', /ainda na cotação/.test(await p.textContent('#modal')));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

/* 5 modal do cancelado */
await p.click('#closed-area tr[data-id="T-CAN"]'); await p.waitForTimeout(300);
const mc = await p.textContent('#modal');
ok('5 modal do cancelado', /Cancelada/.test(mc) && /Comprei de outro jeito/.test(mc) && /Cancelado pelo solicitante/.test(mc), mc.slice(0, 400));
ok('5 nenhuma etapa marcada como atual', await p.locator('#modal .step.cur').count() === 0);
await p.keyboard.press('Escape');

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
