// "Sugerir marcas" en Armar franja
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  // provincia Neuquén
  await p.evaluate(()=>{const st=_fgFrSt;st.prov='NEUQUEN';st.loc='';_fgFrLista();});
  // una elegida a mano antes
  await p.click('#fg-fr-list .fg-lg-it:not(.fg-fr-on)');await p.waitForTimeout(500);
  const antes=await p.evaluate(()=>_fgFrSt.sel.map(s=>s.img));
  await p.click('#fg-fr-sug');
  await p.waitForFunction(()=>_fgFrSt.sel.some(s=>s.sug),null,{timeout:30000});await p.waitForTimeout(400);
  const R=await p.evaluate(()=>{
    const st=_fgFrSt,porImg={};(_promosCat||[]).forEach(p=>{porImg[p.imagen]=p;});
    const sug=st.sel.filter(s=>s.sug).map(s=>porImg[s.img]);
    return {n:st.sel.length,meta:st.info.n,primero:st.sel[0].img,
      rubros:[...new Set(sug.map(p=>p&&p.subtitulo))].length,
      marcas:sug.map(p=>_promoClaveMarca(_promoBaseMarca(p.titulo),{})),
      online:sug.map(p=>_promoEsOnline(p)),
      enProv:sug.every(p=>_promoEnProvincia(p,'NEUQUEN')||_promoEsOnline(p))};
  });
  console.log('  sugeridas:',JSON.stringify({n:R.n,meta:R.meta,rubros:R.rubros,online:R.online}));
  ok(R.n===Math.min(R.meta||8,30),'completa los lugares de la franja ('+R.n+' de '+R.meta+')');
  ok(R.primero===antes[0],'respeta la que ya estaba elegida (sigue primera)');
  ok(new Set(R.marcas).size===R.marcas.length,'no repite marca');
  ok(R.rubros>=3,'variedad de rubros ('+R.rubros+' distintos)');
  ok(R.enProv,'todas son de Neuquén (o online)');
  const iOn=R.online.indexOf(true);ok(iOn<0||R.online.slice(iOn).every(x=>x),'las online van al final');
  ok(await p.isVisible('#fg-fr-qsug')&&(await p.$$eval('#fg-fr-sel .fg-fr-sugmark',x=>x.length))===R.n-1,'las sugeridas se marcan con ✨ y aparece "Quitar sugeridas"');
  await p.screenshot({path:__dirname+'/capturas/t47_sugerir.png'});
  await p.click('#fg-fr-qsug');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>_fgFrSt.sel.length)===1,'"Quitar sugeridas" deja sólo la elegida a mano');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
