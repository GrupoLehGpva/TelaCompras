/* Nó "Uma mensagem por aprovador" — workflow "Compras · Lista de aprovação no
 * Slack (4x ao dia, por etapa)" (ykeUzqJwdY5nXnlt).
 *
 * Cópia fiel do que está no n8n. A regra de quem recebe está em
 * lista-de-aprovacao.sql (`filas_pendentes`); aqui mora o texto da mensagem e
 * a decisão de quem NÃO dá para avisar.
 *
 * ----------------------------------------------------------------------------
 * O ERRO DE 30/09 — E POR QUE ELE ERA PIOR DO QUE PARECIA
 *
 * A execução das 9h (financeiro) morreu com `invalid_arguments` do Slack.
 * A causa: um aprovador de TREINO sem `slack_user_id`. Este nó já o marcava
 * com `pular: true` e a própria nota do nó prometia que ele "sai da lista
 * aqui" — mas nada tirava o item do caminho. Ele seguia para o nó do Slack,
 * que recebia usuário e texto vazios e estourava.
 *
 * O estrago não é o erro: é a execução morrer NO MEIO. Os aprovadores que
 * vinham depois na lista ficam sem a mensagem deles, e ninguém percebe —
 * quem não recebeu não sabe que deveria ter recebido. Naquele dia deu sorte:
 * o único item da fila financeira era o de treino. No dia em que o ELTON
 * (liderança de 6 facilitadores, sem Slack cadastrado) tivesse um pedido
 * parado, ele derrubaria a lista de todo mundo que viesse depois.
 *
 * A correção tem duas partes, e as duas importam:
 *   1. o nó "Tem Slack para avisar?" (IF, logo adiante) tira do caminho quem
 *      não dá para avisar — a saída falsa é um beco sem saída de propósito;
 *   2. o item pulado leva `quantidade` e `numeros`, para a execução dizer O
 *      QUE ficou parado com aquela pessoa, e não só que alguém foi pulado.
 *
 * A lição que fica: marcar não é filtrar. Uma marca só vale se alguém age
 * sobre ela — e a nota do nó dizia que alguém agia, o que fez a leitura do
 * código parecer certa por semanas.
 * -------------------------------------------------------------------------- */

/* A função devolve um array; dependendo de como o corpo chega, ele pode vir
   como vários itens ou como um item só com o array dentro. Aceita os dois. */
const bruto = $input.all().flatMap(i => {
  const j = i.json;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.data)) return j.data;
  return [j];
});

const FILA = 'https://grupolehgpva.github.io/TelaCompras/aprovacoes.html?t=';
const FUSO = 'America/Sao_Paulo';

const diaBR = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { timeZone: FUSO });
};
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: FUSO });

/* Nome e ORDEM das etapas. O banco devolve na ordem que quiser; sem isto saía
   "Aprovações de financeira e liderança imediata", que lê o fluxo de trás
   para a frente. */
const ETAPA = { lider: 'liderança imediata', gerencial: 'gerencial', financeiro: 'financeira' };
const ORDEM = { lider: 1, gerencial: 2, financeiro: 3 };

/* QUANDO A LISTA CHEGA, por etapa (18/09). Até hoje o rodapé dizia "11h e 16h"
   para todo mundo; com horário separado por etapa isso virou mentira para o
   financeiro. O horário é derivado das etapas em que AQUELA pessoa tem pedido
   parado, e não do gatilho que rodou: quem lê quer saber o próprio horário. */
const HORARIO = {
  lider:      '8h, 11h, 14h e 16h',
  gerencial:  '8h, 11h, 14h e 16h',
  financeiro: '9h, 11h, 14h30 e 16h30'
};

const saida = [];
for (const a of bruto) {
  if (!a || !a.aprovador_id) continue;

  /* ---------------------------------------------------------------------
     SEM SLACK NÃO HÁ PARA ONDE MANDAR.

     O item continua saindo daqui — marcado com `pular: true` — para aparecer
     na execução em vez de sumir sem explicação. Quem o tira do caminho do
     Slack é o nó "Tem Slack para avisar?", logo adiante.

     Até 30/09 não havia esse nó: a marca era criada e o item seguia direto
     para o Slack, que recebia usuário e texto vazios e estourava com
     `invalid_arguments`. A execução das 9h desse dia morreu assim, por causa
     de um aprovador de TREINO sem Slack — e uma execução que morre no meio
     não avisa NINGUÉM: os aprovadores que vinham depois na lista ficaram sem
     a mensagem deles.

     Por isso o item leva também quantidade e números: se alguém está parado
     com quem não dá para avisar, a execução tem que dizer o que está parado,
     não só que alguém foi pulado. */
  if (!a.slack) {
    saida.push({ json: {
      pular: true,
      aprovador_id: a.aprovador_id,
      nome: a.nome,
      quantidade: Number(a.quantidade) || 0,
      numeros: a.numeros || [],
      motivo: 'sem Slack cadastrado'
    } });
    continue;
  }

  const lista = a.numeros || [];
  const n = Number(a.quantidade) || 0;
  const deHoje = Number(a.de_hoje) || 0;

  const cruas = (a.etapas || []).filter(Boolean);

  const etapas = cruas
    .slice()
    .sort((x, y) => (ORDEM[x] || 9) - (ORDEM[y] || 9))
    .map(e => ETAPA[e] || e);

  const resto = n > lista.length ? ' e mais ' + (n - lista.length) : '';

  /* Quantas são, e desde quando esperam.
     Antes saía "3 solicitações · 3 de hoje · a mais antiga de 10/09" — as três
     partes dizendo a mesma coisa. A data só entra quando acrescenta algo. */
  const antiga = diaBR(a.mais_antigo);
  let resumo = n + (n === 1 ? ' solicitação' : ' solicitações');
  if (n > 0 && deHoje === n) {
    resumo += n === 1 ? ', aberta hoje' : ', todas de hoje';
  } else {
    if (deHoje) resumo += ' · ' + deHoje + ' de hoje';
    if (antiga && antiga !== hojeBR()) resumo += ' · a mais antiga espera desde ' + antiga;
  }

  const quando = [...new Set(cruas.map(e => HORARIO[e]).filter(Boolean))];
  const rodape = quando.length
    ? '_Esta lista chega às ' + quando.join(', e às ') + ', nos dias úteis — não a cada pedido._'
    : '_Esta lista chega algumas vezes ao dia, nos dias úteis — não a cada pedido._';

  const texto =
    '*Pedidos esperando você*\n' +
    resumo + '\n' +
    (etapas.length ? '_Aprovação de ' + etapas.join(' e ') + '._\n' : '') +
    (lista.length ? '\n' + lista.join(', ') + resto + '\n' : '') +
    '\n👉 Abrir a fila: ' + FILA + encodeURIComponent(a.token) + '\n\n' +
    'Na tela dá para aprovar várias de uma vez, ou abrir cada pedido antes de decidir. Reprovar pede o motivo.\n' +
    rodape;

  saida.push({ json: { pular: false, slack: a.slack, nome: a.nome, quantidade: n, texto } });
}
return saida;
