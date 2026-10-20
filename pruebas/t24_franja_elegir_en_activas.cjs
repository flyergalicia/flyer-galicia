const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.selectOption('#fg-fr-prov','NEUQUEN');await p.waitForTimeout(300);
  // dos desde la ventana
  for(const m of ['anonima','open sports']){await p.fill('#fg-fr-q',m);await p.waitForTimeout(250);await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.fill('#fg-fr-q','');await p.waitForTimeout(300);
  ok(await p.isVisible('#fg-fr-act'),'aparece "Elegir en pantalla completa"');
  await p.click('#fg-fr-act');
  await p.waitForSelector('#fg-elegir-bar',{timeout:10000});await p.waitForSelector('.promos-elegir',{timeout:15000});
  ok(await p.isVisible('#view-promos')&&!(await p.$('#fg-fr-ov')),'abre Promociones → Activas a pantalla completa');
  console.log('  provincia en Activas:',await p.inputValue('#promos-prov'),'| una por marca:',await p.isChecked('#promos-unamarca'));
  console.log('  barra:',(await p.textContent('#fg-elegir-bar')).replace(/\s+/g,' ').trim());
  // las ya elegidas aparecen marcadas con su número
  const marcadas=await p.$$eval('.promos-elegir.on',x=>x.map(b=>b.textContent));
  console.log('  ya marcadas en la tabla:',JSON.stringify(marcadas));
  // elegir 3 más
  for(let i=0;i<3;i++){await p.click('.promos-elegir:not(.on):not([disabled]) >> nth='+(i*2));await p.waitForTimeout(80);}
  const nombres=await p.evaluate(()=>_fgElegir.st.sel.map(s=>s.t));
  console.log('  elegidas:',nombres.join(' | '));
  ok(nombres.length===5,'se suman las elegidas en Activas a las de la ventana');
  await p.screenshot({path:__dirname+'/capturas/t24_activas.png'});
  // destildar una en Activas
  await p.click('.promos-elegir.on >> nth=0');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgElegir.st.sel.length===4),'tocar de nuevo la saca');
  await p.click('#fg-elegir-bar .btn.bp');
  await p.waitForSelector('#fg-fr-ov .fg-fr-it',{timeout:15000});await p.waitForTimeout(600);
  const enVentana=await p.$$eval('#fg-fr-sel .fg-fr-it-t',x=>x.map(s=>s.textContent));
  console.log('  al volver, Tu selección:',enVentana.join(' | '));
  ok(enVentana.length===4&&!(await p.$('#fg-elegir-bar')),'"Volver a la franja" reabre la ventana con lo elegido y saca la barra');
  // arrastrar el último al primer lugar (con el mouse desde la fila)
  const filas=await p.$$('#fg-fr-sel .fg-fr-it');
  const a=await filas[3].boundingBox(),b=await filas[0].boundingBox();
  await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();
  await p.mouse.move(a.x+a.width/2,a.y+a.height/2-20,{steps:4});await p.mouse.move(b.x+b.width/2,b.y+4,{steps:8});
  await p.screenshot({path:__dirname+'/capturas/t24_arrastre.png'});
  await p.mouse.up();await p.waitForTimeout(300);
  const tras=await p.$$eval('#fg-fr-sel .fg-fr-it-t',x=>x.map(s=>s.textContent));
  console.log('  tras arrastrar:',tras.join(' | '));
  ok(tras[0]===enVentana[3]&&tras.length===4,'arrastrar el último arriba lo pone primero');
  // un clic en una flecha sigue funcionando (no se toma como arrastre)
  await p.click('#fg-fr-sel .fg-fr-it:nth-child(2) button[data-a=arr]');await p.waitForTimeout(150);
  const tras2=await p.$$eval('#fg-fr-sel .fg-fr-it-t',x=>x.map(s=>s.textContent));
  ok(tras2[0]===tras[1]&&tras2[1]===tras[0],'las flechas siguen funcionando');
  // con el dedo desde el agarre (pointer touch sobre el mango)
  const r=await p.evaluate(()=>{const f=[...document.querySelectorAll('#fg-fr-sel .fg-fr-it')];const m=f[0].querySelector('.fg-fr-mango').getBoundingClientRect(),z=f[3].getBoundingClientRect();return {x:m.left+m.width/2,y:m.top+m.height/2,y2:z.bottom-3};});
  await p.evaluate((r)=>{const m=document.querySelector('#fg-fr-sel .fg-fr-it .fg-fr-mango');const box=document.getElementById('fg-fr-sel');const ev=(t,y)=>new PointerEvent(t,{pointerType:'touch',pointerId:7,clientX:r.x,clientY:y,bubbles:true,isPrimary:true});m.dispatchEvent(ev('pointerdown',r.y));box.dispatchEvent(ev('pointermove',r.y+20));box.dispatchEvent(ev('pointermove',r.y2+8));box.dispatchEvent(ev('pointerup',r.y2+8));},r);
  await p.waitForTimeout(200);
  const tras3=await p.$$eval('#fg-fr-sel .fg-fr-it-t',x=>x.map(s=>s.textContent));
  console.log('  con el dedo (primero → último):',tras3.join(' | '));
  ok(tras3[3]===tras2[0],'con el dedo, desde el agarre, también se reordena');
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});
  const puestos=await p.evaluate(()=>_fgLgActivos().filter(e=>e.franja&&!e.franjaBase).map(e=>e.t));
  ok(puestos.join()===tras3.join(),'la franja sale en ese orden');
  // cancelar desde Activas
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-act');await p.click('#fg-fr-act');await p.waitForSelector('#fg-elegir-bar');
  await p.click('#fg-elegir-bar .btn.bg');await p.waitForTimeout(200);
  ok(!(await p.$('#fg-elegir-bar'))&&!(await p.$('.promos-elegir')),'Cancelar saca la barra y los botones + de la tabla');
  console.log('  errores:',p.errores.length);
};
