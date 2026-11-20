/* アプリの中にあるメニューを、そのまま JSON に書き出す */
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const pg = await b.newPage();
  await pg.goto('http://127.0.0.1:8765/');
  const out = await pg.evaluate(() => {
    const o = {};
    for (const k of Object.keys(PROGRAM)) {
      if (!Array.isArray(PROGRAM[k])) { o[k] = null; continue; }
      o[k] = PROGRAM[k].map((d, i) => ({
        day: i + 1, t: d.t || '', rest: !!d.rest, cool: !!d.cool, note: d.note || '', cardio: d.cardio || '',
        parts: (d.parts || []).map(p => ({
          k: p.k, n: p.n || '', r: p.r || null, min: p.min || null, note: p.note || '',
          items: (p.items || []).map(it => ({
            x: it.x, en: (EX[it.x] || {}).en || '?', dose: it.n || it.dose || it.d || '',
            video: !!((EX[it.x] || {}).video)
          }))
        }))
      }));
    }
    return o;
  });
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('書き出し:', Object.keys(out).map(k => k + ' ' + (out[k]?out[k].length:0) + '日').join(' / '));
  await b.close();
})();
