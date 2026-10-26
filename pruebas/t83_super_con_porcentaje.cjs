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
  // Promociones a pantalla completa: el mismo puntito y el mismo tilde (Activas y Buscar)
  await p.evaluate(()=>{fgLogosModo(false);switchApp('promos');switchPromoTab('activas');});
  await p.selectOption('#promos-prov','BUENOS AIRES');
  await p.evaluate(()=>buscarPromosActivas());
  await p.waitForFunction(()=>document.querySelectorAll('.promos-table tbody tr').length>5,null,{timeout:15000});
  const a=await p.evaluate(()=>{
    const filas=()=>[...document.querySelectorAll('.promos-table tbody tr')];
    const vis=_promosFilasVisibles();
    const dots=filas().filter(tr=>tr.querySelector('.pc-logo .fg-pf-pct')).length;
    const dotsOk=vis.every((v,i)=>!!filas()[i].querySelector('.pc-logo .fg-pf-pct')===_promoFilaPct(v.r.promo));
    const antes=vis.length;
    const fila=re=>{const i=vis.findIndex(v=>v.r.promo&&v.r.promo.titulo==='Coto'&&re.test(v.r.promo.beneficio||''));return i<0?null:filas()[i];};
    const cotoPct=!!(fila(/%/)&&fila(/%/).querySelector('.fg-pf-pct')),cotoCuotas=!!(fila(/cuotas/)&&fila(/cuotas/).querySelector('.fg-pf-pct'));
    const c=document.getElementById('promos-pct-a');c.checked=true;c.dispatchEvent(new Event('change'));
    const solo=_promosFilasVisibles();
    const soloOk=solo.length>0&&solo.length<antes&&solo.every(v=>_promoFilaPct(v.r.promo));
    switchPromoTab('buscar');
    const b=document.getElementById('promos-pct-b');
    return {cotoPct,cotoCuotas,dots,dotsOk,antes,despues:solo.length,soloOk,buscarTilde:!!b&&b.checked};
  });
  console.log('  ',JSON.stringify(a));
  ok(a.dots>0&&a.dotsOk,'Activas: el puntito rojo está en las promos de súper con % y sólo en ellas ('+a.dots+')');
  ok(a.cotoPct&&!a.cotoCuotas,'Coto 25% lleva el puntito y Coto en cuotas no');
  ok(a.soloOk,'Activas: el tilde deja sólo los súper con % ('+a.antes+' → '+a.despues+')');
  ok(a.buscarTilde,'Buscar tiene el mismo tilde y queda igual que en Activas');
  // va y vuelve con "Elegir en pantalla completa"
  const v=await p.evaluate(()=>{_promoSetSoloPct(false);switchApp('flyer');fgLogosModo(true);_fgFrAbrir(_fgLgManual(140,2650,1000,230));
    const c=document.getElementById('fg-fr-pct');c.checked=true;c.dispatchEvent(new Event('change'));
    return _fgFrSt.soloPct;});
  ok(v===true,'Armar franja: el tilde queda anotado para llevarlo a pantalla completa');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
