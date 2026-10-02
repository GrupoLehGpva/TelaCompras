/* ============================================================================
   BATERIA: EXCLUIR ITEM e FORNECEDORES na tela de cadastro do GR.
   Clique, digitação e seleção, como a pessoa faz. evaluate só para conferir.
   O banco é o de mentira do mock-supabase.js (mesmas regras de
   cadastro-fornecedores-e-exclusao.sql, conferidas no Postgres por
   teste-fornecedores-e-exclusao.sql).

     node teste-cadastro-fornecedores.js
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const url = 'file://' + __dirname + '/cadastro-itens.html';
const falhas = [], notas = [];
const ok = (n, c, d) => c ? notas.push('ok  ' + n) : falhas.push(n + ' — ' + (d === undefined ? '' : d));

const CATALOGO = [
  { codigo:'5046', familia:'MM', descricao:'PNEU 275/80R22.5 ARMOR MAX', unidade:'UNID' },
  { codigo:'101',  familia:'HL', descricao:'SABAO EM PO 1KG',            unidade:'UNID' },
  { codigo:'102',  familia:'HL', descricao:'SABAO EM BARRA 200G',        unidade:'UNID' },
  { codigo:'103',  familia:'CL', descricao:'OLEO DIESEL S10',            unidade:'L' },
  { codigo:'200',  familia:'MM', descricao:'FILTRO ANTIGO',              unidade:'UNID', ativo:false }
];
/* Fornecedores como vêm do GR: com documento, sem endereço. */
const FORNECEDORES = [
  { id:'518',  razao_social:'BATERIAS PLANALTO LTDA',     tipo_pessoa:'PJ', cnpj:'78.043.593/0001-60', cidade:'GUARAPUAVA', uf:'PR' },
  { id:'5494', razao_social:'BR COMERCIO DE BATERIAS LTDA', tipo_pessoa:'PJ', cnpj:'37.437.204/0001-02', cidade:'BALSAS', uf:'MA' },
  { id:'700',  razao_social:'JOSE DA SILVA',              tipo_pessoa:'PF', cnpj:'529.982.247-25', cidade:'PALMEIRA', uf:'PR' },
  { id:'800',  razao_social:'FORNECEDOR QUE FECHOU',      tipo_pessoa:'PJ', cnpj:'45.454.545/0001-06', cidade:'CURITIBA', uf:'PR', ativo:false }
];
const LOGINS = { 'compras': { nome:'Compras Teste', senha:'senha-certa-123' } };
const CNPJ_NOVO = '11222333000181', CPF_NOVO = '12345678909';

