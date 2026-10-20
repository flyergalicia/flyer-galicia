const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // un logo puesto a mano, y un arrastre que el navegador cancela
  const r=await p.evaluate(async()=>{
    const im=await _fgLgTraer(_promosCat.find(x=>x.imagen).imagen);
    const det=_fgLgManual(600,2690,140,60);_fgLgPoner(det,_promosCat.find(x=>x.imagen).imagen,'X',im);_fgLgHistMarcar();
    const L=_fgLgActivos()[0],c=cv.getBoundingClientRect(),k=(c.width/cv.width)*SC;
    return {x:c.left+(L.tx+L.tw/2)*k,y:c.top+(L.ty+L.th/2)*k};
  });
  await p.evaluate(({x,y})=>{cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,button:0,pointerType:'touch',bubbles:true}));document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));},r);
  ok(await p.evaluate(()=>!_fgLg.arrastre),'un gesto cancelado no deja el arrastre colgado');
  const n0=await p.evaluate(()=>_fgLgHist.pasos.length);
  await p.evaluate(()=>{_fgLg.sel=0;_fgLgMover(25,0);});await p.waitForTimeout(700);
  ok(await p.evaluate(()=>_fgLgHist.pasos.length)===n0+1,'el cambio siguiente se anota en Deshacer');
  console.log('  errores:',p.errores.length);
};
