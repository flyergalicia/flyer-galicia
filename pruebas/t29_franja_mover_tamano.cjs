const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  for(const m of ['farmacia del pueblo','puppis','freddo','nike']){await p.fill('#fg-fr-q',m);await p.waitForTimeout(250);await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.fill('#fg-fr-q','');await p.waitForTimeout(1500);
  ok((await p.textContent('#fg-fr-ajuste')).includes('Tocá un logo'),'sin logo marcado, se explica cómo acomodar');
  // tocar el logo 2 en la vista previa y arrastrarlo
  const c=await p.evaluate(()=>{const st=_fgFrSt,d=st._cajas[1],v=st._vista,cv=document.getElementById('fg-fr-prev').getBoundingClientRect(),k=cv.width/v.ancho;return {x:cv.left+(d.tx+d.tw/2-v.x0)*k,y:cv.top+(d.ty+d.th/2-v.y0)*k,k:k};});
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+15,c.y+6,{steps:4});await p.mouse.move(c.x+30,c.y+12,{steps:4});await p.mouse.up();
  await p.waitForTimeout(150);
  const s1=await p.evaluate(()=>({el:_fgFrSt.elegido,dx:_fgFrSt.sel[1].dx,dy:_fgFrSt.sel[1].dy}));
  console.log('  arrastre:',JSON.stringify(s1),'(esperado ~'+Math.round(30/c.k)+','+Math.round(12/c.k)+')');
  ok(s1.el===1&&Math.abs(s1.dx-30/c.k)<4&&Math.abs(s1.dy-12/c.k)<4,'tocar y arrastrar un logo lo corre');
  ok(await p.isVisible('#fg-fr-k1'),'aparece el tamaño de ese logo');
  // agrandar con + dos veces
  await p.click('#fg-fr-ajuste button[data-aj=mas]');await p.click('#fg-fr-ajuste button[data-aj=mas]');
  ok(await p.evaluate(()=>Math.abs(_fgFrSt.sel[1].k-1.2)<0.001),'+ agranda el logo (120%)');
  // tamaño de todos
  await p.$eval('#fg-fr-kt',r=>{r.value=90;r.dispatchEvent(new Event('input',{bubbles:true}));});
  ok(await p.evaluate(()=>Math.abs(_fgFrSt.kt-0.9)<0.001),'"Tamaño de todos" achica todos (90%)');
  await p.screenshot({path:__dirname+'/capturas/t29_ajuste.png'});
  // aplicar y ver que respeta (con todos los logos ya bajados)
  await p.waitForFunction(()=>_fgFrSt.sel.every(s=>_fgLg.imgs[s.img]),null,{timeout:30000}).catch(()=>{});await p.evaluate(()=>{_fgFrPreview();});
  const esperado=await p.evaluate(()=>{const st=_fgFrSt;return st._cajas.map(d=>[Math.round(d.tx),Math.round(d.ty),Math.round(d.tw),Math.round(d.th)].join(','));});
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});
  const puestos=await p.evaluate(()=>_fgLgActivos().filter(e=>e.franja&&!e.franjaBase).map(e=>[Math.round(e.tx),Math.round(e.ty),Math.round(e.tw),Math.round(e.th)].join(',')));
  console.log('  vista previa:',esperado.join(' | '));console.log('  en el flyer: ',puestos.join(' | '));
  ok(esperado.join()===puestos.join(),'el flyer queda exactamente como en la vista previa');
  const r=await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=260;c.getContext('2d').drawImage(fc,0,2620,1240,260,0,0,1240,260);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t29_descarga.png',Buffer.from(r.split(',')[1],'base64'));
  // retomar: vuelven los ajustes
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(150,2660,980,210));});await p.waitForSelector('#fg-fr-sel .fg-fr-it');
  ok(await p.evaluate(()=>Math.abs(_fgFrSt.kt-0.9)<0.001&&_fgFrSt.sel[1].k&&Math.abs(_fgFrSt.sel[1].k-1.2)<0.001&&_fgFrSt.sel[1].dx),'al retomar la franja vuelven los ajustes');
  // volver a su lugar
  await p.evaluate(()=>{_fgFrSt.elegido=1;_fgFrPreview();});await p.click('#fg-fr-ajuste button[data-aj=lugar]');
  ok(await p.evaluate(()=>{const s=_fgFrSt.sel[1];return !s.dx&&!s.dy&&s.k===1;}),'"Volver a su lugar" deshace el ajuste de ese logo');
  // tocar fuera de un logo lo suelta
  const v=await p.evaluate(()=>{const cv=document.getElementById('fg-fr-prev').getBoundingClientRect();return {x:cv.left+4,y:cv.top+4};});
  await p.mouse.click(v.x,v.y);await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgFrSt.elegido===-1),'tocar fuera de los logos los suelta');
  console.log('  errores:',p.errores.length);
};
