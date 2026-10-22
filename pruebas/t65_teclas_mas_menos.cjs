// + y − agrandan y achican lo elegido (Cambiar logos y Armar franja).
const {abrir}=require('./nube.cjs');
const ok=(c,m)=>console.log((c?'  OK  ':'  FALLA ')+m);
module.exports=async(browser)=>{
  const p=await abrir(browser,{rol:'asesor'});
  await p.click('#fg-lg-btn');
  await p.waitForFunction(()=>window._promosCat&&_promosCat.length,null,{timeout:15000});
  await p.evaluate(async()=>{
    const ms=[];for(const x of _promosCat){if(ms.length>=2)break;if(!x.imagen)continue;try{ms.push([x,await _fgLgTraer(x.imagen)]);}catch(e){}}
    _fgLgPoner(_fgLgManual(140,2650,300,110),ms[0][0].imagen,ms[0][0].titulo,ms[0][1]);
    _fgLgPoner(_fgLgManual(600,2650,300,110),ms[1][0].imagen,ms[1][0].titulo,ms[1][1]);
    _fgLgPonerTexto(_fgLgManual(140,2800,300,60),{texto:'Martes',color:'#111',peso:500,fs:30},null);
    document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
  });
  const pct=(i)=>p.evaluate((i)=>_fgLgPct(_fgLgActivos()[i]),i);
  // un logo elegido
  await p.evaluate(()=>{_fgLg.sel=0;_fgLg.grupo=[];_fgLgListo();});
  const a0=await pct(0);
  await p.keyboard.press('+');await p.waitForTimeout(80);
  ok(await pct(0)===a0+10,'+ agranda un 10 % ('+a0+' → '+(await pct(0))+')');
  await p.keyboard.press('-');await p.keyboard.press('-');await p.waitForTimeout(80);
  ok(await pct(0)===a0-10,'− achica de a 10 %');
  await p.keyboard.press('Shift++');await p.waitForTimeout(80);
  ok(await pct(0)===a0-10+25,'Shift + + agranda un 25 %');
  for(let i=0;i<30;i++)await p.keyboard.press('+');
  await p.waitForTimeout(150);
  ok(await pct(0)===250,'el tope es 250 %');
  for(let i=0;i<40;i++)await p.keyboard.press('-');
  await p.waitForTimeout(150);
  ok(await pct(0)===30,'el piso es 30 %');
  // grupo de 2 logos: los dos en la misma proporción
  await p.evaluate(()=>{_fgLgTam(100);_fgLg.sel=1;_fgLgTam(100);_fgLg.grupo=[0,1];_fgLg.sel=1;_fgLgListo();});
  await p.keyboard.press('+');await p.waitForTimeout(80);
  const g=[await pct(0),await pct(1)];
  ok(g[0]===110&&g[1]===110,'con 2 elegidos crecen los dos ('+g.join(', ')+')');
  // un texto
  await p.evaluate(()=>{_fgLg.grupo=[];_fgLg.sel=2;_fgLgListo();});
  const f0=await p.evaluate(()=>_fgLgActivos()[2].fs);
  await p.keyboard.press('+');await p.waitForTimeout(80);
  const f1=await p.evaluate(()=>_fgLgActivos()[2].fs);
  ok(f1>f0,'un texto elegido agranda su letra ('+Math.round(f0)+' → '+Math.round(f1)+')');
  // sin hacer nada si el foco está en un campo de texto o hay una ventana abierta
  const b0=await pct(2);
  await p.evaluate(()=>{const i=document.createElement('input');i.id='zz-i';i.type='text';document.body.appendChild(i);i.focus();});
  await p.keyboard.press('+');await p.waitForTimeout(80);
  ok(await pct(2)===b0,'con el foco en un campo de texto no hace nada');
  await p.evaluate(()=>{document.getElementById('zz-i').remove();document.activeElement&&document.activeElement.blur();_fgLgAbrir(_fgLgManual(600,2650,300,110));});
  await p.keyboard.press('+');await p.waitForTimeout(80);
  ok(await pct(2)===b0,'con la ventana de un logo abierta no hace nada');
  await p.evaluate(()=>document.getElementById('fg-lg-x').click());
  // ── Armar franja ──
  await p.evaluate(()=>{_fgLg.list=[];_fgLgListo();_fgLgV.prov='';_fgFrAbrir(_fgLgManual(140,2650,1000,230));});
  await p.waitForSelector('#fg-fr-ov .fg-lg-it',{timeout:15000});
  await p.evaluate(async()=>{const st=_fgFrSt;let n=0;for(const x of st.res){if(n>=3)break;try{await _fgLgTraer(x.imagen);st.sel.push({img:x.imagen,t:x.titulo});n++;}catch(e){}}_fgFrLista();_fgFrSelPintar();_fgFrPreview();st.elegido=0;st.grupo=[];_fgFrPreview();document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.keyboard.press('+');await p.waitForTimeout(80);
  const k1=await p.evaluate(()=>_fgFrSt.sel[0].k);
  ok(Math.abs(k1-1.1)<0.001,'en Armar franja + agranda el logo elegido (k='+k1+')');
  await p.keyboard.press('Shift+-');await p.waitForTimeout(80);
  const k2=await p.evaluate(()=>_fgFrSt.sel[0].k);
  ok(Math.abs(k2-0.85)<0.001,'Shift + − lo achica un 25 % (k='+k2+')');
  ok(await p.evaluate(()=>_fgLgActivos().length)===0,'y no toca nada del flyer mientras tanto');
  await p.evaluate(()=>{_fgFrSt.elegido=-1;_fgFrSt.grupo=[];_fgFrPreview();});
  await p.keyboard.press('+');await p.waitForTimeout(80);
  const kt=await p.evaluate(()=>_fgFrSt.kt);
  ok(Math.abs(kt-1.05)<0.001,'sin nada elegido cambia "Tamaño de todos" (kt='+kt+')');
  console.log('  errores:',p.errores.length,p.errores.slice(0,3));
};
