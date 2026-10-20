// Recortar una parte del flyer (la de los importes) y que todo se una solo
const {abrir,nube}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
// diferencia media entre dos franjas de la descarga (antes/después)
const FR=(p,y,h)=>p.evaluate(([y,h])=>{const fc=fullRes(getVals()),c=document.createElement('canvas');c.width=fc.width;c.height=h;const g=c.getContext('2d');g.drawImage(fc,0,y,fc.width,h,0,0,fc.width,h);return Array.from(g.getImageData(0,0,fc.width,h).data.filter((_,i)=>i%16===0));},[y,h]);
const dif=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d/a.length;};
const foto=async(p,nom,y,h)=>{const r=await p.evaluate(([y,h])=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=620;c.height=Math.round(h/2);c.getContext('2d').drawImage(fc,0,y,fc.width,h,0,0,620,c.height);return c.toDataURL('image/jpeg',0.8);},[y,h]);fs.writeFileSync(__dirname+'/capturas/'+nom,Buffer.from(r.split(',')[1],'base64'));};
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.fill('#empresa','ACME S.A.');
  await p.evaluate(()=>{toggleA2&&0;});await p.waitForTimeout(300);
  const cfg0=await p.evaluate(()=>JSON.stringify(_fgOptCache[_optN(_fgOpt)].cfg));
  const H0=await p.evaluate(()=>baseImg.height),FH0=await p.evaluate(()=>fullRes(getVals()).height);
  const arriba0=await FR(p,560,120),abajo0=await FR(p,4000,200),pie0=await FR(p,FH0-300,250);
  await foto(p,'t39_antes.jpg',500,1300);
  // un logo cambiado debajo del corte (para ver que sube)
  await p.evaluate(async()=>{const x=_promosCat?null:null;});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const tyAntes=await p.evaluate(async()=>{const m=_promosCat.find(x=>x.imagen);const im=await _fgLgTraer(m.imagen);const det=_fgLgManual(600,2690,140,60);_fgLgPoner(det,m.imagen,m.titulo,im);_fgLg.sel=-1;_fgLgListo();return _fgLgActivos()[0].ty;});
  // ---- marcar con el mouse la franja del cashback ----
  await p.click('#fg-lg-rec');
  ok(await p.evaluate(()=>_fgRecM.modo)&&(await p.textContent('#fg-lg-rec'))==='Cancelar recorte','"Recortar" prende el modo de marcar');
  const pt=await p.evaluate(()=>{const prev=document.querySelector('.prev'),r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+860*k0)-(pr.top+pr.height/2);const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+r.width/2,y0:r.top+690*k,y1:r.top+1030*k};});
  await p.mouse.move(pt.x,pt.y0);await p.mouse.down();await p.mouse.move(pt.x,(pt.y0+pt.y1)/2,{steps:4});await p.mouse.move(pt.x,pt.y1,{steps:4});await p.mouse.up();
  await p.waitForSelector('#fg-rec-conf',{timeout:5000});
  const banda=await p.evaluate(()=>{const b=document.getElementById('fg-rec-banda');return b?[b.style.top,b.style.height]:null;});
  console.log('  franja marcada (pantalla):',JSON.stringify(banda));
  await p.screenshot({path:__dirname+'/capturas/t39_marcado.png'});
  await p.click('#fg-rec-ok');await p.waitForTimeout(600);
  const R=await p.evaluate(()=>({act:_fgRecActivo(),cortes:_fgRec&&_fgRec.cortes,H:baseImg.height,sin:_fgSinImportes(),card:document.getElementById('d1').closest('.fg-card').classList.contains('fg-sin-importes'),emp:_fgCfg().empresa.yc,empOff:!!_fgCfg().empresa.off,ey:_fgCfg().contacto.ey}));
  console.log('  recorte:',JSON.stringify(R));
  const h=R.cortes[0].h;
  ok(R.act&&R.H===H0-h,'la imagen queda '+h+' px más corta');
  ok(R.sin&&R.card,'sin importes: la tarjeta de Montos se esconde');
  ok(!R.empOff&&R.emp===658,'el nombre de la empresa (arriba del corte) queda en su lugar');
  ok(await p.evaluate(()=>_fgLegalConValores('A {eminentblack} B {cashback} C',getVals()))==='A B C','el legal ya no inyecta importes');
  const FH1=await p.evaluate(()=>fullRes(getVals()).height);
  ok(FH1===FH0-h,'la descarga queda '+h+' px más corta ('+FH0+' → '+FH1+')');
  const arriba1=await FR(p,560,120),abajo1=await FR(p,4000-h,200),pie1=await FR(p,FH1-300,250);
  console.log('  diferencias: arriba',dif(arriba0,arriba1).toFixed(2),'| medio',dif(abajo0,abajo1).toFixed(2),'| pie (oficiales/legal)',dif(pie0,pie1).toFixed(2));
  ok(dif(arriba0,arriba1)<1,'lo de arriba del corte queda igual');
  ok(dif(abajo0,abajo1)<1,'lo de abajo sube exactamente '+h+' px');
  ok(dif(pie0,pie1)<1,'oficiales y legales suben juntos (el pie es idéntico)');
  // la unión
  const union=await p.evaluate(()=>{const y=_fgRec.cortes[0].y,d=_fgLgPixeles(0,y-1,baseImg.width,2);let s=0,n=0;for(let x=0;x<baseImg.width;x+=4){const a=x*4,b=(baseImg.width+x)*4;s+=Math.abs(d[a]-d[b])+Math.abs(d[a+1]-d[b+1])+Math.abs(d[a+2]-d[b+2]);n++;}return s/n;});
  ok(union<30,'la unión casi no se nota (diferencia entre las filas: '+union.toFixed(1)+')');
  await foto(p,'t39_despues.jpg',500,1300-h);
  const tyDesp=await p.evaluate(()=>_fgLgActivos()[0]&&_fgLgActivos()[0].ty);
  ok(Math.abs(tyDesp-(tyAntes-h))<0.01,'el logo cambiado de abajo subió con todo');
  ok(await p.isVisible('#fg-rec-chip')&&(await p.textContent('#fg-rec-chip')).includes('Recortado: 1 parte'),'el cartelito dice "Recortado: 1 parte"');
  await p.screenshot({path:__dirname+'/capturas/t39_recortado.png'});
  // 4 oficiales (el flyer crece): no rompe
  await p.evaluate(()=>{const V=getVals();});
  // ---- volver a como estaba ----
  await p.click('#fg-rec-chip .fg-rec-volver');await p.waitForTimeout(400);
  const V=await p.evaluate(()=>({act:_fgRecActivo(),H:baseImg.height,card:document.getElementById('d1').closest('.fg-card').classList.contains('fg-sin-importes'),ty:_fgLgActivos()[0]&&_fgLgActivos()[0].ty,same:window.FLYER_CFG===_fgOptCache[_optN(_fgOpt)].cfg||JSON.stringify(window.FLYER_CFG)===JSON.stringify(_fgOptCache[_optN(_fgOpt)].cfg)}));
  ok(!V.act&&V.H===H0&&!V.card&&V.same,'"Volver a como estaba" deja el flyer y la calibración enteros');
  ok(Math.abs(V.ty-tyAntes)<0.01,'y el logo vuelve a su lugar');
  ok(dif(abajo0,await FR(p,4000,200))<1,'la descarga vuelve a ser la original');
  // ---- cambiar de opción lo suelta, sin tocar la calibración guardada ----
  await p.evaluate(()=>{fgRecAplicar(700,320);});
  ok(await p.evaluate(()=>_fgRecActivo()),'recorte aplicado de nuevo');
  await p.evaluate(()=>{_fgApplyOption(_fgOptCache[_optN(_fgOpt)]);});await p.waitForTimeout(200);
  ok(await p.evaluate(()=>!_fgRecActivo()&&!_fgRec&&baseImg.height)===H0,'cambiar de opción vuelve al flyer entero');
  ok(await p.evaluate(()=>JSON.stringify(_fgOptCache[_optN(_fgOpt)].cfg))===cfg0,'la calibración guardada no se modificó');
  // ---- Estudio: guardar con el recorte y el legal, abrir como prototipo ----
  await p.evaluate(()=>{_fgLg.list=[];fgRecAplicar(700,320);document.getElementById('legal-text').value='Legal del flyer sin cashback.';});
  await p.evaluate(()=>{_fgLgBarra();});
  await p.click('#fg-lg-guardar');await p.fill('#fg-est-nom','Sin cashback ACME');await p.click('#fg-est-ok');await p.waitForTimeout(800);
  const dd=nube.disenos[nube.disenos.length-1];
  ok(dd&&dd.datos.recortes&&dd.datos.recortes.length===1&&dd.datos.legal==='Legal del flyer sin cashback.','el diseño se guarda con el recorte y el legal');
  ok(dd&&dd.miniatura&&dd.miniatura.length>1000,'tiene miniatura (la unión)');
  await p.evaluate(()=>{_fgApplyOption(_fgOptCache[_optN(_fgOpt)]);});
  await p.click('#apptab-estudio');await p.waitForSelector('.est-card');
  await p.click('.est-card button[data-acc=usar]');await p.waitForTimeout(1500);
  const P=await p.evaluate(()=>({act:_fgRecActivo(),H:baseImg.height,legal:document.getElementById('legal-text').value,sin:_fgSinImportes()}));
  ok(P.act&&P.H===H0-320&&P.sin&&P.legal==='Legal del flyer sin cashback.','"Usar" abre el prototipo recortado, sin importes y con su legal');
  await p.click('#fg-optbar .fgo');await p.waitForTimeout(800);
  ok(await p.evaluate(()=>!_fgRecActivo()&&baseImg.height)===H0,'volver a la pestaña original muestra el flyer entero');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
  // ---- publicar (admin) ----
  dd.estado='pedido';dd.pedido_at=new Date().toISOString();
  const adm=await abrir(browser,{rol:'admin'});
  await adm.click('#apptab-estudio');await adm.waitForSelector('.est-card');
  await adm.click('#est-fil button[data-f=pedidos]').catch(()=>{});
  await adm.waitForSelector('.est-card button[data-acc=aprobar]');
  await adm.click('.est-card button[data-acc=aprobar]');await adm.waitForSelector('#fg-pt-i');await adm.fill('#fg-pt-i','Sin cashback');await adm.click('#fg-pt-ok');
  await adm.waitForFunction(()=>!_EST.publicando,null,{timeout:30000});await adm.waitForTimeout(500);
  const k=Object.keys(nube.json).filter(x=>/^_active\d+\.json$/.test(x)).sort((a,b)=>+b.match(/\d+/)[0]-+a.match(/\d+/)[0])[0];
  const act=nube.json[k],img=nube.bin[act.name],leg=nube.json[k.replace('_active','_legal')];
  console.log('  publicada:',k,act.name,'cfg.montos.off=',act.cfg.montos&&act.cfg.montos.off,'| legal:',leg&&leg.text);
  ok(act.cfg.montos&&act.cfg.montos.off===true,'la opción nueva nace sin importes');
  ok(act.cfg.recDe===9,'la opción nueva recuerda de qué flyer salió (recDe='+act.cfg.recDe+')');
  ok(leg&&leg.text==='Legal del flyer sin cashback.','la opción nueva tiene el legal del diseño');
  const alto=await adm.evaluate(async(b64)=>{const i=new Image();await new Promise(r=>{i.onload=r;i.src='data:image/jpeg;base64,'+b64;});return i.naturalHeight;},img.toString('base64'));
  ok(alto===H0-320,'la imagen publicada ya viene recortada ('+alto+' px)');
  console.log('  errores admin:',adm.errores.length,adm.errores.slice(0,3));
};
