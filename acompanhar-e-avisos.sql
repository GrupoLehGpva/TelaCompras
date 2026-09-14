-- ===========================================================================
-- ITEM 1 — ACOMPANHAMENTO DE QUEM PEDIU
--
-- Quem abre a solicitação precisa ver onde ela está, sem perguntar a ninguém e
-- sem poder mexer em nada.
--
-- Mesmo modelo de segurança da fila do aprovador: o token é a credencial, e a
-- consulta só devolve o que é daquele token. Token inválido devolve vazio —
-- nunca a lista de outra pessoa. Conferido também com token de APROVADOR, que
-- é o erro mais fácil de cometer.
--
-- NOTA DA PLANILHA DE PERMISSÕES: não existe coluna de "solicitante". Quem pede
-- é o FACILITADOR de compras. O campo `solicitante_nome` do formulário é "para
-- quem é esta compra" — texto livre, sem e-mail nem Slack.
-- ===========================================================================

alter table public.facilitadores add column if not exists token text;

-- Prefixo `fc-` para nunca ser confundido com o `ap-` do aprovador: token
-- trocado de lugar seria pessoa vendo a fila errada.
update public.facilitadores
   set token = 'fc-' || replace(gen_random_uuid()::text, '-', '')
 where token is null;

alter table public.facilitadores alter column token set not null;
create unique index if not exists ux_facilitadores_token on public.facilitadores (token);

comment on column public.facilitadores.token is
  'Credencial da tela de acompanhamento. Vai na DM daquela pessoa, nunca em canal.';

-- ---------------------------------------------------------------------------
create or replace function public.facilitador_do_token(p_token text)
returns table (id text, nome text, setor text, gerencia text)
language sql security definer set search_path to 'public'
as $function$
  select f.id, f.nome, f.setor, f.gerencia
    from public.facilitadores f
   where f.token = p_token and f.ativo;
$function$;

-- ---------------------------------------------------------------------------
-- `situacao` é escrita para quem PEDIU, não para quem opera: a pessoa quer
-- saber de quem o pedido está esperando, não o nome interno da etapa.
-- ---------------------------------------------------------------------------
create or replace function public.minhas_solicitacoes(p_token text, p_limite int default 80)
returns table (
  id uuid, numero text, assunto text, centro_custo_nome text, total_itens bigint,
  aberto_em timestamptz, data_necessidade date, etapa_atual text, status text,
  decidido_em timestamptz, situacao text, com_quem text, encerrada boolean, motivo_recusa text
)
language sql security definer set search_path to 'public'
as $function$
  select s.id, s.numero,
         coalesce(s.motivo, 'Solicitação de compra'),
         cc.nome,
         (select count(*) from public.solicitacao_itens i where i.solicitacao_id = s.id),
         s.aberto_em, s.data_necessidade, s.etapa_atual, s.status, s.decidido_em,
         case
           when s.status = 'reprovado'       then 'Reprovado'
           when s.status = 'aprovado'        then 'Liberado para compra'
           when s.etapa_atual = 'lider'      then 'Esperando a liderança'
           when s.etapa_atual = 'cotacao'    then 'Em cotação'
           when s.etapa_atual = 'gerencial'  then 'Esperando o gerente'
           when s.etapa_atual = 'financeiro' then 'Esperando o financeiro'
           else 'Encerrada'
         end,
         case
           when s.status in ('reprovado','aprovado') then null
           when s.etapa_atual = 'cotacao'            then 'com o comprador'
           when s.etapa_atual is not null            then (select a.nome from public.aprovadores a
                                                            where a.id = s.aprovador_atual)
           else null
         end,
         (s.status in ('reprovado','aprovado') or s.etapa_atual is null),
         (select d.motivo from public.decisoes d
           where d.solicitacao_id = s.id and d.resposta = 'reprovado'
           order by d.decidido_em desc limit 1)
    from public.solicitacoes s
    join public.facilitadores f
      on f.token = p_token and f.ativo and s.facilitador_id = f.id
    left join public.centros_custo cc on cc.codigo = s.centro_custo
   where s.status <> 'encerrado (teste)'
   order by (s.status in ('reprovado','aprovado') or s.etapa_atual is null), s.aberto_em desc
   limit greatest(1, least(coalesce(p_limite, 80), 300));
$function$;

-- ---------------------------------------------------------------------------
-- Do card para quem pediu: é o que o aviso de mudança de etapa precisa saber.
-- Devolve `etapa_atual` e `status` junto, e o fluxo confere contra eles antes
-- de falar — a coluna do card muda ANTES de a trava da cotação conferir, e
-- avisar pela coluna faria o robô mentir.
-- ---------------------------------------------------------------------------
create or replace function public.quem_pediu_o_card(p_card_id text)
returns table (numero text, facilitador text, slack_user_id text, token text,
               etapa_atual text, status text)
language sql security definer set search_path to 'public'
as $function$
  select s.numero, f.nome, f.slack_user_id, f.token, s.etapa_atual, s.status
    from public.solicitacoes s
    join public.facilitadores f on f.id = s.facilitador_id and f.ativo
   where s.card_id = p_card_id
   limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- Os dois links de quem digitou /compras: abrir uma compra e acompanhar as que
-- já abriu. Função NOVA em vez de mexer na `facilitador_por_slack`: trocar o
-- tipo de retorno de uma função em uso exige derrubá-la primeiro, e derrubar
-- função que outro fluxo chama é quebrar o que roda para ganhar uma coluna.
-- ---------------------------------------------------------------------------
create or replace function public.meus_links_do_slack(p_uid text)
returns table (id text, nome text, email text, token text, em_aberto bigint)
language sql security definer set search_path to 'public'
as $function$
  select f.id, f.nome, f.email, f.token,
         (select count(*) from public.solicitacoes s
           where s.facilitador_id = f.id
             and s.etapa_atual is not null
             and s.status <> 'encerrado (teste)')
    from public.facilitadores f
   where f.slack_user_id = p_uid and f.ativo
   limit 1;
$function$;

revoke all on function public.facilitador_do_token(text)      from public;
revoke all on function public.minhas_solicitacoes(text, int)  from public;
revoke all on function public.quem_pediu_o_card(text)         from public;
revoke all on function public.meus_links_do_slack(text)       from public;
grant execute on function public.facilitador_do_token(text)     to anon, authenticated;
grant execute on function public.minhas_solicitacoes(text, int) to anon, authenticated;
grant execute on function public.quem_pediu_o_card(text)        to service_role;
grant execute on function public.meus_links_do_slack(text)      to service_role;
