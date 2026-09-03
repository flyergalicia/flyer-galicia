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
  if(!btn)return;
  var svgOpen='<svg class="dd-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
  var moon=svgOpen+'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var sun=svgOpen+'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  btn.innerHTML=(dark?sun:moon)+'<span>'+(dark?'Modo claro':'Modo oscuro')+'</span>';
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
function moveNote(dir){
  var i=-1;for(var k=0;k<_notes.length;k++){if(_notes[k].id===_noteActive){i=k;break;}}
  if(i<0)return;
  var j=i+dir;if(j<0||j>=_notes.length)return;
  var tmp=_notes[i];_notes[i]=_notes[j];_notes[j]=tmp;
  _saveNotes();_renderNotesList();
}

// ── ASESORES GUARDADOS (predeterminados) — ADMIN y VIP ───────────────────────────
// Lista de asesores (nombre, celular, email) guardada por cuenta. Se accede tocando
// el título de sección "Asesor 1" / "Asesor 2": abre un popover con la lista (solo
// nombres) para autocompletar ese asesor. Vive en auth.js (sobrevive a la regen).
function _asKey(){return 'fg_asesores_'+(_me?_me.id:'anon');}
var _asesores=[];
function _loadAsesores(){
  try{_asesores=JSON.parse(localStorage.getItem(_asKey())||'[]');}catch(e){_asesores=[];}
  if(!Array.isArray(_asesores))_asesores=[];
}
function _saveAsesores(){try{localStorage.setItem(_asKey(),JSON.stringify(_asesores));}catch(e){}}
function _gv(id){var el=document.getElementById(id);return el?el.value:'';}
function _setVal(id,v){var el=document.getElementById(id);if(el)el.value=(v||'');}

