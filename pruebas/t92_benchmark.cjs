// Benchmark (27-oct-2026, migraciones 039/040): solapa aparte para comparar Galicia con BBVA, Macro,
// Supervielle y Santander. Se comprueba que:
//  - sólo la ve quien tiene la facultad (el admin sí; un asesor no), y que el código y los datos
//    se piden recién al abrirla (el armador no se entera de que existe);
//  - gana el que más DEVUELVE en la compra de referencia (tope incluido), y cambiar la compra
//    recalcula los ganadores;
//  - filtros de provincia, segmento y tarjeta; cuotas aparte; vista por marca y por día;
//  - si las tablas no existen o no hay datos, la pantalla lo dice y no se rompe;
//  - "Actualizar ahora" (admin) pide un banco por vez y después las marcas.
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const fila=(o)=>Object.assign({slug:'',rubro:'Supermercados',beneficio:'',pct:null,tope:null,tope_por:'month',cuotas:0,dias:'Todos los días',dias_n:[],
  credito:true,debito:false,emisores:['visa','master'],canales:['instore'],segmento:null,segmento_txt:null,provincias:null,
  fecha_desde:'2026-10-01',fecha_hasta:'2027-12-31',proximamente:false},o,{marca_clave:(o.titulo||'').toLowerCase().replace(/[^a-z0-9]/g,''),id:o.banco+':'+o.k});
