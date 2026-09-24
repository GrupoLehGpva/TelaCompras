/* ============================================================================
   FORMULÁRIO — CAMINHO DAS TELAS (sem ClickUp)
   ?t=<token do facilitador>             pedido novo por abrir_pedido_telas
   ?t=<token>&editar=<id>                a edição única, com prazo e desistência
   Sem ?t= o formulário continua indo pelo caminho do ClickUp (criar_solicitacao
   + webhook) — isso também é conferido aqui.
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const URL_ = 'file://' + __dirname + '/index.html';
const falhas = [];
const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + (d||''));

const CATALOGO = [
  { codigo:'1201', familia:'MM', descricao:'ROLAMENTO 6205', unidade:'UNID', especificacao:'ROLAMENTO' },
  { codigo:'7360', familia:'HL', descricao:'SABAO EM PO 1KG', unidade:'UNID', especificacao:'LIMPEZA' },
  { codigo:'7430', familia:'HL', descricao:'DETERGENTE 500ML', unidade:'UNID', especificacao:'LIMPEZA' }
];
const CENTROS = [{ codigo:'20', nome:'FABRICA DE RAÇÕES', unidade:'FÁBRICA', tipo:'' },
                 { codigo:'3176', nome:'COMERCIAL', unidade:'ESCRITÓRIO', tipo:'' }];
const EU = { ok:true, nome:'Ana Paula', email:'ana@leh.com.br', unidade:'Fábrica', prazo_edicao_minutos:30 };
const ID = '33333333-3333-3333-3333-333333333333';
const emMin = m => new Date(Date.now() + m*60000).toISOString();
const PEDIDO = (x={}) => Object.assign({ id:ID, numero:'C2609-02010', canal:'telas', versao:2,
  etapa_atual:'edicao', em_edicao:true, em_edicao_desde:emMin(-5), edicao_expira_em:emMin(25), edicao_usada:true,
  solicitante_nome:'João', observacao:'Urgente para a linha 2', empresa_id:'wienfried-pr', centro_custo:'20',
  centro_custo_nome:'FABRICA DE RAÇÕES', tipo_compra:'normal', definicao_fornecedor:'cotacao',
  justificativa_fornecedor:null, data_necessidade:'2027-01-15', motivo:'Rolamentos da peletizadora' }, x);
const ITENS_LISTA = [
  { id:'i1', codigo:'1201', descricao:'ROLAMENTO 6205', unidade:'UNID', quantidade:4, fora_catalogo:false },
  { id:'i2', codigo:'7360', descricao:'SABAO EM PO 1KG', unidade:'UNID', quantidade:10, fora_catalogo:false }];

async function abrir(b, qs, {eu=EU, ped=()=>({ok:true, pedido:PEDIDO(), itens:ITENS_LISTA}), rpc={}}={}){
  const p = await b.newPage({viewport:{width:1000,height:1000}});
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA (' + qs + '): ' + e.message));
  p.__rpc = []; p.__hook = [];
  await p.route('**supabase.co/**', r => {
    const u = r.request().url();
    const j = x => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(u.includes('/storage/')) return j({Key:'ok'});
    if(u.includes('/rpc/')){
      const nome = u.split('/rpc/')[1].split('?')[0];
      let corpo = {}; try{ corpo = JSON.parse(r.request().postData()||'{}'); }catch(e){}
      p.__rpc.push({nome, corpo});
      if(rpc[nome]) return j(rpc[nome](corpo));
      if(nome === 'eu_facilitador') return j(eu);
      if(nome === 'pedido_telas') return j(ped());
      if(nome === 'abrir_pedido_telas') return j({ok:true, id:'novo-1', numero:'C2609-02011', etapa:'lider', situacao:'Esperando a liderança', com_quem:'Brandão'});
      if(nome === 'salvar_edicao') return j({ok:true, versao:3, mudou:{motivo:{antes:'a',depois:'b'}, itens:{}}, mensagem:'Alterações salvas. O pedido voltou para a liderança, que foi avisada.'});
      if(nome === 'desistir_edicao') return j({ok:true, versao:3, mensagem:'Nada foi alterado. O pedido voltou para a liderança. A edição deste pedido já foi usada.'});
      if(nome === 'criar_solicitacao') return j(mock.respostaCriarSolicitacao({id:'velho-1', numero:'C2609-00999'}));
      return j([]);
    }
    if(u.includes('catalogo_itens')) return j(u.includes('offset=0') ? CATALOGO : []);
    if(u.includes('centros_custo'))  return j(u.includes('offset=0') ? CENTROS : []);
    if(u.includes('empresas'))       return j(mock.EMPRESAS_EXEMPLO);
    return j([]);
  });
  await p.route('**n8n.cloud/**', r => { p.__hook.push(r.request().url()); r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
  await p.goto(URL_ + qs, {waitUntil:'load'});
  await p.waitForTimeout(1200);
  return p;
}
const chamou = (p, n) => p.__rpc.filter(x => x.nome === n);
const preencherNovo = p => p.evaluate(()=>{
  marcarRadio('tipo','servico');
  $('escopoServico').value = 'Troca dos rolamentos da peletizadora 2, com mão de obra e alinhamento.';
  $('escopoServico').dispatchEvent(new Event('input'));
  const sel=$('empresa'); sel.value=sel.options[1].value; sel.dispatchEvent(new Event('change'));
  escolherCentroPorTermo('fabrica');
  marcarRadio('tipoCompra','urgente'); marcarRadio('definicaoFornecedor','cotacao');
  const d = new Date(); d.setDate(d.getDate()+10);
  $('dataLimite').value = d.toISOString().slice(0,10); $('dataLimite').dispatchEvent(new Event('change'));
  $('motivoCompra').value = 'Peletizadora parada'; $('motivoCompra').dispatchEvent(new Event('input'));
});
const enviarPagina = async p => { await p.click('#verPagina'); await p.click('#btnAvancar'); await p.waitForTimeout(700); };

(async () => {
const b = await chromium.launch();

/* 1 — pedido novo pelas telas */
{ const p = await abrir(b, '?t=fc-ana');
  ok('1 perguntou quem é', chamou(p,'eu_facilitador')[0] && chamou(p,'eu_facilitador')[0].corpo.p_token === 'fc-ana');
  ok('1 nome do cadastro travado', await p.inputValue('#nomeSolicitante') === 'Ana Paula' &&
     await p.locator('#nomeSolicitante').evaluate(e => e.readOnly));
  ok('1 sem botão de exemplo', !(await p.locator('#btnExemplo').isVisible()));
  ok('1 sem faixa de edição', !(await p.locator('#faixaEdicao').isVisible()));
  await preencherNovo(p);
  await enviarPagina(p);
  const a = chamou(p,'abrir_pedido_telas')[0];
  ok('1 gravou por abrir_pedido_telas', !!a, JSON.stringify(p.__rpc.map(x=>x.nome)));
  ok('1 com o token', a && a.corpo.p_token === 'fc-ana');
  ok('1 cabeçalho só com o conteúdo', a && a.corpo.p_cabecalho.tipo_compra === 'urgente' && a.corpo.p_cabecalho.centro_custo === '20' &&
     !('facilitador' in a.corpo.p_cabecalho) && !('slack_user_id' in a.corpo.p_cabecalho), JSON.stringify(a && a.corpo.p_cabecalho));
  ok('1 item do serviço', a && a.corpo.p_itens.length === 1 && a.corpo.p_itens[0].unidade === 'Serviço');
  ok('1 não usou o caminho do ClickUp', chamou(p,'criar_solicitacao').length === 0 && p.__hook.length === 0, 'hook: ' + p.__hook.length);
  ok('1 confirmação', /Solicitação enviada/.test(await p.textContent('#okTitulo')) && /C2609-02011/.test(await p.textContent('#okNumero')));
  ok('1 diz com quem está', /Esperando a liderança · com Brandão/.test(await p.textContent('#okNumero')));
  ok('1 confirmação não fala de ClickUp', !/ClickUp|card/i.test(await p.locator('.passo.ok ol').textContent()));
  ok('1 link para acompanhar', (await p.getAttribute('.ir-acompanhar','href')) === 'acompanhar.html?t=fc-ana');
  await p.close(); }

