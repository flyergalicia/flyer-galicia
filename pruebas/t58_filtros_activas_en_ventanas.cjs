// "Ocultar online" y el rubro de Promociones → Activas llegan a Armar franja y a la
// ventana de un logo, y el tilde de la ventana vuelve a Activas.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const r=await p.evaluate(()=>{
    _promosFiltros.online='ocultar';_promosRubro='Supermercados';_fgLgV.prov='';
    _fgFrAbrir(_fgLgManual(140,2650,1000,230));
    const fr={sinOnline:_fgFrSt.sinOnline,rubro:_fgFrSt.rubro,chk:document.getElementById('fg-fr-onl').checked};
    document.getElementById('fg-fr-x').click();
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const lg={sinOnline:_fgLgV.sinOnline,rubro:_fgLgV.rubro,chk:document.getElementById('fg-lg-onl').checked,
      todasSuper:_fgLgV.res.length>0&&_fgLgV.res.every(x=>x.subtitulo==='Supermercados')};
    // destildar en la ventana destilda en Activas
    const c=document.getElementById('fg-lg-onl');c.checked=false;c.dispatchEvent(new Event('change'));
    const vuelta=_promosFiltros.online;
    document.getElementById('fg-lg-x').click();
    return {fr,lg,vuelta};
  });
  console.log('  ',JSON.stringify(r));
  ok(r.fr.sinOnline&&r.fr.chk,'Armar franja arranca con "sin las online" tildado');
  ok(r.fr.rubro==='Supermercados','Armar franja arranca con el rubro de Activas');
  ok(r.lg.sinOnline&&r.lg.chk&&r.lg.rubro==='Supermercados','la ventana de un logo también');
  ok(r.lg.todasSuper,'la lista muestra sólo supermercados');
  ok(r.vuelta==='','destildar en la ventana destilda en Activas');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
