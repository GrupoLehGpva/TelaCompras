/* O contrato do servidor, escrito uma vez só.
 *
 * Foi um mock que escondeu o bug mais caro deste projeto: a tela de aprovação
 * falava POST/JSON e o endpoint só entendia GET/query. As baterias passavam
 * porque cada uma simulava o servidor do seu jeito, e o jeito de cada uma
 * estava certo — só não era o do servidor.
 *
 * A regra que ficou: o formato da resposta simulada mora AQUI, num arquivo só.
 * Quando o servidor muda, muda aqui, e todas as baterias quebram juntas — que
 * é exatamente o que a gente quer que aconteça.
 */

/* Como a função abrir_pedido responde de verdade (ver abrir-pedido.sql).
   Desde 22/09 ela também devolve os anexos — só os dados, nunca o arquivo. */
function respostaAbrirPedido(pedido, itens, anexos){
  if(!pedido) return { ok:false, erro:'nao_encontrada' };
  return { ok:true, pedido, itens: itens || [], anexos: anexos || [] };
}

/* Como a função criar_solicitacao responde de verdade (ver criar-solicitacao.sql).
   O formulário grava por ela, não por INSERT na tabela — e é aqui que o formato
   dessa resposta mora, para as baterias não inventarem um formato próprio. */
function respostaCriarSolicitacao({ id = 'sol-de-mentira-0001', numero = 'C2609-00001', itens = 1 } = {}){
  return { ok: true, id, numero, itens };
}

/* O que o Supabase devolve para CADA endereço que o formulário usa.
   Uma função só, para nenhuma bateria montar o seu próprio Supabase de araque
   e passar por engano. */
/* As seis pessoas juridicas do Grupo Leh, com o espacamento EXATO do GR.
   Nao arrumar: e por esse texto que o robo casa a opcao no ERP. */
const EMPRESAS_EXEMPLO = [
  { id:'elke-pi',      nome:'ELKE MONIKA ZUBER LEH-PI' },
  { id:'elke-pr',      nome:'ELKE MONIKA ZUBER LEH - PR' },
  { id:'rainer-pi',    nome:'RAINER MATHIAS LEH - PI' },
  { id:'rainer-pr',    nome:'RAINER MATHIAS LEH - PR' },
  { id:'wienfried-pi', nome:'WIENFRIED MATTHIAS LEH - PI' },
  { id:'wienfried-pr', nome:'WIENFRIED MATTHIAS LEH - PR' }
];

/* SÓ FACILITADOR ABRE PEDIDO (index.html, 29/09).
   Quem abre o formulário sem estar na lista é barrado antes do envio — e uma
   bateria que não se identifica passa a testar a trava sem querer, em vez do
   que ela queria testar. Por isso o mock responde, por padrão, que quem abriu É
   facilitador: a bateria que quiser provar a trava passa `facilitador: []` de
   propósito (é o que teste-facilitador.js faz).

   O uid tem que ir na URL junto: sem ele a tela nem pergunta ao banco. Use
   `comoFacilitador(url)` para não esquecer. */
const UID_EXEMPLO = 'U0BL5JPQX97';
const FACILITADOR_EXEMPLO = [{ slack_user_id: UID_EXEMPLO, nome: 'Guilherme Pimpão',
                               email: 'ia@leh.com.br', unidade: 'Escritório Central' }];
const comoFacilitador = url => url + (url.includes('?') ? '&' : '?') + 'uid=' + UID_EXEMPLO;

function respostaDoFormulario(url, { catalogo = [], centros = [], facilitador = FACILITADOR_EXEMPLO, empresas, criada } = {}){
  if(url.includes('/rpc/criar_solicitacao'))    return criada || respostaCriarSolicitacao();
  if(url.includes('empresas'))                  return empresas || EMPRESAS_EXEMPLO;
  if(url.includes('/rpc/facilitador_por_slack'))return facilitador;
  if(url.includes('catalogo_itens'))            return catalogo;
  if(url.includes('centros_custo'))             return centros;
  return [];
}

/* Como o endpoint de decisão responde de verdade (ver o nó
   "Responder JSON (decidido)" / "(sem agir)" do n8n). */
