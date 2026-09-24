/* LARGURA PADRÃO DAS TELAS (24/09): fila, pedido e acompanhamento na mesma
   largura (1300px), alinhadas na mesma borda. O formulário fica de fora.
   E nenhuma delas rola a página para o lado num notebook de 1366px. */
const { chromium } = require('playwright');
const falhas = []; const ok = (n,c,d)=> c ? null : falhas.push(n + ' — ' + (d||''));
const TELAS = { 'aprovacoes.html':'?t=ap-x', 'pedido.html':'?id=11111111-1111-1111-1111-111111111111', 'acompanhar.html':'?t=fc-x' };
(async()=>{
const b = await chromium.launch();
const bordas = {};
for(const w of [1366, 1920]){
  for(const [arq, q] of Object.entries(TELAS)){
    const p = await b.newPage({viewport:{width:w, height:900}});
    await p.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue()
      : r.fulfill({status:200, contentType:'application/json', body:'[]'}));
    await p.goto('file://' + __dirname + '/' + arq + q, {waitUntil:'load'}); await p.waitForTimeout(400);
    const m = await p.evaluate(() => { const e = document.querySelector('.envelope'); const r = e.getBoundingClientRect();
      return { max:getComputedStyle(e).maxWidth, x:Math.round(r.left), larg:Math.round(r.width), rola:document.documentElement.scrollWidth - innerWidth }; });
    ok(arq + ' ' + w + 'px largura 1300', m.max === '1300px', m.max);
    ok(arq + ' ' + w + 'px sem rolagem lateral da página', m.rola <= 0, 'sobra ' + m.rola + 'px');
    (bordas[w] = bordas[w] || []).push(arq + ':' + m.x);
    await p.close();
  }
  const xs = new Set(bordas[w].map(s => s.split(':')[1]));
  ok(w + 'px mesma borda esquerda', xs.size === 1, bordas[w].join(' '));
}
await b.close();
console.log('\n===== FALHAS (' + falhas.length + ') ====='); falhas.forEach(f => console.log(' ✗ ' + f));
})();
