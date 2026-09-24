-- REPROVAR COMPRA COM MOTIVO — pelo comprador, na etapa de cotação.
--
-- Por que isto existe: em 24/09 o Herisson precisou barrar a C2609-00012 (o
-- facilitador tinha esquecido um item) e o único caminho que ele tinha era
-- arrastar o card para "reprovado" na mão. Arrastar card não decide nada: o
-- banco continuou achando que o pedido esperava o gerente, e as duas verdades
-- se separaram. A correção não é avisar para não arrastar — é dar ao comprador
-- a mesma porta que o aprovador já tem, com motivo obrigatório e rastro.
--
-- Três mudanças, todas ampliando o que já existia. Nada do caminho do
-- aprovador muda de comportamento.

-- ---------------------------------------------------------------------------
-- 1. A etapa de cotação passa a caber no livro de decisões.
--    O CHECK aceitava 'compras' (nome antigo) mas não 'cotacao', que é o valor
--    que `solicitacoes.etapa_atual` usa desde sempre. Sem isto, gravar a
--    reprovação do comprador estouraria no INSERT — depois de o card já ter
--    andado. Exatamente o descasamento que se quer eliminar.
-- ---------------------------------------------------------------------------
alter table public.decisoes drop constraint if exists decisoes_etapa_check;
alter table public.decisoes add constraint decisoes_etapa_check
  check (etapa = any (array['lider','compras','cotacao','gerencial','financeiro']));

-- ---------------------------------------------------------------------------
-- 2. decisao_permitida: o comprador também é alguém que decide.
--    A função continua sendo a autoridade única — o n8n não ganhou regra nova,
--    ganhou uma resposta nova. Se o token não é de aprovador, procura em
--    compradores; e aí a permissão é estreita de propósito:
--      · só na etapa 'cotacao'
--      · só enquanto o pedido está de fato lá
--      · e só para reprovar (o `so_reprova` que o fluxo obedece)
--    Comprador não aprova compra: quem aprova é a alçada.
-- ---------------------------------------------------------------------------
create or replace function public.decisao_permitida(
  p_token          text,
  p_solicitacao_id uuid,
  p_card_id        text,
  p_etapa          text,
  p_fluxo          text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a       aprovadores%rowtype;
  c       compradores%rowtype;
  s       solicitacoes%rowtype;
  v_fluxo text;
  v_papel text;
  v_id    text;
  v_nome  text;
begin
  select * into a from aprovadores where token = p_token and ativo;

  if found then
    v_papel := 'aprovador'; v_id := a.id; v_nome := a.nome;
    if p_etapa is null or not (p_etapa = any(a.etapas)) then
      return jsonb_build_object('ok', false, 'erro', 'etapa_nao_e_dele',
        'mensagem', 'Você não aprova nesta etapa.', 'aprovador', a.id);
    end if;
  else
    select * into c from compradores where token = p_token and ativo;
    if not found then
      return jsonb_build_object('ok', false, 'erro', 'token_invalido',
        'mensagem', 'Este link de aprovação não vale mais.');
    end if;
    v_papel := 'comprador'; v_id := c.id; v_nome := c.nome;
    if p_etapa is distinct from 'cotacao' then
      return jsonb_build_object('ok', false, 'erro', 'etapa_nao_e_dele',
        'mensagem', 'O comprador decide na cotação — nas outras etapas quem decide é a alçada.',
        'aprovador', c.id, 'papel', 'comprador');
    end if;
  end if;

  select * into s from solicitacoes where id = p_solicitacao_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente',
      'mensagem', 'Solicitação não encontrada.', 'aprovador', v_id, 'papel', v_papel);
  end if;

  v_fluxo := fluxo_da_compra(s.tipo_compra);

  -- A porta certa para o fluxo certo.
  if p_fluxo is not null and v_fluxo is distinct from p_fluxo then
    return jsonb_build_object('ok', false, 'erro', 'fluxo_errado',
      'mensagem', case when v_fluxo = 'mensal'
        then 'Esta é uma compra mensal: ela é decidida pelo fluxo das compras mensais.'
        else 'Esta compra não é mensal: ela é decidida pelo fluxo normal.' end,
      'aprovador', v_id, 'papel', v_papel, 'fluxo', v_fluxo, 'fluxo_da_porta', p_fluxo);
  end if;

  if coalesce(s.card_id, '') = '' or s.card_id is distinct from p_card_id then
    return jsonb_build_object('ok', false, 'erro', 'card_nao_confere',
      'mensagem', 'O card informado não é o desta solicitação.',
      'aprovador', v_id, 'papel', v_papel);
  end if;

  -- A vez é dele? Para o aprovador, a linha diz o nome. Para o comprador, a
  -- etapa basta: a cotação não tem dono nomeado na solicitação.
  if v_papel = 'aprovador' then
    if s.aprovador_atual is distinct from a.id or s.etapa_atual is distinct from p_etapa then
      return jsonb_build_object('ok', false, 'erro', 'nao_e_a_vez',
        'mensagem', 'Esta solicitação não está esperando a sua aprovação.',
        'aprovador', a.id, 'papel', v_papel,
        'etapa_atual', s.etapa_atual, 'aprovador_atual', s.aprovador_atual);
    end if;
  else
    if s.etapa_atual is distinct from 'cotacao' then
      return jsonb_build_object('ok', false, 'erro', 'nao_e_a_vez',
        'mensagem', 'Esta solicitação não está na cotação.',
        'aprovador', c.id, 'papel', v_papel, 'etapa_atual', s.etapa_atual);
    end if;
  end if;

  if s.decidido_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'ja_decidida',
      'mensagem', 'Esta solicitação já foi decidida.', 'aprovador', v_id, 'papel', v_papel);
  end if;

  return jsonb_build_object('ok', true,
    'aprovador', v_id, 'aprovador_nome', v_nome,
    'papel', v_papel, 'so_reprova', (v_papel = 'comprador'),
    'numero', s.numero, 'card_id', s.card_id, 'etapa', s.etapa_atual,
    'fluxo', v_fluxo, 'tipo_compra', s.tipo_compra);
