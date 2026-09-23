-- ============================================================================
-- Cadastro de itens do GR pela tela · Grupo Leh
--
-- O PROBLEMA: o catálogo do formulário só mudava pela importação do CSV
-- (importar-catalogo.md), que roda à mão e de vez em quando. Item criado hoje
-- no GR ficava fora do formulário até a próxima importação, e quem precisava
-- dele marcava "fora do catálogo" — o pedido seguia sem o código do GR.
--
-- A SOLUÇÃO: cadastro-itens.html deixa uma pessoa autorizada cadastrar o item
-- assim que ele nasce no GR. A tela NÃO grava na tabela: o catálogo continua
-- sem política de escrita para a chave pública (fechar-escrita-publica.sql).
-- Ela chama catalogo_salvar_item, que confere login e senha aqui dentro e só
-- então grava.
--
-- POR QUE LOGIN + SENHA E NÃO SÓ UMA SENHA: a chave publicável está no código
-- das telas, e o repositório é público. A senha é a única coisa que separa
-- "qualquer pessoa" de "quem pode cadastrar". Com uma senha por pessoa, quem
-- sai da empresa é desligado sem trocar a senha de todo mundo, e o histórico
-- diz quem cadastrou cada item.
--
-- A SENHA NUNCA É GUARDADA: guardamos o hash bcrypt (pgcrypto). Cinco erros
-- seguidos travam o login por 15 minutos.
--
-- O CONFLITO COM A IMPORTAÇÃO, e como ele foi resolvido:
-- catalogo_desativar_antigos desliga todo item que não veio no CSV. Um item
-- cadastrado pela tela hoje SUMIRIA na próxima importação se o CSV ainda não o
-- tiver (arquivo exportado antes, ou exportado de novo sem conferir). Por isso
-- o item da tela nasce com pendente_gr = true, e a importação não o desliga.
-- Quando o código aparece no CSV, a importação sobrescreve com o que está no
-- GR (o GR é a fonte da verdade) e tira a marca de pendente.
--
-- A conferência do fluxo do n8n compara "itens no arquivo" com "ativos_agora".
-- Com itens pendentes somando aos ativos, esses números deixariam de bater e
-- o fluxo gritaria depois de já ter gravado. Por isso ativos_agora passa a
-- contar SÓ o que veio desta importação — que é o que a conferência quer dizer.
-- O total fica em ativos_total. O fluxo do n8n não precisa mudar.
--
-- COMO RODAR: cole no SQL Editor e rode uma vez. Pode rodar de novo.
-- Depois, crie o login de quem vai cadastrar (fim do arquivo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas novas no catálogo
-- ---------------------------------------------------------------------------
alter table public.catalogo_itens
  add column if not exists pendente_gr    boolean not null default false,
  add column if not exists cadastrado_por text,
  add column if not exists cadastrado_em  timestamptz;

comment on column public.catalogo_itens.pendente_gr is
  'Cadastrado pela tela e ainda não visto no CSV do GR. A importação não desativa estes itens.';

-- ---------------------------------------------------------------------------
-- 2) Quem pode cadastrar. RLS ligado e NENHUMA política: a chave pública não
--    lê nem escreve. Só as funções abaixo (SECURITY DEFINER) tocam aqui.
-- ---------------------------------------------------------------------------
create table if not exists public.catalogo_cadastradores (
  login         text primary key check (login = lower(btrim(login)) and login <> ''),
  nome          text not null,
  senha_hash    text not null,
  ativo         boolean not null default true,
  falhas        int not null default 0,
  bloqueado_ate timestamptz,
  criado_em     timestamptz not null default now()
);
alter table public.catalogo_cadastradores enable row level security;
revoke all on public.catalogo_cadastradores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Histórico: o que mudou, quem mudou, antes e depois. Mesma trava.
-- ---------------------------------------------------------------------------
create table if not exists public.catalogo_itens_historico (
  id       bigserial primary key,
  codigo   text not null,
  acao     text not null,
  antes    jsonb,
  depois   jsonb,
  por      text not null,
  em       timestamptz not null default now()
);
alter table public.catalogo_itens_historico enable row level security;
revoke all on public.catalogo_itens_historico from anon, authenticated;
create index if not exists catalogo_itens_historico_codigo_idx
  on public.catalogo_itens_historico (codigo);

