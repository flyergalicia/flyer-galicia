// Volver al editor de una franja ya armada sin marcarla de nuevo: botón "Editar
// franja" sobre el flyer, botón en la barrita del logo y clic en el modo Armar franja.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // armo una franja con 3 marcas, un tamaño cambiado y 4 columnas
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  const armada=await p.evaluate(async()=>{
    const st=_fgFrSt;let n=0;
    for(const x of st.res){if(n>=3)break;try{await _fgLgTraer(x.imagen);st.sel.push({img:x.imagen,t:x.titulo});n++;}catch(e){}}
    st.sel[1].k=1.3;st.cols=3;_fgFrLista();_fgFrSelPintar();_fgFrPreview();
    return st.sel.map(s=>s.img);
  });
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(300);
  const estado=()=>p.evaluate(()=>({abierta:!!document.getElementById('fg-fr-ov'),sel:_fgFrSt&&_fgFrSt.sel.map(s=>s.img),k:_fgFrSt&&_fgFrSt.sel[1]&&_fgFrSt.sel[1].k,cols:_fgFrSt&&_fgFrSt.cols,previa:!!(_fgFrSt&&_fgFrSt.previa),
    quitar:!!document.getElementById('fg-fr-quitar')}));
  const cerrar=async()=>{await p.evaluate(()=>{const x=document.getElementById('fg-fr-x');if(x)x.click();});await p.waitForTimeout(200);};
  // 1) el botón sobre el flyer
  const hay=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-fr-edit').length);
  ok(hay===1,'cada franja armada tiene su botón "Editar franja" ('+hay+')');
  await p.evaluate(()=>document.querySelector('#fg-lg-mk .fg-lg-fr-edit').click());
  await p.waitForSelector('#fg-fr-ov',{timeout:5000});
  let e=await estado();
  ok(e.abierta&&e.previa,'el botón abre el editor de esa franja (retoma, no es una franja nueva)');
  ok(e.sel.join()===armada.join()&&Math.abs(e.k-1.3)<0.001&&e.cols===3,'con las mismas marcas, el mismo orden, el tamaño y las columnas');
  ok(e.quitar,'trae "Volver la franja a como estaba" (es una franja ya armada)');
  await cerrar();
  // 2) desde la barrita de un logo de la franja
  await p.evaluate(()=>{_fgLg.sel=_fgLgActivos().findIndex(x=>x.franja&&!x.franjaBase);_fgLg.grupo=[];_fgLgListo();});
  const vis=await p.evaluate(()=>{const b=document.querySelector('#fg-lg-herr button[data-a=franja]');return !!b&&!b.hidden;});
  ok(vis,'la barrita de un logo de la franja trae "Editar franja"');
  await p.evaluate(()=>document.querySelector('#fg-lg-herr button[data-a=franja]').click());
  await p.waitForSelector('#fg-fr-ov',{timeout:5000});
  e=await estado();ok(e.abierta&&e.sel.join()===armada.join(),'y abre la misma franja');
  await cerrar();
  // un logo suelto (no de franja) no lo trae
  await p.evaluate(async()=>{let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}
    _fgLgPoner(_fgLgManual(140,2000,300,110),m.imagen,m.titulo,im);});
  const vis2=await p.evaluate(()=>{const b=document.querySelector('#fg-lg-herr button[data-a=franja]');return !!b&&!b.hidden;});
  ok(!vis2,'un logo suelto no trae "Editar franja"');
  // 3) en el modo Armar franja, un clic sobre la franja armada la abre
  await p.evaluate(()=>{_fgLg.sel=-1;_fgLgListo();fgFranjaModo(true);});
  const pt=await p.evaluate(()=>{const b=_fgLgActivos().find(x=>x.franjaBase),cv=document.getElementById('cv');
    let q=_fgLgAPantalla(b.ox+b.ow/2,b.oy+b.oh/2,0,0),r=cv.getBoundingClientRect(),yy=r.top+q.t;
    if(yy<80||yy>innerHeight-80){let el=cv.parentElement;while(el&&!(el.scrollHeight>el.clientHeight+4&&/auto|scroll/.test(getComputedStyle(el).overflowY)))el=el.parentElement;const dy=yy-innerHeight/2;if(el)el.scrollTop+=dy;else window.scrollBy(0,dy);}
    r=cv.getBoundingClientRect();q=_fgLgAPantalla(b.ox+b.ow/2,b.oy+b.oh/2,0,0);return {x:r.left+q.l,y:r.top+q.t};});
  await p.mouse.click(pt.x,pt.y);
  await p.waitForSelector('#fg-fr-ov',{timeout:5000}).catch(()=>{});
  e=await estado();
  ok(e.abierta&&e.previa&&e.sel.join()===armada.join(),'en el modo Armar franja, un clic sobre una franja armada la abre');
  ok(!(await p.evaluate(()=>_fgFr.modo)),'y sale del modo de marcar');
  // lo que se cambia ahí se aplica a esa misma franja (no duplica)
  await p.evaluate(()=>{_fgFrSt.sel.pop();_fgFrLista();_fgFrSelPintar();_fgFrPreview();});
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(300);
  const fin=await p.evaluate(()=>({bases:_fgLgActivos().filter(x=>x.franjaBase).length,logos:_fgLgActivos().filter(x=>x.franja&&!x.franjaBase&&x.tipo!=='txt').length}));
  ok(fin.bases===1&&fin.logos===2,'al volver a poner, queda UNA franja con las marcas nuevas ('+fin.bases+' franja, '+fin.logos+' logos)');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
