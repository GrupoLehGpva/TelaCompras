-- ============================================================================
-- O NÚMERO DA SOLICITAÇÃO PASSA A NASCER NO BANCO
--
-- Antes ele nascia no NAVEGADOR:
--
--     'SC-' + ano + String(Math.floor(Math.random()*9000)+1000)
--
-- Um sorteio entre 9.000 possibilidades, numa coluna com UNIQUE. Não é questão
-- de "se": pelo paradoxo do aniversário, com cerca de 110 pedidos no ano a
-- chance de dois sorteios baterem passa de 50%. Quando batesse, o insert seria
-- recusado e a pessoa perderia o formulário inteiro sem entender por quê.
--
-- Agora: C + ano + mês + sequência do mês.
--
--     C2609-00001   primeira de setembro/26
--     C2609-00042   quadragésima segunda de setembro/26
--     C2610-00001   outubro recomeça do 1
--
-- Cabem 99.999 por mês. Cinco dígitos, e não quatro, por um motivo medido:
-- com quatro, o primeiro número de cinco casas quebraria a ordem alfabética
-- — 'C2609-10000' vem ANTES de 'C2609-9999'. Com cinco, isso só aconteceria
-- acima de 99.999 no mesmo mês.
--
-- Os números SC- antigos continuam valendo; nada é reescrito. A mudança vale
-- para o que nascer daqui para frente.
-- ============================================================================

create table if not exists public.contador_solicitacoes (
  prefixo    text primary key,
  ultimo     int  not null default 0,
  atualizado timestamptz not null default now()
);

comment on table public.contador_solicitacoes is
  'Um contador por prefixo (C+AA+MM). Incremento atômico: duas pessoas enviando '
  'ao mesmo tempo nunca recebem o mesmo número.';

-- Ninguém lê nem escreve esta tabela de fora. Quem mexe é a função abaixo,
-- que roda como dona.
alter table public.contador_solicitacoes enable row level security;
revoke all on table public.contador_solicitacoes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A corrida, e por que este INSERT ... ON CONFLICT resolve
--
-- `select max(numero)+1` é o jeito errado: entre o select e o insert cabe outra
-- transação inteira, e as duas leem o mesmo máximo.
--
-- `insert ... on conflict do update ... returning` é uma operação só. O Postgres
-- segura a linha do prefixo até o commit; a segunda chamada espera, lê o valor
-- já incrementado e recebe o próximo. Sem select prévio, sem janela.
--
-- Efeito colateral bom: se a gravação falhar depois, o contador volta atrás
-- junto, porque está na mesma transação. Não sobra buraco na numeração.
-- ---------------------------------------------------------------------------
create or replace function public.proximo_numero()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- O fuso é de Guarapuava, não do servidor. Um pedido aberto às 22h de 30/09
  -- tem que ser de setembro, e não de outubro por causa do UTC.
  v_prefixo text := 'C' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMM');
  v_seq     int;
begin
  insert into contador_solicitacoes (prefixo, ultimo, atualizado)
       values (v_prefixo, 1, now())
  on conflict (prefixo)
    do update set ultimo = contador_solicitacoes.ultimo + 1, atualizado = now()
    returning ultimo into v_seq;

  return v_prefixo || '-' || lpad(v_seq::text, 5, '0');
end
$function$;

revoke all on function public.proximo_numero() from public;
-- Só a própria criar_solicitacao chama. Não é endpoint: quem puxasse o número
-- de fora queimaria a sequência sem abrir pedido nenhum.
grant execute on function public.proximo_numero() to service_role;
