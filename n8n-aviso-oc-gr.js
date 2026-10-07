// Quem recebe o aviso de OC que não foi criada no GR (DM no Slack).
const PARA = ['U0BTEULHL3G', 'U0BL5JPQX97']; // Herisson, Guilherme
const sem = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const brl = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/* Para cada motivo conhecido, o que fazer. A primeira regra que casa vale. */
const REGRAS = [
  [/centro de investimento/, 'Falta dizer qual centro de investimento do GR essa unidade usa. Herisson: informe à TI qual centro usar para essa unidade; a TI cadastra e reenvia a OC.'],
  [/prazo repetido|acima de 365/, 'A condição de pagamento tem prazo repetido ou acima de 365 dias. Herisson: confirme a condição certa com o fornecedor e informe à TI, que corrige e refaz a OC.'],
  [/condicao de pagamento/, 'A condição de pagamento está vazia ou num formato que a automação não entende (o certo é algo como 30/60/90, 28 dias ou à vista). Herisson: informe a condição certa à TI, que corrige e refaz a OC.'],
  [/forma de pagamento/, 'Falta a forma de pagamento (boleto, pix, depósito...) do fornecedor. Herisson: informe à TI, que corrige e refaz a OC.'],
  [/nao tem fornecedor escolhido/, 'Um item ficou sem fornecedor escolhido no mapa da Mesa. Herisson: informe à TI qual fornecedor ficou com esse item; a TI corrige e refaz a OC.'],
  [/sem preco|sem quantidade|preco|quantidade/, 'Um item está sem preço ou sem quantidade. Herisson: informe à TI o valor certo; a TI corrige e refaz a OC.'],
  [/codigo do catalogo/, 'Um item do pedido não tem código do catálogo do GR. Herisson: diga à TI qual código do GR usar para esse item; a TI corrige e refaz a OC.'],
  [/nao esta ativo no gr/, 'Um item do pedido não está ativo no cadastro de itens do GR. Herisson: ative o item no GR (ou diga à TI qual código usar) e avise a TI para refazer a OC.'],
  [/nao esta no cadastro de fornecedores/, 'O fornecedor escolhido não está no cadastro de fornecedores do sistema de compras. Herisson: cadastre o fornecedor (ou informe à TI o código dele no GR); a TI refaz a OC.'],
  [/fornecedor/, 'O fornecedor escolhido não tem o código do GR no cadastro do sistema de compras. Herisson: informe à TI o código desse fornecedor no GR (se ele não existir no GR, cadastre lá primeiro); a TI completa o cadastro e refaz a OC.'],
  [/empresa/, 'O pedido está sem empresa, ou a empresa não tem código do GR. A TI corrige o cadastro e refaz a OC.'],
  [/mapa de cotacao/, 'O pedido foi aprovado sem o mapa de cotação enviado pela Mesa. Herisson: confira na Mesa se a cotação desse pedido foi enviada e avise a TI.'],
  [/rateio/, 'Problema no rateio do lote mensal. A TI confere o pacote e refaz a OC.'],
  [/aprovad|pacote da gerencia|nao tem pacote/, 'O pedido não estava aprovado em todas as etapas quando a automação rodou. A TI confere a aprovação e refaz a OC.'],
  [/sem nome|sem itens|nao tem itens/, 'Faltam dados nos itens do pedido. A TI confere o pedido e refaz a OC.'],
  [/soma|parcelas|nao bate/, 'Os valores não fecharam na montagem (itens ou parcelas). A TI confere antes de reenviar.'],
  [/usuario|senha|token|login|autentica|acesso negado/, 'Problema de acesso da automação ao GR (usuário, senha ou token). Só a TI resolve; nada a fazer no pedido.'],
  [/permiss/, 'O usuário da automação não tem permissão no GR para essa operação. A TI pede a liberação e reenvia.'],
  [/resposta inesperada|http 5|timeout|tempo/, 'O GR respondeu com erro técnico. A TI confere no GR e reenvia.']
];
function comoResolver(motivo, padrao) {
  const t = sem(motivo);
  for (const [re, como] of REGRAS) if (re.test(t)) return como;
  return padrao;
}
const RODAPE = 'O pedido continua aprovado. Não lance essa OC à mão no GR sem falar com a TI, para não sair repetida.';
function blocos(motivos, padrao) {
  const lista = [...new Set(motivos.map(m => String(m).trim()).filter(Boolean))];
  const comos = [...new Set(lista.map(m => comoResolver(m, padrao)))];
  const ponto = arr => arr.length === 1 ? arr[0] : arr.map(x => '• ' + x).join('\n');
  return '*Por quê:* ' + (lista.length > 1 ? '\n' : '') + ponto(lista) + '\n*Como consertar:* ' + (comos.length > 1 ? '\n' : '') + ponto(comos);
}
const quem = n => /^L\d/.test(String(n || '')) ? 'o pacote ' + n : 'o pedido ' + (n || '?');
const doQuem = n => 'd' + quem(n);
/* Separa os motivos ("a; b; c") e tira o que é só recado técnico. */
const motivosDe = erro => String(erro || '').replace(/^Pedido não pode virar OC:\s*/, '')
  .replace(/\s*\(cadastrar em centros_investimento_gr\)/g, '').replace(/;\s*corrija na Mesa/g, '')
  .split(/;\s+(?=(?:a|o|as|os|um|falta|não|nao)\s|C\d{4}-\d+:)/i);
// AVISO: OC recusada pelo GR (ou sem resposta). Entra: saída de "Ler a resposta do GR".
const r = $input.first().json || {};
const o = $('Ordem da vez').first().json || {};
const pl = ($('Uma por vez').first().json || {}).payload || {};
const valor = brl(pl.ValorLiquido);
const forn = String(o.titulo || '').split(' · ').slice(1).join(' · ');
const desc = [forn, valor].filter(Boolean).join(' · ');
const incerta = r.resultado === 'incerta';
const titulo = incerta ? '*OC talvez não criada no GR (sem resposta)*' : '*OC não criada no GR*';
const oque = '*O que aconteceu:* a OC ' + doQuem(o.numero) + (desc ? ' (' + desc + ')' : '') +
  (incerta ? ' foi enviada ao GR, mas a conexão caiu antes da resposta.' : ' foi enviada ao GR e foi recusada.');
const corpo = incerta
  ? '*Por quê:* ' + String(r.erro || 'a conexão caiu sem resposta').slice(0, 500) +
    '\n*Como consertar:* a OC pode ter sido criada ou não. Procure no GR pelo título "' + (o.titulo || '') + '": se estiver lá, avise a TI com o número da OC; se não estiver, avise a TI para reenviar.'
  : blocos(motivosDe(String(r.erro || 'o GR não disse o motivo').slice(0, 600)),
      'O GR recusou com a mensagem acima. Herisson: veja se é um dado do pedido (fornecedor, item, valor, cadastro) e avise a TI; a TI corrige e reenvia a OC.');
const texto = [titulo, oque, corpo, RODAPE].join('\n');
return PARA.map(para => ({ json: { para, texto } }));
