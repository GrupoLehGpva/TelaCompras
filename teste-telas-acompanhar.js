/* ============================================================================
   ACOMPANHAMENTO — CAMINHO DAS TELAS (sem ClickUp)
   Nos pedidos abertos pelas telas, enquanto a liderança não decidiu: editar
   UMA vez (conta ao clicar) e cancelar. E o histórico do pedido, com o que
   mudou e quem reprovou. Pedido do ClickUp continua só de leitura.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/acompanhar.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + (d||''));

const hoje = new Date().toISOString();
const emMin = m => new Date(Date.now() + m*60000).toISOString();
const L = (id, numero, x={}) => Object.assign({ id, numero, assunto:'Pedido ' + numero, centro_custo_nome:'FABRICA',
  total_itens:2, aberto_em:hoje, data_necessidade:'2026-12-01', etapa_atual:'lider', status:'aguardando aprovacao',
  situacao:'Esperando a liderança', com_quem:'Brandão', encerrada:false }, x);
const LISTA = () => [
  L('t1','C2609-03001'),                                                     // telas, pode editar e cancelar
  L('t2','C2609-03002', {etapa_atual:'edicao', situacao:'Encerrada'}),       // telas, em edição
  L('t3','C2609-03003'),                                                     // telas, edição já usada
  L('t4','C2609-03004', {etapa_atual:null, status:'cancelado', situacao:'Encerrada', com_quem:null, encerrada:true}),
  L('t5','C2609-03005', {etapa_atual:'gerencial', situacao:'Esperando o gerente', com_quem:'Gerente'}), // telas, já decidido pela liderança
  L('c1','C2609-01001')                                                      // ClickUp
];
const MEUS = () => ({ ok:true, facilitador:'Ana', pedidos:[
  {id:'t1', canal:'telas', versao:1, pode_editar:true,  pode_cancelar:true,  em_edicao:false, edicao_usada:false},
  {id:'t2', canal:'telas', versao:2, pode_editar:false, pode_cancelar:true,  em_edicao:true,  edicao_usada:true, edicao_expira_em:emMin(20)},
  {id:'t3', canal:'telas', versao:4, pode_editar:false, pode_cancelar:true,  em_edicao:false, edicao_usada:true},
  {id:'t4', canal:'telas', versao:3, pode_editar:false, pode_cancelar:false, em_edicao:false, edicao_usada:false},
  {id:'t5', canal:'telas', versao:5, pode_editar:false, pode_cancelar:false, em_edicao:false, edicao_usada:false},
  {id:'c1', canal:'clickup', versao:1, pode_editar:false, pode_cancelar:false, em_edicao:false}
]});
const HIST = { ok:true, linha_do_tempo:[
  {acao:'criado', etapa:null, quem:'Ana', em:'2026-09-24T12:00:00Z'},
  {acao:'edicao_iniciada', quem:'Ana', em:'2026-09-24T12:05:00Z'},
  {acao:'edicao_salva', quem:'Ana', mudou:{motivo:{antes:'a',depois:'b'}, itens:{}}, em:'2026-09-24T12:10:00Z'},
  {acao:'reprovado', etapa:'lider', quem:'<b>Brandão</b>', motivo:'Temos no estoque', em:'2026-09-24T13:00:00Z'} ]};

async function tela(b, {meus=MEUS, rpc={}}={}){
  const p = await b.newPage({viewport:{width:1280,height:1000}});
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.__rpc = [];
  await p.route('**/rest/v1/**', r => {
    const u = r.request().url();
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(!u.includes('/rpc/')) return j([]);
    const nome = u.split('/rpc/')[1].split('?')[0];
    let corpo = {}; try{ corpo = JSON.parse(r.request().postData()||'{}'); }catch(e){}
    p.__rpc.push({nome, corpo});
    if(rpc[nome]) return rpc[nome](r, corpo, j);
    if(nome === 'facilitador_do_token') return j([{id:'ana', nome:'Ana'}]);
    if(nome === 'minhas_solicitacoes') return j(LISTA());
    if(nome === 'meus_pedidos') return j(meus());
    if(nome === 'pedido_telas') return j(HIST);
    if(nome === 'iniciar_edicao') return j({ok:true, versao:2});
    if(nome === 'cancelar_pedido') return j({ok:true, mensagem:'Pedido cancelado.'});
    return j([]);
  });
  await p.goto(base + '?t=fc-ana', {waitUntil:'load'});
  await p.waitForTimeout(600);
  return p;
}
const linha = (p, n) => p.locator('tr.linha-pedido', {hasText:n}).first();
const qtas = (p, n) => p.__rpc.filter(x => x.nome === n);

(async () => {
const b = await chromium.launch();

/* 1 — o que aparece em cada linha */
{ const p = await tela(b);
  ok('1 perguntou meus_pedidos com token', qtas(p,'meus_pedidos')[0] && qtas(p,'meus_pedidos')[0].corpo.p_token === 'fc-ana');
  ok('1 t1 editar e cancelar', await linha(p,'03001').locator('button[data-acao=editar]').count() === 1 &&
     await linha(p,'03001').locator('button[data-acao=cancelar]').count() === 1);
  const t2 = await linha(p,'03002').textContent();
  ok('1 t2 em edição com você', /Em edição/.test(t2) && /com você/.test(t2), t2);
  ok('1 t2 sem prazo nem continuar (24/09: não fica parado em edição)', !/Salve até|Continuar/.test(t2), t2);
  ok('1 t2 sem botões', await linha(p,'03002').locator('button[data-acao], a.continuar').count() === 0);
  ok('1 t3 edição usada', /edição deste pedido já foi usada/.test(await linha(p,'03003').textContent()) &&
     await linha(p,'03003').locator('button[data-acao=editar]').count() === 0);
  ok('1 t5 decidido: nada', await linha(p,'03005').locator('button[data-acao]').count() === 0);
  const al = await linha(p,'03001').evaluate(tr => [...tr.children].map(td => getComputedStyle(td).textAlign));
  ok('1 motivo e centro de custo à esquerda, o resto centralizado (24/09)', al[1] === 'left' && al[2] === 'left' &&
     al.filter((x,i) => i !== 1 && i !== 2).every(x => x === 'center'), JSON.stringify(al));
  ok('1 ClickUp: nada', await linha(p,'01001').locator('button[data-acao], a.continuar').count() === 0);
  ok('1 aviso de leitura explica', /editar uma vez ou cancelar/.test(await p.textContent('#avisoLeitura')));
  /* cancelado vai para encerradas, vermelho */
  const t4 = p.locator('#corpoEncerradas tr.linha-pedido', {hasText:'03004'});
  ok('1 t4 encerrada', await t4.count() === 1);
  ok('1 t4 cancelado', /Cancelado/.test(await t4.textContent()) && await t4.locator('td.etapa-cel.nao').count() === 1);
  await p.close(); }

