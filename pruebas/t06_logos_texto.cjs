const abrir=require('./nube_simple.cjs');
module.exports=async(browser)=>{
  const p=await abrir(browser);
  await p.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  const tap=async(ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
  // 1) cambiar el texto "Martes y jueves" (debajo de Jumbo)
  let pt=await tap(730,1395,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-escribir');await p.click('#fg-lg-escribir');
  await p.fill('#fg-lg-tx','Lunes y\nmiércoles');await p.waitForTimeout(200);
  await p.screenshot({path:__dirname+'/capturas/t6_form.png'});
  console.log('tamaño sugerido:',await p.inputValue('#fg-lg-fs'),'colores:',await p.$$eval('.fg-lg-col',a=>a.map(x=>x.title)));
  await p.click('#fg-lg-txt-ok');await p.waitForSelector('#fg-lg-ov',{state:'detached'});await p.waitForTimeout(500);
  const L=()=>p.evaluate(()=>_fgLg.list.map(e=>({tipo:e.tipo||'logo',t:e.t,img:(e.img||'').slice(0,20),tx:Math.round(e.tx),ty:Math.round(e.ty),tw:Math.round(e.tw),th:Math.round(e.th),fs:e.fs,color:e.color,sel:_fgLg.sel})));
  console.log('texto puesto:',JSON.stringify(await L()));
  await p.screenshot({path:__dirname+'/capturas/t6_texto.png'});
  // agrandar el texto
  await p.click('#fg-lg-herr button[data-a=mas]');await p.waitForTimeout(100);
  console.log('texto +10%:',JSON.stringify((await L())[0]),'botón dice:',await p.textContent('#fg-lg-herr button[data-a=cambiar]'));
  // editar el texto desde la barrita
  await p.click('#fg-lg-herr button[data-a=cambiar]');await p.waitForSelector('#fg-lg-tx');
  console.log('editar trae:',JSON.stringify(await p.inputValue('#fg-lg-tx')));
  await p.fill('#fg-lg-tx','Lunes');await p.click('#fg-lg-txt-ok');await p.waitForSelector('#fg-lg-ov',{state:'detached'});
  console.log('editado:',JSON.stringify((await L())[0]),'cantidad',(await L()).length);
  // 2) mover un logo original (Kiddo)
  pt=await tap(205,2708,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-mover');await p.click('#fg-lg-mover');await p.waitForTimeout(200);
  let l=(await L())[1];console.log('kiddo para mover:',JSON.stringify(l));
  pt=await tap(l.tx+l.tw/2,l.ty+l.th/2,false);
  await p.mouse.move(pt.x,pt.y);await p.mouse.down();await p.mouse.move(pt.x+15*pt.k,pt.y,{steps:3});await p.mouse.move(pt.x+30*pt.k,pt.y,{steps:3});await p.mouse.up();await p.waitForTimeout(150);
  console.log('kiddo movido +30:',JSON.stringify((await L())[1]));
  const r=await p.evaluate(()=>{const fc=fullRes(getVals());const out={};for(const [k,y,h] of [['super',1240,220],['marcas',2620,240]]){const c=document.createElement('canvas');c.width=1240;c.height=h;c.getContext('2d').drawImage(fc,0,y,1240,h,0,0,1240,h);out[k]=c.toDataURL('image/png');}return out;});
  for(const k in r)require('fs').writeFileSync(__dirname+'/capturas/t6_'+k+'.png',Buffer.from(r[k].split(',')[1],'base64'));
};
