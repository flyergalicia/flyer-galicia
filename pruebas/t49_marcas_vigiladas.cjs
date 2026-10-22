// Marcas vigiladas: cargarlas desde Buscar, ver su estado y sumarlas al publicar desde Estudio
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:20000}).catch(async()=>{await p.evaluate(()=>new Promise(r=>loadPromosCatalogo(r)));});
  // armo tres marcas de prueba: una vigente, una que vence en 3 días y una vencida (modifico el catálogo en memoria)
  const M=await p.evaluate(()=>{
    const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    const vivas=_promosCat.filter(x=>x.imagen&&x.fecha_hasta&&!x.proximamente).slice(0,3);
    vivas[0].fecha_hasta=f(40);vivas[1].fecha_hasta=f(3);vivas[2].fecha_hasta=f(-5);
    return vivas.map(x=>x.titulo);
  });
  await p.evaluate(()=>{switchApp('promos');});await p.waitForTimeout(300);
  await p.evaluate((ms)=>{switchPromoTab('buscar');document.getElementById('promos-marcas').value=ms.join('\n');},M).catch(()=>{});
  await p.evaluate(()=>{validarPromos();});await p.waitForTimeout(800);
  ok(await p.isVisible('#vig-bar'),'en Buscar el admin ve "Vigilar estas marcas en…"');
  await p.selectOption('#vig-opt','9');await p.click('#vig-btn');await p.waitForSelector('#fg-cf-ok');await p.click('#fg-cf-ok');await p.waitForTimeout(800);
  const v=nube.json['_vigilar.json'];
  console.log('  _vigilar.json:',JSON.stringify(v&&v.opciones));
  ok(v&&v.opciones&&v.opciones['9']&&v.opciones['9'].length>=2,'se guardan las marcas encontradas en el flyer elegido');
  // simulo vencimientos en el catálogo cargado: la 1ª vence en 3 días y la 2ª ya venció; sumo una 3ª vigente
  await p.evaluate((L)=>{
    const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    _promosCat.filter(x=>x.imagen===L[0].img).forEach(x=>{x.fecha_hasta=f(3);});
    _promosCat.filter(x=>x.imagen===L[1].img).forEach(x=>{x.fecha_hasta=f(-5);});
  },v.opciones['9']);
  const viva=await p.evaluate(()=>{const hoy=new Date(),f=d=>{const x=new Date(hoy.getTime()+d*86400000);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};const x=_promosCat.find(p=>p.imagen&&!p.proximamente&&p.fecha_hasta&&p.fecha_hasta>f(30));return {m:x.titulo,t:x.titulo,img:x.imagen,origen:'manual'};});
  nube.json['_vigilar.json'].opciones['9'].push(viva);
  // estado en Admin → Config → Marcas vigiladas
  await p.evaluate(()=>{openAdminPanel&&openAdminPanel();switchAdminTab(null,'vigiladas');});
  await p.waitForSelector('#vig-body .vig-fila',{timeout:10000});
  const est=await p.$$eval('#vig-body .vig-fila',x=>x.map(f=>f.querySelector('.vig-m').textContent+' → '+f.querySelector('.vig-e').textContent));
  console.log('  estados:',JSON.stringify(est));
  ok(est.some(s=>/Vigente/.test(s))&&est.some(s=>/Vence en 3 d/.test(s))&&est.some(s=>/Sin promo vigente/.test(s)),'muestra Vigente, Vence en 3 días y Sin promo vigente');
  await p.screenshot({path:__dirname+'/capturas/t49_vigiladas.png'});
  // quitar una
  const n0=nube.json['_vigilar.json'].opciones['9'].length;
  await p.click('#vig-body .vig-x >> nth=0');await p.waitForTimeout(800);
  ok(nube.json['_vigilar.json'].opciones['9'].length===n0-1,'la × deja de vigilar esa marca');
  // función de Estudio: los logos de un diseño publicado se suman a la opción nueva
  const r=await p.evaluate(async()=>{
    const m=_promosCat.find(x=>x.imagen);
    await _vigSumarEstudio(9,10,[{img:m.imagen,t:m.titulo},{tipo:'txt',texto:'x'},{img:'pc:abc',t:'subido'},{img:'orig:1,2,3,4',t:'Logo del flyer'}]);
    const d=await _vigLeer();return d.opciones['10'];
  });
  console.log('  opción nueva:',JSON.stringify(r));
  ok(r&&r.some(x=>x.origen==='estudio')&&!r.some(x=>/^pc:|^orig:/.test(x.img))&&r.some(x=>x.origen==='manual'),'al publicar suma los logos de Promociones del diseño (sin subidos ni del flyer) y hereda las manuales');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
