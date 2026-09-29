-- ============================================================================
-- TODOS OS FACILITADORES × OS 3 TIPOS DE COMPRA, NO BANCO DE VERDADE (29/09)
-- Roda dentro de um DO que termina em erro de propósito: NADA fica gravado,
-- nenhum número é consumido, nenhum aviso sai.
--
-- Para cada facilitador ativo e cada tipo (normal, urgente, mensal):
--   abre o pedido → em cada etapa confere que o pedido está na fila de quem
--   tem de agir e na coluna certa do funil → clica o botão (aprovar / cotar e
--   enviar) → segue até aprovar. Depois da cotação, confere que o aprovador vê
--   o fornecedor e o valor. Também: quem não é facilitador não abre pedido.
-- ============================================================================
do $$
declare
  res jsonb := '[]'::jsonb;     -- falhas
  seqs jsonb := '{}'::jsonb;    -- caminho percorrido, por tipo
  f record; s record; tipo text; r jsonb; r2 jsonb; p jsonb;
  cab jsonb; itens jsonb; v uuid; seq text; passos int; tok text; ct text;
  item uuid; fam text; forn text; forn_nome text; n int := 0; mver int;
  tp text; i_cod text; t text; total_fluxos int := 0; aprovados int := 0;
  depois_cotacao boolean; viu_valor int := 0; checou_valor int := 0;
  funil_ok int := 0; funil_checks int := 0;
