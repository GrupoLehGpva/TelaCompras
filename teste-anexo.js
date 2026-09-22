/* ============================================================================
   BATERIA DO ANEXO

   Por que este arquivo existe: até 22/09 o campo "Anexar" da tela do pedido era
   enfeite. Ele guardava o arquivo numa variável do navegador, escrevia o nome
   na lista e NUNCA mandava para lugar nenhum — nem para o banco, nem para o
   card. O Alisson anexou um documento no C2609-00008 e ninguém recebeu.

   O que se prova aqui:
     1. Escolher arquivo não envia nada — o envio acontece com a solicitação.
     2. Cada arquivo vira uma chamada, com o id da solicitação que o BANCO deu.
     3. Tipo errado, arquivo grande demais e mais de cinco não passam da tela.
     4. Falha no upload não derruba o pedido, mas é dita, com o nome do arquivo.
     5. A tela do pedido mostra os anexos e monta o link certo.
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase.js');
const { respostaDoFormulario, respostaCriarSolicitacao } = mock;

const formulario = 'file://' + __dirname + '/index.html';
const telaPedido = 'file://' + __dirname + '/pedido.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

const CENTROS = [{ codigo:'3180', nome:'MANUTENCAO', unidade:'AGRICULTURA SUL', tipo:'Produtivo' }];
const ID_DO_BANCO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const arquivo = (name, mimeType, tamanho = 64, letra = 'A') =>
  ({ name, mimeType, buffer: Buffer.alloc(tamanho, letra) });

/* Abre o formulário com o Supabase e o n8n de mentira. `aoAnexar` decide o que
   o webhook de anexo responde, para o teste poder derrubar só ele. */
async function abrir(b, { aoAnexar = null } = {}){
  const p = await b.newPage();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__anexos = [];
  p.__ordem = [];

  await p.route('**supabase.co/**', r => {
    if(r.request().url().includes('/rpc/criar_solicitacao')) p.__ordem.push('criar_solicitacao');
    return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify(respostaDoFormulario(r.request().url(),
        { centros: CENTROS, criada: respostaCriarSolicitacao({ id: ID_DO_BANCO, numero:'C2609-00042' }) })) });
  });

  await p.route('**n8n.cloud/**', r => {
    const u = r.request().url();
    if(u.includes('anexo-do-pedido')){
      let corpo = {};
      try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = {}; }
      p.__anexos.push(corpo);
      p.__ordem.push('anexo:' + (corpo.nome || '?'));
      const resposta = aoAnexar ? aoAnexar(corpo, p.__anexos.length) : { status:200, corpo:{ ok:true, id:'anx-1' } };
      if(resposta === 'abortar') return r.abort();
      return r.fulfill({ status: resposta.status, contentType:'application/json',
                         body: JSON.stringify(resposta.corpo || {}) });
    }
    p.__ordem.push('card');
    return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
  });

  await p.goto(formulario, { waitUntil:'load' });
  await p.waitForTimeout(900);
  return p;
}

/* Preenche o mínimo e envia — mesmo caminho das outras baterias. */
async function enviar(p){
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
    estado.motivoCompra = 'prova do anexo';
    rascunho.item = { codigo:'X-1', descricao:'Item de prova', unidade:'Unidade', familia:'LIM' };
    rascunho.quantidade = 1;
    estado.itensLista = [];
  });
  await p.evaluate(() => { enviar(); });
  await p.waitForTimeout(1500);
}

(async () => {
const b = await chromium.launch();

/* 1 — sem anexo, nada muda: nenhuma chamada e nenhuma menção na confirmação */
{ const p = await abrir(b);
  await enviar(p);
  ok('1 sem anexo não chama o fluxo de anexo', p.__anexos.length === 0,
     'chamou ' + p.__anexos.length + ' vez(es)');
  const conf = await p.textContent('#okNumero');
  ok('1 confirmação não fala de anexo', !/anexo/i.test(conf), 'veio: ' + conf);
  ok('1 confirmação normal', /C2609-00042/.test(conf), 'veio: ' + conf);
  await p.close(); }

/* 2 — escolher o arquivo NÃO envia. O envio é do pedido, não do campo. */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [arquivo('orcamento.pdf', 'application/pdf', 300)]);
  await p.waitForTimeout(300);
  ok('2 escolher não envia', p.__anexos.length === 0, 'mandou arquivo antes de existir pedido');
  const lista = await p.textContent('#listaAnexos');
  ok('2 mostra o arquivo escolhido', /orcamento\.pdf/.test(lista), 'lista: ' + lista);
  ok('2 mostra o tamanho', /KB|MB/.test(lista), 'lista sem tamanho: ' + lista);
  await p.close(); }

