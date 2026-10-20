// Reproducir: agregar marcas en Armar franja en pantallas reales (con la barra del navegador)
const {abrir}=require('./nube.cjs');
async function caso(browser,w,h,n,tag){
  const p=await abrir(browser,{rol:'asesor',w,h});
  await p.click('#fg-lg-btn');
  await p.evaluate(()=>{_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  // sólo marcas cuyos logos se pueden bajar en la prueba
  const ok=await p.evaluate(async(n)=>{
    const L=_fgFrSt.res.slice(0,60),bien=[];
    for(const x of L){if(bien.length>=n)break;try{await _fgLgTraer(x.imagen);bien.push(x);}catch(e){}}
    bien.forEach(x=>_fgFrSt.sel.push({img:x.imagen,t:x.titulo}));_fgFrLista();_fgFrSelPintar();_fgFrPreview();return bien.length;
  },n);
  await p.waitForTimeout(500);
  const m=await p.evaluate(()=>{const g=id=>{const e=document.querySelector(id);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.height)];};
    return {dlg:g('.fg-cf.fg-fr'),arriba:g('.fg-fr-arriba'),prev:g('#fg-fr-prev'),cols:g('.fg-fr-cols'),lista:g('#fg-fr-list'),sel:g('#fg-fr-sel'),acts:g('.fg-fr .fg-cf-acts'),cajas:_fgFrSt._cajas.filter(Boolean).map(c=>[Math.round(c.tx),Math.round(c.ty),Math.round(c.tw),Math.round(c.th)]),rect:_fgFrSt.rect,info:{n:_fgFrSt.info.n,filas:_fgFrSt.info.filas.length,porFila:_fgFrSt.info.porFila}};});
  console.log(tag,w+'x'+h,'marcas',ok,JSON.stringify(m));
  await p.screenshot({path:__dirname+'/capturas/t36_'+tag+'.png'});
  // y el flyer después de Poner
  await p.click('#fg-fr-ok');await p.waitForSelector('#fg-fr-ov',{state:'detached',timeout:20000});await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{const fc=fullRes(getVals());const c=document.createElement('canvas');c.width=1240;c.height=330;c.getContext('2d').drawImage(fc,0,2580,1240,330,0,0,1240,330);return c.toDataURL('image/png');});
  require('fs').writeFileSync(__dirname+'/capturas/t36_'+tag+'_flyer.png',Buffer.from(r.split(',')[1],'base64'));
  await p.context().close();
}
module.exports=async(browser)=>{
  await caso(browser,1366,657,13,'a13');
  await caso(browser,1366,657,20,'a20');
  await caso(browser,1280,600,16,'b16');
  await caso(browser,1366,657,8,'d8');
  await caso(browser,1366,657,30,'e30');
  await caso(browser,1920,950,24,'c24');
};
