-- ============================================================================
-- QUEM PEDE TAMBÉM PODE SER QUEM APROVA  (item 10, 15/09/2026)
--
-- Até aqui todo pedido nascia em `lider`. Com liderança, gerência e o
-- financeiro podendo abrir pedido, a primeira etapa às vezes não existe.
--
-- A regra, decidida pela Elisabeth:
--
--   facilitador comum  →  liderança imediata → cotação → gerencial → financeiro
--   líder              →                       cotação → gerencial → financeiro
--   gerente            →                       cotação → gerencial (ELE MESMO) → financeiro
--   financeiro         →                       cotação →                         financeiro (ELE MESMO)
--
-- Ou seja: a liderança imediata só existe para quem NÃO é aprovador, e a
-- gerencial só desaparece para o financeiro.
--
-- O gerente aprovar o próprio orçamento é decisão dela, não descuido. Fica
-- escrito aqui porque é exatamente a exceção que a trava de "ninguém decide o
-- que não é seu" apontaria — e sem esta linha, alguém vai "consertar" isso.
--
-- ARMADILHA ENCONTRADA AO CONSTRUIR: o aprovador de demonstração
-- (`teste-elisabeth`) estava cadastrado com o e-mail da Elisabeth de verdade.
-- Como o vínculo entre solicitante e aprovador também casa por e-mail, ela era
-- classificada como 'financeiro' — e todo pedido dela pularia as duas primeiras
-- aprovações, em silêncio. O e-mail do ensaio foi trocado. Dado de mentira
-- vestindo identidade de gente real não é inofensivo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Quem está pedindo
--
-- Slack primeiro (vem do comando, não é digitado), e-mail depois. Estava
-- escrito dentro de iniciar_solicitacao; virou função porque criar_solicitacao
-- passou a precisar da mesma resposta — e duas cópias da mesma busca é como as
-- duas metades acabam respondendo coisas diferentes.
-- ---------------------------------------------------------------------------
create or replace function public.facilitador_de(p_slack text, p_email text)
returns text
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_id text;
begin
  if nullif(trim(coalesce(p_slack, '')), '') is not null then
    select id into v_id from facilitadores where slack_user_id = p_slack and ativo limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null then
    select id into v_id from facilitadores where lower(email) = lower(p_email) and ativo limit 1;
  end if;
  return v_id;
end
$function$;

-- ---------------------------------------------------------------------------
-- 2. O papel de quem pede
--
-- Vem de `aprovadores.etapas`, que já existia. Nenhuma coluna nova: quem tem
-- 'financeiro' é o financeiro, quem tem 'gerencial' é gerente, quem só tem
-- 'lider' é líder, e quem não está na tabela é solicitante comum.
--
-- A ligação entre a linha de solicitante e a de aprovador é por id, slack ou
-- e-mail. Por que os três: casar só por id parece bastar, porque as linhas
-- foram criadas com o mesmo id — mas basta alguém cadastrar o Brandão como
-- 'brandao' em vez de 'a-brandao' para o vínculo sumir em silêncio, e o pedido
-- dele voltar a cair na própria fila de liderança.
-- ---------------------------------------------------------------------------
create or replace function public.papel_do_solicitante(p_facilitador_id text)
returns text
language plpgsql stable security definer set search_path to 'public'
as $function$
declare f facilitadores%rowtype; v_etapas text[];
begin
  if nullif(trim(coalesce(p_facilitador_id, '')), '') is null then return 'comum'; end if;
  select * into f from facilitadores where id = p_facilitador_id;
  if f.id is null then return 'comum'; end if;

  select a.etapas into v_etapas from aprovadores a
   where a.ativo
     and ( a.id = f.id
        or (nullif(a.slack_user_id, '') is not null and a.slack_user_id = f.slack_user_id)
        or (nullif(a.email, '')        is not null and lower(a.email)   = lower(f.email)) )
   limit 1;

  if v_etapas is null then return 'comum'; end if;
  if 'financeiro' = any(v_etapas) then return 'financeiro'; end if;
  if 'gerencial'  = any(v_etapas) then return 'gerente';    end if;
  return 'lider';
end
$function$;