/* 3 — dois arquivos: duas chamadas, com o id que veio do BANCO.
       O id é o ponto: se a tela mandar o que ela inventou, o arquivo entra em
       solicitação nenhuma e some de novo — que foi o bug. */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('foto-da-peca.png', 'image/png', 120, 'P'),
    arquivo('orcamento.pdf', 'application/pdf', 200, 'O')
  ]);
  await enviar(p);

  ok('3 dois arquivos, duas chamadas', p.__anexos.length === 2, 'foram ' + p.__anexos.length);
  const nomes = p.__anexos.map(a => a.nome).sort();
  ok('3 manda os dois nomes', JSON.stringify(nomes) === JSON.stringify(['foto-da-peca.png','orcamento.pdf']),
     JSON.stringify(nomes));
  ok('3 manda o id do banco', p.__anexos.every(a => a.solicitacao_id === ID_DO_BANCO),
     JSON.stringify(p.__anexos.map(a => a.solicitacao_id)));
  ok('3 manda o tipo', p.__anexos.some(a => a.mime === 'application/pdf') &&
                       p.__anexos.some(a => a.mime === 'image/png'),
     JSON.stringify(p.__anexos.map(a => a.mime)));
  const pdf = p.__anexos.find(a => a.nome === 'orcamento.pdf') || {};
  ok('3 o pdf foi mandado', !!pdf.base64, 'o arquivo não chegou ao fluxo de anexo');
  ok('3 manda o arquivo inteiro, em base64',
     Buffer.from(pdf.base64 || '', 'base64').length === 200,
     'vieram ' + Buffer.from(pdf.base64 || '', 'base64').length + ' bytes');
  ok('3 base64 sem o cabeçalho data:', !/^data:/.test(pdf.base64 || ''), (pdf.base64 || '').slice(0, 30));

  /* Ordem: o anexo só pode ir depois de o pedido existir e o card ser criado. */
  ok('3 grava o pedido antes de mandar arquivo',
     p.__ordem.indexOf('criar_solicitacao') === 0, JSON.stringify(p.__ordem));
  ok('3 cria o card antes do anexo',
     p.__ordem.indexOf('card') < p.__ordem.findIndex(x => x.startsWith('anexo:')),
     JSON.stringify(p.__ordem));

  const conf = await p.textContent('#okNumero');
  ok('3 confirmação conta os anexos', /2 de 2 anexos enviados/.test(conf), 'veio: ' + conf);
  ok('3 sem aviso de erro', await p.locator('#okAviso').isHidden(), 'avisou erro com tudo certo');
  await p.close(); }

/* 4 — o que a tela recusa antes de enviar */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('planilha.txt', 'text/plain', 50),
    arquivo('gigante.pdf', 'application/pdf', 11 * 1024 * 1024),
    arquivo('vale.png', 'image/png', 80)
  ]);
  await p.waitForTimeout(400);
  const lista = await p.textContent('#listaAnexos');
  ok('4 recusa tipo que não é foto nem PDF', /planilha\.txt/.test(lista) && /tipo não aceito/.test(lista), lista);
  ok('4 recusa acima de 10 MB', /gigante\.pdf/.test(lista) && /10 MB/.test(lista), lista);
  ok('4 mantém o que vale', /vale\.png/.test(lista), lista);
  ok('4 só um fica na fila', await p.evaluate(()=>estado.anexos.length) === 1,
     'ficaram ' + await p.evaluate(()=>estado.anexos.length));
  await enviar(p);
  ok('4 só envia o que passou', p.__anexos.length === 1 && p.__anexos[0].nome === 'vale.png',
     JSON.stringify(p.__anexos.map(a => a.nome)));
  await p.close(); }

/* 5 — mais de cinco: os cinco primeiros vão, o resto é dito em voz alta */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [1,2,3,4,5,6,7].map(n => arquivo('foto-' + n + '.png', 'image/png', 40)));
  await p.waitForTimeout(400);
  const lista = await p.textContent('#listaAnexos');
  ok('5 avisa o que ficou de fora', /foto-6\.png/.test(lista) && /5 primeiros/.test(lista), lista);
  await enviar(p);
  ok('5 envia cinco', p.__anexos.length === 5, 'foram ' + p.__anexos.length);
  await p.close(); }

/* 6 — o upload falhou: o pedido continua de pé e a tela diz QUAL arquivo faltou */
{ const p = await abrir(b, { aoAnexar: (corpo) =>
    corpo.nome === 'orcamento.pdf' ? { status:500, corpo:{ ok:false } } : { status:200, corpo:{ ok:true } } });
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('foto-da-peca.png', 'image/png', 60),
    arquivo('orcamento.pdf', 'application/pdf', 60)
  ]);
  await enviar(p);
  const conf = await p.textContent('#okNumero');
  ok('6 conta o que subiu de verdade', /1 de 2 anexos enviados/.test(conf), 'veio: ' + conf);
  ok('6 avisa', await p.locator('#okAviso').isVisible(), 'não avisou que o arquivo não subiu');
  const aviso = await p.textContent('#okAviso');
  ok('6 nomeia o arquivo', /orcamento\.pdf/.test(aviso), 'aviso: ' + aviso);
  ok('6 não acusa o que subiu', !/foto-da-peca/.test(aviso), 'aviso: ' + aviso);
  ok('6 diz que o pedido está gravado', /C2609-00042/.test(aviso) && /seguiu normalmente/.test(aviso),
     'aviso: ' + aviso);
  ok('6 o pedido continua valendo', /C2609-00042/.test(conf), 'veio: ' + conf);
  await p.close(); }

