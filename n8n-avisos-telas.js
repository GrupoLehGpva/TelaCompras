/* MONTAR AS MENSAGENS — caminho das telas (sem ClickUp)
 *
 * Entra: os avisos que o banco acabou de RESERVAR (reservar_avisos). Cada aviso
 * é uma coisa que aconteceu num pedido, com a lista de quem deve saber.
 * Sai: uma DM por pessoa que deve ser avisada agora.
 *
 * Regras (decididas pelo Guilherme):
 * - Aprovador só recebe DM na hora quando a compra é URGENTE. As outras chegam
 *   na lista 4x ao dia, que continua ativa e já inclui os pedidos das telas.
 *   Exceção: reprovação no financeiro, que é informação ao gerente, sai sempre.
 * - Comprador: só o responsável pelo facilitador recebe (o banco já manda só ele).
 * - Quem não tem Slack cadastrado não recebe, e isso fica registrado na saída.
 * - DM sempre, nunca canal: o link carrega o token pessoal de quem recebe.
 *
 * Espelho de n8n-avisos-telas.js no repositório, coberto por teste. */

const BASE = 'https://grupolehgpva.github.io/TelaCompras/';
const PAGINA = {
  aprovador:   'aprovacoes.html',   // fila de quem decide
  facilitador: 'acompanhar.html',   // pedidos de quem pediu
  comprador:   'mesa-cotacao.html'  // Mesa de Cotação (entra no ar na etapa 4)
};

const ETAPA = {
  lider: 'liderança imediata', gerencial: 'aprovação gerencial',
  financeiro: 'aprovação financeira', cotacao: 'cotação', edicao: 'edição', lote: 'lote mensal'
};
const PROXIMO = {
  lider:      'está esperando a liderança imediata.',
  gerencial:  'está esperando a aprovação gerencial.',
  financeiro: 'está esperando a aprovação financeira.',
  cotacao:    'está com o comprador, em cotação.',
  lote:       'está aguardando o lote mensal: entra na cotação na virada do dia 19 para o 20.'
};
const CAMPO = {
  solicitante_nome: 'para quem é', observacao: 'observação', empresa_id: 'empresa',
  centro_custo: 'centro de custo', unidade_destino: 'unidade de destino',
  local_entrega: 'local de entrega', tipo_compra: 'tipo de compra',
  definicao_fornecedor: 'definição de fornecedor', justificativa_fornecedor: 'justificativa',
  data_necessidade: 'data de necessidade', motivo: 'motivo', itens: 'itens'
};

/* Revisão item a item da gerência na compra mensal (02/10): o que mudou nos
   itens vai junto do aviso de quem pediu. Até 8 linhas; o resto vira "e mais N". */
const qtd = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
function textoAjustes(aj) {
  if (!aj) return '';
  const linhas = [];
  (aj.cortados || []).forEach(c => linhas.push('• Reprovado: ' + limpa(c.descricao) + ' — ' + limpa(c.motivo)));
  (aj.mudados || []).forEach(m => linhas.push('• Alterado: ' + limpa(m.descricao) + ' — ' + qtd(m.de_quantidade) + ' ' + limpa(m.de_unidade) +
                                              ' → ' + qtd(m.quantidade) + ' ' + limpa(m.unidade)));
  (aj.incluidos || []).forEach(n => linhas.push('• Incluído: ' + limpa(n.descricao) + ' — ' + qtd(n.quantidade) + ' ' + limpa(n.unidade)));
  if (!linhas.length) return '';
  const mostra = linhas.slice(0, 8);
  if (linhas.length > 8) mostra.push('… e mais ' + (linhas.length - 8) + '. Veja tudo no link abaixo.');
  return '\nA gerência ajustou os itens:\n' + mostra.join('\n');
}

const brl = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const link = (papel, token) => token ? BASE + PAGINA[papel] + '?t=' + encodeURIComponent(token) : null;
const limpa = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '‹', '>': '›', '&': 'e' }[c])).trim();

/* Coisas que pedem uma DECISÃO do aprovador: estas seguem a regra do urgente. */
const TAREFA_DO_APROVADOR = ['criado', 'aprovado', 'cotacao_enviada', 'edicao_salva', 'cancelado'];

