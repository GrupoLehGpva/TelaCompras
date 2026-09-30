/* Teste do link diário do funil (n8n-funil-diario.js): a função e o código do nó
   do n8n dizem a mesma coisa. */
const { mensagensDoFunil, codigoDoNo } = require('./n8n-funil-diario.js');
let ok = 0, falhou = 0;
const t = (nome, cond, det) => { if (cond) ok++; else { falhou++; console.log(' ✗ ' + nome + (det ? ' — ' + det : '')); } };
const R = { em_andamento:6, lider:0, cotacao:3, gerencial:3, financeiro:0, parados_2d:1, aprovadas_ontem:2 };
const PES = [{ nome:'ALVARO BRANDAO FILHO', slack:'U1', token:'pa-abc 1', resumo:R },
             { nome:'RAINER', slack:'U2', token:'pa-def', resumo:R },
             { nome:'SEM SLACK', slack:null, token:'pa-x', resumo:R },
             { nome:'SEM TOKEN', slack:'U3', token:'', resumo:R }];
const noNo = (entrada) => new Function('$input', codigoDoNo())({ all: () => entrada.map(j => ({ json:j })) }).map(i => i.json);
for (const [rot, f] of [['função', b => mensagensDoFunil(b)], ['nó', b => noNo(b)]]) {
  const m = f(PES);
  t(rot + ': só quem tem Slack e token', m.length === 2 && m[0].slack === 'U1' && m[1].slack === 'U2', JSON.stringify(m.map(x => x.slack)));
  t(rot + ': primeiro nome', /Bom dia, Alvaro!/.test(m[0].texto) && /Bom dia, Rainer!/.test(m[1].texto), m[0].texto);
  t(rot + ': link pessoal do funil', /painel\.html\?t=pa-abc%201/.test(m[0].texto) && !/aprovacoes\.html/.test(m[0].texto));
  t(rot + ': resumo por etapa', /6 pedidos em andamento — liderança 0 · cotação 3 · gerência 3 · financeiro 0/.test(m[0].texto), m[0].texto);
  t(rot + ': parados e aprovadas', /1 parado há mais de 2 dias/.test(m[0].texto) && /2 compras aprovadas ontem/.test(m[0].texto));
  t(rot + ': não repasse', /Não repasse/.test(m[0].texto));
  const z = f([{ nome:'ELKE LEH', slack:'U9', token:'pa-z', resumo:{ em_andamento:0 } }]);
  t(rot + ': dia sem pedido ainda manda o link', z.length === 1 && /Nenhum pedido em andamento/.test(z[0].texto) && /painel\.html\?t=pa-z/.test(z[0].texto) && !/aprovada/.test(z[0].texto), z[0] && z[0].texto);
  t(rot + ': singular', /1 pedido em andamento/.test(f([{ nome:'A', slack:'U', token:'t', resumo:{ em_andamento:1, lider:1, aprovadas_ontem:1 } }])[0].texto));
  t(rot + ': vazio não quebra', f([]).length === 0);
}
t('função: aceita {data:[...]}', mensagensDoFunil({ data: PES }).length === 2);
console.log('ok ' + ok + ' falhou ' + falhou);
