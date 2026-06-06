var SUPA_URL='https://cajyjnxjbobdpltflgnb.supabase.co';
var SUPA_ANON='sb_publishable_M62msRVQkNbl0zk91r0zUw_q-gUDnJi';
// La service_role key YA NO está en el cliente. Las operaciones privilegiadas
// pasan por la Edge Function auth-admin, que la guarda del lado servidor.
var FN_URL=SUPA_URL+'/functions/v1/auth-admin';
var _sb=window.supabase.createClient(SUPA_URL,SUPA_ANON);
var _me=null,_admin=false,_canNotes=false,_allUsers=[],_editUid=null,_myName='';
var FLYERS_PUBLIC='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/';
var _activeFlyerUrl=null,_activeFlyerName='';

// Llama a la Edge Function auth-admin. Adjunta el JWT de la sesión si existe
// (necesario para las acciones de admin). cb(err, data).
function _callFn(action,payload,cb){
  _sb.auth.getSession().then(function(s){
    var headers={'apikey':SUPA_ANON,'Content-Type':'application/json'};
    var tok=s&&s.data&&s.data.session&&s.data.session.access_token;
    if(tok)headers['Authorization']='Bearer '+tok;
    var b={action:action};for(var k in payload)if(payload.hasOwnProperty(k))b[k]=payload[k];
    fetch(FN_URL,{method:'POST',headers:headers,body:JSON.stringify(b)})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(res){cb(res.ok?null:(res.d&&res.d.error||'Error'),res.d);})
      .catch(function(e){cb(e.message||'Error de red');});
  });
}

// ── TEMA CLARO / OSCURO ─────────────────────────────────────────────────────────
// La preferencia se guarda en localStorage (por navegador). Disponible para todos
// los usuarios logueados (asesor y admin) desde el botón del header.
function _applyTheme(t){
  var dark=(t==='dark');
  document.documentElement.classList.toggle('dark',dark);
  var btn=document.getElementById('hdr-dd-theme');
  if(btn)btn.innerHTML=dark
    ?'<span class="dd-ico">&#9728;&#65039;</span><span>Modo claro</span>'
    :'<span class="dd-ico">&#9790;</span><span>Modo oscuro</span>';
}
function _initTheme(){
  var t='light';
  try{t=localStorage.getItem('fg_theme')||'light';}catch(e){}
  _applyTheme(t);
}
function toggleTheme(){
  var next=document.documentElement.classList.contains('dark')?'light':'dark';
  try{localStorage.setItem('fg_theme',next);}catch(e){}
  _applyTheme(next);
}

// ── MENU DE USUARIO (header) ─────────────────────────────────────────────────────
function toggleUserMenu(e){
  if(e)e.stopPropagation();
  var dd=document.getElementById('hdr-dropdown');if(!dd)return;
  var open=dd.classList.toggle('open');
  if(open)setTimeout(function(){document.addEventListener('click',_closeUserMenuOutside);},0);
  else document.removeEventListener('click',_closeUserMenuOutside);
}
function closeUserMenu(){
  var dd=document.getElementById('hdr-dropdown');if(dd)dd.classList.remove('open');
  document.removeEventListener('click',_closeUserMenuOutside);
}
function _closeUserMenuOutside(e){
  var menu=document.querySelector('.hdr-user-menu');
  if(menu&&!menu.contains(e.target))closeUserMenu();
}

function _escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── BLOC DE NOTAS MÚLTIPLE (solo ADMIN y VIP) ─────────────────────────────────────
// Varias notas por usuario, con crear/eliminar. Se guardan en localStorage por
// cuenta (fg_notes_<userId>) como JSON; persisten en este navegador (no cross-device).
function _notesKey(){return 'fg_notes_'+(_me?_me.id:'anon');}
var _notes=[],_noteActive=null,_notesTid=null;
function _loadNotes(){
  try{_notes=JSON.parse(localStorage.getItem(_notesKey())||'[]');}catch(e){_notes=[];}
  if(!Array.isArray(_notes))_notes=[];
}
function _saveNotes(){try{localStorage.setItem(_notesKey(),JSON.stringify(_notes));}catch(e){}}
function _noteId(){return 'n'+Date.now()+Math.random().toString(36).slice(2,6);}
function openNotes(){
  if(!_canNotes)return;
  _loadNotes();
  if(!_notes.length)_notes.push({id:_noteId(),title:'Nota 1',body:'',updated:Date.now()});
  _noteActive=_notes[0].id;
  _renderNotesList();_renderNoteEditor();
  document.getElementById('notes-modal').style.display='flex';
}
function closeNotes(){document.getElementById('notes-modal').style.display='none';}
function _renderNotesList(){
  var list=document.getElementById('notes-list');if(!list)return;
  list.innerHTML=_notes.map(function(n){
    return '<button class="note-item'+(n.id===_noteActive?' active':'')+'" onclick="selectNote(\''+n.id+'\')">'+
      (_escHtml(n.title)||'Sin t&iacute;tulo')+'</button>';
  }).join('');
}
function _renderNoteEditor(){
  var n=_notes.find(function(x){return x.id===_noteActive;});
  var t=document.getElementById('note-title'),b=document.getElementById('note-body');
  if(t)t.value=n?n.title:'';
  if(b)b.value=n?n.body:'';
  var st=document.getElementById('notes-status');if(st)st.textContent='';
}
function selectNote(id){_noteActive=id;_renderNotesList();_renderNoteEditor();}
function newNote(){
  var n={id:_noteId(),title:'Nota '+(_notes.length+1),body:'',updated:Date.now()};
  _notes.unshift(n);_noteActive=n.id;_saveNotes();_renderNotesList();_renderNoteEditor();
  var t=document.getElementById('note-title');if(t){t.focus();t.select();}
}
function deleteNote(){
  var n=_notes.find(function(x){return x.id===_noteActive;});if(!n)return;
  if(!confirm('¿Eliminar la nota "'+(n.title||'Sin título')+'"?\n\nEsta acción no se puede deshacer.'))return;
  _notes=_notes.filter(function(x){return x.id!==_noteActive;});
  if(!_notes.length)_notes.push({id:_noteId(),title:'Nota 1',body:'',updated:Date.now()});
  _noteActive=_notes[0].id;_saveNotes();_renderNotesList();_renderNoteEditor();
  showToast('Nota eliminada');
}
function _noteEdit(titleChanged){
  var n=_notes.find(function(x){return x.id===_noteActive;});if(!n)return;
  var t=document.getElementById('note-title'),b=document.getElementById('note-body');
  n.title=t?t.value:n.title;n.body=b?b.value:n.body;n.updated=Date.now();
  _saveNotes();
  if(titleChanged)_renderNotesList();
  var st=document.getElementById('notes-status');
  if(st){st.textContent='Guardado ✓';clearTimeout(_notesTid);_notesTid=setTimeout(function(){st.textContent='';},1500);}
}
function copyNotes(){
  var b=document.getElementById('note-body');if(!b)return;
  navigator.clipboard.writeText(b.value).then(function(){showToast('Nota copiada');});
}

