// Ventanas de marcas (26-oct): los súper con alguna promo de % de descuento llevan
// un puntito rojo en la miniatura (sólo en la lista: al ponerlos en el flyer no va)
// y el tilde "Sólo súper con % de descuento" deja sólo esos. Son los que al
// ponerlos llevan sus días debajo.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const r=await p.evaluate(()=>{
    const de=t=>_promosCat.find(q=>q.titulo===t);
    const h={cotoCuotas:_promoTienePct(_promosCat.find(q=>q.titulo==='Coto'&&/cuotas/i.test(q.beneficio||''))),
      jumbo:_promoTienePct(de('Jumbo')),noSuper:_promoTienePct(_promosCat.find(q=>!_promoEsSuper(q)))};
    _fgLgV.prov='';_fgLgV.rubro='';_fgLgV.q='';_fgLgV.soloPct=false;
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const items=()=>[...document.querySelectorAll('#fg-lg-list .fg-lg-it')];
    const conDot=items().filter(b=>b.querySelector('.fg-pf-pct'));
    const todos=items().length;
    const dotsOk=conDot.length>0&&conDot.every(b=>_promoTienePct(_fgLgV.res[+b.dataset.i]));
    const c=document.getElementById('fg-lg-pct');c.checked=true;c.dispatchEvent(new Event('change'));
    const solo=_fgLgV.res,soloOk=solo.length>0&&solo.every(x=>_promoTienePct(x))&&items().every(b=>b.querySelector('.fg-pf-pct'));
    const n=solo.length;
    document.getElementById('fg-lg-x').click();
    // Armar franja también tiene el tilde
    _fgFrAbrir(_fgLgManual(140,2650,1000,230));
    const fr=!!document.getElementById('fg-fr-pct');
    document.getElementById('fg-fr-x').click();
    return {h,todos,dots:conDot.length,dotsOk,n,soloOk,fr};
  });
  console.log('  ',JSON.stringify(r));
  ok(r.h.cotoCuotas&&r.h.jumbo&&!r.h.noSuper,'Coto (aunque sea la promo en cuotas) y Jumbo tienen %; un no súper no');
  ok(r.dots>0&&r.dotsOk,'en la lista, el puntito rojo está sólo en los súper con % ('+r.dots+' de '+r.todos+')');
  ok(r.soloOk&&r.n<r.todos,'con el tilde "Sólo súper con % de descuento" quedan sólo esos ('+r.n+')');
  ok(r.fr,'Armar franja también tiene el tilde');
  // lo que va al flyer no lleva el puntito: el dibujo sale del logo, no de la lista
  const enFlyer=await p.evaluate(()=>!document.querySelector('#fg-lg-capa .fg-pf-pct'));
  ok(enFlyer,'el puntito no aparece sobre el flyer');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
