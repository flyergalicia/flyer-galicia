const abrir=require('./nube_simple.cjs');
module.exports=async(browser)=>{
  const p=await abrir(browser);
  await p.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  const tap=async(ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
  // cambiar Farmacity por Farmacia Del Pueblo
  let pt=await tap(850,2708,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-ov .fg-lg-it');await p.fill('#fg-lg-q','farmacia del pueblo');await p.waitForTimeout(500);
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');await p.waitForSelector('#fg-lg-ov',{state:'detached'});await p.waitForTimeout(300);
  const L=()=>p.evaluate(()=>{const e=_fgLg.list[0];return {sel:_fgLg.sel,tx:Math.round(e.tx),ty:Math.round(e.ty),tw:Math.round(e.tw),th:Math.round(e.th),pct:_fgLgPct(e)};});
  console.log('al elegir:',await L(),'barrita visible:',await p.isVisible('#fg-lg-herr'));
  await p.screenshot({path:__dirname+'/capturas/t4_barrita.png'});
  // agrandar con + dos veces
  await p.click('#fg-lg-herr button[data-a=mas]');await p.click('#fg-lg-herr button[data-a=mas]');await p.waitForTimeout(100);
  console.log('después de ++:',await L());
  // regla al 80%
  await p.$eval('#fg-lg-tam',r=>{r.value=80;r.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForTimeout(100);
  console.log('regla 80:',await L());
  // arrastrar el logo 40px de imagen a la izquierda y 10 abajo
  let e=await L();pt=await tap(e.tx+e.tw/2,e.ty+e.th/2,false);
  await p.mouse.move(pt.x,pt.y);await p.mouse.down();await p.mouse.move(pt.x-20*pt.k,pt.y+5*pt.k,{steps:4});await p.mouse.move(pt.x-40*pt.k,pt.y+10*pt.k,{steps:4});await p.mouse.up();
  await p.waitForTimeout(150);
  console.log('arrastrado (-40,+10):',await L(),'ventana abierta?',await p.isVisible('#fg-lg-ov').catch(()=>false));
  // flechas
  await p.keyboard.press('ArrowRight');await p.keyboard.press('Shift+ArrowUp');await p.waitForTimeout(100);
  console.log('flechas (+1,-10):',await L());
  await p.screenshot({path:__dirname+'/capturas/t4_movido.png'});
  // centrar
  await p.click('#fg-lg-herr button[data-a=centrar]');await p.waitForTimeout(100);
  console.log('centrado:',await L());
  // cambiar marca desde la barrita
  await p.click('#fg-lg-herr button[data-a=cambiar]');
  console.log('abre la ventana:',await p.waitForSelector('#fg-lg-ov',{timeout:5000}).then(()=>true).catch(()=>false));
  await p.keyboard.press('Escape');
  // tocar otro logo deselecciona y abre la ventana
  pt=await tap(1012,2720,false);await p.mouse.click(pt.x,pt.y);
  console.log('otro logo abre ventana:',await p.waitForSelector('#fg-lg-ov',{timeout:5000}).then(()=>true).catch(()=>false),'sel',await p.evaluate(()=>_fgLg.sel));
  await p.keyboard.press('Escape');
  // la descarga lleva la posición/tamaño
  const r=await p.evaluate(()=>{const v=getVals();const fc=fullRes(v);const c=document.createElement('canvas');c.width=700;c.height=200;c.getContext('2d').drawImage(fc,450,2620,700,200,0,0,700,200);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t4_descarga.png',Buffer.from(r.split(',')[1],'base64'));
};