-- ---------------------------------------------------------------------------
-- 4) Conferir login e senha. Interna: não é exposta à chave pública.
--
--    NÃO LEVANTA EXCEÇÃO quando a senha está errada. Uma exceção desfaz a
--    transação inteira — inclusive o "falhas + 1" — e a trava de tentativas
--    nunca travaria nada. Por isso devolve um json com ok=false.
-- ---------------------------------------------------------------------------
create or replace function public._catalogo_autenticar(p_login text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.catalogo_cadastradores;
  v_login text := lower(btrim(coalesce(p_login, '')));
begin
  select * into c from public.catalogo_cadastradores where login = v_login for update;

  if not found or not c.ativo then
    -- Gasta o mesmo tempo de um bcrypt, para o tempo de resposta não contar
    -- quais logins existem.
    perform crypt(coalesce(p_senha, ''), gen_salt('bf', 8));
    return jsonb_build_object('ok', false, 'erro', 'login_ou_senha');
  end if;

  if c.bloqueado_ate is not null and c.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'bloqueado',
      'bloqueado_ate', c.bloqueado_ate);
  end if;

  if c.senha_hash <> crypt(coalesce(p_senha, ''), c.senha_hash) then
    if c.falhas + 1 >= 5 then
      update public.catalogo_cadastradores
         set falhas = 0, bloqueado_ate = now() + interval '15 minutes'
       where login = v_login;
      return jsonb_build_object('ok', false, 'erro', 'bloqueado',
        'bloqueado_ate', now() + interval '15 minutes');
    end if;
    update public.catalogo_cadastradores
       set falhas = c.falhas + 1 where login = v_login;
    return jsonb_build_object('ok', false, 'erro', 'login_ou_senha',
      'restam', 5 - (c.falhas + 1));
  end if;

  if c.falhas > 0 or c.bloqueado_ate is not null then
    update public.catalogo_cadastradores
       set falhas = 0, bloqueado_ate = null where login = v_login;
  end if;
  return jsonb_build_object('ok', true, 'login', c.login, 'nome', c.nome);
end;
$$;
revoke all on function public._catalogo_autenticar(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) O que a tela precisa para montar os campos: famílias, unidades e grupos
--    que existem hoje, e os itens que ainda esperam aparecer no CSV do GR.
--    Interna — as duas funções públicas a devolvem junto.
-- ---------------------------------------------------------------------------
create or replace function public._catalogo_contexto()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'unidades', (select coalesce(jsonb_agg(u order by n desc, u), '[]'::jsonb) from
                  (select unidade u, count(*) n from catalogo_itens where ativo group by 1) x),
    'grupos',   (select coalesce(jsonb_agg(g order by g), '[]'::jsonb) from
                  (select distinct especificacao g from catalogo_itens
                    where ativo and especificacao is not null and btrim(especificacao) <> '') x),
    'pendentes',(select coalesce(jsonb_agg(to_jsonb(p) order by p.cadastrado_em desc), '[]'::jsonb) from
                  (select codigo, familia, descricao, unidade, especificacao, ativo,
                          cadastrado_por, cadastrado_em
                     from catalogo_itens where pendente_gr
                    order by cadastrado_em desc nulls last limit 100) p)
  );
