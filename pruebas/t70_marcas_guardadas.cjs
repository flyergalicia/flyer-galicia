// "Marcas guardadas" (23-oct): guardar con un nombre (nueva o reemplazando una que
// ya existe, con la provincia de esas marcas) y aplicar. Busca en TODO el flyer el
// mismo grupo (franja con sus logos, grilla de súper con sus vecinos), así encuentra
// las cosas aunque el modelo nuevo las tenga en otro lugar.
// Si encontró todo: "Así queda" (se ve puesto: Dejar así / Revisar uno por uno /
// Volver a como estaba). Si no: paso a paso (barra abajo, recuadro "va acá", Poner
// acá / tocar otro lugar / arrastrar / Saltar / Atrás / puntitos / Poner de una / ×).
const {abrir,nube}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  ok(await p.isVisible('#fg-lg-mg'),'el botón "Marcas guardadas" está en la barra de Cambiar logos');
  // ── armo: una franja de 3 marcas, Jumbo→Coto y Disco→Vea con sus días, Toledo vacío ──
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
    return {franja:{x:b.ox,y:b.oy,w:b.ow,h:b.oh},coto:(e=>({cx:e.tx+e.tw/2,cy:e.ty+e.th/2}))(L.find(e=>/coto/i.test(e.t))),
      textos:L.filter(e=>e.tipo==='txt'&&!e.franja).map(e=>e.texto).sort()};
  });
  // la 2ª marca de la franja sólo tiene promo en otra provincia (para el aviso en amarillo)
  await p.evaluate((img)=>{window._promosCat=_promosCat.map(q=>q.imagen===img?Object.assign({},q,{provincias:['ZZZ PRUEBA']}):q);},marcasFr[1]);
  // ── guardar (nueva, con provincia) ──
  await p.evaluate(()=>fgMarcasGuardadas());
  await p.waitForSelector('#fg-mg-g',{timeout:5000});
  await p.click('#fg-mg-g');
  await p.waitForSelector('#fg-mgg-nom',{timeout:8000});
  ok(!(await p.$('#fg-mgg-dest')),'la primera vez no ofrece reemplazar (no hay otras)');
  const prov=await p.evaluate(()=>{const s=document.getElementById('fg-mgg-prov');if(!s)return '';const o=[...s.options].find(o=>o.value&&o.value!=='ZZZ PRUEBA');s.value=o?o.value:'';return s.value;});
  ok(!!prov,'se puede elegir la provincia de esas marcas ('+prov+')');
  await p.fill('#fg-mgg-nom','Neuquén prueba');await p.click('#fg-mgg-ok');
  await p.waitForFunction(()=>_MG.lista&&_MG.lista.some(x=>x.nombre==='Neuquén prueba'),null,{timeout:8000}).catch(()=>{});
  const fila=nube.disenos.find(d=>d.nombre==='Neuquén prueba');
  ok(!!fila&&fila.tipo==='combinacion','se guarda como combinación');
  const D=fila.datos;
  console.log('   guardado:',D.items.map(i=>i.tipo+':'+i.nombre).join(' / '),'| grupos:',(D.grupos||[]).map(g=>g.items.length+' ítems, '+g.ctx.length+' cajas').join(' · '),'| franja ctx:',(D.items.find(i=>i.tipo==='franja')||{}).ctx.length);
  ok(D.grupos&&D.grupos.length===1&&D.grupos[0].items.length===3&&D.grupos[0].ctx.length>=6,'los súper y el vacío se guardan como un grupo con lo que los rodea');
  ok((D.items.find(i=>i.tipo==='franja')||{ctx:[]}).ctx.length>=3,'la franja se guarda con las cajas de sus logos');
  ok(D.prov===prov&&/franja/.test(D.resumen||'')&&!!D.flyer,'guarda la provincia, qué tiene y de qué flyer es');
  await p.evaluate(()=>{_EST.lista=null;_estCargar();});
  await p.waitForFunction(()=>_EST.lista!==null,null,{timeout:8000});
  ok(await p.evaluate(()=>!_EST.lista.some(d=>d.nombre==='Neuquén prueba')),'la lista de diseños de Estudio no la mezcla');
  const id=fila.id;
  // ── la lista: miniatura, qué tiene, de qué flyer; las viejas con aviso ──
  nube.disenos.push(Object.assign({},fila,{id:'d900-0000-4000-8000-000000000000',nombre:'Vieja',datos:{v:1,ancho:1240,alto:3000,items:[]},miniatura:'',updated_at:'2026-10-22T10:00:00.000Z'}));
  await p.evaluate(()=>new Promise(r=>{_MG.lista=null;fgMarcasGuardadas();_mgCargar(()=>{_mgPintarListas();r();});}));
  const lista=await p.evaluate(()=>[...document.querySelectorAll('#fg-mg-lista .mg-fila')].map(f=>({t:f.querySelector('b').textContent,c:(f.querySelector('.mg-fila-c')||{}).textContent||'',img:!!f.querySelector('.mg-fila-img img'),vieja:!!f.querySelector('.mg-vieja')})));
  console.log('   lista:',JSON.stringify(lista));
  const fn=lista.find(x=>x.t==='Neuquén prueba')||{},fv=lista.find(x=>x.t==='Vieja')||{};
  ok(fn.img&&/1 franja, 2 logos, 1 lugar vac.o/.test(fn.c)&&/del flyer/.test(fn.c)&&!fn.vieja,'la fila muestra miniatura, qué tiene y de qué flyer');
  ok(fv.vieja&&!fv.img,'una guardada con la versión anterior avisa que conviene volver a guardarla');
  await p.screenshot({path:__dirname+'/capturas/t70_lista.png'});
  nube.disenos.splice(nube.disenos.findIndex(d=>d.nombre==='Vieja'),1);
  await p.evaluate(()=>{var x=document.getElementById('fg-mg-ov');if(x)x.remove();_MG.lista=null;});
  const estado=()=>p.evaluate(()=>{const L=_fgLgActivos(),b=L.find(e=>e.franjaBase);
    return {n:L.length,franja:b&&{x:Math.round(b.ox),y:Math.round(b.oy)},logosFr:L.filter(e=>e.franja&&!e.franjaBase&&e.tipo!=='txt').map(e=>e.img),
      coto:(e=>e&&({cx:Math.round(e.tx+e.tw/2),cy:Math.round(e.ty+e.th/2)}))(L.find(e=>/coto/i.test(e.t||''))),textos:L.filter(e=>e.tipo==='txt'&&!e.franja).map(e=>e.texto).sort(),
      vacios:L.filter(e=>!e.img&&e.tipo!=='txt'&&!e.franjaBase&&!e.franja&&e.w>0).length};});
  const barra=()=>p.evaluate(()=>{const q=s=>document.querySelector('#mg-paso '+s);
    return {que:(q('.mg-pb-que')||{}).textContent||'',tit:(q('.mg-pb-tit')||{}).textContent||'',txt:(q('.mg-pb-txt')||{}).textContent||'',
      sug:!!document.getElementById('mg-sug'),aprox:!!document.querySelector('#mg-sug.aprox'),vista:document.querySelectorAll('#mg-sugs .mg-sug.vista').length,
      btns:[...document.querySelectorAll('#mg-paso button[data-mp]')].filter(b=>b.getAttribute('data-mp')!=='ir').map(b=>b.getAttribute('data-mp')+(b.disabled?'(off)':'')),
      modo:_mgPaso&&_mgPaso.modo,i:_mgPaso?_mgPaso.i:-1};});
  const quieto=async()=>{await p.waitForFunction(()=>!_mgPaso||!_mgPaso.ocupado,null,{timeout:15000});await p.waitForTimeout(250);};
  const aplicar=async()=>{
    await p.evaluate(id=>fgMgAplicar(id),id);
    await p.waitForFunction(()=>_mgPaso&&!_mgPaso.ocupado,null,{timeout:15000});await p.waitForTimeout(250);
    return barra();
  };
  const boton=async(a)=>{await p.click('#mg-paso button[data-mp='+a+']');await quieto();};
  const arrastrar=(x,y,w,h)=>p.evaluate(([x,y,w,h])=>{const r=document.getElementById('cv').getBoundingClientRect(),a=_fgLgAPantalla(x,y,w,h);_mgPasoTocar(r.left+a.l,r.top+a.t,r.left+a.l+a.w,r.top+a.t+a.h,w>0);},[x,y,w,h]);
  // ── 1) mismo flyer: "Así queda" (se ve puesto antes de decidir) ──
  await p.evaluate(()=>{_fgLg.list=[];_fgLg.sel=-1;_fgLgListo();});await p.waitForTimeout(600);
  let b=await aplicar();
  console.log('   así queda:',JSON.stringify(b));
  ok(b.modo==='vista'&&/As. queda/.test(b.tit)&&b.vista>=4&&b.btns.join()==='volver,revisar,dejar','encontró todo: lo muestra puesto, con cada cosa marcada, y ofrece Dejar así / Revisar / Volver');
  ok(/sin promo en/i.test(b.txt),'avisa la marca sin promo en esa provincia ('+b.txt.replace(/\s+/g,' ').slice(0,140)+')');
  let r=await estado();
  ok(r.franja&&Math.abs(r.franja.x-orig.franja.x)<4&&Math.abs(r.franja.y-orig.franja.y)<4&&r.logosFr.join()===marcasFr.join(),'la franja vuelve igual, con sus marcas en orden');
  ok(r.coto&&Math.abs(r.coto.cx-orig.coto.cx)<4&&Math.abs(r.coto.cy-orig.coto.cy)<4&&r.textos.join()===orig.textos.join()&&r.vacios===1,'Coto y Vea con sus días, y el lugar vacío');
  // (con la geografía real puede haber otras sin promo en esa provincia: se mira la que se cambió)
  const amarillo=await p.evaluate((img)=>{const mk=document.getElementById('fg-lg-mk'),A=_fgLgActivos();
    return A.map((e,i)=>({img:e.img,fp:mk.children[i].classList.contains('fueraprov'),v:mk.children[i].getAttribute('data-v')||''})).filter(x=>x.fp||x.img===img).map(x=>Object.assign(x,{es:x.img===img}));},marcasFr[1]);
  const am=amarillo.find(x=>x.es)||{};
  ok(am.fp&&/^Sin promo en /.test(am.v),'la marca sin promo en la provincia queda en amarillo ('+am.v+'; '+amarillo.filter(x=>x.fp).length+' en total)');
  await p.waitForTimeout(700);await p.screenshot({path:__dirname+'/capturas/t70_asi_queda.png'});
  await boton('volver');
  ok((await estado()).n===0&&await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')&&!document.getElementById('mg-sugs')),'"Volver a como estaba" lo saca todo');
  b=await aplicar();await boton('dejar');
  r=await estado();
  ok(r.n>0&&await p.evaluate(()=>!_mgPaso),'"Dejar así" lo deja puesto');
  await p.waitForTimeout(600);await p.evaluate(()=>fgLgDeshacer());await p.waitForTimeout(200);
  ok((await estado()).n===0,'se deshace de una vez (Ctrl+Z)');
  // salir del modo edición con "Así queda" abierto: lo puesto queda y se cierra la barra
  b=await aplicar();
  await p.evaluate(()=>fgLogosModo(false));await p.waitForTimeout(300);
  r=await estado();
  ok(r.n>0&&await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')&&!document.getElementById('mg-sugs')),'salir del modo edición con "Así queda" abierto lo deja puesto y cierra la barra');
  await p.evaluate(()=>{fgLogosModo(true);_fgLg.list=[];_fgLg.sel=-1;_fgLgListo();});await p.waitForTimeout(600);
  // ── 2) modelo con otra distribución: la franja arriba (y=700) y la grilla de súper más abajo (+720) ──
  await p.evaluate(async()=>{
    const v=window._mgImgOriginal||baseImg;window._mgImgOriginal=v;
    const c=document.createElement('canvas');c.width=v.width;c.height=v.height;const g=c.getContext('2d');
    g.drawImage(v,0,0);
    const mover=(y0,h,y1)=>{const t=document.createElement('canvas');t.width=v.width;t.height=h;t.getContext('2d').drawImage(v,0,y0,v.width,h,0,0,v.width,h);
      g.fillStyle='#fff';g.fillRect(0,y0,v.width,h);g.fillStyle='#fff';g.fillRect(0,y1,v.width,h);g.drawImage(t,0,y1);};
    mover(2590,330,700);    // la sección de la franja de marcas, arriba de todo
    mover(1230,500,1950);   // la grilla de súper, 720 px más abajo
    const im=new Image();await new Promise(r=>{im.onload=r;im.src=c.toDataURL('image/jpeg',0.92);});
    window.baseImg=im;_fgLg.list=[];_fgLg.src=_fgLgSrc();_fgLg.sel=-1;
  });
  b=await aplicar();
  console.log('   otro modelo:',b.modo,b.tit);
  ok(b.modo==='vista','con la grilla y la franja en otro lugar igual las encuentra (busca en todo el flyer)');
  if(b.modo==='vista')await boton('dejar');else{for(let k=0;k<6&&await p.evaluate(()=>!!_mgPaso);k++){await p.evaluate(()=>_mgPasoEnter());await quieto();}}
  r=await estado();
  console.log('   quedó:',JSON.stringify(r));
  ok(r.franja&&Math.abs(r.franja.y-(orig.franja.y-2590+700))<14,'la franja queda en su lugar nuevo ('+(r.franja&&r.franja.y)+' vs '+(orig.franja.y-2590+700)+')');
  ok(r.coto&&Math.abs(r.coto.cy-(orig.coto.cy+720))<14,'Coto queda en la grilla movida ('+(r.coto&&r.coto.cy)+' vs '+(orig.coto.cy+720)+')');
  ok(r.textos.length===2,'con sus días');
  fs.writeFileSync(__dirname+'/capturas/t70_otro_modelo.png',Buffer.from((await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=600;c.height=760;const g=c.getContext('2d');g.drawImage(fc,0,600,1240,1570,0,0,600,760);return c.toDataURL('image/png');})).split(',')[1],'base64'));
  // ── 3) paso a paso, con un modelo donde la franja no está ──
  await p.evaluate(async()=>{
    const v=window._mgImgOriginal;const c=document.createElement('canvas');c.width=v.width;c.height=v.height;const g=c.getContext('2d');
    g.drawImage(v,0,0);g.fillStyle='#fff';g.fillRect(0,2590,v.width,330);
    const im=new Image();await new Promise(r=>{im.onload=r;im.src=c.toDataURL('image/jpeg',0.92);});
    window.baseImg=im;_fgLg.list=[];_fgLg.src=_fgLgSrc();_fgLg.sel=-1;
  });
  b=await aplicar();
  console.log('   barra:',JSON.stringify(b));
  ok(b.modo==='paso'&&/1 de 4/.test(b.que)&&/Franja/.test(b.tit)&&b.sug&&b.aprox,'si falta algo, va directo de a una: "1 de 4", la franja con "¿Va acá?"');
  ok(b.btns.join()==='seguros,atras(off),saltar,poner,fin','barra: Poner de una, Atrás (apagado en el primero), Saltar, Poner acá y ×');
  await p.screenshot({path:__dirname+'/capturas/t70_paso.png'});
  // la ubico con un recuadro arrastrado
  await arrastrar(140,2000,1000,230);await quieto();
  b=await barra();r=await estado();
  ok(/2 de 4/.test(b.que)&&r.franja&&Math.abs(r.franja.y-2000)<4,'arrastrar un recuadro pone la franja ahí y pasa a la siguiente ('+b.que+')');
  // Ctrl+Z = Atrás: vuelve al paso 1 tal como estaba
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('Control+z');await quieto();
  b=await barra();r=await estado();
  ok(/1 de 4/.test(b.que)&&!r.franja,'Ctrl+Z (Atrás) vuelve al paso anterior y saca lo que se había puesto');
  await arrastrar(140,2000,1000,230);await quieto();
  // Coto: lo pongo tocando OTRO logo (Toledo, de la fila de abajo)
  await arrastrar(710,1468,0,0);await quieto();
  r=await estado();b=await barra();
  ok(r.coto&&Math.abs(r.coto.cy-1468)<30&&/3 de 4/.test(b.que),'tocar otro logo pone la marca sobre ese logo');
  // un puntito de los que faltan: ese pasa a ser el de ahora
  const tit3=b.tit;
  await p.click('#mg-paso .mg-pb-pts button[data-k="3"]');await quieto();
  b=await barra();
  ok(/3 de 4/.test(b.que)&&b.tit!==tit3&&/Lugar vac/.test(b.tit),'tocar un puntito de los que faltan lo hace ahora ('+b.tit+')');
  await boton('saltar');
  b=await barra();ok(/4 de 4/.test(b.que)&&b.tit===tit3,'"Saltar" pasa al que quedaba');
  // un puntito hecho: vuelve ahí tal como estaba
  await p.click('#mg-paso .mg-pb-pts button[data-k="0"]');await quieto();
  b=await barra();r=await estado();
  ok(/1 de 4/.test(b.que)&&r.n===0,'tocar el primer puntito vuelve al principio, con el flyer como estaba');
  // "Poner de una" los que encontró seguro; queda la franja
  await boton('seguros');
  b=await barra();r=await estado();
  ok(/4 de 4/.test(b.que)&&/Franja/.test(b.tit)&&r.coto&&Math.abs(r.coto.cy-orig.coto.cy)<6&&r.textos.length===2&&r.vacios===1,'"Poner de una" pone los 3 seguros y deja la franja para el final');
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('Enter');await quieto();
  b=await barra();
  ok(b.modo==='paso'&&/Listo/.test(b.tit)&&b.btns.join()==='atras,fin'&&b.vista>=4,'al terminar: "Listo" con lo puesto marcado, y todavía se puede ir atrás');
  await boton('atras');
  b=await barra();ok(/4 de 4/.test(b.que)&&!(await estado()).franja,'Atrás desde "Listo" vuelve al último paso');
  await p.keyboard.press('Enter');await quieto();await p.keyboard.press('Enter');await quieto();
  ok(await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')&&!document.getElementById('mg-sug')&&!document.getElementById('mg-sugs')),'"Listo" (Enter) cierra la barra y los recuadros');
  // × termina en el medio y lo puesto queda
  await p.evaluate(()=>{_fgLg.list=[];_fgLgListo();});
  await aplicar();await arrastrar(140,2000,1000,230);await quieto();
  const n1=(await estado()).n;
  await boton('fin');
  ok(n1>0&&(await estado()).n===n1&&await p.evaluate(()=>!_mgPaso),'× termina y lo que ya se puso queda');
  // cambiar de flyer en el medio corta la colocación (no queda la barra colgada)
  await aplicar();
  await p.evaluate(async()=>{const im=new Image();await new Promise(r=>{im.onload=r;im.src=window._mgImgOriginal.src;});window.baseImg=im;if(typeof redrawNow==='function')redrawNow();_fgLgMarcas();});
  ok(await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')),'si cambia el flyer en el medio, la colocación se corta sola');
  // ── 4) una marca vencida queda en rojo ──
  await p.evaluate(()=>{window.baseImg=window._mgImgOriginal;_fgLg.list=[];_fgLg.src=_fgLgSrc();});
  await p.evaluate((img)=>{const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    window._promosCat=_promosCat.map(q=>q.imagen===img?Object.assign({},q,{fecha_hasta:f(-2),proximamente:false}):q);},marcasFr[0]);
  b=await aplicar();
  if(b.modo==='vista')await boton('dejar');else for(let k=0;k<6&&await p.evaluate(()=>!!_mgPaso);k++){await p.evaluate(()=>_mgPasoEnter());await quieto();}
  const rojo=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca.vencida').length);
  ok(rojo>=1,'la marca que venció queda en rojo ('+rojo+')');
  // ── 5) guardar de nuevo: ofrece reemplazar la que se aplicó ──
  const antes=nube.disenos.filter(d=>d.tipo==='combinacion').length;
  await p.evaluate(()=>_mgGuardar());
  await p.waitForSelector('#fg-mgg-nom',{timeout:8000});
  const dlg=await p.evaluate(()=>({dest:(document.getElementById('fg-mgg-dest')||{}).value,nom:document.getElementById('fg-mgg-nom').value,ok:document.getElementById('fg-mgg-ok').textContent,prov:(document.getElementById('fg-mgg-prov')||{}).value}));
  ok(dlg.dest===id&&dlg.nom==='Neuquén prueba'&&/Reemplazar/.test(dlg.ok)&&dlg.prov===prov,'al guardar después de aplicar, ofrece reemplazar esa ('+JSON.stringify(dlg)+')');
  await p.waitForTimeout(400);await p.screenshot({path:__dirname+'/capturas/t70_reemplazar.png'});
  const upd=fila.updated_at;
  await p.click('#fg-mgg-ok');
  await p.waitForFunction(()=>!document.getElementById('fg-mgg-ov'),null,{timeout:8000}).catch(()=>{});
  const f2=nube.disenos.find(d=>d.id===id);
  ok(nube.disenos.filter(d=>d.tipo==='combinacion').length===antes&&f2.updated_at!==upd,'reemplaza la misma (no suma otra)');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
