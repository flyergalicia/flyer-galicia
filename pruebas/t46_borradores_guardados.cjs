// Borradores que sobreviven a recargar: se guardan en el navegador y se ofrece recuperarlos
const {abrir,USERS}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const H0=await p.evaluate(()=>baseImg.height);
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.waitForFunction(()=>_fgBorr.revisado,null,{timeout:8000});
  // borrador 1: recorte; borrador 2: un logo
  await p.evaluate(()=>{fgRecAplicar(669,340);});await p.waitForTimeout(300);
  await p.evaluate(()=>{fgBorradorNuevo();});await p.waitForTimeout(1200);
  await p.evaluate(async()=>{let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}_fgLgPoner(_fgLgManual(600,2690,140,60),m.imagen,m.titulo,im);});
  await p.waitForTimeout(1800);
  const clave='fg_borradores_'+USERS.asesor.id;
  const guardado=await p.evaluate((k)=>localStorage.getItem(k),clave);
  const g=JSON.parse(guardado||'{}');
  console.log('  guardado:',(guardado||'').length,'caracteres,',(g.lista||[]).map(x=>x.nombre+' r'+x.recortes.length+' l'+x.cambios.length).join(' | '));
  ok(g.lista&&g.lista.length===2&&g.lista.some(x=>x.recortes.length===1)&&g.lista.some(x=>x.cambios.length===1),'los dos borradores quedan guardados en el navegador, cada uno con lo suyo');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
  // "recargar": otra página con lo guardado
  const q=await abrir(browser,{rol:'asesor',ls:{[clave]:guardado}});
  await q.waitForSelector('#fg-borr-rec',{timeout:8000});
  const txt=await q.textContent('#fg-borr-rec');console.log('  tarjeta:',txt.replace(/\s+/g,' ').trim());
  ok(/2 borradores/.test(txt),'al volver a entrar ofrece los 2 borradores de la última vez');
  await q.screenshot({path:__dirname+'/capturas/t46_recuperar.png'});
  await q.click('#fg-borr-si');await q.waitForTimeout(600);
  const tabs=await q.$$eval('#fg-optbar .fgp',x=>x.map(t=>t.textContent.replace('×','').trim()));
  ok(tabs.length===2,'"Recuperar" vuelve a poner las dos pestañas ('+tabs.join(', ')+')');
  ok(await q.evaluate(()=>baseImg.height)===H0,'sin abrir ninguno: el original sigue limpio');
  await q.click('#fg-optbar .fgp >> nth=0');await q.waitForTimeout(1400);
  const A=await q.evaluate(()=>({H:baseImg.height,n:_fgLgActivos().length}));
  await q.click('#fg-optbar .fgp >> nth=1');await q.waitForTimeout(1400);
  const B=await q.evaluate(()=>({H:baseImg.height,n:_fgLgActivos().length}));
  console.log('  contenido:',JSON.stringify([A,B]));
  ok([A,B].some(x=>x.H===H0-340)&&[A,B].some(x=>x.n===1),'cada borrador recuperado tiene su recorte o su logo');
  // cerrar uno lo borra de lo guardado
  await q.click('#fg-optbar .fgp >> nth=0 >> .fgp-x');await q.waitForSelector('#fg-cf-ok');await q.click('#fg-cf-ok');await q.waitForTimeout(1500);
  const g2=JSON.parse(await q.evaluate((k)=>localStorage.getItem(k),clave)||'{}');
  ok(g2.lista&&g2.lista.length===1,'cerrar un borrador lo saca de lo guardado');
  console.log('  errores:',q.errores.length,q.errores.slice(0,3));
  await q.context().close();
  // "Descartar"
  const r=await abrir(browser,{rol:'asesor',ls:{[clave]:guardado}});
  await r.waitForSelector('#fg-borr-rec',{timeout:8000});await r.click('#fg-borr-no');await r.waitForTimeout(600);
  ok(!(await r.evaluate((k)=>localStorage.getItem(k),clave))&&!(await r.$('#fg-optbar .fgp')),'"Descartar" los borra');
  await r.context().close();
  // con localStorage bloqueado no rompe nada
  const z=await abrir(browser,{rol:'asesor'});
  await z.evaluate(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('bloqueado');}});});
  await z.click('#fg-lg-btn');await z.evaluate(()=>{fgRecAplicar(669,340);});await z.waitForTimeout(1500);
  ok(z.errores.length===0&&await z.$$eval('#fg-optbar .fgp',x=>x.length)===1,'con el guardado del navegador bloqueado, el borrador anda igual y sin errores');
};