// ── FAVORITOS / PLANTILLAS (solo ADMIN por ahora) ─────────────────────────────────
// Guarda la combinación actual del armador (empresa, asesores, config, legal, nombre
// de archivo) y la recarga de un clic. Vive en auth.js y lee/escribe los IDs estables
// del formulario, así sobrevive a la regeneración de _source.html.
function _favKey(){return 'fg_favs_'+(_me?_me.id:'anon');}
var _favs=[];
function _loadFavs(){
  try{_favs=JSON.parse(localStorage.getItem(_favKey())||'[]');}catch(e){_favs=[];}
  if(!Array.isArray(_favs))_favs=[];
}
function _saveFavs(){try{localStorage.setItem(_favKey(),JSON.stringify(_favs));}catch(e){}}
function _favCapture(){
  function gv(id){var el=document.getElementById(id);return el?el.value:'';}
  return {
    empresa:gv('empresa'),nombre:gv('nombre'),celular:gv('celular'),email:gv('email'),
    nombre2:gv('nombre2'),celular2:gv('celular2'),email2:gv('email2'),
    legal:gv('legal-text'),filename:gv('filename'),
    ac:(typeof window.ac!=='undefined'?window.ac:0),
    a1:!!window.a1,a2:!!window.a2
  };
}
function _favApply(f){
  function sv(id,val){var el=document.getElementById(id);if(el)el.value=(val||'');}
  sv('empresa',f.empresa);sv('nombre',f.nombre);sv('celular',f.celular);sv('email',f.email);
  sv('nombre2',f.nombre2);sv('celular2',f.celular2);sv('email2',f.email2);
  sv('legal-text',f.legal);if(f.filename)sv('filename',f.filename);
  if(typeof toggleA1==='function'&&typeof window.a1!=='undefined'&&!!window.a1!==!!f.a1)toggleA1();
  if(typeof toggleA2==='function'&&typeof window.a2!=='undefined'&&!!window.a2!==!!f.a2)toggleA2();
  if(typeof setCfg==='function')setCfg(f.ac||0);
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
}
function _initFavsUI(){
  if(!_admin)return;
  var tab=document.getElementById('tab-individual');if(!tab)return;
  if(document.getElementById('fav-bar'))return; // ya inyectado
  _loadFavs();
  var bar=document.createElement('div');
  bar.id='fav-bar';bar.className='fav-bar';
  tab.insertBefore(bar,tab.firstChild);
  _renderFavs();
}
function _renderFavs(){
  var bar=document.getElementById('fav-bar');if(!bar)return;
  var chips=_favs.map(function(f){
    return '<span class="fav-chip" onclick="applyFav(\''+f.id+'\')" title="Cargar esta plantilla">'+
      '<span class="fav-star">&#9733;</span>'+_escHtml(f.name)+
      '<span class="fav-del" onclick="event.stopPropagation();deleteFav(\''+f.id+'\')" title="Eliminar">&#10005;</span></span>';
  }).join('');
  bar.innerHTML='<div class="fav-head"><span class="fav-title">&#9733; Mis plantillas</span>'+
    '<button class="fav-add" onclick="saveFav()">+ Guardar actual</button></div>'+
    '<div class="fav-chips">'+(chips||'<span class="fav-empty">Guard&aacute; la combinaci&oacute;n actual (empresa, asesor, config, legal) para reusarla de un clic.</span>')+'</div>';
}
function saveFav(){
  var name=prompt('Nombre de la plantilla:','');
  if(name===null)return;name=(name||'').trim();if(!name){showToast('Poné un nombre');return;}
  _favs.unshift({id:'f'+Date.now()+Math.random().toString(36).slice(2,5),name:name,data:_favCapture()});
  _saveFavs();_renderFavs();showToast('Plantilla "'+name+'" guardada');
}
function applyFav(id){
  var f=_favs.find(function(x){return x.id===id;});if(!f)return;
  _favApply(f.data);showToast('Plantilla "'+f.name+'" cargada');
}
function deleteFav(id){
  var f=_favs.find(function(x){return x.id===id;});if(!f)return;
  if(!confirm('¿Eliminar la plantilla "'+f.name+'"?'))return;
  _favs=_favs.filter(function(x){return x.id!==id;});
  _saveFavs();_renderFavs();showToast('Plantilla eliminada');
}

// Devuelve el badge HTML del rol (admin / vip / asesor).
function _roleBadge(role){
  var cls=role==='admin'?'admin':(role==='vip'?'vip':'asesor');
  var lbl=role==='admin'?'Admin':(role==='vip'?'VIP':'Asesor');
  return '<span class="badge badge-'+cls+'">'+lbl+'</span>';
}

// ── PARSER DE EXCEL ROBUSTO (override) ──────────────────────────────────────────
// La función loadExcel se define inline en _source.html, que se regenera seguido.
// Acá la pisamos (desde initApp, una vez cargado el HTML) por una versión que
// tolera celdas numéricas (celulares como número, config "1") y filas vacías:
// el bug original llamaba .trim()/.toLowerCase() sobre números → se trababa.
// Saneamos TODO a texto, así las funciones del HTML (validateExcel/genAll) no
// crashean aunque se regeneren con el bug. Vive en auth.js para no perderse.
function _robustLoadExcel(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'binary'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      // raw:false → XLSX formatea números/fechas como texto visible
      var rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      var clean=[];
      rows.forEach(function(r){
        var o={},hasVal=false;
        for(var k in r){
          if(!r.hasOwnProperty(k))continue;
          var val=(r[k]==null?'':String(r[k])).trim();
          o[k]=val;if(val)hasVal=true;
        }
        if(hasVal)clean.push(o); // descarta filas totalmente vacías
      });
      window.excelData=clean;
      if(typeof validateExcel==='function')validateExcel(clean);
      else if(!clean.length&&typeof showToast==='function')showToast('El Excel no tiene filas con datos.');
    }catch(err){
      if(typeof showToast==='function')showToast('No se pudo leer el Excel: '+(err&&err.message||err));
      console.error('loadExcel error:',err);
    }
  };
  reader.readAsBinaryString(file);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function initApp(){
  _initTheme();
  // Pisa loadExcel del HTML por la versión robusta (ver _robustLoadExcel).
  window.loadExcel=_robustLoadExcel;
  _sb.auth.onAuthStateChange(function(event){
    if(event==='PASSWORD_RECOVERY'){showLoginView('forgot');}
  });
  _sb.auth.getSession().then(function(r){
    if(r.data&&r.data.session){checkProfile(r.data.session.user);}
  });
  var prevEl=document.querySelector('.prev');
  if(prevEl){
    prevEl.addEventListener('wheel',function(e){e.preventDefault();if(e.deltaY<0)zoomIn();else zoomOut();},{passive:false});
    var _pd=false,_px,_py,_psx,_psy;
    prevEl.addEventListener('mousedown',function(e){
      if(e.button!==0||e.target.closest('.zoom-bar')||e.target.tagName==='BUTTON')return;
      _pd=true;_px=e.clientX;_py=e.clientY;_psx=prevEl.scrollLeft;_psy=prevEl.scrollTop;
      prevEl.classList.add('panning');e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(!_pd)return;
      prevEl.scrollLeft=_psx-(e.clientX-_px);
      prevEl.scrollTop=_psy-(e.clientY-_py);
    });
    document.addEventListener('mouseup',function(){if(_pd){_pd=false;prevEl.classList.remove('panning');}});
    document.addEventListener('mouseleave',function(){if(_pd){_pd=false;prevEl.classList.remove('panning');}});
  }
}

