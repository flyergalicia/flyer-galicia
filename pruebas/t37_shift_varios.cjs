// Shift + clic: varios logos juntos (flyer y vista previa de la franja)
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(()=>{ZOOM=1.3;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // tres logos puestos sobre la franja
  await p.evaluate(async()=>{
    const marcas=[];for(const x of _promosCat){if(marcas.length>=3)break;if(!x.imagen||marcas.some(m=>m.imagen===x.imagen))continue;try{await _fgLgTraer(x.imagen);marcas.push(x);}catch(e){}}
    [[300,2690],[600,2690],[900,2690]].forEach((xy,i)=>{const det=_fgLgManual(xy[0],xy[1],140,60);_fgLgPoner(det,marcas[i].imagen,marcas[i].titulo,_fgLg.imgs[marcas[i].imagen]);});
    _fgLg.sel=-1;_fgLgHistMarcar();_fgLgListo();
    const prev=document.querySelector('.prev'),r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+2720*k0)-(pr.top+pr.height/2);
  });
  await p.waitForTimeout(200);
  const centro=i=>p.evaluate(i=>{const L=_fgLgActivos()[i],r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+(L.tx+L.tw/2)*k,y:r.top+(L.ty+L.th/2)*k};},i);
  const pos=()=>p.evaluate(()=>_fgLgActivos().map(L=>[Math.round(L.tx),Math.round(L.ty),Math.round(L.tw)]));
  let c0=await centro(0),c1=await centro(1);
  await p.mouse.click(c0.x,c0.y);
  await p.keyboard.down('Shift');await p.mouse.click(c1.x,c1.y);await p.keyboard.up('Shift');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgLgElegidos().length)===2,'clic + Shift-clic eligen 2 logos');
  ok(await p.$$eval('#fg-lg-mk .fg-lg-marca.grupo',x=>x.length)===2,'los 2 se ven marcados');
  console.log('  barrita:',await p.textContent('#fg-lg-herr-nom'),'| Cambiar escondido:',await p.$eval('#fg-lg-herr button[data-a=cambiar]',b=>b.hidden));
  await p.screenshot({path:__dirname+'/capturas/t37_grupo.png'});
  // arrastrar uno mueve a los dos
  const a0=await pos();
  await p.mouse.move(c0.x,c0.y);await p.mouse.down();await p.mouse.move(c0.x+30,c0.y+10,{steps:5});await p.mouse.up();await p.waitForTimeout(700);
  const a1=await pos();
  const d0=[a1[0][0]-a0[0][0],a1[0][1]-a0[0][1]],d1=[a1[1][0]-a0[1][0],a1[1][1]-a0[1][1]];
  console.log('  movidos:',d0,d1,'tercero:',a1[2][0]-a0[2][0]);
  ok(d0[0]>5&&d0+''===d1+''&&a1[2][0]===a0[2][0],'arrastrar uno mueve a los dos juntos (y no al tercero)');
  ok(await p.evaluate(()=>_fgLgElegidos().length)===2,'después de arrastrar siguen los 2 elegidos');
  // + agranda a los dos
  await p.click('#fg-lg-herr button[data-a=mas]');await p.waitForTimeout(700);
  const a2=await pos();ok(a2[0][2]>a1[0][2]&&a2[1][2]>a1[1][2]&&a2[2][2]===a1[2][2],'"+" agranda a los dos');
  // flecha mueve a los dos
  await p.keyboard.press('ArrowRight');await p.waitForTimeout(700);
  const a3=await pos();ok(a3[0][0]===a2[0][0]+1&&a3[1][0]===a2[1][0]+1,'la flecha mueve a los dos');
  // deshacer: el movimiento de grupo es un paso
  await p.keyboard.press('Control+z');await p.waitForTimeout(150);
  ok(JSON.stringify(await pos())===JSON.stringify(a2),'Ctrl+Z deshace la flecha de los dos en un paso');
  // Escape suelta todo
  c0=await centro(0);c1=await centro(1);await p.mouse.click(c0.x,c0.y);await p.keyboard.down('Shift');await p.mouse.click(c1.x,c1.y);await p.keyboard.up('Shift');await p.waitForTimeout(100);
  await p.click('#fg-lg-herr button[data-a=soltar]');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgLgElegidos().length)===0,'la × suelta a todos');
  // Shift + recuadro
  c0=await centro(0);const c2=await centro(2);
  await p.keyboard.down('Shift');await p.mouse.move(c0.x-120,c0.y-70);await p.mouse.down();await p.mouse.move(c2.x+80,c2.y+60,{steps:6});await p.mouse.up();await p.keyboard.up('Shift');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>_fgLgElegidos().length)===3&&!(await p.$('#fg-lg-ov')),'Shift + recuadro elige los 3 (sin abrir la ventana)');
  // clic sin Shift en uno de fuera del grupo: queda sólo ese
  await p.keyboard.press('Escape');c1=await centro(1);await p.mouse.click(c1.x,c1.y);await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgLgElegidos().join())==='1','clic sin Shift elige sólo uno');
  // ---- franja ----
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.evaluate(async()=>{const L=_fgFrSt.res,b=[];for(const x of L){if(b.length>=5)break;try{await _fgLgTraer(x.imagen);b.push(x);}catch(e){}}b.forEach(x=>_fgFrSt.sel.push({img:x.imagen,t:x.titulo}));_fgFrLista();_fgFrSelPintar();_fgFrPreview();});
  const cc=i=>p.evaluate(i=>{const st=_fgFrSt,d=st._cajas[i],v=st._vista,cv2=document.getElementById('fg-fr-prev').getBoundingClientRect(),k=cv2.width/v.ancho;return {x:cv2.left+(d.tx+d.tw/2-v.x0)*k,y:cv2.top+(d.ty+d.th/2-v.y0)*k};},i);
  const q0=await cc(0),q2=await cc(2);
  await p.mouse.click(q0.x,q0.y);await p.keyboard.down('Shift');await p.mouse.click(q2.x,q2.y);await p.keyboard.up('Shift');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgFrElegidos(_fgFrSt).join())==='0,2','franja: Shift-clic elige el 1 y el 3');
  ok(await p.$$eval('#fg-fr-sel .fg-fr-it.sel',x=>x.length)===2,'franja: las 2 filas quedan resaltadas');
  ok((await p.textContent('#fg-fr-ajuste')).includes('2 elegidos'),'franja: los controles dicen "2 elegidos"');
  await p.mouse.move(q2.x,q2.y);await p.mouse.down();await p.mouse.move(q2.x+15,q2.y+8,{steps:4});await p.mouse.up();await p.waitForTimeout(100);
  const ds=await p.evaluate(()=>_fgFrSt.sel.map(s=>[s.dx||0,s.dy||0]));console.log('  franja dx/dy:',JSON.stringify(ds));
  ok(ds[0]+''===ds[2]+''&&ds[0][0]!==0&&ds[1][0]===0,'franja: arrastrar uno mueve a los dos');
  await p.click('#fg-fr-ajuste button[data-aj=mas]');await p.waitForTimeout(100);
  const ks=await p.evaluate(()=>_fgFrSt.sel.map(s=>s.k||1));ok(ks[0]>1&&ks[2]>1&&ks[1]===1,'franja: "+" agranda a los dos');
  await p.screenshot({path:__dirname+'/capturas/t37_franja.png'});
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
