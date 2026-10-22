// Doble clic abre "Cambiar"; el tilde de días se ve también en un logo de una
// franja; Armar franja con súper pone sus días debajo (letra pareja), sin el
// tilde sólo los logos; Shift + arrastre mueve juntos logos que nunca se tocaron.
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
// lleva el punto (px de imagen) a la vista: la vista previa o la página se corren
const pant=(p,x,y)=>p.evaluate(([x,y])=>{
  const cv=document.getElementById('cv');let q=_fgLgAPantalla(x,y,0,0),r=cv.getBoundingClientRect(),yy=r.top+q.t;
  if(yy<80||yy>innerHeight-80){let el=cv.parentElement;while(el&&!(el.scrollHeight>el.clientHeight+4&&/auto|scroll/.test(getComputedStyle(el).overflowY)))el=el.parentElement;
    const dy=yy-innerHeight/2;if(el)el.scrollTop+=dy;else window.scrollBy(0,dy);}
  r=cv.getBoundingClientRect();q=_fgLgAPantalla(x,y,0,0);return {x:r.left+q.l,y:r.top+q.t};},[x,y]);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // ── Armar franja sobre la grilla de súper con 3 súper ──
  const fr=async(conDias)=>{
    await p.evaluate((cd)=>{_fgLgV.conDias=cd;_fgLgV.prov='';_fgLg.list=[];_fgLgListo();_fgFrAbrir(_fgLgManual(640,1250,560,450));},conDias);
    await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
    const info=await p.evaluate(async()=>{
      const st=_fgFrSt,ch=document.getElementById('fg-fr-dias');
      for(const n of ['coto','jumbo','vea']){const q=_promosCat.find(x=>x.subtitulo==='Supermercados'&&_promoNormalizar(x.titulo)===n);await _fgLgTraer(q.imagen);st.sel.push({img:q.imagen,t:q.titulo});}
      _fgFrLista();_fgFrSelPintar();_fgFrPreview();
      return {tilde:!!ch,marcado:ch&&ch.checked};
    });
    await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(300);
    return Object.assign(info,await p.evaluate(()=>{const L=_fgLgActivos();const T=L.filter(e=>e.tipo==='txt'&&e.franja),I=L.filter(e=>e.img&&e.franja&&!e.franjaBase);
      return {textos:T.map(e=>e.texto),fs:[...new Set(T.map(e=>e.fs))],logos:I.length,
        debajo:T.every(t=>I.some(l=>Math.abs((l.tx+l.tw/2)-(t.tx+t.tw/2))<2&&t.ty>=l.ty+l.th-2))};}));
  };
  const A=await fr(true);
  console.log('  ',JSON.stringify(A));
  ok(A.tilde&&A.marcado,'Armar franja trae el tilde de días, marcado');
  ok(A.logos===3&&A.textos.length===3,'franja con 3 súper: 3 logos y 3 textos de días');
  ok(A.textos.includes('Martes'),'Coto con sus días de descuento ("Martes")');
  ok(A.fs.length===1,'todos los días con la misma letra ('+A.fs.join(',')+')');
  ok(A.debajo,'cada texto centrado debajo de su logo');
  fs.writeFileSync(__dirname+'/capturas/t64_franja_dias.png',Buffer.from((await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=600;c.height=480;c.getContext('2d').drawImage(fc,620,1220,600,480,0,0,600,480);return c.toDataURL('image/png');})).split(',')[1],'base64'));
  // retomar la franja: los textos no se duplican
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(640,1250,560,450));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>_fgLgActivos().filter(e=>e.tipo==='txt').length)===3,'al retomar la franja los días no se duplican');
  const B=await fr(false);
  ok(B.logos===3&&B.textos.length===0,'sin el tilde: sólo los logos');
  // ── el tilde se ve al cambiar un logo de la franja; doble clic lo abre ──
  await p.evaluate(()=>{_fgLgV.conDias=true;});
  const lg=await p.evaluate(()=>{const e=_fgLgActivos().find(x=>x.img&&x.franja&&!x.franjaBase);return {x:e.tx+e.tw/2,y:e.ty+e.th/2};});
  const c2=await pant(p,lg.x,lg.y);
  await p.mouse.dblclick(c2.x,c2.y);
  await p.waitForSelector('#fg-lg-ov',{timeout:5000}).catch(()=>{});
  const v=await p.evaluate(()=>({abierta:!!document.getElementById('fg-lg-ov'),tilde:!!document.getElementById('fg-lg-dias'),t:(document.getElementById('fg-lg-t')||{}).textContent}));
  ok(v.abierta,'doble clic sobre un logo cambiado abre la ventana ('+v.t+')');
  ok(v.tilde,'en un logo de una franja se ve el tilde de días');
  await p.evaluate(()=>{const x=document.getElementById('fg-lg-x');if(x)x.click();_fgLg.list=[];_fgLgListo();});
  // ── Shift + arrastre de 2 logos que nunca se tocaron ──
  const L=await p.evaluate(()=>{const a=_fgLgDetectar(730,1310),b=_fgLgDetectar(905,1310);return [a,b].map(d=>({x:d.x,y:d.y,w:d.w,h:d.h}));});
  for(const d of L){const q=await pant(p,d.x+d.w/2,d.y+d.h/2);await p.evaluate((q)=>_fgLgLugarTocar(q.x,q.y),q);}
  const q0=await pant(p,L[0].x+L[0].w/2,L[0].y+L[0].h/2);
  const n0=await p.evaluate(()=>_fgLgActivos().length);
  await p.mouse.move(q0.x,q0.y);await p.mouse.down();await p.mouse.move(q0.x+30,q0.y+20,{steps:6});await p.mouse.up();await p.waitForTimeout(300);
  const m=await p.evaluate(()=>_fgLgActivos().filter(e=>String(e.img).indexOf('orig:')===0).map(e=>({dx:Math.round(e.tx-e.ox),dy:Math.round(e.ty-e.oy)})));
  console.log('  movidos:',JSON.stringify(m),'antes',n0);
  ok(n0===0&&m.length===2&&m.every(x=>x.dx===m[0].dx&&x.dy===m[0].dy&&(x.dx||x.dy)),'Shift + arrastre mueve juntos 2 logos que nunca se tocaron');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
