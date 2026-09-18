/* ============================================================================
   CONFERIDOR DE TRECHOS REPETIDOS

   As quatro telas são arquivos únicos, de propósito: cada uma abre sozinha, sem
   build, sem servidor, sem passo de publicação. O preço disso é que alguns
   pedaços vivem copiados em mais de um arquivo — as cores da marca, a função
   que escapa HTML, a concordância de plural, o jeito de chamar o banco.

   Cópia não é o problema. O problema é a cópia que ANDA sozinha: alguém
   conserta o escape numa tela e esquece das outras três, e a falha continua
   viva no arquivo que ninguém abriu.

   Este script não conserta nada. Ele compara os trechos e grita quando eles
   deixam de ser iguais. Rodar antes de publicar:

       node conferir-repetidos.js

   Sai com código 1 se algum trecho divergiu — dá para pendurar num hook.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const TELAS = ['index.html', 'pedido.html', 'decisao.html', 'aprovacoes.html',
               'contrato.html', 'acompanhar.html'];

/* Um trecho = um pedaço que deveria ser idêntico onde quer que apareça.
   `de` e `ate` são marcas de texto; o trecho é o que está entre elas. */
const TRECHOS = [
  { nome: 'paleta da marca (:root)',       de: ':root{',                      ate: '\n  }' },
  { nome: 'escape de HTML (esc)',          de: 'const esc = t =>',            ate: ';\n' },
  { nome: 'endereço do Supabase',          de: "const SUPABASE_URL",          ate: ';\n' },
  { nome: 'chave publicável',              de: "const SUPABASE_KEY",          ate: ';\n' },
  { nome: 'tabela de plural',              de: 'const UNIDADES_PLURAL',       ate: '};' },
  { nome: 'plural de palavra',             de: 'function pluralPalavra',      ate: '\n}' }
];

const normalizar = t => t.replace(/\r/g, '').replace(/[ \t]+$/gm, '').trim();

function extrair(texto, { de, ate }){
  const i = texto.indexOf(de);
  if(i === -1) return null;
  const j = texto.indexOf(ate, i + de.length);
  if(j === -1) return null;
  return normalizar(texto.slice(i, j + ate.length));
}

const problemas = [];
const resumo = [];

for(const trecho of TRECHOS){
  const achados = new Map();          // conteúdo -> [arquivos]
  for(const arq of TELAS){
    const caminho = path.join(__dirname, arq);
    if(!fs.existsSync(caminho)) continue;
    const t = extrair(fs.readFileSync(caminho, 'utf8'), trecho);
    if(t === null) continue;          // a tela não usa este trecho: tudo bem
    if(!achados.has(t)) achados.set(t, []);
    achados.get(t).push(arq);
  }

  if(achados.size === 0){ resumo.push('—  ' + trecho.nome + ': não aparece em nenhuma tela'); continue; }
  if(achados.size === 1){
    const [[, arquivos]] = achados;
    resumo.push('ok ' + trecho.nome + ': igual em ' + arquivos.length +
                (arquivos.length === 1 ? ' tela' : ' telas'));
    continue;
  }

  /* Divergiu: mostra qual grupo tem quais arquivos e onde começam a diferir. */
  const grupos = [...achados.entries()].sort((a,b)=> b[1].length - a[1].length);
  const linhas = grupos.map(([conteudo, arquivos], n) =>
    '     versão ' + (n+1) + ' — ' + arquivos.join(', ') + '\n' +
    '       ' + conteudo.split('\n')[0].slice(0, 100));
  problemas.push('!! ' + trecho.nome + ' está em ' + grupos.length + ' versões diferentes:\n' + linhas.join('\n'));
}

/* ============================================================================
   TODA LEITURA DE TABELA PRECISA DIZER ATÉ ONDE VAI

   Em 18/09, de manhã, o catálogo do formulário estava carregando 1.000 dos
   7.084 itens. Ninguém tinha mexido nele; a consulta simplesmente não pedia
   `limit`, e o PostgREST corta em 1.000 sem dizer nada — HTTP 200, lista
   curta, selo verde escrito "1000 itens". A busca parava em "BRACO
   PARALELO..."; de C a Z não existia nada. E quem não acha o item marca "fora
   do catálogo", então o pedido seguia sem o código do GR.

   Os centros de custo pediam `limit=2000` desde sempre e por isso estavam
   inteiros. A diferença era essa, e só essa.

   Esta conferência é estática de propósito: ela não precisa de rede, roda em
   milissegundos, e pega o erro no arquivo — antes de virar um dia de
   demonstração com metade do catálogo faltando.
   ========================================================================== */
const semTeto = [];
for(const tela of TELAS.concat(['compras.html', 'cotacao.html'])){
  const p = path.join(__dirname, tela);
  if(!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf8');
  /* Só leitura de TABELA: `/rpc/` é função, devolve o que a função mandar. */
  const re = /apiGet\(\s*'([a-z_]+\?select=[^']*)'/g;
  let m;
  while((m = re.exec(txt)) !== null){
    const consulta = m[1];

    /* Tem teto: serve tanto `limit=2000` cravado quanto `limit=' + TETO`, que
       termina a string ali e continua em concatenação. */
    if(/[?&]limit=/.test(consulta)) continue;

    /* Busca de UMA linha por chave: a string termina em `<coluna>=eq.` porque
       o valor entra concatenado. Uma linha não tem como ser cortada em mil. */
    if(/[?&](codigo|id|numero|token|card_id)=eq\.$/.test(consulta)) continue;

    semTeto.push(tela + ' → ' + consulta.slice(0, 90));
  }
}
if(semTeto.length === 0){
  resumo.push('ok teto nas leituras: toda consulta de tabela pede limit');
} else {
  problemas.push('!! consulta de tabela sem `limit` (o PostgREST corta em 1.000 calado):\n     ' +
                 semTeto.join('\n     '));
}

console.log(resumo.join('\n'));
if(problemas.length){
  console.log('\n===== TRECHOS QUE ANDARAM SOZINHOS (' + problemas.length + ') =====');
  console.log(problemas.join('\n\n'));
  console.log('\nIguale as versões antes de publicar. Se a diferença for de propósito,\n' +
              'tire o trecho desta lista e escreva no código por que ele é diferente.');
  process.exit(1);
}
console.log('\nNenhum trecho divergiu.');
