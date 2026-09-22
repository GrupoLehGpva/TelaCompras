/* ============================================================================
   BATERIA DO ANEXO

   Por que este arquivo existe: até 22/09 o campo "Anexar" da tela do pedido era
   enfeite. Ele guardava o arquivo numa variável do navegador, escrevia o nome
   na lista e NUNCA mandava para lugar nenhum. O Alisson anexou um documento no
   C2609-00008 e ninguém recebeu.

   O caminho de hoje: a própria tela sobe cada arquivo para o bucket privado
   `anexos` e, no fim, chama `registrar_anexos` com os metadados. O arquivo só
   é lido por link assinado na hora do clique — nada de link fixo circulando.

   O que se prova aqui:
     1. Escolher arquivo não envia nada — o envio é do pedido.
     2. Cada arquivo vira um PUT no bucket, no caminho <solicitacao_id>/…,
        e os metadados são registrados numa chamada só, com o id DO BANCO.
     3. Tipo errado e arquivo grande demais não saem da tela.
     4. Falha no upload não derruba o pedido, e é dita com o nome do arquivo.
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

/* `aoSubir` decide o que o bucket responde, para o teste poder derrubar só ele. */
async function abrir(b, { aoSubir = null, aoRegistrar = null } = {}){
  const p = await b.newPage();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__uploads = [];      // caminhos enviados ao bucket
  p.__registros = [];    // corpos de registrar_anexos
  p.__ordem = [];

  await p.route('**supabase.co/**', async r => {
    const u = r.request().url();

    if(u.includes('/storage/v1/object/anexos/')){
      const caminho = decodeURI(u.split('/storage/v1/object/anexos/')[1]);
      p.__uploads.push({ caminho, metodo: r.request().method(),
                         tipo: (r.request().headers()['content-type'] || '') });
      p.__ordem.push('upload');
      const resp = aoSubir ? aoSubir(caminho, p.__uploads.length) : { status:200 };
      if(resp === 'abortar') return r.abort();
      return r.fulfill({ status: resp.status, contentType:'application/json', body:'{}' });
    }

    if(u.includes('/rpc/registrar_anexos')){
      let corpo = {};
      try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = {}; }
      p.__registros.push(corpo);
      p.__ordem.push('registrar');
      const resp = aoRegistrar ? aoRegistrar(corpo) : { ok:true, gravados:(corpo.p_anexos||[]).length };
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(resp) });
    }

    if(u.includes('/rpc/criar_solicitacao')) p.__ordem.push('criar_solicitacao');
    return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify(respostaDoFormulario(u,
        { centros: CENTROS, criada: respostaCriarSolicitacao({ id: ID_DO_BANCO, numero:'C2609-00042' }) })) });
  });

  await p.route('**n8n.cloud/**', r => {
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

/* 1 — sem anexo, nada muda */
{ const p = await abrir(b);
  await enviar(p);
  ok('1 sem anexo não sobe nada', p.__uploads.length === 0, 'subiu ' + p.__uploads.length);
  ok('1 sem anexo não registra nada', p.__registros.length === 0, 'registrou ' + p.__registros.length);
  const conf = await p.textContent('#okNumero');
  ok('1 confirmação normal', /C2609-00042/.test(conf), 'veio: ' + conf);
  ok('1 sem aviso de erro', await p.locator('#okAviso').isHidden(), 'avisou erro sem ter erro');
  await p.close(); }

/* 2 — escolher o arquivo NÃO envia. O envio é do pedido, não do campo. */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [arquivo('orcamento.pdf', 'application/pdf', 300)]);
  await p.waitForTimeout(300);
  ok('2 escolher não sobe', p.__uploads.length === 0, 'subiu antes de existir pedido');
  const lista = await p.textContent('#listaAnexos');
  ok('2 mostra o arquivo escolhido', /orcamento\.pdf/.test(lista), 'lista: ' + lista);
  await p.close(); }

