// Recuadros de Cambiar logos: invisibles en reposo, tenues con el mouse sobre el flyer,
// entero el de abajo del mouse y el elegido; en pantalla táctil, tenues siempre.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const borde=(p,i)=>p.evaluate((i)=>{const m=document.querySelectorAll('#fg-lg-mk .fg-lg-marca')[i];return m?getComputedStyle(m).borderTopColor:'(no hay)';},i);
const transp=c=>/rgba\(0, 0, 0, 0\)|transparent/.test(c);
const tenue=c=>/rgba\(242, 97, 34, 0\.4\)/.test(c);
async function preparar(p){
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.evaluate(async()=>{
    let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}
    _fgLgPoner(_fgLgManual(140,2650,300,110),m.imagen,m.titulo,im); // un logo puesto
    _fgLgPoner(_fgLgManual(600,2650,200,110),'','');                 // un lugar vacío
    _fgLg.sel=-1;_fgLgListo();
  });
  await p.waitForTimeout(1500); // que termine el parpadeo
}
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await preparar(p);
  const n=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca').length);
  ok(n===2,'hay 2 recuadros ('+n+')');
  await p.mouse.move(5,5);await p.waitForTimeout(300);
  const r0=await borde(p,0),r1=await borde(p,1);
  ok(transp(r0)&&transp(r1),'sin el mouse encima no se ven ('+r0+' / '+r1+')');
  // mouse sobre el flyer, encima del lugar vacío
  await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca')[1].scrollIntoView({block:'center'}));await p.waitForTimeout(300);
  const box=await p.evaluate(()=>{const r=document.querySelectorAll('#fg-lg-mk .fg-lg-marca')[1].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await p.mouse.move(box.x,box.y);await p.waitForTimeout(300);
  const h0=await borde(p,0),h1=await borde(p,1);
  ok(tenue(h0),'con el mouse en el flyer, los demás tenues ('+h0+')');
  ok(!transp(h1)&&!tenue(h1),'el de abajo del mouse se ve entero ('+h1+')');
  await p.screenshot({path:__dirname+'/capturas/t51_hover.png'});
  await p.mouse.move(5,5);await p.waitForTimeout(300);await p.screenshot({path:__dirname+'/capturas/t51_reposo.png'});
  // elegido: sólido aunque el mouse se vaya
  await p.evaluate(()=>{_fgLg.sel=0;_fgLgListo();});await p.mouse.move(5,5);await p.waitForTimeout(1500);
  const e0=await p.evaluate(()=>{const m=document.querySelectorAll('#fg-lg-mk .fg-lg-marca')[0];const s=getComputedStyle(m);return s.borderTopStyle+' '+s.borderTopColor;});
  ok(/solid/.test(e0)&&!transp(e0),'el elegido se ve sólido ('+e0+')');
  // un cambio nuevo parpadea
  await p.evaluate(()=>{_fgLg.sel=-1;const L=_fgLgActivos();L[1].bg='#fff';_fgLgListo();});
  const fl=await p.evaluate(()=>document.querySelectorAll('#fg-lg-mk .fg-lg-marca.flash').length);
  ok(fl===1,'el recuadro recién cambiado parpadea ('+fl+')');
  console.log('  errores PC:',p.errores.length,p.errores.slice(0,3));
  // pantalla táctil
  const t=await abrir(browser,{rol:'asesor',w:390,h:844,touch:true});
  await preparar(t);
  const t0=await borde(t,0);
  ok(tenue(t0),'en pantalla táctil se ven tenues ('+t0+')');
  console.log('  errores celular:',t.errores.length,t.errores.slice(0,3));
};
