// Insertar una sección copiada de "Flyers para copiar": lo de abajo baja, Deshacer,
// Estudio (guardar y abrir de nuevo sin la imagen en memoria), proponer y aprobar.
const {abrir,nube}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const PUB='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/';
const FR=(p,y,h)=>p.evaluate(([y,h])=>{const fc=fullRes(getVals()),c=document.createElement('canvas');c.width=fc.width;c.height=h;const g=c.getContext('2d');g.drawImage(fc,0,y,fc.width,h,0,0,fc.width,h);return Array.from(g.getImageData(0,0,fc.width,h).data.filter((_,i)=>i%16===0));},[y,h]);
const dif=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d/a.length;};
// px de la imagen → pantalla (se recorre la vista previa para que se vea)
const aPantalla=(p,y)=>p.evaluate(y=>{const prev=document.querySelector('.prev'),r0=cv.getBoundingClientRect(),k0=(r0.width/cv.width)*SC,pr=prev.getBoundingClientRect();prev.scrollTop+=(r0.top+y*k0)-(pr.top+pr.height/2);const r=cv.getBoundingClientRect(),k=(r.width/cv.width)*SC;return {x:r.left+r.width/2,y:r.top+y*k};},y);
module.exports=async(browser)=>{
  nube.bin['fuente_1.jpg']=fs.readFileSync(__dirname+'/datos/op9.jpg');
  nube.json['_fuentes.json']={lista:[{id:'f1',nombre:'Shoppings CABA',img:PUB+'fuente_1.jpg',w:1240,h:0,mini:'',at:new Date().toISOString(),de:''}]};
  const p=await abrir(browser,{rol:'asesor'});
  await p.fill('#empresa','ACME S.A.');await p.waitForTimeout(300);
  const H0=await p.evaluate(()=>baseImg.height),FH0=await p.evaluate(()=>fullRes(getVals()).height);
  const arriba0=await FR(p,560,120),pie0=await FR(p,FH0-300,250);
  await p.click('#fg-lg-btn');
  ok(await p.isVisible('#fg-lg-ins'),'"Insertar" aparece al lado de Recortar');
  // ---- la ventana: el único flyer se elige solo; se marca la sección ----
  await p.click('#fg-lg-ins');
  await p.waitForSelector('#fg-ins-hoja img');
  await p.waitForFunction(()=>{const i=document.querySelector('#fg-ins-hoja img');return i&&i.complete&&i.naturalHeight>0;});
  ok(await p.isDisabled('#fg-ins-ok'),'"Copiar esta sección" espera a que se marque algo');
  const pt=await p.evaluate(()=>{const h=document.getElementById('fg-ins-hoja'),im=h.querySelector('img'),vi=document.getElementById('fg-ins-vista');let k=h.getBoundingClientRect().height/im.naturalHeight;vi.scrollTop=500*k;const r=h.getBoundingClientRect();k=r.height/im.naturalHeight;return {x:r.left+r.width/2,y0:r.top+700*k,y1:r.top+1020*k};});
  await p.mouse.move(pt.x,pt.y0);await p.mouse.down();await p.mouse.move(pt.x,(pt.y0+pt.y1)/2,{steps:4});await p.mouse.move(pt.x,pt.y1,{steps:4});await p.mouse.up();
  await p.waitForTimeout(300);
  ok(!(await p.isDisabled('#fg-ins-ok'))&&await p.isVisible('#fg-ins-banda'),'al soltar queda la franja marcada y se puede copiar');
  await p.screenshot({path:__dirname+'/capturas/t88_ventana.png'});
  await p.click('#fg-ins-ok');await p.waitForTimeout(300);
  const S=await p.evaluate(()=>({modo:_fgIns.modo,sec:_fgIns.sec,ov:!!document.getElementById('fg-ins-ov'),btn:document.getElementById('fg-lg-ins').textContent}));
  console.log('  sección:',JSON.stringify({sy:S.sec&&S.sec.sy,sh:S.sec&&S.sec.sh,sw:S.sec&&S.sec.sw}));
  ok(S.modo&&!S.ov&&S.btn==='Cancelar inserción','se cierra la ventana y queda el modo de colocar');
  const gapSrc=await p.evaluate(([a,b])=>{const im=_fgIns.imgs[_fgIns.sec.u],F=_fgInsFilas(im);return F[a-1]<2&&F[a]>=2&&F[b-1]>=2&&F[b]<2;},[S.sec.sy,S.sec.sy+S.sec.sh]);
  ok(S.sec&&Math.abs(S.sec.sy-700)<=100&&Math.abs(S.sec.sy+S.sec.sh-1020)<=100&&gapSrc,'se copia el bloque justo, sin los márgenes vacíos de arriba y abajo');
  // ---- colocar: la línea sigue al mouse; clic inserta ----
  const YI=2400,q=await aPantalla(p,YI);
  await p.mouse.move(q.x,q.y-20);await p.mouse.move(q.x,q.y,{steps:3});await p.waitForTimeout(150);
  ok(await p.isVisible('#fg-ins-linea'),'aparece la línea "Va acá" con la sección a medio tono');
  await p.screenshot({path:__dirname+'/capturas/t88_va_aca.png'});
  await p.mouse.click(q.x,q.y);await p.waitForTimeout(600);
  const R=await p.evaluate(()=>({act:_fgRecActivo(),cortes:_fgRec&&_fgRec.cortes,H:baseImg.height,modo:_fgIns.modo,linea:!!document.getElementById('fg-ins-linea')}));
  const c0=R.cortes&&R.cortes[0],h=c0?c0.h:0;
  console.log('  insertado:',JSON.stringify(c0));
  const pad=c0?c0.ins.pad:0;
  ok(R.act&&c0&&c0.ins&&R.H===H0+h&&h===S.sec.sh+2*pad&&pad>5,'la imagen crece '+h+' px (la sección + '+pad+' px de espacio arriba y abajo)');
  const esp=await p.evaluate(([y,h,pad])=>{const F=_fgInsFilas(baseImg);let a=y,b=y+h;while(a>0&&F[a-1]<2)a--;let c=y+h-1;while(c>y&&F[c]<2)c--;let e=y+pad;while(F[e]<2)e++;let d=y+h;while(F[d]<2)d++;return {arriba:e-a,abajo:d-c-1};},[c0.y,h,pad]);
  console.log('  espacio arriba/abajo:',JSON.stringify(esp));
  ok(Math.abs(esp.arriba-esp.abajo)<=3,'el espacio de arriba y el de abajo quedan parejos ('+esp.arriba+' / '+esp.abajo+' px)');
  const gapDst=await p.evaluate(y=>_fgInsFilas(_fgRec.orig)[y]<2,c0.y);
  ok(Math.abs(c0.y-YI)<=160&&gapDst,'entró en el hueco entre bloques más cercano al mouse ('+c0.y+'), sin partir una tarjeta');
  ok(!R.modo&&!R.linea,'termina el modo de colocar');
  const FH1=await p.evaluate(()=>fullRes(getVals()).height);
  ok(FH1===FH0+h,'la descarga crece '+h+' px');
  ok(dif(arriba0,await FR(p,560,120))<1,'lo de arriba queda igual');
  ok(dif(pie0,await FR(p,FH1-300,250))<1,'oficiales y legales bajan juntos (el pie es idéntico)');
  // la sección es la del otro flyer (acá es el mismo archivo): el medio, idéntico
  const enFlyer=await FR(p,c0.y+pad+20,Math.max(10,h-2*pad-40)),orig=await p.evaluate(([sy,hh])=>{const im=_fgIns.imgs[_fgRec.cortes[0].ins.u],c=document.createElement('canvas');c.width=im.naturalWidth;c.height=hh;c.getContext('2d').drawImage(im,0,sy,im.naturalWidth,hh,0,0,im.naturalWidth,hh);return Array.from(c.getContext('2d').getImageData(0,0,c.width,hh).data.filter((_,i)=>i%16===0));},[c0.ins.sy+20,Math.max(10,h-2*pad-40)]);
  ok(dif(enFlyer,orig)<2,'la sección se ve igual que en su flyer');
  ok((await p.textContent('#fg-rec-chip')).includes('Insertado: 1 sección'),'el cartelito dice "Insertado: 1 sección"');
  await p.screenshot({path:__dirname+'/capturas/t88_insertado.png'});
  // ---- Deshacer / Rehacer ----
  await p.click('#fg-lg-desh');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>baseImg.height)===H0,'Deshacer saca la sección');
  await p.click('#fg-lg-reh');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>baseImg.height)===H0+h,'Rehacer la vuelve a poner');
  // ---- recortar después de insertar: los dos pasos conviven ----
  await p.evaluate(()=>{fgRecAplicar(700,200);});
  ok(await p.evaluate(()=>baseImg.height)===H0+h-200&&(await p.textContent('#fg-rec-chip')).includes('Recortado: 1 parte'),'insertar y recortar en el mismo flyer');
  // ---- Estudio: se guarda y, al abrirlo sin la imagen en memoria, se baja sola ----
  await p.evaluate(()=>_fgLgBarra());
  await p.click('#fg-lg-guardar');await p.fill('#fg-est-nom','Con Galerías');await p.click('#fg-est-ok');await p.waitForTimeout(900);
  const dd=nube.disenos.filter(d=>d.tipo==='diseno').pop();
  ok(dd&&dd.datos.recortes.length===2&&dd.datos.recortes[0].ins&&dd.datos.recortes[0].ins.u===PUB+'fuente_1.jpg','el diseño guarda la sección (de qué flyer y qué parte)');
  await p.evaluate(()=>{_fgApplyOption(_fgOptCache[_optN(_fgOpt)]);_fgIns.imgs=Object.create(null);});
  await p.click('#apptab-estudio');await p.waitForSelector('.est-card');
  await p.click('.est-card button[data-acc=usar]');await p.waitForTimeout(1800);
  const U=await p.evaluate(()=>({H:baseImg.height,act:_fgRecActivo(),falta:_fgRecActivo()?_fgInsFaltan(_fgRec.cortes):-1}));
  ok(U.act&&U.H===H0+h-200&&U.falta===0,'"Usar" abre el diseño con la sección (la imagen se bajó antes de armarlo)');
  // ---- "Copiadas hace poco" ----
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('i');await p.waitForSelector('#fg-ins-ov .fg-ins-rec');
  ok(true,'la tecla I abre Insertar, y la ventana ofrece la sección copiada hace poco');
  await p.click('#fg-ins-ov .fg-ins-rec');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>_fgIns.modo),'tocar una reciente va directo a colocarla');
  await p.keyboard.press('i');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>!_fgIns.modo&&!document.getElementById('fg-ins-linea')),'la tecla I otra vez cancela la inserción');
  await p.keyboard.press('r');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>_fgRecM.modo),'las otras letras siguen andando (R = Recortar)');
  await p.keyboard.press('r');
  // ---- proponer un flyer desde Estudio ----
  await p.click('#apptab-estudio');await p.waitForSelector('#est-fu-subir');
  ok((await p.textContent('#est-fu-subir')).includes('Proponer'),'un asesor ve "Proponer un flyer (PDF)"');
  await p.setInputFiles('#est-fu-file',__dirname+'/datos/op9.jpg');
  await p.waitForSelector('#fg-pt-i',{timeout:15000});await p.fill('#fg-pt-i','Gastronomía Córdoba');await p.click('#fg-pt-ok');
  await p.waitForFunction(()=>!_EST_FU.ocupado,null,{timeout:15000});await p.waitForTimeout(500);
  const prop=nube.disenos.find(d=>d.tipo==='fuente');
  ok(prop&&prop.estado==='pedido'&&/^data:image\/jpeg;base64,/.test(prop.datos.img)&&prop.miniatura.length>500,'la propuesta llega como pedido, con la imagen y su miniatura');
  ok(await p.evaluate(()=>(_fgIns.lista||[]).length)===1,'hasta que se aprueba no aparece en el depósito');
  await p.screenshot({path:__dirname+'/capturas/t88_estudio_asesor.png',fullPage:false});
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  ok(!p.errores.length,'sin errores en la página (asesor)');
  await p.context().close();
  // ---- el admin aprueba ----
  const adm=await abrir(browser,{rol:'admin'});
  await adm.click('#apptab-estudio');await adm.waitForSelector('#est-fu-lista button[data-fu=aprobar]');
  ok((await adm.textContent('#est-fu-subir')).includes('Subir'),'el admin ve "Subir un flyer (PDF)"');
  ok((await adm.textContent('#est-tab-badge').catch(()=>''))==='1','la propuesta cuenta en el numerito de Estudio (también con la lista ya cargada)');
  await adm.screenshot({path:__dirname+'/capturas/t88_estudio_admin.png'});
  await adm.click('#est-fu-lista button[data-fu=aprobar]');
  await adm.waitForFunction(()=>!_EST_FU.ocupado,null,{timeout:20000});await adm.waitForTimeout(500);
  const L=nube.json['_fuentes.json'].lista,nuevo=L[L.length-1];
  ok(L.length===2&&nuevo.nombre==='Gastronomía Córdoba'&&nuevo.de==='Asesor Prueba'&&nube.bin[nuevo.img.split('/').pop()],'al aprobar, la imagen sube al bucket y entra al depósito');
  ok(prop.estado==='publicado'&&!(prop.datos&&prop.datos.img),'la propuesta queda aprobada y sin la copia pesada');
  ok(await adm.evaluate(()=>{var b=document.getElementById('est-tab-badge');return !b||b.style.display==='none';}),'aprobada, se va el numerito');
  // una lista que no se pudo leer (403) no se toma como vacía: no se pisa el depósito
  const antes=JSON.stringify(nube.json['_fuentes.json']);
  const err403=await adm.evaluate(()=>{var f=window.fetch;window.fetch=function(u,o){if(String(u).indexOf('_fuentes.json')>=0)return Promise.resolve(new Response('{}',{status:403}));return f.apply(this,arguments);};
    return _estFuGuardarLista(function(L){return [];}).then(function(){window.fetch=f;return 'guardó';},function(e){window.fetch=f;return String(e&&e.message);});});
  ok(err403!=='guardó'&&JSON.stringify(nube.json['_fuentes.json'])===antes,'con un 403 al leer la lista no se guarda nada');
  // quitar: deja de estar en la lista, la imagen queda (diseños que ya la usan)
  await adm.click('#est-fu-lista button[data-fu=quitar][data-id=f1]');await adm.click('#fg-cf-ok');await adm.waitForTimeout(600);
  ok(nube.json['_fuentes.json'].lista.length===1&&nube.bin['fuente_1.jpg'],'Quitar lo saca de la lista sin borrar la imagen');
  console.log('  errores admin:',adm.errores.length,adm.errores.slice(0,3));
  ok(!adm.errores.length,'sin errores en la página (admin)');
  await adm.context().close();
};
