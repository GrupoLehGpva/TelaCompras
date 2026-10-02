-- ============================================================================
-- LIMPEZA DO TESTE DA COMPRA MENSAL C2610-00014 e do lote 10/2026 criado para ele
-- NÃO RODAR antes de o teste terminar. Rodar inteiro de uma vez (é uma transação).
-- Trava: só apaga se o lote tiver APENAS este pedido; se entrou pedido real, para tudo.
-- ============================================================================
begin;

do $$
declare
  v_ped uuid := '697ff24c-fd17-44b2-9432-94a0972d7fc3';  -- C2610-00014
  v_lote uuid := 'ee7e919d-871f-4c45-87be-45c83669d694'; -- lote 10/2026
  n int;
begin
  if not exists (select 1 from solicitacoes where id = v_ped and numero = 'C2610-00014') then
    raise exception 'Pedido C2610-00014 não encontrado (já foi apagado?)';
  end if;
  select count(*) into n from solicitacoes where lote_id = v_lote and id <> v_ped;
  if n > 0 then
    raise exception 'PARADO: o lote tem % pedido(s) além do teste. Não apagar o lote.', n;
  end if;

  -- 1) rastros do lote (sem cascata)
  delete from lote_rateio            where lote_id = v_lote or solicitacao_id = v_ped;
  delete from lote_pacotes           where lote_id = v_lote;
  delete from lote_mapa_escolhas     where lote_id = v_lote;
  delete from lote_mapa_precos       where lote_id = v_lote;
  delete from lote_mapa_fornecedores where lote_id = v_lote;
  delete from lote_mapa              where lote_id = v_lote;

  -- 2) mapa de cotação do pedido (tabelas sem FK)
  delete from mapa_escolhas     where solicitacao_id = v_ped;
  delete from mapa_precos       where solicitacao_id = v_ped;
  delete from mapa_fornecedores where solicitacao_id = v_ped;

  -- 3) o pedido (itens, decisões, movimentos, cotações, anexos, cortes, OC e mapa_cotacao vão em cascata)
  delete from solicitacoes where id = v_ped;

  -- 4) o lote
  delete from lotes_mensais where id = v_lote;
end $$;

-- conferência: tudo deve dar 0
select
  (select count(*) from solicitacoes      where numero = 'C2610-00014') pedido,
  (select count(*) from decisoes          where numero = 'C2610-00014') decisoes,
  (select count(*) from movimentos_compra where numero = 'C2610-00014') movimentos,
  (select count(*) from lotes_mensais     where id = 'ee7e919d-871f-4c45-87be-45c83669d694') lote;

commit;
