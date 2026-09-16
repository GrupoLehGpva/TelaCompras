// ============================================================================
// O QUE VAI EM CADA CÉLULA DA COMPARATIVA
//
// Cópia versionada do nó "Montar o que escrever", do fluxo
// `Compras · Cotação → aprovação gerencial → financeiro`. O nó lá dentro é o
// que roda; este arquivo é o que se lê e o que a bateria exercita. Mudou lá,
// muda aqui — e vice-versa.
//
// A geometria vem do modelo (`gerar-comparativa.py`):
//
//   C3:E6   valores da esquerda   — nº, solicitante, local de entrega, motivo
//   H3:O6   valores da direita    — centro de custo, tipo, entrega até, empresa
//   B11:G   itens                 — código, item, qtd, unid., conteúdo, medida
//
// De H11 em diante é do comprador (fornecedores) e da planilha (cálculos).
// Nada aqui escreve nessa faixa.
// ============================================================================

function montarPlanilha(dadosDoBanco, arquivoNoOneDrive) {
  const d = dadosDoBanco || {};
  const arquivo = arquivoNoOneDrive || {};
  const c = d.cabecalho || {};
  const itens = d.itens || [];

  if (!arquivo.id) {
    throw new Error('O OneDrive não devolveu o id do arquivo recém-criado — ' +
      'sem ele não dá para escrever nas células. Resposta: ' +
      JSON.stringify(arquivo).slice(0, 300));
  }

  // Conferir aqui, e não só no banco, porque entre uma coisa e outra existe uma
  // serialização JSON: se ela perder itens no caminho, a planilha sai curta e
  // ninguém percebe — que é exatamente o bug do modelo antigo, de novo.
  if (itens.length !== d.total_itens) {
    throw new Error('O banco disse ' + d.total_itens + ' itens e chegaram ' +
      itens.length + '. Não escrevo planilha pela metade.');
  }

  const vazio = n => new Array(n).fill(null);

  // O cabeçalho tem rótulo e valor alternados na mesma linha (A: rótulo,
  // C..E: valor, F..G: rótulo, H..O: valor). Escrever um retângulo único
  // C3:O6 passaria por cima dos rótulos de F e G — e aí os textos da planilha
  // passariam a morar aqui dentro, duplicados, prontos para divergir do modelo.
  // Por isso são duas escritas, cada uma só na área de valor.
  const esquerda = [
    [c.numero,        ...vazio(2)],
    [c.solicitante,   ...vazio(2)],
    [c.local_entrega, ...vazio(2)],
    [c.motivo,        ...vazio(2)]
  ];

  const direita = [
    [c.centro_custo, ...vazio(7)],
    [c.tipo_compra,  ...vazio(7)],
    [c.entrega_ate,  ...vazio(7)],
    [c.empresa,      ...vazio(7)]
  ];

  const linhas = itens.map(l => [
    l[0] || '',
    l[1] || '',
    (l[2] === null || l[2] === undefined) ? null : Number(l[2]),
    l[3] || '',
    (l[4] === null || l[4] === undefined) ? null : Number(l[4]),
    l[5] || ''
  ]);

  return {
    itemId: arquivo.id,
    webUrl: arquivo.webUrl || null,
    nomeArquivo: d.nome_arquivo,
    numero: d.numero,
    totalItens: d.total_itens,
    faixaCabecalhoEsquerda: 'C3:E6',
    faixaCabecalhoDireita: 'H3:O6',
    faixaItens: 'B11:G' + d.ultima_linha,
    corpoEsquerda: { values: esquerda },
    corpoDireita:  { values: direita },
    corpoItens:    { values: linhas }
  };
}

module.exports = { montarPlanilha };