// Hace clickeables los títulos "Asesor 1" y "Asesor 2" (vienen de _source.html).
function _initAsesoresUI(){
  if(!_canNotes)return; // ADMIN y VIP
  var secs=document.querySelectorAll('#tab-individual .sec');
  Array.prototype.forEach.call(secs,function(sec){
    var t=(sec.textContent||'').toLowerCase();
    var slot=0;
    for(var k=1;k<=4;k++){if(t.indexOf('asesor '+k)>=0){slot=k;break;}}
    if(!slot||sec.dataset.asLinked)return;
    sec.dataset.asLinked='1';
    sec.classList.add('sec-clickable');
    sec.insertAdjacentHTML('beforeend',' <span class="sec-caret">&#9662;</span>');
    sec.addEventListener('click',function(e){e.stopPropagation();openAsPop(slot,sec);});
  });
}
function _asItemHtml(a,slot){
  return '<div class="as-item" onclick="applyAsesor(\''+a.id+'\','+slot+')">'+
    '<span class="as-item-name">'+_escHtml(a.name||a.nombre||'Sin nombre')+'</span>'+
    '<span class="as-del" onclick="event.stopPropagation();delAsesor(\''+a.id+'\','+slot+')" title="Eliminar">&#10005;</span></div>';
}
function _asListHtml(slot){
  return _asesores.length?_asesores.map(function(a){return _asItemHtml(a,slot);}).join('')
    :'<div class="as-empty">No tenés asesores guardados todavía.</div>';
}
function openAsPop(slot,anchor){
  closeAsPop();
  _loadAsesores();
  var pop=document.createElement('div');
  pop.id='as-pop';pop.className='as-pop';
  pop.innerHTML='<div class="as-pop-head">Asesor '+slot+' &middot; guardados</div>'+
    '<div class="as-list">'+_asListHtml(slot)+'</div>'+
    '<div class="as-pop-foot">'+
      '<button class="as-act" onclick="saveAsesor('+slot+')">+ Guardar el actual</button>'+
      '<button class="as-act" onclick="document.getElementById(\'as-xls\').click()" title="Importar asesores desde Excel">&#8593; Excel</button>'+
    '</div>'+
    '<input type="file" id="as-xls" accept=".xlsx,.xls" style="display:none" onchange="importAsesores(this)">';
  document.body.appendChild(pop);
  var r=anchor.getBoundingClientRect();
  pop.style.top=(r.bottom+4)+'px';
  pop.style.left=Math.round(r.left)+'px';
  setTimeout(function(){document.addEventListener('click',_closeAsOutside);},0);
}
function closeAsPop(){var p=document.getElementById('as-pop');if(p)p.parentNode.removeChild(p);document.removeEventListener('click',_closeAsOutside);}
function _closeAsOutside(e){var p=document.getElementById('as-pop');if(p&&!p.contains(e.target))closeAsPop();}
function applyAsesor(id,slot){
  var a=_asesores.find(function(x){return x.id===id;});if(!a)return;
  var sfx=(slot>1)?String(slot):'';
  _setVal('nombre'+sfx,a.nombre);_setVal('celular'+sfx,a.celular);_setVal('email'+sfx,a.email);
  if(slot===2){if(typeof toggleA2==='function'&&!window.a2)toggleA2();}
  else if(slot===3){if(!_fgA3)toggleA3();}
  else if(slot===4){if(!_fgA4)toggleA4();}
  else{if(typeof toggleA1==='function'&&!window.a1)toggleA1();}
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
  closeAsPop();showToast('Asesor "'+(a.name||a.nombre)+'" cargado');
}
function saveAsesor(slot){
  var n=slot===2?_gv('nombre2'):_gv('nombre');
  var c=slot===2?_gv('celular2'):_gv('celular');
  var m=slot===2?_gv('email2'):_gv('email');
  if(!n&&!c&&!m){showToast('Completá el asesor antes de guardar');return;}
  var name=prompt('Nombre para guardar este asesor:',n||'');
  if(name===null)return;name=(name||n||'').trim();if(!name){showToast('Poné un nombre');return;}
  _asesores.unshift({id:'a'+Date.now()+Math.random().toString(36).slice(2,5),name:name,nombre:n,celular:c,email:m});
  _saveAsesores();closeAsPop();showToast('Asesor "'+name+'" guardado');
}
function delAsesor(id,slot){
  var a=_asesores.find(function(x){return x.id===id;});if(!a)return;
  if(!confirm('¿Eliminar el asesor guardado "'+(a.name||a.nombre)+'"?'))return;
  _asesores=_asesores.filter(function(x){return x.id!==id;});
  _saveAsesores();
  var list=document.querySelector('#as-pop .as-list');
  if(list)list.innerHTML=_asListHtml(slot); // refresca sin cerrar
  showToast('Asesor eliminado');
}
function importAsesores(input){
  var file=input&&input.files&&input.files[0];if(!file)return;input.value='';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'binary'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      var added=0;
      rows.forEach(function(r){
        function g(keys){for(var i=0;i<keys.length;i++){var v=r[keys[i]];if(v!=null&&String(v).trim()!=='')return String(v).trim();}return '';}
        var n1=g(['asesor1_nombre','nombre','Nombre']);
        if(n1){_asesores.unshift({id:'a'+Date.now()+Math.random().toString(36).slice(2,5),name:n1,nombre:n1,celular:g(['asesor1_celular','celular','Celular']),email:g(['asesor1_email','email','Email'])});added++;}
        var n2=g(['asesor2_nombre']);
        if(n2){_asesores.unshift({id:'a'+Date.now()+Math.random().toString(36).slice(2,5)+'b',name:n2,nombre:n2,celular:g(['asesor2_celular']),email:g(['asesor2_email'])});added++;}
      });
      _saveAsesores();closeAsPop();
      showToast(added?(added+' asesor'+(added>1?'es':'')+' importado'+(added>1?'s':'')):'No se encontraron asesores en el Excel');
    }catch(err){showToast('No se pudo leer el Excel: '+(err&&err.message||err));console.error('importAsesores:',err);}
  };
  reader.readAsBinaryString(file);
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
  // Motor de dibujado config-driven (coordenadas por flyer) + negritas al pegar.
  _installFlyerEngine();
  window.FLYER_CFG=_readDocCfg()||window.FLYER_CFG||{};
  _attachLegalPaste('legal-text');
  _fgEnsureAsesores34(); // campos de asesor 3 y 4 (el template sólo trae 1 y 2)
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
    if(_canNotes)_initAsesoresUI();
    var upd={last_login:new Date().toISOString()};
    if(!p.email_asesor&&user.email&&!_admin)upd.email_asesor=user.email;
    _sb.from('profiles').update(upd).eq('id',user.id).then(function(){});
    // Default vacío + placeholders (como Asesor 2): NO mostramos el ejemplo del
    // template (Julieta) ni el mail. Cada uno carga lo suyo o usa "asesores guardados".
    // Empresa vacía con indicación (nada de "AMIC..." por default: queda más profesional)
    var _eE0=document.getElementById('empresa');if(_eE0){_eE0.value='';_eE0.placeholder='Nombre de la empresa';}
    var _eN=document.getElementById('nombre');if(_eN){_eN.value=p.nombre_asesor||'';_eN.placeholder='Nombre Asesor 1';}
    var _eC=document.getElementById('celular');if(_eC){_eC.value=p.celular_asesor||'';_eC.placeholder='11 XXXX XXXX';}
    var _eE=document.getElementById('email');if(_eE){_eE.value='';_eE.placeholder='mail@bancogalicia.com.ar';}
    if(typeof updateFnPreview==='function')updateFnPreview();
    if(typeof redraw==='function')redraw();
    _fgOpt=1; // todos arrancan en Opción 1 (los asesores/VIP se quedan siempre acá)
    _applyGlobalLegalToForm(1); // trae los T&C globales de la Opción 1
    document.getElementById('hdr-user').textContent=_myName;
    var ab=document.getElementById('hdr-admin-btn');if(ab)ab.style.display=_admin?'inline-flex':'none';
    if(_admin){_refreshPendingBadge();_fgEnsureOptBar();} // el selector es SOLO para admin
    // Aplicar imagen del flyer activo (Opción 1)
    _fetchActiveFlyer(function(imageUrl){
      _showApp();
      // Cacheo la Opción 1 para que volver a ella sea instantáneo
      _fgOptCache[1]={loaded:true,cfg:window.FLYER_CFG||null,imageUrl:imageUrl,
        name:_activeFlyerName,legal:null,img:null};
      loadGlobalLegal(false,1).then(function(t){if(_fgOptCache[1])_fgOptCache[1].legal=t||'';});
      if(imageUrl&&window.baseImg){
        var _ni=new Image();
        _ni.crossOrigin='anonymous';
        _ni.onload=function(){
          window.baseImg=_ni;
          if(_fgOptCache[1])_fgOptCache[1].img=_ni;
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
  ['dashboard','usuarios','subir','registros','legales'].forEach(function(tab){
    var el2=document.getElementById('at-'+tab);if(el2)el2.style.display=tab===t?'block':'none';
  });
  // :not(.ltab) para no pisar las sub-solapas de legales (Opción 1 / Opción 2)
  document.querySelectorAll('.atab:not(.ltab)').forEach(function(x){x.classList.toggle('active',x.dataset.tab===t);});
  if(t==='usuarios')loadUsers();
  if(t==='dashboard')loadStats();
  if(t==='subir')loadUploadHistory();
  if(t==='registros')loadRegistros();
  if(t==='legales'){
    _FG_OPTS.forEach(function(o){loadGlobalLegal(true,o);_attachLegalPaste(_glegalId(o));});
  }
}

// ── LEGAL GLOBAL (términos y condiciones para todos) ──────────────────────────────
// Se guarda en el bucket flyers como _legal.json {text, updated_at}. El admin lo edita
// desde el panel; todos los usuarios lo reciben precargado al iniciar sesión.
// Cada opción del armador tiene su propio legal (_legal.json / _legal2.json).
function loadGlobalLegal(toEditor,opt){
  opt=_optN(opt);
  return fetch(FLYERS_PUBLIC+_legalFile(opt)+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      var txt=(d&&typeof d.text==='string')?d.text:'';
      if(toEditor){var el=document.getElementById(_glegalId(opt));if(el)el.value=txt;}
      return txt;
    }).catch(function(){return '';});
}
function saveGlobalLegal(opt){
  opt=_optN(opt);
  var sfx=(opt===1)?'':String(opt);
  var el=document.getElementById('glegal-text'+sfx);if(!el)return;
  var txt=el.value;
  var btn=document.getElementById('glegal-save'+sfx),err=document.getElementById('glegal-err'+sfx),ok=document.getElementById('glegal-ok'+sfx);
  if(err)err.textContent='';if(ok)ok.textContent='';
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  var meta=JSON.stringify({text:txt,updated_at:new Date().toISOString()});
  _sb.storage.from('flyers').upload(_legalFile(opt),new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){
      if(btn){btn.disabled=false;btn.textContent='Guardar y aplicar a todos';}
      if(r&&r.error){if(err)err.textContent='Error: '+r.error.message;return;}
      if(ok)ok.textContent='✅ Guardado. Se aplica a '+_optLabel(opt)+' para todos los usuarios.';
      var c=_fgOptCache[opt];
      // lo recién guardado pasa a ser la base: descarto la edición de sesión
      if(c){c.legal=txt;delete c.legalEdited;}
      // si estoy viendo esa opción, refresco el legal del armador al toque
      if(_optN(_fgOpt)===opt){var f=document.getElementById('legal-text');if(f){f.value=txt;if(typeof redraw==='function')redraw();}}
      showToast('Legal de '+_optLabel(opt)+' actualizado');
    });
}
// Precarga el legal de la opción en el formulario (pisa el default del template).
function _applyGlobalLegalToForm(opt){
  opt=_optN(opt);
  loadGlobalLegal(false,opt).then(function(txt){
    if(txt&&txt.trim()){var el=document.getElementById('legal-text');if(el){el.value=txt;if(typeof redraw==='function')redraw();}}
  });
}
// Sub-solapas de legales en el panel admin.
function _glegalId(opt){var n=_optN(opt);return n===1?'glegal-text':'glegal-text'+n;}
function switchLegalTab(el,n){
  n=_optN(n);
  _FG_OPTS.forEach(function(o){var d=document.getElementById('lt-'+o);if(d)d.style.display=(o===n)?'block':'none';});
  document.querySelectorAll('.ltab').forEach(function(x){x.classList.toggle('active',+x.getAttribute('data-ltab')===n);});
  _attachLegalPaste(_glegalId(n));
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

// PDF/imagen: pregunto a qué opción va (queda calibrado y activado ahí).
// HTML: se sube nomás; la opción se elige después al apretar "Activar".
function _startUpload(file){
  var isHtml=/\.html?$/i.test(file.name)||file.type==='text/html';
  if(isHtml){uploadFile(file,0);return;}
  _askOption('¿A qué opción subís este flyer?',function(o){uploadFile(file,o);});
}
function handleFileDrop(e){
  e.preventDefault();
  var file=e.dataTransfer&&e.dataTransfer.files[0];
  if(file)_startUpload(file);
}

function handleFileSelect(input){
  var file=input.files&&input.files[0];
  input.value='';
  if(file)_startUpload(file);
}

// Barra de progreso de subida (on/off), reutilizable para HTML y PDF/imagen.
function _upProg(on){
  var drop=document.getElementById('upload-drop');
  var prog=document.getElementById('upload-progress');
  var bar=document.getElementById('upload-bar'),pct=document.getElementById('upload-pct');
  if(on){if(drop){drop.style.pointerEvents='none';drop.style.opacity='0.5';}if(prog)prog.style.display='block';
    if(bar)bar.style.width='0%';if(pct)pct.textContent='0%';_upProg._v=0;
    _upProg._t=setInterval(function(){_upProg._v=Math.min(_upProg._v+8,80);if(bar)bar.style.width=_upProg._v+'%';if(pct)pct.textContent=_upProg._v+'%';},150);}
  else{clearInterval(_upProg._t);if(drop){drop.style.pointerEvents='';drop.style.opacity='1';}
    if(bar)bar.style.width='100%';if(pct)pct.textContent='100%';setTimeout(function(){if(prog)prog.style.display='none';},600);}
}
function uploadFile(file,opt){
  var errEl=document.getElementById('upload-err');
  var okEl=document.getElementById('upload-ok');
  errEl.textContent='';okEl.textContent='';
  document.getElementById('upload-result').style.display='none';
  var isHtml=/\.html?$/i.test(file.name)||file.type==='text/html';
  var isPdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
  var isImg=/\.(png|jpe?g)$/i.test(file.name)||/^image\//.test(file.type||'');
  if(!isHtml&&!isPdf&&!isImg){errEl.textContent='Formatos permitidos: PDF, PNG, JPG o HTML.';return;}
  if(file.size>25*1024*1024){errEl.textContent='El archivo supera los 25 MB.';return;}
  if(isHtml){
    _upProg(true);
    var fileName='index_'+Date.now()+'.html';
    _sb.storage.from('flyers').upload(fileName,file,{contentType:'text/html',upsert:true}).then(function(r){
      _upProg(false);
      if(r.error){errEl.textContent='Error al subir: '+r.error.message;return;}
      _uploadedUrl=FLYERS_PUBLIC+fileName;
      var urlEl=document.getElementById('upload-url');urlEl.href=_uploadedUrl;urlEl.textContent=_uploadedUrl;
      document.getElementById('upload-result').style.display='block';
      okEl.textContent='¡Archivo subido exitosamente!';showToast('Flyer subido OK');loadUploadHistory();
    });
    return;
  }
  // PDF o imagen → rasterizar a 1240px → subir jpg → abrir calibrador automáticamente
  _upProg(true);showToast('Convirtiendo flyer...');
  _rasterizeFlyer(file,function(blob,cvs){
    if(!blob){_upProg(false);errEl.textContent='No se pudo procesar el archivo.';return;}
    var imgName='flyer_'+Date.now()+'.jpg';
    _sb.storage.from('flyers').upload(imgName,blob,{contentType:'image/jpeg',upsert:true}).then(function(r){
      _upProg(false);
      if(r.error){errEl.textContent='Error al subir: '+r.error.message;return;}
      okEl.textContent='¡Flyer convertido! Acomodá las zonas y guardá ('+_optLabel(opt||1)+').';
      showToast('Flyer subido — calibrá las zonas');loadUploadHistory();
      var url=FLYERS_PUBLIC+imgName;
      var im=new Image();im.onload=function(){_calOpen(im,imgName,url,opt||1);};im.src=cvs.toDataURL('image/jpeg',0.92);
    });
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
  // Leo el flyer activo de TODAS las opciones (_active.json, _active2.json, _active3.json)
  var pend=_FG_OPTS.length;
  _FG_OPTS.forEach(function(o){
    _fetchActiveMeta(o,function(d){_fgHistMeta[o]=d;if(--pend===0)_renderUploadHistory(histEl);});
  });
}
function _renderUploadHistory(histEl){
  _sb.storage.from('flyers').list('',{limit:50,sortBy:{column:'created_at',order:'desc'}}).then(function(r){
    var files=(r.data||[]).filter(function(f){return !f.name.startsWith('_');});
    var banner=_FG_OPTS.map(function(o){
      var d=_fgHistMeta[o],has=!!(d&&d.imageUrl);
      if(!has)return '<div class="af-banner af-banner-empty">'+_optLabel(o)+': sin flyer activo.</div>';
      var hUrl=(d&&d.htmlUrl)||null;
      return '<div class="af-banner"><div class="af-banner-info">'+
        _optBadge(o,'font-size:.62rem;padding:4px 8px')+
        '<span class="af-banner-name">'+_escHtml(d.name||'')+'</span></div>'+
        '<div style="display:flex;gap:6px">'+
        (hUrl?'<a href="'+hUrl+'" target="_blank" class="usr-btn edit" style="font-size:.65rem;padding:5px 10px;text-decoration:none;display:inline-flex;align-items:center">Ver</a>':'')+
        '<button class="usr-btn warn" onclick="deactivateFlyer(this,'+o+')" style="font-size:.65rem;padding:5px 10px">Desactivar</button>'+
        '</div></div>';
    }).join('');
    if(!files.length){
      histEl.innerHTML=banner+'<p style="color:var(--gray);font-size:.8rem;margin-top:12px">Sin versiones subidas aún.</p>';
      return;
    }
    histEl.innerHTML=banner+'<p class="ap-sec" style="margin-top:16px;margin-bottom:8px">Versiones disponibles</p>'+
      files.map(function(f){
        var url=FLYERS_PUBLIC+f.name;
        var ts=f.created_at?_fmtDate(f.created_at):'';
        var kb=f.metadata&&f.metadata.size?Math.round(f.metadata.size/1024)+' KB':'';
        var actIn=_FG_OPTS.filter(function(o){return _fgHistMeta[o]&&_fgHistMeta[o].name===f.name;});
        var isAct=actIn.length>0;
        var isImg=/\.(png|jpe?g)$/i.test(f.name);
        var fn=isImg?'activateImageFlyer':'activateFlyer';
        var tag=isImg?'<span class="badge" style="font-size:.55rem;padding:3px 7px;background:#eef3fb;color:#1d4070;margin-left:6px">PDF/IMG</span>':'';
        var actTags=actIn.map(function(o){return _optBadge(o,'margin-left:5px');}).join('');
        function ab(o){
          if(actIn.indexOf(o)!==-1)return '';
          return '<button class="usr-btn ok" title="Activar en '+_optLabel(o)+'" style="border-color:'+_optColor(o)+';color:'+_optColor(o)+
            '" onclick="'+fn+'(\''+url+'\',\''+f.name+'\',this,'+o+')">Op.'+o+'</button>';
        }
        var calBtn=isImg?'<button class="usr-btn edit" onclick="_calFromList(\''+url+'\',\''+f.name+'\')">Calibrar</button>':'';
        return '<div class="usr-row"'+(isAct?' style="border-color:var(--green);background:#f0fff4"':'')+'>'+
          '<div class="usr-info">'+
            '<strong style="font-size:.78rem">'+f.name+tag+actTags+'</strong>'+
            '<small>'+ts+(kb?' &middot; '+kb:'')+'</small>'+
          '</div>'+
          '<div class="usr-btns">'+
            _FG_OPTS.map(ab).join('')+calBtn+
            '<button class="usr-btn edit" onclick="window.open(\''+url+'\',\'_blank\')">Ver</button>'+
            '<button class="usr-btn warn" onclick="deleteUpload(this,\''+f.name+'\')"'+(isAct?' disabled title="Desactivá primero"':'')+'>Borrar</button>'+
          '</div></div>';
      }).join('');
  });
}

function deleteUpload(btn,name){
  var inUse=_FG_OPTS.some(function(o){return _fgHistMeta[o]&&_fgHistMeta[o].name===name;});
  if(inUse){showToast('Desactivá el flyer antes de borrarlo.');return;}
  btn.disabled=true;
  _sb.storage.from('flyers').remove([name]).then(function(){loadUploadHistory();showToast('Archivo eliminado');});
}

// ── DOS ARMADORES: Opción 1 / Opción 2 (selector SOLO para ADMIN) ───────────────
// Cada opción tiene su propio flyer activo (_active.json / _active2.json) y su propio
// legal global (_legal.json / _legal2.json). La Opción 1 es EXACTAMENTE lo que existía
// antes, así que asesores y VIP no ven ningún cambio (no se les muestra el selector).
// Al cambiar de opción se intercambian baseImg + FLYER_CFG + #legal-text; por eso el
// armador individual, el MASIVO (genAll usa legal-text + fullRes) y las descargas
// funcionan igual en las dos sin tocar nada más.
var _FG_OPTS=[1,2,3];
var _fgOpt=1,_fgOptCache={},_fgHistMeta={};
function _optN(opt){var n=+opt;return (_FG_OPTS.indexOf(n)!==-1)?n:1;}
// Opción 1 conserva los nombres originales (_active.json/_legal.json) => cero cambios
// para los asesores; las demás agregan el número.
function _activeFile(opt){var n=_optN(opt);return n===1?'_active.json':'_active'+n+'.json';}
function _legalFile(opt){var n=_optN(opt);return n===1?'_legal.json':'_legal'+n+'.json';}
function _optLabel(opt){return 'Opción '+_optN(opt);}
// Color por opción: se usa igual en registros, historial y badges (control visual).
function _optColor(opt){var n=_optN(opt);return n===2?'#0e8a5f':(n===3?'#8e44ad':'#1d4070');}
function _optBadge(opt,extraCss){
  var n=_optN(opt),c=_optColor(n);
  return '<span class="badge" style="font-size:.56rem;padding:3px 7px;background:'+c+
    ';color:#fff;letter-spacing:.3px;'+(extraCss||'')+'">OP.'+n+'</span>';
}
function _fetchActiveMeta(opt,cb){
  fetch(FLYERS_PUBLIC+_activeFile(opt)+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){cb(d||null);}).catch(function(){cb(null);});
}
// Barra de opciones: se inyecta arriba de los tabs Individual/Masivo/Historial.
// Se llama sólo si _admin, así que para el resto el armador queda idéntico a hoy.
function _fgEnsureOptBar(){
  if(document.getElementById('fg-optbar'))return;
  var tabs=document.querySelector('.panel .tabs')||document.querySelector('.tabs');
  if(!tabs||!tabs.parentNode)return;
  var st=document.createElement('style');st.id='fg-optbar-style';
  st.textContent=
    '#fg-optbar{display:flex;gap:6px;margin:0 0 10px;padding:4px;background:rgba(128,128,128,.14);border-radius:9px}'+
    '#fg-optbar .fgo{flex:1;text-align:center;padding:7px 8px;border-radius:7px;cursor:pointer;font-size:.76rem;font-weight:600;color:var(--gray,#777);user-select:none;transition:.15s;background:none;border-bottom:2px solid transparent}'+
    '#fg-optbar .fgo:hover{color:#444}'+
    'html.dark #fg-optbar .fgo:hover{color:#ddd}'+
    '#fg-optbar .fgo.on{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14)}'+
    'html.dark #fg-optbar .fgo.on{background:#2c2f36}';
  document.head.appendChild(st);
  var bar=document.createElement('div');bar.id='fg-optbar';
  bar.innerHTML=_FG_OPTS.map(function(o){
    return '<div class="fgo" data-o="'+o+'" onclick="switchFlyerOption('+o+')">Opción '+o+'</div>';
  }).join('');
  tabs.parentNode.insertBefore(bar,tabs);
  _fgRenderOptBar();
}
function _fgRenderOptBar(){
  var bar=document.getElementById('fg-optbar');if(!bar)return;
  bar.querySelectorAll('.fgo').forEach(function(x){
    var o=+x.getAttribute('data-o'),on=(o===_optN(_fgOpt));
    x.classList.toggle('on',on);
    // la opción activa se pinta con SU color (mismo que registros/historial)
    x.style.color=on?_optColor(o):'';
    x.style.borderBottomColor=on?_optColor(o):'transparent';
  });
}
// Guarda en la opción que estoy dejando el legal TAL COMO LO EDITÉ, para que al volver
// siga igual (ej: le cambié una fecha). Se pierde sólo al recargar la página o al
// apretar "Restaurar".
function _fgStashLegal(){
  var el=document.getElementById('legal-text');if(!el)return;
  var n=_optN(_fgOpt),c=_fgOptCache[n];
  if(!c)c=_fgOptCache[n]={loaded:false};
  c.legalEdited=el.value;
}
function switchFlyerOption(opt,cb){
  if(!_admin)return; // gating: sólo admin puede cambiar de armador
  opt=_optN(opt);
  _fgStashLegal();
  _fgOpt=opt;_fgRenderOptBar();
  var c=_fgOptCache[opt];
  if(c&&c.loaded){_fgApplyOption(c);if(cb)cb();return;}
  showToast('Cargando '+_optLabel(opt)+'...');
  var keepEdited=c?c.legalEdited:undefined; // no piso una edición previa de esta opción
  _fetchActiveMeta(opt,function(d){
    var cache=_fgOptCache[opt]={loaded:false,cfg:(d&&d.cfg)||null,
      imageUrl:(d&&d.imageUrl)||null,name:(d&&d.name)||'',legal:null,img:null,legalEdited:keepEdited};
    loadGlobalLegal(false,opt).then(function(txt){
      cache.legal=txt||'';
      if(!cache.imageUrl){
        cache.loaded=true;
        if(_optN(_fgOpt)===opt){_fgApplyOption(cache);showToast(_optLabel(opt)+' todavía no tiene flyer: subilo desde el panel.');}
        if(cb)cb();
        return;
      }
      var im=new Image();im.crossOrigin='anonymous';
      im.onload=function(){cache.img=im;cache.loaded=true;if(_optN(_fgOpt)===opt)_fgApplyOption(cache);if(cb)cb();};
      im.onerror=function(){cache.loaded=true;if(_optN(_fgOpt)===opt){_fgApplyOption(cache);showToast('No se pudo cargar la imagen de '+_optLabel(opt));}if(cb)cb();};
      im.src=cache.imageUrl+(cache.imageUrl.indexOf('?')>=0?'&':'?')+'_r='+Date.now();
    });
  });
}
function _fgApplyOption(cache){
  if(cache.img)window.baseImg=cache.img;
  window.FLYER_CFG=cache.cfg||{};
  var el=document.getElementById('legal-text');
  // prioridad: lo que dejé editado en esta sesión; si no, el legal guardado de la opción
  var txt=(typeof cache.legalEdited==='string')?cache.legalEdited:cache.legal;
  if(el&&typeof txt==='string'&&txt.trim())el.value=txt;
  if(typeof calcSC==='function')calcSC();
  if(typeof redraw==='function')redraw();
}
// Fuerza recarga de una opción (después de activar/calibrar) y refresca el armador si toca.
function _fgInvalidateOpt(opt){
  opt=_optN(opt);
  delete _fgOptCache[opt];
  if(_admin&&+_fgOpt===opt)switchFlyerOption(opt);
}
// Pregunta a qué opción corresponde una acción (subir / activar / calibrar).
function _askOption(title,cb){
  var prev=document.getElementById('fg-askopt');if(prev)prev.remove();
  if(!document.getElementById('fg-askopt-style')){
    var st=document.createElement('style');st.id='fg-askopt-style';
    st.textContent='#fg-askopt{position:fixed;inset:0;z-index:100001;background:rgba(20,18,16,.72);display:flex;align-items:center;justify-content:center;padding:20px}'+
      '#fg-askopt .box{background:#fff;color:#1a1a1a;border-radius:14px;padding:22px;max-width:390px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4)}'+
      'html.dark #fg-askopt .box{background:#22242a;color:#e9e9ea}'+
      '#fg-askopt h3{margin:0 0 6px;font-size:1rem}'+
      '#fg-askopt p{margin:0 0 16px;font-size:.8rem;color:var(--gray,#777)}';
    document.head.appendChild(st);
  }
  var d=document.createElement('div');d.id='fg-askopt';
  d.innerHTML='<div class="box"><h3>'+_escHtml(title)+'</h3>'+
    '<p>Eleg&iacute; a qu&eacute; armador corresponde.</p>'+
    '<div style="display:flex;gap:8px">'+
      _FG_OPTS.map(function(o){
        return '<button class="btn-submit" style="flex:1;background:'+_optColor(o)+'" data-o="'+o+'">Opci&oacute;n '+o+'</button>';
      }).join('')+'</div>'+
    '<button class="btn-cancel" style="width:100%;margin-top:8px" data-o="0">Cancelar</button></div>';
  d.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button[data-o]'):null;
    if(!b){if(e.target===d)d.remove();return;}
    var o=+b.getAttribute('data-o');d.remove();if(o)cb(o);
  });
  document.body.appendChild(d);
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
      // El flyer activo trae su propio "mapa" de coordenadas → se dibuja alineado.
      if(d&&d.cfg&&typeof d.cfg==='object')window.FLYER_CFG=d.cfg;
      if(cb)cb(_activeFlyerUrl,_activeFlyerName);
    })
    .catch(function(){_activeFlyerUrl=null;_activeFlyerName='';if(cb)cb(null,'');});
}