end
$function$;

revoke all on function public.decisao_permitida(text, uuid, text, text, text) from public;
grant execute on function public.decisao_permitida(text, uuid, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. registrar_decisao: quem decidiu pode ser um comprador.
--    Só isto muda. O roteamento, o rastro e os avisos continuam iguais — e a
--    reprovação na cotação cai na regra que já existia ("reprovou fora do
--    financeiro, avisa quem pediu"), que é exatamente o desejado.
--    `aprovador_id` continua guardando só aprovador: o nome de quem decidiu
--    vive em `decidido_por`, que serve para os dois papéis.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_decisao(
  p_id        uuid,
  p_etapa     text,
  p_decisao   text,
  p_motivo    text default null,
  p_aprovador text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s          solicitacoes%rowtype;
  f          facilitadores%rowtype;
  quem       aprovadores%rowtype;
  comp       compradores%rowtype;
  passo      jsonb;
  prox_etapa text;
  prox_aprov text;
  v_status   text;
  a          aprovadores%rowtype;
  ger        aprovadores%rowtype;
  avisar_fac boolean := false;
  avisar_ger boolean := false;
  v_quem_id    text;
  v_quem_nome  text;
  v_quem_slack text;
  v_quem_papel text := 'aprovador';
begin
  select * into s from solicitacoes where id = p_id;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente');
  end if;
  select * into f from facilitadores where id = s.facilitador_id;

  -- Quem assina esta decisão. Aprovador primeiro; se o id não for de
  -- aprovador, é o comprador da cotação.
  select * into quem from aprovadores where id = coalesce(p_aprovador, s.aprovador_atual);
  if found then
    v_quem_id := quem.id; v_quem_nome := quem.nome; v_quem_slack := quem.slack_user_id;
  else
    select * into comp from compradores where id = p_aprovador;
    if found then
      v_quem_papel := 'comprador';
      v_quem_nome  := comp.nome; v_quem_slack := comp.slack_user_id;
      v_quem_id    := null;   -- decisoes.aprovador_id é para aprovador
    end if;
  end if;

  passo := passo_da_compra(s.tipo_compra, p_etapa, p_decisao);
  if passo ? 'erro' then
    return jsonb_build_object('ok', false, 'erro', passo->>'erro',
      'decisao', p_decisao, 'etapa', p_etapa, 'fluxo', passo->>'fluxo');
  end if;

  prox_etapa := passo->>'etapa';
  v_status   := passo->>'status';
  prox_aprov := case passo->>'quem'
                  when 'gerente'    then f.gerente_id
                  when 'financeiro' then f.financeiro_id
                  else null end;

  if p_decisao = 'reprovado' then
    -- Reprovação no financeiro sobe para o gerente; nas outras, volta para quem pediu.
    if p_etapa = 'financeiro' then avisar_ger := true; else avisar_fac := true; end if;
  end if;

  update solicitacoes
     set etapa_atual     = prox_etapa,
         aprovador_atual = prox_aprov,
         status          = v_status,
         decidido_em     = case when prox_etapa is null then now() else null end
   where id = s.id;

  -- O rastro. Uma linha por decisão, e nunca duas para a mesma etapa.
  insert into decisoes (id, solicitacao_id, numero, etapa, resposta, motivo,
                        aprovador_id, decidido_por, decidido_por_slack_id, decidido_em)
  values (gen_random_uuid(), s.id, s.numero, p_etapa, p_decisao,
          nullif(trim(p_motivo), ''), v_quem_id, v_quem_nome, v_quem_slack, now());

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
    'coluna',   passo->>'coluna',
    'fluxo',    passo->>'fluxo',
    'tipo_compra', s.tipo_compra,
    'motivo',   p_motivo,
    'decidido_por',            v_quem_nome,
    'decidido_por_papel',      v_quem_papel,
    'proximo_aprovador',       a.id,
    'proximo_aprovador_nome',  a.nome,
    'proximo_aprovador_slack', a.slack_user_id,
    'comprador_id',            f.comprador_id,
    'avisar_facilitador',       avisar_fac,
    'facilitador',              f.nome,
    'facilitador_slack',        f.slack_user_id,
    'avisar_gerente',           avisar_ger,
    'gerente',                  ger.nome,
    'gerente_slack',            ger.slack_user_id);
end
$function$;

-- ---------------------------------------------------------------------------
-- 4. O link tem que chegar nele.
--    Poder reprovar não serve de nada se o botão não existe em lugar nenhum
--    que o Herisson abra. O link dele é pessoal (traz o token), então NÃO vai
--    para o card — vai por DM, no momento em que o pedido cai na cotação.
--    Só service_role executa: é a única função do sistema que devolve token.
-- ---------------------------------------------------------------------------
create or replace function public.aviso_de_cotacao(p_solicitacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s    solicitacoes%rowtype;
  f    facilitadores%rowtype;
  c    compradores%rowtype;
  link text;
  itens int;
begin
  select * into s from solicitacoes where id = p_solicitacao_id;
  if not found then
    return jsonb_build_object('avisar', false, 'erro', 'solicitacao_inexistente');
  end if;
  if s.etapa_atual is distinct from 'cotacao' then
    return jsonb_build_object('avisar', false, 'erro', 'nao_esta_na_cotacao',
      'etapa_atual', s.etapa_atual);
  end if;

  select * into f from facilitadores where id = s.facilitador_id;
  if f.comprador_id is null then
    return jsonb_build_object('avisar', false, 'erro', 'facilitador_sem_comprador');
  end if;
  select * into c from compradores where id = f.comprador_id and ativo;
  if not found or coalesce(c.slack_user_id, '') = '' then
    return jsonb_build_object('avisar', false, 'erro', 'comprador_sem_slack',
      'comprador_id', f.comprador_id);
  end if;

  select count(*) into itens from solicitacao_itens i where i.solicitacao_id = s.id;

  link := 'https://grupolehgpva.github.io/TelaCompras/pedido.html?id='
          || s.id::text || '&t=' || c.token;

  return jsonb_build_object(
    'avisar', true,
    'slack',  c.slack_user_id,
    'comprador', c.nome,
    'numero', s.numero,
    'texto',
      '🛒 *' || s.numero || ' chegou para cotar*' || chr(10)
      || 'Pedido de ' || coalesce(f.nome, 'um facilitador')
      || ' · ' || itens || case when itens = 1 then ' item' else ' itens' end
      || case when s.tipo_compra = 'urgente' then ' · *urgente*' else '' end
      || coalesce(chr(10) || '_' || s.motivo || '_', '') || chr(10) || chr(10)
      || '📋 ' || link || chr(10) || chr(10)
      || 'Esse link é seu e mostra o pedido inteiro. Se a compra não deve seguir '
      || '(item faltando, pedido errado, já tem em estoque), use o botão '
      || '*Reprovar compra* na própria tela e escreva o motivo — quem pediu recebe '
      || 'o aviso e o card vai para _reprovado_ sozinho. Não arraste o card na mão: '
      || 'arrastar não avisa ninguém e deixa o sistema fora de sincronia.'
  );
end
$function$;

revoke all on function public.aviso_de_cotacao(uuid) from public;
grant execute on function public.aviso_de_cotacao(uuid) to service_role;