/* 1.5 — campo travado diz de onde veio: do cadastro */
{ const p = await abrir(b, '?t=fc-ana');
  ok('1.5 etiqueta do cadastro', (await p.textContent('#ajudaNome .travado-nota')) === 'do cadastro' &&
     (await p.textContent('#ajudaEmail .travado-nota')) === 'do cadastro');
  await p.close(); }

/* 2 — sem ?t= continua pelo ClickUp */
{ const p = await abrir(b, '');
  ok('2 não perguntou eu_facilitador', chamou(p,'eu_facilitador').length === 0);
  await p.fill('#nomeSolicitante','Fulano de Tal'); await p.fill('#emailSolicitante','fulano@leh.com.br');
  await preencherNovo(p);
  await enviarPagina(p);
  ok('2 criar_solicitacao', chamou(p,'criar_solicitacao').length === 1, JSON.stringify(p.__rpc.map(x=>x.nome)));
  ok('2 webhook do ClickUp', p.__hook.length >= 1);
  ok('2 nada das telas', chamou(p,'abrir_pedido_telas').length === 0);
  await p.close(); }

/* 3 — token não reconhecido: não deixa pedir */
{ const p = await abrir(b, '?t=fc-velho', {eu:{ok:false, erro:'token_invalido', mensagem:'Este link não vale mais. Peça um novo com /compras no Slack.'}});
  ok('3 avisa', /Não reconheci este link/.test(await p.textContent('#alerta')) && /Peça um novo/.test(await p.textContent('#alerta')));
  ok('3 sem formulário', !(await p.locator('#nav').isVisible()) && await p.locator('.passo:not([hidden])').count() === 0);
  await p.evaluate(()=> render());
  ok('3 render não traz de volta', await p.locator('.passo:not([hidden])').count() === 0);
  await p.close(); }

