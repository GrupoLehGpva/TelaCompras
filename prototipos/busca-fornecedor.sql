-- Busca de fornecedor para a tela de cotação (prototipos/mesa-cotacao.html).
-- Roda uma vez no Supabase. Já foi aplicada em 22/09/2026.
--
-- Por que uma função e não leitura direta da tabela: `fornecedores` tem CNPJ,
-- CPF, telefone e e-mail, e a chave pública das telas fica visível no código.
-- A tabela continua fechada para o público; a função devolve só nome, razão
-- social e cidade, exige 2 letras e para em 20 achados.

create or replace function public.buscar_fornecedor(termo text)
returns table (id text, nome text, razao_social text, cidade text, uf text)
language sql stable security definer set search_path = public as $$
  select f.id,
         coalesce(nullif(f.nome_curto, ''), f.razao_social) as nome,
         f.razao_social,
         coalesce(f.cidade, '') as cidade,
         coalesce(f.uf, '') as uf
  from fornecedores f
  where f.ativo
    and length(coalesce(trim(termo), '')) >= 2
    and (f.nome_curto ilike '%' || trim(termo) || '%' or f.razao_social ilike '%' || trim(termo) || '%')
  order by length(coalesce(nullif(f.nome_curto, ''), f.razao_social)), 2
  limit 20;
$$;
revoke all on function public.buscar_fornecedor(text) from public;
grant execute on function public.buscar_fornecedor(text) to anon, authenticated;

create or replace function public.fornecedores_ativos()
returns integer
language sql stable security definer set search_path = public
as $$ select count(*)::int from fornecedores where ativo $$;
revoke all on function public.fornecedores_ativos() from public;
grant execute on function public.fornecedores_ativos() to anon, authenticated;
