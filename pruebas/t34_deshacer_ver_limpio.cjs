// Deshacer / Rehacer de a un paso + Vista previa limpia
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const tap=(p,ix,iy,centrar)=>p.evaluate(([ix,iy,centrar])=>{const prev=document.querySelector('.prev');if(centrar){const r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+iy*k0)-(pr.top+pr.height/2);}const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+ix*k,y:r.top+iy*k,k};},[ix,iy,centrar]);
const foto=p=>p.evaluate(()=>JSON.stringify(getVals().logos||[]));
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(()=>{ZOOM=1.3;calcSC();redrawNow();});
  await p.click('#fg-lg-btn');
  ok(await p.isVisible('#fg-lg-desh')&&await p.isDisabled('#fg-lg-desh')&&await p.isDisabled('#fg-lg-reh'),'al prender: Deshacer y Rehacer se ven, apagados');
  const S=[await foto(p)];
  // 1) cambiar Megatlon por Puppis
  let pt=await tap(p,668,2708,true);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:15000});
  await p.fill('#fg-lg-q','puppis');await p.waitForTimeout(500);
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');await p.waitForSelector('#fg-lg-ov',{state:'detached',timeout:10000});await p.waitForTimeout(700);
  S.push(await foto(p));
  ok(!(await p.isDisabled('#fg-lg-desh')),'después del primer cambio, Deshacer se prende');
  console.log('  título del botón:',await p.getAttribute('#fg-lg-desh','title'));
  // 2) arrastrar el logo
  const c=await p.evaluate(()=>{const L=_fgLgActivos()[_fgLg.sel];const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+(L.tx+L.tw/2)*k,y:r.top+(L.ty+L.th/2)*k};});
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+20,c.y+5,{steps:4});await p.waitForTimeout(700);
  await p.mouse.move(c.x+40,c.y+10,{steps:4});await p.mouse.up();await p.waitForTimeout(700);
  S.push(await foto(p));
  // 3) tres "+" seguidos = un paso
  for(let i=0;i<3;i++){await p.click('#fg-lg-herr button[data-a=mas]');await p.waitForTimeout(80);}
  await p.waitForTimeout(700);S.push(await foto(p));
  // 4) texto en otro logo
  pt=await tap(p,1012,2720,false);await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-lg-escribir',{timeout:10000});await p.click('#fg-lg-escribir');await p.fill('#fg-lg-tx','Lunes');await p.click('#fg-lg-txt-ok');
  await p.waitForSelector('#fg-lg-ov',{state:'detached'});await p.waitForTimeout(700);S.push(await foto(p));
  // 5) franja (sin esperar: Ctrl+Z enseguida tiene que deshacerla igual)
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  for(const m of ['farmacia del pueblo','freddo']){await p.fill('#fg-fr-q',m);await p.waitForTimeout(250);await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});
  S.push(await foto(p));
  const pasos=await p.evaluate(()=>{_fgLgHistMarcar();return _fgLgHist.pasos.map(x=>x.et);});
  console.log('  pasos:',JSON.stringify(pasos));
  ok(pasos.length===6,'hay 6 pasos (base + 5 cambios): el arrastre y la tanda de + cuentan uno cada uno');
  ok(new Set(S).size===6,'las 6 fotos son distintas');
  // deshacer de a uno hasta el original
  let bien=true;
  for(let i=5;i>=1;i--){
    await p.click('#fg-lg-desh');await p.waitForTimeout(120);
    const f=await foto(p);if(f!==S[i-1]){bien=false;console.log('   paso',i,'distinto');}
  }
  ok(bien,'Deshacer 5 veces vuelve paso a paso hasta el flyer original');
  ok(await p.isDisabled('#fg-lg-desh')&&!(await p.isDisabled('#fg-lg-reh')),'al principio: Deshacer apagado, Rehacer prendido');
  console.log('  aviso:',await p.evaluate(()=>[...document.querySelectorAll('.toast,#toast')].map(t=>t.textContent).join('|')));
  // rehacer con teclado
  await p.mouse.click(5,5);
  bien=true;
  for(let i=1;i<=5;i++){await p.keyboard.press(i%2?'Control+y':'Control+Shift+z');await p.waitForTimeout(120);if(await foto(p)!==S[i]){bien=false;console.log('   rehacer',i,'distinto');}}
  ok(bien,'Ctrl+Y / Ctrl+Shift+Z rehacen hasta el final');
  await p.keyboard.press('Control+z');await p.waitForTimeout(120);
  ok(await foto(p)===S[4],'Ctrl+Z deshace (vuelve la franja)');
  // un cambio nuevo borra lo que se podía rehacer
  await p.evaluate(()=>{_fgLg.sel=0;_fgLgMover(30,0);});await p.waitForTimeout(700);
  ok(await p.isDisabled('#fg-lg-reh'),'un cambio nuevo después de deshacer apaga Rehacer');
  // diseño abierto: deshacer hasta el principio no lo suelta
  await p.evaluate(()=>{_fgLg.proy={id:'x',nombre:'Mi diseño',mio:true,estado:'privado'};_fgLgBarra();});
  for(let i=0;i<8;i++){await p.keyboard.press('Control+z');await p.waitForTimeout(60);}
  ok(await p.evaluate(()=>_fgLgActivos().length===0&&!!_fgLg.proy),'con todo deshecho, el diseño abierto sigue abierto');
  for(let i=0;i<3;i++){await p.keyboard.press('Control+y');await p.waitForTimeout(60);}
  // Vista previa limpia
  await p.click('#fg-lg-ver');await p.waitForTimeout(150);
  const L=await p.evaluate(()=>({capa:getComputedStyle(document.getElementById('fg-lg-capa')).display,franja:document.getElementById('fg-lg-franja').offsetParent===null,txt:document.getElementById('fg-lg-ver-t').textContent}));
  console.log('  limpio:',JSON.stringify(L));
  ok(L.capa==='none'&&L.franja&&L.txt==='Seguir editando','"Vista previa" esconde marcos y botones; el botón dice "Seguir editando"');
  await p.screenshot({path:__dirname+'/capturas/t34_limpio.png'});
  pt=await tap(p,1012,2720,true);await p.mouse.click(pt.x,pt.y);await p.waitForTimeout(400);
  ok(!(await p.$('#fg-lg-ov')),'en Vista previa tocar el flyer no abre nada');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!_fgLg.limpio&&getComputedStyle(document.getElementById('fg-lg-capa')).display!=='none'),'Escape vuelve a editar');
  await p.click('#fg-lg-ver');await p.click('#fg-lg-btn');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>!_fgLg.limpio&&!document.querySelector('.prev').classList.contains('fg-lg-limpio')),'"Listo" también sale de la Vista previa');
  await p.click('#fg-lg-btn');await p.waitForTimeout(150);
  await p.screenshot({path:__dirname+'/capturas/t34_barra.png',clip:{x:300,y:60,width:1066,height:140}});
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
