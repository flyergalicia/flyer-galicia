// Borradores en pestañas: el original queda limpio
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tabs=p=>p.$$eval('#fg-optbar .fgo, #fg-optbar .fgp',x=>x.map(t=>(t.classList.contains('on')?'*':'')+t.textContent.replace('×','').trim()));
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const H0=await p.evaluate(()=>baseImg.height);
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // 1) primer recorte sobre el original → Borrador 1
  await p.evaluate(()=>{fgRecAplicar(669,340);});await p.waitForTimeout(300);
  let T=await tabs(p);console.log('  pestañas:',JSON.stringify(T));
  ok(T.includes('*Borrador 1')&&await p.evaluate(()=>baseImg.height)===H0-340,'el primer recorte crea "Borrador 1" (activo y recortado)');
  ok(await p.evaluate(()=>!!(_fgLg.proy&&_fgLg.proy.temp)),'el borrador queda abierto');
  // un logo más en el mismo borrador: no crea otro
  await p.evaluate(async()=>{let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}_fgLgPoner(_fgLgManual(600,2350,140,60),m.imagen,m.titulo,im);});
  await p.waitForTimeout(600);
  ok((await tabs(p)).filter(x=>/Borrador/.test(x)).length===1,'otro cambio en el mismo borrador no crea otro');
  // 2) original limpio
  await p.click('#fg-optbar .fgo');await p.waitForTimeout(800);
  ok(await p.evaluate(()=>baseImg.height)===H0&&await p.evaluate(()=>_fgLgActivos().length)===0,'el original está entero y sin logos');
  // y vuelve
  await p.click('#fg-optbar .fgp');await p.waitForTimeout(1200);
  const B1=await p.evaluate(()=>({H:baseImg.height,n:_fgLgActivos().length}));
  ok(B1.H===H0-340&&B1.n===1,'volver a "Borrador 1" lo trae recortado y con su logo');
  // 3) Nuevo borrador
  await p.click('#fg-lg-nbor');await p.waitForTimeout(1200);
  T=await tabs(p);console.log('  pestañas:',JSON.stringify(T));
  ok(T.includes('*Borrador 2')&&await p.evaluate(()=>baseImg.height)===H0&&await p.evaluate(()=>_fgLgActivos().length)===0,'"Nuevo borrador" abre "Borrador 2" limpio');
  // un logo en el 2: queda en el 2, no crea un 3
  await p.evaluate(async()=>{let m,im,k=0;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);if(k++){m=x;break;}}catch(e){}}_fgLgPoner(_fgLgManual(300,2350,140,60),m.imagen,m.titulo,im);});await p.waitForTimeout(600);
  ok((await tabs(p)).filter(x=>/Borrador/.test(x)).length===2,'el cambio queda en "Borrador 2" (no crea otro)');
  await p.click('#fg-optbar .fgp >> nth=0');await p.waitForTimeout(1200);
  const B1b=await p.evaluate(()=>({H:baseImg.height,n:_fgLgActivos().length,x:_fgLgActivos()[0]&&Math.round(_fgLgActivos()[0].ox)}));
  ok(B1b.H===H0-340&&B1b.n===1&&B1b.x===600,'cada borrador conserva lo suyo al ir y venir');
  await p.screenshot({path:__dirname+'/capturas/t41_pestanias.png',clip:{x:0,y:60,width:700,height:110}});
  // 4) lupa dentro del borrador: no borra
  const emp={empresa:'ACME S.A.',config:'',asesores:[{nombre:'Ana Pérez',celular:'11 5555 5555'}],rubro:''};
  await p.evaluate((r)=>{_padApply(r);},emp);await p.waitForTimeout(400);
  ok(await p.evaluate(()=>_fgRecActivo()&&_fgLgActivos().length===1&&document.getElementById('empresa').value==='ACME S.A.'),'la lupa dentro del borrador trae la empresa sin borrar el recorte ni los logos');
  await p.evaluate(()=>{try{_padCloseUpdate(0);}catch(e){}});
  // 5) Restaurar dentro del borrador
  await p.evaluate(()=>{fgResetVals();});await p.waitForTimeout(500);
  const RR=await p.evaluate(()=>({H:baseImg.height,act:_fgProtoAct,emp:document.getElementById('empresa').value}));
  ok(RR.H===H0&&!RR.act&&RR.emp==='','Restaurar deja el formulario vacío y el original limpio');
  await p.click('#fg-optbar .fgp >> nth=0');await p.waitForTimeout(1200);
  ok(await p.evaluate(()=>baseImg.height)===H0-340,'y el borrador sigue teniendo su recorte');
  // 6) descarga desde el borrador
  const FH=await p.evaluate(()=>fullRes(getVals()).height);
  ok(FH<6369,'la descarga desde el borrador sale recortada ('+FH+')');
  // 7) Guardar en Estudio desde el borrador
  await p.click('#fg-lg-guardar');await p.waitForSelector('#fg-est-nom');
  ok(!(await p.$('input[name=fg-est-modo]')),'desde un borrador se guarda siempre como diseño nuevo');
  await p.fill('#fg-est-nom','Sin cashback (prueba)');await p.click('#fg-est-ok');await p.waitForTimeout(900);
  T=await tabs(p);console.log('  pestañas:',JSON.stringify(T));
  ok(T.includes('*Sin cashback (prueba)')&&!T.some(x=>/Borrador 1/.test(x)),'la pestaña pasa a llamarse como el diseño guardado');
  ok(await p.evaluate(()=>{const q=_fgProtoActivo();return !!q&&!q.temp;}),'y deja de ser borrador');
  // 8) cerrar "Borrador 2" con cambios: pide confirmación
  const x2=await p.$('#fg-optbar .fgp-bor .fgp-x');
  await x2.click();await p.waitForSelector('#fg-cf-ov');
  ok(/se pierden/i.test(await p.textContent('#fg-cf-ov')),'cerrar un borrador con cambios pide confirmación');
  await p.click('#fg-cf-ok');await p.waitForTimeout(400);
  ok(!(await tabs(p)).some(x=>/Borrador 2/.test(x)),'al confirmar se cierra');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
