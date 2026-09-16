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
  await p.evaluate(()=>{ escolherItem(CATALOGO_FALLBACK[0]); passoAtual = sequencia().indexOf('quantidade'); render(); });
  for (const [v, esperado] of [['0',1],['-5',1],['2.5',0]]) {
    await p.fill('#quantidade', v); await p.dispatchEvent('#quantidade','input');
    await p.click('#btnAvancar');
    const barrou = await invalido(p,'quantidade');
    if(v==='2.5' && barrou===0) nota('3 quantidade fracionada (2,5) é aceita', 'confirmar se é desejado');
    ok('3 quantidade '+v+' tratada', barrou===esperado, 'barrou='+barrou);
    await p.evaluate(()=>{ passoAtual = sequencia().indexOf('quantidade'); render(); });
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

// 8 — passos mudam com o tipo
{ const p = await nova(b); await base(p,'item');
  const nItem = await p.evaluate(()=> sequencia().length);
  const nLista = await p.evaluate(()=>{ marcarRadio('tipo','lista'); return sequencia().length; });
  const nServ = await p.evaluate(()=>{ marcarRadio('tipo','servico'); return sequencia().length; });
  ok('8 item tem 6 passos', nItem===6, 'tem '+nItem);
  ok('8 lista tem 5 passos', nLista===5, 'tem '+nLista);
  ok('8 serviço tem 5 passos', nServ===5, 'tem '+nServ);
  await p.close(); }

// 9 — trocar de tipo depois de montar a lista
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ estado.itensLista=[{foraCatalogo:false,codigo:'7360',familia:'HL',descricao:'SABAO EM PO 1KG',unidade:'UNID',quantidade:5}];
    renderLista(); marcarRadio('tipo','servico'); $('escopoServico').value='Escopo com mais de vinte caracteres para passar'; $('escopoServico').dispatchEvent(new Event('input')); });
  const itens = await p.evaluate(()=> montarItens().length);
  const unidade = await p.evaluate(()=> montarItens()[0].unidade);
  ok('9 troca para serviço ignora a lista', itens===1 && unidade==='Serviço', 'itens='+itens+' unidade='+unidade);
  await p.close(); }

// 10 — a família trava no primeiro item e destrava quando a lista esvazia
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render();
    estado.itensLista=[{foraCatalogo:false,codigo:'7360',familia:'HL',descricao:'SABAO EM PO 1KG',unidade:'UNID',quantidade:5}]; renderLista(); });
  const travado = await p.evaluate(()=> ({ desabilitado: $('familiaLista').disabled,
    valor: $('familiaLista').value, avisoVisivel: !$('familiaTravada').hidden,
    aviso: $('familiaTravada').textContent }));
  ok('10 família trava no primeiro item',
    travado.desabilitado && travado.valor==='HL' && travado.avisoVisivel, JSON.stringify(travado));
  ok('10 aviso diz o nome da família', /Materiais de Higiene e Limpeza/.test(travado.aviso), travado.aviso.slice(0,60));
  await p.evaluate(()=> removerItem(0));
  const solto = await p.evaluate(()=> ({ desabilitado: $('familiaLista').disabled,
    valor: $('familiaLista').value, avisoVisivel: !$('familiaTravada').hidden }));
  ok('10 lista vazia destrava a família',
    !solto.desabilitado && solto.valor==='' && !solto.avisoVisivel, JSON.stringify(solto));
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

// 18 — item de outra família não entra na mesma solicitação
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=>{ passoAtual = sequencia().indexOf('item'); render(); });
  await p.selectOption('#familiaLista','HL');
  await p.click('#buscaLista'); await p.waitForTimeout(250);
  await p.locator('#resultadosLista button').first().click();
  await p.fill('#qtdLista','3'); await p.click('#btnAddItem');
  const forcou = await p.evaluate(()=>{
    // tenta forçar um item de outra família por dentro, como se a trava não existisse
    rascunho.item = CATALOGO_FALLBACK.find(i=>i.familia==='MM');
    rascunho.quantidade = 2;
    adicionarItem();
    return estado.itensLista.map(i=>i.familia);
  });
  ok('18 item de outra família é recusado',
    forcou.length===1 && forcou[0]==='HL', JSON.stringify(forcou));
  const buscaSoDaFamilia = await p.evaluate(()=> itensDe(rascunho.familia).every(i=>i.familia==='HL'));
  ok('18 a busca fica presa na família do pedido', buscaSoDaFamilia);
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

// 20 — página única mostra todos os passos do tipo escolhido
{ const p = await nova(b); await base(p,'lista');
  await p.evaluate(()=> trocarVisual('pagina'));
  const visiveis = await p.evaluate(()=> [...document.querySelectorAll('.passo')].filter(s=>!s.hidden).map(s=>s.dataset.passo));
  ok('20 página única mostra os 5 passos da lista',
    JSON.stringify(visiveis)===JSON.stringify(['solicitante','item','entrega','compra','prazo']), JSON.stringify(visiveis));
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
// `especificacao` e entra na busca, sem aparecer na tela. É o que faz alguém
// digitar "milho" e achar CONC. CRESC. 1 SIL + GERMEN AG RH-201. Sem isto o
// item existe no catálogo e é como se não existisse.
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

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
console.log('\n===== PONTOS DE ATENÇÃO (' + notas.length + ') =====');
notas.forEach(n=>console.log(' ! ' + n));
})();
