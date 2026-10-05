-- Card do funil: mostra o preço escolhido na cotação (Mesa/lote) em cada item.
-- Antes o card lia preco_1..3 (caminho antigo do ClickUp) e ficava "—".
-- Preço já com o desconto do fornecedor, igual ao que vai para a OC.

create or replace function public._item_escolha(p_item uuid)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    -- lote mensal: rateio gravado
    (select jsonb_build_object(
        'preco', round(r.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100), 4),
        'forn', coalesce(fo.nome_curto, fo.razao_social, f.fornecedor_nome))
       from solicitacao_itens i
       join solicitacoes s on s.id = i.solicitacao_id and s.lote_id is not null
       join lote_rateio r on r.item_id = i.id and r.lote_id = s.lote_id
       left join lote_mapa_fornecedores f on f.lote_id = r.lote_id and f.familia = r.familia and f.coluna = r.coluna
       left join fornecedores fo on fo.id = coalesce(r.fornecedor_id, f.fornecedor_id)
      where i.id = p_item
      limit 1),
    -- pedido avulso: escolha da Mesa
    (select jsonb_build_object(
        'preco', round(p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100), 4),
        'forn', coalesce(fo.nome_curto, fo.razao_social, f.fornecedor_nome))
       from solicitacao_itens i
       join mapa_escolhas e on e.item_id = i.id
       join mapa_precos p on p.item_id = i.id and p.coluna = e.coluna
       left join mapa_fornecedores f on f.solicitacao_id = i.solicitacao_id and f.familia = _telas_familia(i.codigo) and f.coluna = e.coluna
       left join fornecedores fo on fo.id = f.fornecedor_id
      where i.id = p_item
      limit 1),
    '{}'::jsonb)
$function$;

revoke all on function public._item_escolha(uuid) from public, anon, authenticated;

-- painel_diretoria: item ganha 'esc' => {preco, forn}
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.painel_diretoria(text)'::regprocedure);
  if position('''esc'',' in d) > 0 then return; end if;
  n := replace(d, '''p3'',i.preco_3)', '''p3'',i.preco_3,''esc'',_item_escolha(i.id))');
  if n = d then raise exception 'trecho dos itens não encontrado'; end if;
  execute n;
end $$;
