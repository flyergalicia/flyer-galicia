// Mover un logo que ya venía en el flyer: se dibuja con sus proporciones exactas
// (antes se le recortaba el blanco y se estiraba a la caja original).
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  const r=await p.evaluate(()=>{
    // un recuadro con márgenes desparejos alrededor de los logos de la franja
    const det=_fgLgManual(120,2630,420,170);
    _fgLgMoverOriginal(det);
    const e=_fgLgActivos()[_fgLg.sel],im=_fgLgImg(e.img);
    // y se mueve
    e.tx+=60;e.ty+=20;_fgLgListo();
    return {det:[det.w,det.h],caja:[e.tw,e.th],img:[im.width,im.height]};
  });
  console.log('  ',JSON.stringify(r));
  const rc=r.caja[0]/r.caja[1],ri=r.img[0]/r.img[1];
  ok(Math.abs(rc-ri)<0.01,'la imagen tiene la misma proporción que su caja ('+ri.toFixed(3)+' vs '+rc.toFixed(3)+')');
  ok(r.img[0]===r.det[0]&&r.img[1]===r.det[1],'la imagen es del tamaño del recuadro original');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
