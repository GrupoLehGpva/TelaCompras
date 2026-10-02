/* ============================================================================
   FILA DE APROVAÇÃO — CAMINHO DAS TELAS (sem ClickUp)
   O que muda quando o pedido nasceu nas telas: decide direto no banco
   (decidir_pedido, com a versão), pode devolver ao comprador, e mostra o que
   está em edição pelo facilitador. Pedido do ClickUp continua indo ao n8n.
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/aprovacoes.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

const hoje = new Date().toISOString();
const FILA = () => [
  {id:'t1', numero:'C2609-02001', card_id:null, etapa_atual:'gerencial', facilitador:'Ana Paula',
   centro_custo:'20', centro_custo_nome:'FABRICA', tipo_compra:'normal', data_necessidade:'2026-12-01',
   motivo:'Rolamentos da peletizadora', aberto_em:hoje, total_itens:3, valor_cotado:'980.00', fornecedor_cotado:'ROLAMAX'},
  {id:'t2', numero:'C2609-02002', card_id:null, etapa_atual:'lider', facilitador:'Ana Paula',
   centro_custo:'20', centro_custo_nome:'FABRICA', tipo_compra:'normal', data_necessidade:'2026-12-01',
   motivo:'Luvas de proteção', aberto_em:hoje, total_itens:1},
  {id:'c1', numero:'C2609-01001', card_id:'card1', etapa_atual:'lider', facilitador:'Maria',
   centro_custo:'20', centro_custo_nome:'FABRICA', tipo_compra:'normal', data_necessidade:'2026-12-01',
   motivo:'Pedido antigo do ClickUp', aberto_em:hoje, total_itens:1}
];
const EXTRA = () => ({ ok:true,
  pedidos:[ {id:'t1', canal:'telas', versao:7, pode_devolver:true, definicao_fornecedor:'unico'},
            {id:'t2', canal:'telas', versao:3, pode_devolver:false},
            {id:'c1', canal:'clickup', versao:1, pode_devolver:false} ],
  em_edicao:[ {numero:'C2609-02009', facilitador:'Joana Lima',
               em_edicao_desde:'2026-09-24T13:10:00Z', volta_ate:'2026-09-24T13:40:00Z'} ] });

async function tela(b, {extra=EXTRA, decide=()=>({ok:true}), extraFalha=false}={}){
  const p = await b.newPage();
  p.__rpc = []; p.__n8n = []; p.__filas = 0;
  await p.route('**/rest/v1/rpc/**', r => {
    const u = r.request().url();
    const nome = u.split('/rpc/')[1].split('?')[0];
    let corpo = {}; try{ corpo = JSON.parse(r.request().postData()||'{}'); }catch(e){}
    p.__rpc.push({nome, corpo});
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(nome === 'aprovador_do_token') return j([{id:'g', nome:'Gerente', etapas:['lider','gerencial']}]);
    if(nome === 'fila_de_aprovacao'){ p.__filas++; return j(p.__fila || FILA()); }
    if(nome === 'fila_do_aprovador'){
      if(extraFalha) return r.fulfill({status:500,contentType:'application/json',body:'{"message":"x"}'});
      return j(extra());
    }
    if(nome === 'decidir_pedido') return j(decide(corpo, p));
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => {
    let c = {}; try{ c = JSON.parse(r.request().postData()||'{}'); }catch(e){}
    p.__n8n.push(c);
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  });
  await p.goto(base + '?t=ap-teste', {waitUntil:'load'});
  await p.waitForTimeout(600);
  return p;
}
const linha = (p, num) => p.locator('#corpoFila tr', {hasText:num}).first();
const decisoes = p => p.__rpc.filter(x => x.nome === 'decidir_pedido');

(async () => {
const b = await chromium.launch();

/* 1 — Devolver só aparece no pedido das telas que pode ser devolvido */
{ const p = await tela(b);
  ok('1 devolver no t1', await linha(p,'C2609-02001').locator('.btn-linha.dev').count() === 1, 'sem botão');
  ok('1 sem devolver no t2 (liderança)', await linha(p,'C2609-02002').locator('.btn-linha.dev').count() === 0, 'apareceu');
  ok('1 sem devolver no ClickUp', await linha(p,'C2609-01001').locator('.btn-linha.dev').count() === 0, 'apareceu');
  ok('1 selo fornecedor único na fila (29/09)', await linha(p,'C2609-02001').locator('.selo-unico').count() === 1 &&
     await linha(p,'C2609-02002').locator('.selo-unico').count() === 0, 'selo');
  /* 2 — caixa do que está em edição */
  ok('2 caixa em edição visível', await p.locator('#emEdicao').isVisible(), 'escondida');
  const t = await p.locator('#listaEdicao').textContent() || '';
  ok('2 caixa mostra número e facilitador', /C2609-02009/.test(t) && /Joana Lima/.test(t), t);
  ok('2 caixa diz desde quando, sem prazo (29/09)', /editando desde \d\d:\d\d/.test(t) && !/volta até/.test(t), t);
  await p.close(); }

