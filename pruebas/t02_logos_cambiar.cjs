const abrir=require('./nube_simple.cjs');
async function puntoPantalla(p,ix,iy){
  return p.evaluate(([ix,iy])=>{
    const prev=document.querySelector('.prev'),r0=cv.getBoundingClientRect();
    const k=(r0.width/cv.width)*SC;
    // llevar el punto al centro de la vista previa
    const pr=prev.getBoundingClientRect();
    prev.scrollTop+= (r0.top+iy*k)-(pr.top+pr.height/2);
    const r=cv.getBoundingClientRect();
    return {x:r.left+ix*k,y:r.top+iy*k};
  },[ix,iy]);
}
module.exports=async(browser)=>{
  const p=await abrir(browser);
  // Zoom un poco para ver mejor (como haría el oficial con Ctrl+rueda)
  await p.evaluate(()=>{ZOOM=1.6;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  const pt=await puntoPantalla(p,850,2708);
  await p.screenshot({path:__dirname+'/capturas/s2_modo.png'});
  await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:15000});
  await p.waitForTimeout(1500);
  await p.screenshot({path:__dirname+'/capturas/s3_ventana.png'});
  await p.fill('#fg-lg-q','farmacia del pueblo');
  await p.waitForTimeout(600);
  const items=await p.$$eval('#fg-lg-ov .fg-lg-it-t',a=>a.map(x=>x.textContent));
  console.log('resultados pueblo:',items.slice(0,8));
  await p.waitForTimeout(1200);
  await p.screenshot({path:__dirname+'/capturas/s4_busqueda.png'});
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');
  await p.waitForSelector('#fg-lg-ov',{state:'detached',timeout:15000});
  await p.waitForTimeout(400);
  console.log('lista',JSON.stringify(_=await p.evaluate(()=>_fgLg.list.map(e=>[e.t,Math.round(e.tx),Math.round(e.ty),Math.round(e.tw),Math.round(e.th)]))));
  await p.screenshot({path:__dirname+'/capturas/s5_cambiado.png'});
  // segundo: Megatlon -> dejar vacío ; tercero: Starbucks por Havanna
  const pt2=await puntoPantalla(p,668,2708);
  await p.mouse.click(pt2.x,pt2.y);
  await p.waitForSelector('#fg-lg-nada');await p.click('#fg-lg-nada');
  const pt3=await puntoPantalla(p,498,2820);
  await p.mouse.click(pt3.x,pt3.y);
  await p.waitForSelector('#fg-lg-ov .fg-lg-it');
  await p.fill('#fg-lg-q','scienza');await p.waitForTimeout(500);
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');
  await p.waitForSelector('#fg-lg-ov',{state:'detached',timeout:15000});
  await p.waitForTimeout(300);
  await p.screenshot({path:__dirname+'/capturas/s6_tres.png'});
  // Descarga: el flyer en alta tiene que traer los cambios
  const r=await p.evaluate(()=>{
    const v=getVals();const fc=fullRes(v);
    const c=document.createElement('canvas');c.width=1240;c.height=420;
    c.getContext('2d').drawImage(fc,0,2560,1240,420,0,0,1240,420);
    return {n:(v.logos||[]).length,png:c.toDataURL('image/png')};
  });
  console.log('logos en la descarga:',r.n);
  require('fs').writeFileSync(__dirname+'/capturas/s7_descarga.png',Buffer.from(r.png.split(',')[1],'base64'));
  // Restaurar vuelve todo
  await p.evaluate(()=>{resetVals();});
  console.log('después de Restaurar:',await p.evaluate(()=>(getVals().logos||[]).length));
};
