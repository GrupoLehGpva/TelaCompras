-- 06/10: a reprovação (etapa, quem, quando, motivo) passa a vir em abrir_pedido,
-- para aparecer no pedido aberto. A lista de Reprovadas do aprovador mostra só
-- a etapa em que o pedido foi reprovado, sem o motivo embaixo.
-- Aplicado no Supabase pela migração abrir_pedido_reprovacao.
do $$
declare d text; n text;
  alvo text := '''anexos'', coalesce((';
begin
  d := pg_get_functiondef('public.abrir_pedido(uuid,text)'::regprocedure);
  if position('''reprovacao''' in d) > 0 then return; end if;
  if (length(d)-length(replace(d,alvo,'')))/length(alvo) <> 1 then raise exception 'alvo'; end if;
  n := replace(d, alvo, $x$'reprovacao', case when s.status = 'reprovado' then coalesce(
      (select jsonb_build_object('etapa', d.etapa, 'por', d.decidido_por, 'em', d.decidido_em, 'motivo', d.motivo)
         from decisoes d where d.solicitacao_id = s.id and d.resposta = 'reprovado'
        order by d.decidido_em desc nulls last limit 1),
      (select jsonb_build_object('etapa', m.etapa, 'por', m.quem_nome, 'em', m.em, 'motivo', m.motivo)
         from movimentos_compra m where m.solicitacao_id = s.id and m.acao = 'reprovado'
        order by m.em desc limit 1)) end,
    $x$ || alvo);
  execute n;
end $$;
