/* A regra de quando o card pode sair de "compras · cotação".
 *
 * Era: os três orçamentos E os três valores. Cotação de fornecedor único
 * existe e é legítima — o próprio formulário pergunta se é cotação ou
 * fornecedor único, com justificativa — e a regra antiga devolvia esses cards
 * para sempre.
 *
 * Passou a ser: pelo menos UM fornecedor completo. O que continua barrado é
 * fornecedor pela metade (PDF sem valor, ou valor sem PDF), porque isso não é
 * escolha de ninguém, é engano — e engano que passa vira aprovação em cima de
 * número que ninguém consegue conferir.
 *
 * Esta bateria roda a MESMA lógica do nó do n8n, copiada aqui. Não é o nó de
 * verdade: o gatilho dele é mudança de card no ClickUp e não dá para disparar
 * sem criar card de mentira. O que ela protege é a regra.
 */
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

/* --- a lógica, igual à do nó "Conferir a cotação" --- */
function conferir({ pdfs, valores, local }) {
  const faltas = [];
  for (let i = 0; i < 3; i++) {
    if (pdfs[i] && !valores[i]) faltas.push('o Valor Fornecedor ' + (i+1) + ' (tem orçamento anexado, falta o valor)');
    if (!pdfs[i] && valores[i]) faltas.push('o orçamento do Fornecedor ' + (i+1) + ' (tem valor preenchido, falta o anexo)');
  }
  const completos = [0,1,2].filter(i => pdfs[i] && valores[i] > 0);
  if (completos.length === 0)
    faltas.push('pelo menos um fornecedor completo — orçamento anexado e Valor Fornecedor preenchido');
  if (!local) faltas.push('o Local da entrega');

  const escolhido = completos.length ? valores[completos[0]] : 0;
  const positivos = completos.map(i => valores[i]);
  const menor = positivos.length ? Math.min(...positivos) : 0;
  return {
    completo: faltas.length === 0,
    faltasTexto: faltas.join(', '),
    fornecedoresCotados: completos.length,
    valorEscolhido: escolhido,
    foraDaRegra: completos.length > 1 && escolhido > menor
  };
}

const LOCAL = 'Fazenda Noricum';

// 1 — fornecedor único: passa
{ const r = conferir({ pdfs:[true,false,false], valores:[1200,0,0], local:LOCAL });
  ok('1 um fornecedor completo basta', r.completo, r.faltasTexto);
  ok('1 conta um cotado', r.fornecedoresCotados === 1, String(r.fornecedoresCotados));
  ok('1 o valor é o dele', r.valorEscolhido === 1200, String(r.valorEscolhido));
  ok('1 sem alarme de "não é o mais barato"', !r.foraDaRegra, 'alarmou com um fornecedor só'); }

// 2 — os três: continua passando
{ const r = conferir({ pdfs:[true,true,true], valores:[1000,1100,1200], local:LOCAL });
  ok('2 três completos passam', r.completo, r.faltasTexto);
  ok('2 conta três', r.fornecedoresCotados === 3);
  ok('2 sem alarme, o 1 é o mais barato', !r.foraDaRegra); }

// 3 — o 1 não é o mais barato: avisa
{ const r = conferir({ pdfs:[true,true,false], valores:[1500,900,0], local:LOCAL });
  ok('3 passa', r.completo, r.faltasTexto);
  ok('3 avisa que o Fornecedor 1 não é o mais barato', r.foraDaRegra); }

// 4 — fornecedor pela metade: barrado nos dois sentidos
{ const r = conferir({ pdfs:[true,true,false], valores:[1000,0,0], local:LOCAL });
  ok('4 PDF sem valor barra', !r.completo);
  ok('4 e diz qual', /Valor Fornecedor 2/.test(r.faltasTexto), r.faltasTexto); }
{ const r = conferir({ pdfs:[true,false,false], valores:[1000,800,0], local:LOCAL });
  ok('4 valor sem PDF barra', !r.completo);
  ok('4 e diz qual', /orçamento do Fornecedor 2/.test(r.faltasTexto), r.faltasTexto); }

// 5 — nada preenchido
{ const r = conferir({ pdfs:[false,false,false], valores:[0,0,0], local:LOCAL });
  ok('5 card vazio não passa', !r.completo);
  ok('5 pede um fornecedor completo',
     /pelo menos um fornecedor completo/.test(r.faltasTexto), r.faltasTexto); }

// 6 — o local da entrega continua obrigatório
{ const r = conferir({ pdfs:[true,false,false], valores:[1200,0,0], local:'' });
  ok('6 sem local não passa', !r.completo);
  ok('6 e diz que falta o local', /Local da entrega/.test(r.faltasTexto), r.faltasTexto); }

// 7 — valor zero não conta como cotado
{ const r = conferir({ pdfs:[true,false,false], valores:[0,0,0], local:LOCAL });
  ok('7 zero não é proposta', !r.completo, r.faltasTexto); }

console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
