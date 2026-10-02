-- OC POR GERÊNCIA (lote mensal) — telas_26
--
-- Depois que o financeiro aprova o pacote de uma gerência, os pedidos dela viram
-- OCs juntas: uma por fornecedor (e condição/prazo), somando o mesmo item de
-- pedidos diferentes numa linha só. Os preços, descontos e fretes vêm do rateio
-- do lote (lote_rateio), que é exatamente o que o financeiro aprovou.
--
-- A OC também se separa por empresa e por centro de investimento do GR: uma OC
-- no GR tem uma empresa e um centro só. Se a gerência pediu por duas empresas,
-- saem OCs separadas para cada uma.
--
-- Encaixa no fluxo que já existe (workflow "Compras · Emitir OC no GR"):
--   oc_pendentes_de_montar  → traz também os pacotes aprovados, no mesmo formato
--                             de um pedido (numero = L2610-<gerência>)
--   oc_preparar             → grava lote_id, gerencia_id, pacote e os pedidos da OC
--   oc_para_enviar          → mostra o número do pacote
--   painel_diretoria        → a OC aparece em todos os pedidos que ela cobre
-- A automação continua desligada (oc_config.ligado = false): sem ela, só sai
-- pacote pedido pelo número (p_numero = 'L2610-a-brandao').

alter table ordens_compra add column if not exists lote_id uuid references lotes_mensais(id);
alter table ordens_compra add column if not exists gerencia_id text;
alter table ordens_compra add column if not exists pacote text;
alter table ordens_compra add column if not exists pedidos uuid[];
create index if not exists ordens_compra_pedidos on ordens_compra using gin (pedidos);

create or replace function _oc_numero_pacote(p_competencia date, p_gerencia text)
returns text language sql immutable as $$
  select 'L' || to_char(p_competencia, 'YYMM') || '-' || p_gerencia
$$;

create or replace function _oc_pacote_pedidos(p_lote uuid, p_gerencia text)
returns table (id uuid, numero text, empresa_id text, emp_gr int, emp_nome text, unidade text, cig int,
               local text, necessidade date, solicitante text)
language sql stable security definer set search_path = public as $$
  -- os pedidos do pacote que já passaram em todas as etapas
  select s.id, s.numero, s.empresa_id, e.codigo_gr::int, e.nome, c.unidade, g.codigo_gr::int,
         coalesce(nullif(trim(s.local_entrega), ''), s.unidade_destino), s.data_necessidade, s.solicitante_nome
    from solicitacoes s
    left join empresas e on e.id = s.empresa_id
    left join centros_custo c on c.codigo = s.centro_custo
    left join centros_investimento_gr g on g.unidade = c.unidade
   where s.lote_id = p_lote and coalesce(s.gerencia_id, 'sem_gerencia') = p_gerencia
     and s.status = 'aprovado' and s.etapa_atual is null
$$;