function respostaDecisao({ ok=true, resultado='aprovado', mensagem='aprovada', numero='' }={}){
  return ok ? { ok:true, resultado, mensagem, numero }
            : { ok:false, resultado, mensagem };
}

/* Instala as rotas numa página do Playwright.
 *
 * Ordem importa: no Playwright a rota registrada por ÚLTIMO ganha. Por isso as
 * rotas específicas (rpc/abrir_pedido) entram depois das genéricas (rpc/**). */
async function instalar(p, {
  pedido = null, itens = [], anexos = [], fila = null, centros = [], decisao = null,
  aoDecidir = null, permissao = null
} = {}){
  const json = corpo => ({ status:200, contentType:'application/json', body: JSON.stringify(corpo) });

  await p.route('**/rest/v1/centros_custo**', r => r.fulfill(json(centros)));

  if(fila !== null){
    await p.route('**/rest/v1/rpc/**', r => r.fulfill(json(fila)));
  }

  await p.route('**/rest/v1/rpc/abrir_pedido**', r => r.fulfill(json(respostaAbrirPedido(pedido, itens, anexos))));

  /* Como decisao_permitida responde de verdade (ver reprovar-pelo-comprador.sql).
     É a função que diz se quem abriu a tela pode decidir — e, quando é
     comprador, que a única decisão dele é reprovar (`so_reprova`).
     Entra DEPOIS da rota genérica de rpc: no Playwright a última ganha. */
  if(permissao !== null){
    await p.route('**/rest/v1/rpc/decisao_permitida**', r => r.fulfill(json(permissao)));
  }

  if(decisao !== null || aoDecidir){
    await p.route('**n8n.cloud/**', async r => {
      /* A tela do pedido também pergunta ao n8n quais arquivos estão nos campos
         do card. Isso é leitura, não decisão — sem esta saída, a pergunta dos
         anexos entrava na contagem de cliques de aprovação e a bateria acusava
         decisão que ninguém tomou. */
      if(r.request().url().includes('anexos-do-card')){
        return r.fulfill({ status:200, contentType:'application/json',
                           body: JSON.stringify({ ok:true, arquivos: [] }) });
      }
      /* A tela manda POST com JSON. Se um dia mandar outra coisa, o teste
         precisa enxergar — por isso o corpo é entregue a quem chamou. */
      let corpo = {};
      try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){ corpo = {}; }
      const resp = aoDecidir ? aoDecidir(corpo, r.request()) : decisao;
      if(resp === 'abortar') return r.abort();
      return r.fulfill(json(resp));
    });
  }
}

/* O sim do banco para o comprador: o formato exato que decisao_permitida
   devolve quando o token é de comprador e o pedido está na cotação. */
function respostaComprador({ ok = true, id = 'herisson', nome = 'HERISSON LUCAS LAPCZAK',
                             numero = '', card_id = '', mensagem = '' } = {}){
  return ok
    ? { ok:true, aprovador:id, aprovador_nome:nome, papel:'comprador', so_reprova:true,
        numero, card_id, etapa:'cotacao', fluxo:'padrao', tipo_compra:'normal' }
    : { ok:false, erro:'nao_e_a_vez', papel:'comprador', aprovador:id,
        mensagem: mensagem || 'Esta solicitação não está na cotação.' };
}

/* Para as baterias que despacham na mão por URL: um lugar só que sabe qual
   resposta cada endereço devolve. */
function corpoPorUrl(url, { pedido = null, itens = [], anexos = [], centros = [], fila = [] } = {}){
  if(url.includes('/rpc/abrir_pedido'))     return respostaAbrirPedido(pedido, itens, anexos);
  if(url.includes('/rpc/fila_de_aprovacao'))return fila;
  if(url.includes('/rpc/'))                 return fila;
  if(url.includes('solicitacao_itens'))     return itens;
  if(url.includes('centros_custo'))         return centros;
  if(url.includes('solicitacoes'))          return pedido ? [pedido] : [];
  return [];
}


