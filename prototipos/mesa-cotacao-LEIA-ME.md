# Mesa de Cotação — protótipo

`mesa-cotacao.html` é um **protótipo clicável**: não conversa com o Supabase e
guarda tudo em memória. Serve para validar a tela com o comprador antes de levar
para o `compras.html`, que é a tela de cotação que grava de verdade.

```
python3 prototipos/teste-mesa-cotacao.py    # percorre todos os cliques (Playwright)
```

## O que ele acrescenta ao `compras.html`

O `compras.html` já tem a lista de solicitações e a grade com Fornecedor 1, 2 e 3
(grava `fornecedor_1..3` e `preco_1..3`). A Mesa soma:

- **abas por família** dentro da solicitação;
- **escolha do fornecedor por item** (✓), podendo dividir o pedido;
- por fornecedor: **desconto %, frete, prazo de entrega e condição de pagamento**;
- **resumo para o aprovador** e botão **Enviar para aprovação gerencial**;
- abas Para cotar / Devolvidas / Enviadas, com o caminho de devolução e reenvio.

## Fornecedor único

Quando o solicitante marca fornecedor único, o mapa abre com **uma coluna só**,
com a justificativa dele em destaque no topo. Nesse caso não existe aviso de
"menos de 3 cotações" nem comparação de menor preço — só o preço daquele
fornecedor. É a mesma regra que o `compras.html` já aplica.

## Tipo de compra

A fila filtra por **Normal** e **Urgente**. **Mensal** aparece marcada como
"em breve" e não filtra: a compra mensal segue outro fluxo e ainda não passa
pela mesa do comprador.

## Fluxo de telas

Fila → clique na linha abre o modal de detalhe (mesmo do `painel.html`) →
**Cotar esta solicitação** → mapa. O botão **Cotar** na linha pula o modal.

**Em aberto:** manter o modal no meio ou ir da fila direto ao mapa, com os dados
do pedido num painel recolhível no topo.

## Regras (a validar com Compras)

- Total do fornecedor = itens escolhidos − desconto % + frete. O frete só entra
  se o fornecedor ganhou algum item (mesma trava 3 da planilha comparativa).
- "Menor preço" compara já com o desconto do fornecedor. Vazio e zero nunca vencem.
- **Bloqueiam o envio:** item sem escolha; vencedor sem nome, frete, prazo ou
  condição; nome repetido na família; desconto fora de 0–100; preço inválido;
  prazo fracionado.
- **Viram aviso**, e aí a observação para o aprovador é obrigatória: item com
  menos de 3 preços e escolha que não é o menor preço. Reenvio de cotação
  devolvida sempre pede observação.
- Depois de enviada, a cotação fica só leitura até o aprovador responder.

## Falta para ligar no banco

- **Nome das famílias**: o catálogo só tem o código (IA, MG, MM…).
- A lista de fornecedores do protótipo é uma amostra de 120 nomes reais do
  cadastro do GR, só para o campo de busca. Em produção a tela lê a tabela
  `fornecedores`, que recebeu 3.568 cadastros ativos (categorias FORNECEDOR e
  PRESTAÇÃO DE SERVIÇOS) importados da planilha do GR em 22/09/2026.
- Campos para o item escolhido e para desconto, frete, prazo e condição por
  fornecedor. `cotacoes` já tem `prazo_entrega` e `custo_entrega`, e
  `cotacao_pagamentos.ajuste_percentual` serve para o desconto. Falta onde
  marcar o item escolhido (ex.: `cotacao_precos.selecionado`).
- O envio precisa mover `solicitacoes.etapa_atual` para `gerencial` e registrar
  em `decisoes`.

## Ajustes visuais conhecidos

- No rodapé do mapa, o "R$" do frete fica à esquerda e desalinha a coluna em
  relação ao desconto (%) e ao prazo (dias).
- O nome do fornecedor corta no cabeçalho em telas médias.
