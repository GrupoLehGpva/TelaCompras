/* ============================================================================
   BATERIA DE CLIQUES — a tela dirigida como um usuário dirige.
   Sem atalho por evaluate para AGIR: tudo aqui é clique, digitação e seleção.
   evaluate só aparece para conferir estado e para os mocks.
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const url = 'file://' + __dirname + '/index.html';
const falhas = [], notas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

const CENTROS = [
  {codigo:'20',   nome:'FABRICA DE RAÇÕES',        unidade:'FÁBRICA DE RAÇÃO-FAN', tipo:'Produtivo'},
  {codigo:'1994', nome:'CONFINAMENTO DE BOVINOS',  unidade:'PECUÁRIA',             tipo:'Produtivo'},
  {codigo:'3176', nome:'COMERCIAL',                unidade:'ESCRITÓRIO CENTRAL',   tipo:'Não Produtivo'}
];
const FAC = [{slack_user_id:'U0BL5JPQX97', nome:'Guilherme Pimpão',
              email:'ia@leh.com.br', unidade:'Escritório Central'}];

async function tela(b, {qs='?uid=U0BL5JPQX97', webhook=200, facilitadores=FAC}={}){
  const p = await b.newPage();
  /* Quem decide o formato de cada resposta é o mock compartilhado. Antes havia
     um "se for POST, responde [{id}]" aqui — que casava tanto com o insert
     quanto com as funções, e escondia qual endereço a tela estava chamando. */
  await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(mock.respostaDoFormulario(r.request().url(), {
      centros: CENTROS, facilitador: facilitadores
    }))}));
  await p.route('**n8n.cloud/**', r => r.fulfill({status:webhook,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(url + qs, {waitUntil:'load'});
  await p.waitForTimeout(1200);
  return p;
}
const avancar = async p => { await p.click('#btnAvancar'); await p.waitForTimeout(200); };
const voltar  = async p => { await p.click('#btnVoltar');  await p.waitForTimeout(200); };
const passo   = p => p.locator('#progTexto').textContent();
const visivel = p => p.locator('.passo:not([hidden])').first().getAttribute('data-passo');
const invalidos = p => p.locator('.campo.invalido').count();

/* Escolhe na caixa de busca clicando no resultado, como a pessoa faz. */
async function buscarEClicar(p, campo, caixa, texto, alvo){
  await p.click(campo);
  await p.fill(campo, texto);
  const botao = p.locator(caixa + ' button', {hasText: new RegExp(alvo || texto, 'i')}).first();
  await botao.waitFor({state:'visible', timeout:5000});
  await botao.click();
  await p.waitForTimeout(200);
}

/* Clica em Continuar até chegar no fim, como quem só quer mandar o pedido. */
async function atéOFim(p, limite){
  for(let i=0; i<(limite||8); i++){
    const antes = await p.locator('.passo:not([hidden])').first().getAttribute('data-passo');
    if(antes === 'confirmacao') return;
    await p.click('#btnAvancar');
    await p.waitForTimeout(500);
    const depois = await p.locator('.passo:not([hidden])').first().getAttribute('data-passo');
    if(depois === antes) return;   // travou numa validação
  }
}

(async () => {
const b = await chromium.launch();

/* ==========================================================================
   1) ITEM ÚNICO — do começo ao fim, só clicando
   ========================================================================== */
/* Sai do passo do facilitador, passa pela empresa e pelo centro de custo, e
   para no item. A empresa e o centro subiram para logo depois de quem pede —
   a mesma ordem da requisicao no GR — entao quem quer testar o pedido em si
   atravessa esse passo primeiro. */
async function ateOItem(p){
  await avancar(p);                                   // solicitante -> entrega
  await p.selectOption('#empresa', { index: 1 });
  await buscarEClicar(p, '#buscaCentro', '#resultadosCentro', 'confinamento');
  await avancar(p);                                   // entrega -> item
}

let p = await tela(b);
ok('1 abre no passo 1', (await visivel(p)) === 'solicitante', 'abriu em ' + await visivel(p));
ok('1 facilitador do cadastro', (await p.inputValue('#nomeSolicitante')) === 'Guilherme Pimpão', 'veio ' + await p.inputValue('#nomeSolicitante'));
ok('1 voltar escondido no início', await p.locator('#btnVoltar').isHidden(), 'botão voltar aparece no passo 1');
ok('1 progresso', /Passo 1 de \d/.test(await passo(p)), 'progresso: ' + await passo(p));

await avancar(p);
/* Depois de quem pede vem EMPRESA E CENTRO DE CUSTO, e so entao o pedido —
   a mesma ordem da requisicao no GR. */
ok('1 chegou na empresa e centro', (await visivel(p)) === 'entrega', 'foi para ' + await visivel(p));

await avancar(p);
ok('1 barra sem empresa e sem centro',
   (await visivel(p)) === 'entrega' && (await invalidos(p)) > 0,
   'passou sem escolher empresa nem centro de custo');

await p.selectOption('#empresa', { index: 1 });
await p.waitForTimeout(150);
await avancar(p);
ok('1 barra so com a empresa', (await visivel(p)) === 'entrega',
   'passou sem o centro de custo');

await buscarEClicar(p, '#buscaCentro', '#resultadosCentro', 'confinamento');
ok('1 ficha do centro', await p.locator('#fichaCentro').isVisible(), 'ficha do centro não apareceu');
ok('1 centro certo', (await p.locator('#cCodigo').textContent()) === '1994',
   'código: ' + await p.locator('#cCodigo').textContent());

await avancar(p);
ok('1 chegou no item', (await visivel(p)) === 'item', 'foi para ' + await visivel(p));

// avançar sem escolher tipo tem que barrar
await avancar(p);
ok('1 barra sem tipo', (await visivel(p)) === 'item' && (await invalidos(p)) > 0, 'passou sem escolher o tipo');

await p.locator('#tipoOpcoes label', {hasText:'Item'}).first().click();
await p.waitForTimeout(150);
await avancar(p);
ok('1 barra sem item', (await visivel(p)) === 'item', 'passou sem escolher o item');

await p.selectOption('#familia', 'PNE');
await p.waitForTimeout(200);
await buscarEClicar(p, '#buscaItem', '#resultados', 'pneu');
ok('1 ficha do item', await p.locator('#ficha').isVisible(), 'ficha não apareceu');
const cod1 = await p.locator('#fCodigo').textContent();

// trocar item some com a ficha
await p.click('#trocarItem'); await p.waitForTimeout(200);
ok('1 trocar item limpa', !(await p.locator('#ficha').isVisible()), 'ficha continuou visível');
await buscarEClicar(p, '#buscaItem', '#resultados', 'pneu');
ok('1 reescolheu', (await p.locator('#fCodigo').textContent()) === cod1, 'código diferente ao reescolher');

await avancar(p);
ok('1 chegou na quantidade', (await visivel(p)) === 'quantidade', 'foi para ' + await visivel(p));
await avancar(p);
ok('1 barra quantidade vazia', (await visivel(p)) === 'quantidade', 'passou sem quantidade');
await p.fill('#quantidade', '0'); await avancar(p);
ok('1 barra quantidade zero', (await visivel(p)) === 'quantidade', 'passou com zero');
await p.fill('#quantidade', '4');
ok('1 unidade no plural', /Unidades/i.test(await p.locator('#unidadeMedida').textContent()), 'unidade: ' + await p.locator('#unidadeMedida').textContent());
await avancar(p);

ok('1 chegou na compra', (await visivel(p)) === 'compra', 'foi para ' + await visivel(p));
await avancar(p);
ok('1 barra sem tipo de compra', (await visivel(p)) === 'compra', 'passou sem tipo de compra');
await p.locator('#tipoCompraOpcoes label', {hasText:'Urgente'}).first().click();
await p.locator('#fornecedorOpcoes label', {hasText:'único'}).first().click();
await p.waitForTimeout(200);
ok('1 justificativa aparece', await p.locator('#blocoJustificativa').isVisible(), 'bloco da justificativa não abriu');
await avancar(p);
ok('1 barra justificativa curta', (await visivel(p)) === 'compra', 'passou sem justificar o fornecedor único');
await p.fill('#justificativaFornecedor', 'Peça original, só a concessionária fornece esta medida.');
await p.fill('#observacao', 'Combinar com o Zé antes de descarregar.');
await avancar(p);

ok('1 chegou no prazo', (await visivel(p)) === 'prazo', 'foi para ' + await visivel(p));
await avancar(p);
ok('1 barra sem data', (await visivel(p)) === 'prazo', 'passou sem data');
const futuro = new Date(Date.now() + 10*864e5).toISOString().slice(0,10);
const ontem  = new Date(Date.now() - 864e5).toISOString().slice(0,10);
await p.fill('#dataLimite', ontem); await p.fill('#motivoCompra', 'Pneu careca reprovado na inspeção');
await avancar(p);
ok('1 barra data no passado', (await visivel(p)) === 'prazo', 'aceitou data no passado');
await p.fill('#dataLimite', futuro);
ok('1 botão vira enviar', /Enviar/.test(await p.locator('#btnAvancar').textContent()), 'botão: ' + await p.locator('#btnAvancar').textContent());
await avancar(p);
await p.waitForTimeout(900);
ok('1 confirmou', (await visivel(p)) === 'confirmacao', 'não chegou na confirmação, está em ' + await visivel(p));
ok('1 sem alerta de falha', !(await p.locator('#okAviso').isVisible()), 'alarmou com o webhook OK');
/* O número que aparece aqui é o que o BANCO devolveu, não um sorteio da tela.
   O mock responde C2609-00001; se a tela voltasse a inventar o seu, este
   teste seria o primeiro a cair. */
ok('1 número na confirmação vem do banco',
   /C2609-00001/.test(await p.locator('#okNumero').textContent()),
   'veio: ' + await p.locator('#okNumero').textContent());

// recomeçar
await p.click('#btnRecomecar'); await p.waitForTimeout(400);
ok('1 recomeça no passo 1', (await visivel(p)) === 'solicitante', 'recomeçou em ' + await visivel(p));
ok('1 recomeça limpo', (await p.inputValue('#motivoCompra')) === '', 'motivo sobrou: ' + await p.inputValue('#motivoCompra'));
ok('1 facilitador continua', (await p.inputValue('#nomeSolicitante')) === 'Guilherme Pimpão', 'perdeu o facilitador ao recomeçar');
await p.close();

/* ==========================================================================
   2) VOLTAR preserva o que foi preenchido
   ========================================================================== */
p = await tela(b);
await ateOItem(p);
await p.locator('#tipoOpcoes label', {hasText:'Item'}).first().click();
await p.selectOption('#familia', 'PNE');
await buscarEClicar(p, '#buscaItem', '#resultados', 'pneu');
await avancar(p);
await p.fill('#quantidade', '7');
await avancar(p);
await voltar(p);
ok('2 voltou para quantidade', (await visivel(p)) === 'quantidade', 'voltou para ' + await visivel(p));
ok('2 quantidade preservada', (await p.inputValue('#quantidade')) === '7', 'veio ' + await p.inputValue('#quantidade'));
await voltar(p);
ok('2 voltou para item', (await visivel(p)) === 'item', 'voltou para ' + await visivel(p));
ok('2 item preservado', await p.locator('#ficha').isVisible(), 'perdeu o item ao voltar');
await voltar(p);
ok('2 voltou para empresa e centro', (await visivel(p)) === 'entrega', 'voltou para ' + await visivel(p));
ok('2 empresa preservada ao voltar', (await p.inputValue('#empresa')) !== '', 'perdeu a empresa');
await voltar(p);
ok('2 voltou para o passo 1', (await visivel(p)) === 'solicitante', 'voltou para ' + await visivel(p));
ok('2 voltar some de novo', await p.locator('#btnVoltar').isHidden(), 'botão voltar continua no passo 1');
await p.close();

/* ==========================================================================
   3) LISTA DE ITENS — adicionar, remover, travar família
   ========================================================================== */
p = await tela(b);
await ateOItem(p);
await p.locator('#tipoOpcoes label', {hasText:'Lista'}).first().click();
await p.waitForTimeout(200);
ok('3 bloco da lista', await p.locator('#blocoLista').isVisible(), 'bloco da lista não apareceu');
ok('3 lista começa vazia', await p.locator('#listaVazia').isVisible(), 'não avisou que a lista está vazia');
await avancar(p);
ok('3 barra lista vazia', (await visivel(p)) === 'item', 'passou com a lista vazia');

await p.selectOption('#familiaLista', 'LIM');
await p.waitForTimeout(200);
if(await p.locator('#btnAddItem').isDisabled() === false)
  notas.push('3 o botão "Adicionar à lista" fica habilitado antes de escolher item — efeito do MODO_DEMO ligado');
await buscarEClicar(p, '#buscaLista', '#resultadosLista', 'sabonete');
await p.fill('#qtdLista', '30');
ok('3 add habilitado', !(await p.locator('#btnAddItem').isDisabled()), 'botão continuou desabilitado');
await p.click('#btnAddItem'); await p.waitForTimeout(250);
ok('3 um item na lista', (await p.locator('#itensLista .item-linha').count()) === 1, 'itens: ' + await p.locator('#itensLista .item-linha').count());
ok('3 família travada', await p.locator('#familiaTravada').isVisible(), 'não travou a família');
ok('3 select da família bloqueado', await p.locator('#familiaLista').isDisabled(), 'dá para trocar a família com item na lista');

await buscarEClicar(p, '#buscaLista', '#resultadosLista', 'vassoura');
await p.fill('#qtdLista', '6');
await p.click('#btnAddItem'); await p.waitForTimeout(250);
ok('3 dois itens', (await p.locator('#itensLista .item-linha').count()) === 2, 'itens: ' + await p.locator('#itensLista .item-linha').count());
ok('3 um grupo de família', (await p.locator('#itensLista li.grupo-familia').count()) === 1,
   'itens da mesma família viraram grupos separados: ' + await p.locator('#itensLista li.grupo-familia').count());
ok('3 total no resumo', /2/.test(await p.locator('#totalItens').textContent()), 'total: ' + await p.locator('#totalItens').textContent());

// mesmo item de novo soma em vez de duplicar
await buscarEClicar(p, '#buscaLista', '#resultadosLista', 'vassoura');
await p.fill('#qtdLista', '4');
await p.click('#btnAddItem'); await p.waitForTimeout(250);
ok('3 repetido soma', (await p.locator('#itensLista .item-linha').count()) === 2, 'duplicou: ' + await p.locator('#itensLista .item-linha').count());
ok('3 quantidade somada', /10/.test(await p.locator('#itensLista').textContent()), 'não somou para 10');

// remover pelo ×
await p.locator('#itensLista .remover').first().click(); await p.waitForTimeout(250);
ok('3 removeu', (await p.locator('#itensLista .item-linha').count()) === 1, 'não removeu');
await p.locator('#itensLista .remover').first().click(); await p.waitForTimeout(250);
ok('3 lista vazia destrava', !(await p.locator('#familiaLista').isDisabled()), 'família continuou travada com a lista vazia');
ok('3 aviso da família some', !(await p.locator('#familiaTravada').isVisible()), 'aviso da família travada ficou na tela');
await p.close();

/* ==========================================================================
   4) ESCOPO DE SERVIÇO
   ========================================================================== */
p = await tela(b);
await ateOItem(p);
await p.locator('#tipoOpcoes label', {hasText:'serviço'}).first().click();
await p.waitForTimeout(250);
ok('4 bloco do escopo', await p.locator('#blocoServico').isVisible(), 'bloco do escopo não apareceu');
ok('4 título muda', /Escopo/.test(await p.locator('[data-passo="item"] h2').textContent()), 'título: ' + await p.locator('[data-passo="item"] h2').textContent());
await avancar(p);
ok('4 barra escopo vazio', (await visivel(p)) === 'item', 'passou sem escopo');
await p.fill('#escopoServico', 'curto');
await avancar(p);
ok('4 barra escopo curto', (await visivel(p)) === 'item', 'passou com escopo de 5 letras');
await p.fill('#escopoServico', 'Trocar as telhas quebradas do galpão de máquinas e limpar as calhas.');
await avancar(p);
ok('4 pula a quantidade', (await visivel(p)) === 'compra', 'foi para ' + await visivel(p));
ok('4 são 5 passos', /de 5/.test(await passo(p)), 'progresso: ' + await passo(p));
await p.close();

/* ==========================================================================
   5) PÁGINA ÚNICA
   ========================================================================== */
p = await tela(b);
await p.click('#verPagina'); await p.waitForTimeout(300);
const abertos = await p.locator('.passo:not([hidden])').count();
ok('5 tudo aberto', abertos >= 5, 'só ' + abertos + ' passos visíveis');
ok('5 progresso some', await p.locator('#progresso').isHidden(), 'barra de progresso continuou');
ok('5 voltar some', await p.locator('#btnVoltar').isHidden(), 'botão voltar continuou');
ok('5 botão é enviar', /Enviar/.test(await p.locator('#btnAvancar').textContent()), 'botão: ' + await p.locator('#btnAvancar').textContent());
await p.click('#btnAvancar'); await p.waitForTimeout(400);
ok('5 barra incompleto', (await invalidos(p)) > 0, 'enviou com a página vazia');
await p.click('#verPassos'); await p.waitForTimeout(300);
ok('5 volta para passos', await p.locator('#progresso').isVisible(), 'não voltou para o passo a passo');
await p.close();

/* ==========================================================================
   6) BOTÃO DE EXEMPLO
   ========================================================================== */
p = await tela(b);
ok('6 barra de demo visível', await p.locator('#demoBar').isVisible(), 'a barra de demonstração não aparece');
await p.click('#btnExemplo'); await p.waitForTimeout(600);
ok('6 preencheu o motivo', (await p.inputValue('#motivoCompra')).length > 10, 'motivo vazio');
ok('6 preencheu o centro', (await p.evaluate(()=>estado.centroCusto)).length > 0, 'centro não foi preenchido');
await atéOFim(p);
await p.waitForTimeout(600);
ok('6 exemplo envia', (await visivel(p)) === 'confirmacao', 'o exemplo não conseguiu enviar, parou em ' + await visivel(p));
await p.close();

/* ==========================================================================
   7) TECLADO E DUPLO CLIQUE
   ========================================================================== */
p = await tela(b);
await ateOItem(p);
await p.locator('#tipoOpcoes label', {hasText:'Item'}).first().click();
await p.selectOption('#familia', 'PNE');
await p.click('#buscaItem'); await p.fill('#buscaItem', 'pneu');
await p.keyboard.press('Enter'); await p.waitForTimeout(300);
ok('7 Enter não envia', (await visivel(p)) === 'item', 'Enter na busca disparou o envio');

await p.close();

// duplo clique no botão de enviar não pode gerar dois pedidos
p = await tela(b);
await p.click('#btnExemplo'); await p.waitForTimeout(600);
await atéOFim(p, 7);
let posts = 0;
p.on('request', r => { if(r.method() === 'POST' && /solicitacoes/.test(r.url())) posts++; });
/* O segundo clique pode nem acontecer: o botão vira "Enviando…" e desabilita.
   Isso é a proteção funcionando, não falha do teste. */
let segundoRecusado = false;
await Promise.all([
  p.click('#btnAvancar', {timeout:3000}).catch(()=>{ segundoRecusado = true; }),
  p.click('#btnAvancar', {force:true, timeout:3000}).catch(()=>{ segundoRecusado = true; })
]);
await p.waitForTimeout(1500);
ok('7 duplo clique conclui', (await visivel(p)) === 'confirmacao', 'não concluiu, parou em ' + await visivel(p));
ok('7 duplo clique não duplica', posts <= 1, 'gravou ' + posts + ' vezes');
if(segundoRecusado) notas.push('7 o segundo clique foi recusado pelo próprio botão (vira "Enviando…" e desabilita)');
await p.close();

/* ==========================================================================
   8) FALHA DO WEBHOOK PELO CAMINHO DE CLIQUE
   ========================================================================== */
p = await tela(b, {webhook:500});
await p.click('#btnExemplo'); await p.waitForTimeout(600);
await atéOFim(p);
await p.waitForTimeout(1000);
ok('8 avisa que não chegou', await p.locator('#okAviso').isVisible(), 'falha do webhook passou como sucesso');
ok('8 selo de alerta', (await p.locator('#okSelo').textContent()) === '!', 'manteve o ✓');
await p.close();

/* ==========================================================================
   9) TROCA DE TIPO NO MEIO DO CAMINHO
   ========================================================================== */
p = await tela(b);
await ateOItem(p);
await p.locator('#tipoOpcoes label', {hasText:'Item'}).first().click();
await p.selectOption('#familia', 'PNE');
await buscarEClicar(p, '#buscaItem', '#resultados', 'pneu');
await p.locator('#tipoOpcoes label', {hasText:'Lista'}).first().click();
await p.waitForTimeout(300);
ok('9 troca para lista', await p.locator('#blocoLista').isVisible(), 'não trocou para lista');
ok('9 esconde o item único', !(await p.locator('#blocoItem').isVisible()), 'bloco do item continuou visível');
await p.locator('#tipoOpcoes label', {hasText:'serviço'}).first().click();
await p.waitForTimeout(300);
ok('9 troca para serviço', await p.locator('#blocoServico').isVisible(), 'não trocou para serviço');
ok('9 esconde a lista', !(await p.locator('#blocoLista').isVisible()), 'bloco da lista continuou visível');
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
if(notas.length){ console.log('\n===== ATENÇÃO ====='); notas.forEach(n=>console.log(' ! ' + n)); }
})();
