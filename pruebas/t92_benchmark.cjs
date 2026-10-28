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
    fila({k:'g4',banco:'galicia',titulo:'Proxima SA',pct:50,tope:99999,proximamente:true,provincias:[]}),
    // Santander: sólo cuotas (sin %)
    fila({k:'s1',banco:'santander',titulo:'Fravega',rubro:'Electrónica',pct:null,cuotas:12,provincias:[]}),
  ];
  nube.benchMarcas=[{marca_clave:'ypf',provincias:['BUENOS AIRES'],localidades:[],imagen:''},{marca_clave:'coto',provincias:['CAPITAL FEDERAL'],localidades:[],imagen:'modo/9.png'}];
  nube.benchMeta=[{banco:'galicia',last_sync_at:new Date().toISOString(),total:4,error:null},{banco:'bbva',last_sync_at:new Date(Date.now()-20*86400000).toISOString(),total:3,error:null},
    {banco:'macro',last_sync_at:new Date().toISOString(),total:1,error:'MODO respondió 500'}];
  nube.benchHist=[];

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

  // ── Actualizar ahora: un banco por vez, y después las marcas ──
  nube.llamadasBench=[];
  await p.evaluate(()=>{benVista('rubro');benActualizar();});
  await p.waitForTimeout(300);
  await p.waitForFunction(()=>{const b=document.getElementById('ben-act');return !b||!b.disabled;},null,{timeout:15000});
  await p.waitForTimeout(500);
  const ll=(nube.llamadasBench||[]).map(b=>b.action+(b.banco?':'+b.banco:''));
  ok(ll.join(',')==='sync:galicia,sync:bbva,sync:macro,sync:supervielle,sync:santander,marcas','"Actualizar ahora" pide un banco por vez y después los lugares y logos ('+ll.join(',')+')');

  // ── sin tablas (migración sin aplicar) y sin datos: se explica, no se rompe ──
  nube.benchFalla=true;
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;benCargar();});
  await p.waitForFunction(()=>BEN.error&&!BEN.cargando,null,{timeout:10000});
  const f1=await p.evaluate(()=>document.querySelector('#ben-root').textContent);
  ok(/migración 039/.test(f1)&&/Reintentar/.test(f1),'sin las tablas, la pantalla lo dice y ofrece Reintentar');
  nube.benchFalla=false;nube.bench=[];
  await p.evaluate(()=>{BEN.rows=null;BEN.cargando=false;BEN.error='';benCargar();});
  await p.waitForFunction(()=>BEN.rows&&!BEN.cargando,null,{timeout:10000});
  const f2=await p.evaluate(()=>document.querySelector('#ben-root').textContent);
  ok(/Todavía no hay promos/.test(f2),'sin datos, dice que todavía no hay y cómo bajarlas');
  await p.context().close().catch(()=>{});
};
