-- ============================================================================
-- Fechar escrita pública nas tabelas do pedido · Grupo Leh
--
-- APLICADO EM PRODUÇÃO EM 08/09/2026. Este arquivo fica como registro.
--
-- O problema: `solicitacoes`, `solicitacao_itens` e `catalogo_itens` estavam sem
-- RLS. A chave publishable está no código das telas — é pública por natureza — e
-- sem RLS ela dá UPDATE e DELETE. Conferido rodando como `anon`: um update numa
-- solicitação alterou 1 linha de verdade.
--
-- Ficou grave agora porque a fila de aprovação passa a confiar em `etapa_atual` e
-- `aprovador_atual` dentro de `solicitacoes`.
--
-- A tela precisa de LER e CRIAR. Alterar e apagar nunca foi função dela: quem
-- move o pedido é o n8n, por função SECURITY DEFINER ou pela chave secreta, e
-- nenhum dos dois passa por RLS.
-- ============================================================================

alter table public.solicitacoes enable row level security;
drop policy if exists "solicitacoes leitura publica" on public.solicitacoes;
drop policy if exists "solicitacoes criacao publica" on public.solicitacoes;
create policy "solicitacoes leitura publica"
  on public.solicitacoes for select using (true);
create policy "solicitacoes criacao publica"
  on public.solicitacoes for insert with check (true);

alter table public.solicitacao_itens enable row level security;
drop policy if exists "solicitacao_itens leitura publica" on public.solicitacao_itens;
drop policy if exists "solicitacao_itens criacao publica" on public.solicitacao_itens;
create policy "solicitacao_itens leitura publica"
  on public.solicitacao_itens for select using (true);
create policy "solicitacao_itens criacao publica"
  on public.solicitacao_itens for insert with check (true);

alter table public.catalogo_itens enable row level security;
drop policy if exists "catalogo_itens leitura publica" on public.catalogo_itens;
create policy "catalogo_itens leitura publica"
  on public.catalogo_itens for select using (true);
