-- Ler um pedido é uma capacidade, não uma consulta livre.
--
-- Antes: a página lia `solicitacoes?select=*` com a chave pública. Como a
-- chave está no código-fonte da página (é assim que ela funciona), qualquer
-- pessoa podia trocar o filtro por nenhum filtro e baixar a lista inteira —
-- nome de quem pediu, motivo escrito à mão, centro de custo, tudo.
--
-- Agora: existe uma função que devolve UM pedido, e só se quem chamou souber
-- a chave dele. Sem chave não vem nada. Listar deixou de ser possível.
--
-- Falta ainda: enquanto o número (SC-2026-0007) valer como chave, dá para
-- adivinhar por tentativa. O caminho é todo link passar a levar o id (uuid).
-- Está anotado, é a próxima etapa desta mesma frente.

create or replace function public.abrir_pedido(
  p_id     uuid default null,
  p_numero text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s solicitacoes%rowtype;
begin
  if p_id is null and coalesce(trim(p_numero), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'link_incompleto');
  end if;

  if p_id is not null then
    select * into s from solicitacoes where id = p_id;
  else
    select * into s from solicitacoes where numero = trim(p_numero) limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pedido', to_jsonb(s) || jsonb_build_object(
      'centro_custo_nome',
      (select cc.nome || case when coalesce(cc.unidade,'') <> ''
                              then ' · ' || cc.unidade else '' end
         from centros_custo cc where cc.codigo = s.centro_custo)
    ),
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.descricao)
        from solicitacao_itens i
       where i.solicitacao_id = s.id
    ), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.abrir_pedido(uuid, text) from public;
grant execute on function public.abrir_pedido(uuid, text) to anon, authenticated, service_role;
