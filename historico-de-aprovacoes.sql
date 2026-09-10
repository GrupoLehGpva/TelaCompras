-- ===========================================================================
-- HISTÓRICO DE APROVAÇÕES
--
-- Pedido do Grupo Leh em 10/09: um botão que mostra o que a pessoa já decidiu,
-- "sem poluir as aprovações que precisam ser feitas". Por isso é outra consulta
-- e outra aba — o que já foi resolvido nunca volta para a lista de pendências.
--
-- A trava é a mesma da fila: o token é a credencial. Token que não existe ou
-- aprovador desativado devolve vazio, nunca a lista de outra pessoa.
-- ===========================================================================

-- `decisoes` guardava só o NOME de quem decidiu, e nome não serve para filtrar:
-- dois homônimos, ou alguém que troca de sobrenome no cadastro, e o histórico
-- passa a mostrar decisão que não é dele.
alter table public.decisoes add column if not exists aprovador_id text;

create index if not exists ix_decisoes_aprovador
  on public.decisoes (aprovador_id, decidido_em desc);

comment on column public.decisoes.aprovador_id is
  'id em `aprovadores` de quem decidiu. É por ele que a tela monta o histórico.';

-- ---------------------------------------------------------------------------
-- O vocabulário da tabela
--
-- `decisoes` nasceu no desenho antigo falando 'sim'/'nao'. O sistema que roda
-- hoje fala 'aprovado'/'reprovado'. Enquanto as duas línguas conviveram, TODA
-- decisão vinda da tela era recusada pelo CHECK: a função dava rollback, o card
-- já tinha andado no ClickUp, e o pedido continuava na fila de quem já tinha
-- decidido. Foi o bug de 10/09.
-- ---------------------------------------------------------------------------
alter table public.decisoes drop constraint if exists decisoes_resposta_check;
alter table public.decisoes drop constraint if exists ck_recusa_tem_motivo;

alter table public.decisoes
  add constraint decisoes_resposta_check
  check (resposta in ('aprovado', 'reprovado'));

alter table public.decisoes
  add constraint ck_recusa_tem_motivo
  check (resposta = 'aprovado'
         or (motivo is not null and length(trim(motivo)) > 0));

comment on column public.decisoes.resposta is
  'aprovado | reprovado — mesmo vocabulário das telas, do n8n e de solicitacoes.status';

-- ---------------------------------------------------------------------------
-- O que este aprovador já decidiu.
--
-- `situacao` diz onde o pedido está HOJE, não onde estava na hora do clique: é
-- a pergunta que a pessoa faz quando volta ao histórico ("aprovei, e daí?").
-- ---------------------------------------------------------------------------
create or replace function public.historico_de_aprovacoes(
  p_token  text,
  p_limite int default 60
) returns table (
  id                uuid,
  numero            text,
  etapa             text,
  resposta          text,
  motivo            text,
  decidido_em       timestamptz,
  facilitador       text,
  centro_custo_nome text,
  situacao          text
)
language sql security definer set search_path to 'public'
as $function$
  select d.solicitacao_id, d.numero, d.etapa, d.resposta, d.motivo, d.decidido_em,
         s.facilitador,
         cc.nome,
         case
           when s.status = 'reprovado'       then 'reprovado'
           when s.status = 'aprovado'        then 'aprovado · liberado para compra'
           when s.etapa_atual = 'cotacao'    then 'em cotação'
           when s.etapa_atual = 'gerencial'  then 'aguardando o gerente'
           when s.etapa_atual = 'financeiro' then 'aguardando o financeiro'
           when s.etapa_atual = 'lider'      then 'aguardando a liderança'
           else coalesce(s.status, '—')
         end
    from public.decisoes d
    join public.aprovadores a
      on a.token = p_token and a.ativo and d.aprovador_id = a.id
    join public.solicitacoes s on s.id = d.solicitacao_id
    left join public.centros_custo cc on cc.codigo = s.centro_custo
   order by d.decidido_em desc
   limit greatest(1, least(coalesce(p_limite, 60), 200));
$function$;

revoke all on function public.historico_de_aprovacoes(text, int) from public;
grant execute on function public.historico_de_aprovacoes(text, int) to anon, authenticated;
