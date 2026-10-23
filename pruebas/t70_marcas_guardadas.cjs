// "Marcas guardadas" (23-oct, rehecho): guardar con un nombre y aplicar. Busca en
// TODO el flyer el mismo grupo (franja con sus logos, grilla de súper con sus
// vecinos), así encuentra las cosas aunque el modelo nuevo las tenga en otro lugar.
// Si encontró todo: "Poner todo". Si no: paso a paso (barra abajo, recuadro "va
// acá", Poner acá / tocar otro lugar / arrastrar / Saltar / ×).
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
  // ── guardar ──
  await p.evaluate(()=>fgMarcasGuardadas());
  await p.waitForSelector('#fg-mg-g',{timeout:5000});
  await p.click('#fg-mg-g');
  await p.waitForSelector('#fg-pt-i',{timeout:5000});
  await p.fill('#fg-pt-i','Neuquén prueba');await p.click('#fg-pt-ok');
  await p.waitForFunction(()=>_MG.lista&&_MG.lista.some(x=>x.nombre==='Neuquén prueba'),null,{timeout:8000}).catch(()=>{});
  const fila=nube.disenos.find(d=>d.nombre==='Neuquén prueba');
  ok(!!fila&&fila.tipo==='combinacion','se guarda como combinación');
  const D=fila.datos;
  console.log('   guardado:',D.items.map(i=>i.tipo+':'+i.nombre).join(' / '),'| grupos:',(D.grupos||[]).map(g=>g.items.length+' ítems, '+g.ctx.length+' cajas').join(' · '),'| franja ctx:',(D.items.find(i=>i.tipo==='franja')||{}).ctx.length);
  ok(D.grupos&&D.grupos.length===1&&D.grupos[0].items.length===3&&D.grupos[0].ctx.length>=6,'los súper y el vacío se guardan como un grupo con lo que los rodea');
  ok((D.items.find(i=>i.tipo==='franja')||{ctx:[]}).ctx.length>=3,'la franja se guarda con las cajas de sus logos');
  await p.evaluate(()=>{_EST.lista=null;_estCargar();});
  await p.waitForFunction(()=>_EST.lista!==null,null,{timeout:8000});
  ok(await p.evaluate(()=>!_EST.lista.some(d=>d.nombre==='Neuquén prueba')),'la lista de diseños de Estudio no la mezcla');
  const id=fila.id;
  const estado=()=>p.evaluate(()=>{const L=_fgLgActivos(),b=L.find(e=>e.franjaBase);
    return {n:L.length,franja:b&&{x:Math.round(b.ox),y:Math.round(b.oy)},logosFr:L.filter(e=>e.franja&&!e.franjaBase&&e.tipo!=='txt').map(e=>e.img),
      coto:(e=>e&&({cx:Math.round(e.tx+e.tw/2),cy:Math.round(e.ty+e.th/2)}))(L.find(e=>/coto/i.test(e.t||''))),textos:L.filter(e=>e.tipo==='txt'&&!e.franja).map(e=>e.texto).sort(),
      vacios:L.filter(e=>!e.img&&e.tipo!=='txt'&&!e.franjaBase&&!e.franja&&e.w>0).length};});
  const abrirAplicar=async()=>{
    await p.evaluate((id)=>fgMgAplicar(id),id);
    await p.waitForSelector('#fg-mga-ov .fg-cf-b',{timeout:15000});
    return {txt:await p.textContent('#fg-mga-ov .fg-cf-b'),todo:await p.isVisible('#fg-mga-ok')};
  };
  // ── 1) mismo flyer: "Poner todo" ──
  await p.evaluate(()=>{_fgLg.list=[];_fgLg.sel=-1;_fgLgListo();});await p.waitForTimeout(600);
  let v=await abrirAplicar();
  ok(v.todo&&/Encontr. d.nde va todo/.test(v.txt),'en el mismo flyer encuentra todo y ofrece "Poner todo" ('+v.txt.trim().slice(0,50)+')');
  await p.click('#fg-mga-ok');await p.waitForTimeout(1500);
  let r=await estado();
  ok(r.franja&&Math.abs(r.franja.x-orig.franja.x)<4&&Math.abs(r.franja.y-orig.franja.y)<4&&r.logosFr.join()===marcasFr.join(),'la franja vuelve igual, con sus marcas en orden');
  ok(r.coto&&Math.abs(r.coto.cx-orig.coto.cx)<4&&Math.abs(r.coto.cy-orig.coto.cy)<4&&r.textos.join()===orig.textos.join()&&r.vacios===1,'Coto y Vea con sus días, y el lugar vacío');
  await p.waitForTimeout(600);await p.evaluate(()=>fgLgDeshacer());await p.waitForTimeout(200);
  ok((await estado()).n===0,'"Poner todo" se deshace de una vez');
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
  v=await abrirAplicar();
  console.log('   otro modelo:',v.txt.trim().slice(0,80));
  ok(v.todo,'con la grilla y la franja en otro lugar igual las encuentra (busca en todo el flyer)');
  if(v.todo){await p.click('#fg-mga-ok');}else{await p.click('#fg-mga-paso');await p.waitForSelector('#mg-paso');for(let k=0;k<6&&await p.evaluate(()=>!!_mgPaso);k++){await p.evaluate(()=>_mgPasoPoner());await p.waitForTimeout(500);}}
  await p.waitForTimeout(1500);
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
  v=await abrirAplicar();
  ok(!v.todo&&/Encontr. \d de \d/.test(v.txt),'si falta algo, dice cuánto encontró y propone ir de a una ('+v.txt.trim().slice(0,40)+')');
  await p.click('#fg-mga-paso');
  await p.waitForSelector('#mg-paso',{timeout:5000});
  const barra=()=>p.evaluate(()=>({que:(document.querySelector('#mg-paso .mg-pb-que')||{}).textContent,tit:(document.querySelector('#mg-paso .mg-pb-tit')||{}).textContent,sug:!!document.getElementById('mg-sug'),aprox:document.getElementById('mg-sug')&&document.getElementById('mg-sug').classList.contains('aprox')}));
  let b=await barra();
  console.log('   barra:',JSON.stringify(b));
  ok(/1 de 4/.test(b.que)&&/Franja/.test(b.tit)&&b.sug,'arranca por la franja: "1 de 4", con el recuadro marcado en el flyer');
  ok(b.aprox,'como no la encontró segura, el recuadro dice "¿Va acá?"');
  await p.screenshot({path:__dirname+'/capturas/t70_paso.png'});
  // la ubico con un recuadro arrastrado (en pantalla)
  await p.evaluate(()=>{const r=document.getElementById('cv').getBoundingClientRect(),a=_fgLgAPantalla(140,2000,1000,230);_mgPasoTocar(r.left+a.l,r.top+a.t,r.left+a.l+a.w,r.top+a.t+a.h,true);});
  await p.waitForTimeout(800);
  b=await barra();
  ok(/2 de 4/.test(b.que),'arrastrar un recuadro pone la franja ahí y pasa a la siguiente ('+b.que+')');
  r=await estado();ok(r.franja&&Math.abs(r.franja.y-2000)<4,'la franja quedó donde la marqué');
  // Coto: lo pongo tocando OTRO logo (Toledo, de la fila de abajo)
  await p.evaluate(()=>{const r=document.getElementById('cv').getBoundingClientRect(),a=_fgLgAPantalla(710,1468,0,0);_mgPasoTocar(r.left+a.l,r.top+a.t,r.left+a.l,r.top+a.t,false);});
  await p.waitForTimeout(800);
  r=await estado();
  ok(r.coto&&Math.abs(r.coto.cy-1468)<30,'tocar otro logo pone la marca sobre ese logo');
  // el siguiente lo salto, el último lo pongo con Enter
  b=await barra();
  await p.click('#mg-paso button[data-mp=saltar]');await p.waitForTimeout(300);
  b=await barra();ok(/4 de 4/.test(b.que),'"Saltar" pasa al siguiente');
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('Enter');await p.waitForTimeout(800);
  ok(await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')&&!document.getElementById('mg-sug')),'al terminar se va la barra y el recuadro');
  // × termina en el medio y lo puesto queda
  await p.evaluate(()=>{_fgLg.list=[];_fgLgListo();});
  await abrirAplicar();await p.click('#fg-mga-paso');await p.waitForSelector('#mg-paso');
  await p.evaluate(()=>_mgPasoPoner());await p.waitForTimeout(800);
  const n1=(await estado()).n;
  await p.click('#mg-paso button[data-mp=fin]');await p.waitForTimeout(300);
  ok(n1>0&&(await estado()).n===n1&&await p.evaluate(()=>!_mgPaso),'× termina y lo que ya se puso queda');
  // cambiar de flyer en el medio corta la colocación (no queda la barra colgada)
  await abrirAplicar();await p.click('#fg-mga-paso');await p.waitForSelector('#mg-paso');
  await p.evaluate(async()=>{const im=new Image();await new Promise(r=>{im.onload=r;im.src=window._mgImgOriginal.src;});window.baseImg=im;window._mgOtro=1;if(typeof redrawNow==='function')redrawNow();_fgLgMarcas();});
  ok(await p.evaluate(()=>!_mgPaso&&!document.getElementById('mg-paso')),'si cambia el flyer en el medio, la colocación se corta sola');
  // ── 4) una marca vencida queda en rojo ──
  await p.evaluate(()=>{window.baseImg=window._mgImgOriginal;_fgLg.list=[];_fgLg.src=_fgLgSrc();});
  await p.evaluate((img)=>{const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    window._promosCat=_promosCat.map(q=>q.imagen===img?Object.assign({},q,{fecha_hasta:f(-2),proximamente:false}):q);},marcasFr[0]);
  v=await abrirAplicar();await p.click(v.todo?'#fg-mga-ok':'#fg-mga-paso');await p.waitForTimeout(1500);
  for(let k=0;k<6&&await p.evaluate(()=>!!_mgPaso);k++){await p.evaluate(()=>_mgPasoPoner());await p.waitForTimeout(500);}
  const rojo=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca.vencida').length);
  ok(rojo>=1,'la marca que venció queda en rojo ('+rojo+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
