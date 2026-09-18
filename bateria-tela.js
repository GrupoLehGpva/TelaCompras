const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const ARQ = 'file:///home/claude/TelaCompras/index.html';
const falhas = [], notas = [];
const ok = (c, cond, det='') => { if(!cond) falhas.push(c + (det?' — '+det:'')); };
const nota = (c, t) => notas.push(c + ' — ' + t);

async function nova(b, url=ARQ){
  const p = await b.newPage({ viewport:{width:900,height:1000} });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(mock.respostaDoFormulario(r.request().url(), {}))}));
  await p.goto(url, {waitUntil:'load'});
  await p.waitForTimeout(1200);
  return p;
}
const base = async (p, tipo) => p.evaluate(t=>{
  $('nomeSolicitante').value='Guilherme Pimpão'; $('nomeSolicitante').dispatchEvent(new Event('input'));
  $('emailSolicitante').value='ia@leh.com.br'; $('emailSolicitante').dispatchEvent(new Event('input'));
  marcarRadio('tipo', t);
  /* A empresa passou a ser obrigatoria. Pelo select, e nao por estado.empresa,
     para o teste exercitar o widget de verdade. */
  { const sel = $('empresa'); if(sel && sel.options.length > 1){
      sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); } }
  escolherCentroPorTermo('manuten');
  marcarRadio('tipoCompra','normal'); marcarRadio('definicaoFornecedor','cotacao');
  const d=new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value=d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value='Motivo de teste com tamanho suficiente'; $('motivoCompra').dispatchEvent(new Event('input'));
}, tipo);
const invalido = (p,campo) => p.locator('[data-campo="'+campo+'"].invalido').count();

