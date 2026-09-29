-- ============================================================================
-- FILA COMPARTILHADA DO FINANCEIRO (29/09) — Wienfried, Elisângela e Isabela
-- Roda num DO que termina em erro de propósito: nada fica gravado.
-- Rodar: colar no SQL do Supabase. Saída: RESULTADO {"total":N,"passou":N,"falhas":[...]}
-- ============================================================================
do $$
declare
  res jsonb := '[]'::jsonb; tf text; tbr text; tw text; te text; ti text; tc text; tp text;
  v uuid; v2 uuid; ck uuid; r jsonb; item uuid; fam text; i_cod text; forn text; cab jsonb; total int; falhas jsonb;
begin
  select token into tf from facilitadores where id='eduarda';
  select token into tbr from aprovadores where id='a-brandao'; select token into tw from aprovadores where id='wienfried';
  select token into te from aprovadores where id='elisangela'; select token into ti from aprovadores where id='isabela';
  select token into tc from compradores where id='herisson'; select token into tp from painel_acesso where ativo limit 1;
  select codigo, familia into i_cod, fam from catalogo_itens where ativo and familia is not null order by codigo limit 1;
  select id into forn from fornecedores where ativo order by id limit 1;
  cab := jsonb_build_object('tipo_compra','normal','definicao_fornecedor','cotacao','centro_custo','1814','motivo','t','data_necessidade','2026-10-20','solicitante_nome','T');

  -- dois pedidos até o financeiro
  for k in 1..2 loop
    v := (abrir_pedido_telas(tf, cab, jsonb_build_array(jsonb_build_object('codigo',i_cod,'descricao','x','unidade','UN','quantidade',2)))->>'id')::uuid;
    select id into item from solicitacao_itens where solicitacao_id=v;
    r := decidir_pedido(tbr, v, 1, 'aprovado', null);
    r := salvar_mapa(tc, v, 0, jsonb_build_object('fornecedores', jsonb_build_array(jsonb_build_object('familia',fam,'coluna',1,'fornecedor_id',forn,'frete',0,'prazo_dias',3,'condicao','28 dias')),
          'precos', jsonb_build_array(jsonb_build_object('item_id',item,'coluna',1,'preco',100)), 'escolhas', jsonb_build_array(jsonb_build_object('item_id',item,'coluna',1))));
    r := enviar_mapa(tc, v, (r->>'versao_mapa')::int, null);
    r := decidir_pedido(tbr, v, (select versao from solicitacoes where id=v), 'aprovado', null);
    if k = 1 then v2 := v;
      res := res || jsonb_build_array(jsonb_build_object('c','Q1 gerente vê para quem foi','ok', r->>'mensagem' like '%Financeiro (Wienfried, Elisangela, Isabela)%','r',r->>'mensagem'));
    end if;
  end loop;

  res := res || jsonb_build_array(jsonb_build_object('c','Q2 os três veem o pedido na fila','ok',
     exists(select 1 from jsonb_array_elements(fila_do_aprovador(tw)->'pedidos') e where (e->>'id')::uuid=v2)
     and exists(select 1 from jsonb_array_elements(fila_do_aprovador(te)->'pedidos') e where (e->>'id')::uuid=v2)
     and exists(select 1 from jsonb_array_elements(fila_do_aprovador(ti)->'pedidos') e where (e->>'id')::uuid=v2)
     and exists(select 1 from fila_de_aprovacao(te) x where x.id=v2) and exists(select 1 from fila_de_aprovacao(ti) x where x.id=v2),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q3 a fila diz com quem é compartilhada','ok',
     (fila_do_aprovador(te)->'compartilhada_com') = '["ISABELA CANESIN","WIENFRIED MATTHIAS LEH"]'::jsonb
     and fila_do_aprovador(tbr)->>'fila_compartilhada' is null,'r',fila_do_aprovador(te)->'compartilhada_com'));
  res := res || jsonb_build_array(jsonb_build_object('c','Q4 aviso de chegada vai para os três','ok',
     (select count(*) from movimentos_compra m, jsonb_array_elements(m.detalhe->'para') p
       where m.solicitacao_id=v2 and m.acao='aprovado' and m.etapa='gerencial' and p->>'papel'='aprovador'
         and p->>'id' in ('wienfried','elisangela','isabela')) = 3,'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q5 lista 4x ao dia inclui os três','ok',
     (select count(*) from jsonb_array_elements(filas_pendentes(array['financeiro'])) x where x->>'aprovador_id' in ('wienfried','elisangela','isabela')) = 3,'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q6 telas dizem "Financeiro (…)"','ok',
     pedido_telas(tf, v2)->'pedido'->>'com_quem' = 'Financeiro (Wienfried, Elisangela, Isabela)'
     and (select x->>'aprovador_atual_nome' from jsonb_array_elements(painel_diretoria(tp)->'solicitacoes') x
           where x->>'numero'=(select numero from solicitacoes where id=v2)) like 'Financeiro (%','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q7 pedido abre com os botões para Isabela','ok',
     pedido_telas(ti, v2)->'pode'->>'decidir' = 'true' and pedido_telas(ti, v2)->'pode'->>'devolver' = 'true','r',null));
  r := decidir_pedido(tbr, v2, (select versao from solicitacoes where id=v2), 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','Q8 quem não é do financeiro não decide','ok', r->>'erro'='nao_e_a_vez','r',r));

  -- Isabela aprova; Wienfried e Elisângela chegam depois
  r := decidir_pedido(ti, v2, (select versao from solicitacoes where id=v2), 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','Q9 basta uma aprovação','ok', r->>'ok'='true' and (select status from solicitacoes where id=v2)='aprovado','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','Q10 fica registrado quem aprovou','ok',
     (select decidido_por from decisoes where solicitacao_id=v2 and etapa='financeiro')='ISABELA CANESIN'
     and exists (select 1 from movimentos_compra where solicitacao_id=v2 and acao='aprovado' and etapa='financeiro' and quem_id='isabela'),'r',null));
  r := decidir_pedido(tw, v2, (select versao from solicitacoes where id=v2), 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','Q11 quem chega depois sabe quem decidiu','ok',
     r->>'erro'='ja_decidido_pelo_grupo' and r->>'mensagem' like 'Isabela já aprovou este pedido às %','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','Q12 some da fila dos outros','ok',
     not exists(select 1 from jsonb_array_elements(fila_do_aprovador(te)->'pedidos') e where (e->>'id')::uuid=v2),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q13 histórico: todos veem quem decidiu','ok',
     (select h.decidido_por||'|'||h.fui_eu from historico_de_aprovacoes(te, 60) h where h.id=v2 and h.etapa='financeiro')='ISABELA CANESIN|false'
     and (select h.decidido_por||'|'||h.fui_eu from historico_de_aprovacoes(ti, 60) h where h.id=v2 and h.etapa='financeiro')='ISABELA CANESIN|true'
     and (select h.decidido_por||'|'||h.fui_eu from historico_de_aprovacoes(tw, 60) h where h.id=v2 and h.etapa='financeiro')='ISABELA CANESIN|false','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q14 histórico de fora do grupo não mostra o financeiro','ok',
     not exists(select 1 from historico_de_aprovacoes(tbr, 60) h where h.id=v2 and h.etapa='financeiro'),'r',null));

  -- Elisângela devolve o outro; Wienfried chega depois
  r := decidir_pedido(te, v, (select versao from solicitacoes where id=v), 'devolvido', 'Rever frete');
  res := res || jsonb_build_array(jsonb_build_object('c','Q15 devolver também é de qualquer um','ok', r->>'ok'='true','r',r));
  r := decidir_pedido(tw, v, (select versao from solicitacoes where id=v), 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','Q16 e quem chega depois é avisado','ok', r->>'mensagem' like 'Elisangela já devolveu ao comprador%','r',r));

  -- ClickUp continua só com o Wienfried
  select id into ck from solicitacoes where canal='clickup' limit 1;
  update solicitacoes set etapa_atual='financeiro', aprovador_atual='wienfried' where id=ck;
  res := res || jsonb_build_array(jsonb_build_object('c','Q17 ClickUp no financeiro: só o Wienfried vê e decide','ok',
     exists(select 1 from fila_de_aprovacao(tw) x where x.id=ck) and not exists(select 1 from fila_de_aprovacao(te) x where x.id=ck)
     and not exists(select 1 from fila_de_aprovacao(ti) x where x.id=ck)
     and decisao_permitida(te, ck, 'financeiro', null, null)->>'ok' = 'false'
     and pedido_telas(te, ck)->>'erro' = 'sem_acesso','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q18 aprovador de teste com etapa financeiro fica fora do grupo','ok',
     not exists(select 1 from aprovadores where fila_compartilhada='financeiro' and id not in ('wienfried','elisangela','isabela')),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','Q19 /compras aprovação reconhece as duas','ok',
     (aprovador_do_slack('U0C23S63US1')->>'achou')='true' and (aprovador_do_slack('U0C33002A2C')->>'achou')='true','r',null));

  select count(*) into total from jsonb_array_elements(res);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into falhas from jsonb_array_elements(res) x where (x->>'ok')::boolean is not true;
  raise exception 'RESULTADO %', jsonb_build_object('total', total, 'passou', total - jsonb_array_length(falhas), 'falhas', falhas);
end $$;