$$;
revoke all on function public._catalogo_contexto() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) ENTRAR — confere a senha antes de a pessoa preencher qualquer coisa.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_entrar(p_login text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb := public._catalogo_autenticar(p_login, p_senha);
begin
  if not (a->>'ok')::boolean then return a; end if;
  return a || public._catalogo_contexto();
end;
$$;
revoke all on function public.catalogo_entrar(text, text) from public;
grant execute on function public.catalogo_entrar(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) SALVAR — criar, reativar, corrigir ou retirar um item.
--
--    criar     código novo. Se já existe, devolve o item existente e não grava.
--    reativar  código que existe mas foi desativado (saiu de uma lista do GR
--              e voltou). Atualiza os dados e religa.
--    corrigir  só item cadastrado pela tela e ainda pendente. Item que veio
--              do GR não se corrige aqui: a próxima importação sobrescreveria
--              a correção sem avisar ninguém — corrige-se no GR.
--    retirar   só item pendente. Para o código digitado errado: desliga, não
--              apaga (pode já haver pedido citando).
--
--    Toda validação mora AQUI, não só na tela: a tela é HTML público e
--    qualquer um pode chamar esta função com o que quiser.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_salvar_item(
  p_login text, p_senha text, p_modo text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a        jsonb := public._catalogo_autenticar(p_login, p_senha);
  v_nome   text;
  v_cod    text := btrim(coalesce(p_item->>'codigo', ''));
  v_fam    text := upper(btrim(coalesce(p_item->>'familia', '')));
  v_desc   text := btrim(coalesce(p_item->>'descricao', ''));
  v_un     text := btrim(coalesce(p_item->>'unidade', ''));
  v_esp    text := nullif(btrim(coalesce(p_item->>'especificacao', '')), '');
  v_conf   boolean := coalesce((p_item->>'confirmar_nome')::boolean, false);
  atual    public.catalogo_itens;
  novo     public.catalogo_itens;
  outro    record;
  v_existe boolean;
begin
  if not (a->>'ok')::boolean then return a; end if;
  v_nome := a->>'nome';

  if p_modo not in ('criar', 'reativar', 'corrigir', 'retirar') then
    return jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  end if;

  -- Código do GR: número inteiro. Zero à esquerda some ("0123" é o 123), para
  -- não nascer um segundo item com o mesmo Id do GR escrito diferente.
  if v_cod !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo');
  end if;
  v_cod := ltrim(v_cod, '0');
  if v_cod = '' or length(v_cod) > 7 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo');
  end if;

  select * into atual from catalogo_itens where codigo = v_cod for update;
  v_existe := found;   -- guardado já: o `found` muda a cada SELECT ... INTO abaixo

  -- RETIRAR ------------------------------------------------------------------
  if p_modo = 'retirar' then
    if not v_existe then
      return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
    end if;
    if not atual.pendente_gr then
      return jsonb_build_object('ok', false, 'erro', 'veio_do_gr', 'item', to_jsonb(atual));
    end if;
    update catalogo_itens set ativo = false, atualizado_em = now()
     where codigo = v_cod returning * into novo;
    insert into catalogo_itens_historico (codigo, acao, antes, depois, por)
    values (v_cod, 'retirar', to_jsonb(atual), to_jsonb(novo), v_nome);
    return jsonb_build_object('ok', true, 'modo', p_modo, 'item', to_jsonb(novo))
           || public._catalogo_contexto();
  end if;

  -- Campos (criar, reativar, corrigir) ----------------------------------------
  if not exists (select 1 from catalogo_itens where familia = v_fam and ativo) then
    return jsonb_build_object('ok', false, 'erro', 'familia_invalida', 'campo', 'familia');
  end if;
  if length(v_desc) < 3 or length(v_desc) > 150 then
    return jsonb_build_object('ok', false, 'erro', 'descricao_invalida', 'campo', 'descricao');
  end if;
  if not exists (select 1 from catalogo_itens where unidade = v_un and ativo) then
    return jsonb_build_object('ok', false, 'erro', 'unidade_invalida', 'campo', 'unidade');
  end if;
  if v_esp is not null and length(v_esp) > 60 then
    return jsonb_build_object('ok', false, 'erro', 'grupo_invalido', 'campo', 'especificacao');
  end if;

  if p_modo = 'criar' and v_existe then
    return jsonb_build_object('ok', false,
      'erro', case when atual.ativo then 'codigo_existe' else 'codigo_inativo' end,
      'campo', 'codigo', 'item', to_jsonb(atual));
  end if;
  if p_modo = 'reativar' and (not v_existe or atual.ativo) then
    return jsonb_build_object('ok', false, 'erro', 'nao_reativavel', 'item', to_jsonb(atual));
  end if;
  if p_modo = 'corrigir' then
    if not v_existe then
      return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
    end if;
    if not atual.pendente_gr then
      return jsonb_build_object('ok', false, 'erro', 'veio_do_gr', 'item', to_jsonb(atual));
    end if;
  end if;

  -- Mesmo nome, outro código: pode ser legítimo (o GR tem 2 casos), mas quase
  -- sempre é o item que já existia. Só passa com confirmação explícita.
  if not v_conf then
    select codigo, descricao, unidade into outro from catalogo_itens
     where ativo and codigo <> v_cod and lower(btrim(descricao)) = lower(v_desc) limit 1;
    if found then
      return jsonb_build_object('ok', false, 'erro', 'nome_repetido', 'campo', 'descricao',
        'item', jsonb_build_object('codigo', outro.codigo, 'descricao', outro.descricao,
                                   'unidade', outro.unidade));
    end if;
  end if;

  if p_modo = 'criar' then
    begin
      insert into catalogo_itens (codigo, familia, descricao, unidade, especificacao,
                                  ativo, pendente_gr, cadastrado_por, cadastrado_em, atualizado_em)
      values (v_cod, v_fam, v_desc, v_un, v_esp, true, true, v_nome, now(), now())
      returning * into novo;
    exception when unique_violation then
      -- Duas pessoas cadastrando o mesmo código ao mesmo tempo.
      select * into atual from catalogo_itens where codigo = v_cod;
      return jsonb_build_object('ok', false, 'erro', 'codigo_existe', 'campo', 'codigo',
                                'item', to_jsonb(atual));
    end;
  else
    update catalogo_itens
       set familia = v_fam, descricao = v_desc, unidade = v_un,
           -- A tela não tem mais o campo Grupo. Sem a chave, o grupo que o
           -- item já tinha fica; só muda quem mandar a chave de propósito.
           especificacao = case when p_item ? 'especificacao' then v_esp else especificacao end,
           ativo = true, pendente_gr = true, atualizado_em = now(),
           cadastrado_por = case when p_modo = 'reativar' then v_nome else cadastrado_por end,
           cadastrado_em  = case when p_modo = 'reativar' then now() else cadastrado_em end
     where codigo = v_cod
    returning * into novo;
  end if;

  insert into catalogo_itens_historico (codigo, acao, antes, depois, por)
  values (v_cod, p_modo, case when p_modo = 'criar' then null else to_jsonb(atual) end,
          to_jsonb(novo), v_nome);

  return jsonb_build_object('ok', true, 'modo', p_modo, 'item', to_jsonb(novo))
         || public._catalogo_contexto();
end;
$$;
revoke all on function public.catalogo_salvar_item(text, text, text, jsonb) from public;
grant execute on function public.catalogo_salvar_item(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Trocar a própria senha.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_trocar_senha(
  p_login text, p_senha text, p_nova text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a jsonb := public._catalogo_autenticar(p_login, p_senha);
begin
  if not (a->>'ok')::boolean then return a; end if;
  if length(coalesce(p_nova, '')) < 8 then
    return jsonb_build_object('ok', false, 'erro', 'senha_curta');
  end if;
  if p_nova = p_senha then
    return jsonb_build_object('ok', false, 'erro', 'senha_igual');
  end if;
  update public.catalogo_cadastradores
     set senha_hash = crypt(p_nova, gen_salt('bf', 10))
   where login = a->>'login';
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.catalogo_trocar_senha(text, text, text) from public;
-- A tela não tem mais "Trocar senha" (decisão de 23/09): senha se troca pelo
-- SQL Editor, com catalogo_definir_cadastrador. Por isso a chave pública não
-- executa esta função. Ela fica para uso administrativo.

-- ---------------------------------------------------------------------------
-- 9) Criar ou redefinir o login de alguém. SÓ pelo SQL Editor: a chave
--    pública não executa esta função.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_definir_cadastrador(
  p_login text, p_nome text, p_senha text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  insert into public.catalogo_cadastradores (login, nome, senha_hash)
  values (lower(btrim(p_login)), btrim(p_nome), crypt(p_senha, gen_salt('bf', 10)))
  on conflict (login) do update
    set nome = excluded.nome, senha_hash = excluded.senha_hash,
        ativo = true, falhas = 0, bloqueado_ate = null;
  return 'Login ' || lower(btrim(p_login)) || ' pronto.';
end;
$$;
revoke all on function public.catalogo_definir_cadastrador(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) A importação passa a respeitar o item pendente.
--
--     O fluxo do n8n grava cada linha com atualizado_em = p_marca, o mesmo
--     carimbo que ele passa aqui. É por essa igualdade exata que se sabe quais
--     itens vieram NESTA importação.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_desativar_antigos(p_marca timestamptz)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  total int;
  importados int;
  aguardando int;
  confirmados int;
begin
  -- Pendente que apareceu no CSV: o GR confirmou, deixa de ser pendente.
  -- Os dados já foram sobrescritos pelo upsert com o que está no GR.
  update public.catalogo_itens
     set pendente_gr = false
   where pendente_gr and atualizado_em = p_marca;
  get diagnostics confirmados = row_count;

  -- Desativa, nao apaga. Pedido antigo guarda o codigo do item na
  -- solicitacao_itens, e apagar o catalogo transformaria historico em orfao.
  -- Item pendente fica: foi cadastrado pela tela e o CSV ainda nao o conhece.
  update public.catalogo_itens
     set ativo = false
   where atualizado_em < p_marca
     and ativo is distinct from false
     and not pendente_gr;
  get diagnostics n = row_count;

  select count(*) into total from public.catalogo_itens where ativo;
  select count(*) into importados from public.catalogo_itens where ativo and atualizado_em = p_marca;
  select count(*) into aguardando from public.catalogo_itens where ativo and pendente_gr;

  -- Trava: import que zera o catalogo e erro, nao resultado.
  if total < 1000 then
    raise exception 'Import abortado: sobraram so % itens ativos no catalogo. Nada foi alterado.', total;
  end if;

  -- ativos_agora = o que veio DESTA importacao. E o numero que a conferencia
  -- do n8n compara com o total do arquivo.
  return json_build_object('ok', true, 'desativados', n, 'ativos_agora', importados,
    'ativos_total', total, 'aguardando_gr', aguardando, 'confirmados_pelo_gr', confirmados);
end;
$$;

-- Ela estava aberta para a chave pública. Quem chama é o n8n, com a chave de
-- serviço, que não passa por aqui.
revoke all on function public.catalogo_desativar_antigos(timestamptz) from public, anon, authenticated;
grant execute on function public.catalogo_desativar_antigos(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Depois de rodar: criar o login de quem cadastra (no SQL Editor).
--   select public.catalogo_definir_cadastrador('fulano', 'Fulano de Tal', 'senha-com-8-ou-mais');
-- Para desligar alguém:
--   update public.catalogo_cadastradores set ativo = false where login = 'fulano';
-- Quem cadastrou o quê:
--   select * from public.catalogo_itens_historico order by em desc limit 50;
-- ---------------------------------------------------------------------------
