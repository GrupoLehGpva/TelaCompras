-- ============================================================================
-- Lideranças, facilitadores e compradores · Grupo Leh
-- Gerado de "Etapas_usuários_e_permissões.xlsx" em 10/09/2026.
--
-- Linhas 2 a 13 da planilha entram ATIVAS. Da 14 em diante entram desligadas,
-- prontas para ligar depois — foi o combinado com a Elisabeth.
--
-- Sete dos doze facilitadores ativos ainda não têm conta no Slack. Eles ficam
-- cadastrados com slack_user_id nulo: o formulário procura a pessoa pelo id do
-- Slack, então até a conta existir eles simplesmente não abrem pedido. Nada
-- quebra, e ligar depois é só preencher a coluna.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Compradores. Cada um terá o seu próprio kanban no ClickUp; enquanto o
--    quadro não existir, clickup_list_id fica nulo e o card cai na lista atual.
-- ---------------------------------------------------------------------------
create table if not exists public.compradores (
  id              text primary key,
  nome            text not null,
  email           text,
  slack_user_id   text,
  clickup_list_id text,
  ativo           boolean not null default true,
  atualizado_em   timestamptz not null default now()
);
alter table public.compradores enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Facilitadores. A tabela é recriada: o slack_user_id era chave primária e
--    não serve mais, porque quem ainda não tem conta precisa existir aqui.
--    Agora a chave é um id próprio e o Slack é uma coluna opcional e única.
-- ---------------------------------------------------------------------------
drop table if exists public.facilitadores cascade;
create table public.facilitadores (
  id            text primary key,
  nome          text not null,
  email         text,
  slack_user_id text unique,
  gerencia      text,
  setor         text,
  unidade       text,           -- o que a tela mostra ao lado do nome
  substituto    text,           -- responsável na ausência
  superior_id   text references public.aprovadores(id),
  gerente_id    text references public.aprovadores(id),
  comprador_id  text references public.compradores(id),
  linha_planilha int,
  ativo         boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.facilitadores enable row level security;

-- Sem política de leitura: a tabela guarda o organograma inteiro. A tela pega
-- só a pessoa dela, pela função lá embaixo.

-- ---------------------------------------------------------------------------
-- 3) Quem aprova
-- ---------------------------------------------------------------------------
insert into public.aprovadores (id, token, nome, email, slack_user_id, etapas, ativo) values
  ('a-brandao', 'ap-2b330a7639aeb4d21054e53d', 'ALVARO BRANDAO FILHO', 'a.brandao@leh.com.br', 'U0BN5DSNAE9', '{lider,gerencial}', true),
  ('edilson', 'ap-8abcaaca6be858a41fadc562', 'EDILSON KLOSTER', 'edilson@leh.com.br', 'U0BQQ4XBLVC', '{lider,gerencial}', true),
  ('elton', 'ap-94236b4b0399891bba68af89', 'ELTON AMBROSINI', 'elton@leh.com.br', null, '{lider,gerencial}', true),
  ('fabio', 'ap-c9de1b3c9d504195b98ea155', 'FABIO LIBER SANTOS', 'fabio@leh.com.br', 'U0BQVPNC6UU', '{lider}', true),
  ('jaciel', 'ap-4f009154bf57711a650f4384', 'JACIEL DIDUCH', 'jaciel@leh.com.br', 'U0BQVQDTU76', '{lider}', true),
  ('jamil', 'ap-054962598fa581663e922efe', 'JAMIL HECAVEI', 'jamil@leh.com.br', 'U0BQS35NH7U', '{lider}', true),
  ('junior', 'ap-8a8845073aad1c611e191ce7', 'JOSE DE CARVALHO JUNIOR', 'junior@leh.com.br', null, '{lider,gerencial}', true),
  ('wienfried', 'ap-2405bfac1bf8566dc2d81a7b', 'WIENFRIED MATTHIAS LEH', 'wienfried@leh.com.br', 'U0BNAQBBRU1', '{financeiro}', true)
on conflict (id) do update set token = excluded.token, nome = excluded.nome,
  email = excluded.email, slack_user_id = excluded.slack_user_id,
  etapas = excluded.etapas, ativo = true, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- 4) Compradores
-- ---------------------------------------------------------------------------
insert into public.compradores (id, nome, email, slack_user_id) values
  ('adelson', 'ADELSON ALVES DA SILVA', 'adelson@leh.com.br', null),
  ('almox-fazendabruna', 'ANTONIO BERNARDO DIAS DA SILVA', 'almox_fazendabruna@leh.com.br', null),
  ('eliarde', 'ELIARDE DE AMORIM SILVA', 'eliarde@leh.com.br', null),
  ('almoxarifadopi', 'ERNANI MIRANDA DE SOUSA', 'almoxarifadopi@leh.com.br', null),
  ('herisson', 'HERISSON LUCAS LAPCZAK', 'herisson@leh.com.br', 'U0BTEULHL3G')
