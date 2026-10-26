const {abrir,nube}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  const info=()=>p.textContent('#fg-fr-info');
  const n=()=>p.$$eval('#fg-fr-list .fg-lg-it',x=>x.length);
  console.log('  sin filtros:',await info());
  ok(!(await p.isVisible('#fg-fr-loc')),'sin provincia no se ofrece localidad');
  await p.selectOption('#fg-fr-prov','NEUQUEN');await p.waitForTimeout(300);
  console.log('  Neuquén (una por marca):',await info());
  ok(await p.isVisible('#fg-fr-loc'),'con provincia aparece el desplegable de localidades');
  const conUna=await p.evaluate(()=>_fgPfFiltrar(_fgFrSt,function(){}).lista.length);
  await p.uncheck('#fg-fr-una');await p.waitForTimeout(200);
  const sinUna=await p.evaluate(()=>_fgPfFiltrar(_fgFrSt,function(){}).lista.length);
  console.log('  Neuquén sin "una por marca":',await info());
  ok(sinUna>conUna,'"Juntar sucursales de la misma marca" junta variantes de la misma marca ('+sinUna+' → '+conUna+')');
  // ejemplo de marca agrupada
  console.log('  agrupadas (ej.):',JSON.stringify(await p.evaluate(()=>{const st=Object.assign({},_fgFrSt,{una:false,q:''});const t=_fgPfFiltrar(st,function(){}).lista.map(x=>x.titulo);const g={};const b={};t.forEach(x=>b[_promoBaseMarca(x)]=1);t.forEach(x=>{const k=_promoClaveMarca(_promoBaseMarca(x),b);(g[k]=g[k]||[]).push(x);});return Object.values(g).filter(v=>v.length>1).slice(0,3);})));
  await p.check('#fg-fr-una');await p.waitForTimeout(200);
  await p.check('#fg-fr-onl');await p.waitForTimeout(200);
  console.log('  Neuquén sin online:',await info());
  await p.uncheck('#fg-fr-onl');
  await p.selectOption('#fg-fr-loc','SAN MARTIN DE LOS ANDES');
  await p.waitForTimeout(100);
  console.log('  mientras busca:',(await p.textContent('#fg-fr-ov .fg-fr-izq')).slice(0,120).replace(/\s+/g,' '));
  await p.waitForTimeout(900);
  console.log('  San Martín de los Andes:',await info());
  const locIds=JSON.parse(require('fs').readFileSync(__dirname+'/datos/loc_ids.json','utf8'));
  const r=await p.evaluate((ids)=>{const L=_fgPfFiltrar(_fgFrSt,function(){}).lista;const set={};ids.forEach(i=>set[i]=1);return {total:L.length,deLaLocalidad:L.filter(x=>set[x.id]).length,online:L.filter(x=>_promoEsOnline(x)).length,otras:L.filter(x=>!set[x.id]&&!_promoEsOnline(x)).length};},locIds);
  console.log('  ',JSON.stringify(r));
  ok(r.otras===0,'en la localidad sólo quedan sus promos y las online');
  // la segunda vez no vuelve a preguntar
  const antes=nube.llamadasLoc;await p.selectOption('#fg-fr-loc','');await p.selectOption('#fg-fr-loc','SAN MARTIN DE LOS ANDES');await p.waitForTimeout(300);
  ok(nube.llamadasLoc===antes,'volver a elegir la misma localidad no le pregunta de nuevo a Galicia');
  await p.screenshot({path:__dirname+'/capturas/t22_franja.png'});
  // la ventana de un logo recuerda provincia/localidad y tiene los mismos filtros
  await p.click('#fg-fr-no');
  await p.evaluate(()=>{_fgLgAbrir(_fgLgDetectar(850,2708));});
  await p.waitForSelector('#fg-lg-ov .fg-lg-it',{timeout:15000});await p.waitForTimeout(300);
  console.log('  ventana de un logo:',await p.textContent('#fg-lg-info'),'| loc:',await p.inputValue('#fg-lg-loc'));
  ok(await p.inputValue('#fg-lg-prov')==='NEUQUEN'&&await p.inputValue('#fg-lg-loc')==='SAN MARTIN DE LOS ANDES','la ventana de un logo recuerda provincia y localidad');
  await p.screenshot({path:__dirname+'/capturas/t22_unlogo.png'});
  // modo texto esconde los filtros
  await p.click('#fg-lg-escribir');await p.waitForTimeout(100);
  ok(!(await p.isVisible('#fg-lg-chk')),'al escribir un texto se esconden los filtros');
  console.log('  errores:',p.errores.length);
};
