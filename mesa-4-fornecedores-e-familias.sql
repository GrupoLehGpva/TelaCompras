-- Mesa de Cotação (03/10): até 4 fornecedores e famílias juntas num mapa só.
-- Já aplicado no Supabase (migrações telas_29, telas_29b, telas_29c, telas_30, telas_30b).
-- Este arquivo é o registro; não precisa rodar de novo.

-- telas_29: colunas 1 a 4 (era 1 a 3)
alter table mapa_fornecedores drop constraint mapa_fornecedores_coluna_check;
alter table mapa_fornecedores add constraint mapa_fornecedores_coluna_check check (coluna >= 1 and coluna <= 4);
alter table mapa_precos drop constraint mapa_precos_coluna_check;
alter table mapa_precos add constraint mapa_precos_coluna_check check (coluna >= 1 and coluna <= 4);
alter table mapa_escolhas drop constraint mapa_escolhas_coluna_check;
alter table mapa_escolhas add constraint mapa_escolhas_coluna_check check (coluna >= 1 and coluna <= 4);
alter table lote_mapa_fornecedores drop constraint lote_mapa_fornecedores_coluna_check;
alter table lote_mapa_fornecedores add constraint lote_mapa_fornecedores_coluna_check check (coluna >= 1 and coluna <= 4);
alter table lote_mapa_precos drop constraint lote_mapa_precos_coluna_check;
alter table lote_mapa_precos add constraint lote_mapa_precos_coluna_check check (coluna >= 1 and coluna <= 4);
alter table lote_mapa_escolhas drop constraint lote_mapa_escolhas_coluna_check;
alter table lote_mapa_escolhas add constraint lote_mapa_escolhas_coluna_check check (coluna is null or (coluna >= 1 and coluna <= 4));
-- _telas_resumo_mapa: "for col in 1..3" passou a "for col in 1..4".

-- telas_30: famílias juntas. Cada família continua com as suas linhas no banco
-- (fornecedores iguais); "grupo" lembra quais o comprador juntou (ex.: 'HL+CC').
-- O frete vai inteiro para a primeira família do grupo que ganhou item naquele
-- fornecedor; as outras ficam com 0 (o rateio do lote continua por família).
alter table mapa_fornecedores add column if not exists grupo text check (grupo is null or length(grupo) <= 200);
alter table lote_mapa_fornecedores add column if not exists grupo text check (grupo is null or length(grupo) <= 200);
-- salvar_mapa / salvar_mapa_lote: gravam grupo = left(nullif(trim(x->>'grupo'),''),200).
-- _telas_resumo_mapa e lote_mesa: devolvem 'grupo' em cada fornecedor.

-- Testes no banco: _teste_caminho_telas() E23e (coluna 4), E23f (coluna 5 recusa),
-- E23g (grupo grava e volta); _teste_lote_mensal() P14e (grupo no lote).
