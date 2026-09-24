const q = $('Normalizar o pedido de decisão').first().json.q || {};
const t = $input.first().json || {};
const TELA = 'https://grupolehgpva.github.io/TelaCompras/decisao.html';

const etapa = String(q.e || '').toLowerCase();
const d = String(q.d || '').toLowerCase();
const decisao = d === 'a' ? 'aprovado' : d === 'r' ? 'reprovado' : '';
const motivo = String(q.m || '').trim().slice(0, 800);

// A tela pede f=json e recebe resposta; o botão do Slack não pede nada e
// continua caindo no redirect de sempre.
const formato = String(q.f || '').toLowerCase() === 'json' ? 'json' : 'redirect';

/* As colunas onde cada etapa espera decisão. 'cotacao' entrou em 24/09: é a
   etapa do comprador, e a única em que ele decide — só para reprovar. */
const ESPERADO = { lider:'liderança imediata', cotacao:'compras · cotação',
  gerencial:'aprovação gerencial', financeiro:'aprovação financeiro' };
/* Para onde o card vai depois de cada decisão.
   'financeiro|aprovado' ia para 'efetuar compra' e passou a ir para 'ordem de
   compra' em 16/09, quando o Guilherme reorganizou o Kanban: a coluna 'lançar
   no erp' virou 'ordem de compra' e passou a vir ANTES de 'efetuar compra'.
   É a entrada nela que dispara a ida dos dados para o GR. */
const DESTINO = {
  'lider|aprovado':'compras · cotação', 'gerencial|aprovado':'aprovação financeiro',
  'financeiro|aprovado':'ordem de compra', 'lider|reprovado':'reprovado',
  'gerencial|reprovado':'reprovado', 'financeiro|reprovado':'reprovado',
  'cotacao|reprovado':'reprovado' };
const ROTULO = { lider:'liderança imediata', gerencial:'gerencial', financeiro:'financeira' };

const statusAtual = (t.status && (t.status.status || t.status)) || '';

const tela = (res, numero) => TELA + '?d=' + res + '&e=' + encodeURIComponent(etapa)
  + (numero ? '&sc=' + encodeURIComponent(numero) : '')
  + (q.sid ? '&id=' + encodeURIComponent(q.sid) : '')
  + (t.url ? '&card=' + encodeURIComponent(t.url) : '');

const parar = (res, msg, numero) => [{ json: {
  agir:false, formato, resultado:res, mensagem:msg,
  redirect: res === 'erro' ? TELA + '?d=erro&e=' + encodeURIComponent(etapa) : tela(res, numero)
} }];

// ---------------------------------------------------------------------------
// QUEM ESTÁ DECIDINDO? O BANCO RESPONDE. PARA TODOS OS CAMINHOS.
//
// Esta conferência valia só para a tela. O caminho do botão do Slack passava
// direto, com um argumento que fazia sentido na época: o link ia na DM daquela
// pessoa, então ter o link era ser o dono dele.
//
// O argumento morreu. As DMs com botão de decisão foram substituídas pela
// lista 2× ao dia, e os nós que montavam aqueles links foram removidos em
// 16/09. Ninguém mais gera link de decisão por GET — e o que sobrou da isenção
// não serve mais a ninguém legítimo, só a link antigo entregue em DM passada e
// a quem montar a URL à mão.
//
// Então a regra passa a ser uma só: a decisão passa pelo banco antes de
// encostar no card, venha de onde vier. Sem token válido, sem etapa que seja
// dele, sem ser a vez dele: não passa.
//
// Falha na consulta nega. Um endpoint de aprovação que libera quando o
// controle está fora do ar não é controle nenhum.
// ---------------------------------------------------------------------------
let permissao = null;
try { permissao = $('Conferir quem está decidindo').first().json; } catch (e) { permissao = null; }

if (!permissao || permissao.ok !== true) {
  const motivoRecusa = (permissao && permissao.mensagem)
    || 'não consegui confirmar quem está decidindo — tente de novo em um minuto';
  return parar('erro', motivoRecusa);
}

// O NÚMERO VEM DO BANCO. SÓ DO BANCO.
//
// Até 18/09 ele era lido do começo do título do card ("C2609-00001 · motivo"),
// com o banco apenas como reserva. Naquele dia o título passou a ser
// "CENTRO DE CUSTO (código) · FACILITADOR" e ler pelo título deixou de fazer
// sentido — e virou risco: um centro chamado "CC-3238" passaria no teste de
// formato e seria lido como número da solicitação, sem erro nenhum aparecer.
//
// `decisao_permitida` já devolve o número da solicitação que aquele token tem
// direito de decidir. Essa é a fonte certa: não depende de como o card foi
// nomeado, nem de alguém ter renomeado depois. O `q.sc` fica só para o caso
// remoto de a consulta voltar sem o número.
const numero = (permissao && permissao.numero) || String(q.sc || '');

