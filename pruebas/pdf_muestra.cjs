// Arma un PDF de prueba, sin librerías, con lo que el lector de PDF de la app tiene
// que saber dibujar: foto JPEG con máscara suave (como los flyers de Galicia), grupo de
// transparencia, JPEG 2000 y fax CCITT (en pdf.js 6 se decodifican con WebAssembly),
// una tinta con función PostScript, CMYK y texto. Es todo inventado: se versiona sólo
// lo necesario (datos/muestra.jp2), y cada zona tiene un color conocido para comprobarlo.
const fs=require('fs');
const zlib=require('zlib');
// Fax CCITT G4 de rayas verticales: 8 blancos y 8 negros, repetidos. La primera fila va en
// modo horizontal y las demás son iguales a la de arriba (modo vertical V0, un bit "1").
function faxRayas(ancho,alto){
  let bits='';
  for(let x=0;x<ancho;x+=16)bits+='001'+'10011'+'000101'; // horizontal + 8 blancos + 8 negros
  for(let y=1;y<alto;y++)for(let x=0;x<ancho;x+=8)bits+='1'; // V0 por cada cambio de color
  bits+='000000000001000000000001'; // fin de bloque
  while(bits.length%8)bits+='0';
  return Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));
}
const ALTO_MUESTRA=800; // puntos, con ANCHO 620: a 1240 px de ancho, escala 2
function armarPdfMuestra(o){
  o=o||{};
  const jpg=o.jpg,jp2=o.jp2,alto=o.alto||ALTO_MUESTRA,ancho=620,extras=o.icc||null;
  const objs=[];
  const obj=(dict,flujo)=>{objs.push({dict,flujo});return objs.length;};
  const catalogo=obj('');const paginas=obj('');const pagina=obj('');const contenido=obj('');
  const fuente=obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const mascara=zlib.deflateSync(Buffer.from(Array.from({length:64*64},(_,i)=>Math.round(255*(i%64)/63))));
  const smask=obj(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${mascara.length} >>`,mascara);
  const foto=jpg?obj(`<< /Type /XObject /Subtype /Image /Width ${o.jpgW} /Height ${o.jpgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /SMask ${smask} 0 R /Length ${jpg.length} >>`,jpg):0;
  const fotoSin=jpg?obj(`<< /Type /XObject /Subtype /Image /Width ${o.jpgW} /Height ${o.jpgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`,jpg):0;
  const jpx=obj(`<< /Type /XObject /Subtype /Image /Width ${o.jp2W} /Height ${o.jp2H} /Filter /JPXDecode /Length ${jp2.length} >>`,jp2);
  const fax=faxRayas(64,64);
  const ccitt=obj(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 64 >> /Length ${fax.length} >>`,fax);
  const ps=Buffer.from('{ dup 0 mul exch dup 1 mul exch dup 1 mul exch 0 mul }');
  const tinta=obj(`<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1 0 1] /Length ${ps.length} >>`,ps);
  const grupoFlujo=Buffer.from('1 0 0 rg 0 0 100 100 re f');
  const grupo=obj(`<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Length ${grupoFlujo.length} >>`,grupoFlujo);
  const lumFlujo=Buffer.from('0.5 g 0 0 100 100 re f');
  const lum=obj(`<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceGray >> /Length ${lumFlujo.length} >>`,lumFlujo);
  const icc=extras?obj(`<< /N 3 /Alternate /DeviceRGB /Length ${extras.length} >>`,extras):0;
  // y se cuenta desde abajo: Y(n) deja la zona a n puntos del borde de ARRIBA
  const Y=n=>alto-n-100;
  let c='1 1 1 rg 0 0 620 '+alto+' re f\n';
  c+=`q 100 0 0 100 20 ${Y(20)} cm /Fax Do Q\n`;                    // fax: rayas blancas y negras
  c+=`q 100 0 0 100 140 ${Y(20)} cm /Jpx Do Q\n`;                   // JPEG 2000: rojo
  c+=`q /Tinta cs 1 scn 260 ${Y(20)} 100 100 re f Q\n`;             // PostScript: magenta+amarillo (rojo en CMYK de 0,1,1,0)
  c+=`q 0 1 1 0 k 380 ${Y(20)} 100 100 re f Q\n`;                   // CMYK
  c+=`q 1 0 0 1 500 ${Y(20)} cm /Luz gs /Grupo Do Q\n`;             // grupo rojo con máscara de luminosidad al 50 %
  if(icc)c+=`q /Icc cs 0 0.5 1 sc 20 ${Y(140)} 100 100 re f Q\n`;
  c+=`BT /F1 28 Tf 0 0 0 rg 140 ${Y(140)+40} Td (Prueba de PDF) Tj ET\n`;
  if(foto){const h=Math.round(600*o.jpgH/o.jpgW);c+=`q 600 0 0 ${h} 10 ${alto-260-h} cm /Foto Do Q\n`;
    let y=alto-260-h;while(y-h-10>0){y-=h+10;c+=`q 600 0 0 ${h} 10 ${y} cm /${(y%2)?'Foto':'FotoSin'} Do Q\n`;}}
  const flujo=Buffer.from(c);
  objs[catalogo-1].dict=`<< /Type /Catalog /Pages ${paginas} 0 R >>`;
  objs[paginas-1].dict=`<< /Type /Pages /Kids [${pagina} 0 R] /Count 1 >>`;
  const xo=[`/Fax ${ccitt} 0 R`,`/Jpx ${jpx} 0 R`,`/Grupo ${grupo} 0 R`];if(foto)xo.push(`/Foto ${foto} 0 R`,`/FotoSin ${fotoSin} 0 R`);
  const cs=[`/Tinta [/Separation /Rojo /DeviceCMYK ${tinta} 0 R]`];if(icc)cs.push(`/Icc [/ICCBased ${icc} 0 R]`);
  objs[pagina-1].dict=`<< /Type /Page /Parent ${paginas} 0 R /MediaBox [0 0 ${ancho} ${alto}] /Contents ${contenido} 0 R /Group << /S /Transparency /CS /DeviceRGB >> /Resources << /Font << /F1 ${fuente} 0 R >> /XObject << ${xo.join(' ')} >> /ColorSpace << ${cs.join(' ')} >> /ExtGState << /Luz << /Type /ExtGState /SMask << /S /Luminosity /G ${lum} 0 R >> >> >> >> >>`;
  objs[contenido-1].dict=`<< /Length ${flujo.length} >>`;objs[contenido-1].flujo=flujo;
  const partes=[Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n','latin1')];let pos=partes[0].length;const offs=[];
  objs.forEach((x,i)=>{offs.push(pos);const b=x.flujo?Buffer.concat([Buffer.from(`${i+1} 0 obj\n${x.dict}\nstream\n`),x.flujo,Buffer.from('\nendstream\nendobj\n')]):Buffer.from(`${i+1} 0 obj\n${x.dict}\nendobj\n`);partes.push(b);pos+=b.length;});
  let xref=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;offs.forEach(n=>{xref+=String(n).padStart(10,'0')+' 00000 n \n';});
  partes.push(Buffer.from(xref+`trailer\n<< /Size ${objs.length+1} /Root ${catalogo} 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(partes);
}
module.exports={armarPdfMuestra,ALTO_MUESTRA};
