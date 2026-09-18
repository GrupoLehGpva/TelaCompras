/* ============================================================================
   O CATÁLOGO INTEIRO CHEGA, MESMO PASSANDO DE 1.000 ITENS

   Em 18/09, na conferência da manhã do dia da virada, o formulário publicado
   estava carregando 1.000 dos 7.084 itens. Nada tinha sido mexido nele: o
   PostgREST simplesmente para em 1.000 linhas por resposta e devolve HTTP 200,
   sem cabeçalho de aviso, sem erro, sem nada. O selo verde da tela dizia
   "1000 itens" com a confiança de quem carregou tudo.

   A busca morria em "BRACO PARALELO LINHA LONGA 210". De C a Z não existia
   nada — sabão, vassoura, pneu, ração, óleo, EPI, fertilizante. E o estrago
   não para no item sumido: quem não acha marca "fora do catálogo", e o pedido
   segue sem o código do GR, que é exatamente o que a importação do catálogo
   real existiu para evitar.

   A primeira tentativa de conserto foi pedir `limit=20000`. Continuou vindo
   1.000: o teto é do servidor, não da consulta. O conserto que valeu foi
   paginar.

   ESTA BATERIA EXISTE PORQUE A PAGINAÇÃO É CÓDIGO NOVO E CARREGA O DIA.
   Ela finge um Supabase que corta em 1.000 — igual ao de verdade — e confere
   que a tela junta as páginas até o fim. Sem ela, a paginação seria mais uma
   coisa que "parece que funciona": com 29 itens de mock, qualquer versão
   quebrada passa, porque tudo cabe na primeira página.

       node teste-catalogo-paginado.js
   ========================================================================== */
const { chromium } = require('playwright');
const url = 'file://' + __dirname + '/index.html';

const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + d);

/* O TETO do servidor. Mudar este número aqui não muda o do Supabase — ele está
   aqui para a simulação ser fiel ao que o servidor faz hoje. */
const TETO_DO_SERVIDOR = 1000;

/* Quantos itens o "banco" tem. De propósito NÃO é múltiplo do teto: com 3.000
   a última página viria exatamente cheia, e uma implementação que para na
   primeira página curta nunca seria posta à prova no caso mais traiçoeiro —
   o de a página cheia ser a última. O caso múltiplo é testado à parte. */
const TOTAL = 3457;

function catalogoFalso(quantos){
  const itens = [];
  for(let i = 0; i < quantos; i++){
    /* Descrição com prefixo numerado e largura fixa para a ordem alfabética
       ser a mesma da ordem de criação — assim dá para dizer exatamente qual
       item deveria estar em cada posição. */
    itens.push({
      codigo: String(100000 + i),
      familia: 'MM',
      descricao: 'ITEM ' + String(i).padStart(6, '0'),
      unidade: 'UNID',
      especificacao: ''
    });
  }
  return itens;
}

/* Um Supabase de mentira que se comporta como o de verdade: respeita offset,
   e CORTA em TETO_DO_SERVIDOR por mais que a consulta peça. */
function responder(url, banco){
  const q = new URL(url);
  const pedido = Number(q.searchParams.get('limit') || TETO_DO_SERVIDOR);
  const desde  = Number(q.searchParams.get('offset') || 0);
  const quanto = Math.min(pedido, TETO_DO_SERVIDOR);
  return banco.slice(desde, desde + quanto);
}

(async () => {
const b = await chromium.launch();

async function abrir(banco){
  const p = await b.newPage();
  let chamadas = 0;
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    let corpo = [];
    if(/catalogo_itens/.test(u)){ chamadas++; corpo = responder(u, banco); }
    else if(/empresas/.test(u))  corpo = [{id:'wienfried-pr', nome:'WIENFRIED MATTHIAS LEH - PR'}];
    else if(/centros_custo/.test(u)) corpo = [{codigo:'20', nome:'FABRICA', unidade:'FAN', tipo:'Produtivo'}];
    else if(/facilitadores/.test(u)) corpo = [];
    r.fulfill({status:200, contentType:'application/json', body: JSON.stringify(corpo)});
  });
  await p.route('**n8n.cloud/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(url, {waitUntil:'load'});
  await p.waitForTimeout(2500);
  return { p, chamadas: () => chamadas };
}

// --------------------------------------------------------------------------
// 1 — total que não é múltiplo do teto
const banco1 = catalogoFalso(TOTAL);
let { p, chamadas } = await abrir(banco1);

const n = await p.evaluate(() => CATALOGO.length);
ok('1 veio o catálogo inteiro', n === TOTAL, 'vieram ' + n + ' de ' + TOTAL +
   (n === TETO_DO_SERVIDOR ? ' — parou no teto do servidor, é o bug de 18/09 de volta' : ''));

ok('1 o último item existe',
   await p.evaluate(u => CATALOGO.some(i => i.descricao === u), 'ITEM ' + String(TOTAL-1).padStart(6,'0')),
   'o fim do catálogo não chegou');

ok('1 nada repetido',
   await p.evaluate(() => new Set(CATALOGO.map(i => i.codigo)).size) === TOTAL,
   'a paginação duplicou item — offset e ordem não estão casando');

ok('1 pediu em páginas', chamadas() === Math.ceil(TOTAL / TETO_DO_SERVIDOR),
   'foram ' + chamadas() + ' chamadas, esperava ' + Math.ceil(TOTAL / TETO_DO_SERVIDOR));

ok('1 o selo conta o que existe',
   /3\.?457/.test((await p.locator('#statusConexao').textContent()).replace(/\s/g,'')),
   'selo diz: ' + await p.locator('#statusConexao').textContent());

ok('1 sem alarme falso', !(await p.locator('.alerta, #alerta').first().isVisible().catch(()=>false)),
   'apareceu alerta num carregamento que deu certo');
await p.close();

// --------------------------------------------------------------------------
// 2 — total múltiplo exato do teto: a última página vem CHEIA, e mesmo assim
//     não pode sobrar nem faltar item. É o caso que quebra implementação que
//     confia só no tamanho da página.
const MULT = TETO_DO_SERVIDOR * 2;
({ p, chamadas } = await abrir(catalogoFalso(MULT)));
const n2 = await p.evaluate(() => CATALOGO.length);
ok('2 múltiplo exato do teto vem inteiro', n2 === MULT, 'vieram ' + n2 + ' de ' + MULT);
ok('2 e sem repetir', await p.evaluate(() => new Set(CATALOGO.map(i=>i.codigo)).size) === MULT,
   'duplicou na volta que veio cheia');
await p.close();

// --------------------------------------------------------------------------
// 3 — catálogo pequeno continua indo numa chamada só. A paginação não pode
//     custar viagem a mais para quem não precisa dela.
({ p, chamadas } = await abrir(catalogoFalso(12)));
ok('3 catálogo pequeno, uma chamada só', chamadas() === 1, 'foram ' + chamadas() + ' chamadas para 12 itens');
ok('3 e vieram os 12', await p.evaluate(() => CATALOGO.length) === 12, 'não vieram os 12');
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
})();