on conflict (id) do update set nome = excluded.nome, email = excluded.email,
  slack_user_id = excluded.slack_user_id, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- 5) Facilitadores
-- ---------------------------------------------------------------------------
insert into public.facilitadores (id, nome, email, slack_user_id, gerencia, setor, unidade, substituto, superior_id, gerente_id, comprador_id, linha_planilha, ativo) values
  ('eduarda', 'MARIA EDUARDA ANTUNES MACIEL SIQUEIRA', 'eduarda@leh.com.br', 'U0BNAQ6J99P', 'Administrativa', 'Administrativo', 'Administrativo', 'ANA CAMILLA DE OLIVEIRA', 'a-brandao', 'a-brandao', 'herisson', 2, true),
  ('elisabeth', 'ELISABETH STOCK', 'elisabeth@leh.com.br', 'U0BNUEZF290', 'Administrativa', 'Administrativo', 'Administrativo', 'ANA CAMILLA DE OLIVEIRA', 'a-brandao', 'a-brandao', 'herisson', 3, true),
  ('ana-camilla', 'ANA CAMILLA DE OLIVEIRA', 'ana.camilla@leh.com.br', 'U0BQS2KV8GJ', 'Administrativa', 'Administrativo', 'Administrativo', 'ELISABETH STOCK', 'a-brandao', 'a-brandao', 'herisson', 4, true),
  ('alisson', 'ALISSON RICARDO KRASSUSKI', 'alisson@leh.com.br', 'U0BTJQ7AEAV', 'Administrativa', 'Fábrica de Ração', 'Fábrica de Ração', 'GELSON NUNES HILARIO', 'a-brandao', 'a-brandao', 'herisson', 5, true),
  ('qualidadeassegurada', 'GELSON NUNES HILARIO', 'qualidadeassegurada@leh.com.br', null, 'Administrativa', 'Fábrica de Ração', 'Fábrica de Ração', 'ALISSON RICARDO KRASSUSKI', 'a-brandao', 'a-brandao', 'herisson', 6, true),
  ('gustavo-berger', 'GUSTAVO LEONARDO BERGER', 'gustavo.berger@leh.com.br', null, 'Agrícola e Pecuária', 'Agricultura Paraná, Pecuária e Reflorestamento', 'Agricultura Paraná, Pecuária e Reflorestamento', 'JOSE DE CARVALHO JUNIOR', 'junior', 'junior', 'herisson', 7, true),
  ('almoxarifadopi', 'ERNANI MIRANDA DE SOUSA', 'almoxarifadopi@leh.com.br', null, 'Agrícola Piauí', 'Agricultura Piauí - Operações Jatobá', 'Agricultura Piauí - Operações Jatobá', 'ADELSON ALVES DA SILVA', 'elton', 'elton', 'almoxarifadopi', 8, true),
  ('almox-fazendabruna', 'ANTONIO BERNARDO DIAS DA SILVA', 'almox_fazendabruna@leh.com.br', null, 'Agrícola Piauí', 'Agricultura Piauí - Operações Bruna', 'Agricultura Piauí - Operações Bruna', 'ELIARDE DE AMORIM SILVA', 'elton', 'elton', 'almox-fazendabruna', 9, true),
  ('adelson', 'ADELSON ALVES DA SILVA', 'adelson@leh.com.br', null, 'Agrícola Piauí', 'Agricultura Piauí - Administrativo Jatobá', 'Agricultura Piauí - Administrativo Jatobá', 'PEDRO VIEIRA DOS REIS NETO', 'elton', 'elton', 'adelson', 10, true),
  ('pedro', 'PEDRO VIEIRA DOS REIS NETO', 'pedro@leh.com.br', null, 'Agrícola Piauí', 'Agricultura Piauí - Administrativo Jatobá', 'Agricultura Piauí - Administrativo Jatobá', 'ADELSON ALVES DA SILVA', 'elton', 'elton', 'adelson', 11, true),
  ('eliarde', 'ELIARDE DE AMORIM SILVA', 'eliarde@leh.com.br', null, 'Agrícola Piauí', 'Agricultura Piauí - Administrativo Bruna', 'Agricultura Piauí - Administrativo Bruna', 'ANTONIO BERNARDO DIAS DA SILVA', 'elton', 'elton', 'eliarde', 12, true),
  ('leticia', 'LETICIA SANTOS SAVOLDI', 'leticia@leh.com.br', 'U0BQU1H3GBT', 'Suinocultura', 'Assistência Técnica Veterinária', 'Assistência Técnica Veterinária', 'EDILSON KLOSTER', 'edilson', 'edilson', 'herisson', 13, true),
  ('rhaetia101', 'LUCIMAR ALVES', 'rhaetia101@leh.com.br', null, 'Suinocultura', 'RH 101/201', 'RH 101/201', 'JAMIL HECAVEI', 'jamil', 'edilson', 'herisson', 14, false),
  ('rhaetia103', 'WAGNER MARTINS', 'rhaetia103@leh.com.br', null, 'Suinocultura', 'RH 103/203', 'RH 103/203', 'JACIEL DIDUCH', 'jaciel', 'edilson', 'herisson', 15, false),
  ('rhaetia104', 'ACIR MACEDO DOS SANTOS', 'rhaetia104@leh.com.br', null, 'Suinocultura', 'RH 104', 'RH 104', 'FABIO LIBER SANTOS', 'fabio', 'edilson', 'herisson', 16, false),
  ('rhaetia105', 'HERIVELTON CAMARGO FREITAS', 'rhaetia105@leh.com.br', null, 'Suinocultura', 'RH 105', 'RH 105', 'FABIO LIBER SANTOS', 'fabio', 'edilson', 'herisson', 17, false),
  ('rhaetia106', 'DANIEL LIBER SANTOS', 'rhaetia106@leh.com.br', null, 'Suinocultura', 'RH 106', 'RH 106', 'FABIO LIBER SANTOS', 'fabio', 'edilson', 'herisson', 18, false),
  ('rhaetia107', 'EDNILSO KARPINSKI DE CAMPOS', 'rhaetia107@leh.com.br', null, 'Suinocultura', 'RH 107/207', 'RH 107/207', 'JAMIL HECAVEI', 'jamil', 'edilson', 'herisson', 19, false),
  ('rhaetia109', 'VALDEMIR DOS SANTOS', 'rhaetia109@leh.com.br', null, 'Suinocultura', 'RH 109', 'RH 109', 'JACIEL DIDUCH', 'jaciel', 'edilson', 'herisson', 20, false),
  ('rhaetia115', 'JOSE RONILSON MENDES', 'rhaetia115@leh.com.br', null, 'Suinocultura', 'RH 115', 'RH 115', 'JACIEL DIDUCH', 'jaciel', 'edilson', 'herisson', 21, false),
  ('rodrigo-jose-dos-santos', 'RODRIGO JOSE DOS SANTOS', null, null, 'Suinocultura', 'RH 202', 'RH 202', 'JAMIL HECAVEI', 'jamil', 'edilson', 'herisson', 22, false),
  ('anderson-jose-de-jesus', 'ANDERSON JOSE DE JESUS', null, null, 'Suinocultura', 'RH 204', 'RH 204', 'FABIO LIBER SANTOS', 'fabio', 'edilson', 'herisson', 23, false),
  ('edilson-pires', 'EDILSON PIRES', null, null, 'Suinocultura', 'RH 205', 'RH 205', 'FABIO LIBER SANTOS', 'fabio', 'edilson', 'herisson', 24, false),
  ('jeferson-ferreira-machado', 'JEFERSON FERREIRA MACHADO', null, null, 'Suinocultura', 'RH 208', 'RH 208', 'JAMIL HECAVEI', 'jamil', 'edilson', 'herisson', 25, false),
  ('josiel-jesus-correia-domingues', 'JOSIEL JESUS CORREIA DOMINGUES', null, null, 'Suinocultura', 'RH 209', 'RH 209', 'JAMIL HECAVEI', 'jamil', 'edilson', 'herisson', 26, false),
  ('maicon-batista-lopes', 'MAICON BATISTA LOPES', null, null, 'Suinocultura', 'RH 215', 'RH 215', 'JACIEL DIDUCH', 'jaciel', 'edilson', 'herisson', 27, false)
