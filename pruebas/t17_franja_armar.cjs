const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tap=(p,ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  console.log('  detección de la franja de marcas:',JSON.stringify(await p.evaluate(()=>{const r=_fgFrDetectar(140,2650,1000,230);return {n:r.n,filas:r.filas.map(f=>f.n),porFila:r.porFila,medH:r.medH,bg:r.bg};})));
  await p.evaluate(()=>{ZOOM=1.3;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  ok(await p.isVisible('#fg-lg-franja'),'aparece el botón "Armar franja"');
  await p.click('#fg-lg-franja');
  console.log('  ayuda:',await p.textContent('#fg-lg-tip'));
  // un clic sin arrastrar avisa
  let a=await tap(p,600,2760,true);await p.mouse.click(a.x,a.y);await p.waitForTimeout(200);
  ok(!(await p.$('#fg-fr-ov')),'un clic suelto no abre nada (avisa que hay que arrastrar)');
  // arrastrar la franja
  a=await tap(p,140,2650,false);const b=await tap(p,1140,2880,false);
  await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:5});await p.mouse.move(b.x,b.y,{steps:5});await p.mouse.up();
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  console.log('  ventana:',(await p.textContent('#fg-fr-ov .fg-cf-b')).slice(0,90));
  // tildar 8 marcas buscando
  const marcas=['farmacia del pueblo','puppis','freddo','nike','starbucks','uber','megatlon','cabify'];
  for(const m of marcas){await p.fill('#fg-fr-q',m);await p.waitForTimeout(250);const it=await p.$('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');if(it)await it.click();await p.waitForTimeout(80);}
  await p.fill('#fg-fr-q','');await p.waitForTimeout(800);
  const sel=await p.$$eval('#fg-fr-sel .fg-fr-it .fg-fr-it-t',x=>x.map(s=>s.textContent));
  console.log('  selección:',sel.join(' | '));
  // subir el último al primer lugar
  for(let i=0;i<sel.length-1;i++){await p.click('#fg-fr-sel .fg-fr-it:last-child button[data-a=arr]').catch(()=>{});}
  await p.evaluate(()=>{});await p.waitForTimeout(100);
  // el último quedó primero? (subo el último 7 veces → Cabify a la cabeza)
  let orden=await p.$$eval('#fg-fr-sel .fg-fr-it .fg-fr-it-t',x=>x.map(s=>s.textContent));
  // la acción "arr" sobre el último sólo lo sube un lugar por vez: lo hago desde su posición actual
  for(let i=orden.length-1;i>0;i--){await p.click('#fg-fr-sel .fg-fr-it:nth-child('+(i+1)+') button[data-a=arr]');await p.waitForTimeout(30);}
  orden=await p.$$eval('#fg-fr-sel .fg-fr-it .fg-fr-it-t',x=>x.map(s=>s.textContent));
  console.log('  orden final:',orden.join(' | '));
  await p.waitForTimeout(1500);
  await p.screenshot({path:__dirname+'/capturas/t17_ventana.png'});
  console.log('  botón:',await p.textContent('#fg-fr-ok'));
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(400);
  const st=await p.evaluate(()=>({n:_fgLgActivos().length,base:_fgLgActivos().filter(e=>e.franjaBase).length,logos:_fgLgActivos().filter(e=>e.franja&&!e.franjaBase).map(e=>e.t)}));
  console.log('  cambios:',JSON.stringify(st));
  ok(st.base===1&&st.logos.length===orden.length&&st.logos[0]===orden[0],'se tapó la franja y se pusieron los logos en el orden elegido');
  await p.screenshot({path:__dirname+'/capturas/t17_aplicada.png'});
  const r=await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=300;c.getContext('2d').drawImage(fc,0,2600,1240,300,0,0,1240,300);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t17_descarga.png',Buffer.from(r.split(',')[1],'base64'));
  // tocar un logo de la franja → barrita (ajustable)
  const l=await p.evaluate(()=>{const e=_fgLgActivos().filter(e=>e.franja&&!e.franjaBase)[2];return {x:e.tx+e.tw/2,y:e.ty+e.th/2};});
  a=await tap(p,l.x,l.y,false);await p.mouse.click(a.x,a.y);await p.waitForTimeout(200);
  ok(await p.isVisible('#fg-lg-herr'),'un logo de la franja se ajusta con la barrita');
  // volver a armar la franja: retoma la selección
  await p.click('#fg-lg-franja');
  a=await tap(p,150,2660,false);const b2=await tap(p,1130,2870,false);
  await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b2.x,b2.y,{steps:8});await p.mouse.up();
  await p.waitForSelector('#fg-fr-ov');
  const re=await p.$$eval('#fg-fr-sel .fg-fr-it .fg-fr-it-t',x=>x.map(s=>s.textContent));
  ok(re.join()===orden.join(),'volver a "Armar franja" en el mismo lugar retoma la selección');
  await p.selectOption('#fg-fr-por','4');await p.waitForTimeout(500);
  await p.screenshot({path:__dirname+'/capturas/t17_por4.png'});
  await p.click('#fg-fr-quitar');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>_fgLgActivos().filter(e=>e.franja).length===0),'"Volver la franja al original" la saca');
  console.log('  errores:',p.errores.length);
};
