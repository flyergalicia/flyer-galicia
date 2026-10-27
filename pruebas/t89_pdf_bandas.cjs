// Convertir un PDF a imagen: bandas de 3600 salen igual que las de 1600 (las de antes),
// en menos tiempo, y la pantalla responde entre banda y banda.
// Usa PDF reales de flyers que NO se versionan (repo público): se pasan con
// FG_PDFS="ruta1;ruta2". Sin la variable, la prueba avisa y no compara nada.
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const L=(process.env.FG_PDFS||'').split(';').filter(f=>f&&fs.existsSync(f));
  if(!L.length){console.log('  (sin FG_PDFS: no hay PDF para comparar)');return;}
  const p=await abrir(browser,{rol:'admin'});
  for(const f of L){
    const b64=fs.readFileSync(f).toString('base64'),nom=f.split(/[\/]/).pop();
    const r=await p.evaluate(async([b64,nom])=>{
      const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],nom,{type:'application/pdf'});
      async function con(h){window._FG_BAND_H=h;const t=performance.now();let pausas=0,ult=performance.now(),max=0;
        const iv=setInterval(()=>{const a=performance.now();max=Math.max(max,a-ult);ult=a;pausas++;},20);
        const c=await new Promise(res=>_rasterizeFlyer(file,(b,cv)=>res(cv)));clearInterval(iv);
        return {c,ms:Math.round(performance.now()-t),pausas,max:Math.round(max)};}
      const a=await con(1600),b=await con(3600);
      if(!a.c||!b.c)return {err:true};
      const W=a.c.width,H=Math.min(a.c.height,b.c.height),da=a.c.getContext('2d').getImageData(0,0,W,H).data,db=b.c.getContext('2d').getImageData(0,0,W,H).data;
      let d=0,n=0,malas=0;for(let y=0;y<H;y+=2){let fila=0;for(let x=0;x<W;x+=4){const i=(y*W+x)*4;const q=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);d+=q;fila+=q;n++;}if(fila/(W/4)>30)malas++;}
      return {H:a.c.height,H2:b.c.height,t1600:a.ms,t3600:b.ms,maxTraba1600:a.max,maxTraba3600:b.max,dif:+(d/n).toFixed(2),filasDistintas:malas};
    },[b64,nom]);
    console.log('  '+nom+':',JSON.stringify(r));
    ok(!r.err&&r.H===r.H2,nom+': sale del mismo alto');
    ok(!r.err&&r.dif<1.5&&r.filasDistintas<10,nom+': la imagen es la misma que con bandas de 1600 (diferencia '+r.dif+')');
    ok(!r.err&&r.t3600<=r.t1600*1.1,nom+': no tarda más ('+r.t1600+' → '+r.t3600+' ms)');
  }
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
  await p.context().close();
};