function showLoginView(v){
  ['login','forgot','register'].forEach(function(x){
    var el=document.getElementById('lv-'+x);
    if(el)el.style.display=(x===v)?'block':'none';
  });
  ['login-err','forgot-err','reg-err','forgot-ok','reg-ok'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.textContent='';
  });
}

function doForgotPassword(){
  var email=document.getElementById('forgot-email').value.trim();
  var pass=document.getElementById('forgot-pass').value;
  var pass2=document.getElementById('forgot-pass2').value;
  var errEl=document.getElementById('forgot-err');
  var okEl=document.getElementById('forgot-ok');
  errEl.textContent='';okEl.textContent='';
  if(!email){errEl.textContent='Ingresá tu email.';return;}
  if(pass.length<8){errEl.textContent='La contraseña debe tener al menos 8 caracteres.';return;}
  if(pass!==pass2){errEl.textContent='Las contraseñas no coinciden.';return;}
  var btn=document.getElementById('forgot-btn');btn.textContent='Enviando...';btn.disabled=true;
  // La Edge Function valida el email, setea la nueva clave (el admin nunca la
  // conoce) y deja la cuenta en reset_pending hasta que el admin apruebe.
  _callFn('request_reset',{email:email,password:pass},function(err){
    btn.textContent='Solicitar cambio';btn.disabled=false;
    if(err){errEl.textContent=err;return;}
    document.getElementById('forgot-pass').value='';
    document.getElementById('forgot-pass2').value='';
    okEl.textContent='✅ Tu nueva contraseña quedó registrada y está pendiente de aprobación del administrador. Vas a poder ingresar una vez aprobada.';
  });
}

function doRegister(){
  var name=document.getElementById('reg-name').value.trim();
  var email=document.getElementById('reg-email').value.trim();
  var pass=document.getElementById('reg-pass').value;
  var errEl=document.getElementById('reg-err');
  var okEl=document.getElementById('reg-ok');
  errEl.textContent='';okEl.textContent='';
  if(!name||!email||!pass){errEl.textContent='Completá todos los campos.';return;}
  if(pass.length<6){errEl.textContent='La contraseña debe tener al menos 6 caracteres.';return;}
  var btn=document.getElementById('reg-btn');btn.textContent='Creando cuenta...';btn.disabled=true;
  // La Edge Function crea la cuenta confirmada en estado pending (sin email de
  // confirmación, que no se entrega a dominios corporativos).
  _callFn('register',{email:email,password:pass,full_name:name},function(err){
    btn.textContent='Crear cuenta';btn.disabled=false;
    if(err){errEl.textContent=err;return;}
    document.getElementById('reg-name').value='';
    document.getElementById('reg-email').value='';
    document.getElementById('reg-pass').value='';
    okEl.textContent='✅ ¡Cuenta creada con éxito! Tu acceso queda pendiente de aprobación del administrador.';
  });
}

function checkProfile(user){
  _sb.from('profiles').select('role,full_name,nombre_asesor,celular_asesor,email_asesor,status').eq('id',user.id).single().then(function(r){
    if(r.error){document.getElementById('login-err').textContent='Error: '+r.error.message;return;}
    var p=r.data;
    if(!p||p.status!=='active'){
      var msg;
      if(p&&p.status==='pending')msg='Tu cuenta está pendiente de aprobación del administrador.';
      else if(p&&p.status==='reset_pending')msg='Tu cambio de contraseña está pendiente de aprobación del administrador.';
      else msg='Cuenta inactiva. Contactá al administrador.';
      document.getElementById('login-err').textContent=msg;
      showLoginView('login');
      return;
    }
    _me=user;_admin=(p.role==='admin');_canNotes=(p.role==='admin'||p.role==='vip');_myName=p.full_name||p.email_asesor||user.email;
    // Menú: "Cambiar mi clave" se oculta para admin (lo hace desde el panel);
    // "Bloc de notas" solo para admin y VIP.
    var _ddPass=document.getElementById('hdr-dd-pass');if(_ddPass)_ddPass.style.display=_admin?'none':'flex';
    var _ddNotes=document.getElementById('hdr-dd-notes');if(_ddNotes)_ddNotes.style.display=_canNotes?'flex':'none';
    var _ddName=document.getElementById('hdr-dd-name');if(_ddName)_ddName.textContent=_myName;
    var _ddRole=document.getElementById('hdr-dd-role');if(_ddRole)_ddRole.innerHTML=_roleBadge(p.role);
    if(_admin)_initFavsUI();
    var upd={last_login:new Date().toISOString()};
    if(!p.email_asesor&&user.email&&!_admin)upd.email_asesor=user.email;
    _sb.from('profiles').update(upd).eq('id',user.id).then(function(){});
    if(p.nombre_asesor)document.getElementById('nombre').value=p.nombre_asesor;
    if(p.celular_asesor)document.getElementById('celular').value=p.celular_asesor;
    if(p.email_asesor)document.getElementById('email').value=p.email_asesor;
    document.getElementById('hdr-user').textContent=_myName;
    var ab=document.getElementById('hdr-admin-btn');if(ab)ab.style.display=_admin?'inline-flex':'none';
    if(_admin)_refreshPendingBadge();
    // Aplicar imagen del flyer activo
    _fetchActiveFlyer(function(imageUrl){
      _showApp();
      if(imageUrl&&window.baseImg){
        var _ni=new Image();
        _ni.crossOrigin='anonymous';
        _ni.onload=function(){
          window.baseImg=_ni;
          if(typeof calcSC==='function')calcSC();
          if(typeof redraw==='function')redraw();
        };
        _ni.onerror=function(){
          console.warn('Active flyer image failed:',imageUrl);
        };
        _ni.src=imageUrl+'&_r='+Date.now();
      }
    });
  });
}

function _showApp(){
  document.getElementById('hdr-right').style.display='flex';
  document.getElementById('login-ov').style.display='none';
  document.getElementById('layout').style.display='grid';
}

// Muestra cuántas cuentas están pendientes de aprobación en el botón Admin
function _refreshPendingBadge(){
  var ab=document.getElementById('hdr-admin-btn');if(!ab)return;
  _sb.from('profiles').select('id',{count:'exact',head:true}).in('status',['pending','reset_pending']).then(function(r){
    var n=r.count||0;
    ab.innerHTML='&#9881; Admin'+(n>0?' <span style="background:#fff;color:var(--red);border-radius:10px;padding:0 6px;font-size:.66rem;font-weight:800;margin-left:2px">'+n+'</span>':'');
  });
}


function doLogin(){
  var email=document.getElementById('login-email').value.trim();
  var pass=document.getElementById('login-pass').value;
  var errEl=document.getElementById('login-err');errEl.textContent='';
  var btn=document.getElementById('login-btn');btn.textContent='Ingresando...';btn.disabled=true;
  _sb.auth.signInWithPassword({email:email,password:pass}).then(function(r){
    btn.textContent='Ingresar';btn.disabled=false;
    if(r.error){errEl.textContent=r.error.message;return;}
    checkProfile(r.data.user);
  });
}

function doLogout(){_sb.auth.signOut().then(function(){location.reload();});}

