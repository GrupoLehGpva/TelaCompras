/* Facilitador vindo do Slack, solicitante opcional e observação do pedido. */
const { chromium } = require('playwright');
const url = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

async function abrir(b, qs, facilitadores){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    if(u.includes('facilitador')){
      if(facilitadores === 404) return r.fulfill({status:404,contentType:'application/json',body:'{}'});
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(facilitadores || [])});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.goto(url + (qs||''), {waitUntil:'load'});
  await p.waitForTimeout(1300);
  return p;
}
const FAC = [{slack_user_id:'U0BL5JPQX97', nome:'Guilherme Pimpão',
              email:'IA@Leh.com.BR', unidade:'Escritório Central'}];
const arquivoComTrava = (()=>{
  const fs = require('fs');
  const orig = fs.readFileSync(__dirname + '/index.html','utf8');
  const alterado = orig.replace('const EXIGIR_FACILITADOR = false;','const EXIGIR_FACILITADOR = true;');
  if(alterado === orig) throw new Error('não achei a constante EXIGIR_FACILITADOR para o teste da trava');
  fs.writeFileSync('/tmp/index-trava.html', alterado);
  return 'file:///tmp/index-trava.html';
})();
async function abrirComTrava(b, qs, facilitadores){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    if(u.includes('facilitador'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(facilitadores||[])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.goto(arquivoComTrava + (qs||''), {waitUntil:'load'});
  await p.waitForTimeout(1300);
  return p;
}
const preencher = p => p.evaluate(()=>{
  marcarRadio('tipo','servico');
  $('escopoServico').value = 'Escopo de teste com tamanho mais do que suficiente para a trava.';
  $('escopoServico').dispatchEvent(new Event('input'));
  escolherCentroPorTermo('manuten');
  marcarRadio('tipoCompra','normal'); marcarRadio('definicaoFornecedor','cotacao');
  const d = new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value = d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value = 'Motivo de teste com tamanho suficiente';
  $('motivoCompra').dispatchEvent(new Event('input'));
});
const pacote = p => p.evaluate(()=>montarPacote(null, {
  numero:'C2609-00001', solicitante: estado.nomeSolicitante,
  centro_custo: estado.centroCusto, tipo_compra:'normal', definicao_fornecedor:'cotacao',
  justificativa_fornecedor:null, data_necessidade:'2026-12-01', motivo:'teste'
}, [{codigo:'X',descricao:'Serviço',unidade:'Serviço',quantidade:1,foraCatalogo:false}]));

(async () => {
const b = await chromium.launch();

// 1 — o link do Slack preenche nome e e-mail
let p = await abrir(b, '?nome=' + encodeURIComponent('Guilherme Pimpão') +
  '&email=' + encodeURIComponent('IA@Leh.com.BR ') + '&uid=U0BL5JPQX97');
ok('1 nome preenchido', (await p.inputValue('#nomeSolicitante')) === 'Guilherme Pimpão', 'veio ' + await p.inputValue('#nomeSolicitante'));
ok('1 e-mail preenchido', (await p.inputValue('#emailSolicitante')) === 'ia@leh.com.br', 'veio "' + await p.inputValue('#emailSolicitante') + '"');
ok('1 aviso do Slack', await p.locator('#veioDoSlack').isVisible(), 'não avisou de onde veio');
ok('1 aviso fala dos dois', /Nome e e-mail/.test(await p.locator('#veioDoSlack').textContent()), 'texto do aviso: ' + await p.locator('#veioDoSlack').textContent());
ok('1 estado do e-mail', (await p.evaluate(()=>estado.emailSolicitante)) === 'ia@leh.com.br', 'estado não acompanhou');
ok('1 nome travado', await p.evaluate(()=>$('nomeSolicitante').readOnly) === true, 'nome ficou editável');
ok('1 e-mail travado', await p.evaluate(()=>$('emailSolicitante').readOnly) === true, 'e-mail ficou editável');
ok('1 digitar não muda', await (async()=>{
  await p.locator('#nomeSolicitante').fill('Outra Pessoa').catch(()=>{});
  return (await p.inputValue('#nomeSolicitante')) === 'Guilherme Pimpão';
})(), 'deu para trocar o nome do facilitador');
ok('1 selo do Slack', (await p.locator('#ajudaNome .travado-nota').count()) === 1, 'sem o selo "do Slack" no nome');
ok('1 aviso explica a trava', /não podem ser alterados/.test(await p.locator('#veioDoSlack').textContent()||''),
   'aviso não explica: ' + await p.locator('#veioDoSlack').textContent());

// 2 — os dois campos novos existem e nascem vazios
ok('2 campo solicitante', await p.locator('#solicitanteNome').isVisible(), 'campo do solicitante não apareceu');
ok('2 solicitante vazio', (await p.inputValue('#solicitanteNome')) === '', 'nasceu preenchido');
await p.evaluate(()=>{ passoAtual = sequencia().indexOf('compra'); render(); });
ok('2 campo observação', await p.locator('#observacao').isVisible(), 'campo de observação não apareceu');
ok('2 observação fora do item', await p.locator('[data-passo="compra"] #observacao').count() === 1, 'observação não está no passo do fornecedor');
await p.close();

// 2b — só o nome vindo do Slack: o aviso muda de texto
{ const q = await abrir(b, '?nome=Teste');
  ok('2b aviso parcial', /preencha abaixo/.test(await q.locator('#veioDoSlack').textContent()||''),
     'aviso não avisou que falta o e-mail: ' + await q.locator('#veioDoSlack').textContent());
  ok('2b nome travado', await q.evaluate(()=>$('nomeSolicitante').readOnly) === true, 'nome do Slack ficou editável');
  ok('2b e-mail livre', await q.evaluate(()=>$('emailSolicitante').readOnly) === false,
     'travou o e-mail que não veio do Slack — a tela fica intransponível');
  await q.close(); }

// 3 — sem link do Slack, nada preenchido e nenhum aviso
p = await abrir(b, '');
ok('3 sem aviso', !(await p.locator('#veioDoSlack').isVisible()), 'avisou sem ter vindo do Slack');
ok('3 nome vazio', (await p.inputValue('#nomeSolicitante')) === '', 'nasceu preenchido');
ok('3 email vazio', (await p.inputValue('#emailSolicitante')) === '', 'nasceu preenchido');
ok('3 nada travado', await p.evaluate(()=>!$('nomeSolicitante').readOnly && !$('emailSolicitante').readOnly),
   'travou campo que não veio do Slack');
await p.close();

// 4 — solicitante e observação são opcionais: envia sem eles
p = await abrir(b, '?nome=Teste&email=ia@leh.com.br');
await preencher(p);
await p.evaluate(()=>{ passoAtual = sequencia().length - 1; render(); });
const passou = await p.evaluate(()=>podeEnviar());
ok('4 envia sem os opcionais', passou === true, 'a validação barrou sem solicitante/observação');
ok('4 solicitante sem erro', (await p.locator('[data-campo="solicitanteNome"].invalido').count()) === 0, 'marcou erro num campo opcional');
ok('4 observação sem erro', (await p.locator('[data-campo="observacao"].invalido').count()) === 0, 'marcou erro num campo opcional');

// 5 — o pacote sem os opcionais não inventa linha no card
let pac = await pacote(p);
ok('5 facilitador no card', /\*\*Facilitador:\*\* Teste/.test(pac.descricao_card), 'card sem facilitador');
ok('5 sem linha de solicitante', !/\*\*Solicitante:\*\*/.test(pac.descricao_card), 'inventou linha de solicitante');
ok('5 sem linha de observação', !/\*\*Observação:\*\*/.test(pac.descricao_card), 'inventou linha de observação');
ok('5 campos vazios no pacote', pac.solicitante_nome === '' && pac.observacao === '', 'veio ' + JSON.stringify([pac.solicitante_nome, pac.observacao]));
await p.close();

// 6 — com os dois preenchidos, tudo chega ao pacote e ao card
p = await abrir(b, '?nome=Teste&email=ia@leh.com.br');
await preencher(p);
await p.evaluate(()=>{
  $('solicitanteNome').value = 'João da Silva — Granja 103';
  $('solicitanteNome').dispatchEvent(new Event('input'));
  $('observacao').value = 'Combinar a entrega com o Zé; o portão fecha às 17h.';
  $('observacao').dispatchEvent(new Event('input'));
});
pac = await pacote(p);
ok('6 solicitante no pacote', pac.solicitante_nome === 'João da Silva — Granja 103', 'veio ' + pac.solicitante_nome);
ok('6 observação no pacote', /portão fecha/.test(pac.observacao||''), 'veio ' + pac.observacao);
ok('6 e-mail no pacote', pac.solicitante_email === 'ia@leh.com.br', 'veio ' + pac.solicitante_email);
ok('6 solicitante no card', /\*\*Solicitante:\*\* João da Silva/.test(pac.descricao_card), 'card sem solicitante');
ok('6 observação no card', /\*\*Observação:\*\* Combinar a entrega/.test(pac.descricao_card), 'card sem observação');

// 7 — o que vai para o banco
const cab = await p.evaluate(()=>{
  const c = {
    facilitador: estado.nomeSolicitante.trim() || null,
    facilitador_email: (estado.emailSolicitante||'').trim().toLowerCase() || null,
    solicitante_nome: estado.solicitanteNome.trim() || null,
    observacao: estado.observacao.trim() || null
  };
  return c;
});
ok('7 facilitador gravado', cab.facilitador === 'Teste', 'veio ' + cab.facilitador);
ok('7 e-mail gravado', cab.facilitador_email === 'ia@leh.com.br', 'veio ' + cab.facilitador_email);
ok('7 solicitante gravado', /João da Silva/.test(cab.solicitante_nome||''), 'veio ' + cab.solicitante_nome);
ok('7 observação gravada', /portão/.test(cab.observacao||''), 'veio ' + cab.observacao);
await p.close();

// 8 — parâmetros hostis na URL
p = await abrir(b, '?nome=' + encodeURIComponent('"><img src=x onerror=alert(1)>') +
  '&email=' + encodeURIComponent('"><script>alert(2)</script>'));
ok('8 sem injeção pelo nome', (await p.locator('img[onerror]').count()) === 0, 'injetou pelo ?nome');
ok('8 sem injeção pelo e-mail', (await p.locator('body script[src]').count()) === 0, 'injetou pelo ?email');
ok('8 e-mail torto não passa', (await p.evaluate(()=>{
  passoAtual = 0; render(); validar('solicitante');
  return document.querySelectorAll('[data-campo="emailSolicitante"].invalido').length;
})) === 1, 'aceitou e-mail inválido vindo da URL');
await p.close();

// 9 — nome só com espaços não conta como preenchido
p = await abrir(b, '?nome=' + encodeURIComponent('   ') + '&email=ia@leh.com.br');
const barrou = await p.evaluate(()=>{ passoAtual = 0; render(); return validar('solicitante'); });
ok('9 barra nome em branco', barrou === false, 'aceitou nome só com espaços');
await p.close();

// 10 — cadastrado na tabela: nome e e-mail vêm de lá, os dois travados
p = await abrir(b, '?nome=Nome+Do+Link&email=errado@x.com&uid=U0BL5JPQX97', FAC);
ok('10 nome da tabela', (await p.inputValue('#nomeSolicitante')) === 'Guilherme Pimpão',
   'veio ' + await p.inputValue('#nomeSolicitante'));
ok('10 e-mail da tabela', (await p.inputValue('#emailSolicitante')) === 'ia@leh.com.br',
   'veio ' + await p.inputValue('#emailSolicitante'));
ok('10 tabela vence o link', (await p.inputValue('#emailSolicitante')) !== 'errado@x.com', 'o link sobrepôs o cadastro');
ok('10 os dois travados', await p.evaluate(()=>$('nomeSolicitante').readOnly && $('emailSolicitante').readOnly),
   'ficou editável');
ok('10 aviso do cadastro', /facilitador de compras/.test(await p.locator('#veioDoSlack').textContent()||''),
   'aviso: ' + await p.locator('#veioDoSlack').textContent());
ok('10 estado acompanhou', await p.evaluate(()=>estado.emailSolicitante) === 'ia@leh.com.br', 'estado ficou para trás');
await p.close();

// 11 — sem trava, quem não está na tabela segue como antes
p = await abrir(b, '?nome=Fulano&uid=UZZZZ', []);
ok('11 cai no link', (await p.inputValue('#nomeSolicitante')) === 'Fulano', 'perdeu o nome do link');
ok('11 e-mail livre', await p.evaluate(()=>$('emailSolicitante').readOnly) === false, 'travou sem cadastro');
ok('11 liberado', await p.evaluate(()=>facilitadorLiberado()) === true, 'barrou com a trava desligada');
await p.close();

// 12 — tabela ainda não existe: a tela não pode quebrar
p = await abrir(b, '?nome=Fulano&uid=U0BL5JPQX97', 404);
ok('12 sobrevive ao 404', (await p.inputValue('#nomeSolicitante')) === 'Fulano', 'quebrou sem a tabela');
ok('12 liberado', await p.evaluate(()=>facilitadorLiberado()) === true, 'barrou por causa do 404');
await p.close();

// 13 — com a trava ligada, cadastrado entra
p = await abrirComTrava(b, '?uid=U0BL5JPQX97', FAC);
ok('13 cadastrado passa', await p.evaluate(()=>facilitadorLiberado()) === true, 'barrou quem está na lista');
// o alerta pode existir por outro motivo (tabela de centros vazia no mock);
// o que não pode é acusar quem está na lista
ok('13 sem alerta de facilitador', !/facilitador/i.test(await p.locator('#alerta').textContent()||''),
   'acusou facilitador válido: ' + await p.locator('#alerta').textContent());
await p.close();

// 14 — com a trava ligada, quem não está na lista não envia
p = await abrirComTrava(b, '?nome=Fulano&uid=UZZZZ', []);
ok('14 barrado', await p.evaluate(()=>facilitadorLiberado()) === false, 'deixou passar quem não é facilitador');
ok('14 alerta na tela', await p.locator('#alerta').isVisible(), 'não avisou');
ok('14 aviso explica', /não está na lista/.test(await p.locator('#veioDoSlack').textContent()||''),
   'aviso: ' + await p.locator('#veioDoSlack').textContent());
await preencher(p);
await p.evaluate(()=>{ passoAtual = sequencia().length - 1; render(); });
await p.evaluate(()=>enviar());
await p.waitForTimeout(500);
ok('14 envio bloqueado', !(await p.locator('#okAviso, [data-passo="confirmacao"]').first().isVisible()),
   'o pedido foi enviado mesmo assim');
ok('14 alerta no envio', /Só facilitador/.test(await p.locator('#alerta').textContent()||''), 'sem alerta no envio');
await p.close();

// 15 — com a trava ligada, tela aberta sem o Slack não envia
p = await abrirComTrava(b, '', []);
ok('15 sem uid barrado', await p.evaluate(()=>facilitadorLiberado()) === false, 'deixou passar sem usuário do Slack');
await p.close();

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
