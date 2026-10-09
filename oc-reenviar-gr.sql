-- 09/10: botão "Reenviar ao GR" no card do funil (painel.html).
-- Quando a OC não entra no GR (recusada pelo GR ou bloqueada na montagem), o comprador corrige
-- o que faltou e reenvia pela tela, sem depender da TI.
-- Regras:
--   * só o comprador (painel_acesso ativo, com o Slack de um comprador ativo) reenvia;
--   * só OC 'recusada' (inclui o bloqueio da montagem). 'incerta' NÃO: pode já estar no GR;
--   * antes de liberar, monta de novo: se ainda falta algo, não mexe em nada e diz o quê;
--   * liberou: tira a recusa, registra quem reenviou e chama o n8n na hora.

create table if not exists public.oc_reenvios (
  id bigint generated always as identity primary key,
  numero text not null,
  quem text not null,
  em timestamptz not null default now(),
  resultado text not null,
  detalhe jsonb
);
alter table public.oc_reenvios enable row level security;
revoke all on table public.oc_reenvios from anon, authenticated;

create or replace function public._pode_reenviar_oc(p_token text)
returns text language sql stable security definer set search_path to 'public' as $function$
  select pa.nome from painel_acesso pa
   where pa.token = p_token and pa.ativo and not coalesce(pa.observador, false)
     and exists (select 1 from compradores c where c.ativo and c.slack_user_id = pa.slack_user_id)
   limit 1
$function$;
revoke all on function public._pode_reenviar_oc(text) from public, anon, authenticated;

create or replace function public.oc_reenviar_gr(p_token text, p_numero text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_quem text; v_sol solicitacoes%rowtype; v_lote uuid; v_ger text; m jsonb; cfg oc_config%rowtype;
  n_rec int; n_incerta int; n_fila int; r record;
begin
  v_quem := _pode_reenviar_oc(p_token);
  if v_quem is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao',
      'mensagem', 'Só o comprador pode reenviar a OC ao GR.');
  end if;

  select * into v_sol from solicitacoes where numero = trim(p_numero);
  if v_sol.id is null then
    select p.lote_id, p.gerencia_id into v_lote, v_ger from lote_pacotes p join lotes_mensais l on l.id = p.lote_id
     where _oc_numero_pacote(l.competencia, p.gerencia_id) = trim(p_numero) limit 1;
    if v_lote is null then
      return jsonb_build_object('ok', false, 'erro', 'nao_encontrado', 'mensagem', 'Pedido não encontrado.');
    end if;
  end if;

  -- OCs do pedido (avulso) ou do pacote, só produção
  select count(*) filter (where o.situacao = 'recusada'),
         count(*) filter (where o.situacao = 'incerta'),
         count(*) filter (where o.situacao in ('a lancar', 'enviando'))
    into n_rec, n_incerta, n_fila
    from ordens_compra o
   where o.ambiente = 'producao'
     and (case when v_sol.id is not null then o.solicitacao_id = v_sol.id and o.lote_id is null
               else o.pacote = trim(p_numero) end);

  if n_incerta > 0 then
    return jsonb_build_object('ok', false, 'erro', 'incerta',
      'mensagem', 'Tem OC sem resposta do GR: confira no GR antes. Se ela não estiver lá, avise a TI.');
  end if;
  if n_fila > 0 then
    return jsonb_build_object('ok', false, 'erro', 'na_fila', 'mensagem', 'A OC já está na fila de envio ao GR.');
  end if;
  if n_rec = 0 then
    return jsonb_build_object('ok', false, 'erro', 'nada_a_reenviar', 'mensagem', 'Este pedido não tem OC recusada para reenviar.');
  end if;

  -- monta de novo antes de liberar: se ainda falta algo, não mexe em nada
  if v_sol.id is not null then m := oc_montar(v_sol.id); else m := oc_montar_pacote(v_lote, v_ger); end if;
  if not coalesce((m->>'ok')::boolean, false) then
    insert into oc_reenvios (numero, quem, resultado, detalhe)
    values (trim(p_numero), v_quem, 'ainda_bloqueado', m->'bloqueios');
    return jsonb_build_object('ok', false, 'erro', 'ainda_bloqueado',
      'mensagem', 'Ainda falta corrigir antes de reenviar.', 'bloqueios', coalesce(m->'bloqueios', '[]'::jsonb));
  end if;

  for r in select o.id from ordens_compra o
            where o.ambiente = 'producao' and o.situacao = 'recusada'
              and (case when v_sol.id is not null then o.solicitacao_id = v_sol.id and o.lote_id is null
                        else o.pacote = trim(p_numero) end)
  loop
    perform oc_refazer(r.id, v_quem || ' (reenvio pelo funil)');
  end loop;

  insert into oc_reenvios (numero, quem, resultado) values (trim(p_numero), v_quem, 'reenviado');

  -- chama o n8n na hora (o mesmo webhook da aprovação); se falhar, a conferência de hora em hora pega
  select * into cfg from oc_config where id;
  if coalesce(cfg.ligado, false) and nullif(trim(cfg.webhook_emitir), '') is not null then
    begin
      perform net.http_post(url := cfg.webhook_emitir,
                            body := jsonb_build_object('origem', 'reenvio_funil', 'numero', trim(p_numero)),
                            headers := '{"Content-Type": "application/json"}'::jsonb,
                            timeout_milliseconds := 5000);
    exception when others then
      raise warning 'aviso ao n8n falhou: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', 'Reenviado. A OC vai ao GR em até 1 minuto.');
end $function$;
revoke all on function public.oc_reenviar_gr(text, text) from public;
grant execute on function public.oc_reenviar_gr(text, text) to anon, authenticated;

-- painel_diretoria devolve se quem abriu pode reenviar (para a tela mostrar o botão)
do $$
declare d text; a text := 'return jsonb_build_object(''ok'', true, ''quem'', v_nome, ''solicitacoes'', v_lista);';
  b text := 'return jsonb_build_object(''ok'', true, ''quem'', v_nome, ''solicitacoes'', v_lista, ''pode_reenviar'', _pode_reenviar_oc(p_token) is not null);';
begin
  d := pg_get_functiondef('public.painel_diretoria(text)'::regprocedure);
  if position('pode_reenviar' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'painel_diretoria: trecho do return'; end if;
  execute replace(d, a, b);
end $$;

-- Link do funil (com o token de cada pessoa) para os avisos de OC não criada no Slack.
-- Só a chave de serviço (n8n, nó "Links do painel") chama.
update painel_acesso set slack_user_id = 'U0BL5JPQX97' where nome = 'Guilherme Pimpão' and slack_user_id is null;

create or replace function public.painel_links_avisos(p_slack text[])
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_object_agg(pa.slack_user_id,
           'https://grupolehgpva.github.io/TelaCompras/painel.html?t=' || pa.token), '{}'::jsonb)
    from painel_acesso pa
   where pa.ativo and pa.slack_user_id = any(p_slack)
$function$;
revoke all on function public.painel_links_avisos(text[]) from public, anon, authenticated;
grant execute on function public.painel_links_avisos(text[]) to service_role;
