-- O preço cotado nas telas de aprovação — 22/09/2026
--
-- Até hoje o valor da cotação existia SÓ no campo "Melhor Valor" do card do
-- ClickUp. Quem aprovava pela tela — que é como o gerente aprova — decidia sem
-- ver preço nenhum.
--
-- Quem grava é o n8n (fluxo Fou7AbMfas1ZU7Qc), quando o comprador termina a
-- cotação e move o card para "aprovação gerencial". A tela nunca escreve preço.

alter table public.solicitacoes
  add column if not exists valor_cotado        numeric(14,2),
  add column if not exists fornecedor_cotado   text,
  add column if not exists orcamentos_anexados smallint,
  add column if not exists cotacao_em          timestamptz;

comment on column public.solicitacoes.valor_cotado is
  'Melhor Valor da cotação, lido do card quando ele entra em aprovação gerencial.';

create or replace function public.registrar_cotacao(
  p_card_id text,
  p_valor numeric default null,
  p_fornecedor text default null,
  p_orcamentos int default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s solicitacoes%rowtype;
begin
  select * into s from solicitacoes where card_id = p_card_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'card_desconhecido');
  end if;

  update solicitacoes
     set valor_cotado        = nullif(p_valor, 0),
         fornecedor_cotado   = nullif(btrim(coalesce(p_fornecedor, '')), ''),
         orcamentos_anexados = p_orcamentos,
         cotacao_em          = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'numero', s.numero, 'valor', nullif(p_valor, 0));
end $$;

-- Preço é escrita de servidor: a chave pública da tela não alcança esta função.
revoke all on function public.registrar_cotacao(text, numeric, text, int) from public, anon, authenticated;
grant execute on function public.registrar_cotacao(text, numeric, text, int) to service_role;

-- A fila do aprovador passa a levar o valor. DROP + CREATE porque o retorno
-- muda; tudo numa transação só, então a tela nunca vê a função ausente.
drop function if exists public.fila_de_aprovacao(text);
create function public.fila_de_aprovacao(p_token text)
 returns table(id uuid, numero text, card_id text, etapa_atual text, facilitador text,
               solicitante_nome text, centro_custo text, centro_custo_nome text,
               tipo_compra text, data_necessidade date, motivo text, observacao text,
               aberto_em timestamptz, total_itens bigint,
               valor_cotado numeric, fornecedor_cotado text, orcamentos_anexados smallint)
 language sql security definer set search_path to 'public'
as $function$
  select s.id, s.numero, s.card_id, s.etapa_atual,
         s.facilitador, s.solicitante_nome,
         s.centro_custo, cc.nome as centro_custo_nome,
         s.tipo_compra, s.data_necessidade, s.motivo, s.observacao, s.aberto_em,
         (select count(*) from public.solicitacao_itens i where i.solicitacao_id = s.id),
         s.valor_cotado, s.fornecedor_cotado, s.orcamentos_anexados
    from public.solicitacoes s
    join public.aprovadores a
      on a.token = p_token
     and a.ativo
     and s.aprovador_atual = a.id
     and s.etapa_atual = any(a.etapas)
    left join public.centros_custo cc on cc.codigo = s.centro_custo
   where s.etapa_atual is not null
   order by s.aberto_em;
$function$;

revoke all on function public.fila_de_aprovacao(text) from public;
grant execute on function public.fila_de_aprovacao(text) to anon, authenticated, service_role;

-- abrir_pedido não precisou mudar: ela devolve a linha inteira da solicitação,
-- então as colunas novas já chegam na tela do pedido.