/* ============================================================================
   CADASTRO DE ITENS — o banco de mentira que responde como o de verdade.

   Diferente dos outros mocks, este guarda estado: a tela cadastra, corrige,
   retira e reativa, e cada passo depende do anterior. As regras abaixo são
   as de catalogo_salvar_item (cadastro-de-itens.sql), linha por linha — e
   teste-cadastro-itens.sql confere as mesmas regras no Postgres de verdade.
   Se mudar lá, muda aqui.
   ========================================================================== */
function bancoDoCadastro({ catalogo = [], fornecedores = [], logins = { 'compras': { nome:'Compras Teste', senha:'senha-certa-123' } } } = {}){
  const itens = new Map(catalogo.map(i => [String(i.codigo), Object.assign({ ativo:true, pendente_gr:false }, i)]));
  const forns = new Map(fornecedores.map(f => [String(f.id || f.codigo_gr),
    Object.assign({ ativo:true }, f, { id:String(f.id || f.codigo_gr), codigo_gr:String(f.codigo_gr || f.id) })]));
  const historicoForn = [];
  const contas = JSON.parse(JSON.stringify(logins));
  Object.values(contas).forEach(c => { c.falhas = 0; c.bloqueado_ate = null; c.ativo = c.ativo !== false; });
  const chamadas = [];

  function autenticar(login, senha){
    const c = contas[String(login||'').trim().toLowerCase()];
    if(!c || !c.ativo) return { ok:false, erro:'login_ou_senha' };
    if(c.bloqueado_ate && c.bloqueado_ate > Date.now()) return { ok:false, erro:'bloqueado', bloqueado_ate:new Date(c.bloqueado_ate).toISOString() };
    if(c.senha !== senha){
      if(c.falhas + 1 >= 5){ c.falhas = 0; c.bloqueado_ate = Date.now() + 15*60000;
        return { ok:false, erro:'bloqueado', bloqueado_ate:new Date(c.bloqueado_ate).toISOString() }; }
      c.falhas++; return { ok:false, erro:'login_ou_senha', restam: 5 - c.falhas };
    }
    c.falhas = 0; c.bloqueado_ate = null;
    return { ok:true, login:String(login).trim().toLowerCase(), nome:c.nome };
  }
  function contexto(){
    const ativos = [...itens.values()].filter(i => i.ativo);
    const cont = {}; ativos.forEach(i => cont[i.unidade] = (cont[i.unidade]||0) + 1);
    return {
      unidades: Object.keys(cont).sort((a,b)=> cont[b]-cont[a] || a.localeCompare(b)),
      grupos: [...new Set(ativos.map(i => i.especificacao).filter(Boolean))].sort(),
      pendentes: [...itens.values()].filter(i => i.pendente_gr)
        .sort((a,b)=> String(b.cadastrado_em).localeCompare(String(a.cadastrado_em)))
        .map(i => ({ codigo:i.codigo, familia:i.familia, descricao:i.descricao, unidade:i.unidade,
                     especificacao:i.especificacao ?? null, ativo:i.ativo, cadastrado_por:i.cadastrado_por, cadastrado_em:i.cadastrado_em }))
    };
  }
  let relogio = Date.parse('2026-09-23T12:00:00Z');
  const agora = () => new Date(relogio += 1000).toISOString();

  function salvar(login, senha, modo, p){
    const a = autenticar(login, senha); if(!a.ok) return a;
    if(modo === 'retirar') modo = 'excluir';          // nome antigo, igual ao SQL
    if(!['criar','reativar','corrigir','excluir'].includes(modo)) return { ok:false, erro:'modo_invalido' };
    let cod = String(p.codigo ?? '').trim();
    if(!/^[0-9]+$/.test(cod)) return { ok:false, erro:'codigo_invalido', campo:'codigo' };
    cod = cod.replace(/^0+/, '');
    if(cod === '' || cod.length > 7) return { ok:false, erro:'codigo_invalido', campo:'codigo' };
    const atual = itens.get(cod);
    if(modo === 'excluir'){
      if(!atual) return { ok:false, erro:'nao_encontrado' };
      if(!atual.ativo) return { ok:false, erro:'ja_excluido', item:atual };
      if(p.motivo && String(p.motivo).trim().length > 300) return { ok:false, erro:'motivo_longo', campo:'motivo' };
      atual.ativo = false; atual.excluido = true; atual.motivo = String(p.motivo || '').trim() || null;
      return Object.assign({ ok:true, modo, item:Object.assign({}, atual) }, contexto());
    }
    const fam = String(p.familia||'').trim().toUpperCase(), desc = String(p.descricao||'').trim(),
          un = String(p.unidade||'').trim(), esp = String(p.especificacao||'').trim() || null;
    const ativos = [...itens.values()].filter(i => i.ativo);
    if(!ativos.some(i => i.familia === fam)) return { ok:false, erro:'familia_invalida', campo:'familia' };
    if(desc.length < 3 || desc.length > 150) return { ok:false, erro:'descricao_invalida', campo:'descricao' };
    if(!ativos.some(i => i.unidade === un)) return { ok:false, erro:'unidade_invalida', campo:'unidade' };
    if(esp && esp.length > 60) return { ok:false, erro:'grupo_invalido', campo:'especificacao' };
    if(modo === 'criar' && atual) return { ok:false, erro: atual.ativo ? 'codigo_existe' : 'codigo_inativo', campo:'codigo', item:atual };
    if(modo === 'reativar' && (!atual || atual.ativo)) return { ok:false, erro:'nao_reativavel', item:atual || null };
    if(modo === 'corrigir'){
      if(!atual) return { ok:false, erro:'nao_encontrado' };
      if(!atual.pendente_gr) return { ok:false, erro:'veio_do_gr', item:atual };
    }
    if(!p.confirmar_nome){
      const outro = ativos.find(i => String(i.codigo) !== cod && i.descricao.trim().toLowerCase() === desc.toLowerCase());
      if(outro) return { ok:false, erro:'nome_repetido', campo:'descricao', item:{ codigo:outro.codigo, descricao:outro.descricao, unidade:outro.unidade } };
    }
    /* Sem a chave `especificacao`, o grupo que o item já tinha fica (a tela
       não tem mais o campo). Igual ao `p_item ? 'especificacao'` do SQL. */
    const novo = Object.assign({}, atual || {}, { codigo:cod, familia:fam, descricao:desc, unidade:un,
                                                  ativo:true, excluido:false, pendente_gr:true });
    if('especificacao' in p || !atual) novo.especificacao = esp;
    if(modo !== 'corrigir'){ novo.cadastrado_por = a.nome; novo.cadastrado_em = agora(); }
    itens.set(cod, novo);
    return Object.assign({ ok:true, modo, item:Object.assign({}, novo) }, contexto());
  }

  /* ---------- FORNECEDOR: as regras de fornecedor_salvar / fornecedor_buscar ---------- */
  const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
               'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'];
  function docValido(dig, tipo){
    const d = String(dig).split('').map(Number);
    if(tipo === 'PF'){
      if(!/^\d{11}$/.test(dig) || /^(\d)\1{10}$/.test(dig)) return false;
      let s = 0; for(let i=0;i<9;i++) s += d[i]*(10-i); let r = (s*10)%11; if(r===10) r=0; if(r!==d[9]) return false;
      s = 0; for(let i=0;i<10;i++) s += d[i]*(11-i); r = (s*10)%11; if(r===10) r=0; return r===d[10];
    }
    if(tipo === 'PJ'){
      if(!/^\d{14}$/.test(dig) || /^(\d)\1{13}$/.test(dig)) return false;
      const p1=[5,4,3,2,9,8,7,6,5,4,3,2], p2=[6,5,4,3,2,9,8,7,6,5,4,3,2];
      let s=0; for(let i=0;i<12;i++) s+=d[i]*p1[i]; let r=s%11; r=r<2?0:11-r; if(r!==d[12]) return false;
      s=0; for(let i=0;i<13;i++) s+=d[i]*p2[i]; r=s%11; r=r<2?0:11-r; return r===d[13];
    }
    return false;
  }
  const digitos = t => String(t||'').replace(/\D/g,'');
  const fmtDoc = (d, t) => t === 'PF' ? d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9)
                                      : d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12);
  function salvarForn(login, senha, modo, p){
    const a = autenticar(login, senha); if(!a.ok) return a;
    if(!['criar','corrigir','excluir','reativar'].includes(modo)) return { ok:false, erro:'modo_invalido' };
    let cod = String(p.codigo_gr ?? '').trim();
    if(!/^[0-9]+$/.test(cod)) return { ok:false, erro:'codigo_invalido', campo:'codigo_gr' };
    cod = cod.replace(/^0+/, '');
    if(cod === '' || cod.length > 7) return { ok:false, erro:'codigo_invalido', campo:'codigo_gr' };
    const atual = forns.get(cod);
    if(modo === 'excluir'){
      if(!atual) return { ok:false, erro:'nao_encontrado' };
      if(!atual.ativo) return { ok:false, erro:'ja_excluido', fornecedor:atual };
      if(p.motivo && String(p.motivo).trim().length > 300) return { ok:false, erro:'motivo_longo', campo:'motivo' };
      atual.ativo = false;
      historicoForn.push({ id:cod, acao:'excluir', motivo:String(p.motivo||'').trim() || null, por:a.nome });
      return { ok:true, modo, fornecedor:Object.assign({}, atual) };
    }
    const tipo = String(p.tipo_pessoa||'').trim().toUpperCase();
    if(!['PF','PJ'].includes(tipo)) return { ok:false, erro:'tipo_invalido', campo:'tipo_pessoa' };
    const dig = digitos(p.documento);
    if(!docValido(dig, tipo)) return { ok:false, erro:'documento_invalido', campo:'documento' };
    const razao = String(p.razao_social||'').trim().replace(/\s+/g,' '), end = String(p.endereco||'').trim().replace(/\s+/g,' ');
    const bairro = String(p.bairro||'').trim() || null, cep = digitos(p.cep), cidade = String(p.cidade||'').trim().replace(/\s+/g,' ');
    const uf = String(p.uf||'').trim().toUpperCase();
    if(razao.length < 3 || razao.length > 150) return { ok:false, erro:'razao_invalida', campo:'razao_social' };
    if(end.length < 5 || end.length > 200) return { ok:false, erro:'endereco_invalido', campo:'endereco' };
    if(bairro && bairro.length > 100) return { ok:false, erro:'bairro_invalido', campo:'bairro' };
    if(cep && !/^\d{8}$/.test(cep)) return { ok:false, erro:'cep_invalido', campo:'cep' };
    if(cidade.length < 2 || cidade.length > 100) return { ok:false, erro:'cidade_invalida', campo:'cidade' };
    if(!UFS.includes(uf)) return { ok:false, erro:'uf_invalida', campo:'uf' };
    if(modo === 'criar' && atual) return { ok:false, erro: atual.ativo ? 'codigo_existe' : 'codigo_inativo', campo:'codigo_gr', fornecedor:atual };
    if(modo === 'corrigir' && !atual) return { ok:false, erro:'nao_encontrado' };
    if(modo === 'reativar' && (!atual || atual.ativo)) return { ok:false, erro:'nao_reativavel', fornecedor:atual || null };
    const outros = [...forns.values()].filter(f => f.ativo && f.id !== cod);
    const mesmoDoc = outros.find(f => digitos(f.cnpj) === dig);
    if(mesmoDoc) return { ok:false, erro:'documento_repetido', campo:'documento', fornecedor:{ codigo_gr:mesmoDoc.codigo_gr, razao_social:mesmoDoc.razao_social } };
    if(!p.confirmar_nome){
      const mesmoNome = outros.find(f => f.razao_social.toLowerCase() === razao.toLowerCase());
      if(mesmoNome) return { ok:false, erro:'nome_repetido', campo:'razao_social', fornecedor:{ codigo_gr:mesmoNome.codigo_gr, razao_social:mesmoNome.razao_social } };
    }
    const novo = Object.assign({}, atual || {}, { id:cod, codigo_gr:cod, razao_social:razao, tipo_pessoa:tipo, cnpj:fmtDoc(dig, tipo),
      endereco:end, bairro, cep: cep ? cep.slice(0,5)+'-'+cep.slice(5) : null, cidade, uf, ativo:true });
    if(modo === 'criar'){ novo.cadastrado_por = a.nome; novo.cadastrado_em = agora(); }
    forns.set(cod, novo);
    historicoForn.push({ id:cod, acao:modo, por:a.nome });
    return { ok:true, modo, fornecedor:Object.assign({}, novo) };
  }
  function buscarForn(login, senha, termo){
    const a = autenticar(login, senha); if(!a.ok) return a;
    const t = String(termo||'').trim(), dig = digitos(termo);
    if(t.length < 2) return { ok:true, fornecedores:[] };
    const lista = [...forns.values()].filter(f => f.codigo_gr === t || f.razao_social.toLowerCase().includes(t.toLowerCase()) ||
                                                  (dig.length >= 5 && digitos(f.cnpj).includes(dig)))
      .map(f => ({ id:f.id, codigo_gr:f.codigo_gr, razao_social:f.razao_social, tipo_pessoa:f.tipo_pessoa || null,
                   documento:f.cnpj || null, endereco:f.endereco || null, bairro:f.bairro || null, cep:f.cep || null,
                   cidade:f.cidade || null, uf:f.uf || null, ativo:f.ativo,
                   ordem: f.codigo_gr === t ? 0 : f.razao_social.toLowerCase().startsWith(t.toLowerCase()) ? 1 : 2 }))
      .sort((x,y) => x.ordem - y.ordem || x.razao_social.localeCompare(y.razao_social)).slice(0, 30);
    return { ok:true, fornecedores:lista };
  }

  function trocar(login, senha, nova){
    const a = autenticar(login, senha); if(!a.ok) return a;
    if(String(nova||'').length < 8) return { ok:false, erro:'senha_curta' };
    if(nova === senha) return { ok:false, erro:'senha_igual' };
    contas[a.login].senha = nova; return { ok:true };
  }

  /* Instala na página. `falhar` deixa a bateria derrubar um endereço. */
  async function instalarNa(p, { falhar = {} } = {}){
    await p.route('**supabase.co/**', async r => {
      const url = r.request().url();
      let corpo = {}; try { corpo = JSON.parse(r.request().postData() || '{}'); } catch(e){}
      const nome = (url.match(/\/rpc\/([a-z_]+)/) || [])[1] || 'tabela';
      chamadas.push({ nome, url, corpo });
      if(falhar[nome] === 'rede') return r.abort();
      if(falhar[nome] === 500) return r.fulfill({ status:500, contentType:'application/json', body:'{"message":"erro de teste"}' });
      const json = b => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(b) });
      if(nome === 'catalogo_entrar'){ const a = autenticar(corpo.p_login, corpo.p_senha); return json(a.ok ? Object.assign(a, contexto()) : a); }
      if(nome === 'catalogo_salvar_item') return json(salvar(corpo.p_login, corpo.p_senha, corpo.p_modo, corpo.p_item || {}));
      if(nome === 'catalogo_trocar_senha') return json(trocar(corpo.p_login, corpo.p_senha, corpo.p_nova));
      if(nome === 'fornecedor_salvar') return json(salvarForn(corpo.p_login, corpo.p_senha, corpo.p_modo, corpo.p_forn || {}));
      if(nome === 'fornecedor_buscar') return json(buscarForn(corpo.p_login, corpo.p_senha, corpo.p_termo));
      if(url.includes('/rest/v1/catalogo_itens')){
        const u = new URL(url);
        const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1000);
        const todos = [...itens.values()].sort((a,b)=> String(a.codigo).localeCompare(String(b.codigo)))
          .map(i => ({ codigo:i.codigo, descricao:i.descricao, unidade:i.unidade, familia:i.familia, ativo:i.ativo }));
        return json(todos.slice(off, off + lim));
      }
      return json([]);
    });
  }

  return { instalarNa, chamadas, itens, contas, forns, historicoForn };
}

module.exports = {
  respostaComprador, FACILITADOR_EXEMPLO, UID_EXEMPLO, comoFacilitador, instalar, bancoDoCadastro, respostaAbrirPedido, respostaDecisao, corpoPorUrl,
                   respostaCriarSolicitacao, respostaDoFormulario, EMPRESAS_EXEMPLO };
