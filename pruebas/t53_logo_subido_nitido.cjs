// Logos subidos de la PC: un PNG con fondo transparente no pierde sus letras claras
// (pasó con Toledo), se le saca un recuadro blanco grande si lo trae, un JPG con
// fondo blanco queda con bordes suaves y un logo blanco avisa.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  const r=await p.evaluate(async()=>{
    const avisos=[];const st=window.showToast;window.showToast=(m)=>{avisos.push(m);st(m);};
    async function archivo(dibujar,tipo,w=1600,h=500){
      const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');dibujar(g,w,h);
      const b=await new Promise(r=>c.toBlob(r,tipo,0.92));
      return new File([b],'logo.'+(tipo==='image/png'?'png':'jpg'),{type:tipo});
    }
    const texto=(g,fill,stroke)=>{g.font='bold 300px Arial';g.textBaseline='middle';g.lineWidth=14;if(stroke){g.strokeStyle=stroke;g.strokeText('Toledo',80,250);}g.fillStyle=fill;g.fillText('Toledo',80,250);};
    const alfa=(cv,fx,fy)=>cv.getContext('2d').getImageData(Math.round(cv.width*fx),Math.round(cv.height*fy),1,1).data;
    const out={};
    // A) transparente, letras blancas con contorno oscuro
    let A=await _fgLgLeerArchivo(await archivo(g=>texto(g,'#ffffff','#1b2a4a'),'image/png'));
    // un punto adentro del trazo de la "T" (barra vertical)
    const dA=A.logo.getContext('2d').getImageData(0,0,A.logo.width,A.logo.height).data;
    let blancosOpacos=0;for(let i=0;i<dA.length;i+=4)if(dA[i+3]>200&&dA[i]>235&&dA[i+1]>235&&dA[i+2]>235)blancosOpacos++;
    out.A=blancosOpacos;
    // B) transparente, recuadro blanco grande con el logo azul adentro
    let B=await _fgLgLeerArchivo(await archivo((g,w,h)=>{g.fillStyle='#fff';g.fillRect(40,40,w-80,h-80);texto(g,'#1b2a4a');},'image/png'));
    const dB=B.logo.getContext('2d').getImageData(0,0,B.logo.width,B.logo.height).data;
    let bl=0,az=0;for(let i=0;i<dB.length;i+=4){if(dB[i+3]>200&&dB[i]>235)bl++;if(dB[i+3]>200&&dB[i+2]>60&&dB[i]<60)az++;}
    out.B={blancos:bl,azules:az};
    // C) JPG con fondo blanco: bordes con transparencia intermedia
    let C=await _fgLgLeerArchivo(await archivo((g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);texto(g,'#1b2a4a');},'image/jpeg'));
    const dC=C.logo.getContext('2d').getImageData(0,0,C.logo.width,C.logo.height).data;
    let medios=0,cero=0;for(let i=3;i<dC.length;i+=4){if(dC[i]>0&&dC[i]<255)medios++;if(dC[i]===0)cero++;}
    out.C={medios,cero};
    const antes=avisos.length;
    // D) logo todo blanco: avisa
    await _fgLgLeerArchivo(await archivo(g=>texto(g,'#ffffff'),'image/png'));
    out.D=avisos.slice(antes);
    out.avisosAC=avisos.slice(0,antes);
    return out;
  });
  console.log('  ',JSON.stringify(r));
  ok(r.A>5000,'PNG transparente con letras blancas: las letras siguen ('+r.A+' px blancos)');
  ok(r.B.blancos<30000&&r.B.azules>5000,'recuadro blanco de adentro (600 mil px) se quita, quedan sólo los huecos de las letras ('+r.B.blancos+' blancos, '+r.B.azules+' azules)');
  ok(r.C.medios>200&&r.C.cero>1000,'JPG con fondo blanco: fondo fuera y bordes suaves ('+r.C.medios+' px intermedios)');
  ok(r.D.length===1&&/blanco/.test(r.D[0]),'logo blanco: avisa');
  ok(!r.avisosAC.some(m=>/blanco/.test(m)),'los logos de color no avisan');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
