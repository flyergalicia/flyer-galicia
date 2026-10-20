// Abre la app con la nube simulada (sesión de asesor, opción 9 = flyer real) y
// devuelve la página lista. Uso: const abrir=require('./nube_simple.cjs'); const p=await abrir(browser,{w,h});
const fs=require('fs');
const L=__dirname+'/datos/';
module.exports=async function abrir(browser,o){
  o=o||{};
  const REF='https://cajyjnxjbobdpltflgnb.supabase.co';
  const img=fs.readFileSync(L+'op9.jpg');
  const act=JSON.parse(fs.readFileSync(L+'active9.json','utf8'));
  act.imageUrl=REF+'/storage/v1/object/public/flyers/flyer_t9.jpg?v=1';
  const cat=JSON.parse(fs.readFileSync(L+'cat.json','utf8')).data.list.map(p=>({id:p.id,titulo:p.titulo,subtitulo:p.subtitulo,imagen:p.imagen,
    fecha_hasta:(p.fechaHasta||'').slice(0,10)||null,tipo_promocion:p.tipoPromocion,provincias:null,primera_vez:'2026-01-01',proximamente:!!p.proximamente,fecha_desde:null}));
  cat.sort((a,b)=>a.id-b.id);
  const b64u=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'asesor.prueba@bancogalicia.com.ar',app_metadata:{provider:'email'},user_metadata:{full_name:'Asesor Prueba'}};
  const jwt=b64u({alg:'HS256',typ:'JWT'})+'.'+b64u({sub:user.id,role:'authenticated',aud:'authenticated',exp:now+3600})+'.c2ln';
  const session={access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'rt',user};
  const files={
    '_opciones.json':{opts:[{n:9,nombre:'Combustible',solapa:'flyer'}]},
    '_facultades.json':{roles:{asesor:{opcion_1:false,opcion_9:true,promos_buscar:true}}},
    '_titulos.json':{},
    '_cashback.json':{configs:[{nombre:'BAU',m1:'$250.000',m2:'$180.000',m3:'$80.000',m4:'$30.000'}]},
    '_active.json':{name:'',imageUrl:null},'_legal.json':{text:'Legal 1'},
    '_active9.json':act,'_legal9.json':{text:'Legal de prueba.'},
  };
  const ctx=await browser.newContext({viewport:{width:o.w||1366,height:o.h||800},deviceScaleFactor:o.dpr||1,isMobile:!!o.mobile,hasTouch:!!o.mobile});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.type(),m.text().slice(0,200));});
  await p.addInitScript(([k,v])=>{try{localStorage.clear();localStorage.setItem(k,v);}catch(e){}},['sb-cajyjnxjbobdpltflgnb-auth-token',JSON.stringify(session)]);
  await p.route(REF+'/**',async route=>{
    const req=route.request(),u=new URL(req.url()),file=u.pathname.split('/').pop();
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Expose-Headers':'Content-Range','Content-Type':'application/json'};
    if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
    if(/^flyer_t\d\.jpg$/.test(file))return route.fulfill({status:200,body:img,headers:{...headers,'Content-Type':'image/jpeg'}});
    if(u.pathname.startsWith('/storage/v1/object/public/flyers/'))return route.fulfill(files[file]?{status:200,body:JSON.stringify(files[file]),headers}:{status:404,body:'{}',headers});
    const obj=/vnd\.pgrst\.object/.test(req.headers()['accept']||'');
    if(u.pathname==='/rest/v1/profiles'&&req.method()==='GET'&&obj)
      return route.fulfill({status:200,body:JSON.stringify({role:'asesor',full_name:'Asesor Prueba',status:'active',email_asesor:user.email}),headers});
    if(u.pathname==='/rest/v1/promos_galicia_meta')
      return route.fulfill({status:200,body:JSON.stringify(obj?{last_sync_at:new Date().toISOString(),total:cat.length,ubicaciones:[]}:[{last_sync_at:new Date().toISOString(),total:cat.length,ubicaciones:[]}]),headers});
    if(u.pathname==='/rest/v1/promos_galicia_cache'){
      let a=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||0);
      const rg=req.headers()['range'];if(rg){const m=/(\d+)-(\d+)/.exec(rg);if(m){a=+m[1];lim=+m[2]-a+1;}}
      if(!lim)lim=1000;
      const sl=cat.slice(a,a+lim);
      return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...headers,'Content-Range':a+'-'+(a+sl.length-1)+'/'+cat.length}});
    }
    if(req.method()==='PATCH'||req.method()==='POST')return route.fulfill({status:201,body:'[]',headers});
    return route.fulfill({status:200,body:'[]',headers:{...headers,'Content-Range':'0-0/0'}});
  });
  await p.goto('http://127.0.0.1:8765/index.html');
  await p.waitForFunction(()=>window._fgPrevGate===false&&window._fgOpt===9&&window.baseImg&&baseImg.naturalWidth>0&&window.cv&&cv.height>1000,null,{timeout:25000});
  return p;
};