function texto(a, d) {
  const num = '*' + limpa(a.numero) + '*';
  const assunto = limpa(a.assunto) || 'sem motivo escrito';
  const url = link(d.papel, d.token);
  const seg = a.etapa_seguinte;
  const total = brl(a.total);

  if (d.papel === 'facilitador') {
    let frase = null;
    if (a.acao === 'criado')          frase = num + ' foi registrada e ' + (PROXIMO[seg] || 'está em andamento.');
    if (a.acao === 'aprovado')        frase = seg ? num + ' foi aprovada na ' + (ETAPA[a.etapa] || a.etapa) + ' e agora ' + (PROXIMO[seg] || 'segue.')
                                                  : num + ' foi aprovada em todas as etapas. A ordem de compra será emitida.';
    if (a.acao === 'reprovado')       frase = num + ' foi reprovada na ' + (ETAPA[a.etapa] || a.etapa) + '.\nMotivo: ' + limpa(a.motivo);
    if (frase && a.acao === 'aprovado' && a.ajustes) frase += textoAjustes(a.ajustes);   // reprovação total já traz cada item no motivo
    if (a.acao === 'cotacao_enviada') frase = num + ' teve a cotação concluída e agora ' + (PROXIMO[seg] || 'segue.');
    if (a.acao === 'entrou_no_lote')  frase = num + ' entrou no lote mensal e agora ' + (PROXIMO[seg] || 'segue.');
    if (a.acao === 'edicao_expirada') frase = 'A edição de ' + num + ' ficou aberta sem ser salva e foi desfeita. ' +
                                              'O pedido voltou para a liderança como estava. Você ainda pode editar uma vez, enquanto a liderança não decidir.';
    if (!frase) return null;
    return frase + (url ? '\n\n👉 Acompanhar: ' + url + '\n_Este link é seu e mostra todas as suas solicitações._' : '');
  }

  if (d.papel === 'aprovador') {
    const decidir = url ? '\n\n👉 Decidir: ' + url + '\n_Este link é seu. Quem abrir decide no seu nome — não repasse._' : '';
    if (a.acao === 'reprovado')
      return num + ' foi reprovada na ' + (ETAPA[a.etapa] || a.etapa) + ' por ' + limpa(a.quem) + '.\nMotivo: ' + limpa(a.motivo);
    if (a.acao === 'cancelado')
      return num + ' foi cancelada por ' + limpa(a.quem) + '. Não precisa mais decidir.' + (a.motivo ? '\nMotivo: ' + limpa(a.motivo) : '');
    if (a.acao === 'edicao_salva') {
      const mudou = Object.keys(a.mudou || {}).map(k => CAMPO[k] || k);
      return '✏️ ' + num + ' foi alterada por ' + limpa(a.quem) + ' e voltou para a sua decisão. Confira antes de decidir.' +
             (mudou.length ? '\nMudou: ' + mudou.join(', ') + '.' : '\nNada foi alterado.') + decidir;
    }
    if (['criado', 'aprovado', 'cotacao_enviada'].includes(a.acao))
      return '🔴 *Compra urgente esperando você*\n' + num + ' — ' + assunto + '\n' +
             'Pedido de ' + (limpa(a.facilitador) || 'um facilitador') + ' · ' + (ETAPA[seg] || seg || '—') +
             (total ? ' · ' + total : '') + decidir +
             '\n_Você recebe este aviso na hora porque a compra é urgente. As outras chegam na sua lista do dia._';
    return null;
  }

  if (d.papel === 'comprador') {
    const cotar = url ? '\n\n👉 Mesa de Cotação: ' + url + '\n_Este link é seu. Não repasse._' : '';
    if ((a.acao === 'criado' || a.acao === 'aprovado') && seg === 'cotacao')
      return (a.urgente ? '🔴 *Pedido URGENTE para cotação*\n' : '🛒 *Novo pedido para cotação*\n') +
             num + ' — ' + assunto + '\nPedido de ' + (limpa(a.facilitador) || 'um facilitador') + cotar;
    if (a.acao === 'devolvido')
      return '↩️ ' + num + ' foi devolvida por ' + limpa(a.quem) + ' (' + (ETAPA[a.etapa] || a.etapa) + ').\nMotivo: ' + limpa(a.motivo) + cotar;
    if (a.acao === 'aprovado' && !seg)
      return '✅ ' + num + ' foi aprovada em todas as etapas' + (total ? ' (' + total + ')' : '') + '. A ordem de compra será emitida.';
    return null;
  }
  return null;
}

/* O HTTP Request devolve o array do banco já partido em itens; aceita também
   um item com o array dentro, para não depender disso. */
const avisos = [];
for (const it of $input.all()) {
  const j = it.json;
  if (Array.isArray(j)) avisos.push(...j);
  else if (j && Array.isArray(j.data)) avisos.push(...j.data);
  else if (j && j.id !== undefined && j.acao) avisos.push(j);
}

const saida = [];
for (const a of avisos) {
  for (const d of (a.para || [])) {
    const base = { aviso_id: a.id, numero: a.numero, acao: a.acao, papel: d.papel, pessoa: d.nome };
    if (d.papel === 'aprovador' && TAREFA_DO_APROVADOR.includes(a.acao) && !a.urgente) {
      continue; // chega na lista do dia
    }
    if (!d.slack) { saida.push({ json: { ...base, enviar: false, motivo: 'sem Slack cadastrado' } }); continue; }
    const t = texto(a, d);
    if (!t) { saida.push({ json: { ...base, enviar: false, motivo: 'sem mensagem para esta combinação' } }); continue; }
    saida.push({ json: { ...base, enviar: true, slack: d.slack, texto: t } });
  }
}
return saida;