/* 3 — dois arquivos: dois uploads e UM registro, com o id DO BANCO.
       O id é o ponto: se a tela mandar o que ela inventou, o arquivo fica solto
       no bucket e não aparece em pedido nenhum — que era o bug. */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('foto-da-peca.png', 'image/png', 120, 'P'),
    arquivo('orcamento.pdf', 'application/pdf', 200, 'O')
  ]);
  await enviar(p);

  ok('3 dois arquivos, dois uploads', p.__uploads.length === 2, 'foram ' + p.__uploads.length);
  ok('3 cada arquivo na pasta do pedido',
     p.__uploads.every(u => u.caminho.startsWith(ID_DO_BANCO + '/')),
     JSON.stringify(p.__uploads.map(u => u.caminho)));
  ok('3 caminhos diferentes entre si',
     new Set(p.__uploads.map(u => u.caminho)).size === 2, 'dois arquivos no mesmo caminho');
  ok('3 sobe com o tipo do arquivo',
     p.__uploads.some(u => u.tipo.includes('application/pdf')) &&
     p.__uploads.some(u => u.tipo.includes('image/png')),
     JSON.stringify(p.__uploads.map(u => u.tipo)));

  ok('3 registra numa chamada só', p.__registros.length === 1, 'foram ' + p.__registros.length);
  const reg = p.__registros[0] || {};
  ok('3 registra com o id do banco', reg.p_solicitacao_id === ID_DO_BANCO, String(reg.p_solicitacao_id));
  const metas = reg.p_anexos || [];
  ok('3 registra os dois', metas.length === 2, JSON.stringify(metas.map(m => m.nome)));
  ok('3 registra o nome que a pessoa vê',
     metas.map(m => m.nome).sort().join('|') === 'foto-da-peca.png|orcamento.pdf',
     JSON.stringify(metas.map(m => m.nome)));
  ok('3 registra o tamanho de verdade',
     (metas.find(m => m.nome === 'orcamento.pdf') || {}).tamanho === 200,
     JSON.stringify(metas));
  ok('3 o caminho registrado é o que subiu',
     metas.every(m => p.__uploads.some(u => u.caminho === m.caminho)),
     'registrou caminho que ninguém subiu');

  /* Ordem: o anexo só pode ir depois de o pedido existir — é o id dele que
     define a pasta — e o registro só depois dos uploads. */
  ok('3 grava o pedido antes de subir arquivo',
     p.__ordem.indexOf('criar_solicitacao') === 0, JSON.stringify(p.__ordem));
  ok('3 registra depois de subir',
     p.__ordem.lastIndexOf('upload') < p.__ordem.indexOf('registrar'), JSON.stringify(p.__ordem));
  ok('3 sem aviso de erro', await p.locator('#okAviso').isHidden(), 'avisou erro com tudo certo');
  await p.close(); }

/* 4 — o que a tela recusa antes de subir */
{ const p = await abrir(b);
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('planilha.txt', 'text/plain', 50),
    arquivo('gigante.pdf', 'application/pdf', 11 * 1024 * 1024),
    arquivo('vale.png', 'image/png', 80)
  ]);
  await p.waitForTimeout(400);
  const lista = await p.textContent('#listaAnexos');
  ok('4 avisa o tipo que não serve', /planilha\.txt/.test(lista) && /foto nem PDF/.test(lista), lista);
  ok('4 avisa o arquivo grande demais', /gigante\.pdf/.test(lista) && /10 MB/.test(lista), lista);
  await enviar(p);
  ok('4 só sobe o que passou',
     p.__uploads.length === 1 &&
     (p.__registros[0].p_anexos || []).every(m => m.nome === 'vale.png'),
     JSON.stringify({ uploads: p.__uploads.length, registros: p.__registros[0] }));
  const aviso = await p.textContent('#okAviso') || '';
  ok('4 diz quais não foram', /planilha\.txt/.test(aviso) && /gigante\.pdf/.test(aviso), 'aviso: ' + aviso);
  await p.close(); }

