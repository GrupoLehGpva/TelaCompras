/* Bateria da numeração das solicitações.
 *
 * O número nascia no navegador: 'SC-' + ano + Math.random entre 9.000, numa
 * coluna com UNIQUE. Pelo paradoxo do aniversário, com ~110 pedidos no ano a
 * chance de dois baterem passa de 50% — e o pedido que batesse seria recusado
 * pelo banco com a pessoa já no fim do formulário.
 *
 * Agora quem numera é o banco, em sequência: C + ano + mês + 5 dígitos.
 * Esta bateria prova as duas metades: a tela não inventa, e o que chega na
 * confirmação é o que o banco devolveu.
 */
const { chromium } = require('playwright');
const { respostaDoFormulario, respostaCriarSolicitacao } = require('./mock-supabase.js');

const url = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

const CENTROS = [{ codigo:'3180', nome:'MANUTENCAO', unidade:'AGRICULTURA SUL', tipo:'Produtivo' }];

async function abrir(b, criada){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => r.fulfill({
    status:200, contentType:'application/json',
    body: JSON.stringify(respostaDoFormulario(r.request().url(), { centros: CENTROS, criada }))
  }));
  await p.route('**n8n.cloud/**', r => r.fulfill({
    status:200, contentType:'application/json', body:'{"ok":true}' }));
  await p.goto(url, { waitUntil:'load' });
  await p.waitForTimeout(900);
  return p;
}

(async () => {
  const b = await chromium.launch();

  // 1 — a tela não numera nada
  { const p = await abrir(b);
    const mostrado = (await p.textContent('#autoNumero')).trim();
    ok('1 o resumo não mostra número inventado', mostrado === 'gerado ao enviar', 'mostrou: ' + mostrado);

    /* A regra é sobre NUMERAR pedido, não sobre sorteio em geral: desde 22/09 o
       caminho do anexo no bucket usa um sufixo aleatório quando o navegador não
       tem crypto.randomUUID, e isso é legítimo. O que não pode voltar é sorteio
       perto do número da solicitação — era dali que vinham os números repetidos. */
    const codigo = (await p.content()).replace(/<!--[\s\S]*?-->/g, '');
    const linhas = codigo.split('\n');
    const foraDoLugar = linhas
      .map((l, i) => ({ l, vizinhanca: linhas.slice(Math.max(0, i - 4), i + 3).join(' ') }))
      .filter(x => /Math\.random/.test(x.l))
      .filter(x => !/caminho|anexo|unico|uuid|randomUUID/i.test(x.vizinhanca));
    ok('1 nenhum sorteio perto do número da solicitação',
       foraDoLugar.length === 0,
       'Math.random fora do caminho do anexo: ' + foraDoLugar.map(x => x.l.trim()).join(' | ').slice(0, 200));
    ok('1 a tela não monta número nenhum',
       !/numero[^\n]{0,40}Math\.random|Math\.random[^\n]{0,40}numero/i.test(codigo),
       'voltou a inventar número no navegador');

    // duas aberturas seguidas não podem produzir dois números diferentes,
    // porque não podem produzir número nenhum
    const p2 = await abrir(b);
    const mostrado2 = (await p2.textContent('#autoNumero')).trim();
    ok('1 duas aberturas mostram a mesma coisa', mostrado === mostrado2,
       mostrado + ' vs ' + mostrado2);
    await p.close(); await p2.close(); }

  // 2 — o cabeçalho enviado ao banco não carrega número
  { const p = await abrir(b);
    let corpoEnviado = null;
    await p.route('**/rpc/criar_solicitacao', async r => {
      corpoEnviado = JSON.parse(r.request().postData() || '{}');
      await r.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify(respostaCriarSolicitacao({ numero:'C2609-00007' })) });
    });
    await preencher(p);
    await p.waitForTimeout(1200);
    ok('2 a tela chamou o banco', corpoEnviado !== null, 'não chamou criar_solicitacao');
    if(corpoEnviado){
      const cab = corpoEnviado.p_cabecalho || {};
      ok('2 o cabeçalho não manda número', !('numero' in cab),
         'mandou numero=' + JSON.stringify(cab.numero));
    }
    // 3 — e o que aparece na confirmação é o do banco
    const conf = await p.textContent('#okNumero');
    ok('3 a confirmação mostra o número do banco', /C2609-00007/.test(conf), 'veio: ' + conf);
    await p.close(); }

  // 4 — sem banco, a tela diz que não há número, em vez de inventar um
  { const p = await b.newPage();
    await p.route('**supabase.co/**', r => r.abort());
    await p.route('**n8n.cloud/**', r => r.fulfill({
      status:200, contentType:'application/json', body:'{"ok":true}' }));
    await p.goto(url, { waitUntil:'load' });
    await p.waitForTimeout(900);
    const mostrado = (await p.textContent('#autoNumero')).trim();
    ok('4 sem banco o resumo continua sem número', mostrado === 'gerado ao enviar', mostrado);
    await p.close(); }

  await b.close();

  console.log('\n===== FALHAS (' + falhas.length + ') =====');
  falhas.forEach(f => console.log(' ✗ ' + f));
  process.exit(falhas.length ? 1 : 0);
})();

/* Preenche o mínimo e envia. Mesmo caminho das outras baterias. */
async function preencher(p){
  await p.evaluate(() => {
    estado.nomeSolicitante = 'Guilherme Pimpão';
    estado.emailSolicitante = 'g@leh.com.br';
    estado.tipo = 'item';
    estado.centroCusto = '3180';
    estado.empresa = 'wienfried-pr'; estado.empresaNome = 'WIENFRIED MATTHIAS LEH - PR';
    estado.tipoCompra = 'normal';
    estado.definicaoFornecedor = 'cotacao';
    estado.dataLimite = '2026-12-31';
    estado.localEntrega = 'G103';
    estado.motivoCompra = 'prova da numeração';
    rascunho.item = { codigo:'X-1', descricao:'Item de prova', unidade:'Unidade', familia:'LIM' };
    rascunho.quantidade = 1;
    estado.itensLista = [];
  });
  await p.evaluate(() => { enviar(); });
}
