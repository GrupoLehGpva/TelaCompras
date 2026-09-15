/* Bateria do item 10 — quando quem pede é quem aprovaria.
 *
 * A liderança imediata só existe para quem NÃO é aprovador. Quem é líder,
 * gerente ou o financeiro abre pedido e o card nasce direto em cotação.
 *
 * O que esta bateria cobre é o lado da TELA: ela não pode decidir a coluna,
 * só repassar a que o banco mandou. A decisão em si é do banco e está provada
 * lá (etapa_inicial / iniciar_solicitacao / entrou_em_etapa).
 *
 * A regra que isso protege: existisse uma segunda cópia da regra aqui dentro,
 * ela ficaria errada no dia em que a do banco mudasse — e ninguém veria.
 */
const { chromium } = require('playwright');
const { respostaDoFormulario, respostaCriarSolicitacao } = require('./mock-supabase.js');

const url = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

const CENTROS = [{ codigo:'3180', nome:'MANUTENCAO', unidade:'AGRICULTURA SUL', tipo:'Produtivo' }];

/* As quatro respostas que o banco dá, uma por papel. */
const PAPEIS = [
  { papel:'comum',      coluna:'liderança imediata', pulou:false, motivo:null },
  { papel:'lider',      coluna:'compras · cotação',  pulou:true,
    motivo:'quem pediu é a própria liderança imediata' },
  { papel:'gerente',    coluna:'compras · cotação',  pulou:true,
    motivo:'quem pediu é o próprio gerente' },
  { papel:'financeiro', coluna:'compras · cotação',  pulou:true,
    motivo:'quem pediu é o próprio aprovador financeiro' }
];

async function enviar(b, resposta){
  const p = await b.newPage();
  let aoN8n = null;

  await p.route('**supabase.co/**', r => r.fulfill({
    status:200, contentType:'application/json',
    body: JSON.stringify(respostaDoFormulario(r.request().url(), { centros: CENTROS }))
  }));
  await p.route('**/rpc/criar_solicitacao', r => r.fulfill({
    status:200, contentType:'application/json',
    body: JSON.stringify(Object.assign(
      respostaCriarSolicitacao({ numero:'C2609-00099' }),
      { coluna_inicial: resposta.coluna,
        papel: resposta.papel,
        pulou_lideranca: resposta.pulou,
        motivo_do_pulo: resposta.motivo }))
  }));
  await p.route('**n8n.cloud/**', async r => {
    aoN8n = JSON.parse(r.request().postData() || '{}');
    await r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
  });

  await p.goto(url, { waitUntil:'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    estado.nomeSolicitante = 'Quem Pede';
    estado.emailSolicitante = 'quem.pede@leh.com.br';
    estado.tipo = 'item';
    estado.centroCusto = '3180';
    estado.tipoCompra = 'normal';
    estado.definicaoFornecedor = 'cotacao';
    estado.dataLimite = '2026-12-31';
    estado.localEntrega = 'G103';
    estado.motivoCompra = 'prova do item 10';
    rascunho.item = { codigo:'X-1', descricao:'Item de prova', unidade:'Unidade', familia:'LIM' };
    rascunho.quantidade = 1;
    estado.itensLista = [];
    enviar();
  });
  await p.waitForTimeout(1200);
  return { p, aoN8n };
}

(async () => {
  const b = await chromium.launch();

  for(const caso of PAPEIS){
    const { p, aoN8n } = await enviar(b, caso);
    const rot = '[' + caso.papel + ']';

    ok(rot + ' o pacote chegou ao n8n', aoN8n !== null, 'não chamou o webhook');
    if(aoN8n){
      ok(rot + ' a coluna é a que o banco mandou',
         aoN8n.coluna_inicial === caso.coluna,
         'esperava "' + caso.coluna + '", veio "' + aoN8n.coluna_inicial + '"');
      ok(rot + ' o pulo é o que o banco disse',
         aoN8n.pulou_lideranca === caso.pulou,
         'esperava ' + caso.pulou + ', veio ' + aoN8n.pulou_lideranca);
      ok(rot + ' o motivo vai junto',
         (aoN8n.motivo_do_pulo || null) === caso.motivo,
         'veio: ' + JSON.stringify(aoN8n.motivo_do_pulo));
    }
    await p.close();
  }

  /* A tela não pode ter a regra escrita dentro dela. Se o banco não disser
     nada, ela usa a coluna de sempre — e não tenta adivinhar pelo papel. */
  { const { p, aoN8n } = await enviar(b,
      { papel:undefined, coluna:undefined, pulou:undefined, motivo:undefined });
    ok('[sem resposta] cai na coluna de sempre',
       aoN8n && aoN8n.coluna_inicial === 'liderança imediata',
       'veio: ' + (aoN8n && aoN8n.coluna_inicial));
    ok('[sem resposta] não inventa pulo',
       aoN8n && aoN8n.pulou_lideranca === false,
       'veio: ' + (aoN8n && aoN8n.pulou_lideranca));
    await p.close(); }

  /* E a regra não pode estar duplicada no HTML. */
  { const fonte = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
    ok('a tela não decide papel', !/papel\s*===\s*['"](gerente|lider|financeiro)/.test(semComentarios),
       'a tela está classificando o papel por conta própria');
    ok('a tela não conhece as colunas do Kanban',
       !/compras\s*·\s*cota[çc][ãa]o/i.test(semComentarios),
       'nome de coluna do ClickUp escrito na tela'); }

  await b.close();
  console.log('\n===== FALHAS (' + falhas.length + ') =====');
  falhas.forEach(f => console.log(' ✗ ' + f));
  process.exit(falhas.length ? 1 : 0);
})();
