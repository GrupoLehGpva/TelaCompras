-- ============================================================================
-- Cadastro de itens · parte 2: EXCLUIR ITEM e CADASTRAR FORNECEDOR · Grupo Leh
--
-- Vem depois de cadastro-de-itens.sql e usa o mesmo login e a mesma senha
-- (catalogo_cadastradores). Quem cadastra item também cuida de fornecedor.
--
-- 1) EXCLUIR ITEM
--    Antes, a tela só tirava do formulário item cadastrado por ela e ainda
--    aguardando o GR. Agora exclui qualquer item.
--
--    Excluir é DESATIVAR, nunca apagar: pedido antigo guarda o código do item,
--    e apagar transformaria esse pedido em órfão.
--
--    O problema que isso cria: a importação do CSV grava `ativo = true` em
--    todo item que está no arquivo. Item excluído aqui e que continua no GR
--    voltaria sozinho na próxima importação, sem ninguém entender por quê.
--    Por isso o item ganha `excluido = true` e um gatilho mantém ele desligado
--    mesmo quando a importação tenta religar. Só a tela religa (reativar).
--
--    Efeito colateral tratado: a conferência do fluxo do n8n compara "itens no
--    arquivo" com `ativos_agora`. Item excluído que está no arquivo não fica
--    ativo, e os números deixariam de bater. `ativos_agora` passa a contar os
--    itens QUE VIERAM no arquivo (atualizado_em = carimbo), ativos ou não.
--
-- 2) FORNECEDOR
--    A tabela `fornecedores` já existe (ordem-de-compra.sql) e tem 3.572
--    fornecedores vindos do GR. Em todos, id = codigo_gr. A regra continua:
--    fornecedor só entra com o código do GR (decisão do Guilherme, 02/10) — é
--    por ele que a ordem de compra casa o fornecedor lá.
--
--    O documento mora na coluna `cnpj` (nome antigo), com máscara, igual aos
--    dados que já estão lá: 999.999.999-99 para CPF e 99.999.999/9999-99 para
--    CNPJ. A coluna nova `tipo_pessoa` (PF/PJ) diz qual dos dois é, e é
--    preenchida para os que já existem pelo tamanho do documento.
--
-- COMO RODAR: SQL Editor, uma vez. Pode rodar de novo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ITEM: marca de excluído e o gatilho que segura a importação
-- ---------------------------------------------------------------------------
alter table public.catalogo_itens
  add column if not exists excluido boolean not null default false;

alter table public.catalogo_itens_historico
  add column if not exists motivo text;

create or replace function public._catalogo_manter_excluido()
returns trigger
language plpgsql
as $$
begin
  -- Item excluído pela tela continua desligado mesmo que a importação mande
  -- ativo = true. A tela religa limpando `excluido` na mesma gravação.
  if old.excluido and new.excluido and new.ativo then
    new.ativo := false;
  end if;
  return new;
end;
$$;

create or replace trigger catalogo_manter_excluido
  before update on public.catalogo_itens
  for each row execute function public._catalogo_manter_excluido();

-- ---------------------------------------------------------------------------
-- 2) ITEM: salvar, agora com o modo "excluir"
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
  v_motivo text := nullif(btrim(coalesce(p_item->>'motivo', '')), '');
  v_conf   boolean := coalesce((p_item->>'confirmar_nome')::boolean, false);
  atual    public.catalogo_itens;
  novo     public.catalogo_itens;
  outro    record;
  v_existe boolean;