create or replace function oc_montar_pacote(p_lote uuid, p_gerencia text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l lotes_mensais%rowtype; pk lote_pacotes%rowtype; cfg oc_config%rowtype;
  v_num text; v_rot text; v_ger text; v_rep uuid;
  v_bloq jsonb := '[]'::jsonb; v_avis jsonb := '[]'::jsonb; v_grupos jsonb; v_total numeric;
  r record;
begin
  select * into l from lotes_mensais where id = p_lote;
  if l.id is null then
    return jsonb_build_object('ok', false, 'bloqueios', jsonb_build_array('o lote não existe'), 'grupos', '[]'::jsonb);
  end if;
  select * into pk from lote_pacotes where lote_id = p_lote and gerencia_id = p_gerencia;
  select * into cfg from oc_config where id;
  select nome into v_ger from aprovadores where id = p_gerencia;
  v_ger := coalesce(v_ger, case when p_gerencia = 'sem_gerencia' then 'Sem gerência' else p_gerencia end);
  v_num := _oc_numero_pacote(l.competencia, p_gerencia);
  v_rot := 'Lote ' || to_char(l.competencia, 'MM/YYYY') || ' · ' || v_ger;

  select x.id into v_rep from _oc_pacote_pedidos(p_lote, p_gerencia) x order by x.numero limit 1;

  if pk.id is null then
    v_bloq := v_bloq || to_jsonb('a gerência não tem pacote neste lote'::text);
  elsif pk.estado <> 'aprovado' then
    v_bloq := v_bloq || to_jsonb(('o pacote da gerência está ' || pk.estado || ', não aprovado')::text);
  end if;
  if v_rep is null then
    v_bloq := v_bloq || to_jsonb('nenhum pedido do pacote está aprovado em todas as etapas'::text);
  end if;

  for r in select * from _oc_pacote_pedidos(p_lote, p_gerencia) loop
    if r.empresa_id is null then
      v_bloq := v_bloq || to_jsonb((r.numero || ': o pedido não tem empresa')::text);
    elsif r.emp_gr is null then
      v_bloq := v_bloq || to_jsonb(('a empresa ' || r.emp_nome || ' não tem código do GR')::text);
    end if;
    if r.cig is null then
      v_avis := v_avis || to_jsonb(('a unidade "' || coalesce(r.unidade, '?') || '" (' || r.numero ||
        ') não tem centro de investimento do GR; a OC sai sem ele')::text);
    end if;
    if not exists (select 1 from lote_rateio lr where lr.lote_id = p_lote and lr.solicitacao_id = r.id) then
      v_bloq := v_bloq || to_jsonb((r.numero || ': o pedido não tem preço no rateio do lote')::text);
    end if;
  end loop;

  for r in
    select lr.chave, i.id as item_id, i.descricao, i.codigo, coalesce(i.fora_catalogo, false) as fora,
           lr.fornecedor_id, lf.fornecedor_nome, lf.condicao, fo.codigo_gr as forn_gr,
           lr.quantidade, lr.preco_unitario, p.numero
      from lote_rateio lr
      join _oc_pacote_pedidos(p_lote, p_gerencia) p on p.id = lr.solicitacao_id
      left join solicitacao_itens i on i.id = lr.item_id
      left join lote_mapa_fornecedores lf on lf.lote_id = lr.lote_id and lf.familia = lr.familia and lf.coluna = lr.coluna
      left join fornecedores fo on fo.id = lr.fornecedor_id
     where lr.lote_id = p_lote
  loop
    if r.item_id is null then
      v_bloq := v_bloq || to_jsonb((r.numero || ': um item do rateio não existe mais no pedido')::text);
    elsif coalesce(r.preco_unitario, 0) <= 0 then
      v_bloq := v_bloq || to_jsonb(('o item "' || r.descricao || '" está sem preço')::text);
    elsif coalesce(r.quantidade, 0) <= 0 then
      v_bloq := v_bloq || to_jsonb(('o item "' || r.descricao || '" está sem quantidade')::text);
    elsif r.fornecedor_id is null then
      v_bloq := v_bloq || to_jsonb(('o fornecedor "' || coalesce(r.fornecedor_nome, '?') || '" não está no cadastro de fornecedores')::text);
    elsif r.forn_gr is null then
      v_bloq := v_bloq || to_jsonb(('o fornecedor "' || coalesce(r.fornecedor_nome, '?') || '" não tem código do GR')::text);
    elsif nullif(trim(r.condicao), '') is null then
      v_bloq := v_bloq || to_jsonb(('falta a condição de pagamento de "' || coalesce(r.fornecedor_nome, '?') || '"')::text);
    end if;
    if r.item_id is not null and not r.fora and nullif(trim(r.codigo), '') is null then
      v_bloq := v_bloq || to_jsonb(('o item "' || r.descricao || '" não tem código do catálogo')::text);
    end if;
  end loop;

  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_bloq from jsonb_array_elements(v_bloq) x;
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_avis from jsonb_array_elements(v_avis) x;

  if jsonb_array_length(v_bloq) > 0 then
    return jsonb_build_object('ok', false, 'lote', true, 'lote_id', p_lote, 'gerencia_id', p_gerencia,
      'numero', v_num, 'rotulo', v_rot, 'solicitacao_id', v_rep,
      'bloqueios', v_bloq, 'avisos', v_avis, 'grupos', '[]'::jsonb, 'ocs', '[]'::jsonb);
  end if;

  with base as (
    select lr.*, p.numero, p.empresa_id, p.emp_gr, p.cig, p.unidade, p.local, p.necessidade, p.solicitante,
           i.codigo, i.descricao, i.unidade as un, coalesce(i.fora_catalogo, false) as fora,
           fo.codigo_gr as forn_gr, fo.razao_social, trim(lf.condicao) as condicao, lf.prazo_dias,
           coalesce(lf.desconto_pct, 0) as desconto_pct
      from lote_rateio lr
      join _oc_pacote_pedidos(p_lote, p_gerencia) p on p.id = lr.solicitacao_id
      join solicitacao_itens i on i.id = lr.item_id
      join lote_mapa_fornecedores lf on lf.lote_id = lr.lote_id and lf.familia = lr.familia and lf.coluna = lr.coluna
      join fornecedores fo on fo.id = lr.fornecedor_id
     where lr.lote_id = p_lote
  ),
  -- o mesmo item (código + unidade) de pedidos diferentes vira uma linha só
  linhas as (
    select empresa_id, emp_gr, cig, fornecedor_id, forn_gr, razao_social, condicao, prazo_dias, chave,
           min(codigo) as codigo, min(descricao) as descricao, min(un) as un, bool_or(fora) as fora,
           max(desconto_pct) as desconto_pct, sum(quantidade) as quantidade, max(preco_unitario) as preco_unitario,
           round(sum(valor_bruto), 2) as bruto, round(sum(desconto), 2) as desconto, sum(frete) as frete,
           array_agg(distinct solicitacao_id) as pedidos, array_agg(item_id order by numero) as itens_origem
      from base
     group by empresa_id, emp_gr, cig, fornecedor_id, forn_gr, razao_social, condicao, prazo_dias, chave
  ),
  ocs as (
    select empresa_id, emp_gr, cig, fornecedor_id, forn_gr, razao_social, condicao, prazo_dias,
           sum(bruto) as bruto, sum(desconto) as desconto, sum(bruto - desconto) as liquido,
           round(sum(frete), 2) as frete,
           (select array_agg(distinct x) from linhas l2, unnest(l2.pedidos) x
             where l2.empresa_id = ln.empresa_id and l2.cig is not distinct from ln.cig and l2.fornecedor_id = ln.fornecedor_id
               and l2.condicao is not distinct from ln.condicao and l2.prazo_dias is not distinct from ln.prazo_dias) as pedidos,
           jsonb_agg(jsonb_build_object(
             'item_id', itens_origem[1],
             'itens_origem', to_jsonb(itens_origem),
             'codigo', codigo,
             'item_gr', case when fora then cfg.item_generico else codigo end,
             'fora_catalogo', fora,
             'nome', left(trim(split_part(descricao, E'\n', 1)), 100),
             'descricao', descricao,
             'unidade', un,
             'quantidade', quantidade,
             'preco_unitario', preco_unitario,
             'desconto_pct', desconto_pct,
             'valor_bruto', bruto,
             'valor_desconto', desconto,
             'valor_liquido', bruto - desconto) order by descricao, chave) as itens
      from linhas ln
     group by empresa_id, emp_gr, cig, fornecedor_id, forn_gr, razao_social, condicao, prazo_dias
  ),
  grupos as (
    select o.empresa_id, o.emp_gr, o.cig,
           jsonb_agg(jsonb_build_object(
             'chave', v_num || ':' || o.fornecedor_id || ':' ||
                      left(md5(o.empresa_id || '|' || coalesce(o.cig::text, '') || '|' ||
                               coalesce(o.condicao, '') || '|' || coalesce(o.prazo_dias::text, '')), 8),
             'fornecedor_id', o.fornecedor_id,
             'fornecedor_gr', o.forn_gr::int,
             'razao_social', o.razao_social,
             'condicao', o.condicao,
             'prazo_dias', o.prazo_dias,
             'frete', o.frete,
             'valor_bruto', o.bruto,
             'valor_desconto', o.desconto,
             'valor_liquido', o.liquido,
             'total_com_frete', o.liquido + o.frete,
             'pedidos', to_jsonb(o.pedidos),
             'itens', o.itens) order by o.razao_social, o.condicao) as ocs,
           sum(o.liquido + o.frete) as total,
           (select array_agg(distinct x) from ocs o2, unnest(o2.pedidos) x
             where o2.empresa_id = o.empresa_id and o2.cig is not distinct from o.cig) as pedidos
      from ocs o
     group by o.empresa_id, o.emp_gr, o.cig
  )
  select jsonb_agg(jsonb_build_object(
           'ok', true,
           'lote', true,
           'lote_id', p_lote,
           'gerencia_id', p_gerencia,
           'gerencia', v_ger,
           'competencia', l.competencia,
           'numero', v_num,
           'rotulo', v_rot,
           'solicitacao_id', (select p.id from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos) order by p.numero limit 1),
           'pedidos', (select jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero) order by p.numero)
                         from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos)),
           'empresa_id', g.empresa_id,
           'empresa_gr', g.emp_gr,
           'unidade', (select string_agg(distinct p.unidade, ', ') from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos)),
           'centro_investimento_gr', g.cig,
           'prioridade', 'Normal',
           'data_necessidade', (select min(p.necessidade) from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos)),
           'local_entrega', left((select string_agg(distinct p.local, '; ') from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos)), 300),
           'solicitante', left((select string_agg(distinct p.solicitante, ', ') from _oc_pacote_pedidos(p_lote, p_gerencia) p where p.id = any(g.pedidos)), 200),
           'motivo', 'Compra mensal de ' || to_char(l.competencia, 'MM/YYYY') || ' da gerência ' || v_ger,
           'total_pacote', pk.total,
           'ocs', g.ocs,
           'bloqueios', '[]'::jsonb,
           'avisos', v_avis) order by g.emp_gr, g.cig),
         sum(g.total)
    into v_grupos, v_total
    from grupos g;

  if abs(coalesce(v_total, 0) - coalesce(pk.total, 0)) > 0.05 then
    v_avis := v_avis || to_jsonb(('a soma das OCs (' || round(coalesce(v_total, 0), 2) || ') difere do total aprovado do pacote (' || pk.total || ')')::text);
    select jsonb_agg(jsonb_set(gx, '{avisos}', v_avis)) into v_grupos from jsonb_array_elements(v_grupos) gx;
  end if;

  return jsonb_build_object('ok', true, 'lote', true, 'lote_id', p_lote, 'gerencia_id', p_gerencia,
    'numero', v_num, 'rotulo', v_rot, 'solicitacao_id', v_rep, 'total', round(coalesce(v_total, 0), 2),
    'bloqueios', '[]'::jsonb, 'avisos', v_avis, 'grupos', coalesce(v_grupos, '[]'::jsonb));
