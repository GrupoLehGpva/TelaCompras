# O catálogo de itens do GR

`catalogo-itens.csv` é a lista de itens que o formulário oferece. **7.084 itens**,
extraídos de `Lista de SKUs para pedido de compras.xlsx` (aba *Lista SKUs*), que
veio do Guilherme em 16/09/2026.

## Como o arquivo foi montado

| Coluna do CSV | De onde veio | Por quê |
|---|---|---|
| `codigo` | **Id (GR)** | É a chave. Único, inteiro, de 1 a 8554 — e é por ele que um dia o RPA vai casar o item no GR |
| `descricao` | **Item (Nomeclatura GR - antiga)** | Decisão do Guilherme: a tela mostra o nome como está escrito no GR hoje |
| `familia` | o código de 2 letras (`AA`, `MM`, `HL`…) | 20 famílias; o nome de cada uma mora no `index.html` |
| `unidade` | **UNID** | `UNID`, `KG`, `L`, `SC`, `M`, `DOSE`, `TON`, `GRAMAS`, `CAB`, `ML`, `BAG` |
| `especificacao` | **Novo Grupo** | Entra na busca sem aparecer na tela — ver abaixo |

A coluna **Item** (a nomenclatura nova) ficou de fora. Ela difere da antiga em
34% dos itens, e a escolha foi mostrar o que o GR mostra.

Um detalhe que só apareceu comparando as duas: a nomenclatura antiga tem
**menos nomes repetidos** — 2 casos, contra 15 da nova. É porque ela carrega o
sufixo da embalagem (`BERINJELA KG`, `BOMBOM PCT`), que a nova removeu. Para
quem escolhe item numa lista, isso é a diferença entre saber e adivinhar qual
dos quatro "CARNE DE FRANGO COM OSSO" é o certo.

## O "Novo Grupo" procura, mas não aparece

Vai para `especificacao` e entra no filtro da busca junto com nome e código.
Na tela continuam aparecendo só o nome, o código e a unidade.

**Em 6.419 dos 7.084 itens o grupo não está escrito no nome** — contado no banco
depois da importação. É o que faz `herbicida` achar **ACCENT**, `EPI` achar
**AVENTAL DE RASPA**, `fungicida` achar **ABACUS HC** e `ferramenta` achar
**CHAVE COMBINADA**. São nomes que não têm essas palavras, e é assim que a pessoa
procura: ela sabe que precisa de um herbicida antes de saber a marca.

## Limpezas feitas no caminho

- **Espaços sobrando** em 752 nomes — removidos das pontas. O miolo ficou como
  está, porque espaçamento interno pode ser o que o GR tem.
- **`Materiais e Equipamentos  de Expediente`** aparecia com espaço duplo em
  algumas linhas e simples em outras, o que criaria **duas famílias `ME`** no
  menu. Normalizado.
- **3 itens sem unidade** receberam `UNID`. São eles — vale conferir no GR:
  `794` FERT. MINERAL POWER SEED NEW 1 X 20 · `802` PHOSMAN NEW - FERTILIZANTE
  MINERAL · `7913` TRENA C-TRAVA E PRESILHA 5M - LUFKIN.
- **129 itens da aba *Itens excluidos*** já não estavam na lista principal.
  Conferido: nenhum dos dois conjuntos se cruza.

## Onde o arquivo mora, e por que não é no repositório

`catalogo-itens.csv` fica no **OneDrive, em `/Compras/`** — ao lado do
`MODELO-Cotacao.xlsx`. O `.gitignore` bloqueia ele.

O repositório é **público**. O `.gitignore` já barrava `*.xlsx` por isso, e o
catálogo é dado da empresa pela mesma lógica: são 7.084 linhas e, uma vez no
git, não saem mais — apagar o arquivo depois não apaga o histórico.

