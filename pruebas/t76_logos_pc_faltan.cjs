// Logos subidos de la PC que ya no están (se pierden al recargar la página): se avisa en vez de
// dejar el logo original sin decir nada, no se publica un diseño al que le falta uno, no se
// mezclan con otro del mismo nombre, y los borradores avisan cuando no hay lugar para guardarlos.
const fs=require('fs');
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const PNG=fs.readFileSync(__dirname+'/datos/gofarma_180.png').toString('base64');
const toast=p=>p.evaluate(()=>(document.getElementById('toast-el')||document.getElementById('toast')||{textContent:''}).textContent);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);window.__file=()=>new File([u],'gofarma_180.png',{type:'image/png'});},PNG);
  const det={x:100,y:2000,w:150,h:60,bg:'rgb(255,255,255)'};

  // 1) la clave de cada subida es única (aun después de recargar el contador vuelve a 0)
  const k=await p.evaluate(async()=>{
    const a=await _fgLgLeerArchivo(window.__file()),b=await _fgLgLeerArchivo(window.__file());
    _fgLgSubidos=0; // como después de recargar la página
    const c=await _fgLgLeerArchivo(window.__file());
    return [a.clave,b.clave,c.clave];
  });
  ok(new Set(k).size===3&&k.every(x=>/^pc:[0-9a-z]+:gofarma_180\.png$/.test(x)),'dos subidas del mismo archivo (y una después de "recargar") tienen claves distintas ('+k.join(' | ')+')');

  // 2) cargar del historial un flyer cuyo logo subido ya no está: avisa
  const r2=await p.evaluate(async(det)=>{
    const r=await _fgLgLeerArchivo(window.__file());
    _fgLgPoner(det,r.clave,r.nombre,r.logo);
    const logos=JSON.parse(JSON.stringify(_fgLg.list)),src=_fgLgSrc();
    _fgLg.list=[];delete _fgLg.imgs[r.clave];   // "se recargó la página"
    _fgHistDiseno({logos:logos,logosSrc:src,recortes:[]});
    await new Promise(x=>setTimeout(x,2200));
    return {clave:r.clave,txt:document.getElementById('toast-el').textContent,lista:_fgLg.list.length,pestana:!!_fgProtoAct};
  },det);
  ok(/Falta el logo subido de la PC «gofarma_180\.png»/.test(r2.txt),'historial: avisa que falta el logo subido ('+r2.txt.slice(0,110)+')');
  ok(r2.lista===1,'y igual abre lo demás en un borrador');

  // 3) Guardar en Estudio con el logo faltante: aviso en la ventana y se conserva lo que ya estaba guardado
  await p.evaluate(b64=>{window.__png=b64;},PNG);
  const r3a=await p.evaluate(async(clave)=>{
    const pa=_fgProtoBuscar(_fgProtoAct);pa.subidos={};
    fgEstGuardar();await new Promise(x=>setTimeout(x,200));
    const t=document.getElementById('fg-est-ov').innerText;document.getElementById('fg-est-ov').remove();return t;
  },r2.clave);
  ok(/Falta el logo subido de la PC/.test(r3a),'Guardar en Estudio: si el logo no está en ningún lado, la ventana avisa ('+r3a.slice(0,100).split(String.fromCharCode(10)).join(' ')+')');
  const r3b=await p.evaluate(async(clave)=>{
    const pa=_fgProtoBuscar(_fgProtoAct);
    pa.subidos={};pa.subidos[clave]='data:image/png;base64,'+window.__png; // el diseño lo traía guardado
    fgEstGuardar();await new Promise(x=>setTimeout(x,200));
    return document.getElementById('fg-est-ov').innerText;
  },r2.clave);
  ok(!/Falta el logo subido de la PC/.test(r3b),'si el diseño lo traía guardado, no avisa (se conserva)');
  await p.fill('#fg-est-nom','Con logo faltante');await p.click('#fg-est-ok');
  await p.waitForSelector('#fg-est-ov',{state:'detached',timeout:8000});
  const d=nube.disenos[nube.disenos.length-1];
  ok(d&&d.datos.subidos&&d.datos.subidos[r2.clave],'al guardar se conserva la imagen que el diseño ya traía (no se pierde para siempre)');

  // 4) dos diseños viejos con la MISMA clave y distinta imagen: cada uno muestra la suya
  const r4=await p.evaluate(async()=>{
    const mk=color=>{const c=document.createElement('canvas');c.width=c.height=4;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,4,4);return c.toDataURL('image/png');};
    const K='pc:1:logo.png',rojo=mk('#ff0000'),azul=mk('#0000ff');
    const px=()=>Array.from(_fgLg.imgs[K].getContext('2d').getImageData(1,1,1,1).data.slice(0,3));
    delete _fgLg.imgs[K];delete _fgLg.imgsDe[K];
    await _estPrepararSubidos({[K]:rojo});const a=px();
    await _estPrepararSubidos({[K]:azul});const b=px();
    await _estPrepararSubidos({[K]:rojo});const c=px();
    return {a,b,c};
  });
  ok(r4.a[0]>200&&r4.b[2]>200&&r4.c[0]>200,'diseños con la misma clave: cada uno carga SU imagen (rojo, azul, rojo) '+JSON.stringify(r4));

  // 5) borradores en la PC sin lugar: se guardan sin los logos y se avisa; los pendientes no pierden los suyos
  const r5=await p.evaluate(async(png)=>{
    const original=Storage.prototype.setItem;
    const grande='data:image/png;base64,'+png.repeat(3);
    _fgBorr.revisado=true;
    const pr=_fgBorradorCrear(9);pr.cambios=[{img:'pc:q:a.png',t:'a',x:0,y:0,w:10,h:10}];pr.subidos={'pc:q:a.png':grande};
    _fgBorr.pendientes=[{id:'x',opcion:9,nombre:'Pendiente',cambios:[{img:'pc:z:b.png'}],recortes:[],legal:null,subidos:{'pc:z:b.png':grande}}];
    Storage.prototype.setItem=function(k,v){if(String(v).length>20000)throw new DOMException('cuota','QuotaExceededError');return original.call(this,k,v);};
    _fgBorr.avisoGrande=false;_fgBorr.avisoSinLugar=false;
    _fgBorrGuardar();
    const g1=JSON.parse(localStorage.getItem(_fgBorrClave()));
    const t1=document.getElementById('toast-el').textContent;
    const pend=_fgBorr.pendientes[0].subidos['pc:z:b.png']?'conserva':'perdio';
    const enMemoria=Object.keys(pr.subidos).length;
    // y ahora ni sin logos entra
    Storage.prototype.setItem=function(){throw new DOMException('cuota','QuotaExceededError');};
    document.getElementById('toast-el').textContent='';
    _fgBorrGuardar();const t2=document.getElementById('toast-el').textContent;
    Storage.prototype.setItem=original;
    return {logosGuardados:g1.lista.map(x=>Object.keys(x.subidos).length),t1,pend,enMemoria,t2,avisoSinLugar:_fgBorr.avisoSinLugar};
  },PNG);
  ok(r5.logosGuardados.every(n=>n===0)&&/sin los logos subidos/.test(r5.t1),'sin lugar: se guardan sin los logos y se avisa una vez ('+r5.t1.slice(0,90)+')');
  ok(r5.pend==='conserva'&&r5.enMemoria===1,'los borradores pendientes y abiertos conservan sus logos en memoria');
  ok(/No se pudieron guardar los borradores en esta PC/.test(r5.t2)&&r5.avisoSinLugar,'si ni sin logos entra: avisa que no se guardan ('+r5.t2.slice(0,80)+')');

  // 6) recuperar un borrador cuyo logo subido no se pudo guardar
  const r6=await p.evaluate(async()=>{
    _fgBorr.pendientes=[{id:'y',opcion:9,nombre:'Viejo',cambios:[{img:'pc:z:b.png',t:'b'}],recortes:[],legal:null,subidos:{}}];
    _fgBorrRecuperar();return document.getElementById('toast-el').textContent;
  });
  ok(/1 logo subido de la PC no se pudo guardar/.test(r6),'al recuperar el borrador avisa que falta un logo ('+r6.slice(0,120)+')');

  // 7) historial: volver a bajar un flyer con un logo subido perdido pregunta antes
  let descargas=0;p.on('download',()=>{descargas++;});
  await p.evaluate(det=>{
    const v=getVals();v.logos=[{img:'pc:perdido:c.png',t:'c',x:10,y:10,w:100,h:40}];v.logosSrc=_fgLgSrc();
    flyerHistory.unshift({v:v,fn:'conlogo',thumb:'',hora:'1:00',ts:1,ac:0,opt:_optN(_fgOpt)});
    fgRedlPDF(0);
  },det);
  await p.waitForSelector('#fg-cf-ok',{timeout:4000});
  const cf=await p.evaluate(()=>document.querySelector('.fg-cf').innerText);
  ok(/Falta un logo subido de la PC/.test(cf)&&descargas===0,'volver a bajar del historial: pregunta antes ("Falta un logo subido de la PC")');
  await p.click('#fg-cf-no');
  await p.waitForTimeout(600);
  ok(descargas===0,'Cancelar: no baja nada');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();

  // 8) el administrador no puede publicar un diseño al que le falta un logo subido
  const a=await abrir(browser,{rol:'admin'});
  nube.disenos.push({id:'d99-0000-4000-8000-000000000000',user_id:'00000000-0000-4000-8000-000000000001',autor:'Asesor Prueba',nombre:'Con logo perdido',empresa:'',opcion:9,base_name:'flyer_t9.jpg',
    datos:{v:1,cambios:[{img:'pc:abc:a.png',t:'a',x:10,y:2000,w:100,h:50,tx:10,ty:2000,tw:100,th:50,ox:10,oy:2000,ow:100,oh:50,bg:'rgb(255,255,255)'}],subidos:{},recortes:[],legal:''},
    miniatura:'',estado:'pedido',tipo:'diseno',nota_admin:'',opcion_publicada:null,pedido_at:new Date().toISOString(),revisado_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  const antes=nube.subidas.length;
  await a.evaluate(()=>_estPublicar('d99-0000-4000-8000-000000000000',{},9,'Prueba'));
  await a.waitForTimeout(2500);
  const t8=await toast(a);
  ok(/No se pudo publicar: le falta el logo subido de la PC «a\.png»/.test(t8),'publicar: se frena con el motivo ('+t8.slice(0,110)+')');
  ok(!nube.subidas.slice(antes).some(s=>/^_active\d+\.json$/.test(s.nombre)),'no se reservó ni subió ninguna opción nueva');
  ok(nube.disenos[nube.disenos.length-1].estado==='pedido','el diseño sigue pedido (no se publicó)');
  await a.context().close();
};
