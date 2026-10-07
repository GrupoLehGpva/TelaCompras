// Testa os avisos de OC não criada (nós "Montar o aviso do GR" e "Bloqueios da montagem"
// do workflow Compras · Emitir OC no GR). Rodar: node teste-aviso-oc.js
const fs = require('fs'), path = require('path');
let falhas = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('FALHOU:', m); } };
const rodar = (f, nos, entrada) => new Function('$', '$input', fs.readFileSync(path.join(__dirname, f), 'utf8'))(
  n => ({ first: () => ({ json: nos[n] }) }),
  { first: () => ({ json: entrada[0] }), all: () => entrada.map(j => ({ json: j })) });
const ord = { numero: 'C2610-00032', titulo: 'C2610-00032 · E L MAMCASZ INFORMATICA' };
let r = rodar('n8n-aviso-oc-gr.js', { 'Ordem da vez': ord, 'Uma por vez': { payload: { ValorLiquido: 2100 } } },
  [{ resultado: 'recusada', erro: 'Centro de investimento não informado!' }]);
ok(r.length === 2 && r[0].json.para === 'U0BTEULHL3G' && r[1].json.para === 'U0BL5JPQX97', 'vai para Herisson e Guilherme');
const t = r[0].json.texto;
ok(/O que aconteceu:\* a OC do pedido C2610-00032 \(E L MAMCASZ INFORMATICA · R\$\s?2\.100,00\)/.test(t), 'o que aconteceu');
ok(/Por quê:\* Centro de investimento não informado!/.test(t), 'por quê');
ok(/Como consertar:\* Falta dizer qual centro de investimento/.test(t), 'como consertar');
ok(/Não lance essa OC à mão/.test(t), 'rodapé');
r = rodar('n8n-aviso-oc-gr.js', { 'Ordem da vez': ord, 'Uma por vez': {} }, [{ resultado: 'incerta', erro: 'A conexão caiu' }]);
ok(/talvez não criada/.test(r[0].json.texto) && /Procure no GR pelo título/.test(r[0].json.texto), 'incerta');
r = rodar('n8n-aviso-oc-gr.js', { 'Ordem da vez': ord, 'Uma por vez': {} }, [{ resultado: 'recusada', erro: 'Erro desconhecido X' }]);
ok(/O GR recusou com a mensagem acima/.test(r[0].json.texto), 'motivo desconhecido do GR');
r = rodar('n8n-aviso-oc-montagem.js', {}, [
  { numero: 'C2610-00040', ocs: [{ chave: 'C2610-00040:bloqueio', erro: 'Pedido não pode virar OC: a unidade "RHAETIA 107" não tem centro de investimento do GR (cadastrar em centros_investimento_gr); a condição de pagamento "30/90/90" de "X" tem prazo repetido; corrija na Mesa' }] },
  { numero: 'C2610-00041', ocs: [{ chave: 'k', titulo: 'C2610-00041 · CARGILL', total_liquido: 500.5, erro: 'o item 123 (LISINA) não está ativo no GR' }, { chave: 'ok', erro: null }] }]);
const b = r[0].json.texto;
ok(r.length === 2, 'montagem: 2 destinatários');
ok(!/centros_investimento_gr|corrija na Mesa/.test(b), 'sem recado técnico');
ok(/• a unidade "RHAETIA 107"[^\n]*\n• a condição/.test(b), 'dois motivos separados');
ok(/não está ativo no cadastro de itens do GR/.test(b), 'item inativo');
ok(rodar('n8n-aviso-oc-montagem.js', {}, [{ numero: 'C1', ocs: [{ chave: 'x' }] }]).length === 0, 'sem erro, sem aviso');
const casos = { 'o pedido não tem empresa': /empresa/, 'o item "P" não tem fornecedor escolhido': /sem fornecedor escolhido/,
  'o fornecedor "A" não tem código do GR': /código do GR no cadastro/, 'falta a forma de pagamento de "A"': /forma de pagamento/,
  'o item "X" não tem código do catálogo': /código do catálogo/, 'o mapa de cotação não foi enviado pela Mesa': /mapa de cotação/,
  'Usuário ou senha inválidos': /acesso da automação/ };
for (const [m, re] of Object.entries(casos)) {
  const x = rodar('n8n-aviso-oc-montagem.js', {}, [{ numero: 'C9', ocs: [{ chave: 'C9:bloqueio', erro: 'Pedido não pode virar OC: ' + m }] }]);
  ok(re.test(x[0].json.texto.split('Como consertar')[1]), 'regra: ' + m);
}
console.log(falhas ? falhas + ' de ' + total + ' falharam' : 'OK ' + total + '/' + total);
process.exit(falhas ? 1 : 0);