Vale dizer o que se perdeu com essa escolha: o catálogo **não fica versionado**,
então não dá para ver no git quando um item entrou, saiu ou mudou de nome. O que
resta é a data do arquivo no OneDrive e o número de itens que cada importação
relata. Se um dia isso fizer falta, o caminho é um repositório privado — não
este.

## Como importar

O fluxo **`Compras · Importar o catálogo de itens do GR`** (`jqTBAMPilawzHGTa`)
baixa o CSV do OneDrive pelo Microsoft Graph, faz upsert em lotes de 500 e
desativa o que saiu da lista. Ele **não fica publicado**: roda a mão, quando o
catálogo muda.

Para atualizar o catálogo: trocar o arquivo em `/Compras/catalogo-itens.csv` no
OneDrive e rodar o fluxo.

### O que o fluxo se recusa a fazer

1. **Cabeçalho diferente** → para. Importar com as colunas trocadas põe o nome
   do item na coluna da unidade, e ninguém percebe.
2. **Linha sem código, nome ou família** → para. Não importa pela metade.
3. **Código repetido** → para. O código é a chave; com repetido o último ganha
   e o outro some calado.
4. **Menos de 1.000 itens no arquivo** → para. Isso é arquivo truncado, não
   catálogo encolhido, e importar desativaria quase tudo.
5. **Menos de 1.000 itens ativos no fim** → desfaz. Mesma razão, do outro lado.
6. **Número do arquivo ≠ número do banco** → grita. É o passo que separa
   "rodou" de "funcionou".

### Desativa, não apaga

Item que sai da lista do GR vira `ativo = false`. O formulário só lê ativos,
então some da tela — mas o pedido antigo que citou aquele código continua
fazendo sentido. Histórico não se apaga.

## Item novo entre uma importação e outra: `cadastro-itens.html`

Item criado hoje no GR não precisa esperar a próxima importação. Quem tem
login cadastra em **`cadastro-itens.html`** e o item entra no formulário na
hora. A tela grava pela função `catalogo_salvar_item`, que confere login e
senha dentro do banco. O catálogo continua sem escrita pela chave pública.
Tudo está em `cadastro-de-itens.sql`.

**Como a importação trata esses itens.** O item cadastrado pela tela nasce
com `pendente_gr = true`, e `catalogo_desativar_antigos` **não o desativa**,
mesmo que ele não esteja no CSV. Quando o código aparece no CSV, o upsert
grava o que está no GR por cima do que foi digitado, e a marca de pendente
sai. Se na tela e no GR o nome estiver diferente, vale o do GR.

**O que mudou na resposta da importação.** `ativos_agora` passou a contar
só o que veio **desta** importação, que é o número que o nó "Conferir o
resultado" compara com o total do arquivo. Sem essa mudança, os itens
pendentes somariam aos ativos, a conferência nunca mais bateria e o fluxo
acusaria erro depois de já ter gravado. O total está em `ativos_total`, e os
pendentes em `aguardando_gr`. O fluxo do n8n não precisou mudar.

**Logins.** Hoje só a **Elisabeth** (`elisabeth`) cadastra. A tela não tem
"Trocar senha": senha nova se define aqui, com a mesma função. Logins são
criados no SQL Editor:

    select public.catalogo_definir_cadastrador('login', 'Nome da Pessoa', 'senha-provisoria');

Para desligar alguém:

    update public.catalogo_cadastradores set ativo = false where login = 'login';

Para ver quem cadastrou o quê:

    select * from public.catalogo_itens_historico order by em desc;

A senha fica guardada só como hash bcrypt. Cinco senhas erradas seguidas
travam o login por 15 minutos.

**Testes.** `teste-cadastro-itens.js` roda a tela clique a clique contra o
banco de mentira do `mock-supabase.js`. `teste-cadastro-itens.sql` roda as
mesmas regras no Postgres de verdade e **desfaz tudo** no fim. Para rodar,
cole no SQL Editor o `cadastro-de-itens.sql` seguido dele. "TESTES OK" na
mensagem de erro significa que passou.
