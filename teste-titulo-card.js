/* O título e a descrição do card, depois da mudança de 18/09.
 *
 * Por que este arquivo existe: até hoje NADA conferia o `titulo_card`. Ele era
 * montado no index.html, ia para o n8n e virava o nome do card sem passar por
 * nenhuma asserção — e o n8n ainda lia o número da solicitação do começo desse
 * título. Dois pontos acoplados, zero teste entre eles.
 *
 * O que se prova aqui:
 *   1. O título é NÚMERO · CENTRO DE CUSTO (código) · FACILITADOR.
 *   2. O número vem NA FRENTE — é o único lugar que o quadro nunca corta.
 *   3. O número também é a primeira linha da descrição.
 *   4. O motivo, que só existia no título, virou linha da descrição.
 *   5. Título sem centro ou sem facilitador não sai quebrado nem vazio.
 *   6. "Mensal" existe, "Programada" não, e o rótulo antigo continua legível
 *      nas telas que mostram pedidos abertos antes da troca.
 */
const { chromium } = require('playwright');
const fs  = require('fs');
const url = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + d);

async function abrir(b){
  const p = await b.newPage();
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    if(u.includes('empresas'))
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(require('./mock-supabase.js').EMPRESAS_EXEMPLO)});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.goto(url, {waitUntil:'load'});
  await p.waitForTimeout(1300);
  return p;
}

/* Monta o pacote direto, com o cabeçalho que o teste quiser. É o mesmo caminho
   que o envio de verdade usa — montarPacote é a função que o n8n consome. */
const pacoteCom = (p, cab) => p.evaluate(c => montarPacote(null, Object.assign({
  numero:'C2609-00042', solicitante:'ALISSON RICARDO KRASSUSKI',
  centro_custo:'3238', tipo_compra:'normal', definicao_fornecedor:'cotacao',
  justificativa_fornecedor:null, data_necessidade:'2026-12-01',
  motivo:'Estoque baixo de ração'
}, c), [{codigo:'6654',descricao:'ANCO FIT (25 KG)',unidade:'SC',quantidade:500,foraCatalogo:false}]), cab);

