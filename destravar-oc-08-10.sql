-- 08/10: destrava as duas OCs paradas (já aplicado; viraram OC 3974 e 3975 no GR).
-- C2610-00032: Rhaetia 208 → centro de investimento 38 SUINOCULTURA (confirmado pelo Guilherme).
insert into centros_investimento_gr (unidade, codigo_gr, nome_gr, atualizado_em)
values ('RHAETIA 208 - ÁGUAS BELAS', 38, 'SUINOCULTURA', now())
on conflict (unidade) do update set codigo_gr = 38, nome_gr = 'SUINOCULTURA', atualizado_em = now();
-- C2609-00019: fornecedor H&A cadastrado pelo Herisson (GR 10032) ligado ao mapa, condição 30 dias · Boleto.
update mapa_fornecedores f set fornecedor_id = '10032', condicao = '30 dias', forma_pagamento = 'Boleto'
  from solicitacoes s
 where s.id = f.solicitacao_id and s.numero = 'C2609-00019' and f.fornecedor_nome = 'H&A Manutenção Industrial';
-- Libera as duas para a automação montar de novo.
select s.numero, oc_refazer(o.id, 'TI · centro 38 na Rhaetia 208 / fornecedor H&A cadastrado')
  from ordens_compra o join solicitacoes s on s.id = o.solicitacao_id
 where s.numero in ('C2610-00032', 'C2609-00019') and o.ambiente = 'producao' and o.situacao = 'recusada';
