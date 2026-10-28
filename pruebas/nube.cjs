// Nube simulada con estado compartido: bucket que guarda lo que se sube, tabla flyer_disenos
// y perfiles (asesor / admin). Uso: const {abrir,nube}=require('./nube.cjs'); await abrir(browser,{rol:'asesor'|'admin',uid:'..'})
const fs=require('fs');
const L=__dirname+'/datos/';
const REF='https://cajyjnxjbobdpltflgnb.supabase.co';
const img=fs.readFileSync(L+'op9.jpg');
const act9=JSON.parse(fs.readFileSync(L+'active9.json','utf8'));
act9.imageUrl=REF+'/storage/v1/object/public/flyers/flyer_t9.jpg?v=1';
const cat=JSON.parse(fs.readFileSync(L+'cat.json','utf8')).data.list.map(p=>({id:p.id,titulo:p.titulo,subtitulo:p.subtitulo,imagen:p.imagen,
  fecha_hasta:(p.fechaHasta||'').slice(0,10)||null,tipo_promocion:p.tipoPromocion,provincias:null,primera_vez:'2026-01-01',proximamente:!!p.proximamente,fecha_desde:null,dias:(p.leyendaDiasAplicacion||"").trim()||null,beneficio:(p.promocion||"").trim()||null})).sort((a,b)=>a.id-b.id);
