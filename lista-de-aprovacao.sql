-- A lista de aprovação passou a ter horário POR ETAPA (18/09/2026).
-- Cópia fiel do que está no banco.
--
--   liderança imediata e gerencial → 08h, 11h, 14h e 16h
--   financeira                     → 09h, 11h, 14h30 e 16h30
--
-- Antes eram 11h e 16h para todo mundo, e a função não perguntava a etapa.
-- Agora cada disparo do n8n cobre um conjunto de etapas e passa esse conjunto
-- aqui — senão o disparo das 8h mandaria DM para o financeiro também, e o
-- horário separado não teria servido para nada.
--
-- O default cobre as três: chamada sem argumento se comporta como antes, que é
-- o que o disparo manual de demonstração usa.
--
-- NÃO É PÚBLICA. Devolve o token de cada aprovador, que aprova compra.
drop function if exists public.filas_pendentes();

create or replace function public.filas_pendentes(
  p_etapas text[] default array['lider','gerencial','financeiro']
)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) from (
    select jsonb_build_object(
             'aprovador_id', a.id,
             'nome',         a.nome,
             'slack',        a.slack_user_id,
             'token',        a.token,
             'quantidade',   count(s.id),
             'de_hoje',      count(*) filter (where s.aberto_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')),
             'mais_antigo',  min(s.aberto_em),
             'etapas',       jsonb_agg(distinct s.etapa_atual),
             'numeros',      (array_agg(s.numero order by s.aberto_em))[1:5]
           ) as x
      from public.aprovadores a
      join public.solicitacoes s
        on s.aprovador_atual = a.id
       and s.etapa_atual = any(a.etapas)
       -- A linha nova: só as etapas que ESTE disparo cobre.
       and s.etapa_atual = any(coalesce(p_etapas, array['lider','gerencial','financeiro']))
       and s.decidido_em is null
     where a.ativo
     group by a.id, a.nome, a.slack_user_id, a.token
  ) t;
$function$;

comment on function public.filas_pendentes(text[]) is
  'Uma linha por aprovador com pedido parado, limitada as etapas do disparo. Sem argumento, cobre as tres.';

revoke all on function public.filas_pendentes(text[]) from public;
revoke all on function public.filas_pendentes(text[]) from anon;
revoke all on function public.filas_pendentes(text[]) from authenticated;
grant execute on function public.filas_pendentes(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Conferência do filtro, sem tocar em dado de produção: a mesma junção e o
-- mesmo predicado, sobre linhas de mentira. Roda e confere com os olhos.
--   08h/14h/16h  → só quem tem lider/gerencial parado
--   09h/14h30/16h30 → só financeiro
--   11h → as três
-- E, nos três, aprovador inativo e pedido já decidido ficam de fora.
-- ---------------------------------------------------------------------------
with aprov(id, nome, etapas, ativo) as (
  values ('brandao','BRANDAO', array['lider','gerencial'], true),
         ('wien','WIENFRIED', array['financeiro'], true),
         ('desligado','INATIVO', array['lider'], false)
), sol(numero, aprovador_atual, etapa_atual, decidido_em) as (
  values ('X-LIDER','brandao','lider', null::timestamptz),
         ('X-GEREN','brandao','gerencial', null),
         ('X-FINAN','wien','financeiro', null),
         ('X-JADEC','wien','financeiro', now()),
         ('X-INATI','desligado','lider', null)
), teste(rotulo, p_etapas) as (
  values ('08h/14h/16h - lideranca e gerencial', array['lider','gerencial']),
         ('09h/14h30/16h30 - financeiro',        array['financeiro']),
         ('11h - as tres',                       array['lider','gerencial','financeiro'])
)
select t.rotulo,
       coalesce(string_agg(distinct a.nome || ' (' || s.etapa_atual || ')', ', '), 'ninguem') as quem_recebe
  from teste t
  left join sol s on s.etapa_atual = any(t.p_etapas) and s.decidido_em is null
  left join aprov a on a.id = s.aprovador_atual and a.ativo and s.etapa_atual = any(a.etapas)
 where a.id is not null or s.numero is null
 group by t.rotulo
 order by t.rotulo;
