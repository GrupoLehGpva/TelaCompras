-- Itens das solicitações de quem pediu — para a lista de acompanhamento
-- (acompanhar.html) mostrar o que foi pedido num clique, sem abrir o pedido.
--
-- Mesma porta de entrada de minhas_solicitacoes: o token do facilitador.
-- Token de outra pessoa não traz item de ninguém além dela. Só leitura, e só
-- o que quem pediu já sabe (código, descrição, unidade, quantidade) — preço
-- de cotação NÃO sai daqui.
--
-- Função nova em vez de mexer em minhas_solicitacoes: mudar o retorno daquela
-- exigiria DROP + CREATE com a tela no ar. Esta só se soma.
create or replace function public.itens_das_minhas_solicitacoes(p_token text)
returns table(solicitacao_id uuid, codigo text, descricao text, unidade text,
              quantidade numeric, fora_catalogo boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.solicitacao_id, i.codigo, i.descricao, i.unidade, i.quantidade,
         coalesce(i.fora_catalogo, false)
    from public.solicitacao_itens i
    join public.solicitacoes s   on s.id = i.solicitacao_id
    join public.facilitadores f  on f.token = p_token and f.ativo and s.facilitador_id = f.id
   where s.status <> 'encerrado (teste)'
   order by i.solicitacao_id, i.descricao;
$$;

revoke all on function public.itens_das_minhas_solicitacoes(text) from public;
grant execute on function public.itens_das_minhas_solicitacoes(text) to anon, authenticated, service_role;