/* 2.6 — alinhamento (01/10): Aprovar embaixo de Aprovar e Reprovar embaixo de
   Reprovar, tenha a linha o Devolver ou não */
for(const w of [1366, 1440, 1920]){
  const p = await tela(b); await p.setViewportSize({width:w, height:900}); await p.waitForTimeout(200);
  const xs = await p.evaluate(() => [...document.querySelectorAll('#corpoFila tr')].map(tr => ({
    sim: Math.round(tr.querySelector('.btn-linha.sim').getBoundingClientRect().x),
    nao: Math.round(tr.querySelector('.btn-linha.nao').getBoundingClientRect().x),
    simW: Math.round(tr.querySelector('.btn-linha.sim').getBoundingClientRect().width),
    dev: !!tr.querySelector('.btn-linha.dev') })));
  ok('2.6 ' + w + 'px tem linha com e sem Devolver', xs.some(x => x.dev) && xs.some(x => !x.dev), JSON.stringify(xs));
  ok('2.6 ' + w + 'px Aprovar alinhado', new Set(xs.map(x => x.sim)).size === 1 && new Set(xs.map(x => x.simW)).size === 1, JSON.stringify(xs));
  ok('2.6 ' + w + 'px Reprovar alinhado', new Set(xs.map(x => x.nao)).size === 1, JSON.stringify(xs));
  await p.close();
}

/* 2.5 — os três botões cabem na célula (em tela de notebook e larga) */
for(const w of [1366, 1440, 1920]){
  const p = await tela(b); await p.setViewportSize({width:w, height:900}); await p.waitForTimeout(200);
  const td = await linha(p,'C2609-02001').locator('td.acoes').boundingBox();
  for(const cls of ['sim','nao','dev']){
    const bt = await linha(p,'C2609-02001').locator('.btn-linha.' + cls).boundingBox();
    ok('2.5 ' + w + 'px ' + cls + ' dentro da célula', bt && td && bt.x >= td.x - 1 && bt.x + bt.width <= td.x + td.width + 1,
       JSON.stringify({td, bt}));
  }
  const larg = await p.evaluate(() => { const r = document.querySelector('#corpoFila').closest('.rolagem'); return r.scrollWidth - r.clientWidth; });
  if(w >= 1440) ok('2.5 ' + w + 'px sem rolagem lateral', larg <= 0, 'sobra ' + larg + 'px');
  await p.close();
}

