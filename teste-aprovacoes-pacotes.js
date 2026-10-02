/* ============================================================================
   TELA DE APROVAÇÃO — PACOTES DO LOTE MENSAL (fase 3, 02/10)
   No financeiro, os pedidos do lote não aparecem soltos: cada gerência vira um
   pacote (uma linha). Aprovar ou reprovar vale para todos os pedidos dela; os
   pedidos abrem embaixo da linha. Reprovar pede motivo. Sem "Devolver".
   ========================================================================== */
const { chromium } = require('playwright');
const base = 'file://' + __dirname + '/aprovacoes.html';
const falhas = [];
const ok = (n, c, d) => c ? null : falhas.push(n + ' — ' + (d === undefined ? '' : (typeof d === 'string' ? d : JSON.stringify(d))));
const hoje = new Date().toISOString();
const LOTE = 'lt-1';

function banco(){
  const P = (id, numero, o) => Object.assign({ id, numero, card_id:null, etapa_atual:'financeiro', facilitador:'Ana', solicitante_nome:'Ana',
    centro_custo:'20', centro_custo_nome:'FABRICA', unidade_negocio:'Fábrica', tipo_compra:'mensal', data_necessidade:'2026-11-10', motivo:'Motivo ' + numero,
    aberto_em:hoje, total_itens:2, valor_cotado:'100.00', fornecedor_cotado:'ROLAMAX', versao:1, lote_id:LOTE }, o);
  return {
    pedidos:[
      P('n1', 'C2610-00050', { tipo_compra:'normal', lote_id:null, motivo:'Compra avulsa', valor_cotado:'250.00' }),
      P('l1', 'C2610-00010', { gerencia_id:'g1', valor_cotado:'100.00', motivo:'Mensal <b>fábrica</b>' }),
      P('l2', 'C2610-00012', { gerencia_id:'g1', centro_custo:'21', centro_custo_nome:'RACAO', valor_cotado:'40.00', solicitante_nome:'Bia' }),
      P('l3', 'C2610-00011', { gerencia_id:'g2', centro_custo:'31', centro_custo_nome:'LAVOURA', unidade_negocio:'Fazenda', valor_cotado:'70.00', solicitante_nome:'Carlos' }),
    ],
    pacotes:{ g1:{ gerencia:'Gerente Fábrica', total:140, estado:'aguardando' }, g2:{ gerencia:'Gerente Fazenda', total:70, estado:'aguardando' } },
    chamadas:[]
  };
}
function responder(B, nome, c){
  const ativos = B.pedidos.filter(p => p.etapa_atual === 'financeiro');
  if (nome === 'aprovador_do_token') return [{ id:'wienfried', nome:'WIENFRIED', etapas:['financeiro'] }];
  if (nome === 'fila_de_aprovacao') return ativos.map(({ gerencia_id, lote_id, versao, unidade_negocio, solicitante_nome, ...x }) => Object.assign(x, { solicitante_nome }));
  if (nome === 'fila_do_aprovador'){
    if (B.semExtra) throw new Error('fora');
    return { ok:true, pedidos:ativos.map(p => ({ id:p.id, canal:'telas', versao:p.versao, etapa_atual:p.etapa_atual, pode_devolver:!p.lote_id, lote_id:p.lote_id, gerencia_id:p.gerencia_id || null, tipo_compra:p.tipo_compra })),
      em_edicao:[], compartilhada_com:[],
      pacotes:Object.entries(B.pacotes).filter(([g, k]) => k.estado === 'aguardando').map(([g, k]) => {
        const peds = ativos.filter(p => p.lote_id && p.gerencia_id === g);
        return { lote_id:LOTE, competencia:'2026-10-01', fechado_em:'2026-10-20T03:00:05Z', gerencia_id:g, gerencia:k.gerencia, total:k.total, estado:k.estado,
          total_itens:peds.reduce((t, p) => t + p.total_itens, 0), desde:hoje,
          pedidos:peds.map(p => ({ id:p.id, numero:p.numero, versao:p.versao, valor_cotado:p.valor_cotado, centro_custo:p.centro_custo, centro_custo_nome:p.centro_custo_nome,
            unidade_negocio:p.unidade_negocio, facilitador:p.facilitador, solicitante_nome:p.solicitante_nome, motivo:p.motivo, data_necessidade:p.data_necessidade, total_itens:p.total_itens })) };
      }) };
  }
  if (nome === 'decidir_pedido'){
    const p = B.pedidos.find(x => x.id === c.p_id);
    if (p.lote_id) return { ok:false, erro:'decida_pelo_pacote', mensagem:'Este pedido faz parte do lote mensal: decida pelo pacote da gerência, na sua fila de aprovações.' };
    p.etapa_atual = null; return { ok:true, mensagem:'Aprovado.' };
  }
  if (nome === 'decidir_pacote'){
    if (c.p_token !== 'ap-w') return { ok:false, erro:'token_invalido', mensagem:'Este link de aprovação não vale mais.' };
    if (B.falharPacote) return { ok:false, erro:'nao_e_a_vez', mensagem:'C2610-00010: Este pedido não está esperando a sua decisão.' };
    const k = B.pacotes[c.p_gerencia_id];
    if (!k || c.p_lote_id !== LOTE) return { ok:false, erro:'nao_encontrado', mensagem:'Pacote não encontrado.' };
    if (!['aprovado','reprovado'].includes(c.p_decisao)) return { ok:false, erro:'decisao_invalida', mensagem:'Só aprovar ou reprovar.' };
    if (c.p_decisao === 'reprovado' && !String(c.p_motivo || '').trim()) return { ok:false, erro:'sem_motivo', mensagem:'Reprovar exige motivo.' };
    if (k.estado !== 'aguardando') return { ok:false, erro:'ja_decidido', mensagem:'Já decidido.' };
    const peds = B.pedidos.filter(p => p.lote_id && p.gerencia_id === c.p_gerencia_id && p.etapa_atual === 'financeiro');
    peds.forEach(p => p.etapa_atual = null); k.estado = c.p_decisao; k.motivo = c.p_motivo;
    return { ok:true, pedidos:peds.length, estado:c.p_decisao, gerencia:k.gerencia,
      mensagem:'Pacote de ' + k.gerencia + (c.p_decisao === 'aprovado' ? ' aprovado: ' + peds.length + ' pedidos seguem para a ordem de compra.' : ' reprovado: ' + peds.length + ' pedidos encerrados, com o motivo. As outras gerências seguem.') };
  }
  if (nome.startsWith('historico')) return [];
  return [];
}
async function tela(b, { vw = 1440, prep = null, qs = '?t=ap-w' } = {}){
  const p = await b.newPage({ viewport:{ width:vw, height:900 } });
  p.B = banco(); if (prep) prep(p.B);
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA: ' + e.message));
  p.on('dialog', d => { falhas.push('DIÁLOGO: ' + d.message()); d.dismiss(); });
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    p.B.chamadas.push({ nome, c });
    let x; try { x = responder(p.B, nome, c); } catch (e) { return r.fulfill({ status:500, contentType:'application/json', body:'{"message":"erro"}' }); }
    return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
  });
  await p.route('**n8n.cloud/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }));
  await p.goto(base + qs, { waitUntil:'load' }); await p.waitForTimeout(600);
  return p;
}
const ch = (p, n) => p.B.chamadas.filter(x => x.nome === n);
const linhasFila = p => p.$$eval('#corpoFila > tr:not(.pacote-det)', t => t.map(x => (x.querySelector('a.numero-sc, .btn-pacote') || {}).textContent));
const linhaPac = (p, g) => p.locator(`#corpoFila tr[data-id="pk:${LOTE}:${g}"]`);

