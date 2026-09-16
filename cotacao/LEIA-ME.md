# A planilha de cotação comparativa

`MODELO-Cotacao.xlsx` é o **template**. Ele fica no OneDrive, em
**`/Compras/`** — junto do `MODELO-Fornecedor.xlsx`, porque ali é a pasta dos
modelos; `/Compras/Cotacoes/` é a pasta dos arquivos gerados. O n8n copia um por
solicitação, escrevendo só o cabeçalho e os itens. As fórmulas moram no template
— não são escritas a cada pedido.

## Não edite o .xlsx à mão

Ele é **gerado** por `gerar-comparativa.py`. Editar o arquivo direto faz a
próxima geração apagar a mudança, em silêncio.

```
python3 gerar-comparativa.py cotacao/MODELO-Cotacao.xlsx
python3 teste-comparativa.py                # prova as contas
python3 exemplo-comparativa.py              # gera um exemplo preenchido
```

## A geometria

| | |
|---|---|
| Itens | linhas **11 a 210** — 200 itens |
| Fornecedores | colunas **H, I, J** — três, igual ao card |
| Referência internet | coluna **K**, preenchida à mão pelo comprador |
| Calculadas | L menor preço · M vencedor · N preço por kg/L · O total do item |
| Ocultas | P, Q, R — o total de cada fornecedor por item |
| Resumo | a partir da linha **213**; os três fornecedores em **217 a 219** |
| Frete | **G217, G218, G219** — o comprador preenche |

## Código e descrição são texto, não número

As colunas B e C têm formato `@` (Texto). Sem isso o Excel converte `'8210'` no
número 8210 na hora em que o n8n escreve, e um código com zero à esquerda
(`'0081'`) volta como 81 — perdido em silêncio. Os códigos do catálogo do GR são
pura numeração, então não é hipótese.

Foi descoberto **lendo a planilha de volta pela API** depois de escrever, não
por dedução: a escrita retornou sucesso e só a leitura mostrou o tipo trocado.

## As três travas

1. **Célula vazia e preço zero nunca vencem** a disputa de menor preço.
2. **Fornecedor que deixou item em branco não entra na comparação por total.**
   Ele continua ganhando itens individuais; só não disputa o pedido inteiro.
3. **A economia de comprar item a item já desconta os fretes a mais** que a
   divisão do pedido causaria. Só entra o frete de quem ganha alguma coisa.

Não são detalhe: a planilha antiga elegia como vencedor quem não tinha cotado o
item — aconteceu na LORENZETTI RESISTENCIA — e a Comtudo parecia R$ 99,90 mais
barata tendo deixado item em branco.

## O que mudou do modelo antigo

- **3 fornecedores, não 5.** O card comporta três; com cinco, o quarto existiria
  na planilha e não no card, que é o que o aprovador lê.
- **Empresa no cabeçalho** (H6). Entrou no pedido em 16/09 e é ela que vai no
  topo da ordem de compra do GR.
- **200 linhas de item, não 60.** O modelo antigo calculava até a linha 70: um
  61º item era escrito e sumia de todas as contas, com a planilha ainda dizendo
  "Cotou todos os itens" e "0 itens em branco". Nada acusava.

O teto de 200 continua sendo um teto. **Quem tem que gritar é o n8n**, antes de
gerar, se a solicitação passar disso — um limite calado é o bug que acabou de
ser removido.

## Por que o .xlsx não está no Git

O `.gitignore` bloqueia `*.xlsx`, porque o repositório é público e já houve
planilha com nome, e-mail e hierarquia de gente de verdade na pasta.

Isso não é perda: **o arquivo é reproduzível pelo script**, que está
versionado. Quem clonar o repositório roda `gerar-comparativa.py` e tem o
modelo idêntico. O que precisa existir fora do Git é a cópia no OneDrive, que é
de onde o n8n copia.
