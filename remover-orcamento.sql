-- Mesa de cotação (05/10, pedido do Herisson): remover orçamento anexado errado.
-- Só o comprador, só enquanto o pedido está em cotação, e só anexos de orçamento
-- (os anexos do solicitante não podem ser removidos por aqui).
-- O arquivo fica no espaço privado sem ligação com o pedido (ninguém mais o vê).
create or replace function public.remover_orcamento(p_token text, p_id uuid, p_anexo uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare c compradores%rowtype; s solicitacoes%rowtype; v_n int;
begin
  select * into c from compradores where token = p_token and ativo;
  if c.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido', 'mensagem', 'Este link não vale mais.');
  end if;
  select * into s from solicitacoes where id = p_id for update;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado', 'mensagem', 'Pedido não encontrado.');
  end if;
  if s.canal <> 'telas' then
    return jsonb_build_object('ok', false, 'erro', 'canal_clickup', 'mensagem', 'Este pedido anda pelo ClickUp.');
  end if;
  if s.etapa_atual is distinct from 'cotacao' then
    return jsonb_build_object('ok', false, 'erro', 'fora_da_cotacao',
      'mensagem', 'O pedido já saiu da cotação: o orçamento não pode mais ser removido.');
  end if;
  delete from solicitacao_anexos
   where id = p_anexo and solicitacao_id = s.id and nome like 'Orçamento · %';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'erro', 'anexo_nao_encontrado',
      'mensagem', 'Este orçamento não está mais no pedido. Atualize a tela.');
  end if;
  return jsonb_build_object('ok', true, 'removidos', v_n,
    'orcamentos', (select coalesce(jsonb_agg(jsonb_build_object('id', an.id, 'nome', an.nome, 'mime', an.mime,
                     'tamanho', an.tamanho, 'enviado_em', an.enviado_em) order by an.enviado_em), '[]'::jsonb)
                     from solicitacao_anexos an where an.solicitacao_id = s.id and an.nome like 'Orçamento · %'));
end $function$;

revoke all on function public.remover_orcamento(text, uuid, uuid) from public;
grant execute on function public.remover_orcamento(text, uuid, uuid) to anon, authenticated;
