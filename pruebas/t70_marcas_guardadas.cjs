// "Marcas guardadas": guardar las franjas y los cambios de un flyer con un nombre y
// aplicarlos solos en el mismo flyer, en un "modelo nuevo" corrido y achicado, y en
// uno donde la franja no está (se ubica a mano). Deshacer, destildar y vencidas.
const {abrir,nube}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  ok(await p.isVisible('#fg-lg-mg'),'el botón "Marcas guardadas" está en la barra de Cambiar logos');
  // ── armo el flyer: una franja de 3 marcas, Jumbo→Coto y Disco→Vea con sus días, Toledo vacío ──
  await p.evaluate(()=>{_fgLgV.prov='';_fgLgV.conDias=true;_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  const marcasFr=await p.evaluate(async()=>{
    const st=_fgFrSt;let n=0;
    for(const x of st.res){if(n>=3)break;if(_fgLgVencida({img:x.imagen}))continue;try{await _fgLgTraer(x.imagen);st.sel.push({img:x.imagen,t:x.titulo});n++;}catch(e){}}
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();return st.sel.map(s=>s.img);
  });
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});
  const orig=await p.evaluate(async()=>{
    const sup=n=>_promosCat.find(q=>q.subtitulo==='Supermercados'&&_promoNormalizar(q.titulo).replace(/ /g,'')===n);
    for(const [x,y,n] of [[730,1310,'coto'],[905,1310,'vea']]){const s=sup(n),im=await _fgLgTraer(s.imagen);_fgLgPonerMarca(_fgLgDetectar(x,y),s,im,true);}
    _fgLgPoner(_fgLgDetectar(710,1465),'','',null);
    _fgLg.sel=-1;_fgLgListo();
    const L=_fgLgActivos(),b=L.find(e=>e.franjaBase);
    return {n:L.length,franja:{x:b.ox,y:b.oy,w:b.ow,h:b.oh},coto:(e=>({cx:e.tx+e.tw/2,cy:e.ty+e.th/2}))(L.find(e=>/coto/i.test(e.t))),
      textos:L.filter(e=>e.tipo==='txt'&&!e.franja).map(e=>e.texto).sort()};
  });
  console.log('   armado:',JSON.stringify(orig));
  // ── guardar ──
  await p.evaluate(()=>fgMarcasGuardadas());
  await p.waitForSelector('#fg-mg-g',{timeout:5000});
  await p.click('#fg-mg-g');
  await p.waitForSelector('#fg-pt-i',{timeout:5000});
  const resumen=await p.textContent('#fg-pt-b');
  await p.fill('#fg-pt-i','Neuquén prueba');await p.click('#fg-pt-ok');
  await p.waitForFunction(()=>_MG.lista&&_MG.lista.some(x=>x.nombre==='Neuquén prueba'),null,{timeout:8000}).catch(()=>{});
  const fila=nube.disenos.find(d=>d.nombre==='Neuquén prueba');
  console.log('   resumen:',resumen,'| items:',fila&&fila.datos.items.map(i=>i.tipo+':'+i.nombre).join(' / '));
  ok(!!fila&&fila.tipo==='combinacion','se guarda como combinación ("'+(fila&&fila.nombre)+'")');
  ok(/1 franja/.test(resumen)&&/2 logos/.test(resumen)&&/1 lugar vac/.test(resumen),'el resumen dice qué se guarda ('+resumen.replace(/\s+/g,' ').slice(0,80)+')');
  const it=fila.datos.items;
  ok(it.filter(x=>x.tipo==='logo'&&x.conDias).length===2&&!it.some(x=>x.tipo==='texto'),'los súper se guardan "con días" y los textos de días no se guardan aparte');
  // Estudio no la muestra como diseño
  await p.evaluate(()=>{_EST.lista=null;_estCargar();});
  await p.waitForFunction(()=>_EST.lista!==null,null,{timeout:8000});
  ok(await p.evaluate(()=>!_EST.lista.some(d=>d.nombre==='Neuquén prueba')),'la lista de diseños de Estudio no la mezcla');
  const id=fila.id;
  // helpers para aplicar
  const aplicar=async(antesDeAplicar)=>{
    await p.evaluate((id)=>fgMgAplicar(id),id);
    await p.waitForSelector('#fg-mga-items .mg-item',{timeout:10000});
    const est=await p.$$eval('#fg-mga-items .mg-item',x=>x.map(l=>l.querySelector('.mg-item-t').textContent+' → '+l.querySelector('.mg-est').textContent));
    if(antesDeAplicar)await antesDeAplicar();
    await p.click('#fg-mga-ok');
    await p.waitForTimeout(1500);
    return est;
  };
  const estado=()=>p.evaluate(()=>{const L=_fgLgActivos(),b=L.find(e=>e.franjaBase);
    return {n:L.length,franja:b&&{x:b.ox,y:b.oy,w:b.ow,h:b.oh},logosFr:L.filter(e=>e.franja&&!e.franjaBase&&e.tipo!=='txt').map(e=>e.img),
      coto:(e=>e&&({cx:e.tx+e.tw/2,cy:e.ty+e.th/2}))(L.find(e=>/coto/i.test(e.t||''))),textos:L.filter(e=>e.tipo==='txt'&&!e.franja).map(e=>e.texto).sort(),
      vacios:L.filter(e=>!e.img&&e.tipo!=='txt'&&!e.franjaBase&&!e.franja&&e.w>0).length};});
  // ── 1) mismo flyer: limpio y aplico ──
  await p.evaluate(()=>{_fgLg.list=[];_fgLg.sel=-1;_fgLgListo();});
  await p.waitForTimeout(600);
  const e1=await aplicar();
  console.log('   ubicación:',JSON.stringify(e1));
  ok(e1.every(x=>/En su lugar/.test(x)),'en el mismo flyer todo sale "En su lugar"');
  let r=await estado();
  console.log('   tras aplicar:',JSON.stringify(r));
  ok(r.franja&&Math.abs(r.franja.x-orig.franja.x)<3&&Math.abs(r.franja.y-orig.franja.y)<3&&r.logosFr.join()===marcasFr.join(),'la franja vuelve igual, con las mismas marcas en orden');
  ok(r.coto&&Math.abs(r.coto.cx-orig.coto.cx)<3&&Math.abs(r.coto.cy-orig.coto.cy)<3,'Coto vuelve a su lugar');
  ok(r.textos.join()===orig.textos.join(),'con sus días de descuento ('+r.textos.join(', ')+')');
  ok(r.vacios===1,'y el lugar vacío');
  // deshacer: todo en un paso
  await p.waitForTimeout(600);
  await p.evaluate(()=>fgLgDeshacer());await p.waitForTimeout(200);
  ok((await estado()).n===0,'Ctrl+Z / Deshacer saca todo lo aplicado de una vez');
  // destildar un ítem
  await aplicar(async()=>{await p.evaluate(()=>{const c=[...document.querySelectorAll('#fg-mga-items .mg-item')].find(l=>/vac/i.test(l.textContent)).querySelector('input');c.click();});});
  r=await estado();
  ok(r.vacios===0&&r.logosFr.length===3,'lo destildado no se aplica (sin el lugar vacío)');
  fs.writeFileSync(__dirname+'/capturas/t70_mismo.png',Buffer.from((await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=620;c.height=520;c.getContext('2d').drawImage(fc,620,1220,600,500,0,0,620,520);return c.toDataURL('image/png');})).split(',')[1],'base64'));
  // ── 2) "modelo nuevo": misma imagen achicada al 90 % y corrida 30 px hacia abajo ──
  const modelo=async(blanquearFranja)=>p.evaluate(async([bl,fr])=>{
    const vieja=window._mgImgOriginal||baseImg;window._mgImgOriginal=vieja;
    const k=0.9,W=Math.round(vieja.width*k),H=Math.round(vieja.height*k)+30;
    const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,W,H);g.drawImage(vieja,0,30,W,Math.round(vieja.height*k));
    if(bl){g.fillStyle='#fff';g.fillRect(0,fr.y*k+30-10,W,fr.h*k+20);}
    const im=new Image();await new Promise(r=>{im.onload=r;im.src=c.toDataURL('image/jpeg',0.92);});
    window.baseImg=im;_fgLg.list=[];_fgLg.src=_fgLgSrc();_fgLg.sel=-1;
    return {W,H};
  },[blanquearFranja,orig.franja]);
  await modelo(false);
  const e2=await aplicar();
  console.log('   ubicación en el modelo nuevo:',JSON.stringify(e2));
  r=await estado();
  console.log('   modelo nuevo:',JSON.stringify(r));
  const esp={x:orig.franja.x*0.9,y:orig.franja.y*0.9+30};
  ok(e2.filter(x=>/Franja|Coto|Vea/.test(x)).every(x=>/En su lugar/.test(x)),'en el modelo nuevo la franja y los súper se ubican solos ("En su lugar")');
  ok(r.franja&&Math.abs(r.franja.x-esp.x)<12&&Math.abs(r.franja.y-esp.y)<12,'la franja queda donde está ahora ('+(r.franja&&Math.round(r.franja.y))+' vs '+Math.round(esp.y)+')');
  ok(r.coto&&Math.abs(r.coto.cy-(orig.coto.cy*0.9+30))<14,'Coto queda sobre el logo de la posición nueva');
  ok(r.textos.length===2,'con sus días');
  // ── 3) modelo sin esa franja: aproximado y "Ubicar a mano" ──
  await modelo(true);
  let e3;
  await p.evaluate((id)=>fgMgAplicar(id),id);
  await p.waitForSelector('#fg-mga-items .mg-item',{timeout:10000});
  e3=await p.$$eval('#fg-mga-items .mg-item',x=>x.map(l=>l.querySelector('.mg-item-t').textContent+' → '+l.querySelector('.mg-est').textContent));
  ok(e3.some(x=>/Franja/.test(x)&&/Aproximado/.test(x)),'si la franja no está, sale "Aproximado"');
  await p.click('#fg-mga-items .mg-ubicar');
  ok(/ubicar vos/.test(await p.textContent('#fg-mga-items')),'"Ubicar a mano" la deja para marcar después');
  await p.click('#fg-mga-ok');await p.waitForTimeout(1200);
  const pend=await p.evaluate(()=>({modo:_fgFr.modo,sel:_fgFr.pendiente&&_fgFr.pendiente.sel.map(s=>s.img)}));
  ok(pend.modo&&pend.sel&&pend.sel.join()===marcasFr.join(),'al aplicar queda el modo Armar franja con sus marcas cargadas para marcar dónde va');
  await p.evaluate(()=>fgFranjaModo(false));
  // dos franjas para ubicar a mano: van de a una (al poner la primera sigue la segunda)
  const cola=await p.evaluate(async(marcas)=>{
    _fgLg.list=[];_fgLg.src=_fgLgSrc();
    const fr=(nom,sel)=>({tipo:'franja',nombre:nom,rect:{x:140,y:2650,w:1000,h:230},sel:sel.map(img=>({img,t:img})),cols:0,kt:1,conDias:false,n:3,cajas:[],manual:true});
    const datos={v:1,ancho:baseImg.width,alto:baseImg.height,items:[fr('Franja A',marcas.slice(0,2)),fr('Franja B',marcas.slice(1,3))],subidos:{}};
    await _mgAplicar(datos,[true,true],'Cola');
    return {modo:_fgFr.modo,sel:_fgFr.pendiente&&_fgFr.pendiente.sel.map(s=>s.img),quedan:_mgPend.length};
  },marcasFr);
  ok(cola.modo&&cola.sel.join()===marcasFr.slice(0,2).join()&&cola.quedan===1,'con dos franjas para ubicar, primero queda la primera ('+cola.quedan+' esperando)');
  await p.evaluate(()=>{fgFranjaModo(false);_fgFr.modo=false;_fgFrAbrir(_fgLgManual(140,600,1000,230));});
  // (fgFranjaModo(false) programático no descarta la cola; marcar el recuadro abre con la primera)
  await p.waitForSelector('#fg-fr-ov',{timeout:10000});
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(700);
  const cola2=await p.evaluate(()=>({modo:_fgFr.modo,sel:_fgFr.pendiente&&_fgFr.pendiente.sel.map(s=>s.img),quedan:_mgPend.length}));
  ok(cola2.modo&&cola2.sel&&cola2.sel.join()===marcasFr.slice(1,3).join()&&cola2.quedan===0,'al poner la primera sigue sola la segunda');
  await p.evaluate(()=>fgFranjaModo());
  ok(await p.evaluate(()=>!_fgFr.modo&&!_fgFr.pendiente&&_mgPend.length===0),'"Cancelar franja" descarta lo que faltaba ubicar');
  // ── 4) una marca vencida queda en rojo ──
  await p.evaluate(()=>{window.baseImg=window._mgImgOriginal;_fgLg.list=[];_fgLg.src=_fgLgSrc();});
  await p.evaluate((img)=>{const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    window._promosCat=_promosCat.map(q=>q.imagen===img?Object.assign({},q,{fecha_hasta:f(-2),proximamente:false}):q);},marcasFr[0]);
  await aplicar();
  const rojo=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca.vencida').length);
  ok(rojo>=1,'la marca que venció queda en rojo ('+rojo+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