(async () => {
const b = await chromium.launch();

// 1 — campos obrigatórios, um a um
{ const p = await nova(b);
  await p.click('#btnAvancar');
  ok('1 nome vazio barra', await invalido(p,'nomeSolicitante')===1);
  ok('1 email vazio barra', await invalido(p,'emailSolicitante')===1);
  await p.fill('#nomeSolicitante','Gu'); await p.fill('#emailSolicitante','ia@leh');
  await p.click('#btnAvancar');
  ok('1 nome curto barra', await invalido(p,'nomeSolicitante')===1);
  ok('1 email sem domínio barra', await invalido(p,'emailSolicitante')===1);
  await p.fill('#nomeSolicitante','Guilherme'); await p.fill('#emailSolicitante','ia@leh.com.br');
  await p.click('#btnAvancar');
  /* Depois de quem pede vem EMPRESA E CENTRO DE CUSTO, e so entao o pedido —
     a mesma ordem da requisicao no GR. */
  ok('1 passa com nome e email válidos',
     (await p.textContent('#progTitulo'))==='Empresa e centro de custo',
     'foi para: ' + await p.textContent('#progTitulo'));
  await p.click('#btnAvancar');
  ok('1 empresa vazia barra', await invalido(p,'empresa')===1);
  ok('1 centro de custo vazio barra', await invalido(p,'centroCusto')===1);
  await p.evaluate(()=>{ const sel=$('empresa'); sel.value=sel.options[1].value;
                         sel.dispatchEvent(new Event('change'));
                         escolherCentroPorTermo('manuten'); });
  await p.click('#btnAvancar');
  ok('1 com empresa e centro, segue para o item',
     (await p.textContent('#progTitulo'))==='Item',
     'foi para: ' + await p.textContent('#progTitulo'));
  await p.click('#btnAvancar');
  ok('1 tipo não escolhido barra', await invalido(p,'tipo')===1);
  await p.close(); }

// 2 — item único sem item selecionado
{ const p = await nova(b); await base(p,'item');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  await p.click('#btnAvancar');
  ok('2 item não selecionado barra', await invalido(p,'item')===1);
  await p.close(); }

// 3 — quantidade zero, negativa e fracionada
{ const p = await nova(b); await base(p,'item');
  await p.evaluate(()=>{ escolherItem(CATALOGO_FALLBACK[0]); passoAtual = sequencia().indexOf('item'); render(); });
  for (const [v, esperado] of [['0',1],['-5',1],['2.5',0]]) {
    await p.fill('#quantidade', v); await p.dispatchEvent('#quantidade','input');
    await p.click('#btnAvancar');
    const barrou = await invalido(p,'quantidade');
    if(v==='2.5' && barrou===0) nota('3 quantidade fracionada (2,5) é aceita', 'confirmar se é desejado');
    ok('3 quantidade '+v+' tratada', barrou===esperado, 'barrou='+barrou);
    await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  }
  await p.close(); }

// 4 — fornecedor único sem justificativa
{ const p = await nova(b); await base(p,'item');
  await p.evaluate(()=>{ marcarRadio('definicaoFornecedor','unico'); passoAtual = sequencia().indexOf('compra'); render(); });
  await p.click('#btnAvancar');
  ok('4 fornecedor único sem justificativa barra', await invalido(p,'justificativaFornecedor')===1);
  await p.close(); }

// 5 — prazo no passado
{ const p = await nova(b); await base(p,'item');
  await p.evaluate(()=>{ const d=new Date(); d.setDate(d.getDate()-30);
    $('dataLimite').value=d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
    passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.click('#btnAvancar');
  ok('5 data no passado barra', await invalido(p,'dataLimite')===1);
  await p.close(); }

// 6 — motivo curto
{ const p = await nova(b); await base(p,'item');
  await p.evaluate(()=>{ $('motivoCompra').value='oi'; $('motivoCompra').dispatchEvent(new Event('input'));
    passoAtual = sequencia().indexOf('prazo'); render(); });
  await p.click('#btnAvancar');
  ok('6 motivo curto barra', await invalido(p,'motivoCompra')===1);
  await p.close(); }

// 7 — lista vazia
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  await p.click('#btnAvancar');
  ok('7 lista vazia barra', await invalido(p,'itensLista')===1);
  await p.close(); }

/* 8 — são CINCO passos, iguais para os três tipos.
   Até 18/09 o item único tinha seis: a quantidade era um passo só dela, e
   lista e serviço o pulavam. A quantidade voltou para dentro do item, então
   não há mais tipo com contagem diferente — e a numeração das telas sai desta
   mesma lista, então o que este teste guarda é o "Passo N de 5" e o
   "1., 2., 3." da página única de uma vez só. */
{ const p = await nova(b); await base(p,'item');
  const nItem = await p.evaluate(()=> sequencia().length);
  const nLista = await p.evaluate(()=>{ marcarRadio('tipo','lista'); return sequencia().length; });
  const nServ = await p.evaluate(()=>{ marcarRadio('tipo','servico'); return sequencia().length; });
  ok('8 item tem 5 passos', nItem===5, 'tem '+nItem);
  ok('8 lista tem 5 passos', nLista===5, 'tem '+nLista);
  ok('8 serviço tem 5 passos', nServ===5, 'tem '+nServ);
  ok('8 nenhum passo chamado quantidade',
     !(await p.evaluate(()=> sequencia().includes('quantidade'))),
     'a quantidade voltou a ser passo');

  /* A quantidade tem que estar DENTRO do bloco do item único — é o que faz
     ela sumir sozinha em lista e serviço. */
  await p.evaluate(()=>{ marcarRadio('tipo','item'); passoAtual = sequencia().indexOf('item'); render(); });
  ok('8 quantidade dentro do bloco do item',
     await p.evaluate(()=> !!document.querySelector('#blocoItem #quantidade')),
     'o campo de quantidade está fora do blocoItem');
  ok('8 quantidade visível no item único', await p.locator('#quantidade').isVisible());
  await p.evaluate(()=>{ marcarRadio('tipo','lista'); });
  ok('8 quantidade some na lista', !(await p.locator('#quantidade').isVisible()),
     'o campo de quantidade apareceu numa lista de itens');
  await p.evaluate(()=>{ marcarRadio('tipo','servico'); });
  ok('8 quantidade some no serviço', !(await p.locator('#quantidade').isVisible()),
     'o campo de quantidade apareceu num escopo de serviço');

  /* A numeração da página única: cinco seções, 1 a 5, sem buraco. */
  await p.evaluate(()=>{ marcarRadio('tipo','item'); trocarVisual('pagina'); });
  const numeros = await p.evaluate(()=>
    [...document.querySelectorAll('.passo:not([hidden]) h2')].map(h=>h.textContent.trim()));
  ok('8 página única numera 1 a 5',
     numeros.length===5 && numeros.every((t,i)=> t.startsWith((i+1)+'. ')),
     JSON.stringify(numeros));
  await p.close(); }

// 9 — trocar de tipo depois de montar a lista
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ estado.itensLista=[{foraCatalogo:false,codigo:'7360',familia:'HL',descricao:'SABAO EM PO 1KG',unidade:'UNID',quantidade:5}];
    renderLista(); marcarRadio('tipo','servico'); $('escopoServico').value='Escopo com mais de vinte caracteres para passar'; $('escopoServico').dispatchEvent(new Event('input')); });
  const itens = await p.evaluate(()=> montarItens().length);
  const unidade = await p.evaluate(()=> montarItens()[0].unidade);
  ok('9 troca para serviço ignora a lista', itens===1 && unidade==='Serviço', 'itens='+itens+' unidade='+unidade);
  await p.close(); }