on conflict (id) do update set nome = excluded.nome, email = excluded.email,
  slack_user_id = excluded.slack_user_id, gerencia = excluded.gerencia,
  setor = excluded.setor, unidade = excluded.unidade, substituto = excluded.substituto,
  superior_id = excluded.superior_id, gerente_id = excluded.gerente_id,
  comprador_id = excluded.comprador_id, linha_planilha = excluded.linha_planilha,
  ativo = excluded.ativo, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- 6) A tela pega só a pessoa dela, nunca o organograma inteiro
-- ---------------------------------------------------------------------------
create or replace function public.facilitador_por_slack(p_uid text)
returns table (nome text, email text, unidade text)
language sql
security definer
set search_path = public
as $$
  select f.nome, f.email, f.unidade
    from public.facilitadores f
   where f.ativo and f.slack_user_id = p_uid
   limit 1;
$$;
comment on function public.facilitador_por_slack(text) is
  'Dados do facilitador pelo id do Slack. Existe para a tela não precisar ler a tabela inteira, que guarda o organograma.';
revoke all on function public.facilitador_por_slack(text) from public;
grant execute on function public.facilitador_por_slack(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
select (select count(*) from public.aprovadores)                              as aprovadores,
       (select count(*) from public.compradores)                              as compradores,
       (select count(*) from public.facilitadores)                            as facilitadores,
       (select count(*) from public.facilitadores where ativo)                as ativos,
       (select count(*) from public.facilitadores where ativo and slack_user_id is not null) as ativos_com_slack;
