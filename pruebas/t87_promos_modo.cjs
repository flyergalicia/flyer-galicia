// Promociones de MODO (26-oct-2026, migración 035): se suman al catálogo de Galicia
// con el tilde "Incluir MODO" (prendido por defecto), sin las que ya están en Galicia
// (misma marca y mismo beneficio), con las mismas reglas de supermercados (días del %,
// puntito rojo), provincia y LOCALIDAD (traen sus locales), etiqueta "MODO", enlace a
// su ficha, logo desde el bucket ("modo/...") y Marcas vigiladas. Si la tabla no
// existe todavía, Promociones sigue andando sólo con Galicia.
const fs=require('fs');
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const png=fs.readFileSync(__dirname+'/datos/gofarma_180.png');
  nube.bin['317.png']=png;nube.bin['328.png']=png; // logos copiados al bucket (flyers/modo/...)
  const GEO=JSON.parse(fs.readFileSync(__dirname+'/datos/geo.json','utf8'));
  const locs=n=>(GEO.ubic.find(u=>u.nombre===n)||{localidades:[]}).localidades;
  const locM=locs('MENDOZA')[0],locM2=locs('MENDOZA')[1],locC=locs('CAPITAL FEDERAL')[0];
  const fila=(o)=>Object.assign({slug:'',subtitulo:'Supermercados',imagen:'',beneficio:'',tope:null,dias:null,canales:['instore'],solo_galicia:false,
    provincias:null,localidades:null,fecha_desde:'2026-10-01',fecha_hasta:'2027-12-31',proximamente:false,primera_vez:null},o);
  nube.modo=[
    fila({id:'a1',slug:'ypf-cuotas',titulo:'YPF',subtitulo:'Combustible',imagen:'modo/317.png',beneficio:'Hasta 6 cuotas sin interés',dias:'Todos los días'}),
    // la misma que Galicia ("Coto · 25% de ahorro."): no se suma
    fila({id:'a2',slug:'coto-oct26',titulo:'COTO',imagen:'coto_180.png',beneficio:'25% de reintegro',dias:'Martes',provincias:['BUENOS AIRES','CAPITAL FEDERAL'],fecha_hasta:'2026-10-31'}),
    // otra de Coto que Galicia no tiene: se suma y va en la misma tarjeta (mismo logo)
    fila({id:'a3',slug:'coto-30',titulo:'COTO',imagen:'coto_180.png',beneficio:'30% de reintegro',dias:'Jueves',provincias:['CAPITAL FEDERAL'],localidades:['CAPITAL FEDERAL|'+locC]}),
    // mismo % que Galicia pero otro día: es otra promo, se suma
    fila({id:'a7',slug:'coto-dom',titulo:'COTO',imagen:'coto_180.png',beneficio:'25% de reintegro',dias:'Domingos',provincias:['SANTA FE']}),
    fila({id:'a4',slug:'wico',titulo:'WICO Combustibles',subtitulo:'Combustible',beneficio:'15% de reintegro',dias:'Jueves'}),
    fila({id:'a5',slug:'atomo',titulo:'Supermercados Atomo Prueba',imagen:'modo/328.png',beneficio:'20% de reintegro',dias:'Miércoles',provincias:['MENDOZA'],localidades:['MENDOZA|'+locM]}),
    fila({id:'a6',slug:'farma-online',titulo:'Farmacia Online Prueba',subtitulo:'Salud y Bienestar',beneficio:'20% de reintegro',canales:['online'],provincias:[],localidades:[]}),
  ];
  const p=await abrir(browser,{rol:'admin'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length&&_promosCatM,null,{timeout:15000});
  // ── catálogo y reglas de súper ──
  const r=await p.evaluate(()=>{
    const m=t=>_promosCat.find(q=>_promoEsModo(q)&&q.titulo===t);
    const cotoG=_promosCat.find(q=>!_promoEsModo(q)&&q.titulo==='Coto'&&/25%/.test(q.beneficio||''));
    const atomo=m('Supermercados Atomo Prueba');
    return {
      def:_promosConModo,n:_promosCatM.length,ids:_promosCatM.map(q=>q.id).join(','),
      cotoRepetida:_promosCat.filter(q=>q.titulo.toLowerCase()==='coto'&&/25%/.test(q.beneficio||'')).length, // Galicia (martes) + MODO (domingos)
      ypf:!!m('YPF'),
      diasCoto:cotoG&&_promoDias(cotoG,_promoZona({prov:'CAPITAL FEDERAL'})),
      diasCotoBA:cotoG&&_promoDias(cotoG,_promoZona({prov:'BUENOS AIRES'})),
      atomoPct:_promoTienePct(atomo),atomoDias:_promoDias(atomo),
      atomoMendoza:_promoEnProvincia(atomo,'MENDOZA'),atomoNeuquen:_promoEnProvincia(atomo,'NEUQUEN'),
      url:_promoUrl(atomo),src:_promoLogoSrc(atomo.imagen),srcG:_promoLogoSrc('coto_180.png'),
      vig:_vigEstado({t:'YPF'},new Date()).e,
    };
  });
  console.log('  ',JSON.stringify(r));
  ok(r.def===true,'el tilde "Incluir MODO" arranca prendido');
  ok(r.n===6&&!/m:a2/.test(r.ids)&&r.cotoRepetida===2,'se suman 6 de MODO: el 25% de Coto de los martes, que ya está en Galicia, no se repite');
  ok(/m:a7/.test(r.ids),'un 25% de Coto otro día (domingos) es otra promo: se suma');
  ok(r.ypf,'YPF (que Galicia no tiene) entra');
  ok(/martes/i.test(r.diasCoto||'')&&/jueves/i.test(r.diasCoto||''),'en Capital, los días de Coto para el flyer suman el % de MODO ('+r.diasCoto+')');
  ok(!/jueves/i.test(r.diasCotoBA||''),'en Buenos Aires el 30% de MODO (sólo Capital) no cuenta ('+r.diasCotoBA+')');
  ok(r.atomoPct&&r.atomoDias==='Miércoles','un súper de MODO con % lleva puntito rojo y sus días (Miércoles)');
  ok(r.atomoMendoza&&!r.atomoNeuquen,'la provincia de una de MODO filtra igual que las de Galicia');
  ok(r.url==='https://www.modo.com.ar/promos/atomo','el enlace abre su ficha en MODO');
  ok(/\/storage\/v1\/object\/public\/flyers\/modo\/328\.png$/.test(r.src)&&/galicia\.ar/.test(r.srcG),'el logo de MODO sale del bucket y el de Galicia de galicia.ar');
  ok(r.vig==='ok','Marcas vigiladas: YPF (sólo en MODO) está vigente');

  // ── ventana de un logo: etiqueta, misma tarjeta, sin logo no aparece, y ponerla en el flyer ──
  const v=await p.evaluate(async()=>{
    Object.assign(_fgLgV,{q:'',rubro:'',prov:'',loc:'',soloPct:false,sinOnline:false,una:true});
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const it=()=>[...document.querySelectorAll('#fg-lg-list .fg-lg-it')];
    const out={tilde:!!document.getElementById('fg-lg-modo')&&document.getElementById('fg-lg-modo').checked};
    _fgLgV.q='ypf';_fgLgLista();
    const y=it().find(b=>b.querySelector('.fg-lg-it-t').textContent==='YPF');
    out.ypf=!!y;out.ypfTag=!!(y&&y.querySelector('.fg-pf-modo'));out.ypfImg=y&&y.querySelector('img').getAttribute('src');
    _fgLgV.prov='MENDOZA';_fgLgLista();out.ypfMza=it().length;_fgLgV.prov='';
    _fgLgV.q='wico';_fgLgLista();out.wico=it().length;
    _fgLgV.q='coto';_fgLgV.prov='CAPITAL FEDERAL';_fgPfPoblar('fg-lg',_fgLgV);_fgLgLista();
    const c=it().filter(b=>/coto/i.test(b.querySelector('.fg-lg-it-t').textContent));
    const mas=c[0]&&c[0].querySelector('.fg-pf-mas');
    out.cotoTarjetas=c.length;out.cotoTit=mas?mas.title:'';
    // apagar el tilde desde la ventana: YPF desaparece
    _fgLgV.q='ypf';_fgLgV.prov='';_fgPfPoblar('fg-lg',_fgLgV);_fgLgLista();
    const t=document.getElementById('fg-lg-modo');t.checked=false;t.dispatchEvent(new Event('change'));
    out.sinModo=it().length;out.ls=localStorage.getItem('fg_promos_modo');
    t.checked=true;t.dispatchEvent(new Event('change'));
    out.conModo=it().length;
    // elegir YPF: va al flyer
    const n0=_fgLgActivos().length;
    it().find(b=>b.querySelector('.fg-lg-it-t').textContent==='YPF').click();
    for(let i=0;i<60&&_fgLgActivos().length===n0;i++)await new Promise(x=>setTimeout(x,100));
    const e=_fgLgActivos().find(x=>x.img==='modo/317.png');
    out.puesta=!!e;out.vencida=e?_fgLgVencida(e):null;
    // con el tilde apagado (desde otra parte), el logo de MODO del flyer no queda "vencido"
    _promoSetModo(false);_fgLgVencIdx.cat=null;
    out.vencidaSinTilde=e?_fgLgVencida(e):null;out.vigSinTilde=_vigEstado({t:'YPF'},new Date()).e;
    _promoSetModo(true);
    return out;
  });
  console.log('  ',JSON.stringify(v));
  ok(v.tilde,'la ventana de un logo tiene el tilde "Incluir MODO", prendido');
  ok(v.ypf&&v.ypfTag&&/flyers\/modo\/317\.png/.test(v.ypfImg||''),'YPF aparece con la etiqueta MODO y su logo del bucket');
  ok(v.ypfMza===0,'con una provincia elegida, YPF (sin locales en MODO) no se ofrece');
  ok(v.wico===0,'una de MODO sin logo (WICO) no se ofrece para el flyer');
  ok(v.cotoTarjetas===1&&/30%/.test(v.cotoTit)&&/MODO/.test(v.cotoTit),'Coto es una sola tarjeta y su detalle incluye la de MODO');
  ok(v.sinModo===0&&v.ls==='0'&&v.conModo===1,'apagando el tilde desaparece YPF (y queda recordado); prendiéndolo vuelve');
  ok(v.puesta&&v.vencida===false,'elegir YPF lo pone en el flyer (logo de MODO) y no sale como vencida');
  ok(v.vencidaSinTilde===false&&v.vigSinTilde==='ok','con el tilde apagado, el logo de MODO del flyer sigue vigente (y en Marcas vigiladas)');

  // ── Promociones → Activas: provincia, localidad, etiqueta, enlace, tilde ──
  await p.evaluate(()=>{fgLogosModo(false);switchApp('promos');switchPromoTab('activas');});
  await p.selectOption('#promos-prov','MENDOZA');
  await p.evaluate(()=>buscarPromosActivas());
  await p.waitForFunction(()=>document.querySelectorAll('.promos-table tbody tr').length>3,null,{timeout:15000});
  const a=await p.evaluate(()=>{
    const filas=()=>[...document.querySelectorAll('.promos-table tbody tr')];
    const de=t=>filas().find(tr=>(tr.querySelector('.pc-promo')||{}).textContent.indexOf(t)===0);
    const at=de('Supermercados Atomo Prueba');
    return {tilde:!!document.getElementById('promos-modo-a')&&document.getElementById('promos-modo-a').checked,
      atomo:!!at,tag:!!(at&&at.querySelector('.promos-modo')),link:at&&at.querySelector('.promos-link').textContent,href:at&&at.querySelector('.promos-link').getAttribute('href'),
      dot:!!(at&&at.querySelector('.fg-pf-pct')),dias:at&&(at.querySelector('.promos-dias')||{}).textContent,
      wico:!!de('WICO'),wicoDonde:de('WICO')&&de('WICO').querySelector('.pc-donde').textContent,online:!!de('Farmacia Online Prueba'),buscarTilde:!!document.getElementById('promos-modo-b')};
  });
  console.log('  ',JSON.stringify(a));
  ok(a.tilde&&a.buscarTilde,'Activas y Buscar tienen el tilde "Incluir MODO"');
  ok(a.atomo&&a.tag&&a.link==='Ver en MODO'&&/modo\.com\.ar\/promos\/atomo$/.test(a.href||''),'en Mendoza aparece el súper de MODO con su etiqueta y "Ver en MODO"');
  ok(a.dot&&a.dias==='Miércoles','con el puntito rojo y sus días, como un súper de Galicia');
  ok(!a.wico&&a.online,'con una provincia elegida, una de MODO sin locales (WICO) no aparece; una online sí');
  // localidad: la de Atomo sí, otra no
  const lc=await p.evaluate(async([l1,l2])=>{
    const tiene=()=>_promosFilasVisibles().some(v=>v.r.promo&&v.r.promo.titulo==='Supermercados Atomo Prueba');
    const esperar=async()=>{for(let i=0;i<50&&(_promosLoc&&!_promosLocIds);i++)await new Promise(x=>setTimeout(x,100));await new Promise(x=>setTimeout(x,50));};
    _promoSetLocalidad(l1);await esperar();const en1=tiene();
    _promoSetLocalidad(l2);await esperar();const en2=tiene();
    _promoSetLocalidad('');await esperar();
    return {en1,en2};
  },[locM,locM2]);
  console.log('  ',JSON.stringify(lc));
  ok(lc.en1&&!lc.en2,'el filtro de localidad usa los locales de MODO ('+locM+' sí, '+locM2+' no)');
  // MODO escribe las ciudades a su manera (revisión del 26-oct con los datos reales: 29% no coincidía)
  const li=await p.evaluate(()=>({
    tuc:_promoLocIgual('SAN MIGUEL DE TUCUMAN','TUCUMAN','TUCUMAN'),lanus:_promoLocIgual('LANUS OESTE','LANUS','BUENOS AIRES'),
    roca:_promoLocIgual('GENERAL ROCA','GRAL ROCA','RIO NEGRO'),caba:_promoLocIgual('PALERMO','CABA','CAPITAL FEDERAL'),
    no:_promoLocIgual('MAR DEL PLATA','BAHIA BLANCA','BUENOS AIRES'),corta:_promoLocIgual('VILLA SAN JOSE','SAN','ENTRE RIOS'),
    sinCiudades:_promoEnLocalidad({origen:'modo',provincias:['MENDOZA'],localidades:[]},'MENDOZA','GODOY CRUZ',{}),
  }));
  console.log('  ',JSON.stringify(li));
  ok(li.tuc&&li.lanus&&li.roca&&li.caba,'localidad: Tucumán, Lanús, "Gral Roca" y "CABA" coinciden con los nombres de Galicia');
  ok(!li.no&&!li.corta,'localidad: ciudades distintas (o una palabra corta suelta) no coinciden');
  ok(li.sinCiudades,'una de MODO con provincia pero sin ciudades no se esconde al elegir una localidad');
  const neu=await p.evaluate(()=>{
    _promoSetProvincia('NEUQUEN');
    const at=_promosFilasVisibles().some(v=>v.r.promo&&v.r.promo.titulo==='Supermercados Atomo Prueba');
    const c=document.getElementById('promos-modo-a');c.checked=false;c.dispatchEvent(new Event('change'));
    const sinModo=_promosFilasVisibles().filter(v=>_promoEsModo(v.r.promo)).length;
    c.checked=true;c.dispatchEvent(new Event('change'));
    const conModo=_promosFilasVisibles().filter(v=>_promoEsModo(v.r.promo)).length;
    return {at,sinModo,conModo};
  });
  console.log('  ',JSON.stringify(neu));
  ok(!neu.at,'en Neuquén el súper de Mendoza no aparece');
  ok(neu.sinModo===0&&neu.conModo>0,'el tilde de Activas saca y vuelve a poner las de MODO');

  // ── Buscar: YPF se encuentra; Coto 25% una sola vez ──
  const b=await p.evaluate(()=>{
    switchPromoTab('buscar');_promoSetProvincia('');
    document.getElementById('promos-marcas').value='YPF\nCoto';validarPromos();
    const R=_promosResultados||[];
    const ypf=R.find(x=>x.marca==='YPF');
    const fila=[...document.querySelectorAll('.promos-table tbody tr')].find(tr=>/^YPF/.test((tr.querySelector('.pc-promo')||{}).textContent||''));
    const sinDato=fila&&fila.querySelector('.pc-donde').textContent;
    _promoSetProvincia('MENDOZA');const ypfMza=ypf&&ypf.estado;_promoSetProvincia('');
    return {sinDato,ypfMza,ypf:ypf&&ypf.promo&&ypf.promo.titulo,ypfModo:!!(ypf&&_promoEsModo(ypf.promo)),ypfEstado:ypf&&ypf.estado,
      coto25:R.filter(x=>x.marca==='Coto'&&x.promo&&/25%/.test(x.promo.beneficio||'')&&/martes/i.test(x.promo.dias||'')).length,
      coto30:R.filter(x=>x.marca==='Coto'&&x.promo&&/30%/.test(x.promo.beneficio||'')).length};
  });
  console.log('  ',JSON.stringify(b));
  ok(b.ypf==='YPF'&&b.ypfModo&&b.ypfEstado!=='NO_ENCONTRADA','Buscar encuentra YPF en MODO');
  ok(b.sinDato==='Sin dato'&&b.ypfMza==='FUERA_PROV','sin provincia YPF dice "Sin dato" en Dónde; con una provincia elegida queda fuera');
  ok(b.coto25===1&&b.coto30===1,'Coto trae su 25% de los martes una sola vez y además el 30% de MODO');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();

  // ── sin la tabla de MODO (migración sin aplicar): Promociones anda igual ──
  nube.modoFalla=true;
  const p2=await abrir(browser,{rol:'admin'});
  await p2.click('#fg-lg-btn');
  await p2.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const f=await p2.evaluate(()=>({n:_promosCat.length,m:(_promosCatM||[]).length,g:_promosCatG===_promosCat||_promosCatTodo===_promosCat}));
  ok(f.n>100&&f.m===0,'sin la tabla de MODO se ve el catálogo de Galicia ('+f.n+')');
  ok(p2.errores.length===0,'y sin errores de JavaScript');
  await p2.context().close();
};
