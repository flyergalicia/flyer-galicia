// "Elegir en pantalla completa" desde la ventana de un logo: Activas con la barra
// "Cambiar un logo", el + elige y vuelve solo al flyer con la marca puesta.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.evaluate(()=>{_fgLgV.prov='NEUQUEN';_fgLgV.loc='';_fgLgAbrir(_fgLgManual(140,2650,300,110));});
  await p.waitForSelector('#fg-lg-full',{timeout:5000});
  await p.click('#fg-lg-full');
  await p.waitForSelector('#fg-elegir-bar',{timeout:15000});
  const bar=await p.evaluate(()=>document.getElementById('fg-elegir-bar').textContent);
  ok(/Cambiar un logo/.test(bar)&&/Volver al logo/.test(bar),'Activas muestra la barra "Cambiar un logo"');
  await p.waitForSelector('button.promos-elegir:not([disabled])',{timeout:20000});
  const elegida=await p.evaluate(async()=>{
    const bs=[...document.querySelectorAll('button.promos-elegir:not([disabled])')];
    for(const b of bs){const i=+(b.getAttribute('onclick')||'').replace(/\D+/g,'');const r=_promosResultados[i];if(!r||!r.promo)continue;try{await _fgLgTraer(r.promo.imagen);}catch(e){continue;}b.click();return r.promo.imagen;}
    return null;
  });
  await p.waitForTimeout(800);
  const r=await p.evaluate((img)=>({puesta:_fgLgActivos().some(e=>e.img===img),bar:!!document.getElementById('fg-elegir-bar'),elegir:!!_fgElegir}),elegida);
  ok(!!elegida&&r.puesta,'tocar + pone la marca en el flyer');
  ok(!r.bar&&!r.elegir,'y vuelve solo (sin la barra)');
  // Cancelar desde Activas no cambia nada
  const n0=await p.evaluate(()=>_fgLgActivos().length);
  await p.evaluate(()=>{_fgLgIrActivas(_fgLgManual(600,2650,300,110));});
  await p.waitForSelector('#fg-elegir-bar',{timeout:15000});
  await p.evaluate(()=>fgElegirCancelar());
  const n1=await p.evaluate(()=>_fgLgActivos().length);
  ok(n1===n0,'Cancelar no cambia nada');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
