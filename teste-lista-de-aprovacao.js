/* LISTA DE APROVAÇÃO NO SLACK — roda o n8n-lista-de-aprovacao.js de verdade
   (o mesmo código do nó "Uma mensagem por aprovador"), com um $input falso.
   Foco do 02/10: fila dividida (financeiro) não pode parecer aviso errado. */
const fs = require('fs');
const codigo = fs.readFileSync(__dirname + '/n8n-lista-de-aprovacao.js', 'utf8');
const rodar = (lista, comoArray = false) => new Function('$input', codigo)({
  all: () => comoArray ? [{ json: lista }] : lista.map(j => ({ json: j })) });
let ok = 0; const falhas = [];
const conf = (n, c, d) => c ? ok++ : falhas.push(n + (d === undefined ? '' : ' — ' + JSON.stringify(d)));
const A = (id, nome, numeros, o = {}) => Object.assign({ aprovador_id: id, nome, slack: 'U' + id, token: 'ap-' + id, etapas: ['financeiro'],
  quantidade: numeros.length, de_hoje: 0, mais_antigo: '2026-09-29T16:59:10Z', numeros }, o);

/* 1 — financeiro: os três com o mesmo pedido */
let r = rodar([A('elisangela', 'ELISANGELA G. B. KLOSTER', ['C2609-00022']), A('isabela', 'ISABELA CANESIN', ['C2609-00022']),
               A('wienfried', 'WIENFRIED MATTHIAS LEH', ['C2609-00022'])]).map(i => i.json);
const w = r.find(x => x.slack === 'Uwienfried').texto, e = r.find(x => x.slack === 'Uelisangela').texto;
conf('1 três mensagens', r.length === 3 && r.every(x => !x.pular), r.length);
conf('1 título não diz "esperando você" quando a fila é dividida', /^\*Pedidos esperando aprovação\*/.test(w) && !/esperando você/.test(w), w);
conf('1 diz com quem divide (primeiro nome, sem a própria pessoa)', /Fila dividida com Elisangela e Isabela:/.test(w) && /Fila dividida com Isabela e Wienfried:/.test(e) && !/Wienfried e|, Wienfried/.test(w), [w, e]);
conf('1 explica o link vazio', /quem decidir primeiro tira o pedido da fila de todos/.test(w) && /Se o link abrir sem pedido, alguém já decidiu/.test(w));
conf('1 diz a hora da foto', /situação às \d{2}h\d{2}/.test(w), w);
conf('1 continua com número, link pessoal e horário do financeiro', /C2609-00022/.test(w) && /aprovacoes\.html\?t=ap-wienfried/.test(w) && /9h, 11h, 14h30 e 16h30/.test(w));

/* 2 — liderança sozinha: texto de antes */
r = rodar([A('brandao', 'ALVARO BRANDAO FILHO', ['C2610-00001', 'C2610-00002'], { etapas: ['lider'] }),
           A('junior', 'JUNIOR', ['C2610-00003'], { etapas: ['gerencial'] })]).map(i => i.json);
conf('2 fila só sua: "esperando você", sem aviso de divisão e sem hora', r.every(x => /^\*Pedidos esperando você\*/.test(x.texto) && !/dividida|situação às/.test(x.texto)), r.map(x => x.texto));

/* 3 — divisão parcial: só quem tem pedido em comum */
r = rodar([A('wienfried', 'WIENFRIED', ['C1', 'C2']), A('isabela', 'ISABELA', ['C2']), A('brandao', 'BRANDAO', ['C9'], { etapas: ['gerencial'] })]).map(i => i.json);
conf('3 só aparece quem tem pedido em comum', /Fila dividida com Isabela:/.test(r[0].texto) && /Fila dividida com Wienfried:/.test(r[1].texto) && !/dividida/.test(r[2].texto), r.map(x => x.texto));

/* 4 — sem Slack continua pulado (e não quebra a divisão dos outros) */
r = rodar([A('treino', 'TREINO', ['C2609-00022'], { slack: null }), A('wienfried', 'WIENFRIED', ['C2609-00022'])]).map(i => i.json);
conf('4 sem Slack: pulado, com o que ficou parado', r[0].pular === true && r[0].numeros[0] === 'C2609-00022');
conf('4 quem divide com alguém sem Slack ainda é avisado da divisão', /Fila dividida com Treino/.test(r[1].texto), r[1].texto);

/* 5 — o corpo pode chegar como um item só com o array */
r = rodar([A('wienfried', 'WIENFRIED', ['C1']), A('isabela', 'ISABELA', ['C1'])], true).map(i => i.json);
conf('5 array num item só também funciona', r.length === 2 && /Fila dividida com Isabela/.test(r[0].texto));

console.log('ok ' + ok + ' falhou ' + falhas.length);
falhas.forEach(f => console.log(' ✗ ' + f));