// Link torto, card que não existe, etapa desconhecida: não encosta em nada.
if (!decisao || !ESPERADO[etapa] || !t.id) {
  return parar('erro', 'link incompleto ou solicitação inexistente');
}

// ---------------------------------------------------------------------------
// COMPRADOR REPROVA, NÃO APROVA.
//
// Quem diz isso é o banco: `decisao_permitida` devolve `so_reprova: true`
// quando o token é de comprador. Aprovar uma compra é da alçada — o comprador
// só tem a porta de barrar o que não deve seguir, com motivo.
//
// Existe porque em 24/09 o Herisson precisou barrar a C2609-00012 (faltava um
// item) e o único caminho era arrastar o card na mão. Arrastar card não decide
// nada: o banco continuou esperando o gerente e as duas verdades se separaram.
// ---------------------------------------------------------------------------
const SO_REPROVA = permissao.so_reprova === true;
if (SO_REPROVA && decisao !== 'reprovado') {
  return parar('erro', 'nesta etapa o comprador só pode reprovar a compra');
}
if (!SO_REPROVA && etapa === 'cotacao') {
  return parar('erro', 'a cotação é decidida pelo comprador');
}

// ---------------------------------------------------------------------------
// REPROVAR SEM MOTIVO NÃO EXISTE. Em nenhum caminho.
//
// Esta trava valia só para a tela (`formato === 'json'`), e o botão do Slack
// passava direto. O banco ainda barraria, pelo CHECK `ck_recusa_tem_motivo` —
// mas tarde demais: o card já teria mudado de coluna e a solicitação ficaria
// para trás. É exatamente o descasamento que custou a tarde de 10/09.
//
// A tela cobra primeiro, para a pessoa não perder o clique. Esta é a que vale:
// mora antes de qualquer coisa se mover.
// ---------------------------------------------------------------------------
if (decisao === 'reprovado' && motivo.length < 10) {
  return parar('erro', 'reprovação precisa de motivo');
}

// Já respondida: o card saiu da coluna de espera. Não move nem comenta de novo.
if (statusAtual !== ESPERADO[etapa]) {
  return parar('ja', 'esta solicitação já foi decidida', numero);
}

const agora = $now.setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy HH:mm');
const quem = (permissao && permissao.aprovador_nome) ? ' por ' + permissao.aprovador_nome : '';
const APROVOU = {
  lider: '✅ Necessidade aprovada pela liderança imediata' + quem + ' em ' + agora + '.\n\n'
    + '*Próximo passo do comprador:*\n'
    + '1. Cotar com os fornecedores\n'
    + '2. Anexar os orçamentos nos campos *Fornecedor 1, 2 e 3* — o mais barato vai sempre no *Fornecedor 1*\n'
    + '3. Preencher o *Fornecedor com melhor valor* e o *Melhor Valor*\n'
    + '4. Mover o card para *aprovação gerencial*\n\n'
    /* Até 22/09 o card voltava para cá quando faltava algo. Agora ele anda, e o
       que faltar vira aviso no comentário — decisão do Guilherme no mesmo dia. */
    + 'Se faltar algo, o card segue assim mesmo: o fluxo só comenta o que ficou faltando.',
  gerencial: '✅ Aprovado na aprovação gerencial' + quem + ' em ' + agora + '. Segue para o financeiro.',
  financeiro: '✅ Aprovado na aprovação financeira' + quem + ' em ' + agora + '.\n\n'
    + 'O card foi para *ordem de compra* — é a entrada nessa coluna que leva os dados para o GR.'
};

// O motivo está garantido pela trava acima: reprovação sem ele não chega aqui.
const comentario = decisao === 'aprovado'
  ? APROVOU[etapa]
  : etapa === 'cotacao'
    ? '❌ Compra reprovada pelo comprador' + quem + ' em ' + agora + '.\n\n'
      + '*Motivo:* ' + motivo + '\n\n'
      + 'Quem pediu já recebeu o aviso com este motivo. Se a compra ainda for '
      + 'necessária, ela volta como solicitação nova — este card não reabre.'
    : '❌ Reprovado na aprovação ' + ROTULO[etapa] + quem + ' em ' + agora + '.\n\n'
      + '*Motivo:* ' + motivo;

return [{ json: {
  agir: true, formato, taskId: t.id, numero, etapa, decisao, motivo,
  aprovador: (permissao && permissao.aprovador) || '',
  destino: DESTINO[etapa + '|' + decisao],
  comentario,
  resultado: decisao,
  mensagem: decisao === 'aprovado' ? 'aprovada' : 'reprovada',
  redirect: tela(decisao, numero)
} }];

