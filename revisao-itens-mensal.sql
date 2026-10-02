-- ============================================================================
-- telas_19 — REVISÃO ITEM A ITEM NA GERENCIAL DA COMPRA MENSAL (02/10)
-- Na compra mensal a gerência aprova a necessidade ANTES da cotação. Nessa
-- etapa o aprovador pode, item a item: mudar quantidade, mudar unidade,
-- reprovar (excluir, com motivo curto) e incluir item do catálogo.
-- · Tudo vai junto com a decisão, numa transação: decidir_itens_mensal chama
--   decidir_pedido; se a decisão for recusada (vez, versão…), nada muda nos itens.
-- · Todos os itens reprovados (e nenhum incluído) = pedido reprovado, com os
--   motivos de cada item.
-- · Item reprovado sai de solicitacao_itens e fica guardado em
--   solicitacao_itens_cortados (quem, quando, motivo). Quantidade/unidade
--   originais ficam em quantidade_pedida/unidade_pedida; item incluído leva
--   incluido_por. Assim Mesa, mapa e ordem de compra seguem lendo só o que vale.
-- · O movimento 'aprovado' leva detalhe.ajustes, que vai para o aviso do
--   facilitador (_telas_payload_avisos → n8n).
-- ============================================================================
alter table solicitacao_itens
  add column if not exists quantidade_pedida numeric,
  add column if not exists unidade_pedida text,
  add column if not exists incluido_por text;

create table if not exists solicitacao_itens_cortados (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  item_id uuid,
  codigo text, descricao text, unidade text, quantidade numeric,
  motivo text not null,
  cortado_por text, cortado_por_nome text, etapa text,
  em timestamptz not null default now()
);
alter table solicitacao_itens_cortados enable row level security;
create index if not exists solicitacao_itens_cortados_sol on solicitacao_itens_cortados (solicitacao_id);

-- Busca no catálogo para incluir item (só quem aprova; 20 resultados).
create or replace function public.buscar_item_catalogo(p_token text, p_termo text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_t text := lower(trim(coalesce(p_termo, ''))); v_palavras text[];
begin
  if not exists (select 1 from aprovadores where token = p_token and ativo and coalesce(p_token,'') <> '') then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido');
  end if;
  if length(v_t) < 2 then
    return jsonb_build_object('ok', true, 'itens', '[]'::jsonb);
  end if;
  v_palavras := regexp_split_to_array(v_t, '\s+');
  return jsonb_build_object('ok', true, 'itens', coalesce((
    select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'descricao', c.descricao, 'unidade', c.unidade, 'familia', c.familia)
                     order by (lower(c.descricao) like v_t || '%') desc, c.descricao)
      from (select * from catalogo_itens c
             where c.ativo
               and (c.codigo = trim(p_termo)
                    or (select bool_and(lower(c.descricao) like '%' || w || '%') from unnest(v_palavras) w))
             order by (lower(c.descricao) like v_t || '%') desc, c.descricao
             limit 20) c), '[]'::jsonb));
end $$;