// Al activar: descarga el HTML, extrae la imagen en base64, la sube como _active_img.jpg
// Los usuarios sólo descargan la imagen (no el HTML de 1.8MB)
function activateFlyer(htmlUrl,name,btn,opt){
  opt=_optN(opt);
  if(btn){btn.disabled=true;btn.textContent='...';}
  showToast('Extrayendo imagen del flyer...');
  fetch(htmlUrl,{cache:'no-cache'})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();})
    .then(function(html){
      // Buscar baseImg.src = "data:image..." tolerando cualquier espaciado y comillas
      var re=/baseImg\.src\s*=\s*["'](data:image[^"']+)["']/g;
      var m,dataUrl=null;
      while((m=re.exec(html))!==null){dataUrl=m[1];}
      if(!dataUrl)throw new Error('No se encontró la imagen en el HTML');
      // Extraer el "mapa" de coordenadas embebido (si el HTML lo trae) para que el
      // flyer se dibuje alineado sin importar su tamaño. Si no lo trae, cfg=null.
      var flyerCfg=null;
      var cm=html.match(/<script[^>]*id=["']flyer-cfg["'][^>]*>([\s\S]*?)<\/script>/i);
      if(cm){try{flyerCfg=JSON.parse(cm[1]);}catch(e){flyerCfg=null;}}
      // Convertir data URL → Blob binario
      var commaIdx=dataUrl.indexOf(',');
      var mime=dataUrl.substring(5,dataUrl.indexOf(';'));
      var b64=dataUrl.substring(commaIdx+1);
      var binStr=atob(b64);
      var bytes=new Uint8Array(binStr.length);
      for(var i=0;i<binStr.length;i++)bytes[i]=binStr.charCodeAt(i);
      var blob=new Blob([bytes],{type:mime});
      var ext=mime.indexOf('jpeg')!==-1||mime.indexOf('jpg')!==-1?'jpg':'png';
      var imgName=(opt===1?'_active_img.':'_active'+opt+'_img.')+ext;
      // Subir imagen a Supabase Storage
      return _sb.storage.from('flyers').upload(imgName,blob,{contentType:mime,upsert:true})
        .then(function(r){
          if(r.error)throw new Error(r.error.message);
          // Guardar referencia en _active.json con timestamp para evitar cache CDN
          var imageUrl=FLYERS_PUBLIC+imgName+'?v='+Date.now();
          var meta=JSON.stringify({name:name,htmlUrl:htmlUrl,imageUrl:imageUrl,cfg:flyerCfg,updated_at:new Date().toISOString()});
          return _sb.storage.from('flyers').upload(_activeFile(opt),new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true});
        })
        .then(function(r){
          if(r&&r.error)throw new Error(r.error.message);
          if(btn){btn.disabled=false;btn.textContent='Activar';}
          if(opt===1)_activeFlyerName=name;
          showToast('"'+name+'" activado en '+_optLabel(opt));
          _fgInvalidateOpt(opt);loadUploadHistory();
        });
    })
    .catch(function(e){
      if(btn){btn.disabled=false;btn.textContent='Activar';}
      showToast('Error al activar: '+e.message);
      console.error('activateFlyer error:',e);
    });
}

