/* ============================================================================
   BATERIA DO CADASTRO DE ITENS — a tela dirigida como a pessoa dirige.
   Tudo aqui é clique, digitação e seleção. evaluate só para CONFERIR.
   O banco é o de mentira do mock-supabase.js, que segue as mesmas regras de
   cadastro-de-itens.sql (conferidas no Postgres por teste-cadastro-itens.sql).

     node teste-cadastro-itens.js
   ========================================================================== */
const { chromium } = require('playwright');
const mock = require('./mock-supabase');
const url = 'file://' + __dirname + '/cadastro-itens.html';
const falhas = [], notas = [];
const ok = (n, c, d) => c ? notas.push('ok  ' + n) : falhas.push(n + ' — ' + (d || ''));

const CATALOGO = [
  { codigo:'5046', familia:'MM', descricao:'PNEU 275/80R22.5 ARMOR MAX MSD149/146', unidade:'UNID', especificacao:'PNEU' },
  { codigo:'7148', familia:'MM', descricao:'Anel o P50635 CAIXA DE NAVALHA 635FD',   unidade:'UNID', especificacao:'PEÇA' },
  { codigo:'100',  familia:'DA', descricao:'ACCENT',                                  unidade:'KG',   especificacao:'HERBICIDA' },
  { codigo:'101',  familia:'HL', descricao:'SABAO EM PO 1KG',                         unidade:'UNID', especificacao:'LIMPEZA' },
  { codigo:'102',  familia:'HL', descricao:'SABAO EM BARRA 200G',                     unidade:'UNID', especificacao:'LIMPEZA' },
  { codigo:'103',  familia:'CL', descricao:'OLEO DIESEL S10',                         unidade:'L',    especificacao:'COMBUSTIVEL' },
  { codigo:'200',  familia:'MM', descricao:'FILTRO ANTIGO QUE SAIU',                  unidade:'UNID', especificacao:'PEÇA', ativo:false }
];

const LOGINS = { 'compras': { nome:'Compras Teste', senha:'senha-certa-123' } };

async function tela(b, { qs = '', falhar = {}, catalogo = CATALOGO, viewport } = {}){
  const banco = mock.bancoDoCadastro({ catalogo, logins: LOGINS });
  const ctx = await b.newContext(viewport ? { viewport } : {});
  const p = await ctx.newPage();
  const errosJs = [];
  p.on('pageerror', e => errosJs.push(String(e)));
  p.on('dialog', d => { errosJs.push('dialog aberto: ' + d.message()); d.dismiss(); });
  await banco.instalarNa(p, { falhar });
  await p.goto(url + qs, { waitUntil:'load' });
  await p.waitForTimeout(300);
  return { p, banco, errosJs, ctx };
}
/* textContent e não innerText: o selo e as etiquetas têm text-transform, e o
   innerText devolveria em maiúscula o que está escrito em minúscula. */