begin
  select token into tp from painel_acesso where ativo limit 1;
  select codigo, familia into i_cod, fam from catalogo_itens where ativo and familia is not null order by codigo limit 1;
  itens := jsonb_build_array(jsonb_build_object('codigo', i_cod, 'descricao', 'Item de teste', 'unidade', 'UN', 'quantidade', 2));

  -- ------------------------------------------------ quem NÃO é facilitador
  for t in
    select token from aprovadores where token is not null
    union all select token from compradores where token is not null
    union all select token from painel_acesso
    union all select unnest(array['', 'fc-inventado', 'x', 'fc-']) loop
    r := abrir_pedido_telas(t, jsonb_build_object('tipo_compra','normal','definicao_fornecedor','cotacao','centro_custo','1814',
           'motivo','teste','data_necessidade','2026-10-20','solicitante_nome','X'), itens);
    if coalesce(r->>'ok','') = 'true' then
      res := res || jsonb_build_array('NÃO-FACILITADOR ABRIU PEDIDO com token ' || left(t, 3) || '…');
    end if;
  end loop;
  r := abrir_pedido_telas(null, '{}'::jsonb, itens);
  if coalesce(r->>'ok','') = 'true' then res := res || '["token nulo abriu pedido"]'::jsonb; end if;

  -- facilitador desligado (ativo = false) também não abre
  update facilitadores set ativo = false where id = 'eduarda';
  r := abrir_pedido_telas((select token from facilitadores where id='eduarda'),
         jsonb_build_object('tipo_compra','normal','definicao_fornecedor','cotacao','centro_custo','1814',
           'motivo','teste','data_necessidade','2026-10-20','solicitante_nome','X'), itens);
  if coalesce(r->>'ok','') = 'true' then res := res || '["facilitador desligado abriu pedido"]'::jsonb; end if;
  update facilitadores set ativo = true where id = 'eduarda';

  -- ------------------------------------------------ todos os facilitadores
  for f in select * from facilitadores where ativo order by id loop
    foreach tipo in array array['normal','urgente','mensal','unico'] loop
      n := n + 1;
      cab := jsonb_build_object('tipo_compra', case when tipo='unico' then 'normal' else tipo end,
               'definicao_fornecedor', case when tipo='unico' then 'unico' else 'cotacao' end,
               'justificativa_fornecedor', case when tipo='unico' then 'Só ele atende' end,
               'centro_custo', '1814', 'motivo', 'Teste ' || f.id || ' ' || tipo,
               'data_necessidade', '2026-10-20', 'solicitante_nome', 'Teste');
      r := abrir_pedido_telas(f.token, cab, itens);
      if coalesce(r->>'ok','') <> 'true' then
        res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': não abriu — ' || coalesce(r->>'erro','?') || ' ' || coalesce(r->>'mensagem',''));
        continue;
      end if;
      total_fluxos := total_fluxos + 1;
      v := (r->>'id')::uuid; seq := ''; passos := 0; depois_cotacao := false;
      select id into item from solicitacao_itens where solicitacao_id = v limit 1;

      loop
        passos := passos + 1;
        select * into s from solicitacoes where id = v;
        exit when s.etapa_atual is null or passos > 10;
        seq := seq || s.etapa_atual || '>';

        -- o funil mostra o pedido na coluna da etapa atual
        funil_checks := funil_checks + 1;
        select x into p from jsonb_array_elements(painel_diretoria(tp)->'solicitacoes') x where x->>'numero' = s.numero;
        if p is not null and p->>'etapa_atual' = s.etapa_atual then funil_ok := funil_ok + 1;
        else res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': funil não mostra na etapa ' || s.etapa_atual); end if;

        if s.etapa_atual = 'cotacao' then
          select token into ct from compradores where id = f.comprador_id and ativo;
          if ct is null then res := res || jsonb_build_array(f.nome || ': sem comprador ativo'); exit; end if;
          r := fila_do_comprador(ct);
          if not exists (select 1 from jsonb_array_elements(r->'pedidos') e where (e->>'id')::uuid = v) then
            res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': não aparece na Mesa de ' || f.comprador_id);
          end if;
          -- um fornecedor do cadastro, diferente a cada pedido
          select id, nome_curto into forn, forn_nome from fornecedores where ativo order by id offset (n * 37) % 3568 limit 1;
          r := salvar_mapa(ct, v, 0, jsonb_build_object(
                 'fornecedores', jsonb_build_array(jsonb_build_object('familia', fam, 'coluna', 1, 'fornecedor_id', forn,
                                   'desconto_pct', 0, 'frete', 0, 'prazo_dias', 3, 'condicao', '28 dias')),
                 'precos',   jsonb_build_array(jsonb_build_object('item_id', item, 'coluna', 1, 'preco', 100)),
                 'escolhas', jsonb_build_array(jsonb_build_object('item_id', item, 'coluna', 1))));
          if coalesce(r->>'ok','') <> 'true' then
            res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': Mesa não salvou — ' || coalesce(r->>'erro','?')); exit; end if;
          mver := (r->>'versao_mapa')::int;
          r := enviar_mapa(ct, v, mver, null);
          if coalesce(r->>'ok','') <> 'true' then
            res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': Mesa não enviou com 1 fornecedor — ' || coalesce(r->>'erro','?') || ' ' || coalesce(r->>'mensagem','')); exit; end if;
          depois_cotacao := true;
        else
          select token into tok from aprovadores where id = s.aprovador_atual and ativo;
          if tok is null then res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': etapa ' || s.etapa_atual || ' sem aprovador ativo'); exit; end if;
          r := fila_do_aprovador(tok);
          if not exists (select 1 from jsonb_array_elements(r->'pedidos') e where (e->>'id')::uuid = v) then
            res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': não está na fila de ' || s.aprovador_atual || ' (' || s.etapa_atual || ')');
          end if;
          if depois_cotacao then
            checou_valor := checou_valor + 1;
            r2 := pedido_telas(tok, v);
            if (r2->'mapa'->'resumo'->>'total')::numeric = 200
               and position(forn_nome in r2::text) > 0 then viu_valor := viu_valor + 1;
            else res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': ' || s.aprovador_atual || ' não vê fornecedor/valor na etapa ' || s.etapa_atual); end if;
            if tipo = 'unico' and coalesce(r2->'pedido'->>'definicao_fornecedor', '') <> 'unico' then
              res := res || jsonb_build_array(f.nome || ': aprovador não recebe a marca de fornecedor único');
            end if;
          end if;
          r := decidir_pedido(tok, v, s.versao, 'aprovado', null);
          if coalesce(r->>'ok','') <> 'true' then
            res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': aprovar falhou em ' || s.etapa_atual || ' — ' || coalesce(r->>'erro','?')); exit; end if;
        end if;
      end loop;

      select * into s from solicitacoes where id = v;
      seq := seq || coalesce(s.status, '?');
      if s.status = 'aprovado' then aprovados := aprovados + 1;
      else res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': terminou em ' || coalesce(s.status,'?') || ' (' || seq || ')'); end if;
      -- funil: aprovado sai do quadro com o histórico das decisões
      select x into p from jsonb_array_elements(painel_diretoria(tp)->'solicitacoes') x where x->>'numero' = s.numero;
      if p->>'status' <> 'aprovado' then res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': funil não mostra aprovado'); end if;
      if (p->>'valor_cotado')::numeric is distinct from 200 or position('cotacao_enviada' in (p->'movimentos')::text) = 0 then
        res := res || jsonb_build_array(f.nome || ' / ' || tipo || ': funil não mostra valor cotado / cotação enviada'); end if;
      seqs := jsonb_set(seqs, array[tipo], coalesce(seqs->tipo, '{}'::jsonb) ||
                jsonb_build_object(seq, coalesce((seqs->tipo->>seq)::int, 0) + 1));
    end loop;
  end loop;

  -- ------------------------------------------------ cancelado some das colunas do funil (telas_11)
  v := (abrir_pedido_telas((select token from facilitadores where id='eduarda'),
         jsonb_build_object('tipo_compra','normal','definicao_fornecedor','cotacao','centro_custo','1814',
           'motivo','teste','data_necessidade','2026-10-20','solicitante_nome','X'), itens)->>'id')::uuid;
  r := cancelar_pedido((select token from facilitadores where id='eduarda'), v, 1, 'Comprei de outro jeito');
  select x into p from jsonb_array_elements(painel_diretoria(tp)->'solicitacoes') x where x->>'numero' = (select numero from solicitacoes where id = v);
  if p->>'status' <> 'cancelado' or position('Comprei de outro jeito' in (p->'movimentos')::text) = 0 or p->>'cancelado_em' is null then
    res := res || '["funil: cancelado sem status/motivo"]'::jsonb; end if;

  raise exception 'RESULTADO %', jsonb_build_object(
    'fluxos_abertos', total_fluxos, 'aprovados_no_fim', aprovados,
    'funil_na_coluna_certa', funil_ok || '/' || funil_checks,
    'aprovador_viu_fornecedor_e_valor', viu_valor || '/' || checou_valor,
    'caminhos', seqs, 'falhas', res);
end $$;
