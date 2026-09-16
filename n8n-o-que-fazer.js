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

const ESPERADO = { lider:'liderança imediata', gerencial:'aprovação gerencial', financeiro:'aprovação financeiro' };
/* Para onde o card vai depois de cada decisão.
   'financeiro|aprovado' ia para 'efetuar compra' e passou a ir para 'ordem de
   compra' em 16/09, quando o Guilherme reorganizou o Kanban: a coluna 'lançar
   no erp' virou 'ordem de compra' e passou a vir ANTES de 'efetuar compra'.
   É a entrada nela que dispara a ida dos dados para o GR. */
const DESTINO = {
  'lider|aprovado':'compras · cotação', 'gerencial|aprovado':'aprovação financeiro',
  'financeiro|aprovado':'ordem de compra', 'lider|reprovado':'reprovado',
  'gerencial|reprovado':'reprovado', 'financeiro|reprovado':'reprovado' };
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

// O número está no começo do título do card: "C2609-00001 · motivo do pedido".
// Ler por POSIÇÃO e não por formato é o que evita ter que voltar aqui toda vez
// que a numeração mudar — a versão anterior procurava /SC-.../ e teria voltado
// vazia no dia em que o SC saiu de cena.
//
// O teste do dígito é o que impede um título sem número — "AR-CONDICIONADO ·
// trocar" — de ser lido como código. Custa um caso: rótulos de demonstração
// como SC-DEMO-C não passam, e caem no número vindo do banco, que é a fonte
// certa de qualquer jeito.
const doTitulo = String(t.name || '').split('·')[0].trim();
const pareceNumero = /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(doTitulo)
  && /\d/.test(doTitulo) && doTitulo.includes('-');
const numero = (pareceNumero ? doTitulo : '')
  || (permissao && permissao.numero) || String(q.sc || '');

// Link torto, card que não existe, etapa desconhecida: não encosta em nada.
if (!decisao || !ESPERADO[etapa] || !t.id) {
  return parar('erro', 'link incompleto ou solicitação inexistente');
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
    + '3. Preencher os três *Valor Fornecedor*\n'
    + '4. Preencher o *Local da entrega*\n'
    + '5. Mover o card para *aprovação gerencial*\n\n'
    + 'Faltando qualquer um dos cinco, o card volta para cá com a lista do que falta.',
  gerencial: '✅ Aprovado na aprovação gerencial' + quem + ' em ' + agora + '. Segue para o financeiro.',
  financeiro: '✅ Aprovado na aprovação financeira' + quem + ' em ' + agora + '.\n\n'
    + 'O card foi para *ordem de compra* — é a entrada nessa coluna que leva os dados para o GR.'
};

// O motivo está garantido pela trava acima: reprovação sem ele não chega aqui.
const comentario = decisao === 'aprovado'
  ? APROVOU[etapa]
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
