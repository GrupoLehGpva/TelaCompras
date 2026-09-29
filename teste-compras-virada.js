/* Teste da resposta do /compras preparada para a virada (n8n-compras-virada.js).
   Roda a função e também a EXPRESSÃO que vai para o nó do n8n, para os dois
   dizerem a mesma coisa. */
const { respostaCompras, expressaoDoNo } = require('./n8n-compras-virada.js');
let ok = 0, falhou = 0;
const t = (nome, cond, det) => { if (cond) ok++; else { falhou++; console.log(' ✗ ' + nome + (det ? ' — ' + det : '')); } };

const expr = expressaoDoNo();
const rodarExpr = bruto => JSON.parse(new Function('$json', 'return ' + expr.replace(/^=\{\{/, '').replace(/\}\}$/, ''))(bruto));

const FAC = [{ id:'ana', nome:'Ana', email:'a@x', token:'fc-abc 1', em_aberto:2 }];
for (const [rotulo, f] of [['função', b => respostaCompras(b)], ['expressão do nó', rodarExpr]]) {
  const r1 = f(FAC);
  t(rotulo + ': facilitador recebe o formulário com token', /index\.html\?t=fc-abc%201/.test(r1.text), r1.text);
  t(rotulo + ': e o acompanhamento com token', /acompanhar\.html\?t=fc-abc%201/.test(r1.text));
  t(rotulo + ': sem uid/nome/email na URL', !/uid=|nome=|email=/.test(r1.text));
  t(rotulo + ': conta os em andamento', /2 solicitações em andamento/.test(r1.text));
  t(rotulo + ': avisa para não repassar', /Não repasse/.test(r1.text));
  t(rotulo + ': só para quem digitou', r1.response_type === 'ephemeral');
  const r1b = f([{ token:'fc-x', em_aberto:1 }]);
  t(rotulo + ': singular', /1 solicitação em andamento/.test(r1b.text));
  const r1c = f([{ token:'fc-x', em_aberto:0 }]);
  t(rotulo + ': sem contagem quando zero', !/em andamento/.test(r1c.text));
  for (const vazio of [{}, [], [{}], null]) {
    const r2 = f(vazio);
    t(rotulo + ': não facilitador sem link (' + JSON.stringify(vazio) + ')', /não está cadastrado como facilitador/.test(r2.text) && !/html/.test(r2.text), r2.text);
  }
  const r3 = f({ message:'timeout', code:'ECONNABORTED' });
  t(rotulo + ': consulta fora do ar pede para tentar de novo', /Tente o \/compras de novo/.test(r3.text) && !/html/.test(r3.text), r3.text);
  const r4 = f({ data: FAC });
  t(rotulo + ': aceita {data:[...]}', /index\.html\?t=/.test(r4.text));
}
console.log('ok ' + ok + ' falhou ' + falhou);
