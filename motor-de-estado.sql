-- ============================================================================
-- O PEDIDO ANDA SOZINHO
--
-- Até aqui o estado de uma solicitação vivia só na coluna do card no ClickUp.
-- Isso bastava enquanto a aprovação era um botão numa DM: o botão levava o id
-- do card, e o card dizia se o clique ainda valia.
--
-- A fila de aprovação mudou a pergunta. Ela não parte de um link recebido:
-- parte de "o que está esperando ESTA pessoa agora". Para responder isso é
-- preciso saber, na linha da solicitação, em que etapa ela está e de quem é a
-- vez — e era exatamente o que ninguém escrevia. Os pedidos reais nasciam sem
-- card, sem etapa e sem aprovador, e a fila nunca os enxergava.
--
-- Estas três funções são o motor. A regra de quem aprova o quê fica AQUI, e
-- não espalhada pelo n8n: o fluxo só avisa o que aconteceu e pergunta para
-- onde vai.
--
--   iniciar_solicitacao  o card nasceu; a vez é do superior do facilitador
--   entrou_em_etapa      o comprador terminou; a vez é do gerente
--   registrar_decisao    alguém decidiu; para onde vai agora, e quem avisar
--
-- Etapas: lider → cotacao → gerencial → financeiro → (fim)
-- Reprovação em qualquer uma encerra.
-- ============================================================================

alter table public.solicitacoes add column if not exists facilitador_id text;

comment on column public.solicitacoes.facilitador_id is
  'Quem abriu o pedido, ligado ao cadastro de facilitadores. É daqui que saem o superior, o gerente e o comprador.';

