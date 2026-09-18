/* Nó "Decide a DM do aprovador" — workflow "Compras · Avisar quem pediu a cada
   etapa" (s2G3pJQJu3zmoiBg).
 *
 * POR QUE EXISTE
 * Em 18/09 o C2609-00001 entrou na aprovação financeira às 16:00:57 — 57
 * segundos depois do lembrete das 16h ter rodado. A fila do Wienfried
 * funcionava e o link dele era válido, mas ninguém contou a ele: o aviso de
 * mudança de etapa sempre foi para quem PEDIU, nunca para o novo aprovador.
 * Numa sexta, o próximo lembrete cairia segunda às 11h. 67 horas parado.
 *
 * O AVISO IMEDIATO VALE SÓ PARA URGENTE. Decisão do Guilherme, e é o ponto do
 * desenho: a lista 2× ao dia existe justamente para não virar uma DM por
 * pedido. Urgente é a exceção que paga o incômodo — é equipamento ou atividade
 * parada.
 *
 * Devolve zero ou um item. Zero e o nó seguinte simplesmente não roda, sem IF
 * e sem ramo vazio — o mesmo padrão de "Quem precisa saber da reprovação".
 *
 * A LEITURA DEPOIS DA PAUSA É O QUE IMPEDE MENTIRA. A coluna do card muda
 * primeiro; a trava da cotação e a gravação da etapa vêm depois, em outra
 * execução. Sem a espera, o card recém-chegado em "aprovação gerencial" que a
 * trava vai devolver renderia uma DM chamando o gerente para decidir um pedido
 * que já voltou para o comprador. Por isso este nó pendura na mesma espera de
 * seis segundos que o aviso de quem pediu, e por isso a consulta exige
 * status 'aguardando aprovacao' — se voltou, ela não acha ninguém.
 */
const bruto  = $input.first().json;
const linhas = Array.isArray(bruto) ? bruto : (bruto && Array.isArray(bruto.data) ? bruto.data : [bruto]);
const r = (linhas && linhas[0]) || {};

/* Três portas, nesta ordem, e cada uma por um motivo diferente:
   - achou:  o card não tem ninguém esperando decisão (está em cotação, já foi
             decidido, ou a trava o devolveu enquanto esperávamos).
   - urgente: é o combinado — o resto chega na lista das 11h/16h.
   - slack:  aprovador sem Slack cadastrado. Não dá para avisar, e inventar um
             canal seria pior. */
if (r.achou !== true)   return [];
if (r.urgente !== true) return [];
if (!r.slack)           return [];

const FILA  = 'https://grupolehgpva.github.io/TelaCompras/aprovacoes.html?t=';
const ETAPA = { lider: 'da liderança imediata', gerencial: 'gerencial', financeiro: 'financeira' };

const texto =
  '🔴 *Compra urgente esperando você*\n' +
  '*' + r.numero + '* — ' + (r.motivo || 'sem motivo escrito') + '\n' +
  'Pedido de ' + (r.facilitador || 'um facilitador') +
    ' · aprovação ' + (ETAPA[r.etapa] || r.etapa || '—') + '\n\n' +
  '👉 Decidir: ' + FILA + encodeURIComponent(r.token) + '\n\n' +
  '_Este link é seu. Quem abrir decide no seu nome — não repasse._\n' +
  '_Você recebe este aviso na hora porque a compra é urgente. As outras chegam na lista das 11h e das 16h._';

return [{ json: { slack: r.slack, numero: r.numero, texto } }];
