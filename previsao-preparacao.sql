-- 07/10: preparação para a previsão financeira automática no GR (entrega do Sandro em 13/10).
-- Já aplicado no Supabase (migrations gr_credenciais_por_ambiente e oc_travas_antes_da_previsao).

-- 1) Credenciais do GR por ambiente, para os fluxos de teste não guardarem senha no n8n.
--    producao: gr_token / gr_usuario / gr_senha (já existem)
--    homologacao: gr_hml_token / gr_hml_usuario / gr_hml_senha (preencher no Vault)
--    p_so_token = true devolve só o token (consultas de cadastro, que não pedem usuário).
create or replace function public.gr_credenciais(p_ambiente text, p_so_token boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare pre text;
begin
  pre := case lower(trim(coalesce(p_ambiente, ''))) when 'producao' then 'gr_' when 'homologacao' then 'gr_hml_' end;
  if pre is null then raise exception 'ambiente inválido: % (use producao ou homologacao)', p_ambiente; end if;
  if p_so_token then
    return jsonb_build_object('ambiente', lower(trim(p_ambiente)),
      'token', (select decrypted_secret from vault.decrypted_secrets where name = pre || 'token' limit 1));
  end if;
  return jsonb_build_object('ambiente', lower(trim(p_ambiente)),
    'token',   (select decrypted_secret from vault.decrypted_secrets where name = pre || 'token'   limit 1),
    'usuario', (select decrypted_secret from vault.decrypted_secrets where name = pre || 'usuario' limit 1),
    'senha',   (select decrypted_secret from vault.decrypted_secrets where name = pre || 'senha'   limit 1));
end $function$;
revoke all on function public.gr_credenciais(text, boolean) from public, anon, authenticated;
grant execute on function public.gr_credenciais(text, boolean) to service_role;

-- 2) Travas antes da previsão financeira automática.
--    a) Condição de pagamento com prazo repetido ("30/90/90/120") ou acima de 365 dias: a montagem
--       juntava os repetidos e mandava menos parcelas (OC 3949). Agora a OC não sai e diz por quê.
--    b) Unidade sem centro de investimento do GR: o GR passou a recusar ("Centro de investimento não
--       informado!", C2610-00032). Antes era só aviso; agora é bloqueio, com a mensagem certa.
create or replace function public._oc_condicao_problema(p_condicao text)
returns text language sql immutable set search_path to 'public' as $function$
  with n as (select (m[1])::int v from regexp_matches(coalesce(p_condicao, ''), '(\d{1,4})', 'g') m)
  select case
    when (select count(*) from n) = 0 then null
    when (select count(*) from n where v > 365) > 0 then 'tem prazo acima de 365 dias'
    when (select count(*) from n) <> (select count(distinct v) from n) then 'tem prazo repetido'
  end
$function$;

do $$
declare d text;
  a1 text := '    v_avis := v_avis || to_jsonb((''a unidade "'' || coalesce(v_unid, s.centro_custo, ''?'') ||
      ''" não tem centro de investimento do GR; a OC sai sem ele'')::text);';
  b1 text := '    v_bloq := v_bloq || to_jsonb((''a unidade "'' || coalesce(v_unid, s.centro_custo, ''?'') ||
      ''" não tem centro de investimento do GR (cadastrar em centros_investimento_gr)'')::text);';
  a2 text := '      v_bloq := v_bloq || to_jsonb((''falta a condição de pagamento de "'' || coalesce(r.fornecedor_nome, ''?'') || ''"'')::text);
    end if;';
  b2 text := '      v_bloq := v_bloq || to_jsonb((''falta a condição de pagamento de "'' || coalesce(r.fornecedor_nome, ''?'') || ''"'')::text);
    elsif _oc_condicao_problema(r.condicao) is not null then
      v_bloq := v_bloq || to_jsonb((''a condição de pagamento "'' || trim(r.condicao) || ''" de "'' || coalesce(r.fornecedor_nome, ''?'') || ''" '' || _oc_condicao_problema(r.condicao) || ''; corrija na Mesa'')::text);
    end if;';
begin
  d := pg_get_functiondef('public.oc_montar(uuid)'::regprocedure);
  if position('_oc_condicao_problema' in d) = 0 then
    if (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 then raise exception 'oc_montar trecho 1'; end if;
    if (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 then raise exception 'oc_montar trecho 2'; end if;
    execute replace(replace(d, a1, b1), a2, b2);
  end if;
end $$;

do $$
declare d text;
  a1 text := '      v_avis := v_avis || to_jsonb((''a unidade "'' || coalesce(r.unidade, ''?'') || ''" ('' || r.numero ||
        '') não tem centro de investimento do GR; a OC sai sem ele'')::text);';
  b1 text := '      v_bloq := v_bloq || to_jsonb((''a unidade "'' || coalesce(r.unidade, ''?'') || ''" ('' || r.numero ||
        '') não tem centro de investimento do GR (cadastrar em centros_investimento_gr)'')::text);';
  a2 text := '      v_bloq := v_bloq || to_jsonb((''falta a condição de pagamento de "'' || coalesce(r.fornecedor_nome, ''?'') || ''"'')::text);
    end if;';
  b2 text := '      v_bloq := v_bloq || to_jsonb((''falta a condição de pagamento de "'' || coalesce(r.fornecedor_nome, ''?'') || ''"'')::text);
    elsif _oc_condicao_problema(r.condicao) is not null then
      v_bloq := v_bloq || to_jsonb((''a condição de pagamento "'' || trim(r.condicao) || ''" de "'' || coalesce(r.fornecedor_nome, ''?'') || ''" '' || _oc_condicao_problema(r.condicao) || ''; corrija na Mesa'')::text);
    end if;';
begin
  d := pg_get_functiondef('public.oc_montar_pacote(uuid,text)'::regprocedure);
  if position('_oc_condicao_problema' in d) = 0 then
    if (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 then raise exception 'pacote trecho 1'; end if;
    if (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 then raise exception 'pacote trecho 2'; end if;
    execute replace(replace(d, a1, b1), a2, b2);
  end if;
end $$;