(async () => {
const b = await chromium.launch();

/* 1 — a fila agrupa o lote em pacotes por gerência */
{ const p = await tela(b);
  const ls = await linhasFila(p);
  ok('1 três linhas: avulsa + 2 pacotes (pedidos do lote não aparecem soltos)', ls.length === 3 && ls.filter(x => x === 'Lote 10/2026').length === 2 && ls.includes('C2610-00050') && !ls.some(x => /C2610-0001[012]/.test(x)), ls);
  const t1 = await linhaPac(p, 'g1').textContent();
  ok('1 linha do pacote: gerência, pedidos, valor, selos', /Gerente Fábrica/.test(t1) && /2 pedidos/.test(t1) && /R\$\s?140,00/.test(t1) && /Pacote da gerência/.test(t1) && /Mensal/.test(t1) && /2 centros de custo/.test(t1), t1);
  ok('1 itens somados dos pedidos', /\b4\b/.test(await linhaPac(p, 'g1').locator('td.num').first().textContent()));
  ok('1 pacote de um CC mostra o nome do CC', /LAVOURA/.test(await linhaPac(p, 'g2').textContent()));
  ok('1 pacote sem Devolver', await linhaPac(p, 'g1').locator('.btn-linha.dev').count() === 0 && await linhaPac(p, 'g1').locator('.btn-linha.sim').count() === 1 && await linhaPac(p, 'g1').locator('.btn-linha.nao').count() === 1);
  ok('1 contagem: 3 na fila', (await p.textContent('#contaFila')) === '3');
  ok('1 tipos: mensal conta os pacotes', /2/.test(await p.textContent('#segTipo [data-tipo=mensal]')));
  /* abrir os pedidos do pacote */
  await linhaPac(p, 'g1').locator('.btn-pacote').click(); await p.waitForTimeout(150);
  const det = await p.textContent('tr.pacote-det');
  ok('1 abre os pedidos do pacote', await p.locator('tr.pacote-det table.pacote-ped tbody tr').count() === 2 && /C2610-00010/.test(det) && /RACAO/.test(det) && /Fábrica/.test(det) && /Bia/.test(det) && /R\$\s?40,00/.test(det), det);
  ok('1 motivo não vira HTML', await p.locator('tr.pacote-det b').count() === 0 && /<b>fábrica<\/b>/.test(det));
  const href = await p.getAttribute('tr.pacote-det a.numero-sc', 'href');
  ok('1 cada pedido abre a tela do pedido com o token', /pedido\.html\?id=l1&t=ap-w&e=financeiro/.test(href), href);
  ok('1 botão diz que está aberto e mantém o foco', (await linhaPac(p, 'g1').locator('.btn-pacote').getAttribute('aria-expanded')) === 'true' && await p.evaluate(() => document.activeElement.classList.contains('btn-pacote')));
  await linhaPac(p, 'g1').locator('.btn-pacote').click(); await p.waitForTimeout(150);
  ok('1 fecha de novo', await p.locator('tr.pacote-det').count() === 0);
  /* busca acha o pacote pelo número de um pedido dele */
  await p.fill('#filtro', '00012'); await p.waitForTimeout(150);
  ok('1 busca pelo número de um pedido do pacote', JSON.stringify(await linhasFila(p)) === JSON.stringify(['Lote 10/2026']) && /Fábrica/.test(await linhaPac(p, 'g1').textContent()));
  await p.fill('#filtro', 'lavoura'); await p.waitForTimeout(150);
  ok('1 busca pelo centro de custo de um pedido', (await linhasFila(p)).length === 1 && await linhaPac(p, 'g2').count() === 1);
  await p.fill('#filtro', ''); await p.waitForTimeout(100);
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(100);
  ok('1 filtro Mensal mostra só os pacotes', (await linhasFila(p)).length === 2);
  await p.click('#segTipo [data-tipo=mensal]'); await p.waitForTimeout(100);
  await p.close(); }

/* 2 — aprovar um pacote */
{ const p = await tela(b);
  await linhaPac(p, 'g1').locator('.btn-linha.sim').click(); await p.waitForTimeout(500);
  const c = ch(p, 'decidir_pacote')[0];
  ok('2 decidir_pacote com lote, gerência e token no corpo', c && c.c.p_lote_id === LOTE && c.c.p_gerencia_id === 'g1' && c.c.p_decisao === 'aprovado' && c.c.p_token === 'ap-w' && c.c.p_motivo === null, c);
  ok('2 não decidiu pedido a pedido', ch(p, 'decidir_pedido').length === 0);
  ok('2 aviso do banco', /Pacote de Gerente Fábrica aprovado: 2 pedidos/.test(await p.textContent('#avisoTopo')), await p.textContent('#avisoTopo'));
  ok('2 pacote sai da fila; o outro fica', await linhaPac(p, 'g1').count() === 0 && await linhaPac(p, 'g2').count() === 1 && (await p.textContent('#contaFila')) === '2');
  await p.close(); }

/* 3 — reprovar um pacote: motivo obrigatório, texto do pacote */
{ const p = await tela(b);
  await linhaPac(p, 'g2').locator('.btn-linha.nao').click(); await p.waitForTimeout(150);
  ok('3 caixa diz que é o pacote', /Reprovar o pacote da gerência/.test(await p.textContent('#tituloModal')) && /Gerente Fazenda · 1 pedido · R\$\s?70,00/.test(await p.textContent('#subModal'))
     && /As outras gerências do lote seguem/.test(await p.textContent('#notaMotivo')) && /Reprovar o pacote/.test(await p.textContent('#btnConfirmarReprova')), await p.textContent('#subModal'));
  await p.fill('#motivoReprova', 'curto'); await p.click('#btnConfirmarReprova'); await p.waitForTimeout(150);
  ok('3 motivo curto não vai', !(await p.locator('#erroMotivo').isHidden()) && ch(p, 'decidir_pacote').length === 0);
  await p.fill('#motivoReprova', 'Acima do orçamento do mês'); await p.click('#btnConfirmarReprova'); await p.waitForTimeout(500);
  const c = ch(p, 'decidir_pacote')[0];
  ok('3 reprova com o motivo', c && c.c.p_decisao === 'reprovado' && c.c.p_motivo === 'Acima do orçamento do mês' && c.c.p_gerencia_id === 'g2', c);
  ok('3 aviso e fila', /reprovado: 1 pedidos encerrados/.test(await p.textContent('#avisoTopo')) && await linhaPac(p, 'g2').count() === 0);
  /* a caixa volta ao texto normal para um pedido avulso */
  await p.locator('#corpoFila tr[data-id="n1"] .btn-linha.nao').click(); await p.waitForTimeout(150);
  ok('3 caixa do pedido avulso volta ao texto normal', /Reprovar solicitação/.test(await p.textContent('#tituloModal')) && (await p.textContent('#btnConfirmarReprova')) === 'Reprovar' && !/pacote/.test(await p.textContent('#notaMotivo')));
  await p.click('#btnCancelar');
  await p.close(); }

/* 4 — aprovar selecionadas com pacote e pedido avulso juntos */
{ const p = await tela(b);
  await p.click('#marcarTodas'); await p.waitForTimeout(100);
  ok('4 marcar todas conta os pacotes como linhas', /Aprovar 3 selecionadas/.test(await p.textContent('#btnLote')));
  await p.click('#btnLote'); await p.waitForTimeout(800);
  ok('4 uma chamada por pacote e uma pelo avulso', ch(p, 'decidir_pacote').length === 2 && ch(p, 'decidir_pedido').length === 1 && ch(p, 'decidir_pedido')[0].c.p_id === 'n1');
  ok('4 fila vazia depois', (await linhasFila(p)).length === 0 && /3 solicitações aprovadas/.test(await p.textContent('#avisoTopo')));
  await p.close(); }

/* 5 — recusa do banco: aviso e fila recarregada; o pacote continua */
{ const p = await tela(b, { prep:B => { B.falharPacote = true; } });
  await linhaPac(p, 'g1').locator('.btn-linha.sim').click(); await p.waitForTimeout(700);
  ok('5 recusa explicada', /Não consegui registrar 1 decisão: Lote 10\/2026 · Gerente Fábrica — C2610-00010/.test(await p.textContent('#avisoTopo')), await p.textContent('#avisoTopo'));
  ok('5 pacote continua na fila e os botões voltam', await linhaPac(p, 'g1').count() === 1 && !(await linhaPac(p, 'g1').locator('.btn-linha.sim').isDisabled()));
  await p.close(); }

/* 6 — sem a segunda leitura (fila_do_aprovador fora): cai nos pedidos soltos, e o banco explica */
{ const p = await tela(b, { prep:B => { B.semExtra = true; } });
  ok('6 sem pacotes, a fila mostra os pedidos como antes', (await linhasFila(p)).length === 4);
  await p.close(); }

/* 7 — observador: pacote aparece, botões desligados, pedidos abrem com o acesso do observador */
{ const p = await b.newPage({ viewport:{ width:1440, height:900 } });
  p.B = banco();
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA (obs): ' + e.message));
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    p.B.chamadas.push({ nome, c });
    const j = x => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
    if (nome === 'observar_como'){
      if (c.p_funcao === 'aprovadores') return j({ ok:true, aprovadores:[{ id:'wienfried', nome:'WIENFRIED', etapas:['financeiro'], na_fila:4 }] });
      return j(responder(p.B, c.p_funcao, c));
    }
    return j({ ok:false });
  });
  await p.goto(base + '?o=fn-x&a=wienfried', { waitUntil:'load' }); await p.waitForTimeout(700);
  ok('7 observador vê os pacotes', await linhaPac(p, 'g1').count() === 1);
  ok('7 botões desligados', await linhaPac(p, 'g1').locator('.btn-linha.sim').isDisabled());
  await linhaPac(p, 'g1').locator('.btn-pacote').click(); await p.waitForTimeout(150);
  ok('7 pedidos do pacote abrem com o acesso do observador', /&o=fn-x&a=wienfried&e=financeiro/.test(await p.getAttribute('tr.pacote-det a.numero-sc', 'href')));
  ok('7 nada foi decidido', !p.B.chamadas.some(x => /decidir/.test(x.nome) || /decidir/.test(x.c.p_funcao || '')));
  await p.close(); }