/* 4 — edição: carrega, preenche e mostra o prazo */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID);
  const pt = chamou(p,'pedido_telas')[0];
  ok('4 leu o pedido', pt && pt.corpo.p_id === ID && pt.corpo.p_token === 'fc-ana');
  ok('4 título', (await p.textContent('h1')) === 'Editar solicitação');
  ok('4 número no topo', (await p.textContent('#autoNumero')) === 'C2609-02010');
  ok('4 faixa com prazo', await p.locator('#faixaEdicao').isVisible() && /salve até \d\d:\d\d \(faltam (24|25) minutos\)/.test(await p.textContent('#textoEdicao')), await p.textContent('#textoEdicao'));
  ok('4 faixa avisa que é única', /não dá para editar de novo/.test(await p.textContent('#textoEdicao')));
  const est = await p.evaluate(() => JSON.parse(JSON.stringify(estado)));
  ok('4 lista com 2 itens', est.tipo === 'lista' && est.itensLista.length === 2, JSON.stringify(est.itensLista));
  ok('4 família do catálogo', est.itensLista[0].familia === 'MM', est.itensLista[0].familia);
  ok('4 cabeçalho preenchido', est.motivoCompra === 'Rolamentos da peletizadora' && est.centroCusto === '20' && est.empresa === 'wienfried-pr' &&
     est.tipoCompra === 'normal' && est.definicaoFornecedor === 'cotacao' && est.dataLimite === '2027-01-15' &&
     est.solicitanteNome === 'João' && est.observacao === 'Urgente para a linha 2', JSON.stringify(est));
  ok('4 campo de anexo trocado por aviso', await p.locator('#anexos').count() === 0 && /Na edição não dá para trocar arquivo/.test(await p.textContent('body')));
  await p.click('#verPagina');
  ok('4 botão diz salvar', (await p.textContent('#btnAvancar')).trim() === 'Salvar alterações');
  /* muda o motivo e salva */
  await p.fill('#motivoCompra', 'Rolamentos e retentores da peletizadora');
  await p.click('#btnAvancar'); await p.waitForTimeout(600);
  const s = chamou(p,'salvar_edicao')[0];
  ok('4 salvou por salvar_edicao', s && s.corpo.p_id === ID && s.corpo.p_token === 'fc-ana' &&
     s.corpo.p_cabecalho.motivo === 'Rolamentos e retentores da peletizadora' && s.corpo.p_itens.length === 2, JSON.stringify(s));
  ok('4 não abriu pedido novo', chamou(p,'abrir_pedido_telas').length === 0 && chamou(p,'criar_solicitacao').length === 0 && p.__hook.length === 0);
  ok('4 confirmação', /Alterações salvas/.test(await p.textContent('#okTitulo')));
  ok('4 diz o que mudou', /Mudou: motivo, itens\./.test(await p.textContent('#okAviso')), await p.textContent('#okAviso'));
  ok('4 sem nova solicitação', !(await p.locator('#btnRecomecar').isVisible()));
  ok('4 faixa some', !(await p.locator('#faixaEdicao').isVisible()));
  await p.close(); }

/* 5 — edição de item único e de serviço preenchem o tipo certo */
{ let p = await abrir(b, '?t=fc-ana&editar=' + ID, {ped:()=>({ok:true, pedido:PEDIDO(), itens:[ITENS_LISTA[0]]})});
  let est = await p.evaluate(() => ({tipo:estado.tipo, cod:estado.item && estado.item.codigo, q:estado.quantidade}));
  ok('5 item único', est.tipo === 'item' && est.cod === '1201' && est.q === '4', JSON.stringify(est));
  await p.close();
  p = await abrir(b, '?t=fc-ana&editar=' + ID, {ped:()=>({ok:true, pedido:PEDIDO(), itens:[{codigo:null, descricao:'Pintura do galpão 3 com duas demãos', unidade:'Serviço', quantidade:1, fora_catalogo:true}]})});
  est = await p.evaluate(() => ({tipo:estado.tipo, esc:estado.escopoServico}));
  ok('5 serviço', est.tipo === 'servico' && /Pintura/.test(est.esc), JSON.stringify(est));
  await p.close(); }

