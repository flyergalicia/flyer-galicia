// Guías con imán, alinear/repartir/mismo tamaño, duplicar y quitar
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(()=>{ZOOM=1.3;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // 3 logos a distinta altura y tamaño
  await p.evaluate(async()=>{
    const m=[];for(const x of _promosCat){if(m.length>=3)break;if(!x.imagen||m.some(y=>y.imagen===x.imagen))continue;try{await _fgLgTraer(x.imagen);m.push(x);}catch(e){}}
    [[250,2680,140,60],[560,2700,120,50],[880,2720,160,70]].forEach((r,i)=>{const det=_fgLgManual(r[0],r[1],r[2],r[3]);_fgLgPoner(det,m[i].imagen,m[i].titulo,_fgLg.imgs[m[i].imagen]);});
    _fgLg.sel=-1;_fgLgHistMarcar();_fgLgListo();
    const prev=document.querySelector('.prev'),r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+2720*k0)-(pr.top+pr.height/2);
  });
  await p.waitForTimeout(200);
  const L=()=>p.evaluate(()=>_fgLgActivos().map(e=>({x:e.tx,y:e.ty,w:e.tw,h:e.th,dup:!!e.dup})));
  const pant=(ix,iy)=>p.evaluate(([ix,iy])=>{const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy]);
  // 1) guías: llevar el logo 2 casi a la altura del centro del logo 1
  let A=await L();
  const c1=await pant(A[1].x+A[1].w/2,A[1].y+A[1].h/2),k=c1.k;
  const objetivoDy=(A[0].y+A[0].h/2)-(A[1].y+A[1].h/2)+3/1; // 3 px de imagen de más: debería pegarse
  await p.mouse.move(c1.x,c1.y);await p.mouse.down();
  await p.mouse.move(c1.x+5,c1.y+objetivoDy*k,{steps:6});
  const guias=await p.$$eval('#fg-lg-guias .fg-lg-guia',x=>x.map(g=>g.className));
  await p.screenshot({path:__dirname+'/capturas/t38_guias.png'});
  await p.mouse.up();await p.waitForTimeout(700);
  A=await L();
  console.log('  guías vistas:',JSON.stringify(guias),'| centros Y:',(A[0].y+A[0].h/2).toFixed(2),(A[1].y+A[1].h/2).toFixed(2));
  ok(guias.some(g=>g.includes(' h')),'al arrastrar aparece la guía horizontal');
  const pegado=await p.evaluate(()=>{const As=_fgLgActivos(),m=As[1],mios=[m.ty,m.ty+m.th/2,m.ty+m.th],c=[m.oy+m.oh/2];[0,2].forEach(i=>{const e=As[i];c.push(e.ty,e.ty+e.th/2,e.ty+e.th);});return mios.some(a=>c.some(b=>Math.abs(a-b)<0.001));});
  ok(pegado,'queda exactamente pegado a una línea (borde o centro de otro logo)');
  ok(await p.$$eval('#fg-lg-guias .fg-lg-guia',x=>x.length)===0,'al soltar las guías desaparecen');
  // con Alt no se pega
  const B0=await L(),c1b=await pant(B0[1].x+B0[1].w/2,B0[1].y+B0[1].h/2);
  await p.keyboard.down('Alt');await p.mouse.move(c1b.x,c1b.y);await p.mouse.down();await p.mouse.move(c1b.x+3,c1b.y+2*k,{steps:4});await p.mouse.up();await p.keyboard.up('Alt');await p.waitForTimeout(700);
  const B1=await L();ok(Math.abs((B1[0].y+B1[0].h/2)-(B1[1].y+B1[1].h/2))>0.5,'con Alt apretado no se pega');
  // 2) elegir los 3 con Shift
  const sel3=async()=>{const X=await L();for(let i=0;i<3;i++){const c=await pant(X[i].x+X[i].w/2,X[i].y+X[i].h/2);if(i)await p.keyboard.down('Shift');await p.mouse.click(c.x,c.y);if(i)await p.keyboard.up('Shift');}await p.waitForTimeout(100);};
  await sel3();
  ok(await p.isVisible('#fg-lg-alin')&&await p.isVisible('#fg-lg-alin [data-a=repartir]'),'con 3 elegidos se ven Alinear y Repartir');
  await p.screenshot({path:__dirname+'/capturas/t38_barrita.png'});
  const ppal=await p.evaluate(()=>_fgLg.sel);
  await p.click('#fg-lg-alin [data-a=al-med]');await p.waitForTimeout(700);
  A=await L();const cy=A.map(e=>e.y+e.h/2);
  ok(cy.every(v=>Math.abs(v-cy[ppal])<0.01),'"Al medio" deja los 3 con el mismo centro');
  await p.click('#fg-lg-alin [data-a=repartir]');await p.waitForTimeout(700);
  A=await L();const o=[...A].sort((a,b)=>a.x-b.x),h1=o[1].x-(o[0].x+o[0].w),h2=o[2].x-(o[1].x+o[1].w);
  ok(Math.abs(h1-h2)<1,'"Repartir" deja el mismo espacio entre logos ('+h1.toFixed(1)+' / '+h2.toFixed(1)+')');
  await p.click('#fg-lg-alin [data-a=mismo]');await p.waitForTimeout(700);
  A=await L();ok(A.every(e=>Math.abs(e.h-A[ppal].h)<1),'"Mismo tamaño" deja el mismo alto');
  const pasos=await p.evaluate(()=>{_fgLgHistMarcar();return _fgLgHist.pasos.slice(-4).map(x=>x.et);});
  console.log('  pasos:',JSON.stringify(pasos));
  await p.keyboard.press('Control+z');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>_fgLgHist.pasos[_fgLgHist.i+1].et).then(x=>/Tamaño/.test(x)),'Ctrl+Z deshace "Mismo tamaño" en un paso');
  // 3) duplicar con Ctrl+C / Ctrl+V
  let X=await L();const c0=await pant(X[0].x+X[0].w/2,X[0].y+X[0].h/2);await p.mouse.click(c0.x,c0.y);
  await p.keyboard.press('Control+c');await p.keyboard.press('Control+v');await p.waitForTimeout(700);
  X=await L();
  ok(X.length===4&&X[3].dup&&Math.abs(X[3].x-X[0].x-16)<0.01&&Math.abs(X[3].y-X[0].y-16)<0.01,'Ctrl+C / Ctrl+V crea una copia corrida 16 px');
  const tapa=await p.evaluate(()=>{const e=_fgLgActivos()[3];return e.w===0&&e.h===0;});ok(tapa,'la copia no tapa lo que hay abajo');
  ok(await p.evaluate(()=>(getVals().logos||[]).length)===4,'la copia va en la descarga');
  await p.keyboard.press('Delete');await p.waitForTimeout(700);
  ok((await L()).length===3,'Supr quita la copia');
  // Supr sobre un logo cambiado: vuelve al original
  await p.mouse.click(c0.x,c0.y);await p.keyboard.press('Delete');await p.waitForTimeout(700);
  ok((await L()).length===2,'Supr sobre un logo cambiado lo vuelve al original');
  await p.keyboard.press('Control+z');await p.waitForTimeout(150);
  ok((await L()).length===3,'Ctrl+Z lo recupera');
  // botón Duplicar
  X=await L();const c2=await pant(X[2].x+X[2].w/2,X[2].y+X[2].h/2);await p.mouse.click(c2.x,c2.y);
  await p.click('#fg-lg-herr [data-a=dup]');await p.waitForTimeout(150);
  ok((await L()).length===4,'el botón Duplicar crea la copia');
  // en un campo de texto, Ctrl+V y Supr no tocan los logos
  await p.click('#empresa');await p.keyboard.type('ACME');await p.keyboard.press('Backspace');await p.keyboard.press('Control+v');await p.waitForTimeout(200);
  ok((await L()).length===4&&(await p.inputValue('#empresa')).startsWith('ACM'),'escribiendo en un campo, Supr/Ctrl+V no tocan los logos');
  // Ver limpio esconde la barrita
  await p.click('#fg-lg-ver');await p.waitForTimeout(100);
  ok(!(await p.isVisible('#fg-lg-herr')),'Ver limpio esconde la barrita con los botones nuevos');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
