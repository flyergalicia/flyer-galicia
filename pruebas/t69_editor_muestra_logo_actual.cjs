// Al volver a tocar un logo ya cambiado, el editor muestra arriba el logo de AHORA
// (antes se veía el de la imagen base). Un lugar sin tocar sigue mostrando el original.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  const r=await p.evaluate(async()=>{
    const out={};
    const cab=()=>{const c=document.getElementById('fg-lg-ori');return c?{w:c.width,h:c.height,oculto:c.hidden,suma:(()=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let t=0;for(let i=0;i<d.length;i+=4)t+=(255-d[i])+(255-d[i+1])+(255-d[i+2]);return t;})()}:null;};
    const cerrar=()=>{const x=document.getElementById('fg-lg-x');if(x)x.click();};
    // un logo bien ancho y bajo, distinto de la caja del original
    let m,im;for(const x of _promosCat){if(!x.imagen||x.proximamente)continue;try{im=await _fgLgTraer(x.imagen);if(im.width/im.height>3){m=x;break;}}catch(e){}}
    out.asp=im.width/im.height;
    const det=_fgLgDetectar(730,1310);out.aspOrig=det.w/det.h;
    // 1) lugar sin tocar: el original
    _fgLgAbrir(det);out.sinTocar=cab();cerrar();
    // 2) cambiado por otro logo: ese logo
    _fgLgPoner(det,m.imagen,m.titulo,im);
    _fgLg.sel=_fgLgIndiceDe(det);
    _fgLgCambiarMarca();out.cambiado=cab();out.titulo=document.getElementById('fg-lg-t').textContent;cerrar();
    // 3) con un texto: no hay logo que mostrar
    const det2=_fgLgDetectar(905,1310);
    _fgLgPonerTexto(det2,{texto:'Martes',color:'#111',peso:500,fs:24},null);
    _fgLg.sel=_fgLgIndiceDe(det2);_fgLgCambiarMarca();out.texto=cab();cerrar();
    // 4) una copia (Ctrl+C / Ctrl+V) se solapa con su original: "Cambiar" abre ESA copia
    _fgLg.list=[];_fgLgListo();
    let m2,im2;for(const x of _promosCat){if(!x.imagen||x.proximamente||x.imagen===m.imagen)continue;try{im2=await _fgLgTraer(x.imagen);if(Math.abs(im2.width/im2.height-im.width/im.height)>1.5){m2=x;break;}}catch(e){}}
    _fgLgPoner(det,m.imagen,m.titulo,im);
    _fgLg.sel=0;_fgLg.grupo=[];_fgLgCopiar(true);_fgLgPegar();
    const iCopia=_fgLg.sel;_fgLgActivos()[iCopia].img=m2.imagen;_fgLgActivos()[iCopia].t=m2.titulo; // la copia ya lleva otro logo
    _fgLgCambiarMarca();
    out.copia={abierto:_fgLgIndiceDe(_fgLgV.det),iCopia,asp:im2.width/im2.height,cab:cab()};cerrar();
    // 5) un cambio cuyo logo todavía no está en memoria: no se muestra el de la base
    _fgLg.list=[];_fgLgListo();
    _fgLgPoner(det,m.imagen,m.titulo,im);
    delete _fgLg.imgs[m.imagen];_fgLg.sel=0;_fgLgCambiarMarca();
    out.sinMem=cab();
    return out;
  });
  console.log('  ',JSON.stringify(r));
  const razon=r.cambiado&&r.cambiado.w/r.cambiado.h;
  ok(r.sinTocar&&!r.sinTocar.oculto&&Math.abs(r.sinTocar.w/r.sinTocar.h-r.aspOrig)<0.1,'un lugar sin tocar muestra el logo original');
  ok(r.cambiado&&!r.cambiado.oculto&&Math.abs(razon-r.asp)<0.15,'un logo ya cambiado muestra el logo de ahora, no el de la base (proporción '+(razon||0).toFixed(2)+' vs '+r.asp.toFixed(2)+')');
  ok(r.cambiado&&r.cambiado.suma>0,'y no está vacío');
  ok(r.texto&&r.texto.oculto,'un texto no muestra ningún logo');
  ok(r.copia.abierto===r.copia.iCopia,'"Cambiar" sobre una copia abre la copia, no el original ('+r.copia.abierto+' vs '+r.copia.iCopia+')');
  ok(Math.abs(r.copia.cab.w/r.copia.cab.h-r.copia.asp)<0.15,'y la miniatura es el logo de la copia');
  ok(r.sinMem&&r.sinMem.oculto,'si el logo puesto no está en memoria, no se muestra el de la base');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
