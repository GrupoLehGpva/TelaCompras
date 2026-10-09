-- 09/10: centros de investimento das unidades que faltavam (lista confirmada pelo Guilherme).
-- RHAETIA já estavam no 38 (rhaetia-suinocultura.sql). FRISIA fica de fora: sem unidade de negócio
-- no GR; verificar se precisa criar (o centro de custo 3498 FRISIA está inativo no formulário).
insert into centros_investimento_gr (unidade, codigo_gr, nome_gr, atualizado_em) values
 ('PARCERIA GRANJAS NÚCLEO', 38, 'SUINOCULTURA', now()),
 ('TRANSPORTES SUINOCULTURA', 38, 'SUINOCULTURA', now()),
 ('TRANSPORTES FÁBRICA DE RAÇÃO', 41, 'FÁBRICA DE RAÇÃO', now()),
 ('TRANSPORTES AGRICULTURA', 29, 'AGRICULTURA_SUL', now()),
 ('TRANSPORTE PIAUÍ', 59, 'AGRICULTURA - PIAUÍ.', now()),
 ('AGRICULTURA - PIAUÍ', 59, 'AGRICULTURA - PIAUÍ.', now()),
 ('ALMOXARIFADO NORICUM', 44, 'ESCRITÓRIO CENTRAL', now()),
 ('BENFEITORIAS E INVESTIMENTOS', 53, 'BENFEITORIAS/ INVESTIMENTOS', now()),
 ('CHAMPS LEH AGROPECUÁRIA', 78, 'CHAMPS LEH', now()),
 ('DJAKOVO PARTICIPACOES LTDA.', 112, 'DJAKOVO PARTICIPACOES LTDA', now())
on conflict (unidade) do update set codigo_gr = excluded.codigo_gr, nome_gr = excluded.nome_gr, atualizado_em = now();
