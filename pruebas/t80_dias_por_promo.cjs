// Días de cada promo en Promociones (25-oct): la tabla y el Excel muestran los días
// de ESA promo (Coto "Hasta 12 cuotas" = Todos los días; Coto "25% de ahorro" =
// Martes). Antes todas las filas de Coto decían "Martes" porque usaban la cuenta del
// flyer, que junta las promos del súper y deja sólo los días del % (eso sigue igual).
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.evaluate(()=>{switchApp('promos');switchPromoTab('activas');});
  await p.selectOption('#promos-prov','BUENOS AIRES');
  await p.evaluate(()=>buscarPromosActivas());
  await p.waitForFunction(()=>document.querySelectorAll('.promos-table tbody tr').length>5,null,{timeout:15000});
  const filas=await p.evaluate(()=>[...document.querySelectorAll('.promos-table tbody tr')].map(tr=>{
    const c=tr.querySelector('.pc-promo');if(!c)return null;
    const t=c.childNodes[0]&&c.childNodes[0].textContent||'';
    const b=c.querySelector('.promos-benef'),d=c.querySelector('.promos-dias');
    return {t:t.trim(),b:b?b.textContent:'',d:d?d.textContent:''};
  }).filter(x=>x&&/^coto$/i.test(x.t)));
  const cuotas=filas.filter(f=>/cuotas/i.test(f.b)),pct=filas.filter(f=>/%/.test(f.b));
  ok(cuotas.length>=1&&cuotas.every(f=>f.d==='Todos los días'),'Coto en cuotas: "Todos los días", como en galicia.ar ('+JSON.stringify(cuotas)+')');
  ok(pct.length>=1&&pct.every(f=>f.d==='Martes'),'Coto 25% de ahorro: "Martes" ('+JSON.stringify(pct)+')');

  // El flyer sigue usando sólo los días del descuento en %
  const fl=await p.evaluate(()=>{const c=_promosCat.find(q=>/^coto$/i.test(q.titulo)&&/cuotas/i.test(q.beneficio||''));return {flyer:_promoDias(c),propios:_promoDiasPropios(c)};});
  ok(fl.flyer==='Martes'&&fl.propios==='Todos los días','en el flyer siguen yendo los días del % ("'+fl.flyer+'"); la promo en cuotas es "'+fl.propios+'"');

  // El texto va tal cual lo publica Galicia (sin reinterpretar)
  const fm=await p.evaluate(()=>[_promoDiasPropios({dias:'Todos los días excepto feriados'}),_promoDiasPropios({dias:'Viernes y Sábado '}),_promoDiasPropios({dias:''})]);
  ok(fm[0]==='Todos los días excepto feriados'&&fm[1]==='Viernes y Sábado'&&fm[2]==='','los días salen tal cual los publica Galicia ('+fm.join(' | ')+')');
  // Lista de marcas de Cambiar logos: los días de esa promo y, si difieren, los del flyer
  const sub=await p.evaluate(()=>{const c=_promosCat.find(q=>/^coto$/i.test(q.titulo)&&/cuotas/i.test(q.beneficio||''));return _fgPfSub(c);});
  ok(sub.includes('Todos los días (en el flyer: Martes)'),'lista de marcas: «Todos los días (en el flyer: Martes)» ('+sub.replace(/<[^>]+>/g,'')+')');

  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
