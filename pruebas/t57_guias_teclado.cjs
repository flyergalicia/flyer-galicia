// Con las flechas también aparecen las guías (y se van solas); "Ver limpio" se llama "Vista previa".
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.evaluate(async()=>{
    const ms=[];for(const x of _promosCat){if(ms.length>=2)break;if(!x.imagen)continue;try{ms.push([x,await _fgLgTraer(x.imagen)]);}catch(e){}}
    _fgLgPoner(_fgLgManual(140,2650,300,110),ms[0][0].imagen,ms[0][0].titulo,ms[0][1]);
    _fgLgPoner(_fgLgManual(600,2650,300,110),ms[1][0].imagen,ms[1][0].titulo,ms[1][1]);
    const L=_fgLgActivos();L[1].ty=L[0].ty+3;_fgLg.sel=1;_fgLg.grupo=[];_fgLgListo(); // a 3 px de quedar alineado arriba
    document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
  });
  await p.waitForTimeout(300);
  await p.keyboard.press('ArrowUp');await p.waitForTimeout(80);
  const g1=await p.evaluate(()=>{const g=document.querySelectorAll('#fg-lg-guias .fg-lg-guia');return {n:g.length,cerca:document.querySelectorAll('#fg-lg-guias .fg-lg-guia.cerca').length};});
  ok(g1.n>0,'con la flecha aparecen guías ('+g1.n+')');
  await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');await p.waitForTimeout(80);
  const g2=await p.evaluate(()=>({tecla:document.querySelectorAll('#fg-lg-guias .fg-lg-guia.tecla').length,dif:Math.abs(_fgLgActivos()[1].ty-_fgLgActivos()[0].ty)}));
  ok(g2.dif<0.5&&g2.tecla>0,'al quedar justo alineado, la línea se ve llena ('+g2.tecla+')');
  await p.waitForTimeout(1300);
  const g3=await p.evaluate(()=>document.querySelectorAll('#fg-lg-guias .fg-lg-guia').length);
  ok(g3===0,'las guías se van solas al soltar el teclado');
  const t=await p.evaluate(()=>{const b=document.getElementById('fg-lg-ver-t');return b?b.textContent:'';});
  ok(t==='Vista previa','el botón se llama "Vista previa" ('+t+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