/* 2.6 — cabeçalho: nomes centralizados, SEM linhas entre as colunas (24/09), mesma letra */
{ const p = await tela(b);
  const th = await p.evaluate(() => [...document.querySelectorAll('table.fila thead th')].map(t => {
    const c = getComputedStyle(t); return {txt:t.textContent.trim(), al:c.textAlign, borda:c.borderRightWidth, fonte:c.fontFamily}; }));
  ok('2.6 todos centralizados', th.every(t => t.al === 'center'), JSON.stringify(th.map(t => t.txt + ':' + t.al)));
  ok('2.6 sem linhas entre as colunas', th.every(t => t.borda === '0px'), JSON.stringify(th.map(t => t.borda)));
  const bt = await linha(p,'C2609-02001').evaluate(tr => [...tr.querySelectorAll('.btn-linha')].map(b => {
    const c = getComputedStyle(b); return {cls:b.className, fundo:c.backgroundColor, cor:c.color}; }));
  const fundoCard = await p.evaluate(() => getComputedStyle(document.querySelector('.rolagem')).backgroundColor);
  /* 24/09 (2ª rodada): Aprovar em verde cheio da paleta; Reprovar vermelho fechado só no
     texto e no contorno; Devolver neutro. */
  ok('2.6 Aprovar verde cheio', bt[0].fundo === 'rgb(0, 122, 83)' && bt[0].cor === 'rgb(255, 255, 255)', JSON.stringify(bt[0]));
  ok('2.6 Reprovar sem fundo, texto vermelho fechado', bt[1].fundo === fundoCard && bt[1].cor === 'rgb(158, 58, 50)', JSON.stringify(bt[1]));
  ok('2.6 Devolver neutro', bt[2].fundo === fundoCard && bt[2].cor !== bt[1].cor, JSON.stringify(bt[2]));
  ok('2.6 sem etiqueta embaixo do número', await p.locator('#corpoFila .hoje').count() === 0);
  ok('2.6 mesma letra em todos', new Set(th.map(t => t.fonte)).size === 1, JSON.stringify([...new Set(th.map(t => t.fonte))]));
  const al = await linha(p,'C2609-02001').evaluate(tr => [...tr.children].map(td => getComputedStyle(td).textAlign));
  /* 24/09: só o motivo (texto longo) à esquerda; colunas de pouco texto centralizadas */
  ok('2.6 motivo à esquerda, o resto centralizado', al[2] === 'left' &&
     al.filter((x,i) => i !== 2).every(x => x === 'center'), JSON.stringify(al));
  await p.close(); }

/* 3 — sem nada em edição, a caixa some */
{ const p = await tela(b, {extra:()=>Object.assign(EXTRA(), {em_edicao:[]})});
  ok('3 caixa escondida sem edição', !(await p.locator('#emEdicao').isVisible()), 'apareceu vazia');
  await p.close(); }

/* 4 — Aprovar pedido das telas vai ao banco com a versão, não ao n8n */
{ const p = await tela(b);
  await linha(p,'C2609-02001').locator('.btn-linha.sim').click();
  await p.waitForTimeout(500);
  const d = decisoes(p);
  ok('4 chamou decidir_pedido', d.length === 1, 'chamadas: ' + d.length);
  ok('4 mandou id, versão e decisão', d[0] && d[0].corpo.p_id === 't1' && d[0].corpo.p_versao === 7 &&
     d[0].corpo.p_decisao === 'aprovado' && d[0].corpo.p_token === 'ap-teste', JSON.stringify(d[0]));
  ok('4 não foi ao n8n', p.__n8n.length === 0, 'n8n: ' + p.__n8n.length);
  ok('4 aviso de aprovada', /Solicitação aprovada\./.test(await p.locator('#avisoTopo').textContent()||''), 'sem aviso');
  ok('4 linha saiu da fila', await linha(p,'C2609-02001').count() === 0, 'continua');
  await p.close(); }

/* 5 — Pedido do ClickUp continua indo ao n8n */
{ const p = await tela(b);
  await linha(p,'C2609-01001').locator('.btn-linha.sim').click();
  await p.waitForTimeout(500);
  ok('5 ClickUp foi ao n8n', p.__n8n.length === 1 && p.__n8n[0].card_id === 'card1', JSON.stringify(p.__n8n));
  ok('5 ClickUp não chamou decidir_pedido', decisoes(p).length === 0, 'chamou');
  await p.close(); }