/* 8 — celular: sem rolagem lateral da página */
{ const p = await tela(b, { vw:390 });
  await linhaPac(p, 'g1').locator('.btn-pacote').click(); await p.waitForTimeout(150);
  ok('8 celular: página sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.close(); }

/* 9 — tela do pedido: pedido do lote no financeiro não tem Aprovar/Reprovar soltos */
for (const caso of ['lote', 'avulso']){
  const p = await b.newPage({ viewport:{ width:1280, height:900 } });
  p.on('pageerror', e => falhas.push('ERRO DE PÁGINA (pedido): ' + e.message));
  const B = banco(); const alvo = B.pedidos.find(x => x.id === (caso === 'lote' ? 'l1' : 'n1'));
  await p.route('**/rest/v1/rpc/**', r => {
    const nome = r.request().url().split('/rpc/')[1].split('?')[0];
    const j = x => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
    if (nome === 'abrir_pedido') return j({ ok:true, pedido:Object.assign({ canal:'telas', status:'aguardando aprovacao', empresa_id:null }, alvo),
      itens:[{ id:'i1', codigo:'1201', descricao:'ROLAMENTO', unidade:'UN', quantidade:2 }], anexos:[], itens_cortados:[] });
    if (nome === 'fila_de_aprovacao') return j(responder(B, 'fila_de_aprovacao', {}));
    if (nome === 'pedido_telas') return j({ ok:true, pedido:{}, itens:[], anexos:[], linha_do_tempo:[], mapa:null, pode:{} });
    return j([]);
  });
  await p.goto('file://' + __dirname + '/pedido.html?id=' + alvo.id + '&t=ap-w&e=financeiro', { waitUntil:'load' }); await p.waitForTimeout(900);
  const barra = await p.textContent('#barraAprova');
  const visiveis = await p.$$eval('#botoesAprova button', bs => bs.filter(x => !x.hidden).map(x => x.id));
  if (caso === 'lote'){
    ok('9 pedido do lote: diz que é decidido pelo pacote', /faz parte do lote mensal/.test(barra) && /aprove ou reprove o pacote/.test(barra), barra);
    ok('9 pedido do lote: sem botões de decisão', visiveis.length === 0, visiveis);
    ok('9 pedido do lote: volta para a fila', !(await p.locator('#voltarTopo').isHidden()));
  } else {
    ok('9 pedido avulso continua com Aprovar e Reprovar', visiveis.includes('btnAprovar') && visiveis.includes('btnReprovar'), visiveis);
  }
  await p.close();
}

await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') =====');
falhas.forEach(f => console.log(' ✗ ' + f));
})();