/* 2 — Editar: explica, conta ao clicar, leva ao formulário */
{ const p = await tela(b);
  await linha(p,'03001').locator('button[data-acao=editar]').click();
  ok('2 modal aberto', await p.locator('#fundoAcao').isVisible());
  const tx = await p.textContent('#textoAcao');
  ok('2 diz que é uma vez só', /uma vez só/.test(tx) && /30 minutos/.test(tx) && /não dá para editar de novo/.test(tx), tx);
  ok('2 sem campo de motivo', !(await p.locator('#motivoAcao').isVisible()));
  ok('2 nada chamado ainda', qtas(p,'iniciar_edicao').length === 0);
  await Promise.all([ p.waitForURL(/index\.html/, {timeout:5000}).catch(()=>{}), p.click('#btnConfirmarAcao') ]);
  const i = qtas(p,'iniciar_edicao')[0];
  ok('2 iniciar_edicao com versão', i && i.corpo.p_id === 't1' && i.corpo.p_versao === 1 && i.corpo.p_token === 'fc-ana', JSON.stringify(i));
  ok('2 foi para o formulário', /index\.html\?t=fc-ana&editar=t1$/.test(p.url()), p.url());
  await p.close(); }

/* 3 — Editar recusado: mostra o motivo e atualiza a lista */
{ const p = await tela(b, {rpc:{iniciar_edicao:(r,c,j)=>j({ok:false, erro:'fora_da_janela', mensagem:'A liderança já decidiu este pedido: não dá mais para editar.'})}});
  const antes = qtas(p,'minhas_solicitacoes').length;
  await linha(p,'03001').locator('button[data-acao=editar]').click();
  await p.click('#btnConfirmarAcao'); await p.waitForTimeout(500);
  ok('3 mostra a mensagem', await p.locator('#erroAcao').isVisible() && /já decidiu/.test(await p.textContent('#erroAcao')));
  ok('3 continua na tela', /acompanhar\.html/.test(p.url()));
  ok('3 recarregou a lista', qtas(p,'minhas_solicitacoes').length > antes);
  ok('3 não deixa insistir', await p.locator('#btnConfirmarAcao').isDisabled());
  await p.click('#btnVoltarAcao');
  ok('3 Voltar fecha', !(await p.locator('#fundoAcao').isVisible()));
  await p.close(); }

/* 4 — Cancelar: Voltar não faz nada; confirmar manda o motivo */
{ const p = await tela(b);
  await linha(p,'03001').locator('button[data-acao=cancelar]').click();
  ok('4 título', /Cancelar a solicitação/.test(await p.textContent('#tituloAcao')));
  ok('4 avisa que não desfaz', /Não dá para desfazer/.test(await p.textContent('#textoAcao')));
  ok('4 campo de motivo', await p.locator('#motivoAcao').isVisible());
  await p.click('#btnVoltarAcao');
  ok('4 Voltar não cancela', qtas(p,'cancelar_pedido').length === 0 && !(await p.locator('#fundoAcao').isVisible()));
  await linha(p,'03001').locator('button[data-acao=cancelar]').click();
  await p.fill('#motivoAcao', 'Comprei na loja da cidade');
  const antes = qtas(p,'minhas_solicitacoes').length;
  await p.click('#btnConfirmarAcao'); await p.waitForTimeout(500);
  const c = qtas(p,'cancelar_pedido')[0];
  ok('4 cancelar_pedido', c && c.corpo.p_id === 't1' && c.corpo.p_versao === 1 && c.corpo.p_motivo === 'Comprei na loja da cidade', JSON.stringify(c));
  ok('4 fecha o modal', !(await p.locator('#fundoAcao').isVisible()));
  ok('4 aviso no topo', /C2609-03001 cancelado/.test(await p.textContent('#avisoTopo')));
  ok('4 recarregou', qtas(p,'minhas_solicitacoes').length > antes);
  await p.close(); }

