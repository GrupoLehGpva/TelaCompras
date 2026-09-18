-- Quem precisa decidir ESTE card agora, e se o pedido é urgente.
-- Aplicada em 18/09/2026. Cópia fiel do que está no banco.
--
-- POR QUE EXISTE
-- O C2609-00001 entrou na aprovação financeira às 16:00:57 — 57 segundos
-- depois do lembrete das 16h ter rodado. O Wienfried tinha a fila funcionando
-- e o link válido, mas ninguém contou a ele: o único aviso de mudança de etapa
-- vai para quem PEDIU, nunca para o novo aprovador. Numa sexta, o próximo
-- lembrete seria segunda às 11h — 67 horas de compra urgente parada.
--
-- O aviso imediato vale SÓ para compra urgente, decisão do Guilherme: o resto
-- continua na lista 2× ao dia, que existe justamente para não virar uma DM por
-- pedido.
--
-- DEVOLVE UM TOKEN QUE APROVA COMPRA. Por isso service_role apenas, igual a
-- aprovador_do_slack. Id de card não é segredo: se esta função fosse pública,
-- quem soubesse o id de um card pegaria o token de quem decide.
create or replace function public.aprovador_a_avisar(p_card_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
       'achou',        true,
       'numero',       s.numero,
       'etapa',        s.etapa_atual,
       'tipo_compra',  s.tipo_compra,
       'urgente',      lower(coalesce(s.tipo_compra, '')) = 'urgente',
       'aprovador_id', a.id,
       'nome',         a.nome,
       'slack',        a.slack_user_id,
       'token',        a.token,
       'facilitador',  coalesce(nullif(trim(s.solicitante_nome), ''), s.facilitador),
       'motivo',       s.motivo,
       'pendentes',    (select count(*) from public.solicitacoes s2
                         where s2.aprovador_atual = a.id
                           and s2.status = 'aguardando aprovacao')
     )
     from public.solicitacoes s
     join public.aprovadores a
       on a.id = s.aprovador_atual
      and a.ativo
      and s.etapa_atual = any(a.etapas)
    where s.card_id = p_card_id
      -- 'aguardando aprovacao' é o que impede aviso de card que a trava da
      -- cotação devolveu enquanto o fluxo esperava os seis segundos.
      and s.status = 'aguardando aprovacao'
    limit 1),
    jsonb_build_object('achou', false));
$$;

comment on function public.aprovador_a_avisar(text) is
  'Quem decide este card agora, com o link dele e se o pedido e urgente. service_role apenas: devolve token de aprovacao.';

revoke all on function public.aprovador_a_avisar(text) from public;
revoke all on function public.aprovador_a_avisar(text) from anon;
revoke all on function public.aprovador_a_avisar(text) from authenticated;
grant execute on function public.aprovador_a_avisar(text) to service_role;

-- Conferência: só service_role e postgres podem executar.
select array_agg(grantee || ':' || privilege_type) as permissoes
  from information_schema.role_routine_grants
 where routine_name = 'aprovador_a_avisar';
