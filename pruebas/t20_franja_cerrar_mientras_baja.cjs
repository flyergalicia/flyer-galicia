const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  // logos lentos: demoro las respuestas de Galicia
  await p.route('https://www.galicia.ar/**',async r=>{await new Promise(x=>setTimeout(x,1500));r.continue();});
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.evaluate(()=>{_fgLg.imgs={};_fgFrSt.sel=[{img:'delpueblo_180.png',t:'A'},{img:'gofarma_180.png',t:'B'}];});
  await p.click('#fg-fr-ok');await p.waitForTimeout(100);
  await p.click('#fg-fr-no');           // cierra mientras bajan
  await p.waitForTimeout(3000);
  ok(await p.evaluate(()=>_fgLgActivos().length===0),'cerrar mientras bajan los logos: no se aplica nada');
  // doble "Poner": una sola franja
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.evaluate(()=>{_fgFrSt.sel=[{img:'delpueblo_180.png',t:'A'},{img:'gofarma_180.png',t:'B'}];document.getElementById('fg-fr-ok').click();document.getElementById('fg-fr-ok').click();});
  await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:15000});
  ok(await p.evaluate(()=>_fgLgActivos().filter(e=>e.franjaBase).length===1&&_fgLgActivos().length===3),'tocar "Poner" dos veces: una sola franja');
  console.log('  errores:',p.errores.length);
};
module.exports.flyer=true;
