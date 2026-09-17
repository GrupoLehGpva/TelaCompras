-- ============================================================================
-- `/compras aprovação` — do Slack de quem digitou para o link da fila dele
--
-- Decisão do Guilherme, 16/09: não existir tabela de links.
--
-- O problema da tabela: cada aprovador tem um token, o token É a identidade
-- dele para o sistema, e uma lista de oito links num canvas ou numa mensagem
-- fixada envelhece, vaza e — o pior — leva alguém a mandar o link do Brandão
-- para a pessoa errada. Aí ela aprova no nome dele sem nem perceber que fez
-- algo estranho.
--
-- A solução: cada um puxa o seu. A pessoa digita `/compras aprovação` no Slack,
-- o Slack diz quem ela é (é ele quem autentica, não nós), e o robô responde na
-- mensagem efêmera — que só ela vê — com o link dela. Não há lista para manter,
-- não há link de um chegando na mão de outro, e não depende de ninguém estar
-- por perto para distribuir.
--
-- Isso também resolve o pedido original: não esperar o lembrete das 11h/16h. O
-- link sempre foi permanente; o lembrete só reenviava o mesmo. Agora dá para
-- pedir na hora.
-- ============================================================================

create or replace function public.aprovador_do_slack(p_uid text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := nullif(trim(p_uid), '');
  a     record;
  v_pend int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', true, 'achou', false, 'motivo', 'sem_uid');
  end if;

  select id, nome, token, etapas
    into a
    from aprovadores
   where ativo and slack_user_id = v_uid
   limit 1;

  if a.id is null then
    return jsonb_build_object('ok', true, 'achou', false, 'motivo', 'nao_e_aprovador');
  end if;

  -- Quantas esperam esta pessoa AGORA. `aprovador_atual` já aponta para quem
  -- decide na etapa em que o pedido está, então não é preciso cruzar `etapas`.
  select count(*) into v_pend
    from solicitacoes
   where aprovador_atual = a.id
     and etapa_atual is not null;

  return jsonb_build_object('ok', true, 'achou', true,
    'nome', a.nome, 'token', a.token, 'etapas', a.etapas, 'pendentes', v_pend);
end
$function$;

-- ----------------------------------------------------------------------------
-- ESTA FUNÇÃO NÃO É PÚBLICA. E É O PONTO MAIS IMPORTANTE DESTE ARQUIVO.
--
-- O token que ela devolve APROVA COMPRA. Ids de usuário do Slack não são
-- segredo — qualquer pessoa do workspace vê o de todo mundo. Se esta função
-- aceitasse a chave pública (que mora no index.html, por construção), o par
-- (chave pública + id do Brandão) viraria "aprovar no lugar do Brandão".
--
-- Quem chama é o n8n, com credencial de servidor. Nenhuma tela chama isto.
-- ----------------------------------------------------------------------------
revoke all on function public.aprovador_do_slack(text) from public, anon, authenticated;
grant execute on function public.aprovador_do_slack(text) to service_role;

-- ============================================================================
-- E A VIZINHA, QUE ESTAVA ABERTA
--
-- Ao escrever a de cima, conferi a `meus_links_do_slack(p_uid)` — a que o
-- `/compras` sem texto usa — e ela estava liberada para `anon`. Devolve o token
-- de ACOMPANHAMENTO de uma pessoa a partir do id de Slack dela.
--
-- Não aprova nada, então ninguém decide no lugar de ninguém com ele. Mas abre a
-- lista de solicitações daquela pessoa: o que pediu, quanto, para qual centro
-- de custo. É leitura de dado de outra pessoa sem ela saber — exatamente o que
-- a correção de LGPD de setembro fechou do outro lado, e que tinha ficado
-- aberto por aqui.
--
-- Fechado no mesmo dia. Conferido rodando o `/compras` de verdade depois da
-- mudança (execução 607): continua funcionando, porque quem chama é o n8n.
-- ============================================================================
revoke all on function public.meus_links_do_slack(text) from public, anon, authenticated;
grant execute on function public.meus_links_do_slack(text) to service_role;