/* 6 — pedido que não está em edição */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID, {ped:()=>({ok:true, pedido:PEDIDO({em_edicao:false, etapa_atual:'lider'}), itens:ITENS_LISTA})});
  ok('6 avisa', /não está em edição/.test(await p.textContent('#alerta')));
  ok('6 link de volta', (await p.getAttribute('#alerta a','href')) === 'acompanhar.html?t=fc-ana');
  ok('6 sem formulário', !(await p.locator('#nav').isVisible()));
  await p.close(); }

/* 7 — pedido de outra pessoa */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID, {ped:()=>({ok:false, erro:'sem_acesso', mensagem:'Este pedido não está no seu alcance.'})});
  ok('7 avisa com a mensagem do banco', /não está no seu alcance/.test(await p.textContent('#alerta')));
  ok('7 sem formulário', !(await p.locator('#nav').isVisible()));
  await p.close(); }

/* 8 — desistir pede confirmação e encerra */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID);
  await p.click('#btnDesistirEdicao');
  ok('8 primeiro clique só pede confirmação', chamou(p,'desistir_edicao').length === 0 &&
     /Clique de novo/.test(await p.textContent('#btnDesistirEdicao')));
  await p.click('#btnDesistirEdicao'); await p.waitForTimeout(400);
  const d = chamou(p,'desistir_edicao')[0];
  ok('8 desistiu', d && d.corpo.p_id === ID && d.corpo.p_token === 'fc-ana');
  ok('8 diz que a edição foi usada', /já foi usada/.test(await p.textContent('#textoEdicao')));
  ok('8 formulário some', !(await p.locator('#nav').isVisible()) && await p.locator('.passo:not([hidden])').count() === 0);
  ok('8 sem botão de desistir', !(await p.locator('#btnDesistirEdicao').isVisible()));
  await p.close(); }

/* 9 — desistir: confirmação expira sozinha */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID);
  await p.click('#btnDesistirEdicao'); await p.waitForTimeout(5300);
  ok('9 volta ao normal', (await p.textContent('#btnDesistirEdicao')) === 'Desistir da edição');
  await p.click('#btnDesistirEdicao');
  ok('9 um clique depois ainda não desiste', chamou(p,'desistir_edicao').length === 0);
  await p.close(); }

/* 10 — prazo vencido na abertura */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID, {ped:()=>({ok:true, pedido:PEDIDO({edicao_expira_em:emMin(-1)}), itens:ITENS_LISTA})});
  ok('10 diz que passou o prazo', /Passou o prazo/.test(await p.textContent('#textoEdicao')));
  ok('10 faixa vermelha', await p.locator('#faixaEdicao.vencida').count() === 1);
  ok('10 sem formulário', !(await p.locator('#nav').isVisible()));
  await p.close(); }

/* 11 — servidor diz que venceu ao salvar */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID, {rpc:{salvar_edicao:()=>({ok:false, erro:'edicao_expirou', mensagem:'Passaram os 30 minutos: a edição foi descartada.'})}});
  await enviarPagina(p);
  ok('11 mostra a mensagem', /Passaram os 30 minutos/.test(await p.textContent('#textoEdicao')));
  ok('11 sem confirmação de salvo', !(await p.locator('.passo.ok').isVisible()));
  await p.close(); }

/* 12 — recusa comum ao salvar: mantém o formulário para corrigir */
{ const p = await abrir(b, '?t=fc-ana&editar=' + ID, {rpc:{salvar_edicao:()=>({ok:false, erro:'centro_custo_invalido', mensagem:'Centro de custo não encontrado na lista.'})}});
  await enviarPagina(p);
  ok('12 alerta com a mensagem', /Centro de custo não encontrado/.test(await p.textContent('#alerta')));
  ok('12 botão volta', await p.locator('#btnAvancar').isEnabled() && (await p.textContent('#btnAvancar')).trim() === 'Salvar alterações');
  ok('12 faixa continua', await p.locator('#faixaEdicao').isVisible());
  await p.close(); }

/* 13 — mensagem do banco não vira HTML */
{ const p = await abrir(b, '?t=fc-x', {eu:{ok:false, mensagem:'<img src=x onerror="window.__x=1">'}});
  ok('13 escapa', await p.locator('#alerta img').count() === 0 && !(await p.evaluate(()=>window.__x)));
  await p.close(); }

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f=>console.log(' ✗ ' + f));
})();
