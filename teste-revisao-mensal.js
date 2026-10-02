/* ============================================================================
   REVISÃO ITEM A ITEM — aprovação gerencial da compra mensal (02/10)
   pedido.html aberto pelo gerente (?t=): muda quantidade e unidade, reprova
   item com motivo, inclui item do catálogo; tudo vai no Aprovar por
   decidir_itens_mensal. Todos reprovados = reprovação do pedido.
   ========================================================================== */
const { chromium } = require('playwright');
const ARQ = 'file://' + __dirname + '/pedido.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

const ID = '33333333-3333-3333-3333-333333333333';
const PED = (x = {}) => Object.assign({
  id: ID, numero: 'C2610-00050', canal: 'telas', versao: 5, etapa_atual: 'gerencial',
  solicitante: 'Ana Paula', aberto_em: '2026-10-01T13:00:00Z', centro_custo: '20',
  tipo_compra: 'mensal', definicao_fornecedor: 'cotacao', data_necessidade: '2026-11-01',
  motivo: 'Material de limpeza de outubro', empresa_id: 'wienfried-pr', status: 'aguardando aprovacao'
}, x);
const ITENS = () => [
  { id: 'i1', codigo: '5001', descricao: 'DETERGENTE 500ML', unidade: 'UNID', quantidade: 10 },
  { id: 'i2', codigo: '5002', descricao: 'SABAO EM PO 1KG', unidade: 'UNID', quantidade: 4 },
  { id: 'i3', codigo: '5003', descricao: 'ALCOOL 70', unidade: 'L', quantidade: 5 }];
const CATALOGO = [
  { codigo: '5101', descricao: 'VASSOURA PIACAVA', unidade: 'UNID', familia: '51' },
  { codigo: '5001', descricao: 'DETERGENTE 500ML', unidade: 'UNID', familia: '50' },
  { codigo: '5102', descricao: 'VASSOURA NYLON', unidade: 'UNID', familia: '51' }];

