/* ============================================================================
   BATERIA DA TELA DO COMPRADOR — reprovar-compra.html

   Uma tela com uma ação só merece um teste que cubra a ação inteira e, com o
   mesmo cuidado, tudo o que deve IMPEDIR a ação: link sem token, token que o
   banco não reconhece, pedido que já saiu da cotação, motivo curto, rede caída,
   clique duplo.

   O caso que deu origem a tudo isto: em 24/09 o comprador arrastou o card da
   C2609-00012 para "reprovado" porque faltava um item. Arrastar não avisa
   ninguém e não grava motivo. Estas baterias existem para que o caminho torto
   não precise existir de novo.
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const ARQ = 'file:///home/claude/TelaCompras/reprovar-compra.html';
const falhas = [];
const ok = (c,cond,det='') => { if(!cond) falhas.push(c + (det?' — '+det:'')); };

const SOL = {
  id:'11111111-1111-1111-1111-111111111111', numero:'C2609-00042',
  card_id:'card-1',
  solicitante:'maria@leh.com.br', solicitante_nome:'Maria de Souza',
  facilitador:'ALISSON RICARDO KRASSUSKI',
  aberto_em:'2026-09-24T13:04:00Z', centro_custo:'CC-103-MOR',
  tipo_compra:'normal', definicao_fornecedor:'cotacao',
  data_necessidade:'2026-10-15', motivo:'Reposição mensal da casa dos moradores',
  observacao:'Entregar na portaria.',
  empresa_id:'wienfried-pr', empresa_nome:'WIENFRIED MATTHIAS LEH - PR',
  status:'em cotacao', etapa_atual:'cotacao'
};
const ITENS = [
  {codigo:'7360', descricao:'SABAO EM PO 1KG', unidade:'UNID', quantidade:30},
  {codigo:'7335', descricao:'VASSOURA NYLON COM CABO', unidade:'UNID', quantidade:6},
  {codigo:null,   descricao:'RACAO INICIAL SUINOS', unidade:'kg', quantidade:4000}
];
const ANEXOS = [{nome:'orcamento-vetquest.pdf', url:'https://exemplo/vetquest.pdf'}];

const SIM = mock.respostaComprador({ numero: SOL.numero, card_id: 'card-1' });

async function abrir(b, {permissao=SIM, decisao={ok:true}, token='tk-herisson',
                        id=SOL.id, demora=0, sol=SOL}={}){
  const p = await b.newPage({viewport:{width:1000,height:1000}});
  p.__chamadas = [];
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await mock.instalar(p, { pedido: sol, itens: ITENS, anexos: ANEXOS, fila: [], permissao });
  await p.route('**n8n.cloud/**', r => {
    let corpo = {};
    try { corpo = JSON.parse(r.request().postData() || '{}'); }
    catch(e){ corpo = { __sem_corpo: r.request().url() }; }
    p.__chamadas.push(corpo);
    if(decisao === 'cai') return r.abort();
    const responder = () => r.fulfill({status:200, contentType:'application/json',
                                       body: JSON.stringify(decisao)});
    if(demora) return new Promise(res => setTimeout(()=>{ responder(); res(); }, demora));
    return responder();
  });
  const url = ARQ + (id ? '?id=' + id : '?') + (token ? '&t=' + token : '');
  await p.goto(url, {waitUntil:'load'});
  await p.waitForTimeout(700);
  return p;
}

(async ()=>{
const b = await chromium.launch();

// 1 — o pedido inteiro aparece, para a decisão não ser no escuro
{ const p = await abrir(b);
  ok('1 abre o conteúdo', await p.locator('#conteudo').isVisible(), 'a tela não abriu');
  const ficha = await p.textContent('#ficha');
  ok('1 traz o número', /C2609-00042/.test(ficha), ficha.slice(0,200));
  ok('1 traz quem pediu', /Maria de Souza/.test(ficha), ficha.slice(0,200));
  ok('1 traz o facilitador', /ALISSON/.test(ficha), ficha.slice(0,200));
  ok('1 centro legível', /Casa dos moradores/.test(ficha), ficha.slice(0,300));
  ok('1 empresa na ficha', /WIENFRIED MATTHIAS LEH - PR/.test(ficha), ficha.slice(0,300));
  ok('1 prazo em pt-BR', /15\/10\/2026/.test(ficha), ficha);
  ok('1 motivo do pedido', /Reposição mensal/.test(ficha), ficha.slice(0,400));
  const linhas = await p.locator('#corpoItens tr').count();
  ok('1 três itens', linhas === 3, 'linhas=' + linhas);
  const tabela = await p.textContent('#corpoItens');
  ok('1 item sem código não some', /RACAO INICIAL SUINOS/.test(tabela), tabela.slice(0,300));
  /* 4000 e não 4.000,000: o número que o comprador vai cotar tem que bater com
     o que a pessoa digitou. Foi um arredondamento de tela que custou uma tarde. */
  ok('1 quantidade inteira sem enfeite', /4\.000(?!,)/.test(tabela), tabela.slice(0,400));
  ok('1 unidade concorda', /unidades/i.test(tabela) || /UNID/.test(tabela), tabela.slice(0,300));
  ok('1 anexo de quem pediu aparece', await p.locator('#cartaoAnexos').isVisible(), 'anexo sumiu');
  ok('1 leva ao pedido completo',
     /pedido\.html\?id=11111111/.test(await p.locator('#verCompleto').getAttribute('href')||''),
     'link: ' + await p.locator('#verCompleto').getAttribute('href'));
  /* O link para o pedido completo NÃO pode levar o token junto: ele abre numa
     aba nova e vira histórico, favorito, print de tela. */
  ok('1 pedido completo vai sem token',
     !/[?&]t=/.test(await p.locator('#verCompleto').getAttribute('href')||''),
     'o token vazou no link do pedido completo');
  await p.screenshot({path:'t-reprovar-compra.png', fullPage:true});
  await p.close(); }

