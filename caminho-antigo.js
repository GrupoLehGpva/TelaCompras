/* CAMINHO ANTIGO (ClickUp) NOS TESTES — desde a virada (30/09) o index.html sai com
   CAMINHO_CLICKUP_ABERTO = false: o link sem ?t= não abre pedido. O código do caminho
   antigo continua no arquivo como plano de volta, e estes testes seguem provando que
   ele funciona. Para isso rodam numa CÓPIA com a chave aberta, gerada aqui e ignorada
   pelo git (index-caminho-antigo.html). O index.html publicado não muda. */
const fs = require('fs'), path = require('path');
module.exports = function urlCaminhoAntigo(){
  const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const aberto = src.replace('const CAMINHO_CLICKUP_ABERTO = false;', 'const CAMINHO_CLICKUP_ABERTO = true;');
  if (aberto === src) throw new Error('index.html sem a chave CAMINHO_CLICKUP_ABERTO = false');
  const destino = path.join(__dirname, 'index-caminho-antigo.html');
  fs.writeFileSync(destino, aberto);
  return 'file://' + destino;
};