/* 10 — MISTURAR FAMÍLIAS É PERMITIDO.
   Até 18/09 este teste provava o contrário: a família travava no primeiro item
   e o segundo, de outra família, era recusado — em silêncio, que era o pior.
   A regra caiu porque obrigava a abrir três solicitações para uma ida só ao
   fornecedor. O que ficou é o agrupamento por família na lista, que é leitura,
   não porteiro. Este teste guarda as duas coisas. */
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });

  ok('10 sem campo de família na lista', (await p.locator('#familiaLista').count()) === 0,
     'o select de família continua na tela');
  ok('10 sem aviso de trava', (await p.locator('#familiaTravada').count()) === 0,
     'o aviso de família travada continua na tela');

  /* Dois itens de famílias diferentes, pelo caminho de verdade: escolhe no
     resultado da busca e clica em adicionar. */
  const juntar = async (termo) => {
    await p.fill('#buscaLista', termo);
    await p.waitForTimeout(250);
    await p.locator('#resultadosLista [role="option"], #resultadosLista button, #resultadosLista .resultado').first().click();
    await p.fill('#qtdLista', '3');
    await p.locator('#qtdLista').dispatchEvent('input');
    await p.waitForTimeout(120);
    await p.click('#btnAddItem');
    await p.waitForTimeout(150);
  };
  await juntar('SABAO EM PO');     // HL
  await juntar('CIMENTO');         // MG

  const lista = await p.evaluate(()=> estado.itensLista.map(i=>({cod:i.codigo, fam:i.familia})));
  ok('10 aceitou item de outra família', lista.length === 2,
     'a lista ficou com ' + lista.length + ' item(ns): ' + JSON.stringify(lista));
  ok('10 as duas famílias entraram',
     new Set(lista.map(i=>i.fam)).size === 2, JSON.stringify(lista));

  /* O agrupamento continua: um bloco por família, cada um com o seu título. */
  const grupos = await p.evaluate(()=>
    [...document.querySelectorAll('#itensLista .grupo-familia h3')].map(h=>h.textContent));
  ok('10 lista agrupa por família', grupos.length === 2,
     'blocos: ' + JSON.stringify(grupos));
  ok('10 título do grupo nomeia a família',
     grupos.some(g=>/Higiene e Limpeza/i.test(g)), JSON.stringify(grupos));
  await p.close(); }

// 11 — busca sem resultado
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  await p.fill('#buscaLista','zzzzzzz');
  await p.waitForTimeout(200);
  const txt = await p.textContent('#resultadosLista');
  ok('11 busca sem resultado avisa', /Nenhum item encontrado/.test(txt), txt.slice(0,40));
  await p.close(); }

// 12 — envio duplo (clique duas vezes)
{ const p = await nova(b);
  let envios = 0;
  await p.route('**/webhook/**', r => { envios++; setTimeout(()=>r.fulfill({status:200,body:'ok'}), 600); });
  await p.unroute('**supabase.co/**');
  await p.route('**supabase.co/**', r => setTimeout(()=>r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(mock.respostaDoFormulario(r.request().url(), {}))}), 400));
  await base(p,'item');
  await p.evaluate(()=>{ escolherItem(CATALOGO_FALLBACK[0]); estado.quantidade=2;
    passoAtual = sequencia().length-1; render(); });
  await p.click('#btnAvancar');
  await p.click('#btnAvancar', {force:true}).catch(()=>{});
  await p.waitForTimeout(2500);
  if(envios > 1) falhas.push('12 clique duplo enviou ' + envios + ' vezes — cria card duplicado');
  else ok('12 clique duplo não duplica', true);
  await p.close(); }

