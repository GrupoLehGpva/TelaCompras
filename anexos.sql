-- ============================================================================
-- ANEXO DO SOLICITANTE — foto ou PDF que vai junto com o pedido
--
-- Rodado no SQL Editor do Supabase (projeto leh-compras-demo) em 22/09/2026.
-- O arquivo mora no bucket PRIVADO "anexos", em <solicitacao_id>/<uuid>.<ext>.
-- A tabela guarda só o metadado. As telas pedem um link assinado na hora do
-- clique (válido 1 hora), então não existe link fixo de arquivo circulando.
--
-- Quem usa:
--   index.html      → sobe o arquivo e chama registrar_anexos
--   pedido.html     → mostra dentro do cartão "Anexos do solicitante"
--   decisao.html    → idem, no resumo do que foi decidido
--   acompanhar.html → idem, dentro da linha aberta do pedido
--   painel.html     → idem, no modal (vem junto de painel_diretoria)
-- ============================================================================

-- A tabela e o bucket já existiam quando este script foi escrito:
--
--   create table public.solicitacao_anexos (
--     id uuid primary key default gen_random_uuid(),
--     solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
--     nome text not null, mime text not null, tamanho bigint not null,
--     caminho text not null, enviado_em timestamptz not null default now());
--
--   bucket "anexos": privado, 10 MB por arquivo,
--   mime liberado: image/jpeg, image/png, image/webp, image/heic, image/gif, application/pdf

-- 1) Quem envia o formulário grava no bucket; leitura liberada para assinar o
--    link. Sem update e sem delete: anexo de pedido não se reescreve.
drop policy if exists "anexos enviar" on storage.objects;
create policy "anexos enviar" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'anexos');

drop policy if exists "anexos ler" on storage.objects;
create policy "anexos ler" on storage.objects
  for select to anon, authenticated using (bucket_id = 'anexos');

-- 2) Um caminho, um anexo. Reenvio do mesmo arquivo não duplica a linha.
create unique index if not exists solicitacao_anexos_caminho_idx on public.solicitacao_anexos(caminho);
create index if not exists solicitacao_anexos_solicitacao_idx on public.solicitacao_anexos(solicitacao_id);

-- 3) Registra o metadado depois do upload.
create or replace function public.registrar_anexos(p_solicitacao_id uuid, p_anexos jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_qtd int := 0;
begin
  if p_solicitacao_id is null or not exists (select 1 from solicitacoes where id = p_solicitacao_id) then
    return jsonb_build_object('ok', false, 'erro', 'solicitacao_inexistente',
      'mensagem', 'Solicitação não encontrada para anexar o arquivo.');
  end if;
  insert into solicitacao_anexos (solicitacao_id, nome, mime, tamanho, caminho)
  select p_solicitacao_id,
         nullif(a->>'nome',''), coalesce(nullif(a->>'mime',''),'application/octet-stream'),
         coalesce((a->>'tamanho')::bigint, 0), a->>'caminho'
  from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) a
  where coalesce(a->>'caminho','') <> '' and coalesce(a->>'nome','') <> ''
  on conflict (caminho) do nothing;
  get diagnostics v_qtd = row_count;
  return jsonb_build_object('ok', true, 'gravados', v_qtd);
end $$;
revoke all on function public.registrar_anexos(uuid, jsonb) from public;
grant execute on function public.registrar_anexos(uuid, jsonb) to anon, authenticated;

-- 4) Lista os anexos de um pedido, pelo id ou pelo número.
create or replace function public.anexos_da_solicitacao(p_solicitacao_id uuid default null, p_numero text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nome', a.nome, 'caminho', a.caminho, 'mime', a.mime,
           'tamanho', a.tamanho, 'enviado_em', a.enviado_em) order by a.enviado_em), '[]'::jsonb)
  from solicitacao_anexos a
  join solicitacoes s on s.id = a.solicitacao_id
  where (p_solicitacao_id is not null and a.solicitacao_id = p_solicitacao_id)
     or (p_numero is not null and s.numero = p_numero);
$$;
revoke all on function public.anexos_da_solicitacao(uuid, text) from public;
grant execute on function public.anexos_da_solicitacao(uuid, text) to anon, authenticated;

-- 5) painel_diretoria passou a devolver 'anexos' junto de cada solicitação
--    (o corpo completo da função está em painel-diretoria.sql).

-- O card do ClickUp também recebe os arquivos: o workflow v8 ganhou, no fim do
-- ramo do formulário, os nós "Separar anexos do pedido" → "Baixar o anexo do
-- Storage" (credencial Supabase Compras) → "Anexar o arquivo no card"
-- (credencial ClickUp account, POST /api/v2/task/{id}/attachment).
-- A descrição do card continua trazendo a contagem: "**Anexos:** 2 arquivos".