module.exports=async(browser)=>{
  nube.bench=[
    // Supermercados, compra de referencia $150.000: Galicia 25% con tope $10.000 = $10.000; BBVA 20% tope $30.000 = $30.000 → gana BBVA
    fila({k:'g1',banco:'galicia',titulo:'Coto',pct:25,tope:10000,dias:'Martes',dias_n:[1],provincias:['CAPITAL FEDERAL','BUENOS AIRES']}),
    fila({k:'b1',banco:'bbva',titulo:'Coto',pct:20,tope:30000,provincias:['CAPITAL FEDERAL']}),
    fila({k:'m1',banco:'macro',titulo:'Coto',pct:30,tope:5000,segmento:'premium',segmento_txt:'Macro Selecta',provincias:['CAPITAL FEDERAL']}),
    // Farmacia ($40.000): Galicia 30% tope 15.000 = $12.000; BBVA 20% tope 5.000 = $5.000 → gana Galicia
    fila({k:'g2',banco:'galicia',rubro:'Salud y Bienestar',titulo:'Farmacity',pct:30,tope:15000,dias:'Lunes',dias_n:[0],provincias:[]}),
    fila({k:'b2',banco:'bbva',rubro:'Salud y Bienestar',titulo:'Farmacity',pct:20,tope:5000,dias:'Lunes',dias_n:[0],provincias:[]}),
    // Combustible: sólo BBVA, y con cuotas
    fila({k:'b3',banco:'bbva',rubro:'Combustible',titulo:'YPF',pct:10,tope:8000,cuotas:6,debito:true,credito:false,emisores:[],provincias:null}),
    // una vencida y una por empezar: no cuentan
    fila({k:'g3',banco:'galicia',titulo:'Vencida SA',pct:50,tope:99999,fecha_hasta:'2020-01-01',provincias:[]}),
    fila({k:'g4',banco:'galicia',titulo:'Proxima SA',pct:50,tope:99999,proximamente:true,fecha_desde:'2027-06-01',provincias:[]}),
    // Santander: sólo cuotas (sin %)
    fila({k:'s1',banco:'santander',titulo:'Fravega',rubro:'Electrónica',pct:null,cuotas:12,provincias:[]}),
  ];
  nube.benchMarcas=[{marca_clave:'ypf',provincias:['BUENOS AIRES'],localidades:[],imagen:''},{marca_clave:'coto',provincias:['CAPITAL FEDERAL'],localidades:[],imagen:'modo/9.png'}];
  nube.benchMeta=[{banco:'galicia',last_sync_at:new Date().toISOString(),total:4,error:null},{banco:'bbva',last_sync_at:new Date(Date.now()-20*86400000).toISOString(),total:3,error:null},
    {banco:'macro',last_sync_at:new Date().toISOString(),total:1,error:'MODO respondió 500'}];
  nube.benchHist=[];
  const tarj=(o)=>Object.assign({id:'t'+Math.random().toString(36).slice(2,8),paquete:'',orden:0,pases_anio:null,salas_vip:'',fast_pass:'',acompanantes:'',parking:'',seguros:'',puntos:'',costo:'',vigencia:'',fuente_url:'',confianza:'oficial',revisada:'2026-10-28',notas:''},o);
  nube.benchTarj=[
    tarj({id:'tg1',banco:'galicia',tarjeta:'Visa Signature',paquete:'Éminent',orden:10,pases_anio:4,salas_vip:'4 pases por año a salones Visa Airport Companion.',fast_pass:'4 Fast Pass por año.',fuente_url:'https://www.galicia.ar/personas/tarjetas/beneficios-viajes'}),
    tarj({id:'tb1',banco:'bbva',tarjeta:'Visa Signature + Mastercard Black',paquete:'Black+ All',orden:10,pases_anio:20,salas_vip:'Hasta 20 pases por año: 10 Sala VIP BBVA, 8 Visa Airport Companion y 2 Mastercard.',costo:'Mantenimiento mensual $188.000.',fuente_url:'https://www.bbva.com.ar/personas/productos/paquetes/black-all.html'}),
    tarj({id:'tm1',banco:'macro',tarjeta:'Visa Signature',paquete:'Selecta',orden:10,pases_anio:10,salas_vip:'10 pases por año. Desde el 18/11/2026: 6 pases por año calendario.',vigencia:'Hasta el 17/11/2026; desde el 18/11/2026, 6 pases.',fuente_url:'javascript:alert(1)',notas:'<img src=x onerror=alert(2)>'}),
    tarj({id:'ts1',banco:'supervielle',tarjeta:'Mastercard Black',paquete:'Identité',orden:20,pases_anio:null,salas_vip:'La página de la tarjeta no menciona salas VIP.',confianza:'sin_dato'})];

  // ── un asesor sin la facultad: no ve la solapa y no se piden las tablas ──
  const pa=await abrir(browser,{rol:'asesor'});
  const a=await pa.evaluate(()=>({can:_can('benchmark'),tab:getComputedStyle(document.getElementById('apptab-benchmark')).display,
    script:!!document.querySelector('script[src*="benchmark"]'),def:_FAC_DEF.asesor.benchmark,defV:_FAC_DEF.vip.benchmark,defH:_FAC_DEF.hunter.benchmark}));
  ok(a.can===false&&a.tab==='none','un asesor no ve la solapa Benchmark');
  ok(a.def===false&&a.defV===false&&a.defH===false,'la facultad viene apagada para todos los perfiles');
  ok(!a.script&&!(nube.pedidosBench||[]).length,'sin abrirla, no se baja benchmark.js ni se pide ninguna tabla (el armador no se entera)');
  await pa.context().close().catch(()=>{});

  // ── el admin ──
  nube.pedidosBench=[];
  const p=await abrir(browser,{rol:'admin'});
  const t0=await p.evaluate(()=>({tab:getComputedStyle(document.getElementById('apptab-benchmark')).display,script:!!document.querySelector('script[src*="benchmark"]'),
    esFn:typeof window.benInit==='function'}));
  ok(t0.tab!=='none','el admin ve la solapa Benchmark');
  ok(!t0.script&&!t0.esFn&&!(nube.pedidosBench||[]).length,'antes de abrirla no hay código ni pedidos de datos');
  await p.evaluate(()=>switchApp('benchmark'));
  await p.waitForFunction(()=>window.BEN&&BEN.rows&&BEN.rows.length&&document.querySelector('#ben-root table.ben-t'),null,{timeout:15000});
  const r1=await p.evaluate(()=>{
    const f=BEN_BANCOS.map(b=>b[0]);
    const lista=benFiltradas();
    const sup=lista.filter(x=>x.rubro==='Supermercados'),far=lista.filter(x=>x.rubro==='Salud y Bienestar');
    const mej=(l,b)=>benMejor(l.filter(x=>x.banco===b));
    return {n:BEN.rows.length,vig:lista.length,
      supG:mej(sup,'galicia').v,supB:mej(sup,'bbva').v,supM:mej(sup,'macro').v,farG:mej(far,'galicia').v,farB:mej(far,'bbva').v,
      vencidaFuera:!lista.some(x=>x.titulo==='Vencida SA'),proxFuera:!lista.some(x=>x.titulo==='Proxima SA'),
      gana:document.querySelectorAll('#ben-root .ben-c.gana').length,
      chips:[...document.querySelectorAll('.ben-chip')].map(c=>c.textContent+(c.classList.contains('vieja')?'|vieja':''))};
  });
  console.log('  ',JSON.stringify(r1));
  ok(r1.vencidaFuera&&r1.proxFuera&&r1.vig===7,'las vencidas y las que todavía no empezaron no cuentan (7 vigentes)');
  ok(r1.supG===10000&&r1.supB===30000&&r1.supM===5000,'devuelve = el menor entre compra × % y el tope (súper $150.000: 10.000 / 30.000 / 5.000)');
  ok(r1.farG===12000&&r1.farB===5000,'farmacia ($40.000): Galicia 12.000, BBVA 5.000 (el tope de BBVA lo limita)');
  ok(r1.chips.some(c=>/BBVA.*vieja/.test(c))&&!r1.chips.some(c=>/Galicia.*vieja/.test(c)),'una fuente de hace 20 días se marca como vieja');
  ok(r1.chips.some(c=>/Macro.*⚠/.test(c)),'una fuente con error se avisa');
  ok((nube.pedidosBench||[]).some(x=>/promos_bench_cache/.test(x)),'las tablas se piden recién al abrir la solapa');

  // ── resumen por rubro: gana BBVA en súper, Galicia en farmacia ──
  const r2=await p.evaluate(()=>{
    const filas=[...document.querySelectorAll('#ben-root table.ben-t tbody tr')];
    const fila=n=>filas.find(f=>f.querySelector('td strong')&&f.querySelector('td strong').textContent===n);
    const gana=f=>f?[...f.querySelectorAll('td')].filter(td=>td.querySelector('.ben-c.gana')).map((td,i)=>td.className.indexOf('gal')>=0?'galicia':'otro'):[];
    const txt=document.querySelector('.ben-resumen').textContent;
    return {sup:gana(fila('Supermercados')),far:gana(fila('Salud y Bienestar')),resumen:txt,
      cuotas:[...document.querySelectorAll('#ben-root table.ben-t tbody tr td')].map(t=>t.textContent).filter(t=>/12 cuotas/.test(t)).length>0};
  });
  console.log('  ',JSON.stringify(r2));
  ok(r2.sup.length===1&&r2.sup[0]==='otro','en Supermercados el ganador es BBVA, no Galicia');
  ok(r2.far.length===1&&r2.far[0]==='galicia','en Farmacia gana Galicia');
  ok(/Galicia devuelve más en 1/.test(r2.resumen)&&/BBVA en 1/.test(r2.resumen),'el resumen cuenta rubros ganados y perdidos contra BBVA: '+r2.resumen);
  ok(r2.cuotas,'las cuotas sin interés se comparan aparte (Santander: 12 cuotas)');

  await p.setViewportSize({width:1400,height:900});
  await p.screenshot({path:__dirname+'/capturas/bm1_rubro.png'});
  // ── compra de referencia: con $20.000 de súper, Galicia pasa a ganar (5.000 contra 4.000) ──
  await p.evaluate(()=>benRef('Supermercados',20000));
  const r3=await p.evaluate(()=>{
    const s=benFiltradas().filter(x=>x.rubro==='Supermercados');
    return {g:benMejor(s.filter(x=>x.banco==='galicia')).v,b:benMejor(s.filter(x=>x.banco==='bbva')).v,ls:localStorage.getItem('fg_bench_ref')};
  });
  ok(r3.g===5000&&r3.b===4000,'con una compra de $20.000 el ganador se recalcula (Galicia 5.000, BBVA 4.000)');
  ok(/20000/.test(r3.ls||''),'la compra de referencia queda recordada en la PC');
  await p.evaluate(()=>benRef('Supermercados',150000));

  // ── filtros: provincia, segmento, tarjeta ──
  const r4=await p.evaluate(()=>{
    const n=()=>benFiltradas().length;
    const out={todos:n()};
    benSet('prov','CAPITAL FEDERAL');out.capital=n();out.ypfConProv=benFiltradas().some(x=>x.titulo==='YPF'); // YPF cae en Buenos Aires por su marca
    benSet('prov','BUENOS AIRES');out.ba=n();out.ypfBA=benFiltradas().some(x=>x.titulo==='YPF');
    benSet('prov','');
    benSet('seg','clasico');out.clasico=n();out.macroEnClasico=benFiltradas().some(x=>x.banco==='macro');
    benSet('seg','premium');out.premium=n();out.macroEnPremium=benFiltradas().some(x=>x.banco==='macro');
    benSet('seg','todos');
    benSet('tarj','debito');out.debito=benFiltradas().map(x=>x.titulo).sort().join(',');
    benSet('tarj','todas');
    return out;
  });
  console.log('  ',JSON.stringify(r4));
  ok(r4.capital<r4.todos&&!r4.ypfConProv,'con provincia, sólo lo que vale ahí (YPF es de Buenos Aires por los lugares de su marca)');
  ok(r4.ypfBA,'los lugares de la marca completan a la promo que no los trae (YPF → Buenos Aires)');
  ok(!r4.macroEnClasico&&r4.macroEnPremium,'una promo sólo Premium (Macro Selecta) no sale en Clásico/Gold y sí en Premium');
  ok(/YPF/.test(r4.debito)&&!/Coto/.test(r4.debito),'el filtro Débito deja sólo las promos con débito');

  // ── cara a cara por marca y semana ──
  const r5=await p.evaluate(()=>{
    benVista('marca');
    const html=document.querySelector('#ben-root').textContent;
    const filas=[...document.querySelectorAll('#ben-root table.ben-t tbody tr')].map(f=>f.textContent.replace(/\s+/g,' '));
    const coto=filas.find(f=>/^Coto/.test(f)),far=filas.find(f=>/^Farmacity/.test(f));
    benSet('resultado','pierde');const pierde=[...document.querySelectorAll('#ben-root table.ben-t tbody tr')].map(f=>f.querySelector('.ben-marca').textContent.trim());
    benSet('resultado','');
    benVista('semana');
    const dias=[...document.querySelectorAll('#ben-root table.ben-t tbody tr')].map(f=>f.querySelector('td').textContent);
    return {coto:coto||'',far:far||'',pierde,dias};
  });
  console.log('  ',JSON.stringify(r5));
  await p.evaluate(()=>benVista('marca'));await p.screenshot({path:__dirname+'/capturas/bm2_marca.png'});
  ok(/BBVA gana/.test(r5.coto)&&/Galicia gana/.test(r5.far),'Cara a cara: Coto lo gana BBVA y Farmacity lo gana Galicia');
  ok(r5.pierde.length===1&&/Coto/.test(r5.pierde[0]),'el filtro "Perdemos" deja sólo Coto');
  ok(r5.dias.join(',')==='Lunes,Martes,Miércoles,Jueves,Viernes,Sábado,Domingo','Semana: una fila por día, de lunes a domingo');

  // ── entrega 2: la misma promo en MODO y en la web propia se cuenta una vez; "100% OFF" no es reintegro ──
  nube.bench.push(
    fila({k:'bx1',banco:'bbva',fuente:'bbva',rubro:'Salud y Bienestar',titulo:'Farmacity',pct:20,tope:8000,dias:'Lunes',dias_n:[0],provincias:[]}), // la de MODO (b2) tiene tope 5.000
    fila({k:'bx2',banco:'bbva',fuente:'bbva',rubro:'Otros',titulo:'Cabify',pct:100,tope:null,provincias:[]}),
    fila({k:'gx1',banco:'galicia',fuente:'galicia',rubro:'Supermercados',titulo:'Mas Go',pct:null,cuotas:18,dias:'Todos los días',provincias:['CAPITAL FEDERAL']}),
    fila({k:'bx3',banco:'bbva',fuente:'bbva',rubro:'Supermercados',titulo:'Coto',pct:null,cuotas:12,provincias:['CAPITAL FEDERAL']}));
  nube.benchMeta.push({banco:'bbva_web',last_sync_at:new Date().toISOString(),total:2,error:null},{banco:'galicia_web',last_sync_at:new Date().toISOString(),total:2,error:null});
  nube.benchHist=[
    {semana:'2026-10-19',banco:'bbva',rubro:'Supermercados',promos:10,mejor_pct:20},{semana:'2026-10-26',banco:'bbva',rubro:'Supermercados',promos:25,mejor_pct:25},
    {semana:'2026-10-19',banco:'galicia',rubro:'Salud y Bienestar',promos:9,mejor_pct:30},{semana:'2026-10-26',banco:'galicia',rubro:'Salud y Bienestar',promos:7,mejor_pct:30}];
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.error='';BEN.vista='rubro';BEN.f={prov:'',seg:'todos',tarj:'todas',rubro:'',q:'',solo2:true,resultado:''};benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.rows.length,null,{timeout:10000});
  const r6=await p.evaluate(()=>{
    const far=benFiltradas().filter(x=>x.titulo==='Farmacity'&&x.banco==='bbva');
    const cab=benFiltradas().find(x=>x.titulo==='Cabify');
    const chips=[...document.querySelectorAll('.ben-chip')].map(c=>c.textContent);
    return {farN:far.length,farFuente:far[0]&&far[0].fuente,farV:benMejor(far)&&benMejor(far).v,cabV:cab?benDevuelve(cab):'no está',
      chipB:chips.find(c=>/^BBVA/.test(c)),chipGal:chips.find(c=>/^Galicia/.test(c)),chipMac:chips.find(c=>/^Macro/.test(c)),
      cuotasG:benMasCuotas(benFiltradas().filter(x=>x.banco==='galicia')).cuotas};
  });
  console.log('  ',JSON.stringify(r6));
  ok(r6.farN===1&&r6.farFuente==='bbva'&&r6.farV===8000,'la misma promo de BBVA en MODO y en su web se cuenta una sola vez, y se queda la de la web propia (tope 8.000)');
  ok(r6.cabV===null,'"100% OFF" no cuenta como reintegro del 100 %');
  ok(/MODO \+ web propia/.test(r6.chipB||'')&&/MODO \+ web propia/.test(r6.chipGal||'')&&/vía MODO/.test(r6.chipMac||''),'los bancos con web propia lo dicen en su etiqueta (BBVA y Galicia); Macro sigue vía MODO');
  ok(r6.cuotasG===18,'las cuotas de Galicia de su catálogo propio (18) entran en la comparación');
  // pestaña "Galicia vs BBVA"
  await p.evaluate(()=>benVista('versus'));
  const v=await p.evaluate(()=>{
    const t=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    return {tab:[...document.querySelectorAll('.ben-tab')].map(x=>x.textContent),texto:t};
  });
  console.log('  ',JSON.stringify({tabs:v.tab}));
  ok(v.tab.indexOf('Galicia vs BBVA')>=0&&v.tab.indexOf('Evolución')<0,'está la pestaña "Galicia vs BBVA" y ya no la de Evolución (pedido del dueño)');
  ok(/Dónde somos fuertes/.test(v.texto)&&/Farmacity: Galicia devuelve \$12\.000 \(30 %, tope \$15\.000 por mes, lunes\) contra \$8\.000/.test(v.texto),'Dónde somos fuertes: Farmacity, con los números y las condiciones ('+v.texto.slice(v.texto.indexOf('Dónde somos'),v.texto.indexOf('Dónde somos')+260)+')');
  ok(/Dónde nos ganan/.test(v.texto)&&/Coto: Galicia devuelve \$10\.000/.test(v.texto)&&/contra \$30\.000.{0,70}de BBVA/.test(v.texto),'Dónde nos ganan: Coto');
  ok(/Supermercados[^·]*Galicia 18 cuotas[^·]*BBVA 12 cuotas/.test(v.texto)&&/más cuotas Galicia/.test(v.texto),'Cuotas: Galicia llega a 18 y BBVA a 12 en supermercados');
  await p.screenshot({path:__dirname+'/capturas/bm3_versus.png',fullPage:false});
  // ── compartidas de MODO y promos que todavía no empezaron (29-oct) ──
  const enDias=n=>new Date(Date.now()-3*3600000+n*86400000).toISOString().slice(0,10);
  nube.bench.push(
    fila({k:'sh1',banco:'galicia',rubro:'Combustible',titulo:'WICO Combustibles',beneficio:'15% de reintegro',pct:50,tope:99999,dias:'Jueves',dias_n:[3],bancos_n:5,provincias:[]}),
    fila({k:'sh1',banco:'bbva',rubro:'Combustible',titulo:'WICO Combustibles',beneficio:'15% de reintegro',pct:50,tope:99999,dias:'Jueves',dias_n:[3],bancos_n:5,provincias:[]}),
    fila({k:'gp1',banco:'galicia',fuente:'galicia',rubro:'Combustible',titulo:'Combustible',beneficio:'25% de ahorro.',pct:25,tope:20000,dias:'Martes',dias_n:[1],proximamente:true,fecha_desde:enDias(10),provincias:[]}),
    fila({k:'gp2',banco:'galicia',fuente:'galicia',rubro:'Combustible',titulo:'Shell Lejana',pct:40,tope:50000,proximamente:true,fecha_desde:enDias(30),provincias:[]}));
  nube.benchMeta.push({banco:'santander_web',last_sync_at:null,total:null,error:'Santander bloquea la lectura automática desde la nube (no respondió en 20 s)'});
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.rows.some(r=>r.titulo==='Shell Lejana'),null,{timeout:10000});
  const cp=await p.evaluate(()=>{
    const L=benFiltradas(),comb=L.filter(r=>r.rubro==='Combustible');
    benSet('rubro','Combustible');benVista('rubro');
    const t=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    const chipSan=[...document.querySelectorAll('.ben-chip')].map(c=>c.textContent).find(x=>/^Santander/.test(x));
    benSet('rubro','');
    return {compartidas:L.filter(r=>r.bancos_n>1).length,mejorG:benMejor(comb.filter(r=>r.banco==='galicia')),lejana:L.some(r=>r.titulo==='Shell Lejana'),texto:t,chipSan};
  });
  console.log('  ',JSON.stringify({compartidas:cp.compartidas,mejorG:cp.mejorG&&{t:cp.mejorG.r.titulo,v:cp.mejorG.v},lejana:cp.lejana,chipSan:cp.chipSan}));
  ok(cp.compartidas===0,'las promos de MODO que valen con cualquier banco no entran en la comparación');
  ok(cp.mejorG&&cp.mejorG.r.titulo==='Combustible'&&cp.mejorG.v===15000,'Combustible de Galicia: gana su promo propia de los martes (25 %, $15.000), no la compartida del 50 %');
  ok(!cp.lejana,'una promo que empieza en 30 días no entra (sólo las de los próximos 15)');
  ok(/Empieza el/.test(cp.texto),'la que empieza en 10 días entra con la etiqueta "Empieza el dd/mm"');
  ok(/Con MODO y cualquier banco/.test(cp.texto)&&/WICO Combustibles: 15% de reintegro/.test(cp.texto)&&(cp.texto.match(/WICO Combustibles:/g)||[]).length===1,'las compartidas se avisan aparte, una sola vez ("Con MODO y cualquier banco")');
  ok(/se carga una vez por mes/.test(cp.chipSan||'')&&!/⚠/.test(cp.chipSan||''),'si Santander todavía no tiene su carga mensual, la etiqueta lo dice (sin marcarlo como error)');
  await p.screenshot({path:__dirname+'/capturas/bm4_combustible.png',fullPage:false});
  await p.evaluate(()=>benVista('rubro'));

  const nota=await p.evaluate(()=>{const antes=benNotaOtros();for(let i=0;i<60;i++)BEN.rows.push({banco:'bbva',fuente:'bbva',rubro:'Otros'});const despues=benNotaOtros();BEN.rows.length-=60;return {antes,despues};});
  ok(nota.antes===''&&/no informa el rubro de sus promos: 61 quedan en/.test(nota.despues),'con muchas promos de BBVA sin rubro, la pantalla lo avisa (y con pocas no molesta)');
  // ── empate de Macro Selecta por nivel y webs propias sin zona (29-oct) ──
  nube.bench.push(
    fila({k:'mx4',banco:'macro',rubro:'Combustible',titulo:'YPF',beneficio:'30% de reintegro Nivel 4',pct:30,tope:90000,dias:'Miércoles',dias_n:[2],segmento:'premium',segmento_txt:'Macro Selecta · YPF Selecta Nivel 4',bancos_n:1,provincias:[]}),
    fila({k:'mx2',banco:'macro',rubro:'Combustible',titulo:'YPF',beneficio:'30% en YPF Nivel 2',pct:30,tope:30000,dias:'Miércoles',dias_n:[2],segmento:'premium',segmento_txt:'Macro Selecta · YPF Selecta Nivel 2',bancos_n:1,provincias:[]}),
    fila({k:'mxg',banco:'macro',rubro:'Combustible',titulo:'YPF',beneficio:'20% de reintegro',pct:20,tope:10000,dias:'Miércoles',dias_n:[2],segmento:'premium',segmento_txt:'Macro · 20% en YPF Combustible · Los miércoles pagando con Tarjetas de Crédito Visa Platinum Macro',bancos_n:1,provincias:[]}),
    fila({k:'su1',banco:'supervielle',fuente:'supervielle',rubro:'Supermercados',titulo:'Dia Prueba',pct:20,tope:12000,provincias:null}));
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.rows.some(r=>r.titulo==='Dia Prueba'),null,{timeout:10000});
  const mz=await p.evaluate(()=>{
    const ypf=benFiltradas().filter(r=>r.banco==='macro'&&r.rubro==='Combustible'),m=benMejor(ypf);
    const g=benFiltradas().find(r=>r.segmento_txt&&/Visa Platinum/.test(r.segmento_txt));
    benSet('prov','CAPITAL FEDERAL');
    const dia=benFiltradas().some(r=>r.titulo==='Dia Prueba'),modoSinZona=benFiltradas().some(r=>r.fuente!=='supervielle'&&r.fuente&&false);
    benSet('rubro','Supermercados');benVista('rubro');
    const txt=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    benSet('rubro','');benSet('prov','');
    return {m:m&&{tope:m.r.tope,v:m.v,seg:benSegTxt(m.r)},platino:g&&benSegTxt(g),dia,txt};
  });
  console.log('  ',JSON.stringify({m:mz.m,platino:mz.platino,dia:mz.dia}));
  ok(mz.m&&mz.m.v===18000&&mz.m.tope===30000&&mz.m.seg==='Selecta Nivel 2','Macro YPF: los niveles 2 y 4 empatan ($18.000) y se muestra el más accesible (Nivel 2, tope $30.000), no el de tope $90.000');
  ok(mz.platino==='Visa Platinum','el 20 % general de Macro dice "Sólo Visa Platinum" (no "Premium")');
  ok(mz.dia&&/Zona sin confirmar/.test(mz.txt),'con una provincia elegida, una promo de la web propia sin lugar informado se ve igual, marcada "Zona sin confirmar"');

  // ── promos cargadas a mano (Macro y Santander, 29-oct) ──
  const mesPasado=new Date(Date.now()-40*86400000).toISOString();
  nube.benchManual=[{id:'m1',banco:'santander',titulo:'YPF',rubro:'Combustible',beneficio:'Pagando con la App YPF',pct:15,tope:20000,tope_por:'month',cuotas:0,dias_n:[3],credito:true,debito:true,segmento:'premium',provincias:null,fecha_desde:'2026-10-01',fecha_hasta:'2027-12-31',fuente_url:'https://www.santander.com.ar/personas/beneficios',notas:'',updated_at:mesPasado},
    {id:'m2',banco:'macro',titulo:'Vieja SA',rubro:'Otros',beneficio:'',pct:10,tope:null,tope_por:null,cuotas:0,dias_n:[],credito:true,debito:true,segmento:null,provincias:null,fecha_desde:'2026-01-01',fecha_hasta:'2026-02-01',fuente_url:'',notas:'',updated_at:mesPasado}];
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.vista='rubro';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.manual&&BEN.manual.length===2,null,{timeout:10000});
  const man=await p.evaluate(()=>{
    const comb=benFiltradas().filter(r=>r.rubro==='Combustible'&&r.banco==='santander');
    const m=benMejor(comb);
    const chip=[...document.querySelectorAll('.ben-chip')].map(c=>c.textContent).find(x=>/^Santander/.test(x));
    const aviso=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    BEN.vista='manual';benRender();
    const t=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    return {m:m&&{t:m.r.titulo,v:m.v,f:m.r.fuente},vieja:benFiltradas().some(r=>r.titulo==='Vieja SA'),chip,aviso:/Es día de revisar las promos cargadas a mano/.test(aviso),dia:Number(benHoyIso().slice(8,10)),t,
      botones:[...document.querySelectorAll('#ben-root button')].map(b=>b.textContent)};
  });
  console.log('  ',JSON.stringify({m:man.m,chip:man.chip,aviso:man.aviso}));
  ok(man.m&&man.m.t==='YPF'&&man.m.f==='manual'&&man.m.v===9000,'una promo de Santander cargada a mano entra a la comparación (YPF 15 %: $9.000 en una carga de $60.000)');
  ok(!man.vieja,'una cargada a mano ya vencida no cuenta');
  ok(/1 cargada a mano/.test(man.chip||''),'la etiqueta de Santander dice cuántas promos tiene cargadas a mano');
  ok(!man.aviso,'el aviso de revisar las cargadas a mano ya no se muestra');
  ok(!(await p.evaluate(()=>[...document.querySelectorAll(".ben-tab")].some(t=>/Cargadas a mano/.test(t.textContent)))),'la solapa "Cargadas a mano" no se ve (ni para el admin)');
  const sv=await p.evaluate(()=>{BEN.vista="semana";BEN.sem=null;benRender();window.__dbg=JSON.stringify({f:BEN.f,n:Object.keys(BEN.semN||{}).length,btn:[...document.querySelectorAll("#ben-root button")].map(x=>x.textContent).slice(0,12)});const b=[...document.querySelectorAll("#ben-root button")].find(x=>/^Ver las \d+ promos$/.test(x.textContent));if(!b)return null;const n=Number(/\d+/.exec(b.textContent)[0]);b.click();const t=document.querySelector("#ben-root").textContent;const filas=document.querySelectorAll("#ben-root table.ben-t")[1];return {n,filas:filas?filas.querySelectorAll("tbody tr").length:0,titulo:/: \d+ promos/.test(t)};});
  ok(sv&&sv.n>1&&sv.filas===Math.min(sv.n,120)&&sv.titulo,"Semana: tocar \"Ver las N promos\" lista todas las promos de ese banco ese día ("+JSON.stringify(sv)+await p.evaluate(()=>window.__dbg)+")");
  await p.evaluate(()=>{BEN.sem=null;benVista("rubro");});
  ok(/Promos cargadas a mano/.test(man.t)&&/Vencida/.test(man.t)&&man.botones.indexOf('+ Agregar promo')>=0&&man.botones.filter(b=>b==='Editar').length===2,'la pestaña "Cargadas a mano" lista las promos (la vencida marcada) con Editar y "+ Agregar promo"');
  // agregar una de Macro
  await p.evaluate(()=>benManualEditar(''));
  await p.selectOption('#ben-m-banco','macro');
  await p.selectOption('#ben-m-rubro','Supermercados');
  await p.fill('#ben-m-titulo','Changomas');
  await p.fill('#ben-m-pct','20');
  await p.fill('#ben-m-tope','15000');
  await p.selectOption('#ben-m-tope_por','month');
  await p.check('.ben-m-dia[value="2"]');
  await p.evaluate(()=>benManualGuardar(''));
  await p.waitForFunction(()=>!document.getElementById('ben-ed-ov')&&BEN.rows&&!BEN.cargando&&BEN.manual&&BEN.manual.some(x=>x.titulo==='Changomas'),null,{timeout:10000});
  const nm=nube.benchManual.find(x=>x.titulo==='Changomas');
  ok(nm&&nm.banco==='macro'&&nm.pct===20&&nm.tope===15000&&nm.tope_por==='month'&&JSON.stringify(nm.dias_n)==='[2]'&&nm.provincias===null,'"+ Agregar promo" guarda la promo de Macro (20 %, tope $15.000 por mes, miércoles, todo el país)');
  const cm=await p.evaluate(()=>{const r=benFiltradas().find(x=>x.titulo==='Changomas');return r&&{dias:r.dias,f:r.fuente,clave:r.marca_clave};});
  ok(cm&&cm.dias==='Miércoles'&&cm.f==='manual'&&cm.clave==='changomas','la nueva entra enseguida a la comparación, con sus días y la misma clave de marca que las demás fuentes');
  // validación
  await p.evaluate(()=>benManualEditar(''));
  await p.fill('#ben-m-titulo','Sin beneficio');
  await p.evaluate(()=>benManualGuardar(''));
  ok(await p.evaluate(()=>!!document.getElementById('ben-ed-ov')),'sin % ni cuotas no se guarda');
  await p.evaluate(()=>benTarjCerrar());
  const sinAdminM=await p.evaluate(()=>{const a=_admin;_admin=false;benRender();const b=[...document.querySelectorAll('#ben-root button')].map(x=>x.textContent);const av=/Es día de revisar/.test(document.querySelector('#ben-root').textContent);_admin=a;benVista('rubro');return {b,av};});
  ok(sinAdminM.b.indexOf('+ Agregar promo')<0&&sinAdminM.b.indexOf('Editar')<0&&!sinAdminM.av,'sin ser admin: no se puede editar y no ve el aviso de revisión');

  // ── beneficios de paquete y carga asistida (29-oct) ──
  const hace2=new Date(Date.now()-2*86400000).toISOString();
  nube.benchManual.push({id:'pq1',banco:'bbva',titulo:'Supermercados',rubro:'Supermercados',beneficio:'20% todos los días con Visa Signature por NFC',pct:20,tope:100000,tope_por:'month',cuotas:0,dias_n:[],credito:true,debito:false,segmento:'premium',condicion:'Paquete Black+ All · Visa Signature por NFC',provincias:null,fecha_desde:'2026-07-01',fecha_hasta:'2027-12-31',fuente_url:'https://www.bbva.com.ar/personas/productos/paquetes/black-all.html',notas:'',updated_at:hace2});
  nube.benchMeta.push({banco:'macro_web',last_sync_at:hace2,total:40,error:'carga asistida'});
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.vista='rubro';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.manual&&BEN.manual.some(x=>x.id==='pq1'),null,{timeout:10000});
  const pq=await p.evaluate(()=>{
    const r=BEN.rows.find(x=>x.id==='manual:pq1');
    const chipMac=[...document.querySelectorAll('.ben-chip')].map(c=>c.textContent).find(x=>/^Macro/.test(x));
    BEN.vista='manual';benRender();
    const t=document.querySelector('#ben-root').textContent.replace(/\s+/g,' ');
    benVista('rubro');
    return {seg:r&&benSegTxt(r),segTxt:r&&r.segmento_txt,chipMac,t};
  });
  ok(pq.seg==='Paquete Black+ All','un beneficio de paquete cargado a mano se muestra "Sólo Paquete Black+ All"');
  ok(/carga asistida/.test(pq.chipMac||''),'Macro cargado por la carga asistida: la etiqueta lo dice');
  ok(/Paquete Black\+ All · Visa Signature por NFC/.test(pq.t),'la pestaña "Cargadas a mano" muestra la condición del paquete');
  await p.evaluate(()=>benManualEditar('pq1'));
  ok(await p.evaluate(()=>(document.getElementById('ben-m-condicion')||{}).value==='Paquete Black+ All · Visa Signature por NFC'),'el editor trae el campo Condición con lo guardado');
  await p.fill('#ben-m-condicion','Paquete Black+ Travel');
  await p.evaluate(()=>benManualGuardar('pq1'));
  await p.waitForFunction(()=>!document.getElementById('ben-ed-ov')&&BEN.rows&&!BEN.cargando,null,{timeout:10000});
  ok(nube.benchManual.find(x=>x.id==='pq1').condicion==='Paquete Black+ Travel','al guardar se escribe la condición');
  const galSeg=await p.evaluate(()=>[benSegTxt({segmento:'clasico',segmento_txt:'Clientes Plus Gold'}),benSegTxt({segmento:'clasico',segmento_txt:'Clientes Move'})]);
  ok(galSeg[0]==='Plus Gold'&&galSeg[1]==='Move','Galicia: el segmento sale con su nombre ("Plus Gold", "Move")');

  const lk=await p.evaluate(()=>[benLink({fuente:"modo",slug:"abc-oct26",banco:"bbva"}),benLink({fuente:"galicia",id:"galicia:g187090",banco:"galicia"}),benLink({fuente:"santander",slug:"brand:546",banco:"santander"}),benLink({fuente:"manual",fuente_url:"https://x.com/a",banco:"bbva"}),benEmpieza({fecha_desde:"2026-11-10",fecha_hasta:"2026-11-10"}),benTopeTxt({tope:15000,tope_por:"total"})]);
  ok(lk[0]==="https://www.modo.com.ar/promos/abc-oct26"&&lk[1]==="https://beneficios.galicia.ar/promocion/187090"&&/brandId=546$/.test(lk[2])&&lk[3]==="https://x.com/a","cada promo tiene su link a la página (MODO, Galicia, Santander, manual)");
  ok(lk[4].indexOf("Sólo el 10/11")===0&&/en total/.test(lk[5]),"una promo de un solo día lo dice, y el tope total dice \"en total\"");

  // ── entrega 3: tarjetas y salas VIP ──
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.error='';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.tarj&&BEN.tarj.length===4,null,{timeout:10000});
  await p.evaluate(()=>benVista('tarjetas'));
  const tv=await p.evaluate(()=>{
    const root=document.querySelector('#ben-root');
    return {tabs:[...document.querySelectorAll('.ben-tab')].map(x=>x.textContent),filas:root.querySelectorAll('table.ben-t tbody tr').length,
      texto:root.textContent.replace(/\s+/g,' '),links:[...root.querySelectorAll('table.ben-t a')].map(a=>a.getAttribute('href')),
      imgInyectada:!!root.querySelector('img[src="x"]'),barras:root.querySelectorAll('.ben-bar').length,
      botones:[...root.querySelectorAll('button')].map(b=>b.textContent)};
  });
  console.log('  ',JSON.stringify({tabs:tv.tabs,filas:tv.filas,links:tv.links,barras:tv.barras}));
  ok(tv.tabs.indexOf('Tarjetas y salas VIP')>=0&&tv.filas===4,'la pestaña "Tarjetas y salas VIP" muestra las 4 tarjetas cargadas');
  ok(/Los que más dan: BBVA Black\+ All \(20\), Macro Selecta \(10\), Galicia Éminent \(4\)/.test(tv.texto)&&/La de Galicia con más pases es Visa Signature \(4\)/.test(tv.texto),'el resumen ordena por pases (BBVA 20, Macro 10, Galicia 4) y dice cuál es la de Galicia');
  ok(/Cambios anunciados/.test(tv.texto)&&/Macro · Visa Signature: cambia el 18\/11\/2026/.test(tv.texto),'avisa el cambio anunciado de Macro (18/11/2026)');
  ok(tv.links.length===2&&tv.links.every(h=>/^https:\/\//.test(h)),'sólo se enlazan direcciones https (la "javascript:" no se convierte en link)');
  ok(!tv.imgInyectada&&/<img src=x onerror=alert\(2\)>/.test(tv.texto),'un texto con HTML se muestra como texto, no se ejecuta');
  ok(/sin dato/.test(tv.texto)&&/Sin dato firme/.test(tv.texto),'una tarjeta sin pases informados dice "sin dato" y "Sin dato firme"');
  ok(tv.botones.indexOf('+ Agregar tarjeta')>=0&&tv.botones.filter(b=>b==='Editar').length===4,'el admin ve "+ Agregar tarjeta" y "Editar" en cada fila');
  await p.screenshot({path:__dirname+'/capturas/bm5_tarjetas.png',fullPage:false});
  // editar: cambiar los pases de la Visa Signature de Galicia
  await p.evaluate(()=>benTarjEditar('tg1'));
  await p.fill('#ben-f-pases_anio','6');
  await p.fill('#ben-f-costo','Bonificada 6 meses.');
  await p.evaluate(()=>benTarjGuardar('tg1'));
  await p.waitForFunction(()=>!document.getElementById('ben-ed-ov')&&BEN.tarj.find(t=>t.id==='tg1').pases_anio===6,null,{timeout:8000});
  const ed=await p.evaluate(()=>({g:BEN.tarj.find(t=>t.id==='tg1'),texto:document.querySelector('#ben-root').textContent.replace(/\s+/g,' ')}));
  ok(ed.g.pases_anio===6&&ed.g.costo==='Bonificada 6 meses.'&&ed.g.revisada===new Date(Date.now()-3*3600000).toISOString().slice(0,10),'editar guarda los cambios y deja la fila como revisada hoy');
  ok(/La de Galicia con más pases es Visa Signature \(6\)/.test(ed.texto),'la pantalla se actualiza sola después de guardar');
  // validaciones
  await p.evaluate(()=>benTarjEditar('tg1'));
  await p.fill('#ben-f-fuente_url','http://sitio-inseguro.com');
  await p.evaluate(()=>benTarjGuardar('tg1'));
  const val=await p.evaluate(()=>({abierta:!!document.getElementById('ben-ed-ov'),toast:(document.querySelector('.fg-toast,#toast,.toast')||{}).textContent||''}));
  ok(val.abierta,'una dirección sin https:// no se guarda y la ventana queda abierta');
  await p.evaluate(()=>benTarjCerrar());
  // agregar y quitar
  await p.evaluate(()=>benTarjEditar(''));
  await p.fill('#ben-f-tarjeta','Visa Infinite');
  await p.selectOption('#ben-f-banco','santander');
  await p.evaluate(()=>benTarjGuardar(''));
  await p.waitForFunction(()=>BEN.tarj.some(t=>t.tarjeta==='Visa Infinite'),null,{timeout:8000});
  ok(nube.benchTarj.some(t=>t.tarjeta==='Visa Infinite'&&t.banco==='santander'),'"+ Agregar tarjeta" crea la fila en la tabla');
  await p.evaluate(()=>benTarjBorrar(BEN.tarj.find(t=>t.tarjeta==='Visa Infinite').id));
  await p.waitForSelector('#fg-cf-ov',{timeout:5000});
  await p.click('#fg-cf-ov button.fg-cf-ok, #fg-cf-ov .fg-cf-ok, #fg-cf-ov button:last-of-type');
  await p.waitForFunction(()=>!BEN.tarj.some(t=>t.tarjeta==='Visa Infinite'),null,{timeout:8000});
  ok(!nube.benchTarj.some(t=>t.tarjeta==='Visa Infinite'),'"Quitar" pide confirmación y borra la fila');
  // quien no es admin no ve los botones de edición (y la base igual lo rechaza)
  const sinAdmin=await p.evaluate(()=>{const a=_admin;_admin=false;benRender();const b=[...document.querySelectorAll('#ben-root button')].map(x=>x.textContent);_admin=a;benRender();return b;});
  ok(sinAdmin.indexOf('Editar')<0&&sinAdmin.indexOf('+ Agregar tarjeta')<0,'sin ser admin no aparecen "Editar", "Quitar" ni "Agregar"');
  // tabla inexistente (migración 042 sin aplicar): lo dice y el resto de la solapa anda
  nube.tarjFalla=true;
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.error='';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando,null,{timeout:10000});
  const sf=await p.evaluate(()=>{const t=document.querySelector('#ben-root').textContent;benVista('rubro');return {t,rubro:document.querySelectorAll('#ben-root table.ben-t').length};});
  ok(/migración 042/.test(sf.t)&&sf.rubro===1,'sin la tabla de tarjetas, esa pestaña lo explica y el resto de la solapa sigue andando');
  nube.tarjFalla=false;
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando&&BEN.tarj.length>0,null,{timeout:10000});

  // ── Excel ──
  await p.evaluate(()=>{window.__blob=null;const f=URL.createObjectURL;URL.createObjectURL=function(b){window.__blob=b;return f.call(URL,b);};HTMLAnchorElement.prototype.click=function(){};});
  await p.evaluate(()=>benExcel());
  await p.waitForFunction(()=>window.__blob,null,{timeout:30000});
  const xl=await p.evaluate(async()=>{
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await window.__blob.arrayBuffer());
    const hojas=wb.worksheets.map(w=>w.name);
    const rub=wb.getWorksheet('Por rubro'),filasRub=[];rub.eachRow((r,i)=>{if(i>1)filasRub.push(r.values.slice(1));});
    const tj=wb.getWorksheet('Tarjetas y salas VIP');
    const pr=wb.getWorksheet('Promos'),nPromos=pr.rowCount-1;
    const res=wb.getWorksheet('Resumen');const info=[];res.eachRow(r=>info.push(r.values.slice(1).join(' | ')));
    return {hojas,supBbva:filasRub.find(r=>r[0]==='Supermercados'&&r[2]==='BBVA'),tarjetas:tj.rowCount-1,nPromos,vig:benFiltradas().length,info:info.slice(0,3).concat(info.filter(x=>/Compra|Supermercados|BBVA/.test(x)).slice(0,6)),btn:document.getElementById('ben-xl').textContent};
  });
  console.log('  ',JSON.stringify({hojas:xl.hojas,supBbva:xl.supBbva,tarjetas:xl.tarjetas,nPromos:xl.nPromos}));
  ok(xl.hojas.join(',')==='Resumen,Por rubro,Por marca,Semana,Tarjetas y salas VIP,Promos','el Excel trae las hojas Resumen, Por rubro, Por marca, Semana, Tarjetas y salas VIP y Promos');
  ok(xl.supBbva&&xl.supBbva[4]===30000&&xl.supBbva[5]===20,'Por rubro: Supermercados/BBVA devuelve $30.000 (20 %), igual que en pantalla');
  ok(xl.tarjetas===4&&xl.nPromos===xl.vig,'la hoja de tarjetas tiene las 4 filas y la de Promos tiene las mismas promos que la pantalla ('+xl.vig+')');
  ok(xl.info.some(x=>/150000/.test(x))&&xl.btn==='Descargar Excel','el Resumen deja las compras de referencia usadas y el botón vuelve a su texto');

  // ── Actualizar ahora: un banco por vez, después la web de BBVA, el catálogo de Galicia y las marcas ──
  nube.llamadasBench=[];
  await p.evaluate(()=>{benVista('rubro');benActualizar();});
  await p.waitForTimeout(300);
  await p.waitForFunction(()=>{const b=document.getElementById('ben-act');return !b||!b.disabled;},null,{timeout:15000});
  await p.waitForTimeout(500);
  const ll=(nube.llamadasBench||[]).map(b=>b.action+(b.banco?':'+b.banco:''));
  ok(ll.join(',')==='sync:galicia,sync:bbva,sync:macro,sync:supervielle,sync:santander,sync:icbc,bbva,supervielle,galicia,marcas','"Actualizar ahora" pide MODO banco por banco, las webs de BBVA y Supervielle (Santander y Macro van por la carga asistida), el catálogo de Galicia y al final los lugares y logos ('+ll.join(',')+')');

  // ── sin tablas (migración sin aplicar) y sin datos: se explica, no se rompe ──
  nube.benchFalla=true;
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;benCargar();});
  await p.waitForFunction(()=>BEN.error&&!BEN.cargando,null,{timeout:10000});
  const f1=await p.evaluate(()=>document.querySelector('#ben-root').textContent);
  ok(/migración 039/.test(f1)&&/Reintentar/.test(f1),'sin las tablas, la pantalla lo dice y ofrece Reintentar');
  nube.benchFalla=false;nube.bench=[];nube.benchManual=[];
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.error='';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando,null,{timeout:10000});
  const f2=await p.evaluate(()=>document.querySelector('#ben-root').textContent);
  ok(/Todavía no hay promos/.test(f2),'sin datos, dice que todavía no hay y cómo bajarlas');
  await p.context().close().catch(()=>{});
};