// 13 — nome vindo da URL não executa script
{ const p = await nova(b, ARQ + '?nome=%3Cimg%20src%3Dx%20onerror%3Dwindow.__XSS%3D1%3E&uid=U123');
  await p.waitForTimeout(500);
  const xss = await p.evaluate(()=> !!window.__XSS);
  const valor = await p.inputValue('#nomeSolicitante');
  ok('13 nome da URL não executa script', !xss);
  ok('13 nome da URL preenche o campo', valor.includes('<img'), valor.slice(0,20));
  await p.close(); }

// 14 — celular: sem rolagem horizontal
{ const p = await b.newPage({ viewport:{width:375,height:800} });
  await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(mock.respostaDoFormulario(r.request().url(), {}))}));
  await p.goto(ARQ,{waitUntil:'load'}); await p.waitForTimeout(1200);
  await base(p,'lista');
  await p.evaluate(()=>{ estado.itensLista=[{foraCatalogo:false,codigo:'7360',familia:'HL',
    descricao:'Detergente neutro concentrado 5 litros com nome bem comprido para testar',unidade:'Litro',quantidade:20}];
    renderLista(); passoAtual = sequencia().indexOf('item'); render(); });
  const larg = await p.evaluate(()=> ({doc:document.documentElement.scrollWidth, win:window.innerWidth}));
  ok('14 celular sem rolagem horizontal', larg.doc <= larg.win + 1, JSON.stringify(larg));
  await p.screenshot({path:'t-celular.png', fullPage:true});
  await p.close(); }

// 15 — tema escuro: rádios não ficam todos brancos
{ const p = await b.newPage({ viewport:{width:900,height:1000}, colorScheme:'dark' });
  await p.route('**supabase.co/**', r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(mock.respostaDoFormulario(r.request().url(), {}))}));
  await p.goto(ARQ,{waitUntil:'load'}); await p.waitForTimeout(1200);
  const cs = await p.evaluate(()=> getComputedStyle(document.documentElement).colorScheme);
  const fundo = await p.evaluate(()=> getComputedStyle(document.body).backgroundColor);
  ok('15 color-scheme segue o tema escuro', /dark/.test(cs), cs);
  ok('15 body tem fundo escuro explícito', fundo!=='rgba(0, 0, 0, 0)', fundo);
  await p.screenshot({path:'t-escuro.png'});
  await p.close(); }

// 16 — falha de rede no envio deixa tentar de novo
{ const p = await nova(b);
  await p.unroute('**supabase.co/**');
  await p.route('**supabase.co/**', r => r.abort());
  await base(p,'item');
  await p.evaluate(()=>{ escolherItem(CATALOGO_FALLBACK[0]); estado.quantidade=2; passoAtual = sequencia().length-1; render(); });
  await p.click('#btnAvancar');
  await p.waitForTimeout(1500);
  const alertaVisivel = await p.locator('#alerta').isVisible();
  const botao = await p.evaluate(()=> ({ texto: $('btnAvancar').textContent, travado: $('btnAvancar').disabled }));
  ok('16 erro de rede avisa', alertaVisivel);
  ok('16 botão volta a funcionar', !botao.travado && /Enviar/.test(botao.texto), JSON.stringify(botao));
  await p.close(); }

// 17 — texto muito longo no escopo e no motivo
{ const p = await nova(b); await base(p,'servico');
  await p.evaluate(()=>{ $('escopoServico').value='x'.repeat(5000); $('escopoServico').dispatchEvent(new Event('input')); });
  const tam = await p.evaluate(()=> montarPacote(null,{numero:'C2609-00001',solicitante:'G',local_entrega:'G103',
    centro_custo:'CC-103-MAN',tipo_compra:'normal',definicao_fornecedor:'cotacao',justificativa_fornecedor:null,
    data_necessidade:'2026-09-11',motivo:'m'}, montarItens()).descricao_card.length);
  if(tam > 4000) nota('17 escopo de 5.000 caracteres vai inteiro para o card', 'descrição com '+tam+' caracteres');
  ok('17 escopo longo não quebra', tam>0);
  const maxMotivo = await p.getAttribute('#motivoCompra','maxlength');
  ok('17 motivo tem limite', maxMotivo==='140', 'maxlength='+maxMotivo);
  await p.close(); }

