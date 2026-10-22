// 1) Deshacer / Rehacer dentro de la ventana de Armar franja.
// 2) Una marca de Promociones cuya promo venció se marca en rojo ("Vencida") en el
//    modo edición; "próximamente" y las vigentes no.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  // ── 1) deshacer en la ventana ──
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  const nsel=()=>p.evaluate(()=>_fgFrSt.sel.length);
  const botones=()=>p.evaluate(()=>({u:!document.getElementById('fg-fr-undo').disabled,r:!document.getElementById('fg-fr-redo').disabled}));
  ok(!(await botones()).u,'al abrir, Deshacer está apagado');
  // tildar 3 marcas
  for(let i=0;i<3;i++){
    await p.evaluate((i)=>{const it=[...document.querySelectorAll('#fg-fr-list .fg-lg-it:not(.fg-fr-on)')][0];it.click();},i);
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(700);
  ok(await nsel()===3,'se tildaron 3 marcas');
  ok((await botones()).u,'ahora Deshacer está prendido');
  await p.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('Control+z');await p.waitForTimeout(250);
  ok(await nsel()===0,'Ctrl+Z deshace las 3 tildadas juntas (un solo paso)');
  ok((await botones()).r,'Rehacer queda prendido');
  await p.keyboard.press('Control+y');await p.waitForTimeout(250);
  ok(await nsel()===3,'Ctrl+Y las vuelve a poner');
  // un tamaño
  await p.evaluate(()=>{_fgFrSt.elegido=0;_fgFrSt.grupo=[];_fgFrPreview();document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('+');await p.waitForTimeout(700);
  const k1=await p.evaluate(()=>_fgFrSt.sel[0].k);
  await p.click('#fg-fr-undo');await p.waitForTimeout(250);
  const k0=await p.evaluate(()=>_fgFrSt.sel[0].k||1);
  ok(Math.abs(k1-1.1)<0.001&&Math.abs(k0-1)<0.001,'el botón Deshacer vuelve el tamaño ('+k1+' → '+k0+')');
  // reordenar con un movimiento y deshacer
  const orden=await p.evaluate(()=>_fgFrSt.sel.map(s=>s.img).join());
  await p.evaluate(()=>{const st=_fgFrSt,it=st.sel.splice(0,1)[0];st.sel.push(it);_fgFrLista();_fgFrSelPintar();_fgFrPreview();});
  await p.waitForTimeout(700);
  await p.click('#fg-fr-undo');await p.waitForTimeout(250);
  ok((await p.evaluate(()=>_fgFrSt.sel.map(s=>s.img).join()))===orden,'deshacer también vuelve el orden');
  // con foco en un campo de texto, Ctrl+Z es del navegador
  const n3=await nsel();
  await p.evaluate(()=>{document.getElementById('fg-fr-q').focus();});
  await p.keyboard.press('Control+z');await p.waitForTimeout(250);
  ok(await nsel()===n3,'con el foco en el buscador, Ctrl+Z no toca la selección');
  await p.evaluate(()=>document.getElementById('fg-fr-x').click());
  // ── 2) marcas vencidas ──
  const r=await p.evaluate(async()=>{
    _fgLg.list=[];_fgLgListo();
    const ms=[];for(const x of _promosCat){if(ms.length>=3)break;if(!x.imagen||x.proximamente||_promoEstado(x.fecha_hasta,new Date())==='VENCIDA')continue;if(ms.some(m=>m[0].imagen===x.imagen))continue;try{ms.push([x,await _fgLgTraer(x.imagen)]);}catch(e){}}
    _fgLgPoner(_fgLgManual(140,2650,300,110),ms[0][0].imagen,ms[0][0].titulo,ms[0][1]);
    _fgLgPoner(_fgLgManual(520,2650,300,110),ms[1][0].imagen,ms[1][0].titulo,ms[1][1]);
    _fgLgPoner(_fgLgManual(900,2650,200,110),ms[2][0].imagen,ms[2][0].titulo,ms[2][1]);
    _fgLg.sel=-1;_fgLgListo();
    const antes=document.querySelectorAll('#fg-lg-mk .fg-lg-marca.vencida').length;
    const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    // la 1ª: todas sus promos vencidas; la 2ª: vencida pero con otra "próximamente"; la 3ª queda vigente
    window._promosCat=_promosCat.map(q=>Object.assign({},q));
    _promosCat.forEach(q=>{if(q.imagen===ms[0][0].imagen){q.fecha_hasta=f(-3);q.proximamente=false;}});
    _promosCat.forEach(q=>{if(q.imagen===ms[1][0].imagen){q.fecha_hasta=f(-3);q.proximamente=false;}});
    _promosCat.push(Object.assign({},ms[1][0],{id:999991,fecha_hasta:f(40),proximamente:true}));
    _promosCat.forEach(q=>{if(q.imagen===ms[2][0].imagen){q.fecha_hasta=f(20);q.proximamente=false;}});
    _fgLgListo();
    const marcas=[...document.querySelectorAll('#fg-lg-mk .fg-lg-marca')];
    return {antes,venc:marcas.map(m=>m.classList.contains('vencida')),txt:(marcas[0]||{}).dataset&&marcas[0].dataset.v,toast:(document.querySelector('.toast,#toast')||{}).textContent};
  });
  console.log('  ',JSON.stringify(r));
  ok(r.antes===0,'con todas vigentes no se marca nada');
  ok(r.venc[0]===true,'la marca con la promo vencida se marca en rojo');
  ok(r.venc[1]===false,'si hay otra promo "próximamente" de esa marca, no se marca');
  ok(r.venc[2]===false,'una vigente no se marca');
  ok(/Vencida/.test(r.txt||''),'el cartelito dice "Vencida"');
  // se ve en rojo en la pantalla y se va en la vista previa
  const col=await p.evaluate(()=>{const m=document.querySelector('#fg-lg-mk .fg-lg-marca.vencida');return getComputedStyle(m).borderTopColor;});
  ok(/217, 45, 32/.test(col),'el borde es rojo ('+col+')');
  await p.evaluate(()=>fgLgLimpio(true));
  ok(!(await p.isVisible('#fg-lg-capa')),'en la vista previa no se ve ninguna marca');
  await p.evaluate(()=>fgLgLimpio(false));
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