// ── CAMBIAR MI PROPIA CLAVE (cualquier usuario logueado) ────────────────────────
// El usuario autenticado cambia su clave directamente con updateUser. No pasa por
// el flujo de aprobación del admin (eso es sólo para el reset desde el login).
function openMyPassModal(){
  document.getElementById('mp-cur').value='';
  document.getElementById('mp-new').value='';
  document.getElementById('mp-new2').value='';
  document.getElementById('mp-err').textContent='';
  document.getElementById('mp-ok').textContent='';
  var btn=document.getElementById('mp-submit');btn.textContent='Cambiar contraseña';btn.disabled=false;
  document.getElementById('pass-modal').style.display='flex';
  setTimeout(function(){document.getElementById('mp-cur').focus();},100);
}

function closeMyPassModal(){document.getElementById('pass-modal').style.display='none';}

function submitMyPass(){
  var cur=document.getElementById('mp-cur').value;
  var np=document.getElementById('mp-new').value;
  var np2=document.getElementById('mp-new2').value;
  var errEl=document.getElementById('mp-err');var okEl=document.getElementById('mp-ok');
  errEl.textContent='';okEl.textContent='';
  if(!_me){errEl.textContent='Tu sesión expiró. Volvé a ingresar.';return;}
  if(!cur){errEl.textContent='Ingresá tu contraseña actual.';return;}
  if(np.length<8){errEl.textContent='La nueva contraseña debe tener al menos 8 caracteres.';return;}
  if(np!==np2){errEl.textContent='Las contraseñas nuevas no coinciden.';return;}
  if(np===cur){errEl.textContent='La nueva contraseña debe ser distinta de la actual.';return;}
  var btn=document.getElementById('mp-submit');btn.textContent='Verificando...';btn.disabled=true;
  // Reautenticamos para confirmar que la clave actual es correcta antes de cambiarla.
  _sb.auth.signInWithPassword({email:_me.email,password:cur}).then(function(r){
    if(r.error){btn.textContent='Cambiar contraseña';btn.disabled=false;errEl.textContent='La contraseña actual es incorrecta.';return;}
    btn.textContent='Guardando...';
    _sb.auth.updateUser({password:np}).then(function(r2){
      btn.textContent='Cambiar contraseña';btn.disabled=false;
      if(r2.error){errEl.textContent=r2.error.message;return;}
      okEl.textContent='✅ Tu contraseña se cambió correctamente.';
      document.getElementById('mp-cur').value='';
      document.getElementById('mp-new').value='';
      document.getElementById('mp-new2').value='';
      showToast('Contraseña actualizada');
      setTimeout(closeMyPassModal,1600);
    });
  });
}

// ── PANEL ADMIN ───────────────────────────────────────────────────────────────
function openAdminPanel(){
  var p=document.getElementById('admin-panel'),b=document.getElementById('admin-backdrop');
  if(b){b.style.display='block';requestAnimationFrame(function(){b.classList.add('show');});}
  p.style.display='flex';
  requestAnimationFrame(function(){p.classList.add('open');});
  loadStats();
}
function closeAdminPanel(){
  var p=document.getElementById('admin-panel'),b=document.getElementById('admin-backdrop');
  p.classList.remove('open');
  if(b)b.classList.remove('show');
  setTimeout(function(){p.style.display='none';if(b)b.style.display='none';},320);
}
function skelRows(n){var s='';for(var i=0;i<(n||3);i++)s+='<div class="skel skel-row"></div>';return s;}

