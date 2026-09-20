/* O aviso imediato do aprovador quando a compra é urgente.
 *
 * Este teste roda o ARQUIVO DE VERDADE, `n8n-avisar-aprovador.js`, embrulhado
 * numa função com um `$input` de mentira. Não é uma cópia da lógica: se o nó
 * mudar e o arquivo não, ou vice-versa, a divergência aparece aqui — que é
 * exatamente o buraco que os testes copiados deixam.
 *
 * O que ele protege, na ordem do que dói:
 *   1. Pedido urgente com aprovador esperando VIRA aviso.
 *   2. Pedido não urgente NÃO vira — senão a lista 2× ao dia perde o sentido.
 *   3. Card sem ninguém esperando não vira (trava devolveu, ou já foi decidido).
 *   4. Aprovador sem Slack não quebra a execução.
 *   5. O link é o do aprovador, com o token dele, e a mensagem diz para não
 *      repassar — é credencial de aprovação.
 */
const fs = require('fs');
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d || ''));

/* Embrulha o arquivo do nó numa função, com o $input que o n8n entregaria. */
const codigo = fs.readFileSync(__dirname + '/n8n-avisar-aprovador.js', 'utf8');
const rodar = (resposta) => {
  const $input = { first: () => ({ json: resposta }) };
  return new Function('$input', codigo)($input);
};

const URGENTE_ESPERANDO = {
  achou: true, numero: 'C2609-00001', etapa: 'financeiro', tipo_compra: 'urgente',
  urgente: true, aprovador_id: 'wienfried', nome: 'WIENFRIED MATTHIAS LEH',
  slack: 'U0BNAQBBRU1', token: 'ap-2405bfac1bf8566dc2d81a7b',
  facilitador: 'ALISSON RICARDO KRASSUSKI', motivo: 'Estoque baixo', pendentes: 1
};

// 1 — urgente com aprovador esperando vira aviso
let saida = rodar(URGENTE_ESPERANDO);
ok('1 sai um aviso', saida.length === 1, 'saíram ' + saida.length + ' itens');
const msg = (saida[0] || {}).json || {};
ok('1 vai para o Slack do aprovador', msg.slack === 'U0BNAQBBRU1', 'foi para ' + msg.slack);
ok('1 diz o número', /C2609-00001/.test(msg.texto || ''), msg.texto);
ok('1 diz o motivo', /Estoque baixo/.test(msg.texto || ''), msg.texto);
ok('1 diz quem pediu', /ALISSON RICARDO KRASSUSKI/.test(msg.texto || ''), msg.texto);
ok('1 nomeia a etapa em português', /aprovação financeira/.test(msg.texto || ''), msg.texto);
ok('1 marca que é urgente', /urgente/i.test(msg.texto || ''), msg.texto);

// 2 — o link é o DELE, e a mensagem avisa que não se repassa
ok('2 link com o token do aprovador',
   (msg.texto || '').includes('aprovacoes.html?t=ap-2405bfac1bf8566dc2d81a7b'), msg.texto);
ok('2 avisa para não repassar', /não repasse/.test(msg.texto || ''), msg.texto);
ok('2 explica por que chegou na hora', /urgente/.test(msg.texto || ''), msg.texto);

/* 2b — O RODAPÉ TEM QUE DIZER O HORÁRIO DA ETAPA DE QUEM LÊ.
   Ele dizia "às 11h e às 16h" para todo mundo e ficou errado para o
   financeiro no mesmo dia em que o horário virou por etapa (18/09) — e esta
   mensagem vai para o Slack de gente de verdade, então o texto errado chega
   à pessoa. Aqui a asserção cobra cada etapa com o seu horário. */
const HORARIO_ESPERADO = {
  lider:      '8h, 11h, 14h e 16h',
  gerencial:  '8h, 11h, 14h e 16h',
  financeiro: '9h, 11h, 14h30 e 16h30'
};
for(const [etapa, horario] of Object.entries(HORARIO_ESPERADO)){
  const t = (rodar(Object.assign({}, URGENTE_ESPERANDO, { etapa }))[0] || {}).json.texto || '';
  ok('2b rodapé da etapa ' + etapa, t.includes(horario), t.split('\n').pop());
  ok('2b etapa ' + etapa + ' sem o horário antigo',
     !/às 11h e às 16h/.test(t) && !/lista das 11h/.test(t), t.split('\n').pop());
}

// 3 — NÃO urgente não vira aviso. Esta é a que segura o desenho de pé.
for(const tipo of ['normal', 'programada', 'mensal', '', null]){
  const r = Object.assign({}, URGENTE_ESPERANDO, { tipo_compra: tipo, urgente: false });
  ok('3 "' + tipo + '" não vira aviso imediato', rodar(r).length === 0,
     'mandou DM para compra ' + tipo);
}

// 4 — sem ninguém esperando (trava devolveu o card, ou já foi decidido)
ok('4 card sem aprovador não vira aviso', rodar({ achou: false }).length === 0);
ok('4 resposta vazia não quebra', rodar({}).length === 0);
ok('4 resposta nula não quebra', rodar(null).length === 0);

// 5 — aprovador urgente sem Slack: não avisa, mas não derruba a execução
ok('5 sem Slack não vira aviso',
   rodar(Object.assign({}, URGENTE_ESPERANDO, { slack: null })).length === 0);

// 6 — a resposta do PostgREST pode vir embrulhada em lista
ok('6 aceita resposta em lista', rodar([URGENTE_ESPERANDO]).length === 1);
ok('6 aceita resposta em {data:[...]}', rodar({ data: [URGENTE_ESPERANDO] }).length === 1);

// 7 — as outras duas etapas também são nomeadas
for(const [etapa, esperado] of [['lider','da liderança imediata'], ['gerencial','gerencial']]){
  const r = Object.assign({}, URGENTE_ESPERANDO, { etapa });
  const t = (rodar(r)[0] || {}).json.texto || '';
  ok('7 etapa ' + etapa + ' nomeada', t.includes('aprovação ' + esperado), t);
}

console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