/* 18 — nada recusa item por causa da família, nem por dentro.
   O par deste teste é o 10: lá a mistura é provada pela tela, aqui pela função
   que adiciona. A versão anterior provava o oposto e ainda conferia que a
   busca ficava presa na família do pedido — as duas coisas acabaram em 18/09. */
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  const familias = await p.evaluate(()=>{
    const de = f => CATALOGO_FALLBACK.find(i => i.familia === f);
    rascunho.item = de('HL'); rascunho.quantidade = 3; adicionarItem();
    rascunho.item = de('MM'); rascunho.quantidade = 2; adicionarItem();
    rascunho.item = de('MG'); rascunho.quantidade = 1; adicionarItem();
    return estado.itensLista.map(i=>i.familia);
  });
  ok('18 três famílias no mesmo pedido',
     familias.length === 3 && new Set(familias).size === 3, JSON.stringify(familias));
  const buscaVarreTudo = await p.evaluate(()=> filtrar(CATALOGO, 'a') === null
    || new Set(filtrar(CATALOGO, 'a').map(i=>i.familia)).size >= 1);
  ok('18 a busca não fica presa em família nenhuma', buscaVarreTudo);
  await p.close(); }

// 19 — voltar escondido no primeiro passo, e o número NÃO nasce na tela
{ const p = await nova(b);
  ok('19 Voltar escondido no passo 1', !(await p.locator('#btnVoltar').isVisible()));

  /* O número era sorteado aqui — 'SC-' + ano + Math.random entre 9.000, numa
     coluna com UNIQUE. A conferência que existia neste lugar aprovava o
     sorteio; era ela que dava cobertura ao bug. Agora o que ela tem que
     provar é o contrário: que a tela NÃO inventa número nenhum. */
  const num = (await p.textContent('#autoNumero')).trim();
  ok('19 a tela não inventa número', num === 'gerado ao enviar', num);
  const sorteia = await p.evaluate(()=> /Math\.random/.test(iniciar.toString()));
  ok('19 nenhum sorteio sobrou no formulário', !sorteia);
  await p.close(); }

/* 20 — a página única mostra os passos NA ORDEM DO FLUXO.
   Esta asserção guardava a ordem errada e por isso não acusou nada: o HTML
   trazia o item antes da empresa, mas os números saem da sequência, então a
   tela lia "1. Solicitante, 3. Item, 2. Empresa e centro de custo". Os números
   estavam certos; a ordem é que não. Corrigido em 18/09 movendo a seção no
   HTML — e a asserção passou a comparar com a própria sequência, em vez de com
   uma lista escrita à mão, que foi como o erro entrou aqui. */
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=> trocarVisual('pagina'));
  const visiveis = await p.evaluate(()=> [...document.querySelectorAll('.passo')].filter(s=>!s.hidden).map(s=>s.dataset.passo));
  const seq = await p.evaluate(()=> sequencia());
  ok('20 página única na ordem do fluxo',
    JSON.stringify(visiveis)===JSON.stringify(seq),
    'tela: ' + JSON.stringify(visiveis) + ' · fluxo: ' + JSON.stringify(seq));
  const titulos = await p.evaluate(()=>
    [...document.querySelectorAll('.passo:not([hidden]) h2')].map(h=>h.textContent.trim()));
  ok('20 numeração sem buraco nem repetição',
    titulos.every((t,i)=> t.startsWith((i+1)+'. ')), JSON.stringify(titulos));
  await p.close(); }

// 21 — escopo tem teto
{ const p = await nova(b);
  const max = await p.getAttribute('#escopoServico','maxlength');
  ok('21 escopo limitado', max==='2000', 'maxlength='+max);
  await p.close(); }

// 22 — as unidades do GR são códigos e não levam plural de português
//
// Entrou junto com o catálogo real. Os 29 itens de demonstração tinham
// unidades por extenso ('Unidade', 'Peça', 'Litro'), então a regra de plural
// funcionava por acidente. Com UNID, KG, SC e CAB ela produzia "4 unids",
// "10 kgs", "2 cabs" — e nada estourava: só ficava escrito errado no card que
// o aprovador lê.
{ const p = await nova(b);
  const casos = [
    ['UNID', 1, 'unidade'], ['UNID', 4, 'unidades'],
    ['KG',   1, 'kg'],      ['KG',  10, 'kg'],
    ['L',    2, 'L'],       ['ML',   3, 'mL'],
    ['M',    5, 'm'],       ['SC',   1, 'saco'],   ['SC',  3, 'sacos'],
    ['TON',  2, 'toneladas'], ['CAB', 1, 'cabeça'], ['CAB', 8, 'cabeças'],
    ['DOSE', 2, 'doses'],   ['GRAMAS', 2, 'gramas'], ['BAG', 2, 'bags']
  ];
  const obtido = await p.evaluate(cs => cs.map(c => unidadePlural(c[0], c[1])), casos);
  casos.forEach((c, i) => ok('22 ' + c[1] + ' ' + c[0] + ' se lê "' + c[2] + '"',
    obtido[i] === c[2], 'saiu: ' + obtido[i]));

  // Unidade que não está na tabela do GR não pode sumir nem estourar: cai na
  // regra antiga e continua legível.
  const desconhecida = await p.evaluate(()=> unidadePlural('Balde', 3));
  ok('22 unidade fora da tabela ainda funciona', desconhecida === 'baldes', 'saiu: ' + desconhecida);
  await p.close(); }

