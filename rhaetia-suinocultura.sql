-- 08/10 (Guilherme): toda unidade RHAETIA usa o centro de investimento 38 SUINOCULTURA.
-- Já aplicado no Supabase (migration rhaetia_sempre_suinocultura).

-- 1) As RHAETIA que já existem
insert into centros_investimento_gr (unidade, codigo_gr, nome_gr, atualizado_em)
select distinct c.unidade, 38, 'SUINOCULTURA', now() from centros_custo c
 where c.unidade ilike 'RHAETIA%'
on conflict (unidade) do update set codigo_gr = 38, nome_gr = 'SUINOCULTURA', atualizado_em = now();

-- 2) As próximas: unidade RHAETIA nova (ou centro de custo que passe para uma) ganha a ligação sozinha
create or replace function public._cc_rhaetia_suinocultura()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.unidade ilike 'RHAETIA%' then
    insert into centros_investimento_gr (unidade, codigo_gr, nome_gr, atualizado_em)
    values (new.unidade, 38, 'SUINOCULTURA', now())
    on conflict (unidade) do nothing;
  end if;
  return new;
end $function$;
revoke all on function public._cc_rhaetia_suinocultura() from public, anon, authenticated;
create or replace trigger cc_rhaetia_suinocultura
  after insert or update of unidade on public.centros_custo
  for each row execute function public._cc_rhaetia_suinocultura();
