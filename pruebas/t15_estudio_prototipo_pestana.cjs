const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const t=new Date().toISOString();
  nube.disenos.push({id:'d700-0000-4000-8000-000000000000',user_id:'00000000-0000-4000-8000-000000000001',autor:'Asesor Prueba',nombre:'MVP 4.0',empresa:'Farmacias del Sur',opcion:9,base_name:'',
    datos:{v:1,cambios:[{tipo:'txt',texto:'Lunes',color:'#040404',peso:500,fs:23,bfs:23,x:687,y:1374,w:89,h:53,bg:'rgb(255,254,254)',t:'Lunes',ox:691,oy:1378,ow:81,oh:45,tx:696,ty:1386,tw:71,th:30}],subidos:{}},
    miniatura:'',estado:'privado',nota_admin:'',opcion_publicada:null,pedido_at:null,revisado_at:null,created_at:t,updated_at:t});
  const a=await abrir(browser,{rol:'asesor'});
  const barra=()=>a.$$eval('#fg-optbar .fgo, #fg-optbar .fgp',x=>x.map(b=>(b.classList.contains('on')?'[':'')+b.textContent.replace('×','').trim()+(b.classList.contains('on')?']':'')));
  console.log('  barra al entrar:',await a.$('#fg-optbar').then(x=>x?'visible':'(no hay barra: una sola opción)'));
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card');
  await a.click('.est-card button[data-acc=usar]');
  await a.waitForFunction(()=>_fgLg.list.length===1&&_fgProtoAct,null,{timeout:15000});await a.waitForTimeout(300);
  console.log('  barra con el prototipo:',JSON.stringify(await barra()));
  ok((await barra()).includes('[MVP 4.0]'),'la pestaña lleva el nombre del diseño y está elegida');
  await a.screenshot({path:__dirname+'/capturas/t15_proto.png',clip:{x:0,y:60,width:420,height:120}});
  // volver al original
  await a.click('#fg-optbar .fgo[data-o="9"]');await a.waitForTimeout(400);
  ok(await a.evaluate(()=>_fgLgActivos().length===0&&!_fgProtoAct),'tocar el original vuelve al flyer sin cambios');
  console.log('  barra:',JSON.stringify(await barra()));
  // volver al prototipo
  await a.click('#fg-optbar .fgp');await a.waitForFunction(()=>_fgProtoAct&&_fgLgActivos().length===1,null,{timeout:10000});
  ok(true,'tocar la pestaña del prototipo vuelve a aplicarlo');
  // cambio sin guardar se recuerda al ir y volver
  await a.evaluate(()=>{_fgLg.list[0].tx+=40;_fgLgListo();});
  await a.click('#fg-optbar .fgo[data-o="9"]');await a.waitForTimeout(300);
  await a.click('#fg-optbar .fgp');await a.waitForFunction(()=>_fgProtoAct&&_fgLgActivos().length===1,null,{timeout:10000});
  ok(await a.evaluate(()=>Math.round(_fgLg.list[0].tx)===736),'lo que le cambiaste sin guardar se recuerda al ir y volver');
  // la descarga del prototipo lleva el diseño; la del original no
  ok(await a.evaluate(()=>(getVals().logos||[]).length===1),'descargar desde el prototipo lleva el diseño');
  // cerrar
  await a.click('#fg-optbar .fgp-x');await a.waitForTimeout(300);
  ok(await a.evaluate(()=>!document.querySelector('#fg-optbar .fgp')&&_fgLgActivos().length===0),'la × cierra la pestaña y vuelve al original');
  console.log('  barra tras cerrar:',await a.$('#fg-optbar').then(x=>x?'visible':'(sin barra)'));
  // recargar: no queda la pestaña pero el diseño sigue en Estudio
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card');await a.click('.est-card button[data-acc=usar]');
  await a.waitForFunction(()=>_fgProtoAct,null,{timeout:15000});
  await a.reload();await a.waitForFunction(()=>window._fgPrevGate===false&&window._fgOpt===9&&window.cv&&cv.height>1000,null,{timeout:25000});
  ok(!(await a.$('#fg-optbar .fgp')),'al recargar la página la pestaña del prototipo ya no está');
  await a.click('#apptab-estudio');await a.waitForSelector('.est-card');
  ok((await a.$$('.est-card')).length===1,'el diseño sigue en Estudio');
  // Restaurar con prototipo abierto
  await a.click('.est-card button[data-acc=usar]');await a.waitForFunction(()=>_fgProtoAct,null,{timeout:15000});
  await a.evaluate(()=>resetVals());await a.waitForTimeout(200);
  ok(await a.evaluate(()=>!_fgProtoAct&&_fgLgActivos().length===0&&!!document.querySelector('#fg-optbar .fgp')),'Restaurar vuelve al original y deja la pestaña para volver a abrirlo');
  // Desactivar pide confirmación
  const ad=await abrir(browser,{rol:'admin'});
  const antes=JSON.stringify(nube.json['_active9.json']);
  await ad.evaluate(()=>deactivateFlyer(null,9));
  await ad.waitForSelector('#fg-cf-ov');
  console.log('  confirmación:',await ad.textContent('#fg-cf-t'));
  await ad.click('#fg-cf-no');await ad.waitForTimeout(400);
  ok(JSON.stringify(nube.json['_active9.json'])===antes,'cancelar NO desactiva el flyer');
  console.log('  errores:',a.errores.length,ad.errores.length);
};
