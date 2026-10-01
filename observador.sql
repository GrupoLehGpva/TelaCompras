-- ============================================================================
-- telas_18 — MODO OBSERVADOR DA TELA DE APROVAÇÃO (01/10)
-- Quem tem acesso ao funil e está marcado como observador (painel_acesso.observador)
-- abre aprovacoes.html?o=<token do funil> e vê a fila REAL de qualquer aprovador,
-- do jeito que ele vê: fila, mapa da cotação, preços, anexos e histórico.
-- Não decide nada: o token do aprovador nunca sai do banco, e pedido_telas volta
-- com "pode" todo falso. A tela também desliga os botões.
-- ============================================================================
alter table painel_acesso add column if not exists observador boolean not null default false;

create or replace function public.observar_como(
  p_token text, p_aprovador text default null, p_funcao text default 'aprovadores',
  p_id uuid default null, p_limite integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs text; v_tk text; v_nome text; r jsonb;
begin
  select nome into v_obs from painel_acesso
   where token = p_token and ativo and observador and coalesce(p_token,'') <> '';
  if v_obs is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;

  if p_funcao = 'aprovadores' then
    return jsonb_build_object('ok', true, 'observador', v_obs, 'aprovadores',
      coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'etapas', a.etapas,
                  'na_fila', (select count(*) from fila_de_aprovacao(a.token)))
                order by a.nome)
         from aprovadores a where a.ativo), '[]'::jsonb));
  end if;

  select token, nome into v_tk, v_nome from aprovadores where id = p_aprovador and ativo;
  if v_tk is null then
    return jsonb_build_object('ok', false, 'erro', 'aprovador_nao_encontrado');
  end if;

  if p_funcao = 'aprovador_do_token' then
    r := coalesce((select jsonb_agg(to_jsonb(x)) from aprovador_do_token(v_tk) x), '[]'::jsonb);
  elsif p_funcao = 'fila_de_aprovacao' then
    r := coalesce((select jsonb_agg(to_jsonb(x)) from fila_de_aprovacao(v_tk) x), '[]'::jsonb);
  elsif p_funcao = 'fila_do_aprovador' then
    r := fila_do_aprovador(v_tk);
  elsif p_funcao = 'historico_de_aprovacoes' then
    r := coalesce((select jsonb_agg(to_jsonb(x)) from historico_de_aprovacoes(v_tk, least(greatest(coalesce(p_limite,60),1),200)) x), '[]'::jsonb);
  elsif p_funcao = 'pedido_telas' then
    r := pedido_telas(v_tk, p_id);
    if r ? 'pode' then
      r := jsonb_set(r, '{pode}', coalesce((select jsonb_object_agg(k, false) from jsonb_object_keys(r->'pode') k), '{}'::jsonb));
    end if;
    r := r || jsonb_build_object('observador', true);
  else
    return jsonb_build_object('ok', false, 'erro', 'funcao_nao_permitida');
  end if;

  -- Rede de segurança: o token do aprovador nunca volta para a tela.
  if position(v_tk in r::text) > 0 then
    return jsonb_build_object('ok', false, 'erro', 'resposta_bloqueada');
  end if;
  return r;
end $$;

revoke all on function public.observar_como(text, text, text, uuid, integer) from public;
grant execute on function public.observar_como(text, text, text, uuid, integer) to anon, authenticated, service_role;

update painel_acesso set observador = true where nome = 'Guilherme Pimpão';