(async () => {
const b = await chromium.launch();
const p = await abrir(b);

/* Um centro de custo de verdade, escolhido pela tela, para o nome vir do mesmo
   lugar de onde vem no uso real — e não de um literal escrito no teste. */
await p.evaluate(()=>escolherCentroPorTermo('fábrica de ração'));
const centroNome = await p.evaluate(()=>estado.centroCustoNome);
const centroCod  = await p.evaluate(()=>estado.centroCusto);

// 1 — o título é centro (código) · facilitador
let pac = await pacoteCom(p, { centro_custo: centroCod });
ok('1 título tem o centro de custo', (pac.titulo_card||'').includes(centroNome),
   'título veio "' + pac.titulo_card + '" e o centro é "' + centroNome + '"');
ok('1 título tem o código do centro', (pac.titulo_card||'').includes('(' + centroCod + ')'),
   'título veio "' + pac.titulo_card + '"');
ok('1 título tem o facilitador', /ALISSON RICARDO KRASSUSKI/.test(pac.titulo_card||''),
   'título veio "' + pac.titulo_card + '"');
ok('1 separador entre os dois', /\s·\s/.test(pac.titulo_card||''),
   'título veio "' + pac.titulo_card + '"');

/* 2 — O NÚMERO ABRE O TÍTULO.
   Até 21/09 esta asserção exigia o contrário ("o número não está no título").
   Voltou a pedido do Guilherme: quem faz o orçamento precisa ver o código no
   quadro, e é por ele que cotação, planilha e GR se amarram.

   Não basta o número estar no título — ele tem que estar NO COMEÇO. No quadro
   o nome quebra em duas linhas e o fim é cortado; um número no final existiria
   no título e seria invisível para quem olha o Kanban, que era o problema. */
ok('2 número abre o título', (pac.titulo_card||'').startsWith('C2609-00042 · '),
   'o título não começa pelo número: "' + pac.titulo_card + '"');
ok('2 número aparece uma vez só', ((pac.titulo_card||'').match(/C2609-00042/g)||[]).length === 1,
   'número repetido: "' + pac.titulo_card + '"');

/* 2b — ordem: número, depois centro, depois facilitador. */
{
  const t = pac.titulo_card || '';
  const iNum = t.indexOf('C2609-00042'), iCen = t.indexOf(centroNome), iFac = t.indexOf('ALISSON');
  ok('2b ordem número · centro · facilitador', iNum === 0 && iNum < iCen && iCen < iFac,
     'título: "' + t + '"');
}

/* 2c — pedido sem número (não deveria acontecer: quem numera é o banco) não
   pode deixar um " · " solto na frente do título. */
pac = await pacoteCom(p, { numero: '' });
ok('2c sem número não deixa separador solto', !/^\s*·/.test(pac.titulo_card||''),
   'título: "' + pac.titulo_card + '"');
pac = await pacoteCom(p, { centro_custo: centroCod });

// 3 — mas o número continua no card, na primeira linha da descrição
const primeiraLinha = String(pac.descricao_card||'').split('\n')[0];
ok('3 número na primeira linha', primeiraLinha === '**Solicitação:** C2609-00042',
   'primeira linha veio "' + primeiraLinha + '"');

// 4 — o motivo, que só existia no título, virou linha da descrição
ok('4 motivo na descrição', /\*\*Motivo:\*\* Estoque baixo de ração/.test(pac.descricao_card||''),
   'descrição sem o motivo');
ok('4 motivo antes do facilitador',
   (pac.descricao_card||'').indexOf('**Motivo:**') < (pac.descricao_card||'').indexOf('**Facilitador:**'),
   'o motivo ficou depois do facilitador');

// 5 — faltando dado, o título não sai quebrado
pac = await pacoteCom(p, { solicitante:'' });
ok('5 sem facilitador não quebra', /· Sem facilitador$/.test(pac.titulo_card||''),
   'título veio "' + pac.titulo_card + '"');
ok('5 sem facilitador ainda tem o centro', (pac.titulo_card||'').includes(centroNome),
   'título veio "' + pac.titulo_card + '"');

await p.evaluate(()=>{ estado.centroCusto=''; estado.centroCustoNome=''; });
pac = await pacoteCom(p, { centro_custo:'' });
ok('5 sem centro não quebra', /^C2609-00042 · Sem centro de custo · ALISSON/.test(pac.titulo_card||''),
   'título veio "' + pac.titulo_card + '"');
ok('5 sem centro não deixa parêntese vazio', !/\(\)/.test(pac.titulo_card||''),
   'título veio "' + pac.titulo_card + '"');

// 6 — tipos de compra: Normal, Urgente e Mensal
const tipos = await p.evaluate(()=>DADOS.tiposCompra.map(t=>t.id));
ok('6 os três tipos', JSON.stringify(tipos) === JSON.stringify(['normal','urgente','mensal']),
   'veio ' + JSON.stringify(tipos));
const ajudaMensal = await p.evaluate(()=>(DADOS.tiposCompra.find(t=>t.id==='mensal')||{}).ajuda||'');
ok('6 mensal explica que é programada', /programada/i.test(ajudaMensal) && /limpeza/i.test(ajudaMensal),
   'ajuda do mensal veio "' + ajudaMensal + '"');

/* 6b — Mensal está na tela mas desligada (18/09). Três asserções porque há
   três jeitos de isso furar: o radio aceitar clique, o CSS não avisar que
   está desligada, e marcarRadio conseguir marcá-la por código — este último
   é o perigoso, porque o pedido sairia com um tipo que a tela não oferece. */
/* O passo do tipo de compra é o 'compra' — sem renderizá-lo, tudo ali dentro
   conta como invisível e a asserção de visibilidade mentiria. */
await p.evaluate(()=>{ passoAtual = sequencia().indexOf('compra'); render(); });
const mensal = p.locator('#tipoCompraOpcoes label', {hasText:'Mensal'}).first();
ok('6b mensal continua visível', await mensal.isVisible(), 'a opção Mensal sumiu da tela');
ok('6b mensal não é clicável', await mensal.locator('input').isDisabled(),
   'dá para escolher Mensal');
ok('6b mensal avisa que está indisponível',
   /indispon/i.test(await mensal.textContent() || ''),
   'sem selo avisando: ' + (await mensal.textContent() || '').slice(0, 80));
ok('6b normal e urgente seguem clicáveis',
   !(await p.locator('#tipoCompraOpcoes label', {hasText:'Normal'}).first().locator('input').isDisabled()) &&
   !(await p.locator('#tipoCompraOpcoes label', {hasText:'Urgente'}).first().locator('input').isDisabled()),
   'desligou opção que devia continuar valendo');
const forcou = await p.evaluate(()=>{
  marcarRadio('tipoCompra','mensal');
  return { estado: estado.tipoCompra,
           marcado: !!document.querySelector('input[name="tipoCompra"][value="mensal"]:checked') };
});
ok('6b nem por código dá para marcar Mensal',
   forcou.estado !== 'mensal' && !forcou.marcado, JSON.stringify(forcou));
const rotulos = await p.evaluate(()=>[...document.querySelectorAll('#tipoCompraOpcoes label')].map(l=>l.textContent.trim().split('\n')[0]));
ok('6 sem "Programada" na tela', !rotulos.some(r=>/Programada/.test(r)),
   'a tela ainda oferece Programada: ' + JSON.stringify(rotulos));

await p.close();
await b.close();

// 7 — as telas que leem pedidos antigos ainda sabem traduzir "programada".
//     Sem isto, todo pedido aberto antes de 18/09 mostraria o id cru.
for(const arq of ['compras.html','pedido.html']){
  const txt = fs.readFileSync(__dirname + '/' + arq, 'utf8');
  const linha = (txt.match(/const TIPOS?_COMPRA = \{[^}]*\}/) || [''])[0];
  ok('7 ' + arq + ' conhece mensal', /mensal:/.test(linha), 'mapa: ' + linha);
  ok('7 ' + arq + ' ainda traduz programada', /programada:/.test(linha),
     'pedido antigo mostraria o id cru — mapa: ' + linha);
}

// 8 — o n8n não lê mais o número pelo título do card.
const motor = fs.readFileSync(__dirname + '/n8n-o-que-fazer.js', 'utf8');
ok('8 n8n não parseia o título', !/t\.name/.test(motor),
   'o código do n8n ainda lê t.name para descobrir o número');
ok('8 n8n usa o número do banco', /const numero = \(permissao && permissao\.numero\)/.test(motor),
   'o número deixou de vir de permissao.numero');

console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
