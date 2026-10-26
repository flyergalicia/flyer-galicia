// Promociones → Buscar trae TODAS las promos de cada marca pegada (25-oct): "Coto"
// = 12 cuotas, 18 cuotas y 25% de ahorro (antes, sólo una). Sólo las de ese mismo
// nombre en Galicia ("Farmacity" no trae "Farmacity.com"). El tilde "Una sola fila
// por marca" deja una por marca pegada (la que vence más tarde) y va junto con el de Activas.
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'admin'});
  await p.evaluate(()=>{switchApp('promos');switchPromoTab('buscar');});
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length>100,null,{timeout:15000});
  await p.fill('#promos-marcas','Coto\nFarmacity');
  await p.evaluate(()=>validarPromos());
  await p.waitForFunction(()=>document.querySelectorAll('.promos-table tbody tr').length>0,null,{timeout:15000});
  const filas=()=>p.evaluate(()=>[...document.querySelectorAll('.promos-table tbody tr')].map(tr=>{
    const c=tr.querySelector('.pc-promo'),m=tr.querySelector('.pc-marca');
    return {marca:m?m.textContent.trim():'',titulo:c&&c.childNodes[0]?c.childNodes[0].textContent.trim():'',benef:(c&&c.querySelector('.promos-benef')||{}).textContent||'',txt:c?c.textContent:''};
  }));
  const a=await filas();
  const coto=a.filter(f=>f.marca==='Coto'),farma=a.filter(f=>f.marca==='Farmacity');
  ok(coto.length===3&&coto.some(f=>/12 cuotas/.test(f.benef))&&coto.some(f=>/18 cuotas/.test(f.benef))&&coto.some(f=>/25%/.test(f.benef)),'"Coto" trae sus 3 promos ('+coto.map(f=>f.benef).join(' | ')+')');
  ok(!/25%/.test(coto[0].benef),'la primera de Coto es la que vence más tarde (en cuotas), como antes');
  ok(farma.length===4&&farma.every(f=>f.titulo==='Farmacity'),'"Farmacity" trae sus 4 y ninguna de "Farmacity.com" ('+farma.map(f=>f.titulo).join(', ')+')');
  ok(a.length===7&&a.slice(0,3).every(f=>f.marca==='Coto'),'las de cada marca van juntas, en el orden en que se pegaron');

  // Tilde "Una sola fila por marca" en Buscar
  const hay=await p.evaluate(()=>{const c=document.getElementById('promos-unamarca-b');return !!c&&c.getBoundingClientRect().width>0&&!c.checked;});
  ok(hay,'Buscar tiene el tilde "Una sola fila por marca", destildado');
  await p.click('#promos-unamarca-b');
  const b=await filas();
  const sync=await p.evaluate(()=>document.getElementById('promos-unamarca').checked);
  ok(b.length===2&&b[0].marca==='Coto'&&b[1].marca==='Farmacity','con el tilde queda una fila por marca ('+b.map(f=>f.marca+': '+f.benef).join(' | ')+')');
  ok(/\+2/.test(b[0].txt),'la fila de Coto avisa que hay 2 promos más');
  ok(sync,'el tilde de Activas queda igual');
  await p.click('#promos-unamarca-b');
  ok((await filas()).length===7,'al destildar vuelven todas');

  // Elegir de nuevo la coincidencia de una fila no duplica sus hermanas
  await p.evaluate(()=>{const i=_promosResultados.findIndex(r=>r.marca==='Coto'&&!r.hermanaDe);_promosResultados[i].necesitaRevision=true;_promoElegirCandidato(i,0);});
  const c=await filas();
  ok(c.filter(f=>f.marca==='Coto').length===3&&c.length===7,'al confirmar una coincidencia se suman las demás de esa marca sin repetirse ('+c.length+' filas)');

  ok(p.errores.length===0,'sin errores de JavaScript ('+p.errores.join(' | ')+')');
  await p.context().close();
};
