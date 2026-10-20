const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgLgV.prov='NEUQUEN';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-act');await p.click('#fg-fr-act');await p.waitForSelector('.promos-elegir',{timeout:15000});
  await p.click('.promos-elegir:not([disabled]) >> nth=0');await p.click('.promos-elegir:not([disabled]) >> nth=3');
  // simulo que cambió el flyer
  await p.evaluate(()=>{Object.defineProperty(baseImg,'src',{get:()=>'otro.jpg',configurable:true});});
  await p.click('#fg-elegir-bar .btn.bp');await p.waitForTimeout(500);
  ok(await p.evaluate(()=>_fgFr.modo&&_fgFr.pendiente&&_fgFr.pendiente.sel.length===2),'si cambió el flyer, queda en "marcá la franja" con las 2 marcas guardadas');
  console.log('  aviso:',await p.evaluate(()=>[...document.querySelectorAll('.toast,#toast')].map(t=>t.textContent).join('|')));
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-sel .fg-fr-it');
  ok(await p.evaluate(()=>_fgFrSt.sel.length===2&&!_fgFr.pendiente),'al marcar la franja nueva, abre con esas marcas');
  console.log('  errores:',p.errores.length);
};
