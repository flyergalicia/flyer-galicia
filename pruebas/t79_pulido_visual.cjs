// Pulido del 23-oct (recorrida visual): menú del usuario sin píldoras naranjas,
// modo oscuro legible (opción elegida y logos de Promociones), botones apagados
// que se ven apagados, nombre de archivo sin "flyer" de relleno, Cambiar logos que
// no abre con el flyer sin cargar, Activas sin contadores en 0, beneficio en
// Promociones, tarjetas en el celular, "Descargar" en la pastilla del celular y
// la explicación de Base de datos plegada.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
// contraste WCAG entre dos colores "rgb(...)"
const CONTRASTE=`(function(a,b){function L(c){var m=c.match(/[\\d.]+/g).map(Number).slice(0,3).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2];}var x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);})`;
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});

  // 1) Menú del usuario: los rótulos son texto común
  const m=await p.evaluate(()=>{toggleUserMenu({stopPropagation(){}});
    const s=[...document.querySelectorAll('.hdr-dd-item span')].find(e=>/Modo oscuro/.test(e.textContent));
    const c=getComputedStyle(s);const r={bg:c.backgroundColor,tt:c.textTransform};closeUserMenu();return r;});
  ok(/rgba\(0, 0, 0, 0\)|transparent/.test(m.bg)&&m.tt==='none','menú del usuario: "Modo oscuro" sin píldora naranja ni mayúsculas ('+JSON.stringify(m)+')');

  // 4) Botón apagado
  const d=await p.evaluate(()=>{const b=document.getElementById('btn-dl-pdf');b.disabled=true;const o=getComputedStyle(b).opacity;b.disabled=false;return o;});
  ok(+d<=0.6,'un botón apagado se ve apagado (opacidad '+d+')');

  // 5) Nombre del archivo
  const n=await p.evaluate(()=>[buildFn('Flyer {empresa}',{empresa:''}),buildFn('Flyer {empresa}',{empresa:'ACME SA'}),buildFn('{empresa} - {asesor}',{empresa:'',nombre:''})]);
  ok(n[0]==='Flyer'&&n[1]==='Flyer ACME SA','nombre de archivo: sin empresa "Flyer", con empresa "Flyer ACME SA" ('+n.join(' | ')+')');
  ok(n[2]==='Flyer','nombre de archivo: si no queda nada, "Flyer" ('+n[2]+')');

  // 2) Oscuro: la opción elegida se lee
  await p.evaluate(()=>{toggleTheme();});await p.waitForTimeout(400);
  const o=await p.evaluate(CONTRASTE+';'+`(function(){var e=document.querySelector('#fg-optbar .fgo.on');var c=getComputedStyle(e).color;var b=getComputedStyle(e).backgroundColor;var k=(${CONTRASTE})(c,b);var lg=document.createElement('img');lg.className='promos-logo';document.body.appendChild(lg);var lb=getComputedStyle(lg).backgroundColor;lg.remove();toggleTheme();return {k:k,lb:lb};})()`);
  ok(o.k>=4.5,'modo oscuro: la opción elegida se lee (contraste '+o.k.toFixed(2)+')');
  ok(o.lb==='rgb(255, 255, 255)','modo oscuro: los logos de Promociones van sobre blanco ('+o.lb+')');

  // 6) Cambiar logos no abre sobre un flyer que no cargó (la opción 1 no tiene flyer)
  await p.evaluate(()=>switchFlyerOption(1));
  await p.waitForFunction(()=>window._fgOpt===1&&window._fgSinFlyer&&_fgSinFlyer.opt===1,null,{timeout:15000});
  const lg=await p.evaluate(()=>{fgLogosModo(true);return _fgLg.on;});
  ok(lg===false,'Cambiar logos no se abre con el cartel de "flyer no cargado"');
  await p.evaluate(()=>switchFlyerOption(9));
  await p.waitForFunction(()=>window._fgOpt===9&&_fgOptLista(9),null,{timeout:15000});
  const lg2=await p.evaluate(()=>{fgLogosModo(true);const r=_fgLg.on;fgLogosModo(false);return r;});
  ok(lg2===true,'con el flyer cargado, Cambiar logos abre igual que siempre');

  // 7 y 11) Promociones → Activas
  await p.evaluate(()=>{switchApp('promos');switchPromoTab('activas');});
  await p.selectOption('#promos-prov','BUENOS AIRES');
  await p.evaluate(()=>buscarPromosActivas());
  await p.waitForFunction(()=>document.querySelectorAll('.promos-table tbody tr').length>5,null,{timeout:15000});
  const a=await p.evaluate(()=>({chips:[...document.querySelectorAll('.promos-chip')].map(c=>c.textContent),orden:document.getElementById('promos-orden-sel').options[0].text,
    benef:[...document.querySelectorAll('.promos-benef')].slice(0,3).map(e=>e.textContent),filas:document.querySelectorAll('.promos-table tbody tr').length}));
  ok(!a.chips.some(t=>/No encontrada|Revisar|Fuera de la provincia/.test(t)),'Activas: sin contadores que siempre dan 0 ('+a.chips.join(' · ')+')');
  ok(a.orden==='Como vienen','Activas: el orden de siempre dice "Como vienen" ('+a.orden+')');
  ok(a.benef.length>0&&!/\.$/.test(a.benef[0]),'Activas: cada promo muestra qué da ('+a.benef.join(' | ')+')');

  // 13) En el celular: tarjetas que entran en la pantalla
  await p.setViewportSize({width:390,height:844});
  await p.waitForTimeout(300);
  const t=await p.evaluate(()=>{const tb=document.querySelector('.promos-table');const tr=tb.querySelector('tbody tr');const est=tr.querySelector('.pc-est').getBoundingClientRect();
    return {ancho:Math.round(tb.getBoundingClientRect().width),pantalla:document.documentElement.clientWidth,disp:getComputedStyle(tr).display,estDentro:est.right<=document.documentElement.clientWidth&&est.width>0};});
  ok(t.disp==='grid'&&t.ancho<=t.pantalla&&t.estDentro,'celular: Promociones en tarjetas que entran en la pantalla, con el estado a la vista ('+JSON.stringify(t)+')');

  // 10) Celular: "Descargar" en la pastilla toca el mismo botón de siempre
  await p.evaluate(()=>switchApp('flyer'));
  await p.waitForTimeout(300);
  const dl=await p.evaluate(()=>{const b=document.getElementById('btn-dl-pdf');let n=0;const f=()=>n++;b.addEventListener('click',f,true);
    window.__dlOrig=window.dlPDF;window.dlPDF=function(){};
    const x=document.querySelector('#mv-toggle [data-mv="dl"]');const vis=!!x&&x.getBoundingClientRect().width>0;if(x)x.click();
    b.removeEventListener('click',f,true);window.dlPDF=window.__dlOrig;
    return {vis,n,on:x&&x.classList.contains('on')};});
  ok(dl.vis&&dl.n===1&&!dl.on,'celular: la pastilla tiene "Descargar" y toca el botón "Descargar PDF" ('+JSON.stringify(dl)+')');
  await p.setViewportSize({width:1366,height:800});

  // 15) Base de datos: explicación plegada, botones arriba
  const bd=await p.evaluate(()=>{openMiPadron();const ds=[...document.querySelectorAll('details.bd-ayuda')];const sub=[...document.querySelectorAll('button')].find(b=>/Subir Excel/.test(b.textContent)&&b.offsetParent);
    const r={n:ds.length,cerrado:ds.every(x=>!x.open),botonY:sub?Math.round(sub.getBoundingClientRect().top):-1,ventanaY:Math.round(document.getElementById('bd-tit').getBoundingClientRect().top)};
    closeMiPadron();return r;});
  ok(bd.n===2&&bd.cerrado,'Base de datos: la explicación está en "¿Cómo funciona?", cerrada');
  ok(bd.botonY>0&&bd.botonY-bd.ventanaY<260,'Base de datos: "Subir Excel" queda arriba, sin párrafos antes ('+(bd.botonY-bd.ventanaY)+' px bajo el título)');

  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