// geografía real (provincias por promo y localidades por provincia), leída de la base
const GEO=fs.existsSync(L+'geo.json')?JSON.parse(fs.readFileSync(L+'geo.json','utf8')):null;
if(GEO)cat.forEach(p=>{const g=GEO.prov[String(p.id)];p.provincias=Array.isArray(g)?g:null;});
const LOC_IDS=fs.existsSync(L+'loc_ids.json')?JSON.parse(fs.readFileSync(L+'loc_ids.json','utf8')):[];
const nube={
  json:{ // archivos JSON del bucket
    '_opciones.json':{opts:[{n:9,nombre:'Combustible',solapa:'flyer'}]},
    '_facultades.json':{roles:{asesor:{opcion_1:false,opcion_9:true,promos_buscar:true,estudio:true}}},
    '_titulos.json':{},'_cashback.json':{configs:[{nombre:'BAU',m1:'$250.000',m2:'$180.000',m3:'$80.000',m4:'$30.000'}]},
    '_active.json':{name:'',imageUrl:null},'_legal.json':{text:'Legal 1'},'_active9.json':act9,'_legal9.json':{text:'Legal de prueba para la opción 9.'},
  },
  bin:{},        // imágenes subidas
  subidas:[],    // registro de subidas
  disenos:[],    // tabla flyer_disenos
  seq:0,
  favs:{},      // profiles.flyer_fav por usuario (barra de flyers)
};
const USERS={
  asesor:{id:'00000000-0000-4000-8000-000000000001',email:'asesor.prueba@bancogalicia.com.ar',name:'Asesor Prueba',role:'asesor'},
  asesor2:{id:'00000000-0000-4000-8000-000000000002',email:'otra.persona@bancogalicia.com.ar',name:'Otra Persona',role:'asesor'},
  admin:{id:'00000000-0000-4000-8000-0000000000aa',email:'admin.prueba@bancogalicia.com.ar',name:'Admin Prueba',role:'admin'},
};
const b64u=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function abrir(browser,o){
  o=o||{};const U=USERS[o.rol||'asesor'];
  const now=Math.floor(Date.now()/1000);
  const user={id:U.id,aud:'authenticated',role:'authenticated',email:U.email,app_metadata:{provider:'email'},user_metadata:{full_name:U.name}};
  const jwt=b64u({alg:'HS256',typ:'JWT'})+'.'+b64u({sub:U.id,role:'authenticated',aud:'authenticated',exp:now+3600})+'.c2ln';
  const session={access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'rt',user};
  const ctx=await browser.newContext({viewport:{width:o.w||1366,height:o.h||800},acceptDownloads:true,hasTouch:!!o.touch,isMobile:!!o.touch});
  const p=await ctx.newPage();
  p.errores=[];
  p.on('pageerror',e=>{p.errores.push(e.message);console.log('PAGEERROR',e.message);});
  p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE error',m.text().slice(0,220));});
  p.on('dialog',d=>{console.log('DIALOG nativo:',d.type(),d.message().slice(0,80));d.dismiss();});
  // o.ls: claves extra de localStorage para la página (por ejemplo, borradores guardados)
  await p.addInitScript(([k,v,extra])=>{try{localStorage.clear();localStorage.setItem(k,v);Object.keys(extra||{}).forEach(function(x){localStorage.setItem(x,extra[x]);});}catch(e){}},['sb-cajyjnxjbobdpltflgnb-auth-token',JSON.stringify(session),o.ls||{}]);
  await p.route(REF+'/**',async route=>{
    const req=route.request(),u=new URL(req.url()),path=u.pathname,file=path.split('/').pop(),m=req.method();
    const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Access-Control-Expose-Headers':'Content-Range','Content-Type':'application/json'};
    if(m==='OPTIONS')return route.fulfill({status:200,headers:H});
    const obj=/vnd\.pgrst\.object/.test(req.headers()['accept']||'');
    // ── bucket
    if(path.startsWith('/storage/v1/object/public/flyers/')){
      if(nube.bin[file])return route.fulfill({status:200,body:nube.bin[file],headers:{...H,'Content-Type':'image/jpeg'}});
      if(/^flyer_t\d\.jpg$/.test(file))return route.fulfill({status:200,body:img,headers:{...H,'Content-Type':'image/jpeg'}});
      if(nube.json[file])return route.fulfill({status:200,body:JSON.stringify(nube.json[file]),headers:H});
      return route.fulfill({status:404,body:'{}',headers:H});
    }
    if(nube.fallarSubida&&path.startsWith('/storage/v1/object/flyers/')&&path.endsWith(nube.fallarSubida))return route.fulfill({status:500,body:JSON.stringify({statusCode:'500',error:'x',message:'falla simulada'}),headers:H});
    if(path.startsWith('/storage/v1/object/flyers/')&&(m==='POST'||m==='PUT')){
      const nombre=decodeURIComponent(path.slice('/storage/v1/object/flyers/'.length));
      const upsert=String(req.headers()['x-upsert']||'false')==='true';
      if(!upsert&&(nube.json[nombre]||nube.bin[nombre])){nube.conflictos=(nube.conflictos||0)+1;return route.fulfill({status:400,body:JSON.stringify({statusCode:'409',error:'Duplicate',message:'The resource already exists'}),headers:H});}
      // supabase-js manda multipart; sacamos el contenido
      const raw=req.postDataBuffer()||Buffer.alloc(0);
      let body=raw;const ct=req.headers()['content-type']||'';
      const mm=/boundary=(.+)$/.exec(ct);
      if(mm){const sep=Buffer.from('--'+mm[1]);let ini=0,partes=[];while(true){const k=raw.indexOf(sep,ini);if(k<0)break;partes.push(k);ini=k+sep.length;}
      // la parte del archivo es la que trae filename (la otra es cacheControl)
      let elegido=null;for(let q=0;q<partes.length-1;q++){const trozo=raw.slice(partes[q]+sep.length,partes[q+1]);if(trozo.slice(0,300).toString('latin1').includes('filename')||q===partes.length-2)elegido=trozo;}
      const h=elegido.indexOf(Buffer.from([13,10,13,10]))+4;body=elegido.slice(h,elegido.length-2);}
      if(nombre.endsWith('.json')){try{nube.json[nombre]=JSON.parse(body.toString('utf8'));}catch(e){nube.json[nombre]={__mal:true};}}
      else nube.bin[nombre]=body;
      nube.subidas.push({nombre,bytes:body.length});if(nombre.endsWith('.json'))nube.ultimo=body.toString('utf8').slice(0,300);
      return route.fulfill({status:200,body:JSON.stringify({Key:'flyers/'+nombre,Id:'x'}),headers:H});
    }
    if(path==='/storage/v1/object/flyers'&&m==='DELETE'){
      const b=JSON.parse(req.postData()||'{}');(b.prefixes||[]).forEach(n=>{delete nube.json[n];delete nube.bin[n];});
      nube.borrados=(nube.borrados||[]).concat(b.prefixes||[]);
      return route.fulfill({status:200,body:JSON.stringify((b.prefixes||[]).map(n=>({name:n}))),headers:H});
    }
    if(path.startsWith('/storage/v1/')){return route.fulfill({status:200,body:'[]',headers:H});}
    // ── perfil
    if(path==='/rest/v1/profiles'&&m==='GET'&&!obj&&nube.perfiles)return route.fulfill({status:200,body:JSON.stringify(nube.perfiles),headers:H});
    // flyer_logs simulados (tablero de uso): GET con created_at=gte.<fecha>
    if(path==='/rest/v1/flyer_logs'&&m==='GET'&&nube.logs){
      const gte=(u.searchParams.get('created_at')||'').replace(/^gte\./,'');
      const l=nube.logs.filter(x=>!gte||x.created_at>=gte);let a=0,lim=1000;const rg=req.headers()['range'];if(rg){const x=/(\d+)-(\d+)/.exec(rg);if(x){a=+x[1];lim=+x[2]-a+1;}}
      const sl=l.slice(a,a+lim);return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...H,'Content-Range':(sl.length?a+'-'+(a+sl.length-1):'*')+'/'+l.length}});
    }
    if(path==='/rest/v1/profiles'&&m==='PATCH'){
      const b=JSON.parse(req.postData()||'{}');if('flyer_fav' in b)nube.favs[U.id]=b.flyer_fav;
      return route.fulfill({status:204,body:'',headers:H});
    }
    if(path==='/rest/v1/profiles'&&m==='GET'){
      const fila={id:U.id,role:U.role,full_name:U.name,email:U.email,status:'active',email_asesor:U.email,facultades:null,flyer_fav:nube.favs[U.id]||null};
      return route.fulfill({status:200,body:JSON.stringify(obj?fila:[fila]),headers:H});
    }
    // ── promos
    const UB=GEO?GEO.ubic:[];
    if(path==='/rest/v1/promos_galicia_meta')return route.fulfill({status:200,body:JSON.stringify(obj?{last_sync_at:new Date().toISOString(),total:cat.length,ubicaciones:UB}:[{last_sync_at:new Date().toISOString(),total:cat.length,ubicaciones:UB}]),headers:H});
    // Edge Function promos-galicia: "ubicacion" devuelve los ids de la localidad (los de San Martín de los Andes, pedidos a Galicia)
    if(path==='/functions/v1/auth-admin'){const b=JSON.parse(req.postData()||'{}');nube.llamadasAdmin=(nube.llamadasAdmin||[]).concat([b]);return route.fulfill({status:200,body:JSON.stringify({ok:true}),headers:H});}
    if(path==='/functions/v1/promos-galicia'){
      const b=JSON.parse(req.postData()||'{}');nube.llamadasLoc=(nube.llamadasLoc||0)+(b.action==='ubicacion'?1:0);
      if(b.action==='ubicacion'){await new Promise(x=>setTimeout(x,400));return route.fulfill({status:200,body:JSON.stringify({data:{ids:LOC_IDS}}),headers:H});}
      return route.fulfill({status:200,body:JSON.stringify({data:{}}),headers:H});
    }
    if(path==='/rest/v1/promos_galicia_cache'){
      let a=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||0);
      const rg=req.headers()['range'];if(rg){const x=/(\d+)-(\d+)/.exec(rg);if(x){a=+x[1];lim=+x[2]-a+1;}}
      if(!lim)lim=1000;const sl=cat.slice(a,a+lim);
      return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...H,'Content-Range':a+'-'+(a+sl.length-1)+'/'+cat.length}});
    }
    // promos de MODO (migración 035): las que ponga la prueba en nube.modo (si no, ninguna)
    if(path==='/rest/v1/promos_modo_cache'){
      if(nube.modoFalla)return route.fulfill({status:404,body:JSON.stringify({message:'relation "promos_modo_cache" does not exist',code:'42P01'}),headers:H});
      const l=nube.modo||[];let a=0,lim=1000;const rg=req.headers()['range'];if(rg){const x=/(\d+)-(\d+)/.exec(rg);if(x){a=+x[1];lim=+x[2]-a+1;}}
      const sl=l.slice(a,a+lim);
      return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...H,'Content-Range':(sl.length?a+'-'+(a+sl.length-1):'*')+'/'+l.length}});
    }
    // ── Benchmark (migración 039): nube.bench / benchMarcas / benchMeta / benchHist; nube.benchFalla = tablas inexistentes
    if(/^\/rest\/v1\/promos_bench_(cache|marcas|meta|hist)$/.test(path)){
      nube.pedidosBench=(nube.pedidosBench||[]).concat([path]);
      if(nube.benchFalla)return route.fulfill({status:404,body:JSON.stringify({message:'relation does not exist',code:'42P01'}),headers:H});
      const l={promos_bench_cache:nube.bench,promos_bench_marcas:nube.benchMarcas,promos_bench_meta:nube.benchMeta,promos_bench_hist:nube.benchHist}[path.split('/').pop()]||[];
      let a=0,lim=1000;const rg=req.headers()['range'];if(rg){const x=/(\d+)-(\d+)/.exec(rg);if(x){a=+x[1];lim=+x[2]-a+1;}}
      const sl=l.slice(a,a+lim);
      return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...H,'Content-Range':(sl.length?a+'-'+(a+sl.length-1):'*')+'/'+l.length}});
    }
    // tarjetas y salas VIP (migración 042): nube.benchTarj; escribe sólo el admin (como la regla de la base); nube.tarjFalla = tabla inexistente
    if(path==='/rest/v1/promos_bench_tarjetas'||path==='/rest/v1/promos_bench_manual'){
      const esMan=path.endsWith('manual');
      if(esMan?nube.manualFalla:nube.tarjFalla)return route.fulfill({status:404,body:JSON.stringify({message:'relation does not exist',code:'42P01'}),headers:H});
      const l=esMan?(nube.benchManual=nube.benchManual||[]):(nube.benchTarj=nube.benchTarj||[]);
      if(m==='GET')return route.fulfill({status:200,body:JSON.stringify(l),headers:{...H,'Content-Range':(l.length?'0-'+(l.length-1):'*')+'/'+l.length}});
      if(U.role!=='admin')return route.fulfill({status:403,body:JSON.stringify({message:'new row violates row-level security policy for table "promos_bench_tarjetas"',code:'42501'}),headers:H});
      const b=JSON.parse(req.postData()||'{}');
      nube.tarjEscrituras=(nube.tarjEscrituras||[]).concat([{m,b,q:u.searchParams.get('id')}]);
      if(m==='POST'){l.push(Object.assign({id:'nueva'+l.length+'x'},b));return route.fulfill({status:201,body:'[]',headers:H});}
      const id=String(u.searchParams.get('id')||'').replace(/^eq\./,'');
      if(m==='PATCH'){const f=l.find(x=>x.id===id);if(f)Object.assign(f,b);return route.fulfill({status:204,body:'',headers:H});}
      if(m==='DELETE'){const i=l.findIndex(x=>x.id===id);if(i>=0)l.splice(i,1);return route.fulfill({status:204,body:'',headers:H});}
    }
    if(path==='/functions/v1/benchmark-sync'){
      const b=JSON.parse(req.postData()||'{}');nube.llamadasBench=(nube.llamadasBench||[]).concat([b]);
      return route.fulfill({status:200,body:JSON.stringify({data:(b.action==='marcas'||b.action==='galicia')?{hechas:0,pendientes:0,total:0}:{resultados:[{banco:b.banco,total:1}],errores:[]}}),headers:H});
    }
    // ── Estudio: preguntar / responder / compartir (migración 034)
    if(path==='/rest/v1/flyer_diseno_mensajes'){
      const ids=((u.searchParams.get('diseno_id')||'').match(/^in\.\((.*)\)$/)||[0,''])[1].split(',').map(x=>x.replace(/"/g,''));
      const ver=nube.disenos.filter(d=>U.role==='admin'||d.user_id===U.id).map(d=>d.id);
      const l=(nube.mensajes||[]).filter(m=>ids.includes(m.diseno_id)&&ver.includes(m.diseno_id));
      return route.fulfill({status:200,body:JSON.stringify(l),headers:H});
    }
    if(path.startsWith('/rest/v1/rpc/flyer_diseno_')){
      const b=JSON.parse(req.postData()||'{}'),fn=path.split('/').pop(),err=msg=>route.fulfill({status:400,body:JSON.stringify({message:msg,code:'P0001'}),headers:H});
      nube.mensajes=nube.mensajes||[];
      const d=nube.disenos.find(x=>x.id===b.p_id);if(!d)return err('Ese diseño no existe');
      const t=new Date().toISOString();
      if(fn==='flyer_diseno_consultar'){
        if(U.role!=='admin')return err('Sólo el administrador puede preguntar');
        if(!['pedido','consulta'].includes(d.estado))return err('Ese diseño ya no está pedido');
        nube.mensajes.push({diseno_id:d.id,rol:'admin',tipo:'consulta',texto:b.p_texto,autor_nombre:U.name,created_at:t});
        Object.assign(d,{estado:'consulta',updated_at:t});return route.fulfill({status:204,body:'',headers:H});
      }
      if(fn==='flyer_diseno_responder'){
        if(d.user_id!==U.id)return err('Sólo quien pidió la publicación puede responder');
        if(d.estado!=='consulta')return err('Ese diseño no tiene una pregunta abierta');
        nube.mensajes.push({diseno_id:d.id,rol:'autor',tipo:'respuesta',texto:b.p_texto,autor_nombre:U.name,created_at:t});
        Object.assign(d,{estado:'pedido',updated_at:t});return route.fulfill({status:204,body:'',headers:H});
      }
      if(fn==='flyer_diseno_compartir'){
        if(U.role!=='admin')return err('Sólo el administrador puede compartir diseños');
        const out={nuevos:[],actualizados:[],salteados:[]};
        [...new Set(b.p_para||[])].forEach(uid=>{
          const P=Object.values(USERS).find(x=>x.id===uid);if(!P){out.salteados.push({nombre:'(usuario borrado)',motivo:'ya no existe'});return;}
          if(uid===U.id||uid===d.user_id){out.salteados.push({nombre:P.name,motivo:'ya es suyo'});return;}
          const ya=nube.disenos.find(x=>x.user_id===uid&&x.compartido_de===d.id);
          const copia={nombre:d.nombre,empresa:d.empresa,opcion:d.opcion,base_name:d.base_name,datos:JSON.parse(JSON.stringify(d.datos)),miniatura:d.miniatura,estado:'privado',nota_admin:'',compartido_por:U.name,compartido_at:t,updated_at:t};
          if(ya){if(!['privado','rechazado'].includes(ya.estado)){out.salteados.push({nombre:P.name,motivo:'ya lo tiene y pidió publicarlo'});return;}Object.assign(ya,copia);out.actualizados.push(P.name);return;}
          nube.disenos.push(Object.assign({id:'d'+(++nube.seq)+'-0000-4000-8000-000000000000',user_id:uid,autor:P.name,tipo:'diseno',compartido_de:d.id,opcion_publicada:null,pedido_at:null,revisado_at:null,created_at:t},copia));
          out.nuevos.push(P.name);
        });
        return route.fulfill({status:200,body:JSON.stringify(out),headers:H});
      }
    }
    // ── flyer_disenos (con las reglas de la migración 026)
    if(path==='/rest/v1/flyer_disenos'){
      const q=u.searchParams,uidEq=(q.get('user_id')||'').replace(/^eq\./,''),idEq=(q.get('id')||'').replace(/^eq\./,''),tipoEq=(q.get('tipo')||'').replace(/^eq\./,''),estRaw=q.get('estado')||'',estEq=/^eq\./.test(estRaw)?estRaw.slice(3):'',estIn=/^in\./.test(estRaw)?estRaw.slice(4,-1).split(',').map(x=>x.replace(/"/g,'')):null;
      const esAdmin=U.role==='admin';
      const visibles=nube.disenos.filter(d=>esAdmin||d.user_id===U.id);
      const cols=(q.get('select')||'*');
      // columnas comunes y caminos de JSON con alias (v:datos->>v = texto, v:datos->v = JSON), como PostgREST
      const proy=d=>{if(cols==='*')return d;const ks=cols.split(',');const o={};ks.forEach(k=>{const j=/^(\w+):(\w+)->(>?)(\w+)$/.exec(k);if(j){const x=d[j[2]]&&d[j[2]][j[4]];o[j[1]]=x==null?null:(j[3]&&typeof x!=='string'?String(x):x);return;}if(k in d)o[k]=d[k];});return o;};
      if(m==='HEAD'){const n=visibles.filter(d=>!estEq||d.estado===estEq).length;return route.fulfill({status:200,headers:{...H,'Content-Range':'*/'+n}});}
      if(m==='GET'){
        let l=visibles.filter(d=>(!uidEq||d.user_id===uidEq)&&(!idEq||d.id===idEq)&&(!estEq||d.estado===estEq)&&(!tipoEq||(d.tipo||'diseno')===tipoEq));
        l.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
        let a=0,lim=1000;const rg=req.headers()['range'];if(rg){const x=/(\d+)-(\d+)/.exec(rg);if(x){a=+x[1];lim=+x[2]-a+1;}}
        const sl=l.slice(a,a+lim).map(proy);
        if(obj){return route.fulfill(sl.length?{status:200,body:JSON.stringify(sl[0]),headers:H}:{status:406,body:JSON.stringify({message:'no rows',code:'PGRST116'}),headers:H});}
        return route.fulfill({status:200,body:JSON.stringify(sl),headers:{...H,'Content-Range':(sl.length?a+'-'+(a+sl.length-1):'*')+'/'+l.length}});
      }
      if(m==='POST'){
        const b=JSON.parse(req.postData()||'{}');
        if(!['privado','pedido'].includes(b.estado||'privado'))return route.fulfill({status:403,body:JSON.stringify({message:'new row violates row-level security policy'}),headers:H});
        const t=new Date().toISOString();
        const d={id:'d'+(++nube.seq)+'-0000-4000-8000-000000000000',user_id:U.id,autor:U.name,nombre:b.nombre,empresa:b.empresa||'',opcion:b.opcion,base_name:b.base_name||'',datos:b.datos,miniatura:b.miniatura||'',
          estado:b.estado||'privado',tipo:b.tipo||'diseno',compartido_por:'',compartido_de:null,compartido_at:null,nota_admin:'',opcion_publicada:null,pedido_at:(b.estado==='pedido')?t:null,revisado_at:null,created_at:t,updated_at:t};
        nube.disenos.push(d);
        return route.fulfill({status:201,body:JSON.stringify(obj?proy(d):[proy(d)]),headers:H});
      }
      if(m==='PATCH'||m==='DELETE'){
        const d=nube.disenos.find(x=>x.id===idEq&&(!estIn||estIn.includes(x.estado))&&(!estEq||x.estado===estEq));
        if(!d||!(esAdmin||d.user_id===U.id))return route.fulfill(obj?{status:406,body:JSON.stringify({message:'no rows',code:'PGRST116'}),headers:H}:{status:200,body:'[]',headers:H});
        if(m==='DELETE'){if(!esAdmin&&d.estado==='publicado')return route.fulfill({status:204,headers:H});nube.disenos.splice(nube.disenos.indexOf(d),1);return route.fulfill({status:204,headers:H});}
        const b=JSON.parse(req.postData()||'{}');
        if(!esAdmin){
          if(d.estado==='publicado')return route.fulfill({status:200,body:'[]',headers:H});
          if(b.estado&&!['privado','pedido'].includes(b.estado)&&!(b.estado==='consulta'&&d.estado==='consulta'))return route.fulfill({status:403,body:JSON.stringify({message:'new row violates row-level security policy'}),headers:H});
          delete b.nota_admin;delete b.opcion_publicada;delete b.revisado_at;delete b.user_id;delete b.autor;delete b.compartido_por;delete b.compartido_de;delete b.compartido_at;
        }
        if(b.estado==='pedido'&&d.estado!=='pedido')b.pedido_at=new Date().toISOString();
        if(esAdmin&&['publicado','rechazado'].includes(b.estado)&&b.estado!==d.estado)b.revisado_at=new Date().toISOString();
        Object.assign(d,b,{updated_at:new Date().toISOString()});
        return route.fulfill({status:200,body:JSON.stringify(obj?proy(d):[proy(d)]),headers:H});
      }
    }
    if(m==='PATCH'||m==='POST')return route.fulfill({status:201,body:'[]',headers:H});
    return route.fulfill({status:200,body:'[]',headers:{...H,'Content-Range':'0-0/0'}});
  });
  // o.antes(p): rutas propias antes de abrir (ganan a la nube simulada); o.sinEsperar: no espera a que el ingreso termine
  if(o.antes)await o.antes(p);
  await p.goto('http://127.0.0.1:8765/index.html');
  if(o.sinEsperar)return p;
  await p.waitForFunction(()=>window._fgPrevGate===false&&window.baseImg&&window.cv&&window._facLoaded&&window._opcLoaded,null,{timeout:25000});
  // o.opt: la opción en la que arranca (por defecto la 9, la única con flyer en la nube simulada)
  const OPT=o.opt||9;
  if(U.role==='admin'||o.opt9||o.opt){await p.evaluate(n=>{if(_optN(_fgOpt)!==n)switchFlyerOption(n);},OPT);}
  await p.waitForFunction(n=>window._fgOpt===n&&window.baseImg&&baseImg.naturalWidth>0&&cv.height>1000&&_fgOptCache[n]&&_fgOptCache[n].img===baseImg,OPT,{timeout:25000});
  return p;
}
module.exports={abrir,nube,USERS};