function switchAdminTab(el,t){
  ['dashboard','usuarios','subir','registros'].forEach(function(tab){
    document.getElementById('at-'+tab).style.display=tab===t?'block':'none';
  });
  document.querySelectorAll('.atab').forEach(function(x){x.classList.toggle('active',x.dataset.tab===t);});
  if(t==='usuarios')loadUsers();
  if(t==='dashboard')loadStats();
  if(t==='subir')loadUploadHistory();
  if(t==='registros')loadRegistros();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function loadStats(){
  _sb.from('profiles').select('id,role,status,full_name,email_asesor,last_login').order('last_login',{ascending:false}).then(function(r1){
    _sb.from('flyer_logs').select('id',{count:'exact',head:true}).not('user_id','is',null).then(function(r2){
      var p=r1.data||[];
      var act=p.filter(function(x){return x.status==='active';}).length;
      var adm=p.filter(function(x){return x.role==='admin';}).length;
      var pend=p.filter(function(x){return x.status==='pending'||x.status==='reset_pending';}).length;
      document.getElementById('stat-total').textContent=p.length;
      document.getElementById('stat-active').textContent=act;
      document.getElementById('stat-admins').textContent=adm;
      document.getElementById('stat-logs').textContent=r2.count||0;
      var pendEl=document.getElementById('stat-pending');if(pendEl)pendEl.textContent=pend;
      loadFlyerLogs();
      var recentEl=document.getElementById('recent-logins');
      if(!recentEl)return;
      var recent=p.filter(function(x){return x.last_login;}).slice(0,6);
      if(!recent.length){recentEl.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin accesos registrados</p>';return;}
      recentEl.innerHTML=recent.map(function(u){
        var mail=u.email_asesor||'';
        var ini=_initials(u.full_name,mail);
        var col=_avatarColor(u.id||mail);
        var roleB=_roleBadge(u.role);
        return '<div class="recent-row">'+
          '<div class="usr-avatar sm" style="background:'+col+'">'+ini+'</div>'+
          '<div class="recent-info"><strong>'+(u.full_name||mail||'Usuario')+'</strong>'+
          '<small>'+mail+'</small></div>'+
          roleB+
          '<span class="recent-time">'+_fmtDate(u.last_login)+'</span>'+
          '</div>';
      }).join('');
    });
  });
}

// ── USUARIOS ──────────────────────────────────────────────────────────────────
function loadUsers(){
  document.getElementById('users-list').innerHTML=skelRows(4);
  _sb.from('profiles').select('*').order('created_at',{ascending:false}).then(function(r){
    _allUsers=r.data||[];
    filterUsers();
  });
}

function filterUsers(){
  var q=(document.getElementById('usr-search').value||'').toLowerCase();
  var st=document.getElementById('usr-filter').value;
  var list=_allUsers.filter(function(u){
    var mail=(u.email_asesor||'').toLowerCase();
    var matchQ=!q||(u.full_name||'').toLowerCase().includes(q)||mail.includes(q);
    var matchS=!st||u.status===st;
    return matchQ&&matchS;
  });
  var el=document.getElementById('users-list');
  if(!list.length){el.innerHTML='<p style="color:var(--gray);font-size:.8rem;text-align:center;padding:20px 0">Sin resultados</p>';return;}
  el.innerHTML=list.map(function(u){
    var mail=u.email_asesor||'';
    var ini=_initials(u.full_name,mail);
    var col=_avatarColor(u.id||mail);
    var isPend=u.status==='pending';
    var isReset=u.status==='reset_pending';
    var roleB=isPend?'':_roleBadge(u.role);
    var statusLabel=u.status==='active'?'Activo':isPend?'Pendiente':isReset?'Cambio de clave':'Inactivo';
    var statusBadgeClass=isReset?'badge-pending':'badge-'+u.status;
    var statusB='<span class="badge '+statusBadgeClass+'">'+statusLabel+'</span>';
    var lastLogin=u.last_login?_fmtDate(u.last_login):'Sin accesos';
    var actionBtns;
    if(isPend){
      actionBtns='<button class="usr-btn ok" onclick="approveUser(this,\''+u.id+'\')">Aprobar</button>'+
        '<button class="usr-btn warn" onclick="setUStatus(this,\''+u.id+'\',\'inactive\')">Rechazar</button>';
    } else if(isReset){
      actionBtns='<button class="usr-btn ok" onclick="approveUser(this,\''+u.id+'\')" title="Aprobar el cambio de contraseña">Aprobar cambio</button>'+
        '<button class="usr-btn warn" onclick="setUStatus(this,\''+u.id+'\',\'inactive\')">Rechazar</button>';
    } else {
      actionBtns=(u.status==='active'
        ?'<button class="usr-btn warn" onclick="setUStatus(this,\''+u.id+'\',\'inactive\')">Desactivar</button>'
        :'<button class="usr-btn ok" onclick="setUStatus(this,\''+u.id+'\',\'active\')">Activar</button>')+
        '<button class="usr-btn edit" onclick="openEditUser(\''+u.id+'\')">Editar</button>';
    }
    var rowStyle=(isPend||isReset)?' style="border-color:#f5c542"':'';
    var nameEsc=(u.full_name||mail||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var delBtn=(_me&&u.id===_me.id)?'':'<button class="usr-btn danger" onclick="deleteUser(this,\''+u.id+'\',\''+nameEsc+'\')" title="Eliminar usuario definitivamente">&#128465;</button>';
    return '<div class="usr-row"'+rowStyle+'>'+
      '<div class="usr-avatar" style="background:'+col+'">'+ini+'</div>'+
      '<div class="usr-info"><strong>'+(u.full_name||mail||'Sin nombre')+'</strong>'+
      '<small>'+mail+' &nbsp;&middot;&nbsp; &Uacute;lt. acceso: '+lastLogin+'</small></div>'+
      '<div class="usr-badges">'+roleB+statusB+'</div>'+
      '<div class="usr-btns">'+actionBtns+delBtn+'</div></div>';
  }).join('');
}

function setUStatus(btn,uid,status){
  btn.disabled=true;
  _sb.from('profiles').update({status:status}).eq('id',uid).then(function(){
    loadUsers();loadStats();showToast(status==='active'?'Usuario activado':'Usuario desactivado');
  });
}

function deleteUser(btn,uid,name){
  if(!confirm('¿Eliminar definitivamente a '+(name||'este usuario')+'?\n\nSe borrará su cuenta de acceso y su perfil. Esta acción no se puede deshacer.'))return;
  btn.disabled=true;var _h=btn.innerHTML;btn.innerHTML='…';
  _callFn('delete_user',{uid:uid},function(err){
    if(err){btn.disabled=false;btn.innerHTML=_h;showToast('Error: '+err);return;}
    showToast('Usuario eliminado');
    loadUsers();loadStats();
  });
}

function approveUser(btn,uid){
  btn.disabled=true;
  _sb.from('profiles').update({status:'active'}).eq('id',uid).then(function(){
    loadUsers();loadStats();_refreshPendingBadge();showToast('Usuario aprobado');
  });
}

// ── MODAL USUARIO ─────────────────────────────────────────────────────────────
function openNewUser(){
  _editUid=null;
  document.getElementById('um-title').textContent='Nuevo usuario';
  document.getElementById('um-name').value='';
  document.getElementById('um-email').value='';
  document.getElementById('um-email').disabled=false;
  document.getElementById('um-pass').value='';
  document.getElementById('um-pass').placeholder='Mínimo 8 caracteres';
  var pl0=document.querySelector('#um-pass-wrap label');if(pl0)pl0.textContent='Contraseña';
  document.getElementById('um-pass-wrap').style.display='block';
  document.getElementById('um-role').value='asesor';
  document.getElementById('um-status').value='active';
  document.getElementById('um-submit').textContent='Crear usuario';
  document.getElementById('um-err').textContent='';
  document.getElementById('user-modal').style.display='flex';
  setTimeout(function(){document.getElementById('um-name').focus();},100);
}

function openEditUser(uid){
  var u=_allUsers.find(function(x){return x.id===uid;});
  if(!u)return;
  _editUid=uid;
  document.getElementById('um-title').textContent='Editar usuario';
  document.getElementById('um-name').value=u.full_name||'';
  document.getElementById('um-email').value=u.email||'';
  document.getElementById('um-email').disabled=true;
  document.getElementById('um-pass-wrap').style.display='block';
  document.getElementById('um-pass').value='';
  document.getElementById('um-pass').placeholder='Dejar vacío para no cambiar';
  var pl=document.querySelector('#um-pass-wrap label');if(pl)pl.textContent='Nueva contraseña (opcional)';
  document.getElementById('um-role').value=u.role||'asesor';
  document.getElementById('um-status').value=u.status||'active';
  document.getElementById('um-submit').textContent='Guardar cambios';
  document.getElementById('um-err').textContent='';
  document.getElementById('user-modal').style.display='flex';
  setTimeout(function(){document.getElementById('um-name').focus();},100);
}

function closeUserModal(){
  document.getElementById('user-modal').style.display='none';
  _editUid=null;
}

function submitUser(){
  var name=document.getElementById('um-name').value.trim();
  var email=document.getElementById('um-email').value.trim();
  var pass=document.getElementById('um-pass').value;
  var role=document.getElementById('um-role').value;
  var status=document.getElementById('um-status').value;
  var errEl=document.getElementById('um-err');
  var btn=document.getElementById('um-submit');
  errEl.textContent='';
  if(!name){errEl.textContent='El nombre completo es requerido.';return;}
  if(_editUid){
    if(pass&&pass.length<8){errEl.textContent='La nueva contraseña debe tener al menos 8 caracteres.';return;}
    btn.textContent='Guardando...';btn.disabled=true;
    // El perfil (rol/estado/nombre) se actualiza con RLS (admin). La contraseña,
    // si se ingresó, va por la Edge Function.
    _sb.from('profiles').update({full_name:name,role:role,status:status}).eq('id',_editUid).then(function(r){
      if(r.error){btn.textContent='Guardar cambios';btn.disabled=false;errEl.textContent=r.error.message;return;}
      if(!pass){btn.textContent='Guardar cambios';btn.disabled=false;closeUserModal();loadUsers();loadStats();_refreshPendingBadge();showToast('Usuario actualizado');return;}
      _callFn('set_password',{uid:_editUid,password:pass},function(err){
        btn.textContent='Guardar cambios';btn.disabled=false;
        if(err){errEl.textContent=err;return;}
        closeUserModal();loadUsers();loadStats();_refreshPendingBadge();showToast('Usuario actualizado y contraseña cambiada');
      });
    });
  } else {
    if(!email||!email.includes('@')){errEl.textContent='Ingresá un email válido.';return;}
    if(pass.length<8){errEl.textContent='La contraseña debe tener al menos 8 caracteres.';return;}
    btn.textContent='Creando...';btn.disabled=true;
    _callFn('create_user',{email:email,password:pass,full_name:name,role:role,status:status},function(err){
      btn.textContent='Crear usuario';btn.disabled=false;
      if(err){errEl.textContent=err;return;}
      closeUserModal();loadUsers();loadStats();_refreshPendingBadge();showToast('✅ Usuario creado exitosamente');
    });
  }
}

// ── SUBIR FLYER ───────────────────────────────────────────────────────────────
var _uploadedUrl=null;

function handleFileDrop(e){
  e.preventDefault();
  var file=e.dataTransfer&&e.dataTransfer.files[0];
  if(file)uploadFile(file);
}

function handleFileSelect(input){
  var file=input.files&&input.files[0];
  if(file)uploadFile(file);
  input.value='';
}

function uploadFile(file){
  var errEl=document.getElementById('upload-err');
  var okEl=document.getElementById('upload-ok');
  errEl.textContent='';okEl.textContent='';
  document.getElementById('upload-result').style.display='none';
  if(!file.name.endsWith('.html')&&file.type!=='text/html'){
    errEl.textContent='Solo se permiten archivos .html';return;
  }
  if(file.size>10*1024*1024){errEl.textContent='El archivo supera los 10 MB.';return;}
  var drop=document.getElementById('upload-drop');
  drop.style.pointerEvents='none';drop.style.opacity='0.5';
  var prog=document.getElementById('upload-progress');
  var bar=document.getElementById('upload-bar');
  var pct=document.getElementById('upload-pct');
  prog.style.display='block';bar.style.width='0%';pct.textContent='0%';
  var tick=0;
  var ticker=setInterval(function(){tick=Math.min(tick+8,80);bar.style.width=tick+'%';pct.textContent=tick+'%';},150);
  var fileName='index_'+Date.now()+'.html';
  _sb.storage.from('flyers').upload(fileName,file,{contentType:'text/html',upsert:true}).then(function(r){
    clearInterval(ticker);
    drop.style.pointerEvents='';drop.style.opacity='1';
    bar.style.width='100%';pct.textContent='100%';
    setTimeout(function(){prog.style.display='none';},600);
    if(r.error){errEl.textContent='Error al subir: '+r.error.message;return;}
    _uploadedUrl='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/'+fileName;
    var urlEl=document.getElementById('upload-url');
    urlEl.href=_uploadedUrl;urlEl.textContent=_uploadedUrl;
    document.getElementById('upload-result').style.display='block';
    okEl.textContent='¡Archivo subido exitosamente!';
    showToast('Flyer subido OK');
    loadUploadHistory();
  });
}

function copyUploadUrl(){
  if(_uploadedUrl)navigator.clipboard.writeText(_uploadedUrl).then(function(){showToast('URL copiada');});
}

function downloadUploaded(){
  if(!_uploadedUrl)return;
  var a=document.createElement('a');a.href=_uploadedUrl;a.download='index.html';a.click();
}

function loadUploadHistory(){
  var histEl=document.getElementById('upload-history');if(!histEl)return;
  histEl.innerHTML=skelRows(2);
  // Leer _active.json completo para tener htmlUrl para el botón Ver
  fetch(FLYERS_PUBLIC+'_active.json?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .catch(function(){return null;})
    .then(function(activeData){
    var activeName=(activeData&&activeData.name)||'';
    var activeHtmlUrl=(activeData&&activeData.htmlUrl)||null;
    var hasActive=!!(activeData&&activeData.imageUrl);
    _sb.storage.from('flyers').list('',{limit:50,sortBy:{column:'created_at',order:'desc'}}).then(function(r){
      var files=(r.data||[]).filter(function(f){return f.name!=='_active.json'&&!f.name.startsWith('_active_img');});
      var banner=hasActive
        ?'<div class="af-banner"><div class="af-banner-info"><span class="badge badge-active" style="font-size:.62rem;letter-spacing:.5px">ACTIVO</span><span class="af-banner-name">'+activeName+'</span></div>'+
          '<div style="display:flex;gap:6px">'+(activeHtmlUrl?'<a href="'+activeHtmlUrl+'" target="_blank" class="usr-btn edit" style="font-size:.65rem;padding:5px 10px;text-decoration:none;display:inline-flex;align-items:center">Ver</a>':'')+
          '<button class="usr-btn warn" onclick="deactivateFlyer(this)" style="font-size:.65rem;padding:5px 10px">Desactivar</button></div></div>'
        :'<div class="af-banner af-banner-empty">Sin flyer activo &mdash; usuarios ven el flyer por defecto.</div>';
      if(!files.length){
        histEl.innerHTML=banner+'<p style="color:var(--gray);font-size:.8rem;margin-top:12px">Sin versiones subidas aún.</p>';
        return;
      }
      if(!files.length){
        histEl.innerHTML=banner+'<p style="color:var(--gray);font-size:.8rem;margin-top:12px">Sin versiones subidas aún.</p>';
        return;
      }
      histEl.innerHTML=banner+'<p class="ap-sec" style="margin-top:16px;margin-bottom:8px">Versiones disponibles</p>'+
        files.map(function(f){
          var url=FLYERS_PUBLIC+f.name;
          var ts=f.created_at?_fmtDate(f.created_at):'';
          var kb=f.metadata&&f.metadata.size?Math.round(f.metadata.size/1024)+' KB':'';
          var isAct=activeName===f.name;
          return '<div class="usr-row"'+(isAct?' style="border-color:var(--green);background:#f0fff4"':'')+'>'+
            '<div class="usr-info">'+
              '<strong style="font-size:.78rem">'+f.name+'</strong>'+
              '<small>'+ts+(kb?' &middot; '+kb:'')+'</small>'+
            '</div>'+
            '<div class="usr-btns">'+
              (isAct?'<span class="badge badge-active" style="font-size:.58rem;padding:4px 8px">ACTIVO</span>':
                '<button class="usr-btn ok" onclick="activateFlyer(\''+url+'\',\''+f.name+'\',this)">Activar</button>')+
              '<button class="usr-btn edit" onclick="window.open(\''+url+'\',\'_blank\')">Ver</button>'+
              '<button class="usr-btn warn" onclick="deleteUpload(this,\''+f.name+'\')"'+(isAct?' disabled title="Desactivá primero"':'')+'>Borrar</button>'+
            '</div></div>';
        }).join('');
    });
  });
}

function deleteUpload(btn,name){
  if(name===_activeFlyerName&&_activeFlyerUrl){showToast('Desactivá el flyer antes de borrarlo.');return;}
  btn.disabled=true;
  _sb.storage.from('flyers').remove([name]).then(function(){loadUploadHistory();showToast('Archivo eliminado');});
}

// ── FLYER ACTIVO ──────────────────────────────────────────────────────────────
// _active.json: {name, imageUrl, updated_at}
// imageUrl apunta a _active_img.jpg subido al bucket (imagen extraída del HTML)

function _fetchActiveFlyer(cb){
  fetch(FLYERS_PUBLIC+'_active.json?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      _activeFlyerUrl=(d&&d.imageUrl)||null;
      _activeFlyerName=(d&&d.name)||'';
      if(cb)cb(_activeFlyerUrl,_activeFlyerName);
    })
    .catch(function(){_activeFlyerUrl=null;_activeFlyerName='';if(cb)cb(null,'');});
}

// Al activar: descarga el HTML, extrae la imagen en base64, la sube como _active_img.jpg
// Los usuarios sólo descargan la imagen (no el HTML de 1.8MB)
function activateFlyer(htmlUrl,name,btn){
  if(btn){btn.disabled=true;btn.textContent='Procesando...';}
  showToast('Extrayendo imagen del flyer...');
  fetch(htmlUrl,{cache:'no-cache'})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();})
    .then(function(html){
      // Buscar baseImg.src = "data:image..." tolerando cualquier espaciado y comillas
      var re=/baseImg\.src\s*=\s*["'](data:image[^"']+)["']/g;
      var m,dataUrl=null;
      while((m=re.exec(html))!==null){dataUrl=m[1];}
      if(!dataUrl)throw new Error('No se encontró la imagen en el HTML');
      // Convertir data URL → Blob binario
      var commaIdx=dataUrl.indexOf(',');
      var mime=dataUrl.substring(5,dataUrl.indexOf(';'));
      var b64=dataUrl.substring(commaIdx+1);
      var binStr=atob(b64);
      var bytes=new Uint8Array(binStr.length);
      for(var i=0;i<binStr.length;i++)bytes[i]=binStr.charCodeAt(i);
      var blob=new Blob([bytes],{type:mime});
      var ext=mime.indexOf('jpeg')!==-1||mime.indexOf('jpg')!==-1?'jpg':'png';
      var imgName='_active_img.'+ext;
      // Subir imagen a Supabase Storage
      return _sb.storage.from('flyers').upload(imgName,blob,{contentType:mime,upsert:true})
        .then(function(r){
          if(r.error)throw new Error(r.error.message);
          // Guardar referencia en _active.json con timestamp para evitar cache CDN
          var imageUrl=FLYERS_PUBLIC+imgName+'?v='+Date.now();
          var meta=JSON.stringify({name:name,htmlUrl:htmlUrl,imageUrl:imageUrl,updated_at:new Date().toISOString()});
          return _sb.storage.from('flyers').upload('_active.json',new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true});
        })
        .then(function(r){
          if(r&&r.error)throw new Error(r.error.message);
          if(btn){btn.disabled=false;btn.textContent='Activar';}
          _activeFlyerName=name;
          showToast('¡Flyer "'+name+'" activado para todos los usuarios!');
          loadUploadHistory();
        });
    })
    .catch(function(e){
      if(btn){btn.disabled=false;btn.textContent='Activar';}
      showToast('Error al activar: '+e.message);
      console.error('activateFlyer error:',e);
    });
}

