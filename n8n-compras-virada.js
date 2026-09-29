/* ============================================================================
   /compras NA VIRADA (quinta, 01/10) — resposta do comando no Slack
   Espelho do novo texto do nó "Responder no Slack (formulário)" do workflow
   YxH2Er283IMaGynp. PREPARADO, NÃO APLICADO: o workflow publicado continua
   entregando o formulário do ClickUp até a virada.

   O que muda:
   · O formulário passa a ir com o token pessoal (index.html?t=fc-…): o pedido
     nasce nas telas, e quem pede é conferido no banco, não pelo id do Slack.
   · Quem não é facilitador ativo NÃO recebe link de formulário (regra
     permanente de 29/09: só facilitador abre pedido).
   · Consulta fora do ar: pede para tentar de novo, em vez de entregar um
     formulário sem identificação.

   Entrada: o que o nó "Meus links" devolveu (meus_links_do_slack, alwaysOutputData):
     [{id, nome, email, token, em_aberto}]  → facilitador ativo
     {} ou []                               → não é facilitador
     {message|code|error: …}                → a consulta falhou
   ========================================================================== */
function respostaCompras(bruto, SITE){
  SITE = SITE || 'https://grupolehgpva.github.io/TelaCompras/';
  let eu = null, falhou = false;
  try {
    const linhas = Array.isArray(bruto) ? bruto : (bruto && Array.isArray(bruto.data) ? bruto.data : [bruto]);
    const l = linhas && linhas[0];
    if (l && l.token) eu = l;
    else if (l && (l.message || l.code || l.error)) falhou = true;
  } catch (e) { falhou = true; }

  if (falhou) {
    return { response_type: 'ephemeral', text:
      ':hourglass: Não consegui confirmar o seu cadastro agora. Tente o /compras de novo em um minuto.' };
  }
  if (!eu) {
    return { response_type: 'ephemeral', text:
      ':lock: Você não está cadastrado como facilitador de compras, por isso não pode abrir pedido.\n' +
      'Se isso estiver errado, fale com o setor de compras.' };
  }
  const t = encodeURIComponent(eu.token);
  const n = Number(eu.em_aberto) || 0;
  let texto = '📋 Abrir uma solicitação de compra: ' + SITE + 'index.html?t=' + t +
              '\n\n👀 Acompanhar as suas solicitações: ' + SITE + 'acompanhar.html?t=' + t;
  if (n) texto += '\n_Você tem ' + n + (n === 1 ? ' solicitação em andamento._' : ' solicitações em andamento._');
  texto += '\n\n_Estes links são seus: quem abrir pede no seu nome. Não repasse._';
  return { response_type: 'ephemeral', text: texto };
}

/* A expressão que vai no jsonBody do nó na virada (mesma lógica, sem o
   parâmetro SITE). Gerada daqui para o texto do nó e o testado serem um só. */
function expressaoDoNo(){
  const corpo = respostaCompras.toString()
    .replace(/^function respostaCompras\(bruto, SITE\)\{/, '')
    .replace(/\}$/, '');
  return '={{ JSON.stringify((() => { const bruto = $json; let SITE;' + corpo + '})()) }}';
}

if (typeof module !== 'undefined') module.exports = { respostaCompras, expressaoDoNo };
