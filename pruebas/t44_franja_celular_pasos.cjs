// Armar franja en el celular: dos pasos
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const vis=(p,s)=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none';},s);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor',w:390,h:844});
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  ok(await vis(p,'.fg-fr-pasos')&&await vis(p,'#fg-fr-list')&&!(await vis(p,'#fg-fr-prev'))&&!(await vis(p,'#fg-fr-sel')),'paso 1: sólo filtros y marcas');
  ok(await vis(p,'#fg-fr-sig')&&!(await vis(p,'#fg-fr-ok')),'paso 1: abajo "Siguiente", sin "Poner logos"');
  for(let i=0;i<5;i++)await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');
  await p.waitForTimeout(800);
  console.log('  botón:',(await p.textContent('#fg-fr-sig')).trim(),'| pestaña:',(await p.textContent('.fg-fr-pasos button[data-paso="1"]')).trim());
  ok(/\(5\)/.test(await p.textContent('#fg-fr-sig')),'el botón cuenta las marcas elegidas');
  await p.screenshot({path:__dirname+'/capturas/t44_paso1.png'});
  await p.click('#fg-fr-sig');await p.waitForTimeout(400);
  const pr=await p.evaluate(()=>{const r=document.getElementById('fg-fr-prev').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];});
  ok(!(await vis(p,'#fg-fr-list'))&&await vis(p,'#fg-fr-prev')&&await vis(p,'#fg-fr-sel'),'paso 2: vista previa y "Tu selección", sin las marcas');
  ok(pr[0]>300&&pr[1]>50,'la vista previa se ve bien al entrar al paso 2 ('+pr+')');
  ok(await vis(p,'#fg-fr-ok')&&await vis(p,'#fg-fr-atras')&&!(await vis(p,'#fg-fr-no')),'paso 2: "← Elegir más" y "Poner logos"');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sin scroll lateral');
  await p.screenshot({path:__dirname+'/capturas/t44_paso2.png'});
  await p.click('#fg-fr-atras');await p.waitForTimeout(200);
  ok(await vis(p,'#fg-fr-list'),'"← Elegir más" vuelve al paso 1');
  await p.click('.fg-fr-pasos button[data-paso="2"]');await p.waitForTimeout(200);
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});
  ok(await p.evaluate(()=>_fgLgActivos().length>=2),'"Poner logos" arma la franja');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
  // en la PC no hay pasos
  const q=await abrir(browser,{rol:'asesor'});
  await q.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await q.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  ok(!(await vis(q,'.fg-fr-pasos'))&&await vis(q,'#fg-fr-prev')&&await vis(q,'#fg-fr-list')&&await vis(q,'#fg-fr-ok')&&!(await vis(q,'#fg-fr-sig')),'en la PC se ve todo junto, como antes');
};
