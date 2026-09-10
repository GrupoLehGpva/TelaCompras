-- Quem pode decidir o quê.
--
-- O endpoint de decisão da tela recebia token, card e etapa e não conferia
-- nada: bastava conhecer a URL e um id de card para aprovar em nome de
-- qualquer aprovador. Esta função é a autoridade — o n8n pergunta antes de
-- encostar no card, e a resposta é sim ou não com motivo.
--
-- Fica no banco, e não no n8n, porque a regra é sobre os dados: quem é o
-- aprovador da vez está na linha da solicitação, não no fluxo.

create or replace function public.decisao_permitida(
  p_token          text,
  p_solicitacao_id uuid,
  p_card_id        text,
  p_etapa          text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a  aprovadores%rowtype;
  s  solicitacoes%rowtype;
begin
  -- 1. o token existe e está ativo
  select * into a from aprovadores where token = p_token and ativo;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido',
      'mensagem', 'Este link de aprovação não vale mais.');
  end if;

  -- 2. a etapa pedida é uma das etapas dele
  if p_etapa is null or not (p_etapa = any(a.etapas)) then
    return jsonb_build_object('ok', false, 'erro', 'etapa_nao_e_dele',
      'mensagem', 'Você não aprova nesta etapa.', 'aprovador', a.id);
  end if;

  -- 3. a solicitação existe
  select * into s from solicitacoes where id = p_solicitacao_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente',
      'mensagem', 'Solicitação não encontrada.', 'aprovador', a.id);
  end if;

  -- 4. o card informado é o card DESTA solicitação
  --    (sem isto, o token certo moveria o card errado)
  if coalesce(s.card_id, '') = '' or s.card_id is distinct from p_card_id then
    return jsonb_build_object('ok', false, 'erro', 'card_nao_confere',
      'mensagem', 'O card informado não é o desta solicitação.', 'aprovador', a.id);
  end if;

  -- 5. a vez é dele, e é esta etapa
  if s.aprovador_atual is distinct from a.id or s.etapa_atual is distinct from p_etapa then
    return jsonb_build_object('ok', false, 'erro', 'nao_e_a_vez',
      'mensagem', 'Esta solicitação não está esperando a sua aprovação.',
      'aprovador', a.id, 'etapa_atual', s.etapa_atual, 'aprovador_atual', s.aprovador_atual);
  end if;

  -- 6. ainda não foi decidida
  if s.decidido_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'ja_decidida',
      'mensagem', 'Esta solicitação já foi decidida.', 'aprovador', a.id);
  end if;

  return jsonb_build_object('ok', true, 'aprovador', a.id, 'aprovador_nome', a.nome,
    'numero', s.numero, 'card_id', s.card_id, 'etapa', s.etapa_atual);
end
$function$;

revoke all on function public.decisao_permitida(text, uuid, text, text) from public;
grant execute on function public.decisao_permitida(text, uuid, text, text) to anon, authenticated, service_role;