end $$;

revoke all on function oc_montar_pacote(uuid, text) from public, anon, authenticated;
revoke all on function _oc_pacote_pedidos(uuid, text) from public, anon, authenticated;
revoke all on function _oc_numero_pacote(date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- telas_26b — o pacote dentro do fluxo de OC que já existe (aplicado no banco)
--
-- oc_pendentes_de_montar(p_ambiente, p_numero)
--   * pedidos avulsos: passa a exigir s.lote_id is null (pedido do lote nunca
--     vira OC sozinho, nem bloqueio avulso);
--   * novo laço: lote_pacotes aprovados — pelo número do pacote
--     (_oc_numero_pacote: 'L2610-a-brandao') ou, com a automação ligada,
--     decididos depois de oc_config.automatica_desde. Cada grupo de
--     oc_montar_pacote sai como um "pedido", só com as OCs ainda não gravadas;
--     pacote bloqueado sai uma vez, com a chave '<numero>:bloqueio'.
-- oc_preparar(p_ambiente, p_solicitacao_id, p_ocs)
--   * se o pedido é do lote, grava lote_id, gerencia_id, pacote e pedidos[]
--     (os pedidos de cada OC e o local de entrega saem de oc_montar_pacote,
--     não do que veio de fora); bloqueio cobre todos os pedidos do pacote.
-- oc_para_enviar: 'numero' = coalesce(o.pacote, s.numero).
-- painel_diretoria: a OC aparece em todos os pedidos que ela cobre
--   (o.solicitacao_id = s.id or s.id = any(o.pedidos)).
--
-- Testes: _teste_lote_mensal, O1–O12 (58/58).