async function tela(b, { falhar = {}, viewport, colorScheme } = {}){
  const banco = mock.bancoDoCadastro({ catalogo: CATALOGO, fornecedores: FORNECEDORES, logins: LOGINS });
  const ctx = await b.newContext(Object.assign({}, viewport ? { viewport } : {}, colorScheme ? { colorScheme } : {}));
  const p = await ctx.newPage();
  const errosJs = [];
  p.on('pageerror', e => errosJs.push(String(e)));
  p.on('dialog', d => { errosJs.push('dialog: ' + d.message()); d.dismiss(); });
  await banco.instalarNa(p, { falhar });
  await p.goto(url, { waitUntil:'load' });
  await p.waitForTimeout(250);
  await p.fill('#login', 'compras'); await p.fill('#senha', 'senha-certa-123');
  await p.click('#btnEntrar'); await p.waitForTimeout(200);
  return { p, banco, errosJs, ctx };
}
const txt = (p, sel) => p.locator(sel).first().textContent();
const vis = (p, sel) => p.locator(sel).first().isVisible();
const foco = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const invalidos = (p, form) => p.$$eval(form + ' .campo.invalido', cs => cs.map(c => c.dataset.fcampo || c.dataset.campo));
const chamadas = (banco, nome) => banco.chamadas.filter(c => c.nome === nome);
const ultima = (banco, nome) => chamadas(banco, nome).slice(-1)[0];
const digitar = async (p, sel, v) => { await p.fill(sel, ''); await p.type(sel, v); };
async function irFornecedores(p){ await p.click('#abaFornecedores'); await p.waitForTimeout(80); }
async function preencherForn(p, d){
  if(d.codigo != null) await digitar(p, '#fCodigo', d.codigo);
  if(d.tipo) await p.check('input[name="tipoPessoa"][value="' + d.tipo + '"]');
  if(d.doc != null) await digitar(p, '#documento', d.doc);
  if(d.razao != null) await digitar(p, '#razao', d.razao);
  if(d.end != null) await digitar(p, '#endereco', d.end);
  if(d.bairro != null) await digitar(p, '#bairro', d.bairro);
  if(d.cep != null) await digitar(p, '#cep', d.cep);
  if(d.cidade != null) await digitar(p, '#cidade', d.cidade);
  if(d.uf != null) await p.selectOption('#uf', d.uf);
}
const salvarForn = async p => { await p.click('#btnSalvarForn'); await p.waitForTimeout(250); };
async function buscar(p, termo){ await digitar(p, '#buscaForn', termo); await p.waitForTimeout(600); }

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  /* ------------------------------------------------------------------ ABAS */
  {
    const { p, errosJs, ctx } = await tela(b);
    ok('abre na aba Itens', await p.getAttribute('#abaItens', 'aria-selected') === 'true' &&
       await vis(p, '#painelItens') && !(await vis(p, '#painelFornecedores')));
    await irFornecedores(p);
    ok('clicar em Fornecedores troca o painel', await vis(p, '#painelFornecedores') && !(await vis(p, '#painelItens')) &&
       await p.getAttribute('#abaFornecedores', 'aria-selected') === 'true');
    ok('foco vai ao código do fornecedor', await foco(p) === 'fCodigo');
    ok('aviso fixo do fornecedor: GR e duplicidade', /precisa já estar criado no GR/.test(await txt(p, '#regrasForn')) &&
       /duplicidade/i.test(await txt(p, '#regrasForn')));
    ok('título da tela fala de itens e fornecedores', /Itens e fornecedores/.test(await txt(p, '.topo h1')));
    await p.click('#abaItens'); await p.waitForTimeout(80);
    ok('volta para Itens', await vis(p, '#painelItens') && await foco(p) === 'codigo');
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------ EXCLUIR ITEM */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await digitar(p, '#buscaExcluir', 's');
    ok('uma letra não busca', (await p.locator('#resultadosExcluir .linha').count()) === 0);
    await digitar(p, '#buscaExcluir', 'sabão');
    ok('busca por nome, sem acento', (await p.locator('#resultadosExcluir .linha').count()) === 2);
    await digitar(p, '#buscaExcluir', '5046');
    ok('busca por código', (await p.locator('#resultadosExcluir .linha').count()) === 1 && /PNEU/.test(await txt(p, '#resultadosExcluir')));
    await digitar(p, '#buscaExcluir', 'filtro antigo');
    ok('item já fora do formulário não aparece na busca por nome', (await p.locator('#resultadosExcluir .linha').count()) === 0 &&
       /Nenhum item/.test(await txt(p, '#resultadosExcluir')));
    await digitar(p, '#buscaExcluir', '200');
    ok('pelo código, o já excluído aparece sem botão', /já está fora do formulário/.test(await txt(p, '#resultadosExcluir')) &&
       (await p.locator('#resultadosExcluir .linha[data-codigo="200"] [data-acao="pedir-excluir"]').count()) === 0 &&
       (await p.locator('#resultadosExcluir .linha.excluido[data-codigo="200"]').count()) === 1);

    await digitar(p, '#buscaExcluir', 'sabao');
    const linhas = p.locator('#resultadosExcluir .linha');
    await linhas.nth(0).locator('[data-acao="pedir-excluir"]').click();
    ok('excluir pede confirmação e foca o motivo', await linhas.nth(0).locator('.confirma').isVisible() && await foco(p) === 'motivoItem');
    await linhas.nth(1).locator('[data-acao="pedir-excluir"]').click();
    ok('só uma confirmação aberta por vez', !(await linhas.nth(0).locator('.confirma').isVisible()) && await linhas.nth(1).locator('.confirma').isVisible());
    await linhas.nth(1).locator('[data-acao="cancelar-excluir"]').click();
    ok('cancelar fecha sem chamar o banco', !(await linhas.nth(1).locator('.confirma').isVisible()) &&
       chamadas(banco, 'catalogo_salvar_item').length === 0);

    const alvo = await linhas.nth(0).getAttribute('data-codigo');
    await linhas.nth(0).locator('[data-acao="pedir-excluir"]').click();
    await p.fill('#motivoItem', 'Duplicado do 102');
    await linhas.nth(0).locator('[data-acao="confirmar-excluir"]').dblclick(); await p.waitForTimeout(300);
    ok('duplo clique exclui uma vez só', chamadas(banco, 'catalogo_salvar_item').length === 1);
    const c = ultima(banco, 'catalogo_salvar_item');
    ok('manda modo excluir, código e motivo', c.corpo.p_modo === 'excluir' && c.corpo.p_item.codigo === alvo &&
       c.corpo.p_item.motivo === 'Duplicado do 102', JSON.stringify(c.corpo));
    ok('item fica fora do formulário', banco.itens.get(alvo).ativo === false && banco.itens.get(alvo).excluido === true);
    ok('aviso de excluído e busca limpa', /excluído/.test(await txt(p, '#avisoExcluir')) && await p.inputValue('#buscaExcluir') === '' &&
       await foco(p) === 'buscaExcluir');
    await digitar(p, '#buscaExcluir', alvo);
    ok('catálogo da tela já sabe que saiu', /já está fora do formulário/.test(await txt(p, '#resultadosExcluir')));

    /* Enter no motivo confirma */
    await digitar(p, '#buscaExcluir', 'diesel');
    await p.click('#resultadosExcluir [data-acao="pedir-excluir"]');
    await p.press('#motivoItem', 'Enter'); await p.waitForTimeout(300);
    ok('Enter no motivo confirma a exclusão', banco.itens.get('103').ativo === false);

    /* alguém excluiu antes: a tela diz e se atualiza */
    await digitar(p, '#buscaExcluir', 'pneu');
    await p.click('#resultadosExcluir [data-acao="pedir-excluir"]');
    banco.itens.get('5046').ativo = false;
    await p.click('#resultadosExcluir [data-acao="confirmar-excluir"]'); await p.waitForTimeout(250);
    ok('já excluído por outra pessoa: avisa', /já estava excluído/.test(await txt(p, '#avisoExcluir')));

    /* depois de excluído, cadastrar o mesmo código oferece reativar */
    await p.fill('#codigo', alvo); await p.fill('#descricao', 'SABAO DE VOLTA'); await p.selectOption('#familia', 'HL'); await p.selectOption('#unidade', 'UNID');
    await p.click('#btnSalvar'); await p.waitForTimeout(250);
    ok('código excluído oferece reativar', await vis(p, '#btnReativar'));
    await p.click('#btnReativar'); await p.waitForTimeout(250);
    ok('reativa e o item volta', banco.itens.get(alvo).ativo === true && banco.itens.get(alvo).excluido === false);
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }
  {
    const { p, errosJs, ctx } = await tela(b, { falhar: { catalogo_salvar_item: 'rede' } });
    await digitar(p, '#buscaExcluir', 'pneu');
    await p.click('#resultadosExcluir [data-acao="pedir-excluir"]');
    await p.click('#resultadosExcluir [data-acao="confirmar-excluir"]'); await p.waitForTimeout(250);
    ok('excluir sem rede: avisa e o botão volta', /Não excluí/.test(await txt(p, '#avisoExcluir')) &&
       !(await p.locator('#resultadosExcluir [data-acao="confirmar-excluir"]').isDisabled()));
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ FORNECEDOR: CADASTRAR */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await irFornecedores(p);
    ok('documento travado até escolher o tipo', await p.locator('#documento').isDisabled());
    await salvarForn(p);
    const inv = await invalidos(p, '#formForn');
    ok('salvar vazio marca os obrigatórios', ['codigo_gr','tipo_pessoa','razao_social','endereco','cidade','uf'].every(c => inv.includes(c)) &&
       !inv.includes('bairro') && !inv.includes('cep'), inv.join(','));
    ok('salvar vazio não chama o banco', chamadas(banco, 'fornecedor_salvar').length === 0);
    ok('foco no primeiro erro', await foco(p) === 'fCodigo');

    await p.check('input[name="tipoPessoa"][value="PJ"]');
    ok('PJ: rótulo CNPJ e máscara', (await txt(p, '#lblDocumento')) === 'CNPJ' && !(await p.locator('#documento').isDisabled()) &&
       /Razão social/.test(await txt(p, '#lblRazao')));
    ok('escolher o tipo tira o vermelho e foca o documento', !(await invalidos(p, '#formForn')).includes('tipo_pessoa') && await foco(p) === 'documento');
    await p.type('#documento', CNPJ_NOVO);
    ok('CNPJ ganha máscara ao digitar', await p.inputValue('#documento') === '11.222.333/0001-81', await p.inputValue('#documento'));
    await p.check('input[name="tipoPessoa"][value="PF"]');
    ok('PF: rótulos CPF e Nome completo', (await txt(p, '#lblDocumento')) === 'CPF' && /Nome completo/.test(await txt(p, '#lblRazao')));
    await digitar(p, '#documento', CPF_NOVO);
    ok('CPF ganha máscara', await p.inputValue('#documento') === '123.456.789-09', await p.inputValue('#documento'));
    await digitar(p, '#documento', '12345678900');
    await preencherForn(p, { codigo:'10020', razao:'MARIA TESTE', end:'RUA A, 10', cidade:'PALMEIRA', uf:'PR' });
    await salvarForn(p);
    ok('CPF com dígito errado é barrado na tela', (await invalidos(p, '#formForn')).includes('documento') &&
       /CPF inválido/.test(await txt(p, '[data-fcampo="documento"] .erro-campo')) && chamadas(banco, 'fornecedor_salvar').length === 0);
    await digitar(p, '#cep', '8413');
    await digitar(p, '#documento', CPF_NOVO);
    await salvarForn(p);
    ok('CEP incompleto é barrado', (await invalidos(p, '#formForn')).includes('cep') && chamadas(banco, 'fornecedor_salvar').length === 0);
    await digitar(p, '#cep', '84130000');
    ok('CEP ganha máscara', await p.inputValue('#cep') === '84130-000');
    await p.check('input[name="tipoPessoa"][value="PJ"]');
    await digitar(p, '#documento', CNPJ_NOVO);
    await digitar(p, '#razao', 'TESTE COMERCIO LTDA');
    ok('contador da razão social', (await txt(p, '#contaRazao')) === '19/150');
    await digitar(p, '#bairro', 'CENTRO');
    await p.dblclick('#btnSalvarForn'); await p.waitForTimeout(350);
    ok('duplo clique grava uma vez só', chamadas(banco, 'fornecedor_salvar').length === 1);
    const c = ultima(banco, 'fornecedor_salvar');
    ok('manda os dados limpos', c.corpo.p_modo === 'criar' && c.corpo.p_forn.codigo_gr === '10020' && c.corpo.p_forn.tipo_pessoa === 'PJ' &&
       c.corpo.p_forn.documento === CNPJ_NOVO && c.corpo.p_forn.cep === '84130000' && c.corpo.p_forn.uf === 'PR' &&
       c.corpo.p_forn.razao_social === 'TESTE COMERCIO LTDA' && c.corpo.p_login === 'compras', JSON.stringify(c.corpo));
    ok('fornecedor gravado formatado', banco.forns.get('10020') && banco.forns.get('10020').cnpj === '11.222.333/0001-81' &&
       banco.forns.get('10020').cep === '84130-000');
    ok('aviso de cadastrado', /Fornecedor 10020 cadastrado/.test(await txt(p, '#avisoForn')));
    ok('formulário limpo, tipo desmarcado, documento travado', await p.inputValue('#fCodigo') === '' && await p.inputValue('#razao') === '' &&
       !(await p.isChecked('input[name="tipoPessoa"][value="PJ"]')) && await p.locator('#documento').isDisabled() && await p.inputValue('#uf') === '');
    ok('foco volta ao código', await foco(p) === 'fCodigo');

    /* código que já existe */
    await preencherForn(p, { codigo:'518', tipo:'PF', doc:CPF_NOVO, razao:'OUTRA PESSOA', end:'RUA B, 2', cidade:'IRATI', uf:'PR' });
    await salvarForn(p);
    ok('código já usado: diz de quem é', /518 já é do fornecedor/.test(await txt(p, '#avisoForn')) && /BATERIAS PLANALTO/.test(await txt(p, '#avisoForn')) &&
       (await invalidos(p, '#formForn')).includes('codigo_gr'));
    ok('dados continuam no formulário', await p.inputValue('#razao') === 'OUTRA PESSOA');

    /* documento que já existe em outro */
    await digitar(p, '#fCodigo', '10021');
    await digitar(p, '#documento', '52998224725');
    await salvarForn(p);
    ok('CPF repetido: barra e diz em qual fornecedor', /já está cadastrado no fornecedor/.test(await txt(p, '#avisoForn')) &&
       /JOSE DA SILVA/.test(await txt(p, '#avisoForn')) && (await invalidos(p, '#formForn')).includes('documento'));

    /* nome repetido: cancelar e depois confirmar */
    await digitar(p, '#documento', CPF_NOVO);
    await digitar(p, '#razao', 'baterias planalto ltda');
    await salvarForn(p);
    ok('nome repetido pede decisão', await vis(p, '#btnFornRepetir') && /BATERIAS PLANALTO/.test(await txt(p, '#avisoForn')));
    await p.click('#btnFornNaoRepetir'); await p.waitForTimeout(80);
    ok('cancelar não grava', !banco.forns.has('10021') && !(await vis(p, '#avisoForn')) && await foco(p) === 'razao');
    await salvarForn(p);
    await p.click('#btnFornRepetir'); await p.waitForTimeout(250);
    ok('confirmar grava com confirmar_nome', banco.forns.has('10021') && ultima(banco, 'fornecedor_salvar').corpo.p_forn.confirmar_nome === true);

    /* código de fornecedor excluído: oferece reativar */
    await preencherForn(p, { codigo:'800', tipo:'PJ', doc:'45454545000106', razao:'FORNECEDOR QUE VOLTOU', end:'RUA C, 3', cidade:'CURITIBA', uf:'PR' });
    await salvarForn(p);
    ok('código excluído oferece reativar', await vis(p, '#btnFornReativar') && /já existiu/.test(await txt(p, '#avisoForn')));
    await p.click('#btnFornNaoReativar'); await p.waitForTimeout(80);
    ok('cancelar reativação não grava', banco.forns.get('800').ativo === false);
    await salvarForn(p);
    await p.click('#btnFornReativar'); await p.waitForTimeout(250);
    ok('reativa com os dados preenchidos', banco.forns.get('800').ativo === true && banco.forns.get('800').razao_social === 'FORNECEDOR QUE VOLTOU' &&
       ultima(banco, 'fornecedor_salvar').corpo.p_modo === 'reativar');

    /* nome com HTML não executa */
    await preencherForn(p, { codigo:'10022', tipo:'PF', doc:'52998224725', razao:'<img src=x onerror="window.__xss=1">', end:'RUA D, 4', cidade:'X Y', uf:'PR' });
    banco.forns.get('700').ativo = false;      // libera o CPF para este teste
    await salvarForn(p);
    ok('nome com HTML não executa', await p.evaluate(() => !window.__xss) && await p.locator('#avisoForn img').count() === 0);
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* --------------------------------------- FORNECEDOR: BUSCAR, CORRIGIR, EXCLUIR */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await irFornecedores(p);
    await buscar(p, 'b');
    ok('uma letra não busca', chamadas(banco, 'fornecedor_buscar').length === 0 && (await p.locator('#resultadosForn .linha').count()) === 0);
    await buscar(p, 'bateria');
    ok('busca por nome (com espera ao digitar)', (await p.locator('#resultadosForn .linha').count()) === 2 &&
       chamadas(banco, 'fornecedor_buscar').length <= 3, chamadas(banco, 'fornecedor_buscar').length);
    ok('resultado mostra CNPJ e cidade', /CNPJ 78\.043\.593\/0001-60/.test(await txt(p, '#resultadosForn')) && /GUARAPUAVA\/PR/.test(await txt(p, '#resultadosForn')));
    ok('busca manda login e senha', ultima(banco, 'fornecedor_buscar').corpo.p_login === 'compras');
    await buscar(p, '529.982');
    ok('busca por CPF', /JOSE DA SILVA/.test(await txt(p, '#resultadosForn')) && /CPF 529/.test(await txt(p, '#resultadosForn')));
    await buscar(p, '800');
    ok('busca por código mostra excluído com Reativar', /excluído/.test(await txt(p, '#resultadosForn')) &&
       (await p.locator('#resultadosForn [data-acao="reativar-forn"]').count()) === 1 &&
       (await p.locator('#resultadosForn [data-acao="pedir-excluir-forn"]').count()) === 0);
    await buscar(p, 'zzzzz');
    ok('nada encontrado diz que não achou', /Nenhum fornecedor/.test(await txt(p, '#resultadosForn')));

    /* Corrigir fornecedor do GR que veio sem endereço */
    await buscar(p, '518');
    await p.click('#resultadosForn [data-acao="corrigir-forn"]'); await p.waitForTimeout(150);
    ok('corrigir abre no formulário com o código travado', await p.inputValue('#fCodigo') === '518' && await p.locator('#fCodigo').isDisabled() &&
       await p.inputValue('#razao') === 'BATERIAS PLANALTO LTDA' && await p.isChecked('input[name="tipoPessoa"][value="PJ"]') &&
       await p.inputValue('#documento') === '78.043.593/0001-60' && await p.inputValue('#uf') === 'PR');
    ok('título e botão de correção', /Corrigir fornecedor 518/.test(await txt(p, '#tituloForn')) && (await txt(p, '#btnSalvarForn')) === 'Salvar correção' &&
       await vis(p, '#btnCancelarForn'));
    ok('foco no primeiro campo vazio (endereço)', await foco(p) === 'endereco');
    await salvarForn(p);
    ok('sem endereço não salva', (await invalidos(p, '#formForn')).includes('endereco') && chamadas(banco, 'fornecedor_salvar').length === 0);
    await p.click('#btnCancelarForn'); await p.waitForTimeout(80);
    ok('cancelar volta a novo fornecedor', !(await p.locator('#fCodigo').isDisabled()) && await p.inputValue('#fCodigo') === '' &&
       (await txt(p, '#tituloForn')) === 'Novo fornecedor' && (await txt(p, '#btnSalvarForn')) === 'Cadastrar fornecedor');
    await p.click('#resultadosForn [data-acao="corrigir-forn"]'); await p.waitForTimeout(100);
    await digitar(p, '#endereco', 'AV. PRINCIPAL, 500');
    await salvarForn(p);
    const cc = ultima(banco, 'fornecedor_salvar');
    ok('correção manda modo corrigir', cc && cc.corpo.p_modo === 'corrigir' && cc.corpo.p_forn.codigo_gr === '518' &&
       cc.corpo.p_forn.endereco === 'AV. PRINCIPAL, 500', cc && JSON.stringify(cc.corpo));
    ok('correção gravada e busca atualizada', banco.forns.get('518').endereco === 'AV. PRINCIPAL, 500' &&
       /AV\. PRINCIPAL, 500/.test(await txt(p, '#resultadosForn')) && /518 corrigido/.test(await txt(p, '#avisoForn')));

    /* Excluir: cancelar, confirmar com motivo */
    await buscar(p, 'bateria');
    const linhas = p.locator('#resultadosForn .linha');
    await linhas.nth(0).locator('[data-acao="pedir-excluir-forn"]').click();
    ok('excluir pede confirmação e foca o motivo', await linhas.nth(0).locator('.confirma').isVisible() && await foco(p) === 'motivoForn');
    await linhas.nth(1).locator('[data-acao="pedir-excluir-forn"]').click();
    ok('só uma confirmação aberta', !(await linhas.nth(0).locator('.confirma').isVisible()));
    await linhas.nth(1).locator('[data-acao="cancelar-excluir-forn"]').click();
    ok('cancelar fecha', !(await linhas.nth(1).locator('.confirma').isVisible()));
    const nomeAlvo = await linhas.nth(0).locator('.nome').textContent();
    const codAlvo = await linhas.nth(0).locator('.cod').textContent();
    await linhas.nth(0).locator('[data-acao="pedir-excluir-forn"]').click();
    await p.fill('#motivoForn', 'Fechou');
    await linhas.nth(0).locator('[data-acao="confirmar-excluir-forn"]').click(); await p.waitForTimeout(400);
    const ce = ultima(banco, 'fornecedor_salvar');
    ok('exclusão manda modo excluir com motivo', ce.corpo.p_modo === 'excluir' && ce.corpo.p_forn.codigo_gr === codAlvo &&
       ce.corpo.p_forn.motivo === 'Fechou', JSON.stringify(ce.corpo));
    ok('fornecedor excluído e lista atualizada', banco.forns.get(codAlvo).ativo === false &&
       /excluído/.test(await txt(p, '#avisoBuscaForn')) && /excluído/.test(await p.locator('#resultadosForn .linha', { hasText: nomeAlvo }).textContent()));

    /* Reativar pela busca */
    await p.locator('#resultadosForn .linha', { hasText: nomeAlvo }).locator('[data-acao="reativar-forn"]').click(); await p.waitForTimeout(120);
    ok('reativar abre o formulário', /Reativar fornecedor/.test(await txt(p, '#tituloForn')) && (await txt(p, '#btnSalvarForn')) === 'Reativar fornecedor');
    await digitar(p, '#endereco', 'RUA NOVA, 1');
    await salvarForn(p);
    ok('reativa', banco.forns.get(codAlvo).ativo === true && ultima(banco, 'fornecedor_salvar').corpo.p_modo === 'reativar');

    /* Excluir o que está aberto em correção limpa o formulário */
    await buscar(p, '5494');
    await p.click('#resultadosForn [data-acao="corrigir-forn"]'); await p.waitForTimeout(80);
    await p.click('#resultadosForn [data-acao="pedir-excluir-forn"]');
    await p.click('#resultadosForn [data-acao="confirmar-excluir-forn"]'); await p.waitForTimeout(400);
    ok('excluir o fornecedor em edição limpa o formulário', !(await p.locator('#fCodigo').isDisabled()) && await p.inputValue('#fCodigo') === '');

    /* Enter na busca busca na hora */
    await p.fill('#buscaForn', 'JOSE'); await p.press('#buscaForn', 'Enter'); await p.waitForTimeout(200);
    ok('Enter na busca não espera', /JOSE DA SILVA/.test(await txt(p, '#resultadosForn')));

    /* Sair limpa tudo do fornecedor */
    await p.click('#resultadosForn [data-acao="corrigir-forn"]'); await p.waitForTimeout(80);
    await p.click('#btnSair'); await p.waitForTimeout(100);
    ok('sair limpa busca, resultados e formulário de fornecedor', await p.inputValue('#buscaForn') === '' &&
       (await p.locator('#resultadosForn .linha').count()) === 0 && await p.inputValue('#documento') === '' && await p.inputValue('#razao') === '');
    await p.fill('#login', 'compras'); await p.fill('#senha', 'senha-certa-123'); await p.click('#btnEntrar'); await p.waitForTimeout(200);
    ok('entrar de novo volta na aba Itens', await vis(p, '#painelItens') && !(await vis(p, '#painelFornecedores')));
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* --------------------------------------------- SESSÃO VENCIDA E SEM REDE */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await irFornecedores(p);
    banco.contas.compras.senha = 'trocada-por-alguem';
    await preencherForn(p, { codigo:'10030', tipo:'PJ', doc:CNPJ_NOVO, razao:'SESSAO VENCIDA LTDA', end:'RUA E, 5', cidade:'IRATI', uf:'PR' });
    await salvarForn(p);
    ok('senha que deixou de valer volta para Entrar', await vis(p, '#telaEntrar') && /não vale mais/.test(await txt(p, '#avisoEntrar')));
    ok('e não deixa o CNPJ na tela', await p.inputValue('#documento') === '');
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }
  {
    const { p, errosJs, ctx } = await tela(b, { falhar: { fornecedor_salvar: 'rede', fornecedor_buscar: 'rede' } });
    await irFornecedores(p);
    await preencherForn(p, { codigo:'10031', tipo:'PF', doc:CPF_NOVO, razao:'SEM REDE', end:'RUA F, 6', bairro:'CENTRO', cep:'84130000', cidade:'IRATI', uf:'PR' });
    await salvarForn(p);
    ok('salvar sem rede: avisa e nada se perde', /Não salvei/.test(await txt(p, '#avisoForn')) && await p.inputValue('#fCodigo') === '10031' &&
       await p.inputValue('#documento') === '123.456.789-09' && await p.inputValue('#cep') === '84130-000' && await p.inputValue('#uf') === 'PR' &&
       await p.isChecked('input[name="tipoPessoa"][value="PF"]'));
    ok('botão volta a funcionar', !(await p.locator('#btnSalvarForn').isDisabled()) && (await txt(p, '#btnSalvarForn')) === 'Cadastrar fornecedor');
    await buscar(p, 'bateria');
    ok('buscar sem rede: avisa', /Não consegui buscar/.test(await txt(p, '#avisoBuscaForn')));
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ---------------------------------------------------- CELULAR E TEMA */
  for(const esquema of ['light', 'dark']){
    const { p, ctx } = await tela(b, { viewport:{ width:360, height:740 }, colorScheme: esquema });
    await irFornecedores(p);
    await preencherForn(p, { codigo:'10040', tipo:'PJ', doc:CNPJ_NOVO, razao:'EMPRESA COM UM NOME BEM COMPRIDO PARA QUEBRAR LINHA LTDA',
                             end:'AVENIDA COM NOME COMPRIDO DE VERDADE, 12345, SALA 4', bairro:'JARDIM', cep:'84130000', cidade:'GUARAPUAVA', uf:'PR' });
    await buscar(p, 'bateria');
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    ok('fornecedores no celular 360px sem rolagem lateral (' + esquema + ')', larg <= 360, larg);
    await p.click('#abaItens');
    await digitar(p, '#buscaExcluir', 'sabao');
    await p.click('#resultadosExcluir [data-acao="pedir-excluir"]');
    const larg2 = await p.evaluate(() => document.documentElement.scrollWidth);
    ok('excluir item no celular sem rolagem lateral (' + esquema + ')', larg2 <= 360, larg2);
    if(process.env.FOTOS){
      await p.click('#abaFornecedores');
      await p.screenshot({ path: 't-fornecedor-' + esquema + '.png', fullPage:true });
    }
    await ctx.close();
  }

  await b.close();
  console.log(notas.join('\n'));
  console.log('\nFALHAS (' + falhas.length + ')' + (falhas.length ? ':\n  x ' + falhas.join('\n  x ') : ''));
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
