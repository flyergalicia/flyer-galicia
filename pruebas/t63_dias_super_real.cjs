// Días de los súper sobre el flyer de prueba real (grilla "25% de ahorro en
// supermercados", con los días debajo de cada logo). Revisado con Codex y Gemini:
// el texto se busca debajo del logo (no adentro), también en la fila de logos
// bajos y anchos; la letra y el color salen del texto original; sólo los días del
// % de descuento (Coto: "Martes", no "Todos los días" de las cuotas).
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const recorte=(p,f)=>p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=600;c.height=480;c.getContext('2d').drawImage(fc,620,1220,600,480,0,0,600,480);return c.toDataURL('image/png');}).then(u=>fs.writeFileSync(__dirname+'/capturas/'+f,Buffer.from(u.split(',')[1],'base64')));
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await recorte(p,'t63_antes.png');
  const r=await p.evaluate(async()=>{
    const sup=n=>_promosCat.find(q=>q.subtitulo==='Supermercados'&&_promoNormalizar(q.titulo).replace(/ /g,'')===n);
    const out={coto:_promoDias(sup('coto')),jumbo:_promoDias(sup('jumbo')),dia:_promoDias(sup('dia'))};
    // Disco (redondo, con "cencosud" adentro) -> Vea; Jumbo -> Coto; Toledo y Makro (bajos y anchos) -> ChangoMás y DIA
    const pares=[[905,1310,'vea'],[730,1310,'coto'],[710,1465,'changomas'],[830,1465,'dia']];
    out.res=[];
    for(const [x,y,n] of pares){
      const det=_fgLgDetectar(x,y),s=sup(n),logo=await _fgLgTraer(s.imagen);
      const pt=_fgLgPartirDias(det);
      out.res.push({n,textoAbajo:!!pt.texto&&pt.texto.y>=det.y+det.h,puso:_fgLgPonerMarca(det,s,logo,true)});
    }
    _fgLg.sel=-1;_fgLgListo();
    const L=_fgLgActivos(),T=L.filter(e=>e.tipo==='txt'),I=L.filter(e=>e.img&&e.tipo!=='txt');
    out.textos=T.map(e=>({t:e.texto,fs:e.fs,peso:e.peso,color:e.color,cx:Math.round(e.tx+e.tw/2),y:Math.round(e.ty)}));
    out.logos=I.map(e=>({n:e.t,cx:Math.round(e.tx+e.tw/2),ab:Math.round(e.ty+e.th)}));
    return out;
  });
  console.log('  ',JSON.stringify(r));
  await recorte(p,'t63_despues.png');
  ok(r.coto==='Martes','Coto: sólo los días del % de descuento ("'+r.coto+'")');
  ok(r.dia==='Viernes y sábados','DIA: "Viernes y Sábado" sale como en el flyer ("'+r.dia+'")');
  ok(r.res.every(x=>x.textoAbajo&&x.puso==='dias'),'en las dos filas encuentra el texto de días DEBAJO del logo y lo reemplaza');
  ok(r.textos.length===4&&r.textos.every(t=>t.fs>=20&&t.fs<=24&&t.peso===500),'los 4 textos con la letra del original (20-24 px), sin negrita');
  ok(r.textos.every(t=>/^#[0-3]/.test(t.color)),'color oscuro como el original');
  ok(r.textos.every((t,i)=>Math.abs(t.cx-r.logos[i].cx)<=3),'cada texto centrado bajo su logo');
  ok(r.textos.every((t,i)=>t.y>=r.logos[i].ab-2),'ningún texto encima de su logo');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
