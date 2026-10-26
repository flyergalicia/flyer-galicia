// Después de recortar, el flyer sigue "cargado" (26-oct): el recorte reemplaza la
// imagen por un lienzo, que no tiene naturalWidth, y el control de "flyer que no
// cargó" creía que todavía estaba cargando: no dejaba volver a Cambiar logos
// (ni Guardar en Estudio) y frenaba la descarga del PDF recortado.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  let bajadas=0;p.on('download',()=>{bajadas++;});
  // como el dueño: entra a Cambiar logos, recorta y toca Listo
  await p.evaluate(()=>{fgLogosModo(true);fgRecAplicar(700,320);});
  await p.waitForTimeout(400);
  const a=await p.evaluate(()=>({rec:_fgRecActivo(),bloqueo:_fgDescargaBloqueo(),falla:!!document.getElementById('fg-flyer-falla')}));
  ok(a.rec,'el recorte quedó aplicado');
  ok(a.bloqueo==='','con el recorte, el flyer no figura como "cargando" ('+(a.bloqueo||'sin aviso')+')');
  ok(!a.falla,'no aparece el cartel de flyer sin cargar');
  await p.evaluate(()=>fgLogosModo(false));
  // vuelve a Cambiar logos para guardar en Estudio
  const b=await p.evaluate(()=>{fgLogosModo(true);const g=document.getElementById('fg-lg-guardar');return {on:_fgLg.on,guardar:!!g&&!g.hidden};});
  ok(b.on,'se puede volver a entrar a Cambiar logos con el flyer recortado');
  ok(b.guardar,'aparece "Guardar en Estudio"');
  await p.evaluate(()=>fgLogosModo(false));
  // y el PDF recortado se descarga
  await p.evaluate(()=>dlPDF());
  for(let i=0;i<50&&!bajadas;i++)await p.waitForTimeout(200);
  ok(bajadas===1,'el PDF del flyer recortado se descarga');
  // el control sigue frenando un flyer que de verdad no cargó
  const c=await p.evaluate(()=>{_fgSinFlyerPoner({opt:_optN(_fgOpt),motivo:'red'});const t=_fgDescargaBloqueo();_fgSinFlyerPoner(null);return t;});
  ok(/No se pudo cargar/.test(c),'un flyer que no cargó sigue frenado ('+c+')');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