/* 5 — Cancelar sem motivo manda nulo; clique duplo manda uma vez */
{ const p = await tela(b, {rpc:{cancelar_pedido:(r,c,j)=> new Promise(res => setTimeout(()=>{ j({ok:true}); res(); }, 400))}});
  await linha(p,'03003').locator('button[data-acao=cancelar]').click();
  await p.click('#btnConfirmarAcao'); await p.click('#btnConfirmarAcao', {force:true}).catch(()=>{});
  ok('5 durante o envio o botão diz o que faz', /Cancelando/.test(await p.textContent('#btnConfirmarAcao')));
  await p.keyboard.press('Escape');
  ok('5 não fecha no meio do envio', await p.locator('#fundoAcao').isVisible());
  await p.waitForTimeout(700);
  const c = qtas(p,'cancelar_pedido');
  ok('5 uma chamada só', c.length === 1, 'chamadas: ' + c.length);
  ok('5 motivo nulo', c[0] && c[0].corpo.p_motivo === null && c[0].corpo.p_versao === 4);
  await p.close(); }

/* 6 — Escape e clique fora fecham */
{ const p = await tela(b);
  await linha(p,'03001').locator('button[data-acao=cancelar]').click();
  await p.keyboard.press('Escape');
  ok('6 Escape fecha', !(await p.locator('#fundoAcao').isVisible()));
  await linha(p,'03001').locator('button[data-acao=editar]').click();
  await p.mouse.click(5, 5);
  ok('6 clique fora fecha', !(await p.locator('#fundoAcao').isVisible()));
  ok('6 nada chamado', qtas(p,'iniciar_edicao').length === 0 && qtas(p,'cancelar_pedido').length === 0);
  await p.close(); }

/* 7 — Clicar no botão não abre/fecha a linha */
{ const p = await tela(b);
  await linha(p,'03001').locator('button[data-acao=editar]').click();
  await p.keyboard.press('Escape');
  ok('7 linha continua fechada', !(await p.locator('#itens-t1').isVisible()));
  await p.close(); }

/* 8 — Histórico ao abrir a linha */
{ const p = await tela(b);
  await linha(p,'03001').locator('.ver-itens').click(); await p.waitForTimeout(400);
  const h = await p.locator('#hist-t1').textContent() || '';
  ok('8 pedido_telas com token', qtas(p,'pedido_telas')[0] && qtas(p,'pedido_telas')[0].corpo.p_id === 't1');
  ok('8 aberto', /Pedido aberto/.test(h), h);
  ok('8 o que mudou', /Edição salva/.test(h) && /Mudou: motivo, itens\./.test(h), h);
  ok('8 quem reprovou e onde', /Reprovado na liderança/.test(h) && /Motivo: Temos no estoque/.test(h), h);
  ok('8 escapa nome', await p.locator('#hist-t1 li b b').count() === 0 && /<b>Brandão<\/b>/.test(h), h);
  await linha(p,'03001').locator('.ver-itens').click();
  await linha(p,'03001').locator('.ver-itens').click(); await p.waitForTimeout(200);
  ok('8 não busca de novo', qtas(p,'pedido_telas').length === 1);
  /* ClickUp não tem histórico daqui */
  await linha(p,'01001').locator('.ver-itens').click(); await p.waitForTimeout(200);
  ok('8 ClickUp sem histórico', await p.locator('#hist-c1').count() === 0 && qtas(p,'pedido_telas').length === 1);
  await p.close(); }

/* 9 — Histórico que falha não derruba a caixa */
{ const p = await tela(b, {rpc:{pedido_telas:(r)=>r.fulfill({status:500,contentType:'application/json',body:'{}'})}});
  await linha(p,'03001').locator('.ver-itens').click(); await p.waitForTimeout(400);
  ok('9 avisa', /Não consegui carregar o histórico/.test(await p.locator('#hist-t1').textContent()));
  await p.close(); }

/* 10 — meus_pedidos fora do ar: tela como sempre, sem ações */
{ const p = await tela(b, {rpc:{meus_pedidos:(r)=>r.fulfill({status:500,contentType:'application/json',body:'{}'})}});
  ok('10 lista aparece', await p.locator('tr.linha-pedido').count() === 6);
  ok('10 sem ações', await p.locator('button[data-acao], a.continuar').count() === 0);
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
