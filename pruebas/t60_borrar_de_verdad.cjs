// Tacho / Supr borra (el lugar queda vacío, no vuelve el original); tocar un lugar
// borrado abre "Agregar acá" sin "Mover lo que hay"; "Original" vuelve al original.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.evaluate(async()=>{
    let m,im;for(const x of _promosCat){if(!x.imagen)continue;try{im=await _fgLgTraer(x.imagen);m=x;break;}catch(e){}}
    window.__m=[m,im];
    _fgLgPoner(_fgLgManual(140,2650,300,110),m.imagen,m.titulo,im);
    document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
  });
  await p.waitForTimeout(200);
  await p.keyboard.press('Delete');await p.waitForTimeout(200);
  const r1=await p.evaluate(()=>{const L=_fgLgActivos();return {n:L.length,vacio:L[0]&&!L[0].img&&L[0].w>0};});
  ok(r1.n===1&&r1.vacio,'Supr deja el lugar vacío (tapado), no vuelve el logo original');
  const r2=await p.evaluate(()=>{
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const o={titulo:document.getElementById('fg-lg-t').textContent,mover:!!document.getElementById('fg-lg-mover'),nada:!!document.getElementById('fg-lg-nada')};
    document.getElementById('fg-lg-x').click();return o;
  });
  ok(r2.titulo==='Agregar acá'&&!r2.mover,'tocar el lugar borrado: "Agregar acá" sin "Mover lo que hay" ('+r2.titulo+')');
  ok(!r2.nada,'y sin "Dejar el lugar vacío" (ya lo está)');
  // una copia se va del todo; el botón Original vuelve al original
  const r3=await p.evaluate(()=>{
    const [m,im]=window.__m;_fgLg.list=[];_fgLgListo();
    _fgLgPoner(_fgLgManual(140,2650,300,110),m.imagen,m.titulo,im);
    _fgLgCopiar(true);_fgLgPegar();               // queda elegida la copia
    _fgLgBorrarElegidos();
    const n1=_fgLgActivos().length;
    _fgLg.sel=0;_fgLgListo();
    const b=document.querySelector('#fg-lg-herr button[data-a=original]'),t=document.querySelector('#fg-lg-herr button[data-a=quitar]');
    const tit=t&&t.title;b.click();
    return {n1,n2:_fgLgActivos().length,tit};
  });
  ok(r3.n1===1,'borrar una copia la saca del todo (queda sólo el original cambiado)');
  ok(r3.n2===0,'el botón "Original" vuelve al original');
  ok(/Borrar/.test(r3.tit||''),'el tacho dice "Borrar" ('+r3.tit+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
