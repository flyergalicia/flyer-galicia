const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgLgV.prov='NEUQUEN';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-act');await p.click('#fg-fr-act');await p.waitForSelector('.promos-elegir',{timeout:15000});
  await p.click('.promos-view .ptab >> nth=0'); // Buscar
  await p.waitForTimeout(300);
  ok(await p.isVisible('#fg-elegir-bar'),'la barra sigue al pasar a Buscar');
  await p.fill('#promos-marcas','Freddo\nStarbucks\nPuppis\nLa Anonima\nMarca que no existe');
  await p.click('#promos-validar-btn');
  await p.waitForSelector('#promos-tbody tr',{timeout:20000});await p.waitForTimeout(1500);
  const filas=await p.$$eval('#promos-tbody tr',tr=>tr.map(t=>{const b=t.querySelector('.promos-elegir');return (t.children[2]||{}).textContent+' → '+(b?(b.disabled?'+ apagado ('+b.title+')':'+'):'(sin +)')+' · '+((t.querySelector('.promos-badge')||{}).textContent||'');}));
  console.log('  '+filas.join('\n  '));
  const n0=await p.evaluate(()=>_fgElegir.st.sel.length);
  // tocar todos los + habilitados
  const cuantos=await p.$$eval('.promos-elegir:not(:disabled):not(.on)',b=>b.length);
  for(let i=0;i<cuantos;i++){await p.click('.promos-elegir:not(:disabled):not(.on) >> nth=0');await p.waitForTimeout(80);}
  const sel=await p.evaluate(()=>_fgElegir.st.sel.map(s=>s.t));
  console.log('  elegidas:',sel.join(' | '));
  ok(sel.length===n0+cuantos&&cuantos>0,'desde Buscar se eligen con + ('+cuantos+')');
  // un + apagado no hace nada
  const apagado=await p.$('.promos-elegir:disabled');
  if(apagado){await p.evaluate(()=>{const b=document.querySelector('.promos-elegir:disabled');b.disabled=false;b.click();});await p.waitForTimeout(100);
    ok(await p.evaluate((n)=>_fgElegir.st.sel.length===n,sel.length),'una vencida o de otra provincia no se puede elegir (ni forzando el clic)');}
  await p.screenshot({path:__dirname+'/capturas/t27_buscar.png'});
  await p.click('#fg-elegir-bar .btn.bp');await p.waitForSelector('#fg-fr-ov .fg-fr-it',{timeout:15000});
  const vent=await p.$$eval('#fg-fr-sel .fg-fr-it-t',x=>x.map(s=>s.textContent));
  ok(vent.join()===sel.join(),'al volver, la ventana trae lo elegido en Buscar');
  // fuera del modo elegir, Buscar vuelve a tener la casilla de excluir
  await p.click('#fg-fr-no');
  await p.evaluate(()=>switchApp('promos'));await p.waitForTimeout(300);
  ok(!(await p.$('.promos-elegir'))&&!!(await p.$('.promos-excl')),'sin elegir, la tabla de Buscar queda como siempre');
  console.log('  errores:',p.errores.length);
};
