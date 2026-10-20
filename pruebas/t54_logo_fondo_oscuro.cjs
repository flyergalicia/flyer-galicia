// Logo con fondo oscuro (Toledo real del catálogo: letras blancas en un cuadrado
// azul): se pinta del azul y sin el cuadrado; uno oscuro con colores queda entero.
const {abrir}=require('./nube.cjs');
const fs=require('fs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const b64=fs.readFileSync(__dirname+'/datos/logo_toledo.png').toString('base64');
  const r=await p.evaluate(async(b64)=>{
    const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='data:image/png;base64,'+b64;});
    const L=_fgLgLimpiarLogo(im),d=L.getContext('2d').getImageData(0,0,L.width,L.height).data;
    let opacos=0,claros=0,azules=0;
    for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;opacos++;if(d[i]>190&&d[i+1]>190&&d[i+2]>190)claros++;if(d[i+2]>d[i]&&d[i]<80)azules++;}
    // muestra sobre blanco, para la captura
    const c=document.createElement('canvas');c.width=L.width*3+40;c.height=L.height*3+40;const g=c.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.imageSmoothingQuality='high';g.drawImage(L,20,20,L.width*3,L.height*3);
    // cuadrado oscuro con un dibujo de colores: se deja entero
    const k=document.createElement('canvas');k.width=200;k.height=200;const gk=k.getContext('2d');
    gk.fillStyle='#1d2a44';gk.fillRect(0,0,200,200);gk.fillStyle='#e8312a';gk.fillRect(40,60,120,40);gk.fillStyle='#f5c400';gk.fillRect(40,110,120,30);
    const K=_fgLgLimpiarLogo(k),dk=K.getContext('2d').getImageData(0,0,K.width,K.height).data;
    return {w:L.width,h:L.height,opacos,claros,azules,esquina:d[3],png:c.toDataURL('image/png'),color:{w:K.width,a:dk[3]}};
  },b64);
  fs.writeFileSync(__dirname+'/capturas/t54_toledo.png',Buffer.from(r.png.split(',')[1],'base64'));
  console.log('  ',JSON.stringify({w:r.w,h:r.h,opacos:r.opacos,claros:r.claros,azules:r.azules,color:r.color}));
  ok(r.w<170&&r.h<80,'el cuadrado azul se fue: queda sólo la palabra ('+r.w+'×'+r.h+')');
  ok(r.claros===0&&r.azules>r.opacos*0.9,'las letras quedan en azul, ninguna blanca ('+r.azules+' de '+r.opacos+')');
  ok(r.color.w===200&&r.color.a===255,'un cuadrado oscuro con colores queda entero');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
