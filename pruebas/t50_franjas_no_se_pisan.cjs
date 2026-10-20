// Dos franjas que no se pisan, sin residuos, y retomar una franja con lo que hay hoy
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
// arma una franja en el recuadro r con las primeras n marcas que se puedan bajar (sin las ya usadas)
async function franja(p,r,n,evitar){
  await p.evaluate(([r])=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(r[0],r[1],r[2],r[3]));},[r]);
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  const usadas=await p.evaluate(async([n,evitar])=>{
    const st=_fgFrSt,ya={};(evitar||[]).forEach(x=>{ya[x]=1;});
    for(const x of st.res){if(st.sel.length>=n)break;if(ya[x.imagen]||_fgFrIdx(x.imagen)>=0)continue;try{await _fgLgTraer(x.imagen);st.sel.push({img:x.imagen,t:x.titulo});}catch(e){}}
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();return {imgs:st.sel.map(s=>s.img),rect:st.rect};
  },[n,evitar]);
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(300);
  return usadas;
}
const deFranja=(p,fid)=>p.evaluate((fid)=>_fgLgActivos().filter(e=>e.franja===fid&&!e.franjaBase).map(e=>e.img),fid);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // franja A: la de los logos (2 filas)
  const A=await franja(p,[140,2650,1000,230],3);
  const fidA=await p.evaluate(()=>_fgLgActivos().find(e=>e.franjaBase).franja);
  console.log('  A:',A.imgs.length,'logos');
  // franja B: el recuadro arranca adentro de A (toca su fila de abajo)
  const B=await franja(p,[140,2760,1000,260],3,A.imgs);
  console.log('  B recuadro:',JSON.stringify(B.rect&&{y:B.rect.y,h:B.rect.h}));
  const quedanA=await deFranja(p,fidA);
  ok(quedanA.length===3&&A.imgs.every(x=>quedanA.includes(x)),'la franja de arriba conserva sus 3 logos ('+quedanA.length+')');
  ok(B.rect.y>=2650+230,'el recuadro nuevo se recortó para no meterse en la de arriba (empieza en '+B.rect.y+')');
  const fids=await p.evaluate(()=>_fgLgActivos().filter(e=>e.franjaBase).map(e=>e.franja));
  ok(fids.length===2,'quedan las dos franjas');
  const adentro=await p.evaluate(([fidA,r])=>_fgLgActivos().filter(e=>e.franja===fidA&&!e.franjaBase).filter(e=>{const cy=e.ty+e.th/2;return cy>=r.y&&cy<=r.y+r.h;}).length,[fidA,B.rect]);
  ok(adentro===0,'ningún logo de la de arriba queda dentro de la de abajo');
  { const r=await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=520;c.getContext('2d').drawImage(fc,0,2600,1240,520,0,0,1240,520);return c.toDataURL('image/png');});require('fs').writeFileSync(__dirname+'/capturas/t50_dos_franjas.png',Buffer.from(r.split(',')[1],'base64')); }
  // residuo: un logo suelto cambiado y MOVIDO dentro de la zona de una franja nueva
  await p.evaluate(async()=>{
    let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}
    _fgLgPoner(_fgLgManual(600,3300,140,60),m.imagen,'Suelto',im); // lejos
    const L=_fgLgActivos()[_fgLg.sel];L.tx=600;L.ty=3560;_fgLgListo();   // movido a la zona de la franja C
  });
  await franja(p,[140,3500,1000,200],2,[]);
  const residuo=await p.evaluate(()=>_fgLgActivos().filter(e=>e.t==='Suelto').length);
  ok(residuo===0,'un logo movido adentro de la franja nueva no queda como residuo');
  // retomar A después de borrar uno y reemplazar otro
  await p.evaluate((fidA)=>{
    const L=_fgLgActivos(),i=L.findIndex(e=>e.franja===fidA&&!e.franjaBase);
    _fgLg.sel=i;_fgLg.grupo=[];_fgLgQuitarElegidos();                 // borra uno (Supr)
  },fidA);
  await p.waitForTimeout(200);
  const reempl=await p.evaluate(async(fidA)=>{
    const L=_fgLgActivos(),e=L.find(x=>x.franja===fidA&&!x.franjaBase);
    let m,im;for(const x of _promosCat.slice(50)){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(er){}}
    const i=L.indexOf(e),viejo=e.img;
    L[i]={x:e.tx,y:e.ty,w:e.tw,h:e.th,bg:e.bg,img:m.imagen,t:m.titulo,ox:e.ox,oy:e.oy,ow:e.ow,oh:e.oh,tx:e.tx,ty:e.ty,tw:e.tw,th:e.th,bw:e.tw,bh:e.th}; // reemplazado (ya no es de la franja)
    _fgLgListo();return viejo;
  },fidA);
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(150,2660,980,210));});
  await p.waitForSelector('#fg-fr-sel',{timeout:15000});await p.waitForTimeout(300);
  const sel=await p.evaluate(()=>_fgFrSt.sel.map(s=>s.img));
  console.log('  al retomar A:',sel.length,'marcas');
  ok(sel.length===1&&!sel.includes(reempl),'al retomar, no vuelven ni el borrado ni el reemplazado');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