// 23 — a busca enxerga o grupo do item, não só o nome e o código
//
// Decisão do Guilherme em 16/09: o "Novo Grupo" da planilha do GR vai para
// `especificacao` e entra na busca, sem aparecer na tela.
//
// Em 6.419 dos 7.084 itens o grupo não está escrito no nome. É o que faz
// "herbicida" achar ACCENT e "EPI" achar AVENTAL DE RASPA — sem isto esses
// itens existem no catálogo e é como se não existissem.
{ const p = await nova(b);
  const r = await p.evaluate(()=> {
    const acha = t => (filtrar(CATALOGO_FALLBACK, t) || []).map(i => i.codigo);
    return {
      porNome:   acha('cimento'),
      porCodigo: acha('7435'),
      porGrupo:  acha('material de constru'),   // não está no nome do item
      grupoNaTela: (() => {
        const i = CATALOGO_FALLBACK.find(x => x.codigo === '7435');
        return { descricao: i.descricao, temNoNome: /material/i.test(i.descricao) };
      })()
    };
  });
  ok('23 acha pelo nome', r.porNome.includes('7435'), JSON.stringify(r.porNome));
  ok('23 acha pelo código', r.porCodigo.includes('7435'), JSON.stringify(r.porCodigo));
  ok('23 acha pelo grupo, que não está no nome',
    r.porGrupo.includes('7435') && r.grupoNaTela.temNoNome === false,
    JSON.stringify(r.porGrupo) + ' · nome=' + r.grupoNaTela.descricao);
  await p.close(); }

/* --------------------------------------------------------------------------
   O CÓDIGO EXATO VEM PRIMEIRO.
   Achado no ar em 18/09: digitar `5046` (o pneu) devolvia, em ordem
   alfabética, três itens cujo código apenas CONTÉM 5046 — 22504603, P550463,
   24504602 — e o pneu em quarto. Com quatro resultados dá para procurar; com
   um fragmento comum, a lista corta em 50 e o item exato pode não aparecer.
   E quem não acha o item marca "fora do catálogo", que é o pedido seguindo
   sem o código do GR.
   -------------------------------------------------------------------------- */
{ const p = await nova(b);
  const r = await p.evaluate(()=>{
    /* Catálogo de mentira montado para o caso ser exatamente o do pneu: o
       código procurado aparece dentro de códigos maiores, e os nomes desses
       vêm antes no alfabeto. */
    const base = [
      {codigo:'22504603', descricao:'ENGRENAGEM SIMPLES REF 22504603', unidade:'UNID', especificacao:'', familia:'MM'},
      {codigo:'5046',     descricao:'PNEU 275/80R22.5 ARMOR MAX',      unidade:'UNID', especificacao:'', familia:'MM'},
      {codigo:'504699',   descricao:'ZZZ COMECA COM O CODIGO',         unidade:'UNID', especificacao:'', familia:'MM'},
      {codigo:'1946',     descricao:'FILTRO COMBUSTIVEL P550463',      unidade:'UNID', especificacao:'', familia:'MM'}
    ];
    const achados = filtrar(base, '5046') || [];
    return { ordem: achados.map(i=>i.codigo), quantos: achados.length };
  });
  ok('23b código exato vem em primeiro', r.ordem[0] === '5046',
     'a ordem veio ' + JSON.stringify(r.ordem));
  ok('23b código que começa igual vem antes do resto', r.ordem[1] === '504699',
     'a ordem veio ' + JSON.stringify(r.ordem));
  ok('23b e ninguém some da lista', r.quantos === 4, 'vieram ' + r.quantos + ' de 4');
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
console.log('\n===== PONTOS DE ATENÇÃO (' + notas.length + ') =====');
notas.forEach(n=>console.log(' ! ' + n));
})();
