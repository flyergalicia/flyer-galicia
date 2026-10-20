// Respuestas que llegan tarde (revisión del 20-oct): nada se aplica en otro lugar
// del que se pidió, y un logo que no existe no se vuelve a pedir en cada tecla.
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});

  // 1) Elegir una marca y cerrar la ventana mientras baja su logo: no se aplica
  await p.route('https://www.galicia.ar/**',async r=>{await new Promise(x=>setTimeout(x,1500));r.continue();});
  await p.evaluate(()=>{_fgLg.imgs={};_fgLgAbrir(_fgLgManual(140,2650,300,110));});
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:15000});
  await p.click('#fg-lg-ov .fg-lg-it >> nth=0');await p.waitForTimeout(100);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(3000);
  ok(await p.evaluate(()=>_fgLgActivos().length===0),'cerrar la ventana mientras baja el logo: no se aplica');
  await p.unroute('https://www.galicia.ar/**');

  // 2) Un logo que ya no existe en galicia.ar se pide una vez, no en cada redibujado
  let pedidos=0;
  await p.route('https://www.galicia.ar/**',r=>{if(r.request().url().includes('no_existe_x.png')){pedidos++;return r.fulfill({status:404,body:''});}return r.continue();});
  await p.evaluate(async()=>{
    _fgLgPoner(_fgLgManual(140,2650,300,110),'no_existe_x.png','Ya no está',null);
    for(let i=0;i<15;i++){redrawNow();await new Promise(r=>setTimeout(r,40));}
  });
  await p.waitForTimeout(500);
  ok(pedidos===1,'logo inexistente: se pidió '+pedidos+' vez (antes, una por redibujado)');
  await p.evaluate(()=>{_fgLgLimpiar();});

  // 3) Guardar en Estudio, cerrar con Escape mientras responde y pasar a otro borrador:
  //    el diseño se guarda pero no convierte al borrador que quedó abierto
  await p.evaluate(()=>{_fgLgPoner(_fgLgManual(140,2650,300,110),'','',null);});
  await p.waitForTimeout(300);
  await p.route('**/rest/v1/flyer_disenos**',async r=>{if(r.request().method()!=='GET')await new Promise(x=>setTimeout(x,1500));r.fallback();});
  await p.evaluate(()=>fgEstGuardar());await p.waitForSelector('#fg-est-nom');
  await p.fill('#fg-est-nom','Diseño lento');await p.click('#fg-est-ok');await p.waitForTimeout(100);
  await p.keyboard.press('Escape');
  const b0=await p.evaluate(()=>{const a=_fgProtoAct;fgBorradorNuevo();return a;});
  await p.waitForTimeout(600);const b2=await p.evaluate(()=>_fgProtoAct);console.log("  borrador al guardar:",b0,"/ abierto después:",b2);
  await p.waitForTimeout(3000);
  const est=await p.evaluate((id)=>{const pa=_fgProtos.find(x=>x.id===id);return {act:_fgProtoAct,temp:!!(pa&&pa.temp),nombre:pa?pa.nombre:null,proy:_fgLg.proy&&_fgLg.proy.nombre};},b2);
  ok(nube.disenos.length===1,'el diseño quedó guardado ('+nube.disenos.length+')');
  ok(est.act===b2&&est.temp&&est.nombre!=='Diseño lento'&&est.proy!=='Diseño lento','el borrador abierto después no toma el diseño guardado ('+JSON.stringify(est)+')');

  // 4) Legal: una negrita fija ANTES de una **negrita** marcada no se pierde
  const neg=await p.evaluate(()=>fgSplitBold('(1) Promoción del 100% de ahorro. Válido con tope de **$5.000 por mes** en comercios.').filter(s=>s.bold).map(s=>s.text.trim()));
  ok(neg.length===2&&neg[0].startsWith('(1)'),'legal: las dos negritas se ven ('+JSON.stringify(neg)+')');

  // 5) Descargar un flyer con otra cantidad de oficiales no corre los toques de la pantalla
  const ex=await p.evaluate(()=>{redrawNow();const a=_fgExtra,b=window._fgContentBottomBase;
    const v=Object.assign(getVals(),{has1:true,nombre:'A',has2:true,nombre2:'B',has3:true,nombre3:'C',has4:true,nombre4:'D'});
    const c=fullRes(v);return {a,b,d:_fgExtra,e:window._fgContentBottomBase,h:c.height,h0:cv.height/SC};});
  ok(ex.a===ex.d&&ex.b===ex.e,'después de descargar, la pantalla sigue con sus valores ('+JSON.stringify(ex)+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
