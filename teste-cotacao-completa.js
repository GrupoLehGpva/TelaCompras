/* A conferência da cotação — que desde 22/09 NÃO TRAVA MAIS NADA.
 *
 * História curta: a regra antiga exigia orçamento e valor de cada fornecedor e
 * DEVOLVIA o card para "compras · cotação" quando algo faltava. Em 22/09 os
 * campos do quadro mudaram — saíram "Valor Fornecedor 1/2/3", "Local da
 * entrega" e "Valor Total"; ficaram três anexos de orçamento, "Fornecedor com
 * melhor valor" e "Melhor Valor". A conferência continuou lendo os ids velhos,
 * achou tudo vazio e passou a devolver todo card dizendo que faltava "o Valor
 * Fornecedor 2". Foi assim que o quadro travou.
 *
 * A decisão do Guilherme foi tirar a trava inteira: o card anda, e o que
 * faltar vira aviso no comentário. Esta bateria protege as duas metades —
 * que os campos lidos são os de hoje, e que NADA aqui barra card nenhum.
 *
 * Roda a mesma lógica do nó "Conferir a cotação" do fluxo Fou7AbMfas1ZU7Qc,
 * copiada aqui: o gatilho dele é mudança de card no ClickUp e não dá para
 * disparar sem mexer no quadro de verdade.
 */
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

/* Os ids dos campos de hoje, conferidos no card C2609-00001 em 22/09. */
const F = {
  orc1:       '4fae1d94-f195-4d6e-aca2-eb7ad4b8a088',
  orc2:       '0186c77b-0f0c-4793-8459-f56ab065a0c7',
  orc3:       'c5d354b3-cf64-460c-a00c-b91bcebbbc3a',
  fornecedor: '447da5e5-99a6-4124-afe7-7c7882e85b6c',
  valor:      'f86c15a1-9d4a-4297-8936-e51dc5bc2be4'
};

/* --- a lógica, igual à do nó "Conferir a cotação" --- */
function conferir(camposDoCard) {
  const campo = {};
  for (const c of (camposDoCard || [])) campo[c.id] = c.value;

  const temArquivo = v => Array.isArray(v) ? v.length > 0 : !!v;
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const orcamentos = [F.orc1, F.orc2, F.orc3].filter(id => temArquivo(campo[id])).length;
  const valor = num(campo[F.valor]);
  const fornecedor = String(campo[F.fornecedor] == null ? '' : campo[F.fornecedor]).trim();

  const faltando = [];
  if (!valor)      faltando.push('o *Melhor Valor*');
  if (!fornecedor) faltando.push('o *Fornecedor com melhor valor*');
  if (!orcamentos) faltando.push('o orçamento anexado');

  const resumo = valor
    ? brl(valor) + (fornecedor ? ' — ' + fornecedor : '')
    : (fornecedor ? fornecedor + ' (sem valor preenchido)' : 'sem valor preenchido');

  return {
    valor, fornecedor, orcamentos, resumo,
    avisoFaltas: faltando.length
      ? '\n\n:warning: Ficou faltando ' + faltando.join(', ') + '. O card seguiu assim mesmo.'
      : ''
  };
}

const anexo = () => [{ id:'x.pdf', title:'orcamento.pdf' }];
const cardCompleto = [
  { id: F.orc1, value: anexo() },
  { id: F.orc2, value: anexo() },
  { id: F.fornecedor, value: 'VETQUEST' },
  { id: F.valor, value: '11590' }
];

/* 1 — o card do dia 22/09, do jeito que o Herisson preencheu */
{ const r = conferir(cardCompleto);
  ok('1 lê o valor do campo de hoje', r.valor === 11590, String(r.valor));
  ok('1 lê o fornecedor', r.fornecedor === 'VETQUEST', r.fornecedor);
  ok('1 conta os orçamentos anexados', r.orcamentos === 2, String(r.orcamentos));
  ok('1 resumo em real', /R\$\s?11\.590,00/.test(r.resumo), r.resumo);
  ok('1 resumo diz o fornecedor', /VETQUEST/.test(r.resumo), r.resumo);
  ok('1 sem aviso quando está tudo lá', r.avisoFaltas === '', r.avisoFaltas); }

/* 2 — ESTE É O TESTE QUE IMPORTA: nada aqui devolve card.
       Nem sem valor, nem sem fornecedor, nem sem orçamento nenhum. */
{ const vazio = conferir([]);
  ok('2 card vazio não produz devolução',
     !/[Dd]evolv/.test(JSON.stringify(vazio)), JSON.stringify(vazio));
  ok('2 card vazio não produz "completo"',
     !('completo' in vazio), 'voltou a existir um campo que decide se o card passa');
  ok('2 card vazio só avisa', /Ficou faltando/.test(vazio.avisoFaltas), vazio.avisoFaltas);
  ok('2 o aviso diz que o card seguiu', /seguiu assim mesmo/.test(vazio.avisoFaltas), vazio.avisoFaltas);
  ok('2 e o resumo não mente', /sem valor preenchido/.test(vazio.resumo), vazio.resumo); }

/* 3 — orçamento anexado e valor em branco: era o caso que travava o quadro */
{ const r = conferir([{ id: F.orc1, value: anexo() }, { id: F.orc2, value: anexo() }]);
  ok('3 avisa o valor que falta', /Melhor Valor/.test(r.avisoFaltas), r.avisoFaltas);
  ok('3 não fala mais em "Valor Fornecedor 2"',
     !/Valor Fornecedor/.test(r.avisoFaltas), r.avisoFaltas);
  ok('3 nem em Local da entrega', !/Local da entrega/.test(r.avisoFaltas), r.avisoFaltas);
  ok('3 conta os dois orçamentos assim mesmo', r.orcamentos === 2, String(r.orcamentos)); }

/* 4 — valor preenchido e nenhum orçamento: passa, com aviso */
{ const r = conferir([{ id: F.valor, value: '900' }, { id: F.fornecedor, value: 'COSTAVET' }]);
  ok('4 aceita valor sem anexo', r.valor === 900 && r.orcamentos === 0, JSON.stringify(r));
  ok('4 avisa o orçamento que falta', /orçamento anexado/.test(r.avisoFaltas), r.avisoFaltas); }

/* 5 — valor com vírgula, como o ClickUp às vezes devolve */
{ const r = conferir([{ id: F.valor, value: '1234,56' }, { id: F.fornecedor, value: 'X' }, { id: F.orc1, value: anexo() }]);
  ok('5 vírgula vira número', r.valor === 1234.56, String(r.valor)); }

/* 6 — campo de anexo vazio é lista vazia, não "tem anexo" */
{ const r = conferir([{ id: F.orc1, value: [] }, { id: F.valor, value: '10' }, { id: F.fornecedor, value: 'Y' }]);
  ok('6 lista vazia não conta como orçamento', r.orcamentos === 0, String(r.orcamentos)); }

/* 7 — os ids velhos não podem voltar ao código do nó */
{ const velhos = ['260cd03e-0989-40f9-b537-69c8d146b94d',   // Valor Fornecedor 2
                  'f8bc2544-d859-4f7e-a3bc-60b7b4d5173d',   // Valor Fornecedor 3
                  '37268329-340c-4ebd-89ce-9fc3ea75098d'];  // Valor Total
  const meu = require('fs').readFileSync(__filename, 'utf8');
  ok('7 sem ids de campos que não existem mais',
     velhos.every(id => !meu.includes('id: \'' + id)), 'um id morto voltou ao código'); }

console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
