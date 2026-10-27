// Varias provincias (27-oct): en cualquier desplegable de Provincia un clic elige
// una (como siempre) y Shift + clic (o el "+") suma otra. Con varias se ven las
// promos de cualquiera de ellas, no hay localidad y el nombre dice "X y Y".
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const fila=(p,v)=>p.locator('.prov-pop .prov-it[data-v="'+v+'"]');
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.waitForFunction(()=>typeof _provSel==='function');
  // ── Promociones → Activas ──
  await p.evaluate(()=>{switchApp('promos');switchPromoTab('activas');});
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length&&document.querySelectorAll('#promos-prov option').length>3,null,{timeout:15000});
  await p.click('#promos-prov');
  ok(await p.isVisible('.prov-pop'),'tocar Provincia abre la lista propia (no la del navegador)');
  await fila(p,'BUENOS AIRES').click();
  const uno=await p.evaluate(()=>({v:document.getElementById('promos-prov').value,prov:_promosProv,abierta:!!document.querySelector('.prov-pop')}));
  ok(uno.v==='BUENOS AIRES'&&uno.prov==='BUENOS AIRES'&&!uno.abierta,'un clic elige una provincia y cierra la lista');
  await p.evaluate(()=>buscarPromosActivas());
  const n1=await p.evaluate(()=>_promosResultados.length);
  await p.click('#promos-prov');
  await fila(p,'CAPITAL FEDERAL').click({modifiers:['Shift']});
  const dos=await p.evaluate(()=>({v:document.getElementById('promos-prov').value,abierta:!!document.querySelector('.prov-pop'),
    txt:document.getElementById('promos-prov').selectedOptions[0].textContent,
    on:[...document.querySelectorAll('.prov-pop .prov-it.on')].map(x=>x.dataset.v),
    loc:document.getElementById('promos-loc').disabled,locTxt:document.getElementById('promos-loc').options[0].textContent}));
  console.log('  ',JSON.stringify(dos));
  ok(dos.v==='BUENOS AIRES;CAPITAL FEDERAL'&&dos.abierta,'Shift + clic suma la segunda y la lista queda abierta');
  ok(dos.txt==='Buenos Aires y Capital Federal','el desplegable dice "Buenos Aires y Capital Federal"');
  ok(dos.on.length===2,'en la lista quedan las dos con tilde');
  ok(dos.loc&&/varias/.test(dos.locTxt),'con varias, Localidad queda apagada y lo explica');
  await p.keyboard.press('Escape');
  const r=await p.evaluate(()=>{
    buscarPromosActivas();
    const R=_promosResultados.map(x=>x.promo);
    const en=(q,pv)=>_promoEnProvincia(q,pv);
    return {n:R.length,todasEn:R.every(q=>en(q,'BUENOS AIRES')||en(q,'CAPITAL FEDERAL')),
      soloCap:R.filter(q=>!en(q,'BUENOS AIRES')).length,
      esperado:_promosCat.filter(q=>en(q,'BUENOS AIRES')||en(q,'CAPITAL FEDERAL')).length};
  });
  console.log('  ',JSON.stringify(r),'sólo Buenos Aires:',n1);
  ok(r.n===r.esperado&&r.todasEn,'Activas muestra las promos de cualquiera de las dos ('+r.n+')');
  ok(r.n>=n1,'con las dos hay al menos tantas como con una ('+n1+' → '+r.n+')');
  // sacar una con el "−"
  await p.click('#promos-prov');
  await fila(p,'CAPITAL FEDERAL').locator('.prov-mas').click();
  ok(await p.evaluate(()=>_promosProv)==='BUENOS AIRES','el "−" saca esa provincia y queda la otra');
  await fila(p,'').click();
  ok(await p.evaluate(()=>_promosProv==='')&&!(await p.isVisible('.prov-pop')),'"Todas las provincias" vuelve a todas');
  // teclado: flechas + Enter
  await p.focus('#promos-prov');await p.keyboard.press('ArrowDown');
  ok(await p.isVisible('.prov-pop'),'con el teclado (flecha abajo) también se abre');
  await p.keyboard.press('Escape');
  // ── Armar franja ──
  await p.evaluate(()=>{switchApp('flyer');});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.click('#fg-fr-prov');await fila(p,'NEUQUEN').click();
  await p.click('#fg-fr-prov');await fila(p,'RIO NEGRO').click({modifiers:['Shift']});
  await p.keyboard.press('Escape');
  ok(!(await p.isVisible('.prov-pop'))&&await p.isVisible('#fg-fr-ov'),'Escape cierra la lista de provincias y no la ventana de Armar franja');
  const fr=await p.evaluate(()=>{
    const st=_fgFrSt,L=_fgPfFiltrar(st,function(){}).lista;
    return {prov:st.prov,loc:document.getElementById('fg-fr-loc').hidden,n:L.length,
      ok:L.every(q=>_promoEnProvincia(q,'NEUQUEN')||_promoEnProvincia(q,'RIO NEGRO')),
      rn:L.filter(q=>!_promoEnProvincia(q,'NEUQUEN')).length,info:document.getElementById('fg-fr-info').textContent,
      zona:!!_promoZona(st)};
  });
  console.log('  ',JSON.stringify(fr));
  ok(fr.prov==='NEUQUEN;RIO NEGRO'&&fr.ok&&fr.n>0,'Armar franja: Neuquén y Río Negro juntas ('+fr.n+' marcas)');
  ok(fr.loc,'Armar franja: con varias se esconde Localidad');
  ok(fr.zona,'el puntito y los días del súper miran las dos provincias');
  await p.screenshot({path:__dirname+'/capturas/t90_franja.png'});
  await p.click('#fg-fr-no');
  // ── Ventana de un logo: recuerda las dos ──
  await p.evaluate(()=>{_fgLgV.prov='NEUQUEN;RIO NEGRO';_fgLgAbrir(_fgLgManual(140,2650,300,110));});
  await p.waitForSelector('#fg-lg-ov',{timeout:10000});
  const lg=await p.evaluate(()=>({v:document.getElementById('fg-lg-prov').value,txt:document.getElementById('fg-lg-prov').selectedOptions[0].textContent}));
  ok(lg.v==='NEUQUEN;RIO NEGRO'&&lg.txt==='Neuquen y Rio Negro'||lg.txt==='Neuquén y Río Negro'||/Neuqu.n y R.o Negro/.test(lg.txt),'la ventana de un logo abre con las dos ("'+lg.txt+'")');
  await p.click('#fg-lg-prov');
  await p.screenshot({path:__dirname+'/capturas/t90_logo.png'});
  await fila(p,'MENDOZA').click();
  ok(await p.evaluate(()=>_fgLgV.prov)==='MENDOZA','un clic sin Shift reemplaza las dos por una');
  await p.click('#fg-lg-x');
  // ── Marcas guardadas: el nombre con varias ──
  const mg=await p.evaluate(()=>({txt:_provNombre('BUENOS AIRES;CAPITAL FEDERAL;CORDOBA'),uno:_provNombre('CORDOBA'),
    fuera:_fgLgFueraProv({img:'zzz-no-existe.png',prov:'BUENOS AIRES;CAPITAL FEDERAL'})}));
  ok(mg.txt==='Buenos Aires, Capital Federal y Cordoba'&&mg.uno==='Cordoba','nombres: "A, B y C" y una sola como antes');
  // Activas: el + elige en pantalla completa con las dos
  await p.close();
};
