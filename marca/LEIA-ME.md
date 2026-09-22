# Identidade visual — Grupo Leh

Arquivos desta pasta:

| | |
|---|---|
| `logo-marca.png` | logo positiva, para fundo claro |
| `logo-negativa.png` | logo em branco, para fundo escuro (é a da barra do topo) |
| `paleta-de-cores.pdf` | paleta oficial, como veio da marca |

## Cores

| Pantone | Hex | Onde usar nas telas |
|---|---|---|
| 2965 C | `#00263d` | azul da marca — barra do topo, títulos, texto principal |
| 2955 C | `#003865` | azul de apoio |
| 330 C | `#00524c` | verde escuro de apoio |
| 341 C | `#007A53` | verde — confirmação, "no prazo", valores aprovados |
| 321 C | `#008c95` | turquesa — é o destaque: botões, links, item escolhido. Em texto pequeno sobre branco use `#00727A`, que tem contraste melhor |
| 468 C | `#ddcba3` | areia — fundo de aviso |
| Warm Gray 1 C | `#d7d2cc` | cinza quente — bordas e fundos neutros |

O vermelho de erro (`#A82A1F`) não está na paleta. Ele existe só para bloqueio
e mensagem de campo obrigatório, e não deve ser usado em mais nada.

## Tipografia

A fonte da marca é a **Goldplay**. Quando ela não estiver instalada na máquina,
a substituta é a **Figtree**, do Google Fonts, que tem o mesmo desenho
geométrico. Nas telas isso fica assim:

```css
--f-body: "Goldplay","Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;
```

Números de dinheiro e códigos usam **IBM Plex Mono**, para as casas decimais
ficarem alinhadas uma embaixo da outra.

A `prototipos/mesa-cotacao.html` já segue tudo isto e serve de referência.
