// Shift + clic sobre logos del flyer (sin cambiar todavía): barra de grupo con
// Reemplazar (una marca por lugar, en orden de lectura) y Borrar.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
// logos de la franja del flyer de prueba (detectados en una grilla)
async function logos(p){
  return p.evaluate(()=>{
    const out=[];
    for(let y=2670;y<=2860;y+=30)for(let x=160;x<=1120;x+=24){
      let d;try{d=_fgLgDetectar(x,y);}catch(e){continue;}
      if(!d||d.error||d.w<20||d.h<20)continue;
      if(out.some(o=>Math.abs(o.x-d.x)<8&&Math.abs(o.y-d.y)<8))continue;out.push({x:d.x,y:d.y,w:d.w,h:d.h});
    }
    return out;
  });
}
const pantalla=(p,d)=>p.evaluate((d)=>{const r=document.getElementById('cv').getBoundingClientRect(),q=_fgLgAPantalla(d.x+d.w/2,d.y+d.h/2,0,0);return {x:r.left+q.l,y:r.top+q.t};},d);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const L=await logos(p);
  console.log('  logos detectados:',L.length);
  // elegir 3 con Shift (de derecha a izquierda, para ver que se ordenan solos)
  const elegidos=L.slice(0,3).reverse();
  for(const d of elegidos){const c=await pantalla(p,d);await p.evaluate((c)=>_fgLgLugarTocar(c.x,c.y),c);}
  const r1=await p.evaluate(()=>({lug:_fgLg.lugares.length,bar:!document.getElementById('fg-lg-grp').hidden,cambios:_fgLgActivos().length,marcas:document.querySelectorAll('#fg-lg-mk .fg-lg-marca.lugar').length}));
  ok(r1.lug===3&&r1.bar&&r1.marcas===3,'Shift + clic sobre 3 logos del flyer: quedan marcados y aparece la barra ('+r1.lug+')');
  ok(r1.cambios===0,'elegir no cambia nada todavía');
  // Shift + clic otra vez sobre uno: lo saca
  { const c=await pantalla(p,elegidos[0]);await p.evaluate((c)=>_fgLgLugarTocar(c.x,c.y),c); }
  ok(await p.evaluate(()=>_fgLg.lugares.length)===2,'Shift + clic de nuevo lo saca');
  { const c=await pantalla(p,elegidos[0]);await p.evaluate((c)=>_fgLgLugarTocar(c.x,c.y),c); }
  // Reemplazar: elegir 3 marcas en orden
  await p.click('#fg-lg-grp button[data-g=reemplazar]');
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:15000});
  const r2=await p.evaluate(()=>({t:document.getElementById('fg-lg-t').textContent,mover:!!document.getElementById('fg-lg-mover')&&!document.querySelector('.fg-lg-modos').hidden}));
  ok(/Reemplazar 3 lugares/.test(r2.t)&&!r2.mover,'se abre "Reemplazar 3 lugares" ('+r2.t+')');
  const picks=await p.evaluate(async()=>{
    const its=[...document.querySelectorAll('#fg-lg-list .fg-lg-it')],out=[];
    for(const it of its){if(out.length>=3)break;const x=_fgLgV.res[+it.dataset.i];try{await _fgLgTraer(x.imagen);}catch(e){continue;}it.click();out.push(x.imagen);}
    return {out,nums:[...document.querySelectorAll('#fg-lg-list .fg-lg-it.elegida')].map(e=>e.dataset.n).sort().join(','),ok:document.getElementById('fg-lg-varios-ok').textContent};
  });
  ok(picks.nums==='1,2,3'&&/3 de 3/.test(picks.ok),'las marcas llevan su número y el botón dice "Poner 3 de 3"');
  await p.click('#fg-lg-varios-ok');
  await p.waitForSelector('#fg-lg-ov',{state:'detached',timeout:15000});await p.waitForTimeout(300);
  const r3=await p.evaluate((picks)=>{
    const A=_fgLgActivos().filter(e=>e.img&&e.tipo!=='txt').sort((a,b)=>(Math.abs(a.oy-b.oy)<20?a.ox-b.ox:a.oy-b.oy));
    return {n:A.length,orden:A.map(e=>picks.indexOf(e.img)),lug:_fgLg.lugares.length};
  },picks.out);
  console.log('  ',JSON.stringify(r3));
  ok(r3.n===3&&r3.orden.join(',')==='0,1,2','las 3 marcas quedan en orden de lectura');
  ok(r3.lug===0,'después se suelta lo elegido');
  // Borrar varios con Shift
  const L2=L.slice(3,5);
  for(const d of L2){const c=await pantalla(p,d);await p.evaluate((c)=>_fgLgLugarTocar(c.x,c.y),c);}
  await p.click('#fg-lg-grp button[data-g=borrar]');await p.waitForTimeout(200);
  const r4=await p.evaluate(()=>_fgLgActivos().filter(e=>!e.img&&e.tipo!=='txt'&&e.w>0).length);
  ok(r4===2,'Borrar deja vacíos los 2 lugares elegidos');
  await p.evaluate(()=>{document.getElementById('cv').scrollIntoView({block:'start'});});
  require('fs').writeFileSync(__dirname+'/capturas/t61_grupo.png',await p.screenshot());
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
