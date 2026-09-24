const fs=require('fs');
// Teste do nó "Montar as mensagens" do workflow Compras · Telas · Avisos (K4koz6mFwBDfDt94).
// Rodar: node teste-avisos-telas.js
const code=fs.readFileSync('n8n-avisos-telas.js','utf8');
const run=(avisos)=>{ const $input={all:()=>avisos.map(a=>({json:a}))}; return new Function('$input',code)($input).map(i=>i.json); };
let ok=0,falhou=0; const t=(n,c,info)=>{ if(c) ok++; else {falhou++; console.log('FALHOU',n,JSON.stringify(info,null,1));} };
const P=(papel,id,slack='U1',token='tk-'+id)=>({papel,id,nome:id.toUpperCase(),slack,token});
const base={numero:'C2609-00099',assunto:'Bomba <parada> & queimada',facilitador:'EDUARDA',quem:'X',motivo:null,total:null,mudou:null};
// 1 criado normal -> aprovador pulado, facilitador recebe
let r=run([{...base,id:1,acao:'criado',etapa:null,etapa_seguinte:'lider',urgente:false,para:[P('aprovador','br'),P('facilitador','ed')]}]);
t('criado normal: só facilitador', r.length===1 && r[0].papel==='facilitador' && r[0].texto.includes('esperando a liderança') && r[0].texto.includes('acompanhar.html?t=tk-ed'), r);
t('escapa < > &', !r[0].texto.includes('<parada>') , r);
// 2 criado urgente -> aprovador recebe
r=run([{...base,id:2,acao:'criado',etapa:null,etapa_seguinte:'lider',urgente:true,para:[P('aprovador','br'),P('facilitador','ed')]}]);
t('criado urgente: aprovador recebe DM com link de decidir', r.length===2 && r.find(x=>x.papel==='aprovador').texto.includes('aprovacoes.html?t=tk-br') && r.find(x=>x.papel==='aprovador').texto.includes('urgente'), r);
// 3 lider aprova -> cotacao: comprador + facilitador
r=run([{...base,id:3,acao:'aprovado',etapa:'lider',etapa_seguinte:'cotacao',urgente:false,para:[P('comprador','he'),P('facilitador','ed')]}]);
t('aprovado para cotação: comprador recebe novo pedido', r.find(x=>x.papel==='comprador').texto.includes('Novo pedido para cotação') && r.find(x=>x.papel==='comprador').texto.includes('mesa-cotacao.html?t=tk-he'), r);
t('aprovado para cotação: facilitador sabe que está em cotação', r.find(x=>x.papel==='facilitador').texto.includes('em cotação'), r);
// 4 urgente para cotação: comprador vê URGENTE
r=run([{...base,id:4,acao:'criado',etapa:null,etapa_seguinte:'cotacao',urgente:true,para:[P('comprador','he'),P('facilitador','ed')]}]);
t('urgente direto na cotação: comprador vê URGENTE', r.find(x=>x.papel==='comprador').texto.includes('URGENTE'), r);
// 5 cotacao enviada normal -> aprovador pulado
r=run([{...base,id:5,acao:'cotacao_enviada',etapa:'cotacao',etapa_seguinte:'gerencial',urgente:false,total:355,para:[P('aprovador','br'),P('facilitador','ed')]}]);
t('cotação enviada normal: aprovador na lista, facilitador avisado', r.length===1 && r[0].texto.includes('aprovação gerencial'), r);
r=run([{...base,id:6,acao:'cotacao_enviada',etapa:'cotacao',etapa_seguinte:'gerencial',urgente:true,total:355,para:[P('aprovador','br'),P('facilitador','ed')]}]);
t('cotação enviada urgente: aprovador vê o valor', r.find(x=>x.papel==='aprovador').texto.includes('R$') , r);
// 7 reprovado no financeiro: facilitador + gerente (sempre)
r=run([{...base,id:7,acao:'reprovado',etapa:'financeiro',etapa_seguinte:null,urgente:false,motivo:'Fora do orçamento',quem:'WIENFRIED',para:[P('facilitador','le'),P('aprovador','ed2')]}]);
t('reprovado: facilitador com motivo', r.find(x=>x.papel==='facilitador').texto.includes('Motivo: Fora do orçamento'), r);
t('reprovado no financeiro: gerente avisado mesmo não urgente', r.some(x=>x.papel==='aprovador' && x.enviar), r);
// 8 devolvido -> comprador
r=run([{...base,id:8,acao:'devolvido',etapa:'gerencial',etapa_seguinte:'cotacao',urgente:false,motivo:'Frete alto',quem:'BRANDAO',para:[P('comprador','he')]}]);
t('devolvido: comprador com quem e motivo', r[0].texto.includes('BRANDAO') && r[0].texto.includes('Frete alto') && r[0].texto.includes('aprovação gerencial'), r);
// 9 aprovado final
r=run([{...base,id:9,acao:'aprovado',etapa:'financeiro',etapa_seguinte:null,urgente:false,total:300,para:[P('facilitador','ed'),P('comprador','he')]}]);
t('aprovado final: facilitador e comprador', r.length===2 && r.every(x=>x.enviar) && r.find(x=>x.papel==='comprador').texto.includes('R$'), r);
// 10 edicao salva: urgente -> aprovador ; normal -> nada
r=run([{...base,id:10,acao:'edicao_salva',etapa:'edicao',etapa_seguinte:'lider',urgente:false,mudou:{motivo:{},itens:{}},para:[P('aprovador','br')]}]);
t('edição salva normal: nada (vai na lista)', r.length===0, r);
r=run([{...base,id:11,acao:'edicao_salva',etapa:'edicao',etapa_seguinte:'lider',urgente:true,mudou:{motivo:{},itens:{}},para:[P('aprovador','br')]}]);
t('edição salva urgente: aprovador vê o que mudou', r[0].texto.includes('Mudou: motivo, itens'), r);
// 12 edicao expirada -> facilitador
r=run([{...base,id:12,acao:'edicao_expirada',etapa:'edicao',etapa_seguinte:'lider',urgente:false,para:[P('facilitador','ed')]}]);
t('edição expirada: facilitador avisado que já usou', r[0].texto.includes('30 minutos') && r[0].texto.includes('já foi usada'), r);
// 13 sem slack
r=run([{...base,id:13,acao:'criado',etapa:null,etapa_seguinte:'lider',urgente:false,para:[P('facilitador','zz',null)]}]);
t('sem Slack: registrado e não enviado', r.length===1 && r[0].enviar===false && r[0].motivo.includes('Slack'), r);
// 14 cancelado normal -> nada ; urgente -> aprovador
r=run([{...base,id:14,acao:'cancelado',etapa:'lider',etapa_seguinte:null,urgente:true,quem:'EDUARDA',para:[P('aprovador','br')]}]);
t('cancelado urgente: aprovador sabe que não precisa decidir', r[0].texto.includes('Não precisa mais decidir'), r);
// 15 formatos de entrada: vazio, array dentro, objeto vazio
t('entrada vazia', run([]).length===0, null);
const $input={all:()=>[{json:{}}]}; t('item vazio do HTTP', new Function('$input',code)($input).length===0, null);
const $in2={all:()=>[{json:[{...base,id:15,acao:'criado',etapa_seguinte:'lider',urgente:false,para:[P('facilitador','ed')]}]}]};
t('array dentro de um item', new Function('$input',code)($in2).length===1, null);
// 16 token nulo -> sem link, sem quebrar
r=run([{...base,id:16,acao:'criado',etapa_seguinte:'lider',urgente:false,para:[{papel:'facilitador',id:'x',nome:'X',slack:'U9',token:null}]}]);
t('token nulo: mensagem sem link', r[0].enviar && !r[0].texto.includes('?t='), r);
console.log('ok',ok,'falhou',falhou);
