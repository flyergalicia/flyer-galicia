// Días de los súper sobre el flyer de prueba real (sección "25% de ahorro en
// supermercados", con los días debajo de cada logo): reemplazar Jumbo por otro
// súper deja el logo nuevo y SUS días en el lugar del texto viejo.
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
const recorte=(p,f)=>p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=560;c.height=480;c.getContext('2d').drawImage(fc,640,1220,560,480,0,0,560,480);return c.toDataURL('image/png');}).then(u=>fs.writeFileSync(__dirname+'/capturas/'+f,Buffer.from(u.split(',')[1],'base64')));
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await recorte(p,'t63_antes.png');
  const r=await p.evaluate(async()=>{
    const det=_fgLgDetectar(730,1310);
    const pt=_fgLgPartirDias(det);
    let sup,logo;for(const x of _promosCat){if(x.subtitulo!=='Supermercados'||!x.dias||!x.imagen||/jumbo/i.test(x.titulo))continue;try{logo=await _fgLgTraer(x.imagen);sup=x;break;}catch(e){}}
    const puso=_fgLgPonerMarca(det,sup,logo,true);
    const txt=_fgLgActivos().find(e=>e.tipo==='txt');
    return {det:[det.x,det.y,det.w,det.h],texto:pt.texto&&[pt.texto.x,pt.texto.y,pt.texto.w,pt.texto.h],sup:sup.titulo,dias:_promoDias(sup),puso,txt:txt&&{t:txt.texto,fs:txt.fs,color:txt.color}};
  });
  console.log('  ',JSON.stringify(r));
  await recorte(p,'t63_despues.png');
  ok(!!r.texto,'encuentra el texto de días debajo de Jumbo');
  ok(r.puso&&r.txt&&r.txt.t===r.dias,'pone '+r.sup+' con sus días ('+r.dias+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
