-- De quem é este pedido, do lado de quem vai cotar.
--
-- A planilha de lideranças diz, por facilitador, qual é o comprador (coluna J).
-- Quem abre o pedido é o facilitador, então o comprador sai daí — não do centro
-- de custo, não da unidade. Uma regra só, e ela mora onde os dados moram.
--
-- Devolve também o id do comprador no ClickUp. Enquanto esse id for nulo (as
-- contas ainda não existem no workspace), o fluxo cria o card sem responsável,
-- exatamente como hoje. Preencher a coluna liga o roteamento sem tocar no n8n.

create or replace function public.comprador_do_pedido(
  p_email text default null,
  p_uid   text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f facilitadores%rowtype;
  c compradores%rowtype;
begin
  -- O Slack é a identidade mais confiável: vem do comando, não é digitado.
  if coalesce(trim(p_uid), '') <> '' then
    select * into f from facilitadores
     where slack_user_id = trim(p_uid) and ativo limit 1;
  end if;

  if not found and coalesce(trim(p_email), '') <> '' then
    select * into f from facilitadores
     where lower(email) = lower(trim(p_email)) and ativo limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'facilitador_desconhecido');
  end if;

  if f.comprador_id is null then
    return jsonb_build_object('ok', false, 'erro', 'facilitador_sem_comprador',
      'facilitador', f.nome);
  end if;

  select * into c from compradores where id = f.comprador_id and ativo;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'comprador_inativo',
      'facilitador', f.nome, 'comprador_id', f.comprador_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'facilitador', f.nome,
    'comprador_id', c.id,
    'comprador', c.nome,
    'comprador_email', c.email,
    'comprador_slack', c.slack_user_id,
    -- nulo enquanto a pessoa não existir no workspace do ClickUp
    'clickup_user_id', c.clickup_user_id
  );
end
$function$;

revoke all on function public.comprador_do_pedido(text, text) from public;
grant execute on function public.comprador_do_pedido(text, text) to anon, authenticated, service_role;
