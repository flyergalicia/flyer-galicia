// La versión "sin cashback" se elige sola: lupa, Generar flyers del padrón y Masivo
const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  // una opción 10 = versión sin cashback de la 9
  const a9=nube.json['_active9.json'];
  const c10=JSON.parse(JSON.stringify(a9.cfg||{}));c10.montos=Object.assign({},c10.montos||{},{off:true});c10.cashback=Object.assign({},c10.cashback||{},{off:true});c10.recDe=9;
  nube.json['_active10.json']={name:'flyer_t9.jpg',imageUrl:a9.imageUrl.replace('?v=1','?v=2'),cfg:c10};
  nube.json['_legal10.json']={text:'Legal SIN cashback.'};
  nube.json['_opciones.json'].opts.push({n:10,nombre:'Combustible sin cashback',solapa:'flyer',sinCB:9});
  nube.json['_facultades.json'].roles.asesor.opcion_10=true;
  const p=await abrir(browser,{rol:'asesor'});
  ok(await p.evaluate(()=>_OPC[10]&&_OPC[10].sinCB===9&&_fgVarianteSinCB(9)===10&&_fgOptBase(10)===9),'la lista de opciones conserva el vínculo (sinCB)');
  ok(await p.evaluate(()=>_optN(_fgOpt))===9,'arranca en la original');
  const sin={empresa:'SIN CB S.A.',config:'',asesores:[{nombre:'Ana Pérez',celular:'11 5555 5555'}],rubro:''};
  const con={empresa:'CON CB S.A.',config:'BAU',asesores:[{nombre:'Juan Díaz',celular:'11 4444 4444'}],rubro:''};
  // lupa: sin cashback → versión sin cashback
  await p.evaluate((r)=>{_padApply(r);},sin);await p.waitForTimeout(1500);
  const A=await p.evaluate(()=>({o:_optN(_fgOpt),emp:document.getElementById('empresa').value,legal:document.getElementById('legal-text').value,sin:_fgSinImportes(),modal:!!document.getElementById('pad-upd')}));
  console.log('  lupa sin cashback:',JSON.stringify(A));
  ok(A.o===10&&A.emp==='SIN CB S.A.'&&A.sin,'empresa sin cashback: pasa sola a «Combustible sin cashback» y conserva lo cargado');
  ok(A.legal==='Legal SIN cashback.','con el legal de esa versión');
  ok(!A.modal,'sin el aviso amarillo ni el de rubro');
  await p.screenshot({path:__dirname+'/capturas/t43_sincb.png'});
  // lupa: con cashback → vuelve a la original
  await p.evaluate((r)=>{_padApply(r);},con);await p.waitForTimeout(1500);
  const B=await p.evaluate(()=>({o:_optN(_fgOpt),sin:_fgSinImportes(),cf:!!document.getElementById('fg-cf-ov'),m1:_fgMontoN(getVals(),1)}));
  ok(B.o===9&&!B.sin&&!B.cf&&B.m1,'empresa con cashback: vuelve sola a la original, con importes ('+B.m1+')');
  // Generar flyers del padrón: agrupa por versión
  ok(await p.evaluate((r)=>_pgOptDe(r[0])===10&&_pgOptDe(r[1])===9,[sin,con]),'"Generar flyers" del padrón manda a cada empresa a su versión');
  // Masivo: filas mezcladas
  const reg=await p.evaluate(async()=>{
    window.excelData=[{empresa:'A con',config:'BAU',asesor1_nombre:'X'},{empresa:'B sin',config:'',asesor1_nombre:'Y'},{empresa:'C con',config:'BAU',asesor1_nombre:'Z'},{empresa:'D sin',config:'SIN',asesor1_nombre:'W'}];
    const log=[];const fr=window.fullRes;window.fullRes=function(v){log.push(v.empresa+':'+_optN(_fgOpt)+':'+(_fgSinImportes()?'sin':'con'));return fr(v);};
    const bb=window._fgBajarBlob;let zipOk=false;window._fgBajarBlob=function(b,n){zipOk=n;};
    genAll();
    for(let i=0;i<80&&!zipOk;i++)await new Promise(r=>setTimeout(r,250));
    window.fullRes=fr;window._fgBajarBlob=bb;
    await new Promise(r=>setTimeout(r,1500));
    return {log,zipOk,fin:_optN(_fgOpt)};
  });
  console.log('  masivo:',JSON.stringify(reg));
  ok(reg.zipOk&&reg.log.length===4,'el Masivo genera las 4 filas');
  ok(reg.log.filter(x=>/sin$/.test(x)).every(x=>/^(B|D) sin:10:sin$/.test(x))&&reg.log.filter(x=>/:con$/.test(x)).length===2,'las filas sin cashback salen con la versión sin cashback y las demás con la original');
  ok(reg.fin===9,'al terminar vuelve a la opción de origen');
  // Masivo arrancando DESDE la versión sin cashback
  await p.evaluate(()=>new Promise(r=>switchFlyerOption(10,r)));await p.waitForTimeout(500);
  const reg2=await p.evaluate(async()=>{
    window.excelData=[{empresa:'A con',config:'BAU',asesor1_nombre:'X'},{empresa:'B sin',config:'',asesor1_nombre:'Y'}];
    const log=[];const fr=window.fullRes;window.fullRes=function(v){log.push(v.empresa+':'+_optN(_fgOpt)+':'+(_fgSinImportes()?'sin':'con'));return fr(v);};
    const bb=window._fgBajarBlob;let zipOk=false;window._fgBajarBlob=function(b,n){zipOk=n;};
    genAll();
    for(let i=0;i<80&&!zipOk;i++)await new Promise(r=>setTimeout(r,250));
    window.fullRes=fr;window._fgBajarBlob=bb;await new Promise(r=>setTimeout(r,1500));
    return {log,fin:_optN(_fgOpt)};
  });
  console.log('  masivo desde la versión sin cashback:',JSON.stringify(reg2));
  ok(reg2.log.includes('B sin:10:sin')&&reg2.log.includes('A con:9:con')&&reg2.fin===10,'desde la versión sin cashback: la empresa con cashback sale con la original y vuelve a la de origen');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