begin
  if not (a->>'ok')::boolean then return a; end if;
  v_nome := a->>'nome';

  -- "retirar" é o nome antigo de "excluir" para item pendente; continua aceito.
  if p_modo = 'retirar' then p_modo := 'excluir'; end if;
  if p_modo not in ('criar', 'reativar', 'corrigir', 'excluir') then
    return jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  end if;

  if v_cod !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo');
  end if;
  v_cod := ltrim(v_cod, '0');
  if v_cod = '' or length(v_cod) > 7 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo');
  end if;

  select * into atual from catalogo_itens where codigo = v_cod for update;
  v_existe := found;

  -- EXCLUIR ------------------------------------------------------------------
  if p_modo = 'excluir' then
    if not v_existe then
      return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
    end if;
    if not atual.ativo then
      return jsonb_build_object('ok', false, 'erro', 'ja_excluido', 'item', to_jsonb(atual));
    end if;
    if v_motivo is not null and length(v_motivo) > 300 then
      return jsonb_build_object('ok', false, 'erro', 'motivo_longo', 'campo', 'motivo');
    end if;
    update catalogo_itens set ativo = false, excluido = true, atualizado_em = now()
     where codigo = v_cod returning * into novo;
    insert into catalogo_itens_historico (codigo, acao, antes, depois, por, motivo)
    values (v_cod, 'excluir', to_jsonb(atual), to_jsonb(novo), v_nome, v_motivo);
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
      select * into atual from catalogo_itens where codigo = v_cod;
      return jsonb_build_object('ok', false, 'erro', 'codigo_existe', 'campo', 'codigo',
                                'item', to_jsonb(atual));
    end;
  else
    update catalogo_itens
       set familia = v_fam, descricao = v_desc, unidade = v_un,
           especificacao = case when p_item ? 'especificacao' then v_esp else especificacao end,
           ativo = true, excluido = false, pendente_gr = true, atualizado_em = now(),
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
-- 3) IMPORTAÇÃO: a conferência conta o que veio no arquivo, ativo ou não
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_desativar_antigos(p_marca timestamptz)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n int; total int; no_arquivo int; aguardando int; confirmados int; excluidos int;
begin
  update public.catalogo_itens
     set pendente_gr = false
   where pendente_gr and atualizado_em = p_marca;
  get diagnostics confirmados = row_count;

  update public.catalogo_itens
     set ativo = false
   where atualizado_em < p_marca
     and ativo is distinct from false
     and not pendente_gr;
  get diagnostics n = row_count;

  select count(*) into total      from public.catalogo_itens where ativo;
  select count(*) into no_arquivo from public.catalogo_itens where atualizado_em = p_marca;
  select count(*) into aguardando from public.catalogo_itens where ativo and pendente_gr;
  select count(*) into excluidos  from public.catalogo_itens where atualizado_em = p_marca and excluido;

  if total < 1000 then
    raise exception 'Import abortado: sobraram so % itens ativos no catalogo. Nada foi alterado.', total;
  end if;

  -- ativos_agora = itens que vieram NESTE arquivo (o número que o n8n compara
  -- com o total do arquivo). Os excluídos pela tela estão aí dentro, desligados.
  return json_build_object('ok', true, 'desativados', n, 'ativos_agora', no_arquivo,
    'ativos_total', total, 'aguardando_gr', aguardando,
    'confirmados_pelo_gr', confirmados, 'excluidos_na_tela', excluidos);
end;
$$;
revoke all on function public.catalogo_desativar_antigos(timestamptz) from public, anon, authenticated;
grant execute on function public.catalogo_desativar_antigos(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4) FORNECEDOR: colunas novas, preenchimento do tipo e histórico
-- ---------------------------------------------------------------------------
alter table public.fornecedores
  add column if not exists tipo_pessoa    text check (tipo_pessoa in ('PF', 'PJ')),
  add column if not exists cadastrado_por text,
  add column if not exists cadastrado_em  timestamptz;

update public.fornecedores
   set tipo_pessoa = case length(regexp_replace(cnpj, '\D', '', 'g'))
                       when 11 then 'PF' when 14 then 'PJ' end
 where tipo_pessoa is null and cnpj is not null;

create table if not exists public.fornecedores_historico (
  id            bigserial primary key,
  fornecedor_id text not null,
  acao          text not null,
  antes         jsonb,
  depois        jsonb,
  motivo        text,
  por           text not null,
  em            timestamptz not null default now()
);
alter table public.fornecedores_historico enable row level security;
revoke all on public.fornecedores_historico from anon, authenticated;
create index if not exists fornecedores_historico_id_idx
  on public.fornecedores_historico (fornecedor_id);

