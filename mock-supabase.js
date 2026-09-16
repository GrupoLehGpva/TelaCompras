/* O contrato do servidor, escrito uma vez só.
 *
 * Foi um mock que escondeu o bug mais caro deste projeto: a tela de aprovação
 * falava POST/JSON e o endpoint só entendia GET/query. As baterias passavam
 * porque cada uma simulava o servidor do seu jeito, e o jeito de cada uma
 * estava certo — só não era o do servidor.
 *
 * A regra que ficou: o formato da resposta simulada mora AQUI, num arquivo só.
 * Quando o servidor muda, muda aqui, e todas as baterias quebram juntas — que
 * é exatamente o que a gente quer que aconteça.
 */

/* Como a função abrir_pedido responde de verdade (ver abrir-pedido.sql). */
function respostaAbrirPedido(pedido, itens){
  if(!pedido) return { ok:false, erro:'nao_encontrada' };
  return { ok:true, pedido, itens: itens || [] };
}

/* Como a função criar_solicitacao responde de verdade (ver criar-solicitacao.sql).
   O formulário grava por ela, não por INSERT na tabela — e é aqui que o formato
   dessa resposta mora, para as baterias não inventarem um formato próprio. */
function respostaCriarSolicitacao({ id = 'sol-de-mentira-0001', numero = 'C2609-00001', itens = 1 } = {}){
  return { ok: true, id, numero, itens };
}

/* O que o Supabase devolve para CADA endereço que o formulário usa.
   Uma função só, para nenhuma bateria montar o seu próprio Supabase de araque
   e passar por engano. */
/* As seis pessoas juridicas do Grupo Leh, com o espacamento EXATO do GR.
   Nao arrumar: e por esse texto que o robo casa a opcao no ERP. */
const EMPRESAS_EXEMPLO = [
  { id:'elke-pi',      nome:'ELKE MONIKA ZUBER LEH-PI' },
  { id:'elke-pr',      nome:'ELKE MONIKA ZUBER LEH - PR' },
  { id:'rainer-pi',    nome:'RAINER MATHIAS LEH - PI' },
  { id:'rainer-pr',    nome:'RAINER MATHIAS LEH - PR' },
  { id:'wienfried-pi', nome:'WIENFRIED MATTHIAS LEH - PI' },
  { id:'wienfried-pr', nome:'WIENFRIED MATTHIAS LEH - PR' }
];

function respostaDoFormulario(url, { catalogo = [], centros = [], facilitador = [], empresas, criada } = {}){
  if(url.includes('/rpc/criar_solicitacao'))    return criada || respostaCriarSolicitacao();
  if(url.includes('empresas'))                  return empresas || EMPRESAS_EXEMPLO;
  if(url.includes('/rpc/facilitador_por_slack'))return facilitador;
  if(url.includes('catalogo_itens'))            return catalogo;
  if(url.includes('centros_custo'))             return centros;
  return [];
}

/* Como o endpoint de decisão responde de verdade (ver o nó
   "Responder JSON (decidido)" / "(sem agir)" do n8n). */
function respostaDecisao({ ok=true, resultado='aprovado', mensagem='aprovada', numero='' }={}){
  return ok ? { ok:true, resultado, mensagem, numero }
            : { ok:false, resultado, mensagem };
}

/* Instala as rotas numa página do Playwright.
 *
 * Ordem importa: no Playwright a rota registrada por ÚLTIMO ganha. Por isso as
 * rotas específicas (rpc/abrir_pedido) entram depois das genéricas (rpc/**). */
async function instalar(p, {
  pedido = null, itens = [], fila = null, centros = [], decisao = null,
  aoDecidir = null
} = {}){
  const json = corpo => ({ status:200, contentType:'application/json', body: JSON.stringify(corpo) });

  await p.route('**/rest/v1/centros_custo**', r => r.fulfill(json(centros)));

  if(fila !== null){
    await p.route('**/rest/v1/rpc/**', r => r.fulfill(json(fila)));
  }

  await p.route('**/rest/v1/rpc/abrir_pedido**', r => r.fulfill(json(respostaAbrirPedido(pedido, itens))));

  if(decisao !== null || aoDecidir){
    await p.route('**n8n.cloud/**', async r => {
      /* A tela manda POST com JSON. Se um dia mandar outra coisa, o teste
         precisa enxergar — por isso o corpo é entregue a quem chamou. */
      let corpo = {};
      try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = {}; }
      const resp = aoDecidir ? aoDecidir(corpo, r.request()) : decisao;
      if(resp === 'abortar') return r.abort();
      return r.fulfill(json(resp));
    });
  }
}

/* Para as baterias que despacham na mão por URL: um lugar só que sabe qual
   resposta cada endereço devolve. */
function corpoPorUrl(url, { pedido = null, itens = [], centros = [], fila = [] } = {}){
  if(url.includes('/rpc/abrir_pedido'))     return respostaAbrirPedido(pedido, itens);
  if(url.includes('/rpc/fila_de_aprovacao'))return fila;
  if(url.includes('/rpc/'))                 return fila;
  if(url.includes('solicitacao_itens'))     return itens;
  if(url.includes('centros_custo'))         return centros;
  if(url.includes('solicitacoes'))          return pedido ? [pedido] : [];
  return [];
}

module.exports = { instalar, respostaAbrirPedido, respostaDecisao, corpoPorUrl,
                   respostaCriarSolicitacao, respostaDoFormulario, EMPRESAS_EXEMPLO };