/* 6 — Reprovar das telas: motivo obrigatório e vai junto */
{ const p = await tela(b);
  await linha(p,'C2609-02002').locator('.btn-linha.nao').click();
  ok('6 modal abriu como reprovar', /Reprovar solicitação/.test(await p.locator('#tituloModal').textContent()||''), 'título errado');
  ok('6 nota fala do histórico', /histórico do pedido/.test(await p.locator('#notaMotivo').textContent()||''), 'nota fala de card');
  await p.click('#btnConfirmarReprova');
  ok('6 motivo vazio barrado', await p.locator('#erroMotivo').isVisible(), 'não barrou');
  ok('6 nada enviado sem motivo', decisoes(p).length === 0, 'enviou');
  await p.fill('#motivoReprova', 'Temos luvas no almoxarifado da granja');
  await p.click('#btnConfirmarReprova');
  await p.waitForTimeout(500);
  const d = decisoes(p)[0];
  ok('6 reprovado com motivo e versão', d && d.corpo.p_decisao === 'reprovado' && d.corpo.p_versao === 3 &&
     /almoxarifado/.test(d.corpo.p_motivo), JSON.stringify(d));
  ok('6 aviso de reprovada', /Solicitação reprovada\./.test(await p.locator('#avisoTopo').textContent()||''), 'sem aviso');
  await p.close(); }

/* 7 — Devolver ao comprador */
{ const p = await tela(b);
  await linha(p,'C2609-02001').locator('.btn-linha.dev').click();
  ok('7 título devolver', /Devolver ao comprador/.test(await p.locator('#tituloModal').textContent()||''), 'título');
  ok('7 rótulo devolver', /O que o comprador precisa rever/.test(await p.locator('#rotuloMotivo').textContent()||''), 'rótulo');
  ok('7 botão diz Devolver', (await p.locator('#btnConfirmarReprova').textContent()||'').trim() === 'Devolver', 'botão');
  ok('7 nota fala da Mesa', /Mesa de Cotação/.test(await p.locator('#notaMotivo').textContent()||''), 'nota');
  await p.fill('#motivoReprova', 'curto');
  await p.click('#btnConfirmarReprova');
  ok('7 motivo curto barrado com texto de devolução', /o que precisa ser revisto/.test(await p.locator('#erroMotivo').textContent()||''), 'texto');
  await p.fill('#motivoReprova', 'Frete do fornecedor 2 está alto, negociar');
  await p.click('#btnConfirmarReprova');
  await p.waitForTimeout(500);
  const d = decisoes(p)[0];
  ok('7 enviou devolvido', d && d.corpo.p_decisao === 'devolvido' && d.corpo.p_versao === 7, JSON.stringify(d));
  ok('7 aviso de devolvida', /devolvida ao comprador/.test(await p.locator('#avisoTopo').textContent()||''), 'sem aviso');
  ok('7 não foi ao n8n', p.__n8n.length === 0, 'foi');
  await p.close(); }

/* 8 — Cancelar a caixa volta ao modo reprovar na próxima */
{ const p = await tela(b);
  await linha(p,'C2609-02001').locator('.btn-linha.dev').click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  if(await p.locator('#fundoModal').isVisible()) await p.locator('#fundoModal button', {hasText:/Cancelar|Voltar/}).first().click();
  await linha(p,'C2609-02001').locator('.btn-linha.nao').click();
  ok('8 reabriu como reprovar', /Reprovar solicitação/.test(await p.locator('#tituloModal').textContent()||'') &&
     (await p.locator('#btnConfirmarReprova').textContent()||'').trim() === 'Reprovar', 'ficou em devolver');
  await p.close(); }

