/* ============================================================================
   LINK DIÁRIO DO FUNIL — diretoria (30/09)
   Espelho do nó "Montar as mensagens" do workflow "Compras · Link do funil da
   diretoria (9h)". Uma DM por pessoa, separada da lista de aprovação, com o
   link PESSOAL do funil (painel.html?t=pa-…) e um resumo do dia.

   Entrada: o que funil_links_do_dia() devolveu (só o n8n chama; traz tokens):
     [{ nome, slack, token, resumo:{ em_andamento, lider, cotacao, gerencial,
        financeiro, parados_2d, aprovadas_ontem } }]
   Saída: [{ slack, texto }]
   ========================================================================== */
function mensagensDoFunil(bruto, SITE){
  SITE = SITE || 'https://grupolehgpva.github.io/TelaCompras/';
  const linhas = Array.isArray(bruto) ? bruto : (bruto && Array.isArray(bruto.data) ? bruto.data : []);
  const primeiroNome = n => {
    const p = String(n || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  };
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const saida = [];
  for (const p of linhas) {
    if (!p || !p.slack || !p.token) continue;
    const r = p.resumo || {};
    const num = k => Number(r[k]) || 0;
    const nome = primeiroNome(p.nome);
    let texto = '☀️ Bom dia' + (nome ? ', ' + nome : '') + '! Funil de compras de hoje:\n';
    if (num('em_andamento')) {
      texto += '• ' + plural(num('em_andamento'), 'pedido em andamento', 'pedidos em andamento') +
               ' — liderança ' + num('lider') + ' · cotação ' + num('cotacao') +
               ' · gerência ' + num('gerencial') + ' · financeiro ' + num('financeiro') + '\n';
      if (num('parados_2d')) texto += '• ' + plural(num('parados_2d'), 'parado há mais de 2 dias', 'parados há mais de 2 dias') + '\n';
    } else {
      texto += '• Nenhum pedido em andamento\n';
    }
    if (num('aprovadas_ontem')) texto += '• ' + plural(num('aprovadas_ontem'), 'compra aprovada ontem', 'compras aprovadas ontem') + '\n';
    texto += '\n👉 Ver o funil: ' + SITE + 'painel.html?t=' + encodeURIComponent(p.token) +
             '\n_Este link é seu. Não repasse._';
    saida.push({ slack: p.slack, texto });
  }
  return saida;
}

/* O código que vai no nó Code do n8n (mesma função, sem módulo). */
function codigoDoNo(){
  return '/* Espelho de n8n-funil-diario.js no repositório, coberto por teste. */\n' +
    mensagensDoFunil.toString() + '\n\n' +
    'const bruto = $input.all().map(i => i.json);\n' +
    'const lista = bruto.length === 1 && Array.isArray(bruto[0]) ? bruto[0] : bruto;\n' +
    'return mensagensDoFunil(lista).map(m => ({ json: m }));\n';
}

if (typeof module !== 'undefined') module.exports = { mensagensDoFunil, codigoDoNo };
