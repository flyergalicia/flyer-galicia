// Restaurar suelta el recorte + cartel "esta empresa tiene cashback"
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const H0=await p.evaluate(()=>baseImg.height),cfg0=await p.evaluate(()=>JSON.stringify(_fgOptCache[_optN(_fgOpt)].cfg));
  // 1) recortar → Restaurar
  await p.evaluate(()=>{fgRecAplicar(669,340);});
  ok(await p.evaluate(()=>baseImg.height)===H0-340,'recorte aplicado');
  await p.evaluate(()=>{fgResetVals();});await p.waitForTimeout(300);
  const R=await p.evaluate(()=>({H:baseImg.height,rec:!!_fgRec,cfg:JSON.stringify(window.FLYER_CFG),card:document.getElementById('d1').closest('.fg-card').classList.contains('fg-sin-importes')}));
  ok(R.H===H0&&!R.rec&&!R.card,'Restaurar trae de vuelta la parte recortada y la tarjeta de Montos');
  ok(R.cfg===cfg0,'y la calibración vuelve a ser la guardada');
  // 2) empresa CON cashback en un flyer recortado → cartel → "Mostrar los importes"
  const emp={empresa:'ACME S.A.',config:'BAU',asesores:[{nombre:'Ana Pérez',celular:'11 5555 5555',email:'ana@bancogalicia.com.ar'}],rubro:''};
  await p.evaluate(()=>{fgRecAplicar(669,340);});
  await p.evaluate((r)=>{_padApply(r);},emp);
  await p.waitForSelector('#fg-cf-ov',{timeout:3000});
  const txt=await p.textContent('#fg-cf-ov');console.log('  cartel:',txt.replace(/\s+/g,' ').trim());
  ok(/tiene cashback/.test(txt)&&/no muestra importes/.test(txt),'sale el cartel "Esta empresa tiene cashback"');
  await p.screenshot({path:__dirname+'/capturas/t40_cartel.png'});
  await p.click('#fg-cf-ok');await p.waitForTimeout(500);
  const M=await p.evaluate(()=>({H:baseImg.height,sin:_fgSinImportes(),m1:_fgMontoN(getVals(),1)}));
  ok(M.H===H0&&!M.sin&&M.m1,'"Mostrar los importes" deja el flyer entero con los importes ('+M.m1+')');
  // 3) "Seguir así"
  await p.evaluate(()=>{fgRecAplicar(669,340);});
  await p.evaluate((r)=>{_padApply(r);},emp);
  await p.waitForSelector('#fg-cf-ov',{timeout:3000});await p.click('#fg-cf-no');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>_fgRecActivo()),'"Seguir así" lo deja recortado');
  // 4) empresa SIN cashback: no sale este cartel (sale el de siempre)
  await p.evaluate((r)=>{_padApply(Object.assign({},r,{config:''}));},emp);await p.waitForTimeout(500);
  ok(!(await p.$('#fg-cf-ov'))&&!(await p.$('#pad-upd')),'empresa sin cashback en un flyer ya sin importes: no sale ningún aviso');
  // 5) opción "sin cashback" sin original conocido → sólo "Entendido"
  await p.evaluate(()=>{try{_padCloseUpdate(0);}catch(e){}fgRecQuitar();window.FLYER_CFG=JSON.parse(JSON.stringify(window.FLYER_CFG));window.FLYER_CFG.montos=Object.assign({},_fgCfg().montos,{off:true});window.FLYER_CFG.cashback=Object.assign({},_fgCfg().cashback,{off:true});});
  await p.evaluate((r)=>{_padApply(r);},emp);await p.waitForTimeout(500);
  ok(!!(await p.$('#pad-upd'))&&/eleg/i.test(await p.textContent('#pad-upd')),'opción sin importes sin original conocido: avisa y explica qué elegir');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
