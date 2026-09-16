/* Bateria da empresa no pedido de compras.
 *
 * No GR a requisição pede Empresa logo abaixo do solicitante, antes do centro
 * de custos. São seis pessoas jurídicas — três titulares × dois estados.
 *
 * Duas coisas aqui não são detalhe:
 *
 * 1. A lista vem do BANCO, nunca escrita na tela. Se a tela tivesse a lista
 *    dentro dela, cadastrar uma empresa nova viraria um deploy.
 *
 * 2. Os nomes vão com o espaçamento EXATO do GR — 'LEH-PI' sem espaços,
 *    'LEH - PR' com. Um dia um robô vai casar essa opção na tela do ERP pelo
 *    texto; "arrumar" o espaçamento aqui é entregar a ele uma string que não
 *    existe lá.
 */
const { chromium } = require('playwright');
const { respostaDoFormulario, respostaCriarSolicitacao, EMPRESAS_EXEMPLO } = require('./mock-supabase.js');

const url = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));
const CENTROS = [{ codigo:'3180', nome:'MANUTENCAO', unidade:'AGRICULTURA SUL', tipo:'Produtivo' }];

async function abrir(b, empresas){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => r.fulfill({
    status:200, contentType:'application/json',
    body: JSON.stringify(respostaDoFormulario(r.request().url(), { centros: CENTROS, empresas }))
  }));
  await p.route('**n8n.cloud/**', r => r.fulfill({
    status:200, contentType:'application/json', body:'{"ok":true}' }));
  await p.goto(url, { waitUntil:'load' });
  await p.waitForTimeout(900);
  return p;
}

(async () => {
  const b = await chromium.launch();

  // 1 — a lista é a do banco, na ordem e com o texto exatos
  { const p = await abrir(b);
    const opcoes = await p.$$eval('#empresa option',
      os => os.slice(1).map(o => ({ id:o.value, nome:o.textContent })));
    ok('1 seis empresas', opcoes.length === 6, 'vieram ' + opcoes.length);
    ok('1 na ordem do banco',
       JSON.stringify(opcoes.map(o => o.id)) === JSON.stringify(EMPRESAS_EXEMPLO.map(e => e.id)),
       JSON.stringify(opcoes.map(o => o.id)));
    ok('1 texto exato, espaçamento incluído',
       JSON.stringify(opcoes.map(o => o.nome)) === JSON.stringify(EMPRESAS_EXEMPLO.map(e => e.nome)),
       JSON.stringify(opcoes.map(o => o.nome)));
    /* O caso que mais fácil se estraga "arrumando": um sem espaços, um com. */
    ok('1 o par irregular sobreviveu',
       opcoes[0].nome === 'ELKE MONIKA ZUBER LEH-PI' &&
       opcoes[1].nome === 'ELKE MONIKA ZUBER LEH - PR',
       opcoes[0].nome + ' | ' + opcoes[1].nome);
    await p.close(); }

  // 2 — a tela não carrega a lista por dentro
  { const fonte = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
    ok('2 nenhum nome de empresa escrito na tela',
       !/ZUBER LEH|RAINER MATHIAS|MATTHIAS LEH/.test(semComentarios),
       'a lista de empresas está dentro do HTML'); }

  // 3 — a empresa é obrigatória, e o passo é o segundo
  { const p = await abrir(b);
    await p.evaluate(() => {
      $('nomeSolicitante').value='Guilherme'; $('nomeSolicitante').dispatchEvent(new Event('input'));
      $('emailSolicitante').value='ia@leh.com.br'; $('emailSolicitante').dispatchEvent(new Event('input'));
    });
    await p.click('#btnAvancar'); await p.waitForTimeout(200);
    ok('3 empresa e centro vêm logo depois de quem pede',
       (await p.textContent('#progTitulo')) === 'Empresa e centro de custo',
       'foi para: ' + await p.textContent('#progTitulo'));
    await p.click('#btnAvancar'); await p.waitForTimeout(200);
    const barrou = await p.$eval('[data-campo="empresa"]', e => e.classList.contains('invalido'));
    ok('3 sem empresa não passa', barrou, 'deixou passar sem empresa');
    await p.close(); }

  // 4 — a empresa escolhida chega ao n8n, e com o nome para o card
  { const p = await abrir(b);
    let aoN8n = null;
    await p.route('**/rpc/criar_solicitacao', r => r.fulfill({
      status:200, contentType:'application/json',
      body: JSON.stringify(Object.assign(respostaCriarSolicitacao({ numero:'C2609-00050' }),
        { coluna_inicial:'liderança imediata', empresa_id:'rainer-pi',
          empresa_nome:'RAINER MATHIAS LEH - PI' }))
    }));
    await p.route('**n8n.cloud/**', async r => {
      aoN8n = JSON.parse(r.request().postData() || '{}');
      await r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
    });
    await p.evaluate(() => {
      estado.nomeSolicitante='Guilherme'; estado.emailSolicitante='ia@leh.com.br';
      estado.tipo='item'; estado.centroCusto='3180'; estado.tipoCompra='normal';
      estado.definicaoFornecedor='cotacao'; estado.dataLimite='2026-12-31';
      estado.localEntrega='G103'; estado.motivoCompra='prova da empresa';
      const sel=$('empresa'); sel.value='rainer-pi'; sel.dispatchEvent(new Event('change'));
      rascunho.item={codigo:'X-1',descricao:'Item',unidade:'Unidade',familia:'LIM'};
      rascunho.quantidade=1; estado.itensLista=[];
      enviar();
    });
    await p.waitForTimeout(1300);
    ok('4 chamou o n8n', aoN8n !== null, 'não chamou');
    if(aoN8n){
      ok('4 o id da empresa vai junto', aoN8n.empresa_id === 'rainer-pi',
         'veio: ' + aoN8n.empresa_id);
      ok('4 o nome também, para o card', aoN8n.empresa_nome === 'RAINER MATHIAS LEH - PI',
         'veio: ' + aoN8n.empresa_nome);
      ok('4 o card mostra a empresa',
         /\*\*Empresa:\*\* RAINER MATHIAS LEH - PI/.test(aoN8n.descricao_card || ''),
         'linha ausente na descrição do card');
      ok('4 a empresa vem antes do centro de custo no card',
         (aoN8n.descricao_card||'').indexOf('**Empresa:**') <
         (aoN8n.descricao_card||'').indexOf('**Centro de custo:**'),
         'ordem trocada');
    }
    await p.close(); }

  // 5 — banco sem empresas: avisa e não deixa a caixa clicável à toa
  { const p = await abrir(b, []);
    const n = await p.$$eval('#empresa option', os => os.length);
    ok('5 só o placeholder', n === 1, 'opções: ' + n);
    ok('5 caixa desabilitada', await p.$eval('#empresa', e => e.disabled),
       'caixa clicável sem nenhuma empresa para escolher');
    ok('5 avisou', await p.locator('#alerta').isVisible(), 'não avisou que a lista está vazia');
    await p.close(); }

  await b.close();
  console.log('\n===== FALHAS (' + falhas.length + ') =====');
  falhas.forEach(f => console.log(' ✗ ' + f));
  process.exit(falhas.length ? 1 : 0);
})();
