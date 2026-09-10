-- Fecha a leitura pública das solicitações.
--
-- RODAR SÓ DEPOIS que pedido.html e decisao.html novos estiverem no ar
-- (GitHub Pages). Antes disso, as telas publicadas ainda leem a tabela e
-- parariam de abrir os pedidos.
--
-- O que muda: hoje qualquer pessoa com a chave publicável — que está no
-- código-fonte das páginas, por construção — pode pedir a tabela inteira e
-- receber todas as solicitações, com o nome de quem pediu e o texto que a
-- pessoa escreveu. Depois disto, a única porta é a função abrir_pedido, que
-- devolve UM pedido e só para quem já sabe qual.
--
-- O formulário continua gravando: a política de INSERT não é tocada.

begin;

drop policy if exists "solicitacoes leitura publica"      on public.solicitacoes;
drop policy if exists "solicitacao_itens leitura publica" on public.solicitacao_itens;

commit;

-- Conferência (deve voltar zero linhas nas duas):
--   select count(*) from public.solicitacoes;        -- como anon
--   select count(*) from public.solicitacao_itens;   -- como anon
