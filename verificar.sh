#!/usr/bin/env bash
# Tudo o que dá para conferir sem sair da máquina. Rodar antes de publicar.
#
#   ./verificar.sh
#
# O que NÃO está aqui: contrato.html, que conversa com o Supabase e com o n8n
# de verdade e por isso precisa de rede e de um navegador. Abra depois de subir.
set -u
cd "$(dirname "$0")"
falhou=0

echo "== trechos repetidos =="
node conferir-repetidos.js || falhou=1

for b in bateria-tela.js teste-centros.js teste-pedido.js teste-decisao.js \
         teste-aprovacoes.js teste-historico.js teste-facilitador.js \
         teste-acompanhar.js teste-numeracao.js teste-quem-pede-aprova.js \
         teste-empresa.js teste-cotacao-completa.js teste-planilha.js \
         teste-catalogo-paginado.js teste-titulo-card.js teste-aviso-urgente.js \
         teste-cliques.js teste-anexo.js bateria-erros.js \
         teste-cadastro-itens.js; do
  echo
  echo "== $b =="
  saida=$(node "$b" 2>&1) || { echo "$saida" | tail -20; falhou=1; continue; }
  echo "$saida" | grep -E "FALHAS|ATENÇÃO" -A 8 | head -14
  echo "$saida" | grep -q "FALHAS (0)" || falhou=1
done

echo
echo "== teste-comparativa.py (planilha de cotacao) =="
# Este e lento: recalcula a planilha no LibreOffice de verdade. Recalcular sem
# erro so provaria que as formulas avaliam; o que ele confere e se as CONTAS
# estao certas, com um cenario montado para ser verificavel a mao.
if command -v soffice >/dev/null 2>&1; then
  saida=$(python3 teste-comparativa.py 2>&1) || falhou=1
  echo "$saida" | grep -E "FALHAS|^ x " | head -8
else
  echo "  (pulado: sem LibreOffice nesta maquina)"
fi

echo
if [ "$falhou" = 0 ]; then
  echo "Tudo passou. Falta o contrato.html, no navegador, depois de publicar."
else
  echo "Tem falha acima. Não publique ainda."
fi
exit $falhou
