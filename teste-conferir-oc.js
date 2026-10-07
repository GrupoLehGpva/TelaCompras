// Testa o nó "Conferir a OC criada" (Compras · Emitir OC no GR). Rodar: node teste-conferir-oc.js
// Dados inventados — não usar OC real aqui (repositório público).
const fs = require('fs'), path = require('path');
const codigo = fs.readFileSync(path.join(__dirname, 'n8n-conferir-oc-criada.js'), 'utf8');
let falhas = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('FALHOU:', m); } };
const rodar = (corpo, resultado = 'ok') => new Function('$', '$input', codigo)(
  () => ({ first: () => ({ json: { numero: 'C2699-00001', titulo: 'C2699-00001 · FORNECEDOR TESTE', corpo } }) }),
  { first: () => ({ json: { resultado, numero_gr: '9999' } }) });
const base = () => ({ Data: '20261005', CondicaoDePagamento: '30/60/90/120', FormaDePagamento: 'Boleto', ValorLiquido: 400,
  Observacoes: 'Pedido teste.', Itens: [{ ValorLiquido: 400 }],
  Parcelas: [['20261104', 100], ['20261204', 100], ['20270103', 100], ['20270202', 100]].map(([d, v], i) => ({ NumeroParcela: i + 1, DataVencimento: d, Valor: v })) });
const texto = c => (rodar(c)[0] || { json: {} }).json.texto || '';
ok(rodar(base()).length === 0, 'OC certa não avisa');
ok(rodar(base(), 'recusada').length === 0, 'só confere OC criada');
let c = base(); c.CondicaoDePagamento = '30/90/90/120'; c.Parcelas.pop(); c.Parcelas[2].Valor = 200;
let r = rodar(c);
ok(r.length === 2 && r[0].json.para === 'U0BTEULHL3G' && r[1].json.para === 'U0BL5JPQX97', 'vai para Herisson e Guilherme');
ok(/tem 4 prazo\(s\), mas a OC saiu com 3 parcela/.test(r[0].json.texto), 'caso da OC 3949: prazo repetido');
ok(/a OC 9999 do pedido C2699-00001 \(FORNECEDOR TESTE · R\$\s?400,00\)/.test(r[0].json.texto), 'o que aconteceu');
ok(/não refaça nem lance de novo/.test(r[0].json.texto), 'rodapé');
c = base(); c.Parcelas[1].DataVencimento = '20261210'; ok(/vencimentos da OC \(30\/66\/90\/120 dias\)/.test(texto(c)), 'vencimento fora da condição');
c = base(); c.Parcelas[0].Valor = 110; ok(/soma das parcelas/.test(texto(c)), 'soma das parcelas');
c = base(); c.Itens[0].ValorLiquido = 390; ok(/soma dos itens/.test(texto(c)), 'soma dos itens');
c = base(); c.Parcelas[0].DataVencimento = '20261001'; ok(/vencendo antes da data da OC/.test(texto(c)), 'vencimento no passado');
c = base(); c.FormaDePagamento = 'Não especificado'; ok(/"Não especificado"/.test(texto(c)), 'forma não especificada');
c = base(); c.Observacoes += ' Frete combinado: R$ 280,00 (não incluso no valor dos itens).'; ok(/frete combinado \(R\$ 280,00\)/.test(texto(c)), 'frete fora do valor');
c = base(); c.CondicaoDePagamento = 'boleto'; ok(/não consegui conferir/.test(texto(c)), 'condição sem prazo');
c = base(); c.CondicaoDePagamento = 'à vista'; c.Parcelas = [{ DataVencimento: '20261005', Valor: 400 }]; ok(rodar(c).length === 0, 'à vista certo');
c = base(); c.CondicaoDePagamento = '4x'; c.Parcelas[3].DataVencimento = '20270202'; ok(rodar(c).length === 0, '4x = 30/60/90/120');
c = base(); c.FormaDePagamento = 'Não especificado'; c.Parcelas[0].Valor = 110;
ok(/O que está diferente:\* \n• /.test(texto(c)) && /Como consertar:\* \n• /.test(texto(c)), 'várias divergências em lista');
console.log(falhas ? falhas + ' de ' + total + ' falharam' : 'OK ' + total + '/' + total);
process.exit(falhas ? 1 : 0);
