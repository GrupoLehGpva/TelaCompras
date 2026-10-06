-- 06/10: a OC vai ao GR com o nosso número no campo "Número do pedido"
-- (NumeroDoPedido), para o número aparecer na previsão financeira.
-- Pedido avulso: o número do pedido (C2610-00012). Lote mensal: o número do pacote.
-- Se o campo já vier preenchido, não troca. Desligar: update oc_config set numero_no_pedido = false where id;
-- Aplicado no Supabase pela migração oc_numero_do_pedido.
alter table oc_config add column if not exists numero_no_pedido boolean not null default true;

create or replace function public._oc_com_numero(p jsonb, p_numero text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if p is null or jsonb_typeof(p) <> 'object' or nullif(trim(p_numero), '') is null then return p; end if;
  if not coalesce((select numero_no_pedido from oc_config where id), true) then return p; end if;
  if nullif(trim(p->>'NumeroDoPedido'), '') is not null then return p; end if;
  return jsonb_set(p, '{NumeroDoPedido}', to_jsonb(trim(p_numero)));
end $function$;
revoke all on function public._oc_com_numero(jsonb, text) from public, anon, authenticated;

-- oc_preparar: o payload gravado passa por _oc_com_numero(..., coalesce(numero do pacote, numero do pedido)).
