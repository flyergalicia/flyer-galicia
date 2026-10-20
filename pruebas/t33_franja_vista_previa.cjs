// Armar franja: vista previa arriba, tamaño estable, números, fila <-> logo
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const alto=p=>p.evaluate(()=>{const r=document.getElementById('fg-fr-prev').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];});
async function pc(browser,w,h){
  console.log('== PC '+w+'x'+h);
  const p=await abrir(browser,{rol:'asesor',w,h});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});await p.waitForTimeout(300);
  const a0=await alto(p);console.log('  vista previa vacía:',a0);
  // 1 marca
  await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');await p.waitForTimeout(400);
  const a1=await alto(p);
  for(let i=0;i<7;i++){await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.waitForTimeout(1200);const a8=await alto(p);
  for(let i=0;i<12;i++){await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.waitForTimeout(1500);const a20=await alto(p);
  await p.$eval('#fg-fr-list',b=>b.scrollTop=400);await p.$eval('#fg-fr-sel',b=>b.parentNode.scrollTop=300);await p.waitForTimeout(200);
  const a20s=await alto(p);
  console.log('  1/8/20/scroll:',a1,a8,a20,a20s);
  ok([a0,a1,a8,a20,a20s].every(a=>a[0]===a0[0]&&a[1]===a0[1]),'el tamaño de la vista previa no cambia al tildar ni al recorrer');
  ok(a0[1]>=180,'la vista previa mide al menos 180 px de alto ('+a0[1]+')');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sin scroll lateral');
  // números: cada caja tiene su número en el mismo orden que la lista
  await p.waitForFunction(()=>_fgFrSt.sel.every(s=>_fgLg.imgs[s.img]),null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(300);const N=await p.evaluate(()=>_fgFrSt.sel.length);console.log('  quedaron',N,'marcas (las que no bajan se quitan)');
  const nums=await p.$$eval('#fg-fr-sel .fg-fr-it b',b=>b.map(x=>+x.textContent));
  ok(nums.length===N&&nums.every((n,i)=>n===i+1),'la lista numera 1..N');
  ok(await p.evaluate(()=>_fgFrSt._cajas.filter(Boolean).length)===N,'las N cajas están dibujadas');
  ok(await p.$$eval('#fg-fr-sel .fg-fr-mini img',i=>i.length)===N,'cada fila lleva la miniatura del logo');
  await p.screenshot({path:__dirname+'/capturas/t33_pc_'+w+'.png'});
  // tocar la fila 5 marca el logo 5
  await p.click('#fg-fr-sel .fg-fr-it[data-i="4"] .fg-fr-it-t');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>_fgFrSt.elegido)===4,'tocar la fila 5 marca el logo 5 en la vista previa');
  ok(await p.evaluate(()=>document.querySelector('#fg-fr-sel .fg-fr-it.sel').getAttribute('data-i'))==='4','la fila 5 queda resaltada');
  // tocar el logo 12 en la vista previa resalta su fila
  const c=await p.evaluate((N)=>{const st=_fgFrSt,d=st._cajas[N-1],v=st._vista,cv=document.getElementById('fg-fr-prev').getBoundingClientRect(),k=cv.width/v.ancho;return {x:cv.left+(d.tx+d.tw/2-v.x0)*k,y:cv.top+(d.ty+d.th/2-v.y0)*k};},N);
  await p.mouse.click(c.x,c.y);await p.waitForTimeout(150);
  ok(await p.evaluate(()=>_fgFrSt.elegido)===N-1&&await p.evaluate(()=>document.querySelector('#fg-fr-sel .fg-fr-it.sel').getAttribute('data-i'))===String(N-1),'tocar el logo 12 resalta la fila 12');
  // la flecha arriba mueve el marcado con el logo
  const t12=await p.evaluate((N)=>_fgFrSt.sel[N-1].t,N);
  await p.click('#fg-fr-sel button[data-a=arr][data-i="'+(N-1)+'"]');await p.waitForTimeout(150);
  ok(await p.evaluate((N)=>[_fgFrSt.elegido,_fgFrSt.sel[N-2].t],N)+''===[N-2,t12]+'','con ↑ el logo sube y sigue marcado');
  // quitar uno anterior: el marcado sigue al mismo logo
  await p.click('#fg-fr-sel button[data-a=x][data-i="0"]');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>_fgFrSt.sel[_fgFrSt.elegido].t)===t12,'al quitar otro, el marcado sigue al mismo logo');
  // ampliar
  if(!(await p.isVisible("#fg-fr-amp"))){console.log("  (Ampliar escondido: la franja ya ocupa todo el ancho)");await p.screenshot({path:__dirname+"/capturas/t33_pc_"+w+".png"});console.log("  errores:",p.errores.length);await p.context().close();return;}
  await p.click('#fg-fr-amp');await p.waitForTimeout(200);const aa=await alto(p);
  ok(aa[1]>a0[1],'"Ampliar" agranda la vista previa ('+a0[1]+' → '+aa[1]+')');
  ok((await p.textContent('#fg-fr-amp')).includes('Achicar'),'el botón pasa a "Achicar"');
  await p.screenshot({path:__dirname+'/capturas/t33_pc_'+w+'_ampliada.png'});
  await p.click('#fg-fr-amp');await p.waitForTimeout(200);
  ok((await alto(p))[1]===a0[1],'"Achicar" vuelve al tamaño de antes');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
}
module.exports=async(browser)=>{
  await pc(browser,1366,768);
  await pc(browser,1920,1080);
  console.log('== Celular 390x844');
  const p=await abrir(browser,{rol:'asesor',w:390,h:844});
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  for(let i=0;i<6;i++){await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');}
  await p.waitForTimeout(1200);
  await p.click('#fg-fr-sig');await p.waitForTimeout(300); // celular: la vista previa está en el paso 2
  await p.screenshot({path:__dirname+'/capturas/t33_cel_arriba.png'});
  await p.$eval('.fg-cf.fg-fr',b=>b.scrollTop=700);await p.waitForTimeout(200);
  const top=await p.evaluate(()=>{const a=document.getElementById('fg-fr-prev').getBoundingClientRect(),d=document.querySelector('.fg-cf.fg-fr').getBoundingClientRect();return [Math.round(a.top-d.top),Math.round(a.height)];});
  console.log('  vista previa tras recorrer (top relativo, alto):',top);
  ok(top[0]>=0&&top[0]<260&&top[1]>50,'en el celular (paso 2) la vista previa queda a la vista al recorrer');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.fg-cf.fg-fr').scrollWidth<=document.querySelector('.fg-cf.fg-fr').clientWidth),'sin scroll lateral en el celular');
  await p.screenshot({path:__dirname+'/capturas/t33_cel_scroll.png'});
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
