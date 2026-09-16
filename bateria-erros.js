/* ============================================================================
   BATERIA DE ERROS — as três telas do fluxo, no que dá errado.
   As outras baterias testam o caminho feliz e as travas de preenchimento.
   Esta testa o que acontece quando o banco cai, quando a resposta vem torta,
   quando o link é montado na mão e quando o conteúdo do banco é hostil.
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const dir = 'file://' + __dirname + '/';
const falhas = [], notas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);
const nota = t => notas.push(t);

/* Resposta do Supabase controlada cenário a cenário. */
function servir(p, plano){
  return p.route('**supabase.co/**', r => {
    const u = r.request().url();
    /* A tela lê o pedido pela função abrir_pedido, não pela tabela. O cenário
       continua sendo escrito em termos de "solicitações" e "itens" — quem
       traduz para o formato da função é aqui, num lugar só. */
    /* A gravação do formulário é uma função, não um insert. O cenário continua
       sendo escrito em termos de "deu certo" ou "falhou"; quem traduz para o
       formato da função é o mock compartilhado. */
    if(u.includes('/rpc/criar_solicitacao')){
      const r2 = plano.criar !== undefined ? plano.criar : mock.respostaCriarSolicitacao();
      if(r2 === 'abort') return r.abort();
      if(r2 === 500)     return r.fulfill({status:500,contentType:'application/json',body:'{"message":"boom"}'});
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r2)});
    }
    const ehAbrirPedido = u.includes('/rpc/abrir_pedido');
    const alvo = ehAbrirPedido                     ? 'solicitacoes'
               : u.includes('solicitacao_itens')   ? 'itens'
               : u.includes('centros_custo')       ? 'centros'
               : u.includes('catalogo_itens')      ? 'catalogo'
               : u.includes('solicitacoes')        ? 'solicitacoes' : 'outro';
    let resp = plano[alvo] !== undefined ? plano[alvo] : plano.padrao;
    if(ehAbrirPedido && Array.isArray(resp)){
      const itens = Array.isArray(plano.itens) ? plano.itens : [];
      resp = resp.length ? { ok:true, pedido: resp[0], itens }
                         : { ok:false, erro:'nao_encontrada' };
    }
    if(resp === 'abort')  return r.abort();
    if(resp === 500)      return r.fulfill({status:500,contentType:'application/json',body:'{"message":"boom"}'});
    if(resp === 400)      return r.fulfill({status:400,contentType:'application/json',body:'{"code":"22P02","message":"invalid input syntax for type uuid"}'});
    if(resp === 'html')   return r.fulfill({status:200,contentType:'text/html',body:'<html>proxy</html>'});
    if(resp === 'lixo')   return r.fulfill({status:200,contentType:'application/json',body:'{ nao e json'});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(resp || [])});
  });
}

const SOL = n => [Object.assign({ id:'aaaa-1111', numero:'C2609-00001', solicitante:'Maria',
  centro_custo:'3180', data_necessidade:'2026-12-01', motivo:'teste', status:'solicitado' }, n||{})];