-- ---------------------------------------------------------------------------
-- 3. Onde o pedido nasce
--
-- Uma função só, usada pelo banco E pelo n8n — e não duas cópias da mesma
-- regra, que é como o número da solicitação acabou sendo sorteado no navegador
-- durante meses.
-- ---------------------------------------------------------------------------
create or replace function public.etapa_inicial(p_facilitador_id text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_papel text := papel_do_solicitante(p_facilitador_id);
begin
  if v_papel = 'comum' then
    return jsonb_build_object('papel', v_papel, 'etapa', 'lider',
      'coluna', 'liderança imediata', 'pulou', false, 'motivo', null);
  end if;
  return jsonb_build_object('papel', v_papel, 'etapa', 'cotacao',
    'coluna', 'compras · cotação', 'pulou', true,
    'motivo', case v_papel
      when 'lider'      then 'quem pediu é a própria liderança imediata'
      when 'gerente'    then 'quem pediu é o próprio gerente'
      when 'financeiro' then 'quem pediu é o próprio aprovador financeiro'
    end);
end
$function$;

revoke all on function public.facilitador_de(text, text)     from public;
revoke all on function public.papel_do_solicitante(text)     from public;
revoke all on function public.etapa_inicial(text)            from public;
grant execute on function public.facilitador_de(text, text)  to service_role;
grant execute on function public.papel_do_solicitante(text)  to service_role;
grant execute on function public.etapa_inicial(text)         to service_role;

-- ---------------------------------------------------------------------------
-- 4. Os aprovadores viram também solicitantes
--
-- Mesmo id da linha de aprovador, de propósito: é o que amarra os dois
-- cadastros à mesma pessoa.
--
-- `superior_id` aponta para a própria pessoa em todos. A 1ª etapa deles nunca é
-- lida (etapa_inicial pula), mas deixar o campo apontando para si mesmo diz na
-- própria linha "ele é o próprio líder" em vez de deixar um nulo sem história.
--
-- `gerente_id` de Fábio, Jaciel e Jamil → Edilson. Deduzido do cadastro: toda
-- pessoa que já se reportou aos três tem Edilson como gerente. Confirmado pela
-- Elisabeth em 15/09.
-- ---------------------------------------------------------------------------
insert into facilitadores
  (id, nome, email, slack_user_id, gerencia, setor, unidade,
   superior_id, gerente_id, financeiro_id, comprador_id, token, ativo)
select a.id, a.nome, a.email, a.slack_user_id, c.gerencia, c.gerencia, c.gerencia,
       a.id, c.gerente, 'wienfried', c.comprador,
       'fc-' || replace(gen_random_uuid()::text, '-', ''), true
from aprovadores a
join (values
  ('fabio',     'edilson',   'Agrícola e Pecuária', 'herisson'),
  ('jaciel',    'edilson',   'Agrícola e Pecuária', 'herisson'),
  ('jamil',     'edilson',   'Agrícola e Pecuária', 'herisson'),
  ('a-brandao', 'a-brandao', 'Administrativa',      'herisson'),
  ('edilson',   'edilson',   'Suinocultura',        'herisson'),
  ('elton',     'elton',     'Agrícola Piauí',      'herisson'),
  ('junior',    'junior',    'Agrícola e Pecuária', 'herisson'),
  ('wienfried', 'wienfried', 'Diretoria',           'herisson')
) as c(id, gerente, gerencia, comprador) on c.id = a.id
where a.ativo
on conflict (id) do nothing;

-- O e-mail do aprovador de ensaio, que colidia com o da Elisabeth de verdade.
update aprovadores set email = 'ensaio@leh.com.br', atualizado_em = now()
 where id = 'teste-elisabeth' and lower(email) = 'elisabeth@leh.com.br';

-- ---------------------------------------------------------------------------
-- 5. iniciar_solicitacao e entrou_em_etapa perguntam à mesma etapa_inicial
--
-- O corpo completo das duas está no banco; aqui fica o que muda:
--
--   iniciar_solicitacao  →  se etapa_inicial diz 'lider', segue como sempre.
--                           Senão: etapa_atual = 'cotacao', aprovador_atual
--                           NULO (em cotação o pedido não espera decisão de
--                           ninguém, espera o comprador — deixar um aprovador
--                           ali faria o pedido aparecer numa fila onde não há
--                           nada a decidir), status 'em cotacao'.
--
--   entrou_em_etapa      →  pedido de 'gerencial' vira 'financeiro' quando o
--                           solicitante é o próprio financeiro, e a resposta
--                           traz `pulou: true` + a coluna certa, para o n8n
--                           levar o card adiante. Deixar isso por conta de um
--                           comentário que o comprador teria de ler seria uma
--                           regra que depende de memória humana.
-- ---------------------------------------------------------------------------
