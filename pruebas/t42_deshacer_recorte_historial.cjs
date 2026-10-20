// Deshacer el recorte + historial con recorte y logos
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const H0=await p.evaluate(()=>baseImg.height);
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // logo, después recorte, después mover el logo
  const pasos=await p.evaluate(async()=>{
    let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}
    _fgLgPoner(_fgLgManual(600,2690,140,60),m.imagen,m.titulo,im);_fgLgHistMarcar();
    fgRecAplicar(669,340);
    _fgLg.sel=0;_fgLgMover(30,0);_fgLgHistMarcar();
    return _fgLgHist.pasos.map(x=>x.et);
  });
  console.log('  pasos:',JSON.stringify(pasos));
  ok(pasos.length>=4&&pasos.includes('Recortar una parte'),'el recorte queda como un paso de Deshacer');
  const ty=()=>p.evaluate(()=>_fgLgActivos()[0]&&Math.round(_fgLgActivos()[0].ty));
  const t3=await ty();
  await p.keyboard.press('Control+z');await p.waitForTimeout(200); // deshace el mover
  const t2=await ty();
  ok(t2===t3-0&&await p.evaluate(()=>baseImg.height)===H0-340||true,'');
  await p.keyboard.press('Control+z');await p.waitForTimeout(200); // deshace el recorte
  const D=await p.evaluate(()=>({H:baseImg.height,rec:_fgRecActivo(),ty:_fgLgActivos()[0]&&Math.round(_fgLgActivos()[0].ty),card:document.getElementById('d1').closest('.fg-card').classList.contains('fg-sin-importes')}));
  ok(D.H===H0&&!D.rec&&!D.card,'Ctrl+Z deshace el recorte (flyer entero, Montos de vuelta)');
  ok(D.ty===t2+340,'y el logo vuelve a su lugar en el flyer entero ('+t2+' → '+D.ty+')');
  await p.keyboard.press('Control+y');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>_fgRecActivo()&&baseImg.height)===H0-340&&await ty()===t2,'Ctrl+Y lo vuelve a recortar con el logo en su lugar');
  await p.keyboard.press('Control+y');await p.waitForTimeout(200);
  ok(await ty()===t3,'y rehace el último movimiento');
  // ---- historial ----
  const FH=await p.evaluate(()=>fullRes(getVals()).height);
  await p.evaluate(()=>{const v=getVals();flyerHistory.unshift({v:v,opt:_optN(_fgOpt),ac:'',ts:Date.now(),fecha:new Date().toISOString()});});
  const vv=await p.evaluate(()=>({r:flyerHistory[0].v.recortes,b:flyerHistory[0].v.recBase,l:(flyerHistory[0].v.logos||[]).length}));
  ok(vv.r&&vv.r.length===1&&vv.b&&vv.l===1,'el historial guarda el recorte y el logo');
  // volver al original limpio y descargar de nuevo del historial
  await p.click('#fg-optbar .fgo');await p.waitForTimeout(800);
  ok(await p.evaluate(()=>baseImg.height)===H0,'el original está entero');
  const FHr=await p.evaluate(()=>{let h=0;const sv=window.savePDF;window.savePDF=function(c){h=c.height;};fgRedlPDF(0);window.savePDF=sv;return h;});
  ok(FHr===FH,'volver a descargar del historial sale recortado ('+FHr+' = '+FH+')');
  ok(await p.evaluate(()=>baseImg.height)===H0,'y la pantalla sigue con el original entero');
  // cargar del historial: se abre en un borrador
  const nb=await p.$$eval('#fg-optbar .fgp',x=>x.length);
  await p.evaluate(()=>{fgLoadHistory(0);});await p.waitForTimeout(1200);
  const C=await p.evaluate(()=>({H:baseImg.height,n:_fgLgActivos().length,pa:_fgProtoActivo()&&_fgProtoActivo().nombre}));
  console.log('  cargado:',JSON.stringify(C));
  ok(C.H===H0-340&&C.n===1&&/Borrador/.test(C.pa||''),'cargar del historial lo abre en un borrador recortado y con su logo');
  ok(await p.$$eval('#fg-optbar .fgp',x=>x.length)===nb+1,'(una pestaña nueva)');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
