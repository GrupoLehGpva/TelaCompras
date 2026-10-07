-- PRONTO PARA APLICAR SÓ DEPOIS DA CONFIRMAÇÃO DO FINANCEIRO (planilha unidades-centro-ie-para-o-financeiro.xlsx).
-- Sem mapeamento, a OC dessas unidades fica bloqueada na montagem (desde 07/10) — antes saía e o GR recusava.
-- Ajuste os códigos que o financeiro mudar antes de rodar.

insert into centros_investimento_gr (unidade, codigo_gr, nome_gr, atualizado_em) values
  -- com pedidos em aberto (urgente)
  ('RHAETIA 208 - ÁGUAS BELAS', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 202 - ÁGUAS BELAS', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 107 - SCHERER',     38, 'SUINOCULTURA', now()),
  ('RHAETIA 109 - MASTEKE',     38, 'SUINOCULTURA', now()),
  ('RHAETIA 115 - TAIPA',       38, 'SUINOCULTURA', now()),
  ('RHAETIA 205 - MATADOURO',   38, 'SUINOCULTURA', now()),
  ('RHAETIA 209 - J. STECHER',  38, 'SUINOCULTURA', now()),
  -- demais granjas
  ('RHAETIA 101 - CADEADO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 102 - BOQUEIRÃO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 103 - STOETZER', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 104 - ALECRIM', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 105 - ALCEU LUPEPSA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 106 - ARTÊMIO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 110 - NOVOSELO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 111 - NÚCLEO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 112 - PASSO DA LONTRA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 113 - LAPA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 201 - CADEADO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 203 - STOETZER', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 204 - ROMANA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 206 - PLETZ', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 207 - SCHERER', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 210 - NOVOSELO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 211 - NÚCLEO', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 212 - PASSO DA LONTRA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 213 - LAPA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 214 - DETLINGER', 38, 'SUINOCULTURA', now()),
  ('RHAETIA 215 - NOVA ESTÂNCIA', 38, 'SUINOCULTURA', now()),
  ('RHAETIA CENTRAL COLETAS', 38, 'SUINOCULTURA', now()),
  ('PARCERIA GRANJAS NÚCLEO', 38, 'SUINOCULTURA', now()),
  -- outras unidades
  ('TRANSPORTES SUINOCULTURA', 42, 'FRETES', now()),
  ('TRANSPORTES FÁBRICA DE RAÇÃO', 42, 'FRETES', now()),
  ('TRANSPORTES AGRICULTURA', 42, 'FRETES', now()),
  ('TRANSPORTE PIAUÍ', 42, 'FRETES', now()),
  ('AGRICULTURA - PIAUÍ', 59, 'AGRICULTURA - PIAUÍ.', now()),
  ('PECUÁRIA CONFINAMENTO', 46, 'PECUÁRIA', now()),
  ('BENFEITORIAS E INVESTIMENTOS', 53, 'BENFEITORIAS/ INVESTIMENTOS', now()),
  ('CHAMPS LEH AGROPECUÁRIA', 78, 'CHAMPS LEH', now()),
  ('DJAKOVO PARTICIPACOES LTDA.', 112, 'DJAKOVO PARTICIPACOES LTDA', now()),
  ('FRISIA', 118, 'FRISIA', now())
  -- ('ALMOXARIFADO NORICUM', ??, '??', now())  -- aguardando o financeiro
on conflict (unidade) do update
  set codigo_gr = excluded.codigo_gr, nome_gr = excluded.nome_gr, atualizado_em = now();

-- Depois do mapeamento: liberar a C2610-00032 (recusada pelo GR) para ser montada de novo.
-- select oc_refazer(o.id, 'TI · centro de investimento mapeado')
--   from ordens_compra o join solicitacoes s on s.id = o.solicitacao_id
--  where s.numero = 'C2610-00032' and o.situacao = 'recusada';