(async () => {
const b = await chromium.launch();

/* ==========================================================================
   A) TELA DO PEDIDO
   ========================================================================== */

// A1 — banco fora do ar: mensagem de erro, não tela em branco
let p = await b.newPage();
await servir(p, {padrao:'abort'});
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(800);
ok('A1 erro visível', await p.locator('#erro').isVisible(), 'não mostrou erro com o banco fora');
ok('A1 sem conteúdo falso', !(await p.locator('#conteudo').isVisible()), 'mostrou conteúdo sem dados');
await p.close();

// A2 — banco responde 500
p = await b.newPage(); await servir(p, {padrao:500});
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
ok('A2 erro no 500', await p.locator('#erro').isVisible(), 'engoliu o 500');
await p.close();

// A3 — id malformado: o banco devolve 400, a tela precisa explicar
p = await b.newPage(); await servir(p, {padrao:400});
await p.goto(dir + 'pedido.html?id=nao-e-uuid', {waitUntil:'load'}); await p.waitForTimeout(800);
ok('A3 erro no 400', await p.locator('#erro').isVisible(), 'não avisou do id inválido');
await p.close();

// A4 — resposta que não é JSON (proxy, portal de wifi)
p = await b.newPage(); await servir(p, {padrao:'lixo'});
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
ok('A4 erro no lixo', await p.locator('#erro').isVisible(), 'quebrou sem avisar');
await p.close();

// A5 — solicitação inexistente
p = await b.newPage(); await servir(p, {padrao:[]});
await p.goto(dir + 'pedido.html?sc=SC-9999-9999', {waitUntil:'load'}); await p.waitForTimeout(800);
const t5 = await p.locator('#erro').textContent();
ok('A5 diz não encontrada', /não encontrada/i.test(t5||''), 'texto veio: ' + (t5||'').slice(0,60));
await p.close();

// A6 — link sem parâmetro nenhum
p = await b.newPage(); await servir(p, {padrao:[]});
await p.goto(dir + 'pedido.html', {waitUntil:'load'}); await p.waitForTimeout(500);
ok('A6 link incompleto', /incompleto/i.test(await p.locator('#erro').textContent()||''), 'não explicou o link');
await p.close();

// A7 — conteúdo hostil vindo do banco
p = await b.newPage();
await servir(p, { solicitacoes: SOL({solicitante:'<img src=x onerror=alert(1)>', motivo:'<script>alert(2)</script>'}),
                  itens:[{descricao:'<b>negrito</b><img src=x onerror=alert(3)>',unidade:'Unidade',quantidade:2}],
                  centros:[] });
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
ok('A7 sem img injetada', (await p.locator('img[onerror]').count()) === 0, 'injetou HTML do banco');
ok('A7 sem script injetado', (await p.locator('#conteudo script').count()) === 0, 'injetou script do banco');
ok('A7 mostra como texto', /<b>negrito<\/b>/.test(await p.locator('#conteudo').textContent()), 'não escapou a descrição');
await p.close();

// A8 — solicitação sem itens
p = await b.newPage();
await servir(p, { solicitacoes: SOL(), itens:[], centros:[] });
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
ok('A8 abre mesmo sem itens', await p.locator('#conteudo').isVisible(), 'travou sem itens');
await p.close();

// A9 — campos nulos no banco não podem virar "null" na tela
p = await b.newPage();
await servir(p, { solicitacoes: SOL({solicitante:null,centro_custo:null,data_necessidade:null,motivo:null}),
                  itens:[{descricao:'Item',unidade:null,quantidade:null}], centros:[] });
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
const txt9 = await p.locator('#conteudo').textContent();
ok('A9 sem "null" na tela', !/\bnull\b/.test(txt9), 'apareceu null cru');
ok('A9 sem "undefined"', !/undefined/.test(txt9), 'apareceu undefined');
await p.close();

// A10 — CSV: célula que começa com sinal não pode virar fórmula no Excel
p = await b.newPage();
await servir(p, { solicitacoes: SOL(), centros:[],
  itens:[{codigo:'=1+1',descricao:'=cmd|calc',unidade:'Un',quantidade:1}] });
await p.goto(dir + 'pedido.html?id=aaaa-1111', {waitUntil:'load'}); await p.waitForTimeout(800);
const csv = await p.evaluate(()=>{
  const linhas = [['Código','Descrição','Unidade','Quantidade']]
    .concat(itensVisiveis().map(i => [i.codigo||'', i.descricao||'', i.unidade||'', String(i.quantidade||'').replace('.',',')]));
  const seguro = c => { const t = String(c); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
  return linhas.map(l => l.map(c => '"' + seguro(c).replace(/"/g,'""') + '"').join(';')).join('\r\n');
});
ok('A10 fórmula neutralizada', /"'=cmd\|calc"/.test(csv), 'CSV saiu: ' + csv.split('\r\n')[1]);
await p.close();

/* ==========================================================================
   B) TELA DA DECISÃO
   ========================================================================== */

// B1 — decisão desconhecida cai em erro, nunca em sucesso
for(const d of ['', 'sim', 'APROVADO ', 'aprovado2', '<script>']){
  p = await b.newPage(); await servir(p, {padrao:[]});
  await p.goto(dir + 'decisao.html?d=' + encodeURIComponent(d) + '&e=lider', {waitUntil:'load'});
  await p.waitForTimeout(300);
  const cls = await p.locator('#veredito.v-erro').count();
  ok('B1 d="' + d + '"', cls === 1, 'não caiu em erro');
  await p.close();
}

// B2 — link do card disfarçado
for(const u of ['https://clickup.com.evil.com/t/1','http://app.clickup.com/t/1',
                'https://evil.com/?x=app.clickup.com','//app.clickup.com/t/1','data:text/html,<b>x']){
  p = await b.newPage(); await servir(p, {padrao:[]});
  await p.goto(dir + 'decisao.html?d=aprovado&e=lider&card=' + encodeURIComponent(u), {waitUntil:'load'});
  await p.waitForTimeout(300);
  const hs = await p.locator('.acoes a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
  ok('B2 recusa ' + u.slice(0,28), !hs.some(h => (h||'').includes('evil') || (h||'').startsWith('data:') || (h||'').startsWith('http://')), 'aceitou: ' + hs.join(','));
  await p.close();
}
// e o legítimo continua passando
p = await b.newPage(); await servir(p, {padrao:[]});
await p.goto(dir + 'decisao.html?d=aprovado&e=lider&card=' + encodeURIComponent('https://app.clickup.com/t/86e32mtkd'), {waitUntil:'load'});
await p.waitForTimeout(300);
ok('B2 aceita o legítimo', (await p.locator('.acoes a').first().getAttribute('href')) === 'https://app.clickup.com/t/86e32mtkd', 'recusou link bom');
await p.close();

// B3 — banco fora do ar não pode apagar o veredito
p = await b.newPage(); await servir(p, {padrao:500});
await p.goto(dir + 'decisao.html?d=reprovado&e=financeiro&sc=C2609-00001&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(800);
ok('B3 veredito de pé', (await p.locator('#titulo').textContent()) === 'Reprovado', 'perdeu o veredito no 500');
await p.close();

// B4 — resumo com conteúdo hostil
p = await b.newPage();
await servir(p, { solicitacoes: SOL({solicitante:'<img src=x onerror=alert(1)>'}),
                  itens:[{descricao:'<img src=y onerror=alert(2)>',unidade:'Un',quantidade:1}], centros:[] });
await p.goto(dir + 'decisao.html?d=aprovado&e=lider&id=aaaa-1111', {waitUntil:'load'});
await p.waitForTimeout(800);
ok('B4 sem injeção no resumo', (await p.locator('img[onerror]').count()) === 0, 'injetou pelo resumo');
await p.close();

// B5 — parâmetro gigante não pode travar a tela
p = await b.newPage(); await servir(p, {padrao:[]});
await p.goto(dir + 'decisao.html?d=aprovado&e=lider&sc=' + 'A'.repeat(4000), {waitUntil:'load'});
await p.waitForTimeout(400);
ok('B5 aguenta parâmetro gigante', (await p.locator('#titulo').textContent()) === 'Aprovado', 'quebrou com sc gigante');
const l5 = await p.evaluate(()=>({d:document.documentElement.scrollWidth,w:window.innerWidth}));
ok('B5 sem estourar a largura', l5.d <= l5.w + 1, l5.d + ' > ' + l5.w);
await p.close();

/* ==========================================================================
   C) FORMULÁRIO
   ========================================================================== */

// C1 — catálogo respondendo 500: cai na lista local e avisa
p = await b.newPage(); await servir(p, {padrao:500});
await p.goto(dir + 'index.html', {waitUntil:'load'}); await p.waitForTimeout(1500);
ok('C1 avisa a queda', await p.locator('#alerta').isVisible(), 'não avisou o 500 do catálogo');
ok('C1 catálogo local', (await p.evaluate(()=>CATALOGO.length)) > 0, 'ficou sem catálogo');
ok('C1 centros locais', (await p.evaluate(()=>CENTROS_CUSTO.length)) > 0, 'ficou sem centro de custo');
await p.close();

// C2 — resposta que não é JSON
p = await b.newPage(); await servir(p, {padrao:'html'});
await p.goto(dir + 'index.html', {waitUntil:'load'}); await p.waitForTimeout(1500);
ok('C2 sobrevive a HTML', (await p.evaluate(()=>CATALOGO.length)) > 0, 'quebrou com resposta HTML');
await p.close();

// C3 — envio: banco aceita, mas o webhook do card falha
p = await b.newPage();
await servir(p, { catalogo:[], centros:[], padrao:[] });
await p.route('**n8n.cloud/**', r => r.fulfill({status:500,contentType:'text/plain',body:'erro'}));
await p.goto(dir + 'index.html', {waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>{
  $('nomeSolicitante').value='Teste'; $('nomeSolicitante').dispatchEvent(new Event('input'));
  $('emailSolicitante').value='ia@leh.com.br'; $('emailSolicitante').dispatchEvent(new Event('input'));
  marcarRadio('tipo','servico');
  $('escopoServico').value='Escopo de teste com tamanho mais do que suficiente para a trava.';
  $('escopoServico').dispatchEvent(new Event('input'));
  (()=>{const sel=$('empresa'); if(sel&&sel.options.length>1){sel.value=sel.options[1].value;sel.dispatchEvent(new Event('change'));}})(), escolherCentroPorTermo('manuten');
  marcarRadio('tipoCompra','normal'); marcarRadio('definicaoFornecedor','cotacao');
  const d=new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value=d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value='Motivo de teste com tamanho suficiente'; $('motivoCompra').dispatchEvent(new Event('input'));
});
await p.evaluate(()=>{ passoAtual = sequencia().length - 1; render(); });
await p.evaluate(()=>enviar());
await p.waitForTimeout(1200);
ok('C3 avisa que não chegou', await p.locator('#okAviso').isVisible(), 'a falha do webhook passou como sucesso');
ok('C3 título muda', /não chegou ao Compras/.test(await p.locator('#okTitulo').textContent()||''), 'título continuou de sucesso');
ok('C3 selo de alerta', (await p.locator('#okSelo').textContent()) === '!', 'manteve o ✓ de sucesso');
/* O aviso precisa trazer o número QUE O BANCO DEU — é com ele que a pessoa
   vai falar com o compras, já que o card não foi criado. O mock responde
   C2609-00001 (ver mock-supabase.js). */
ok('C3 diz o número que o banco deu',
   /C2609-00001/.test(await p.locator('#okAviso').textContent()||''),
   'aviso sem o número: ' + (await p.locator('#okAviso').textContent()||'').slice(0,120));
await p.close();

// C5 — webhook OK: a tela de sucesso continua sendo de sucesso
p = await b.newPage();
await servir(p, { catalogo:[], centros:[], padrao:[] });
await p.route('**/rest/v1/solicitacoes**', r => r.request().method() === 'POST'
  ? r.fulfill({status:201,contentType:'application/json',body:JSON.stringify([{id:'novo-2'}])})
  : r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await p.route('**n8n.cloud/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
await p.goto(dir + 'index.html', {waitUntil:'load'}); await p.waitForTimeout(1400);
await p.evaluate(()=>{
  $('nomeSolicitante').value='Teste'; $('nomeSolicitante').dispatchEvent(new Event('input'));
  $('emailSolicitante').value='ia@leh.com.br'; $('emailSolicitante').dispatchEvent(new Event('input'));
  marcarRadio('tipo','servico');
  $('escopoServico').value='Escopo de teste com tamanho mais do que suficiente para a trava.';
  $('escopoServico').dispatchEvent(new Event('input'));
  escolherCentroPorTermo('manuten');
  marcarRadio('tipoCompra','normal'); marcarRadio('definicaoFornecedor','cotacao');
  const d=new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value=d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value='Motivo de teste com tamanho suficiente'; $('motivoCompra').dispatchEvent(new Event('input'));
  passoAtual = sequencia().length - 1; render();
});
await p.evaluate(()=>enviar());
await p.waitForTimeout(1000);
ok('C5 sucesso sem alarme falso', !(await p.locator('#okAviso').isVisible()), 'alarmou com o webhook OK');
ok('C5 selo de sucesso', (await p.locator('#okSelo').textContent()) === '✓', 'não voltou ao ✓');
await p.close();

// C4 — parâmetros hostis na URL do formulário
p = await b.newPage(); await servir(p, {padrao:[]});
await p.goto(dir + 'index.html?nome=' + encodeURIComponent('"><img src=x onerror=alert(1)>') +
  '&uid=' + encodeURIComponent('<script>alert(2)</script>'), {waitUntil:'load'});
await p.waitForTimeout(1200);
ok('C4 sem injeção pelo nome', (await p.locator('img[onerror]').count()) === 0, 'injetou pelo ?nome');
ok('C4 sem script pelo uid', (await p.locator('body script[src]').count()) === 0, 'injetou pelo ?uid');
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
if(notas.length){ console.log('\n===== PONTOS DE ATENÇÃO ====='); notas.forEach(n=>console.log(' ! ' + n)); }
})();
