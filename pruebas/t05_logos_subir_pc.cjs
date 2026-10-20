const abrir=require('./nube_simple.cjs');
module.exports=async(browser)=>{
  const p=await abrir(browser);
  await p.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  const tap=async(ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
  // 1) Megatlon -> subir un logo de la PC (GO Farma, que bajé antes)
  let pt=await tap(668,2708,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-subir');
  await p.screenshot({path:__dirname+'/capturas/t5_ventana.png'});
  await p.setInputFiles('#fg-lg-file',__dirname+'/datos/gofarma_180.png');
  await p.waitForSelector('#fg-lg-ov',{state:'detached',timeout:8000});
  console.log('subido:',await p.evaluate(()=>_fgLg.list.map(e=>[e.t,e.img.slice(0,12),Math.round(e.tw),Math.round(e.th)])));
  // archivo que no es imagen
  pt=await tap(1012,2720,false);await p.mouse.click(pt.x,pt.y);await p.waitForSelector('#fg-lg-subir');
  await p.setInputFiles('#fg-lg-file',{name:'nota.txt',mimeType:'text/plain',buffer:Buffer.from('hola')});
  await p.waitForTimeout(400);
  console.log('txt -> aviso:',await p.evaluate(()=>[...document.querySelectorAll('.toast,#toast')].map(t=>t.textContent).join('|')),'ventana sigue:',await p.isVisible('#fg-lg-ov'));
  await p.keyboard.press('Escape');
  // 2) recuadro en un lugar libre (a la izquierda de "+ 1000 promos")
  const a=await tap(95,2872,true);const b=await tap(225,2928,false);
  await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:4});await p.mouse.move(b.x,b.y,{steps:4});await p.mouse.up();
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:10000});
  console.log('título:',await p.textContent('#fg-lg-t'),'| botón vacío:',await p.$('#fg-lg-nada').then(x=>!!x));
  await p.fill('#fg-lg-q','puppis');await p.waitForTimeout(500);
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');await p.waitForSelector('#fg-lg-ov',{state:'detached'});await p.waitForTimeout(300);
  console.log('lista:',await p.evaluate(()=>_fgLg.list.map(e=>e.t)));
  await p.screenshot({path:__dirname+'/capturas/t5_listo.png'});
  const r=await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=360;c.getContext('2d').drawImage(fc,0,2600,1240,360,0,0,1240,360);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t5_descarga.png',Buffer.from(r.split(',')[1],'base64'));
};