-- ---------------------------------------------------------------------------
-- 1. O card nasceu
-- ---------------------------------------------------------------------------
create or replace function public.iniciar_solicitacao(
  p_id      uuid,
  p_card_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s solicitacoes%rowtype;
  f facilitadores%rowtype;
  a aprovadores%rowtype;
begin
  select * into s from solicitacoes where id = p_id;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente');
  end if;

  -- Quem abriu: pelo Slack primeiro (vem do comando, não é digitado).
  --
  -- Nada de `if not found` aqui. FOUND guarda o resultado do ÚLTIMO comando
  -- executado — e quando o bloco do Slack nem roda, ele ainda carrega o
  -- sucesso do SELECT anterior. Foi assim que a busca por e-mail deixou de
  -- acontecer para quem não tem Slack, que é justamente a maioria hoje.
  -- A pergunta certa é sobre a variável, não sobre o FOUND.
  if coalesce(s.slack_user_id, '') <> '' then
    select * into f from facilitadores where slack_user_id = s.slack_user_id and ativo limit 1;
  end if;
  if f.id is null and coalesce(s.facilitador_email, '') <> '' then
    select * into f from facilitadores where lower(email) = lower(s.facilitador_email) and ativo limit 1;
  end if;

  if f.id is null then
    -- Sem facilitador reconhecido não há a quem mandar. Grava o card assim
    -- mesmo (o card existe, e perder essa ligação é pior) e diz o que houve.
    update solicitacoes set card_id = p_card_id where id = p_id;
    return jsonb_build_object('ok', false, 'erro', 'facilitador_desconhecido',
      'card_id', p_card_id);
  end if;

  select * into a from aprovadores where id = f.superior_id and ativo;
  if a.id is null then
    update solicitacoes set card_id = p_card_id, facilitador_id = f.id where id = p_id;
    return jsonb_build_object('ok', false, 'erro', 'superior_sem_cadastro',
      'facilitador', f.nome, 'superior_id', f.superior_id);
  end if;

  update solicitacoes
     set card_id         = p_card_id,
         facilitador_id  = f.id,
         etapa_atual     = 'lider',
         aprovador_atual = a.id,
         status          = 'aguardando aprovacao'
   where id = p_id;

  return jsonb_build_object(
    'ok', true, 'etapa', 'lider',
    'aprovador_id', a.id, 'aprovador', a.nome, 'aprovador_slack', a.slack_user_id,
    'facilitador', f.nome, 'facilitador_slack', f.slack_user_id,
    'comprador_id', f.comprador_id);
end
$function$;

-- ---------------------------------------------------------------------------
-- 2. O comprador terminou a cotação e mandou para o gerencial
--    (única transição que não nasce de uma decisão)
-- ---------------------------------------------------------------------------
create or replace function public.entrou_em_etapa(
  p_card_id text,
  p_etapa   text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s solicitacoes%rowtype;
  f facilitadores%rowtype;
  a aprovadores%rowtype;
  v_aprovador text;
begin
  select * into s from solicitacoes where card_id = p_card_id;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'card_sem_solicitacao');
  end if;

  if p_etapa not in ('gerencial', 'financeiro') then
    return jsonb_build_object('ok', false, 'erro', 'etapa_invalida', 'etapa', p_etapa);
  end if;

  select * into f from facilitadores where id = s.facilitador_id;

  if p_etapa = 'gerencial' then
    v_aprovador := f.gerente_id;
  else
    -- O financeiro é um só, e é quem estiver ativo com essa etapa.
    select id into v_aprovador from aprovadores
     where ativo and 'financeiro' = any(etapas) order by id limit 1;
  end if;

  select * into a from aprovadores where id = v_aprovador and ativo;
  if a.id is null then
    return jsonb_build_object('ok', false, 'erro', 'aprovador_sem_cadastro',
      'etapa', p_etapa, 'aprovador_id', v_aprovador);
  end if;

  update solicitacoes
     set etapa_atual = p_etapa, aprovador_atual = a.id
   where id = s.id;

  return jsonb_build_object('ok', true, 'numero', s.numero, 'etapa', p_etapa,
    'aprovador_id', a.id, 'aprovador', a.nome, 'aprovador_slack', a.slack_user_id);
end
$function$;

-- ---------------------------------------------------------------------------
-- 3. Alguém decidiu
--    Devolve o novo estado E quem precisa ser avisado. Quem avisa é o n8n;
--    quem sabe A QUEM avisar é aqui.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_decisao(
  p_id      uuid,
  p_etapa   text,
  p_decisao text,
  p_motivo  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s          solicitacoes%rowtype;
  f          facilitadores%rowtype;
  prox_etapa text;
  prox_aprov text;
  v_status   text;
  a          aprovadores%rowtype;
  ger        aprovadores%rowtype;
  avisar_fac boolean := false;
  avisar_ger boolean := false;
begin
  select * into s from solicitacoes where id = p_id;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente');
  end if;
  select * into f from facilitadores where id = s.facilitador_id;

  if p_decisao = 'aprovado' then
    prox_etapa := case p_etapa
                    when 'lider'      then 'cotacao'
                    when 'gerencial'  then 'financeiro'
                    when 'financeiro' then null end;
    v_status   := case p_etapa
                    when 'lider'      then 'em cotacao'
                    when 'gerencial'  then 'aguardando aprovacao'
                    when 'financeiro' then 'aprovado' end;

    if prox_etapa = 'financeiro' then
      select id into prox_aprov from aprovadores
       where ativo and 'financeiro' = any(etapas) order by id limit 1;
    else
      prox_aprov := null;   -- cotação não tem aprovador; fim também não
    end if;

  elsif p_decisao = 'reprovado' then
    prox_etapa := null;
    prox_aprov := null;
    v_status   := 'reprovado';

    -- Reprovação do financeiro avisa só o gerente. Nas outras, quem pediu.
    if p_etapa = 'financeiro' then
      avisar_ger := true;
    else
      avisar_fac := true;
    end if;
  else
    return jsonb_build_object('ok', false, 'erro', 'decisao_invalida', 'decisao', p_decisao);
  end if;

  update solicitacoes
     set etapa_atual     = prox_etapa,
         aprovador_atual = prox_aprov,
         status          = v_status,
         decidido_em     = case when prox_etapa is null then now() else null end
   where id = s.id;

  if prox_aprov is not null then
    select * into a from aprovadores where id = prox_aprov;
  end if;
  if avisar_ger and f.gerente_id is not null then
    select * into ger from aprovadores where id = f.gerente_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'numero',   s.numero,
    'etapa',    coalesce(prox_etapa, 'fim'),
    'status',   v_status,
    'motivo',   p_motivo,
    'proximo_aprovador',       a.id,
    'proximo_aprovador_nome',  a.nome,
    'proximo_aprovador_slack', a.slack_user_id,
    'comprador_id',            f.comprador_id,
    -- quem avisar, e por qual Slack
    'avisar_facilitador',       avisar_fac,
    'facilitador',              f.nome,
    'facilitador_slack',        f.slack_user_id,
    'avisar_gerente',           avisar_ger,
    'gerente',                  ger.nome,
    'gerente_slack',            ger.slack_user_id);
end
$function$;

revoke all on function public.iniciar_solicitacao(uuid, text)              from public;
revoke all on function public.entrou_em_etapa(text, text)                  from public;
revoke all on function public.registrar_decisao(uuid, text, text, text)    from public;
grant execute on function public.iniciar_solicitacao(uuid, text)           to service_role;
grant execute on function public.entrou_em_etapa(text, text)               to service_role;
grant execute on function public.registrar_decisao(uuid, text, text, text) to service_role;