/* 6.1 — o fluxo de anexo fora do ar (nem responde) não pode travar o envio */
{ const p = await abrir(b, { aoAnexar: () => 'abortar' });
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [arquivo('foto.png', 'image/png', 60)]);
  await enviar(p);
  const conf = await p.textContent('#okNumero');
  ok('6.1 chega na confirmação mesmo assim', /C2609-00042/.test(conf), 'veio: ' + conf);
  ok('6.1 diz que nenhum subiu', /0 de 1 anexo enviado/.test(conf), 'veio: ' + conf);
  ok('6.1 avisa', /foto\.png/.test(await p.textContent('#okAviso')), 'aviso sem o nome do arquivo');
  await p.close(); }

/* 7 — a tela do pedido mostra os anexos */
const ANEXOS = [
  { id:'anx-1', nome:'orçamento ICAVEL.pdf', mime:'application/pdf', tamanho: 2 * 1024 * 1024 },
  { id:'anx-2', nome:'foto da vareta.jpg',   mime:'image/jpeg',      tamanho: 350 * 1024 }
];
const SOL = { id:'11111111-1111-1111-1111-111111111111', numero:'C2609-00008',
  solicitante:'ALISSON RICARDO KRASSUSKI', aberto_em:'2026-09-22T17:58:00Z',
  centro_custo:'3238', tipo_compra:'urgente', definicao_fornecedor:'unico',
  data_necessidade:'2026-09-29', motivo:'Leitura do nível de óleo', status:'solicitado' };
const ITENS = [{ codigo:null, descricao:'Correção do suporte da vareta', unidade:'Serviço', quantidade:1 }];

async function pedido(b, anexos){
  const p = await b.newPage({ viewport:{ width:1000, height:1000 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await mock.instalar(p, { pedido: SOL, itens: ITENS, anexos });
  await p.goto(telaPedido + '?id=' + SOL.id, { waitUntil:'load' });
  await p.waitForTimeout(600);
  return p;
}

{ const p = await pedido(b, ANEXOS);
  ok('7 cartão de anexos aparece', await p.locator('#cartaoAnexos').isVisible(), 'não apareceu');
  ok('7 lista os dois', await p.locator('#listaAnexos li').count() === 2,
     'linhas: ' + await p.locator('#listaAnexos li').count());
  const texto = await p.textContent('#listaAnexos');
  ok('7 mostra o nome', /orçamento ICAVEL\.pdf/.test(texto), texto);
  ok('7 mostra o tamanho', /2,0 MB/.test(texto) && /350 KB/.test(texto), texto);
  ok('7 diz o tipo', /PDF/.test(texto) && /FOTO/.test(texto), texto);
  const href = await p.locator('#listaAnexos a').first().getAttribute('href');
  ok('7 link vai para o fluxo do anexo', /\/webhook\/anexo\?id=anx-1$/.test(href || ''), 'link: ' + href);
  ok('7 abre em outra aba', await p.locator('#listaAnexos a').first().getAttribute('target') === '_blank',
     'sem target=_blank');
  /* Esta tela é de leitura: o anexo não pode virar botão que muda coisa. */
  ok('7 nenhum botão novo', await p.locator('#cartaoAnexos button').count() === 0, 'apareceu botão no cartão');
  await p.screenshot({ path:'t-anexo-pedido.png', fullPage:true });
  await p.close(); }

/* 7.1 — pedido sem anexo não mostra cartão vazio */
{ const p = await pedido(b, []);
  ok('7.1 sem anexo, sem cartão', await p.locator('#cartaoAnexos').isHidden(), 'mostrou cartão vazio');
  await p.close(); }

/* 7.2 — pedido antigo, de antes dos anexos: a resposta nem traz o campo */
{ const p = await b.newPage();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  /* Ordem importa: no Playwright a última rota registrada ganha, então a
     genérica entra primeiro e a específica depois. */
  await p.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await p.route('**/rest/v1/rpc/abrir_pedido**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ok:true, pedido: SOL, itens: ITENS }) }));
  await p.goto(telaPedido + '?id=' + SOL.id, { waitUntil:'load' });
  await p.waitForTimeout(600);
  ok('7.2 pedido antigo não quebra a tela', await p.locator('#conteudo').isVisible(), 'a tela não abriu');
  ok('7.2 e não mostra cartão de anexo', await p.locator('#cartaoAnexos').isHidden(), 'mostrou cartão');
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
})();
