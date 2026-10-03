-- Formulário (03/10): a compra é para CONSUMO ou ESTOQUE — obrigatório, por pedido (não por item).
-- Já aplicado no Supabase (migrações telas_32, 32b, 32c, 32d). Este arquivo é o registro.

alter table solicitacoes add column if not exists destino text check (destino is null or destino in ('consumo', 'estoque'));
-- pedidos antigos ficam com destino nulo ("não informado" nas telas)

-- Configuração (oc_config):
--   destino_obrigatorio  false até o push do formulário novo; depois do push:
--                          update oc_config set destino_obrigatorio = true where id;
--   destino_consumo_gr   'Consumo'  — palavra que vai no campo Destino de cada item da OC no GR
--   destino_estoque_gr   nulo       — falta confirmar a palavra do GR para estoque; enquanto for nulo,
--                                     a OC de pedido de estoque sai como o workflow montou ("Consumo").
--                          Confirmado:  update oc_config set destino_estoque_gr = 'Estoque' where id;
alter table oc_config add column if not exists destino_consumo_gr text default 'Consumo';
alter table oc_config add column if not exists destino_estoque_gr text;
alter table oc_config add column if not exists destino_obrigatorio boolean not null default false;

-- Funções alteradas:
--   abrir_pedido_telas  recusa destino fora da lista ('sem_destino'); vazio só passa enquanto destino_obrigatorio = false
--   criar_solicitacao   grava destino (valor fora da lista vira nulo)
--   pedido_telas, fila_do_aprovador, fila_do_comprador, painel_diretoria  devolvem 'destino'
--   oc_preparar         aplica o Destino em todos os itens do payload (_oc_aplicar_destino);
--                       no pacote do lote, só quando todos os pedidos da OC têm o mesmo destino
-- Testes: _teste_caminho_telas() DE1–DE7 (180/180); _teste_lote_mensal() 70/70.