async function abrir(b, { ped = PED(), itens = ITENS(), cortados = [], fila = null, token = 'ap-ger', obs = false,
                          revisa = () => ({ ok: true, etapa: 'cotacao', mensagem: 'Aprovado. O pedido segue para a cotação. Itens: 1 alterado.' }),
                          busca = null, vw = 1200 } = {}) {
  const p = await b.newPage({ viewport: { width: vw, height: 1000 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__rpc = [];
  const filaPadrao = [{ id: ID, numero: ped.numero, etapa_atual: ped.etapa_atual, card_id: null }];
  await p.route('**/rest/v1/**', async r => {
    const u = r.request().url();
    const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (!u.includes('/rpc/')) return j([]);
    const nome = u.split('/rpc/')[1].split('?')[0];
    let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    p.__rpc.push({ nome, corpo: c });
    if (nome === 'abrir_pedido') return j({ ok: true, pedido: ped, itens, itens_cortados: cortados, anexos: [] });
    if (nome === 'fila_de_aprovacao') return j(fila === null ? filaPadrao : fila);
    if (nome === 'pedido_telas') return j({ ok: true, itens: [], linha_do_tempo: [] });
    if (nome === 'decidir_itens_mensal') return j(revisa(c));
    if (nome === 'decidir_pedido') return j({ ok: true, mensagem: 'Reprovado. Quem pediu foi avisado com o motivo.' });
    if (nome === 'buscar_item_catalogo') {
      if (busca) return busca(c, j);
      const t = String(c.p_termo || '').toLowerCase();
      return j({ ok: true, itens: CATALOGO.filter(x => x.descricao.toLowerCase().includes(t)) });
    }
    if (nome === 'observar_como') {
      if (c.p_funcao === 'fila_de_aprovacao') return j(filaPadrao);
      return j({ ok: true, itens: [], linha_do_tempo: [], observador: true, pode: { aprovar: false } });
    }
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"arquivos":[]}' }));
  const q = obs ? '&o=pa-obs&a=a-brandao' : (token ? '&t=' + token : '');
  await p.goto(ARQ + '?id=' + ID + q, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  return p;
}
const chamadas = (p, n) => p.__rpc.filter(x => x.nome === n);
const linha = (p, k) => p.locator('#revCorpo tr[data-k="' + k + '"]');
const txt = async (p, sel) => (await p.locator(sel).textContent()) || '';

(async () => {
const b = await chromium.launch();

/* 1 — gerente na mensal: revisão aparece, tabela simples some */
{ const p = await abrir(b);
  ok('1 cartão de revisão visível', await p.locator('#cartaoRevisao').isVisible());
  ok('1 tabela de leitura escondida', await p.locator('#cartaoItens').isHidden());
  ok('1 três itens na revisão', await p.locator('#revCorpo tr[data-k]').count() === 3);
  ok('1 quantidades preenchidas', await linha(p, 0).locator('.rev-qtd').inputValue() === '10' && await linha(p, 2).locator('.rev-un').inputValue() === 'L');
  ok('1 todos aprovados de início', await p.locator('#revCorpo [data-acao="manter"][aria-pressed="true"]').count() === 3);
  ok('1 botão Aprovar sem ajustes', (await p.textContent('#btnAprovar')).trim() === 'Aprovar');
  ok('1 resumo', /3 itens aprovados · 0 reprovados · 0 alterados · 0 incluídos/.test(await txt(p, '#revResumo')), await txt(p, '#revResumo'));
  ok('1 busca do catálogo visível', await p.locator('#revBusca').isVisible());

  /* 2 — muda quantidade: marca, mostra o pedido original, botão muda */
  await linha(p, 0).locator('.rev-qtd').fill('6'); await p.locator('#revNota').click(); await p.waitForTimeout(150);
  ok('2 quantidade marcada como mudada', await linha(p, 0).locator('.rev-qtd.mudou').count() === 1);
  ok('2 mostra o que foi pedido', /pedido: 10 UNID/.test(await linha(p, 0).textContent()));
  ok('2 botão vira "Aprovar com ajustes"', (await p.textContent('#btnAprovar')).trim() === 'Aprovar com ajustes');
  ok('2 resumo conta 1 alterado', /1 alterado/.test(await txt(p, '#revResumo')));
  /* desfazer volta ao normal */
  await linha(p, 0).locator('.rev-qtd').fill('10'); await p.locator('#revNota').click(); await p.waitForTimeout(150);
  ok('2 voltar ao valor tira a marca', await linha(p, 0).locator('.rev-qtd.mudou').count() === 0 && (await p.textContent('#btnAprovar')).trim() === 'Aprovar');
  await linha(p, 0).locator('.rev-qtd').fill('6,5'); await p.locator('#revNota').click(); await p.waitForTimeout(100);

  /* 3 — unidade */
  await linha(p, 2).locator('.rev-un').selectOption('ML'); await p.waitForTimeout(100);
  ok('3 unidade marcada', await linha(p, 2).locator('.rev-un.mudou').count() === 1 && /pedido: 5 L/.test(await linha(p, 2).textContent()));
  ok('3 só unidades do catálogo', JSON.stringify(await linha(p, 2).locator('.rev-un option').allTextContents()) === JSON.stringify(['UNID','KG','L','ML','M','SC','TON','GRAMAS','CAB','DOSE','BAG']));

  /* 4 — reprovar item: pede motivo; sem motivo não manda */
  await linha(p, 1).locator('[data-acao="reprovar"]').click(); await p.waitForTimeout(100);
  ok('4 linha reprovada riscada e campo de motivo com foco', await linha(p, 1).evaluate(e => e.classList.contains('rep')) &&
     await p.evaluate(() => document.activeElement && document.activeElement.dataset.m === '1'));
  ok('4 quantidade/unidade travadas no reprovado', await linha(p, 1).locator('.rev-qtd').isDisabled() && await linha(p, 1).locator('.rev-un').isDisabled());
  await p.click('#btnAprovar'); await p.waitForTimeout(200);
  ok('4 sem motivo: não manda nada', chamadas(p, 'decidir_itens_mensal').length === 0 && chamadas(p, 'decidir_pedido').length === 0);
  ok('4 sem motivo: avisa', await p.locator('#revErro').isVisible() && /motivo de reprovar "SABAO EM PO 1KG"/.test(await txt(p, '#revErro')) &&
     await p.locator('.rev-motivo.invalido').count() === 1);
  await p.fill('[data-m="1"]', 'tem em estoque');

  /* 5 — incluir item do catálogo */
  await p.fill('#revBusca', 'vass'); await p.waitForTimeout(500);
  const bc = chamadas(p, 'buscar_item_catalogo').pop();
  ok('5 busca com o token do gerente', bc && bc.corpo.p_token === 'ap-ger' && bc.corpo.p_termo === 'vass', JSON.stringify(bc));
  ok('5 resultados', await p.locator('#revAchados [data-inc]').count() === 2);
  await p.locator('#revAchados [data-inc]').first().click(); await p.waitForTimeout(150);
  ok('5 linha incluída com foco na quantidade', await p.locator('#revCorpo tr.novo').count() === 1 &&
     await p.evaluate(() => document.activeElement && document.activeElement.dataset.nq === '0'));
  await p.fill('#revBusca', 'deter'); await p.waitForTimeout(500);
  ok('5 item que já está no pedido aparece como "já está"', /já está no pedido/.test(await txt(p, '#revAchados')) && await p.locator('#revAchados [data-inc]').count() === 0);
  await p.keyboard.press('Escape');
  await p.click('#btnAprovar'); await p.waitForTimeout(200);
  ok('5 incluído sem quantidade: não manda', chamadas(p, 'decidir_itens_mensal').length === 0 && /Informe a quantidade de "VASSOURA PIACAVA"/.test(await txt(p, '#revErro')));
  await p.fill('[data-nq="0"]', '2');

  /* 6 — envia: o que vai para o banco */
  ok('6 resumo antes de enviar', /2 itens aprovados · 1 reprovado · 2 alterados · 1 incluído/.test(await txt(p, '#revResumo')), await txt(p, '#revResumo'));
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  const env = chamadas(p, 'decidir_itens_mensal');
  ok('6 uma chamada só', env.length === 1 && chamadas(p, 'decidir_pedido').length === 0, env.length);
  const c = env[0] && env[0].corpo;
  ok('6 token, id e versão', c && c.p_token === 'ap-ger' && c.p_id === ID && c.p_versao === 5, JSON.stringify(c));
  ok('6 itens', c && JSON.stringify(c.p_itens) === JSON.stringify([
      { id: 'i1', acao: 'manter', quantidade: 6.5, unidade: 'UNID' },
      { id: 'i2', acao: 'reprovar', motivo: 'tem em estoque' },
      { id: 'i3', acao: 'manter', quantidade: 5, unidade: 'ML' }]), JSON.stringify(c && c.p_itens));
  ok('6 incluídos', c && JSON.stringify(c.p_novos) === JSON.stringify([{ codigo: '5101', quantidade: 2, unidade: 'UNID' }]), JSON.stringify(c && c.p_novos));
  ok('6 barra de sucesso', /Aprovado\./.test(await txt(p, '#textoAprova')) && /Itens: 1 alterado/.test(await txt(p, '#textoAprova')));
  ok('6 tudo travado depois', await p.locator('#revCorpo input:not([disabled]), #revCorpo select:not([disabled]), #revCorpo button:not([disabled])').count() === 0 &&
     await p.locator('#revIncluir').isHidden() && await p.locator('#btnAprovar').isHidden());
  ok('6 selo "Aprovado por você"', /Aprovado por você/.test(await txt(p, '#seloStatus')));
  await p.close(); }

/* 7 — todos reprovados: vira reprovação do pedido */
{ const p = await abrir(b, { revisa: () => ({ ok: true, todos_reprovados: true, mensagem: 'Todos os itens foram reprovados: o pedido foi reprovado e quem pediu recebe o motivo de cada item.' }) });
  for (const k of [0, 1, 2]) { await linha(p, k).locator('[data-acao="reprovar"]').click(); await p.fill('[data-m="' + k + '"]', 'motivo ' + k); }
  ok('7 aviso de que vira reprovação', await p.locator('#revResumo.alerta').count() === 1 && /o pedido será reprovado/.test(await txt(p, '#revResumo')));
  ok('7 botão "Reprovar pedido"', (await p.textContent('#btnAprovar')).trim() === 'Reprovar pedido');
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  const c = chamadas(p, 'decidir_itens_mensal')[0].corpo;
  ok('7 manda os três como reprovar', c.p_itens.every(x => x.acao === 'reprovar') && c.p_novos.length === 0, JSON.stringify(c));
  ok('7 barra "Reprovado"', /Reprovado\./.test(await txt(p, '#textoAprova')) && await p.locator('#barraAprova.nao-ok').count() === 1);
  /* incluir um item tira o "todos reprovados" */
  await p.close(); }
{ const p = await abrir(b);
  for (const k of [0, 1, 2]) { await linha(p, k).locator('[data-acao="reprovar"]').click(); await p.fill('[data-m="' + k + '"]', 'motivo ' + k); }
  await p.fill('#revBusca', 'nylon'); await p.waitForTimeout(500); await p.locator('#revAchados [data-inc]').first().click();
  ok('7b incluir item: deixa de ser reprovação total', await p.locator('#revResumo.alerta').count() === 0 && (await p.textContent('#btnAprovar')).trim() === 'Aprovar com ajustes');
  await p.click('#revCorpo [data-tirar="0"]'); await p.waitForTimeout(100);
  ok('7b tirar o incluído volta ao alerta', await p.locator('#revCorpo tr.novo').count() === 0 && await p.locator('#revResumo.alerta').count() === 1);
  /* voltar um item para aprovado */
  await linha(p, 0).locator('[data-acao="manter"]').click(); await p.waitForTimeout(100);
  ok('7b voltar a aprovar some com o campo de motivo', await p.locator('[data-m="0"]').count() === 0 && await linha(p, 0).locator('.rev-qtd').isEnabled());
  await p.close(); }

/* 8 — Aprovar sem mexer em nada também vai por decidir_itens_mensal (sem ajustes) */
{ const p = await abrir(b);
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  const c = chamadas(p, 'decidir_itens_mensal')[0];
  ok('8 aprova sem ajuste', c && c.corpo.p_itens.length === 3 && c.corpo.p_itens.every(x => x.acao === 'manter') && c.corpo.p_novos.length === 0);
  await p.close(); }

/* 9 — Reprovar o pedido inteiro continua pelo modal (decidir_pedido) */
{ const p = await abrir(b);
  await linha(p, 0).locator('.rev-qtd').fill('3');
  await p.click('#btnReprovar'); await p.fill('#motivoReprova', 'Fora do orçamento do mês'); await p.click('#btnConfirmarReprova'); await p.waitForTimeout(400);
  const d = chamadas(p, 'decidir_pedido')[0];
  ok('9 reprovar pedido usa decidir_pedido', d && d.corpo.p_decisao === 'reprovado' && chamadas(p, 'decidir_itens_mensal').length === 0, JSON.stringify(d));
  await p.close(); }

/* 10 — erros do servidor */
{ const p = await abrir(b, { revisa: () => ({ ok: false, erro: 'versao_mudou', mensagem: 'Este pedido foi alterado.' }) });
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('10 versão mudou: pede recarregar e some com os botões', /Recarregue a página/.test(await txt(p, '#textoAprova')) && await p.locator('#btnAprovar').isHidden());
  await p.close(); }
{ let n = 0;
  const p = await abrir(b, { revisa: () => (++n === 1 ? { ok: false, erro: 'unidade_invalida', mensagem: 'Unidade "X" não existe no catálogo.' } : { ok: true, mensagem: 'Aprovado.' }) });
  await linha(p, 0).locator('.rev-qtd').fill('8');
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('10 erro: mostra a mensagem e deixa tentar de novo', /não existe no catálogo/.test(await txt(p, '#textoAprova')) && await p.locator('#btnAprovar').isEnabled() &&
     await linha(p, 0).locator('.rev-qtd').isEnabled());
  ok('10 erro: o que foi digitado continua', await linha(p, 0).locator('.rev-qtd').inputValue() === '8');
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('10 segunda tentativa passa', n === 2 && /Aprovado/.test(await txt(p, '#textoAprova')));
  await p.close(); }

/* 11 — quantidades: inválidas barram, formatos BR são lidos */
{ const p = await abrir(b);
  await linha(p, 0).locator('.rev-qtd').fill('0');
  await linha(p, 1).locator('.rev-qtd').fill('abc');
  await linha(p, 2).locator('.rev-qtd').fill('1.500');
  await p.click('#btnAprovar'); await p.waitForTimeout(200);
  ok('11 zero e texto barram', chamadas(p, 'decidir_itens_mensal').length === 0 && await p.locator('.rev-qtd.invalido').count() === 2, chamadas(p, 'decidir_itens_mensal').length + ' / ' + await p.locator('.rev-qtd.invalido').count() + ' / ' + await txt(p, '#revErro'));
  await linha(p, 0).locator('.rev-qtd').fill('2,5'); await linha(p, 1).locator('.rev-qtd').fill('4');
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  const c = chamadas(p, 'decidir_itens_mensal')[0].corpo;
  ok('11 "2,5" → 2.5 e "1.500" → 1500', c.p_itens[0].quantidade === 2.5 && c.p_itens[2].quantidade === 1500, JSON.stringify(c.p_itens));
  await p.close(); }

/* 12 — busca: resposta atrasada não sobrescreve a mais nova; falha avisa */
{ const p = await abrir(b, { busca: async (c, j) => {
      if (c.p_termo === 'vas') { await new Promise(r => setTimeout(r, 900)); return j({ ok: true, itens: [CATALOGO[1]] }); }
      if (c.p_termo === 'erro') return j({ ok: false, erro: 'token_invalido' });
      return j({ ok: true, itens: [CATALOGO[2]] }); } });
  await p.fill('#revBusca', 'vas'); await p.waitForTimeout(300);
  await p.fill('#revBusca', 'vassoura'); await p.waitForTimeout(1300);
  ok('12 vale a última busca', /VASSOURA NYLON/.test(await txt(p, '#revAchados')) && !/DETERGENTE/.test(await txt(p, '#revAchados')), await txt(p, '#revAchados'));
  await p.fill('#revBusca', 'erro'); await p.waitForTimeout(500);
  ok('12 falha da busca avisa', /Não consegui buscar/.test(await txt(p, '#revAchados')));
  await p.fill('#revBusca', 'x'); await p.waitForTimeout(400);
  ok('12 uma letra: não busca e fecha a lista', await p.locator('#revAchados').isHidden());
  await p.close(); }

/* 13 — onde NÃO aparece */
{ const p = await abrir(b, { ped: PED({ tipo_compra: 'normal' }) });
  ok('13 normal na gerencial: sem revisão', await p.locator('#cartaoRevisao').isHidden() && await p.locator('#cartaoItens').isVisible());
  await p.click('#btnAprovar'); await p.waitForTimeout(400);
  ok('13 normal aprova por decidir_pedido', chamadas(p, 'decidir_pedido').length === 1 && chamadas(p, 'decidir_itens_mensal').length === 0);
  await p.close(); }
{ const p = await abrir(b, { ped: PED({ etapa_atual: 'financeiro' }), fila: [{ id: ID, numero: 'C2610-00050', etapa_atual: 'financeiro', card_id: null }] });
  ok('13 mensal no financeiro: sem revisão', await p.locator('#cartaoRevisao').isHidden());
  await p.close(); }
{ const p = await abrir(b, { fila: [] });
  ok('13 pedido fora da fila do gerente: sem revisão', await p.locator('#cartaoRevisao').isHidden() && await p.locator('#cartaoItens').isVisible());
  await p.close(); }
{ const p = await abrir(b, { token: '' });
  ok('13 sem token (só leitura): sem revisão', await p.locator('#cartaoRevisao').isHidden());
  await p.close(); }

/* 14 — modo observador: mostra a revisão, tudo desligado */
{ const p = await abrir(b, { obs: true });
  ok('14 observador vê a revisão', await p.locator('#cartaoRevisao').isVisible() && /Modo observador/.test(await txt(p, '#revNota')));
  ok('14 tudo desligado e sem busca', await p.locator('#revCorpo input:not([disabled]), #revCorpo select:not([disabled]), #revCorpo button:not([disabled])').count() === 0 &&
     await p.locator('#revIncluir').isHidden());
  ok('14 nenhuma busca ou decisão', chamadas(p, 'buscar_item_catalogo').length + chamadas(p, 'decidir_itens_mensal').length === 0);
  await p.close(); }

/* 15 — depois da gerência: itens reprovados e mudanças à vista */
{ const itens = [{ id: 'i1', codigo: '5001', descricao: 'DETERGENTE 500ML', unidade: 'UNID', quantidade: 6, quantidade_pedida: 10, unidade_pedida: 'UNID' },
                 { id: 'i9', codigo: '5101', descricao: 'VASSOURA PIACAVA', unidade: 'UNID', quantidade: 2, incluido_por: 'a-brandao' }];
  const p = await abrir(b, { ped: PED({ etapa_atual: 'cotacao' }), itens, fila: [],
    cortados: [{ descricao: 'SABAO EM PO 1KG', quantidade: 4, unidade: 'UNID', motivo: 'tem em estoque', cortado_por: 'ALVARO BRANDAO FILHO', em: '2026-10-02T12:00:00Z' }] });
  ok('15 cartão de reprovados', await p.locator('#cartaoCortados').isVisible() && /SABAO EM PO 1KG/.test(await txt(p, '#listaCortados')) &&
     /Motivo: tem em estoque/.test(await txt(p, '#listaCortados')) && /ALVARO BRANDAO FILHO/.test(await txt(p, '#listaCortados')));
  ok('15 tabela mostra o que foi pedido', /pedido: 10 UNID/.test(await txt(p, '#corpoTabela')));
  ok('15 selo de incluído', /incluído pela gerência/.test(await txt(p, '#corpoTabela')));
  await p.close(); }
{ const p = await abrir(b, { ped: PED({ etapa_atual: 'cotacao' }), fila: [] });
  ok('15 sem cortes: sem cartão', await p.locator('#cartaoCortados').isHidden());
  await p.close(); }

/* 16 — celular: a página não rola de lado (a tabela rola dentro) */
{ const p = await abrir(b, { vw: 390 });
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('16 celular sem rolagem lateral da página', sobra <= 0, 'sobra ' + sobra + 'px');
  await p.close(); }

await b.close();
console.log(falhas.length ? '===== FALHAS (' + falhas.length + ') =====\n' + falhas.join('\n') : '===== FALHAS (0) =====');
process.exit(falhas.length ? 1 : 0);
})();