create or replace function public.decidir_itens_mensal(
  p_token text, p_id uuid, p_versao integer, p_itens jsonb, p_novos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cod text; v_msg text;
  a aprovadores%rowtype; s solicitacoes%rowtype; it solicitacao_itens%rowtype; c catalogo_itens%rowtype;
  i jsonb; r jsonb; v_acao text; q numeric; u text; m text;
  v_ids uuid[]; v_unid text[]; v_keep int := 0; v_codigos text[] := array[]::text[];
  v_cortes jsonb := '[]'::jsonb; v_mud jsonb := '[]'::jsonb; v_inc jsonb := '[]'::jsonb;
  v_ajustes jsonb; v_mov bigint; v_motivo text;
begin
  begin
    select * into a from aprovadores where token = p_token and ativo and coalesce(p_token,'') <> '';
    if a.id is null then
      perform _telas_erro('token_invalido', 'Este link de aprovação não vale mais.');
    end if;
    select * into s from solicitacoes where id = p_id;
    if s.id is null then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado.');
    end if;
    if coalesce(s.tipo_compra, '') <> 'mensal' or s.etapa_atual is distinct from 'gerencial' or s.canal <> 'telas' then
      perform _telas_erro('nao_e_revisao_mensal', 'A revisão item a item é só da aprovação gerencial da compra mensal.');
    end if;
    if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
      perform _telas_erro('itens_desatualizados', 'A lista de itens não veio. Recarregue a página.');
    end if;
    p_novos := coalesce(p_novos, '[]'::jsonb);
    if jsonb_typeof(p_novos) <> 'array' then
      perform _telas_erro('valor_invalido', 'Itens incluídos em formato inválido.');
    end if;

    -- Cada item do pedido tem que vir exatamente uma vez.
    select coalesce(array_agg(id), array[]::uuid[]) into v_ids from solicitacao_itens where solicitacao_id = s.id;
    if jsonb_array_length(p_itens) <> coalesce(array_length(v_ids, 1), 0)
       or (select count(distinct e->>'id') from jsonb_array_elements(p_itens) e) <> jsonb_array_length(p_itens)
       or exists (select 1 from jsonb_array_elements(p_itens) e
                   where e->>'id' is null or not ((e->>'id') = any(v_ids::text[]))) then
      perform _telas_erro('itens_desatualizados', 'A lista de itens deste pedido mudou. Recarregue a página e confira.');
    end if;

    select coalesce(array_agg(distinct upper(trim(unidade))), array[]::text[]) into v_unid
      from catalogo_itens where ativo and nullif(trim(unidade), '') is not null;

    for i in select * from jsonb_array_elements(p_itens) loop
      select * into it from solicitacao_itens where id = (i->>'id')::uuid;
      v_acao := coalesce(nullif(i->>'acao', ''), 'manter');
      if v_acao not in ('manter', 'reprovar') then
        perform _telas_erro('valor_invalido', 'Ação inválida no item "' || it.descricao || '".');
      end if;
      if v_acao = 'reprovar' then
        m := nullif(trim(i->>'motivo'), '');
        if m is null or length(m) < 3 then
          perform _telas_erro('sem_motivo_item', 'Escreva o motivo de reprovar "' || it.descricao || '".');
        end if;
        v_cortes := v_cortes || jsonb_build_object('id', it.id, 'codigo', it.codigo, 'descricao', it.descricao,
                      'quantidade', it.quantidade, 'unidade', it.unidade, 'motivo', left(m, 300));
      else
        begin
          q := (i->>'quantidade')::numeric;
        exception when others then
          perform _telas_erro('quantidade_invalida', 'Quantidade inválida no item "' || it.descricao || '".');
        end;
        if q is null or q <= 0 then
          perform _telas_erro('quantidade_invalida', 'Quantidade precisa ser maior que zero no item "' || it.descricao || '".');
        end if;
        u := upper(trim(coalesce(nullif(i->>'unidade', ''), it.unidade)));
        if u is distinct from upper(trim(it.unidade)) and not (u = any(v_unid)) then
          perform _telas_erro('unidade_invalida', 'Unidade "' || coalesce(u, '') || '" não existe no catálogo (item "' || it.descricao || '").');
        end if;
        v_keep := v_keep + 1;
        if it.codigo is not null then v_codigos := v_codigos || it.codigo; end if;
        if q <> it.quantidade or u is distinct from upper(trim(it.unidade)) then
          v_mud := v_mud || jsonb_build_object('id', it.id, 'descricao', it.descricao,
                     'de_quantidade', it.quantidade, 'quantidade', q, 'de_unidade', it.unidade, 'unidade', u);
        end if;
      end if;
    end loop;

    for i in select * from jsonb_array_elements(p_novos) loop
      select * into c from catalogo_itens where codigo = trim(i->>'codigo') and ativo;
      if c.codigo is null then
        perform _telas_erro('item_fora_do_catalogo', 'Item incluído precisa ser do catálogo (código ' || coalesce(i->>'codigo', '—') || ').');
      end if;
      if c.codigo = any(v_codigos) then
        perform _telas_erro('item_repetido', '"' || c.descricao || '" já está no pedido: ajuste a quantidade dele.');
      end if;
      begin
        q := (i->>'quantidade')::numeric;
      exception when others then
        perform _telas_erro('quantidade_invalida', 'Quantidade inválida no item incluído "' || c.descricao || '".');
      end;
      if q is null or q <= 0 then
        perform _telas_erro('quantidade_invalida', 'Quantidade precisa ser maior que zero no item incluído "' || c.descricao || '".');
      end if;
      u := upper(trim(coalesce(nullif(i->>'unidade', ''), c.unidade)));
      if not (u = any(v_unid)) then
        perform _telas_erro('unidade_invalida', 'Unidade "' || coalesce(u, '') || '" não existe no catálogo (item "' || c.descricao || '").');
      end if;
      v_codigos := v_codigos || c.codigo;
      v_keep := v_keep + 1;
      v_inc := v_inc || jsonb_build_object('codigo', c.codigo, 'descricao', c.descricao, 'quantidade', q, 'unidade', u,
                 'conteudo', c.conteudo, 'unidade_base', c.unidade_base);
    end loop;

    if jsonb_array_length(v_inc) > 30 then
      perform _telas_erro('valor_invalido', 'No máximo 30 itens incluídos de uma vez.');
    end if;

    -- Todos fora e nada incluído: é a reprovação do pedido, com o motivo de cada item.
    if v_keep = 0 then
      select 'Todos os itens reprovados pela gerência: ' ||
             string_agg((e->>'descricao') || ' (' || (e->>'motivo') || ')', '; ' order by e->>'descricao')
        into v_motivo from jsonb_array_elements(v_cortes) e;
      r := decidir_pedido(p_token, p_id, p_versao, 'reprovado', left(v_motivo, 2000));
      if coalesce((r->>'ok')::boolean, false) is not true then
        return r;
      end if;
      insert into solicitacao_itens_cortados (solicitacao_id, item_id, codigo, descricao, unidade, quantidade, motivo,
                                              cortado_por, cortado_por_nome, etapa)
      select s.id, (e->>'id')::uuid, e->>'codigo', e->>'descricao', e->>'unidade', (e->>'quantidade')::numeric, e->>'motivo',
             a.id, a.nome, 'gerencial'
        from jsonb_array_elements(v_cortes) e;
      v_ajustes := jsonb_build_object('cortados', v_cortes, 'mudados', '[]'::jsonb, 'incluidos', '[]'::jsonb);
      select max(id) into v_mov from movimentos_compra
       where solicitacao_id = s.id and acao = 'reprovado' and etapa = 'gerencial' and quem_id = a.id;
      update movimentos_compra set detalhe = detalhe || jsonb_build_object('ajustes', v_ajustes) where id = v_mov;
      return r || jsonb_build_object('ajustes', v_ajustes, 'todos_reprovados', true,
        'mensagem', 'Todos os itens foram reprovados: o pedido foi reprovado e quem pediu recebe o motivo de cada item.');
    end if;

    r := decidir_pedido(p_token, p_id, p_versao, 'aprovado', null);
    if coalesce((r->>'ok')::boolean, false) is not true then
      return r;
    end if;

    -- Aplica os ajustes (mesma transação da decisão).
    insert into solicitacao_itens_cortados (solicitacao_id, item_id, codigo, descricao, unidade, quantidade, motivo,
                                            cortado_por, cortado_por_nome, etapa)
    select s.id, (e->>'id')::uuid, e->>'codigo', e->>'descricao', e->>'unidade', (e->>'quantidade')::numeric, e->>'motivo',
           a.id, a.nome, 'gerencial'
      from jsonb_array_elements(v_cortes) e;
    delete from solicitacao_itens
     where solicitacao_id = s.id and id in (select (e->>'id')::uuid from jsonb_array_elements(v_cortes) e);

    update solicitacao_itens si set
      quantidade_pedida = coalesce(si.quantidade_pedida, si.quantidade),
      unidade_pedida    = coalesce(si.unidade_pedida, si.unidade),
      quantidade        = (e->>'quantidade')::numeric,
      unidade           = e->>'unidade'
      from jsonb_array_elements(v_mud) e
     where si.id = (e->>'id')::uuid;

    insert into solicitacao_itens (id, solicitacao_id, codigo, descricao, unidade, quantidade, fora_catalogo,
                                   conteudo, unidade_base, incluido_por)
    select gen_random_uuid(), s.id, e->>'codigo', e->>'descricao', e->>'unidade', (e->>'quantidade')::numeric, false,
           nullif(e->>'conteudo', '')::numeric, nullif(e->>'unidade_base', ''), a.id
      from jsonb_array_elements(v_inc) e;

    v_ajustes := jsonb_build_object('cortados', v_cortes, 'mudados', v_mud, 'incluidos',
                   (select coalesce(jsonb_agg(e - 'conteudo' - 'unidade_base'), '[]'::jsonb) from jsonb_array_elements(v_inc) e));
    if jsonb_array_length(v_cortes) + jsonb_array_length(v_mud) + jsonb_array_length(v_inc) > 0 then
      select max(id) into v_mov from movimentos_compra
       where solicitacao_id = s.id and acao = 'aprovado' and etapa = 'gerencial' and quem_id = a.id;
      update movimentos_compra set detalhe = detalhe || jsonb_build_object('ajustes', v_ajustes) where id = v_mov;
    end if;

    return r || jsonb_build_object('ajustes', v_ajustes,
      'mensagem', (r->>'mensagem') ||
        case when jsonb_array_length(v_cortes) + jsonb_array_length(v_mud) + jsonb_array_length(v_inc) = 0 then ''
             else ' Itens: ' || concat_ws(', ',
               nullif(jsonb_array_length(v_cortes)::text || case when jsonb_array_length(v_cortes) = 1 then ' reprovado' else ' reprovados' end, '0 reprovados'),
               nullif(jsonb_array_length(v_mud)::text || case when jsonb_array_length(v_mud) = 1 then ' alterado' else ' alterados' end, '0 alterados'),
               nullif(jsonb_array_length(v_inc)::text || case when jsonb_array_length(v_inc) = 1 then ' incluído' else ' incluídos' end, '0 incluídos')) || '.' end);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

revoke all on function public.buscar_item_catalogo(text, text) from public;
revoke all on function public.decidir_itens_mensal(text, uuid, integer, jsonb, jsonb) from public;
grant execute on function public.buscar_item_catalogo(text, text) to anon, authenticated, service_role;
grant execute on function public.decidir_itens_mensal(text, uuid, integer, jsonb, jsonb) to anon, authenticated, service_role;

-- abrir_pedido passa a devolver os itens reprovados (tela do pedido mostra o histórico).
-- _telas_payload_avisos passa a levar detalhe.ajustes para o aviso do facilitador.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.abrir_pedido(uuid,text)'::regprocedure);
  if position('itens_cortados' in d) = 0 then
    d := replace(d, $r$    'anexos', coalesce(($r$, $r$    'itens_cortados', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'descricao', c.descricao, 'unidade', c.unidade,
               'quantidade', c.quantidade, 'motivo', c.motivo, 'cortado_por', c.cortado_por_nome, 'em', c.em)
             order by c.descricao)
        from solicitacao_itens_cortados c where c.solicitacao_id = s.id
    ), '[]'::jsonb),
    'anexos', coalesce(($r$);
    if position('itens_cortados' in d) = 0 then raise exception 'abrir_pedido: trecho não encontrado'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public._telas_payload_avisos(bigint[])'::regprocedure);
  if position('''ajustes''' in d) = 0 then
    d := replace(d, $r$'reenvio', mv.detalhe->'reenvio',$r$, $r$'reenvio', mv.detalhe->'reenvio', 'ajustes', mv.detalhe->'ajustes',$r$);
    if position('''ajustes''' in d) = 0 then raise exception '_telas_payload_avisos: trecho não encontrado'; end if;
    execute d;
  end if;
end $$;
