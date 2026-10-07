// CONFERIR A OC CRIADA — compara o que foi para o GR com a condição e os valores do pedido.
// Só roda quando o GR criou a OC (resultado ok). Sem divergência, não manda nada.
// Avisa Herisson e Guilherme por DM. A OC já está no GR: o conserto é ajustar lá.
const PARA = ['U0BTEULHL3G', 'U0BL5JPQX97']; // Herisson, Guilherme
const sem = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataDe = s => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };

/* Prazos da condição contados de forma independente da montagem (sem juntar repetidos):
   "30/60/90" → [30,60,90]; "30/90/90/120" → [30,90,90,120]; "3x" → [30,60,90];
   "à vista"/"pix" → [0]; "entrada + 30" → [0,30]. null = não deu para entender. */
function prazosDaCondicao(c) {
  const t = sem(c);
  if (!t) return null;
  const vezes = t.match(/\b(\d{1,2})\s*x\b/);
  if (vezes && !/\d+\s*\/\s*\d+/.test(t)) return Array.from({ length: +vezes[1] }, (_, i) => 30 * (i + 1));
  const nums = (t.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ').match(/\d{1,4}/g) || []).map(Number);
  if (!nums.length) return /\b(a vista|avista|antecipad\w*|na entrega|contra entrega|pix|dinheiro)\b/.test(t) ? [0] : null;
  if (/\b(entrada|sinal|a vista)\b/.test(t) && !nums.includes(0)) nums.unshift(0);
  return nums.sort((a, b) => a - b);
}

function conferir(p) {
  const achados = [];
  const add = (oque, como) => achados.push({ oque, como });
  const parcelas = Array.isArray(p.Parcelas) ? p.Parcelas : [];
  const liquido = r2(p.ValorLiquido);
  const base = dataDe(p.Data);
  const prazos = prazosDaCondicao(p.CondicaoDePagamento);
  const COMO_PARC = 'Herisson: confirme a condição com o fornecedor e ajuste as parcelas dessa OC direto no GR (a previsão financeira sai das parcelas).';
  if (!prazos) {
    add('não consegui conferir a condição de pagamento "' + (p.CondicaoDePagamento || '') + '" contra as ' + parcelas.length + ' parcela(s) da OC', COMO_PARC);
  } else if (prazos.length !== parcelas.length) {
    add('a condição "' + p.CondicaoDePagamento + '" tem ' + prazos.length + ' prazo(s), mas a OC saiu com ' + parcelas.length + ' parcela(s)', COMO_PARC);
  } else if (base != null) {
    const dias = parcelas.map(x => { const d = dataDe(x.DataVencimento); return d == null ? null : Math.round((d - base) / 864e5); }).sort((a, b) => a - b);
    if (dias.some((d, i) => d !== prazos[i]))
      add('os vencimentos da OC (' + dias.join('/') + ' dias) não batem com a condição "' + p.CondicaoDePagamento + '"', COMO_PARC);
  }
  const somaParc = r2(parcelas.reduce((s, x) => s + Number(x.Valor || 0), 0));
  if (parcelas.length && Math.abs(somaParc - liquido) > 0.01)
    add('a soma das parcelas (' + brl(somaParc) + ') é diferente do valor da OC (' + brl(liquido) + ')', 'Herisson: ajuste o valor das parcelas no GR para fechar com o valor da OC.');
  if (base != null && parcelas.some(x => (dataDe(x.DataVencimento) ?? base) < base))
    add('tem parcela vencendo antes da data da OC', 'Herisson: corrija o vencimento da parcela no GR.');
  const somaItens = r2((p.Itens || []).reduce((s, i) => s + Number(i.ValorLiquido || 0), 0));
  if ((p.Itens || []).length && Math.abs(somaItens - liquido) > 0.01)
    add('a soma dos itens (' + brl(somaItens) + ') é diferente do valor da OC (' + brl(liquido) + ')', 'Avise a TI para conferir a montagem; ajuste o valor no GR se precisar.');
  if (String(p.FormaDePagamento || '') === 'Não especificado')
    add('a forma de pagamento saiu como "Não especificado" (a condição "' + (p.CondicaoDePagamento || '') + '" não diz se é Pix, boleto, depósito...)', 'Herisson: escolha a forma de pagamento certa nessa OC no GR.');
  const frete = /Frete combinado: (R\$\s?[\d.,]+)/.exec(String(p.Observacoes || ''));
  if (frete)
    add('o frete combinado (' + frete[1] + ') não está no valor nem nas parcelas da OC', 'Herisson: se o frete é pago a esse fornecedor, inclua no GR para a previsão sair certa.');
  return achados;
}

/* ---- dentro da n8n ---- */
const r = $input.first().json || {};
if (r.resultado !== 'ok') return [];
const o = $('Ordem da vez').first().json || {};
const p = o.corpo || {};
const achados = conferir(p);
if (!achados.length) return [];
const forn = String(o.titulo || '').split(' · ').slice(1).join(' · ');
const quem = /^L\d/.test(String(o.numero || '')) ? 'do pacote ' : 'do pedido ';
const ponto = arr => arr.length === 1 ? arr[0] : arr.map(x => '• ' + x).join('\n');
const multi = achados.length > 1 ? '\n' : '';
const comos = [...new Set(achados.map(a => a.como))];
const texto = '*OC criada no GR com divergência*\n' +
  '*O que aconteceu:* a OC ' + (r.numero_gr || '?') + ' ' + quem + (o.numero || '?') + ' (' + [forn, brl(r2(p.ValorLiquido))].filter(Boolean).join(' · ') + ') foi criada no GR, mas tem diferença com o pedido.\n' +
  '*O que está diferente:* ' + multi + ponto(achados.map(a => a.oque)) + '\n' +
  '*Como consertar:* ' + (comos.length > 1 ? '\n' : '') + ponto(comos) + '\n' +
  'A OC já está no GR: não refaça nem lance de novo, só ajuste a OC ' + (r.numero_gr || '') + ' lá.';
return PARA.map(para => ({ json: { para, texto } }));
