// Si la imagen de un flyer no llega, NUNCA se queda la imagen de otra opción con la
// calibración de ésta: cartel con Reintentar, vista previa apagada y descarga frenada.
// Distingue "esa opción no tiene flyer" (dato firme) de "no se pudo traer" (red).
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const REF='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/';

// opción 11: con imagen (flyer_t7, ?v=11) y calibración propia; opción 12: sin flyer cargado
const a11=JSON.parse(JSON.stringify(nube.json['_active9.json']));
a11.imageUrl=REF+'flyer_t7.jpg?v=11';a11.name='Once';a11.cfg=Object.assign({},a11.cfg||{},{__once:true});
nube.json['_active11.json']=a11;
nube.json['_legal11.json']={text:'Legal 11'};
nube.json['_active12.json']={name:'',imageUrl:null};
nube.json['_legal12.json']={text:'Legal 12'};
nube.json['_opciones.json'].opts.push({n:11,nombre:'Once',solapa:'flyer'},{n:12,nombre:'Doce',solapa:'flyer'});
Object.assign(nube.json['_facultades.json'].roles.asesor,{opcion_11:true,opcion_12:true});

const esFlyer11=u=>u.href.includes('flyer_t7.jpg')&&u.search.includes('v=11');
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  let cae11=true,cae12meta=false;
  await p.route(esFlyer11,r=>cae11?r.abort('connectionreset'):r.fallback());
  await p.route('**/object/public/flyers/_active11.json**',r=>cae12meta?r.abort('connectionreset'):r.fallback());
  const baseTxt=await p.evaluate(()=>({cfg9:JSON.stringify(_fgOptCache[9].cfg),img9:_fgOptCache[9].img===baseImg}));
  ok(baseTxt.img9,'arranca en la opción 9 con su imagen');

  // 1) la imagen de la opción 11 no llega
  await p.evaluate(()=>switchFlyerOption(11));
  await p.waitForSelector('#fg-flyer-falla',{timeout:8000});
  const r1=await p.evaluate(()=>({
    txt:document.getElementById('fg-flyer-falla').innerText,
    loaded:_fgOptCache[11].loaded,
    mismaImg:baseImg===_fgOptCache[9].img,
    cfg:JSON.stringify(FLYER_CFG),
    bloqueo:_fgDescargaBloqueo(),lista:_fgOptLista(11),
    apagada:document.querySelector('.cw').classList.contains('fg-cw-falla'),
    gate:_fgPrevGate}));
  ok(/No se pudo cargar el flyer/.test(r1.txt)&&/Reintentar/.test(r1.txt),'cartel "No se pudo cargar el flyer" con Reintentar ('+r1.txt.replace(/\n/g,' ').slice(0,90)+')');
  ok(r1.loaded===false,'la opción 11 NO queda marcada como cargada (se reintenta)');
  ok(r1.mismaImg&&r1.cfg===baseTxt.cfg9,'no se mezcla: sigue la imagen y la calibración de la opción 9, sin tocar');
  ok(/No se pudo cargar el flyer/.test(r1.bloqueo)&&r1.lista===false,'la descarga queda frenada con su motivo ('+r1.bloqueo+')');
  ok(r1.apagada,'la vista previa se apaga mientras tanto');

  // 2) volver a la 11 más tarde: vuelve a avisar (antes: flyer mal y sin aviso)
  await p.evaluate(()=>switchFlyerOption(9));
  await p.waitForFunction(()=>!document.getElementById('fg-flyer-falla'),null,{timeout:8000});
  await p.evaluate(()=>switchFlyerOption(11));
  await p.waitForSelector('#fg-flyer-falla',{timeout:8000});
  ok(true,'al volver a la 11 el cartel aparece otra vez');
  const r2=await p.evaluate(()=>({mismaImg:baseImg===_fgOptCache[9].img}));
  ok(r2.mismaImg,'sigue sin mezclar imágenes');

  // 3) vuelve la red y se toca Reintentar
  cae11=false;
  await p.click('#fg-flyer-falla button');
  await p.waitForFunction(()=>!document.getElementById('fg-flyer-falla')&&_fgOptCache[11]&&_fgOptCache[11].img&&baseImg===_fgOptCache[11].img,null,{timeout:10000});
  const r3=await p.evaluate(()=>({bloqueo:_fgDescargaBloqueo(),lista:_fgOptLista(11),cfg:JSON.stringify(FLYER_CFG),apagada:document.querySelector('.cw').classList.contains('fg-cw-falla')}));
  ok(r3.bloqueo===''&&r3.lista===true,'Reintentar: se carga la 11 y se puede descargar');
  ok(/__once/.test(r3.cfg),'Reintentar: ahora sí queda la calibración de la 11');
  ok(!r3.apagada,'la vista previa se vuelve a encender');

  // 4) opción SIN flyer cargado (dato firme): el asesor no puede subirlo
  await p.evaluate(()=>switchFlyerOption(12));
  await p.waitForSelector('#fg-flyer-falla',{timeout:8000});
  const r4=await p.evaluate(()=>({txt:document.getElementById('fg-flyer-falla').innerText,loaded:_fgOptCache[12].loaded,meta:_optTieneImg(12),bloqueo:_fgDescargaBloqueo()}));
  ok(/todav[ií]a no tiene flyer/.test(r4.txt)&&/administrador/.test(r4.txt)&&!/subilo/.test(r4.txt),'asesor: "todavía no tiene flyer · avisale al administrador" ('+r4.txt.replace(/\n/g,' ').slice(0,100)+')');
  ok(r4.loaded===true&&r4.meta===false,'"sin flyer" es un dato firme (se anota, _optTieneImg=false)');
  ok(/administrador/.test(r4.bloqueo),'la descarga explica por qué no');
  await p.evaluate(()=>switchFlyerOption(9));
  await p.waitForFunction(()=>!document.getElementById('fg-flyer-falla'),null,{timeout:8000});

  // 5) el JSON de la opción no llega (red): NO es "no tiene flyer"
  cae12meta=true;
  await p.evaluate(()=>{delete _fgOptCache[11];switchFlyerOption(11);});
  await p.waitForSelector('#fg-flyer-falla',{timeout:8000});
  const r5=await p.evaluate(()=>document.getElementById('fg-flyer-falla').innerText);
  ok(/No se pudo cargar/.test(r5)&&!/todav[ií]a no tiene flyer/.test(r5),'si no llega el JSON de la opción dice que no se pudo cargar, no "sin flyer" ('+r5.replace(/\n/g,' ').slice(0,80)+')');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();

  // 6) ingreso con la imagen de la opción que le toca caída
  const fac=nube.json['_facultades.json'].roles.asesor;
  const p2=await abrir(browser,{rol:'asesor',sinEsperar:true,antes:async q=>{await q.route(u=>u.href.includes('flyer_t9.jpg'),r=>r.abort('connectionreset'));}});
  await p2.waitForSelector('#fg-flyer-falla',{timeout:25000});
  const r6=await p2.evaluate(()=>({gate:_fgPrevGate,bloqueo:_fgDescargaBloqueo(),me:!!_me,login:document.getElementById('login-ov').style.display}));
  ok(r6.gate===false,'ingreso con la imagen caída: la pantalla no queda trabada');
  ok(/No se pudo cargar el flyer/.test(r6.bloqueo),'ingreso: avisa en vez de mostrar otra imagen ('+r6.bloqueo+')');
  ok(r6.me&&r6.login==='none','ingreso: la sesión sigue abierta');
  await p2.context().close();

  // 7) opción 1 (flyer vigente de siempre) con la imagen caída
  fac.opcion_1=true;fac.opcion_9=false;fac.opcion_11=false;fac.opcion_12=false;
  nube.json['_active.json']={name:'Vigente',imageUrl:REF+'flyer_t6.jpg?v=3'};
  const p3=await abrir(browser,{rol:'asesor',sinEsperar:true,antes:async q=>{await q.route(u=>u.href.includes('flyer_t6.jpg'),r=>r.abort('connectionreset'));}});
  await p3.waitForSelector('#fg-flyer-falla',{timeout:25000});
  const r7=await p3.evaluate(()=>({bloqueo:_fgDescargaBloqueo(),loaded:_fgOptCache[1]&&_fgOptCache[1].loaded}));
  ok(/No se pudo cargar el flyer/.test(r7.bloqueo),'opción 1 con la imagen caída: cartel, no la imagen de ejemplo en silencio ('+r7.bloqueo+')');
  await p3.context().close();

  // 8) opción 1 con la imagen sana: sin cartel
  const p4=await abrir(browser,{rol:'asesor',sinEsperar:true});
  await p4.waitForFunction(()=>window._fgOpt===1&&window._fgOptCache&&_fgOptCache[1]&&_fgOptCache[1].img&&baseImg===_fgOptCache[1].img&&_fgPrevGate===false,null,{timeout:25000});
  const r8=await p4.evaluate(()=>({falla:!!document.getElementById('fg-flyer-falla'),bloqueo:_fgDescargaBloqueo(),loaded:_fgOptCache[1].loaded}));
  ok(!r8.falla&&r8.bloqueo===''&&r8.loaded===true,'opción 1 sana: sin cartel y se puede descargar ('+JSON.stringify(r8)+')');
  await p4.context().close();

  // 9) opción 1 sin flyer cargado (dato firme)
  nube.json['_active.json']={name:'',imageUrl:null};
  const p5=await abrir(browser,{rol:'asesor',sinEsperar:true});
  await p5.waitForSelector('#fg-flyer-falla',{timeout:25000});
  const r9=await p5.evaluate(()=>document.getElementById('fg-flyer-falla').innerText);
  ok(/todav[ií]a no tiene flyer/.test(r9)&&/administrador/.test(r9),'opción 1 sin flyer: "todavía no tiene flyer · avisale al administrador" ('+r9.replace(/\n/g,' ').slice(0,90)+')');
  await p5.context().close();
};