-- ---------------------------------------------------------------------------
-- 5) CPF e CNPJ: dígitos verificadores. Documento com dígito errado é
--    documento digitado errado — melhor parar aqui do que na nota fiscal.
-- ---------------------------------------------------------------------------
create or replace function public._documento_valido(p_digitos text, p_tipo text)
returns boolean
language plpgsql
immutable
as $$
declare
  d int[]; s int; r int; i int;
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if p_tipo = 'PF' then
    if p_digitos !~ '^\d{11}$' or p_digitos ~ '^(\d)\1{10}$' then return false; end if;
    d := string_to_array(p_digitos, null)::int[];
    s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> d[10] then return false; end if;
    s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = d[11];
  elsif p_tipo = 'PJ' then
    if p_digitos !~ '^\d{14}$' or p_digitos ~ '^(\d)\1{13}$' then return false; end if;
    d := string_to_array(p_digitos, null)::int[];
    s := 0; for i in 1..12 loop s := s + d[i] * p1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> d[13] then return false; end if;
    s := 0; for i in 1..13 loop s := s + d[i] * p2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = d[14];
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) FORNECEDOR: buscar (para corrigir, excluir ou reativar)
--    Pede login e senha porque devolve CPF e endereço — dado que a chave
--    pública não lê. Acha por código do GR, nome ou documento (só dígitos).
-- ---------------------------------------------------------------------------
create or replace function public.fornecedor_buscar(p_login text, p_senha text, p_termo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb := public._catalogo_autenticar(p_login, p_senha);
  t text := btrim(coalesce(p_termo, ''));
  dig text := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
begin
  if not (a->>'ok')::boolean then return a; end if;
  if length(t) < 2 then
    return jsonb_build_object('ok', true, 'fornecedores', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'fornecedores', coalesce((
    select jsonb_agg(x order by x.ordem, x.razao_social)
      from (select f.id, f.codigo_gr, f.razao_social, f.tipo_pessoa, f.cnpj as documento,
                   f.endereco, f.bairro, f.cep, f.cidade, f.uf, f.ativo,
                   f.cadastrado_por, f.cadastrado_em,
                   case when f.codigo_gr = t then 0
                        when f.razao_social ilike t || '%' then 1 else 2 end as ordem
              from fornecedores f
             where f.codigo_gr = t
                or f.razao_social ilike '%' || t || '%'
                or f.nome_curto   ilike '%' || t || '%'
                or (length(dig) >= 5 and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') like '%' || dig || '%')
             order by 14, f.razao_social
             limit 30) x), '[]'::jsonb));
end;
$$;
revoke all on function public.fornecedor_buscar(text, text, text) from public;
grant execute on function public.fornecedor_buscar(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) FORNECEDOR: salvar — criar, corrigir, excluir ou reativar
-- ---------------------------------------------------------------------------
create or replace function public.fornecedor_salvar(
  p_login text, p_senha text, p_modo text, p_forn jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a        jsonb := public._catalogo_autenticar(p_login, p_senha);
  v_nome   text;
  v_cod    text := btrim(coalesce(p_forn->>'codigo_gr', ''));
  v_tipo   text := upper(btrim(coalesce(p_forn->>'tipo_pessoa', '')));
  v_razao  text := regexp_replace(btrim(coalesce(p_forn->>'razao_social', '')), '\s+', ' ', 'g');
  v_dig    text := regexp_replace(coalesce(p_forn->>'documento', ''), '\D', '', 'g');
  v_end    text := regexp_replace(btrim(coalesce(p_forn->>'endereco', '')), '\s+', ' ', 'g');
  v_bairro text := nullif(btrim(coalesce(p_forn->>'bairro', '')), '');
  v_cep    text := regexp_replace(coalesce(p_forn->>'cep', ''), '\D', '', 'g');
  v_cidade text := regexp_replace(btrim(coalesce(p_forn->>'cidade', '')), '\s+', ' ', 'g');
  v_uf     text := upper(btrim(coalesce(p_forn->>'uf', '')));
  v_motivo text := nullif(btrim(coalesce(p_forn->>'motivo', '')), '');
  v_conf   boolean := coalesce((p_forn->>'confirmar_nome')::boolean, false);
  v_doc    text;
  atual    public.fornecedores;
  novo     public.fornecedores;
  outro    record;
  v_existe boolean;
begin
  if not (a->>'ok')::boolean then return a; end if;
  v_nome := a->>'nome';

  if p_modo not in ('criar', 'corrigir', 'excluir', 'reativar') then
    return jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  end if;

  if v_cod !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo_gr');
  end if;
  v_cod := ltrim(v_cod, '0');
  if v_cod = '' or length(v_cod) > 7 then
    return jsonb_build_object('ok', false, 'erro', 'codigo_invalido', 'campo', 'codigo_gr');
  end if;

  select * into atual from fornecedores where id = v_cod or codigo_gr = v_cod limit 1 for update;
  v_existe := found;

  -- EXCLUIR --------------------------------------------------------------------
  if p_modo = 'excluir' then
    if not v_existe then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
    if not atual.ativo then
      return jsonb_build_object('ok', false, 'erro', 'ja_excluido', 'fornecedor', to_jsonb(atual));
    end if;
    if v_motivo is not null and length(v_motivo) > 300 then
      return jsonb_build_object('ok', false, 'erro', 'motivo_longo', 'campo', 'motivo');
    end if;
    update fornecedores set ativo = false, atualizado_em = now()
     where id = atual.id returning * into novo;
    insert into fornecedores_historico (fornecedor_id, acao, antes, depois, motivo, por)
    values (novo.id, 'excluir', to_jsonb(atual), to_jsonb(novo), v_motivo, v_nome);
    return jsonb_build_object('ok', true, 'modo', p_modo, 'fornecedor', to_jsonb(novo));
  end if;

  -- Campos (criar, corrigir, reativar) -------------------------------------------
  if v_tipo not in ('PF', 'PJ') then
    return jsonb_build_object('ok', false, 'erro', 'tipo_invalido', 'campo', 'tipo_pessoa');
  end if;
  if not public._documento_valido(v_dig, v_tipo) then
    return jsonb_build_object('ok', false, 'erro', 'documento_invalido', 'campo', 'documento');
  end if;
  v_doc := case v_tipo
    when 'PF' then substr(v_dig,1,3)||'.'||substr(v_dig,4,3)||'.'||substr(v_dig,7,3)||'-'||substr(v_dig,10,2)
    else substr(v_dig,1,2)||'.'||substr(v_dig,3,3)||'.'||substr(v_dig,6,3)||'/'||substr(v_dig,9,4)||'-'||substr(v_dig,13,2)
  end;
  if length(v_razao) < 3 or length(v_razao) > 150 then
    return jsonb_build_object('ok', false, 'erro', 'razao_invalida', 'campo', 'razao_social');
  end if;
  if length(v_end) < 5 or length(v_end) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'endereco_invalido', 'campo', 'endereco');
  end if;
  if v_bairro is not null and length(v_bairro) > 100 then
    return jsonb_build_object('ok', false, 'erro', 'bairro_invalido', 'campo', 'bairro');
  end if;
  if v_cep <> '' and v_cep !~ '^\d{8}$' then
    return jsonb_build_object('ok', false, 'erro', 'cep_invalido', 'campo', 'cep');
  end if;
  if length(v_cidade) < 2 or length(v_cidade) > 100 then
    return jsonb_build_object('ok', false, 'erro', 'cidade_invalida', 'campo', 'cidade');
  end if;
  if v_uf not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
                  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX') then
    return jsonb_build_object('ok', false, 'erro', 'uf_invalida', 'campo', 'uf');
  end if;

  if p_modo = 'criar' and v_existe then
    return jsonb_build_object('ok', false,
      'erro', case when atual.ativo then 'codigo_existe' else 'codigo_inativo' end,
      'campo', 'codigo_gr', 'fornecedor', to_jsonb(atual));
  end if;
  if p_modo = 'corrigir' and not v_existe then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;
  if p_modo = 'reativar' and (not v_existe or atual.ativo) then
    return jsonb_build_object('ok', false, 'erro', 'nao_reativavel', 'fornecedor', to_jsonb(atual));
  end if;

  -- Mesmo CPF/CNPJ em outro fornecedor ativo: quase sempre é o mesmo
  -- fornecedor com outro código. Esse não passa nem com confirmação.
  select id, codigo_gr, razao_social into outro from fornecedores
   where ativo and id <> coalesce(atual.id, '')
     and regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_dig
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'erro', 'documento_repetido', 'campo', 'documento',
      'fornecedor', jsonb_build_object('codigo_gr', outro.codigo_gr, 'razao_social', outro.razao_social));
  end if;

  -- Mesma razão social com outro documento: pode ser filial. Pede confirmação.
  if not v_conf then
    select id, codigo_gr, razao_social into outro from fornecedores
     where ativo and id <> coalesce(atual.id, '') and lower(razao_social) = lower(v_razao)
     limit 1;
    if found then
      return jsonb_build_object('ok', false, 'erro', 'nome_repetido', 'campo', 'razao_social',
        'fornecedor', jsonb_build_object('codigo_gr', outro.codigo_gr, 'razao_social', outro.razao_social));
    end if;
  end if;

  if p_modo = 'criar' then
    begin
      insert into fornecedores (id, codigo_gr, razao_social, nome_curto, tipo_pessoa, cnpj,
                                endereco, bairro, cep, cidade, uf, ativo,
                                cadastrado_por, cadastrado_em, atualizado_em)
      values (v_cod, v_cod, v_razao, v_razao, v_tipo, v_doc,
              v_end, v_bairro,
              case when v_cep = '' then null else substr(v_cep,1,5) || '-' || substr(v_cep,6,3) end,
              v_cidade, v_uf, true,
              v_nome, now(), now())
      returning * into novo;
    exception when unique_violation then
      select * into atual from fornecedores where id = v_cod or codigo_gr = v_cod limit 1;
      return jsonb_build_object('ok', false, 'erro', 'codigo_existe', 'campo', 'codigo_gr',
                                'fornecedor', to_jsonb(atual));
    end;
  else
    update fornecedores
       set razao_social = v_razao,
           nome_curto   = case when nome_curto is null or nome_curto = atual.razao_social
                               then v_razao else nome_curto end,
           tipo_pessoa  = v_tipo, cnpj = v_doc,
           endereco = v_end, bairro = v_bairro,
           -- CEP com máscara, como o único que já estava gravado (99999-999).
           cep = case when v_cep = '' then null
                      else substr(v_cep,1,5) || '-' || substr(v_cep,6,3) end,
           cidade = v_cidade, uf = v_uf,
           ativo = true, atualizado_em = now()
     where id = atual.id
    returning * into novo;
  end if;

  insert into fornecedores_historico (fornecedor_id, acao, antes, depois, por)
  values (novo.id, p_modo, case when p_modo = 'criar' then null else to_jsonb(atual) end,
          to_jsonb(novo), v_nome);

  return jsonb_build_object('ok', true, 'modo', p_modo, 'fornecedor', to_jsonb(novo));
end;
$$;
revoke all on function public.fornecedor_salvar(text, text, text, jsonb) from public;
grant execute on function public.fornecedor_salvar(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quem excluiu ou mudou o quê:
--   select * from public.catalogo_itens_historico where acao = 'excluir' order by em desc;
--   select * from public.fornecedores_historico order by em desc;
-- ---------------------------------------------------------------------------
