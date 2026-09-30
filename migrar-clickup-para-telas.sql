-- ============================================================================
-- MIGRAÇÃO DOS PEDIDOS ABERTOS DO CLICKUP PARA AS TELAS (preparada em 30/09)
-- Rodar SÓ na ordem do Guilherme, depois da virada (roteiro: compras-virada-quinta-01-10.md).
--
-- Os 6 pedidos entram na Mesa do Herisson, na cotação:
--   · 3 que estavam na cotação (C2609-00017, 00018, 00022): continuam na cotação.
--   · 3 que estavam na aprovação gerencial (C2609-00003, 00019, 00020): a cotação
--     deles foi feita na planilha e o orçamento está no card do ClickUp. Voltam
--     para a Mesa para o Herisson montar o mapa (fornecedor do cadastro, preço,
--     frete, prazo, condição) e anexar o orçamento. Sem isso o aprovador não vê o
--     comparativo nas telas e a ordem de compra no GR não tem de onde sair.
--
-- O que muda em cada pedido: canal 'telas', card_id nulo (o botão antigo do
-- Slack/ClickUp passa a recusar: "card não confere"), etapa cotação.
-- O histórico é refeito em movimentos_compra (aberto, aprovado na liderança e,
-- para os 3 da gerencial, cotação pela planilha + volta à Mesa), todos marcados
-- como já avisados: ninguém recebe DM por causa da migração.
-- O número do card antigo fica em detalhe->'card_clickup' do primeiro movimento.
-- ============================================================================
do $$
declare
  alvo text[] := array['C2609-00003','C2609-00017','C2609-00018','C2609-00019','C2609-00020','C2609-00022'];
  s record; d record; n int; v_fac text; v_ger boolean; v_quando timestamptz;
begin
  select count(*) into n from solicitacoes
   where numero = any(alvo) and canal = 'clickup' and etapa_atual in ('cotacao','gerencial') and card_id is not null;
  if n <> array_length(alvo, 1) then
    raise exception 'Esperava % pedidos do ClickUp abertos, achei %. Nada foi migrado.', array_length(alvo, 1), n;
  end if;

  for s in select * from solicitacoes where numero = any(alvo) order by numero for update loop
    select nome into v_fac from facilitadores where id = s.facilitador_id;
    select * into d from decisoes where solicitacao_id = s.id and etapa = 'lider';
    v_ger := (s.etapa_atual = 'gerencial');

    insert into movimentos_compra (solicitacao_id, numero, acao, etapa, etapa_seguinte, quem_tipo, quem_id, quem_nome,
                                   motivo, detalhe, versao, em, avisar, avisado_em)
    values (s.id, s.numero, 'criado', null, 'lider', 'facilitador', s.facilitador_id, coalesce(v_fac, s.facilitador),
            null, jsonb_build_object('card_clickup', s.card_id, 'migrado_em', now(), 'para', '[]'::jsonb), s.versao, s.aberto_em, false, now());

    insert into movimentos_compra (solicitacao_id, numero, acao, etapa, etapa_seguinte, quem_tipo, quem_id, quem_nome,
                                   motivo, detalhe, versao, em, avisar, avisado_em)
    values (s.id, s.numero, 'aprovado', 'lider', 'cotacao', 'aprovador', d.aprovador_id, d.decidido_por,
            d.motivo, jsonb_build_object('para', '[]'::jsonb), s.versao, coalesce(d.decidido_em, s.aberto_em), false, now());

    if v_ger then
      v_quando := coalesce(s.cotacao_em, s.planilha_em, d.decidido_em, s.aberto_em);
      insert into movimentos_compra (solicitacao_id, numero, acao, etapa, etapa_seguinte, quem_tipo, quem_id, quem_nome,
                                     motivo, detalhe, versao, em, avisar, avisado_em)
      values (s.id, s.numero, 'cotacao_enviada', 'cotacao', 'gerencial', 'comprador', 'herisson',
              (select nome from compradores where id = 'herisson'),
              'Cotado na planilha, pelo ClickUp.',
              jsonb_build_object('total', s.valor_cotado, 'fornecedores', s.fornecedor_cotado, 'para', '[]'::jsonb),
              s.versao, v_quando, false, now());
      insert into movimentos_compra (solicitacao_id, numero, acao, etapa, etapa_seguinte, quem_tipo, quem_id, quem_nome,
                                     motivo, detalhe, versao, em, avisar, avisado_em)
      values (s.id, s.numero, 'devolvido', 'gerencial', 'cotacao', 'sistema', 'migracao', 'Migração para as telas',
              'Pedido trazido do ClickUp. Monte o mapa da cotação na Mesa e anexe o orçamento'
                || case when s.valor_cotado is not null
                        then ' (na planilha: ' || coalesce(s.fornecedor_cotado, '—') || ', R$ '
                             || replace(replace(replace(to_char(s.valor_cotado, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || ')'
                        else '' end || '.',
              jsonb_build_object('para', '[]'::jsonb), s.versao, now(), false, now());
    end if;

    update solicitacoes
       set canal = 'telas', card_id = null,
           etapa_atual = 'cotacao', status = 'em cotacao', aprovador_atual = null, decidido_em = null,
           entrou_na_etapa_em = case when v_ger then now() else coalesce(s.entrou_na_etapa_em, d.decidido_em, s.aberto_em) end
     where id = s.id;
  end loop;
end $$;