/* 9 — Versão mudou (o facilitador editou): recusa, recarrega a fila */
{ const p = await tela(b, {decide:(c, pg)=>{ pg.__fila = FILA().filter(s=>s.id!=='t1');
    return {ok:false, erro:'versao_mudou', mensagem:'O pedido mudou desde que você abriu a fila.'}; }});
  const antes = p.__filas;
  await linha(p,'C2609-02001').locator('.btn-linha.sim').click();
  await p.waitForTimeout(600);
  const av = await p.locator('#avisoTopo').textContent() || '';
  ok('9 avisa a recusa com a mensagem do banco', /Não consegui registrar/.test(av) && /mudou desde/.test(av), av);
  ok('9 recarregou a fila', p.__filas > antes, 'não recarregou');
  ok('9 linha some depois de recarregar', await linha(p,'C2609-02001').count() === 0, 'continua');
  await p.close(); }

/* 10 — Aprovação em lote mistura os dois caminhos certo */
{ const p = await tela(b);
  await linha(p,'C2609-02002').locator('input[type=checkbox]').check();
  await linha(p,'C2609-01001').locator('input[type=checkbox]').check();
  await p.click('#btnLote');
  await p.waitForTimeout(700);
  ok('10 telas pelo banco', decisoes(p).length === 1 && decisoes(p)[0].corpo.p_id === 't2', JSON.stringify(decisoes(p)));
  ok('10 ClickUp pelo n8n', p.__n8n.length === 1 && p.__n8n[0].solicitacao_id === 'c1', JSON.stringify(p.__n8n));
  ok('10 aviso de 2 aprovadas', /2 solicitações aprovadas/.test(await p.locator('#avisoTopo').textContent()||''), 'aviso');
  await p.close(); }

/* 11 — Se fila_do_aprovador falhar, a tela segue como antes (tudo pelo n8n) */
{ const p = await tela(b, {extraFalha:true});
  ok('11 fila aparece', await p.locator('#conteudo').isVisible() && await p.locator('#corpoFila tr').count() === 3, 'sem fila');
  ok('11 sem devolver', await p.locator('.btn-linha.dev').count() === 0, 'apareceu');
  ok('11 sem caixa de edição', !(await p.locator('#emEdicao').isVisible()), 'apareceu');
  await p.close(); }

/* 12 — Resposta estranha do banco (ok:false no extra) também não quebra */
{ const p = await tela(b, {extra:()=>({ok:false, erro:'token_invalido'})});
  ok('12 fila aparece', await p.locator('#corpoFila tr').count() === 3, 'sem fila');
  ok('12 sem devolver', await p.locator('.btn-linha.dev').count() === 0, 'apareceu');
  await p.close(); }

/* 13 — Número vindo do banco não vira HTML na caixa de edição */
{ const p = await tela(b, {extra:()=>Object.assign(EXTRA(), {em_edicao:[{numero:'<img src=x onerror=window.__x=1>', facilitador:'<b>x</b>'}]})});
  ok('13 escapa HTML', await p.locator('#listaEdicao img').count() === 0 && await p.evaluate(()=>!window.__x), 'injetou');
  await p.close(); }

/* Selos do piloto (29/09): urgente (telas e ClickUp) e editado pelo solicitante */
{ const p = await b.newPage();
  const fila = FILA(); fila[2].tipo_compra = 'urgente';
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(nome === 'aprovador_do_token') return j([{id:'g', nome:'Gerente', etapas:['lider','gerencial']}]);
    if(nome === 'fila_de_aprovacao') return j(fila);
    if(nome === 'fila_do_aprovador') return j({ ok:true, pedidos:[
      {id:'t1', canal:'telas', versao:7, pode_devolver:true, definicao_fornecedor:'unico'},
      {id:'t2', canal:'telas', versao:3, pode_devolver:false, urgente:true, editado:true},
      {id:'c1', canal:'clickup', versao:1}], em_edicao:[] });
    return j([]);
  });
  await p.goto(base + '?t=ap-teste', {waitUntil:'load'}); await p.waitForTimeout(600);
  ok('9 urgente das telas marcado', await linha(p,'C2609-02002').locator('.selo-urgente').count() === 1, 'sem selo');
  ok('9 urgente do ClickUp marcado', await linha(p,'C2609-01001').locator('.selo-urgente').count() === 1, 'sem selo');
  ok('9 normal sem selo urgente', await linha(p,'C2609-02001').locator('.selo-urgente').count() === 0, 'selo sobrando');
  ok('9 editado marcado', await linha(p,'C2609-02002').locator('.selo-editado').count() === 1 &&
     await linha(p,'C2609-02001').locator('.selo-editado').count() === 0, 'selo editado');
  ok('9 fornecedor único continua', await linha(p,'C2609-02001').locator('.selo-unico').count() === 1, 'sumiu');
  await p.close(); }

