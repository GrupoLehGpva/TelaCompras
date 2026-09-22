-- Anexos do pedido — 22/09/2026
--
-- Até hoje o campo "Anexar" da tela do pedido era enfeite: o arquivo ficava na
-- memória do navegador e nunca era enviado. O Alisson anexou um documento no
-- C2609-00008 e ninguém recebeu.
--
-- O arquivo mora no bucket PRIVADO "anexos"; aqui ficam só os dados de cada um.
-- Quem grava e quem lê o arquivo é o fluxo do n8n "Compras · Anexo do pedido",
-- com a chave de serviço — a chave pública da tela não alcança nem a tabela
-- nem o bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/gif','application/pdf'])
on conflict (id) do nothing;

create table if not exists public.solicitacao_anexos (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  nome           text not null,       -- o nome que a pessoa escolheu, para as telas
  mime           text not null,
  tamanho        bigint not null,
  caminho        text not null,       -- <solicitacao_id>/<sufixo>-<nome limpo> no bucket
  enviado_em     timestamptz not null default now()
);

create index if not exists solicitacao_anexos_solicitacao_idx
  on public.solicitacao_anexos (solicitacao_id, enviado_em);

alter table public.solicitacao_anexos enable row level security;
revoke all on table public.solicitacao_anexos from anon, authenticated;

-- abrir_pedido passa a devolver os anexos junto do pedido e dos itens. Só os
-- dados (id, nome, tipo, tamanho): o arquivo sai pelo fluxo do n8n, nunca daqui.
-- A definição completa da função está em abrir-pedido.sql.
