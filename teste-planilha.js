// ============================================================================
// BATERIA DA PLANILHA COMPARATIVA
//
// Exercita `n8n-montar-planilha.js`, que é a cópia versionada do nó do n8n.
// O que esta bateria protege é a geometria: qual valor cai em qual célula.
// Errar isso não estoura nada — sai uma planilha bonita com o motivo no lugar
// do solicitante, e alguém cota em cima dela.
// ============================================================================

const { montarPlanilha } = require('./n8n-montar-planilha.js');

let falhas = 0;
function ok(nome, obtido, esperado) {
  const bate = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log((bate ? 'ok    ' : 'FALHA ') + nome.padEnd(58) +
    (bate ? '' : '\n        esperado=' + JSON.stringify(esperado) +
                 '\n        obtido  =' + JSON.stringify(obtido)));
}
function estoura(nome, fn, pedaco) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  const bate = msg !== null && msg.includes(pedaco);
  if (!bate) falhas++;
  console.log((bate ? 'ok    ' : 'FALHA ') + nome.padEnd(58) +
    (bate ? '' : '\n        mensagem=' + msg));
}

const doBanco = {
  numero: 'C2609-00001',
  nome_arquivo: 'C2609-00001-Comparativo.xlsx',
  total_itens: 3,
  ultima_linha: 13,
  cabecalho: {
    numero: 'C2609-00001',
    centro_custo: '3180 · MANUTENÇÃO',
    solicitante: 'MARIA EDUARDA ANTUNES MACIEL SIQUEIRA',
    tipo_compra: 'Urgente',
    local_entrega: 'Fazenda Noricum — Guarapuava/PR',
    entrega_ate: '30/09/2026',
    motivo: 'Reposição do estoque de limpeza',
    empresa: 'WIENFRIED MATTHIAS LEH - PR'
  },
  itens: [
    ['8210', 'BIOPLUS 2B (20 KG)', 200, 'KG', 20, 'kg'],
    ['LIM-04', 'SABONETE LÍQUIDO 5L', 12, 'Galão', 5, 'L'],
    ['EPI-02', 'LUVA NITRÍLICA TAM. G', 20, 'Par', null, null]
  ]
};
const arquivo = { id: 'ITEM123', webUrl: 'https://onedrive/x' };

console.log('\n--- AS FAIXAS, QUE É ONDE CADA COISA CAI ---');
const r = montarPlanilha(doBanco, arquivo);
ok('valores da esquerda vão em C3:E6', r.faixaCabecalhoEsquerda, 'C3:E6');
ok('valores da direita vão em H3:O6', r.faixaCabecalhoDireita, 'H3:O6');
ok('3 itens ocupam B11 até G13', r.faixaItens, 'B11:G13');
const duzentos = montarPlanilha({ ...doBanco, total_itens: 200, ultima_linha: 210,
  itens: Array.from({ length: 200 }, (_, i) => ['C' + i, 'ITEM ' + i, 1, 'UN', null, null]) },
  arquivo);
ok('200 itens ocupariam até G210', duzentos.faixaItens, 'B11:G210');

// A faixa dizer B11:G210 não prova que 200 linhas foram escritas. O modelo
// antigo calculava até a linha 70 e o 61º item sumia das contas sem avisar —
// se alguém reintroduzir um corte desses aqui, é ESTA linha que grita, não a
// de cima. Foi um teste de mutação que mostrou a diferença.
ok('e 200 linhas saem de fato, não 60', duzentos.corpoItens.values.length, 200);
ok('a última linha escrita é o último item', duzentos.corpoItens.values[199][1], 'ITEM 199');

console.log('\n--- A ORDEM DO CABEÇALHO (trocar duas linhas não estoura nada) ---');
ok('C3 é o número da solicitação', r.corpoEsquerda.values[0][0], 'C2609-00001');
ok('C4 é o solicitante', r.corpoEsquerda.values[1][0], 'MARIA EDUARDA ANTUNES MACIEL SIQUEIRA');
ok('C5 é o local de entrega', r.corpoEsquerda.values[2][0], 'Fazenda Noricum — Guarapuava/PR');
ok('C6 é o motivo', r.corpoEsquerda.values[3][0], 'Reposição do estoque de limpeza');
ok('H3 é o centro de custo', r.corpoDireita.values[0][0], '3180 · MANUTENÇÃO');
ok('H4 é o tipo de compra', r.corpoDireita.values[1][0], 'Urgente');
ok('H5 é a entrega até', r.corpoDireita.values[2][0], '30/09/2026');
ok('H6 é a empresa', r.corpoDireita.values[3][0], 'WIENFRIED MATTHIAS LEH - PR');

console.log('\n--- A LARGURA: escrever largo demais come rótulo da planilha ---');
ok('a esquerda tem 3 colunas (C,D,E)', r.corpoEsquerda.values.map(l => l.length), [3,3,3,3]);
ok('a direita tem 8 colunas (H..O)', r.corpoDireita.values.map(l => l.length), [8,8,8,8]);
ok('cada item tem 6 colunas (B..G)', r.corpoItens.values.map(l => l.length), [6,6,6]);
ok('o resto da esquerda vai nulo, não vazio', r.corpoEsquerda.values[0].slice(1), [null, null]);

console.log('\n--- OS ITENS ---');
ok('item 1 inteiro', r.corpoItens.values[0], ['8210', 'BIOPLUS 2B (20 KG)', 200, 'KG', 20, 'kg']);
ok('item sem conteúdo por unidade fica nulo, não zero',
   r.corpoItens.values[2], ['EPI-02', 'LUVA NITRÍLICA TAM. G', 20, 'Par', null, '']);
ok('quantidade vira número, não texto', typeof r.corpoItens.values[0][2], 'number');
ok('quantidade em texto no banco também vira número',
   montarPlanilha({ ...doBanco, total_itens: 1, ultima_linha: 11,
     itens: [['X', 'ITEM', '12.5', 'UN', '0.5', 'L']] }, arquivo).corpoItens.values[0],
   ['X', 'ITEM', 12.5, 'UN', 0.5, 'L']);
ok('item sem código não some: vira string vazia',
   montarPlanilha({ ...doBanco, total_itens: 1, ultima_linha: 11,
     itens: [[null, 'ITEM FORA DE CATÁLOGO', 3, 'UN', null, null]] }, arquivo).corpoItens.values[0],
   ['', 'ITEM FORA DE CATÁLOGO', 3, 'UN', null, '']);

console.log('\n--- NADA ESCREVE ONDE O COMPRADOR TRABALHA ---');
ok('nenhuma linha de item chega na coluna H (Fornecedor 1)',
   r.corpoItens.values.every(l => l.length === 6), true);
ok('sai uma linha por item, nem uma a mais nem a menos',
   r.corpoItens.values.length, doBanco.total_itens);

console.log('\n--- AS TRAVAS ---');
estoura('sem id do arquivo, para antes de escrever',
  () => montarPlanilha(doBanco, { webUrl: 'https://x' }), 'não devolveu o id');
estoura('item a menos na travessia: para e diz quantos',
  () => montarPlanilha({ ...doBanco, total_itens: 4 }, arquivo),
  'disse 4 itens e chegaram 3');
estoura('item a mais na travessia: também para',
  () => montarPlanilha({ ...doBanco, total_itens: 2 }, arquivo),
  'disse 2 itens e chegaram 3');

console.log('\n===== FALHAS (' + falhas + ') =====\n');
process.exit(falhas ? 1 : 0);