// 2 — a porta abre, e só para um lado
{ const p = await abrir(b);
  ok('2 barra aparece', await p.locator('#barraAprova').isVisible(), 'sem barra');
  ok('2 tem reprovar', await p.locator('#btnReprovar').isVisible(), 'sem o botão');
  ok('2 pergunta antes de mandar reprovar',
     /deve seguir/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  /* Não existe botão de aprovar nesta tela, em nenhum estado. Aprovar é da
     alçada — se um dia aparecer um, este teste quebra. */
  ok('2 não existe botão de aprovar',
     (await p.locator('#barraAprova button').count()) === 1,
     'botões na barra: ' + await p.locator('#barraAprova button').count());
  await p.close(); }

// 3 — reprovar sem motivo não existe
{ const p = await abrir(b);
  await p.click('#btnReprovar'); await p.waitForTimeout(250);
  ok('3 caixa abre', await p.locator('#fundoModal').isVisible(), 'caixa não abriu');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
  ok('3 sem motivo não passa', p.__chamadas.length === 0, 'reprovou sem motivo');
  ok('3 sem motivo avisa', await p.locator('#erroMotivo').isVisible(), 'não explicou');
  await p.fill('#motivoReprova', 'curto');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(250);
  ok('3 motivo curto não passa', p.__chamadas.length === 0, 'reprovou com motivo curto');
  await p.close(); }

// 4 — o caminho feliz, e o que vai no corpo do POST
{ const p = await abrir(b);
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  await p.fill('#motivoReprova', 'Falta o item de ração que deveria vir junto nesta compra.');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(700);
  const c = p.__chamadas[0] || {};
  ok('4 manda uma vez só', p.__chamadas.length === 1, 'chamadas: ' + p.__chamadas.length);
  ok('4 vai como reprovado', c.decisao === 'reprovado', 'decisao: ' + c.decisao);
  ok('4 vai na etapa da cotação', c.etapa === 'cotacao', 'etapa: ' + c.etapa);
  ok('4 leva o token do comprador', c.token === 'tk-herisson', 'token: ' + c.token);
  ok('4 leva o card certo', c.card_id === 'card-1', 'card: ' + c.card_id);
  ok('4 leva a solicitação certa', c.solicitacao_id === SOL.id, 'id: ' + c.solicitacao_id);
  ok('4 leva o motivo inteiro', /ração que deveria vir junto/.test(c.motivo||''), 'motivo: ' + c.motivo);
  /* POST, não query string: o token e o motivo não podem virar log nem Referer. */
  ok('4 não mandou nada por query', !('__sem_corpo' in c), 'foi por query: ' + JSON.stringify(c));
  const t = await p.locator('#textoBarra').textContent() || '';
  ok('4 confirma na tela', /Compra reprovada\./.test(t), 'texto: ' + t);
  ok('4 diz o que acontece agora', /recebeu o aviso/.test(t), 'texto: ' + t);
  ok('4 botão some depois', !(await p.locator('#btnReprovar').isVisible()), 'dava para reprovar de novo');
  await p.close(); }

// 5 — o que a tela mostra ENQUANTO o servidor não respondeu
{ const p = await abrir(b, {demora:1500});
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  await p.fill('#motivoReprova', 'Já temos esse material em estoque na Granja 103.');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(350);
  const t = await p.locator('#textoBarra').textContent() || '';
  ok('5 avisa que está reprovando', /Reprovando a compra/.test(t), 'texto: ' + t);
  ok('5 mostra a rodinha', await p.locator('#textoBarra .girando').count() === 1, 'sem sinal de movimento');
  ok('5 botão escondido', !(await p.locator('#btnReprovar').isVisible()), 'dava para clicar de novo');
  await p.waitForTimeout(1600);
  ok('5 vira resultado', /Compra reprovada\./.test(await p.locator('#textoBarra').textContent()||''),
     'ficou preso: ' + await p.locator('#textoBarra').textContent());
  await p.close(); }

// 6 — clique duplo manda uma vez só
{ const p = await abrir(b, {demora:600});
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  await p.fill('#motivoReprova', 'Pedido duplicado: já foi comprado na semana passada.');
  await Promise.all([ p.click('#btnConfirmarReprova'), p.click('#btnConfirmarReprova') ])
    .catch(()=>{});
  await p.waitForTimeout(1200);
  ok('6 duplo clique manda uma vez', p.__chamadas.length === 1, 'chamadas: ' + p.__chamadas.length);
  await p.close(); }

// 7 — Esc e Cancelar fecham sem decidir
for(const modo of ['esc','cancelar']){
  const p = await abrir(b);
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  if(modo === 'esc') await p.keyboard.press('Escape'); else await p.click('#btnCancelar');
  await p.waitForTimeout(250);
  ok('7 fecha por ' + modo, !(await p.locator('#fundoModal').isVisible()), 'caixa ficou aberta');
  ok('7 ' + modo + ' não decide', p.__chamadas.length === 0, 'decidiu ao fechar');
  ok('7 ' + modo + ' mantém o botão', await p.locator('#btnReprovar').isVisible(), 'perdeu o botão');
  await p.close();
}

// 8 — o banco diz não: pedido já saiu da cotação
{ const p = await abrir(b, {permissao: mock.respostaComprador({ok:false})});
  ok('8 avisa', await p.locator('#barraAprova').isVisible(), 'não avisou nada');
  ok('8 sem botão', !(await p.locator('#btnReprovar').isVisible()), 'deixou reprovar assim mesmo');
  ok('8 explica o porquê', /não está na cotação/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  ok('8 o pedido continua legível', await p.locator('#conteudo').isVisible(), 'escondeu o pedido junto');
  await p.close(); }

// 9 — token que o banco não reconhece
{ const p = await abrir(b, {permissao: {ok:false, erro:'token_invalido',
                                        mensagem:'Este link de aprovação não vale mais.'}});
  ok('9 sem botão', !(await p.locator('#btnReprovar').isVisible()), 'deixou reprovar com token inválido');
  ok('9 explica', /não vale mais/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  await p.close(); }

/* 9b — token VÁLIDO, mas de quem não é comprador.
   Este é o caso que um teste só de ok:false não pega: o banco responde ok,
   porque o token existe e a pessoa decide em alguma etapa — só que não nesta.
   Sem conferir `so_reprova`, a tela daria o botão a um aprovador. */
{ const p = await abrir(b, {permissao: {ok:true, papel:'aprovador', so_reprova:false,
    aprovador:'a-brandao', aprovador_nome:'ALVARO BRANDAO FILHO',
    numero:SOL.numero, card_id:'card-1', etapa:'gerencial', fluxo:'padrao'}});
  ok('9b aprovador não reprova por aqui', !(await p.locator('#btnReprovar').isVisible()),
     'deu o botão do comprador para um aprovador');
  ok('9b avisa quem abriu', /não pode reprovar/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  await p.close(); }

// 10 — link sem token nenhum: a tela não finge que dá
{ const p = await abrir(b, {token:''});
  ok('10 não abre o conteúdo', !(await p.locator('#conteudo').isVisible()), 'abriu sem saber quem é');
  ok('10 diz o que fazer', /DM do Slack/.test(await p.textContent('#falha')||''),
     'texto: ' + await p.textContent('#falha'));
  ok('10 sem barra', !(await p.locator('#barraAprova').isVisible()), 'ofereceu decisão sem token');
  await p.close(); }

// 11 — link sem id
{ const p = await abrir(b, {id:''});
  ok('11 avisa link incompleto', /Link incompleto/.test(await p.textContent('#falha')||''),
     'texto: ' + await p.textContent('#falha'));
  await p.close(); }

// 12 — o endpoint recusa, e o botão volta para tentar de novo
{ const p = await abrir(b, {decisao:{ok:false, mensagem:'esta solicitação já foi decidida'}});
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  await p.fill('#motivoReprova', 'Item já comprado por outro pedido nesta semana.');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(700);
  ok('12 recusa avisa', /já foi decidida/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  ok('12 recusa devolve o botão',
     await p.evaluate(()=>!document.getElementById('btnReprovar').disabled), 'botão travado');
  await p.close(); }

// 13 — rede fora do ar no meio do clique
{ const p = await abrir(b, {decisao:'cai'});
  await p.click('#btnReprovar'); await p.waitForTimeout(200);
  await p.fill('#motivoReprova', 'Fornecedor não entrega nesse prazo; refazer o pedido.');
  await p.click('#btnConfirmarReprova'); await p.waitForTimeout(900);
  ok('13 rede caiu avisa', /Não consegui registrar/.test(await p.locator('#textoBarra').textContent()||''),
     'texto: ' + await p.locator('#textoBarra').textContent());
  ok('13 rede caiu devolve o botão',
     await p.evaluate(()=>!document.getElementById('btnReprovar').disabled), 'botão travado');
  await p.close(); }

// 14 — celular: aprovador e comprador decidem do telefone
{ const p = await b.newPage({viewport:{width:390,height:844}});
  await mock.instalar(p, { pedido: SOL, itens: ITENS, anexos: ANEXOS, fila: [], permissao: SIM });
  await p.goto(ARQ + '?id=' + SOL.id + '&t=tk-herisson', {waitUntil:'load'});
  await p.waitForTimeout(700);
  ok('14 botão visível no celular', await p.locator('#btnReprovar').isVisible(), 'botão sumiu no celular');
  const cx = await p.evaluate(()=> document.documentElement.scrollWidth > window.innerWidth + 2);
  ok('14 sem rolagem lateral na página', !cx, 'a página rolou para o lado');
  await p.screenshot({path:'t-reprovar-compra-celular.png', fullPage:true});
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
})();
