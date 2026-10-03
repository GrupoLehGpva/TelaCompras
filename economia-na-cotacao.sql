-- Indicador de economia (03/10): lido do mapa da Mesa (e do lote), não da tabela antiga cotacoes.
-- Já aplicado no Supabase (migrações telas_33, 33b, 33c). Este arquivo é o registro.
--
-- _economia_pedido(id) → null, ou { valor, maior, media, escolhido, itens }
--   só itens escolhidos com 2+ preços; preço efetivo = preço × (1 − desconto do fornecedor); frete fora.
--   maior = maior preço × qtd · media = preço médio × qtd · escolhido = preço escolhido × qtd
--   valor = maior − escolhido (economia contra a maior proposta)
--   lote mensal: por pedido, pelas quantidades e preços do lote_rateio.
-- painel_diretoria devolve 'economia' em cada pedido das telas.
-- A tela (indicadores.html) soma os pedidos APROVADOS no período, com os filtros da tela;
-- pedido antigo do ClickUp entra pelas propostas registradas (maior proposta − valor).
-- Testes: _teste_caminho_telas() EC1–EC2 (182/182).
create or replace function _economia_pedido(p_sol uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $f$
  with s as (select id, lote_id from solicitacoes where id = p_sol),
  it as (
    select i.quantidade as q, ps.maior, ps.media, ps.n,
           (select p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100)
              from mapa_precos p
              left join mapa_fornecedores f on f.solicitacao_id = i.solicitacao_id and f.familia = _telas_familia(i.codigo) and f.coluna = p.coluna
             where p.item_id = i.id and p.coluna = e.coluna) as esc
      from s
      join solicitacao_itens i on i.solicitacao_id = s.id
      join mapa_escolhas e on e.item_id = i.id
      cross join lateral (
        select max(p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100)) as maior,
               avg(p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100)) as media, count(*) as n
          from mapa_precos p
          left join mapa_fornecedores f on f.solicitacao_id = i.solicitacao_id and f.familia = _telas_familia(i.codigo) and f.coluna = p.coluna
         where p.item_id = i.id and p.preco_unitario > 0) ps
     where s.lote_id is null
    union all
    select r.quantidade, ps.maior, ps.media, ps.n,
           r.preco_unitario * (1 - coalesce((select f.desconto_pct from lote_mapa_fornecedores f
                                              where f.lote_id = r.lote_id and f.familia = r.familia and f.coluna = r.coluna), 0) / 100)
      from s
      join lote_rateio r on r.solicitacao_id = s.id and r.lote_id = s.lote_id
      cross join lateral (
        select max(p.preco * (1 - coalesce(f.desconto_pct, 0) / 100)) as maior,
               avg(p.preco * (1 - coalesce(f.desconto_pct, 0) / 100)) as media, count(*) as n
          from lote_mapa_precos p
          left join lote_mapa_fornecedores f on f.lote_id = p.lote_id and f.familia = r.familia and f.coluna = p.coluna
         where p.lote_id = r.lote_id and p.chave = r.chave and p.preco > 0) ps
  ),
  ok as (select * from it where n >= 2 and esc is not null and maior is not null and q > 0)
  select case when (select count(*) from ok) = 0 then null else (
    select jsonb_build_object(
      'valor', round(sum((maior - esc) * q), 2),
      'maior', round(sum(maior * q), 2),
      'media', round(sum(media * q), 2),
      'escolhido', round(sum(esc * q), 2),
      'itens', count(*)) from ok) end
$f$;
