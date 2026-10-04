-- OC no GR na hora da aprovação do financeiro (03/10).
-- Já aplicado no Supabase (migrações telas_35a…35f). Este arquivo é o registro.
--
-- Como funciona:
--  1. O financeiro aprova (pedido avulso fica status 'aprovado' sem etapa; ou o pacote do lote
--     fica 'aprovado'). Um gatilho no banco chama o webhook do workflow
--     "Compras · Emitir OC no GR" (oc_config.webhook_emitir) — só se oc_config.ligado = true.
--  2. O workflow pega a vez (oc_pegar_vez). Se outra rodada está enviando, sai.
--  3. Monta e grava as OCs dos aprovados (oc_pendentes_de_montar → oc_preparar), e manda ao GR
--     uma por vez (oc_reservar → SalvaOrdem → oc_registrar), com 30 s entre elas.
--  4. No fim solta a vez; se chegou aprovação nova enquanto enviava (oc_tem_trabalho),
--     chama o próprio webhook de novo. OC que falhou há menos de 10 min não conta (GR fora do ar
--     não vira repetição sem fim): sai na conferência de hora em hora (seg–sex, 7h–19h).
--  5. A vez vence sozinha em 10 min se a rodada cair no meio.
-- Credenciais do GR: Vault do Supabase (gr_token, gr_usuario, gr_senha), lidas por
-- oc_credenciais_gr() só com a chave de serviço. Fora do workflow.
--
-- Ligar:    update oc_config set ligado = true, automatica_desde = now() where id;
-- Desligar: update oc_config set ligado = false where id;

create extension if not exists pg_net with schema extensions;
alter table oc_config add column if not exists webhook_emitir text;
alter table oc_config add column if not exists envio_dono text;
alter table oc_config add column if not exists envio_ate timestamptz;

create or replace function oc_trava_envio(p_dono text, p_segundos int default 300)
returns boolean language plpgsql security definer set search_path to 'public' as $f$
declare n int;
begin
  if nullif(trim(p_dono), '') is null then return false; end if;
  update oc_config set envio_dono = p_dono, envio_ate = now() + make_interval(secs => greatest(30, least(coalesce(p_segundos, 300), 1800)))
   where id and (envio_ate is null or envio_ate < now() or envio_dono = p_dono);
  get diagnostics n = row_count;
  return n = 1;
end $f$;

create or replace function oc_solta_envio(p_dono text)
returns boolean language plpgsql security definer set search_path to 'public' as $f$
declare n int;
begin
  update oc_config set envio_dono = null, envio_ate = null where id and envio_dono = p_dono;
  get diagnostics n = row_count;
  return n = 1;
end $f$;

create or replace function oc_pegar_vez(p_dono text, p_segundos int default 600)
returns jsonb language sql security definer set search_path to 'public' as $f$
  select jsonb_build_object('pegou', oc_trava_envio(p_dono, p_segundos))
$f$;
create or replace function oc_soltar_vez(p_dono text)
returns jsonb language sql security definer set search_path to 'public' as $f$
  select jsonb_build_object('soltou', oc_solta_envio(p_dono))
$f$;

create or replace function oc_tem_trabalho(p_ambiente text)
returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object('tem',
    exists (select 1 from ordens_compra where ambiente = p_ambiente and situacao = 'a lancar' and payload is not null
                                       and (enviada_em is null or enviada_em < now() - interval '10 minutes'))
    or jsonb_array_length(coalesce(oc_pendentes_de_montar(p_ambiente, null)->'pedidos', '[]'::jsonb)) > 0)
$f$;

create or replace function oc_credenciais_gr()
returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object(
    'token',   (select decrypted_secret from vault.decrypted_secrets where name = 'gr_token'   limit 1),
    'usuario', (select decrypted_secret from vault.decrypted_secrets where name = 'gr_usuario' limit 1),
    'senha',   (select decrypted_secret from vault.decrypted_secrets where name = 'gr_senha'   limit 1))
$f$;

create or replace function _oc_avisar_n8n()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare cfg oc_config%rowtype;
begin
  select * into cfg from oc_config where id;
  if coalesce(cfg.ligado, false) and nullif(trim(cfg.webhook_emitir), '') is not null then
    begin
      perform net.http_post(url := cfg.webhook_emitir,
                            body := jsonb_build_object('origem', TG_TABLE_NAME, 'id', NEW.id),
                            headers := '{"Content-Type": "application/json"}'::jsonb,
                            timeout_milliseconds := 5000);
    exception when others then
      raise warning 'aviso ao n8n falhou: %', sqlerrm;
    end;
  end if;
  return NEW;
end $f$;

create or replace trigger oc_pacote_aprovado_avisar after update of estado on lote_pacotes
  for each row when (NEW.estado = 'aprovado' and OLD.estado is distinct from NEW.estado)
  execute function _oc_avisar_n8n();
create or replace trigger oc_aprovado_avisar after update of status, etapa_atual on solicitacoes
  for each row when (NEW.status = 'aprovado' and NEW.etapa_atual is null and NEW.lote_id is null
                     and (OLD.status is distinct from NEW.status or OLD.etapa_atual is not null))
  execute function _oc_avisar_n8n();

-- todas só com a chave de serviço (o n8n)
revoke execute on function oc_trava_envio(text, int), oc_solta_envio(text), oc_pegar_vez(text, int), oc_soltar_vez(text),
  oc_tem_trabalho(text), oc_credenciais_gr(), _oc_avisar_n8n() from public, anon, authenticated;