function deactivateFlyer(btn,opt){
  opt=_optN(opt);
  if(btn){btn.disabled=true;btn.textContent='Desactivando...';}
  var data=JSON.stringify({name:'',imageUrl:null,updated_at:new Date().toISOString()});
  _sb.storage.from('flyers').upload(_activeFile(opt),new Blob([data],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(){
      if(btn){btn.disabled=false;btn.textContent='Desactivar';}
      if(opt===1){_activeFlyerUrl=null;_activeFlyerName='';}
      showToast(_optLabel(opt)+' desactivada.');
      _fgInvalidateOpt(opt);loadUploadHistory();
    });
}

// ── MOTOR DE DIBUJADO DEL FLYER (config-driven, durable) ─────────────────────────
// Portado 1:1 de _source.html. Las coordenadas salen de FLYER_CFG para que cada flyer
// subido use SU propio "mapa" (fin del desfase de asesores/legales). El default = los
// valores actuales, así el flyer de hoy se ve idéntico. Sobrescribe las funciones de
// _source.html en initApp (window.drawAll, etc.). Vive en auth.js = no se pierde al
// regenerar el HTML.
var FLYER_CFG_DEFAULT = {
  imgW:1240, imgH:6457, // dimensiones de referencia para las que están calibradas las coords
  bottomMargin:45,      // px (base) de aire debajo del último contenido; el resto del blanco se recorta
  empresa:{xc:620,yc:725,lh:52,mw:1100,fs:46,ex:70,bg:"#f7f2ef"},
  montos:{y:1069,fs:56,mh:58,bg:"#f4e0d3",boxes:[
    {xc:224,ew:220,col:"#1d4070"},{xc:493,ew:215,col:"#1d4070"},
    {xc:760,ew:195,col:"#f5921e"},{xc:1008,ew:185,col:"#f5921e"}]},
  contacto:{ex:150,ey:5330,ew:940,eh:130,bg:"#ffffff",y1:5360,y2:5390,y3:5418,
    xSingle:619,xLeft:310,xRight:930,fnBold:24,frReg:21,color:"#111"},
  legal:{x0:39,yStart:5595,yEnd:6300,maxW:1162,fs:12,lh:17,gap:5,
    minFs:7,minLh:10,minGap:3,color:"#222222",bg:"#ffffff"}
};
function _fgMerge(a,b){var o={};for(var k in a)o[k]=a[k];if(b)for(var k2 in b)if(b[k2]!=null)o[k2]=b[k2];return o;}
function _fgCfg(){
  var d=FLYER_CFG_DEFAULT,c=window.FLYER_CFG||{};
  return {imgW:c.imgW||d.imgW,imgH:c.imgH||d.imgH,
    cropH:c.cropH||0, // altura final fijada a mano (0 = automático)
    bottomMargin:(c.bottomMargin!=null?c.bottomMargin:d.bottomMargin),
    empresa:_fgMerge(d.empresa,c.empresa),montos:_fgMerge(d.montos,c.montos),
    contacto:_fgMerge(d.contacto,c.contacto),legal:_fgMerge(d.legal,c.legal)};
}
// Escala efectiva: ajusta por el ancho real de la imagen. Mismo template (ancho=imgW) => se=s.
function _fgSE(s){var C=_fgCfg();var iw=C.imgW||1240;return (window.baseImg&&baseImg.width)?s*baseImg.width/iw:s;}
// Alto EXTRA (px base) que se inserta cuando el bloque de asesores necesita 2 filas (4 asesores).
// El flyer crece: la parte de abajo del arte (galicia.ar, logo y legales) baja toda junta.
var _fgExtra=0;
// Y anclada ABAJO con el alto ORIGINAL de la imagen (sin el extra).
function _fgBottomYRaw(yRef,s){var C=_fgCfg();var ih=C.imgH||6457;var ch=(window.baseImg&&baseImg.height?baseImg.height:ih)*s;return ch-(ih-yRef)*_fgSE(s);}
// Y anclada ABAJO efectiva: al crecer el flyer, todo lo anclado abajo baja _fgExtra px.
// (así asesores y legales no se desfasan cuando el flyer es más largo/corto).
function _fgBottomY(yRef,s){return _fgBottomYRaw(yRef,s)+_fgExtra*s;}
// Asesores cargados, en orden. Sólo cuentan los que tienen nombre.
function _fgAsesores(v){
  var out=[];if(!v)return out;
  [['has1','nombre','celular','email'],['has2','nombre2','celular2','email2'],
   ['has3','nombre3','celular3','email3'],['has4','nombre4','celular4','email4']]
  .forEach(function(k){
    if(v[k[0]]&&(v[k[1]]||'').trim())out.push({n:v[k[1]],c:v[k[2]]||'',e:v[k[3]]||''});
  });
  return out;
}
function _fgRows(n){return (n>=4)?2:1;}
// Alto extra (px BASE) según cuántas filas de asesores hagan falta.
function _fgExtraBaseFor(v){
  var C=_fgCfg().contacto;
  return (_fgRows(_fgAsesores(v).length)-1)*(C.eh||130)*_fgSE(1);
}
var FG_BOLD_PHRASES = [
  "(1) Promoción del 100% de ahorro.","(2) Bonificación de comisiones.",
  "(3) Promoción en supermercados.","(4) Promoción en combustibles.",
  "(5) Promociones Galicia.","(6) Referidos.","(7) Corresponsalias.","(8) Préstamos.",
  "Bonificación de la comisión por mantenimiento del Servicio Galicia por 6 meses para nuevos clientes.",
  "Bonificación de la comisión por mantenimiento del Servicio Galicia para clientes de Banco Galicia.",
  "PARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN:"
];
// Divide en segmentos {text,bold}. Soporta **negrita** (se arrastra al pegar) + la
// lista de frases fijas (compatibilidad con lo anterior).
function fgSplitBold(text){
  var dyn=[];
  var clean=(text||"").replace(/\*\*([\s\S]+?)\*\*/g,function(_m,inner){var t=inner.trim();if(t)dyn.push(t);return inner;});
  return _fgPhraseSplit(clean,dyn.concat(FG_BOLD_PHRASES));
}
function _fgPhraseSplit(text,phrases){
  var result=[],remaining=text;
  while(remaining.length>0){
    var found=false;
    for(var i=0;i<phrases.length;i++){
      var bp=phrases[i];if(!bp)continue;
      var idx=remaining.indexOf(bp);
      if(idx===0){result.push({text:bp+" ",bold:true});remaining=remaining.slice(bp.length).replace(/^\s+/,"");found=true;break;}
      else if(idx>0){result.push({text:remaining.slice(0,idx),bold:false});result.push({text:bp+" ",bold:true});remaining=remaining.slice(idx+bp.length).replace(/^\s+/,"");found=true;break;}
    }
    if(!found){result.push({text:remaining,bold:false});remaining="";}
  }
  return result;
}
function fgDrawAll(c,s,v){
  var CC=_fgCfg().contacto;
  _fgExtra=_fgExtraBaseFor(v);
  var W=Math.round(baseImg.width*s),H=baseImg.height,E=_fgExtra;
  if(E>0){
    // Corto el arte justo ARRIBA de la banda de asesores y bajo todo lo de abajo E px:
    // así entra la 2da fila y galicia.ar + logo + legales acompañan.
    var split=Math.round(_fgBottomYRaw(CC.ey,1));
    split=Math.max(1,Math.min(H-1,split));
    var gapY=Math.round(split*s),gapH=Math.round(E*s)+1;
    c.drawImage(baseImg,0,0,baseImg.width,split, 0,0,W,gapY);
    // relleno el hueco estirando la última fila de píxeles de arriba del corte,
    // así continúa el fondo real (blanco o crema) sin costura
    c.fillStyle=CC.bg||'#ffffff';c.fillRect(0,gapY,W,gapH);
    try{c.drawImage(baseImg,0,split-1,baseImg.width,1, 0,gapY,W,gapH);}catch(e){}
    c.drawImage(baseImg,0,split,baseImg.width,H-split, 0,gapY+Math.round(E*s),W,Math.round((H-split)*s));
  }else{
    c.drawImage(baseImg,0,0,W,Math.round(H*s));
  }
  fgDrawEmpresa(c,s,v.empresa);
  fgDrawMontos(c,s,v);
  var cb=fgDrawContacto(c,s,v)||0;   // fondo (px escalados) del bloque de asesores
  var lb=fgDrawLegal(c,s,v.legal)||0; // fondo (px escalados) del último renglón de legales
  var bottomScaled=Math.max(cb,lb);
  // guardo el fondo del contenido en coords base para poder recortar el blanco sobrante
  window._fgContentBottomBase=(s>0?bottomScaled/s:bottomScaled);
}
function fgDrawEmpresa(c,s,empresa){
  var E=_fgCfg().empresa,se=_fgSE(s);
  var xc=Math.round(E.xc*se),yc=Math.round(E.yc*se);
  var lh=Math.round(E.lh*se),mw=Math.round(E.mw*se),fs=Math.round(E.fs*se);
  c.fillStyle=E.bg;
  c.fillRect(Math.round(E.ex*se),yc-lh,mw,lh*2+Math.round(8*se));
  c.font="bold "+fs+"px Arial,sans-serif";
  c.fillStyle="#111";c.textAlign="center";c.textBaseline="middle";
  var full="Por ser parte de "+empresa;
  if(c.measureText(full).width<=mw){c.fillText(full,xc,yc);}
  else{
    c.fillText("Por ser parte de",xc,yc-Math.round(lh*0.5));
    var efs=fs,ew=c.measureText(empresa).width;
    if(ew>mw){efs=Math.floor(fs*(mw/ew));c.font="bold "+efs+"px Arial,sans-serif";}
    c.fillText(empresa,xc,yc+Math.round(lh*0.5));
  }
}
function fgDrawMontos(c,s,v){
  var M=_fgCfg().montos,se=_fgSE(s);
  var my=Math.round(M.y*se),fs=Math.round(M.fs*se);
  var vals=[v.m1,v.m2,v.m3,v.m4];
  M.boxes.forEach(function(m,i){
    var mx=Math.round(m.xc*se),mw=Math.round(m.ew*se),mh=Math.round(M.mh*se);
    c.fillStyle=M.bg;c.fillRect(mx-mw/2,my-mh/2,mw,mh);
    c.font="bold "+fs+"px Arial,sans-serif";
    c.fillStyle=m.col;c.textAlign="center";c.textBaseline="middle";
    c.fillText(vals[i],mx,my);
  });
}
// Layout de asesores: 1 centrado · 2 lado a lado · 3 en fila · 4 en 2x2 (el flyer crece).
// Con 1 y 2 usa EXACTAMENTE las coords calibradas de siempre => cero regresión.
function fgDrawContacto(c,s,v){
  var C=_fgCfg().contacto,se=_fgSE(s);
  var list=_fgAsesores(v),n=list.length;
  var rows=_fgRows(n),cols=(n>=4)?2:Math.max(n,1);
  var pitch=(C.eh||130);
  var lastTop=Math.round(_fgBottomY(C.ey,s));           // fila de abajo (la anclada)
  var boxTop=lastTop-Math.round((rows-1)*pitch*se);     // arriba del bloque completo
  var boxH=Math.round(rows*pitch*se);
  c.fillStyle=C.bg;
  c.fillRect(Math.round(C.ex*se),boxTop,Math.round(C.ew*se),boxH);
  if(!n)return boxTop+boxH;
  var xs,colW;
  if(n===1){xs=[C.xSingle];colW=C.ew;}
  else if(n===2){xs=[C.xLeft,C.xRight];colW=C.ew/2;}
  else if(n===3){xs=[C.ex+C.ew/6,C.ex+C.ew/2,C.ex+5*C.ew/6];colW=C.ew/3;}
  else{xs=[C.xLeft,C.xRight];colW=C.ew/2;}
  list.forEach(function(a,i){
    var r=Math.floor(i/cols),ci=i%cols;
    var dy=Math.round((r-(rows-1))*pitch*se); // la última fila queda en la posición anclada
    fgDrawC1(c,s,xs[ci],C,a.n,a.c,a.e,dy,colW);
  });
  return boxTop+boxH; // fondo del bloque de asesores (px escalados)
}
// dy: desplazamiento de fila. colW: ancho de columna disponible (para achicar si no entra).
function fgDrawC1(c,s,xc,C,nom,cel,mail,dy,colW){
  var se=_fgSE(s);dy=dy||0;
  var fn=Math.round(C.fnBold*se),fr=Math.round(C.frReg*se),cx=Math.round(xc*se);
  var maxW=colW?Math.round((colW-18)*se):0;
  var minF=Math.max(1,Math.round(9*se));
  // Achica la tipografía sólo si el texto no entra en su columna (mails largos con 3 asesores).
  function fit(txt,size,bold){
    if(!maxW||!txt)return size;
    c.font=(bold?'bold ':'')+size+'px Arial,sans-serif';
    var w=c.measureText(txt).width;
    return (w>maxW&&w>0)?Math.max(Math.floor(size*maxW/w),minF):size;
  }
  c.textAlign="center";c.textBaseline="middle";c.fillStyle=C.color;
  var f1=fit(nom,fn,true);
  c.font="bold "+f1+"px Arial,sans-serif";c.fillText(nom,cx,Math.round(_fgBottomY(C.y1,s))+dy);
  if(cel){var f2=fit(cel,fr,false);c.font=f2+"px Arial,sans-serif";c.fillText(cel,cx,Math.round(_fgBottomY(C.y2,s))+dy);}
  if(mail){var f3=fit(mail,fr,false);c.font=f3+"px Arial,sans-serif";c.fillText(mail,cx,Math.round(_fgBottomY(C.y3,s))+dy);}
}
function fgDrawLegal(c,s,text){
  if(!text||!text.trim())return 0;
  var L=_fgCfg().legal,se=_fgSE(s);
  var x0=Math.round(L.x0*se),yStart=Math.round(_fgBottomY(L.yStart,s)),yEnd=Math.round(_fgBottomY(L.yEnd,s));
  var maxW=Math.round(L.maxW*se),availH=yEnd-yStart;
  c.fillStyle=L.bg;
  c.fillRect(x0-Math.round(2*se),yStart-Math.round(5*se),maxW+Math.round(20*se),availH+Math.round(30*se));
  c.textAlign="left";c.textBaseline="top";
  var paragraphs=text.split("\n");
  function calcLines(fs){
    var allLines=[];
    paragraphs.forEach(function(para){
      if(!para.trim()){allLines.push({gap:true});return;}
      var segs=fgSplitBold(para),currentTokens=[],lineW=0;
      segs.forEach(function(seg){
        seg.text.split(" ").forEach(function(word,wi,arr){
          if(!word)return;
          var tok=word+(wi<arr.length-1?" ":"");
          c.font=(seg.bold?"bold ":"")+fs+"px Arial,sans-serif";
          var w=c.measureText(tok).width;
          if(lineW+w>maxW&&currentTokens.length>0){allLines.push({tokens:currentTokens,gap:false});currentTokens=[];lineW=0;}
          currentTokens.push({text:tok,bold:seg.bold,w:w});lineW+=w;
        });
      });
      if(currentTokens.length>0)allLines.push({tokens:currentTokens,gap:false});
    });
    return allLines;
  }
  function calcHeight(lines,lh,gapH){var t=0;lines.forEach(function(l){t+=l.gap?gapH:lh;});return t;}
  var fs=Math.round(L.fs*se),lh=Math.round(L.lh*se),gapH=Math.round(L.gap*se);
  var lines=calcLines(fs),totalH=calcHeight(lines,lh,gapH);
  if(totalH>availH&&totalH>0){
    var ratio=availH/totalH;
    fs=Math.max(Math.floor(fs*ratio),Math.round(L.minFs*se));
    lh=Math.max(Math.floor(lh*ratio),Math.round(L.minLh*se));
    gapH=Math.max(Math.floor(gapH*ratio),Math.round(L.minGap*se));
    lines=calcLines(fs);
  }
  var y=yStart;
  lines.forEach(function(line){
    if(line.gap){y+=gapH;return;}
    var cx=x0;
    line.tokens.forEach(function(tok){
      c.font=(tok.bold?"bold ":"")+fs+"px Arial,sans-serif";
      c.fillStyle=L.color;c.fillText(tok.text,cx,y);cx+=tok.w;
    });
    y+=lh;
  });
  return y; // fondo del último renglón dibujado (px escalados)
}
// Altura final (en px BASE) = fondo del último contenido + un poco de aire, recortando
// el blanco sobrante del pie del flyer. Responsive: legal corto => flyer más corto.
function _fgFinalHeightBase(){
  var C=_fgCfg();
  var ih=((window.baseImg&&baseImg.height)?baseImg.height:(C.imgH||6457))+_fgExtra;
  if(C.cropH&&C.cropH>0)return Math.min(Math.round(C.cropH),ih); // altura fijada en el calibrador
  var cb=window._fgContentBottomBase||0;
  if(!cb)return ih; // sin contenido medido => no recorto
  var m=(C.bottomMargin!=null?C.bottomMargin:45)*_fgSE(1); // aire escalado por ancho real
  var h=Math.ceil(cb+m);
  if(h>ih)h=ih;                               // nunca más alto que la imagen
  var min=Math.round(ih*0.25);if(h<min)h=min; // guarda de seguridad
  return h;
}
// Preview: dibuja en un canvas completo y copia sólo la franja útil al canvas visible.
function fgRedraw(){
  if(!window.baseImg||!baseImg.width)return;
  var v=getVals();
  _fgExtra=_fgExtraBaseFor(v); // el canvas tiene que contemplar el crecimiento
  var w=Math.round(baseImg.width*SC),fh=Math.round((baseImg.height+_fgExtra)*SC);
  var full=document.createElement('canvas');full.width=w;full.height=fh;
  fgDrawAll(full.getContext('2d'),SC,v); // setea _fgContentBottomBase
  var h=Math.min(fh,Math.round(_fgFinalHeightBase()*SC));
  cv.width=w;cv.height=h;
  var cc=cv.getContext('2d');window.ctx=cc;
  cc.clearRect(0,0,w,h);cc.drawImage(full,0,0);
}
// Descarga / preview modal / historial: canvas full-res ya recortado.
function fgFullRes(v){
  _fgExtra=_fgExtraBaseFor(v);
  var full=document.createElement('canvas');full.width=baseImg.width;
  full.height=Math.round(baseImg.height+_fgExtra);
  fgDrawAll(full.getContext('2d'),1.0,v); // setea _fgContentBottomBase
  var h=Math.min(full.height,Math.round(_fgFinalHeightBase()));
  var out=document.createElement('canvas');out.width=baseImg.width;out.height=h;
  out.getContext('2d').drawImage(full,0,0);
  return out;
}
// ── ASESORES 3 y 4 ────────────────────────────────────────────────────────────
// Los campos se INYECTAN desde acá (no en _source.html, que lo regenera el usuario),
// replicando la estructura del bloque de Asesor 2.
var _fgA3=false,_fgA4=false;
function toggleA3(){_fgA3=!_fgA3;_fgToggleUI(3,_fgA3);if(typeof redraw==='function')redraw();}
function toggleA4(){_fgA4=!_fgA4;_fgToggleUI(4,_fgA4);if(typeof redraw==='function')redraw();}
function _fgToggleUI(n,on){
  var sw=document.getElementById('sw'+n),f=document.getElementById('fields'+n);
  if(sw)sw.classList.toggle('on',on);
  if(f)f.classList.toggle('show',on);
}
function _fgEnsureAsesores34(){
  if(document.getElementById('fields3'))return;
  var f2=document.getElementById('fields2');if(!f2||!f2.parentNode)return;
  var html='';
  [3,4].forEach(function(n){
    html+='<div class="sec">Asesor '+n+' (opcional)</div>'+
      '<div class="toggle-row" onclick="toggleA'+n+'()"><span>Agregar asesor '+n+'</span><div class="sw" id="sw'+n+'"></div></div>'+
      '<div class="collapsible" id="fields'+n+'">'+
        '<div class="field"><label>Nombre</label><input type="text" id="nombre'+n+'" placeholder="Nombre Asesor '+n+'"></div>'+
        '<div class="field"><label>Celular</label><input type="text" id="celular'+n+'" placeholder="11 XXXX XXXX"></div>'+
        '<div class="field"><label>Email</label><input type="text" id="email'+n+'" placeholder="mail@bancogalicia.com.ar"></div>'+
      '</div>';
  });
  f2.insertAdjacentHTML('afterend',html);
  // que redibujen al tipear, igual que los campos originales
  ['nombre3','celular3','email3','nombre4','celular4','email4'].forEach(function(id){
    var e=document.getElementById(id);
    if(e)e.addEventListener('input',function(){if(typeof redraw==='function')redraw();});
  });
  if(_canNotes)_initAsesoresUI(); // engancha el popover de asesores guardados en 3 y 4
}
// getVals ampliado a 4 asesores (pisa el de _source.html, que sólo conoce 2).
function fgGetVals(){
  function g(id){var e=document.getElementById(id);return e?e.value:'';}
  function cel(id){var t=g(id).trim();return t?'Cel: '+t:'';}
  var c=CONFIGS[ac];
  return{
    empresa:g('empresa'),
    config:(typeof CNAMES!=='undefined'&&CNAMES[ac])?CNAMES[ac]:'',
    m1:c.m1,m2:c.m2,m3:c.m3,m4:c.m4,
    has1:(typeof a1==='undefined'?true:a1)&&g('nombre').trim()!=='',
    nombre:g('nombre'),celular:cel('celular'),email:g('email'),
    has2:(typeof a2!=='undefined'&&a2)&&g('nombre2').trim()!=='',
    nombre2:g('nombre2'),celular2:cel('celular2'),email2:g('email2'),
    has3:_fgA3&&g('nombre3').trim()!=='',
    nombre3:g('nombre3'),celular3:cel('celular3'),email3:g('email3'),
    has4:_fgA4&&g('nombre4').trim()!=='',
    nombre4:g('nombre4'),celular4:cel('celular4'),email4:g('email4'),
    legal:g('legal-text')
  };
}

// ── HISTORIAL con opción (color) ──────────────────────────────────────────────
// Piso addHistory/renderHistory/redlPDF/loadHistory de _source.html (que regenera)
// para guardar y mostrar en qué opción se generó cada flyer.
function fgAddHistory(v,fn,canvas){
  var d=new Date();
  var hora=d.getHours()+':'+String(d.getMinutes()).padStart(2,'0');
  flyerHistory.unshift({v:JSON.parse(JSON.stringify(v)),fn:fn,
    thumb:canvas.toDataURL('image/jpeg',0.25),hora:hora,
    ac:(typeof ac!=='undefined'?ac:0),opt:_optN(_fgOpt)});
  if(flyerHistory.length>10)flyerHistory.pop();
}
function fgRenderHistory(){
  var el=document.getElementById('history-list');if(!el)return;
  if(!flyerHistory.length){el.innerHTML='<div class="history-empty">&#128337; Todavía no generaste ningún flyer.</div>';return;}
  el.innerHTML=flyerHistory.map(function(h,i){
    var o=_optN(h.opt||1);
    return '<div class="hist-item" onclick="loadHistory('+i+')" style="border-left:4px solid '+_optColor(o)+'">'
      +'<img class="hist-thumb" src="'+h.thumb+'">'
      +'<div class="hist-info"><strong>'+_escHtml(h.v.empresa||'')+'</strong>'
      +'<span>'+_escHtml(h.fn||'')+' · '+h.hora+'</span>'
      +'<div style="margin-top:3px">'+_optBadge(o)+'</div>'
      +'<div style="display:flex;gap:4px;margin-top:3px;">'
      +'<button class="hist-btn" onclick="event.stopPropagation();redlPDF('+i+')">&#11015; PDF</button>'
      +'<button class="hist-btn" onclick="event.stopPropagation();loadHistory('+i+')">&#9998; Editar</button>'
      +'</div></div>'
      +'<button class="hist-del" onclick="event.stopPropagation();delHistory('+i+')">&#10005;</button>'
      +'</div>';
  }).join('');
}
// Si el ítem se generó en otra opción, cambio a esa opción ANTES de rehacer el PDF /
// cargar los datos: si no, saldría con el flyer equivocado.
function _fgWithOpt(o,fn2){
  o=_optN(o);
  if(_admin&&o!==_optN(_fgOpt)){showToast('Cambiando a '+_optLabel(o)+'...');switchFlyerOption(o,fn2);}
  else fn2();
}
function fgRedlPDF(i){
  var h=flyerHistory[i];if(!h)return;
  _fgWithOpt(h.opt||1,function(){savePDF(fullRes(h.v),h.v);});
}
function fgLoadHistory(i){
  var h=flyerHistory[i];if(!h)return;
  _fgWithOpt(h.opt||1,function(){
    var s=function(id,val){var e=document.getElementById(id);if(e)e.value=val;};
    s('empresa',h.v.empresa||'');s('nombre',h.v.nombre||'');
    s('celular',(h.v.celular||'').replace('Cel: ',''));s('email',h.v.email||'');
    if(h.v.legal)s('legal-text',h.v.legal);
    if(h.v.has2){if(typeof a2!=='undefined'&&!a2&&typeof toggleA2==='function')toggleA2();
      s('nombre2',h.v.nombre2||'');s('celular2',(h.v.celular2||'').replace('Cel: ',''));s('email2',h.v.email2||'');}
    [3,4].forEach(function(i){
      if(!h.v['has'+i])return;
      if(i===3&&!_fgA3)toggleA3();if(i===4&&!_fgA4)toggleA4();
      s('nombre'+i,h.v['nombre'+i]||'');
      s('celular'+i,(h.v['celular'+i]||'').replace('Cel: ',''));
      s('email'+i,h.v['email'+i]||'');
    });
    if(typeof setCfg==='function')setCfg(h.ac||0);
    if(typeof switchTab==='function')switchTab('individual');
    showToast('Datos cargados');
  });
}
// "Restaurar": deja el formulario vacío (nada de datos de ejemplo) y devuelve el legal
// GUARDADO de la opción actual, descartando mis ediciones de sesión.
function fgResetVals(){
  var s=function(id,val){var e=document.getElementById(id);if(e)e.value=val;};
  ['empresa','nombre','celular','email','nombre2','celular2','email2',
   'nombre3','celular3','email3','nombre4','celular4','email4'].forEach(function(id){s(id,'');});
  s('filename','Flyer {empresa}');
  if(_fgA3)toggleA3();if(_fgA4)toggleA4();
  var n=_optN(_fgOpt),c=_fgOptCache[n];
  if(c)delete c.legalEdited;
  var base=(c&&typeof c.legal==='string'&&c.legal.trim())?c.legal:(window.LEGAL_DEFAULT||'');
  s('legal-text',base);
  window.filenameManual=false;
  if(typeof a1!=='undefined'&&!a1&&typeof toggleA1==='function')toggleA1();
  if(typeof a2!=='undefined'&&a2&&typeof toggleA2==='function')toggleA2();
  if(typeof setCfg==='function')setCfg(0);
  if(typeof updateFnPreview==='function')updateFnPreview();
}
function _installFlyerEngine(){
  window.savePDF=fgSavePDF;window.savePNG=fgSavePNG;      // engancha el registro
  window.addHistory=fgAddHistory;window.renderHistory=fgRenderHistory;
  window.redlPDF=fgRedlPDF;window.loadHistory=fgLoadHistory;
  window.resetVals=fgResetVals;
  window.getVals=fgGetVals;                                // hasta 4 asesores
  window.toggleA3=toggleA3;window.toggleA4=toggleA4;
  window.genAll=fgGenAll;window.dlTemplate=fgDlTemplate;   // masivo + plantilla con 3 y 4
  window.drawAll=fgDrawAll;window.drawEmpresa=fgDrawEmpresa;window.drawMontos=fgDrawMontos;
  window.drawContacto=fgDrawContacto;window.drawC1=fgDrawC1;window.drawLegal=fgDrawLegal;
  window.splitBoldRegular=fgSplitBold;
  window.redraw=fgRedraw;window.fullRes=fgFullRes; // recorte responsive del blanco inferior
}
// Lee el "mapa" embebido en el propio documento (para flyers armados con ese bloque).
function _readDocCfg(){
  try{var el=document.getElementById('flyer-cfg');if(el&&el.textContent.trim())return JSON.parse(el.textContent);}catch(e){}
  return null;
}
// Aplica un mapa (del flyer activo) y redibuja.
function _applyFlyerCfg(cfg){
  if(cfg&&typeof cfg==='object')window.FLYER_CFG=cfg;
  if(typeof redraw==='function'&&window.baseImg&&window.baseImg.width)redraw();
}

// ── RASTERIZADO PDF/IMAGEN + CALIBRADOR VISUAL ──────────────────────────────────
// El admin sube el PDF/imagen LIMPIO del flyer → se rasteriza a 1240px de ancho
// (= ancho de referencia, así las coords calzan y el anclaje sigue andando) → se
// acomodan las zonas (empresa/montos/asesores/legales) arrastrando, con preview en
// vivo (usa el MISMO motor fgDrawAll = WYSIWYG) → cada flyer guarda su calibración
// en _flyer_cfgs.json. Todo vive acá (durable, no se pierde al regenerar el HTML).
var _FG_TARGET_W=1240;
// Exporta a JPG sin recortar automático. El calibrador permite ajustar altura
// manualmente (arrastrar borde de legales redimensiona la imagen). Esto evita
// cortar contenido legítimo (PDFs con múltiples elementos en el pie).
function _finishRaster(cvs,cb){
  cvs.toBlob(function(b){cb(b,cvs);},'image/jpeg',0.92);
}
function _fgLoadPdfJs(cb){
  if(window.pdfjsLib&&window.pdfjsLib.getDocument){cb();return;}
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload=function(){
    var wsrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    try{
      // Worker cross-origin robusto: blob mismo-origen que importa el worker real (cdnjs manda CORS).
      var blob=new Blob(['importScripts('+JSON.stringify(wsrc)+');'],{type:'application/javascript'});
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(blob);
    }catch(e){try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=wsrc;}catch(_){}}
    cb();
  };
  s.onerror=function(){showToast('No se pudo cargar el lector de PDF');};
  document.head.appendChild(s);
}
// Renderiza la página del PDF en BANDAS y las compone en un solo canvas.
// POR QUÉ: los PDFs de Galicia usan soft masks (grupos de transparencia en fotos y formas).
// Al renderizar de una sola pasada en un canvas muy alto (ej. 1240x6996), la composición de
// máscaras de pdf.js falla silenciosamente y MEDIA PÁGINA sale en blanco (se perdían Pago
// Fácil, dólares, colectivos, cajas, préstamos, galicia.ar, el logo y los legales).
// Verificado: 1 pasada corta en ~4070px; en bandas llega a 6960px. No tocar sin re-verificar.
var _FG_BAND_H=1600;
function _renderPageBanded(page,done){
  var vp1=page.getViewport({scale:1});
  var vp=page.getViewport({scale:_FG_TARGET_W/vp1.width});
  var W=Math.round(vp.width),H=Math.round(vp.height);
  var out=document.createElement('canvas');out.width=W;out.height=H;
  var ox=out.getContext('2d');ox.fillStyle='#fff';ox.fillRect(0,0,W,H);
  var ys=[];for(var y=0;y<H;y+=_FG_BAND_H)ys.push(y);
  function step(i){
    if(i>=ys.length){done(out);return;}
    var y0=ys[i],bh=Math.min(_FG_BAND_H,H-y0);
    var band=document.createElement('canvas');band.width=W;band.height=bh;
    var bx=band.getContext('2d');bx.fillStyle='#fff';bx.fillRect(0,0,W,bh);
    showToast('Convirtiendo PDF... '+Math.round(i*100/ys.length)+'%');
    // transform se aplica ANTES del viewport => corre el dibujo y0 px hacia arriba
    page.render({canvasContext:bx,viewport:vp,transform:[1,0,0,1,0,-y0]}).promise
      .then(function(){ox.drawImage(band,0,y0);step(i+1);})
      .catch(function(e){console.warn('banda '+y0+' falló:',e);ox.drawImage(band,0,y0);step(i+1);});
  }
  step(0);
}
// file → blob JPG + canvas (1240px de ancho, fondo blanco). Soporta PDF (pág. 1) e imagen.
function _rasterizeFlyer(file,cb){
  var isPdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
  if(isPdf){
    _fgLoadPdfJs(function(){
      var fr=new FileReader();
      fr.onload=function(){
        try{
          var data=new Uint8Array(fr.result);
          window.pdfjsLib.getDocument({data:data}).promise.then(function(pdf){return pdf.getPage(1);})
          .then(function(page){
            _renderPageBanded(page,function(cvs){_finishRaster(cvs,cb);});
          }).catch(function(e){cb(null,null);showToast('Error leyendo PDF: '+(e&&e.message||e));});
        }catch(e){cb(null,null);showToast('Error leyendo PDF');}
      };
      fr.readAsArrayBuffer(file);
    });
  }else{
    var fr2=new FileReader();
    fr2.onload=function(){
      var img=new Image();
      img.onload=function(){
        var cvs=document.createElement('canvas');
        cvs.width=_FG_TARGET_W;cvs.height=Math.round(img.height*(_FG_TARGET_W/img.width));
        var cx=cvs.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cvs.width,cvs.height);
        cx.drawImage(img,0,0,cvs.width,cvs.height);
        _finishRaster(cvs,cb);
      };
      img.onerror=function(){cb(null,null);showToast('No se pudo leer la imagen');};
      img.src=fr2.result;
    };
    fr2.readAsDataURL(file);
  }
}
// Mapa de calibraciones por flyer: { "flyer_123.jpg": {cfg}, ... }
function _loadFlyerCfgs(cb){
  fetch(FLYERS_PUBLIC+'_flyer_cfgs.json?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():{};}).catch(function(){return {};})
    .then(function(m){cb(m&&typeof m==='object'?m:{});});
}
function _saveFlyerCfg(name,cfg,cb){
  _loadFlyerCfgs(function(m){
    m[name]=cfg;
    _sb.storage.from('flyers').upload('_flyer_cfgs.json',new Blob([JSON.stringify(m)],{type:'application/json'}),{contentType:'application/json',upsert:true})
      .then(function(){cb&&cb();}).catch(function(){cb&&cb();});
  });
}
// Activa un flyer basado en imagen (usa su calibración guardada, o el default si no tiene).
function activateImageFlyer(url,name,btn,opt){
  opt=_optN(opt);
  var lbl=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='...';}
  _loadFlyerCfgs(function(m){
    var cfg=(m&&m[name])||null;
    var imageUrl=url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now();
    var meta=JSON.stringify({name:name,imageUrl:imageUrl,cfg:cfg,updated_at:new Date().toISOString()});
    _sb.storage.from('flyers').upload(_activeFile(opt),new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
      .then(function(){
        if(btn){btn.disabled=false;btn.textContent=lbl;}
        if(opt===1)_activeFlyerName=name;
        showToast('"'+name+'" activado en '+_optLabel(opt));
        _fgInvalidateOpt(opt);loadUploadHistory();
      })
      .catch(function(){if(btn){btn.disabled=false;btn.textContent=lbl;}showToast('Error al activar');});
  });
}
// Abre el calibrador desde la lista: si el flyer ya está activo en una sola opción usa
// esa; si no, pregunta.
function _calFromList(url,name){
  var actIn=_FG_OPTS.filter(function(o){return _fgHistMeta[o]&&_fgHistMeta[o].name===name;});
  if(actIn.length===1){_calOpenFromUrl(url,name,actIn[0]);return;}
  _askOption('¿Qué opción querés calibrar?',function(o){_calOpenFromUrl(url,name,o);});
}

// -- Estado + UI del calibrador --
var _cal=null;
var _CAL_ZONES=[
  {id:'empresa',label:'Empresa',color:'#8e44ad'},
  {id:'montos',label:'Montos',color:'#1d4070'},
  {id:'asesores',label:'Asesores',color:'#c0392b'},
  {id:'legal',label:'Legales',color:'#0e8a5f'}
];
var _CAL_SAMPLE_LEGAL="Ejemplo de términos y condiciones del flyer. **Bonificación de comisiones** por 6 meses para nuevos clientes. Promociones sujetas a disponibilidad y a las bases y condiciones vigentes.\nPARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN: www.bancogalicia.com.ar";
function _calSampleVals(){
  return {empresa:'EMPRESA EJEMPLO S.A.',
    m1:'$100.000',m2:'$80.000',m3:'$50.000',m4:'$30.000',
    has1:true,nombre:'Nombre Apellido',celular:'11 1234 5678',email:'nombre.apellido@bancogalicia.com.ar',
    has2:true,nombre2:'Segundo Asesor',celular2:'11 8765 4321',email2:'segundo.asesor@bancogalicia.com.ar',
    legal:(_cal&&_cal.legalText)||_CAL_SAMPLE_LEGAL};
}
function _calEnsureDom(){
  if(document.getElementById('cal-modal'))return;
  var st=document.createElement('style');st.id='cal-style';
  st.textContent=
    '#cal-modal{position:fixed;inset:0;z-index:100000;background:rgba(20,18,16,.72);display:none;padding:16px}'+
    '#cal-modal.show{display:flex;align-items:stretch;justify-content:center}'+
    '.cal-card{background:#fff;color:#1a1a1a;width:100%;max-width:720px;margin:auto;max-height:96vh;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}'+
    'html.dark .cal-card{background:#22242a;color:#e9e9ea}'+
    '.cal-hd{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid rgba(128,128,128,.25)}'+
    '.cal-hd h3{margin:0;font-size:1rem;flex:1}'+
    '.cal-legend{display:flex;flex-wrap:wrap;gap:7px;padding:9px 16px;border-bottom:1px solid rgba(128,128,128,.18)}'+
    '.cal-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;cursor:pointer;border:1.5px solid transparent;font-size:.7rem;user-select:none}'+
    '.cal-chip .dot{width:11px;height:11px;border-radius:3px;display:inline-block}'+
    '.cal-chip.on{border-color:currentColor;font-weight:700}'+
    '.cal-body{flex:1;overflow:auto;background:#e9e9e6;display:flex;justify-content:center;padding:16px}'+
    'html.dark .cal-body{background:#15161a}'+
    '.cal-body canvas{background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);touch-action:none;align-self:flex-start;cursor:grab}'+
    '.cal-ft{padding:11px 16px;border-top:1px solid rgba(128,128,128,.25);display:flex;gap:10px;align-items:center;font-size:.72rem;color:var(--gray,#777)}'+
    '.cal-ft .sp{flex:1}';
  document.head.appendChild(st);
  var m=document.createElement('div');m.id='cal-modal';
  m.innerHTML=
    '<div class="cal-card">'+
      '<div class="cal-hd"><h3 id="cal-title">Calibrar flyer</h3>'+
        '<button class="btn-submit" onclick="_calSave()" style="padding:7px 14px">Guardar y activar</button>'+
        '<button class="ap-close" onclick="_calClose()">&#10005;</button></div>'+
      '<div class="cal-legend" id="cal-legend"></div>'+
      '<div class="cal-body"><canvas id="cal-cv"></canvas></div>'+
      '<div style="padding:11px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.72rem;display:flex;gap:12px;align-items:center">'+
        '<label>Altura final (px):</label><input id="cal-height" type="number" placeholder="auto" style="width:90px;padding:4px 6px" onchange="_calHeightChanged()">'+
        '<button class="usr-btn edit" style="font-size:.65rem;padding:4px 9px" onclick="document.getElementById(\'cal-height\').value=\'\';_calHeightChanged()">Auto</button>'+
        '<span style="color:var(--gray)">vac&iacute;o = corta solo despu&eacute;s de los legales (l&iacute;nea naranja)</span>'+
      '</div>'+
      '<div class="cal-ft"><span>Tocá una zona y arrastrá para moverla. Con la zona elegida, las flechas del teclado hacen ajuste fino (Shift = 10px).</span><span class="sp"></span><span id="cal-sel"></span></div>'+
    '</div>';
  document.body.appendChild(m);
  var cv=document.getElementById('cal-cv');
  cv.addEventListener('pointerdown',_calDown);
  cv.addEventListener('pointermove',_calMove);
  window.addEventListener('pointerup',_calUp);
  document.addEventListener('keydown',_calKey);
}
function _calRenderLegend(){
  var el=document.getElementById('cal-legend');if(!el)return;
  el.innerHTML=_CAL_ZONES.map(function(z){
    var on=_cal&&_cal.sel===z.id;
    return '<span class="cal-chip'+(on?' on':'')+'" style="color:'+z.color+'" onclick="_calSelect(\''+z.id+'\')"><span class="dot" style="background:'+z.color+'"></span>'+z.label+'</span>';
  }).join('');
}
function _calSelect(id){if(!_cal)return;_cal.sel=id;_calRenderLegend();_calDraw();var s=document.getElementById('cal-sel');if(s)s.textContent='';}
// Altura final del flyer exportado. Vacío/0 = automático (corta después de los legales).
// OJO: NO toca imgH (esa es la altura de REFERENCIA del anclaje; cambiarla corre las zonas).
function _calHeightChanged(){
  if(!_cal)return;
  var raw=document.getElementById('cal-height').value;
  var h=parseInt(raw,10);
  _cal.cfg.cropH=(raw!==''&&h>0)?h:0;
  _calDraw();
}
// Rectángulos de cada zona en px BASE (imagen 1240×H). Bottom-anchored suman DBOT=H-imgH.
function _calZoneRects(){
  var cfg=_cal.cfg,H=_cal.img.height,imgH=cfg.imgH||6457,DBOT=H-imgH;
  var E=cfg.empresa,M=cfg.montos,C=cfg.contacto,L=cfg.legal,r={};
  r.empresa={x:E.ex,y:E.yc-E.lh,w:E.mw,h:E.lh*2};
  var minx=1e9,maxx=-1e9;M.boxes.forEach(function(b){minx=Math.min(minx,b.xc-b.ew/2);maxx=Math.max(maxx,b.xc+b.ew/2);});
  r.montos={x:minx,y:M.y-M.mh/2,w:maxx-minx,h:M.mh};
  r.asesores={x:C.ex,y:C.ey+DBOT,w:C.ew,h:C.eh};
  r.legal={x:L.x0,y:L.yStart+DBOT,w:L.maxW,h:(L.yEnd-L.yStart)};
  return r;
}
function _calDraw(){
  if(!_cal)return;
  var cv=document.getElementById('cal-cv');if(!cv)return;var g=cv.getContext('2d');var ds=_cal.ds;
  cv.width=Math.round(_FG_TARGET_W*ds);cv.height=Math.round(_cal.img.height*ds);
  cv.style.width=cv.width+'px';cv.style.height=cv.height+'px';
  var sb=window.baseImg,sc=window.FLYER_CFG,cutBase=0;
  window.baseImg=_cal.img;window.FLYER_CFG=_cal.cfg;
  try{fgDrawAll(g,ds,_calSampleVals());cutBase=_fgFinalHeightBase();}catch(e){}
  window.baseImg=sb;window.FLYER_CFG=sc;
  // línea de corte: dónde termina el flyer exportado (gris el sobrante)
  if(cutBase>0&&cutBase<_cal.img.height){
    var cy=Math.round(cutBase*ds);
    g.save();
    g.fillStyle='rgba(120,120,120,.45)';g.fillRect(0,cy,cv.width,cv.height-cy);
    g.strokeStyle='#f5921e';g.lineWidth=2;g.setLineDash([9,5]);
    g.beginPath();g.moveTo(0,cy);g.lineTo(cv.width,cy);g.stroke();g.setLineDash([]);
    g.fillStyle='#f5921e';g.font='bold 11px Arial';g.textAlign='right';g.textBaseline='top';
    g.fillText('corte '+Math.round(cutBase)+'px',cv.width-5,cy+4);
    g.restore();
  }
  var rects=_calZoneRects();
  _CAL_ZONES.forEach(function(z){
    var r=rects[z.id];if(!r)return;var x=r.x*ds,y=r.y*ds,w=r.w*ds,h=r.h*ds,on=_cal.sel===z.id;
    g.save();g.strokeStyle=z.color;g.lineWidth=on?2.5:1.5;g.setLineDash(on?[]:[6,4]);
    g.strokeRect(x,y,w,h);g.setLineDash([]);
    g.fillStyle=z.color;g.font='bold 11px Arial';g.textAlign='left';g.textBaseline='bottom';
    g.fillText(z.label,x+3,y>14?y-3:y+13);
    if(z.id==='legal'){g.fillRect(x+w-6,y+h-6,11,11);}
    g.restore();
  });
}
function _calXY(e){var cv=document.getElementById('cal-cv');var rc=cv.getBoundingClientRect();return {x:(e.clientX-rc.left)/_cal.ds,y:(e.clientY-rc.top)/_cal.ds};}
function _calHit(bx,by){
  var rects=_calZoneRects(),L=rects.legal;
  if(L&&Math.abs(bx-(L.x+L.w))<16&&Math.abs(by-(L.y+L.h))<16)return {zone:'legal',handle:'br'};
  var order=['empresa','montos','asesores','legal'];
  for(var i=0;i<order.length;i++){var r=rects[order[i]];if(r&&bx>=r.x&&bx<=r.x+r.w&&by>=r.y&&by<=r.y+r.h)return {zone:order[i],handle:null};}
  return null;
}
function _calDown(e){
  if(!_cal)return;e.preventDefault();
  var p=_calXY(e),hit=_calHit(p.x,p.y);if(!hit)return;
  _cal.drag=hit;_cal.sel=hit.zone;_cal.lastX=p.x;_cal.lastY=p.y;
  try{e.target.setPointerCapture&&e.target.setPointerCapture(e.pointerId);}catch(_){}
  _calRenderLegend();_calDraw();
}
function _calMove(e){
  if(!_cal||!_cal.drag)return;e.preventDefault();
  var p=_calXY(e),dx=p.x-_cal.lastX,dy=p.y-_cal.lastY;_cal.lastX=p.x;_cal.lastY=p.y;
  _calApply(_cal.drag,dx,dy);_calDraw();
}
function _calUp(){if(_cal&&_cal.drag)_cal.drag=null;}
function _calApply(drag,dx,dy){
  var cfg=_cal.cfg,E=cfg.empresa,M=cfg.montos,C=cfg.contacto,L=cfg.legal;
  if(drag.zone==='empresa'){E.yc+=dy;E.xc+=dx;E.ex+=dx;}
  else if(drag.zone==='montos'){M.y+=dy;M.boxes.forEach(function(b){b.xc+=dx;});}
  else if(drag.zone==='asesores'){C.ey+=dy;C.y1+=dy;C.y2+=dy;C.y3+=dy;C.xSingle+=dx;C.xLeft+=dx;C.xRight+=dx;}
  else if(drag.zone==='legal'){
    if(drag.handle==='br'){L.yEnd=Math.max(L.yStart+30,L.yEnd+dy);L.maxW=Math.max(120,L.maxW+dx);}
    else{L.x0+=dx;L.yStart+=dy;L.yEnd+=dy;}
  }
}
function _calKey(e){
  if(!_cal||!_cal.sel)return;
  var step=e.shiftKey?10:1,dx=0,dy=0;
  if(e.key==='ArrowUp')dy=-step;else if(e.key==='ArrowDown')dy=step;else if(e.key==='ArrowLeft')dx=-step;else if(e.key==='ArrowRight')dx=step;else return;
  e.preventDefault();_calApply({zone:_cal.sel,handle:null},dx,dy);_calDraw();
}
function _calMergeCfg(base,saved){
  for(var k in saved){
    if(saved[k]&&typeof saved[k]==='object'&&!Array.isArray(saved[k])&&base[k])for(var j in saved[k])base[k][j]=saved[k][j];
    else base[k]=saved[k];
  }
}
function _calOpen(img,name,url,opt){
  _calEnsureDom();
  opt=_optN(opt);
  var base=JSON.parse(JSON.stringify(FLYER_CFG_DEFAULT));
  _cal={img:img,name:name,url:url,opt:opt,cfg:base,sel:null,drag:null,lastX:0,lastY:0,legalText:null,
    ds:Math.min(560,(window.innerWidth||600)-70)/_FG_TARGET_W};
  document.getElementById('cal-modal').classList.add('show');
  var t=document.getElementById('cal-title');if(t)t.textContent='Calibrar flyer — '+_optLabel(opt);
  var hInput=document.getElementById('cal-height');if(hInput)hInput.value='';
  _calRenderLegend();_calDraw();
  _loadFlyerCfgs(function(m){
    if(m&&m[name]){try{_calMergeCfg(_cal.cfg,m[name]);}catch(e){}}
    var hi=document.getElementById('cal-height');if(hi)hi.value=_cal.cfg.cropH?_cal.cfg.cropH:'';
    // preview con el legal REAL de esa opción, para ver cuánto ocupa
    loadGlobalLegal(false,opt).then(function(txt){
      if(_cal){_cal.legalText=(txt&&txt.trim())?txt:_CAL_SAMPLE_LEGAL;_calDraw();}
    });
  });
}
function _calOpenFromUrl(url,name,opt){
  showToast('Cargando flyer...');
  var im=new Image();
  im.onload=function(){_calOpen(im,name,url,opt);};
  im.onerror=function(){showToast('No se pudo cargar la imagen del flyer');};
  im.src=url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now();
}
function _calClose(){var m=document.getElementById('cal-modal');if(m)m.classList.remove('show');_cal=null;}
function _calSave(){
  if(!_cal)return;var name=_cal.name,url=_cal.url,cfg=_cal.cfg,opt=_optN(_cal.opt);
  showToast('Guardando calibración...');
  _saveFlyerCfg(name,cfg,function(){
    var imageUrl=url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now();
    var meta=JSON.stringify({name:name,imageUrl:imageUrl,cfg:cfg,updated_at:new Date().toISOString()});
    _sb.storage.from('flyers').upload(_activeFile(opt),new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
      .then(function(){
        if(opt===1)_activeFlyerName=name;
        showToast('¡Calibración guardada y activada en '+_optLabel(opt)+'!');
        _calClose();_fgInvalidateOpt(opt);loadUploadHistory();
      })
      .catch(function(){showToast('Error al guardar la calibración');});
  });
}

// ── NEGRITAS AL PEGAR ─────────────────────────────────────────────────────────────
// Convierte el formato pegado (negrita de Word/PDF/web) a marcadores **...** dentro
// del textarea, para que drawLegal las dibuje en negrita. Se engancha a #legal-text
// y al editor de legales del panel.
function _htmlBoldToMarkers(html){
  var d=document.createElement('div');d.innerHTML=html;
  function isBold(n){
    if(!n||!n.tagName)return false;
    var t=n.tagName.toLowerCase();
    if(t==='b'||t==='strong')return true;
    var fw=n.style&&n.style.fontWeight;
    return fw==='bold'||fw==='bolder'||(parseInt(fw,10)>=600);
  }
  function walk(node,bold){
    var out='';
    for(var i=0;i<node.childNodes.length;i++){
      var n=node.childNodes[i];
      if(n.nodeType===3){var t=n.nodeValue.replace(/[ \t\r\n]+/g,' ');if(bold&&t.trim())out+='**'+t+'**';else out+=t;}
      else if(n.nodeType===1){
        var tag=n.tagName.toLowerCase();
        out+=walk(n,bold||isBold(n));
        if(tag==='br'||/^(p|div|li|tr|h[1-6])$/.test(tag))out+='\n';
      }
    }
    return out;
  }
  return walk(d,false)
    .replace(/\*\*\s*\*\*/g,' ')        // une negritas adyacentes: **a** **b** -> **a b**
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim();
}
function _legalPasteHandler(e){
  var cd=e.clipboardData||window.clipboardData;if(!cd)return;
  var html=cd.getData('text/html');
  if(!html)return; // sin formato: pegado normal
  e.preventDefault();
  var md=_htmlBoldToMarkers(html);
  var ta=e.target,st=ta.selectionStart,en=ta.selectionEnd;
  ta.value=ta.value.slice(0,st)+md+ta.value.slice(en);
  ta.selectionStart=ta.selectionEnd=st+md.length;
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}
function _attachLegalPaste(id){
  var el=document.getElementById(id);
  if(el&&!el.dataset.pasteBold){el.dataset.pasteBold='1';el.addEventListener('paste',_legalPasteHandler);}
}

// ── LOGS DE FLYERS ────────────────────────────────────────────────────────────
// Columnas reales de flyer_logs: id, user_id, flyer_type, empresa, config_name, format, is_bulk, bulk_count, created_at
function logFlyerToSupabase(v,fn,fmt){
  if(!_me)return;
  var extra={opcion:_optN(_fgOpt)}; // qué armador se usó (control de visibilidad)
  if(v){
    ['config','nombre','celular','email','nombre2','celular2','email2',
     'nombre3','celular3','email3','nombre4','celular4','email4'].forEach(function(k){
      if(v[k])extra[k]=v[k];
    });
    extra.asesores=_fgAsesores(v).length;
  }
  _sb.from('flyer_logs').insert({
    user_id:_me.id,
    empresa:v&&v.empresa||'',
    config_name:fn||'',
    format:fmt||'png',
    is_bulk:false,
    bulk_count:0,
    flyer_type:JSON.stringify(extra),
    created_at:new Date().toISOString()
  }).then(function(r){
    if(r&&r.error)console.warn('flyer_logs insert error:',r.error.message);
  }).catch(function(e){console.warn('flyer_logs insert failed:',e);});
}
// Log del MASIVO: un registro por corrida, con la opción usada.
function logFlyerBulkToSupabase(n){
  if(!_me)return;
  _sb.from('flyer_logs').insert({
    user_id:_me.id,
    empresa:'Masivo ('+n+' flyers)',
    config_name:'',format:'pdf',is_bulk:true,bulk_count:n,
    flyer_type:JSON.stringify({opcion:_optN(_fgOpt),masivo:true}),
    created_at:new Date().toISOString()
  }).then(function(r){
    if(r&&r.error)console.warn('flyer_logs bulk error:',r.error.message);
  }).catch(function(e){console.warn('flyer_logs bulk failed:',e);});
}
// ── DESCARGAS: registro + historial con opción ────────────────────────────────
// OJO: logFlyerToSupabase existía pero NADIE lo llamaba => no se registraba ninguna
// descarga. Lo engancho acá pisando savePDF/savePNG de _source.html (que regenera).
function fgSavePDF(fc,v){
  var jsPDF=window.jspdf.jsPDF;
  var pw=210,ph=(fc.height/fc.width)*pw;
  var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
  pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
  var fn=buildFn(document.getElementById('filename').value,v);
  pdf.save(fn+'.pdf');
  addHistory(v,fn,fc);
  logFlyerToSupabase(v,fn,'pdf');
}
function fgSavePNG(fc,v){
  var a=document.createElement('a');
  var fn=buildFn(document.getElementById('filename').value,v);
  a.download=fn+'.png';a.href=fc.toDataURL('image/png');a.click();
  addHistory(v,fn,fc);
  logFlyerToSupabase(v,fn,'png');
}
// MASIVO con hasta 4 asesores. Pisa genAll de _source.html (que sólo mapea 1 y 2).
// Los Excel viejos (sin columnas 3/4) siguen funcionando igual.
function fgGenAll(){
  if(!window.excelData||!excelData.length)return;
  var total=excelData.length,cur=0,zip=new JSZip();
  var legalText=document.getElementById('legal-text').value;
  logFlyerBulkToSupabase(total);
  var pb=document.getElementById('prog-bar'),pf=document.getElementById('prog-fill'),
      pt=document.getElementById('prog-text'),bg=document.getElementById('btn-gen');
  if(pb)pb.style.display='block';if(pf)pf.style.width='0%';
  if(pt)pt.textContent='Generando 1 de '+total+'...';
  if(bg)bg.disabled=true;
  function pick(row,i,f){
    var k1='asesor'+i+'_'+f;
    if(row[k1]!=null&&String(row[k1]).trim()!=='')return String(row[k1]).trim();
    if(i===1&&row[f]!=null)return String(row[f]).trim(); // compat: columnas sueltas
    return '';
  }
  function next(){
    if(cur>=total){
      if(pt)pt.textContent='Empaquetando ZIP...';
      zip.generateAsync({type:'blob'}).then(function(content){
        var a=document.createElement('a'),d=new Date();
        var fecha=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        a.download='Flyers_Galicia_'+fecha+'.zip';
        a.href=URL.createObjectURL(content);a.click();
        if(pt)pt.textContent='✓ ZIP con '+total+' flyers!';
        if(bg)bg.disabled=false;
        showToast('ZIP descargado!');
      });return;
    }
    var row=excelData[cur];
    var cfg=CONFIGS[cfgIdx(row.config||row.Config||'')];
    var v={empresa:(row.empresa||row.Empresa||'flyer'+(cur+1)),
      m1:cfg.m1,m2:cfg.m2,m3:cfg.m3,m4:cfg.m4,legal:legalText};
    [1,2,3,4].forEach(function(i){
      var sfx=(i===1)?'':String(i);
      var nom=pick(row,i,'nombre'),ce=pick(row,i,'celular'),ma=pick(row,i,'email');
      v['has'+i]=nom!=='';
      v['nombre'+sfx]=nom;v['celular'+sfx]=ce?'Cel: '+ce:'';v['email'+sfx]=ma;
    });
    var fc=fullRes(v);
    var jsPDF=window.jspdf.jsPDF;
    var pw=210,ph=(fc.height/fc.width)*pw;
    var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
    pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
    zip.file('Flyer '+v.empresa+'.pdf',pdf.output('arraybuffer'));
    cur++;
    if(pf)pf.style.width=Math.round((cur/total)*100)+'%';
    if(pt)pt.textContent=cur<total?('Generando '+(cur+1)+' de '+total+'...'):'Finalizando...';
    setTimeout(next,200);
  }
  next();
}
// Plantilla Excel con las columnas de los 4 asesores (datos de ejemplo genéricos).
function fgDlTemplate(){
  var wb=XLSX.utils.book_new();
  var head=['empresa'];
  [1,2,3,4].forEach(function(i){head.push('asesor'+i+'_nombre','asesor'+i+'_celular','asesor'+i+'_email');});
  head.push('config');
  var data=[head,
    ['Empresa Ejemplo S.A.','Nombre Apellido','11 1234 5678','nombre.apellido@bancogalicia.com.ar','','','','','','','','','','BAU'],
    ['Empresa XYZ','Carlos Lopez','11 4444 5555','carlos.lopez@bancogalicia.com.ar','Ana Perez','11 5555 6666','ana.perez@bancogalicia.com.ar','','','','','','','Config 1']];
  var ws=XLSX.utils.aoa_to_sheet(data);
  ws['!cols']=[{wch:22}].concat([1,2,3,4].reduce(function(a){return a.concat([{wch:22},{wch:16},{wch:38}]);},[]),[{wch:10}]);
  XLSX.utils.book_append_sheet(wb,ws,'Flyers');
  XLSX.writeFile(wb,'Plantilla_Flyers_Galicia.xlsx');
  showToast('Plantilla descargada!');
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
        // Opción usada (control de visibilidad). Registros viejos no la tienen.
        var optBadge=ex.opcion?_optBadge(ex.opcion,'font-size:.58rem;margin-left:4px'):'';
        var bulkBadge=ex.masivo?'<span class="badge" style="font-size:.55rem;padding:3px 7px;background:#fff3e0;color:#b26a00;margin-left:4px">MASIVO</span>':'';
        var cfgHtml=ex.config?'<span class="reg-monto" style="background:#eef0ff;color:#3a3a8c">'+ex.config+'</span>':'';
        var cfgWrap=cfgHtml?'<div class="reg-montos">'+cfgHtml+'</div>':'';
        var asesorHtml=ex.nombre?'<div style="font-size:.68rem;color:#555;margin-top:3px"><b>Asesor:</b> '+ex.nombre+(ex.celular?' &middot; '+ex.celular:'')+(ex.email?' &middot; '+ex.email:'')+'</div>':'';
        return '<div class="reg-row">'+
          '<div class="usr-avatar sm" style="background:'+col+';flex-shrink:0">'+ini+'</div>'+
          '<div class="reg-info">'+
            '<div class="reg-top"><span class="reg-empresa">'+(row.empresa||'—')+'</span>'+fmtBadge+optBadge+bulkBadge+'</div>'+
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
