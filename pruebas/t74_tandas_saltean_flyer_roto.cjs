// Si el flyer de un formato no carga, las tandas (Generar flyers del padrón / ZIP del Hunter y
// Masivo por Excel) NO lo dibujan sobre la imagen de otro: esas filas se saltean y quedan en el
// resumen con el motivo. El historial no vuelve a bajar con otra opción en silencio, y la
// elección automática no manda una empresa a una opción sin imagen.
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const REF='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/';
const a9=nube.json['_active9.json'];
// opción 10 = versión sin cashback de la 9; su imagen es flyer_t8.jpg (se puede hacer caer)
const c10=JSON.parse(JSON.stringify(a9.cfg||{}));c10.montos=Object.assign({},c10.montos||{},{off:true});c10.cashback=Object.assign({},c10.cashback||{},{off:true});c10.recDe=9;
nube.json['_active10.json']={name:'sin cb',imageUrl:REF+'flyer_t8.jpg?v=10',cfg:c10};
nube.json['_legal10.json']={text:'Legal SIN cashback.'};
nube.json['_opciones.json'].opts.push({n:10,nombre:'Combustible sin cashback',solapa:'flyer',sinCB:9});
nube.json['_facultades.json'].roles.asesor.opcion_10=true;
let cae10=true;
const antes=async q=>{await q.route(u=>u.href.includes('flyer_t8.jpg'),r=>cae10?r.abort('connectionreset'):r.fallback());};
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor',antes});
  const sin={empresa:'SIN CB S.A.',config:'',asesores:[{nombre:'Ana Pérez',celular:'11 5555 5555'}],rubro:''};
  const con={empresa:'CON CB S.A.',config:'BAU',asesores:[{nombre:'Juan Díaz',celular:'11 4444 4444'}],rubro:''};

  // 1) Generar flyers del padrón: la empresa sin cashback va a la 10 (no carga) y la otra a la 9
  const r1=await p.evaluate(async([sin,con])=>{
    window.fgConfirm=function(m,o,cb){cb(true);};
    let zip=null,nombre='';window._fgBajarBlob=function(b,n){zip=b;nombre=n;};
    const destinos=[_pgOptDe(sin),_pgOptDe(con)];
    _pgGenerarRows([sin,con],'pdf',{prog:'x1',fill:'x2',txt:'x3',btn:'x4'},'Prueba');
    for(let i=0;i<80&&!zip&&!document.getElementById('pad-upd');i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,800));
    let nombres=[],resumen='';
    if(zip){const z=await JSZip.loadAsync(zip);nombres=Object.keys(z.files).filter(n=>!z.files[n].dir);resumen=await z.file('Resumen.txt').async('string');}
    return {destinos,nombres,resumen,fin:_optN(_fgOpt),modal:document.getElementById('pad-upd')?document.getElementById('pad-upd').innerText.slice(0,200):''};
  },[sin,con]);
  console.log('  generar flyers:',JSON.stringify({d:r1.destinos,n:r1.nombres,fin:r1.fin}));
  ok(r1.destinos[0]===10&&r1.destinos[1]===9,'cada empresa va a su formato (la sin cashback a la 10)');
  ok(r1.nombres.some(n=>/CON CB/.test(n))&&!r1.nombres.some(n=>/SIN CB/.test(n)),'el ZIP trae sólo la empresa cuyo flyer sí cargó');
  ok(/no se pudo cargar el flyer/.test(r1.resumen)&&/SIN CB/.test(r1.resumen),'Resumen.txt dice qué empresa quedó afuera y por qué');
  ok(r1.fin===9,'al terminar vuelve a la opción de origen');

  // 2) Generar flyers donde NINGÚN flyer carga: no baja un ZIP vacío
  const r2=await p.evaluate(async([sin])=>{
    window.fgConfirm=function(m,o,cb){cb(true);};
    if(typeof _padCloseUpdate==='function')_padCloseUpdate(0);
    let zip=0;window._fgBajarBlob=function(){zip++;};
    _pgGenerarRows([sin],'pdf',{prog:'x1',fill:'x2',txt:'x3',btn:'x4'},'Prueba');
    for(let i=0;i<60&&!document.getElementById('pad-upd');i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,500));
    const m=document.getElementById('pad-upd');
    return {zip,modal:m?m.innerText:'',busy:_pgBusy};
  },[sin]);
  ok(r2.zip===0&&!r2.busy,'si no sale ningún flyer no se baja un ZIP vacío y no queda trabado');
  ok(/No se gener/.test(r2.modal)&&/no se pudo cargar/.test(r2.modal),'y el aviso explica el motivo ('+r2.modal.replace(/\n/g,' ').slice(0,100)+')');
  await p.evaluate(()=>{if(typeof _padCloseUpdate==='function')_padCloseUpdate(0);});

  // 3) Masivo: filas con y sin cashback
  const r3=await p.evaluate(async()=>{
    window.excelData=[{empresa:'A con',config:'BAU',asesor1_nombre:'X'},{empresa:'B sin',config:'',asesor1_nombre:'Y'},{empresa:'C con',config:'BAU',asesor1_nombre:'Z'},{empresa:'D sin',config:'SIN',asesor1_nombre:'W'}];
    let zip=null;window._fgBajarBlob=function(b){zip=b;};
    const log=[];const fr=window.fullRes;window.fullRes=function(v){log.push(v.empresa);return fr(v);};
    genAll();
    for(let i=0;i<80&&!zip;i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,800));
    window.fullRes=fr;
    let nombres=[],resumen='';if(zip){const z=await JSZip.loadAsync(zip);nombres=Object.keys(z.files);resumen=await z.file('Resumen.txt').async('string');}
    return {log,nombres,resumen,txt:(document.getElementById('prog-text')||{}).textContent||'',fin:_optN(_fgOpt)};
  });
  console.log('  masivo:',JSON.stringify(r3));
  ok(r3.log.join()==='A con,C con'&&r3.nombres.filter(n=>/.pdf$/.test(n)).length===2,'Masivo: salen sólo las filas cuyo flyer cargó (A y C), las otras no se dibujan sobre la imagen de otro');
  ok(/2 con error|B sin/.test(r3.txt)&&/no se pudo cargar/.test(r3.txt),'Masivo: dice cuáles quedaron afuera ('+r3.txt.slice(0,140)+')');
  ok(/Fila 3 — B sin: no se pudo cargar/.test(r3.resumen)&&/Fila 5 — D sin/.test(r3.resumen),'Masivo: el ZIP trae Resumen.txt con la fila del Excel y el motivo de cada una que no salió');
  ok(r3.fin===9,'Masivo: vuelve a la opción de origen');

  // 4) Masivo con el flyer en pantalla sin cargar: no genera nada
  const r4=await p.evaluate(async()=>{
    window.excelData=[{empresa:'A',config:'BAU',asesor1_nombre:'X'}];
    _fgSinFlyerPoner({opt:_optN(_fgOpt),motivo:'red'});
    let zip=0;window._fgBajarBlob=function(){zip++;};
    genAll();await new Promise(r=>setTimeout(r,1500));
    const t=(document.getElementById('toast-el')||document.getElementById('toast')).textContent;
    _fgSinFlyerPoner(null);return {zip,t};
  });
  ok(r4.zip===0&&/No se pudo cargar el flyer/.test(r4.t),'Masivo con el flyer sin cargar: no genera y explica ('+r4.t+')');

  // 5) Historial: una opción que ya no se puede usar no sale con otra
  const r5=await p.evaluate(async()=>{
    let n=0;const d0=window.savePDF;window.savePDF=function(){n++;};
    const base=getVals();
    flyerHistory.unshift({v:base,fn:'viejo',thumb:'',hora:'1:00',ts:1,ac:0,opt:77});      // no existe
    flyerHistory.unshift({v:base,fn:'ajeno',thumb:'',hora:'1:00',ts:2,ac:0,opt:1});        // la 1 no está habilitada para el asesor
    const t=()=>(document.getElementById('toast-el')||document.getElementById('toast')).textContent;
    fgRedlPDF(1);await new Promise(r=>setTimeout(r,300));const a=t();
    fgRedlPDF(0);await new Promise(r=>setTimeout(r,300));const b=t();
    window.savePDF=d0;return {n,a,b};
  });
  ok(r5.n===0&&/ya no existe/.test(r5.a),'historial: un formato que ya no existe no se vuelve a bajar ('+r5.a.slice(0,70)+')');
  ok(/no est[aá] habilitado/.test(r5.b),'historial: un formato no habilitado para el perfil avisa ('+r5.b.slice(0,80)+')');
  // y con la opción 10 sin imagen: el PDF no sale
  let descargas=0;p.on('download',()=>{descargas++;});
  await p.evaluate(()=>{flyerHistory.unshift({v:getVals(),fn:'conRotura',thumb:'',hora:'1:00',ts:3,ac:0,opt:10});fgRedlPDF(0);});
  await p.waitForTimeout(2500);
  ok(descargas===0,'historial: si el flyer de esa opción no carga, el PDF no sale con otra imagen');
  await p.evaluate(()=>switchFlyerOption(9));
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();

  // 6) la elección automática no manda una empresa a una opción SIN imagen
  nube.json['_active10.json']={name:'',imageUrl:null};
  cae10=false;
  const p2=await abrir(browser,{rol:'asesor',antes});
  await p2.evaluate(()=>_optMetasPrecarga());
  await p2.waitForFunction(()=>_fgOptMeta[10]===false,null,{timeout:8000});
  const r6=await p2.evaluate(async(sin)=>{
    const dest=[_fgVarianteSinCB(9),_pgOptDe(sin)];
    _padApply(sin);await new Promise(r=>setTimeout(r,1500));
    return {dest,opt:_optN(_fgOpt),cartel:!!document.getElementById('fg-flyer-falla'),emp:document.getElementById('empresa').value};
  },sin);
  ok(r6.dest[0]===0&&r6.dest[1]===9,'sin imagen en la 10: no se la elige para las empresas sin cashback');
  ok(r6.opt===9&&!r6.cartel&&r6.emp==='SIN CB S.A.','la lupa se queda en la 9, sin cartel de error, con la empresa cargada');
  await p2.context().close();
};