function deactivateFlyer(btn){
  if(btn){btn.disabled=true;btn.textContent='Desactivando...';}
  var data=JSON.stringify({name:'',imageUrl:null,updated_at:new Date().toISOString()});
  _sb.storage.from('flyers').upload('_active.json',new Blob([data],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(){
      if(btn){btn.disabled=false;btn.textContent='Desactivar';}
      _activeFlyerUrl=null;_activeFlyerName='';
      showToast('Flyer desactivado. Usuarios ven el flyer por defecto.');
      loadUploadHistory();
    });
}

// ── LOGS DE FLYERS ────────────────────────────────────────────────────────────
// Columnas reales de flyer_logs: id, user_id, flyer_type, empresa, config_name, format, is_bulk, bulk_count, created_at
function logFlyerToSupabase(v,fn,fmt){
  if(!_me)return;
  var extra={};
  if(v){
    ['config','nombre','celular','email','nombre2','celular2','email2'].forEach(function(k){
      if(v[k])extra[k]=v[k];
    });
  }
  _sb.from('flyer_logs').insert({
    user_id:_me.id,
    empresa:v&&v.empresa||'',
    config_name:fn||'',
    format:fmt||'png',
    is_bulk:false,
    bulk_count:0,
    flyer_type:Object.keys(extra).length?JSON.stringify(extra):null,
    created_at:new Date().toISOString()
  }).then(function(r){
    if(r&&r.error)console.warn('flyer_logs insert error:',r.error.message);
  }).catch(function(e){console.warn('flyer_logs insert failed:',e);});
}

// Carga profiles en un mapa {id: nombre} para usar en los logs
function _loadProfileMap(cb){
  _sb.from('profiles').select('id,full_name,email_asesor').then(function(r){
    var map={};
    (r.data||[]).forEach(function(p){map[p.id]=p.full_name||p.email_asesor||'Usuario';});
    cb(map);
  });
}

function loadRegistros(){
  var container=document.getElementById('registros-list');
  if(!container)return;
  container.innerHTML=skelRows(4);
  var qemp=(document.getElementById('reg-q-empresa')||{}).value||'';
  var qusr=(document.getElementById('reg-q-user')||{}).value||'';
  var qfrom=(document.getElementById('reg-q-from')||{}).value||'';
  var qto=(document.getElementById('reg-q-to')||{}).value||'';
  var query=_sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,flyer_type,created_at')
    .not('user_id','is',null)
    .order('created_at',{ascending:false});
  if(qemp.trim())query=query.ilike('empresa','%'+qemp.trim()+'%');
  if(qfrom)query=query.gte('created_at',qfrom+'T00:00:00');
  if(qto)query=query.lte('created_at',qto+'T23:59:59');
  query.limit(300).then(function(r){
    if(r.error){container.innerHTML='<p style="color:var(--red);font-size:.8rem">Error: '+r.error.message+'</p>';return;}
    _loadProfileMap(function(profileMap){
      var data=(r.data||[]).filter(function(row){return row.user_id;});
      if(qusr.trim()){
        var ql=qusr.trim().toLowerCase();
        data=data.filter(function(row){
          var nm=(profileMap[row.user_id]||'').toLowerCase();
          return nm.indexOf(ql)!==-1;
        });
      }
      var countEl=document.getElementById('reg-count');
      if(countEl)countEl.textContent=data.length+' registro'+(data.length!==1?'s':'');
      if(!data.length){container.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin registros aún. Los flyers generados por los usuarios aparecerán aquí.</p>';return;}
      container.innerHTML=data.map(function(row){
        var nombre=profileMap[row.user_id]||row.user_id||'Usuario';
        var ini=_initials(nombre,'');
        var col=_avatarColor(row.user_id||'x');
        var fmtBadge=row.format?'<span class="badge badge-asesor" style="font-size:.58rem">'+row.format.toUpperCase()+'</span>':'';
        var ex={};try{if(row.flyer_type)ex=JSON.parse(row.flyer_type);}catch(e){}
        var cfgHtml=ex.config?'<span class="reg-monto" style="background:#eef0ff;color:#3a3a8c">'+ex.config+'</span>':'';
        var cfgWrap=cfgHtml?'<div class="reg-montos">'+cfgHtml+'</div>':'';
        var asesorHtml=ex.nombre?'<div style="font-size:.68rem;color:#555;margin-top:3px"><b>Asesor:</b> '+ex.nombre+(ex.celular?' &middot; '+ex.celular:'')+(ex.email?' &middot; '+ex.email:'')+'</div>':'';
        return '<div class="reg-row">'+
          '<div class="usr-avatar sm" style="background:'+col+';flex-shrink:0">'+ini+'</div>'+
          '<div class="reg-info">'+
            '<div class="reg-top"><span class="reg-empresa">'+(row.empresa||'—')+'</span>'+fmtBadge+'</div>'+
            cfgWrap+
            asesorHtml+
            '<div class="reg-mid"><span class="reg-lbl">Generado por</span> '+nombre+'</div>'+
          '</div>'+
          '<span class="reg-fecha">'+_fmtDate(row.created_at)+'</span>'+
          '</div>';
      }).join('');
    });
  });
}

function exportRegistros(){
  var btn=document.getElementById('btn-export-reg');
  if(btn){btn.textContent='Exportando...';btn.disabled=true;}
  var qemp=(document.getElementById('reg-q-empresa')||{}).value||'';
  var qusr=(document.getElementById('reg-q-user')||{}).value||'';
  var qfrom=(document.getElementById('reg-q-from')||{}).value||'';
  var qto=(document.getElementById('reg-q-to')||{}).value||'';
  var query=_sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,flyer_type,created_at')
    .not('user_id','is',null).order('created_at',{ascending:false});
  if(qemp.trim())query=query.ilike('empresa','%'+qemp.trim()+'%');
  if(qfrom)query=query.gte('created_at',qfrom+'T00:00:00');
  if(qto)query=query.lte('created_at',qto+'T23:59:59');
  query.then(function(r){
    if(btn){btn.textContent='&#11015; Exportar Excel';btn.disabled=false;}
    if(!r.data||!r.data.length){showToast('Sin datos para exportar');return;}
    _loadProfileMap(function(profileMap){
      var data=r.data.filter(function(row){return row.user_id;});
      if(qusr.trim()){
        var ql=qusr.trim().toLowerCase();
        data=data.filter(function(row){
          return (profileMap[row.user_id]||'').toLowerCase().indexOf(ql)!==-1;
        });
      }
      if(!data.length){showToast('Sin datos para exportar');return;}
      var rows=data.map(function(row){
        var ex={};try{if(row.flyer_type)ex=JSON.parse(row.flyer_type);}catch(e){}
        return{
          'Fecha/Hora':row.created_at?new Date(row.created_at).toLocaleString('es-AR'):'',
          'Usuario':profileMap[row.user_id]||row.user_id||'',
          'Empresa':row.empresa||'',
          'Configuración':ex.config||'',
          'Nombre Asesor 1':ex.nombre||'',
          'Cel Asesor 1':ex.celular||'',
          'Email Asesor 1':ex.email||'',
          'Nombre Asesor 2':ex.nombre2||'',
          'Cel Asesor 2':ex.celular2||'',
          'Email Asesor 2':ex.email2||'',
          'Formato':row.format||''
        };
      });
      var ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:22},{wch:28},{wch:32},{wch:14},{wch:28},{wch:18},{wch:36},{wch:28},{wch:18},{wch:36},{wch:8}];
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Registros');
      XLSX.writeFile(wb,'registros_flyers_galicia_'+new Date().toISOString().slice(0,10)+'.xlsx');
      showToast('Excel descargado');
    });
  });
}

