// Días de los súper: Activas los muestra, la ventana de un logo trae el tilde y
// al poner un súper se reemplaza el texto de días de abajo (pegado o separado).
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const sup=_promosCat.filter(x=>x.subtitulo==='Supermercados'&&x.dias&&x.imagen);
    const otra=_promosCat.find(x=>x.subtitulo!=='Supermercados'&&x.dias);
    const out={nSup:sup.length};
    out.filaSuper=_promoFilaHtml({promo:sup[0],estado:'VIGENTE'},0).includes('promos-dias');
    out.filaOtra=otra?_promoFilaHtml({promo:otra,estado:'VIGENTE'},0).includes('promos-dias'):false;
    // ventana: el tilde está y viene marcado
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const ch=document.getElementById('fg-lg-dias');out.tilde=!!(ch&&ch.checked);
    document.getElementById('fg-lg-x').click();
    // ── en un flyer de prueba: logo negro y "días" debajo ──
    const real=window.baseImg,c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,800,600);
    g.fillStyle='#222';g.fillRect(60,60,200,80);          // logo A
    g.fillStyle='#e8312a';g.font='bold 22px Arial';g.fillText('Lunes y martes',80,172); // días A (separados)
    g.fillStyle='#222';g.fillRect(400,60,200,80);
    g.fillStyle='#e8312a';g.fillText('Viernes',450,158);   // días B (pegados: entran en la detección)
    window.baseImg=c;
    const bg='rgb(255,255,255)';
    const A=_fgLgPartirDias({x:56,y:56,w:208,h:88,bg});
    const B=_fgLgPartirDias({x:396,y:56,w:208,h:110,bg});
    out.A=A.texto&&{y:Math.round(A.texto.y),h:Math.round(A.texto.h)};
    out.B={logoH:Math.round(B.logo.h),texto:B.texto&&{y:Math.round(B.texto.y),h:Math.round(B.texto.h)}};
    window.baseImg=real;
    // ── en el flyer real: poner un súper deja logo + texto con sus días ──
    const logo=await _fgLgTraer(sup[0].imagen);
    const n0=_fgLgActivos().length;
    const puso=_fgLgPonerMarca(_fgLgManual(140,2650,300,110),sup[0],logo,true);
    const L=_fgLgActivos(),txt=L.find(e=>e.tipo==='txt');
    out.puso=puso;out.txt=txt&&txt.texto;out.dias=_promoDias(sup[0]);out.nuevos=L.length-n0;
    out.selEsLogo=L[_fgLg.sel]&&L[_fgLg.sel].img===sup[0].imagen;
    // sin el tilde: sólo el logo
    fgLgDeshacer&&0;
    _fgLg.list=[];_fgLgListo();
    _fgLgPonerMarca(_fgLgManual(140,2650,300,110),sup[0],logo,false);
    out.sinTilde=_fgLgActivos().filter(e=>e.tipo==='txt').length;
    return out;
  });
  console.log('  ',JSON.stringify(r));
  ok(r.nSup>0,'la nube de prueba trae súper con días ('+r.nSup+')');
  ok(r.filaSuper&&!r.filaOtra,'Activas muestra los días en los súper (y no en otros rubros)');
  ok(r.tilde,'la ventana de un logo trae el tilde de días marcado');
  ok(r.A&&r.A.y>=150&&r.A.y<=160,'encuentra el texto de días separado debajo del logo');
  ok(r.B.texto&&r.B.logoH<=90&&r.B.texto.y>=140,'separa el texto de días pegado al logo');
  ok(r.puso&&r.txt===r.dias&&r.nuevos===2,'poner un súper con el tilde deja el logo y sus días ('+r.txt+')');
  ok(r.selEsLogo,'queda elegido el logo');
  ok(r.sinTilde===0,'sin el tilde, sólo el logo');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
