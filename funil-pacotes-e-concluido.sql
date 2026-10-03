-- Funil (03/10): lote mensal em pacotes por gerência, etapa Concluído e itens da OC no card.
-- Já aplicado no Supabase (migração telas_31). Este arquivo é o registro.
--
-- painel_diretoria(p_token) passou a devolver, em cada pedido:
--   'lote'   → null, ou { id, competencia, estado, numero (L2610-<gerência>), gerencia_id,
--               gerencia (nome do aprovador), pacote_estado, pacote_total } — de lotes_mensais + lote_pacotes;
--   'ordens' → cada OC ganhou 'id', 'pacote' e 'itens' [{ nome, qtd, unit, total }],
--               lidos do corpo enviado ao GR (payload->'Itens').
-- A tela (painel.html) decide:
--   · Concluído = sem etapa_atual e TODAS as OCs não canceladas com situacao = 'no gr';
--   · da cotação em diante, pedidos com lote viram um card por pacote (número do lote + etapa);
--   · o valor do pedido soma as OCs vivas dele (OC de pacote não entra: é de vários pedidos).
do $do$
declare d text; d2 text;
begin
  d := pg_get_functiondef('painel_diretoria(text)'::regprocedure);
  d2 := replace(d, $a$'cancelado_em', s.cancelado_em,$a$,
$a$'cancelado_em', s.cancelado_em,
      'lote', case when s.lote_id is null then null else (
        select jsonb_build_object('id', l.id, 'competencia', l.competencia, 'estado', l.estado,
                 'numero', _oc_numero_pacote(l.competencia, coalesce(s.gerencia_id, 'sem_gerencia')),
                 'gerencia_id', coalesce(s.gerencia_id, 'sem_gerencia'),
                 'gerencia', coalesce((select ag.nome from aprovadores ag where ag.id = s.gerencia_id), 'Sem gerência'),
                 'pacote_estado', pk.estado, 'pacote_total', pk.total)
          from lotes_mensais l
          left join lote_pacotes pk on pk.lote_id = l.id and pk.gerencia_id = coalesce(s.gerencia_id, 'sem_gerencia')
         where l.id = s.lote_id) end,$a$);
  if d2 = d then raise exception 'p1'; end if; d := d2;
  d2 := replace(d, $a$'ordens', coalesce((select jsonb_agg(jsonb_build_object('situacao',o.situacao,$a$,
                   $a$'ordens', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'pacote',o.pacote,
                       'itens',(select jsonb_agg(jsonb_build_object('nome',x->>'NomeDoProduto','qtd',x->'Quantidade','unit',x->'PrecoUnitario','total',x->'ValorLiquido'))
                                  from jsonb_array_elements(case when jsonb_typeof(o.payload->'Itens') = 'array' then o.payload->'Itens' else '[]'::jsonb end) x),
                       'situacao',o.situacao,$a$);
  if d2 = d then raise exception 'p2'; end if;
  execute d2;
end $do$;
