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
         teste-empresa.js \
         teste-cliques.js bateria-erros.js; do
  echo
  echo "== $b =="
  saida=$(node "$b" 2>&1) || { echo "$saida" | tail -20; falhou=1; continue; }
  echo "$saida" | grep -E "FALHAS|ATENÇÃO" -A 8 | head -14
  echo "$saida" | grep -q "FALHAS (0)" || falhou=1
done

echo
if [ "$falhou" = 0 ]; then
  echo "Tudo passou. Falta o contrato.html, no navegador, depois de publicar."
else
  echo "Tem falha acima. Não publique ainda."
fi
exit $falhou