/* Fila compartilhada do financeiro (29/09): aviso na fila e quem decidiu no histórico */
async function telaFin(b, {grupo, hist}){
  const p = await b.newPage();
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(nome === 'aprovador_do_token') return j([{id:'isabela', nome:'ISABELA CANESIN', etapas:['financeiro']}]);
    if(nome === 'fila_de_aprovacao') return j([FILA()[0]]);
    if(nome === 'fila_do_aprovador') return j({ ok:true, pedidos:[{id:'t1', canal:'telas', versao:7, pode_devolver:true}], em_edicao:[],
      fila_compartilhada: grupo ? 'financeiro' : null, compartilhada_com: grupo ? ['ELISANGELA G. B. KLOSTER','WIENFRIED MATTHIAS LEH'] : [] });
    if(nome === 'historico_do_aprovador' || nome === 'historico_de_aprovacoes') return j(hist);
    return j([]);
  });
  await p.goto(base + '?t=ap-teste', {waitUntil:'load'}); await p.waitForTimeout(600);
  return p;
}
const H = (numero, fui_eu, por, resposta='aprovado') => ({ id:'h-'+numero, numero, etapa:'financeiro', resposta, motivo: resposta==='aprovado'?null:'x',
  decidido_em:hoje, aberto_em:hoje, facilitador:'Ana', centro_custo_nome:'FABRICA', situacao:'aprovado · liberado para compra', decidido_por:por, fui_eu });
{ const p = await telaFin(b, { grupo:true, hist:[H('C2609-03001', false, 'WIENFRIED MATTHIAS LEH'), H('C2609-03002', true, 'ISABELA CANESIN'), H('C2609-03003', false, 'ELISANGELA G. B. KLOSTER', 'devolvido')] });
  ok('10 aviso de fila compartilhada', await p.locator('#filaGrupo').isVisible() && /Elisangela e Wienfried também veem/.test(await p.textContent('#filaGrupo')), await p.textContent('#filaGrupo'));
  await p.click('#abaHist'); await p.waitForTimeout(500);
  ok('10 coluna vira "Decisão"', (await p.textContent('#thDecisao')).trim() === 'Decisão', await p.textContent('#thDecisao'));
  const l1 = await p.locator('#corpoHist tr', {hasText:'03001'}).textContent();
  const l2 = await p.locator('#corpoHist tr', {hasText:'03002'}).textContent();
  await p.click('#abaRep'); await p.waitForTimeout(200);
  const l3 = await p.locator('#corpoHist tr', {hasText:'03003'}).textContent();
  ok('10 decisão de outra pessoa mostra o nome', /Aprovada\s*por WIENFRIED MATTHIAS LEH/.test(l1), l1);
  ok('10 a própria diz "por você"', /por você/.test(l2), l2);
  ok('10 devolução aparece como Devolvida', /Devolvida\s*por ELISANGELA/.test(l3), l3);
  await p.close(); }
{ const p = await telaFin(b, { grupo:false, hist:[H('C2609-03001', true, 'ISABELA CANESIN')] });
  ok('11 fora da fila compartilhada, sem aviso', !(await p.locator('#filaGrupo').isVisible()));
  await p.click('#abaHist'); await p.waitForTimeout(500);
  ok('11 coluna continua "Sua decisão", sem "por"', (await p.textContent('#thDecisao')).trim() === 'Sua decisão' &&
     !/por /.test(await p.locator('#corpoHist tr').first().textContent()));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
