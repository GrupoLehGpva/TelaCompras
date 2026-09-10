-- ============================================================================
-- Solicitações · Grupo Leh — campos do facilitador, do solicitante e da observação
--
-- RODE ESTE ANTES de subir o index.html novo. Sem as colunas, o formulário
-- grava e leva 400 do Supabase — o pedido não nasce.
--
-- Pode rodar de novo sem medo: tudo é "if not exists".
-- ============================================================================

alter table public.solicitacoes
  add column if not exists facilitador        text,
  add column if not exists facilitador_email  text,
  add column if not exists solicitante_nome   text,
  add column if not exists observacao         text;

comment on column public.solicitacoes.facilitador is
  'Quem abriu o pedido. Vem do usuário do Slack pelo /compras.';
comment on column public.solicitacoes.facilitador_email is
  'E-mail corporativo do facilitador. É por ele que a 1ª aprovação acha a liderança.';
comment on column public.solicitacoes.solicitante_nome is
  'Opcional: quem precisa do item, quando não é o facilitador.';
comment on column public.solicitacoes.observacao is
  'Opcional: observação do pedido inteiro, não de um item.';

-- A coluna `solicitante` é anterior a essa mudança e continua recebendo o nome
-- de quem abriu o pedido — hoje, o facilitador. Fica para as solicitações
-- antigas e para o que já lê essa coluna não quebrar. Em consulta nova, prefira
-- `facilitador`.
comment on column public.solicitacoes.solicitante is
  'Histórico: quem abriu o pedido. Em registro novo repete o facilitador.';

-- Conferência: as quatro colunas têm que aparecer.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'solicitacoes'
   and column_name in ('facilitador','facilitador_email','solicitante_nome','observacao')
 order by column_name;