/* 5 — o bucket recusou um arquivo: o pedido continua de pé e a tela diz qual */
{ const p = await abrir(b, { aoSubir: (caminho, n) => n === 2 ? { status:500 } : { status:200 } });
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [
    arquivo('foto-da-peca.png', 'image/png', 60),
    arquivo('orcamento.pdf', 'application/pdf', 60)
  ]);
  await enviar(p);
  const conf = await p.textContent('#okNumero');
  ok('5 o pedido continua valendo', /C2609-00042/.test(conf), 'veio: ' + conf);
  ok('5 avisa', await p.locator('#okAviso').isVisible(), 'não avisou que o arquivo não subiu');
  const aviso = await p.textContent('#okAviso') || '';
  ok('5 nomeia o arquivo', /orcamento\.pdf/.test(aviso), 'aviso: ' + aviso);
  ok('5 registra o que subiu', (p.__registros[0].p_anexos || []).length === 1,
     JSON.stringify(p.__registros[0]));
  await p.close(); }

/* 5.1 — subiu mas não registrou: o arquivo existe e ninguém o encontra.
         É a pior das falhas, e a tela precisa dizer isso com todas as letras. */
{ const p = await abrir(b, { aoRegistrar: () => ({ ok:false, mensagem:'solicitacao_inexistente' }) });
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [arquivo('foto.png', 'image/png', 60)]);
  await enviar(p);
  const aviso = await p.textContent('#okAviso') || '';
  ok('5.1 avisa que não ficou ligado ao pedido', /não ficaram ligados ao pedido/.test(aviso), 'aviso: ' + aviso);
  ok('5.1 e manda avisar compras', /setor de compras/.test(aviso), 'aviso: ' + aviso);
  await p.close(); }

/* 5.2 — bucket fora do ar não trava o envio */
{ const p = await abrir(b, { aoSubir: () => 'abortar' });
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.setInputFiles('#anexos', [arquivo('foto.png', 'image/png', 60)]);
  await enviar(p);
  ok('5.2 chega na confirmação mesmo assim',
     /C2609-00042/.test(await p.textContent('#okNumero')), 'não concluiu');
  ok('5.2 avisa o arquivo que faltou', /foto\.png/.test(await p.textContent('#okAviso') || ''),
     'aviso sem o nome do arquivo');
  ok('5.2 não registra nada', p.__registros.length === 0, 'registrou arquivo que não subiu');
  await p.close(); }

/* 6 — a tela do pedido mostra os anexos */
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
  ok('6 cartão de anexos aparece', await p.locator('#cartaoAnexos').isVisible(), 'não apareceu');
  ok('6 lista os dois', await p.locator('#listaAnexos li').count() === 2,
     'linhas: ' + await p.locator('#listaAnexos li').count());
  const texto = await p.textContent('#listaAnexos');
  ok('6 mostra o nome', /orçamento ICAVEL\.pdf/.test(texto), texto);
  ok('6 mostra o tamanho', /2,0 MB/.test(texto) && /350 KB/.test(texto), texto);
  ok('6 diz o tipo', /PDF/.test(texto) && /FOTO/.test(texto), texto);
  /* Esta tela é de leitura: o anexo não pode virar botão que muda coisa. */
  ok('6 nenhum botão novo', await p.locator('#cartaoAnexos button').count() === 0, 'apareceu botão no cartão');
  await p.screenshot({ path:'t-anexo-pedido.png', fullPage:true });
  await p.close(); }

/* 6.1 — pedido sem anexo não mostra cartão vazio */
{ const p = await pedido(b, []);
  ok('6.1 sem anexo, sem cartão', await p.locator('#cartaoAnexos').isHidden(), 'mostrou cartão vazio');
  await p.close(); }

/* 6.2 — pedido antigo, de antes dos anexos: a resposta nem traz o campo */
{ const p = await b.newPage();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await p.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await p.route('**/rest/v1/rpc/abrir_pedido**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ok:true, pedido: SOL, itens: ITENS }) }));
  await p.goto(telaPedido + '?id=' + SOL.id, { waitUntil:'load' });
  await p.waitForTimeout(600);
  ok('6.2 pedido antigo não quebra a tela', await p.locator('#conteudo').isVisible(), 'a tela não abriu');
  ok('6.2 e não mostra cartão de anexo', await p.locator('#cartaoAnexos').isHidden(), 'mostrou cartão');
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
})();
