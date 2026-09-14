const q = $('Normalizar o pedido de decisão').first().json.q || {};
const origem = $('Normalizar o pedido de decisão').first().json.origem || 'slack';
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
const DESTINO = {
  'lider|aprovado':'compras · cotação', 'gerencial|aprovado':'aprovação financeiro',
  'financeiro|aprovado':'efetuar compra', 'lider|reprovado':'reprovado',
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
// Quem está decidindo?
//
// O link do Slack é o segredo dele: quem tem o link é o dono da DM. A tela é
// outra coisa — ela manda o token do aprovador, e token pode ser copiado,
// reaproveitado, mandado para o pedido de outra pessoa. Por isso a decisão
// vinda da tela passa pelo banco antes de encostar no card.
//
// Falha na consulta nega. Um endpoint de aprovação que libera quando o
// controle está fora do ar não é controle nenhum.
// ---------------------------------------------------------------------------
let permissao = null;
try { permissao = $('Conferir quem está decidindo').first().json; } catch (e) { permissao = null; }

if (origem === 'tela') {
  if (!permissao || permissao.ok !== true) {
    const motivoRecusa = (permissao && permissao.mensagem)
      || 'não consegui confirmar quem está decidindo — tente de novo em um minuto';
    return parar('erro', motivoRecusa);
  }
}

const numero = ((t.name || '').match(/SC-[A-Z0-9]+-\d+/) || [''])[0]
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
  financeiro: '✅ Aprovado na aprovação financeira' + quem + ' em ' + agora + '. Liberado para efetuar a compra.'
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
