/* Bateria do campo de centro de custo (busca com 746 opções). */
const { chromium } = require('playwright');
const url = 'file://' + __dirname + '/index.html';
const falhas = [], notas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

// 746 centros falsos com a mesma forma dos do ERP
const CENTROS = [];
for(let i=0;i<746;i++){
  CENTROS.push({
    codigo: String(3000+i),
    nome: (i===0 ? '2024/2025 - BLZ-01 - SOJA OLIMPO - 209,2 ha' : 'CENTRO DE TESTE ' + i),
    unidade: i % 2 ? 'AGRICULTURA - PIAUÍ' : 'AGRICULTURA SUL',
    tipo: 'Produtivo'
  });
}

async function abrir(){
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    if(u.includes('centros_custo'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CENTROS)});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.goto(url,{waitUntil:'load'});
  await p.waitForTimeout(1200);
  return {b,p};
}

(async ()=>{
const {b,p} = await abrir();

// 1 — carregou os 746 do banco, não a lista curta local
ok('1 carga', (await p.evaluate(()=>CENTROS_CUSTO.length)) === 746,
   'esperava 746, veio ' + await p.evaluate(()=>CENTROS_CUSTO.length));

// 2 — foco sem texto abre a lista, e ela é limitada a 50 + aviso
await p.evaluate(()=>{ marcarRadio('tipo','servico'); passoAtual = sequencia().indexOf('entrega'); render(); });
await p.click('#buscaCentro');
await p.waitForTimeout(150);
const aberta = await p.locator('#resultadosCentro').isVisible();
ok('2 abre no foco', aberta, 'a caixa não abriu');
const botoes = await p.locator('#resultadosCentro button').count();
ok('2 teto de 50', botoes === 50, 'apareceram ' + botoes + ' botões');
const aviso = await p.locator('#resultadosCentro p.vazio').textContent();
ok('2 aviso de excedente', /696/.test(aviso||''), 'aviso veio: ' + aviso);

// 3 — busca por código
await p.fill('#buscaCentro','3180');
await p.waitForTimeout(150);
const n3 = await p.locator('#resultadosCentro button').count();
ok('3 busca por código', n3 === 1, 'esperava 1 resultado, veio ' + n3);

// 4 — busca por palavras soltas fora de ordem
await p.fill('#buscaCentro','soja olimpo');
await p.waitForTimeout(150);
ok('4 busca por nome', (await p.locator('#resultadosCentro button').count()) === 1, 'nome não encontrado');
await p.fill('#buscaCentro','olimpo 2024');
await p.waitForTimeout(150);
ok('4 palavras fora de ordem', (await p.locator('#resultadosCentro button').count()) === 1,
   'busca com palavras invertidas falhou');

// 5 — busca por unidade de negócio
await p.fill('#buscaCentro','PIAUÍ');
await p.waitForTimeout(150);
ok('5 busca por unidade', (await p.locator('#resultadosCentro button').count()) === 50, 'unidade não filtra');

// 6 — escolher grava código e nome e mostra a ficha
await p.fill('#buscaCentro','3000');
await p.waitForTimeout(150);
await p.locator('#resultadosCentro button').first().click();
await p.waitForTimeout(120);
const st = await p.evaluate(()=>({c:estado.centroCusto,n:estado.centroCustoNome,u:estado.centroCustoUnidade}));
ok('6 grava código', st.c === '3000', 'código gravado: ' + st.c);
ok('6 grava nome', /SOJA OLIMPO/.test(st.n||''), 'nome gravado: ' + st.n);
ok('6 ficha visível', await p.locator('#fichaCentro').isVisible(), 'a ficha não apareceu');
ok('6 caixa fechou', !(await p.locator('#resultadosCentro').isVisible()), 'a caixa ficou aberta');

// 7 — digitar de novo limpa a escolha (não pode enviar código velho com nome novo)
await p.fill('#buscaCentro','CENTRO');
await p.waitForTimeout(150);
ok('7 limpa ao digitar', (await p.evaluate(()=>estado.centroCusto)) === '', 'código sobrou');
ok('7 esconde ficha', !(await p.locator('#fichaCentro').isVisible()), 'ficha ficou visível');

// 8 — busca sem resultado avisa e não deixa escolher nada
await p.fill('#buscaCentro','zzzzzz nao existe');
await p.waitForTimeout(150);
ok('8 vazio avisa', /Nenhum centro/.test(await p.locator('#resultadosCentro').textContent()), 'sem aviso');
ok('8 vazio sem botões', (await p.locator('#resultadosCentro button').count()) === 0, 'apareceram botões');

// 9 — validação barra o envio sem centro escolhido
await p.evaluate(()=>{
  $('nomeSolicitante').value='Teste'; $('nomeSolicitante').dispatchEvent(new Event('input'));
  $('emailSolicitante').value='ia@leh.com.br'; $('emailSolicitante').dispatchEvent(new Event('input'));
  $('escopoServico').value='Escopo de teste com tamanho mais do que suficiente para passar na trava.';
  $('escopoServico').dispatchEvent(new Event('input'));
  marcarRadio('tipoCompra','normal'); marcarRadio('definicaoFornecedor','cotacao');
  const d=new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value=d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value='Motivo de teste com tamanho suficiente'; $('motivoCompra').dispatchEvent(new Event('input'));
  passoAtual = sequencia().length - 1; render();
});
await p.evaluate(()=>podeEnviar());
await p.waitForTimeout(150);
ok('9 barra sem centro', (await p.locator('[data-campo="centroCusto"].invalido').count()) === 1,
   'deixou passar sem centro de custo');

// 10 — nome do centro entra no pacote do ClickUp
await p.evaluate(()=>{ escolherCentroPorTermo('3000'); });
const pacote = await p.evaluate(()=>montarPacote(null,
  {numero:'C2609-00001',solicitante:'Teste',centro_custo:estado.centroCusto,tipo_compra:'normal',
   definicao_fornecedor:'cotacao',justificativa_fornecedor:null,data_necessidade:'2026-12-01',
   motivo:'teste'},
  [{codigo:'X',descricao:'Serviço',unidade:'Serviço',quantidade:1,foraCatalogo:false}]));
ok('10 código no pacote', pacote.centro_custo === '3000', 'veio ' + pacote.centro_custo);
ok('10 nome no pacote', /SOJA OLIMPO/.test(pacote.centro_custo_nome||''), 'veio ' + pacote.centro_custo_nome);
ok('10 unidade no pacote', /AGRICULTURA SUL/.test(pacote.centro_custo_unidade||''), 'veio ' + pacote.centro_custo_unidade);
ok('10 código no texto do card', /\(3000\)/.test(pacote.descricao_card||pacote.card||JSON.stringify(pacote)),
   'o código não aparece no texto do card');

// 11 — banco fora do ar cai na lista curta local e avisa
await b.close();
const b2 = await chromium.launch();
const p2 = await b2.newPage();
await p2.route('**supabase.co/**', r => r.abort());
await p2.goto(url,{waitUntil:'load'});
await p2.waitForTimeout(1500);
const qtd = await p2.evaluate(()=>CENTROS_CUSTO.length);
ok('11 fallback local', qtd > 0 && qtd < 100, 'fallback trouxe ' + qtd);
ok('11 avisa a falha', await p2.locator('#alerta').isVisible(), 'não avisou que o banco caiu');
await b2.close();

console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
if(notas.length){ console.log('\n===== ATENÇÃO ====='); notas.forEach(n=>console.log(' ! ' + n)); }
})();