const txt = (p, sel) => p.locator(sel).first().textContent();
const visivel = (p, sel) => p.locator(sel).isVisible();
async function entrar(p, login = 'compras', senha = 'senha-certa-123'){
  await p.fill('#login', login);
  await p.fill('#senha', senha);
  await p.click('#btnEntrar');
  await p.waitForTimeout(200);
}
async function preencher(p, { codigo, descricao, familia, unidade } = {}){
  if(codigo != null){ await p.fill('#codigo', ''); await p.type('#codigo', codigo); }
  if(descricao != null){ await p.fill('#descricao', ''); await p.type('#descricao', descricao); }
  if(familia != null) await p.selectOption('#familia', familia);
  if(unidade != null) await p.selectOption('#unidade', unidade);
}
const salvarItem = async p => { await p.click('#btnSalvar'); await p.waitForTimeout(250); };
const ultima = (banco, nome) => [...banco.chamadas].reverse().find(c => c.nome === nome);
const quantas = (banco, nome) => banco.chamadas.filter(c => c.nome === nome).length;

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  /* ---------------------------------------------------------------- ENTRAR */
  {
    const { p, banco, errosJs, ctx } = await tela(b, { qs:'?nome=Guilherme&uid=U1&email=Compras%40leh.com.br' });
    ok('abre na tela de entrar', await visivel(p, '#telaEntrar') && !(await visivel(p, '#telaDentro')));
    ok('login sugerido pelo e-mail do link', await p.inputValue('#login') === 'compras', await p.inputValue('#login'));
    ok('foco vai para a senha quando o login já veio', await p.evaluate(() => document.activeElement.id) === 'senha');
    ok('selo mostra itens ativos do catálogo', /6 itens/.test(await txt(p, '#statusConexao')), await txt(p, '#statusConexao'));

    await p.fill('#login', ''); await p.click('#btnEntrar'); await p.waitForTimeout(100);
    ok('entrar vazio avisa e não chama o banco', /Preencha login e senha/.test(await txt(p, '#avisoEntrar')) && quantas(banco,'catalogo_entrar') === 0);
    ok('entrar vazio põe foco no login', await p.evaluate(() => document.activeElement.id) === 'login');

    await entrar(p, 'compras', 'errada');
    ok('senha errada: mensagem com tentativas', /incorretos.*Mais 4 tentativas/.test(await txt(p, '#avisoEntrar')), await txt(p, '#avisoEntrar'));
    ok('senha errada: campo de senha limpo', await p.inputValue('#senha') === '');
    ok('senha errada: continua fora', !(await visivel(p, '#telaDentro')));

    await entrar(p, 'ninguem', 'x');
    ok('login inexistente: mesma mensagem, sem contar tentativas', /^Login ou senha incorretos\.$/.test((await txt(p, '#avisoEntrar')).trim()), await txt(p, '#avisoEntrar'));

    for(let i = 0; i < 3; i++) await entrar(p, 'compras', 'errada');
    ok('penúltima tentativa no singular', /Mais 1 tentativa errada/.test(await txt(p, '#avisoEntrar')), await txt(p, '#avisoEntrar'));
    await entrar(p, 'compras', 'errada');
    ok('quinta errada trava', /travado até/.test(await txt(p, '#avisoEntrar')), await txt(p, '#avisoEntrar'));
    await entrar(p, 'compras', 'senha-certa-123');
    ok('travado: nem a senha certa entra', /travado até/.test(await txt(p, '#avisoEntrar')) && !(await visivel(p, '#telaDentro')));

    /* destrava no banco de mentira e entra — com Enter, como muita gente faz */
    banco.contas.compras.bloqueado_ate = null;
    await p.fill('#login', ' COMPRAS '); await p.fill('#senha', 'senha-certa-123'); await p.press('#senha', 'Enter');
    await p.waitForTimeout(200);
    ok('entra com Enter e login com maiúscula/espaço', await visivel(p, '#telaDentro') && !(await visivel(p, '#telaEntrar')));
    ok('mostra quem está cadastrando', await txt(p, '#quemNome') === 'Compras Teste');
    ok('aviso de erro some ao entrar', !(await visivel(p, '#avisoEntrar')));
    ok('campo de senha esvaziado depois de entrar', await p.inputValue('#senha') === '');
    ok('foco no código', await p.evaluate(() => document.activeElement.id) === 'codigo');
    const unid = await p.$$eval('#unidade option', os => os.map(o => o.value));
    ok('unidades vindas do banco, mais usada primeiro', unid[1] === 'UNID' && unid.includes('KG') && unid.includes('L'), unid.join(','));
    const fams = await p.$$eval('#familia option', os => os.length);
    ok('20 famílias + a opção vazia', fams === 21, fams);
    ok('campo Grupo não existe mais na tela', await p.locator('#grupo, #listaGrupos, [data-campo="especificacao"]').count() === 0 &&
       !/Grupo\s*opcional/i.test(await p.locator('#formItem').textContent()));
    ok('lista de aguardando vazia com mensagem', /Nenhum item esperando/.test(await txt(p, '#listaPendentes')));
    ok('nada gravado no navegador', await p.evaluate(() => localStorage.length + sessionStorage.length) === 0);
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ CADASTRO, CAMPO A CAMPO */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await entrar(p);

    await salvarItem(p);
    const inval = await p.$$eval('#formItem .campo.invalido', cs => cs.map(c => c.dataset.campo));
    ok('salvar vazio marca os 4 obrigatórios', ['codigo','descricao','familia','unidade'].every(c => inval.includes(c)) && !inval.includes('especificacao'), inval.join(','));
    ok('salvar vazio não chama o banco', quantas(banco,'catalogo_salvar_item') === 0);
    ok('salvar vazio põe foco no primeiro erro', await p.evaluate(() => document.activeElement.id) === 'codigo');

    await preencher(p, { codigo:'12a' });
    ok('código com letra: dica vermelha', /Só números/.test(await txt(p, '#dicaCodigo')));
    ok('digitar tira a marca vermelha do código', !(await p.locator('.campo[data-campo="codigo"]').evaluate(e => e.classList.contains('invalido'))));
    await preencher(p, { codigo:'5046' });
    ok('código já ativo: diz qual item', /já está no formulário: PNEU 275/.test(await txt(p, '#dicaCodigo')), await txt(p, '#dicaCodigo'));
    await preencher(p, { codigo:'200' });
    ok('código desativado: avisa que pode reativar', /desativado/.test(await txt(p, '#dicaCodigo')));
    await preencher(p, { codigo:'008555' });
    ok('código livre (zero à esquerda não atrapalha)', /Código livre/.test(await txt(p, '#dicaCodigo')));
    ok('prévia mostra o código sem zero à esquerda', /8555/.test(await txt(p, '#previa')) && !/008555/.test(await txt(p, '#previa')), await txt(p, '#previa'));

    await preencher(p, { descricao:'sabao' });
    ok('nome parecido: lista os que já existem', /SABAO EM PO 1KG/.test(await txt(p, '#parecidos')) && /SABAO EM BARRA/.test(await txt(p, '#parecidos')));
    await preencher(p, { descricao:'sabão pó' });
    ok('parecidos sem acento e por palavra', /SABAO EM PO 1KG/.test(await txt(p, '#parecidos')) && !/BARRA/.test(await txt(p, '#parecidos')), await txt(p, '#parecidos'));
    ok('parecidos não mostram item desativado', !/FILTRO ANTIGO/.test(await txt(p, '#listaPendentes')));
    await preencher(p, { descricao:'FILTRO DE AR RE181915 NOVO' });
    ok('nome sem parecido: caixa some', !(await visivel(p, '#parecidos')));
    ok('contador de caracteres', (await txt(p, '#contaDescricao')) === '26/150', await txt(p, '#contaDescricao'));

    await preencher(p, { familia:'MM', unidade:'UNID' });
    const prev = await txt(p, '#previa');
    ok('prévia completa', /FILTRO DE AR RE181915 NOVO/.test(prev) && /8555 · UNID · Manutenção de Máquinas/.test(prev), prev);

    /* duplo clique não pode gravar duas vezes */
    await p.dblclick('#btnSalvar'); await p.waitForTimeout(400);
    ok('duplo clique grava uma vez só', quantas(banco,'catalogo_salvar_item') === 1, quantas(banco,'catalogo_salvar_item'));
    const c1 = ultima(banco, 'catalogo_salvar_item');
    ok('mandou modo criar com dados limpos', c1.corpo.p_modo === 'criar' && c1.corpo.p_item.codigo === '8555' &&
       c1.corpo.p_item.familia === 'MM' && !('especificacao' in c1.corpo.p_item) && c1.corpo.p_login === 'compras' &&
       c1.corpo.p_senha === 'senha-certa-123' && !('confirmar_nome' in c1.corpo.p_item), JSON.stringify(c1.corpo));
    ok('aviso de sucesso', /Item 8555 cadastrado/.test(await txt(p, '#avisoItem')), await txt(p, '#avisoItem'));
    ok('formulário limpo depois de salvar', await p.inputValue('#codigo') === '' && await p.inputValue('#descricao') === '' &&
       await p.inputValue('#familia') === '' && await p.inputValue('#unidade') === '');
    ok('foco volta ao código para o próximo', await p.evaluate(() => document.activeElement.id) === 'codigo');
    ok('item na lista de aguardando', /FILTRO DE AR RE181915 NOVO/.test(await txt(p, '#listaPendentes')) && /aguardando o GR/.test(await txt(p, '#listaPendentes')));
    ok('item entrou no banco como pendente', banco.itens.get('8555').pendente_gr === true && banco.itens.get('8555').cadastrado_por === 'Compras Teste');
    await preencher(p, { codigo:'8555' });
    ok('catálogo local já conhece o recém-criado', /já está no formulário/.test(await txt(p, '#dicaCodigo')));

    /* código já existe (a prévia avisou, mas a pessoa insistiu) */
    await preencher(p, { codigo:'5046', descricao:'OUTRO PNEU', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('código existente: não salva e diz qual é', /Não salvei.*5046.*PNEU 275/.test(await txt(p, '#avisoItem')) &&
       await p.locator('.campo[data-campo="codigo"]').evaluate(e => e.classList.contains('invalido')), await txt(p, '#avisoItem'));
    ok('dados continuam no formulário após recusa', await p.inputValue('#descricao') === 'OUTRO PNEU');

    /* nome repetido: cancelar */
    await preencher(p, { codigo:'8556', descricao:'accent', familia:'DA', unidade:'KG' });
    await salvarItem(p);
    ok('nome repetido pede decisão', /Já existe um item com este nome.*ACCENT.*100/s.test(await txt(p, '#avisoItem')), await txt(p, '#avisoItem'));
    await p.click('#btnNaoRepetir'); await p.waitForTimeout(100);
    ok('"não é outro" fecha o aviso sem gravar', !(await visivel(p, '#avisoItem')) && !banco.itens.has('8556'));
    /* nome repetido: confirmar */
    await salvarItem(p);
    await p.click('#btnRepetir'); await p.waitForTimeout(250);
    const c2 = ultima(banco, 'catalogo_salvar_item');
    ok('"é outro item" grava com confirmação', c2.corpo.p_item.confirmar_nome === true && banco.itens.get('8556').ativo, JSON.stringify(c2.corpo.p_item));
    ok('sucesso depois da confirmação', /Item 8556 cadastrado/.test(await txt(p, '#avisoItem')));

    /* código desativado: reativar */
    await preencher(p, { codigo:'200', descricao:'FILTRO QUE VOLTOU', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('código desativado oferece reativar', /já existiu.*FILTRO ANTIGO/s.test(await txt(p, '#avisoItem')));
    await p.click('#btnNaoReativar'); await p.waitForTimeout(100);
    ok('cancelar reativação não grava', !(await visivel(p, '#avisoItem')) && !banco.itens.get('200').ativo);
    await salvarItem(p);
    await p.click('#btnReativar'); await p.waitForTimeout(250);
    ok('reativar grava com modo reativar', ultima(banco,'catalogo_salvar_item').corpo.p_modo === 'reativar' &&
       banco.itens.get('200').ativo && banco.itens.get('200').descricao === 'FILTRO QUE VOLTOU');
    ok('reativado vira aguardando o GR', /FILTRO QUE VOLTOU/.test(await txt(p, '#listaPendentes')));
    ok('mensagem de reativado', /Item 200 reativado/.test(await txt(p, '#avisoItem')), await txt(p, '#avisoItem'));

    /* recusa do banco que a tela não previu: unidade que sumiu */
    await preencher(p, { codigo:'8557', descricao:'ITEM X', familia:'MM', unidade:'L' });
    banco.itens.get('103').ativo = false;          // o único item em L sai do catálogo
    await salvarItem(p);
    ok('recusa de campo do banco marca o campo', /Unidade não reconhecida/.test(await txt(p, '#avisoItem')) &&
       await p.locator('.campo[data-campo="unidade"]').evaluate(e => e.classList.contains('invalido')), await txt(p, '#avisoItem'));
    banco.itens.get('103').ativo = true;

    /* XSS: nome com HTML volta escapado em todo lugar */
    await preencher(p, { codigo:'8558', descricao:'<img src=x onerror="window.__xss=1">', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('nome com HTML não executa', await p.evaluate(() => !window.__xss) && await p.locator('#listaPendentes img').count() === 0);

    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------ CORRIGIR, RETIRAR, REATIVAR */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await entrar(p);
    await preencher(p, { codigo:'9001', descricao:'LUVA NITRILICA G', familia:'ST', unidade:'UNID' });
    /* família ST não existe no catálogo de teste: o banco recusa */
    await salvarItem(p);
    ok('família sem item ativo é recusada pelo banco', /Família não reconhecida/.test(await txt(p, '#avisoItem')));
    await preencher(p, { familia:'HL' });
    await salvarItem(p);
    ok('cadastra depois de trocar a família', banco.itens.has('9001'));

    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="corrigir"]'); await p.waitForTimeout(150);
    ok('corrigir abre o item no formulário', await p.inputValue('#descricao') === 'LUVA NITRILICA G' && await p.inputValue('#familia') === 'HL');
    ok('corrigir trava o código', await p.locator('#codigo').isDisabled());
    ok('título e botão de correção', /Corrigir item 9001/.test(await txt(p, '#tituloItem')) && (await txt(p, '#btnSalvar')) === 'Salvar correção');
    ok('botão cancelar aparece', await visivel(p, '#btnCancelarEdicao'));
    ok('dica de código some na correção', !(await visivel(p, '#dicaCodigo')));
    await p.click('#btnCancelarEdicao'); await p.waitForTimeout(100);
    ok('cancelar volta para novo item', !(await p.locator('#codigo').isDisabled()) && await p.inputValue('#codigo') === '' &&
       (await txt(p, '#tituloItem')) === 'Novo item' && (await txt(p, '#btnSalvar')) === 'Cadastrar item');

    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="corrigir"]'); await p.waitForTimeout(150);
    await preencher(p, { descricao:'LUVA NITRILICA TAM G CX' });
    await salvarItem(p);
    const cc = ultima(banco, 'catalogo_salvar_item');
    ok('correção manda modo corrigir e o código', cc.corpo.p_modo === 'corrigir' && cc.corpo.p_item.codigo === '9001', JSON.stringify(cc.corpo));
    ok('correção gravada', banco.itens.get('9001').descricao === 'LUVA NITRILICA TAM G CX');
    ok('correção sem campo Grupo não manda grupo', !('especificacao' in cc.corpo.p_item));
    ok('depois de corrigir volta a novo item', !(await p.locator('#codigo').isDisabled()) && /Item 9001 corrigido/.test(await txt(p, '#avisoItem')));

    /* retirar: primeiro "manter", depois retirar de verdade */
    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="retirar"]'); await p.waitForTimeout(100);
    ok('retirar pede confirmação na linha', await p.locator('#listaPendentes .item[data-codigo="9001"] .confirma').isVisible());
    await p.click('#listaPendentes [data-acao="nao-retirar"]'); await p.waitForTimeout(100);
    ok('"manter" fecha sem gravar', !(await p.locator('#listaPendentes .item[data-codigo="9001"] .confirma').isVisible()) && banco.itens.get('9001').ativo);
    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="retirar"]');
    await p.click('#listaPendentes [data-acao="sim-retirar"]'); await p.waitForTimeout(250);
    ok('retirado some do formulário', banco.itens.get('9001').ativo === false);
    ok('linha fica riscada como retirado', await p.locator('#listaPendentes .item.retirado[data-codigo="9001"]').count() === 1 &&
       /retirado/.test(await txt(p, '#listaPendentes .item[data-codigo="9001"]')));
    ok('aviso de retirado', /9001 retirado/.test(await txt(p, '#avisoItem')));

    /* reativar pela lista */
    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="corrigir"]'); await p.waitForTimeout(150);
    ok('item retirado abre em modo reativar', /Reativar item 9001/.test(await txt(p, '#tituloItem')) && (await txt(p, '#btnSalvar')) === 'Reativar item');
    await salvarItem(p);
    ok('reativa pela lista', ultima(banco,'catalogo_salvar_item').corpo.p_modo === 'reativar' && banco.itens.get('9001').ativo);

    /* retirar o item que está aberto em correção volta o formulário a "novo" */
    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="corrigir"]'); await p.waitForTimeout(100);
    await p.click('#listaPendentes .item[data-codigo="9001"] [data-acao="retirar"]');
    await p.click('#listaPendentes [data-acao="sim-retirar"]'); await p.waitForTimeout(250);
    ok('retirar o item em edição limpa o formulário', !(await p.locator('#codigo').isDisabled()) && await p.inputValue('#codigo') === '');

    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ SENHA, SAIR, SESSÃO */
  {
    const { p, banco, errosJs, ctx } = await tela(b);
    await entrar(p);
    ok('sem botão de trocar senha', await p.locator('#btnAbrirSenha, #cartaoSenha').count() === 0 && !/Trocar senha/i.test(await p.locator('body').textContent()));
    ok('aviso fixo: item precisa estar no GR e cuidado com duplicidade', await visivel(p, '#regras') &&
       /precisa já estar criado no GR/.test(await txt(p, '#regras')) && /duplicidade/.test(await txt(p, '#regras')));
    await preencher(p, { codigo:'9100', descricao:'ITEM NORMAL', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('aviso fixo continua depois de salvar', await visivel(p, '#regras') && banco.itens.has('9100'));

    /* senha trocada em outro lugar: a próxima gravação devolve para o Entrar */
    banco.contas.compras.senha = 'mudou-em-outra-aba';
    await preencher(p, { codigo:'9101', descricao:'ITEM COM SESSAO VENCIDA', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('sessão vencida volta para entrar com explicação', await visivel(p, '#telaEntrar') && /não vale mais/.test(await txt(p, '#avisoEntrar')));
    ok('ao sair, o formulário e a senha somem', await p.evaluate(() => estado.senha === '' && estado.login === '') && await p.inputValue('#codigo') === '');

    await entrar(p, 'compras', 'mudou-em-outra-aba');
    await p.click('#btnSair'); await p.waitForTimeout(100);
    ok('sair volta para entrar sem aviso', await visivel(p, '#telaEntrar') && !(await visivel(p, '#avisoEntrar')) && !(await visivel(p, '#telaDentro')));
    ok('sair esquece a senha', await p.evaluate(() => estado.senha) === '');
    ok('nada gravado no navegador', await p.evaluate(() => localStorage.length + sessionStorage.length) === 0);
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ---------------------------------------------------- QUANDO A REDE FALHA */
  {
    const { p, banco, errosJs, ctx } = await tela(b, { falhar: { tabela: 500 } });
    ok('catálogo fora: selo "sem prévia"', /sem prévia/.test(await txt(p, '#statusConexao')));
    await entrar(p);
    await preencher(p, { codigo:'5046', descricao:'sabao' });
    ok('catálogo fora: sem dica e sem parecidos, sem quebrar', !(await visivel(p, '#dicaCodigo')) && !(await visivel(p, '#parecidos')));
    await preencher(p, { codigo:'9200', descricao:'ITEM SEM PREVIA', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('catálogo fora: ainda cadastra', banco.itens.has('9200') && /cadastrado/.test(await txt(p, '#avisoItem')));
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }
  {
    const { p, banco, errosJs, ctx } = await tela(b, { falhar: { catalogo_salvar_item: 'rede' } });
    await entrar(p);
    await preencher(p, { codigo:'9300', descricao:'ITEM SEM REDE', familia:'MM', unidade:'UNID' });
    await salvarItem(p);
    ok('sem rede: diz que não salvou', /Não salvei.*internet/s.test(await txt(p, '#avisoItem')));
    ok('sem rede: nada se perde', await p.inputValue('#codigo') === '9300' && await p.inputValue('#descricao') === 'ITEM SEM REDE' &&
       await p.inputValue('#familia') === 'MM' && await p.inputValue('#unidade') === 'UNID');
    ok('sem rede: botão volta a funcionar', !(await p.locator('#btnSalvar').isDisabled()) && (await txt(p, '#btnSalvar')) === 'Cadastrar item');
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }
  {
    const { p, errosJs, ctx } = await tela(b, { falhar: { catalogo_entrar: 'rede' } });
    await entrar(p);
    ok('entrar sem rede: explica e não entra', /Não consegui falar com o banco/.test(await txt(p, '#avisoEntrar')) && !(await visivel(p, '#telaDentro')));
    ok('entrar sem rede: botão volta', !(await p.locator('#btnEntrar').isDisabled()));
    ok('sem erro de JavaScript', errosJs.length === 0, errosJs.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ CELULAR E TEMA ESCURO */
  for(const esquema of ['light', 'dark']){
    const banco = mock.bancoDoCadastro({ catalogo: CATALOGO, logins: LOGINS });
    const ctx = await b.newContext({ viewport:{ width:360, height:740 }, colorScheme: esquema });
    const p = await ctx.newPage();
    await banco.instalarNa(p);
    await p.goto(url, { waitUntil:'load' }); await p.waitForTimeout(200);
    await entrar(p);
    await preencher(p, { codigo:'9400', descricao:'ITEM DE CELULAR COM NOME BEM COMPRIDO PARA TESTAR QUEBRA DE LINHA', familia:'SP', unidade:'UNID' });
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    ok('celular 360px sem rolagem lateral (' + esquema + ')', larg <= 360, larg);
    const fundo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('fundo segue o tema (' + esquema + ')', esquema === 'dark' ? fundo === 'rgb(8, 19, 28)' : fundo === 'rgb(242, 245, 248)', fundo);
    if(process.env.FOTOS) await p.screenshot({ path: 't-cadastro-' + esquema + '.png', fullPage:true });
    await ctx.close();
  }

  await b.close();
  console.log(notas.join('\n'));
  console.log('\nFALHAS (' + falhas.length + ')' + (falhas.length ? ':\n  x ' + falhas.join('\n  x ') : ''));
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