function loadFlyerLogs(){
  var el=document.getElementById('recent-flyers');if(!el)return;
  _sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,created_at')
    .not('user_id','is',null)
    .order('created_at',{ascending:false}).limit(10)
    .then(function(r){
      var data=(r.data||[]).filter(function(row){return row.user_id;});
      if(!data.length){
        el.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin flyers generados aún. Cuando un usuario descargue un flyer aparecerá aquí.</p>';return;
      }
      _loadProfileMap(function(profileMap){
        el.innerHTML=data.map(function(row){
          var nombre=profileMap[row.user_id]||row.user_id||'Usuario';
          var ini=_initials(nombre,'');
          var col=_avatarColor(row.user_id||'x');
          var det=(row.empresa||'Sin empresa')+(row.config_name?' &nbsp;&middot;&nbsp; '+row.config_name:'');
          return '<div class="recent-row">'+
            '<div class="usr-avatar sm" style="background:'+col+'">'+ini+'</div>'+
            '<div class="recent-info"><strong>'+nombre+'</strong>'+
            '<small>'+det+'</small></div>'+
            '<span class="recent-time">'+_fmtDate(row.created_at)+'</span>'+
            '</div>';
        }).join('');
      });
    });
}

function exportFlyerLogsExcel(){
  var btn=document.getElementById('btn-export-excel');
  if(btn){btn.textContent='Exportando...';btn.disabled=true;}
  _sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,created_at')
    .not('user_id','is',null).order('created_at',{ascending:false}).then(function(r){
    if(btn){btn.textContent='&#11015; Exportar Excel';btn.disabled=false;}
    if(!r.data||!r.data.length){showToast('Sin datos para exportar');return;}
    _loadProfileMap(function(profileMap){
      var rows=r.data.filter(function(row){return row.user_id;}).map(function(row){
        return {
          'Usuario':profileMap[row.user_id]||row.user_id||'',
          'Empresa':row.empresa||'',
          'Formato':row.format||'',
          'Configuración':row.config_name||'',
          'Fecha/Hora':row.created_at?new Date(row.created_at).toLocaleString('es-AR'):''
        };
      });
      var ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:30},{wch:30},{wch:40},{wch:22}];
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Flyers generados');
      XLSX.writeFile(wb,'flyers_galicia_'+new Date().toISOString().slice(0,10)+'.xlsx');
      showToast('Excel descargado');
    });
  });
}


