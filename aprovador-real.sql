-- ============================================================================
-- O APROVADOR FICTÍCIO SAI, AS PESSOAS REAIS ENTRAM
--
-- Decisão do Guilherme em 16/09: deixar pronto para rodar na sexta, aceitando
-- que DMs comecem a chegar para pessoas de verdade.
--
-- ## O QUE ESTAVA ERRADO
--
-- O facilitador `ensaio` (o Slack do Guilherme) apontava para `teste-elisabeth`
-- nas três etapas, e `teste-elisabeth` carregava o **mesmo slack_user_id** e o
-- **mesmo e-mail** do `ensaio`.
--
-- Resultado: `papel_do_solicitante('ensaio')` devolvia `'financeiro'`, e todo
-- pedido dele nascia direto em `compras · cotação`, pulando as três aprovações.
-- Nada acusava, porque a regra do item 10 estava funcionando **exatamente como
-- projetada** — em cima de um dado que mentia. O fluxo não tinha bug; o
-- cadastro dizia que quem pedia era o próprio aprovador financeiro.
--
-- A colisão de e-mail foi criada por mim na manhã do mesmo dia: ao tirar o
-- e-mail de uma pessoa real (`elisabeth@leh.com.br`) do aprovador de
-- demonstração, coloquei `ensaio@leh.com.br` — que é o e-mail do próprio
-- solicitante de demonstração. Fechei uma porta e abri outra, e não olhei o
-- `slack_user_id`, que já colidia desde antes.
--
-- A lição, que vale além deste arquivo: identidade de teste que empresta o
-- crachá de alguém não é dado de teste, é dado errado. E dado errado num
-- sistema de alçada não estoura — ele aprova.
--
-- ## O QUE MUDA
--
-- 1. O aprovador fictício vira inativo. **Não é apagado:** SC-DEMO-C,
--    SC-ENSAIO-1 e SC-2026-7241 apontam para ele, e histórico não se apaga.
--    `ativo = false` basta — `filas_pendentes()` filtra por `a.ativo`, então
--    esses três somem da lista de DM e ninguém recebe aviso sobre eles.
-- 2. O facilitador passa a se chamar pelo nome de quem de fato o usa. O DM que
--    o Brandão vai receber diz quem pediu; "ENSAIO · solicitante de
--    demonstração" só confundiria.
-- 3. A alçada passa a ser a real, a mesma da Eduarda e da Elisabeth: liderança
--    e gerência com o Brandão, financeiro com o sr. Wienfried.
--
-- ## O QUE NÃO MUDA
--
-- O `slack_user_id`. O `/compras` continua reconhecendo o Guilherme e deixando
-- ele abrir pedido — era a condição que ele pôs.
--
-- ## CONFERIDO ANTES DE APLICAR, EM TRANSAÇÃO DESFEITA
--
--   papel_do_solicitante('ensaio')   financeiro -> comum
--   etapa_inicial('ensaio')          cotacao    -> lider
--   facilitador_de('U0BL5JPQX97')    continua devolvendo 'ensaio'
--   dos 32 pedidos parados em fila, nenhum aponta para pessoa real
--
-- ## PARA DESFAZER
--
--   update aprovadores set ativo = true where id = 'teste-elisabeth';
--   update facilitadores set superior_id='teste-elisabeth',
--          gerente_id='teste-elisabeth', financeiro_id='teste-elisabeth'
--    where id = 'ensaio';
--
-- Mas atenção: desfazer traz de volta o pulo das três aprovações.
-- ============================================================================

update public.aprovadores
   set ativo = false, atualizado_em = now()
 where id = 'teste-elisabeth';

update public.facilitadores
   set nome          = 'GUILHERME PIMPAO',
       email         = 'ia@leh.com.br',
       superior_id   = 'a-brandao',
       gerente_id    = 'a-brandao',
       financeiro_id = 'wienfried',
       atualizado_em = now()
 where id = 'ensaio';
