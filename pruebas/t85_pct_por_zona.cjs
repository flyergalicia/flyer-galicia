// "Sólo súper con % de descuento" y los días que van al flyer miran la zona elegida
// (26-oct). Changomas tiene el 20% en unos lugares y sólo cuotas en otros: con la
// localidad elegida salía con puntito y pasaba el tilde en la ventana de un logo,
// aunque ahí no tiene % (en pantalla completa, que mira fila por fila, no salía).
// Además: cada tarjeta es un logo; si tiene varias promos dice "N promos".
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length&&_promosUbic&&_promosUbic.length,null,{timeout:15000});
  const r=await p.evaluate(()=>{
    const u=_promosUbic.find(x=>x.nombre==='NEUQUEN'),loc=u&&(u.localidades||[]).find(n=>/MARTIN DE LOS ANDES/.test(n));
    // un súper de prueba: cuotas en la localidad, el 20% sólo en otra parte de la provincia
    const base={titulo:'Super Prueba',subtitulo:'Supermercados',imagen:'superprueba_180.png',fecha_hasta:'2027-12-31',provincias:['NEUQUEN'],proximamente:false,tipo_promocion:'Marca',primera_vez:'2026-01-01'};
    const A=Object.assign({id:990001,beneficio:'Hasta 12 cuotas sin interés.',dias:'Todos los días'},base);
    const B=Object.assign({id:990002,beneficio:'20% de ahorro.',dias:'Lunes'},base);
    _promosCat=_promosCat.concat([A,B]);
    _fgLocIds['NEUQUEN|'+loc]=[990001];
    const zProv=_promoZona({prov:'NEUQUEN'}),zLoc=_promoZona({prov:'NEUQUEN',loc});
    const out={loc,prov:{pct:_promoTienePct(A,zProv),dias:_promoDias(A,zProv)},enLoc:{pct:_promoTienePct(A,zLoc),dias:_promoDias(A,zLoc)},pais:_promoTienePct(A)};
    const tarjeta=()=>[...document.querySelectorAll('#fg-lg-list .fg-lg-it')].find(b=>b.querySelector('.fg-lg-it-t').textContent==='Super Prueba');
    const ver=()=>{const t=tarjeta();return t?{dot:!!t.querySelector('.fg-pf-pct'),sub:t.querySelector('.fg-lg-it-s').textContent}:null;};
    // ventana de un logo con provincia y localidad
    Object.assign(_fgLgV,{q:'',rubro:'Supermercados',prov:'NEUQUEN',loc,soloPct:false,sinOnline:false,una:true});
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    const qi=document.getElementById('fg-lg-q');qi.value='super prueba';_fgLgV.q='super prueba';_fgLgLista();
    out.vLoc=ver();
    const pct=document.getElementById('fg-lg-pct');pct.checked=true;pct.dispatchEvent(new Event('change'));
    out.vLocPct=ver();
    out.todosConDot=[...document.querySelectorAll('#fg-lg-list .fg-lg-it')].every(b=>b.querySelector('.fg-pf-pct'));
    pct.checked=false;pct.dispatchEvent(new Event('change'));
    // sólo la provincia
    const lsel=document.getElementById('fg-lg-loc');lsel.value='';lsel.dispatchEvent(new Event('change'));
    out.vProv=ver();out.locV=_fgLgV.loc;
    pct.checked=true;pct.dispatchEvent(new Event('change'));
    out.vProvPct=ver();
    document.getElementById('fg-lg-x').click();
    // Coto en Capital: un solo logo con varias promos → "N promos"
    Object.assign(_fgLgV,{rubro:'',prov:'CAPITAL FEDERAL',loc:'',soloPct:false});
    _fgLgAbrir(_fgLgManual(140,2650,300,110));
    _fgLgV.q='coto';_fgLgLista();
    const c=[...document.querySelectorAll('#fg-lg-list .fg-lg-it')].find(b=>b.querySelector('.fg-lg-it-t').textContent==='Coto');
    const m=c&&c.querySelector('.fg-pf-mas');
    out.coto={n:document.querySelectorAll('#fg-lg-list .fg-lg-it').length,mas:m&&m.textContent,tit:m&&m.title,reales:_promosCat.filter(q=>q.titulo==='Coto'&&!q.proximamente&&_promoEstado(q.fecha_hasta,new Date())!=='VENCIDA'&&_promoEnProvincia(q,'CAPITAL FEDERAL')).length};
    document.getElementById('fg-lg-x').click();
    return out;
  });
  console.log('  ',JSON.stringify(r));
  ok(!!r.loc,'la localidad de prueba existe ('+r.loc+')');
  ok(r.pais&&r.prov.pct&&r.prov.dias==='Lunes','en la provincia tiene % y en el flyer van sus días (Lunes)');
  ok(!r.enLoc.pct&&r.enLoc.dias==='','en la localidad sólo tiene cuotas: sin % y sin días para el flyer');
  ok(r.vLoc&&!r.vLoc.dot,'ventana con localidad: aparece SIN puntito rojo');
  ok(r.vLocPct===null&&r.todosConDot,'con el tilde "Sólo súper con %" no aparece (y todos los que quedan llevan el puntito)');
  ok(r.vProv&&r.vProv.dot&&/2 promos/.test(r.vProv.sub)&&r.locV==='','sólo con la provincia: con puntito y "2 promos"');
  ok(r.vProvPct&&r.vProvPct.dot,'y pasa el tilde');
  ok(r.coto.mas===r.coto.reales+' promos'&&r.coto.reales>1&&/cuotas/i.test(r.coto.tit||''),'Coto es un solo logo y dice "'+r.coto.mas+'" con el detalle al pasar el mouse');
  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