// ── UTILIDADES ────────────────────────────────────────────────────────────────
var ZOOM=1.0;
function _updateZoomPct(){var el=document.getElementById('zoom-pct');if(el)el.textContent=Math.round(ZOOM*100)+'%';}
function zoomIn(){ZOOM=Math.min(ZOOM*1.25,4.0);calcSC();redraw();_updateZoomPct();}
function zoomOut(){ZOOM=Math.max(ZOOM/1.25,0.2);calcSC();redraw();_updateZoomPct();}
function zoomReset(){ZOOM=1.0;calcSC();redraw();_updateZoomPct();}
function calcSC(){var p=document.querySelector('.prev');if(!p||!baseImg.width)return;var pw=Math.max(p.clientWidth-40,200);var baseSC=Math.min(0.55,pw/baseImg.width);SC=baseSC*ZOOM;cv.width=Math.round(baseImg.width*SC);cv.height=Math.round(baseImg.height*SC);cv.style.width='';cv.style.height='';}

function showToast(msg){
  var t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._tid);t._tid=setTimeout(function(){t.style.opacity='0';},2500);
}

function _initials(name,email){
  if(name&&name.trim()){var p=name.trim().split(' ');return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():p[0].substring(0,2).toUpperCase();}
  return (email||'??').substring(0,2).toUpperCase();
}

function _avatarColor(str){
  var c=['#c62828','#1565c0','#2e7d32','#6a1b9a','#e65100','#00695c','#4527a0','#283593'];
  var h=0;for(var i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))&0xFFFF;
  return c[h%c.length];
}

function _fmtDate(iso){
  if(!iso)return '—';
  var d=new Date(iso),now=new Date(),diff=(now-d)/1000;
  if(diff<60)return 'hace un momento';
  if(diff<3600)return 'hace '+Math.floor(diff/60)+' min';
  if(diff<86400)return 'hace '+Math.floor(diff/3600)+'h';
  if(diff<172800)return 'ayer';
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}
