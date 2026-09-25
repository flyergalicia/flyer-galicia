var SUPA_URL='https://cajyjnxjbobdpltflgnb.supabase.co';
var SUPA_ANON='sb_publishable_M62msRVQkNbl0zk91r0zUw_q-gUDnJi';
// La service_role key YA NO está en el cliente. Las operaciones privilegiadas
// pasan por la Edge Function auth-admin, que la guarda del lado servidor.
var FN_URL=SUPA_URL+'/functions/v1/auth-admin';
var _sb=window.supabase.createClient(SUPA_URL,SUPA_ANON);
var _me=null,_admin=false,_allUsers=[],_editUid=null,_myName='';
var FLYERS_PUBLIC='https://cajyjnxjbobdpltflgnb.supabase.co/storage/v1/object/public/flyers/';
var _activeFlyerUrl=null,_activeFlyerName='';
// Edge Function para el Buscador de Promociones (ver _callPromosFn más abajo).
var FN_URL_PROMOS=SUPA_URL+'/functions/v1/promos-galicia';

// Llama a la Edge Function auth-admin. Adjunta el JWT de la sesión si existe
// (necesario para las acciones de admin). cb(err, data).
function _callFn(action,payload,cb){_callEdgeFn(FN_URL,action,payload,cb);}

// Igual que _callFn pero contra la Edge Function promos-galicia (puente hacia
// el buscador de promociones de Galicia: ver comentario en esa función sobre
// por qué no se puede llamar directo desde el navegador).
function _callPromosFn(action,payload,cb){_callEdgeFn(FN_URL_PROMOS,action,payload,cb);}

// Cuerpo común de las dos. El .catch del getSession importa: si la sesión no se
// puede leer, antes el cb no corría nunca y el botón que disparó la llamada
// quedaba deshabilitado para siempre.
function _callEdgeFn(url,action,payload,cb){
  _sb.auth.getSession().then(function(s){
    var headers={'apikey':SUPA_ANON,'Content-Type':'application/json'};
    var tok=s&&s.data&&s.data.session&&s.data.session.access_token;
    if(tok)headers['Authorization']='Bearer '+tok;
    var b={action:action};for(var k in payload)if(payload.hasOwnProperty(k))b[k]=payload[k];
    return fetch(url,{method:'POST',headers:headers,body:JSON.stringify(b)})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(res){cb(res.ok?null:(res.d&&res.d.error||'Error'),res.d);});
  }).catch(function(e){cb((e&&e.message)||'Error de red');});
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
  _initPalette();
}
// ── PALETA (tema claro elegible: Marfil / Marino / Grafito / Cielo) ─────────────
// Clase t-* en <html> (la pone también el script de arranque de _build.mjs para
// que no parpadee). Convive con .dark (modo oscuro). Tokens en _newcss.txt.
var _PALETAS=['t-marfil','t-marino','t-grafito','t-cielo'];
function setPalette(p){
  if(_PALETAS.indexOf(p)<0)p='t-marfil';
  var h=document.documentElement;
  _PALETAS.forEach(function(k){h.classList.remove(k);});
  h.classList.add(p);
  try{localStorage.setItem('fg_palette',p);}catch(e){}
  _syncPaletteMenu();
}
function _initPalette(){
  var p='t-marfil';try{p=localStorage.getItem('fg_palette')||p;}catch(e){}
  setPalette(p);
}
function _syncPaletteMenu(){
  var h=document.documentElement,box=document.getElementById('hdr-dd-pal');if(!box)return;
  Array.prototype.forEach.call(box.querySelectorAll('button[data-p]'),function(b){b.classList.toggle('on',h.classList.contains(b.getAttribute('data-p')));});
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

// Escapa TODO lo que pueda romper HTML, incluidas las comillas: así el mismo
// helper sirve para texto y para atributos, y un dato que llegó de otro usuario
// (nombre, empresa, mail) nunca puede convertirse en código al pintarse.
// Tolera números/null (antes, un valor numérico rompía con ".replace is not a function").
function _escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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
  if(!_can('notas'))return;
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
  fgConfirm('¿Eliminar la nota "'+(n.title||'Sin título')+'"?\n\nEsta acción no se puede deshacer.',{ok:'Eliminar'},function(si){
    if(!si)return;
    _notes=_notes.filter(function(x){return x.id!==_noteActive;});
    if(!_notes.length)_notes.push({id:_noteId(),title:'Nota 1',body:'',updated:Date.now()});
    _noteActive=_notes[0].id;_saveNotes();_renderNotesList();_renderNoteEditor();
    showToast('Nota eliminada');
  });
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
//
// EN LA NUBE (tabla asesores_guardados, migración 010): la lista viaja con la
// cuenta, no con la computadora. Antes vivía sólo en localStorage, así que
// cambiar de PC o limpiar los datos del navegador borraba todo.
// El localStorage queda como CACHÉ: abre el popover al instante y sirve de
// respaldo si la red falla, pero la fuente de verdad es la tabla.
function _asKey(){return 'fg_asesores_'+(_me?_me.id:'anon');}
// Bandera por navegador+cuenta: marca que lo que había guardado en ESTA máquina
// ya se subió. Sin ella, una PC con una copia vieja resucitaría en cada apertura
// los asesores que se borraron desde otra computadora.
function _asSyncKey(){return 'fg_asesores_sync_'+(_me?_me.id:'anon');}
var _asesores=[],_asReady=false,_asLoading=false,_asCbs=[];
function _asCache(){
  try{var a=JSON.parse(localStorage.getItem(_asKey())||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}
}
function _asSetCache(arr){try{localStorage.setItem(_asKey(),JSON.stringify(arr||[]));}catch(e){}}
function _asId(){return 'a'+Date.now()+Math.random().toString(36).slice(2,7);}
// Deja siempre la misma forma: {id,name,nombre,celular,email}. Tolera filas
// viejas o incompletas (sin id, con números) sin romper el resto del código.
function _asSane(rows){
  var out=[],seen={};
  (rows||[]).forEach(function(a){
    if(!a||typeof a!=='object')return;
    var id=String(a.id==null?'':a.id).trim()||_asId();
    if(seen[id])return;seen[id]=1;
    function t(v){return (v==null?'':String(v)).trim();}
    out.push({id:id,name:t(a.name)||t(a.nombre),nombre:t(a.nombre),celular:t(a.celular),email:t(a.email)});
  });
  return out;
}
// Carga la lista de la nube una vez por sesión. cb(lista) siempre se llama.
// Si la nube no responde, sigue andando con la caché local (modo degradado).
function _loadAsesores(cb){
  if(_asReady){if(cb)cb(_asesores);return;}
  if(!_asesores.length)_asesores=_asSane(_asCache()); // algo para mostrar ya mismo
  if(!_me){_asReady=true;if(cb)cb(_asesores);return;}
  if(cb)_asCbs.push(cb);
  if(_asLoading)return;
  _asLoading=true;
  _sb.from('asesores_guardados').select('id,name,nombre,celular,email,orden')
    .eq('user_id',_me.id).order('orden',{ascending:true})
    .then(function(r){
      _asLoading=false;
      if(r.error){
        console.warn('asesores_guardados:',r.error.message); // se sigue con la caché
      }else{
        var nube=_asSane(r.data),local=_asSane(_asCache()),subir=false;
        var yaSync=false;try{yaSync=!!localStorage.getItem(_asSyncKey());}catch(e){}
        if(!yaSync&&local.length){
          // Primera vez en este navegador: lo que había acá se suma a la nube
          // (no se pisa lo que ya esté guardado de otra computadora).
          var enNube={};nube.forEach(function(a){enNube[a.id]=1;});
          var faltan=local.filter(function(a){return !enNube[a.id];});
          if(faltan.length){nube=faltan.concat(nube);subir=true;}
        }
        _asesores=nube;_asReady=true;_asSetCache(_asesores);
        try{localStorage.setItem(_asSyncKey(),'1');}catch(e){}
        if(subir)_saveAsesores();
      }
      var cbs=_asCbs;_asCbs=[];
      cbs.forEach(function(f){try{f(_asesores);}catch(e){}});
    });
}
// Sube la lista entera (una sola llamada atómica: borra y reinserta del lado del
// servidor). Se usa después de guardar, eliminar o importar.
function _saveAsesores(cb){
  _asSetCache(_asesores);
  if(!_me){if(cb)cb(false);return;}
  var rows=_asesores.map(function(a){
    return {id:a.id,name:a.name||'',nombre:a.nombre||'',celular:a.celular||'',email:a.email||''};
  });
  _sb.rpc('asesores_replace',{p_rows:rows}).then(function(r){
    if(r&&r.error){
      showToast('No se pudo guardar en la nube: '+r.error.message+' (quedó en esta computadora)');
      if(cb)cb(false);return;
    }
    if(cb)cb(true);
  });
}
function _gv(id){var el=document.getElementById(id);return el?el.value:'';}
function _setVal(id,v){var el=document.getElementById(id);if(el)el.value=(v||'');}

// Hace clickeables los títulos "Asesor 1" y "Asesor 2" (vienen de _source.html).
function _initAsesoresUI(){
  if(!_can('asesores_guardados'))return;
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
  if(!_asReady&&!_asesores.length)return '<div class="as-empty">Cargando tus asesores&hellip;</div>';
  return _asesores.length?_asesores.map(function(a){return _asItemHtml(a,slot);}).join('')
    :'<div class="as-empty">No tenés asesores guardados todavía.</div>';
}
// Repinta la lista del popover si sigue abierto (después de traerla de la nube,
// de guardar o de eliminar).
function _asRefreshPop(slot){
  var list=document.querySelector('#as-pop .as-list');
  if(list)list.innerHTML=_asListHtml(slot);
}
function openAsPop(slot,anchor){
  if(!_can('asesores_guardados'))return; // el listener queda puesto; la facultad se revalida acá
  closeAsPop();
  _loadAsesores(function(){_asRefreshPop(slot);}); // pinta ya con la caché y refresca al llegar la nube
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
  _fgShowBlock(slot,true);_fgRefreshAddBtn();
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
  closeAsPop();showToast('Asesor "'+(a.name||a.nombre)+'" cargado');
}
function saveAsesor(slot){
  // Mismo sufijo que usa applyAsesor: '' para el 1, '2'/'3'/'4' para el resto.
  // Antes sólo distinguía el 2, así que "Guardar el actual" desde el Asesor 3
  // o 4 guardaba en silencio los datos del Asesor 1.
  var sfx=(slot>1)?String(slot):'';
  var n=_gv('nombre'+sfx),c=_gv('celular'+sfx),m=_gv('email'+sfx);
  if(!n&&!c&&!m){showToast('Completá el asesor antes de guardar');return;}
  var name=prompt('Nombre para guardar este asesor:',n||'');
  if(name===null)return;name=(name||n||'').trim();if(!name){showToast('Poné un nombre');return;}
  // Se espera a tener la lista de la nube antes de agregar: si no, la respuesta
  // que llega después pisaría el asesor recién guardado.
  _loadAsesores(function(){
    _asesores.unshift({id:_asId(),name:name,nombre:n,celular:c,email:m});
    _saveAsesores();closeAsPop();showToast('Asesor "'+name+'" guardado');
  });
}
function delAsesor(id,slot){
  var a=_asesores.find(function(x){return x.id===id;});if(!a)return;
  fgConfirm('¿Eliminar el asesor guardado "'+(a.name||a.nombre)+'"?',{ok:'Eliminar'},function(si){
    if(!si)return;
    _loadAsesores(function(){ // idem: con la lista de la nube en mano
      _asesores=_asesores.filter(function(x){return x.id!==id;});
      _saveAsesores();
      _asRefreshPop(slot); // refresca sin cerrar
      showToast('Asesor eliminado');
    });
  });
}
function importAsesores(input){
  var file=input&&input.files&&input.files[0];if(!file)return;input.value='';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'binary'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      // Igual que al guardar: primero la lista de la nube, después se agregan.
      _loadAsesores(function(){
        var added=0;
        rows.forEach(function(r){
          function g(keys){for(var i=0;i<keys.length;i++){var v=r[keys[i]];if(v!=null&&String(v).trim()!=='')return String(v).trim();}return '';}
          var n1=g(['asesor1_nombre','nombre','Nombre']);
          // "guardar_como" es el rótulo con el que se ve en la lista; si el Excel no
          // trae esa columna (plantilla del masivo o archivo viejo) vale el nombre real.
          if(n1){_asesores.unshift({id:_asId(),name:g(['guardar_como','nombre_visible','etiqueta'])||n1,nombre:n1,celular:g(['asesor1_celular','celular','Celular']),email:g(['asesor1_email','email','Email'])});added++;}
          var n2=g(['asesor2_nombre']);
          if(n2){_asesores.unshift({id:_asId()+'b',name:n2,nombre:n2,celular:g(['asesor2_celular']),email:g(['asesor2_email'])});added++;}
        });
        _saveAsesores();closeAsPop();
        // La solapa "Mis asesores", si está abierta: la importación ya guardó en la
        // nube, así que la copia de edición que hubiera quedó vieja y se descarta.
        if(document.getElementById('asesores-list')){_asEdit=null;_asDirty=false;renderAsesoresAdmin(true);}
        showToast(added?(added+' asesor'+(added>1?'es':'')+' importado'+(added>1?'s':'')):'No se encontraron asesores en el Excel');
      });
    }catch(err){showToast('No se pudo leer el Excel: '+(err&&err.message||err));console.error('importAsesores:',err);}
  };
  reader.readAsBinaryString(file);
}

// ── SOLAPA "MIS ASESORES" (Base de datos) ────────────────────────────────────
// El popover del armador sólo muestra NOMBRES: si un celular o un mail quedaron
// mal, había que borrar el asesor y volver a cargarlo. Acá se ven los datos y se
// corrigen en su lugar. Trabaja sobre una COPIA (_asEdit) y recién pega en la
// nube con "Guardar cambios", igual que el editor de empresas.
// A diferencia de aquel, no hay modo "editar": son pocas filas y entrar a
// corregir es justamente para lo que se abre esta solapa.
var _asEdit=null,_asEditQ='',_asDirty=false;
function _asEditStyle(){
  if(document.getElementById('as-edit-style'))return;
  var st=document.createElement('style');st.id='as-edit-style';
  st.textContent=
    '.as-erow{border:1px solid var(--border,#e2e2e2);border-radius:9px;padding:9px;margin-bottom:8px}'+
    '.as-erow-main{display:grid;grid-template-columns:1.1fr 1.2fr 0.9fr 1.4fr auto;gap:6px;align-items:center}'+
    '.as-erow-main .login-inp{margin-bottom:0;font-size:.78rem;padding:7px 8px}'+
    '@media(max-width:760px){.as-erow-main{grid-template-columns:1fr}}';
  document.head.appendChild(st);
}
// Punto de entrada único (solapa del panel admin y panel del overlay).
// force=true recarga de la nube, salvo que haya cambios sin guardar: perderlos en
// silencio por tocar "Recargar" o por cambiar de solapa sería peor que no recargar.
function renderAsesoresAdmin(force){
  _asEditStyle();
  var st=document.getElementById('asesores-stat');
  if(st&&!_asReady)st.innerHTML='<span style="color:var(--gray)">Cargando tus asesores...</span>';
  // Con cambios sin guardar NO se recarga: perderlos por tocar "Recargar" o por
  // volver a la solapa sería peor que no refrescar. Se avisa y siguen ahí.
  if(force&&_asDirty&&document.getElementById('asesores-list'))showToast('Tenés cambios sin guardar: guardalos o descartalos');
  if(force&&!_asDirty)_asEdit=null;
  _loadAsesores(function(){
    if(!_asEdit)_asEdit=_asSane(_asesores);
    _asEditRenderList();
  });
}
// Devuelve índices REALES de _asEdit (no posiciones filtradas), así cada fila
// sigue editando al asesor correcto aunque haya un filtro puesto.
function _asEditMatchIdxs(){
  var rows=_asEdit||[],t=(_asEditQ||'').trim().toLowerCase();
  if(!t)return rows.map(function(_,i){return i;});
  var toks=t.split(/\s+/).filter(Boolean),out=[];
  rows.forEach(function(a,i){
    var txt=((a.name||'')+' '+(a.nombre||'')+' '+(a.celular||'')+' '+(a.email||'')).toLowerCase();
    if(toks.every(function(k){return txt.indexOf(k)>=0;}))out.push(i);
  });
  return out;
}
function _asEditFilter(v){_asEditQ=v;_asEditRenderList();}
function _asEditStat(){
  var st=document.getElementById('asesores-stat');if(!st)return;
  var n=(_asEdit||[]).length;
  st.innerHTML=n
    ? ('<strong>'+n+'</strong> asesor'+(n!==1?'es':'')+' guardado'+(n!==1?'s':'')+
       (_asDirty?' &nbsp;&middot;&nbsp; <span style="color:var(--red,#c0392b)">cambios sin guardar</span>':''))
    : 'Todav&iacute;a no guardaste ning&uacute;n asesor. Agreg&aacute; el primero o sub&iacute; un Excel.';
}
function _asEditRenderList(){
  var host=document.getElementById('asesores-list');if(!host)return;
  _asEditStat();
  var rows=_asEdit||[];
  if(!rows.length){host.innerHTML='';return;}
  var idxs=_asEditMatchIdxs();
  if(!idxs.length){
    host.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Sin resultados para "'+_escHtml(_asEditQ)+'".</p>';
    return;
  }
  host.innerHTML=
    (_asEditQ?'<p style="font-size:.68rem;color:var(--gray);margin-bottom:6px">Mostrando '+idxs.length+' de '+rows.length+'.</p>':'')+
    idxs.map(function(i){return _asEditRowHtml(_asEdit[i],i);}).join('');
}
function _asEditRowHtml(a,i){
  return '<div class="as-erow"><div class="as-erow-main">'+
    '<input class="login-inp" placeholder="Nombre visible" title="C&oacute;mo lo ves en la lista" value="'+_escAttr(a.name)+'" oninput="_asEditField('+i+',\'name\',this.value)">'+
    '<input class="login-inp" placeholder="Nombre real (va al flyer)" value="'+_escAttr(a.nombre)+'" oninput="_asEditField('+i+',\'nombre\',this.value)">'+
    '<input class="login-inp" placeholder="Celular" value="'+_escAttr(a.celular)+'" oninput="_asEditField('+i+',\'celular\',this.value)">'+
    '<input class="login-inp" placeholder="Email" value="'+_escAttr(a.email)+'" oninput="_asEditField('+i+',\'email\',this.value)">'+
    '<button type="button" class="usr-btn del" onclick="_asEditRemoveRow('+i+')" title="Eliminar asesor">&#10005;</button>'+
  '</div></div>';
}
function _asEditField(i,k,v){
  if(!_asEdit||!_asEdit[i])return;
  _asEdit[i][k]=v;_asDirty=true;_asEditStat();
}
function _asEditAddRow(){
  // Puede llamarse con la solapa recién abierta (sin copia todavía): la arma antes,
  // así la fila nueva no se pierde cuando llega la respuesta de la nube.
  if(!_asEdit){
    _asEditStyle();
    _loadAsesores(function(){if(!_asEdit)_asEdit=_asSane(_asesores);_asEditAddRow();});
    return;
  }
  _asEdit.push({id:_asId(),name:'',nombre:'',celular:'',email:''});
  _asDirty=true;
  if(_asEditQ){ // con un filtro puesto la fila nueva (vacía) no matchearía
    _asEditQ='';
    var q=document.getElementById('asesores-q');if(q)q.value='';
  }
  _asEditRenderList();
  var last=document.querySelector('#asesores-list .as-erow:last-child .as-erow-main input');if(last)last.focus();
}
function _asEditRemoveRow(i){
  if(!_asEdit||!_asEdit[i])return;
  var a=_asEdit[i],label=a.name||a.nombre||'este asesor';
  fgConfirm('¿Eliminar el asesor guardado "'+label+'"?\n\nSe borra al tocar "Guardar cambios".',{ok:'Eliminar'},function(si){
    if(!si||!_asEdit||_asEdit[i]!==a)return;
    _asEdit.splice(i,1);_asDirty=true;
    _asEditRenderList();
  });
}
// preguntar=true viene del botón "Descartar cambios"; sin preguntar se usa al
// cerrar la pantalla cuando el usuario ya confirmó que los pierde.
function _asEditDiscard(preguntar){
  if(!preguntar||!_asDirty){_asEdit=null;_asDirty=false;renderAsesoresAdmin(true);return;}
  fgConfirm('¿Descartar los cambios que hiciste en tus asesores?',{ok:'Descartar'},function(si){
    if(!si)return;
    _asEdit=null;_asDirty=false;renderAsesoresAdmin(true);
    showToast('Cambios descartados');
  });
}
function _asEditSave(){
  if(!_asEdit)return;
  var btn=document.getElementById('asesores-save');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  var copia=_asEdit;
  // Mismo recaudo que saveAsesor/delAsesor: la lista de la nube primero, para que
  // una respuesta en vuelo no pise lo que se está por guardar.
  _loadAsesores(function(){
    _asesores=_asSane(copia);
    _saveAsesores(function(ok){
      if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
      if(!ok)return; // _saveAsesores ya avisó por qué
      _asDirty=false;_asEdit=null;
      var n=_asesores.length;
      showToast(n+' asesor'+(n!==1?'es':'')+' guardado'+(n!==1?'s':''));
      renderAsesoresAdmin(true);
      _asRefreshPop(1); // si el popover del armador quedó abierto, que muestre lo nuevo
    });
  });
}
// ── MIS ASESORES: Excel (exportar / plantilla) ───────────────────────────────
// Las 3 últimas columnas son las que importAsesores ya entiende: lo que bajás se
// puede volver a subir sin tocar nada. "guardar_como" es opcional.
var _AS_HEAD=['guardar_como','nombre','celular','email'];
function _asToAoa(rows){
  var out=[_AS_HEAD.slice()];
  (rows||[]).forEach(function(a){out.push([a.name||'',a.nombre||'',a.celular||'',a.email||'']);});
  return out;
}
function _asXlsx(rows,file){
  var wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(_asToAoa(rows));
  ws['!cols']=[{wch:26},{wch:26},{wch:16},{wch:38}];
  XLSX.utils.book_append_sheet(wb,ws,'Asesores');
  XLSX.writeFile(wb,file);
}
function dlAsesores(){
  _loadAsesores(function(){
    if(!_asesores.length){showToast('Todavía no guardaste ningún asesor');return;}
    _asXlsx(_asesores,'Mis_Asesores_Galicia.xlsx');
    showToast('Excel descargado ('+_asesores.length+' asesores)');
  });
}
function dlAsesoresTemplate(){
  _asXlsx([
    {name:'Juan — Sucursal Centro',nombre:'Juan Perez',celular:'11 1234 5678',email:'juan.perez@bancogalicia.com.ar'},
    {name:'',nombre:'Ana Gomez',celular:'11 5555 6666',email:'ana.gomez@bancogalicia.com.ar'}
  ],'Plantilla_Asesores_Galicia.xlsx');
  showToast('Plantilla descargada!');
}

// Devuelve el badge HTML del rol (admin / vip / pro / asesor).
var _ROLE_LBL={admin:'Admin',vip:'VIP',pro:'Pro',asesor:'Asesor'};
function _roleBadge(role){
  var cls=_ROLE_LBL[role]?role:'asesor';
  return '<span class="badge badge-'+cls+'">'+_ROLE_LBL[cls]+'</span>';
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

// Port 1:1 del validateExcel del template, con una diferencia: todo lo que viene
// del Excel (nombres de columna, celdas, el valor de "config") se ESCAPA antes
// de pintarlo en la vista previa. En el template iba crudo al innerHTML, así que
// una celda con HTML se ejecutaba en la página. Pisa a window.validateExcel en
// _installFlyerEngine (mismo mecanismo que _robustLoadExcel).
// Columnas del cartel en el Excel del masivo, tolerantes al nombre: la plantilla
// las llama "importe (Tope supermercado)" / "importe2 (Tope combustible…)" para
// que se entienda cuál es cuál, y acá se reconocen por el prefijo normalizado.
function _fgRowBenef(row){
  var m={},k;
  for(k in row){if(row.hasOwnProperty(k))m[_padKey(k)]=(row[k]==null?'':String(row[k])).trim();}
  var out={beneficio:'',importe:'',importe2:''};
  for(k in m){
    if(!m[k])continue;
    if(/^(importe2|tope2|importecombustible|topecombustible|segundo)/.test(k)){if(!out.importe2)out.importe2=m[k];}
    else if(/^(importe|tope)/.test(k)){if(!out.importe)out.importe=m[k];}
    else if(/^beneficio/.test(k)){if(!out.beneficio)out.beneficio=m[k];}
  }
  return out;
}
function fgValidateExcel(rows){
  rows=rows||[];
  if(!rows.length){showToast('Archivo vacío');return;}
  var errors=[],warnings=[];
  rows.forEach(function(r,i){
    var n=i+2;
    if(!String(r.empresa||r.Empresa||'').trim())errors.push('Fila '+n+': empresa vacía');
    var mail=String(r.asesor1_email||r.email||'');
    if(mail&&mail.indexOf('@')<0)warnings.push('Fila '+n+': email sin @');
    var cfg=String(r.config||'').toLowerCase().trim();
    // misma lectura tolerante que el padrón y que genAll: vale cualquier config que exista hoy (Config → Cashback)
    if(cfg&&_padCfgParse(cfg)<0&&!_padCfgSin(cfg))warnings.push('Fila '+n+': config "'+_escHtml(cfg)+'" inválida (sale sin cashback)');
    // Flyer Rubros: sin importe en la fila se usa el del formulario (no es error)
    if(_fgVista==='rubros'&&!_fgFmtImporte(_fgRowBenef(r).importe))warnings.push('Fila '+n+': sin importe (se usa el tope del formulario)');
  });
  var vs=document.getElementById('val-sum'),gen=document.getElementById('btn-gen');
  if(vs){
    vs.style.display='block';
    if(errors.length){vs.className='val-summary err';vs.innerHTML='&#10007; '+errors.join('<br>');}
    else if(warnings.length){vs.className='val-summary warn';vs.innerHTML='&#9888; '+warnings.join('<br>');}
    else{vs.className='val-summary ok';vs.innerHTML='&#10003; Todo OK — '+rows.length+' flyer'+(rows.length>1?'s':'');}
  }
  if(gen)gen.disabled=errors.length>0;
  var info=document.getElementById('excel-info');if(info)info.style.display='block';
  var rc=document.getElementById('row-count');if(rc)rc.textContent=rows.length+' fila'+(rows.length>1?'s':'');
  var keys=Object.keys(rows[0]);
  var tbl='<table><tr>'+keys.map(function(k){return '<th>'+_escHtml(k)+'</th>';}).join('')+'</tr>';
  rows.slice(0,5).forEach(function(r){tbl+='<tr>'+keys.map(function(k){return '<td>'+_escHtml(r[k]||'')+'</td>';}).join('')+'</tr>';});
  if(rows.length>5)tbl+='<tr><td colspan="'+keys.length+'" style="color:var(--gray);text-align:center">...y '+(rows.length-5)+' más</td></tr>';
  var prev=document.getElementById('excel-preview');if(prev)prev.innerHTML=tbl+'</table>';
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
// ── LIBRERÍAS DE EXPORTACIÓN BAJO DEMANDA ────────────────────────────────────
// jsPDF, SheetJS (XLSX), JSZip y ExcelJS (~2,2 MB) ya no vienen en el <head>: el
// build deja sus URLs + hash SRI en <meta name="fg-libs"> y acá se inyectan la
// primera vez que una función las necesita. Cada punto de entrada (botones de
// descarga, inputs de Excel) se envuelve con _libWrap: si la librería ya está,
// llama directo; si no, la carga y recién entonces llama con los mismos argumentos.
// Vale para index.html e index_export.html (los dos llevan la meta). Si la meta no
// está (HTML armado a mano con las libs en el <head>), los wrappers no hacen nada.
var _LIBS=(function(){var m=document.querySelector('meta[name=fg-libs]');try{return m?JSON.parse(m.content):{};}catch(e){return {};}})();
var _libP={};
function _libReady(n){
  if(n==='jspdf')return !!(window.jspdf&&window.jspdf.jsPDF);
  if(n==='xlsx')return typeof XLSX!=='undefined';
  if(n==='jszip')return typeof JSZip!=='undefined';
  if(n==='exceljs')return typeof ExcelJS!=='undefined'&&!!ExcelJS.Workbook;
  return true;
}
function _lib(names){
  return Promise.all([].concat(names).map(function(n){
    if(_libReady(n))return Promise.resolve();
    if(_libP[n])return _libP[n];
    var L=_LIBS[n];if(!L||!L.src)return Promise.reject(new Error('lib '+n));
    _libP[n]=new Promise(function(res,rej){
      var s=document.createElement('script');s.src=L.src;
      if(L.integrity){s.integrity=L.integrity;s.crossOrigin='anonymous';}
      s.onload=function(){_libReady(n)?res():rej(new Error(n));};
      s.onerror=function(){_libP[n]=null;rej(new Error(n));};
      document.head.appendChild(s);
    });
    return _libP[n];
  }));
}
function _libWrap(fnName,libs){
  var orig=window[fnName];if(typeof orig!=='function'||orig._libWrapped)return;
  var w=function(){
    var self=this,args=arguments;
    if(libs.every(_libReady))return orig.apply(self,args);
    showToast('Preparando la descarga…');
    _lib(libs).then(function(){orig.apply(self,args);})
      .catch(function(){showToast('No se pudo cargar la librería de '+libs.join('/')+'. Revisá la conexión e intentá de nuevo.');});
  };
  w._libWrapped=true;window[fnName]=w;
}
function _libInit(){
  if(!_LIBS.jspdf)return; // sin meta: las libs están en el <head>, nada que envolver
  _libWrap('savePDF',['jspdf']);                 // PDF individual, modal e historial
  _libWrap('genAll',['jspdf','jszip']);          // masivo
  _libWrap('_pgGenerarRows',['jspdf','jszip']);  // padrón / segmento
  _libWrap('dlTemplate',['xlsx']);
  _libWrap('loadExcel',['xlsx']);
  _libWrap('importAsesores',['xlsx']);
  _libWrap('importPadron',['xlsx']);
  _libWrap('exportRegistros',['xlsx']);
  _libWrap('exportPadronLog',['xlsx']);
  _libWrap('exportFlyerLogsExcel',['xlsx']);
  _libWrap('_padXlsx',['xlsx']);
  _libWrap('_asXlsx',['xlsx']);                  // descarga de "Mis asesores"
  _libWrap('descargarExcelPromos',['exceljs']);
}
// Bajar el PDF es la acción central de la app: apenas la pantalla queda quieta
// después del login, jsPDF se trae en segundo plano para que el primer "Descargar"
// no espere. Las de Excel/ZIP sólo se cargan si se usan.
function _libPrefetch(){if(_LIBS.jspdf&&!_libReady('jspdf'))setTimeout(function(){_lib('jspdf').catch(function(){});},2500);}
function initApp(){
  _initTheme();
  setTimeout(_updChk,4000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')_updChk();});
  // Pisa loadExcel del HTML por la versión robusta (ver _robustLoadExcel).
  window.loadExcel=_robustLoadExcel;
  // Motor de dibujado config-driven (coordenadas por flyer) + negritas al pegar.
  _installFlyerEngine();
  window.FLYER_CFG=_readDocCfg()||window.FLYER_CFG||{};
  _attachLegalPaste('legal-text');
  _fgEnsureAsesores34(); // campos de asesor 3 y 4 (el template sólo trae 1 y 2)
  _fgFixAsesorLabels();  // "Agregar asesor 1..4" en los cuatro switches
  _fgAutoMail();         // sugiere nombre.apellido@bancogalicia.com.ar al tipear
  _fgEnsureAddBtn();     // botón "+ Agregar asesor"
  _fgEnsureBenefFields();// campos del beneficio exclusivo (solapa Flyer Rubros)
  _fgSyncAsesorBlocks(); // arranca mostrando sólo el Asesor 1
  _fgCardify();          // presentación: el formulario en tarjetas (después de inyectar todo)
  _fgUxInit();           // validación en línea, negrita del legal, teclado, "Otros", compartir
  _libInit();            // PDF/Excel/ZIP se cargan la primera vez que se usan (va después del motor: envuelve sus overrides)
  _sb.auth.onAuthStateChange(function(event){
    if(event==='PASSWORD_RECOVERY'){showLoginView('forgot');}
    // Sesión cerrada por afuera (venció el refresh token, logout desde otra
    // pestaña): sin esto la app seguía "logueada" con _me seteado, y cada
    // guardado/registro fallaba en silencio. Recargar la lleva al login.
    if(event==='SIGNED_OUT'&&_me){_me=null;location.reload();}
  });
  _sb.auth.getSession().then(function(r){
    if(r.data&&r.data.session){checkProfile(r.data.session.user);}
  });
  var prevEl=document.querySelector('.prev');
  if(prevEl){
    // La rueda manda decenas de eventos por gesto; cada uno redibujaba el flyer entero
    // de una y la pestaña se trababa. Se acumulan los pasos y se aplica un solo
    // zoom+redibujo por cuadro, anclado a la última posición del cursor.
    var _pwPend=null,_pwPasos=0,_pwX=0,_pwY=0;
    prevEl.addEventListener('wheel',function(e){
      e.preventDefault();
      _pwPasos+=(e.deltaY<0?1:-1);_pwX=e.clientX;_pwY=e.clientY;
      if(_pwPend)return;
      _pwPend=requestAnimationFrame(function(){
        _pwPend=null;
        var pasos=_pwPasos;_pwPasos=0;if(!pasos)return;
        var cvRectBefore=cv.getBoundingClientRect();
        var fx=(_pwX-cvRectBefore.left)/cvRectBefore.width;
        var fy=(_pwY-cvRectBefore.top)/cvRectBefore.height;
        fx=Math.min(Math.max(fx,0),1);
        fy=Math.min(Math.max(fy,0),1);
        var z0=ZOOM;
        for(var i=0;i<Math.abs(pasos);i++)ZOOM=pasos>0?Math.min(ZOOM*1.25,_ZOOM_MAX):Math.max(ZOOM/1.25,0.2);
        if(ZOOM===z0)return;
        calcSC();redraw();_updateZoomPct();
        var cvRectAfter=cv.getBoundingClientRect();
        prevEl.scrollLeft+=(cvRectAfter.left+fx*cvRectAfter.width)-_pwX;
        prevEl.scrollTop+=(cvRectAfter.top+fy*cvRectAfter.height)-_pwY;
      });
    },{passive:false});
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
  // Sólo mails del banco (la Edge Function lo vuelve a exigir del lado servidor;
  // acá es para avisar antes de mandar nada).
  if(!/^[^@\s]+@bancogalicia\.com\.ar$/i.test(email)){errEl.textContent='Sólo se aceptan mails @bancogalicia.com.ar.';return;}
  if(pass.length<8){errEl.textContent='La contraseña debe tener al menos 8 caracteres.';return;}
  var btn=document.getElementById('reg-btn');btn.textContent='Creando cuenta...';btn.disabled=true;
  // La Edge Function crea la cuenta confirmada en estado pending (sin email de
  // confirmación, que no se entrega a dominios corporativos).
  _callFn('register',{email:email,password:pass,full_name:name},function(err){
    btn.textContent='Crear cuenta';btn.disabled=false;
    if(err){errEl.textContent=err;return;}
    document.getElementById('reg-name').value='';
    document.getElementById('reg-email').value='';
    document.getElementById('reg-pass').value='';
    // Texto neutro a propósito: el servidor responde lo mismo exista o no ya una
    // cuenta con ese mail, para no revelar qué mails tienen usuario acá.
    okEl.textContent='✅ Listo. Si el mail es válido, tu acceso queda pendiente de aprobación del administrador.';
  });
}

function checkProfile(user){
  _sb.from('profiles').select('role,full_name,nombre_asesor,celular_asesor,email_asesor,status,facultades').eq('id',user.id).single().then(function(r){
    var p=r.data;
    if(r.error||!p||p.status!=='active'){
      var msg;
      if(r.error)msg='Error: '+r.error.message;
      else if(p&&p.status==='pending')msg='Tu cuenta está pendiente de aprobación del administrador.';
      else if(p&&p.status==='reset_pending')msg='Tu cambio de contraseña está pendiente de aprobación del administrador.';
      else msg='Cuenta inactiva. Contactá al administrador.';
      // Orden importa: showLoginView limpia login-err, así que el mensaje va
      // DESPUÉS (antes se borraba en el mismo tick y el usuario no veía nada).
      showLoginView('login');
      document.getElementById('login-err').textContent=msg;
      // Y la sesión de Supabase se cierra: una cuenta pendiente/inactiva no
      // tiene que quedarse con un token vigente en el navegador.
      _me=null;
      _sb.auth.signOut().catch(function(){});
      return;
    }
    // Si entra otra cuenta sin recargar, la lista de asesores guardados del
    // anterior no puede quedar en memoria (se recarga de la nube del nuevo).
    if(_me&&_me.id!==user.id){_asesores=[];_asReady=false;_asCbs=[];}
    _me=user;_admin=(p.role==='admin');_myRole=p.role||'asesor';_myName=p.full_name||p.email_asesor||user.email;
    // Facultades propias del admin (columna "Vos" en Facultades): null = todo.
    _myFac=(_admin&&p.facultades&&typeof p.facultades==='object'&&!Array.isArray(p.facultades))?p.facultades:null;
    loadCashback(false,function(){if(typeof redraw==='function')redraw();}); // monto vigente, aunque el admin lo haya cambiado
    // El gating de la interfaz depende de la matriz de facultades, que viene de
    // la nube: por eso se aplica dentro del callback y no acá suelto. Corre en
    // paralelo con _fetchActiveFlyer, que es quien recién muestra la app.
    // La lista de opciones va ANTES que las facultades: las filas opcion_N de la
    // matriz se generan a partir de ella.
    loadOpciones(false,function(){loadFacultades(false,_applyFacultades);});
    loadTitulos(_titGestos); // nombres de las solapas del header y del panel (editables por el admin)
    var _ddName=document.getElementById('hdr-dd-name');if(_ddName)_ddName.textContent=_myName;
    var _ddRole=document.getElementById('hdr-dd-role');if(_ddRole)_ddRole.innerHTML=_roleBadge(p.role);
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
    var _legal1P=_applyGlobalLegalToForm(1); // trae los T&C globales de la Opción 1 (una sola descarga)
    document.getElementById('hdr-user').textContent=_myName;
    var hAv=document.getElementById('hdr-avatar');if(hAv)hAv.textContent=_initials(_myName,'');
    var ab=document.getElementById('hdr-admin-btn');if(ab)ab.style.display=_admin?'inline-flex':'none';
    if(_admin)_refreshPendingBadge(); // el panel admin sigue siendo exclusivo del admin
    // Aplicar imagen del flyer activo (Opción 1)
    _fetchActiveFlyer(function(imageUrl){
      _showApp();
      // Con la app ya visible, re-aplico: es idempotente, y recién acá puede
      // corregir la opción activa si este perfil no tiene habilitada la 1.
      if(_facLoaded){_applyFacultades();_tourAutoStart();}
      else loadFacultades(false,function(){_applyFacultades();_tourAutoStart();});
      // Cacheo la Opción 1 para que volver a ella sea instantáneo
      _fgOptCache[1]={loaded:true,cfg:window.FLYER_CFG||null,imageUrl:imageUrl,
        name:_activeFlyerName,legal:null,img:null};
      // el legal viene de la misma descarga de arriba; si ya llegó, esto lo copia al caché
      _legal1P.then(function(t){_fgLegalArrived(1,t);});
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
          _fgBaseFallback();
        };
        _ni.src=imageUrl+'&_r='+Date.now();
      }else _fgBaseFallback();
    });
  });
}

// index.html ya no trae la imagen de ejemplo incrustada (1,75 MB que se descartaban
// al traer el flyer activo). El build la deja en flyer_default.jpg y la anota en
// baseImg.dataset.fallback: se carga sólo si no hay flyer activo o falló su descarga.
// En index_export.html la imagen sigue incrustada (baseImg.width>0) y esto no hace nada.
function _fgBaseFallback(){
  var b=window.baseImg;if(!b||b.width||!b.dataset||!b.dataset.fallback)return;
  b.onload=function(){if(typeof calcSC==='function')calcSC();if(typeof redraw==='function')redraw();};
  b.src=b.dataset.fallback;
}
function _showApp(){
  _libPrefetch();
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
    // "Usuarios" quedó un nivel más abajo (dentro del pilar Admin): un puntito
    // avisa que hay algo pendiente sin tener que entrar a mirar.
    var pa=document.querySelector('.atab[data-group="admin"]');
    if(pa)pa.classList.toggle('has-dot',n>0);
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

// El menú del panel tiene 3 pilares (Admin/Data/Config) con sub-solapas dentro.
// _AP_GROUPS es la única fuente de verdad de qué hoja vive en qué pilar.
var _AP_GROUPS={admin:['dashboard','usuarios','registros','facultades'],data:['varios','asesores','padronotros','padronlog'],config:['subir','cashback','legales','opciones']};
var _apLast={admin:'dashboard',data:'varios',config:'subir'}; // última hoja vista por pilar
function _apGroupOf(t){for(var g in _AP_GROUPS)if(_AP_GROUPS[g].indexOf(t)>=0)return g;return '';}
function switchAdminTab(el,t){
  Object.keys(_AP_GROUPS).forEach(function(g){
    _AP_GROUPS[g].forEach(function(tab){
      var el2=document.getElementById('at-'+tab);if(el2)el2.style.display=tab===t?'block':'none';
    });
  });
  // :not(.ltab) para no pisar las sub-solapas de legales (Opción 1 / Opción 2)
  // :not(.bdtab) idem con las de "Base de datos" (Mis empresas / Mis asesores),
  // que viven en el overlay y usan .stab sólo para heredar el estilo.
  document.querySelectorAll('.stab:not(.ltab):not(.bdtab)').forEach(function(x){x.classList.toggle('active',x.dataset.tab===t);});
  var g=_apGroupOf(t);
  if(g){
    _apLast[g]=t;
    Object.keys(_AP_GROUPS).forEach(function(g2){
      var sg=document.getElementById('sg-'+g2);if(sg)sg.style.display=g2===g?'flex':'none';
    });
    document.querySelectorAll('.atab[data-group]').forEach(function(x){x.classList.toggle('active',x.dataset.group===g);});
  }
  if(t==='usuarios')loadUsers();
  if(t==='dashboard')loadStats();
  if(t==='subir')loadUploadHistory();
  if(t==='registros')loadRegistros();
  if(t==='cashback'){var _cbh=document.getElementById('cashback-list');if(_cbh&&!_cbh.children.length)_cbh.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Cargando...</p>';loadCashback(true,renderCashbackAdmin);}
  if(t==='facultades')loadFacultades(true,renderFacultades);
  if(t==='varios')renderPadronAdmin(true);
  if(t==='asesores')renderAsesoresAdmin(true);
  if(t==='padronotros')loadPadronOtrosUsers(false);
  if(t==='padronlog')loadPadronLog();
  if(t==='legales'){
    _legalesRender();
    _FG_OPTS.forEach(function(o){loadGlobalLegal(true,o);_attachLegalPaste(_glegalId(o));});
  }
  if(t==='opciones')renderOpcionesAdmin(true);
}
// Click en un pilar (Admin/Data/Config): va a la última hoja vista de ese pilar.
function switchAdminGroup(el,g){
  switchAdminTab(null,_apLast[g]||_AP_GROUPS[g][0]);
}

// ── FACULTADES: qué funcionalidades tiene cada rol (editable desde el panel) ───
// Antes cada funcionalidad estaba cableada al rol en el código. Ahora la matriz
// vive en la nube y el admin la edita en Admin → Facultades. El admin mismo no
// pasa por la matriz: ve todo, salvo lo que se destilde en su columna "Vos"
// (ver _facMe más abajo).
// OJO: esto gobierna la INTERFAZ (qué botones ve cada uno), no es una barrera de
// seguridad: crear/borrar usuarios lo valida la Edge Function y escribir la
// configuración global lo restringen las policies de storage, ambas sólo admin.
var FACULTADES_FILE='_facultades.json',_facLoaded=false,_FAC=null,_myRole='asesor';
// El admin no usa la matriz por rol: tiene todo, salvo lo que ÉL MISMO se
// destilde en la columna "Vos" (profiles.facultades, por cuenta: lo que se saque
// un admin no afecta al otro). null o clave ausente = habilitada, así una
// facultad nueva arranca prendida. Nunca gobierna el acceso al panel (eso es
// _admin/_adminNow), sólo qué ve en el armador.
var _myFac=null;
function _facMe(f){
  if(!_myFac||_myFac[f]===undefined||_myFac[f]===null)return true;
  return !!_myFac[f];
}
// Los defaults reproducen EXACTAMENTE el comportamiento previo a esta pantalla:
// asesor sin nada, VIP con notas + asesores guardados. Si el archivo todavía no
// existe en la nube, nadie nota ningún cambio.
var _FAC_DEF={
  asesor:{padron_buscar:false,pegar_oficial:false,notas:false,asesores_guardados:false,promos_buscar:false,tutorial_auto:false,guardar_trabajo:false},
  vip:   {padron_buscar:false,pegar_oficial:false,notas:true, asesores_guardados:true, promos_buscar:false,tutorial_auto:false,guardar_trabajo:false},
  pro:   {padron_buscar:false,pegar_oficial:false,notas:true, asesores_guardados:true, promos_buscar:false,tutorial_auto:false,guardar_trabajo:false}
};
// Las opciones del armador son UNA FACULTAD CADA UNA (opcion_1, opcion_2, ...),
// así se puede dar sólo algunas. Se generan desde _FG_OPTS en tiempo de ejecución:
// cuando se sume una Opción 4, su fila aparece sola en la pantalla.
function _facOptList(){return (typeof _FG_OPTS!=='undefined'&&_FG_OPTS.length)?_FG_OPTS:[1,2,3];}
// Default de las opciones: hoy todos ven la Opción 1 y nadie más puede cambiarla.
function _facDefault(role,key){
  if(key.indexOf('opcion_')===0)return key==='opcion_1';
  return !!((_FAC_DEF[role]||{})[key]);
}
// Filas de la pantalla, en orden.
function _facRows(){
  var rows=[
    ['padron_buscar','Base de datos: mis empresas','Le da <strong>su propia lista privada de empresas</strong> (su nombre &rarr; Base de datos): carga las suyas y las busca con la lupa por raz&oacute;n social o CUIT. <strong>Nadie m&aacute;s puede ver ni editar lo que cargue</strong>; vos s&iacute; pod&eacute;s consultarlo desde Data &rarr; Empresas por usuario.'],
    ['pegar_oficial','Pegar datos del oficial','Bot&oacute;n "Pegar" en cada bloque de asesor: saca nombre, celular y mail de un texto copiado.']
  ];
  _facOptList().forEach(function(o){
    var enRubros=_optSolapa(o)==='rubros';
    rows.push(['opcion_'+o,'Ver &laquo;'+_escHtml(_optLabel(o))+'&raquo; (opci&oacute;n '+o+(enRubros?', solapa Flyer Rubros':'')+')',
      'Habilita ese armador (flyer + legal propios; se administra en Config &rarr; Opciones). El selector aparece s&oacute;lo si tiene m&aacute;s de una habilitada.'+
      (enRubros?' Con al menos una opci&oacute;n de Rubros habilitada, el perfil ve la solapa <strong>Flyer Rubros</strong> en el header.':'')]);
  });
  rows.push(['notas','Bloc de notas','&Iacute;tem "Bloc de notas" en el men&uacute; del usuario.']);
  rows.push(['asesores_guardados','Base de datos: mis asesores','Permite guardar asesores predeterminados y cargarlos con un click desde los t&iacute;tulos "Asesor 1..4". Desde su nombre &rarr; <strong>Base de datos &rarr; Mis asesores</strong> los ve, los corrige, los sube por Excel o se los baja. La lista viaja con su cuenta (la ve desde cualquier computadora) y es privada.']);
  rows.push(['promos_buscar','Buscador de promociones','Agrega la pesta&ntilde;a "Promociones": pega las marcas del flyer y las cruza contra el buscador oficial de Galicia, con logo, fechas de vigencia y estado (vigente / vence este mes / vencida).']);
  rows.push(['guardar_trabajo','Guardar historial y borrador','El <strong>Historial</strong> queda guardado en el dispositivo (hoy se borra al cerrar o recargar la p&aacute;gina) y el formulario se guarda solo mientras escribe: si cierra la pesta&ntilde;a a mitad de un flyer, al volver le ofrece <em>&laquo;Seguir con ese flyer&raquo;</em>. Todo vive en su navegador, nada sale a la nube.']);
  rows.push(['tutorial_auto','Tutorial al primer ingreso','La primera vez que entra, se le abre solo el recorrido guiado por el armador (flechas sobre cada bot&oacute;n, por cap&iacute;tulos, se puede omitir). Siempre puede repetirlo desde su nombre &rarr; "Ver tutorial". Para verlo vos antes de activarlo: tu nombre &rarr; Ver tutorial.']);
  return rows;
}
var _FAC_ROLES=[['asesor','Asesor'],['vip','VIP'],['pro','Pro']];
// Mezcla lo guardado sobre los defaults: así una facultad NUEVA agregada más
// adelante arranca con un valor sano aunque el JSON viejo no la tenga.
function _facMerge(saved){
  var out={};
  _FAC_ROLES.forEach(function(r){
    var role=r[0],got=(saved&&saved[role])||{};
    out[role]={};
    _facRows().forEach(function(f){
      out[role][f[0]]=(got[f[0]]===undefined)?_facDefault(role,f[0]):!!got[f[0]];
    });
  });
  return out;
}
// Siempre después de la lista de opciones: la matriz tiene una fila por opción.
function loadFacultades(force,cb){
  loadOpciones(false,function(){_loadFacultadesRaw(force,cb);});
}
function _loadFacultadesRaw(force,cb){
  if(_facLoaded&&!force){if(cb)cb();return;}
  fetch(FLYERS_PUBLIC+FACULTADES_FILE+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      _FAC=_facMerge(d&&d.roles);
      _facLoaded=true;
      if(cb)cb();
    }).catch(function(){_FAC=_facMerge(null);_facLoaded=true;if(cb)cb();});
}
function saveFacultades(roles,cb){
  var meta=JSON.stringify({roles:roles,updated_at:new Date().toISOString()});
  return _sb.storage.from('flyers')
    .upload(FACULTADES_FILE,new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){
      if(r&&r.error){showToast('Error al guardar las facultades: '+r.error.message);if(cb)cb(false);return;}
      _FAC=_facMerge(roles);_facLoaded=true;
      if(cb)cb(true);
    });
}
// ── VISTA PREVIA: ver la app como la ve otro perfil ──────────────────────────
// _simRole no es null mientras el admin está simulando. Mientras dura, _can deja
// de darle el bypass de admin: ve exactamente lo que vería ese perfil.
var _simRole=null;
function _can(f){
  if(_simRole)return !!((_FAC&&_FAC[_simRole]||{})[f]);
  if(_admin)return _facMe(f); // todo, menos lo que se destildó a sí mismo
  return !!((_FAC&&_FAC[_myRole]||{})[f]);
}
// "¿Es admin AHORA?" — false mientras se simula, para que la vista previa sea fiel.
function _adminNow(){return _admin&&!_simRole;}
// Opciones del armador habilitadas para el rol vigente.
function _facOpts(){return _facOptList().filter(function(o){return _can('opcion_'+o);});}
// Idem, pero sólo las de una solapa del header ('flyer' | 'rubros').
function _facOptsDe(solapa){return _facOpts().filter(function(o){return _optSolapa(o)===solapa;});}

// Aplica el gating de la interfaz. Es BIDIRECCIONAL (muestra y oculta) y seguro
// de repetir: hace falta así para que al quitar una facultad desaparezca sin
// recargar, y para que la vista previa pueda entrar y salir.
function _applyFacultades(){
  var dp=document.getElementById('hdr-dd-pass');if(dp)dp.style.display=_adminNow()?'none':'flex';
  var ab=document.getElementById('hdr-admin-btn');if(ab)ab.style.display=_adminNow()?'inline-flex':'none';
  var dn=document.getElementById('hdr-dd-notes');if(dn)dn.style.display=_can('notas')?'flex':'none';

  if(_can('asesores_guardados')){_initAsesoresUI();_loadAsesores();} // trae la lista de la nube una vez
  _facShowAsesores(_can('asesores_guardados'));

  if(_can('pegar_oficial'))_fgEnsurePasteBtns();
  _facShowPaste(_can('pegar_oficial'));

  if(_can('padron_buscar'))_fgEnsurePadronBtn();
  var pb=document.getElementById('fg-pad-btn');if(pb)pb.style.display=_can('padron_buscar')?'':'none';
  // "Base de datos" en el menú del nombre: adentro están Mis empresas (facultad
  // padron_buscar: subir Excel, editar en línea, generar) y Mis asesores
  // (asesores_guardados). Alcanza con UNA para que el ítem aparezca; _bdSync
  // decide qué solapas se ven y cierra la pantalla si no queda ninguna.
  var dpad=document.getElementById('hdr-dd-padron');
  if(dpad)dpad.style.display=(_can('padron_buscar')||_can('asesores_guardados'))?'flex':'none';
  _bdSync();
  _mpRefresh(); // tarjeta "todo el segmento" del masivo (sólo con empresas cargadas)

  _fgWorkApply(_can('guardar_trabajo')); // historial persistente + borrador automático

  _facSyncOptBar();

  // Solapa "Flyer Rubros": no tiene facultad propia, se ve si el perfil tiene
  // habilitada al menos una opción de esa solapa (opcion_N en Facultades).
  var rtab=document.getElementById('apptab-rubros');
  if(rtab){
    var hayRubros=_facOptsDe('rubros').length>0;
    rtab.style.display=hayRubros?'':'none';
    if(!hayRubros&&rtab.classList.contains('active')&&typeof switchApp==='function')switchApp('flyer');
  }

  // Solapa de primer nivel "Promociones": si el perfil pierde la facultad
  // estando parado ahí (o durante la vista previa de otro rol), lo vuelve a
  // la vista del flyer.
  var canPromos=_can('promos_buscar');
  var atab=document.getElementById('apptab-promos');
  if(atab){
    atab.style.display=canPromos?'':'none';
    if(!canPromos&&atab.classList.contains('active')&&typeof switchApp==='function')switchApp('flyer');
  }
}

// Solapas de primer nivel del header: "Flyer Galicia" y "Flyer Rubros" (las dos
// usan el MISMO layout/armador: cambia qué opciones lista la barra y si se ven
// los campos del beneficio) y "Promociones" (vista propia, gateada por la
// facultad promos_buscar).
function switchApp(view){
  var lay=document.getElementById('layout'),pv=document.getElementById('view-promos');
  if(view==='promos'&&!_can('promos_buscar'))view='flyer'; // por si lo llaman sin permiso
  if(view==='rubros'&&!_facOptsDe('rubros').length)view='flyer';
  var arm=(view==='flyer'||view==='rubros');
  if(lay)lay.style.display=arm?'grid':'none';
  if(pv)pv.style.display=(view==='promos')?'grid':'none';
  var tp=document.getElementById('apptab-promos');if(tp)tp.classList.toggle('active',view==='promos');
  if(view==='promos'){
    ['apptab-flyer','apptab-rubros'].forEach(function(id){var t=document.getElementById(id);if(t)t.classList.remove('active');});
    if(typeof initPromosTab==='function')initPromosTab();
    return;
  }
  // Armador: si la opción activa no es de esta solapa, paso a la última que usé
  // en ella (o a la primera habilitada). switchFlyerOption → _fgSyncVista marca
  // la solapa y rearma la barra.
  if(_optSolapa(_fgOpt)!==view){
    var opts=_facOptsDe(view),ult=_fgUltOpt[view];
    if(opts.length){switchFlyerOption(opts.indexOf(ult)>=0?ult:opts[0]);return;}
  }
  _fgSyncVista();
}
// Última opción usada en cada solapa, para volver a la misma al cambiar de solapa.
var _fgUltOpt={flyer:1,rubros:null};
// Deja la interfaz acorde a la opción activa: solapa del header marcada, barra
// de opciones de ESA solapa, campos del beneficio visibles sólo en Rubros.
function _fgSyncVista(){
  var v=_optSolapa(_fgOpt),cambio=(v!==_fgVista);
  _fgVista=v;_fgUltOpt[v]=_optN(_fgOpt);
  var tf=document.getElementById('apptab-flyer'),tr=document.getElementById('apptab-rubros'),tp=document.getElementById('apptab-promos');
  var lay=document.getElementById('layout'),enArmador=!!(lay&&lay.style.display==='grid');
  if(enArmador){
    if(tf)tf.classList.toggle('active',v==='flyer');
    if(tr)tr.classList.toggle('active',v==='rubros');
    if(tp)tp.classList.remove('active');
  }
  if(cambio)_facSyncOptBar();else _fgRenderOptBar();
  var bf=document.getElementById('fg-benef-fields');if(bf)bf.style.display=(v==='rubros')?'':'none';
  if(typeof _mpRefresh==='function'&&_facLoaded)_mpRefresh(); // la tarjeta del masivo sigue a la opción activa
  if(v==='rubros'&&typeof _fgBenefSyncNombre==='function'){_fgBenefSyncNombre();_fgBenefFieldsSync();}
}
// Los títulos "Asesor 1..4" quedan clickeables o no. El listener ya está puesto,
// pero openAsPop revalida la facultad, así que alcanza con el cambio visual.
function _facShowAsesores(on){
  var secs=document.querySelectorAll('#tab-individual .sec');
  Array.prototype.forEach.call(secs,function(sec){
    if(!sec.dataset.asLinked)return;
    sec.classList.toggle('sec-clickable',!!on);
    var c=sec.querySelector('.sec-caret');if(c)c.style.display=on?'':'none';
  });
}
function _facShowPaste(on){
  for(var n=1;n<=4;n++){
    var b=document.getElementById('fg-paste-btn-'+n);if(b)b.style.display=on?'':'none';
    if(!on){var w=document.getElementById('fg-paste-'+n);if(w)w.style.display='none';}
  }
}
// La barra de opciones depende de CUÁLES tiene habilitadas, así que se reconstruye.
// Se muestra sólo si hay más de una: con una sola no hay nada que elegir.
function _facSyncOptBar(){
  var bar=document.getElementById('fg-optbar');
  if(bar&&bar.parentNode)bar.parentNode.removeChild(bar);
  // La barra lista sólo las opciones de la solapa a la vista (Flyer Galicia o Flyer Rubros).
  var opts=_facOptsDe(_fgVista);
  if(opts.length>1)_fgEnsureOptBar();
  // Si quedó parado en una opción que este perfil no tiene, lo muevo a la primera
  // que sí (de la misma solapa; si la solapa quedó vacía, a cualquiera habilitada,
  // y _fgSyncVista cambia de solapa). Sólo con la app ya visible, para no pisar
  // la carga inicial del flyer.
  var lay=document.getElementById('layout');
  if(!lay||lay.style.display!=='grid')return;
  var cur=_optN(_fgOpt);
  if(opts.length){if(opts.indexOf(cur)<0)switchFlyerOption(opts[0]);}
  else{var todas=_facOpts();if(todas.length&&todas.indexOf(cur)<0)switchFlyerOption(todas[0]);}
}
// Entra/sale de la vista previa de un perfil.
function startFacSim(role){
  if(!_admin)return;
  _simRole=role;
  closeAdminPanel();
  _facSimBar();
  _applyFacultades();
  showToast('Vista previa: estás viendo la app como '+(_ROLE_LBL[role]||role));
}
function stopFacSim(){
  _simRole=null;
  _facSimBar();
  _applyFacultades();
}
function _facSimBar(){
  var b=document.getElementById('fac-simbar');
  if(!_simRole){if(b&&b.parentNode)b.parentNode.removeChild(b);return;}
  if(!b){
    b=document.createElement('div');b.id='fac-simbar';
    document.body.appendChild(b);
  }
  b.innerHTML='<span>Vista previa: <strong>'+_escHtml(_ROLE_LBL[_simRole]||_simRole)+'</strong>. '+
    'As&iacute; ve la app este perfil.</span>'+
    '<button onclick="stopFacSim()">Salir de la vista previa</button>';
}

// Panel admin → Admin → Facultades. Trabaja sobre una copia (_facEdit) y sólo
// pega a la nube cuando se toca "Guardar cambios".
var _facEdit=null,_facEditMe=null;
function renderFacultades(){
  if(typeof _padEditStyle==='function')_padEditStyle(); // reutiliza el estilo de tarjeta (.pad-erow)
  var host=document.getElementById('fac-grid');if(!host)return;
  _facEdit=_facMerge(_FAC);
  // Copia editable de la columna "Vos": todas las claves explícitas, para que
  // lo guardado en profiles.facultades sea completo y legible.
  _facEditMe={};
  _facRows().forEach(function(f){_facEditMe[f[0]]=_facMe(f[0]);});
  var cols='1.7fr repeat('+(_FAC_ROLES.length+1)+',minmax(64px,.6fr))';
  // Los títulos de perfil son botones: abren la vista previa de ese perfil.
  var head='<div class="fac-row fac-head" style="grid-template-columns:'+cols+'">'+
    '<div>Funcionalidad</div><div title="Tu propia cuenta: lo que destildes ac&aacute; no afecta al otro administrador">Vos<br><span style="font-weight:400;font-size:.62rem;opacity:.7">(tu cuenta)</span></div>'+
    _FAC_ROLES.map(function(r){
      return '<div><span class="fac-sim" onclick="startFacSim(\''+r[0]+'\')" '+
        'title="Ver la app como la ve un '+_escAttr(r[1])+'">'+_escHtml(r[1])+' <span class="fac-eye">&#128065;</span></span></div>';
    }).join('')+'</div>';
  var rows=_facRows().map(function(f){
    var id=f[0];
    // El tutorial automático nunca corre para el admin (_tourAutoStart corta
    // por _adminNow): en su columna no hay nada que decidir.
    var meCell=(id==='tutorial_auto')
      ?'<div title="No aplica al administrador: pod&eacute;s verlo desde tu nombre &rarr; Ver tutorial" style="color:var(--gray)">&mdash;</div>'
      :'<div><input type="checkbox"'+(_facEditMe[id]?' checked':'')+' onchange="_facFieldMe(\''+id+'\',this)"></div>';
    return '<div class="fac-row" style="grid-template-columns:'+cols+'">'+
      '<div><div class="fac-name">'+f[1]+'</div><div class="fac-desc">'+f[2]+'</div></div>'+
      meCell+
      _FAC_ROLES.map(function(r){
        var on=_facEdit[r[0]]&&_facEdit[r[0]][id];
        return '<div><input type="checkbox"'+(on?' checked':'')+
          ' onchange="_facField(\''+r[0]+'\',\''+id+'\',this.checked)"></div>';
      }).join('')+
    '</div>';
  }).join('');
  host.innerHTML='<div class="fac-grid">'+head+rows+'</div>';
}
function _facField(role,f,v){if(_facEdit&&_facEdit[role])_facEdit[role][f]=!!v;}
// Columna "Vos". No deja quedarse sin ninguna opción del armador: sin opciones
// no habría flyer que armar.
function _facFieldMe(f,cb){
  if(!_facEditMe)return;
  var v=!!cb.checked;
  if(!v&&f.indexOf('opcion_')===0){
    var quedan=_facOptList().filter(function(o){return 'opcion_'+o!==f&&_facEditMe['opcion_'+o];});
    if(!quedan.length){cb.checked=true;showToast('Dejá al menos una opción del armador habilitada.');return;}
  }
  _facEditMe[f]=v;
}
function saveFacultadesChanges(){
  if(!_facEdit)return;
  var btn=document.getElementById('fac-save');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  var me=_facEditMe;
  saveFacultades(_facEdit,function(ok){
    if(!ok){if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}return;}
    // Segundo paso: la columna "Vos" va al perfil propio (RLS: sólo la fila propia).
    _sb.from('profiles').update({facultades:me}).eq('id',_me.id).then(function(r){
      if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
      if(r&&r.error){showToast('Los perfiles se guardaron, pero tu columna "Vos" no: '+r.error.message);return;}
      _myFac=me;
      showToast('Facultades actualizadas');
      _applyFacultades(); // que el propio admin vea el efecto sin recargar
    });
  });
}

// ── BUSCADOR DE PROMOCIONES ──────────────────────────────────────────────────
// Pega las marcas del flyer, las cruza contra una copia local del catálogo
// oficial de Galicia (tabla promos_galicia_cache, sincronizada por la Edge
// Function promos-galicia) y arma un reporte de vigencia con logo, fechas y
// estado, exportable a Excel.
//
// El catálogo completo (~1700 promos) se trae una sola vez a memoria al abrir
// la pestaña y el matching corre en el cliente; sólo se le pide a la Edge
// Function la fechaDesde (que no viene en el listado) de las marcas que sí
// matchearon, para no pagar ese costo por las 1700.
var PROMO_LOGO_BASE='https://www.galicia.ar/content/dam/galicia/banco-galicia/personas/promociones/catalogo-de-beneficios/';
var _promosCat=null,_promosCatLoading=false,_promosResultados=null,_promosMesRef=null;

// Primera vez que se entra a la pestaña: pone el mes actual por default y
// dispara la carga del catálogo (que a su vez sincroniza sola si está vieja).
function initPromosTab(){
  var mesInp=document.getElementById('promos-mes');
  if(mesInp&&!mesInp.value){
    var d=new Date();
    mesInp.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  if(!_promosCat&&!_promosCatLoading)loadPromosCatalogo();
}

function _promosFmtFecha(iso){
  if(!iso)return '-';
  var p=String(iso).slice(0,10).split('-');
  return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):iso;
}
function _promosSetSyncInfo(meta){
  var el=document.getElementById('promos-sync-info');if(!el)return;
  if(!meta||!meta.last_sync_at){
    el.textContent='Catálogo todavía no sincronizado. Se va a actualizar solo.';
    return;
  }
  var d=new Date(meta.last_sync_at);
  el.textContent='Catálogo actualizado: '+d.toLocaleDateString('es-AR')+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})+
    ' — '+(meta.total||0)+' promociones.';
}

// Trae el catálogo completo a memoria + la metadata de sincronización. Si la
// copia tiene más de 26hs (o nunca se sincronizó), dispara un sync solo antes
// de mostrar nada, así el asesor no tiene que acordarse de apretar "Actualizar".
// PostgREST corta cada consulta en 1000 filas. El catálogo tiene ~1700, así
// que una sola select devolvía apenas las primeras 1000 y TODA marca que
// cayera más abajo (SushiClub, Starbucks, Freddo, Volta...) parecía "no
// existir". Por eso hay que traerlo por tandas hasta que una venga incompleta.
var _PROMOS_PAGINA=1000;
function _promosTraerTodo(desde,acc,cb){
  // El .order('id') es imprescindible: sin un orden estable, paginar con
  // .range() puede repetir o saltearse filas entre tandas.
  _sb.from('promos_galicia_cache')
    .select('id,titulo,subtitulo,imagen,fecha_hasta,tipo_promocion')
    .order('id',{ascending:true})
    .range(desde,desde+_PROMOS_PAGINA-1)
    .then(function(r){
      if(r&&r.error){cb(r.error,acc);return;}
      var filas=(r&&r.data)||[];
      acc=acc.concat(filas);
      // Si vino una tanda completa puede haber más; si vino corta, terminó.
      if(filas.length===_PROMOS_PAGINA)_promosTraerTodo(desde+_PROMOS_PAGINA,acc,cb);
      else cb(null,acc);
    })
    .catch(function(e){cb(e,acc);});
}

// Quienes esperan a que termine la carga en curso. Antes, si "Validar" se
// tocaba mientras initPromosTab ya estaba cargando (sin callback), el botón
// quedaba en "Cargando catálogo..." para siempre: nadie lo volvía a habilitar.
var _promosCatWaiters=[];
function _promosCatDone(){
  var ws=_promosCatWaiters;_promosCatWaiters=[];
  ws.forEach(function(f){try{f();}catch(e){console.error('promos waiter:',e);}});
}
function loadPromosCatalogo(cb){
  if(cb)_promosCatWaiters.push(cb);
  if(_promosCatLoading)return; // ya hay una carga en vuelo: se suma a la espera
  _promosCatLoading=true;
  Promise.all([
    new Promise(function(resolve){
      _promosTraerTodo(0,[],function(error,filas){resolve({data:filas,error:error});});
    }),
    _sb.from('promos_galicia_meta').select('last_sync_at,total').eq('id',1).single()
  ]).then(function(res){
    var catRes=res[0],metaRes=res[1];
    if(catRes&&catRes.error){
      console.error('promos_galicia_cache select:',catRes.error);
      showToast('No se pudo leer el catálogo de promociones: '+(catRes.error.message||catRes.error));
    }
    _promosCat=(catRes&&catRes.data)||[];
    var meta=metaRes&&metaRes.data;
    // RLS filtrando en silencio no cuenta como "error" de PostgREST: la fila
    // simplemente no vuelve. Si la metadata dice que hay catálogo pero la
    // select trajo 0, es casi seguro un problema de sesión/permisos, no que
    // el catálogo esté realmente vacío — se lo marca aparte para no confundirlo
    // con un "todavía no sincronizó nunca".
    if(!_promosCat.length&&meta&&meta.total>0&&!(catRes&&catRes.error)){
      console.error('promos_galicia_cache: la consulta no devolvió error pero trajo 0 filas, aunque meta dice total='+meta.total+'. Probable problema de sesión/RLS.');
      showToast('No se pudo leer el catálogo (0 resultados pero debería haber '+meta.total+'). Probá recargar la página o volver a iniciar sesión.');
    }
    // Aviso si llegó INCOMPLETO (fue exactamente este el bug del corte en 1000):
    // sin esto, la mitad del catálogo faltaba en silencio y las marcas de la cola
    // parecían no existir.
    else if(meta&&meta.total>0&&_promosCat.length<meta.total){
      console.error('Catálogo incompleto: llegaron '+_promosCat.length+' de '+meta.total+' promociones.');
      showToast('Atención: el catálogo llegó incompleto ('+_promosCat.length+' de '+meta.total+'). Puede que falten marcas.');
    }
    _promosSetSyncInfo(meta);
    _promosCatLoading=false;
    var vencida=!meta||!meta.last_sync_at||(Date.now()-new Date(meta.last_sync_at).getTime())>26*3600*1000;
    // Auto-sync si la copia está vieja o si nunca se sincronizó (catálogo
    // vacío y meta sin fecha). No se dispara cuando el vacío se explica por un
    // error o por RLS (meta dice que hay filas): ahí sincronizar no arregla nada.
    var nuncaSync=!_promosCat.length&&!(meta&&meta.total>0);
    if(!(catRes&&catRes.error)&&((vencida&&_promosCat.length)||nuncaSync)&&!_promosSyncing){syncPromosCatalogo(false);}
    _promosCatDone();
  }).catch(function(e){
    console.error('loadPromosCatalogo:',e);
    showToast('Error cargando el catálogo de promociones: '+((e&&e.message)||e));
    _promosCat=_promosCat||[];
    _promosCatLoading=false;
    _promosCatDone();
  });
}

// Un solo auto-sync por carga de página: si Galicia falla, la recarga del
// catálogo que sigue al sync no tiene que volver a disparar otro sync (loop).
var _promosSyncing=false,_promosAutoSynced=false;
function syncPromosCatalogo(manual){
  if(_promosSyncing)return;
  if(!manual){if(_promosAutoSynced)return;_promosAutoSynced=true;}
  _promosSyncing=true;
  var btn=document.getElementById('promos-sync-btn');
  if(btn){btn.disabled=true;btn.textContent='Sincronizando...';}
  _callPromosFn('sync',{},function(err,d){
    _promosSyncing=false;
    if(btn){btn.disabled=false;btn.textContent='↻ Actualizar catálogo ahora';}
    if(err){
      console.error('promos sync:',err);
      // Si es manual siempre avisa; si fue el auto-sync en segundo plano, avisa
      // igual cuando no hay NADA cargado (si no, el usuario se queda mirando un
      // catálogo vacío sin ninguna pista de por qué).
      if(manual||!_promosCat||!_promosCat.length)showToast('No se pudo actualizar el catálogo de promociones: '+err);
      return;
    }
    if(manual)showToast('Catálogo actualizado: '+((d&&d.data&&d.data.total)||0)+' promociones');
    loadPromosCatalogo();
  });
}

// ── Matching: marca del flyer -> promo del catálogo ─────────────────────────
// Galicia guarda algunos títulos con entidades HTML sin decodificar (ej. "Le
// Club Libros &amp; Música"). Se decodifican las comunes antes de comparar o
// mostrar; si no, "amp" quedaba colado como palabra en el normalizado y el
// nombre se veía mal en pantalla/Excel.
var _PROMO_ENTITIES={'&amp;':'&','&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&ntilde;':'ñ','&Ntilde;':'Ñ','&quot;':'"','&#39;':"'",'&apos;':"'"};
function _promoDecodeEntities(s){
  s=String(s||'');
  for(var k in _PROMO_ENTITIES)s=s.split(k).join(_PROMO_ENTITIES[k]);
  return s;
}
function _promoNormalizar(s){
  return _promoDecodeEntities(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'') // saca acentos (rango de marcas diacríticas combinantes)
    .replace(/['’´]/g,'') // saca apóstrofos sin dejar espacio (mcdonald's -> mcdonalds)
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function _promoTokens(s){return s.split(' ').filter(Boolean);}
// Igual que normalizar pero SIN espacios: el catálogo de Galicia escribe
// algunas marcas pegadas ("SushiClub") y el flyer las escribe separadas
// ("Sushi Club"). Comparando sin espacios las dos formas son la misma marca.
function _promoSinEspacios(s){return _promoNormalizar(s).replace(/ /g,'');}
// Palabras demasiado genéricas para sostener una coincidencia por sí solas:
// hay decenas de "Golf Club", "Niceto Club", "Hotel ...", y sin esta lista
// "Sushi Club" se colgaba de cualquiera de ellas y devolvía una marca ajena.
var _PROMO_STOPWORDS=['club','hotel','bar','rest','resto','restaurant','restaurante','cafe','coffee','golf','casa','shop','store','tienda','centro','center','grupo','argentino','argentina','sede','local','espacio','salon','studio','store'];
function _promoEsGenerica(t){return _PROMO_STOPWORDS.indexOf(t)>=0;}
// Busca candidatos de una marca en el catálogo, con un puntaje de confianza.
// Devuelve como mucho un candidato por título único (una marca puede tener
// varias promos, una por tarjeta: no son "candidatos distintos" compitiendo).
function _promoBuscarCandidatos(marca,catalogo){
  var nMarca=_promoNormalizar(marca),tokensMarca=_promoTokens(nMarca);
  var sinEspMarca=_promoSinEspacios(marca);
  var scored=catalogo.map(function(p){
    var nTitulo=_promoNormalizar(p.titulo),tokensTitulo=_promoTokens(nTitulo),score=0;
    var sinEspTitulo=_promoSinEspacios(p.titulo);
    if(nTitulo===nMarca)score=100;
    // "SushiClub" == "Sushi Club": misma marca escrita distinto.
    else if(sinEspMarca&&sinEspMarca===sinEspTitulo)score=95;
    else if(tokensMarca.length>1&&tokensMarca.every(function(t){return tokensTitulo.indexOf(t)>=0;}))score=85;
    else if(tokensTitulo.length>1&&tokensTitulo.every(function(t){return tokensMarca.indexOf(t)>=0;}))score=80;
    else if(tokensMarca.length===1&&tokensTitulo[0]&&tokensTitulo[0]===tokensMarca[0])score=75;
    // Uno contiene al otro ignorando espacios ("Starbucks" en "StarbucksCoffee").
    // Se pide un mínimo de 5 caracteres para no pescar coincidencias casuales.
    else if(sinEspMarca.length>=5&&sinEspTitulo.indexOf(sinEspMarca)>=0)score=70;
    else if(sinEspTitulo.length>=5&&sinEspMarca.indexOf(sinEspTitulo)>=0)score=65;
    else{
      // palabra completa compartida (min 4 letras y que no sea genérica)
      var compartidas=tokensMarca.filter(function(t){
        return t.length>=4&&!_promoEsGenerica(t)&&tokensTitulo.indexOf(t)>=0;
      });
      if(compartidas.length>1)score=55;       // dos o más palabras propias en común
      else if(compartidas.length===1)score=40; // una sola: sugerencia débil, va a "revisar"
    }
    return{promo:p,score:score};
  }).filter(function(c){return c.score>0;});
  var porTitulo={};
  scored.forEach(function(c){
    var key=_promoNormalizar(c.promo.titulo);
    var actual=porTitulo[key];
    if(!actual||c.score>actual.score||(c.score===actual.score&&(c.promo.fecha_hasta||'')>(actual.promo.fecha_hasta||'')))porTitulo[key]=c;
  });
  var out=[];for(var k in porTitulo)out.push(porTitulo[k]);
  out.sort(function(a,b){return b.score-a.score;});
  return out;
}
function _promoEstado(fechaHasta,mesRef){
  if(!fechaHasta)return 'SIN_FECHA';
  var fin=new Date(fechaHasta+'T23:59:59');
  var finDelMes=new Date(mesRef.getFullYear(),mesRef.getMonth()+1,0,23,59,59);
  if(fin<mesRef)return 'VENCIDA';
  if(fin<=finDelMes)return 'VENCE_ESTE_MES';
  return 'VIGENTE';
}
var _PROMO_ESTADO_LBL={VIGENTE:'Vigente',VENCE_ESTE_MES:'Vence este mes',VENCIDA:'Vencida',REVISAR:'Revisar',NO_ENCONTRADA:'No encontrada',SIN_FECHA:'Sin fecha informada'};
var _PROMO_ESTADO_CSS={VIGENTE:'vigente',VENCE_ESTE_MES:'vence',VENCIDA:'vencida',REVISAR:'revisar',NO_ENCONTRADA:'no',SIN_FECHA:'no'};

// Reintento pendiente: si el catálogo no estaba listo cuando tocaron
// "Validar", en vez de obligar a acordarse de tocarlo de nuevo, valida sola
// apenas termina de cargar. Sin esto, cualquier marca (no importa cuál)
// podía "no encontrarse" simplemente por haber llegado un poco rápido.
var _promosValidarPendiente=false;
function _promosValidarBtn(){return document.getElementById('promos-validar-btn');}
function validarPromos(){
  var raw=(document.getElementById('promos-marcas').value||'').split('\n').map(function(s){return s.trim();}).filter(Boolean);
  if(!raw.length){showToast('Pegá al menos una marca');return;}
  if(!_promosCat||!_promosCat.length){
    var btn=_promosValidarBtn();
    if(_promosValidarPendiente)return; // ya hay un reintento encolado
    _promosValidarPendiente=true;
    if(btn){btn.disabled=true;btn.textContent='Cargando catálogo...';}
    // loadPromosCatalogo encola el callback aunque ya haya una carga en vuelo,
    // así el botón siempre se vuelve a habilitar.
    loadPromosCatalogo(function(){
      _promosValidarPendiente=false;
      if(btn){btn.disabled=false;btn.textContent='🔍 Validar vigencia';}
      if(_promosCat&&_promosCat.length){validarPromos();return;}
      // Vacío de verdad (nunca sincronizado y el auto-sync no pudo): el remedio
      // es sincronizar, no recargar la página.
      if(_promosSyncing)showToast('El catálogo se está sincronizando por primera vez; volvé a tocar Validar en unos segundos.');
      else showToast('El catálogo de promociones está vacío. Tocá "Actualizar catálogo ahora" y volvé a validar.');
    });
    return;
  }
  _promosValidarPendiente=false;
  var mesVal=document.getElementById('promos-mes').value;
  var mesRef=mesVal?new Date(parseInt(mesVal.slice(0,4),10),parseInt(mesVal.slice(5,7),10)-1,1):new Date();
  _promosMesRef=mesRef;

  var resultados=raw.map(function(marca){
    var candidatos=_promoBuscarCandidatos(marca,_promosCat);
    if(!candidatos.length)return{marca:marca,estado:'NO_ENCONTRADA',promo:null,candidatos:[],excluir:false};
    var mejor=candidatos[0];
    var ambiguo=candidatos.length>1&&candidatos[1].score>=75&&candidatos[1].score>=mejor.score-10;
    var debil=mejor.score<75;
    var necesitaRevision=ambiguo||debil;
    return{
      marca:marca,
      estado:necesitaRevision?'REVISAR':_promoEstado(mejor.promo.fecha_hasta,mesRef),
      promo:mejor.promo,
      candidatos:candidatos.slice(0,5),
      necesitaRevision:necesitaRevision,
      excluir:false
    };
  });

  _promosResultados=resultados;
  // Filtros en cero: si quedaban de la validación anterior, esconderían parte
  // de los resultados nuevos y parecería que "faltan" marcas. El orden también
  // vuelve al natural (el de la lista recién pegada).
  for(var k in _promosFiltros)_promosFiltros[k]='';
  _promosOrden={campo:'',dir:1};
  var _bq=document.getElementById('promos-buscar');if(_bq)_bq.value='';
  renderPromosResultados();

  // Aviso proactivo: el nombre del flyer y el del catálogo no siempre coinciden
  // ("Sushi Club" vs "SushiClub", "Alta Volta" vs "Volta"). Si algo quedó dudoso
  // o sin encontrar, se avisa con la propuesta ("Alta Volta → ¿Volta?") en vez de
  // esperar que lo descubra mirando la tabla fila por fila.
  var aRevisar=resultados.filter(function(r){return r.necesitaRevision;});
  var noHallada=resultados.filter(function(r){return r.estado==='NO_ENCONTRADA';});
  if(aRevisar.length||noHallada.length){
    var partes=[];
    if(aRevisar.length){
      partes.push(aRevisar.length+' para revisar: '+aRevisar.slice(0,3).map(function(r){
        return r.marca+' → ¿'+_promoDecodeEntities(r.promo?r.promo.titulo:'?')+'?';
      }).join(', ')+(aRevisar.length>3?'...':''));
    }
    if(noHallada.length){
      partes.push(noHallada.length+' sin coincidencia: '+noHallada.slice(0,4).map(function(r){return r.marca;}).join(', ')+(noHallada.length>4?'...':''));
    }
    showToast(partes.join(' · '));
  }

  // Pide fechaDesde (no viene en el listado) sólo de los matches confirmados,
  // que son los que se van a mostrar como certeros.
  var ids=resultados.filter(function(r){return r.promo&&!r.necesitaRevision;}).map(function(r){return r.promo.id;});
  if(ids.length)_promosPedirDetalle(ids,resultados);
}

// La Edge Function atiende hasta 80 ids por llamada (protege a Galicia de una
// ráfaga): un flyer con más marcas confirmadas va en tandas, una tras otra, y
// la columna "Desde" se va completando. Si una tanda falla se avisa (antes sólo
// quedaba un "-" en la columna, sin ninguna pista).
var _PROMOS_DETALLE_LOTE=80;
function _promosPedirDetalle(ids,resultados){
  var falló=false;
  function tanda(desde){
    if(desde>=ids.length){
      if(falló)showToast('No se pudo traer la fecha "Desde" de algunas promociones (la columna queda con "-").');
      return;
    }
    _callPromosFn('detalle',{ids:ids.slice(desde,desde+_PROMOS_DETALLE_LOTE)},function(err,d){
      if(err||!d||!d.data){console.error('promos detalle:',err||d);falló=true;}
      else{
        resultados.forEach(function(r){
          if(r.promo&&d.data[r.promo.id]!==undefined)r.fechaDesde=d.data[r.promo.id];
        });
        if(_promosResultados===resultados)renderPromosResultados();
      }
      tanda(desde+_PROMOS_DETALLE_LOTE);
    });
  }
  tanda(0);
}

// El usuario elige a mano un candidato (o "ninguna coincide") para una fila
// ambigua/débil. sel es el índice en r.candidatos, o -1.
function _promoElegirCandidato(i,sel){
  var r=_promosResultados&&_promosResultados[i];if(!r)return;
  sel=parseInt(sel,10);
  if(sel<0||!r.candidatos[sel]){
    r.promo=null;r.estado='NO_ENCONTRADA';r.necesitaRevision=false;r.fechaDesde=null;
  }else{
    r.promo=r.candidatos[sel].promo;
    r.necesitaRevision=false;
    r.estado=_promoEstado(r.promo.fecha_hasta,_promosMesRef||new Date());
    r.fechaDesde=null;
    // el detalle (fechaDesde) de esta única fila recién confirmada
    _callPromosFn('detalle',{ids:[r.promo.id]},function(err,d){
      if(!err&&d&&d.data&&d.data[r.promo.id]!==undefined){r.fechaDesde=d.data[r.promo.id];renderPromosResultados();}
    });
  }
  renderPromosResultados();
}
function _promoToggleExcluir(i,on){
  var r=_promosResultados&&_promosResultados[i];if(!r)return;
  r.excluir=!!on;
  renderPromosResultados();
}

// ── Filtros de la tabla de resultados ───────────────────────────────────────
// Estado de los filtros: uno por columna + el buscador general de arriba a la
// derecha (busca en marca, coincidencia y categoría a la vez).
var _promosFiltros={global:'',logo:'',marca:'',match:'',cat:'',desde:'',hasta:'',estado:''};
function _promoHayFiltros(){
  for(var k in _promosFiltros)if(_promosFiltros[k])return true;
  return false;
}
function _promoFiltrar(campo,valor){
  _promosFiltros[campo]=valor||'';
  _promosPintarFilas(); // sólo repinta el cuerpo: no pierde el foco del input
}
function _promoLimpiarFiltros(){
  for(var k in _promosFiltros)_promosFiltros[k]='';
  var b=document.getElementById('promos-buscar');if(b)b.value='';
  renderPromosResultados();
}
// Texto de cada campo tal como se ve en pantalla (para que filtrar por lo que
// se lee funcione, incluyendo fechas en formato dd/mm/aaaa).
function _promoCampos(r){
  return {
    marca:r.marca||'',
    match:r.promo?_promoDecodeEntities(r.promo.titulo||''):'',
    cat:r.promo?_promoDecodeEntities(r.promo.subtitulo||''):'',
    desde:r.promo?_promosFmtFecha(r.fechaDesde):'',
    hasta:r.promo?_promosFmtFecha(r.promo.fecha_hasta):'',
    estado:r.estado||'',
    tieneLogo:!!(r.promo&&r.promo.imagen)
  };
}
function _promoCoincideFiltro(r){
  var f=_promosFiltros,c=_promoCampos(r);
  function contiene(txt,q){return !q||String(txt).toLowerCase().indexOf(String(q).toLowerCase())>=0;}
  if(f.logo==='con'&&!c.tieneLogo)return false;
  if(f.logo==='sin'&&c.tieneLogo)return false;
  if(!contiene(c.marca,f.marca))return false;
  if(!contiene(c.match,f.match))return false;
  if(f.cat&&c.cat!==f.cat)return false;
  if(!contiene(c.desde,f.desde))return false;
  if(!contiene(c.hasta,f.hasta))return false;
  if(f.estado&&c.estado!==f.estado)return false;
  if(f.global){
    var enAlguno=contiene(c.marca,f.global)||contiene(c.match,f.global)||contiene(c.cat,f.global)||
      contiene(_PROMO_ESTADO_LBL[c.estado]||'',f.global);
    if(!enAlguno)return false;
  }
  return true;
}
// ── Orden de la tabla ───────────────────────────────────────────────────────
// campo vacío = orden natural (el de la lista pegada por el usuario).
var _promosOrden={campo:'',dir:1};
// El estado NO se ordena alfabéticamente: se ordena por urgencia, que es como
// se mira este reporte (primero lo que hay que arreglar en el flyer).
// Primero las que NO están en el catálogo (hay que sacarlas del flyer), después
// las vencidas, las que vencen este mes, las dudosas, y al final las que ya
// están bien.
var _PROMO_ORDEN_ESTADO={NO_ENCONTRADA:0,VENCIDA:1,VENCE_ESTE_MES:2,REVISAR:3,SIN_FECHA:4,VIGENTE:5};
// Cada click sobre la misma columna avanza: ascendente → descendente → sin
// orden (vuelve al orden en que el usuario pegó las marcas).
function _promoOrdenar(campo){
  if(_promosOrden.campo!==campo){_promosOrden.campo=campo;_promosOrden.dir=1;}
  else if(_promosOrden.dir===1){_promosOrden.dir=-1;}
  else{_promosOrden.campo='';_promosOrden.dir=1;}
  renderPromosResultados();
}
// Opciones del selector "Ordenar por". Clave: "campo" o "campo:desc".
// Existe además del click en el encabezado porque ese gesto no se descubre
// solo; las dos vías comparten el mismo estado (_promosOrden).
var _PROMO_ORDEN_OPTS=[
  ['','Orden en que las pegué'],
  ['estado','Estado (primero lo que hay que corregir)'],
  ['estado:desc','Estado (primero las vigentes)'],
  ['marca','Marca (A → Z)'],
  ['marca:desc','Marca (Z → A)'],
  ['match','Coincidencia en Galicia (A → Z)'],
  ['cat','Categoría (A → Z)'],
  ['hasta','Vencimiento (la que vence primero)'],
  ['hasta:desc','Vencimiento (la que vence último)'],
  ['desde','Inicio (la más antigua)'],
  ['logo','Con logo primero']
];
function _promoOrdenClave(){
  if(!_promosOrden.campo)return '';
  return _promosOrden.campo+(_promosOrden.dir===-1?':desc':'');
}
function _promoOrdenarSel(v){
  var p=String(v||'').split(':');
  _promosOrden.campo=p[0]||'';
  _promosOrden.dir=(p[1]==='desc')?-1:1;
  renderPromosResultados();
}
// Valor por el que se compara cada columna. Las fechas usan el dato crudo
// (aaaa-mm-dd), que ordena cronológicamente aunque en pantalla se vea dd/mm/aaaa.
function _promoValorOrden(r,campo){
  var c=_promoCampos(r);
  if(campo==='estado')return _PROMO_ORDEN_ESTADO[r.estado]!==undefined?_PROMO_ORDEN_ESTADO[r.estado]:99;
  if(campo==='logo')return c.tieneLogo?0:1;
  if(campo==='desde')return (r.promo&&r.fechaDesde)?String(r.fechaDesde).slice(0,10):'9999';
  if(campo==='hasta')return (r.promo&&r.promo.fecha_hasta)?String(r.promo.fecha_hasta).slice(0,10):'9999';
  // Los vacíos (sin coincidencia) van al final, no al principio: ordenar por
  // categoría es para agrupar lo que sí se encontró, no para que lo que falta
  // encabece la tabla. El caracter alto asegura que queden últimos.
  var v=(c[campo]||'').toLowerCase();
  return v||'￿';
}
// Encabezado clickeable, con la flecha de la columna por la que se ordena.
function _promoTh(campo,titulo){
  var act=_promosOrden.campo===campo;
  var flecha=act?(_promosOrden.dir===1?' <span class="promos-orden">▲</span>':' <span class="promos-orden">▼</span>'):
    ' <span class="promos-orden apagada">↕</span>';
  return '<th class="promos-th-orden'+(act?' ordenando':'')+'" onclick="_promoOrdenar(\''+campo+'\')" '+
    'title="Ordenar por '+_escAttr(titulo)+'">'+_escHtml(titulo)+flecha+'</th>';
}
// Las filas que hoy pasan el filtro (con su índice original, que es el que
// usan los handlers de excluir / elegir candidato), ya ordenadas.
function _promosFilasVisibles(){
  var out=[];
  (_promosResultados||[]).forEach(function(r,i){if(_promoCoincideFiltro(r))out.push({r:r,i:i});});
  if(_promosOrden.campo){
    var campo=_promosOrden.campo,dir=_promosOrden.dir;
    out.sort(function(a,b){
      var va=_promoValorOrden(a.r,campo),vb=_promoValorOrden(b.r,campo);
      if(va<vb)return -dir;
      if(va>vb)return dir;
      return a.i-b.i; // empate: se respeta el orden en que las pegó el usuario
    });
  }
  return out;
}

function _promoFilaHtml(r,i){
  var css=_PROMO_ESTADO_CSS[r.estado]||'no';
  var logo=r.promo&&r.promo.imagen?
    '<img class="promos-logo" src="'+_escAttr(PROMO_LOGO_BASE+r.promo.imagen)+'" onerror="this.classList.add(\'promos-logo-err\');this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'promos-logo promos-logo-err\',title:\'No se pudo cargar el logo\'}))" alt="">':
    '<div class="promos-logo promos-logo-empty" title="Sin coincidencia"></div>';
  var candSel='';
  if(r.necesitaRevision||r.estado==='NO_ENCONTRADA'){
    var opts=(r.candidatos||[]).map(function(c,ci){
      return '<option value="'+ci+'"'+(r.promo&&c.promo.id===r.promo.id?' selected':'')+'>'+_escHtml(_promoDecodeEntities(c.promo.titulo))+'</option>';
    }).join('');
    candSel='<select class="promos-cand-sel" onchange="_promoElegirCandidato('+i+',this.value)">'+
      '<option value="-1"'+(!r.promo?' selected':'')+'>— Elegir coincidencia —</option>'+opts+'</select>';
  }
  return '<tr class="'+(r.excluir?'excluida':'')+'">'+
    '<td><input type="checkbox" class="promos-excl" title="Excluir del reporte"'+(r.excluir?' checked':'')+
      ' onchange="_promoToggleExcluir('+i+',this.checked)"></td>'+
    '<td>'+logo+'</td>'+
    '<td>'+_escHtml(r.marca)+'</td>'+
    '<td>'+(r.promo?_escHtml(_promoDecodeEntities(r.promo.titulo))+(candSel?'<br>'+candSel:''):(candSel||'-'))+'</td>'+
    '<td>'+(r.promo?_escHtml(_promoDecodeEntities(r.promo.subtitulo||'-')):'-')+'</td>'+
    '<td>'+(r.promo?_promosFmtFecha(r.fechaDesde):'-')+'</td>'+
    '<td>'+(r.promo?_promosFmtFecha(r.promo.fecha_hasta):'-')+'</td>'+
    '<td><span class="promos-badge b-'+css+'">'+_PROMO_ESTADO_LBL[r.estado]+'</span></td>'+
  '</tr>';
}

// Repinta SÓLO el cuerpo de la tabla (+ contadores). Separado del armado de la
// tabla para que escribir en un filtro no lo desenfoque en cada tecla.
function _promosPintarFilas(){
  var tbody=document.getElementById('promos-tbody');if(!tbody)return;
  var visibles=_promosFilasVisibles();
  tbody.innerHTML=visibles.length?
    visibles.map(function(v){return _promoFilaHtml(v.r,v.i);}).join(''):
    '<tr><td colspan="8" class="promos-sinfiltro">Ninguna fila coincide con el filtro.</td></tr>';

  var total=(_promosResultados||[]).length;
  var cnt=document.getElementById('promos-count');
  if(cnt)cnt.textContent=_promoHayFiltros()?('Mostrando '+visibles.length+' de '+total):'';
  var clr=document.getElementById('promos-clear-btn');
  if(clr)clr.style.display=_promoHayFiltros()?'':'none';

  // El Excel baja lo que se está viendo (filtrado y sin las excluidas), y el
  // botón dice cuántas filas son para que no haya sorpresas.
  var aExportar=visibles.filter(function(v){return !v.r.excluir;}).length;
  var dl=document.getElementById('promos-dl-btn');
  if(dl&&!dl.disabled)dl.textContent='⬇ Descargar Excel ('+aExportar+')';
}

// Pinta la sección de resultados de la vista "Promociones" (ya no es un
// modal: es la mitad derecha de esa vista de primer nivel, siempre visible).
function renderPromosResultados(){
  var resultados=_promosResultados||[];
  var host=document.getElementById('promos-table');
  var sumHost=document.getElementById('promos-summary');
  var actions=document.getElementById('promos-actions');
  var searchBox=document.getElementById('promos-search-box');
  if(!host||!sumHost)return;

  if(!resultados.length){
    sumHost.innerHTML='';
    host.innerHTML='<p class="promos-empty">Pegá las marcas a la izquierda y tocá "Validar vigencia" para ver el resultado acá.</p>';
    if(actions)actions.style.display='none';
    if(searchBox)searchBox.style.display='none';
    return;
  }
  if(actions)actions.style.display='flex';
  if(searchBox)searchBox.style.display='';
  // Selector "Ordenar por": refleja siempre el orden vigente, se haya elegido
  // desde acá o clickeando el encabezado de una columna.
  var ordSel=document.getElementById('promos-orden-sel');
  if(ordSel){
    var clave=_promoOrdenClave();
    ordSel.innerHTML=_PROMO_ORDEN_OPTS.map(function(o){
      return '<option value="'+o[0]+'"'+(o[0]===clave?' selected':'')+'>'+_escHtml(o[1])+'</option>';
    }).join('');
  }

  var conteo={VIGENTE:0,VENCE_ESTE_MES:0,VENCIDA:0,REVISAR:0,NO_ENCONTRADA:0,SIN_FECHA:0};
  resultados.forEach(function(r){if(!r.excluir)conteo[r.estado]=(conteo[r.estado]||0)+1;});
  // Los chips también filtran: tocar "Vencidas" deja sólo esas.
  // Mismo criterio que el orden por estado: primero lo que hay que corregir en
  // el flyer (una marca que no está en el catálogo hay que sacarla), último lo
  // que ya está bien.
  var chipDefs=[['NO_ENCONTRADA','c-no'],['VENCIDA','c-vencida'],['VENCE_ESTE_MES','c-vence'],['REVISAR','c-revisar'],['VIGENTE','c-vigente']];
  sumHost.innerHTML=chipDefs.map(function(c){
    var act=_promosFiltros.estado===c[0]?' activo':'';
    return '<span class="promos-chip '+c[1]+act+'" title="Filtrar por '+_escAttr(_PROMO_ESTADO_LBL[c[0]])+'" '+
      'onclick="_promoFiltroEstadoChip(\''+c[0]+'\')">'+_PROMO_ESTADO_LBL[c[0]]+': '+(conteo[c[0]]||0)+'</span>';
  }).join('');

  // Categorías presentes, para el desplegable de esa columna.
  var cats={};
  resultados.forEach(function(r){
    if(r.promo&&r.promo.subtitulo)cats[_promoDecodeEntities(r.promo.subtitulo)]=1;
  });
  var catOpts=Object.keys(cats).sort().map(function(c){
    return '<option value="'+_escAttr(c)+'"'+(_promosFiltros.cat===c?' selected':'')+'>'+_escHtml(c)+'</option>';
  }).join('');
  // Estados presentes, para el desplegable de esa columna.
  var estOpts=Object.keys(conteo).filter(function(e){return conteo[e]>0||_promosFiltros.estado===e;}).map(function(e){
    return '<option value="'+e+'"'+(_promosFiltros.estado===e?' selected':'')+'>'+_PROMO_ESTADO_LBL[e]+'</option>';
  }).join('');
  function inp(campo,ph){
    return '<input type="text" class="promos-fil" placeholder="'+ph+'" value="'+_escAttr(_promosFiltros[campo])+'" '+
      'oninput="_promoFiltrar(\''+campo+'\',this.value)">';
  }

  host.innerHTML='<div class="promos-table-wrap"><table class="promos-table"><thead>'+
    '<tr>'+
      '<th></th>'+
      _promoTh('logo','Logo')+_promoTh('marca','Marca (flyer)')+_promoTh('match','Coincidencia en Galicia')+
      _promoTh('cat','Categoría')+_promoTh('desde','Desde')+_promoTh('hasta','Hasta')+_promoTh('estado','Estado')+
    '</tr>'+
    '<tr class="promos-filrow">'+
      '<th></th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'logo\',this.value)">'+
        '<option value="">Todos</option>'+
        '<option value="con"'+(_promosFiltros.logo==='con'?' selected':'')+'>Con logo</option>'+
        '<option value="sin"'+(_promosFiltros.logo==='sin'?' selected':'')+'>Sin logo</option>'+
      '</select></th>'+
      '<th>'+inp('marca','Filtrar...')+'</th>'+
      '<th>'+inp('match','Filtrar...')+'</th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'cat\',this.value)">'+
        '<option value="">Todas</option>'+catOpts+'</select></th>'+
      '<th>'+inp('desde','dd/mm')+'</th>'+
      '<th>'+inp('hasta','dd/mm')+'</th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'estado\',this.value)">'+
        '<option value="">Todos</option>'+estOpts+'</select></th>'+
    '</tr>'+
    '</thead><tbody id="promos-tbody"></tbody></table></div>';

  _promosPintarFilas();
}
// Chip de estado: hace de atajo del filtro de esa columna (y lo saca si ya estaba).
function _promoFiltroEstadoChip(estado){
  _promosFiltros.estado=(_promosFiltros.estado===estado)?'':estado;
  renderPromosResultados();
}

// Excel con el logo incrustado por celda. SheetJS (usado en el resto de la
// app) no soporta imágenes en la edición Community, así que acá se usa
// ExcelJS sólo para este export.
function descargarExcelPromos(){
  if(!_promosResultados||!_promosResultados.length)return;
  // ExcelJS llega por CDN: si no cargó (red corporativa, bloqueo), sin este
  // guard el ReferenceError era sincrónico y el botón quedaba en "Generando...".
  if(typeof ExcelJS==='undefined'||!ExcelJS.Workbook){
    showToast('No se pudo cargar la librería de Excel (ExcelJS). Recargá la página e intentá de nuevo.');
    return;
  }
  var btn=document.getElementById('promos-dl-btn');
  if(btn){btn.disabled=true;btn.textContent='Generando...';}

  var wb=new ExcelJS.Workbook();
  var ws=wb.addWorksheet('Promociones');
  ws.columns=[
    {header:'Logo',key:'logo',width:12},
    {header:'Marca (flyer)',key:'marca',width:24},
    {header:'Coincidencia en Galicia',key:'match',width:28},
    {header:'Categoría',key:'cat',width:18},
    {header:'Desde',key:'desde',width:12},
    {header:'Hasta',key:'hasta',width:12},
    {header:'Estado',key:'estado',width:16}
  ];
  ws.getRow(1).font={bold:true};
  var fills={VIGENTE:'FFDFF5E1',VENCE_ESTE_MES:'FFFFF1CC',VENCIDA:'FFFCE0DF',REVISAR:'FFFFE7D1',NO_ENCONTRADA:'FFECECEC',SIN_FECHA:'FFECECEC'};

  // Baja lo que se está viendo: filtros aplicados y sin las marcadas "excluir".
  var incluidos=_promosFilasVisibles().map(function(v){return v.r;}).filter(function(r){return !r.excluir;});
  if(!incluidos.length){
    showToast('No hay filas para exportar con el filtro actual');
    if(btn){btn.disabled=false;_promosPintarFilas();}
    return;
  }
  var logosPuestos=0,logosSinPoner=0;
  var pendientes=incluidos.map(function(r,i){
    var rowIdx=i+2;
    var row=ws.addRow({
      marca:r.marca,
      match:r.promo?_promoDecodeEntities(r.promo.titulo):'-',
      cat:r.promo?_promoDecodeEntities(r.promo.subtitulo||'-'):'-',
      desde:r.promo?_promosFmtFecha(r.fechaDesde):'-',
      hasta:r.promo?_promosFmtFecha(r.promo.fecha_hasta):'-',
      estado:_PROMO_ESTADO_LBL[r.estado]||r.estado
    });
    row.height=32;
    row.eachCell(function(cell){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fills[r.estado]||'FFFFFFFF'}};});
    if(!r.promo||!r.promo.imagen)return Promise.resolve();
    // ExcelJS sólo incrusta jpeg/png/gif; otros formatos se saltean.
    var ext=/\.jpe?g$/i.test(r.promo.imagen)?'jpeg':(/\.png$/i.test(r.promo.imagen)?'png':(/\.gif$/i.test(r.promo.imagen)?'gif':null));
    if(!ext){logosSinPoner++;return Promise.resolve();}
    return fetch(PROMO_LOGO_BASE+r.promo.imagen).then(function(resp){
      return resp.ok?resp.arrayBuffer():null;
    }).then(function(buf){
      if(!buf){logosSinPoner++;return;}
      var imgId=wb.addImage({buffer:buf,extension:ext});
      ws.addImage(imgId,{tl:{col:0,row:rowIdx-1},ext:{width:26,height:26},editAs:'oneCell'});
      logosPuestos++;
    }).catch(function(){logosSinPoner++;/* si el logo no carga, la fila igual queda con sus datos */});
  });

  Promise.all(pendientes).then(function(){
    return wb.xlsx.writeBuffer();
  }).then(function(buf){
    // Si NINGÚN logo entró (típico: el CDN de Galicia no habilita CORS para
    // descargarlos por fetch), se avisa en vez de entregar el Excel "sin logos"
    // en silencio; los datos van completos igual.
    if(logosSinPoner&&!logosPuestos)showToast('Excel generado sin logos (no se pudieron descargar desde Galicia). Los datos están completos.');
    else if(logosSinPoner)showToast('Excel generado; '+logosSinPoner+' logo(s) no se pudieron descargar.');
    var blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='promociones_galicia_'+new Date().toISOString().slice(0,10)+'.xlsx';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},4000);
    if(btn){btn.disabled=false;_promosPintarFilas();}
  }).catch(function(e){
    showToast('Error generando el Excel: '+((e&&e.message)||e));
    if(btn){btn.disabled=false;_promosPintarFilas();}
  });
}

// ── CASHBACK: configs de montos (BAU, Config 1, 2, ...) guardadas en la nube ──
// Así, cuando cambia un parámetro, el admin lo edita una vez y le pega a todos
// los usuarios (asesor/VIP/admin) la próxima vez que entren o generen un flyer.
// _cashback.json: {configs:[{nombre,m1,m2,m3,m4}, ...]}. La CANTIDAD de configs
// también vive ahí: el admin agrega/quita desde Config → Cashback y los botones
// del armador, el masivo y el padrón se rearman solos a partir de CONFIGS/CNAMES.
// La primera (índice 0, "BAU") es la de fallback y no se puede quitar.
var CASHBACK_FILE='_cashback.json',_cashbackLoaded=false;
// Aplica una lista de configs sobre las globales CONFIGS/CNAMES de _source.html
// (se editan EN EL LUGAR: el resto del código las referencia por variable).
function _cbAplicar(list){
  if(typeof CONFIGS==='undefined'||!Array.isArray(list)||!list.length)return;
  var base=CONFIGS[0]||{m1:'',m2:'',m3:'',m4:''};
  list.forEach(function(c,i){
    if(!CONFIGS[i])CONFIGS[i]={m1:base.m1,m2:base.m2,m3:base.m3,m4:base.m4};
    if(!c)return;
    [1,2,3,4].forEach(function(n){if(c['m'+n]!=null)CONFIGS[i]['m'+n]=String(c['m'+n]);});
    if(typeof CNAMES!=='undefined'){
      var nom=String(c.nombre||'').replace(/[<>]/g,'').trim().slice(0,30);
      CNAMES[i]=nom||(i===0?'BAU':('Config '+i));
    }
  });
  CONFIGS.length=list.length;
  if(typeof CNAMES!=='undefined')CNAMES.length=list.length;
  // si la config activa dejó de existir, vuelvo a BAU
  if(typeof ac!=='undefined'&&ac>=CONFIGS.length)window.ac=0;
  _fgRenderCfgBtns();
}
// Botones "BAU / Config 1 / ..." del armador: se rearman según CONFIGS.
function _fgRenderCfgBtns(){
  var host=document.querySelector('.cfg-btns');if(!host||typeof CONFIGS==='undefined')return;
  var cur=(typeof ac!=='undefined')?ac:0,noCB=(typeof _fgNoCB!=='undefined')&&_fgNoCB;
  host.innerHTML=CONFIGS.map(function(c,i){
    var nombre=(typeof CNAMES!=='undefined'&&CNAMES[i])?CNAMES[i]:(i===0?'BAU':'Config '+i);
    return '<button class="cfg-btn'+((!noCB&&i===cur)?' active':'')+'" onclick="setCfg('+i+')">'+_escHtml(nombre)+'</button>';
  }).join('');
  if(!noCB&&CONFIGS[cur]){
    ['d1','d2','d3','d4'].forEach(function(id,k){var e=document.getElementById(id);if(e)e.textContent=CONFIGS[cur]['m'+(k+1)];});
  }
}
function loadCashback(force,cb){
  if(_cashbackLoaded&&!force){if(cb)cb();return;}
  fetch(FLYERS_PUBLIC+CASHBACK_FILE+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      if(d&&Array.isArray(d.configs)&&d.configs.length)_cbAplicar(d.configs);
      else _fgRenderCfgBtns();
      _cashbackLoaded=true;
      if(cb)cb();
    }).catch(function(){_cashbackLoaded=true;if(cb)cb();});
}
function saveCashback(configs,cb){
  var meta=JSON.stringify({configs:configs,updated_at:new Date().toISOString()});
  return _sb.storage.from('flyers')
    .upload(CASHBACK_FILE,new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){
      if(r&&r.error){showToast('Error al guardar el cashback: '+r.error.message);if(cb)cb(false);return;}
      _cashbackLoaded=true;
      if(cb)cb(true);
    });
}
// Copia editable de las configs (lo que se ve en Config → Cashback). Se pisa
// sobre CONFIGS/CNAMES recién al Guardar; mientras, la config activa se
// previsualiza en vivo (ver _cbField).
var _cbEdit=null;
function _cbEditDesde(){
  _cbEdit=CONFIGS.map(function(c,i){
    return {nombre:(typeof CNAMES!=='undefined'&&CNAMES[i])?CNAMES[i]:(i===0?'BAU':'Config '+i),m1:c.m1,m2:c.m2,m3:c.m3,m4:c.m4};
  });
}
function renderCashbackAdmin(){
  if(typeof _padEditStyle==='function')_padEditStyle(); // reutiliza el estilo de tarjeta (.pad-erow)
  var host=document.getElementById('cashback-list');if(!host||typeof CONFIGS==='undefined')return;
  if(!document.getElementById('cb-adm-style')){
    var st=document.createElement('style');st.id='cb-adm-style';
    st.textContent='.cb-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}'+
      '.cb-title{font-weight:700;font-size:.86rem;cursor:text;padding:2px 6px;margin-left:-6px;border-radius:5px;border:1px dashed transparent}'+
      '.cb-title:hover{border-color:var(--border,#ccc)}'+
      '.cb-title-inp{font:inherit;font-weight:700;font-size:.86rem;padding:2px 6px;border:1px solid var(--red,#c33);border-radius:5px;background:#fff;color:inherit;max-width:220px}'+
      'html.dark .cb-title-inp{background:#2c2f36}'+
      '.cb-hint{font-size:.64rem;color:var(--gray,#777)}'+
      '.cb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'+
      '@media(max-width:900px){.cb-grid{grid-template-columns:1fr 1fr}.cb-head{flex-wrap:wrap}}';
    document.head.appendChild(st);
  }
  _cbEditDesde();
  _cbPintar();
}
function _cbPintar(){
  var host=document.getElementById('cashback-list');if(!host||!_cbEdit)return;
  host.innerHTML=_cbEdit.map(function(c,i){
    return '<div class="pad-erow" data-i="'+i+'">'+
      '<div class="cb-head">'+
        '<div class="cb-title" id="cb-title-'+i+'" title="Doble click para cambiar el nombre" ondblclick="_cbRenombrar('+i+')">'+_escHtml(c.nombre)+'</div>'+
        '<span class="cb-hint">doble click para renombrar</span>'+
        (i===0?'<span class="cb-hint" style="margin-left:auto">La de fallback: no se puede quitar</span>':
          '<button type="button" class="usr-btn warn" style="margin-left:auto" onclick="_cbQuitar('+i+')">Quitar</button>')+
      '</div>'+
      '<div class="cb-grid">'+
        [1,2,3,4].map(function(n){
          return '<div><label class="login-lbl">Monto '+n+'</label>'+
            '<input class="login-inp" style="margin-bottom:0" value="'+_escAttr(c['m'+n]||'')+'" oninput="_cbField('+i+','+n+',this.value)"></div>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}
// Doble click en el título → input en el lugar. Enter/salir del campo confirma,
// Escape cancela. Se guarda en la nube recién con "Guardar cambios".
function _cbRenombrar(i){
  var c=_cbEdit&&_cbEdit[i],el=document.getElementById('cb-title-'+i);if(!c||!el)return;
  var inp=document.createElement('input');inp.type='text';inp.maxLength=30;inp.className='cb-title-inp';inp.value=c.nombre;
  var done=false;
  function fin(ok){
    if(done)return;done=true;
    var v=inp.value.replace(/[<>]/g,'').trim();
    if(ok&&v)c.nombre=v;
    _cbPintar();
  }
  inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();fin(true);}else if(e.key==='Escape'){fin(false);}});
  inp.addEventListener('blur',function(){fin(true);});
  el.replaceWith(inp);inp.focus();inp.select();
}
function _cbAgregar(){
  if(!_cbEdit)_cbEditDesde();
  var ult=_cbEdit[_cbEdit.length-1]||{m1:'',m2:'',m3:'',m4:''};
  // arranca con los montos de la última, así sólo hay que retocar lo que cambia
  _cbEdit.push({nombre:'Config '+_cbEdit.length,m1:ult.m1,m2:ult.m2,m3:ult.m3,m4:ult.m4});
  _cbPintar();
  var row=document.querySelector('#cashback-list .pad-erow[data-i="'+(_cbEdit.length-1)+'"]');
  if(row){row.scrollIntoView({block:'nearest'});_cbRenombrar(_cbEdit.length-1);}
}
function _cbQuitar(i){
  var c=_cbEdit&&_cbEdit[i];if(!c||i===0)return;
  fgConfirm('¿Quitar "'+c.nombre+'"?\n\nDeja de aparecer en el armador para todos. Las empresas de tu base o filas del masivo que la tengan cargada van a salir SIN cashback hasta que les pongas otra.',{ok:'Quitar'},function(si){
    if(!si||!_cbEdit||_cbEdit[i]!==c)return;
    _cbEdit.splice(i,1);
    _cbPintar();
  });
}
function _cbField(i,n,v){
  if(!_cbEdit||!_cbEdit[i])return;
  _cbEdit[i]['m'+n]=v;
  // preview en vivo si es la config activa
  if(typeof CONFIGS!=='undefined'&&CONFIGS[i]&&typeof ac!=='undefined'&&ac===i){
    CONFIGS[i]['m'+n]=v;var e=document.getElementById('d'+n);if(e&&!_fgNoCB)e.textContent=v;
    if(typeof redraw==='function')redraw();
  }
}
function saveCashbackChanges(){
  if(typeof CONFIGS==='undefined'||!_cbEdit)return;
  var btn=document.getElementById('cashback-save');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  var configs=_cbEdit.map(function(c){return {nombre:c.nombre,m1:c.m1,m2:c.m2,m3:c.m3,m4:c.m4};});
  saveCashback(configs,function(ok){
    if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
    if(!ok)return;
    _cbAplicar(configs);
    _cbEditDesde();_cbPintar();
    showToast('Cashback actualizado para todos ('+configs.length+' config'+(configs.length>1?'s':'')+')');
    if(typeof redraw==='function')redraw();
  });
}

// ── LEGAL GLOBAL (términos y condiciones para todos) ──────────────────────────────
// Se guarda en el bucket flyers como _legal.json {text, updated_at}. El admin lo edita
// desde el panel; todos los usuarios lo reciben precargado al iniciar sesión.
// Cada opción del armador tiene su propio legal (_legal.json / _legal2.json).
// Devuelve el texto guardado (puede ser '' si el admin lo dejó vacío a propósito) o
// null si esa opción nunca tuvo legal guardado / no se pudo bajar. Distinguirlos
// importa: '' se muestra vacío; null no debe pisar nada.
function loadGlobalLegal(toEditor,opt){
  opt=_optN(opt);
  return fetch(FLYERS_PUBLIC+_legalFile(opt)+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      var txt=(d&&typeof d.text==='string')?d.text:null;
      if(toEditor){var el=document.getElementById(_glegalId(opt));if(el)el.value=txt||'';}
      return txt;
    }).catch(function(){return null;});
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
      if(_optN(_fgOpt)===opt){var f=document.getElementById('legal-text');if(f){f.value=txt;_fgLegalShownFor=opt;if(typeof redraw==='function')redraw();}}
      showToast('Legal de '+_optLabel(opt)+' actualizado');
    });
}
// Llegó del servidor el legal de una opción: lo guardo en su caché y, si esa opción
// es la que está en pantalla y no tiene una edición de sesión, lo reflejo en el
// textarea. Idempotente: se puede llamar más de una vez con el mismo resultado.
// txt null (nunca guardado) → la Opción 1 conserva el legal del template (legado);
// las demás quedan vacías. txt '' (guardado vacío a propósito) → vacío.
function _fgLegalArrived(opt,txt){
  opt=_optN(opt);
  var base=(typeof txt==='string')?txt:(opt===1?(window.LEGAL_DEFAULT||''):'');
  var c=_fgOptCache[opt];if(c)c.legal=base;
  if(_optN(_fgOpt)!==opt)return;
  if(c&&typeof c.legalEdited==='string')return;
  var el=document.getElementById('legal-text');if(!el)return;
  if(el.value!==base){el.value=base;if(typeof redraw==='function')redraw();}
  _fgLegalShownFor=opt;
}
// Precarga el legal de la opción en el formulario (pisa el default del template).
// Devuelve la promesa para que quien arme el caché use la MISMA descarga.
function _applyGlobalLegalToForm(opt){
  opt=_optN(opt);
  return loadGlobalLegal(false,opt).then(function(txt){_fgLegalArrived(opt,txt);return txt;});
}
// Sub-solapas de legales en el panel admin.
function _glegalId(opt){var n=_optN(opt);return n===1?'glegal-text':'glegal-text'+n;}
// Arma una sub-solapa + un editor por opción (antes eran 3 bloques fijos en el
// HTML). Conserva los ids históricos: la Opción 1 sin sufijo, el resto con N.
// Idempotente: si cambia la lista de opciones se vuelve a llamar y rehace todo.
function _legalesRender(){
  var tabs=document.getElementById('legales-tabs'),panes=document.getElementById('legales-panes');
  if(!tabs||!panes)return;
  var act=document.querySelector('.ltab.active'),actual=act?+act.getAttribute('data-ltab'):1;
  if(_FG_OPTS.indexOf(actual)<0)actual=_FG_OPTS[0];
  tabs.innerHTML=_FG_OPTS.map(function(o){
    return '<div class="stab ltab'+(o===actual?' active':'')+'" data-ltab="'+o+'" onclick="switchLegalTab(this,'+o+')">'+_escHtml(_optLabel(o))+'</div>';
  }).join('');
  panes.innerHTML=_FG_OPTS.map(function(o){
    var s=(o===1)?'':String(o);
    return '<div id="lt-'+o+'"'+(o===actual?'':' style="display:none"')+'>'+
      '<textarea id="glegal-text'+s+'" class="login-inp" style="min-height:320px;resize:vertical;font-family:inherit;line-height:1.5;margin-bottom:0" placeholder="Legal de '+_escHtml(_optLabel(o))+'..."></textarea>'+
      '<div class="login-err" id="glegal-err'+s+'" style="margin-top:6px"></div>'+
      '<div class="login-ok" id="glegal-ok'+s+'" style="margin-top:6px"></div>'+
      '<div style="display:flex;gap:8px;margin-top:8px">'+
        '<button class="btn-submit" id="glegal-save'+s+'" onclick="saveGlobalLegal('+o+')">Guardar y aplicar a todos</button>'+
        '<button class="usr-btn edit" onclick="loadGlobalLegal(true,'+o+')">Recargar</button>'+
      '</div></div>';
  }).join('');
}
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
          '<div class="usr-avatar sm" style="background:'+col+'">'+_escHtml(ini)+'</div>'+
          '<div class="recent-info"><strong>'+_escHtml(u.full_name||mail||'Usuario')+'</strong>'+
          '<small>'+_escHtml(mail)+'</small></div>'+
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
      actionBtns='<button class="usr-btn ok" onclick="approveReset(this,\''+u.id+'\')" title="Aplica la nueva clave que pidió el usuario">Aprobar cambio</button>'+
        '<button class="usr-btn warn" onclick="denyReset(this,\''+u.id+'\')" title="Descarta el pedido, la cuenta sigue con su clave anterior">Rechazar</button>';
    } else {
      actionBtns=(u.status==='active'
        ?'<button class="usr-btn warn" onclick="setUStatus(this,\''+u.id+'\',\'inactive\')">Desactivar</button>'
        :'<button class="usr-btn ok" onclick="setUStatus(this,\''+u.id+'\',\'active\')">Activar</button>')+
        '<button class="usr-btn edit" onclick="openEditUser(\''+u.id+'\')">Editar</button>';
    }
    var rowStyle=(isPend||isReset)?' style="border-color:#f5c542"':'';
    // En los onclick va SOLO el id: el nombre lo resuelve deleteUser desde
    // _allUsers. Interpolar texto de otro usuario dentro de un atributo onclick
    // no se puede escapar de forma segura (el navegador decodifica las
    // entidades HTML antes de ejecutar el JS).
    var delBtn=(_me&&u.id===_me.id)?'':'<button class="usr-btn danger" onclick="deleteUser(this,\''+_escHtml(u.id)+'\')" title="Eliminar usuario definitivamente">&#128465;</button>';
    return '<div class="usr-row"'+rowStyle+'>'+
      '<div class="usr-avatar" style="background:'+col+'">'+_escHtml(ini)+'</div>'+
      '<div class="usr-info"><strong>'+_escHtml(u.full_name||mail||'Sin nombre')+'</strong>'+
      '<small>'+_escHtml(mail)+' &nbsp;&middot;&nbsp; &Uacute;lt. acceso: '+lastLogin+'</small></div>'+
      '<div class="usr-badges">'+roleB+statusB+'</div>'+
      '<div class="usr-btns">'+actionBtns+delBtn+'</div></div>';
  }).join('');
}

function setUStatus(btn,uid,status){
  btn.disabled=true;
  _sb.from('profiles').update({status:status}).eq('id',uid).then(function(r){
    if(r&&r.error){btn.disabled=false;showToast('No se pudo cambiar el estado: '+r.error.message);return;}
    loadUsers();loadStats();_refreshPendingBadge();showToast(status==='active'?'Usuario activado':'Usuario desactivado');
  });
}

function deleteUser(btn,uid){
  var u=_allUsers.find(function(x){return x.id===uid;});
  var name=u?(u.full_name||u.email_asesor||''):'';
  fgConfirm('¿Eliminar definitivamente a '+(name||'este usuario')+'?\n\nSe borrará su cuenta de acceso y su perfil. Esta acción no se puede deshacer.',{ok:'Eliminar usuario'},function(si){
    if(!si)return;
    btn.disabled=true;var _h=btn.innerHTML;btn.innerHTML='…';
    _callFn('delete_user',{uid:uid},function(err){
      if(err){btn.disabled=false;btn.innerHTML=_h;showToast('Error: '+err);return;}
      showToast('Usuario eliminado');
      loadUsers();loadStats();
    });
  });
}

function approveUser(btn,uid){
  btn.disabled=true;
  _sb.from('profiles').update({status:'active'}).eq('id',uid).then(function(r){
    if(r&&r.error){btn.disabled=false;showToast('No se pudo aprobar: '+r.error.message);return;}
    loadUsers();loadStats();_refreshPendingBadge();showToast('Usuario aprobado');
  });
}

// Aplica la clave que el usuario pidió (guardada en pending_password_resets)
// recién ahora, vía la Edge Function. Antes de este arreglo la clave real se
// pisaba apenas alguien pedía el reset, sin que un admin la revisara.
function approveReset(btn,uid){
  btn.disabled=true;
  _callFn('approve_reset',{uid:uid},function(err){
    if(err){btn.disabled=false;showToast('Error: '+err);return;}
    loadUsers();loadStats();_refreshPendingBadge();showToast('Cambio de contraseña aprobado');
  });
}

// Descarta el pedido de nueva clave y reactiva la cuenta con la clave que ya
// tenía (nunca se tocó). Antes esto desactivaba al usuario por error.
function denyReset(btn,uid){
  btn.disabled=true;
  _callFn('deny_reset',{uid:uid},function(err){
    if(err){btn.disabled=false;showToast('Error: '+err);return;}
    loadUsers();loadStats();_refreshPendingBadge();showToast('Cambio de contraseña rechazado');
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
    var imgName='flyer_'+Date.now()+'_op'+_optN(opt||1)+'.jpg'; // _opN: la opción queda en el nombre (ver _upOptDe)
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
// Archivos de la última lista de versiones. Los botones de cada fila reciben el
// ÍNDICE en este array (ver _upAct/_upCal/_upVer/_upDel), nunca el nombre del
// archivo: un nombre con comillas dentro de un onclick rompe (o ejecuta) código.
var _uploadFiles=[];
function _upFile(i){return _uploadFiles[i]||null;}
function _upAct(i,btn,opt){var f=_upFile(i);if(!f)return;(f.isImg?activateImageFlyer:activateFlyer)(f.url,f.name,btn,opt);}
function _upCal(i){var f=_upFile(i);if(f)_calFromList(f.url,f.name);}
function _upVer(i){var f=_upFile(i);if(f)window.open(f.url,'_blank','noopener');}
function _upDel(btn,i){var f=_upFile(i);if(f)deleteUpload(btn,f.name);}
// Sólo se linkea un HTML activo si vive en nuestro bucket: _active.json lo
// escribe el admin, pero un href arbitrario (javascript:, otro dominio) no
// tiene por qué colarse en el panel.
function _upSafeUrl(u){return (typeof u==='string'&&u.indexOf(FLYERS_PUBLIC)===0)?u:null;}
// Opción "de casa" de un archivo subido: en la que está activo; si no está
// activo en ninguna, la que se eligió al subirlo (queda en el nombre del
// archivo: flyer_<ts>_op<N>.jpg). Los archivos viejos sin sufijo no tienen.
// Devuelve {act:[opciones donde está activo], home:N|0}.
function _upOptDe(name){
  var act=_FG_OPTS.filter(function(o){return _fgHistMeta[o]&&_fgHistMeta[o].name===name;});
  var home=act.length?act[0]:0;
  if(!home){var m=/_op(\d+)\.[a-z0-9]+$/i.exec(name||'');if(m&&_FG_OPTS.indexOf(+m[1])!==-1)home=+m[1];}
  return {act:act,home:home};
}
// "Replicar" el flyer en OTRA opción (cada flyer suele ser distinto, así que es
// la excepción: por eso va en un botón chico aparte, no una fila de Op.1..Op.N).
function _upActOtra(i){
  var f=_upFile(i);if(!f)return;
  _askOption('¿En qué otra opción activar "'+f.name+'"?',function(o){_upAct(i,null,o);});
}
function _renderUploadHistory(histEl){
  _sb.storage.from('flyers').list('',{limit:50,sortBy:{column:'created_at',order:'desc'}}).then(function(r){
    var files=(r.data||[]).filter(function(f){return !f.name.startsWith('_');});
    _uploadFiles=files.map(function(f){return{name:f.name,url:FLYERS_PUBLIC+f.name,isImg:/\.(png|jpe?g)$/i.test(f.name)};});
    var banner=_FG_OPTS.map(function(o){
      var d=_fgHistMeta[o],has=!!(d&&d.imageUrl);
      if(!has)return '<div class="af-banner af-banner-empty">'+_optLabel(o)+': sin flyer activo.</div>';
      var hUrl=_upSafeUrl(d&&d.htmlUrl);
      return '<div class="af-banner"><div class="af-banner-info">'+
        _optBadge(o,'font-size:.62rem;padding:4px 8px')+
        '<span class="af-banner-name af-banner-opt" style="color:'+_optColor(o)+'">'+_escHtml(_optLabel(o))+'</span>'+
        '<span class="af-banner-name" style="font-weight:400;color:var(--gray)">'+_escHtml(d.name||'')+'</span></div>'+
        '<div style="display:flex;gap:6px">'+
        (hUrl?'<a href="'+_escHtml(hUrl)+'" target="_blank" rel="noopener noreferrer" class="usr-btn edit" style="font-size:.65rem;padding:5px 10px;text-decoration:none;display:inline-flex;align-items:center">Ver</a>':'')+
        '<button class="usr-btn warn" onclick="deactivateFlyer(this,'+o+')" style="font-size:.65rem;padding:5px 10px">Desactivar</button>'+
        '</div></div>';
    }).join('');
    if(!files.length){
      histEl.innerHTML=banner+'<p style="color:var(--gray);font-size:.8rem;margin-top:12px">Sin versiones subidas aún.</p>';
      return;
    }
    // Cada versión muestra a QUÉ OPCIÓN pertenece (nombre y color), que es lo que
    // se necesita para saber cuál calibrar: el nombre del archivo solo no dice nada.
    histEl.innerHTML=banner+'<p class="ap-sec" style="margin-top:16px;margin-bottom:8px">Versiones disponibles</p>'+
      files.map(function(f,i){
        var ts=f.created_at?_fmtDate(f.created_at):'';
        var kb=f.metadata&&f.metadata.size?Math.round(f.metadata.size/1024)+' KB':'';
        var od=_upOptDe(f.name),isAct=od.act.length>0,home=od.home;
        var isImg=_uploadFiles[i].isImg;
        var tag=isImg?'<span class="badge" style="font-size:.55rem;padding:3px 7px;background:#eef3fb;color:#1d4070;margin-left:6px">PDF/IMG</span>':'';
        var titulo;
        if(home){
          titulo=od.act.map(function(o){return _optBadge(o,'margin-right:5px');}).join('')+(isAct?'':_optBadge(home,'margin-right:5px;opacity:.55'))+
            '<span class="usr-row-optname" style="color:'+_optColor(home)+'">'+_escHtml(_optLabel(home))+'</span>'+
            (od.act.length>1?' <span style="font-weight:400;color:var(--gray)">+ '+od.act.slice(1).map(function(o){return _escHtml(_optLabel(o));}).join(', ')+'</span>':'')+
            (isAct?'<span class="badge" style="font-size:.55rem;padding:3px 7px;background:var(--green,#2e7d32);color:#fff;margin-left:6px">ACTIVO</span>':
              '<span class="badge" style="font-size:.55rem;padding:3px 7px;background:#eee;color:#666;margin-left:6px" title="Subido para esta opci&oacute;n, pero no es el flyer activo">NO ACTIVO</span>');
        }else{
          titulo='<span style="color:var(--gray)">Sin opci&oacute;n asignada</span>';
        }
        var btns='';
        if(home&&!isAct)btns+='<button class="usr-btn ok" title="Activar en '+_escAttr(_optLabel(home))+'" style="border-color:'+_optColor(home)+';color:'+_optColor(home)+'" onclick="_upAct('+i+',this,'+home+')">Activar</button>';
        if(!home)btns+='<button class="usr-btn ok" onclick="_upActOtra('+i+')">Activar en&hellip;</button>';
        else btns+='<button class="usr-btn edit" title="Replicar este flyer en otra opci&oacute;n" style="opacity:.75" onclick="_upActOtra('+i+')">Otra opci&oacute;n&hellip;</button>';
        if(isImg)btns+='<button class="usr-btn edit" onclick="_upCal('+i+')">Calibrar</button>';
        return '<div class="usr-row'+(isAct?' usr-row-active':'')+'">'+
          '<div class="usr-info">'+
            '<strong style="font-size:.8rem">'+titulo+tag+'</strong>'+
            '<small>'+_escHtml(f.name)+(ts?' &middot; '+ts:'')+(kb?' &middot; '+kb:'')+'</small>'+
          '</div>'+
          '<div class="usr-btns">'+btns+
            '<button class="usr-btn edit" onclick="_upVer('+i+')">Ver</button>'+
            '<button class="usr-btn warn" onclick="_upDel(this,'+i+')"'+(isAct?' disabled title="Desactivá primero"':'')+'>Borrar</button>'+
          '</div></div>';
      }).join('');
  });
}

function deleteUpload(btn,name){
  var inUse=_FG_OPTS.some(function(o){return _fgHistMeta[o]&&_fgHistMeta[o].name===name;});
  if(inUse){showToast('Desactivá el flyer antes de borrarlo.');return;}
  btn.disabled=true;
  _sb.storage.from('flyers').remove([name]).then(function(r){
    if(r&&r.error){btn.disabled=false;showToast('No se pudo borrar: '+r.error.message);return;}
    loadUploadHistory();showToast('Archivo eliminado');
  });
}

// ── DOS ARMADORES: Opción 1 / Opción 2 (selector SOLO para ADMIN) ───────────────
// Cada opción tiene su propio flyer activo (_active.json / _active2.json) y su propio
// legal global (_legal.json / _legal2.json). La Opción 1 es EXACTAMENTE lo que existía
// antes, así que asesores y VIP no ven ningún cambio (no se les muestra el selector).
// Al cambiar de opción se intercambian baseImg + FLYER_CFG + #legal-text; por eso el
// armador individual, el MASIVO (genAll usa legal-text + fullRes) y las descargas
// funcionan igual en las dos sin tocar nada más.
// La LISTA de opciones (cuántas hay, cómo se llaman, de qué color) vive en la
// nube: _opciones.json en el bucket. El admin la edita desde Config → Opciones.
// Sin archivo (o mientras carga) rige el default de siempre: 1, 2 y 3.
// Al sumar una opción N aparece sola en Facultades (fila opcion_N), en la barra
// del armador (para quien la tenga habilitada), en Legales, en "subir flyer",
// en el calibrador y en los registros — todo sale de _FG_OPTS y _optLabel().
var OPCIONES_FILE='_opciones.json',_opcLoaded=false,_OPC={};
var _OPC_PALETA=['#1d4070','#0e8a5f','#8e44ad','#b26a00','#c2185b','#00838f','#5d4037','#455a64'];
function _opcDefault(){return [{n:1,nombre:'Opción 1'},{n:2,nombre:'Opción 2'},{n:3,nombre:'Opción 3'}];}
// Normaliza lo que venga del archivo: números enteros ≥1 únicos, en el orden guardado, la 1
// siempre presente (es la de los asesores), nombres recortados.
// solapa: en qué solapa del header vive la opción. 'flyer' = "Flyer Galicia"
// (el armador de siempre); 'rubros' = "Flyer Rubros" (mismo armador + el cartel
// "¡Beneficio exclusivo EMPRESA!" y el tope de reintegro). La 1 es siempre 'flyer'.
var _OPC_SOLAPAS=['flyer','rubros'];
function _opcSane(list){
  var out=[],vistos={};
  (Array.isArray(list)?list:[]).forEach(function(o){
    var n=parseInt(o&&o.n,10);if(!(n>=1)||vistos[n])return;vistos[n]=1;
    var sol=(o&&o.solapa==='rubros'&&n!==1)?'rubros':'flyer';
    // orden: posición elegida a mano (arrastrando en la barra). Sin orden va al final, por número.
    var ord=(o&&typeof o.orden==='number'&&isFinite(o.orden))?o.orden:(1e6+n);
    out.push({n:n,nombre:String((o&&o.nombre)||'').replace(/[<>]/g,'').trim().slice(0,40)||('Opción '+n),
      color:/^#[0-9a-f]{6}$/i.test(o&&o.color||'')?o.color.toLowerCase():'',solapa:sol,orden:ord});
  });
  if(!vistos[1])out.unshift({n:1,nombre:'Opción 1',color:'',solapa:'flyer',orden:-1});
  out.sort(function(a,b){return a.orden-b.orden||a.n-b.n;});
  out.forEach(function(o,i){o.orden=i;});
  return out;
}
function _aplicarOpciones(list){
  var l=_opcSane(list&&list.length?list:_opcDefault());
  _OPC={};l.forEach(function(o){_OPC[o.n]=o;});
  _FG_OPTS=l.map(function(o){return o.n;});
}
function loadOpciones(force,cb){
  if(_opcLoaded&&!force){if(cb)cb();return;}
  fetch(FLYERS_PUBLIC+OPCIONES_FILE+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){_aplicarOpciones(d&&d.opts);_opcLoaded=true;if(cb)cb();})
    .catch(function(){_aplicarOpciones(null);_opcLoaded=true;if(cb)cb();});
}
function saveOpciones(list,cb){
  var l=_opcSane(list);
  var meta=JSON.stringify({opts:l,updated_at:new Date().toISOString()});
  return _sb.storage.from('flyers')
    .upload(OPCIONES_FILE,new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){
      if(r&&r.error){showToast('Error al guardar las opciones: '+r.error.message);if(cb)cb(false);return;}
      _aplicarOpciones(l);_opcLoaded=true;
      if(cb)cb(true);
    });
}
var _FG_OPTS=[1,2,3];
var _fgOpt=1,_fgOptCache={},_fgHistMeta={};
function _optN(opt){var n=+opt;return (_FG_OPTS.indexOf(n)!==-1)?n:1;}
// Opción 1 conserva los nombres originales (_active.json/_legal.json) => cero cambios
// para los asesores; las demás agregan el número.
function _activeFile(opt){var n=_optN(opt);return n===1?'_active.json':'_active'+n+'.json';}
function _legalFile(opt){var n=_optN(opt);return n===1?'_legal.json':'_legal'+n+'.json';}
function _optLabel(opt){var n=_optN(opt);return (_OPC[n]&&_OPC[n].nombre)||('Opción '+n);}
// Solapa del header a la que pertenece la opción ('flyer' | 'rubros').
function _optSolapa(opt){var n=_optN(opt);return (_OPC[n]&&_OPC[n].solapa==='rubros')?'rubros':'flyer';}
function _solapaLabel(s){return _titLabel(s==='rubros'?'rubros':'flyer');} // nombre editable (4 toques en el header)
// Solapa del armador que está a la vista. Se deriva SIEMPRE de la opción activa
// (ver _fgSyncVista), así historial/registros que cambian de opción cambian de solapa solos.
var _fgVista='flyer';
// Color por opción: se usa igual en registros, historial y badges (control visual).
function _optColor(opt){var n=_optN(opt);return (_OPC[n]&&_OPC[n].color)||_OPC_PALETA[(n-1)%_OPC_PALETA.length];}
function _optBadge(opt,extraCss){
  var n=_optN(opt),c=_optColor(n);
  return '<span class="badge" style="font-size:.56rem;padding:3px 7px;background:'+c+
    ';color:#fff;letter-spacing:.3px;'+(extraCss||'')+'" title="'+_escHtml(_optLabel(n))+'">OP.'+n+'</span>';
}
function _fetchActiveMeta(opt,cb){
  fetch(FLYERS_PUBLIC+_activeFile(opt)+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){cb(d||null);}).catch(function(){cb(null);});
}
// Barra de opciones: se inyecta arriba de los tabs Individual/Masivo/Historial.
// Se muestra si el perfil tiene más de una opción habilitada (ver _facSyncOptBar).
// Para el admin, además: 4 toques seguidos sobre un título → renombrarlo en el
// lugar; mantener apretado 5 segundos → se "levanta" y se arrastra para cambiar
// el orden. Las dos cosas se guardan en _opciones.json (lo mismo que Config → Opciones).
function _fgEnsureOptBar(){
  if(document.getElementById('fg-optbar'))return;
  var tabs=document.querySelector('.panel .tabs')||document.querySelector('.tabs');
  if(!tabs||!tabs.parentNode)return;
  var st=document.createElement('style');st.id='fg-optbar-style';
  st.textContent=
    '#fg-optbar{display:flex;gap:6px;margin:0 0 10px;padding:4px;background:rgba(128,128,128,.14);border-radius:9px}'+
    '#fg-optbar .fgo{flex:1;text-align:center;padding:7px 8px;border-radius:7px;cursor:pointer;font-size:.76rem;font-weight:600;color:var(--gray,#777);user-select:none;-webkit-user-select:none;transition:.15s;background:none;border-bottom:2px solid transparent;touch-action:none;position:relative}'+
    '#fg-optbar .fgo:hover{color:#444}'+
    'html.dark #fg-optbar .fgo:hover{color:#ddd}'+
    '#fg-optbar .fgo.on{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14)}'+
    'html.dark #fg-optbar .fgo.on{background:#2c2f36}'+
    // mantener apretado: barrita que se llena en 5 s, para ver que "algo está pasando"
    '#fg-optbar .fgo.hold::after{content:"";position:absolute;left:8px;right:8px;bottom:1px;height:2px;border-radius:2px;background:currentColor;opacity:.6;animation:fgoHold 5s linear forwards;transform-origin:left}'+
    '@keyframes fgoHold{from{transform:scaleX(0)}to{transform:scaleX(1)}}'+
    '#fg-optbar .fgo.lift{transform:scale(1.06) translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.22);z-index:2;cursor:grabbing;outline:2px dashed currentColor}'+
    '#fg-optbar.reorder .fgo:not(.lift){opacity:.7}'+
    '#fg-optbar .fgo input{font:inherit;font-weight:600;width:100%;box-sizing:border-box;text-align:center;border:1px solid var(--red,#c33);border-radius:5px;padding:2px 4px;background:#fff;color:#222}'+
    'html.dark #fg-optbar .fgo input{background:#2c2f36;color:#eee}';
  // La barra se destruye y recrea al cambiar facultades; el estilo se agrega una vez.
  if(!document.getElementById('fg-optbar-style'))document.head.appendChild(st);
  var bar=document.createElement('div');bar.id='fg-optbar';
  bar.innerHTML=_facOptsDe(_fgVista).map(function(o){
    return '<div class="fgo" data-o="'+o+'" onclick="switchFlyerOption('+o+')">'+_escHtml(_optLabel(o))+'</div>';
  }).join('');
  tabs.parentNode.insertBefore(bar,tabs);
  if(_admin)_fgOptBarGestos(bar);
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
// Lista completa de opciones tal como está hoy, en orden, lista para saveOpciones.
// `orden` es la posición: así la nube recuerda el orden que se armó a mano.
function _opcListaActual(){
  return _FG_OPTS.map(function(n,i){return {n:n,nombre:_optLabel(n),color:_optColor(n),solapa:_optSolapa(n),orden:i};});
}
// Guarda la lista y rearma todo lo que muestra nombres/orden de opciones.
function _opcGuardarRapido(lista,msg){
  saveOpciones(lista,function(ok){
    if(!ok)return;
    _opcEdit=null;                                   // Config → Opciones se relee al abrirla
    if(typeof _legalesRender==='function')_legalesRender();
    if(document.getElementById('fac-grid')&&typeof renderFacultades==='function'){var af=document.getElementById('at-facultades');if(af&&af.style.display!=='none')renderFacultades();}
    _facSyncOptBar();_fgRenderOptBar();
    var t=document.getElementById('cal-title');if(t&&_cal)t.textContent='Calibrar flyer — '+_optLabel(_cal.opt);
    if(msg)showToast(msg);
  });
}
// Renombrar en el lugar: el título pasa a ser un input. Enter/salir confirma, Escape cancela.
function _fgOptRenombrar(el){
  var o=+el.getAttribute('data-o');if(!o||el.querySelector('input'))return;
  var prev=_optLabel(o);
  var inp=document.createElement('input');inp.type='text';inp.maxLength=40;inp.value=prev;
  el.textContent='';el.appendChild(inp);el.classList.add('editing');
  var done=false;
  function fin(ok){
    if(done)return;done=true;
    var v=inp.value.replace(/[<>]/g,'').trim();
    el.classList.remove('editing');el.textContent=(ok&&v)?v:prev;
    if(!ok||!v||v===prev)return;
    var lista=_opcListaActual();
    lista.forEach(function(x){if(x.n===o)x.nombre=v;});
    el.textContent=v;
    _opcGuardarRapido(lista,'Opción renombrada: '+v);
  }
  inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter'){e.preventDefault();fin(true);}else if(e.key==='Escape'){fin(false);}});
  inp.addEventListener('blur',function(){fin(true);});
  // los clicks dentro del input no deben cambiar de opción ni contar como toques
  inp.addEventListener('click',function(e){e.stopPropagation();});
  inp.addEventListener('pointerdown',function(e){e.stopPropagation();});
  inp.focus();inp.select();
}
// Nuevo orden de la barra (sólo lista las opciones de ESTA solapa) → orden global:
// las de la otra solapa se quedan donde estaban, éstas se reacomodan en sus lugares.
function _fgOptAplicarOrden(bar){
  var visibles=Array.prototype.map.call(bar.querySelectorAll('.fgo'),function(x){return +x.getAttribute('data-o');});
  var set={};visibles.forEach(function(n){set[n]=1;});
  var k=0,nuevo=_FG_OPTS.map(function(n){return set[n]?visibles[k++]:n;});
  if(nuevo.join(',')===_FG_OPTS.join(','))return;
  var lista=nuevo.map(function(n,i){return {n:n,nombre:_optLabel(n),color:_optColor(n),solapa:_optSolapa(n),orden:i};});
  _opcGuardarRapido(lista,'Orden de las opciones guardado');
}
var _FG_HOLD_MS=5000,_FG_TAPS=4,_FG_TAP_VENTANA=1600;
function _fgOptBarGestos(bar){
  var taps=0,tapsEl=null,tapsT=0;
  var hold=null,lift=null,startX=0,startY=0;
  function limpiarHold(){if(hold){clearTimeout(hold.t);hold.el.classList.remove('hold');hold=null;}}
  function soltar(){
    if(!lift)return;
    lift.classList.remove('lift');bar.classList.remove('reorder');
    lift=null;
    _fgOptAplicarOrden(bar);
  }
  bar.addEventListener('pointerdown',function(e){
    var el=e.target.closest?e.target.closest('.fgo'):null;
    if(!el||el.classList.contains('editing'))return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    limpiarHold();
    startX=e.clientX;startY=e.clientY;
    hold={el:el,t:setTimeout(function(){
      // 5 s apretado: se levanta y a partir de acá se arrastra
      el.classList.remove('hold');el.classList.add('lift');bar.classList.add('reorder');
      lift=el;hold=null;taps=0;
      try{bar.setPointerCapture(e.pointerId);}catch(x){}
      if(navigator.vibrate)try{navigator.vibrate(30);}catch(x){}
      showToast('Arrastrá para cambiar el orden y soltá');
    },_FG_HOLD_MS)};
    el.classList.add('hold');
  });
  bar.addEventListener('pointermove',function(e){
    // si se mueve el dedo/mouse antes de los 5 s, no es "mantener apretado"
    if(hold&&(Math.abs(e.clientX-startX)>8||Math.abs(e.clientY-startY)>8))limpiarHold();
    if(!lift)return;
    e.preventDefault();
    var otros=Array.prototype.filter.call(bar.querySelectorAll('.fgo'),function(x){return x!==lift;});
    for(var i=0;i<otros.length;i++){
      var r=otros[i].getBoundingClientRect();
      if(e.clientX>=r.left&&e.clientX<=r.right){
        var mid=r.left+r.width/2;
        if(e.clientX<mid)bar.insertBefore(lift,otros[i]);else bar.insertBefore(lift,otros[i].nextSibling);
        break;
      }
    }
  });
  bar.addEventListener('pointerup',function(){limpiarHold();soltar();});
  bar.addEventListener('pointercancel',function(){limpiarHold();soltar();});
  bar.addEventListener('pointerleave',function(){if(!lift)limpiarHold();});
  bar.addEventListener('contextmenu',function(e){if(hold||lift)e.preventDefault();});
  // 4 toques seguidos sobre el MISMO título → renombrar
  bar.addEventListener('click',function(e){
    var el=e.target.closest?e.target.closest('.fgo'):null;
    if(!el||el.classList.contains('editing'))return;
    var now=Date.now();
    if(el!==tapsEl||now-tapsT>_FG_TAP_VENTANA)taps=0;
    tapsEl=el;tapsT=now;taps++;
    if(taps>=_FG_TAPS){taps=0;_fgOptRenombrar(el);}
  });
}
// ── Legal por opción: invariantes ────────────────────────────────────────────
// 1) El textarea #legal-text muestra SIEMPRE el legal de una sola opción, la que
//    dice _fgLegalShownFor. Mientras se carga otra opción, _fgOpt ya cambió pero el
//    textarea sigue mostrando la anterior: por eso el stash usa _fgLegalShownFor y
//    NO _fgOpt (antes usaba _fgOpt y, con un doble clic durante la carga, guardaba el
//    legal de la opción vieja como "edición" de la nueva; desde ahí la nueva mostraba
//    el legal ajeno toda la sesión — el bug de "Supermercado trae otro legal").
// 2) legalEdited existe sólo si el texto difiere del legal guardado de esa opción.
//    Lo que no se editó no se guarda como edición.
// 3) Nunca hay dos cargas de la misma opción en vuelo: la segunda se suma a la
//    primera (_fgOptLoading), así no se pisan los cachés ni se aplican dos veces.
var _fgLegalShownFor=null;
var _fgOptLoading={};
function _fgStashLegal(){
  var el=document.getElementById('legal-text');if(el==null||_fgLegalShownFor==null)return;
  var c=_fgOptCache[_fgLegalShownFor];
  if(!c||typeof c.legal!=='string')return; // sin base conocida no puedo saber si es edición
  if(el.value!==c.legal)c.legalEdited=el.value;else delete c.legalEdited;
}
function switchFlyerOption(opt,cb){
  if(!_can('opcion_'+_optN(opt)))return; // gating real, no sólo visual
  opt=_optN(opt);
  if(_fgOptLoading[opt]){ // ya se está cargando (doble clic, red lenta): me sumo y listo
    _fgOpt=opt;_fgSyncVista();
    if(cb)_fgOptLoading[opt].push(cb);
    return;
  }
  _fgStashLegal();
  _fgOpt=opt;_fgSyncVista(); // solapa del header + barra + campos del beneficio
  var c=_fgOptCache[opt];
  if(c&&c.loaded){_fgApplyOption(c);if(cb)cb();return;}
  showToast('Cargando '+_optLabel(opt)+'...');
  // Mientras llega la opción nueva el textarea NO puede seguir mostrando el legal de
  // la anterior (se leía como "Supermercado trae el legal de otro flyer"): queda vacío
  // con un aviso, y _fgLegalShownFor=null dice que ahí no hay legal de nadie.
  var elL=document.getElementById('legal-text');
  if(elL){elL.value='';elL.placeholder='Cargando el legal de '+_optLabel(opt)+'…';}
  _fgLegalShownFor=null;
  if(typeof redraw==='function')redraw();
  var waiters=_fgOptLoading[opt]=[];if(cb)waiters.push(cb);
  var keepEdited=(c&&typeof c.legalEdited==='string')?c.legalEdited:undefined; // edición real previa de ESTA opción
  var done=function(cache,aviso){
    cache.loaded=true;delete _fgOptLoading[opt];
    if(_optN(_fgOpt)===opt){_fgApplyOption(cache);if(aviso)showToast(aviso);}
    waiters.forEach(function(f){try{f();}catch(e){console.error('switchFlyerOption cb:',e);}});
  };
  _fetchActiveMeta(opt,function(d){
    var cache=_fgOptCache[opt]={loaded:false,cfg:(d&&d.cfg)||null,
      imageUrl:(d&&d.imageUrl)||null,name:(d&&d.name)||'',legal:null,img:null,legalEdited:keepEdited};
    loadGlobalLegal(false,opt).then(function(txt){
      cache.legal=(typeof txt==='string')?txt:(opt===1?(window.LEGAL_DEFAULT||''):'');
      if(!cache.imageUrl){done(cache,_optLabel(opt)+' todavía no tiene flyer: subilo desde el panel.');return;}
      var im=new Image();im.crossOrigin='anonymous';
      im.onload=function(){cache.img=im;done(cache);};
      im.onerror=function(){done(cache,'No se pudo cargar la imagen de '+_optLabel(opt));};
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
  if(el){
    // SIEMPRE el legal de ESTA opción. Si todavía no llegó del servidor (null), queda
    // vacío hasta que llegue (_fgLegalArrived lo completa): nunca el de la anterior.
    el.value=(typeof txt==='string')?txt:'';el.placeholder='';
    _fgLegalShownFor=_optN(_fgOpt);
    if(typeof txt==='string'&&!txt.trim())showToast('⚠ '+_optLabel(_fgOpt)+' no tiene legal cargado — avisá a la central antes de generar el flyer.');
  }
  if(typeof calcSC==='function')calcSC();
  if(typeof _fgBenefFieldsSync==='function')_fgBenefFieldsSync(); // segundo tope según el cartel de la opción
  if(typeof redraw==='function')redraw();
}
// Fuerza recarga de una opción (después de activar/calibrar) y refresca el armador si toca.
function _fgInvalidateOpt(opt){
  opt=_optN(opt);
  delete _fgOptCache[opt];
  if(_can('opcion_'+_optN(opt))&&+_fgOpt===opt)switchFlyerOption(opt);
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
  // Una fila por solapa del header (Flyer Galicia / Flyer Rubros), con rótulo
  // sólo si hay opciones de las dos: así no se sube un PDF al armador equivocado.
  function fila(sol,conRotulo){
    var os=_FG_OPTS.filter(function(o){return _optSolapa(o)===sol;});
    if(!os.length)return '';
    return (conRotulo?'<div style="font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray,#777);margin:10px 0 5px">'+_escHtml(_solapaLabel(sol))+'</div>':'')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+os.map(function(o){
        return '<button class="btn-submit" style="flex:1;min-width:110px;background:'+_optColor(o)+'" data-o="'+o+'">'+_escHtml(_optLabel(o))+'</button>';
      }).join('')+'</div>';
  }
  var hayRubros=_FG_OPTS.some(function(o){return _optSolapa(o)==='rubros';});
  d.innerHTML='<div class="box"><h3>'+_escHtml(title)+'</h3>'+
    '<p>Eleg&iacute; a qu&eacute; armador corresponde.</p>'+
    fila('flyer',hayRubros)+fila('rubros',hayRubros)+
    '<button class="btn-cancel" style="width:100%;margin-top:8px" data-o="0">Cancelar</button></div>';
  d.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button[data-o]'):null;
    if(!b){if(e.target===d)d.remove();return;}
    var o=+b.getAttribute('data-o');d.remove();if(o)cb(o);
  });
  document.body.appendChild(d);
}

// ── TÍTULOS EDITABLES ────────────────────────────────────────────────────────
// Los títulos principales (el "Flyer Galicia 5.5" del panel y las solapas del
// header: Flyer Galicia / Flyer Rubros / Promociones, más el título del buscador)
// se renombran con 4 toques seguidos (sólo admin), igual que las opciones de la
// barra. Se guardan en _titulos.json y los ven todos los usuarios.
var TITULOS_FILE='_titulos.json',_TIT={};
var _TIT_DEF={ptitle:'Flyer Galicia 5.5',flyer:'Flyer Galicia',rubros:'Flyer Rubros',promos:'Promociones',promos_ptitle:'Buscador de Promociones'};
function _titElem(key){
  if(key==='ptitle')return document.querySelector('#layout .panel .ptitle');
  if(key==='promos_ptitle')return document.querySelector('#view-promos .ptitle');
  return document.querySelector('#apptab-'+key+' h1');
}
function _titLabel(key){return (_TIT[key]&&String(_TIT[key]).trim())||_TIT_DEF[key]||'';}
function _titAplicar(){
  Object.keys(_TIT_DEF).forEach(function(k){
    var el=_titElem(k);if(!el||el.querySelector('input'))return;
    el.textContent=_titLabel(k);
  });
}
function loadTitulos(cb){
  fetch(FLYERS_PUBLIC+TITULOS_FILE+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      _TIT={};
      if(d&&typeof d==='object')Object.keys(_TIT_DEF).forEach(function(k){if(typeof d[k]==='string')_TIT[k]=d[k].replace(/[<>]/g,'').trim().slice(0,40);});
      _titAplicar();if(cb)cb();
    }).catch(function(){if(cb)cb();});
}
function saveTitulos(cb){
  var meta=JSON.stringify(Object.assign({},_TIT,{updated_at:new Date().toISOString()}));
  return _sb.storage.from('flyers')
    .upload(TITULOS_FILE,new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){
      if(r&&r.error){showToast('Error al guardar el título: '+r.error.message);if(cb)cb(false);return;}
      if(cb)cb(true);
    });
}
// 4 toques seguidos sobre el elemento (sin contar clicks dentro de un input) → fn(el).
var _TAP4_VENTANA=1600;
function _tap4(el,fn){
  if(!el||el.dataset.tap4)return;el.dataset.tap4='1';
  var taps=0,t=0;
  el.addEventListener('click',function(e){
    if(e.target&&e.target.tagName==='INPUT')return;
    var now=Date.now();if(now-t>_TAP4_VENTANA)taps=0;
    t=now;taps++;
    if(taps>=4){taps=0;fn(el);}
  });
}
// Renombrar en el lugar: input con el mismo estilo. Enter/salir confirma, Escape cancela.
function _titRenombrar(el,key){
  if(!_admin||el.querySelector('input'))return;
  var prev=_titLabel(key);
  var inp=document.createElement('input');inp.type='text';inp.maxLength=40;inp.value=prev;
  inp.style.cssText='font:inherit;color:inherit;background:rgba(255,255,255,.12);border:1px solid currentColor;border-radius:5px;padding:1px 6px;width:'+Math.max(120,el.offsetWidth+30)+'px;max-width:70vw;outline:none;text-transform:inherit;letter-spacing:inherit';
  el.textContent='';el.appendChild(inp);
  var done=false;
  function fin(ok){
    if(done)return;done=true;
    var v=inp.value.replace(/[<>]/g,'').trim();
    el.textContent=(ok&&v)?v:prev;
    if(!ok||!v||v===prev)return;
    _TIT[key]=v;
    saveTitulos(function(ok2){
      if(!ok2)return;
      _titAplicar();
      // lo que muestra el nombre de la solapa (elegir opción, carpetas del ZIP, etc.) lo lee de _solapaLabel
      showToast('Título guardado: '+v);
    });
  }
  ['click','pointerdown','mousedown','touchstart'].forEach(function(ev){inp.addEventListener(ev,function(e){e.stopPropagation();});});
  inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter'){e.preventDefault();fin(true);}else if(e.key==='Escape'){fin(false);}});
  inp.addEventListener('blur',function(){fin(true);});
  inp.focus();inp.select();
}
function _titGestos(){
  if(!_admin)return;
  Object.keys(_TIT_DEF).forEach(function(k){
    var el=_titElem(k);if(!el)return;
    el.title='4 toques seguidos para cambiar el nombre';
    _tap4(el,function(){_titRenombrar(el,k);});
  });
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
    .then(function(r){
      if(btn){btn.disabled=false;btn.textContent='Desactivar';}
      // storage.upload no rechaza: devuelve {error}. Sin mirarlo se decía
      // "desactivada" aunque el guardado hubiera fallado.
      if(r&&r.error){showToast('No se pudo desactivar: '+r.error.message);return;}
      if(opt===1){_activeFlyerUrl=null;_activeFlyerName='';}
      showToast(_optLabel(opt)+' desactivada.');
      _fgInvalidateOpt(opt);loadUploadHistory();
    })
    .catch(function(e){if(btn){btn.disabled=false;btn.textContent='Desactivar';}showToast('No se pudo desactivar: '+((e&&e.message)||e));});
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
  // ew3: ancho de la banda cuando hay 3 asesores (la franja está limpia de punta a
  // punta, así los 3 entran separados y los mails no se achican). 1,2 y 4 usan ew.
  contacto:{ex:150,ey:5330,ew:940,ew3:1140,eh:130,bg:"#ffffff",y1:5360,y2:5390,y3:5418,
    xSingle:619,xLeft:310,xRight:930,fnBold:24,frReg:21,color:"#111"},
  legal:{x0:39,yStart:5595,yEnd:6300,maxW:1162,fs:12,lh:17,gap:5,
    minFs:7,minLh:10,minGap:3,color:"#222222",bg:"#ffffff"},
  // Flyer Rubros: el cuadro "Beneficio exclusivo" ENTERO lo dibuja la app (el
  // PDF limpio viene con el cuadro vacío, sólo el dibujo). Así todas las líneas
  // comparten tipografía y no se nota cuál es la inyectada: probamos inyectar
  // sólo el nombre y el tope y, pegadas a las líneas impresas, se notaba la
  // diferencia de trazo. Cada línea: t (texto con {nombre} y {importe};
  // **así** = color2/peso2, para el "25% de ahorro" naranja), x/y (px base,
  // anclado arriba; x = borde izquierdo si align:left, centro si center), fs,
  // peso (400..800), color, mw (ancho máximo: si no entra, se achica).
  // Tipografía Figtree (Google Fonts, la carga _fgBenefFont): comparada sobre el
  // PDF real contra 14 candidatas es la que calza con la letra del flyer.
  // Las plantillas (_BENEF_PLANTILLAS) están medidas sobre los PDFs reales
  // (SIEMENS combustible/supermercado rasterizados a 1240px); el admin las
  // elige y ajusta en el calibrador. Todas las líneas van centradas sobre un
  // mismo eje (el centro del área de texto, a la derecha del dibujo): en el PDF
  // del banco el título va alineado a la izquierda, pero con un nombre de
  // empresa más corto o más largo que SIEMENS quedaba descentrado. Al abrir el
  // calibrador o cargar una plantilla, _calBenefCentrar detecta el cuadro en la
  // imagen y ubica el bloque solo; estos x/y son el respaldo si no lo encuentra.
  benef:{color2:"#fa6400",peso2:800,lineas:null}
};
var _FG_BENEF_FONT='Figtree';
var _BENEF_LINEA_DEF={t:'',x:640,y:2700,fs:17,peso:500,color:'#000000',align:'center',mw:820};
var _BENEF_PLANTILLAS={
  combustible:{nombre:'Combustible',lineas:[
    {t:'¡Beneficio exclusivo {nombre}!',x:723,y:2630,fs:42,peso:800,color:'#fa6400',align:'center',mw:800},
    {t:'**25% de ahorro** en combustible',x:723,y:2675,fs:42,peso:500,color:'#000000',align:'center',mw:800},
    {t:'Los domingos',x:723,y:2735,fs:21,peso:700,color:'#000000',align:'center',mw:800},
    {t:'Tope de reintegro mensual {importe} (5)',x:723,y:2758,fs:16.5,peso:500,color:'#000000',align:'center',mw:800},
    {t:'Válido en todas las estaciones del país',x:723,y:2803,fs:16,peso:500,color:'#000000',align:'center',mw:800},
    {t:'Medio de pago: Tarjeta de débito física',x:723,y:2827,fs:16,peso:500,color:'#000000',align:'center',mw:800}
  ]},
  supermercado:{nombre:'Supermercado',lineas:[
    {t:'Beneficio exclusivo {nombre} !',x:739,y:2627,fs:42,peso:800,color:'#fa6400',align:'center',mw:820},
    {t:'**25% de ahorro** en Supermercados',x:739,y:2703,fs:46,peso:500,color:'#000000',align:'center',mw:820},
    {t:'Los Martes',x:739,y:2739,fs:21,peso:700,color:'#000000',align:'center',mw:800},
    {t:'Tope de reintegro mensual {importe} (10)',x:739,y:2764,fs:16.5,peso:500,color:'#000000',align:'center',mw:800},
    {t:'Medio de pago: Tarjeta de débito física',x:739,y:2788,fs:16,peso:500,color:'#000000',align:'center',mw:800}
  ]},
  // Cuadro con los dos rubros (PDF PMI): título y subtítulo centrados, y dos
  // columnas alineadas a la izquierda. dx = corrimiento respecto del eje del
  // bloque (lo aplica _calBenefCentrar; las líneas sin dx van centradas en el
  // eje). {importe} = supermercado, {importe2} = combustible; `campos` son las
  // etiquetas de los dos topes en el formulario.
  ambos:{nombre:'Ambos (combustible y supermercado)',campos:{importe:'Tope supermercado',importe2:'Tope combustible (si es distinto)'},lineas:[
    {t:'¡Beneficio exclusivo {nombre}!',x:655,y:2529,fs:42,peso:800,color:'#fa6400',align:'center',mw:800},
    {t:'**25% de ahorro** en combustible y supermercado',x:655,y:2573,fs:33,peso:500,color:'#000000',align:'center',mw:780},
    {t:'**25% de ahorro**',x:303,dx:-352,y:2633,fs:37.5,peso:800,color:'#000000',align:'left',mw:330},
    {t:'en supermercados',x:303,dx:-352,y:2669,fs:37.5,peso:500,color:'#000000',align:'left',mw:330},
    {t:'Los martes y domingos',x:303,dx:-352,y:2717,fs:21,peso:700,color:'#000000',align:'left',mw:330},
    {t:'Tope de reintegro mensual {importe} (5)',x:303,dx:-352,y:2739,fs:16.5,peso:500,color:'#000000',align:'left',mw:330},
    {t:'**25% de ahorro**',x:679,dx:24,y:2633,fs:37.5,peso:800,color:'#000000',align:'left',mw:330},
    {t:'en combustible',x:679,dx:24,y:2669,fs:37.5,peso:500,color:'#000000',align:'left',mw:330},
    {t:'Los martes y domingos',x:679,dx:24,y:2717,fs:21,peso:700,color:'#000000',align:'left',mw:330},
    {t:'Tope de reintegro mensual {importe2} (5)',x:679,dx:24,y:2739,fs:16.5,peso:500,color:'#000000',align:'left',mw:330}
  ]}
};
// Etiquetas de los campos del formulario según la plantilla del cartel activo.
var _BENEF_CAMPOS_DEF={importe:'Tope de reintegro mensual',importe2:'Segundo tope (si es distinto)'};
// Líneas del cartel a partir de lo guardado: lista propia si la hay; si la
// calibración es de la versión anterior (titulo/tope sueltos) se convierte a
// dos líneas con sus posiciones; si no hay nada, la plantilla de combustible.
function _fgBenefLineas(cb){
  var src=null;
  if(cb&&Array.isArray(cb.lineas)&&cb.lineas.length)src=cb.lineas;
  else if(cb&&(cb.titulo||cb.tope)){
    src=[];
    if(cb.titulo){var T=cb.titulo;src.push({t:(T.pre!=null?T.pre:'¡Beneficio exclusivo ')+'{nombre}'+(T.post!=null?T.post:'!'),x:T.x,y:T.y,fs:T.fs,peso:800,color:T.color,align:T.align||'left',mw:T.mw});}
    if(cb.tope){var Pp=cb.tope;src.push({t:(Pp.pre!=null?Pp.pre:'Tope de reintegro mensual ')+'{importe}'+(Pp.post!=null?Pp.post:''),x:Pp.x,y:Pp.y,fs:16.5,peso:500,color:Pp.color,align:Pp.align||'center',mw:Pp.mw});}
  }
  else src=_BENEF_PLANTILLAS.combustible.lineas;
  return src.map(function(l){var o=_fgMerge(_BENEF_LINEA_DEF,l);if(!(o.fs>0))o.fs=_BENEF_LINEA_DEF.fs;if(!(o.peso>=100))o.peso=_BENEF_LINEA_DEF.peso;return o;});
}
// Carga la tipografía del cartel (Google Fonts) y, cuando está lista, redibuja:
// el canvas usa la que tenga disponible al momento de dibujar, así que sin
// esto el primer flyer saldría en Arial. Idempotente.
function _fgBenefFont(){
  if(_fgBenefFont._done)return;_fgBenefFont._done=true;
  try{
    if(!document.getElementById('fg-benef-font')){
      var l=document.createElement('link');l.id='fg-benef-font';l.rel='stylesheet';
      l.href='https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(l);
    }
    if(document.fonts&&document.fonts.load){
      Promise.all([400,500,600,700,800].map(function(w){return document.fonts.load(w+' 20px "'+_FG_BENEF_FONT+'"');}))
        .then(function(){if(typeof redraw==='function')redraw();}).catch(function(){});
    }
  }catch(e){}
}
// Busca el cuadro del beneficio en la imagen base para centrar el cartel
// automáticamente (el admin pedía que "por default venga centrado": ubicar seis
// líneas a mano, una por una, es engorroso). Devuelve, en px base (1240 de
// ancho), {top,bottom,left,right,textoX0,textoX1,cx,cy}: el panel, el área de
// texto entre los dibujos (textoX0..textoX1) y su centro. null si no lo encuentra.
// Cómo: sondea el color del panel al 90% del ancho, a la altura aproximada del
// cartel (ySonda: donde están hoy las líneas; prueba también unas filas más
// arriba/abajo por si cayó fuera). Desde ahí extiende por esa columna mientras
// el color se mantenga (filas del panel) y por columna mide cuánto de la altura
// del panel tiene ese color: los bordes son las columnas extremas mayormente
// panel, y el área de texto es el tramo más largo de columnas mayormente panel
// (los dibujos, densos, lo cortan; las letras sueltas o una línea divisoria no,
// porque son huecos cortos). Sólo lee la franja 15%..75% de la altura. Falla (null) si
// el canvas está "tainted" (imagen sin CORS) o la geometría no tiene sentido.
function _fgBenefDetectarCuadro(img,ySonda){
  try{
    var W=_FG_TARGET_W,k=img.width/W,H=Math.round(img.height/k);
    var y0=Math.round(H*0.15),y1=Math.round(H*0.75),bh=y1-y0;
    var cv=document.createElement('canvas');cv.width=W;cv.height=bh;
    var c=cv.getContext('2d',{willReadFrequently:true});
    c.drawImage(img,0,y0*k,img.width,bh*k,0,0,W,bh);
    var d=c.getImageData(0,0,W,bh).data;
    function px(x,y){var i=(y*W+x)*4;return [d[i],d[i+1],d[i+2]];}
    function cerca(p,q,t){return Math.abs(p[0]-q[0])<=t&&Math.abs(p[1]-q[1])<=t&&Math.abs(p[2]-q[2])<=t;}
    // Sondas en x: 90% del ancho, y si ahí hay un dibujo (cuadro con dibujos a
    // los dos lados) el centro, 75% y 25%.
    var XPS=[0.9,0.5,0.75,0.25].map(function(f){return Math.round(W*f);}),TOL=9,base=Math.round((ySonda||H*0.4)-y0);
    for(var paso=0;paso<=5;paso++)for(var sg=-1;sg<=1;sg+=2)for(var xi=0;xi<XPS.length;xi++){
      var ys=base+sg*paso*40,xp=XPS[xi];if(paso===0&&sg>0)continue;
      if(ys<0||ys>=bh)continue;
      var bg=px(W-5,ys),col=px(xp,ys);
      if(cerca(col,bg,10))continue; // fondo de página: la sonda no cayó en el panel
      var top=ys,bot=ys,gap;
      for(gap=0;top>0&&gap<=2;top--){if(cerca(px(xp,top-1),col,TOL))gap=0;else gap++;}
      top+=gap;
      for(gap=0;bot<bh-1&&gap<=2;bot++){if(cerca(px(xp,bot+1),col,TOL))gap=0;else gap++;}
      bot-=gap;
      var ph=bot-top;if(ph<80||ph>900)continue;
      var ya=top+6,yb=bot-6,n=yb-ya+1,frac=new Array(W),x,y,m;
      for(x=0;x<W;x++){m=0;for(y=ya;y<=yb;y++)if(cerca(px(x,y),col,TOL))m++;frac[x]=m/n;}
      var right=-1,left=-1;
      for(x=W-1;x>=0;x--)if(frac[x]>=0.5){right=x;break;}
      for(x=0;x<W;x++)if(frac[x]>=0.5){left=x;break;}
      if(right<0||left<0||right-left<300)continue;
      // Área de texto: el tramo más largo de columnas mayormente panel entre
      // los dibujos (puede haber uno a cada lado, como en el cuadro "Ambos").
      // Los huecos cortos (letras sueltas, la línea divisoria) no cortan el tramo.
      var GAPMAX=24,bx0=-1,bx1=-1,rx0=-1,rx1=-1,hueco=0;
      for(x=left;x<=right;x++){
        if(frac[x]>=0.6){if(rx0<0)rx0=x;rx1=x;hueco=0;}
        else if(rx0>=0&&++hueco>GAPMAX){if(rx1-rx0>bx1-bx0){bx0=rx0;bx1=rx1;}rx0=-1;rx1=-1;hueco=0;}
      }
      if(rx0>=0&&rx1-rx0>bx1-bx0){bx0=rx0;bx1=rx1;}
      if(bx0<0||bx1-bx0<250)continue;
      return {top:top+y0,bottom:bot+y0,left:left,right:right,textoX0:bx0,textoX1:bx1,cx:Math.round((bx0+bx1)/2),cy:Math.round((top+bot)/2+y0)};
    }
    return null;
  }catch(e){return null;}
}
function _fgMerge(a,b){var o={};for(var k in a)o[k]=a[k];if(b)for(var k2 in b)if(b[k2]!=null)o[k2]=b[k2];return o;}
function _fgCfg(){
  var d=FLYER_CFG_DEFAULT,c=window.FLYER_CFG||{},cb=c.benef||{};
  return {imgW:c.imgW||d.imgW,imgH:c.imgH||d.imgH,
    cropH:c.cropH||0, // altura final fijada a mano (0 = automático)
    bottomMargin:(c.bottomMargin!=null?c.bottomMargin:d.bottomMargin),
    empresa:_fgMerge(d.empresa,c.empresa),montos:_fgMerge(d.montos,c.montos),
    contacto:_fgMerge(d.contacto,c.contacto),legal:_fgMerge(d.legal,c.legal),
    benef:{color2:cb.color2||d.benef.color2,peso2:cb.peso2||d.benef.peso2,lineas:_fgBenefLineas(cb),campos:_fgMerge(_BENEF_CAMPOS_DEF,cb.campos||null)}};
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
  if(v.benef)fgDrawBenef(c,s,v);      // Flyer Rubros: cartel del beneficio exclusivo
  var cb=fgDrawContacto(c,s,v)||0;   // fondo (px escalados) del bloque de asesores
  var lb=fgDrawLegal(c,s,_fgLegalConValores(v.legal,v))||0; // fondo (px escalados) del último renglón de legales
  var bottomScaled=Math.max(cb,lb);
  // guardo el fondo del contenido en coords base para poder recortar el blanco sobrante
  window._fgContentBottomBase=(s>0?bottomScaled/s:bottomScaled);
}
// Color REAL del fondo del flyer en la fila y, muestreado en 5 puntos entre x0 y
// x1 (mediana: un píxel de letra suelto no lo desvía). Las zonas que se tapan
// antes de escribir (empresa, montos) usan esto en vez de un color fijo: el tono
// del PDF cambia de una versión a otra y con color fijo se notaba el cuadrito.
// Si el canvas no deja leer píxeles (imagen sin CORS), cae en fallback.
function _fgBgMuestra(c,x0,x1,y,fallback){
  try{
    var rs=[],gs=[],bs=[];y=Math.max(1,Math.round(y));
    for(var k=0;k<5;k++){
      var x=Math.max(1,Math.round(x0+(x1-x0)*(k+0.5)/5));
      var d=c.getImageData(x,y,1,1).data;rs.push(d[0]);gs.push(d[1]);bs.push(d[2]);
    }
    function med(a){a.sort(function(p,q){return p-q;});return a[2];}
    return 'rgb('+med(rs)+','+med(gs)+','+med(bs)+')';
  }catch(e){return fallback;}
}
function fgDrawEmpresa(c,s,empresa){
  var E=_fgCfg().empresa,se=_fgSE(s);
  var xc=Math.round(E.xc*se),yc=Math.round(E.yc*se);
  var lh=Math.round(E.lh*se),mw=Math.round(E.mw*se),fs=Math.round(E.fs*se);
  var ex=Math.round(E.ex*se),ry=yc-lh;
  c.fillStyle=_fgBgMuestra(c,ex,ex+mw,ry-Math.max(3,Math.round(4*se)),E.bg); // fondo real, justo arriba del recuadro
  c.fillRect(ex,ry,mw,lh*2+Math.round(8*se));
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
// Flyer Rubros: dibuja TODAS las líneas del cartel "Beneficio exclusivo" (ver
// FLYER_CFG_DEFAULT.benef). {nombre}/{importe} se reemplazan por lo cargado; una
// línea que usa {importe} sin importe no se escribe. **segmento** va en
// color2/peso2 (el "25% de ahorro" naranja). Si la línea no entra en mw se
// achica la letra (como el nombre de empresa).
function _fgBenefSegs(t){
  var out=[],re=/\*\*([^*]+)\*\*/g,m,last=0;
  while((m=re.exec(t))!==null){if(m.index>last)out.push({t:t.slice(last,m.index),f:false});out.push({t:m[1],f:true});last=m.index+m[0].length;}
  if(last<t.length)out.push({t:t.slice(last),f:false});
  return out;
}
function fgDrawBenef(c,s,v){
  var B=_fgCfg().benef,se=_fgSE(s),fam='"'+_FG_BENEF_FONT+'",Arial,sans-serif';
  // benefNombre puede venir vacío a propósito ("¡Beneficio exclusivo!" sin
  // empresa): se saca el {nombre} con sus espacios y no queda espacio antes del
  // signo. importe2 (segundo tope, cuadro "Ambos") cae en importe si no se cargó.
  var nombre=(v.benefNombre==null?'':String(v.benefNombre)).trim(),importe=v.importe||'',importe2=v.importe2||importe;
  (B.lineas||[]).forEach(function(L){
    var t=String(L.t||'');
    if(t.indexOf('{importe}')>=0&&!importe.trim())return;
    if(t.indexOf('{importe2}')>=0&&!importe2.trim())return;
    if(nombre)t=t.replace(/\{nombre\}/g,function(){return nombre;});
    else t=t.replace(/\s*\{nombre\}\s*/g,' ').replace(/\s+([!?.,;:])/g,'$1').replace(/\s{2,}/g,' ').trim();
    t=t.replace(/\{importe2\}/g,function(){return importe2;}).replace(/\{total\}/g,function(){return _fgImporteSuma(importe,importe2);}).replace(/\{importe\}/g,function(){return importe;});
    if(!t.trim())return;
    var segs=_fgBenefSegs(t),fs=Math.round(L.fs*se*2)/2,mw=Math.round(L.mw*se);
    function font(seg,size){return (seg.f?(B.peso2||800):(L.peso||500))+' '+size+'px '+fam;}
    function ancho(size){var w=0;segs.forEach(function(sg){c.font=font(sg,size);w+=c.measureText(sg.t).width;});return w;}
    var w=ancho(fs);
    if(w>mw&&w>0){fs=Math.max(Math.floor(fs*mw/w*2)/2,Math.max(1,Math.round(8*se)));w=ancho(fs);}
    var x=Math.round(L.x*se),y=Math.round(L.y*se);
    var cx=(L.align==='center')?x-w/2:x;
    c.textBaseline='middle';c.textAlign='left';
    segs.forEach(function(sg){
      c.font=font(sg,fs);c.fillStyle=sg.f?(B.color2||'#fa6400'):(L.color||'#000');
      c.fillText(sg.t,cx,y);cx+=c.measureText(sg.t).width;
    });
  });
}
function fgDrawMontos(c,s,v){
  var M=_fgCfg().montos,se=_fgSE(s);
  var my=Math.round(M.y*se),fs=Math.round(M.fs*se);
  // "sin cashback": hay que TAPAR igual la zona (por si el flyer trae importes
  // impresos debajo) pero sin escribir número y sin que se vean cuatro cajitas
  // vacías: pinto con el color real del fondo, muestreado del margen izquierdo
  // a la misma altura. Si el canvas no deja leer píxeles, caigo en M.bg.
  var vals=v.nocb?['','','','']:[v.m1,v.m2,v.m3,v.m4];
  // Color de fondo REAL justo arriba de cada caja (_fgBgMuestra), con o sin
  // cashback: el tono del flyer cambia entre versiones del PDF y con M.bg fijo
  // se notaba el recuadro alrededor de cada importe.
  function _bgDe(mx,mw,mh){
    return _fgBgMuestra(c,mx-mw/2,mx+mw/2,my-Math.round(mh/2)-Math.max(4,Math.round(5*se)),M.bg);
  }
  M.boxes.forEach(function(m,i){
    var mx=Math.round(m.xc*se),mw=Math.round(m.ew*se),mh=Math.round(M.mh*se);
    c.fillStyle=_bgDe(mx,mw,mh);c.fillRect(mx-mw/2,my-mh/2,mw,mh);
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
  // Con 3 asesores la banda se ENSANCHA (a ew3, centrada donde está la de siempre):
  // la franja está limpia de punta a punta, así los tres quedan más separados y los
  // mails entran sin achicar la letra. Con 1, 2 y 4 queda EXACTAMENTE como estaba.
  var bx=C.ex,bw=C.ew;
  if(n===3){
    var im=_fgCfg().imgW||1240,w3=C.ew3||C.ew;
    if(w3<C.ew)w3=C.ew;if(w3>im)w3=im;
    bw=w3;bx=C.ex+C.ew/2-w3/2;
    if(bx<0)bx=0;if(bx+bw>im)bx=im-bw;
  }
  c.fillStyle=C.bg;
  c.fillRect(Math.round(bx*se),boxTop,Math.round(bw*se),boxH);
  if(!n)return boxTop+boxH;
  var xs,colW;
  if(n===1){xs=[C.xSingle];colW=C.ew;}
  else if(n===2){xs=[C.xLeft,C.xRight];colW=C.ew/2;}
  else if(n===3){xs=[bx+bw/6,bx+bw/2,bx+5*bw/6];colW=bw/3;}
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
// Marcadores dentro del legal: {importe}, {importe2} y {empresa} (alias {nombre})
// se reemplazan por los valores del flyer al dibujar (el legal lo escribe la app
// desde el texto, así que es sólo texto: sin recuadros ni posiciones). Así el
// legal de Rubros ("… $24.000 en Supermercados y $30.000 en Combustibles") sigue
// al tope sin editarlo a mano. Un marcador sin valor (p. ej. {importe} en Flyer
// Galicia) se saca para que nunca quede impreso. El texto guardado y el del
// textarea conservan el marcador. Replacer por función: el texto trae "$".
// {total} = importe + importe2 ("$24.000" + "$30.000" → "$54.000"); vacío sin importes.
function _fgImporteSuma(a,b){
  var da=(a==null?'':String(a)).replace(/\D/g,''),db=(b==null?'':String(b)).replace(/\D/g,'');
  if(!da&&!db)return '';
  return _fgFmtImporte(String((parseInt(da||'0',10)||0)+(parseInt(db||'0',10)||0)));
}
function _fgLegalConValores(text,v){
  text=(text==null?'':String(text));
  if(text.indexOf('{')<0)return text;
  v=v||{};
  var imp=v.importe||'',imp2=v.importe2||imp,emp=v.empresa||'';
  var vals={importe:imp,importe2:imp2,total:_fgImporteSuma(imp,imp2),empresa:emp,nombre:emp};
  return text.replace(/\{\s*(importe2|importe|total|empresa|nombre)\s*\}( ?)/gi,function(_m,k,sp){
    var val=vals[k.toLowerCase()]||'';
    return val?val+sp:''; // sin valor: se va el marcador y el espacio que lo seguía
  });
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
// El canvas completo se reutiliza entre redibujos (antes se creaba uno nuevo por cada
// tecla/zoom: con zoom alto son ~150MB reservados y tirados cada vez) y su contexto
// lleva willReadFrequently porque _fgBgMuestra le lee píxeles; sin eso cada lectura
// baja el canvas entero de la GPU. Juntas, estas dos cosas trababan la vista previa.
var _fgFullCv=null,_fgFullCtx=null;
function fgRedraw(){
  if(!window.baseImg||!baseImg.width)return;
  _fgBenefSyncNombre(); // la empresa puede cambiar sin evento input (padrón, historial)
  var v=getVals();
  _fgExtra=_fgExtraBaseFor(v); // el canvas tiene que contemplar el crecimiento
  var w=Math.round(baseImg.width*SC),fh=Math.round((baseImg.height+_fgExtra)*SC);
  if(!_fgFullCv){_fgFullCv=document.createElement('canvas');_fgFullCtx=_fgFullCv.getContext('2d',{willReadFrequently:true});}
  var full=_fgFullCv;
  if(full.width!==w||full.height!==fh){full.width=w;full.height=fh;}else _fgFullCtx.clearRect(0,0,w,fh);
  fgDrawAll(_fgFullCtx,SC,v); // setea _fgContentBottomBase
  var h=Math.min(fh,Math.round(_fgFinalHeightBase()*SC));
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
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
  if(_can('asesores_guardados'))_initAsesoresUI(); // popover de asesores guardados en 3 y 4
  if(_can('pegar_oficial'))_fgEnsurePasteBtns(); // botones de pegado en los asesores 3 y 4 recien creados
}
// ── PRESENTACIÓN: el formulario del individual en tarjetas ────────────────────
// Agrupa cada ".sec" del template con lo que le sigue dentro de <div class="fg-card">
// (sólo presentación: los ids y el orden relativo no cambian, así los toggles
// de asesores (_fgBlock mira hermanos), el padrón y los campos inyectados
// siguen funcionando). Los cuatro "Asesor N" van en UNA tarjeta "Oficiales" con
// subtítulos; los botones (.btns) quedan afuera. Estilos en _newcss.txt (.fg-card).
function _fgCardify(){
  try{
    var tab=document.getElementById('tab-individual');if(!tab||tab.querySelector('.fg-card'))return;
    var kids=Array.prototype.slice.call(tab.children),card=null,asesores=false;
    function nueva(titulo){
      card=document.createElement('div');card.className='fg-card';
      if(titulo){var h=document.createElement('div');h.className='fg-card-h';h.textContent=titulo;card.appendChild(h);}
      tab.appendChild(card);
    }
    kids.forEach(function(el){
      if(el.classList.contains('btns')){card=null;tab.appendChild(el);return;}
      if(el.classList.contains('sec')){
        var esA=/^asesor\s*\d/i.test(el.textContent.trim());
        if(esA){if(!asesores){nueva('Oficiales');asesores=true;}el.classList.add('sec-sub');card.appendChild(el);return;}
        asesores=false;nueva(null);card.appendChild(el);return;
      }
      if(!card)nueva(null);
      card.appendChild(el);
    });
  }catch(e){console.warn('cardify:',e);}
}
// ── AUTOCOMPLETAR EL MAIL DESDE EL NOMBRE ─────────────────────────────────────
// Patrón Galicia: nombre.apellido@bancogalicia.com.ar
// Ojo con dos casos reales: "Julieta A. De Santis" -> julieta.desantis (la partícula
// "De" va pegada) y "Genesis Lisbeth Puerto" -> genesis.puerto (el segundo nombre NO
// entra). Por eso: descarto iniciales, tomo la última palabra y le pego hacia atrás
// sólo las partículas.
var _FG_PARTICULAS=['de','del','la','las','los','le','di','da','dos','do','van','von','mac','mc','san','santa'];
function _fgSlug(s){
  return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function _fgMailFromName(name){
  var w=(name||'').trim().split(/\s+/).filter(Boolean);
  if(w.length<2)return '';
  var first=_fgSlug(w[0]);if(!first)return '';
  var rest=w.slice(1).filter(function(x){return x.replace(/\./g,'').length>1;}); // fuera iniciales
  if(!rest.length)return '';
  var i=rest.length-1,parts=[_fgSlug(rest[i])];
  while(i-1>=0&&_FG_PARTICULAS.indexOf(_fgSlug(rest[i-1]))!==-1){i--;parts.unshift(_fgSlug(rest[i]));}
  var last=parts.join('');
  return last?(first+'.'+last+'@bancogalicia.com.ar'):'';
}
function _fgAutoMail(){
  [1,2,3,4].forEach(function(i){
    var sfx=(i===1)?'':String(i);
    var nEl=document.getElementById('nombre'+sfx),mEl=document.getElementById('email'+sfx);
    if(!nEl||!mEl||nEl.dataset.fgMail)return;
    nEl.dataset.fgMail='1';
    // si tocás el mail a mano, dejo de sugerir; si lo dejás vacío, vuelvo a sugerir.
    // (Antes la marca quedaba puesta con el mail vacío: la primera sugerencia entraba
    // y ya no se actualizaba — quedaba "julian.vi@" al seguir tipeando el apellido.)
    mEl.addEventListener('input',function(){mEl.dataset.fgManual=mEl.value.trim()?'1':'';});
    nEl.addEventListener('input',function(){
      if(mEl.dataset.fgManual==='1'&&mEl.value.trim()!=='')return;
      var m=_fgMailFromName(nEl.value);
      if(m){mEl.value=m;if(typeof redraw==='function')redraw();}
    });
  });
}
// ── ALTA PROGRESIVA DE ASESORES ───────────────────────────────────────────────
// En vez de mostrar los 4 bloques de entrada (mucho ruido para el caso normal de
// 1 o 2 asesores), arranca sólo el Asesor 1 y un botón "+ Agregar asesor" que va
// abriendo el siguiente. NADA se oculta solo: sacar un asesor es siempre explícito
// (✕ Quitar) y no borra lo cargado, así que no se pierde nada sin querer.
function _fgBlock(n){
  var f=document.getElementById('fields'+n);if(!f)return null;
  var row=f.previousElementSibling;if(!row||!row.classList.contains('toggle-row'))return null;
  var sec=row.previousElementSibling;if(!sec||!sec.classList.contains('sec'))return null;
  return {sec:sec,row:row,fields:f};
}
function _fgAsesorOn(n){
  if(n===1)return (typeof a1==='undefined')?true:!!a1;
  if(n===2)return (typeof a2!=='undefined')&&!!a2;
  return (n===3)?_fgA3:_fgA4;
}
function _fgSetAsesorOn(n,on){
  if(_fgAsesorOn(n)===!!on)return;
  if(n===1&&typeof toggleA1==='function')toggleA1();
  else if(n===2&&typeof toggleA2==='function')toggleA2();
  else if(n===3)toggleA3();
  else if(n===4)toggleA4();
}
// Muestra/oculta el bloque entero (título + fila del switch + campos).
// La fila del switch queda siempre oculta EN LOS CUATRO: el alta la maneja el
// botón "+ Agregar asesor" y la baja el "✕ Quitar", incluido el Asesor 1 (antes
// el 1 era el único con switch a la vista y sin Quitar: dos formas distintas de
// hacer lo mismo en la misma tarjeta).
function _fgShowBlock(n,show){
  var b=_fgBlock(n);if(!b)return;
  b.sec.style.display=show?'':'none';
  b.fields.style.display=show?'':'none';
  b.row.style.display='none';
  if(show&&!b.sec.dataset.fgDel){
    b.sec.dataset.fgDel='1';
    b.sec.insertAdjacentHTML('beforeend',
      ' <span class="fg-del" onclick="event.stopPropagation();_fgRemoveAsesor('+n+')" title="Quitar asesor '+n+'">&#10005; Quitar</span>');
  }
}
function _fgIsBlockVisible(n){
  var b=_fgBlock(n);return !!(b&&b.sec.style.display!=='none');
}
function _fgAddNextAsesor(){
  for(var n=1;n<=4;n++){ // arranca en 1: si se quitó el Asesor 1, este botón lo recupera
    if(_fgIsBlockVisible(n))continue;
    _fgShowBlock(n,true);_fgSetAsesorOn(n,true);_fgRefreshAddBtn();
    var el=document.getElementById('nombre'+(n===1?'':n));if(el)el.focus();
    return;
  }
}
// Quitar NO borra lo cargado: sólo lo saca del flyer y esconde el bloque.
// Si lo volvés a agregar, los datos siguen ahí.
function _fgRemoveAsesor(n){
  _fgSetAsesorOn(n,false);_fgShowBlock(n,false);_fgRefreshAddBtn();
  if(typeof redraw==='function')redraw();
}
function _fgRefreshAddBtn(){
  var b=document.getElementById('fg-add-asesor');if(!b)return;
  var libre=false;for(var n=1;n<=4;n++)if(!_fgIsBlockVisible(n))libre=true;
  b.style.display=libre?'':'none';
}
function _fgEnsureAddBtn(){
  if(document.getElementById('fg-add-asesor'))return;
  var f4=document.getElementById('fields4');if(!f4||!f4.parentNode)return;
  if(!document.getElementById('fg-add-style')){
    var st=document.createElement('style');st.id='fg-add-style';
    st.textContent=
      '#fg-add-asesor{display:block;width:100%;margin:2px 0 14px;padding:9px;border:1.5px dashed rgba(128,128,128,.5);'+
      'background:none;border-radius:8px;cursor:pointer;font-size:.78rem;font-weight:600;color:var(--gray,#777);transition:.15s}'+
      '#fg-add-asesor:hover{border-color:var(--red,#c62828);color:var(--red,#c62828)}'+
      '.fg-del{float:right;font-size:.62rem;font-weight:600;color:var(--gray,#999);cursor:pointer;'+
      'text-transform:none;letter-spacing:0;background:none;padding:0}'+
      '.fg-del:hover{color:var(--red,#c62828)}';
    document.head.appendChild(st);
  }
  f4.insertAdjacentHTML('afterend',
    '<button type="button" id="fg-add-asesor" onclick="_fgAddNextAsesor()">+ Agregar asesor</button>');
}
// ── FLYER RUBROS: campos del beneficio exclusivo ─────────────────────────────
// Sólo se ven cuando la opción activa es de la solapa "Flyer Rubros" (ver
// _fgSyncVista). El nombre se copia solo desde "Nombre de la empresa" hasta que
// se toque a mano (si se borra, vuelve a copiarse), igual que el nombre de archivo.
var _fgBenefManual=false;
// "24000" / "24.000" / "$ 24.000" -> "$24.000". Sin dígitos -> ''.
function _fgFmtImporte(raw){
  var d=(raw==null?'':String(raw)).replace(/\D/g,'').replace(/^0+(?=\d)/,'');
  if(!d)return '';
  return '$'+d.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function _fgBenefSyncNombre(){
  var b=document.getElementById('benef-nombre'),e=document.getElementById('empresa');
  if(!b||!e||_fgBenefManual)return;
  if(b.value!==e.value)b.value=e.value;
}
function _fgEnsureBenefFields(){
  if(document.getElementById('fg-benef-fields'))return;
  var emp=document.getElementById('empresa');if(!emp)return;
  // el .field contenedor (la lupa del padrón envuelve el input en .fg-pad-wrap)
  var field=emp.closest?emp.closest('.field'):emp.parentNode;
  if(!field||!field.parentNode)return;
  if(!document.getElementById('fg-benef-style')){
    var st=document.createElement('style');st.id='fg-benef-style';
    st.textContent='#fg-benef-fields .fg-benef-hint{font-size:.66rem;color:var(--gray,#777);line-height:1.4;margin:-4px 0 8px}'+
      '#fg-benef-fields .fg-benef-nom{display:flex;gap:6px;align-items:center}#fg-benef-fields .fg-benef-nom input{flex:1;min-width:0}'+
      '#benef-nombre-auto{flex:none;width:30px;height:30px;border-radius:7px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer;font-size:1rem;line-height:1}#benef-nombre-auto:hover{border-color:var(--orange,#f5921e);color:var(--orange,#f5921e)}';
    document.head.appendChild(st);
  }
  field.insertAdjacentHTML('afterend',
    '<div id="fg-benef-fields" style="display:none">'+
      '<div class="sec">Beneficio exclusivo</div>'+
      '<div class="field"><label>Nombre en el beneficio</label>'+
        '<div class="fg-benef-nom"><input type="text" id="benef-nombre" placeholder="Se copia de la empresa" autocomplete="off">'+
        '<button type="button" id="benef-nombre-auto" title="Volver a copiar el nombre de la empresa" onclick="_fgBenefNombreAuto()">&#8635;</button></div></div>'+
      '<div class="fg-benef-hint">Sale como &laquo;&iexcl;Beneficio exclusivo <b>NOMBRE</b>!&raquo;. Se completa solo con la empresa; si lo cambi&aacute;s queda lo tuyo. Borralo para que diga s&oacute;lo &laquo;&iexcl;Beneficio exclusivo!&raquo;; &#8635; vuelve a copiar la empresa. En el legal, <code>{importe}</code>, <code>{importe2}</code>, <code>{total}</code> (la suma) y <code>{empresa}</code> se reemplazan solos por lo cargado ac&aacute;.</div>'+
      '<div class="field"><label id="benef-importe-lbl">Tope de reintegro mensual</label>'+
        '<input type="text" id="benef-importe" value="24.000" placeholder="24.000" inputmode="numeric" autocomplete="off"></div>'+
      '<div class="field" id="fg-benef-imp2" style="display:none"><label id="benef-importe2-lbl">Segundo tope (si es distinto)</label>'+
        '<input type="text" id="benef-importe2" placeholder="Igual al otro" inputmode="numeric" autocomplete="off"></div>'+
    '</div>');
  var bn=document.getElementById('benef-nombre');
  bn.addEventListener('input',function(){
    _fgBenefManual=true; // vaciarlo también vale: "¡Beneficio exclusivo!" sin empresa
    if(typeof redraw==='function')redraw();
  });
  ['benef-importe','benef-importe2'].forEach(function(id){
    var bi=document.getElementById(id);
    bi.addEventListener('input',function(){if(typeof redraw==='function')redraw();});
    bi.addEventListener('blur',function(){
      var f=_fgFmtImporte(bi.value);
      bi.value=f?f.slice(1):''; // en el campo va sin "$" (se agrega al dibujar)
      if(typeof redraw==='function')redraw();
    });
  });
  // el listener de #empresa del template ya redibuja; acá sólo copio el nombre antes
  emp.addEventListener('input',_fgBenefSyncNombre);
  _fgBenefFieldsSync();
  _fgBenefFont(); // la tipografía del cartel, lista antes del primer flyer de Rubros
}
function _fgBenefNombreAuto(){
  _fgBenefManual=false;_fgBenefSyncNombre();
  if(typeof redraw==='function')redraw();
}
// ¿El cartel de la opción activa usa un segundo tope ({importe2})?
function _fgBenefUsaImporte2(){
  try{return (_fgCfg().benef.lineas||[]).some(function(l){return String(l.t||'').indexOf('{importe2}')>=0;});}catch(e){return false;}
}
// Muestra el segundo tope sólo si el cartel lo usa, y pone las etiquetas que
// trae la plantilla (p. ej. "Tope supermercado" / "Tope combustible").
function _fgBenefFieldsSync(){
  var w=document.getElementById('fg-benef-imp2');if(!w)return;
  var campos;try{campos=_fgCfg().benef.campos||{};}catch(e){campos={};}
  var l1=document.getElementById('benef-importe-lbl'),l2=document.getElementById('benef-importe2-lbl');
  if(l1)l1.textContent=campos.importe||_BENEF_CAMPOS_DEF.importe;
  if(l2)l2.textContent=campos.importe2||_BENEF_CAMPOS_DEF.importe2;
  w.style.display=_fgBenefUsaImporte2()?'':'none';
  _fgMasivoHint();
}
// Nota en la pestaña Masivo con las columnas del cartel de la opción activa.
function _fgMasivoHint(){
  var tab=document.getElementById('tab-masivo');if(!tab)return;
  var h=document.getElementById('fg-masivo-hint');
  if(!h){h=document.createElement('div');h.id='fg-masivo-hint';h.style.cssText='font-size:.7rem;color:var(--gray,#777);line-height:1.45;margin:6px 0 10px;padding:7px 10px;border-radius:8px;background:rgba(245,146,30,.08);border:1px solid rgba(245,146,30,.3)';
    var btn=tab.querySelector('.template-btn');if(btn&&btn.parentNode)btn.parentNode.insertBefore(h,btn.nextSibling);else tab.appendChild(h);}
  if(_fgVista!=='rubros'){h.style.display='none';return;}
  var campos;try{campos=_fgCfg().benef.campos||{};}catch(e){campos={};}
  var dos=_fgBenefUsaImporte2();
  h.style.display='';
  h.innerHTML='<b>Columnas del cartel en '+_escHtml(_optLabel(_fgOpt))+':</b> <code>beneficio</code> = nombre en &laquo;&iexcl;Beneficio exclusivo &hellip;!&raquo; (vac&iacute;o = la empresa, <code>-</code> = sin nombre) &middot; '+
    '<code>importe</code> = <b>'+_escHtml(campos.importe||_BENEF_CAMPOS_DEF.importe)+'</b>'+
    (dos?' &middot; <code>importe2</code> = <b>'+_escHtml(campos.importe2||_BENEF_CAMPOS_DEF.importe2)+'</b> (vac&iacute;o = igual al otro)':'')+
    '. Sin importe en la fila se usa el del formulario.';
}
// Deja visibles sólo los bloques que tienen datos (o están activos). Se usa al
// iniciar y al Restaurar: nunca en medio de la edición.
function _fgSyncAsesorBlocks(){
  for(var n=1;n<=4;n++){
    var el=document.getElementById('nombre'+(n===1?'':n));
    var tiene=!!(el&&el.value.trim())||_fgAsesorOn(n);
    _fgShowBlock(n,tiene);
  }
  _fgRefreshAddBtn();
}
// Unifica las etiquetas de los switches: "Agregar asesor 1..4".
// El template trae "Mostrar asesor 1" y "Agregar segundo asesor"; como lo regenerás,
// lo normalizo acá. Uso el id del switch (sw1..sw4) para saber el número, así no
// depende del texto que traiga el HTML.
function _fgFixAsesorLabels(){
  var rows=document.querySelectorAll('.toggle-row');
  Array.prototype.forEach.call(rows,function(r){
    var sw=r.querySelector('.sw');if(!sw||!sw.id)return;
    var n=parseInt(String(sw.id).replace(/\D/g,''),10);
    if(!n||n<1||n>4)return;
    var sp=r.querySelector('span');
    if(sp)sp.textContent='Agregar asesor '+n;
  });
}
// getVals ampliado a 4 asesores (pisa el de _source.html, que sólo conoce 2).
function fgGetVals(){
  function g(id){var e=document.getElementById(id);return e?e.value:'';}
  function cel(id){var t=g(id).trim();return t?'Cel: '+t:'';}
  var c=CONFIGS[ac]||CONFIGS[0];
  return{
    empresa:g('empresa'),
    nocb:_fgNoCB,
    config:_fgNoCB?'Sin cashback':((typeof CNAMES!=='undefined'&&CNAMES[ac])?CNAMES[ac]:''),
    m1:c.m1,m2:c.m2,m3:c.m3,m4:c.m4,
    has1:(typeof a1==='undefined'?true:a1)&&g('nombre').trim()!=='',
    nombre:g('nombre'),celular:cel('celular'),email:g('email'),
    has2:(typeof a2!=='undefined'&&a2)&&g('nombre2').trim()!=='',
    nombre2:g('nombre2'),celular2:cel('celular2'),email2:g('email2'),
    has3:_fgA3&&g('nombre3').trim()!=='',
    nombre3:g('nombre3'),celular3:cel('celular3'),email3:g('email3'),
    has4:_fgA4&&g('nombre4').trim()!=='',
    nombre4:g('nombre4'),celular4:cel('celular4'),email4:g('email4'),
    legal:g('legal-text'),
    // Flyer Rubros: el cartel "¡Beneficio exclusivo NOMBRE!" + tope. benef va en
    // v (no en estado global) para que historial, masivo y calibrador rindan igual.
    benef:_fgVista==='rubros',
    benefNombre:g('benef-nombre').trim(), // vacío a propósito = "¡Beneficio exclusivo!" sin empresa
    importe:_fgFmtImporte(g('benef-importe')),
    importe2:_fgFmtImporte(g('benef-importe2'))||_fgFmtImporte(g('benef-importe'))
  };
}

// ── HISTORIAL con opción (color) ──────────────────────────────────────────────
// Piso addHistory/renderHistory/redlPDF/loadHistory de _source.html (que regenera)
// para guardar y mostrar en qué opción se generó cada flyer.
function fgAddHistory(v,fn,canvas){
  var d=new Date();
  var hora=d.getHours()+':'+String(d.getMinutes()).padStart(2,'0');
  flyerHistory.unshift({v:JSON.parse(JSON.stringify(v)),fn:fn,
    thumb:_fgHistThumb(canvas),hora:hora,ts:d.getTime(),
    ac:(typeof ac!=='undefined'?ac:0),opt:_optN(_fgOpt)});
  while(flyerHistory.length>_fgHistMax())flyerHistory.pop();
  _fgWorkSaveHist(); // persistente sólo con la facultad "Guardar historial y borrador"
}
// Miniatura chica (120px de ancho): antes se guardaba el canvas entero a calidad
// 0.25 (cientos de KB por ítem). La tarjeta del historial la muestra a 32x56px,
// así que con esto alcanza de sobra y entra en el almacenamiento del navegador.
function _fgHistThumb(canvas){
  try{
    var w=120,h=Math.max(1,Math.round(canvas.height*w/canvas.width));
    var c=document.createElement('canvas');c.width=w;c.height=h;
    c.getContext('2d').drawImage(canvas,0,0,w,h);
    return c.toDataURL('image/jpeg',0.7);
  }catch(e){return canvas.toDataURL('image/jpeg',0.25);}
}
function _fgHistMax(){return _fgWorkOn?20:10;}
// "18:32" si es de hoy, "ayer 18:32", o "12/09 18:32" (los ítems guardados de otros días).
function _fgHistWhen(h){
  if(!h.ts)return h.hora||'';
  var d=new Date(h.ts),n=new Date();
  var hoy=d.toDateString()===n.toDateString();
  var ayer=new Date(n.getTime()-86400000).toDateString()===d.toDateString();
  if(hoy)return h.hora;
  if(ayer)return 'ayer '+h.hora;
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+h.hora;
}
function fgRenderHistory(){
  var el=document.getElementById('history-list');if(!el)return;
  if(!flyerHistory.length){el.innerHTML='<div class="history-empty">&#128337; Todavía no generaste ningún flyer.</div>';return;}
  el.innerHTML=flyerHistory.map(function(h,i){
    var o=_optN(h.opt||1);
    return '<div class="hist-item" onclick="loadHistory('+i+')" style="border-left:4px solid '+_optColor(o)+'">'
      +'<img class="hist-thumb" src="'+h.thumb+'">'
      +'<div class="hist-info"><strong>'+_escHtml(h.v.empresa||'')+'</strong>'
      +'<span>'+_escHtml(h.fn||'')+' · '+_escHtml(_fgHistWhen(h))+'</span>'
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
  if(_can('opcion_'+o)&&o!==_optN(_fgOpt)){showToast('Cambiando a '+_optLabel(o)+'...');switchFlyerOption(o,fn2);}
  else if(_fgOptLoading[o])_fgOptLoading[o].push(fn2); // ya es la activa pero todavía carga: espero a que aplique
  else fn2();
}
function fgRedlPDF(i){
  var h=flyerHistory[i];if(!h)return;
  _fgWithOpt(h.opt||1,function(){savePDF(fullRes(h.v),h.v,true);}); // sin aviso de rubro: es un flyer ya hecho
}
function fgLoadHistory(i){
  var h=flyerHistory[i];if(!h)return;
  _fgApplyHistItem(h);
}
// Vuelca un ítem {v,ac,opt} al formulario. Lo usan el Historial y el borrador
// automático (que guarda exactamente la misma forma).
function _fgApplyHistItem(h){
  _fgWithOpt(h.opt||1,function(){
    var s=function(id,val){var e=document.getElementById(id);if(e)e.value=val;};
    s('empresa',h.v.empresa||'');
    if(h.v.legal)s('legal-text',h.v.legal);
    // Flyer Rubros: nombre del beneficio (manual sólo si difería de la empresa) y tope sin "$"
    if(h.v.benef){
      var bn=h.v.benefNombre||'';
      _fgBenefManual=(bn!==(h.v.empresa||'')); // vacío también es manual
      s('benef-nombre',bn);
      var imp=_fgFmtImporte(h.v.importe),imp2=_fgFmtImporte(h.v.importe2);
      s('benef-importe',imp?imp.slice(1):'');
      s('benef-importe2',(imp2&&imp2!==imp)?imp2.slice(1):'');
    }
    // Los 4 asesores se aplican SIEMPRE, los tuviera o no el flyer guardado.
    // Antes sólo se tocaban los que el ítem tenía, así que cargar un flyer de 1
    // asesor después de uno de 3 dejaba pegados los otros dos del anterior.
    [1,2,3,4].forEach(function(k){
      var sfx=(k===1)?'':String(k);
      var hay=(k===1&&h.v.has1===undefined)?!!(h.v.nombre||'').trim():!!h.v['has'+k];
      s('nombre'+sfx,hay?(h.v['nombre'+sfx]||''):'');
      s('celular'+sfx,hay?((h.v['celular'+sfx]||'').replace('Cel: ','')):'');
      s('email'+sfx,hay?(h.v['email'+sfx]||''):'');
      if(k===1)_fgSetAsesorOn(1,true);   // el bloque 1 queda siempre abierto
      else _fgSetAsesorOn(k,hay);
    });
    _fgSyncAsesorBlocks(); // muestra los bloques que el flyer del historial tenía
    _padRef=null;_padDismissed='';_padShowNote('');_padCloseSug(); // el historial no es una fila del padrón
    if(h.v&&h.v.nocb)_fgSetNoCB(true);
    else if(typeof setCfg==='function')setCfg(h.ac||0);
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
  s('benef-nombre','');s('benef-importe','24.000');s('benef-importe2','');_fgBenefManual=false;
  if(_fgA3)toggleA3();if(_fgA4)toggleA4();
  if(typeof a2!=='undefined'&&a2&&typeof toggleA2==='function')toggleA2();
  _padRef=null;_padDismissed='';_padShowNote('');_padCloseSug(); // se corta el vínculo con el padrón
  var n=_optN(_fgOpt),c=_fgOptCache[n];
  if(c)delete c.legalEdited;
  // Vuelve al legal GUARDADO de esta opción, aunque esté vacío. Antes, con legal vacío,
  // caía al LEGAL_DEFAULT del template (el legal de otro flyer): nunca más.
  var base=(c&&typeof c.legal==='string')?c.legal:'';
  s('legal-text',base);_fgLegalShownFor=n;
  window.filenameManual=false;
  if(typeof a1!=='undefined'&&!a1&&typeof toggleA1==='function')toggleA1();
  if(typeof a2!=='undefined'&&a2&&typeof toggleA2==='function')toggleA2();
  // Va DESPUÉS de reactivar el Asesor 1: si se lo había quitado, el sync corría
  // con a1 todavía apagado y "Restaurar" dejaba el bloque 1 escondido.
  _fgSyncAsesorBlocks(); // vuelve al estado inicial: sólo Asesor 1
  _fgSetNoCB(false);
  if(typeof setCfg==='function')setCfg(0);
  if(typeof updateFnPreview==='function')updateFnPreview();
}
function _installFlyerEngine(){
  window.savePDF=fgSavePDF;window.savePNG=fgSavePNG;      // engancha el registro
  window.addHistory=fgAddHistory;window.renderHistory=fgRenderHistory;
  window.redlPDF=fgRedlPDF;window.loadHistory=fgLoadHistory;
  window.resetVals=fgResetVals;
  window.getVals=fgGetVals;                                // hasta 4 asesores
  window.buildFn=fgBuildFn;                                // nombre de archivo seguro
  window.setCfg=fgSetCfg;                                  // + estado "sin cashback"
  window.toggleA3=toggleA3;window.toggleA4=toggleA4;
  window.genAll=fgGenAll;window.dlTemplate=fgDlTemplate;   // masivo + plantilla con 3 y 4
  window.drawAll=fgDrawAll;window.drawEmpresa=fgDrawEmpresa;window.drawMontos=fgDrawMontos;
  window.drawContacto=fgDrawContacto;window.drawC1=fgDrawC1;window.drawLegal=fgDrawLegal;
  window.drawBenef=fgDrawBenef;                    // Flyer Rubros
  window.splitBoldRegular=fgSplitBold;
  window.redraw=fgRedraw;window.fullRes=fgFullRes; // recorte responsive del blanco inferior
  window.showToast=fgShowToast;                    // toast con debounce (el template lo pisaba)
  window.validateExcel=fgValidateExcel;            // vista previa del Excel con escape
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
  // Integridad (SRI) fijada a la versión exacta, igual que los scripts del <head>:
  // si el CDN devolviera otro contenido, el navegador no lo ejecuta.
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.integrity='sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
  s.crossOrigin='anonymous';
  s.onload=function(){
    var wsrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var wsri='sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2';
    function fallback(){
      try{
        // Worker cross-origin robusto: blob mismo-origen que importa el worker real (cdnjs manda CORS).
        var blob=new Blob(['importScripts('+JSON.stringify(wsrc)+');'],{type:'application/javascript'});
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(blob);
      }catch(e){try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=wsrc;}catch(_){}}
      cb();
    }
    // importScripts no soporta integrity, pero fetch sí: se baja el worker con su
    // hash verificado y se lo sirve desde un blob. Si algo falla, el camino de antes.
    try{
      fetch(wsrc,{integrity:wsri,mode:'cors'})
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();})
        .then(function(code){
          window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
          cb();
        })
        .catch(function(e){console.warn('pdf.js worker con SRI falló, uso importScripts:',e);fallback();});
    }catch(e){fallback();}
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
      .then(function(r){cb&&cb((r&&r.error)||null);}).catch(function(e){cb&&cb(e||new Error('Error de red'));});
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
      .then(function(r){
        if(btn){btn.disabled=false;btn.textContent=lbl;}
        if(r&&r.error){showToast('Error al activar: '+r.error.message);return;}
        if(opt===1)_activeFlyerName=name;
        showToast('"'+name+'" activado en '+_optLabel(opt));
        _fgInvalidateOpt(opt);loadUploadHistory();
      })
      .catch(function(e){if(btn){btn.disabled=false;btn.textContent=lbl;}showToast('Error al activar: '+((e&&e.message)||e));});
  });
}
// Abre el calibrador desde la lista: si el flyer ya está activo en una sola opción usa
// esa; si no, pregunta.
function _calFromList(url,name){
  var od=_upOptDe(name);
  if(od.act.length===1){_calOpenFromUrl(url,name,od.act[0]);return;}
  if(!od.act.length&&od.home){_calOpenFromUrl(url,name,od.home);return;} // subido para esa opción, todavía no activado
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
// Zonas extra del cartel "Beneficio exclusivo": sólo para opciones de Flyer Rubros.
// Flyer Rubros: una zona por línea del cartel (bl0, bl1, ...) más "Cartel" (blAll)
// que mueve todas juntas. Las líneas viven en _cal.cfg.benef.lineas.
var _BENEF_ZONE_COLORS=['#f5921e','#b26a00','#7b4a12','#c0392b','#8e44ad','#2c3e50','#16a085','#d35400'];
function _calEsRubros(){return !!(_cal&&_optSolapa(_cal.opt)==='rubros');}
// Plantilla que corresponde a la opción por su nombre ("Combustible" →
// combustible); si ninguna calza, la primera.
function _calBenefPlantillaPorOpcion(){
  return _fgBenefPlantillaPorNombre(_cal?_optLabel(_cal.opt):'');
}
// "Combustible y supermercado" / "Ambos" → ambos; "Combustible" → combustible…
function _fgBenefPlantillaPorNombre(nombre){
  var lbl=_padNorm(nombre),ks=Object.keys(_BENEF_PLANTILLAS);
  if(lbl.indexOf('ambos')>=0||(lbl.indexOf('combustible')>=0&&lbl.indexOf('super')>=0))return 'ambos';
  for(var i=0;i<ks.length;i++){
    var k=ks[i],nm=_padNorm(_BENEF_PLANTILLAS[k].nombre);
    if(k==='ambos')continue;
    if(lbl.indexOf(k)>=0||lbl.indexOf(nm)>=0||(lbl.length>=4&&(k.indexOf(lbl)>=0||nm.indexOf(lbl)>=0)))return k; // "Súper" → supermercado
  }
  return ks[0];
}
// Copia las líneas de la plantilla (y sus etiquetas de campos a _cal.cfg.benef.campos).
function _calBenefDePlantilla(k){
  var P=_BENEF_PLANTILLAS[k]||_BENEF_PLANTILLAS[Object.keys(_BENEF_PLANTILLAS)[0]];
  if(_cal&&_cal.cfg&&_cal.cfg.benef)_cal.cfg.benef.campos=_fgMerge(_BENEF_CAMPOS_DEF,P.campos||null);
  return P.lineas.map(function(l){return _fgMerge(_BENEF_LINEA_DEF,l);});
}
// Líneas del cartel en el calibrador. Sin líneas guardadas arranca con la
// plantilla de la opción (la calibración vieja de dos líneas sueltas ya no
// sirve: ahora la app dibuja el cartel entero). Quien las crea acá las centra
// después con _calBenefCentrar (no se hace acá para no recursar).
function _calBenefLineas(){
  if(!_cal)return [];
  if(!_cal.cfg.benef)_cal.cfg.benef={};
  if(!Array.isArray(_cal.cfg.benef.lineas))_cal.cfg.benef.lineas=_calBenefDePlantilla(_calBenefPlantillaPorOpcion());
  return _cal.cfg.benef.lineas;
}
// Ancho estimado de una línea sin medir con canvas (~0.55em por carácter, tope mw).
function _calBenefAnchoEst(L){
  var t=String(L.t||'').replace(/\*\*/g,'').replace('{nombre}','EMPRESA EJEMPLO').replace('{importe2}','$30.000').replace('{importe}','$24.000');
  return Math.min(L.mw||820,Math.max(40,Math.round(t.length*L.fs*0.55)));
}
// Centra el cartel en el cuadro de la imagen (_fgBenefDetectarCuadro): todas
// las líneas sobre el eje central del área de texto y el bloque centrado en
// vertical, conservando la separación de la plantilla (si el bloque es más
// alto que el cuadro, se comprimen separación y letra). Si no encuentra el
// cuadro, al menos alinea las líneas entre sí sobre un mismo eje (el promedio
// de donde estaban) para que el admin mueva el bloque entero y listo.
// Devuelve el cuadro detectado o null.
function _calBenefCentrar(silencioso){
  if(!_cal||!_calEsRubros())return null;
  var ls=_calBenefLineas();if(!ls.length)return null;
  // eje actual del bloque: centro de las líneas sin dx (las de columna, con dx,
  // se ubican respecto del eje y no lo definen)
  var top=1e9,bot=-1e9,sx=0,nx=0;
  ls.forEach(function(l){
    top=Math.min(top,l.y-l.fs/2);bot=Math.max(bot,l.y+l.fs/2);
    var c=(l.align==='left')?l.x+_calBenefAnchoEst(l)/2:l.x;
    if(l.dx!=null)c=l.x-l.dx;
    sx+=c;nx++;
  });
  var mid=(top+bot)/2,q=_fgBenefDetectarCuadro(_cal.img,mid);
  var cx=q?q.cx:Math.round(sx/nx),cy=q?q.cy:mid,k=1;
  if(q){var disp=(q.bottom-q.top)-16,h=bot-top;if(h>disp&&h>0)k=disp/h;}
  var mwq=q?Math.max(200,(q.textoX1-q.textoX0)-20):0;
  ls.forEach(function(l){
    if(l.dx!=null)l.x=cx+l.dx;else{l.align='center';l.x=cx;}
    l.y=Math.round(cy+(l.y-mid)*k);
    if(k<1)l.fs=Math.max(6,Math.round(l.fs*k*2)/2);
    if(mwq&&l.dx==null&&l.mw>mwq)l.mw=mwq;
  });
  _calBenefRowSync();_calRenderLegend();_calDraw();
  if(!silencioso)showToast(q?'Cartel centrado en el cuadro.':'No encontré el cuadro en la imagen: alineé las líneas entre sí. Movelas juntas con «Cartel (todo)».');
  return q;
}
function _calZones(){
  if(!_calEsRubros())return _CAL_ZONES;
  var ls=_calBenefLineas();
  var z=[{id:'blAll',label:'Cartel (todo)',color:'#e30613'}];
  ls.forEach(function(l,i){var t=String(l.t||'').replace(/\*\*/g,'').replace('{nombre}','NOMBRE').replace('{importe2}','$').replace('{importe}','$');z.push({id:'bl'+i,label:(t.length>18?t.slice(0,17)+'…':t)||('Línea '+(i+1)),color:_BENEF_ZONE_COLORS[i%_BENEF_ZONE_COLORS.length]});});
  return z.concat(_CAL_ZONES);
}
var _CAL_SAMPLE_LEGAL="Ejemplo de términos y condiciones del flyer. **Bonificación de comisiones** por 6 meses para nuevos clientes. Promociones sujetas a disponibilidad y a las bases y condiciones vigentes.\nPARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN: www.bancogalicia.com.ar";
function _calSampleVals(){
  var rub=_calEsRubros();
  return {empresa:'EMPRESA EJEMPLO S.A.',
    m1:'$100.000',m2:'$80.000',m3:'$50.000',m4:'$30.000',
    has1:true,nombre:'Nombre Apellido',celular:'11 1234 5678',email:'nombre.apellido@bancogalicia.com.ar',
    has2:true,nombre2:'Segundo Asesor',celular2:'11 8765 4321',email2:'segundo.asesor@bancogalicia.com.ar',
    legal:(_cal&&_cal.legalText)||_CAL_SAMPLE_LEGAL,
    benef:rub,benefNombre:rub?'EMPRESA EJEMPLO':'',importe:rub?'$24.000':'',importe2:rub?'$30.000':''};
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
    '.cal-body{flex:1;overflow:auto;background:#e9e9e6;padding:16px}'+
    'html.dark .cal-body{background:#15161a}'+
    '.cal-body canvas{display:block;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);touch-action:none;cursor:grab}'+
    '.cal-zoom{display:inline-flex;gap:4px;align-items:center}.cal-zoom button{padding:2px 8px;font-size:.72rem;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;cursor:pointer}.cal-zoom button:hover{border-color:var(--orange,#f5921e)}'+
    '.cal-ft{padding:11px 16px;border-top:1px solid rgba(128,128,128,.25);display:flex;gap:10px;align-items:center;font-size:.72rem;color:var(--gray,#777)}'+
    '.cal-ft .sp{flex:1}'+
    // Textos fijos del cartel del beneficio (sólo Flyer Rubros)
    '#cal-benef-row{display:none;padding:9px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.7rem}'+
    '#cal-benef-row.show{display:block}'+
    '.cal-bl{display:grid;grid-template-columns:18px 1fr 58px 62px 36px 62px 22px;gap:5px;align-items:center;margin-bottom:4px}'+
    '.cal-bl .dot{width:11px;height:11px;border-radius:3px;display:inline-block;cursor:pointer}'+
    '.cal-bl input,.cal-bl select{padding:3px 5px;font-size:.68rem;border:1px solid rgba(128,128,128,.4);border-radius:5px;background:transparent;color:inherit;min-width:0;font-family:inherit}'+
    'html.dark .cal-bl select{background:#22242a}'+
    '.cal-bl input[type=color]{padding:1px 2px;height:24px;cursor:pointer}'+
    '.cal-bl .x{cursor:pointer;color:var(--gray,#888);font-size:.8rem;text-align:center}.cal-bl .x:hover{color:var(--red,#e30613)}'+
    '.cal-bl-head{color:var(--gray,#777);font-size:.6rem;text-transform:uppercase;letter-spacing:.4px}'+
    '.cal-bl-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px}'+
    '.cal-bl-top select{padding:3px 6px;font-size:.7rem;border:1px solid rgba(128,128,128,.4);border-radius:5px;background:transparent;color:inherit;font-family:inherit}'+
    'html.dark .cal-bl-top select{background:#22242a}';
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
      // Flyer Rubros: las líneas del cartel (texto, tamaño, peso, color, alineación). Plantillas por rubro.
      '<div id="cal-benef-row">'+
        '<div class="cal-bl-top"><b style="font-size:.7rem">Cartel del beneficio</b>'+
          '<span style="color:var(--gray)">Plantilla:</span><select id="cal-benef-plantilla">'+
            Object.keys(_BENEF_PLANTILLAS).map(function(k){return '<option value="'+k+'">'+_escHtml(_BENEF_PLANTILLAS[k].nombre)+'</option>';}).join('')+
          '</select><button class="usr-btn edit" style="font-size:.64rem;padding:3px 9px" onclick="_calBenefPlantilla()">Cargar plantilla</button>'+
          '<button class="usr-btn edit" style="font-size:.64rem;padding:3px 9px" onclick="_calBenefCentrar(false)" title="Detecta el cuadro en la imagen y centra el bloque de l&iacute;neas ah&iacute;">&#8982; Centrar en el cuadro</button>'+
          '<span class="sp" style="flex:1"></span>'+
          '<button class="usr-btn edit" style="font-size:.64rem;padding:3px 9px" onclick="_calBenefAgregar()">+ L&iacute;nea</button></div>'+
        '<div class="cal-bl cal-bl-head"><span></span><span>Texto ({nombre}, {importe}, {importe2}, **naranja**)</span><span>Letra px</span><span>Peso</span><span>Color</span><span>Alinear</span><span></span></div>'+
        '<div id="cal-benef-lineas"></div>'+
        '<div style="color:var(--gray);font-size:.62rem;margin-top:4px">El PDF va con el cuadro vac&iacute;o (s&oacute;lo el dibujo): la app escribe todas las l&iacute;neas con la misma letra. {nombre}, {importe} y {importe2} (segundo tope, cuadro &laquo;Ambos&raquo;) los carga cada asesor; **as&iacute;** sale en naranja y negrita. Al abrir y al cargar una plantilla el bloque se centra solo en el cuadro (&laquo;Centrar en el cuadro&raquo; lo vuelve a hacer). Para retocar: arrastr&aacute; &laquo;Cartel (todo)&raquo; para mover el bloque entero, o cada l&iacute;nea por separado.</div>'+
      '</div>'+
      '<div class="cal-ft"><span>Eleg&iacute; una zona arriba (se ve s&oacute;lo esa; tocala de nuevo para ver todas) y arrastrala en la imagen. Flechas del teclado = ajuste fino (Shift = 10px). <b>Ctrl + rueda</b> = zoom.</span><span class="sp"></span>'+
        '<span class="cal-zoom"><button type="button" onclick="_calZoom(1/1.25)" title="Alejar">&minus;</button><button type="button" id="cal-zoom-pct" onclick="_calZoom(0)" title="Volver al tama&ntilde;o inicial">100%</button><button type="button" onclick="_calZoom(1.25)" title="Acercar">+</button></span></div>'+
    '</div>';
  document.body.appendChild(m);
  var cv=document.getElementById('cal-cv');
  cv.addEventListener('pointerdown',_calDown);
  cv.addEventListener('wheel',_calWheel,{passive:false});
  cv.addEventListener('pointermove',_calMove);
  window.addEventListener('pointerup',_calUp);
  document.addEventListener('keydown',_calKey);
}
// Edición de una línea del cartel desde la tabla del calibrador.
function _calBenefLinea(i,k,val){
  var ls=_calBenefLineas(),L=ls[i];if(!L)return;
  if(k==='fs'){var n=parseFloat(val);if(!(n>=6))return;L.fs=n;}
  else if(k==='peso'){var p=parseInt(val,10);if(!(p>=100))return;L.peso=p;}
  else if(k==='color'){if(!/^#[0-9a-f]{6}$/i.test(val||''))return;L.color=String(val).toLowerCase();}
  else if(k==='align')L.align=(val==='left')?'left':'center';
  else if(k==='t'){L.t=String(val==null?'':val);_calRenderLegend();}
  _calDraw();
}
function _calBenefAgregar(){
  var ls=_calBenefLineas(),ult=ls[ls.length-1];
  ls.push(_fgMerge(_BENEF_LINEA_DEF,{t:'Nueva línea',x:ult?ult.x:640,y:(ult?ult.y:2700)+24,fs:ult?ult.fs:14.5,align:ult?ult.align:'center'}));
  _cal.sel='bl'+(ls.length-1);_calBenefRowSync();_calRenderLegend();_calDraw();
  var inp=document.querySelector('#cal-benef-lineas .cal-bl:last-child input[type=text]');if(inp){inp.focus();inp.select();}
}
function _calBenefQuitar(i){
  var ls=_calBenefLineas();if(!ls[i])return;
  ls.splice(i,1);if(_cal.sel&&_cal.sel.indexOf('bl')===0&&_cal.sel!=='blAll')_cal.sel=null;
  _calBenefRowSync();_calRenderLegend();_calDraw();
}
function _calBenefPlantilla(){
  var sel=document.getElementById('cal-benef-plantilla'),k=sel?sel.value:'',P=_BENEF_PLANTILLAS[k];if(!P||!_cal)return;
  function aplicar(){
    if(!_cal)return;
    _cal.cfg.benef.lineas=_calBenefDePlantilla(k);
    _cal.sel=null;
    var q=_calBenefCentrar(true); // ya redibuja
    showToast(q?'Plantilla "'+P.nombre+'" cargada y centrada en el cuadro.':'Plantilla "'+P.nombre+'" cargada. No encontré el cuadro en la imagen: movela con «Cartel (todo)».');
  }
  if(!_calBenefLineas().length){aplicar();return;}
  fgConfirm('¿Reemplazar las líneas actuales por la plantilla "'+P.nombre+'"?',{ok:'Reemplazar',peligro:false},function(si){if(si)aplicar();});
}
// Pinta la tabla de líneas (al abrir el calibrador y al agregar/quitar) y muestra la fila sólo en Rubros.
function _calBenefRowSync(){
  var row=document.getElementById('cal-benef-row');if(!row)return;
  var rub=_calEsRubros();row.classList.toggle('show',rub);
  if(!rub)return;
  _fgBenefFont(); // que el preview use la tipografía real
  var host=document.getElementById('cal-benef-lineas');if(!host)return;
  host.innerHTML=_calBenefLineas().map(function(L,i){
    var col=_BENEF_ZONE_COLORS[i%_BENEF_ZONE_COLORS.length];
    return '<div class="cal-bl">'+
      '<span class="dot" style="background:'+col+'" title="Elegir esta l&iacute;nea en la imagen" onclick="_calSelect(\'bl'+i+'\')"></span>'+
      '<input type="text" value="'+_escAttr(L.t||'')+'" oninput="_calBenefLinea('+i+',\'t\',this.value)">'+
      '<input type="number" min="6" max="120" step="0.5" value="'+(+L.fs||17)+'" oninput="_calBenefLinea('+i+',\'fs\',this.value)">'+
      '<select onchange="_calBenefLinea('+i+',\'peso\',this.value)">'+[400,500,600,700,800].map(function(p){return '<option value="'+p+'"'+(+L.peso===p?' selected':'')+'>'+p+(p===400?' fina':p===800?' negrita':'')+'</option>';}).join('')+'</select>'+
      '<input type="color" value="'+_escAttr(L.color||'#000000')+'" title="Color" oninput="_calBenefLinea('+i+',\'color\',this.value)">'+
      '<select onchange="_calBenefLinea('+i+',\'align\',this.value)"><option value="left"'+(L.align==='left'?' selected':'')+'>Izq.</option><option value="center"'+(L.align!=='left'?' selected':'')+'>Centro</option></select>'+
      '<span class="x" title="Quitar l&iacute;nea" onclick="_calBenefQuitar('+i+')">&#10005;</span>'+
    '</div>';
  }).join('');
}
function _calRenderLegend(){
  var el=document.getElementById('cal-legend');if(!el)return;
  el.innerHTML=_calZones().map(function(z){
    var on=_cal&&_cal.sel===z.id;
    return '<span class="cal-chip'+(on?' on':'')+'" style="color:'+z.color+'" onclick="_calSelect(\''+z.id+'\')"><span class="dot" style="background:'+z.color+'"></span>'+z.label+'</span>';
  }).join('');
}
// Tocar el chip de la zona elegida la deselecciona (vuelven a verse todas).
function _calSelect(id){if(!_cal)return;_cal.sel=(_cal.sel===id)?null:id;_calRenderLegend();_calDraw();var s=document.getElementById('cal-sel');if(s)s.textContent='';}
// ── Zoom del calibrador ──────────────────────────────────────────────────────
// factor>1 acerca, <1 aleja, 0 vuelve al tamaño inicial. Mantiene fijo el punto
// (px base) que está bajo el cursor si se pasa, o el centro de lo visible.
// Tope relativo al tamaño inicial (ds0), no absoluto: ds0 cambia según el ancho de
// ventana. 130% porque cada redibujo lee píxeles del canvas entero y más allá de eso
// la página se pone lenta y se traba (pedido del admin).
var _CAL_ZOOM_MAX=1.3;
function _calZoom(factor,px,py){
  if(!_cal)return;
  var body=document.querySelector('#cal-modal .cal-body'),cv=document.getElementById('cal-cv');if(!body||!cv)return;
  var ds=_cal.ds,nds=factor?Math.min(_cal.ds0*_CAL_ZOOM_MAX,Math.max(0.12,ds*factor)):_cal.ds0;
  if(Math.abs(nds-ds)<1e-6)return;
  // punto fijo: si no viene, el centro del área visible
  if(px==null){px=(body.scrollLeft+body.clientWidth/2-cv.offsetLeft)/ds;py=(body.scrollTop+body.clientHeight/2-cv.offsetTop)/ds;}
  var offX=px*ds-body.scrollLeft+cv.offsetLeft,offY=py*ds-body.scrollTop+cv.offsetTop; // posición en pantalla del punto
  _cal.ds=nds;_calDraw();
  body.scrollLeft=px*nds+cv.offsetLeft-offX;body.scrollTop=py*nds+cv.offsetTop-offY;
  var pct=document.getElementById('cal-zoom-pct');if(pct)pct.textContent=Math.round(nds/_cal.ds0*100)+'%';
}
// El pellizco de zoom (trackpad) dispara "wheel" con ctrlKey a muchos eventos por
// segundo; sin agrupar, cada uno redibujaba de una y podía trabar el navegador
// varios segundos. Se acumula el factor y se aplica un solo zoom+redibujo por cuadro.
var _calWheelPend=null,_calWheelFactor=1,_calWheelPX=null,_calWheelPY=null;
function _calWheel(e){
  if(!_cal||!e.ctrlKey)return; // la rueda sola sigue desplazando el flyer (es muy alto)
  e.preventDefault();
  var p=_calXY(e);
  _calWheelFactor*=(e.deltaY<0?1.15:1/1.15);_calWheelPX=p.x;_calWheelPY=p.y;
  if(_calWheelPend)return;
  _calWheelPend=requestAnimationFrame(function(){
    _calWheelPend=null;
    var f=_calWheelFactor;_calWheelFactor=1;
    _calZoom(f,_calWheelPX,_calWheelPY);
  });
}
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
  if(_calEsRubros()){
    // ancho estimado del texto (sin canvas a mano): ~0.55em por carácter, tope mw
    var all=null;
    _calBenefLineas().forEach(function(L,i){
      var w=_calBenefAnchoEst(L),h=Math.round(L.fs*1.25);
      var x=(L.align==='left')?L.x:L.x-w/2,y=L.y-h/2;
      r['bl'+i]={x:x,y:y,w:w,h:h};
      if(!all)all={x0:x,y0:y,x1:x+w,y1:y+h};else{all.x0=Math.min(all.x0,x);all.y0=Math.min(all.y0,y);all.x1=Math.max(all.x1,x+w);all.y1=Math.max(all.y1,y+h);}
    });
    if(all)r.blAll={x:all.x0-10,y:all.y0-8,w:all.x1-all.x0+20,h:all.y1-all.y0+16};
  }
  return r;
}
function _calDraw(){
  if(!_cal)return;
  // willReadFrequently: fgDrawEmpresa/fgDrawMontos leen píxeles de este mismo canvas
  // (_fgBgMuestra) para tapar con el color real del flyer. Sin esto, cada getImageData
  // fuerza al navegador a bajar TODO el canvas de la GPU — con el canvas agrandado por
  // el zoom (arrastrar una zona redibuja en cada movimiento) se sentía trabado.
  var cv=document.getElementById('cal-cv');if(!cv)return;var g=cv.getContext('2d',{willReadFrequently:true});var ds=_cal.ds;
  var W=Math.round(_FG_TARGET_W*ds),H=Math.round(_cal.img.height*ds);
  // asignar width/height reasigna el buffer del canvas (caro); sólo si cambió el tamaño
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;cv.style.width=W+'px';cv.style.height=H+'px';}
  else g.clearRect(0,0,W,H);
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
  _calZones().forEach(function(z){
    if(_cal.sel&&_cal.sel!==z.id)return; // con una zona elegida, las demás no se dibujan
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
  if(_cal.sel){ // con una zona elegida sólo se agarra esa (las demás están ocultas)
    if(_cal.sel==='legal'&&L&&Math.abs(bx-(L.x+L.w))<16&&Math.abs(by-(L.y+L.h))<16)return {zone:'legal',handle:'br'};
    var rs=rects[_cal.sel];
    return (rs&&bx>=rs.x&&bx<=rs.x+rs.w&&by>=rs.y&&by<=rs.y+rs.h)?{zone:_cal.sel,handle:null}:null;
  }
  if(L&&Math.abs(bx-(L.x+L.w))<16&&Math.abs(by-(L.y+L.h))<16)return {zone:'legal',handle:'br'};
  var order=[];
  if(_calEsRubros()){_calBenefLineas().forEach(function(_l,i){order.push('bl'+i);});order.push('blAll');}
  order=order.concat(['empresa','montos','asesores','legal']);
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
// El navegador puede mandar más pointermove de los que da tiempo a redibujar
// (sobre todo con zoom alto: el canvas es grande y cada redibujo lee píxeles del
// flyer para tapar montos/empresa). Sin agrupar, arrastrar una zona zoomeado
// se sentía trabado: los eventos se acumulaban y el redibujo iba cada vez más
// atrás. Se aplica el movimiento siempre (es barato), pero el redibujo se
// agrupa a como mucho uno por frame.
var _calDrawPend=null;
function _calScheduleDraw(){
  if(_calDrawPend)return;
  _calDrawPend=requestAnimationFrame(function(){_calDrawPend=null;_calDraw();});
}
function _calMove(e){
  if(!_cal||!_cal.drag)return;e.preventDefault();
  var p=_calXY(e),dx=p.x-_cal.lastX,dy=p.y-_cal.lastY;_cal.lastX=p.x;_cal.lastY=p.y;
  _calApply(_cal.drag,dx,dy);_calScheduleDraw();
}
function _calUp(){
  if(_cal&&_cal.drag){
    _cal.drag=null;
    // el arrastre terminó: si quedó un redibujo agrupado pendiente, se completa ya
    // mismo (deja la zona exactamente donde se soltó, sin esperar el próximo frame).
    if(_calDrawPend){cancelAnimationFrame(_calDrawPend);_calDrawPend=null;_calDraw();}
  }
}
function _calApply(drag,dx,dy){
  var cfg=_cal.cfg,E=cfg.empresa,M=cfg.montos,C=cfg.contacto,L=cfg.legal,B=cfg.benef;
  if(drag.zone==='blAll'){_calBenefLineas().forEach(function(l){l.x+=dx;l.y+=dy;});}
  // una línea de columna (con dx) arrastrada sola corre también su dx, así
  // «Centrar en el cuadro» respeta el retoque
  else if(/^bl\d+$/.test(drag.zone)){var bl=_calBenefLineas()[+drag.zone.slice(2)];if(bl){bl.x+=dx;bl.y+=dy;if(bl.dx!=null)bl.dx+=dx;}}
  else if(drag.zone==='empresa'){E.yc+=dy;E.xc+=dx;E.ex+=dx;}
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
  e.preventDefault();_calApply({zone:_cal.sel,handle:null},dx,dy);_calScheduleDraw(); // si se mantiene apretada, agrupa igual que el arrastre
}
function _calBadKey(k){return k==='__proto__'||k==='constructor'||k==='prototype';}
function _calMergeCfg(base,saved){
  // Sólo claves propias y nunca __proto__/constructor: un JSON con esas claves
  // contaminaría Object.prototype para toda la app (prototype pollution).
  for(var k in saved){
    if(!Object.prototype.hasOwnProperty.call(saved,k)||_calBadKey(k))continue;
    if(saved[k]&&typeof saved[k]==='object'&&!Array.isArray(saved[k])&&base[k]){
      for(var j in saved[k]){
        if(!Object.prototype.hasOwnProperty.call(saved[k],j)||_calBadKey(j))continue;
        base[k][j]=saved[k][j];
      }
    }
    else base[k]=saved[k];
  }
}
function _calOpen(img,name,url,opt){
  _calEnsureDom();
  opt=_optN(opt);
  var base=JSON.parse(JSON.stringify(FLYER_CFG_DEFAULT));
  _cal={img:img,name:name,url:url,opt:opt,cfg:base,sel:null,drag:null,lastX:0,lastY:0,legalText:null,
    ds:Math.min(560,(window.innerWidth||600)-70)/_FG_TARGET_W};
  _cal.ds0=_cal.ds;
  var zp=document.getElementById('cal-zoom-pct');if(zp)zp.textContent='100%';
  document.getElementById('cal-modal').classList.add('show');
  var t=document.getElementById('cal-title');if(t)t.textContent='Calibrar flyer — '+_optLabel(opt)+(_calEsRubros()?' (Flyer Rubros)':'');
  var hInput=document.getElementById('cal-height');if(hInput)hInput.value='';
  _calRenderLegend();_calBenefRowSync();
  if(_calEsRubros()){
    // arranca con la plantilla de la opción, centrada en el cuadro de la imagen;
    // si hay líneas guardadas, las pisa la carga de abajo
    var ps=document.getElementById('cal-benef-plantilla');if(ps)ps.value=_calBenefPlantillaPorOpcion();
    _calBenefCentrar(true);
  }
  _calDraw();
  _loadFlyerCfgs(function(m){
    if(!_cal||_cal.name!==name)return; // se cerró o se abrió otro mientras cargaba
    if(m&&m[name]){
      try{_calMergeCfg(_cal.cfg,m[name]);}catch(e){}
      // calibración vieja del cartel (titulo/tope sueltos): ya no aplica, la app
      // dibuja el cartel entero; quedan las líneas de la plantilla ya centradas
      var sb=_cal.cfg.benef;
      if(sb){delete sb.titulo;delete sb.tope;}
    }
    var hi=document.getElementById('cal-height');if(hi)hi.value=_cal.cfg.cropH?_cal.cfg.cropH:'';
    _calRenderLegend();_calBenefRowSync();
    // preview con el legal REAL de esa opción, para ver cuánto ocupa
    loadGlobalLegal(false,opt).then(function(txt){
      if(_cal){_cal.legalText=(txt&&txt.trim())?txt:_CAL_SAMPLE_LEGAL;_calDraw();}
    });
  });
}
function _calOpenFromUrl(url,name,opt){
  showToast('Cargando flyer...');
  var im=new Image();
  im.crossOrigin='anonymous'; // sin esto el canvas queda "tainted" y _fgBenefDetectarCuadro no puede leer píxeles
  im.onload=function(){_calOpen(im,name,url,opt);};
  im.onerror=function(){showToast('No se pudo cargar la imagen del flyer');};
  im.src=url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now();
}
function _calClose(){var m=document.getElementById('cal-modal');if(m)m.classList.remove('show');_cal=null;}
function _calSave(){
  if(!_cal)return;var name=_cal.name,url=_cal.url,cfg=_cal.cfg,opt=_optN(_cal.opt);
  showToast('Guardando calibración...');
  _saveFlyerCfg(name,cfg,function(err){
    // El calibrador queda abierto si algo falló: así no se pierde el ajuste
    // recién hecho y se puede reintentar.
    if(err){showToast('Error al guardar la calibración: '+(err.message||err));return;}
    var imageUrl=url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now();
    var meta=JSON.stringify({name:name,imageUrl:imageUrl,cfg:cfg,updated_at:new Date().toISOString()});
    _sb.storage.from('flyers').upload(_activeFile(opt),new Blob([meta],{type:'application/json'}),{contentType:'application/json',upsert:true})
      .then(function(r){
        if(r&&r.error){showToast('Error al activar la calibración: '+r.error.message);return;}
        if(opt===1)_activeFlyerName=name;
        showToast('¡Calibración guardada y activada en '+_optLabel(opt)+'!');
        _calClose();_fgInvalidateOpt(opt);loadUploadHistory();
      })
      .catch(function(e){showToast('Error al guardar la calibración: '+((e&&e.message)||e));});
  });
}

// ── NEGRITAS AL PEGAR ─────────────────────────────────────────────────────────────
// Convierte el formato pegado (negrita de Word/PDF/web) a marcadores **...** dentro
// del textarea, para que drawLegal las dibuje en negrita. Se engancha a #legal-text
// y al editor de legales del panel.
function _htmlBoldToMarkers(html){
  // DOMParser en vez de div.innerHTML: el HTML del portapapeles viene de
  // afuera (un mail, una web) y con innerHTML un <img onerror> se ejecuta aunque
  // el div nunca entre al documento. El documento parseado es inerte.
  var d;
  try{d=new DOMParser().parseFromString(String(html||''),'text/html').body;}
  catch(e){d=document.createElement('div');d.textContent=String(html||'');}
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
    if(v.benef){extra.beneficio=v.benefNombre||'';extra.importe=v.importe||'';if(_fgBenefUsaImporte2())extra.importe2=v.importe2||v.importe||'';} // Flyer Rubros
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
function logFlyerBulkToSupabase(n,origen){
  if(!_me)return;
  var pad=(origen==='padron');
  _sb.from('flyer_logs').insert({
    user_id:_me.id,
    empresa:(pad?'Mis empresas (':'Masivo (')+n+' flyers)',
    config_name:'',format:'pdf',is_bulk:true,bulk_count:n,
    flyer_type:JSON.stringify({opcion:_optN(_fgOpt),masivo:true,padron:pad}),
    created_at:new Date().toISOString()
  }).then(function(r){
    if(r&&r.error)console.warn('flyer_logs bulk error:',r.error.message);
  }).catch(function(e){console.warn('flyer_logs bulk failed:',e);});
}
// ── DESCARGAS: registro + historial con opción ────────────────────────────────
// OJO: logFlyerToSupabase existía pero NADIE lo llamaba => no se registraba ninguna
// descarga. Lo engancho acá pisando savePDF/savePNG de _source.html (que regenera).
function fgSavePDF(fc,v,force){
  if(!force&&_padCheckRubro(_padFilaActual(),'descarga',function(){fgSavePDF(fc,v,true);}))return;
  var jsPDF=window.jspdf.jsPDF;
  var pw=210,ph=(fc.height/fc.width)*pw;
  var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
  pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
  var fn=buildFn(document.getElementById('filename').value,v);
  pdf.save(fn+'.pdf');
  addHistory(v,fn,fc);
  logFlyerToSupabase(v,fn,'pdf');
  _padAfterFlyer();
}
function fgSavePNG(fc,v,force){
  if(!force&&_padCheckRubro(_padFilaActual(),'descarga',function(){fgSavePNG(fc,v,true);}))return;
  var a=document.createElement('a');
  var fn=buildFn(document.getElementById('filename').value,v);
  a.download=fn+'.png';a.href=fc.toDataURL('image/png');a.click();
  addHistory(v,fn,fc);
  logFlyerToSupabase(v,fn,'png');
  _padAfterFlyer();
}
// ── NOMBRES DE ARCHIVO ───────────────────────────────────────────────────────
// Windows no acepta \ / : * ? " < > | en un nombre de archivo, y en el ZIP del
// masivo una "/" en la razón social creaba una CARPETA (el flyer quedaba adentro
// de un directorio en vez de suelto). Se sanea todo por acá.
function _fgSafeName(s){
  var t=(s==null?'':String(s))
    .replace(/[\\/:*?"<>|]+/g,'-')
    .replace(/[\x00-\x1f]+/g,'')
    .replace(/\s+/g,' ')
    .replace(/[. ]+$/,'')
    .trim();
  return t.slice(0,120)||'flyer';
}
// Pisa buildFn de _source.html: sanea el nombre y usa v.config (que ya sabe de
// "Sin cashback"), en vez de leer CNAMES[ac], que se quedaba desactualizado.
function fgBuildFn(pattern,v){
  var d=new Date();
  var fecha=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var cfg=(v&&v.config)||((typeof CNAMES!=='undefined'&&typeof ac!=='undefined'&&CNAMES[ac])?CNAMES[ac]:'BAU');
  return _fgSafeName((pattern||'Flyer {empresa}')
    .replace(/{empresa}/g,(v&&v.empresa)||'flyer')
    .replace(/{asesor}/g,(v&&v.nombre)||'asesor')
    .replace(/{config}/g,cfg)
    .replace(/{fecha}/g,fecha));
}
// MASIVO con hasta 4 asesores. Pisa genAll de _source.html (que sólo mapea 1 y 2).
// Los Excel viejos (sin columnas 3/4) siguen funcionando igual.
function fgGenAll(){
  if(!window.excelData||!excelData.length)return;
  var total=excelData.length,cur=0,zip=new JSZip(),usados={};
  var legalText=document.getElementById('legal-text').value;
  // Flyer Rubros: si la fila no trae importe, se usa el del formulario (uno para todos)
  var enRubros=(_fgVista==='rubros'),impForm=_fgFmtImporte((document.getElementById('benef-importe')||{}).value||''),imp2Form=_fgFmtImporte((document.getElementById('benef-importe2')||{}).value||'');
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
    // misma regla que el padrón: sin config válida, ese flyer sale sin montos
    var ci=_padCfgOf(row.config||row.Config||'');
    var cfg=CONFIGS[ci<0?0:ci];
    var v={empresa:(row.empresa||row.Empresa||'flyer'+(cur+1)),
      nocb:ci<0,m1:cfg.m1,m2:cfg.m2,m3:cfg.m3,m4:cfg.m4,legal:legalText};
    if(enRubros){
      v.benef=true;
      var rb=_fgRowBenef(row),bnm=rb.beneficio;
      v.benefNombre=(bnm==='-')?'':(bnm||v.empresa); // "-" = sin nombre ("¡Beneficio exclusivo!")
      v.importe=_fgFmtImporte(rb.importe)||impForm;
      v.importe2=_fgFmtImporte(rb.importe2)||imp2Form||v.importe;
    }
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
    // Dos filas con la misma razón social generaban el MISMO nombre y la segunda
    // pisaba a la primera: el ZIP salía con menos flyers de los que decía.
    var base='Flyer '+_fgSafeName(v.empresa),nom=base;
    usados[base]=(usados[base]||0)+1;
    if(usados[base]>1)nom=base+' ('+usados[base]+')';
    zip.file(nom+'.pdf',pdf.output('arraybuffer'));
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
  var cols=[{wch:22}].concat([1,2,3,4].reduce(function(a){return a.concat([{wch:22},{wch:16},{wch:38}]);},[]),[{wch:10}]);
  // Flyer Rubros: nombre del cartel (vacío = la empresa) e importe del tope (vacío = el del formulario)
  var enRubros=(_fgVista==='rubros');
  if(enRubros){
    // los encabezados llevan la etiqueta del tope de esta opción ("importe (Tope
    // supermercado)"): _fgRowBenef los reconoce por el prefijo
    var campos=_fgCfg().benef.campos||{},dos=_fgBenefUsaImporte2();
    head.push('beneficio','importe'+(dos?' ('+campos.importe+')':''));
    data[1].push('EMPRESA EJEMPLO','24.000');data[2].push('-','24.000');
    cols.push({wch:22},{wch:dos?28:12});
    if(dos){head.push('importe2 ('+campos.importe2+')');data[1].push('30.000');data[2].push('');cols.push({wch:34});}
  }
  var ws=XLSX.utils.aoa_to_sheet(data);
  ws['!cols']=cols;
  XLSX.utils.book_append_sheet(wb,ws,'Flyers');
  XLSX.writeFile(wb,enRubros?'Plantilla_Flyers_Rubros.xlsx':'Plantilla_Flyers_Galicia.xlsx');
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
    if(r.error){container.innerHTML='<p style="color:var(--red);font-size:.8rem">Error: '+_escHtml(r.error.message)+'</p>';return;}
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
        // Todo lo que viene de flyer_logs lo escribió un usuario (empresa, asesor,
        // config...): se escapa siempre antes de pintarlo en el panel del admin.
        var fmtBadge=row.format?'<span class="badge badge-asesor" style="font-size:.58rem">'+_escHtml(String(row.format).toUpperCase())+'</span>':'';
        var ex={};try{if(row.flyer_type)ex=JSON.parse(row.flyer_type)||{};}catch(e){}
        if(typeof ex!=='object'||Array.isArray(ex))ex={};
        // Opción usada (control de visibilidad). Registros viejos no la tienen.
        var optBadge=ex.opcion?_optBadge(ex.opcion,'font-size:.58rem;margin-left:4px'):'';
        var bulkBadge=ex.masivo?'<span class="badge" style="font-size:.55rem;padding:3px 7px;background:#fff3e0;color:#b26a00;margin-left:4px">'+(ex.padron?'EMPRESAS':'MASIVO')+'</span>':'';
        var cfgHtml=ex.config?'<span class="reg-monto" style="background:#eef0ff;color:#3a3a8c">'+_escHtml(ex.config)+'</span>':'';
        // Flyer Rubros: tope del beneficio (y el nombre del cartel si difiere de la empresa)
        if(ex.importe)cfgHtml+='<span class="reg-monto" style="background:#fff3e0;color:#b26a00" title="Tope de reintegro del beneficio exclusivo">Tope '+_escHtml(ex.importe)+(ex.importe2&&ex.importe2!==ex.importe?' / '+_escHtml(ex.importe2):'')+'</span>';
        if(ex.beneficio&&ex.beneficio!==(row.empresa||''))cfgHtml+='<span class="reg-monto" style="background:#fff3e0;color:#b26a00" title="Nombre en el cartel del beneficio">'+_escHtml(ex.beneficio)+'</span>';
        var cfgWrap=cfgHtml?'<div class="reg-montos">'+cfgHtml+'</div>':'';
        var asesorHtml=ex.nombre?'<div style="font-size:.68rem;color:#555;margin-top:3px"><b>Asesor:</b> '+_escHtml(ex.nombre)+(ex.celular?' &middot; '+_escHtml(ex.celular):'')+(ex.email?' &middot; '+_escHtml(ex.email):'')+'</div>':'';
        return '<div class="reg-row">'+
          '<div class="usr-avatar sm" style="background:'+col+';flex-shrink:0">'+_escHtml(ini)+'</div>'+
          '<div class="reg-info">'+
            '<div class="reg-top"><span class="reg-empresa">'+_escHtml(row.empresa||'—')+'</span>'+fmtBadge+optBadge+bulkBadge+'</div>'+
            cfgWrap+
            asesorHtml+
            '<div class="reg-mid"><span class="reg-lbl">Generado por</span> '+_escHtml(nombre)+'</div>'+
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
          'Opción':ex.opcion?_optLabel(ex.opcion):'',
          'Beneficio (Rubros)':ex.beneficio||'',
          'Tope (Rubros)':ex.importe||'',
          'Tope 2 (Rubros)':ex.importe2||'',
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
      ws['!cols']=[{wch:22},{wch:28},{wch:32},{wch:14},{wch:16},{wch:24},{wch:14},{wch:28},{wch:18},{wch:36},{wch:28},{wch:18},{wch:36},{wch:8}];
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Registros');
      XLSX.writeFile(wb,'registros_flyers_galicia_'+new Date().toISOString().slice(0,10)+'.xlsx');
      showToast('Excel descargado');
    });
  });
}

// ── DATA → CAMBIOS DEL PADRÓN ────────────────────────────────────────────────
// Tabla padron_log: la escribe padron_replace (servidor) comparando el padrón
// viejo con el nuevo en cada guardado: una fila por empresa (alta / modificación
// / baja) con qué cambió. La RLS decide qué ve cada uno (lo propio + lo de los
// no-admin para el admin), así que acá sólo se filtra y se pinta.
var _PLOG_LBL={alta:'Alta',modificacion:'Modificación',baja:'Baja'};
function _plogFiltros(){
  var g=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
  return {user:g('plog-q-user'),emp:g('plog-q-empresa'),acc:g('plog-q-accion'),from:g('plog-q-from'),to:g('plog-q-to')};
}
function _plogQuery(f,limit){
  var q=_sb.from('padron_log').select('id,user_id,usuario,accion,empresa,cambios,total,created_at')
    .order('created_at',{ascending:false}).order('id',{ascending:false});
  if(f.emp)q=q.ilike('empresa','%'+f.emp+'%');
  if(f.acc)q=q.eq('accion',f.acc);
  if(f.from)q=q.gte('created_at',f.from+'T00:00:00');
  if(f.to)q=q.lte('created_at',f.to+'T23:59:59');
  if(limit)q=q.limit(limit);
  return q;
}
// El nombre viene como snapshot en la fila (sobrevive al borrado del usuario):
// se filtra en el cliente, sin mapa de perfiles.
function _plogFiltraUser(rows,f){
  if(!f.user)return rows;
  var ql=f.user.toLowerCase();
  return rows.filter(function(r){return (r.usuario||'').toLowerCase().indexOf(ql)!==-1;});
}
function _plogCuits(v){
  return (Array.isArray(v)?v:[]).map(_padFmtCuit).filter(Boolean).join(', ')||'sin CUIT';
}
function _plogConfig(v){return (v&&String(v).trim())?String(v):'sin cashback';}
function _plogAsesores(v){
  var n=_padNumAsesores({asesores:Array.isArray(v)?v:[]});
  return n?(n+' oficial'+(n>1?'es':'')):'sin oficiales';
}
// Texto humano de "cambios". Alta/baja: la foto completa de la empresa. Modificación:
// SÓLO lo que cambió, y puntual (qué CUIT entró o salió, qué oficial y qué campo),
// en vez de repetir la lista entera antes y después. Las diferencias que son sólo
// de formato (rubro vacío escrito distinto, slots de oficial vacíos) no cuentan:
// así las filas viejas que el servidor anotó de más quedan sin detalle y se ocultan.
function _plogRubroLbl(v){return _padRubroLabel({rubro:v})||'sin rubro';}
function _plogAsesorDiff(antes,despues){
  var A=Array.isArray(antes)?antes:[],D=Array.isArray(despues)?despues:[],out=[];
  var g=function(a,k){return (a&&a[k]!=null?String(a[k]):'').trim();};
  var vacio=function(a){return !g(a,'nombre')&&!g(a,'celular')&&!g(a,'email');};
  var quien=function(a){return g(a,'nombre')||g(a,'email')||g(a,'celular')||'sin nombre';};
  for(var i=0;i<Math.max(A.length,D.length);i++){
    var a=A[i]||{},d=D[i]||{};
    if(vacio(a)&&vacio(d))continue;
    if(vacio(a)){out.push(['Oficial agregado',quien(d)]);continue;}
    if(vacio(d)){out.push(['Oficial quitado',quien(a)]);continue;}
    var cambios=[];
    // cambió el nombre y además el contacto: es otra persona, no una corrección
    if(g(a,'nombre')!==g(d,'nombre')&&(g(a,'celular')!==g(d,'celular')||g(a,'email')!==g(d,'email'))){out.push(['Oficial reemplazado',quien(a)+' → '+quien(d)]);continue;}
    if(g(a,'nombre')!==g(d,'nombre'))cambios.push('nombre '+(g(a,'nombre')||'—')+' → '+(g(d,'nombre')||'—'));
    if(g(a,'celular')!==g(d,'celular'))cambios.push('celular '+(g(a,'celular')||'—')+' → '+(g(d,'celular')||'—'));
    if(g(a,'email')!==g(d,'email'))cambios.push('mail '+(g(a,'email')||'—')+' → '+(g(d,'email')||'—'));
    if(cambios.length)out.push(['Oficial',quien(cambios.length===3?d:a)+' · '+cambios.join(' · ')]);
  }
  return out;
}
function _plogDetalle(row){
  var c=row.cambios;if(!c||typeof c!=='object')c={};
  var out=[],alta=row.accion==='alta',baja=row.accion==='baja';
  if(alta||baja){
    var foto=function(lbl,k,fmt){if(!c[k])return;out.push([lbl,fmt(alta?c[k].despues:c[k].antes)]);};
    foto('CUIT','cuits',_plogCuits);
    foto('Cashback','config',_plogConfig);
    foto('Oficiales','asesores',_plogAsesores);
    foto('Rubro','rubro',_plogRubroLbl);
    return out;
  }
  if(c.cuits){
    var na=(Array.isArray(c.cuits.antes)?c.cuits.antes:[]).map(_padDigits).filter(Boolean);
    var nd=(Array.isArray(c.cuits.despues)?c.cuits.despues:[]).map(_padDigits).filter(Boolean);
    var mas=nd.filter(function(x){return na.indexOf(x)<0;}),menos=na.filter(function(x){return nd.indexOf(x)<0;});
    var partes=[];
    if(mas.length)partes.push('+ '+mas.map(_padFmtCuit).join(', '));
    if(menos.length)partes.push('− '+menos.map(_padFmtCuit).join(', '));
    if(partes.length)out.push(['CUIT',partes.join('  ')]);
  }
  if(c.config){
    var ca=_plogConfig(c.config.antes),cd=_plogConfig(c.config.despues);
    if(ca!==cd)out.push(['Cashback',ca+' → '+cd]);
  }
  if(c.asesores)out=out.concat(_plogAsesorDiff(c.asesores.antes,c.asesores.despues));
  if(c.rubro&&!_padRubroIgual(c.rubro.antes,c.rubro.despues))out.push(['Rubro',_plogRubroLbl(c.rubro.antes)+' → '+_plogRubroLbl(c.rubro.despues)]);
  return out;
}
// Una modificación sin ningún cambio real (sólo formato) no se muestra ni se exporta.
function _plogRelevante(row){return row.accion!=='modificacion'||_plogDetalle(row).length>0;}
function _plogDetalleTxt(row){
  return _plogDetalle(row).map(function(p){return p[0]+': '+p[1];}).join(' · ');
}
function loadPadronLog(){
  var container=document.getElementById('plog-list');
  if(!container)return;
  container.innerHTML=skelRows(4);
  var f=_plogFiltros();
  _plogQuery(f,500).then(function(r){
    if(r.error){container.innerHTML='<p style="color:var(--red);font-size:.8rem">Error: '+_escHtml(r.error.message)+'</p>';return;}
    var traidos=(r.data||[]).length;
    var data=_plogFiltraUser(r.data||[],f).filter(_plogRelevante);
    var countEl=document.getElementById('plog-count');
    if(countEl)countEl.textContent=data.length+' cambio'+(data.length!==1?'s':'')+(traidos>=500?' (se muestran los últimos 500; para ver todo, exportá a Excel)':'');
    if(!data.length){container.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin cambios registrados todav&iacute;a. Cada vez que alguien guarde sus empresas (Excel, editor en l&iacute;nea o desde el armador), las altas, modificaciones y bajas aparecen ac&aacute;.</p>';return;}
    // Todo lo que viene de padron_log lo escribió un usuario (razón social,
    // oficiales...): se escapa siempre antes de pintarlo.
    container.innerHTML=data.map(function(row){
      var nombre=row.usuario||'Usuario';
      var ini=_initials(nombre,'');
      var col=_avatarColor(row.user_id||nombre);
      var acc=row.accion,badge;
      if(acc==='alta')badge='<span class="badge badge-active" style="font-size:.58rem">Alta</span>';
      else if(acc==='baja')badge='<span class="badge badge-inactive" style="font-size:.58rem">Baja</span>';
      else badge='<span class="badge" style="font-size:.58rem;background:#eef0ff;color:#3a3a8c">Modificaci&oacute;n</span>';
      var det=_plogDetalle(row).map(function(p){
        return '<span class="reg-monto" style="background:#f4f4f4;color:#444"><b>'+_escHtml(p[0])+':</b> '+_escHtml(p[1])+'</span>';
      }).join('');
      var detWrap=det?'<div class="reg-montos">'+det+'</div>':'';
      return '<div class="reg-row">'+
        '<div class="usr-avatar sm" style="background:'+col+';flex-shrink:0">'+_escHtml(ini)+'</div>'+
        '<div class="reg-info">'+
          '<div class="reg-top"><span class="reg-empresa">'+_escHtml(row.empresa||'—')+'</span>'+badge+'</div>'+
          detWrap+
          '<div class="reg-mid"><span class="reg-lbl">Por</span> '+_escHtml(nombre)+
            (row.total!=null?' &nbsp;&middot;&nbsp; <span class="reg-lbl">Empresas:</span> '+(+row.total)+' empresa'+(+row.total!==1?'s':''):'')+'</div>'+
        '</div>'+
        '<span class="reg-fecha" title="'+_escAttr(row.created_at?new Date(row.created_at).toLocaleString('es-AR'):'')+'">'+_fmtDate(row.created_at)+'</span>'+
        '</div>';
    }).join('');
  });
}
function exportPadronLog(){
  var btn=document.getElementById('btn-export-plog');
  if(btn){btn.textContent='Exportando...';btn.disabled=true;}
  var f=_plogFiltros();
  _plogQuery(f,0).then(function(r){
    if(btn){btn.innerHTML='&#11015; Exportar Excel';btn.disabled=false;}
    var data=_plogFiltraUser(r.data||[],f).filter(_plogRelevante);
    if(r.error||!data.length){showToast(r.error?('Error: '+r.error.message):'Sin datos para exportar');return;}
    var rows=data.map(function(row){
      return{
        'Fecha/Hora':row.created_at?new Date(row.created_at).toLocaleString('es-AR'):'',
        'Usuario':row.usuario||'',
        'Acción':_PLOG_LBL[row.accion]||row.accion||'',
        'Empresa':row.empresa||'',
        'Detalle':_plogDetalleTxt(row),
        'Empresas (total)':row.total!=null?+row.total:''
      };
    });
    var ws=XLSX.utils.json_to_sheet(rows);
    ws['!cols']=[{wch:22},{wch:28},{wch:14},{wch:36},{wch:70},{wch:12}];
    var wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Cambios de empresas');
    XLSX.writeFile(wb,'cambios_empresas_galicia_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Excel descargado');
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
          var det=_escHtml(row.empresa||'Sin empresa')+(row.config_name?' &nbsp;&middot;&nbsp; '+_escHtml(row.config_name):'');
          return '<div class="recent-row">'+
            '<div class="usr-avatar sm" style="background:'+col+'">'+_escHtml(ini)+'</div>'+
            '<div class="recent-info"><strong>'+_escHtml(nombre)+'</strong>'+
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
// Tope 130% (pedido del admin): el redibujo de la vista previa dibuja el flyer entero
// a escala y con más zoom la página se ponía lenta y se trababa.
var _ZOOM_MAX=1.3;
function _updateZoomPct(){var el=document.getElementById('zoom-pct');if(el)el.textContent=Math.round(ZOOM*100)+'%';}
// Celular/tablet: al girar la pantalla o cambiar el ancho, la vista previa se reencaja.
var _fgResizeT=null;
window.addEventListener('resize',function(){clearTimeout(_fgResizeT);_fgResizeT=setTimeout(function(){if(typeof calcSC==='function'&&typeof redraw==='function'&&window.baseImg&&baseImg.width){calcSC();redraw();}},150);});
function zoomIn(){ZOOM=Math.min(ZOOM*1.25,_ZOOM_MAX);calcSC();redraw();_updateZoomPct();}
function zoomOut(){ZOOM=Math.max(ZOOM/1.25,0.2);calcSC();redraw();_updateZoomPct();}
function zoomReset(){ZOOM=1.0;calcSC();redraw();_updateZoomPct();}
// Sólo calcula la escala: el tamaño del canvas lo fija fgRedraw (siempre se llama después),
// y asignarlo acá también reasignaba el buffer dos veces por paso de zoom.
function calcSC(){var p=document.querySelector('.prev');if(!p||!baseImg.width)return;var pw=Math.max(p.clientWidth-40,200);var baseSC=Math.min(0.55,pw/baseImg.width);SC=baseSC*ZOOM;cv.style.width='';cv.style.height='';}

// El template también declara showToast (con #toast-el y sin debounce) y, al
// cargarse después, pisaba a ésta. _installFlyerEngine vuelve a fijar
// window.showToast=fgShowToast, así que la que corre es siempre esta versión:
// soporta los dos contenedores y reinicia el temporizador en cada aviso (antes,
// dos toasts seguidos hacían que el segundo desapareciera casi al instante).
// ── Aviso de versión nueva ────────────────────────────────────────────────────
// GitHub Pages cachea index.html 10 min y ese index viejo apunta al auth.js viejo,
// así que el admin seguía viendo código ya deployado. Se compara la meta build-v
// con version.json (pedido sin caché; sin guion bajo porque GitHub Pages no sirve
// archivos "_*"); si difieren, un cartel ofrece recargar con ?v=nuevo, que saltea
// el index.html cacheado. En file:// o sin version.json, nada.
var _updUltimo=0;
function _updChk(){
  var m=document.querySelector('meta[name=build-v]');if(!m||location.protocol==='file:')return;
  var ahora=Date.now();if(ahora-_updUltimo<5*60*1000)return;_updUltimo=ahora;
  fetch('version.json?t='+ahora,{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.v||j.v===m.content||document.getElementById('upd-banner'))return;
    var b=document.createElement('div');b.id='upd-banner';
    b.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;background:#f5921e;color:#111;font:600 .82rem/1.3 inherit;padding:10px 16px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35);cursor:pointer;max-width:92vw;text-align:center';
    b.textContent='Hay una versión nueva de la app — tocá acá para actualizar';
    b.onclick=function(){location.replace(location.pathname+'?v='+encodeURIComponent(j.v));};
    document.body.appendChild(b);
  }).catch(function(){});
}
function fgShowToast(msg){
  var t=document.getElementById('toast-el')||document.getElementById('toast');if(!t)return;
  t.textContent=msg;
  var usaClase=t.id==='toast-el';
  if(usaClase)t.classList.add('show');else t.style.opacity='1';
  clearTimeout(t._tid);
  t._tid=setTimeout(function(){if(usaClase)t.classList.remove('show');else t.style.opacity='0';},3000);
}
function showToast(msg){fgShowToast(msg);}

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

// ── PADRÓN DE EMPRESAS (buscador por razón social / CUIT) — SOLO ADMIN ─────────
// Excel precargado desde Panel Administrador → Varios. Se guarda en el bucket
// flyers como _padron.json {rows,count,updated_at}. NO se retroalimenta con lo que
// se va generando: la fuente de verdad es el Excel del admin. Es el MISMO formato
// que la plantilla del masivo + la columna cuit (que el masivo ignora), así un solo
// archivo sirve para las dos cosas.
var _padron=null,_padronAt='',_padHits=[];
var _PAD_HEAD=(function(){
  var h=['empresa','cuit','config'];
  [1,2,3,4].forEach(function(i){h.push('asesor'+i+'_nombre','asesor'+i+'_celular','asesor'+i+'_email');});
  h.push('rubro','tope','tope2'); // Flyer Rubros: opción del rubro y topes (ver _padRubroOf)
  return h;
})();
// ── Rubro por empresa (Flyer Rubros) ──────────────────────────────────────────
// Cada empresa puede tener un beneficio por rubro: {opcion:N,importe,importe2}
// (N = nº de opción de la solapa Rubros; 0 = sin rubro; importes en dígitos).
// Lo usa _padApply para completar los topes y _padCheckRubro para avisar si el
// flyer se arma en la solapa equivocada.
function _padRubroSane(r){
  r=(r&&typeof r==='object')?r:{};
  var n=parseInt(r.opcion,10);if(!(n>0))n=0;
  return {opcion:n,importe:_padDigits(r.importe),importe2:_padDigits(r.importe2)};
}
function _padRubroOpts(){return _FG_OPTS.filter(function(o){return _optSolapa(o)==='rubros';});}
// "Ambos" / "combustible" / "5" → nº de opción de rubros (0 si no coincide)
function _padRubroOf(txt){
  var t=_padNorm(txt);if(!t||t==='-'||t==='no'||t==='sin rubro')return 0;
  var opts=_padRubroOpts(),i;
  if(/^\d+$/.test(t)){var n=parseInt(t,10);return opts.indexOf(n)>=0?n:0;}
  for(i=0;i<opts.length;i++)if(_padNorm(_optLabel(opts[i]))===t)return opts[i];
  for(i=0;i<opts.length;i++){var l=_padNorm(_optLabel(opts[i]));if(l.indexOf(t)>=0||t.indexOf(l)>=0)return opts[i];}
  return 0;
}
function _padRubroLabel(r){
  var ru=_padRubroSane(r&&r.rubro);if(!ru.opcion)return '';
  var lbl=_optLabel(ru.opcion),imp=_fgFmtImporte(ru.importe),imp2=_fgFmtImporte(ru.importe2);
  if(imp)lbl+=' · '+imp+((imp2&&imp2!==imp)?' / '+imp2:'');
  return lbl;
}
function _padRubroIgual(a,b){a=_padRubroSane(a);b=_padRubroSane(b);return a.opcion===b.opcion&&(!a.opcion||(a.importe===b.importe&&(a.importe2||a.importe)===(b.importe2||b.importe)));}

function _padNorm(s){
  return (s==null?'':String(s)).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function _padKey(s){return _padNorm(s).replace(/[^a-z0-9]/g,'');}
function _padDigits(s){return (s==null?'':String(s)).replace(/\D/g,'');}
// "30-71234567-8, 30709876543" → ['30712345678','30709876543']
function _padCuits(s){
  var out=[];
  (s==null?'':String(s)).split(/[,;/|\n\r]+/).forEach(function(x){var d=_padDigits(x);if(d)out.push(d);});
  return out;
}
function _padFmtCuit(d){
  d=String(d||'');
  return d.length===11?(d.slice(0,2)+'-'+d.slice(2,10)+'-'+d.slice(10)):d;
}
function _padRubroTxt(r){var m={},k;for(k in r){if(r.hasOwnProperty(k))m[_padKey(k)]=(r[k]==null?'':String(r[k])).trim();}return m.rubro||m.rubros||m.beneficio||m.opcionrubro||'';}
// Fila cruda del Excel → fila interna. Devuelve null si no tiene ni empresa ni CUIT.
function _padRow(r){
  var m={},k;
  for(k in r){if(r.hasOwnProperty(k))m[_padKey(k)]=(r[k]==null?'':String(r[k])).trim();}
  function g(){for(var i=0;i<arguments.length;i++){var v=m[arguments[i]];if(v)return v;}return '';}
  var emp=g('empresa','razonsocial','razsocial','nombreempresa','company','cliente');
  var all=_padCuits(g('cuit','cuits','cuitgrupo','cuitsociedad'));
  for(var i=1;i<=10;i++)_padCuits(m['cuit'+i]||'').forEach(function(d){all.push(d);});
  var seen={},cuits=[];
  all.forEach(function(d){if(!seen[d]){seen[d]=1;cuits.push(d);}});
  var as=[];
  for(var n=1;n<=4;n++){
    as.push({
      nombre :m['asesor'+n+'nombre'] ||(n===1?g('nombre','asesornombre'):'')||'',
      celular:m['asesor'+n+'celular']||(n===1?g('celular','asesorcelular','cel'):'')||'',
      email  :m['asesor'+n+'email']  ||(n===1?g('email','mail','asesoremail'):'')||''
    });
  }
  if(!emp&&!cuits.length)return null;
  var rubro={opcion:_padRubroOf(g('rubro','rubros','beneficio','opcionrubro')),importe:_padDigits(g('tope','importe','tope1','importe1')),importe2:_padDigits(g('tope2','importe2'))};
  return {empresa:emp,cuits:cuits,config:g('config','cashback','tipocashback','tipodecashback','tipo','configuracion'),asesores:as,rubro:rubro};
}
// Busca por CUIT (si hay 3+ dígitos) o por coincidencia parcial de la razón social:
// todas las palabras que escribís tienen que estar en el nombre, en cualquier orden.
function padronSearch(q,limit){
  var rows=_padron||[],lim=limit||60;
  var t=_padNorm(q);
  if(!t)return rows.slice(0,lim);
  var dig=_padDigits(q),toks=t.split(' ').filter(Boolean),out=[];
  for(var i=0;i<rows.length&&out.length<lim;i++){
    var r=rows[i],hit=false;
    if(!r)continue;
    if(dig.length>=3&&r.cuits){
      for(var j=0;j<r.cuits.length;j++){if(r.cuits[j].indexOf(dig)>=0){hit=true;break;}}
    }
    if(!hit){
      var e=_padNorm(r.empresa);
      hit=!!e&&toks.every(function(k){return e.indexOf(k)>=0;});
    }
    if(hit)out.push(r);
  }
  return out;
}
function _padCuitCount(rows){
  var n=0;(rows||[]).forEach(function(r){n+=((r&&r.cuits)||[]).length;});return n;
}
// El padrón viene de un JSON del bucket: si alguna fila llega incompleta (una
// versión vieja, un archivo editado a mano, un guardado a medias) el resto del
// código se caía. Se sanea UNA vez al cargar y de ahí en más la forma es fija.
function _padSane(rows){
  var out=[];
  (rows||[]).forEach(function(r){
    if(!r||typeof r!=='object')return;
    var cu=[],seen={};
    (Array.isArray(r.cuits)?r.cuits:_padCuits(r.cuits)).forEach(function(x){
      var d=_padDigits(x);if(d&&!seen[d]){seen[d]=1;cu.push(d);}
    });
    var as=[];
    for(var n=0;n<4;n++){
      var a=(Array.isArray(r.asesores)?r.asesores[n]:null)||{};
      as.push({nombre :(a.nombre==null?'':String(a.nombre)).trim(),
               celular:(a.celular==null?'':String(a.celular)).trim(),
               email  :(a.email==null?'':String(a.email)).trim()});
    }
    var emp=(r.empresa==null?'':String(r.empresa)).trim();
    if(!emp&&!cu.length)return;
    out.push({empresa:emp,cuits:cu,config:(r.config==null?'':String(r.config)).trim(),asesores:as,rubro:_padRubroSane(r.rubro)});
  });
  return out;
}
// El padrón es PRIVADO de cada usuario y vive en la tabla padron_empresas, no en
// un archivo del bucket (que era público: cualquiera con la URL lo leía sin
// loguearse). Quién ve qué lo hace cumplir el servidor con RLS, no el cliente:
// cada uno sólo ve lo suyo, y un admin puede LEER el de los no-admin.
var _PADRON_TABLE='padron_empresas',_PADRON_COLS='empresa,cuits,config,asesores,rubro,created_at';
function _padUltimo(rows){
  var t='';(rows||[]).forEach(function(r){if(r&&r.created_at&&r.created_at>t)t=r.created_at;});
  return t;
}
function loadPadron(force,cb){
  if(_padron&&!force){if(cb)cb(_padron);return;}
  if(!_me){_padron=_padron||[];if(cb)cb(_padron);return;}
  _sb.from(_PADRON_TABLE).select(_PADRON_COLS).eq('user_id',_me.id).order('empresa',{ascending:true})
    .then(function(r){
      if(r.error){
        showToast('No se pudieron cargar tus empresas: '+r.error.message);
        _padron=_padron||[];if(cb)cb(_padron);return;
      }
      _padron=_padSane(r.data);
      _padronAt=_padUltimo(r.data);
      _pgSel={}; // los índices del generador ya no valen
      if(cb)cb(_padron);
    });
}
// Reemplaza el padrón propio de una sola vez. Va por la función padron_replace,
// que hace el borrado y la carga dentro de una transacción: si algo falla, el
// padrón queda como estaba en vez de vaciarse a medias.
function savePadron(rows,cb){
  return _sb.rpc('padron_replace',{p_rows:rows||[]})
    .then(function(r){
      if(r&&r.error){showToast('Error al guardar tus empresas: '+r.error.message);if(cb)cb(false);return;}
      _padron=rows;_padronAt=new Date().toISOString();
      _pgSel={};if(_pgOpen)_pgRender();
      if(cb)cb(true);
    });
}
// Padrón de OTRO usuario, para la solapa "Padrón Asesores" (sólo lectura: si el
// servidor no lo permite, devuelve vacío y no hay nada que mostrar).
function loadPadronDe(uid,cb){
  _sb.from(_PADRON_TABLE).select(_PADRON_COLS).eq('user_id',uid).order('empresa',{ascending:true})
    .then(function(r){
      if(r.error){showToast('No se pudieron cargar esas empresas: '+r.error.message);cb([]);return;}
      cb(_padSane(r.data));
    });
}
// ── PADRÓN: Excel (importar / exportar / plantilla) ───────────────────────────
function _padToAoa(rows){
  var out=[_PAD_HEAD.slice()];
  (rows||[]).forEach(function(r){
    var line=[r.empresa||'',(r.cuits||[]).map(_padFmtCuit).join(', '),r.config||''];
    for(var n=1;n<=4;n++){var a=(r.asesores&&r.asesores[n-1])||{};line.push(a.nombre||'',a.celular||'',a.email||'');}
    var ru=_padRubroSane(r.rubro),f1=_fgFmtImporte(ru.importe),f2=_fgFmtImporte(ru.importe2);
    line.push(ru.opcion?_optLabel(ru.opcion):'',f1?f1.slice(1):'',(f2&&f2!==f1)?f2.slice(1):'');
    out.push(line);
  });
  return out;
}
function _padCols(){
  return [{wch:34},{wch:30},{wch:10}]
    .concat([1,2,3,4].reduce(function(a){return a.concat([{wch:24},{wch:16},{wch:38}]);},[]))
    .concat([{wch:16},{wch:10},{wch:10}]);
}
function _padXlsx(rows,file,sheet){
  var wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(_padToAoa(rows));
  ws['!cols']=_padCols();
  XLSX.utils.book_append_sheet(wb,ws,sheet||'Empresas');
  XLSX.writeFile(wb,file);
}
function importPadron(input){
  var file=input&&input.files&&input.files[0];if(!file)return;input.value='';
  var st=document.getElementById('padron-stat');
  if(st)st.innerHTML='<span style="color:var(--gray)">Leyendo el Excel...</span>';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'binary'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      // Valido ANTES de guardar: si hay algo raro (cashback que no se entiende,
      // columna faltante, CUIT corto) lo muestro y decidís vos.
      var informe=_padValidate(raw);
      if(informe.problemas.length){_padAskImport(informe);return;}
      if(st)st.innerHTML='<span style="color:var(--gray)">Guardando '+informe.rows.length+' empresas...</span>';
      savePadron(informe.rows,function(ok){
        if(!ok){renderPadronAdmin();return;}
        showToast('Empresas actualizadas: '+informe.rows.length);
        renderPadronAdmin();
      });
    }catch(err){
      showToast('No se pudo leer el Excel: '+(err&&err.message||err));
      console.error('importPadron:',err);renderPadronAdmin();
    }
  };
  reader.readAsBinaryString(file);
}
// Baja el padrón tal cual está guardado (mismas columnas que la plantilla): sirve
// para editarlo en la compu y volver a subirlo.
function dlPadron(){
  loadPadron(false,function(rows){
    if(!rows||!rows.length){showToast('Todavía no cargaste empresas');return;}
    _padXlsx(rows,'Mis_Empresas_Galicia.xlsx');
    showToast('Excel descargado ('+rows.length+' empresas)');
  });
}
function dlPadronTemplate(){
  _padXlsx([
    {empresa:'Pharma Sur S.A.',cuits:['30712345678','30709876543'],config:'Config 2',
     asesores:[{nombre:'Nombre Apellido',celular:'11 1234 5678',email:'nombre.apellido@bancogalicia.com.ar'},{},{},{}],
     // rubro = nombre de una opción de Flyer Rubros; tope2 sólo si difiere (cuadro "Ambos")
     rubro:{opcion:_padRubroOpts()[0]||0,importe:'24000',importe2:''}},
    {empresa:'Empresa XYZ S.R.L.',cuits:['30711111111'],config:'BAU',
     asesores:[{nombre:'Carlos Lopez',celular:'11 4444 5555',email:'carlos.lopez@bancogalicia.com.ar'},
               {nombre:'Ana Perez',celular:'11 5555 6666',email:'ana.perez@bancogalicia.com.ar'},{},{}]},
    // así se marca una empresa a la que NO le corresponde cashback
    {empresa:'Empresa Sin Beneficio SA',cuits:['30700000001'],config:'SIN',
     asesores:[{nombre:'Nombre Apellido',celular:'11 1234 5678',email:'nombre.apellido@bancogalicia.com.ar'},{},{},{}]}
  ],'Plantilla_Empresas_Galicia.xlsx');
  showToast('Plantilla descargada!');
}
// Panel admin → Varios
function renderPadronAdmin(force){
  var st=document.getElementById('padron-stat');
  if(st&&!_padron)st.innerHTML='<span style="color:var(--gray)">Cargando tus empresas...</span>';
  loadPadron(!!force,function(rows){
    var st2=document.getElementById('padron-stat');
    if(st2){
      st2.innerHTML=rows.length
        ?('<strong>'+rows.length+'</strong> empresas &nbsp;&middot;&nbsp; <strong>'+_padCuitCount(rows)+'</strong> CUIT'+
          ' &nbsp;&middot;&nbsp; actualizado '+_fmtDate(_padronAt))
        :'Todav&iacute;a no cargaste empresas. Sub&iacute; un Excel o agregalas a mano con "Editar en l&iacute;nea".';
    }
    if(_pgOpen)_pgRender();
    var prev=document.getElementById('padron-prev');if(!prev)return;
    if(!rows.length){prev.innerHTML='';return;}
    var q=(document.getElementById('padron-q')||{}).value||'';
    var res=padronSearch(q,25);
    if(!res.length){prev.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Sin resultados para "'+_escHtml(q)+'".</p>';return;}
    prev.innerHTML='<p style="font-size:.68rem;color:var(--gray);margin:10px 0 6px">'+
        (q?('Coincidencias: '+res.length+(res.length>=25?'+':'')):('Primeras '+res.length+' de '+rows.length))+'</p>'+
      res.map(function(r){
        return '<div class="usr-row" style="align-items:flex-start">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
            '<div style="font-size:.68rem;color:var(--gray);margin-top:2px">'+
              (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+'</div>'+
          '</div>'+
          '<span style="font-size:.68rem;color:var(--gray);white-space:nowrap">'+
            _escHtml(_padCfgName(_padCfgOf(r.config)))+' &nbsp;·&nbsp; '+
            (_padNumAsesores(r)?_escHtml(_padAsesoresLbl(r)):'<span style="color:#b06000">sin oficiales asignados</span>')+
            (_padRubroLabel(r)?' &nbsp;·&nbsp; <span style="color:#b26a00" title="Beneficio por rubro (Flyer Rubros)">'+_escHtml(_padRubroLabel(r))+'</span>':'')+'</span>'+
        '</div>';
      }).join('');
  });
}
// ── PADRÓN: editor en línea (alta/baja/edición sin pasar por Excel) ──────────
// Trabaja sobre una copia (_padEdit) y sólo pega al padrón real (savePadron,
// que ya sube a Supabase Storage) cuando tocás "Guardar cambios".
var _padEdit=null,_padEditAsOpen={},_padEditQ='';
function _escAttr(s){return _escHtml(s).replace(/"/g,'&quot;');}
function togglePadronEditor(){if(_padEdit){closePadronEditor();}else{openPadronEditor();}}
function _padEditRowNew(){return {empresa:'',cuits:[],config:'',asesores:[{nombre:'',celular:'',email:''},{nombre:'',celular:'',email:''},{nombre:'',celular:'',email:''},{nombre:'',celular:'',email:''}],rubro:{opcion:0,importe:'',importe2:''}};}
function _padCloneRow(r){
  return {empresa:r.empresa||'',cuits:(r.cuits||[]).slice(),config:r.config||'',
    asesores:[0,1,2,3].map(function(n){var a=(r.asesores&&r.asesores[n])||{};return {nombre:a.nombre||'',celular:a.celular||'',email:a.email||''};}),
    rubro:_padRubroSane(r.rubro)};
}
function openPadronEditor(){
  loadPadron(false,function(rows){
    _padEdit=(rows||[]).map(_padCloneRow);
    _padEditAsOpen={};_padEditQ='';
    var vn=document.getElementById('padron-view-normal');if(vn)vn.style.display='none';
    var btn=document.getElementById('padron-edit-btn');if(btn)btn.innerHTML='&#10005; Cerrar editor';
    var ed=document.getElementById('padron-editor');if(ed)ed.style.display='block';
    _padEditRenderShell();
    _padEditRenderList();
  });
}
function closePadronEditor(){
  if(!(_padEdit&&_padEdit.length)){_padEditClose();return;}
  fgConfirm('¿Salir del editor?\n\nLos cambios sin guardar se pierden.',{ok:'Salir sin guardar',cancelar:'Seguir editando'},function(si){if(si)_padEditClose();});
}
function _padEditClose(){
  _padEdit=null;_padEditAsOpen={};_padEditQ='';
  var vn=document.getElementById('padron-view-normal');if(vn)vn.style.display='block';
  var btn=document.getElementById('padron-edit-btn');if(btn)btn.innerHTML='&#9998; Editar en l&iacute;nea';
  var ed=document.getElementById('padron-editor');if(ed){ed.style.display='none';ed.innerHTML='';}
}
function _padEditStyle(){
  if(document.getElementById('pad-edit-style'))return;
  var st=document.createElement('style');st.id='pad-edit-style';
  st.textContent=
    '.pad-erow{border:1px solid var(--border,#e2e2e2);border-radius:9px;padding:9px;margin-bottom:8px}'+
    '.pad-erow-main{display:grid;grid-template-columns:1.6fr 1.3fr 0.9fr auto auto;gap:6px;align-items:center}'+
    '.pad-erow-main.con-rubro{grid-template-columns:1.6fr 1.3fr 0.9fr 1fr 0.6fr 0.6fr auto auto}'+
    '.pad-erow-main .login-inp,.pad-erow-main select{margin-bottom:0;font-size:.78rem;padding:7px 8px}'+
    '.pad-eas{display:grid;grid-template-columns:1fr;gap:5px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border,#e2e2e2)}'+
    '.pad-eas-row{display:grid;grid-template-columns:1.2fr 0.9fr 1.3fr;gap:6px}'+
    '.pad-eas-row .login-inp{margin-bottom:0;font-size:.76rem;padding:6px 8px}'+
    '@media(max-width:760px){.pad-erow-main,.pad-eas-row{grid-template-columns:1fr}}';
  document.head.appendChild(st);
}
// El shell (filtro + botones) se dibuja UNA sola vez al abrir el editor: si se
// reescribiera en cada tecla, el input de filtro perdería el foco al tipear.
// Sólo la lista (#padron-edit-list) se refresca en cada cambio.
function _padEditRenderShell(){
  _padEditStyle();
  var ed=document.getElementById('padron-editor');if(!ed)return;
  ed.innerHTML=
    '<p style="font-size:.72rem;color:var(--gray);margin-bottom:10px">Los cambios quedan guardados en la nube reci&eacute;n cuando tocas <strong>Guardar cambios</strong>.</p>'+
    '<input type="text" class="login-inp" id="padron-edit-q" placeholder="Filtrar: raz&oacute;n social o CUIT..." autocomplete="off" oninput="_padEditFilter(this.value)" style="margin-bottom:10px">'+
    '<div class="pad-elist" id="padron-edit-list"></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'+
      '<button type="button" class="usr-btn edit" onclick="_padEditAddRow()">&#43; Agregar empresa</button>'+
      '<button type="button" class="btn-submit" onclick="_padEditSave()" style="padding:8px 16px">Guardar cambios</button>'+
      '<button type="button" class="usr-btn del" onclick="closePadronEditor()">Cancelar</button>'+
    '</div>';
}
// Igual criterio que padronSearch: por CUIT (3+ dígitos) o todas las palabras
// de la razón social, en cualquier orden. Devuelve índices reales de _padEdit
// (no posiciones filtradas), así cada fila sigue editando el registro correcto.
function _padEditMatchIdxs(){
  var rows=_padEdit||[],q=_padEditQ||'',t=_padNorm(q);
  if(!t)return rows.map(function(_,i){return i;});
  var dig=_padDigits(q),toks=t.split(' ').filter(Boolean),out=[];
  rows.forEach(function(r,i){
    var hit=false;
    if(dig.length>=3&&r.cuits){for(var j=0;j<r.cuits.length;j++){if(r.cuits[j].indexOf(dig)>=0){hit=true;break;}}}
    if(!hit){var e=_padNorm(r.empresa);hit=!!e&&toks.every(function(k){return e.indexOf(k)>=0;});}
    if(hit)out.push(i);
  });
  return out;
}
function _padEditFilter(v){_padEditQ=v;_padEditRenderList();}
function _padEditRenderList(){
  var host=document.getElementById('padron-edit-list');if(!host)return;
  var rows=_padEdit||[];
  if(!rows.length){
    host.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Todav&iacute;a no hay empresas. Agreg&aacute; la primera abajo.</p>';
    return;
  }
  var idxs=_padEditMatchIdxs();
  if(!idxs.length){
    host.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Sin resultados para "'+_escHtml(_padEditQ)+'".</p>';
    return;
  }
  host.innerHTML=
    (_padEditQ?'<p style="font-size:.68rem;color:var(--gray);margin-bottom:6px">Mostrando '+idxs.length+' de '+rows.length+'.</p>':'')+
    idxs.map(function(i){return _padEditRowHtml(_padEdit[i],i);}).join('');
}
// Mantiene compatibilidad con los llamadores existentes (toggle/agregar/eliminar):
// si el shell ya está armado sólo refresca la lista, sin tocar el filtro en foco.
function renderPadronEditor(){
  if(!document.getElementById('padron-edit-list'))_padEditRenderShell();
  _padEditRenderList();
}
function _padEditRowHtml(r,i){
  var cfgOpts=[['','Sin cashback']].concat((typeof CNAMES!=='undefined'?CNAMES:['BAU','Config 1','Config 2','Config 3','Config 4']).map(function(n){return [n,n];}));
  var cfgSel='<select onchange="_padEditField('+i+',\'config\',this.value)">'+
    cfgOpts.map(function(o){return '<option value="'+_escAttr(o[0])+'"'+(r.config===o[0]?' selected':'')+'>'+_escHtml(o[1])+'</option>';}).join('')+
    '</select>';
  var nAs=_padNumAsesores(r),open=!!_padEditAsOpen[i];
  // Flyer Rubros: rubro (opción) + topes; los topes sólo se habilitan con rubro
  var ru=_padRubroSane(r.rubro),rOpts=_padRubroOpts(),f1=_fgFmtImporte(ru.importe),f2=_fgFmtImporte(ru.importe2);
  var rubSel=!rOpts.length?'':'<select title="Rubro (Flyer Rubros)" onchange="_padEditRubro('+i+',\'opcion\',this.value)">'+
    '<option value="0">Sin rubro</option>'+rOpts.map(function(o){return '<option value="'+o+'"'+(ru.opcion===o?' selected':'')+'>'+_escHtml(_optLabel(o))+'</option>';}).join('')+'</select>'+
    '<input class="login-inp pad-tope" placeholder="Tope" inputmode="numeric" value="'+_escAttr(f1?f1.slice(1):'')+'"'+(ru.opcion?'':' disabled')+' oninput="_padEditRubro('+i+',\'importe\',this.value)">'+
    '<input class="login-inp pad-tope" placeholder="Tope 2" title="Segundo tope, s&oacute;lo si difiere (cuadro Ambos)" inputmode="numeric" value="'+_escAttr((f2&&f2!==f1)?f2.slice(1):'')+'"'+(ru.opcion?'':' disabled')+' oninput="_padEditRubro('+i+',\'importe2\',this.value)">';
  var asHtml=r.asesores.map(function(a,n){
    return '<div class="pad-eas-row">'+
      '<input class="login-inp" placeholder="Oficial '+(n+1)+': nombre" value="'+_escAttr(a.nombre)+'" oninput="_padEditAs('+i+','+n+',\'nombre\',this.value)">'+
      '<input class="login-inp" placeholder="Celular" value="'+_escAttr(a.celular)+'" oninput="_padEditAs('+i+','+n+',\'celular\',this.value)">'+
      '<input class="login-inp" placeholder="Email" value="'+_escAttr(a.email)+'" oninput="_padEditAs('+i+','+n+',\'email\',this.value)">'+
    '</div>';
  }).join('');
  return '<div class="pad-erow">'+
    '<div class="pad-erow-main'+(rubSel?' con-rubro':'')+'">'+
      '<input class="login-inp" placeholder="Raz&oacute;n social" value="'+_escAttr(r.empresa)+'" oninput="_padEditField('+i+',\'empresa\',this.value)">'+
      '<input class="login-inp" placeholder="CUIT (separados por coma)" value="'+_escAttr(r.cuits.map(_padFmtCuit).join(', '))+'" oninput="_padEditCuits('+i+',this.value)">'+
      cfgSel+rubSel+
      '<button type="button" class="usr-btn edit" onclick="_padEditToggleAs('+i+')">'+(open?'&#9650;':'&#9660;')+' Oficiales ('+nAs+')</button>'+
      '<button type="button" class="usr-btn del" onclick="_padEditRemoveRow('+i+')" title="Eliminar empresa">&#10005;</button>'+
    '</div>'+
    '<div class="pad-eas" style="display:'+(open?'grid':'none')+'">'+asHtml+'</div>'+
  '</div>';
}
function _padEditField(i,k,v){if(_padEdit&&_padEdit[i])_padEdit[i][k]=v;}
function _padEditRubro(i,k,v){
  var r=_padEdit&&_padEdit[i];if(!r)return;
  r.rubro=_padRubroSane(r.rubro);
  if(k==='opcion'){
    r.rubro.opcion=parseInt(v,10)||0;
    // habilita/deshabilita los topes de esa fila sin repintar todo
    var row=document.querySelectorAll('#padron-edit-list .pad-erow')[i];
    if(row)row.querySelectorAll('.pad-tope').forEach(function(el){el.disabled=!r.rubro.opcion;});
  }
  else r.rubro[k]=_padDigits(v);
}
function _padEditCuits(i,v){if(_padEdit&&_padEdit[i])_padEdit[i].cuits=_padCuits(v);}
function _padEditAs(i,n,k,v){if(_padEdit&&_padEdit[i]&&_padEdit[i].asesores[n])_padEdit[i].asesores[n][k]=v;}
function _padEditToggleAs(i){_padEditAsOpen[i]=!_padEditAsOpen[i];_padEditRenderList();}
function _padEditAddRow(){
  if(!_padEdit)return;
  _padEdit.push(_padEditRowNew());
  if(_padEditQ){ // si hay un filtro puesto, la fila nueva (vacía) no matchearía: lo limpio
    _padEditQ='';
    var q=document.getElementById('padron-edit-q');if(q)q.value='';
  }
  _padEditRenderList();
  var last=document.querySelector('#padron-edit-list .pad-erow:last-child .pad-erow-main input');if(last)last.focus();
}
function _padEditRemoveRow(i){
  if(!_padEdit||!_padEdit[i])return;
  var r=_padEdit[i],label=r.empresa||'esta empresa';
  fgConfirm('¿Eliminar '+label+' de tus empresas?',{ok:'Eliminar'},function(si){
    if(!si||!_padEdit||_padEdit[i]!==r)return;
    _padEdit.splice(i,1);
    delete _padEditAsOpen[i];
    _padEditRenderList();
  });
}
function _padEditSave(){
  if(!_padEdit)return;
  var rows=_padSane(_padEdit);
  var btn=document.querySelector('#padron-editor .btn-submit');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  savePadron(rows,function(ok){
    if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
    if(!ok)return;
    showToast('Empresas actualizadas: '+rows.length);
    _padEditClose();
    renderPadronAdmin(true);
  });
}
// ── PADRÓN ASESORES: el admin consulta (sin editar) el padrón de otros ───────
// Los admin no figuran en la lista: su padrón es privado incluso entre ellos, y
// el servidor lo hace cumplir igual aunque alguien fuerce el id acá.
var _poUsers=null,_poRows=null,_poNombre='';
function loadPadronOtrosUsers(force){
  var sel=document.getElementById('po-user');if(!sel)return;
  if(_poUsers&&!force){_poFillSelect();return;}
  _sb.from('profiles').select('id,full_name,email_asesor,role')
    .neq('role','admin').order('full_name',{ascending:true})
    .then(function(r){
      if(r.error){showToast('No se pudo cargar la lista: '+r.error.message);return;}
      _poUsers=r.data||[];
      _poFillSelect();
    });
}
function _poFillSelect(){
  var sel=document.getElementById('po-user');if(!sel)return;
  var prev=sel.value;
  sel.innerHTML='<option value="">Eleg&iacute; un usuario...</option>'+
    (_poUsers||[]).map(function(u){
      var nom=u.full_name||u.email_asesor||'(sin nombre)';
      return '<option value="'+_escAttr(u.id)+'">'+_escHtml(nom)+' &middot; '+_escHtml(_ROLE_LBL[u.role]||u.role)+'</option>';
    }).join('');
  if(prev)sel.value=prev;
  if(!(_poUsers||[]).length){
    var st=document.getElementById('po-stat');
    if(st)st.innerHTML='No hay usuarios (adem&aacute;s de los administradores) todav&iacute;a.';
  }
}
function renderPadronOtros(){
  var sel=document.getElementById('po-user'),st=document.getElementById('po-stat');
  var q=document.getElementById('po-q'),dl=document.getElementById('po-dl');
  var uid=sel?sel.value:'';
  _poRows=null;
  var u=(_poUsers||[]).filter(function(x){return x.id===uid;})[0];
  _poNombre=u?(u.full_name||u.email_asesor||'usuario'):'';
  if(!uid){
    if(st)st.innerHTML='';if(q)q.style.display='none';if(dl)dl.style.display='none';
    var l0=document.getElementById('po-list');if(l0)l0.innerHTML='';
    return;
  }
  if(st)st.innerHTML='<span style="color:var(--gray)">Cargando...</span>';
  loadPadronDe(uid,function(rows){
    _poRows=rows;
    if(st){
      st.innerHTML=rows.length
        ?('<strong>'+rows.length+'</strong> empresas &nbsp;&middot;&nbsp; <strong>'+_padCuitCount(rows)+'</strong> CUIT &nbsp;&middot;&nbsp; s&oacute;lo lectura')
        :'Este usuario todav&iacute;a no carg&oacute; ninguna empresa.';
    }
    if(q){q.style.display=rows.length?'':'none';q.value='';}
    if(dl)dl.style.display=rows.length?'':'none';
    renderPadronOtrosList();
  });
}
function renderPadronOtrosList(){
  var host=document.getElementById('po-list');if(!host)return;
  var rows=_poRows||[];
  if(!rows.length){host.innerHTML='';return;}
  var q=(document.getElementById('po-q')||{}).value||'';
  var t=_padNorm(q),dig=_padDigits(q),toks=t.split(' ').filter(Boolean);
  var res=!t?rows:rows.filter(function(r){
    if(dig.length>=3&&r.cuits){for(var j=0;j<r.cuits.length;j++)if(r.cuits[j].indexOf(dig)>=0)return true;}
    var e=_padNorm(r.empresa);return !!e&&toks.every(function(k){return e.indexOf(k)>=0;});
  });
  if(!res.length){host.innerHTML='<p style="font-size:.78rem;color:var(--gray);margin-top:10px">Sin resultados para "'+_escHtml(q)+'".</p>';return;}
  host.innerHTML='<p style="font-size:.68rem;color:var(--gray);margin:10px 0 6px">'+
      (t?('Coincidencias: '+res.length):('Mostrando '+res.length))+'</p>'+
    res.map(function(r){
      return '<div class="usr-row" style="align-items:flex-start">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
          '<div style="font-size:.68rem;color:var(--gray);margin-top:2px">'+
            (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+'</div>'+
        '</div>'+
        '<span style="font-size:.68rem;color:var(--gray);white-space:nowrap">'+
          _escHtml(_padCfgName(_padCfgOf(r.config)))+' &nbsp;·&nbsp; '+
          (_padNumAsesores(r)?_escHtml(_padAsesoresLbl(r)):'<span style="color:#b06000">sin oficiales asignados</span>')+
          (_padRubroLabel(r)?' &nbsp;·&nbsp; <span style="color:#b26a00" title="Beneficio por rubro (Flyer Rubros)">'+_escHtml(_padRubroLabel(r))+'</span>':'')+'</span>'+
      '</div>';
    }).join('');
}
function dlPadronDe(){
  if(!_poRows||!_poRows.length){showToast('No hay empresas para descargar');return;}
  _padXlsx(_poRows,'Empresas_'+_fgSafeName(_poNombre||'usuario')+'.xlsx');
  showToast('Excel descargado ('+_poRows.length+' empresas)');
}

// ── MASIVO: "todo el segmento" desde el padrón ──────────────────────────────
// Tarjeta al pie de la solapa Masivo: genera de una el flyer de TODAS las
// empresas del padrón que salen con la opción activa (el "segmento":
// Combustible, Supermercado, la opción de Flyer Galicia en uso...). Para todo
// el padrón, con cada empresa en su formato, está el generador de Mi padrón.
// Reusa _pgGenerarRows con su propia barra de progreso.
function _mpRows(){
  if(!_padron)return [];
  var cur=_optN(_fgOpt);
  return _padron.filter(function(r){return _pgOptDe(r)===cur;});
}
function _mpEnsure(){
  var tab=document.getElementById('tab-masivo');if(!tab||document.getElementById('fg-mp'))return;
  var d=document.createElement('div');d.id='fg-mp';
  d.innerHTML='<div class="sec">Desde mis empresas</div>'+
    '<div class="cfg-box" id="fg-mp-box">'+
      '<strong id="fg-mp-tit">Todo el segmento</strong>'+
      '<p id="fg-mp-txt" style="font-size:.72rem;color:var(--gray);line-height:1.45;margin:0 0 8px"></p>'+
      '<button class="btn bgreen" id="fg-mp-btn" style="width:100%" onclick="_mpGenerar()">&#9889; Descargar todos</button>'+
      '<div id="fg-mp-prog" style="display:none;margin-top:8px"><div class="progress-bar" style="display:block"><div class="progress-fill" id="fg-mp-fill" style="width:0%"></div></div><div class="progress-text" id="fg-mp-text"></div></div>'+
      '<p style="font-size:.68rem;color:var(--gray);line-height:1.45;margin:8px 0 0">&#128161; Si quer&eacute;s descargar <strong>todas tus empresas</strong> (cada una en su formato), and&aacute; a <a href="#" onclick="openMiPadron();return false" style="color:var(--red);font-weight:600">Base de datos &rarr; Generar flyers</a>.</p>'+
    '</div>';
  tab.appendChild(d);
}
// Rearma la tarjeta: se llama al cambiar de opción, de facultades o al cerrar Mi padrón.
function _mpRefresh(){
  var ok=_can('padron_buscar');
  if(ok)_mpEnsure();
  var d=document.getElementById('fg-mp');if(!d)return;
  d.style.display=ok?'':'none';if(!ok)return;
  var lbl=_optLabel(_fgOpt);
  var tit=document.getElementById('fg-mp-tit');if(tit)tit.textContent='Todo el segmento «'+lbl+'»';
  loadPadron(false,function(){
    if(_optLabel(_fgOpt)!==lbl)return; // cambió de opción mientras cargaba: ya se rearmó
    var n=_mpRows().length,txt=document.getElementById('fg-mp-txt'),btn=document.getElementById('fg-mp-btn');
    if(txt)txt.innerHTML=n?('Genera de una el flyer de las <strong>'+n+' empresa'+(n!==1?'s':'')+'</strong> de tu base que salen con este formato, con sus oficiales, cashback y topes, en un ZIP.'):
      'Ninguna de tus empresas sale con este formato todav&iacute;a.';
    if(btn){btn.disabled=!n||_pgBusy;btn.innerHTML='&#9889; Descargar '+(n?(n+' flyer'+(n!==1?'s':'')):'todos')+' de &laquo;'+_escHtml(lbl)+'&raquo;';}
  });
}
function _mpGenerar(){
  if(_pgBusy)return;
  var rows=_mpRows();if(!rows.length){showToast('No tenés empresas de este segmento');return;}
  _pgGenerarRows(rows,'pdf',{prog:'fg-mp-prog',fill:'fg-mp-fill',txt:'fg-mp-text',btn:'fg-mp-btn'},'Flyers_'+_fgSafeName(_optLabel(_fgOpt)));
}

// ── PADRÓN: generar los flyers de varias empresas de una (ZIP por formato) ───
// Desde Data → Mi padrón: se eligen empresas (o todas) y sale un ZIP con el
// flyer de cada una en SU formato: el rubro del padrón decide la opción (Flyer
// Rubros → Combustible / Supermercado / Ambos…) y, sin rubro, va por el armador
// común (la última opción usada de Flyer Galicia). Los datos salen del padrón
// (oficiales, cashback, topes); el legal es el de cada opción. El ZIP trae una
// carpeta por formato y un Resumen.txt, y al terminar se muestra el resumen.
// Reusa el motor del masivo (fullRes + jsPDF) cambiando de opción por grupo.
var _pgSel={},_pgOpen=false,_pgBusy=false,_pgQ='';
function _pgToggle(){
  if(_pgBusy)return;
  _pgOpen=!_pgOpen;
  var vn=document.getElementById('padron-view-normal'),pg=document.getElementById('padron-gen'),btn=document.getElementById('padron-gen-btn');
  if(_pgOpen){
    if(_padEdit)closePadronEditor();
    if(_padEdit){_pgOpen=false;return;} // no quiso salir del editor
    _pgOpen=true;
    if(vn)vn.style.display='none';
    if(pg)pg.style.display='block';
    if(btn)btn.innerHTML='&#10005; Cerrar generador';
    loadPadron(false,function(){_pgRender();});
  }else{
    if(vn)vn.style.display='';
    if(pg){pg.style.display='none';pg.innerHTML='';}
    if(btn)btn.innerHTML='&#9889; Generar flyers';
  }
}
// Opción con la que se genera esa empresa: el rubro del padrón si está
// habilitado para este perfil; sin rubro, la última opción usada del armador
// común. Negativo = tiene rubro pero la opción no está habilitada; 0 = ninguna.
function _pgOptDe(r){
  var ru=_padRubroSane(r&&r.rubro);
  if(ru.opcion)return (_FG_OPTS.indexOf(ru.opcion)>=0&&_can('opcion_'+ru.opcion))?ru.opcion:-ru.opcion;
  var fl=_facOptsDe('flyer'),u=(typeof _fgUltOpt!=='undefined'&&_fgUltOpt)?_fgUltOpt.flyer:0;
  if(u&&fl.indexOf(u)>=0)return u;
  return fl[0]||0;
}
function _pgFormatoLbl(opt){return opt>0?(_solapaLabel(_optSolapa(opt))+' · '+_optLabel(opt)):'sin formato disponible';}
function _pgAvisos(r,opt){
  var a=[];
  if(opt<0)a.push('rubro «'+_optLabel(-opt)+'» no habilitado para tu perfil');
  else if(!opt)a.push('sin opción habilitada');
  if(!_padNumAsesores(r))a.push('sin oficiales');
  if(_padCfgOf(r.config)<0)a.push('sin cashback');
  if(opt>0&&_optSolapa(opt)==='rubros'&&!_padRubroSane(r.rubro).importe)a.push('sin tope (se usa el del formulario o $24.000)');
  return a;
}
function _pgFiltrados(){
  if(!_padron)return [];
  var rows=_pgQ?padronSearch(_pgQ,100000):_padron.slice();
  return rows.map(function(r){return _padron.indexOf(r);}).filter(function(i){return i>=0;});
}
function _pgCount(){var n=0;for(var k in _pgSel)if(_pgSel[k]&&_padron&&_padron[k])n++;return n;}
function _pgRender(){
  var pg=document.getElementById('padron-gen');if(!pg||!_pgOpen)return;
  if(!_padron||!_padron.length){pg.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Todav&iacute;a no cargaste empresas.</p>';return;}
  if(!document.getElementById('pg-list')){
    pg.innerHTML=
      '<p style="font-size:.76rem;color:var(--gray);line-height:1.5;margin-bottom:10px">Tild&aacute; las empresas (o &laquo;Todas&raquo;) y gener&aacute; el ZIP: cada flyer sale en <strong>su formato</strong> seg&uacute;n el rubro que tenga cargado, con sus oficiales, cashback y topes. Al lado de cada empresa ves con qu&eacute; formato va a salir.</p>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'+
        '<input type="text" id="pg-q" class="login-inp" placeholder="Filtrar por raz&oacute;n social o CUIT..." autocomplete="off" style="margin-bottom:0;flex:1;min-width:180px" oninput="_pgQ=this.value;_pgRender()">'+
        '<button type="button" class="usr-btn edit" onclick="_pgTodas(true)">Todas</button>'+
        '<button type="button" class="usr-btn edit" onclick="_pgTodas(false)">Ninguna</button>'+
        '<select id="pg-fmt" class="login-inp" style="margin-bottom:0;width:auto;padding:6px 8px"><option value="pdf">PDF</option><option value="png">PNG</option></select>'+
        '<button type="button" class="btn-submit" id="pg-btn" style="padding:8px 16px" onclick="_pgGenerar()">&#9889; Generar ZIP</button>'+
      '</div>'+
      '<div id="pg-count" style="font-size:.72rem;color:var(--gray);margin-bottom:6px"></div>'+
      '<div id="pg-prog" style="display:none;margin:6px 0 10px"><div class="progress-bar" style="display:block"><div class="progress-fill" id="pg-fill" style="width:0%"></div></div><div class="progress-text" id="pg-text"></div></div>'+
      '<div id="pg-list"></div>';
    var q=document.getElementById('pg-q');if(q)q.value=_pgQ;
  }
  var idx=_pgFiltrados(),host=document.getElementById('pg-list');
  var sel=_pgCount(),vis=idx.filter(function(i){return _pgSel[i];}).length;
  var cnt=document.getElementById('pg-count');
  if(cnt)cnt.innerHTML='<strong>'+sel+'</strong> de '+_padron.length+' empresa'+(_padron.length!==1?'s':'')+' seleccionada'+(sel!==1?'s':'')+(_pgQ?(' &middot; mostrando '+idx.length+' ('+vis+' tildada'+(vis!==1?'s':'')+')'):'');
  if(!idx.length){host.innerHTML='<p style="font-size:.78rem;color:var(--gray);margin-top:10px">Sin resultados para "'+_escHtml(_pgQ)+'".</p>';return;}
  host.innerHTML=idx.map(function(i){
    var r=_padron[i],opt=_pgOptDe(r),av=_pgAvisos(r,opt);
    var lbl=_pgFormatoLbl(opt),rub=_padRubroLabel(r);
    return '<label class="usr-row" style="align-items:flex-start;cursor:pointer;gap:10px">'+
      '<input type="checkbox" style="margin-top:3px;width:auto"'+(_pgSel[i]?' checked':'')+(opt>0?'':' disabled')+' onchange="_pgSet('+i+',this.checked)">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
        '<div style="font-size:.68rem;color:var(--gray);margin-top:2px">'+
          (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+
          ' &nbsp;·&nbsp; '+_escHtml(_padCfgName(_padCfgOf(r.config)))+' &nbsp;·&nbsp; '+_escHtml(_padAsesoresLbl(r))+
          (rub?' &nbsp;·&nbsp; <span style="color:#b26a00">'+_escHtml(rub)+'</span>':'')+
        '</div>'+
        (av.length?'<div style="font-size:.66rem;color:#b06000;margin-top:2px">&#9888; '+_escHtml(av.join(' · '))+'</div>':'')+
      '</div>'+
      '<span style="font-size:.68rem;white-space:nowrap;padding:3px 8px;border-radius:12px;background:'+(opt>0?(_optSolapa(opt)==='rubros'?'#fff3e0':'#eef3fb'):'#f3f3f3')+';color:'+(opt>0?(_optSolapa(opt)==='rubros'?'#b26a00':'#1d4070'):'#999')+'">'+_escHtml(lbl)+'</span>'+
    '</label>';
  }).join('');
}
function _pgSet(i,on){if(on)_pgSel[i]=true;else delete _pgSel[i];_pgRender();}
function _pgTodas(on){
  _pgFiltrados().forEach(function(i){if(on&&_pgOptDe(_padron[i])>0)_pgSel[i]=true;else if(!on)delete _pgSel[i];});
  _pgRender();
}
// Valores del flyer de una fila del padrón (mismo contrato v que el masivo).
function _pgVals(r,opt,legal,impForm,res){
  var ci=_padCfgOf(r.config),cfg=CONFIGS[ci<0?0:ci]||{};
  var v={empresa:r.empresa||'',nocb:ci<0,m1:cfg.m1,m2:cfg.m2,m3:cfg.m3,m4:cfg.m4,legal:legal};
  if(ci<0)res.sinCB.push(r.empresa);
  if(!_padNumAsesores(r))res.sinOf.push(r.empresa);
  for(var n=1;n<=4;n++){
    var a=(r.asesores&&r.asesores[n-1])||{},nom=(a.nombre||'').trim(),sfx=(n===1)?'':String(n);
    v['has'+n]=nom!=='';
    v['nombre'+sfx]=nom;
    v['celular'+sfx]=(a.celular||'').trim()?'Cel: '+String(a.celular).trim():'';
    v['email'+sfx]=nom?((a.email||'').trim()||_fgMailFromName(nom)):'';
  }
  if(_optSolapa(opt)==='rubros'){
    var ru=_padRubroSane(r.rubro);
    v.benef=true;v.benefNombre=r.empresa||'';
    v.importe=_fgFmtImporte(ru.importe);
    if(!v.importe){v.importe=impForm;res.sinTope.push(r.empresa);}
    v.importe2=_fgFmtImporte(ru.importe2)||v.importe;
  }
  return v;
}
function _pgGenerar(){
  if(_pgBusy||!_padron)return;
  var rows=[];Object.keys(_pgSel).forEach(function(k){if(_pgSel[k]&&_padron[k])rows.push(_padron[k]);});
  if(!rows.length){showToast('Tildá al menos una empresa');return;}
  var fmtEl=document.getElementById('pg-fmt'),fmt=(fmtEl&&fmtEl.value==='png')?'png':'pdf';
  _pgGenerarRows(rows,fmt,{prog:'pg-prog',fill:'pg-fill',txt:'pg-text',btn:'pg-btn'},'Flyers_Empresas');
}
// Motor común: genera el ZIP de esas filas del padrón. ui = ids de la barra de
// progreso y el botón a usar (el generador de Mi padrón y la tarjeta del masivo
// tienen cada uno los suyos); zipBase = prefijo del nombre del ZIP.
function _pgGenerarRows(rows,fmt,ui,zipBase){
  if(_pgBusy||!rows||!rows.length)return;
  var grupos={},orden=[],res={total:0,fmt:fmt,fecha:new Date(),porOpt:{},sinOf:[],sinCB:[],sinTope:[],omitidas:[],errores:[],carpetas:{}};
  rows.forEach(function(r){var o=_pgOptDe(r);if(o<=0){res.omitidas.push(r.empresa+(o<0?' (rubro '+_optLabel(-o)+' no habilitado)':' (sin opción habilitada)'));return;}if(!grupos[o]){grupos[o]=[];orden.push(o);}grupos[o].push(r);});
  if(!orden.length){showToast('Ninguna de las empresas tildadas se puede generar con tu perfil');return;}
  var origen=_optN(_fgOpt),zip=new JSZip(),n=rows.length-res.omitidas.length,hecho=0;
  var impForm=_fgFmtImporte((document.getElementById('benef-importe')||{}).value||'')||'$24.000';
  var prog=document.getElementById(ui.prog),fill=document.getElementById(ui.fill),txt=document.getElementById(ui.txt),btn=document.getElementById(ui.btn);
  _pgBusy=true;if(prog)prog.style.display='block';if(fill)fill.style.width='0%';if(btn)btn.disabled=true;
  if(txt)txt.textContent='Preparando...';
  var gi=0;
  function grupo(){
    if(gi>=orden.length){fin();return;}
    var opt=orden[gi++];
    _fgWithOpt(opt,function(){
      var legal=(document.getElementById('legal-text')||{}).value||'';
      var lista=grupos[opt],k=0,carpeta=_fgSafeName(_pgFormatoLbl(opt).replace(' · ',' - ')),usados={};
      res.carpetas[opt]=carpeta;
      function uno(){
        if(k>=lista.length){setTimeout(grupo,60);return;}
        var r=lista[k++];
        if(txt)txt.textContent='Generando '+(hecho+1)+' de '+n+' — '+_pgFormatoLbl(opt)+': '+(r.empresa||'');
        try{
          var v=_pgVals(r,opt,legal,impForm,res),fc=fullRes(v);
          var base='Flyer '+_fgSafeName(v.empresa||'empresa'),nom=base;
          usados[base]=(usados[base]||0)+1;if(usados[base]>1)nom=base+' ('+usados[base]+')';
          if(fmt==='png')zip.file(carpeta+'/'+nom+'.png',fc.toDataURL('image/png').split(',')[1],{base64:true});
          else{
            var jsPDF=window.jspdf.jsPDF,pw=210,ph=(fc.height/fc.width)*pw;
            var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
            pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
            zip.file(carpeta+'/'+nom+'.pdf',pdf.output('arraybuffer'));
          }
          res.total++;res.porOpt[opt]=(res.porOpt[opt]||0)+1;
        }catch(e){res.errores.push((r.empresa||'?')+': '+((e&&e.message)||e));}
        hecho++;if(fill)fill.style.width=Math.round(hecho/n*100)+'%';
        setTimeout(uno,120);
      }
      uno();
    });
  }
  function fin(){
    if(txt)txt.textContent='Empaquetando ZIP...';
    var d=res.fecha,fecha=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    res.zip=(zipBase||'Flyers_Empresas')+'_'+fecha+'.zip';
    zip.file('Resumen.txt',_pgResumenTxt(res));
    zip.generateAsync({type:'blob'}).then(function(content){
      var a=document.createElement('a');a.download=res.zip;a.href=URL.createObjectURL(content);a.click();
      if(res.total)logFlyerBulkToSupabase(res.total,'padron');
      if(txt)txt.textContent='✓ ZIP con '+res.total+' flyer'+(res.total!==1?'s':'')+'.';
      if(btn)btn.disabled=false;_pgBusy=false;
      if(origen!==_optN(_fgOpt)&&_can('opcion_'+origen))switchFlyerOption(origen);
      _pgResumenModal(res);
    }).catch(function(e){
      if(txt)txt.textContent='Error al armar el ZIP: '+((e&&e.message)||e);
      if(btn)btn.disabled=false;_pgBusy=false;
      if(origen!==_optN(_fgOpt)&&_can('opcion_'+origen))switchFlyerOption(origen);
    });
  }
  grupo();
}
function _pgLista(arr,max){
  max=max||6;var out=arr.slice(0,max).join(', ');
  if(arr.length>max)out+=' y '+(arr.length-max)+' más';
  return out;
}
function _pgResumenTxt(res){
  var L=['FLYERS GENERADOS DESDE EL PADRÓN','Fecha: '+_fmtDate(res.fecha.toISOString()),'Formato de archivo: '+res.fmt.toUpperCase(),'Total: '+res.total+' flyer'+(res.total!==1?'s':''),'',
    'POR FORMATO'];
  Object.keys(res.porOpt).forEach(function(o){L.push('  '+_pgFormatoLbl(+o)+': '+res.porOpt[o]+'  (carpeta "'+res.carpetas[o]+'")');});
  L.push('','OBSERVACIONES');
  var obs=0;
  function ob(t,arr){if(arr.length){obs++;L.push('  '+arr.length+' '+t+': '+arr.join(', '));}}
  ob('sin oficiales asignados (salen sin datos de contacto)',res.sinOf);
  ob('sin cashback (importes en blanco)',res.sinCB);
  ob('sin tope cargado (se usó el del formulario)',res.sinTope);
  ob('no generadas',res.omitidas);
  ob('con error',res.errores);
  if(!obs)L.push('  Ninguna.');
  return L.join('\n');
}
function _pgResumenModal(res){
  var filas=Object.keys(res.porOpt).map(function(o){return '<tr><td>'+_escHtml(_pgFormatoLbl(+o))+'</td><td style="text-align:right"><strong>'+res.porOpt[o]+'</strong></td><td style="color:var(--gray)">'+_escHtml(res.carpetas[o]||'')+'/</td></tr>';}).join('');
  var obs=[];
  function ob(t,arr){if(arr.length)obs.push('<li><strong>'+arr.length+'</strong> '+t+': '+_escHtml(_pgLista(arr))+'</li>');}
  ob('sin oficiales asignados (salen sin datos de contacto)',res.sinOf);
  ob('sin cashback (importes en blanco)',res.sinCB);
  ob('sin tope cargado (se us&oacute; el del formulario)',res.sinTope);
  ob('no generadas',res.omitidas);
  ob('con error',res.errores);
  _padPending=null;
  _padModal('<h3>&#10003; Flyers generados</h3>'+
    '<p class="pu-sub"><strong>'+res.total+' flyer'+(res.total!==1?'s':'')+'</strong> en '+res.fmt.toUpperCase()+' &middot; <code>'+_escHtml(res.zip)+'</code> &middot; '+_escHtml(_fmtDate(res.fecha.toISOString()))+'</p>'+
    '<table style="width:100%;border-collapse:collapse;font-size:.8rem;margin:8px 0"><thead><tr style="color:var(--gray);font-size:.68rem;text-transform:uppercase"><th style="text-align:left;padding:4px 0">Formato</th><th style="text-align:right;padding:4px 0">Cantidad</th><th style="text-align:left;padding:4px 8px">Carpeta</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    (obs.length?'<p class="pu-sub" style="margin-top:8px"><strong>Observaciones</strong></p><ul>'+obs.join('')+'</ul>':'<p class="pu-sub">Sin observaciones: todas las empresas ten&iacute;an oficiales, cashback y topes.</p>')+
    '<p class="pu-hint">El mismo resumen va dentro del ZIP como <code>Resumen.txt</code>.</p>'+
    '<div class="pu-foot"><button class="pu-si" onclick="_padCloseUpdate(0)">Cerrar</button></div>');
}
// ── PADRÓN: lupita + popover de búsqueda en el armador (SOLO ADMIN) ───────────
// Se inyecta al lado del input "Nombre de la empresa". Para asesores y VIP la
// pantalla queda exactamente como hoy (no se llama nunca a esta función).
function _fgEnsurePadronBtn(){
  if(document.getElementById('fg-pad-btn'))return;
  var inp=document.getElementById('empresa');if(!inp||!inp.parentNode)return;
  if(!document.getElementById('fg-pad-style')){
    var st=document.createElement('style');st.id='fg-pad-style';
    st.textContent=
      '.fg-pad-wrap{display:flex;gap:6px;align-items:stretch}'+
      '.fg-pad-wrap>input{flex:1;min-width:0}'+
      '#fg-pad-btn{flex:0 0 auto;width:40px;border:1.5px solid var(--border,#ddd);background:none;'+
        'border-radius:8px;cursor:pointer;font-size:.95rem;line-height:1;color:var(--gray,#777);transition:.15s}'+
      '#fg-pad-btn:hover{border-color:var(--red,#c62828);color:var(--red,#c62828)}'+
      '.pad-pop{position:fixed;z-index:9999;width:min(420px,calc(100vw - 24px));background:#fff;'+
        'border:1.5px solid var(--border,#ddd);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.18);overflow:hidden}'+
      'html.dark .pad-pop{background:#23262c;border-color:#3a3e46}'+
      '.pad-head{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;'+
        'font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--gray,#777);'+
        'border-bottom:1px solid var(--border,#eee)}'+
      'html.dark .pad-head{border-color:#3a3e46}'+
      '.pad-x{cursor:pointer;font-size:.8rem}.pad-x:hover{color:var(--red,#c62828)}'+
      '.pad-q{width:100%;border:none;border-bottom:1px solid var(--border,#eee);padding:10px 12px;'+
        'font-size:.85rem;outline:none;background:none;color:inherit;font-family:inherit}'+
      'html.dark .pad-q{border-color:#3a3e46}'+
      '.pad-list{max-height:min(46vh,340px);overflow-y:auto}'+
      '.pad-item{padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(128,128,128,.12)}'+
      '.pad-item:last-child{border-bottom:none}'+
      '.pad-item:hover,.pad-item.on{background:rgba(198,40,40,.07)}'+
      '.pad-emp{display:block;font-size:.82rem;font-weight:600}'+
      '.pad-sub{display:block;font-size:.66rem;color:var(--gray,#888);margin-top:2px}'+
      '.pad-empty{padding:16px 12px;font-size:.76rem;color:var(--gray,#888);text-align:center;line-height:1.5}'+
      '.pad-more{padding:7px 12px;font-size:.64rem;color:var(--gray,#888);text-align:center;'+
        'border-top:1px solid rgba(128,128,128,.16)}'+
      '#pad-sug{box-sizing:border-box;width:auto}';
    document.head.appendChild(st);
  }
  var wrap=document.createElement('div');wrap.className='fg-pad-wrap';
  inp.parentNode.insertBefore(wrap,inp);
  wrap.appendChild(inp);
  wrap.insertAdjacentHTML('beforeend',
    '<button type="button" id="fg-pad-btn" onclick="openPadronPop()" title="Buscar en mis empresas (razón social o CUIT)">&#128269;</button>');
  // typeahead: mientras escribís el nombre te va diciendo si ya está en el padrón
  inp.setAttribute('autocomplete','off');
  inp.addEventListener('input',_padSugRender);
  inp.addEventListener('keydown',_padSugKey);
  inp.addEventListener('focus',function(){if(inp.value.trim())_padSugRender();});
  window.addEventListener('resize',_padSugPos);
  window.addEventListener('scroll',_padSugPos,true);
  loadPadron(false); // precarga para que la primera búsqueda salga instantánea
}
// ── "BASE DE DATOS": lo guardado por el usuario, sin ser admin ───────────────
// Los bloques de empresas (#at-varios) y asesores (#at-asesores) viven dentro del
// panel Admin, que sólo el admin puede abrir: un asesor con la facultad tenía la
// lupa pero NINGUNA forma de cargar sus empresas. Este modal toma esos mismos
// bloques —los nodos reales, con sus ids y sus funciones— y los muestra a quien
// tenga la facultad; al cerrar los devuelve a su lugar. Así hay UNA sola
// implementación para todos, y la privacidad la sigue garantizando RLS (cada uno
// sólo ve y toca sus filas).
// La barra de solapas de adentro la dibuja JS acá y no existe en el HTML: en el
// panel admin esos bloques ya son dos sub-solapas, y una barra dentro de otra
// sería confusa.
var _padMineHome=[],_bdPane='empresas';
// Icono del título. Va como SVG y no como emoji: el fichero U+1F5C4 no está en
// las fuentes de Windows y salía como un glifo roto al lado del nombre.
var _BD_ICO='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '+
  'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '+
  'style="vertical-align:-3px;margin-right:8px"><ellipse cx="12" cy="5.5" rx="8" ry="3"/>'+
  '<path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M4 11.5v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>';
function _padMineStyle(){
  if(document.getElementById('pad-mine-style'))return;
  var st=document.createElement('style');st.id='pad-mine-style';
  st.textContent=
    '#pad-mine-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9990;display:flex;'+
      'align-items:center;justify-content:center;padding:14px}'+
    '#pad-mine{background:#fff;color:var(--dark,#111);border-radius:14px;width:min(860px,100%);max-height:92vh;'+
      'display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden}'+
    'html.dark #pad-mine{background:#23262c;color:#e8e8e8}'+
    '#pad-mine .pm-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;'+
      'border-bottom:1px solid var(--border,#e5e5e5);font-family:"Syne",sans-serif;font-weight:800;font-size:1rem}'+
    'html.dark #pad-mine .pm-head{border-color:#3a3e46}'+
    '#pad-mine .pm-x{cursor:pointer;font-size:1rem;color:var(--gray,#888);padding:2px 6px}'+
    '#pad-mine .pm-x:hover{color:var(--red,#c62828)}'+
    // Las solapas se dibujan como pestañas de verdad: el estilo heredado de
    // .stabs-in deja la INACTIVA sin fondo ni borde (texto gris sobre el fondo
    // del modal) y parecía que no había nada para tocar. Acá la inactiva tiene
    // fondo y borde propios, y la activa se rellena con el color de la paleta.
    // overflow:visible es clave: .stabs trae overflow-x:auto y el navegador dibuja
    // la barra de scroll DENTRO de la fila, cruzando las pestañas como si tacharan
    // el texto. Si no entran, bajan de línea (wrap) en vez de scrollear.
    '#pad-mine .pm-tabs{padding:12px 18px 0;margin:0;gap:8px;overflow:visible;overflow-x:visible;'+
      'overflow-y:visible;flex-wrap:wrap;background:none;border-bottom:none;align-items:center}'+
    '#pad-mine .pm-tabs .stab{font-size:.72rem;padding:7px 16px;border:1.5px solid var(--border,#e2e2e2);'+
      'background:var(--light,#f4f4f5);color:var(--gray,#777);text-decoration:none;line-height:1.35}'+
    '#pad-mine .pm-tabs .stab:hover{border-color:var(--navy,#14213D);color:var(--ink,#111)}'+
    '#pad-mine .pm-tabs .stab.active{background:var(--navy,#14213D);border-color:var(--navy,#14213D);color:#fff}'+
    'html.dark #pad-mine .pm-tabs .stab{background:#2a2f36;border-color:#3a3e46;color:#c9ccd2}'+
    'html.dark #pad-mine .pm-tabs .stab:hover{border-color:#fff;color:#fff}'+
    'html.dark #pad-mine .pm-tabs .stab.active{background:#fff;border-color:#fff;color:#15171A}'+
    '#pad-mine .pm-body{overflow:auto;padding:16px 18px 20px}'+
    // El panel admin deja un style="display:none" inline en el bloque que no está
    // mirando: acá manda la solapa del overlay, de ahí el !important.
    // El título del bloque ("Mis empresas" / "Mis asesores") repetiría lo que ya
    // dice la pestaña activa: se oculta sólo acá, en el panel admin se sigue viendo.
    '#pad-mine .pm-body .ap-sec{display:none}'+
    '#pad-mine .pm-body .bd-pane{display:none!important}'+
    '#pad-mine .pm-body .bd-pane.bd-on{display:block!important}'+
    '.pad-head .pad-adm{font-size:.64rem;font-weight:700;text-transform:none;letter-spacing:0;cursor:pointer;'+
      'color:var(--red,#c62828);margin-left:auto;margin-right:10px}'+
    '.pad-head .pad-adm:hover{text-decoration:underline}'+
    '.pad-empty .usr-btn{margin-top:10px}';
  document.head.appendChild(st);
}
// Qué paneles puede ver AHORA: la facultad se revalida en cada llamada, porque el
// admin puede quitarla en caliente o estar en vista previa de otro perfil.
function _bdPanes(){
  var p=[];
  if(_can('padron_buscar'))p.push({id:'empresas',blk:'at-varios',lbl:'Mis empresas'});
  if(_can('asesores_guardados'))p.push({id:'asesores',blk:'at-asesores',lbl:'Mis asesores'});
  return p;
}
function openMiPadron(pane){
  var panes=_bdPanes();
  if(!panes.length){showToast('No tenés habilitada la base de datos.');return;}
  if(document.getElementById('pad-mine-ov'))return;
  _padMineStyle();
  closePadronPop();closeAsPop();
  var ov=document.createElement('div');ov.id='pad-mine-ov';
  ov.innerHTML='<div id="pad-mine" role="dialog" aria-label="Base de datos">'+
    '<div class="pm-head"><span id="bd-tit">'+_BD_ICO+'Base de datos</span>'+
      '<span class="pm-x" onclick="closeMiPadron()" title="Cerrar">&#10005;</span></div>'+
    '<div class="stabs stabs-in pm-tabs" id="bd-tabs"></div>'+
    '<div class="pm-body"></div></div>';
  document.body.appendChild(ov);
  var body=ov.querySelector('.pm-body'),prestado=false;
  panes.forEach(function(p){
    var blk=document.getElementById(p.blk);if(!blk)return;
    _padMineHome.push({id:p.blk,parent:blk.parentNode,next:blk.nextSibling,display:blk.style.display});
    body.appendChild(blk);prestado=true;
  });
  if(!prestado){closeMiPadron(true);showToast('No se encontró el bloque de la base de datos.');return;}
  var ini=(pane&&panes.some(function(p){return p.id===pane;}))?pane:panes[0].id;
  _bdShow(ini,true);
  document.addEventListener('keydown',_padMineEsc);
}
// La barra sólo aparece si hay más de un panel: con uno solo no hay nada que
// elegir y el título ya dice cuál es (mismo criterio que _facSyncOptBar).
function _bdRenderTabs(){
  var bar=document.getElementById('bd-tabs'),tit=document.getElementById('bd-tit'),panes=_bdPanes();
  if(!bar)return;
  bar.style.display=(panes.length>1)?'flex':'none';
  bar.innerHTML=panes.map(function(p){
    return '<div class="stab bdtab'+(p.id===_bdPane?' active':'')+'" data-tab="bd-'+p.id+'" onclick="_bdShow(\''+p.id+'\')">'+p.lbl+'</div>';
  }).join('');
  if(tit)tit.innerHTML=_BD_ICO+'Base de datos'+(panes.length===1?(' &middot; '+panes[0].lbl):'');
}
function _bdShow(pane,forzar){
  if(!forzar&&pane===_bdPane)return;
  if(!forzar&&!_bdLeaveOk(function(){_bdShow(pane,true);}))return;
  _bdPane=pane;
  var wanted=(pane==='asesores')?'at-asesores':'at-varios';
  document.querySelectorAll('#pad-mine .pm-body .bd-pane').forEach(function(el){
    el.classList.toggle('bd-on',el.id===wanted);
  });
  _bdRenderTabs();
  if(pane==='asesores')renderAsesoresAdmin(false);
  else renderPadronAdmin(true);
}
// Se llama desde _applyFacultades: si cambian las facultades con la pantalla
// abierta (o el admin entra/sale de la vista previa), la deja consistente.
function _bdSync(){
  if(!document.getElementById('pad-mine-ov'))return;
  var panes=_bdPanes();
  if(!panes.length){closeMiPadron(true);return;} // se quedó sin permiso: cierre forzado
  if(!panes.some(function(p){return p.id===_bdPane;}))_bdShow(panes[0].id,true);
  else _bdRenderTabs();
}
// ¿Se puede salir de lo que está abierto? Devuelve false si algo pide esperar o
// si hay una pregunta en curso (en ese caso sigue por cb cuando el usuario acepta).
function _bdLeaveOk(cb){
  if(typeof _pgBusy!=='undefined'&&_pgBusy){showToast('Esperá a que termine de generar los flyers');return false;}
  // Editor de empresas abierto: se pregunta acá (en vez de delegar en
  // closePadronEditor) para poder RETOMAR con cb lo que el usuario había pedido
  // —cambiar de solapa o cerrar— apenas confirma. Si no, tenía que tocar dos veces.
  if(_padEdit){
    if(!_padEdit.length){_padEditClose();}
    else{
      fgConfirm('¿Salir del editor de empresas?\n\nLos cambios sin guardar se pierden.',
        {ok:'Salir sin guardar',cancelar:'Seguir editando'},function(si){
          if(!si)return;
          _padEditClose();
          if(cb)cb(); // vuelve a entrar acá: si además hay asesores sin guardar, pregunta por eso
        });
      return false;
    }
  }
  if(_asDirty){
    fgConfirm('Tenés cambios sin guardar en tus asesores.\n\nSi salís ahora se pierden.',
      {ok:'Salir sin guardar',cancelar:'Seguir editando'},function(si){
        if(!si)return;
        _asEdit=null;_asDirty=false;
        if(cb)cb();
      });
    return false;
  }
  return true;
}
function _padMineEsc(e){if(e.key==='Escape')closeMiPadron();}
function closeMiPadron(force){
  if(!force&&!_bdLeaveOk(function(){closeMiPadron(true);}))return;
  if(force){ // cierre por pérdida de facultad: no se puede quedar abierto preguntando
    if(_padEdit)_padEditClose();
    _asEdit=null;_asDirty=false;
  }
  var ov=document.getElementById('pad-mine-ov');
  _padMineHome.forEach(function(h){ // cada bloque vuelve a su lugar en el panel admin
    var blk=document.getElementById(h.id);if(!blk||!h.parent)return;
    blk.classList.remove('bd-on');
    h.parent.insertBefore(blk,(h.next&&h.next.parentNode===h.parent)?h.next:null);
    blk.style.display=h.display||'none';
  });
  _padMineHome=[];
  if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);
  document.removeEventListener('keydown',_padMineEsc);
  // las empresas pudieron cambiar: el typeahead/lupa y la referencia de la fila
  // cargada se rearman con la copia nueva
  _padRef=null;
  _mpRefresh(); // pudo cambiar la cantidad de empresas del segmento
}
function openPadronPop(){
  closePadronPop();
  var pop=document.createElement('div');pop.id='pad-pop';pop.className='pad-pop';
  _padMineStyle();
  pop.innerHTML='<div class="pad-head"><span>Mis empresas</span>'+
      '<span class="pad-adm" onclick="openMiPadron()" title="Subir Excel, editar en l&iacute;nea o descargar tus empresas">&#9998; Administrar</span>'+
      '<span class="pad-x" onclick="closePadronPop()">&#10005;</span></div>'+
    '<input type="text" id="pad-q" class="pad-q" placeholder="Raz&oacute;n social o CUIT..." autocomplete="off" '+
      'oninput="renderPadronPop()" onkeydown="_padKeyNav(event)">'+
    '<div class="pad-list" id="pad-list"><div class="pad-empty">Cargando tus empresas...</div></div>';
  document.body.appendChild(pop);
  var anchor=document.getElementById('fg-pad-btn')||document.getElementById('empresa');
  var r=anchor.getBoundingClientRect(),w=pop.offsetWidth;
  pop.style.top=Math.min(r.bottom+5,window.innerHeight-60)+'px';
  pop.style.left=Math.max(10,Math.min(r.right-w,window.innerWidth-w-10))+'px';
  // arranca vacía, mostrando TODAS: la lupa es el buscador completo (el filtro
  // rápido mientras tipeás lo hace el typeahead del campo empresa)
  var q=document.getElementById('pad-q');if(q)q.focus();
  _padSel=0;
  loadPadron(false,function(){renderPadronPop();});
  setTimeout(function(){document.addEventListener('click',_padCloseOutside);},0);
}
function closePadronPop(){
  var p=document.getElementById('pad-pop');if(p&&p.parentNode)p.parentNode.removeChild(p);
  document.removeEventListener('click',_padCloseOutside);
}
function _padCloseOutside(e){
  var p=document.getElementById('pad-pop'),b=document.getElementById('fg-pad-btn');
  if(p&&!p.contains(e.target)&&!(b&&b.contains(e.target)))closePadronPop();
}
var _padSel=0;
function _padKeyNav(e){
  if(e.key==='Escape'){closePadronPop();return;}
  if(e.key==='Enter'){e.preventDefault();if(_padHits.length)applyPadronRow(_padSel);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();if(!_padHits.length)return;
    _padSel=Math.max(0,Math.min(_padHits.length-1,_padSel+(e.key==='ArrowDown'?1:-1)));
    _padMark();
  }
}
function _padMark(){
  var it=document.querySelectorAll('#pad-list .pad-item');
  Array.prototype.forEach.call(it,function(x,i){x.classList.toggle('on',i===_padSel);});
  if(it[_padSel]&&it[_padSel].scrollIntoView)it[_padSel].scrollIntoView({block:'nearest'});
}
function renderPadronPop(){
  var list=document.getElementById('pad-list');if(!list)return;
  if(!_padron){list.innerHTML='<div class="pad-empty">Cargando tus empresas...</div>';return;}
  if(!_padron.length){
    list.innerHTML='<div class="pad-empty">Todav&iacute;a no cargaste empresas.<br>'+
      'Sub&iacute; un Excel o carg&aacute;las a mano desde <strong>tu nombre &rarr; Base de datos</strong>.<br>'+
      '<button type="button" class="usr-btn edit" onclick="openMiPadron()">&#8593; Cargar mis empresas</button></div>';
    _padHits=[];return;
  }
  var q=(document.getElementById('pad-q')||{}).value||'';
  _padHits=padronSearch(q,60);_padSel=0;
  if(!_padHits.length){
    list.innerHTML='<div class="pad-empty">Sin resultados para "'+_escHtml(q)+'".</div>';return;
  }
  list.innerHTML=_padHits.map(function(r,i){
    return '<div class="pad-item'+(i===0?' on':'')+'" onclick="applyPadronRow('+i+')">'+
      '<span class="pad-emp">'+_escHtml(r.empresa||'(sin razón social)')+'</span>'+
      '<span class="pad-sub">'+_escHtml(_padSubtitulo(r))+'</span></div>';
  }).join('');
}
// Completa TODO: razón social, montos (config) y los oficiales del padrón.
// EL PADRÓN MANDA: si la empresa no tiene oficiales asignados, se respeta y los
// campos quedan vacíos (no se arrastran los del flyer anterior) + aviso visible.
function applyPadronRow(i){
  var r=_padHits&&_padHits[i];if(r)_padApply(r);
}
// Carga una fila del padrón en el formulario. La usan la lupa y el typeahead.
function _padApply(r){
  if(!r)return;
  var e=document.getElementById('empresa');if(e)e.value=r.empresa||'';
  // El padrón manda también acá: sin config válida, la empresa va sin montos.
  var _ci=_padCfgOf(r.config);
  if(_ci<0)_fgSetNoCB(true);
  else if(typeof setCfg==='function')setCfg(_ci);
  _padAplicarTopes(r); // Flyer Rubros: topes del padrón
  // El nombre del archivo lo actualiza un listener de _source.html que sólo corre
  // al TIPEAR: si seteo #empresa por código no se entera y queda el de la empresa
  // anterior. Lo replico acá (respetando que no lo hayas escrito vos a mano).
  if(!window.filenameManual){
    var _fn=document.getElementById('filename');
    if(_fn)_fn.value='Flyer_'+(r.empresa||'');
  }
  var tiene=_padNumAsesores(r);
  for(var n=1;n<=4;n++){
    var a=(r.asesores&&r.asesores[n-1])||{},sfx=(n===1)?'':String(n);
    var hay=!!(a.nombre||'').trim();
    _setVal('nombre'+sfx,hay?a.nombre:'');
    _setVal('celular'+sfx,hay?a.celular:'');
    _setVal('email'+sfx,hay?(a.email||_fgMailFromName(a.nombre)):'');
    var mEl=document.getElementById('email'+sfx);
    // si el padrón trae el mail, manda el padrón: corto la sugerencia automática
    if(mEl)mEl.dataset.fgManual=(hay&&a.email)?'1':'';
    // el bloque 1 queda siempre abierto (aunque vacío) para poder cargarlo a mano
    if(n===1){_fgSetAsesorOn(1,true);_fgShowBlock(1,true);}
    else{_fgSetAsesorOn(n,hay);_fgShowBlock(n,hay);}
  }
  _fgRefreshAddBtn();
  _padRef=r;_padDismissed='';   // desde acá se vigilan los cambios contra el padrón
  _padShowNote(tiene?'':'Esta empresa no tiene oficiales asignados.');
  closePadronPop();_padCloseSug();
  // los asesores acaban de completarse desde el padrón: el cuadro de pegado
  // abierto ya no aporta nada y tapa el formulario
  if(typeof _fgClosePasteAll==='function')_fgClosePasteAll();
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
  showToast('"'+(r.empresa||'Empresa')+'" cargada de tus empresas — '+_padAsesoresLbl(r));
  if(_ci<0)setTimeout(function(){_padAvisoSinCB(r);},120); // que no pase desapercibido
  else setTimeout(function(){_padCheckRubro(r,'padron');},120);
}
// Completa los topes del cartel con los del padrón (si la empresa tiene rubro).
function _padAplicarTopes(r){
  var ru=_padRubroSane(r&&r.rubro);if(!ru.opcion)return;
  var f1=_fgFmtImporte(ru.importe),f2=_fgFmtImporte(ru.importe2);
  if(f1)_setVal('benef-importe',f1.slice(1));
  _setVal('benef-importe2',(f2&&f2!==f1)?f2.slice(1):'');
}
// ── Aviso de solapa equivocada ───────────────────────────────────────────────
// El padrón dice en qué rubro va cada empresa. Si el flyer se arma en otra
// opción (Flyer Galicia con una empresa con rubro, o Rubros con una empresa sin
// rubro / de otro rubro) avisa y ofrece cambiar de opción conservando lo
// cargado. Nunca bloquea: "Seguir acá" se recuerda por empresa+opción.
// origen: 'padron' (al elegir la empresa) | 'descarga' (antes de bajar el
// flyer; cont = qué hacer si igual quiere descargar). Devuelve true si mostró
// el aviso (la descarga espera al botón).
var _padRubroDismissed='';
function _padCheckRubro(r,origen,cont){
  try{
    if(!r||!_can('padron_buscar'))return false;
    var ru=_padRubroSane(r.rubro),act=_optN(_fgOpt),enRubros=(_fgVista==='rubros');
    var quiere=ru.opcion&&_FG_OPTS.indexOf(ru.opcion)>=0&&_can('opcion_'+ru.opcion)?ru.opcion:0;
    if(quiere===act)return false;
    if(!quiere&&!enRubros)return false; // sin rubro en Flyer Galicia: todo bien
    var firma=_padNorm(r.empresa)+'|'+quiere+'|'+act;
    if(firma===_padRubroDismissed)return false;
    if(document.getElementById('pad-upd'))return false;
    var emp=_escHtml(r.empresa||'Esta empresa'),aca=_escHtml(_solapaLabel(_fgVista)+' · '+_optLabel(act));
    var html,btn;
    if(quiere){
      html='<h3>&#128203; Beneficio por rubro</h3>'+
        '<p class="pu-sub"><strong>'+emp+'</strong> tiene cargado el beneficio <strong>'+_escHtml(_padRubroLabel(r))+'</strong>, '+
          'y est&aacute;s armando el flyer en <strong>'+aca+'</strong>.</p>'+
        '<p class="pu-sub">Si lo pas&aacute;s a <strong>Flyer Rubros &rarr; '+_escHtml(_optLabel(quiere))+'</strong> se conservan la empresa, los oficiales y los topes.</p>';
      btn='<button class="pu-si" onclick="_padIrRubro('+quiere+')">Ir a '+_escHtml(_optLabel(quiere))+'</button>';
    }else{
      html='<h3>&#128203; Sin beneficio por rubro</h3>'+
        '<p class="pu-sub"><strong>'+emp+'</strong> no tiene rubro cargado, y est&aacute;s armando el flyer en <strong>'+aca+'</strong>.</p>'+
        '<p class="pu-sub">Si es correcto que lleve el cartel del beneficio, segu&iacute; ac&aacute;: al generar el flyer te ofrezco guardarle el rubro.</p>';
      btn='<button class="pu-si" onclick="_padIrRubro(0)">Ir a Flyer Galicia</button>';
    }
    _padPending=null;_padRubroCont=(origen==='descarga')?(cont||null):null;
    _padModal(html+'<div class="pu-foot">'+
      '<button class="pu-no" onclick="_padRubroSeguir()">'+(origen==='descarga'?'Descargar igual':'Seguir ac&aacute;')+'</button>'+btn+'</div>');
    _padRubroDismissed=firma;
    return true;
  }catch(e){console.warn('padron rubro:',e);return false;}
}
var _padRubroCont=null;
function _padRubroSeguir(){
  var c=_padRubroCont;_padRubroCont=null;
  _padCloseUpdate(0);
  if(typeof c==='function')c();
}
function _padIrRubro(opt){
  _padRubroCont=null;_padCloseUpdate(0);
  _padRubroDismissed='';
  if(opt)switchFlyerOption(opt,function(){
    if(typeof _fgBenefSyncNombre==='function')_fgBenefSyncNombre();
    if(typeof redraw==='function')redraw();
    showToast('Cambiado a Flyer Rubros · '+_optLabel(opt)+'. Revis\u00e1 el cartel y descarg\u00e1 de nuevo.');
  });
  else{switchApp('flyer');showToast('Cambiado a Flyer Galicia. Descarg\u00e1 de nuevo.');}
}
// Fila del padrón que corresponde a la empresa del formulario (o null).
function _padFilaActual(){
  if(!_padron)return null;
  var emp=(_gv('empresa')||'').trim();if(!emp)return null;
  if(_padRef&&_padron.indexOf(_padRef)>=0&&_padNorm(_padRef.empresa)===_padNorm(emp))return _padRef;
  return _padFindByName(emp);
}
// Aviso al traer del buscador una empresa marcada sin cashback.
function _padAvisoSinCB(r){
  if(document.getElementById('pad-upd'))return;
  _padPending=null;
  _padModal('<h3>&#9888; Sin cashback</h3>'+
    '<p class="pu-sub"><strong>'+_escHtml(r.empresa||'Esta empresa')+'</strong> est&aacute; marcada '+
      'como <strong>sin cashback</strong>: el flyer se genera con los cuatro importes <strong>en blanco</strong>.</p>'+
    '<p class="pu-sub">Si en realidad le corresponde uno, eleg&iacute;lo en <strong>Configuraci&oacute;n de Montos</strong> '+
      'y listo (no hace falta tocar nada m&aacute;s).</p>'+
    '<div class="pu-foot"><button class="pu-si" onclick="_padCloseUpdate(0)">Entendido</button></div>');
}
// ── PADRÓN: "sin oficiales asignados" + actualizar el padrón al generar ───────
// El padrón MANDA: si una empresa no tiene oficiales asignados, se respeta y los
// campos quedan vacíos (no se arrastran los del flyer anterior), con un aviso
// visible debajo del nombre de la empresa.
function _padNumAsesores(r){
  return ((r&&r.asesores)||[]).filter(function(a){return (a.nombre||'').trim();}).length;
}
function _padAsesoresLbl(r){
  var n=_padNumAsesores(r);
  return n?(n+' oficial'+(n>1?'es':'')):'sin oficiales asignados';
}
// Aviso debajo del campo empresa (se limpia solo al cargar otra empresa).
function _padShowNote(msg){
  _padStyle(); // el aviso usa el CSS del modal, y puede salir antes que cualquier popup
  var wrap=document.querySelector('.fg-pad-wrap');if(!wrap||!wrap.parentNode)return;
  var el=document.getElementById('fg-pad-note');
  if(!el){
    wrap.insertAdjacentHTML('afterend','<div id="fg-pad-note"></div>');
    el=document.getElementById('fg-pad-note');
  }
  if(!el)return;
  el.innerHTML=msg?('&#9888; '+_escHtml(msg)):'';
  el.style.display=msg?'block':'none';
}

// ── ¿Cambió algo respecto del padrón? ────────────────────────────────────────
var _padRef=null,_padDismissed='';
function _padCfgName(i){
  if(i<0)return 'Sin cashback';
  return (typeof CNAMES!=='undefined'&&CNAMES[i])?CNAMES[i]:'BAU';
}
// Cashback que está mostrando el armador ahora mismo (-1 = sin cashback).
function _padCfgActual(){return _fgNoCB?-1:((typeof ac!=='undefined')?ac:0);}
// Lo que se guarda en la celda del Excel: vacío = sin cashback.
function _padCfgCell(i){return i<0?'':_padCfgName(i);}
// Asesores tal como están HOY en el formulario. Un bloque apagado cuenta como vacío
// (no se dibuja en el flyer, así que para el padrón es "no asignado").
function _padFormAsesores(){
  var out=[];
  for(var n=1;n<=4;n++){
    var sfx=(n===1)?'':String(n);
    var on=_fgAsesorOn(n),nom=on?(_gv('nombre'+sfx)||'').trim():'';
    out.push({nombre:nom,
      celular:nom?(_gv('celular'+sfx)||'').trim():'',
      email  :nom?(_gv('email'+sfx)||'').trim():''});
  }
  return out;
}
function _padClean(a){
  return {nombre:(a&&a.nombre||'').trim(),celular:(a&&a.celular||'').trim(),email:(a&&a.email||'').trim()};
}
// Devuelve null si no hay nada que actualizar, o {row,empresa,config,asesores,cambios[]}.
function _padDiff(){
  if(!_can('padron_buscar')||!_padRef||!_padron||_padron.indexOf(_padRef)<0)return null;
  var emp=(_gv('empresa')||'').trim();
  if(!emp)return null; // sin razón social no tiene sentido pisar la fila
  // La razón social IDENTIFICA a la fila y nunca se renombra desde acá: si la
  // cambiaste, es otra empresa y lo resuelve _padAskNew. Dos grupos distintos
  // pueden compartir CUIT, así que el nombre es la única clave.
  if(_padNorm(emp)!==_padNorm(_padRef.empresa))return null;
  var ci=_padCfgActual(),oi=_padCfgOf(_padRef.config);
  var cur=_padFormAsesores(),old=[],chg=[];
  for(var k=0;k<4;k++)old.push(_padClean((_padRef.asesores||[])[k]));
  // Un mail DEDUCIDO del nombre (el padrón no traía ninguno) NO cuenta como cambio:
  // si no, cada empresa sin mail cargado dispararía el popup sin que toques nada.
  for(var k=0;k<4;k++){
    var cc=cur[k],oo=old[k];
    if(!oo.email&&cc.nombre&&cc.email&&cc.email===_fgMailFromName(cc.nombre))cc.email='';
  }
  if(ci!==oi)
    chg.push('Cashback: '+_escHtml(_padCfgName(oi))+' &rarr; <strong>'+_escHtml(_padCfgName(ci))+'</strong>');
  for(var n=1;n<=4;n++){
    var o=old[n-1],c=cur[n-1],lbl='Oficial '+n;
    if(!o.nombre&&!c.nombre)continue;
    if(!o.nombre){chg.push(lbl+': <strong>+ '+_escHtml(c.nombre)+'</strong>');continue;}
    if(!c.nombre){chg.push(lbl+': <strong>&minus; '+_escHtml(o.nombre)+'</strong> (se quita)');continue;}
    if(o.nombre!==c.nombre)chg.push(lbl+': '+_escHtml(o.nombre)+' &rarr; <strong>'+_escHtml(c.nombre)+'</strong>');
    if(o.celular!==c.celular)chg.push(lbl+' &middot; celular: '+_escHtml(o.celular||'(vac&iacute;o)')+' &rarr; <strong>'+_escHtml(c.celular||'(vac&iacute;o)')+'</strong>');
    if(o.email!==c.email)chg.push(lbl+' &middot; mail: '+_escHtml(o.email||'(vac&iacute;o)')+' &rarr; <strong>'+_escHtml(c.email||'(vac&iacute;o)')+'</strong>');
  }
  // Flyer Rubros: el rubro/topes del formulario vs el padrón (en Flyer Galicia no se toca)
  var rubro=_padRubroForm();
  if(rubro&&!_padRubroIgual(rubro,_padRef.rubro))
    chg.push('Rubro: '+(_padRubroLabel(_padRef)?_escHtml(_padRubroLabel(_padRef)):'&mdash;')+' &rarr; <strong>'+_escHtml(_padRubroLabel({rubro:rubro}))+'</strong>');
  if(!chg.length)return null;
  return {row:_padRef,empresa:_padRef.empresa,config:_padCfgCell(ci),asesores:cur,rubro:rubro||_padRubroSane(_padRef.rubro),cambios:chg};
}
// Firma del cambio: si decís "no" y después no tocás nada más, no vuelve a preguntar.
function _padSig(d){return d.empresa+'|'+d.config+'|'+JSON.stringify(d.asesores)+'|'+JSON.stringify(d.rubro||null);}
// Rubro según el formulario: sólo en Flyer Rubros (opción activa + topes); null en Flyer Galicia.
function _padRubroForm(){
  if(_fgVista!=='rubros')return null;
  var i1=_padDigits(_gv('benef-importe')),i2=_padDigits(_gv('benef-importe2'));
  return _padRubroSane({opcion:_optN(_fgOpt),importe:i1,importe2:(i2&&i2!==i1)?i2:''});
}

// ── Popups del padrón al generar el flyer ────────────────────────────────────
// Dos casos, mismo modal: la empresa YA está en el padrón y cambiaste algo
// (_padAskUpdate), o la empresa NO está y te ofrece darla de alta (_padAskNew)
// para ir alimentando el padrón. En los dos podés cargar el/los CUIT del grupo.
var _padNewDismissed='',_padPending=null;

// Busca una fila por razón social exacta (normalizada), para no duplicar empresas
// si la cargaste a mano en vez de con la lupa.
function _padFindByName(name){
  var t=_padNorm(name);if(!t||!_padron)return null;
  for(var i=0;i<_padron.length;i++){if(_padron[i]&&_padNorm(_padron[i].empresa)===t)return _padron[i];}
  return null;
}
function _padStyle(){
  if(document.getElementById('pad-upd-style'))return;
  var st=document.createElement('style');st.id='pad-upd-style';
  st.textContent=
    '#fg-pad-note{display:none;margin-top:6px;font-size:.7rem;line-height:1.4;color:#b06000;'+
      'background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.5);border-radius:7px;padding:6px 9px}'+
    '#pad-upd-ov{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:10000;display:flex;'+
      'align-items:center;justify-content:center;padding:16px}'+
    '#pad-upd{background:#fff;border-radius:14px;width:min(430px,100%);max-height:86vh;overflow:auto;'+
      'box-shadow:0 18px 50px rgba(0,0,0,.3)}'+
    'html.dark #pad-upd{background:#23262c;color:#e8e8e8}'+
    '#pad-upd h3{margin:0;padding:16px 18px 6px;font-size:.95rem}'+
    '#pad-upd .pu-sub{padding:0 18px;font-size:.76rem;color:var(--gray,#888);line-height:1.5}'+
    '#pad-upd ul{margin:12px 18px;padding:0 0 0 4px;list-style:none}'+
    '#pad-upd li{font-size:.76rem;line-height:1.55;padding:5px 0 5px 12px;border-left:2px solid rgba(198,40,40,.35)}'+
    '#pad-upd .pu-fld{padding:4px 18px 0}'+
    '#pad-upd .pu-lbl{display:block;font-size:.68rem;font-weight:700;text-transform:uppercase;'+
      'letter-spacing:.04em;color:var(--gray,#888);margin-bottom:5px}'+
    '#pad-upd input{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#ddd);border-radius:8px;'+
      'padding:9px 11px;font-size:.82rem;font-family:inherit;background:none;color:inherit;outline:none}'+
    '#pad-upd input:focus{border-color:var(--red,#c62828)}'+
    'html.dark #pad-upd input{border-color:#3a3e46}'+
    '#pad-upd .pu-hint{font-size:.68rem;line-height:1.45;color:var(--gray,#888);margin:6px 0 0}'+
    '#pad-upd .pu-warn{font-size:.68rem;line-height:1.45;color:#b06000;margin:6px 0 0}'+
    '#pad-upd .pu-foot{display:flex;gap:8px;justify-content:flex-end;padding:14px 18px 16px}'+
    '#pad-upd button{border:none;border-radius:8px;padding:9px 15px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}'+
    '#pad-upd .pu-no{background:rgba(128,128,128,.16);color:inherit}'+
    '#pad-upd .pu-si{background:var(--red,#c62828);color:#fff}';
  document.head.appendChild(st);
}
// Campo de CUIT + preview en vivo de lo que se va a guardar.
function _padCuitField(valor){
  return '<div class="pu-fld">'+
      '<label class="pu-lbl" for="pad-cuit">CUIT / CUITs del grupo</label>'+
      '<input type="text" id="pad-cuit" autocomplete="off" placeholder="30-71234567-8, 30709876543" '+
        'value="'+_escHtml(valor||'')+'" oninput="_padCuitPreview()">'+
      '<p class="pu-hint" id="pad-cuit-prev"></p>'+
    '</div>';
}
// Dos grupos distintos pueden compartir CUIT: no lo bloqueo, sólo lo aviso.
function _padCuitDupes(cuits,excluir){
  var out=[];
  (_padron||[]).forEach(function(r){
    if(r===excluir)return;
    for(var i=0;i<cuits.length;i++){
      if((r.cuits||[]).indexOf(cuits[i])>=0){out.push(r.empresa||'(sin razón social)');return;}
    }
  });
  return out;
}
function _padCuitPreview(){
  var el=document.getElementById('pad-cuit'),out=document.getElementById('pad-cuit-prev');
  if(!el||!out)return;
  var cu=_padCuits(el.value);
  if(!cu.length){
    out.className='pu-hint';
    out.innerHTML='Opcional. Si la empresa es un grupo, pon&eacute; los CUIT separados por coma &mdash; con o sin guiones, da igual.';
    return;
  }
  var bad=cu.filter(function(d){return d.length!==11;}).length;
  var dup=_padCuitDupes(cu,_padPending?_padPending.row:null);
  out.className=(bad||dup.length)?'pu-warn':'pu-hint';
  out.innerHTML='Se guardan '+cu.length+': <strong>'+cu.map(_padFmtCuit).join('  &middot;  ')+'</strong>'+
    (bad?('<br>&#9888; '+bad+(bad>1?' no tienen':' no tiene')+' 11 d&iacute;gitos. Revis&aacute; que est&eacute;n completos.'):'')+
    (dup.length?('<br>&#9888; Ese CUIT ya figura en <strong>'+_escHtml(dup.slice(0,3).join(', '))+'</strong>'+
      (dup.length>3?(' y '+(dup.length-3)+' m&aacute;s'):'')+'. Se guarda igual: al buscar ese CUIT van a aparecer las dos.'):'');
}
function _padModal(html){
  _padStyle();
  var ov=document.createElement('div');ov.id='pad-upd-ov';
  ov.innerHTML='<div id="pad-upd">'+html+'</div>';
  document.body.appendChild(ov);
  // a propósito NO se cierra al tocar afuera: hay que elegir una de las dos
  // opciones, así no se pierde un cambio por un clic al costado
  _padCuitPreview();
}
// Resumen de lo que se va a dar de alta (config + oficiales del formulario).
function _padResumen(as){
  var li=['Cashback: <strong>'+_escHtml(_padCfgName(_padCfgActual()))+'</strong>'];
  var n=0;
  as.forEach(function(a,k){
    if(!a.nombre)return;
    n++;
    li.push('Oficial '+(k+1)+': <strong>'+_escHtml(a.nombre)+'</strong>'+
      (a.celular?(' &middot; '+_escHtml(a.celular)):''));
  });
  if(!n)li.push('<span style="color:#b06000">Sin oficiales asignados</span>');
  var ru=_padRubroForm();
  if(ru&&ru.opcion)li.push('Rubro: <strong>'+_escHtml(_padRubroLabel({rubro:ru}))+'</strong>');
  return '<ul><li>'+li.join('</li><li>')+'</li></ul>';
}

// ── Empresa NUEVA: darla de alta en el padrón ───────────────────────────────
function _padAskNew(){
  var emp=(_gv('empresa')||'').trim();if(!emp||!_padron)return;
  if(_padNorm(emp)===_padNewDismissed)return;
  if(document.getElementById('pad-upd'))return;
  _padPending=null;
  _padModal('<h3>&#10133; Agregar a mis empresas</h3>'+
    '<p class="pu-sub"><strong>'+_escHtml(emp)+'</strong> no est&aacute; en tus empresas. '+
      '&iquest;La guardo con esta configuraci&oacute;n para tenerla lista la pr&oacute;xima vez? '+
      'Se agrega como empresa aparte: no pisa ninguna de las que ya ten&eacute;s.</p>'+
    _padResumen(_padFormAsesores())+
    _padCuitField('')+
    '<div class="pu-foot">'+
      '<button class="pu-no" onclick="_padCloseUpdate(1)">Ahora no</button>'+
      '<button class="pu-si" onclick="_padDoNew()">Guardar empresa</button>'+
    '</div>');
  var el=document.getElementById('pad-cuit');if(el)el.focus();
}
function _padDoNew(){
  var emp=(_gv('empresa')||'').trim();
  if(!emp||!_padron){_padCloseUpdate(0);return;}
  var el=document.getElementById('pad-cuit');
  var row={empresa:emp,cuits:_padCuits(el?el.value:''),
    config:_padCfgCell(_padCfgActual()),asesores:_padFormAsesores(),rubro:_padRubroForm()||_padRubroSane(null)};
  var btn=document.querySelector('#pad-upd .pu-si');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  _padron.push(row);
  savePadron(_padron,function(ok){
    _padCloseUpdate(0);
    if(!ok){var i=_padron.indexOf(row);if(i>=0)_padron.splice(i,1);return;} // rollback
    _padRef=row;_padDismissed='';_padNewDismissed='';
    _padShowNote(_padNumAsesores(row)?'':'Esta empresa no tiene oficiales asignados.');
    showToast('"'+emp+'" agregada a tus empresas'+(row.cuits.length?(' ('+row.cuits.length+' CUIT)'):''));
  });
}

// ── Empresa YA en el padrón: guardar los cambios ────────────────────────────
function _padAskUpdate(){
  var d=_padDiff();if(!d)return;
  if(_padSig(d)===_padDismissed)return;
  if(document.getElementById('pad-upd'))return;
  _padPending=d;
  _padModal('<h3>&#128260; Actualizar mis empresas</h3>'+
    '<p class="pu-sub">Generaste el flyer de <strong>'+_escHtml(d.empresa)+'</strong> con datos distintos '+
      'a los que ten&eacute;s guardados:</p>'+
    '<ul><li>'+d.cambios.join('</li><li>')+'</li></ul>'+
    _padCuitField((d.row.cuits||[]).map(_padFmtCuit).join(', '))+
    '<p class="pu-sub" style="margin-top:12px">Si lo actualiz&aacute;s, queda guardado para todos y la pr&oacute;xima vez '+
      'que busques esta empresa ya sale con estos datos. Acord&aacute;te de <strong>bajarte el Excel</strong> '+
      'si quer&eacute;s tener el Excel de tu computadora al d&iacute;a.</p>'+
    '<div class="pu-foot">'+
      '<button class="pu-no" onclick="_padCloseUpdate(1)">No, dejarlo como est&aacute;</button>'+
      '<button class="pu-si" onclick="_padDoUpdate()">Actualizar empresa</button>'+
    '</div>');
}
function _padDoUpdate(){
  var d=_padPending||_padDiff();
  if(!d||!_padron||_padron.indexOf(d.row)<0){_padCloseUpdate(0);return;}
  var el=document.getElementById('pad-cuit');
  var btn=document.querySelector('#pad-upd .pu-si');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  d.row.config=d.config;   // la razón social NO se toca nunca
  d.row.asesores=d.asesores.map(function(a){return {nombre:a.nombre,celular:a.celular,email:a.email};});
  if(d.rubro)d.row.rubro=_padRubroSane(d.rubro);
  if(el)d.row.cuits=_padCuits(el.value); // el CUIT se puede completar acá mismo
  savePadron(_padron,function(ok){
    _padCloseUpdate(0);
    if(!ok)return;
    _padDismissed='';
    _padShowNote(_padNumAsesores(d.row)?'':'Esta empresa no tiene oficiales asignados.');
    showToast('Empresa actualizada: '+d.empresa);
  });
}
function _padCloseUpdate(dismiss){
  var ov=document.getElementById('pad-upd-ov');
  if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);
  if(dismiss){
    // "ahora no": no vuelve a preguntar hasta que cambie algo más
    if(_padRef){var d=_padDiff();if(d)_padDismissed=_padSig(d);}
    else _padNewDismissed=_padNorm(_gv('empresa'));
  }
  _padPending=null;
}

// Se llama después de descargar el PDF/PNG individual (nunca en el masivo).
// Si la empresa está en el padrón → ofrece actualizarla; si no → darla de alta.
function _padAfterFlyer(){
  try{
    if(!_can('padron_buscar')||!_padron)return;
    var emp=(_gv('empresa')||'').trim();
    if(!emp){_padRef=null;return;}
    // Se re-engancha por NOMBRE cuando: no había fila, el padrón se recargó
    // (referencia vieja) o cambiaste la razón social — en ese último caso es
    // otra empresa, porque los grupos no se renombran desde el armador.
    if(!_padRef||_padron.indexOf(_padRef)<0||_padNorm(_padRef.empresa)!==_padNorm(emp)){
      var hit=_padFindByName(emp);
      if(hit){_padRef=hit;_padDismissed='';}
      // limpio la referencia vieja: si no, el "Ahora no" no se registraría
      else{_padRef=null;setTimeout(_padAskNew,350);return;}
    }
    setTimeout(_padAskUpdate,350);
  }catch(e){console.warn('padron:',e);}
}
// ── PADRÓN: sugerencias mientras escribís el nombre de la empresa ────────────
// Dos herramientas distintas sobre el mismo padrón:
//   · typeahead (esto): escribís y te va mostrando si la empresa ya está cargada,
//     sin tener que abrir nada. Sirve para "¿la tengo o no la tengo?".
//   · lupa (openPadronPop): arranca mostrando TODAS y filtrás adentro. Es el
//     buscador completo, para explorar.
var _padSug=[],_padSugSel=0,_padSugMas=false;
var _PAD_SUG_MAX=8;

function _padCloseSug(){
  var b=document.getElementById('pad-sug');
  if(b&&b.parentNode)b.parentNode.removeChild(b);
  _padSug=[];_padSugSel=0;_padSugMas=false;
  document.removeEventListener('click',_padSugOutside);
}
function _padSugOutside(e){
  var b=document.getElementById('pad-sug'),i=document.getElementById('empresa');
  if(b&&!b.contains(e.target)&&e.target!==i)_padCloseSug();
}
function _padSugPos(){
  var b=document.getElementById('pad-sug'),i=document.getElementById('empresa');
  if(!b||!i)return;
  var r=i.getBoundingClientRect();
  b.style.top=(r.bottom+4)+'px';
  b.style.left=r.left+'px';
  b.style.width=r.width+'px';
}
// Arranca a sugerir con 2 letras, o con 3 dígitos si estás pegando un CUIT.
function _padSugQuery(q){
  var t=(q||'').trim();
  if(!_padron||!_padron.length||!t)return null;
  if(t.length<2&&_padDigits(t).length<3)return null;
  return t;
}
function _padSugRender(){
  var inp=document.getElementById('empresa');if(!inp)return;
  var t=_padSugQuery(inp.value);
  if(!t){_padCloseSug();return;}
  var res=padronSearch(t,_PAD_SUG_MAX+1);
  // si ya cargaste esa empresa y el texto es exactamente su razón social, no molesto
  if(_padRef&&_padNorm(inp.value)===_padNorm(_padRef.empresa)){_padCloseSug();return;}
  if(!res.length){_padCloseSug();return;}
  _padSugMas=res.length>_PAD_SUG_MAX;
  _padSug=res.slice(0,_PAD_SUG_MAX);
  _padSugSel=0;
  var b=document.getElementById('pad-sug');
  if(!b){
    b=document.createElement('div');b.id='pad-sug';b.className='pad-pop';
    document.body.appendChild(b);
    setTimeout(function(){document.addEventListener('click',_padSugOutside);},0);
  }
  b.innerHTML='<div class="pad-list">'+_padSug.map(function(r,i){
      return '<div class="pad-item'+(i===0?' on':'')+'" onclick="_padPickSug('+i+')">'+
        '<span class="pad-emp">'+_escHtml(r.empresa||'(sin razón social)')+'</span>'+
        '<span class="pad-sub">'+_escHtml(_padSubtitulo(r))+'</span></div>';
    }).join('')+'</div>'+
    (_padSugMas?'<div class="pad-more">Hay m&aacute;s coincidencias &mdash; abr&iacute; la lupa para verlas todas</div>':'');
  _padSugPos();
}
function _padSugMark(){
  var it=document.querySelectorAll('#pad-sug .pad-item');
  Array.prototype.forEach.call(it,function(x,i){x.classList.toggle('on',i===_padSugSel);});
  if(it[_padSugSel]&&it[_padSugSel].scrollIntoView)it[_padSugSel].scrollIntoView({block:'nearest'});
}
function _padPickSug(i){
  var r=_padSug&&_padSug[i];if(!r)return;
  _padCloseSug();
  _padApply(r);
}
function _padSugKey(e){
  if(!_padSug.length){
    if(e.key==='ArrowDown')_padSugRender();
    return;
  }
  if(e.key==='Escape'){_padCloseSug();return;}
  if(e.key==='Enter'){e.preventDefault();_padPickSug(_padSugSel);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    _padSugSel=Math.max(0,Math.min(_padSug.length-1,_padSugSel+(e.key==='ArrowDown'?1:-1)));
    _padSugMark();
  }
}
// Subtítulo compartido por el typeahead y la lupa: CUITs — cashback · oficiales.
function _padSubtitulo(r){
  var p=[];
  if(r.cuits&&r.cuits.length)p.push(r.cuits.map(_padFmtCuit).join('  ·  '));
  var ci=_padCfgOf(r.config);
  var t=[ci<0?'SIN CASHBACK':_padCfgName(ci)];
  t.push(_padAsesoresLbl(r));
  p.push(t.join('  ·  '));
  return p.join('  —  ');
}
// ── PADRÓN: lectura tolerante del cashback + validación al subir el Excel ────
// cfgIdx de _source.html compara texto EXACTO ("config 1" o "1") y ante
// cualquier otra cosa devuelve 0 = BAU EN SILENCIO. Resultado: un "Config1" o
// un "Configuración 1" hacía que todas las empresas quedaran en BAU sin aviso.
// _padCfgParse acepta cualquier forma razonable y devuelve -1 si no la entiende,
// para poder AVISAR en vez de tragárselo.
function _padCfgParse(raw){
  var t=(raw==null?'':String(raw)).trim().replace(/[.,]0+$/,''); // "1.0" del Excel → "1"
  var k=_padKey(t);                                             // sin acentos, signos ni espacios
  // ojo: "-" o "—" quedan en k='' pero NO son celda vacía: son un valor que no entiendo
  if(!k)return t?-1:0;
  if(k==='bau'||k==='base'||k==='estandar')return 0;
  var m=k.match(/([0-9]+)$/);
  if(m){
    var n=parseInt(m[1],10);
    if(n>=0&&n<(typeof CONFIGS!=='undefined'?CONFIGS.length:5))return n;
  }
  if(typeof CNAMES!=='undefined'){
    for(var i=0;i<CNAMES.length;i++)if(_padKey(CNAMES[i])===k)return i;
  }
  return -1; // no lo reconozco
}

// ── Validación del Excel ────────────────────────────────────────────────────
var _PAD_COLS_EMPRESA=['empresa','razonsocial','razsocial','nombreempresa','company','cliente'];
var _PAD_COLS_CONFIG=['config','cashback','tipocashback','tipodecashback','tipo','configuracion'];
var _PAD_COLS_RUBRO=['rubro','rubros','beneficio','opcionrubro','tope','importe','tope1','importe1','tope2','importe2'];
var _PAD_COLS_CUIT=['cuit','cuits','cuitgrupo','cuitsociedad'];
var _PAD_COLS_A1=['nombre','asesornombre','celular','asesorcelular','cel','email','mail','asesoremail'];
function _padColKnown(k){
  if(/^asesor[1-4](nombre|celular|email)$/.test(k))return true;
  if(/^cuit([1-9]|10)$/.test(k))return true;
  if(_PAD_COLS_RUBRO.indexOf(k)>=0)return true;
  return _PAD_COLS_EMPRESA.indexOf(k)>=0||_PAD_COLS_CONFIG.indexOf(k)>=0||
         _PAD_COLS_CUIT.indexOf(k)>=0||_PAD_COLS_A1.indexOf(k)>=0;
}
// Devuelve {rows, problemas:[{tipo,txt,grave}], descartadas, cols}
function _padValidate(raw){
  var cols={},rows=[],prob=[],desc=0;
  raw.forEach(function(r){for(var k in r){if(r.hasOwnProperty(k))cols[_padKey(k)]=k;}});
  var hasEmp=false,hasCfg=false,unknown=[];
  for(var k in cols){
    if(!cols.hasOwnProperty(k))continue;
    if(_PAD_COLS_EMPRESA.indexOf(k)>=0)hasEmp=true;
    if(_PAD_COLS_CONFIG.indexOf(k)>=0)hasCfg=true;
    if(!_padColKnown(k))unknown.push(cols[k]);
  }
  var badCfg=[],badCuit=[],sinNombre=[],sinCB=0,badRub=[];
  raw.forEach(function(r,i){
    var o=_padRow(r);
    if(!o){desc++;return;}
    var fila=i+2; // +1 por el encabezado, +1 porque Excel empieza en 1
    var rubTxt=_padRubroTxt(r);
    if(rubTxt&&!o.rubro.opcion)badRub.push({fila:fila,val:rubTxt,emp:o.empresa});
    if(!o.empresa)sinNombre.push(fila);
    if(_padCfgOf(o.config)<0){
      if(_padCfgSin(o.config))sinCB++;                                    // marcada a propósito
      else badCfg.push({fila:fila,val:o.config,emp:o.empresa});           // no la entiendo
    }
    (o.cuits||[]).forEach(function(d){
      if(d.length!==11)badCuit.push({fila:fila,val:d,emp:o.empresa});
    });
    rows.push(o);
  });
  function lista(arr,f){
    var n=Math.min(arr.length,4),out=[];
    for(var i=0;i<n;i++)out.push(f(arr[i]));
    if(arr.length>n)out.push('y '+(arr.length-n)+' m&aacute;s');
    return out.join(', ');
  }
  if(!rows.length)
    prob.push({grave:true,txt:'<strong>No se pudo leer ninguna empresa.</strong> Revis&aacute; que la primera fila del Excel sean los encabezados y que haya una columna <code>empresa</code>.'});
  if(!hasEmp&&rows.length)
    prob.push({grave:true,txt:'<strong>No encontr&eacute; la columna <code>empresa</code>.</strong> Las filas se van a guardar sin raz&oacute;n social. Renombr&aacute; esa columna a <code>empresa</code>.'});
  if(!hasCfg)
    prob.push({grave:true,txt:'<strong>No encontr&eacute; la columna del cashback.</strong> <strong>Todas</strong> las empresas van a salir <strong>sin montos</strong>. La columna tiene que llamarse <code>config</code> (o <code>cashback</code>).'});
  else{
    if(badCfg.length)
      prob.push({grave:false,txt:'<strong>'+badCfg.length+' cashback'+(badCfg.length>1?'s que no reconozco':' que no reconozco')+'</strong> '+
        '&rarr; esa'+(badCfg.length>1?'s empresas van':' empresa va')+' a salir <strong>sin montos</strong>: '+
        lista(badCfg,function(x){return 'fila '+x.fila+' ("'+_escHtml(x.val)+'")';})+
        '.<br>Si en realidad llevan cashback, corregilas. Valores v&aacute;lidos: <code>BAU</code>, <code>Config 1</code>&hellip;<code>Config 4</code> '+
        '(tambi&eacute;n vale s&oacute;lo el n&uacute;mero). Para marcar que <strong>no</strong> corresponde, escrib&iacute; <code>SIN</code> o dej&aacute; la celda vac&iacute;a.'});
    if(sinCB)
      prob.push({grave:false,txt:'<strong>'+sinCB+' empresa'+(sinCB>1?'s marcadas':' marcada')+' SIN cashback</strong> '+
        '(<code>SIN</code> o celda vac&iacute;a): su flyer sale con los importes en blanco. Si alguna no deber&iacute;a estar as&iacute;, pon&eacute;le el cashback que corresponda.'});
  }
  if(badRub.length)
    prob.push({grave:false,txt:'<strong>'+badRub.length+' rubro'+(badRub.length>1?'s que no reconozco':' que no reconozco')+'</strong> (queda'+(badRub.length>1?'n':'')+' <strong>sin rubro</strong>): '+
      lista(badRub,function(x){return 'fila '+x.fila+' ("'+_escHtml(x.val)+'")';})+'. Valores v&aacute;lidos: el nombre de una opci&oacute;n de Flyer Rubros ('+_escHtml(_padRubroOpts().map(_optLabel).join(', ')||'ninguna configurada')+').'});
  if(badCuit.length)
    prob.push({grave:false,txt:'<strong>'+badCuit.length+' CUIT sin 11 d&iacute;gitos</strong>: '+
      lista(badCuit,function(x){return 'fila '+x.fila+' ("'+_escHtml(x.val)+'")';})+'. Se guardan igual, pero puede que no los encuentres al buscar.'});
  if(sinNombre.length)
    prob.push({grave:false,txt:'<strong>'+sinNombre.length+' fila'+(sinNombre.length>1?'s':'')+' sin raz&oacute;n social</strong> (fila'+(sinNombre.length>1?'s':'')+' '+sinNombre.slice(0,6).join(', ')+'). S&oacute;lo se van a poder buscar por CUIT.'});
  if(desc)
    prob.push({grave:false,txt:'<strong>'+desc+' fila'+(desc>1?'s':'')+' vac&iacute;a'+(desc>1?'s':'')+'</strong> (sin empresa ni CUIT): se descarta'+(desc>1?'n':'')+'.'});
  if(unknown.length)
    prob.push({grave:false,txt:'<strong>Columnas que ignor&eacute;</strong>: '+_escHtml(unknown.slice(0,6).join(', '))+
      (unknown.length>6?(' y '+(unknown.length-6)+' m&aacute;s'):'')+'. Si alguna deber&iacute;a usarse, revis&aacute; el nombre contra la plantilla.'});
  return {rows:rows,problemas:prob,descartadas:desc,graves:prob.filter(function(p){return p.grave;}).length};
}

// ── Popup del informe de importación ────────────────────────────────────────
var _padImportPend=null;
function _padAskImport(rep){
  _padImportPend=rep;
  _padPending=null;
  var graves=rep.graves>0;
  _padModal('<h3>'+(graves?'&#9888; Revis&aacute; el Excel':'&#8505; Informe de la carga')+'</h3>'+
    '<p class="pu-sub">Le&iacute; <strong>'+rep.rows.length+' empresa'+(rep.rows.length===1?'':'s')+'</strong>'+
      (graves?', pero hay cosas que conviene corregir antes de guardar:':', con estas observaciones:')+'</p>'+
    '<ul><li>'+rep.problemas.map(function(p){return p.txt;}).join('</li><li>')+'</li></ul>'+
    '<p class="pu-sub">Si cancel&aacute;s, tus empresas quedan como estaban y pod&eacute;s corregir el Excel y volver a subirlo.</p>'+
    '<div class="pu-foot">'+
      '<button class="pu-no" onclick="_padImportCancel()">Cancelar</button>'+
      '<button class="pu-si" onclick="_padImportGo()">Guardar igual ('+rep.rows.length+')</button>'+
    '</div>');
}
function _padImportCancel(){
  _padImportPend=null;_padCloseUpdate(0);
  showToast('Carga cancelada: tus empresas quedaron como estaban');
  renderPadronAdmin();
}
function _padImportGo(){
  var rep=_padImportPend;if(!rep){_padCloseUpdate(0);return;}
  var btn=document.querySelector('#pad-upd .pu-si');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  savePadron(rep.rows,function(ok){
    _padImportPend=null;_padCloseUpdate(0);
    if(ok)showToast('Empresas actualizadas: '+rep.rows.length);
    renderPadronAdmin();
  });
}
// ── SIN CASHBACK ─────────────────────────────────────────────────────────────
// Hay empresas a las que no les corresponde cashback. En vez de agregar una
// opción nueva en el armador, se marcan desde el padrón: si la celda `config`
// está VACÍA o dice algo que no reconozco, esa empresa sale SIN los montos.
// Las cajas de fondo se siguen dibujando (por si un flyer futuro trae importes
// impresos debajo); lo único que no se escribe es el número.
var _fgNoCB=false;

// El cashback del padrón es EXPLÍCITO: -1 = sin cashback, 0..4 = config.
// Formas EXPLÍCITAS de decir "esta empresa no lleva cashback". Se distinguen de
// un valor que no entiendo (ej "Premium") para no llenar el informe de avisos:
// el resultado es el mismo (sin montos), pero de estas no me quejo.
var _PAD_SIN_CB=['','sin','sincb','sincashback','nocorresponde','nocorrespondecashback',
  'no','na','ninguno','ninguna','ningun','sc','nada','exento','exenta','excluido','excluida','cero'];
function _padCfgSin(raw){return _PAD_SIN_CB.indexOf(_padKey(raw))>=0;}
function _padCfgOf(raw){
  var t=(raw==null?'':String(raw)).trim();
  if(!t)return -1;
  return _padCfgParse(t);
}
function _fgNoCBBadge(on){
  if(!document.getElementById('fg-nocb-style')){
    var st=document.createElement('style');st.id='fg-nocb-style';
    st.textContent='#fg-nocb{display:none;margin:0 0 10px;font-size:.7rem;line-height:1.45;color:#b06000;'+
      'background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.5);border-radius:7px;padding:7px 10px}';
    document.head.appendChild(st);
  }
  var el=document.getElementById('fg-nocb');
  if(!el){
    var box=document.querySelector('.cfg-box');if(!box)return;
    box.insertAdjacentHTML('beforebegin','<div id="fg-nocb"></div>');
    el=document.getElementById('fg-nocb');if(!el)return;
  }
  el.innerHTML=on?('&#9888; <strong>Sin cashback</strong> &mdash; en tu base esta empresa no tiene un '+
    'cashback v&aacute;lido, as&iacute; que el flyer sale con los importes en blanco. '+
    'Si en realidad le corresponde uno, eleg&iacute;lo ac&aacute; arriba.'):'';
  el.style.display=on?'block':'none';
}
function _fgSetNoCB(on){
  _fgNoCB=!!on;
  if(_fgNoCB){
    ['d1','d2','d3','d4'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='—';});
    var btns=document.querySelectorAll('.cfg-btn');
    Array.prototype.forEach.call(btns,function(b){b.classList.remove('active');});
  }
  _fgNoCBBadge(_fgNoCB);
  if(typeof redraw==='function')redraw();
}
// Pisa setCfg de _source.html: elegir un cashback a mano siempre saca el "sin cashback".
function fgSetCfg(n){
  n=(n>=0&&n<CONFIGS.length)?n:0;
  window.ac=n;
  var c=CONFIGS[n]||CONFIGS[0];
  _fgNoCB=false;_fgNoCBBadge(false);
  ['d1','d2','d3','d4'].forEach(function(id,i){
    var e=document.getElementById(id);if(e)e.textContent=c['m'+(i+1)];
  });
  var btns=document.querySelectorAll('.cfg-btn');
  Array.prototype.forEach.call(btns,function(b,i){b.classList.toggle('active',i===n);});
  if(typeof redraw==='function')redraw();
}

// ── PEGAR DATOS DEL OFICIAL (nombre / celular / mail desde un texto pegado) ──
// Botón "⚡ Pegar" al lado del título de CADA asesor (Asesor 1..4), SOLO ADMIN.
// Pegás el mensaje/firma/dato suelto que te mandaron y completa Nombre, Celular
// y Mail solos, estandarizando el formato SIN tocar los dígitos reales del cel.
// Vive entero en auth.js (sobrevive a que se regenere _source.html).
//
// Reglas (decididas con el usuario):
//  · Nombre → Primera letra de cada palabra en mayúscula, resto minúscula.
//    Las iniciales ("A.") quedan como iniciales.
//  · Celular → formato fijo "11 3617-9603" (área · espacio · número con guión).
//    Se sacan prefijos de discado (+54, 0, 9, 15) pero NUNCA se toca un dígito
//    real del número: se verifica reconstruyendo el original.
//  · Mail → sólo se normaliza a minúscula. Si hay varios mails en el texto, se
//    prioriza SIEMPRE el que termina en @bancogalicia.com.ar (puede no coincidir
//    con el nombre, y está bien: no se inventa, se toma tal cual está escrito).
//  · Si no hay celular en el texto, se completan sólo Nombre y Mail (no es error).
//  · Si detecta una PERSONA (nombre o mail) y no encuentra alguno de los otros
//    campos, LIMPIA ese campo (para no mezclar datos de dos personas distintas)
//    y lo avisa. EXCEPCIÓN: si sólo hay un teléfono suelto en el texto (sin
//    nombre ni mail), sólo completa el celular y no toca nombre/mail.

var _PAD_DOMINIO='bancogalicia.com.ar';

// Title Case respetando iniciales ("A." -> "A.", no "A.")
function _fgTitleCase(s){
  return (s||'').trim().split(/\s+/).map(function(w){
    if(/^[A-Za-zÁÉÍÓÚÑáéíóúñ]\.$/.test(w))return w.charAt(0).toUpperCase()+'.';
    return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
  }).join(' ');
}

// Códigos de área argentinos de 3 dígitos (el resto son 2 -CABA/GBA- o 4).
var _FG_AREAS3=['220','221','223','230','236','237','249','260','261','263','264',
  '266','280','291','297','299','341','342','343','345','348','351','353','358',
  '362','364','370','376','379','380','381','383','385','387','388'];

// Separa prefijos de discado SIN tocar el número real; guarda en "quitados" cada
// pedazo que sacó y en qué posición estaba, para poder RECONSTRUIR el original
// y verificar que no se alteró ningún dígito (_fgVerificaTel).
function _fgPartirTel(d0){
  var d=d0,quit=[];
  function cortaIni(n,etq){quit.push({pos:0,dig:d.slice(0,n),etq:etq});d=d.slice(n);}
  if(d.indexOf('0054')===0)cortaIni(4,'+54');
  else if(d.indexOf('54')===0&&d.length>10)cortaIni(2,'+54');
  if(d.charAt(0)==='0')cortaIni(1,'0');
  if(d.length===11&&d.charAt(0)==='9')cortaIni(1,'9');
  if(d.length===12){ // el "15" va DESPUÉS del código de área: 11 15 3617 9603
    var m=d.match(/^(\d{2,4})15(\d{6,8})$/);
    if(m){quit.push({pos:m[1].length,dig:'15',etq:'15'});d=m[1]+m[2];}
  }
  // Formato informal MUY común en Argentina: pasar el celular como "15 3617-9603",
  // SIN código de área, dando por sobreentendido que es el 11 (CABA/GBA). Ningún
  // código de área real empieza con "1" salvo el "11" mismo (todos son 2xx/3xx),
  // así que un número de 10 dígitos que empieza con "15" NUNCA es "área 15 + 8
  // dígitos" válido: es el marcador de celular "15" + los 8 dígitos del abonado,
  // con área 11 implícita. Antes esto se interpretaba como área "1536" (inventada)
  // y daba un número completamente inválido.
  if(d.length===10&&d.slice(0,2)==='15'){
    quit.push({pos:0,dig:'15',etq:'15',len:2}); // len:2 = reemplaza (no inserta) al reconstruir
    d='11'+d.slice(2);
  }
  if(d.length!==10)return null;
  var area=d.indexOf('11')===0?2:(_FG_AREAS3.indexOf(d.slice(0,3))>=0?3:4);
  return {area:d.slice(0,area),numero:d.slice(area),quitados:quit,digitos:d,original:d0};
}
// GARANTÍA: vuelvo a insertar lo que saqué, en su posición exacta, y tiene que
// dar EXACTAMENTE el texto original. Si no da, no se usa ese teléfono.
// q.len (sólo en el caso "15 sin área"): cuántos caracteres de "digitos" hay que
// REEMPLAZAR (no sólo insertar) para volver al original — reconstruye "15..."
// a partir del "11..." que se guardó como número real.
function _fgVerificaTel(t){
  var d=t.digitos;
  for(var i=t.quitados.length-1;i>=0;i--){
    var q=t.quitados[i];
    d=d.slice(0,q.pos)+q.dig+d.slice(q.pos+(q.len||0));
  }
  return d===t.original;
}
function _fgFmtCel(t){return t.area+' '+t.numero.slice(0,t.numero.length-4)+'-'+t.numero.slice(-4);}

// Separadores que pueden ir DENTRO de un teléfono. NUNCA un salto de línea: dos
// números en renglones distintos son dos números distintos.
var _FG_TEL_SEP=/^[ \t.\-()/]{0,3}$/;
var _FG_LETRA=/[A-Za-zÁÉÍÓÚÑáéíóúñ]/;
// Busca teléfonos combinando GRUPOS de dígitos consecutivos, en vez de con un
// único regex glotón. El glotón fusionaba un legajo pegado a letras
// ("EMREN050215") con el teléfono del renglón siguiente y armaba un número
// imposible de 16 dígitos que después se descartaba: el celular se perdía entero.
// Ahora cada combinación se valida con _fgPartirTel, así que sólo sobreviven
// combinaciones que son un teléfono argentino de verdad.
function _fgTelCandidatos(txt){
  var ign=[],t=String(txt||'');
  function tapar(re,que){
    t=t.replace(re,function(m){
      if(ign.indexOf(que)<0)ign.push(que);
      return new Array(m.length+1).join(' '); // mismas posiciones, sin los dígitos
    });
  }
  // Un CUIT SÍ hay que taparlo: "30-71234567-8" da "30"+"71234567" = 10 dígitos,
  // que pasaría como teléfono válido con un código de área inventado.
  tapar(/\b\d{2}\s?-\s?\d{8}\s?-\s?\d\b/g,'un CUIT');
  tapar(/(?:cuit|cuil)\s*[:.]?\s*\d[\d.\- ]{8,}\d/gi,'un CUIT');
  tapar(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,'una fecha');
  var gr=[],re=/\d+/g,m;
  while((m=re.exec(t))){
    var gi=m.index;
    gr.push({d:m[0],ini:gi,fin:gi+m[0].length,
      // pegado a letras => es un código/legajo (EMREN050215), no un teléfono
      pegado:_FG_LETRA.test(t.charAt(gi-1)||' ')});
  }
  var cands=[],vistos={},invalido='';
  for(var i=0;i<gr.length;i++){
    if(gr[i].pegado)continue;
    var ini=gr[i].ini,pre=txt.charAt(ini-1);
    if(pre==='+'||pre==='(')ini--; // para mostrar el original tal cual se pegó
    var dig='';
    for(var j=i;j<gr.length;j++){
      if(j>i){
        if(gr[j].pegado)break;
        if(!_FG_TEL_SEP.test(t.slice(gr[j-1].fin,gr[j].ini)))break;
      }
      dig+=gr[j].d;
      if(dig.length>15)break;
      var tel=_fgPartirTel(dig);
      if(tel&&_fgVerificaTel(tel)){
        if(!vistos[tel.digitos]){
          vistos[tel.digitos]=1;
          cands.push({bruto:txt.slice(ini,gr[j].fin).trim(),ini:gr[i].ini,t:tel});
        }
      }else if(dig.length>=7&&dig.length>_padDigits(invalido).length){
        invalido=txt.slice(ini,gr[j].fin).trim();
      }
    }
  }
  return {cands:cands,ignorado:ign,invalido:invalido};
}
var _FG_PC_MOVIL=/(cel|celular|m[oó]vil|whatsapp|wsp|\bm\s*[.:])\s*[^\d]{0,3}$/i;
var _FG_PC_FIJO=/(tel[eé]fono|\btel\b|\bt\s*[.:]|l[ií]nea|conmutador|interno|\bint\b|fax)\s*[^\d]{0,3}$/i;
var _FG_PC_FRASE={};
['me','te','se','nos','es','son','era','fue','un','una','unos','unas','con','para',
 'por','que','al','en','su','sus','mi','tu','este','esta','esto','eso','hola','buenas',
 'buenos','gracias','saludos','abrazo','cualquier','cosa','avisas','aviso','paso','pasa',
 'dejo','adjunto','escribio','pidiendo','pide','necesito','flyer','reunion','cliente',
 'empresa','banco','galicia','negocios','empresas','sucursal','interno','senior','junior',
 'gerente','ok','dale','ahi','aca','alli','mail','email','correo','cel','celular','tel',
 'telefono','telefonos','movil','whatsapp','wsp','cuit','cuil','dni','int','fax','sa',
 'srl','sas','sociedad','anonima','s','datos','contacto','nombre','asesor','asesora',
 'oficial','ejecutivo','ejecutiva'].forEach(function(w){_FG_PC_FRASE[w]=1;});
var _FG_PC_PARTIC={};
['de','del','la','las','los','le','di','da','do','van','von','mac','mc','san','santa','y']
  .forEach(function(w){_FG_PC_PARTIC[w]=1;});
var _FG_PC_ROLES='nombre|asesor|asesora|oficial|ejecutivo|ejecutiva|contacto|referente|responsable';

function _fgLimpiarPrefijoNombre(l){
  var s=l.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/,'');
  s=s.replace(new RegExp('^(el|la|su|mi|nuestro|nuestra)?\\s*('+_FG_PC_ROLES+')\\s*(es|seria|sería)?\\s*[:\\-]?\\s*','i'),'');
  return s.trim();
}

// Extrae {nombre, celular, email, avisos:[], ignorado:[], celOriginal, celQuitados:[]}
// de un texto pegado (mensaje, firma, dato suelto, chat desordenado...).
function _fgParseContacto(texto){
  var out={nombre:'',celular:'',email:'',avisos:[],ignorado:[]};
  var t=String(texto||'');

  // 1) MAIL — prefiero SIEMPRE @bancogalicia.com.ar; puede NO derivar del nombre.
  var reMail=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var mails=(t.match(reMail)||[]).map(function(x){return x.toLowerCase();});
  var gal=mails.filter(function(x){return x.indexOf('@'+_PAD_DOMINIO)===(x.length-('@'+_PAD_DOMINIO).length);});
  if(gal.length){
    out.email=gal[0];
    var otros=mails.filter(function(x){return x!==out.email;});
    if(otros.length)out.ignorado.push(otros.length+' mail(s) ajenos a Galicia');
    if(gal.length>1)out.avisos.push('hay '+gal.length+' mails de Galicia, tomé el primero');
  }else if(mails.length){
    out.email=mails[0];
    out.avisos.push('el mail no termina en @'+_PAD_DOMINIO+' — revisalo');
  }
  var sinMail=t.replace(reMail,' ');

  // 2) CELULAR — puede no haber ninguno, es válido.
  var tc=_fgTelCandidatos(sinMail);
  tc.ignorado.forEach(function(x){out.ignorado.push(x);});
  var ok=tc.cands;
  ok.forEach(function(c){
    var antes=sinMail.slice(Math.max(0,c.ini-18),c.ini);
    c.puntos=(_FG_PC_MOVIL.test(antes)?10:0)-(_FG_PC_FIJO.test(antes)?10:0);
  });
  ok.sort(function(a,b){return b.puntos-a.puntos;}); // el rotulado "Cel"/"M." gana al "Tel"/conmutador
  if(ok.length){
    var c=ok[0];
    out.celular=_fgFmtCel(c.t);out.celOriginal=c.bruto;
    out.celQuitados=c.t.quitados.map(function(q){return q.etq;});
    ok.slice(1).forEach(function(x){out.ignorado.push('otro número ('+x.bruto+')');});
  }else if(tc.invalido){
    out.avisos.push('"'+tc.invalido+'" no parece un celular argentino');
  }
  // Para buscar el nombre saco los números. Ojo con los códigos internos que
  // MEZCLAN letras y dígitos (legajo "EMREN050215", "SUC0082"): si sólo saco los
  // dígitos queda "EMREN" suelto y se cuela como apellido. Van enteros a la basura.
  var sinTel=sinMail
    .replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]*\d[\dA-Za-zÁÉÍÓÚÑáéíóúñ]*/g,' ')
    .replace(/\d+/g,' ');

  // 3) NOMBRE — el mail es una PISTA para UBICARLO en el texto, no un requisito
  //    (el mail puede no derivar del nombre real de la persona).
  var usuario=out.email?_padNorm(out.email.split('@')[0]):'';
  var partes=usuario?usuario.split(/[._\-0-9]+/).filter(function(p){return p.length>2;}):[];
  var palabras=sinTel.split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ'’.]+/).filter(Boolean);
  function esPal(w){return /^[A-Za-zÁÉÍÓÚÑáéíóúñ'’]+\.?$/.test(w);}
  function esFrase(w){var k=_padNorm(w).replace(/\./g,'');return _FG_PC_FRASE[k]&&!_FG_PC_PARTIC[k];}

  var elegido='',via='';
  if(partes.length){
    var mejorV=null;
    for(var pi=0;pi<palabras.length;pi++){
      if(!esPal(palabras[pi])||esFrase(palabras[pi]))continue;
      for(var n=2;n<=5&&pi+n<=palabras.length;n++){
        var win=palabras.slice(pi,pi+n);
        var todasPal=win.every(esPal),algunaFrase=win.some(esFrase);
        if(!todasPal||algunaFrase)break; // corto la ventana en la primera "no-palabra"
        if(win.every(function(w){return _FG_PC_PARTIC[_padNorm(w)];}))continue;
        var k=_padNorm(win.join('')).replace(/[^a-z]/g,'');
        var p=0;
        partes.forEach(function(x){if(k.indexOf(x)>=0)p+=10;});
        if(!p)continue;
        p-=n*2; // premio la ventana más corta
        if(!mejorV||p>mejorV.p)mejorV={c:win.join(' '),p:p};
      }
    }
    if(mejorV){elegido=mejorV.c;via='ubicado por el mail';}
  }
  if(!elegido){
    var lineas=sinTel.split(/[\n\r;|,]+/).map(function(x){return x.trim();}).filter(Boolean);
    var mejorL=null;
    lineas.forEach(function(l,k2){
      var c2=_fgLimpiarPrefijoNombre(l);
      var w2=c2.split(/\s+/).filter(Boolean);
      if(w2.length<2||w2.length>5)return;
      if(!w2.every(esPal))return;
      if(w2.some(esFrase))return;
      if(w2.every(function(x){return _FG_PC_PARTIC[_padNorm(x)];}))return;
      var p2=Math.max(0,3-k2);
      if(new RegExp('^(el|la|su)?\\s*('+_FG_PC_ROLES+')','i').test(l.trim()))p2+=5;
      if(!mejorL||p2>mejorL.p)mejorL={c:c2,p:p2};
    });
    if(mejorL){elegido=mejorL.c;via='deducido del texto — verificalo';}
  }
  if(elegido){out.nombre=_fgTitleCase(elegido);out.avisos.push(via);}
  return out;
}

// ── UI: botón "⚡ Pegar" + panel por cada asesor (1..4) — SOLO ADMIN ─────────
var _fgPasteState={};
function _fgPasteStyle(){
  if(document.getElementById('fg-paste-style'))return;
  var st=document.createElement('style');st.id='fg-paste-style';
  st.textContent=
    '.fg-paste-btn{display:inline-flex;align-items:center;gap:3px;margin-left:8px;'+
      'font-size:.62rem;font-weight:700;text-transform:none;letter-spacing:0;'+
      'color:var(--gray,#888);background:rgba(128,128,128,.12);border:1px solid transparent;'+
      'border-radius:999px;padding:2px 8px;cursor:pointer;transition:.15s;vertical-align:middle}'+
    '.fg-paste-btn:hover{color:var(--red,#c62828);background:rgba(198,40,40,.1)}'+
    '.fg-paste-btn.on{color:#fff;background:var(--red,#c62828)}'+
    '.fg-paste-wrap{margin:2px 0 10px;padding:8px 9px;border:1.5px dashed rgba(128,128,128,.4);'+
      'border-radius:8px;background:rgba(128,128,128,.05)}'+
    '.fg-paste-hint{font-size:.66rem;color:var(--gray,#888);line-height:1.4;margin-bottom:6px}'+
    '.fg-paste-ta{width:100%;box-sizing:border-box;min-height:52px;padding:7px 9px;'+
      'border:1.5px solid var(--border,#ddd);border-radius:7px;font-family:"DM Sans",sans-serif;'+
      'font-size:.78rem;background:var(--light,#fafafa);outline:none;resize:vertical;'+
      'color:inherit;transition:border-color .2s}'+
    '.fg-paste-ta:focus{border-color:var(--red,#c62828);background:#fff}'+
    '.fg-paste-res{margin-top:7px;font-size:.68rem;line-height:1.5}'+
    '.fg-paste-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:3px}'+
    '.fg-paste-chip{padding:1px 7px;border-radius:999px;background:rgba(128,128,128,.14);'+
      'color:var(--gray,#888);font-weight:600}'+
    '.fg-paste-chip.ok{background:rgba(46,125,50,.14);color:#2e7d32}'+
    '.fg-paste-lines{color:var(--gray,#777);margin-bottom:2px}'+
    '.fg-paste-ign{color:var(--gray,#999);font-style:italic;margin-bottom:2px}'+
    '.fg-paste-warn{color:#b06000}'+
    '.fg-paste-undone{color:var(--gray,#888)}'+
    '.fg-paste-undo{margin-top:2px;border:none;background:none;color:var(--gray,#888);'+
      'text-decoration:underline;font-size:.66rem;cursor:pointer;padding:0}'+
    '.fg-paste-undo:hover{color:var(--red,#c62828)}';
  document.head.appendChild(st);
}
// Inyecta el botón "⚡ Pegar" en el título de cada asesor y el panel dentro de
// su bloque de campos (así se muestra/oculta solo junto con el bloque). Sólo
// para ADMIN; idempotente (dataset.fgPaste evita duplicar si se llama de nuevo.
function _fgEnsurePasteBtns(){
  if(!_can('pegar_oficial'))return;
  _fgPasteStyle();
  for(var n=1;n<=4;n++){
    var b=_fgBlock(n);if(!b||b.sec.dataset.fgPaste)continue;
    b.sec.dataset.fgPaste='1';
    b.sec.insertAdjacentHTML('beforeend',
      ' <span class="fg-paste-btn" id="fg-paste-btn-'+n+'" '+
      'onclick="event.stopPropagation();_fgTogglePaste('+n+')" '+
      'title="Pegar los datos del oficial (nombre, celular, mail) y completarlos solo">'+
      '⚡ Pegar</span>');
    b.fields.insertAdjacentHTML('afterbegin',
      '<div class="fg-paste-wrap" id="fg-paste-'+n+'" style="display:none">'+
        '<div class="fg-paste-hint">Pegá acá el mensaje, la firma o los datos sueltos del oficial.</div>'+
        '<textarea class="fg-paste-ta" id="fg-paste-ta-'+n+'" rows="3" '+
          'placeholder="Ej: Julieta A. De Santis, 11 3617-9603, julieta.desantis@bancogalicia.com.ar" '+
          'oninput="_fgPasteHandle('+n+')"></textarea>'+
        '<div class="fg-paste-res" id="fg-paste-res-'+n+'"></div>'+
      '</div>');
  }
}
// Cierra el cuadro de pegado de UN asesor. Lo usa el toggle y, sobre todo,
// _padApply: si traés una empresa del padrón los asesores se completan solos,
// así que el cuadro abierto ya no sirve y sólo estorba la vista.
function _fgClosePaste(n){
  var w=document.getElementById('fg-paste-'+n);if(!w)return false;
  if(w.style.display==='none'||!w.style.display)return false;
  w.style.display='none';
  var btn=document.getElementById('fg-paste-btn-'+n);
  if(btn)btn.classList.remove('on');
  var ta=document.getElementById('fg-paste-ta-'+n);if(ta)ta.value='';
  var res=document.getElementById('fg-paste-res-'+n);if(res)res.innerHTML='';
  _fgPasteState[n]={snapshot:null,timer:null}; // se corta el Deshacer: los datos ya no son los pegados
  return true;
}
function _fgClosePasteAll(){
  var hubo=false;
  for(var n=1;n<=4;n++)if(_fgClosePaste(n))hubo=true;
  return hubo;
}
function _fgTogglePaste(n){
  var w=document.getElementById('fg-paste-'+n);if(!w)return;
  var btn=document.getElementById('fg-paste-btn-'+n);
  var abrir=(w.style.display==='none'||!w.style.display);
  if(!abrir){_fgClosePaste(n);return;}
  w.style.display='block';
  if(btn)btn.classList.add('on');
  if(abrir){
    // arranca en limpio cada vez que se abre: nueva "sesión" de pegado
    _fgPasteState[n]={snapshot:null,timer:null};
    var ta=document.getElementById('fg-paste-ta-'+n);
    var res=document.getElementById('fg-paste-res-'+n);
    if(res)res.innerHTML='';
    if(ta){ta.value='';setTimeout(function(){ta.focus();},0);}
  }
}
function _fgPasteHandle(n){
  var st=_fgPasteState[n]||(_fgPasteState[n]={});
  clearTimeout(st.timer);
  st.timer=setTimeout(function(){_fgPasteRun(n);},180);
}
function _fgPasteRun(n){
  var st=_fgPasteState[n]||(_fgPasteState[n]={});
  var ta=document.getElementById('fg-paste-ta-'+n);if(!ta)return;
  var texto=ta.value;
  var res=document.getElementById('fg-paste-res-'+n);
  if(!texto.trim()){if(res)res.innerHTML='';return;}
  if(!st.snapshot){ // primer parseo de esta "sesión": guardo el ANTES para poder deshacer
    var sfx0=(n===1)?'':String(n);
    var mEl0=document.getElementById('email'+sfx0);
    st.snapshot={nombre:_gv('nombre'+sfx0),celular:_gv('celular'+sfx0),email:_gv('email'+sfx0),
      mailManual:mEl0?mEl0.dataset.fgManual:''};
  }
  var r=_fgParseContacto(texto);
  _fgApplyParsed(n,r);
}
// Aplica lo detectado. Si reconoce una PERSONA (nombre o mail), completa lo que
// encontró y LIMPIA lo que no (para no mezclar el celular de una persona con el
// nombre de otra). Si sólo hay un teléfono suelto (sin nombre ni mail), completa
// nada más que el celular y no toca el resto.
function _fgApplyParsed(n,r){
  var sfx=(n===1)?'':String(n);
  if(!r.nombre&&!r.celular&&!r.email){
    _fgPasteRenderRes(n,null,'No reconocí ningún dato. Revisá el texto pegado.');
    return;
  }
  var esPersona=!!(r.nombre||r.email);
  if(esPersona){
    var antesN=_gv('nombre'+sfx),antesC=_gv('celular'+sfx),antesE=_gv('email'+sfx);
    _setVal('nombre'+sfx,r.nombre||'');
    if(!r.nombre&&antesN)r.avisos.push('Nombre: no encontré — lo dejé vacío');
    _setVal('celular'+sfx,r.celular||'');
    if(!r.celular&&antesC)r.avisos.push('Celular: no encontré — lo dejé vacío');
    // El mail se toma SOLO si viene escrito con arroba en el texto pegado, y
    // TEXTUAL: nunca se deduce del nombre (en el banco muchos no derivan de él).
    // Lo único que se toca es el formato (minúsculas y sin espacios sueltos).
    var mailFinal=r.email;
    _setVal('email'+sfx,mailFinal||'');
    if(!mailFinal)r.avisos.push(antesE
      ?'Mail: no venía en el texto — lo dejé vacío'
      :'Mail: no venía en el texto — cargalo a mano');
    var mEl=document.getElementById('email'+sfx);
    if(mEl)mEl.dataset.fgManual=r.email?'1':'';
    _fgSetAsesorOn(n,true);
    _fgShowBlock(n,true);
    r.email=mailFinal; // para que el chip/resumen refleje lo que quedó cargado
  }else if(r.celular){
    _setVal('celular'+sfx,r.celular);
  }
  if(typeof _fgRefreshAddBtn==='function')_fgRefreshAddBtn();
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
  _fgPasteRenderRes(n,r,null);
}
function _fgPasteRenderRes(n,r,errMsg){
  var res=document.getElementById('fg-paste-res-'+n);if(!res)return;
  if(errMsg){res.innerHTML='<div class="fg-paste-warn">⚠ '+_escHtml(errMsg)+'</div>';return;}
  var chips=
    '<span class="fg-paste-chip'+(r.nombre?' ok':'')+'">'+(r.nombre?'✓':'—')+' Nombre</span>'+
    '<span class="fg-paste-chip'+(r.celular?' ok':'')+'">'+(r.celular?'✓':'—')+' Celular</span>'+
    '<span class="fg-paste-chip'+(r.email?' ok':'')+'">'+(r.email?'✓':'—')+' Mail</span>';
  var lineas=[];
  if(r.celular&&r.celOriginal&&r.celOriginal.replace(/\D/g,'')!==r.celular.replace(/\D/g,'')){
    lineas.push('Celular: pegaste "'+r.celOriginal+'" → quedó "'+r.celular+'"'+
      (r.celQuitados&&r.celQuitados.length?' (saqué: '+r.celQuitados.join(' ')+')':''));
  }
  (r.avisos||[]).forEach(function(a){lineas.push(a.charAt(0).toUpperCase()+a.slice(1));});
  var lineasHtml=lineas.length?('<div class="fg-paste-lines">'+
    lineas.map(function(l){return _escHtml(l);}).join('<br>')+'</div>'):'';
  var ignHtml=(r.ignorado&&r.ignorado.length)?
    ('<div class="fg-paste-ign">Ignoré: '+_escHtml(r.ignorado.join(', '))+'</div>'):'';
  res.innerHTML='<div class="fg-paste-chips">'+chips+'</div>'+lineasHtml+ignHtml+
    '<button type="button" class="fg-paste-undo" onclick="event.stopPropagation();_fgUndoPaste('+n+')">Deshacer</button>';
}
function _fgUndoPaste(n){
  var st=_fgPasteState[n];if(!st||!st.snapshot)return;
  var sfx=(n===1)?'':String(n);
  _setVal('nombre'+sfx,st.snapshot.nombre);
  _setVal('celular'+sfx,st.snapshot.celular);
  _setVal('email'+sfx,st.snapshot.email);
  var mEl=document.getElementById('email'+sfx);
  if(mEl)mEl.dataset.fgManual=st.snapshot.mailManual||'';
  st.snapshot=null;
  var ta=document.getElementById('fg-paste-ta-'+n);if(ta)ta.value='';
  var res=document.getElementById('fg-paste-res-'+n);
  if(res)res.innerHTML='<div class="fg-paste-undone">Deshecho — volviste a los datos de antes.</div>';
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
}

// ── TUTORIAL GUIADO ("tour") ──────────────────────────────────────────────────
// Recorrido didáctico sobre la pantalla REAL: se oscurece todo, se ilumina el
// botón del que se habla y un globo con flecha explica qué hace. Por capítulos
// (cada uno se puede saltar entero), con Anterior/Siguiente/Cerrar y teclado.
// Los pasos se filtran por perfil: si un usuario no tiene "Pegar", ese paso no
// existe para él. Disponible para todos desde el menú del nombre ("Ver
// tutorial"); el arranque automático al primer ingreso es la facultad
// tutorial_auto, que el admin prende por perfil cuando quiera.
var _tour=null; // estado: {pasos:[...], i, caps:[...]}
function _tourKey(){return 'fg_tour_done_'+(_me?_me.id:'anon');}
function _tourMarcarVisto(){try{localStorage.setItem(_tourKey(),'1');}catch(e){}}
function _tourYaVisto(){try{return !!localStorage.getItem(_tourKey());}catch(e){return false;}}
function _tourStyle(){
  if(document.getElementById('fg-tour-style'))return;
  var st=document.createElement('style');st.id='fg-tour-style';
  st.textContent=
    // El oscurecido es el overlay con un AGUJERO (clip-path evenodd) sobre el
    // elemento: más predecible que un box-shadow gigante alrededor del spotlight.
    '#fg-tour-ov{position:fixed;inset:0;z-index:20000;background:rgba(10,10,12,.58)}'+
    '#fg-tour-hl{position:fixed;z-index:20001;border-radius:10px;pointer-events:none;'+
      'box-shadow:0 0 0 3px rgba(227,6,19,.85),0 0 22px rgba(227,6,19,.45);'+
      'transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease}'+
    '#fg-tour-tip{position:fixed;z-index:20002;width:min(360px,calc(100vw - 24px));background:#fff;color:#111;'+
      'border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:14px 16px 12px;font-family:"DM Sans",sans-serif;'+
      'animation:fgTourIn .18s ease}'+
    'html.dark #fg-tour-tip{background:#23262c;color:#e8e8e8}'+
    '@keyframes fgTourIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'+
    '#fg-tour-tip .ft-arrow{position:absolute;width:16px;height:16px;background:inherit;transform:rotate(45deg);'+
      'box-shadow:-3px -3px 8px rgba(0,0,0,.06)}'+
    '#fg-tour-tip .ft-caps{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;padding-right:18px}'+
    '#fg-tour-tip .ft-cap{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;'+
      'border-radius:20px;background:rgba(128,128,128,.14);color:var(--gray,#777);cursor:pointer;user-select:none}'+
    '#fg-tour-tip .ft-cap.on{background:var(--red,#e30613);color:#fff}'+
    '#fg-tour-tip .ft-cap:hover:not(.on){background:rgba(128,128,128,.26)}'+
    '#fg-tour-tip h4{margin:0 0 6px;font-family:"Syne",sans-serif;font-size:.98rem;font-weight:800;line-height:1.25}'+
    '#fg-tour-tip p{margin:0;font-size:.8rem;line-height:1.55;color:#333}'+
    'html.dark #fg-tour-tip p{color:#cfd2d8}'+
    '#fg-tour-tip .ft-foot{display:flex;align-items:center;gap:6px;margin-top:12px;flex-wrap:wrap}'+
    '#fg-tour-tip .ft-n{font-size:.66rem;color:var(--gray,#888);margin-right:auto}'+
    '#fg-tour-tip .ft-btn{border:none;border-radius:8px;padding:7px 11px;font-family:"Syne",sans-serif;font-size:.68rem;'+
      'font-weight:700;cursor:pointer;background:rgba(128,128,128,.14);color:inherit;transition:.15s}'+
    '#fg-tour-tip .ft-btn:hover{background:rgba(128,128,128,.28)}'+
    '#fg-tour-tip .ft-btn.main{background:var(--red,#e30613);color:#fff}'+
    '#fg-tour-tip .ft-btn.main:hover{background:#b8000f}'+
    '#fg-tour-tip .ft-btn:disabled{opacity:.4;cursor:default}'+
    '#fg-tour-tip .ft-x{position:absolute;top:8px;right:10px;font-size:.85rem;color:var(--gray,#888);cursor:pointer;padding:2px 5px}'+
    '#fg-tour-tip .ft-x:hover{color:var(--red,#e30613)}'+
    '#fg-tour-tip .ft-skip{font-size:.66rem;color:var(--gray,#888);cursor:pointer;text-decoration:underline;margin-left:4px}'+
    '#fg-tour-tip kbd{font-family:inherit;font-size:.7rem;background:rgba(128,128,128,.16);border-radius:4px;padding:1px 5px}';
  document.head.appendChild(st);
}
// Capítulos y pasos. target: selector o función → elemento. cond: si aplica al
// perfil. antes: deja la pantalla lista para que el elemento sea visible.
function _tourCapitulos(){
  var puedePad=_can('padron_buscar'),puedePegar=_can('pegar_oficial'),puedeNotas=_can('notas'),
      puedeAs=_can('asesores_guardados'),puedePromos=_can('promos_buscar'),varias=_facOptsDe('flyer').length>1,
      puedeRubros=_facOptsDe('rubros').length>0;
  function irIndividual(){closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('individual');}
  function irRubros(){closeUserMenu();if(typeof switchApp==='function')switchApp('rubros');if(typeof switchTab==='function')switchTab('individual');}
  function irMasivo(){closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('masivo');}
  function irHistorial(){closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('historial');}
  function irPromos(){closeUserMenu();if(typeof switchApp==='function')switchApp('promos');}
  return [
    {id:'flyer',titulo:'Armar un flyer',pasos:[
      {target:'#empresa',titulo:'Empez&aacute; por la empresa',
       texto:'Escrib&iacute; la raz&oacute;n social: el flyer de la derecha se actualiza al instante y el <strong>nombre del archivo</strong> se arma solo con ese nombre.'+(puedePad?' Si la empresa ya est&aacute; en tu base, mientras tipe&aacute;s te la sugiere.':''),
       antes:irIndividual},
      {target:'#fg-pad-btn',cond:puedePad,titulo:'La lupa: tus empresas',
       texto:'Busc&aacute; por <strong>raz&oacute;n social o CUIT</strong> y se completa todo de una: empresa, cashback y hasta 4 oficiales. Desde "Administrar" (o tu nombre &rarr; <strong>Base de datos</strong>) sub&iacute;s un Excel o las edit&aacute;s a mano.',
       antes:irIndividual},
      {target:function(){var b=_fgBlock(1);return b&&b.sec;},titulo:'Datos del oficial',
       texto:'Nombre, celular y mail del asesor que va al pie del flyer. Al escribir el nombre, el <strong>mail se sugiere solo</strong> (nombre.apellido@bancogalicia.com.ar); si es distinto, corregilo.'+(puedeAs?' <strong>Tocando este t&iacute;tulo</strong> eleg&iacute;s un asesor guardado y lo carg&aacute;s con un click.':''),
       antes:irIndividual},
      {target:'#fg-paste-btn-1',cond:puedePegar,titulo:'&#9889; Pegar: sin tipear nada',
       texto:'Copi&aacute; la firma de un mail o un mensaje con los datos del oficial y pegalo ac&aacute;: detecta <strong>nombre, celular y mail</strong> y los acomoda al formato correcto. Si algo no cierra, <em>Deshacer</em>.',
       antes:irIndividual},
      {target:'#fg-add-asesor',titulo:'Hasta 4 asesores',
       texto:'Agreg&aacute; un segundo, tercer o cuarto oficial: el flyer los acomoda solo (2 lado a lado, 3 en fila, 4 en dos filas). "&#10005; Quitar" lo saca sin borrar lo que escribiste.',
       antes:irIndividual},
      {target:'.cfg-btns',titulo:'Cashback',
       texto:'Eleg&iacute; la configuraci&oacute;n de montos que le corresponde a la empresa (<strong>BAU</strong> o <strong>Config 1 a 4</strong>). Los importes vigentes los carga el administrador; ac&aacute; solo eleg&iacute;s cu&aacute;l.',
       antes:irIndividual},
      {target:'#legal-text',titulo:'Texto legal',
       texto:'Viene precargado con los t&eacute;rminos del mes. Pod&eacute;s ajustar una fecha o un dato: lo que va entre <kbd>**dobles asteriscos**</kbd> sale en <strong>negrita</strong>. Si peg&aacute;s desde Word, la negrita se conserva sola.',
       antes:irIndividual},
      {target:'.zoom-bar',titulo:'Vista previa',
       texto:'Acerc&aacute; o alej&aacute; con <kbd>+</kbd> / <kbd>&minus;</kbd> (o la rueda del mouse) y <strong>arrastr&aacute;</strong> la imagen para recorrerla. Lo que ves ac&aacute; es exactamente lo que se descarga.',
       antes:irIndividual},
      {target:'.btns .btn.bp',titulo:'Descargar',
       texto:'<strong>Descargar PDF</strong> (o <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) lo guarda en tu equipo. <strong>Compartir</strong> abre el men&uacute; del celular o de Windows para mandar el PDF directo por WhatsApp, mail o Teams. En <em>Otros</em> est&aacute; la descarga como imagen (PNG). Todo queda en la solapa <em>Historial</em>.',
       antes:irIndividual},
      {target:'.btns .btn.bg',titulo:'Restaurar',
       texto:'Limpia empresa y asesores y vuelve el legal al texto guardado, para arrancar el pr&oacute;ximo flyer de cero.',
       antes:irIndividual}
    ]},
    {id:'masivo',titulo:'Masivo',pasos:[
      {target:'.template-btn',titulo:'Muchas empresas de una vez',
       texto:'Baj&aacute; la <strong>plantilla Excel</strong>: una fila por empresa (raz&oacute;n social, cashback y hasta 4 asesores). Es el mismo formato que us&aacute;s en <strong>Base de datos</strong>.',
       antes:irMasivo},
      {target:'#excel-drop',titulo:'Sub&iacute; el Excel y gener&aacute;',
       texto:'Arrastralo ac&aacute; o hac&eacute; click para elegirlo. Te muestra una vista previa y avisa si alguna fila tiene un problema (empresa vac&iacute;a, cashback que no reconoce). Despu&eacute;s, el bot&oacute;n <strong>&#9889; Generar ZIP</strong> arma <strong>un PDF por empresa</strong> y los baja todos juntos.',
       antes:irMasivo}
    ]},
    {id:'historial',titulo:'Historial',pasos:[
      {target:function(){return document.querySelectorAll('.tabs .tab')[2]||null;},titulo:'Lo que generaste en esta sesi&oacute;n',
       texto:'Cada flyer descargado queda listado ac&aacute;: pod&eacute;s <strong>volver a bajar el PDF</strong> o <strong>recargar</strong> sus datos en el formulario para retocarlo. Se vac&iacute;a al cerrar la pesta&ntilde;a del navegador.',
       antes:irHistorial}
    ]},
    {id:'menu',titulo:'Tu men&uacute;',pasos:[
      {target:'#hdr-dd-padron',cond:(puedePad||puedeAs),titulo:'Base de datos',
       texto:'Ac&aacute; viven <strong>tus empresas</strong> (sub&iacute; un Excel o editalas en l&iacute;nea, para que la lupa las encuentre) y <strong>tus asesores</strong> guardados (correg&iacute; un celular o un mail sin borrar y volver a cargar). Es <strong>privado</strong>: nadie m&aacute;s lo ve ni lo edita.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-notes',cond:puedeNotas,titulo:'Bloc de notas',
       texto:'Anotaciones r&aacute;pidas que quedan guardadas en este navegador, por si necesit&aacute;s tener algo a mano mientras arm&aacute;s flyers.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-theme',titulo:'Modo oscuro',
       texto:'Cambi&aacute; entre tema claro y oscuro. Se recuerda para la pr&oacute;xima vez.',antes:_tourAbrirMenu},
      {target:'#hdr-dd-pass',cond:!_adminNow(),titulo:'Cambiar mi clave',
       texto:'Cambi&aacute; tu contrase&ntilde;a cuando quieras (te pide la actual). Si la olvidaste, desde el login ped&iacute;s una nueva y el administrador la aprueba.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-tour',titulo:'Ver tutorial',
       texto:'Este recorrido queda siempre ac&aacute; para repasarlo cuando quieras.',antes:_tourAbrirMenu}
    ]},
    {id:'promos',titulo:'Promociones',cond:puedePromos,pasos:[
      {target:'#promos-marcas',titulo:'&iquest;Qu&eacute; marcas siguen vigentes?',
       texto:'Peg&aacute; la lista de marcas del flyer, <strong>una por l&iacute;nea</strong>. Se cruzan contra el buscador oficial de promociones de Galicia.',
       antes:irPromos},
      {target:'#promos-mes',titulo:'Mes a validar',
       texto:'El mes del flyer: una promo que vence dentro de ese mes se marca <em>"vence este mes"</em>, y una ya vencida, <em>"vencida"</em>.',
       antes:irPromos},
      {target:'#promos-validar-btn',titulo:'Validar vigencia',
       texto:'Devuelve una tabla con logo, nombre en Galicia, fechas desde/hasta y estado. Las dudosas quedan como <strong>Revisar</strong> con las opciones para elegir a mano; las que no est&aacute;n, como <strong>No encontrada</strong>. Con el bot&oacute;n <strong>Descargar Excel</strong> te llev&aacute;s el resultado con el logo de cada marca.',
       antes:irPromos}
    ]},
    {id:'opciones',titulo:'Opciones',cond:varias,pasos:[
      {target:'#fg-optbar',titulo:'Varios armadores',
       texto:'Cada opci&oacute;n tiene su propio flyer y su propio legal. Cambi&aacute;s ac&aacute; y todo lo dem&aacute;s (individual, masivo, historial) usa el flyer de esa opci&oacute;n. Los datos que cargaste no se pierden al cambiar.',
       antes:irIndividual}
    ]},
    {id:'rubros',titulo:'Flyer Rubros',cond:puedeRubros,pasos:[
      {target:'#apptab-rubros',titulo:'Flyers con beneficio exclusivo',
       texto:'El mismo armador, pero con los flyers que traen el cuadro <strong>&laquo;&iexcl;Beneficio exclusivo EMPRESA!&raquo;</strong> (combustible, supermercado...). Eleg&iacute;s el rubro en la barra de arriba del formulario.',
       antes:irRubros},
      {target:'#fg-benef-fields',titulo:'Nombre y tope del beneficio',
       texto:'El nombre del cartel se copia solo de la empresa (pod&eacute;s cambiarlo). El <strong>tope de reintegro</strong> lo escrib&iacute;s vos: &laquo;24000&raquo; sale como <strong>$24.000</strong>.',
       antes:irRubros}
    ]}
  ];
}
function _tourAbrirMenu(){
  if(typeof switchApp==='function')switchApp('flyer');
  var dd=document.getElementById('hdr-dropdown');
  if(dd&&!dd.classList.contains('open'))toggleUserMenu();
}
function _tourEl(t){
  if(!t)return null;
  var el=(typeof t==='function')?t():document.querySelector(t);
  if(!el)return null;
  var r=el.getBoundingClientRect();
  return (r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden')?el:null;
}
// Arma la lista plana de pasos aplicables (cond + elemento presente en el DOM,
// aunque esté en otra solapa: la visibilidad real se chequea al ir al paso).
function _tourPlan(){
  var caps=_tourCapitulos().filter(function(c){return c.cond!==false;});
  var pasos=[];
  caps.forEach(function(c){
    c.pasos.forEach(function(p){
      if(p.cond===false)return;
      var el=(typeof p.target==='function')?p.target():document.querySelector(p.target);
      if(!el)return;
      p.cap=c.id;pasos.push(p);
    });
  });
  return {caps:caps.filter(function(c){return pasos.some(function(p){return p.cap===c.id;});}),pasos:pasos};
}
function _tourStart(capId){
  if(!_me){showToast('Ingresá primero para ver el tutorial');return;}
  _tourEnd(true);
  var plan=_tourPlan();
  if(!plan.pasos.length){showToast('No hay nada para mostrar');return;}
  _tourStyle();
  var ov=document.createElement('div');ov.id='fg-tour-ov';document.body.appendChild(ov);
  var hl=document.createElement('div');hl.id='fg-tour-hl';document.body.appendChild(hl);
  var tip=document.createElement('div');tip.id='fg-tour-tip';document.body.appendChild(tip);
  _tour={caps:plan.caps,pasos:plan.pasos,i:0};
  var i0=0;
  if(capId){for(var k=0;k<plan.pasos.length;k++)if(plan.pasos[k].cap===capId){i0=k;break;}}
  document.addEventListener('keydown',_tourTecla);
  window.addEventListener('resize',_tourPos);
  window.addEventListener('scroll',_tourPos,true);
  _tourGo(i0);
}
function _tourTecla(e){
  if(!_tour)return;
  if(e.key==='Escape'){e.preventDefault();_tourEnd();}
  else if(e.key==='ArrowRight'){e.preventDefault();_tourNext();}
  else if(e.key==='ArrowLeft'){e.preventDefault();_tourPrev();}
}
function _tourNext(){if(!_tour)return;if(_tour.i>=_tour.pasos.length-1){_tourEnd();return;}_tourGo(_tour.i+1);}
function _tourPrev(){if(!_tour||_tour.i<=0)return;_tourGo(_tour.i-1);}
// Salta al primer paso del capítulo siguiente (o termina si era el último).
function _tourSaltarCap(){
  if(!_tour)return;
  var cap=_tour.pasos[_tour.i].cap;
  for(var k=_tour.i+1;k<_tour.pasos.length;k++)if(_tour.pasos[k].cap!==cap){_tourGo(k);return;}
  _tourEnd();
}
function _tourIrCap(capId){
  if(!_tour)return;
  for(var k=0;k<_tour.pasos.length;k++)if(_tour.pasos[k].cap===capId){_tourGo(k);return;}
}
function _tourGo(i){
  if(!_tour)return;
  var p=_tour.pasos[i];if(!p){_tourEnd();return;}
  _tour.i=i;
  try{if(p.antes)p.antes();}catch(e){console.warn('tour antes():',e);}
  // si con la pantalla preparada el elemento sigue sin verse, se saltea el paso
  var el=_tourEl(p.target);
  if(!el){
    _tour.pasos.splice(i,1);
    if(!_tour.pasos.length){_tourEnd();return;}
    _tourGo(Math.min(i,_tour.pasos.length-1));return;
  }
  if(el.scrollIntoView)try{el.scrollIntoView({block:'center',inline:'nearest'});}catch(e){}
  var tip=document.getElementById('fg-tour-tip');if(!tip)return;
  var n=i+1,tot=_tour.pasos.length;
  tip.innerHTML=
    '<span class="ft-x" onclick="_tourEnd()" title="Cerrar (Esc)">&#10005;</span>'+
    '<div class="ft-caps">'+_tour.caps.map(function(c){
      return '<span class="ft-cap'+(c.id===p.cap?' on':'')+'" onclick="_tourIrCap(\''+c.id+'\')">'+c.titulo+'</span>';
    }).join('')+'</div>'+
    '<h4>'+p.titulo+'</h4><p>'+p.texto+'</p>'+
    '<div class="ft-foot"><span class="ft-n">'+n+' / '+tot+'</span>'+
      '<button type="button" class="ft-btn" onclick="_tourPrev()"'+(i===0?' disabled':'')+'>&larr; Anterior</button>'+
      '<button type="button" class="ft-btn main" onclick="_tourNext()">'+(i===tot-1?'Terminar &#10003;':'Siguiente &rarr;')+'</button>'+
      (_tour.caps.length>1&&i<tot-1?'<span class="ft-skip" onclick="_tourSaltarCap()">Omitir cap&iacute;tulo</span>':'')+
    '</div><div class="ft-arrow"></div>';
  _tourPos();
  // el cambio de solapa/scroll puede reacomodar el layout un frame después
  requestAnimationFrame(function(){_tourPos();setTimeout(_tourPos,250);});
}
// Ubica el spotlight sobre el elemento y el globo al costado que mejor entre,
// con la flecha apuntando al elemento.
function _tourPos(){
  if(!_tour)return;
  var p=_tour.pasos[_tour.i];var el=_tourEl(p&&p.target);
  var hl=document.getElementById('fg-tour-hl'),tip=document.getElementById('fg-tour-tip');
  if(!el||!hl||!tip)return;
  var r=el.getBoundingClientRect(),m=6;
  hl.style.top=(r.top-m)+'px';hl.style.left=(r.left-m)+'px';
  hl.style.width=(r.width+2*m)+'px';hl.style.height=(r.height+2*m)+'px';
  // agujero en el overlay: rectángulo exterior + rectángulo del elemento (evenodd)
  var ov=document.getElementById('fg-tour-ov');
  if(ov){
    var x1=Math.round(r.left-m),y1=Math.round(r.top-m),x2=Math.round(r.right+m),y2=Math.round(r.bottom+m);
    ov.style.clipPath='polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, '+
      x1+'px '+y1+'px, '+x1+'px '+y2+'px, '+x2+'px '+y2+'px, '+x2+'px '+y1+'px, '+x1+'px '+y1+'px)';
  }
  var W=window.innerWidth,H=window.innerHeight,tw=tip.offsetWidth,th=tip.offsetHeight,gap=16;
  var side,top,left;
  if(r.right+gap+tw<=W-10)side='right';
  else if(r.left-gap-tw>=10)side='left';
  else if(r.bottom+gap+th<=H-10)side='bottom';
  else side='top';
  if(side==='right'||side==='left'){
    left=side==='right'?r.right+gap:r.left-gap-tw;
    top=Math.max(10,Math.min(H-th-10,r.top+r.height/2-th/2));
  }else{
    top=side==='bottom'?r.bottom+gap:r.top-gap-th;
    left=Math.max(10,Math.min(W-tw-10,r.left+r.width/2-tw/2));
  }
  tip.style.top=top+'px';tip.style.left=left+'px';
  // flecha: en el borde del globo que mira al elemento, alineada con su centro
  var a=tip.querySelector('.ft-arrow');if(!a)return;
  var cx=r.left+r.width/2-left,cy=r.top+r.height/2-top;
  a.style.top='';a.style.left='';a.style.right='';a.style.bottom='';
  if(side==='right'){a.style.left='-8px';a.style.top=Math.max(12,Math.min(th-24,cy-8))+'px';}
  else if(side==='left'){a.style.right='-8px';a.style.top=Math.max(12,Math.min(th-24,cy-8))+'px';}
  else if(side==='bottom'){a.style.top='-8px';a.style.left=Math.max(12,Math.min(tw-24,cx-8))+'px';}
  else{a.style.bottom='-8px';a.style.left=Math.max(12,Math.min(tw-24,cx-8))+'px';}
}
// silencioso=true: reinicio interno (no marca visto ni restaura la pantalla)
function _tourEnd(silencioso){
  ['fg-tour-ov','fg-tour-hl','fg-tour-tip'].forEach(function(id){var e=document.getElementById(id);if(e&&e.parentNode)e.parentNode.removeChild(e);});
  document.removeEventListener('keydown',_tourTecla);
  window.removeEventListener('resize',_tourPos);
  window.removeEventListener('scroll',_tourPos,true);
  var habia=!!_tour;_tour=null;
  if(silencioso||!habia)return;
  _tourMarcarVisto();
  closeUserMenu();
  if(typeof switchApp==='function')switchApp('flyer');
  if(typeof switchTab==='function')switchTab('individual');
}
// Arranque automático al primer ingreso: sólo si el perfil tiene la facultad
// tutorial_auto (el admin la prende por rol), nunca para el admin ni durante la
// vista previa de otro perfil, y una sola vez por cuenta y navegador.
function _tourAutoStart(){
  if(_adminNow()||_simRole||!_can('tutorial_auto')||_tourYaVisto())return;
  setTimeout(function(){if(_me&&!_tour)_tourStart();},900);
}

// ── CONFIG → OPCIONES: alta/baja/nombre/color de los armadores ────────────────
// Trabaja sobre una copia (_opcEdit) y recién al tocar "Guardar cambios" sube
// _opciones.json y rearma todo lo que depende de la lista: matriz de
// facultades (fila opcion_N), barra del armador, sub-solapas de Legales, etc.
var _opcEdit=null,_opcActivos={};
function _opcStyle(){
  if(document.getElementById('opc-style'))return;
  var st=document.createElement('style');st.id='opc-style';
  st.textContent=
    '.opc-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border,#e5e5e5);border-radius:10px;margin-bottom:8px;flex-wrap:wrap}'+
    'html.dark .opc-row{border-color:#3a3e46}'+
    '.opc-num{width:34px;height:34px;border-radius:9px;color:#fff;font-family:"Syne",sans-serif;font-weight:800;font-size:.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}'+
    '.opc-row input[type=text]{flex:1;min-width:160px;border:1.5px solid var(--border,#ddd);border-radius:8px;padding:8px 10px;font-size:.84rem;font-family:inherit;background:none;color:inherit;outline:none}'+
    '.opc-row input[type=text]:focus{border-color:var(--red,#c62828)}'+
    'html.dark .opc-row input[type=text]{border-color:#3a3e46}'+
    '.opc-row input[type=color]{width:38px;height:34px;border:1.5px solid var(--border,#ddd);border-radius:8px;padding:2px;background:none;cursor:pointer}'+
    '.opc-row .opc-sol{height:34px;border:1.5px solid var(--border,#ddd);border-radius:8px;padding:0 8px;font-size:.76rem;font-family:inherit;background:none;color:inherit;cursor:pointer}'+
    '.opc-row .opc-sol:disabled{opacity:.6;cursor:default}'+
    'html.dark .opc-row .opc-sol{border-color:#3a3e46;background:#22242a}'+
    '.opc-est{font-size:.68rem;color:var(--gray,#888);flex-basis:100%;padding-left:44px}'+
    '.opc-est b{color:var(--green,#1a9c50)}';
  document.head.appendChild(st);
}
function renderOpcionesAdmin(force){
  _opcStyle();
  var host=document.getElementById('opciones-list');if(!host)return;
  if(force||!_opcEdit){
    host.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Cargando...</p>';
    loadOpciones(!!force,function(){
      _opcEdit=_opcListaActual();
      _opcPintar();
      // qué tiene cada una (flyer activo o no), para que quitar sea con información
      _opcEdit.forEach(function(o){
        _fetchActiveMeta(o.n,function(d){_opcActivos[o.n]=d&&d.imageUrl?(d.name||'flyer activo'):'';_opcPintarEstado(o.n);});
      });
    });
    return;
  }
  _opcPintar();
}
function _opcPintar(){
  var host=document.getElementById('opciones-list');if(!host||!_opcEdit)return;
  host.innerHTML=_opcEdit.map(function(o,i){
    return '<div class="opc-row" data-n="'+o.n+'">'+
      '<div class="opc-num" style="background:'+_escHtml(o.color)+'">'+o.n+'</div>'+
      '<input type="text" maxlength="40" value="'+_escHtml(o.nombre)+'" placeholder="Nombre de la opci&oacute;n" oninput="_opcSet('+i+',\'nombre\',this.value)">'+
      '<input type="color" value="'+_escHtml(o.color)+'" title="Color" oninput="_opcSet('+i+',\'color\',this.value)">'+
      // Solapa del header en la que vive la opción. La 1 es siempre Flyer Galicia.
      '<select class="opc-sol" title="En qu&eacute; solapa del header aparece" onchange="_opcSet('+i+',\'solapa\',this.value)"'+(o.n===1?' disabled':'')+'>'+
        _OPC_SOLAPAS.map(function(s){return '<option value="'+s+'"'+(o.solapa===s?' selected':'')+'>'+_escHtml(_solapaLabel(s))+'</option>';}).join('')+
      '</select>'+
      (o.n===1?'<span style="font-size:.66rem;color:var(--gray)">La de todos los asesores</span>':
        '<button type="button" class="usr-btn warn" onclick="_opcQuitar('+i+')">Quitar</button>')+
      '<div class="opc-est" id="opc-est-'+o.n+'"></div>'+
    '</div>';
  }).join('');
  _opcEdit.forEach(function(o){_opcPintarEstado(o.n);});
}
function _opcPintarEstado(n){
  var el=document.getElementById('opc-est-'+n);if(!el)return;
  var a=_opcActivos[n];
  if(a===undefined){el.innerHTML='';return;}
  el.innerHTML=a?('Flyer activo: <b>'+_escHtml(a)+'</b>'):'Sin flyer activo todav&iacute;a (se sube desde Config &rarr; Flyer).';
}
function _opcSet(i,k,v){
  if(!_opcEdit||!_opcEdit[i])return;
  _opcEdit[i][k]=v;
  if(k==='color'){var row=document.querySelector('.opc-row[data-n="'+_opcEdit[i].n+'"] .opc-num');if(row)row.style.background=v;}
}
function _opcAgregar(){
  if(!_opcEdit)return;
  var max=_opcEdit.reduce(function(m,o){return Math.max(m,o.n);},0);
  var n=max+1;
  _opcEdit.push({n:n,nombre:'Opción '+n,color:_OPC_PALETA[(n-1)%_OPC_PALETA.length],solapa:'flyer'});
  _opcActivos[n]=_opcActivos[n]||'';
  _opcPintar();
  var inp=document.querySelector('.opc-row[data-n="'+n+'"] input[type=text]');if(inp){inp.focus();inp.select();}
}
function _opcQuitar(i){
  var o=_opcEdit&&_opcEdit[i];if(!o||o.n===1)return;
  var msg='¿Quitar "'+o.nombre+'"?\n\nDeja de verse para todos los perfiles. Su flyer y su legal quedan guardados por si la volvés a agregar con el mismo número ('+o.n+').';
  if(_opcActivos[o.n])msg+='\n\nOjo: hoy tiene un flyer activo ('+_opcActivos[o.n]+').';
  fgConfirm(msg,{ok:'Quitar'},function(si){
    if(!si||!_opcEdit||_opcEdit[i]!==o)return;
    _opcEdit.splice(i,1);
    _opcPintar();
  });
}
function _opcGuardar(){
  if(!_opcEdit)return;
  var btn=document.getElementById('opciones-save');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  var antes=_FG_OPTS.slice();
  saveOpciones(_opcEdit,function(ok){
    if(btn){btn.disabled=false;btn.textContent='Guardar cambios';}
    if(!ok)return;
    // Todo lo que se deriva de la lista se rearma acá mismo (sin recargar):
    _FAC=_facMerge(_FAC);            // aparece/desaparece la fila opcion_N
    if(document.getElementById('fac-grid')&&document.getElementById('at-facultades').style.display!=='none')renderFacultades();
    _legalesRender();                // sub-solapas de Legales
    _fgSyncVista();                  // la opción activa pudo cambiar de solapa
    _applyFacultades();              // barra del armador (salta de una opción quitada) + solapa "Flyer Rubros" del header
    _opcEdit=_opcListaActual();
    _opcPintar();
    var nuevas=_FG_OPTS.filter(function(n){return antes.indexOf(n)<0;});
    showToast(nuevas.length
      ?('Opciones guardadas. Para que un perfil vea la nueva, habilitala en Admin → Facultades.')
      :'Opciones guardadas');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MEJORAS UX (2026-09): trabajo guardado, validación en línea, compartir,
// teclado, negrita del legal y diálogos propios. Todo es frontend puro.
// ══════════════════════════════════════════════════════════════════════════════

// ── TRABAJO GUARDADO: historial persistente + borrador automático ─────────────
// Gateado por la facultad "guardar_trabajo" (Admin → Facultades). Vive en el
// navegador del usuario (localStorage, por cuenta): nada sube a la nube. Sin la
// facultad, el historial sigue como siempre (sólo mientras dura la pestaña).
var _fgWorkOn=false,_fgWorkTid=null,_fgWorkLast='',_fgWorkOffered=false,_fgDraftPending=false;
function _fgWorkKey(k){return 'fg_'+k+'_'+(_me?_me.id:'anon');}
function _fgWorkApply(on){
  on=!!on;
  var antes=_fgWorkOn;_fgWorkOn=on;
  if(on&&!antes)_fgWorkLoadHist();
  if(!on){_fgDraftBannerHide();_fgDraftPending=false;return;}
  _fgWorkOffer(); // idempotente: ofrece el borrador una sola vez, con la app visible
}
// Historial: lo guardado se suma a lo de esta sesión (sin duplicar) y se recorta al tope.
function _fgWorkLoadHist(){
  var arr=null;
  try{arr=JSON.parse(localStorage.getItem(_fgWorkKey('hist'))||'null');}catch(e){}
  if(!Array.isArray(arr)||!arr.length)return;
  var vistos={},out=[];
  [].concat(flyerHistory||[],arr).forEach(function(h){
    if(!h||!h.v)return;
    var k=(h.ts||'')+'|'+(h.fn||'');
    if(h.ts&&vistos[k])return;vistos[k]=1;out.push(h);
  });
  out.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  flyerHistory=out.slice(0,_fgHistMax());
  var th=document.getElementById('tab-historial');
  if(th&&th.classList.contains('active')&&typeof renderHistory==='function')renderHistory();
}
function _fgWorkSaveHist(){
  if(!_fgWorkOn)return;
  var lista=(flyerHistory||[]).map(function(h){return {v:h.v,fn:h.fn,thumb:h.thumb,hora:h.hora,ts:h.ts,ac:h.ac,opt:h.opt};});
  try{localStorage.setItem(_fgWorkKey('hist'),JSON.stringify(lista));}
  catch(e){ // sin lugar: guardo menos ítems antes que nada
    try{localStorage.setItem(_fgWorkKey('hist'),JSON.stringify(lista.slice(0,5)));}catch(e2){}
  }
}
// Borrador: exactamente la forma de un ítem del historial ({v,ac,opt}) + nombre de archivo.
function _fgDraftSnapshot(){
  if(typeof getVals!=='function')return null;
  var v;try{v=getVals();}catch(e){return null;}
  var n=_optN(_fgOpt),c=_fgOptCache[n];
  // El legal sólo viaja si es una edición propia (difiere del guardado de la opción):
  // así un borrador viejo nunca pisa un legal que el admin actualizó después.
  if(!(c&&typeof c.legal==='string'&&v.legal!==c.legal))delete v.legal;
  return {v:v,ac:(typeof ac!=='undefined'?ac:0),opt:n,
    filename:_gv('filename'),filenameManual:!!window.filenameManual,ts:Date.now()};
}
function _fgDraftVale(d){
  if(!d||!d.v)return false;
  var v=d.v;
  return !!((v.empresa||'').trim()||typeof v.legal==='string'||(v.nombre2||'').trim()||(v.nombre3||'').trim()||(v.nombre4||'').trim()||(v.benefNombre||'').trim());
}
function _fgDraftSaveNow(){
  if(!_fgWorkOn||_fgDraftPending)return;
  var d=_fgDraftSnapshot();if(!d)return;
  var firma=JSON.stringify([d.v,d.ac,d.opt,d.filename]);
  if(firma===_fgWorkLast)return;
  _fgWorkLast=firma;
  try{localStorage.setItem(_fgWorkKey('draft'),JSON.stringify(d));}catch(e){}
}
function _fgDraftSaveSoon(){
  if(!_fgWorkOn)return;
  clearTimeout(_fgWorkTid);_fgWorkTid=setTimeout(_fgDraftSaveNow,700);
}
function _fgDraftClear(){
  _fgWorkLast='';
  try{localStorage.removeItem(_fgWorkKey('draft'));}catch(e){}
}
function _fgDraftLeer(){
  try{var d=JSON.parse(localStorage.getItem(_fgWorkKey('draft'))||'null');return _fgDraftVale(d)?d:null;}catch(e){return null;}
}
// Con la app visible: si hay un borrador con contenido, aviso arriba del formulario.
function _fgWorkOffer(){
  if(_fgWorkOffered)return;
  var lay=document.getElementById('layout');if(!lay||lay.style.display==='none')return;
  _fgWorkOffered=true;
  var d=_fgDraftLeer();if(!d)return;
  _fgDraftPending=true;
  var tab=document.getElementById('tab-individual');if(!tab)return;
  var b=document.createElement('div');b.id='fg-draft';b.className='fg-draft';
  var que=(d.v.empresa||'').trim()?'<strong>'+_escHtml(d.v.empresa.trim())+'</strong>':'un flyer sin empresa';
  b.innerHTML='<span>Ten&eacute;s un flyer a medio armar: '+que+' &middot; '+_escHtml(_fgHistWhen({ts:d.ts,hora:_fgHoraDe(d.ts)}))+'</span>'+
    '<div class="fg-draft-acts"><button type="button" class="btn bp" onclick="_fgDraftSeguir()">Seguir con ese</button>'+
    '<button type="button" class="btn bg" onclick="_fgDraftDescartar()">Descartar</button></div>';
  tab.insertBefore(b,tab.firstChild);
}
function _fgHoraDe(ts){var d=new Date(ts||Date.now());return d.getHours()+':'+String(d.getMinutes()).padStart(2,'0');}
function _fgDraftBannerHide(){var b=document.getElementById('fg-draft');if(b)b.remove();}
function _fgDraftSeguir(){
  var d=_fgDraftLeer();_fgDraftBannerHide();
  if(!d){_fgDraftPending=false;return;}
  // Mientras se carga la opción del borrador (puede tardar), ningún guardado
  // automático debe pisarlo con el formulario todavía vacío: sigue "pendiente".
  _fgDraftPending=true;
  _fgWithOpt(d.opt||1,function(){
    _fgApplyHistItem(d); // la opción ya es la activa: se aplica en el acto
    var s=function(id,val){var e=document.getElementById(id);if(e)e.value=val;};
    if(d.filename){s('filename',d.filename);window.filenameManual=!!d.filenameManual;}
    // La edición del legal queda registrada como tal para que, si el legal global
    // llega después, no la pise (misma regla que al cambiar de opción).
    if(typeof d.v.legal==='string'){var c=_fgOptCache[_optN(d.opt||1)];if(c)c.legalEdited=d.v.legal;}
    if(typeof updateFnPreview==='function')updateFnPreview();
    _fgValTodos();
    _fgDraftPending=false;_fgWorkLast='';_fgDraftSaveNow();
  });
}
function _fgDraftDescartar(){_fgDraftBannerHide();_fgDraftPending=false;_fgDraftClear();showToast('Borrador descartado');}
function _fgWorkInit(){
  var tab=document.getElementById('tab-individual');if(!tab)return;
  ['input','change','click'].forEach(function(ev){
    tab.addEventListener(ev,function(e){
      if(_fgDraftPending&&(ev==='input'||ev==='change')){ // empezó otro flyer: el aviso ya no aplica
        var b=document.getElementById('fg-draft');if(b&&!b.contains(e.target)){_fgDraftBannerHide();_fgDraftPending=false;}
      }
      _fgDraftSaveSoon();
    });
  });
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')_fgDraftSaveNow();});
  window.addEventListener('pagehide',_fgDraftSaveNow);
  // Restaurar arranca de cero: también limpia el borrador. Borrar del historial: se persiste.
  var oReset=window.resetVals;
  window.resetVals=function(){var r=oReset.apply(this,arguments);_fgDraftClear();_fgValTodos();return r;};
  var oDel=window.delHistory;
  if(typeof oDel==='function')window.delHistory=function(){var r=oDel.apply(this,arguments);_fgWorkSaveHist();return r;};
}

// ── VALIDACIÓN EN LÍNEA: celular y mail (marca, no bloquea) ──────────────────
function _fgValCel(txt){
  var t=String(txt||'').trim();if(!t)return null;
  var dig=t.replace(/\D/g,'');
  if(dig.length<8)return {tipo:'inv',msg:'Faltan números: un celular tiene 10 dígitos con el código de área (ej.: 11 3617 9603).'};
  var tel=_fgPartirTel(dig);
  if(!tel)return {tipo:'inv',msg:'No parece un celular argentino. Probá con código de área + número (ej.: 11 3617 9603).'};
  return null;
}
function _fgValMail(txt){
  var t=String(txt||'').trim();if(!t)return null;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(t))return {tipo:'inv',msg:'No parece un mail válido (falta el @ o el dominio).'};
  if(!/@bancogalicia\.com\.ar$/i.test(t))return {tipo:'warn',msg:'Ojo: no es un mail @bancogalicia.com.ar.'};
  return null;
}
function _fgValField(inp){
  if(!inp)return null;
  var f=inp.closest?inp.closest('.field'):inp.parentNode;if(!f)return null;
  var r=/^celular/.test(inp.id)?_fgValCel(inp.value):_fgValMail(inp.value);
  var m=f.querySelector('.fg-field-msg');
  if(!m){m=document.createElement('div');m.className='fg-field-msg';m.setAttribute('role','status');f.appendChild(m);}
  f.classList.toggle('fg-inv',!!(r&&r.tipo==='inv'));
  f.classList.toggle('fg-warn',!!(r&&r.tipo==='warn'));
  m.textContent=r?r.msg:'';
  inp.setAttribute('aria-invalid',(r&&r.tipo==='inv')?'true':'false');
  return r;
}
function _fgValInputs(){
  var out=[];
  [1,2,3,4].forEach(function(k){var s=k===1?'':String(k);['celular'+s,'email'+s].forEach(function(id){var e=document.getElementById(id);if(e)out.push(e);});});
  return out;
}
function _fgValTodos(){_fgValInputs().forEach(_fgValField);}
// Resumen para el aviso al generar: sólo asesores que van al flyer y sólo errores (no avisos).
function _fgValProblemas(){
  var p=[];
  [1,2,3,4].forEach(function(k){
    if(!_fgAsesorOn(k))return;
    var s=k===1?'':String(k);
    var n=(_gv('nombre'+s)||'').trim();if(!n)return;
    var c=_fgValCel(_gv('celular'+s)),m=_fgValMail(_gv('email'+s));
    if(c&&c.tipo==='inv')p.push('el celular de '+n);
    if(m&&m.tipo==='inv')p.push('el mail de '+n);
  });
  return p;
}
function _fgValAvisar(){
  var p=_fgValProblemas();if(!p.length)return false;
  _fgValTodos();
  _fgToastLargo('Ojo: revisá '+p.join(' y ')+' (se generó igual).',6000);
  return true;
}
function _fgToastLargo(msg,ms){
  showToast(msg);
  var t=document.getElementById('toast-el');if(!t)return;
  clearTimeout(t._tid);t._tid=setTimeout(function(){t.classList.remove('show');},ms||6000);
}
function _fgValInit(){
  _fgValInputs().forEach(function(inp){
    inp.addEventListener('input',function(){_fgValField(inp);});
    inp.addEventListener('blur',function(){_fgValField(inp);});
  });
  // Al generar: marca los campos y avisa, pero deja generar (decisión de producto).
  var oPDF=window.dlPDF;
  window.dlPDF=function(){var r=oPDF.apply(this,arguments);setTimeout(_fgValAvisar,1300);return r;};
  var oPNG=window.dlPNG;
  window.dlPNG=function(){var r=oPNG.apply(this,arguments);setTimeout(_fgValAvisar,1300);return r;};
}

// ── COMPARTIR ────────────────────────────────────────────────────────────────
// Abre el menú de compartir del dispositivo (WhatsApp, mail, Teams...) SIEMPRE
// con el PDF: el asesor manda PDFs, no imágenes. Si el navegador no sabe
// compartir un archivo PDF (Firefox, Chrome viejo), el botón directamente no se
// muestra: nada de copiar imágenes ni descargas "de consuelo". Queda registrado
// como "compartir".
function _fgPuedeCompartirPdf(){
  try{
    if(!navigator.share||!navigator.canShare||typeof File==='undefined')return false;
    return navigator.canShare({files:[new File(['%PDF-1.4'],'flyer.pdf',{type:'application/pdf'})]});
  }catch(e){return false;}
}
function _fgShareInit(){
  var ok=_fgPuedeCompartirPdf();
  var b=document.getElementById('btn-share');if(b)b.style.display=ok?'':'none';
  var m=document.getElementById('modal-share');if(m)m.style.display=ok?'':'none';
}
function fgCompartir(){
  if(typeof getVals!=='function'||typeof fullRes!=='function')return;
  var v=getVals();
  _fgCompartirCanvas(fullRes(v),v);
}
function modalCompartir(){
  if(!window.modalCanvas)return;
  var v=getVals();closeModal();
  _fgCompartirCanvas(window.modalCanvas,v);
}
function _fgBusy(btn,on){
  if(!btn)return;
  if(on){if(!btn.dataset.fgHtml)btn.dataset.fgHtml=btn.innerHTML;btn.classList.add('fg-busy');btn.textContent='Un momento…';}
  else{if(btn.dataset.fgHtml)btn.innerHTML=btn.dataset.fgHtml;btn.classList.remove('fg-busy');}
}
function _fgPdfFile(fc,fn){
  var jsPDF=window.jspdf.jsPDF,pw=210,ph=(fc.height/fc.width)*pw;
  var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
  pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
  return new File([pdf.output('blob')],fn+'.pdf',{type:'application/pdf'});
}
function _fgCompartirCanvas(fc,v,force){
  if(!force&&typeof _padCheckRubro==='function'&&_padCheckRubro(_padFilaActual(),'descarga',function(){_fgCompartirCanvas(fc,v,true);}))return;
  if(!_fgPuedeCompartirPdf()){showToast('Este navegador no permite compartir archivos. Usá Descargar PDF.');return;}
  var fn=buildFn(_gv('filename'),v);
  var btn=document.getElementById('btn-share');_fgBusy(btn,true);
  var listo=false;
  function fin(ok,msg){
    if(listo)return;listo=true;
    _fgBusy(btn,false);
    if(msg)_fgToastLargo(msg,ok?4000:5000);
    if(ok){addHistory(v,fn,fc);logFlyerToSupabase(v,fn,'compartir');if(typeof _padAfterFlyer==='function')_padAfterFlyer();setTimeout(_fgValAvisar,1200);}
  }
  function compartir(){
    var file;
    try{file=_fgPdfFile(fc,fn);}catch(e){fin(false,'No se pudo armar el PDF. Probá con Descargar PDF.');return;}
    navigator.share({files:[file],title:fn}).then(function(){fin(true,'Flyer compartido');})
      .catch(function(e){
        if(e&&e.name==='AbortError'){fin(false,'');return;} // cerró el menú: no es un error
        // NotAllowedError = se perdió el "gesto" del click (pasó demasiado tiempo cargando)
        fin(false,(e&&e.name==='NotAllowedError')?'Tocá Compartir de nuevo (ya está todo listo).':'No se pudo abrir el menú de compartir. Usá Descargar PDF.');
      });
  }
  // jsPDF se precarga después del login; si todavía no está, la traigo y comparto.
  if(typeof _libReady==='function'&&!_libReady('jspdf')){
    _lib(['jspdf']).then(compartir).catch(function(){fin(false,'No se pudo cargar la librería del PDF. Revisá la conexión.');});
    return;
  }
  compartir();
}
// "Otros ▾" debajo de los botones: acciones de poco uso (PNG).
function fgToggleOtros(force){
  var tg=document.querySelector('#fg-otros .fg-otros-tg'),m=document.getElementById('fg-otros-menu');if(!tg||!m)return;
  var abrir=(force===undefined)?m.hidden:!!force;
  m.hidden=!abrir;tg.setAttribute('aria-expanded',abrir?'true':'false');
}

// ── NEGRITA DEL LEGAL: botón B / Ctrl+B ──────────────────────────────────────
// El flyer entiende **texto** como negrita. El botón pone o saca los asteriscos
// por vos: se ven en el cuadro (son la marca), nunca en el flyer.
function fgLegalBold(){
  var ta=document.getElementById('legal-text');if(!ta)return;
  var val=ta.value,s=ta.selectionStart,e=ta.selectionEnd;
  if(s===e){ // sin selección: la palabra bajo el cursor
    var a=s,b=s;
    while(a>0&&/\S/.test(val.charAt(a-1)))a--;
    while(b<val.length&&/\S/.test(val.charAt(b)))b++;
    s=a;e=b;
    if(s===e){showToast('Seleccioná el texto que querés en negrita');ta.focus();return;}
  }
  while(s<e&&/\s/.test(val.charAt(s)))s++;
  while(e>s&&/\s/.test(val.charAt(e-1)))e--;
  var sel=val.slice(s,e),ns,ne;
  if(sel.length>=4&&sel.slice(0,2)==='**'&&sel.slice(-2)==='**'){ // seleccionó con los asteriscos: saco
    ta.value=val.slice(0,s)+sel.slice(2,-2)+val.slice(e);ns=s;ne=e-4;
  }else if(val.slice(Math.max(0,s-2),s)==='**'&&val.slice(e,e+2)==='**'){ // ya estaba en negrita: saco
    ta.value=val.slice(0,s-2)+sel+val.slice(e+2);ns=s-2;ne=e-2;
  }else{ // pongo (sacando marcas sueltas que hubiera adentro para no anidar)
    var limpio=sel.replace(/\*\*/g,'');
    ta.value=val.slice(0,s)+'**'+limpio+'**'+val.slice(e);ns=s+2;ne=s+2+limpio.length;
  }
  ta.focus();try{ta.setSelectionRange(ns,ne);}catch(x){}
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  _fgLegalBoldState();
}
// El botón B se "prende" cuando el cursor está dentro de un tramo en negrita.
function _fgLegalBoldState(){
  var ta=document.getElementById('legal-text'),b=document.querySelector('.fg-legal-b');if(!ta||!b)return;
  var antes=ta.value.slice(0,ta.selectionStart);
  var n=(antes.match(/\*\*/g)||[]).length;
  b.classList.toggle('on',n%2===1);
}
function _fgLegalInit(){
  var ta=document.getElementById('legal-text');if(!ta)return;
  ta.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='b'||e.key==='B')){e.preventDefault();fgLegalBold();}
  });
  ['keyup','click','select'].forEach(function(ev){ta.addEventListener(ev,_fgLegalBoldState);});
}

// ── TECLADO Y ACCESIBILIDAD ──────────────────────────────────────────────────
// Solapas con Tab/Enter/flechas, Ctrl+Enter descarga el PDF, Esc cierra la vista
// previa y el menú "Otros". Los switches y las etiquetas del nombre de archivo
// también responden a Enter/Espacio.
function _fgHayDialogo(){
  if(document.getElementById('fg-cf-ov'))return true;
  var m=document.getElementById('modal');if(m&&m.classList.contains('show'))return true;
  var ap=document.getElementById('admin-panel');if(ap&&ap.style.display&&ap.style.display!=='none')return true;
  var lo=document.getElementById('login-ov');if(lo&&lo.style.display!=='none')return true;
  var cm=document.getElementById('cal-modal');if(cm&&cm.classList.contains('show'))return true;
  var ids=['pass-modal','notes-modal','user-modal','pad-mine-ov'];
  for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el&&el.style.display&&el.style.display!=='none')return true;}
  return false;
}
function _fgArmadorVisible(){
  var lay=document.getElementById('layout'),ti=document.getElementById('tab-individual');
  return !!(lay&&lay.style.display!=='none'&&ti&&ti.classList.contains('active'));
}
function _fgKbdInit(){
  // Solapas del panel: aria-selected/tabindex al cambiar (switchTab lo trae el template)
  var oSwitch=window.switchTab;
  if(typeof oSwitch==='function')window.switchTab=function(t){
    var r=oSwitch.apply(this,arguments);
    var tabs=document.querySelectorAll('.tabs .tab');
    Array.prototype.forEach.call(tabs,function(el){var on=el.classList.contains('active');el.setAttribute('aria-selected',on?'true':'false');el.setAttribute('tabindex',on?'0':'-1');});
    return r;
  };
  // Elementos clickeables que no son botones: que se puedan enfocar y activar
  Array.prototype.forEach.call(document.querySelectorAll('.toggle-row,.ftag,.app-tab'),function(el){
    if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');
    if(!el.hasAttribute('role'))el.setAttribute('role',el.classList.contains('app-tab')?'tab':'button');
  });
  document.addEventListener('keydown',function(e){
    var t=e.target;
    if(t&&t.classList){
      if(t.classList.contains('tab')&&t.getAttribute('role')==='tab'){
        var tabs=Array.prototype.slice.call(t.parentNode.querySelectorAll('.tab')),i=tabs.indexOf(t);
        if(e.key==='Enter'||e.key===' '){e.preventDefault();t.click();return;}
        if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var j=(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[j].focus();tabs[j].click();return;}
      }
      if((t.classList.contains('toggle-row')||t.classList.contains('ftag')||t.classList.contains('app-tab'))&&(e.key==='Enter'||e.key===' ')){e.preventDefault();t.click();return;}
    }
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      if(_fgArmadorVisible()&&!_fgHayDialogo()&&typeof dlPDF==='function'){e.preventDefault();dlPDF();}
      return;
    }
    if(e.key==='Escape'){
      var m=document.getElementById('modal');
      if(m&&m.classList.contains('show')){closeModal();return;}
      var om=document.getElementById('fg-otros-menu');if(om&&!om.hidden)fgToggleOtros(false);
    }
  });
}

// ── DIÁLOGO DE CONFIRMACIÓN PROPIO ───────────────────────────────────────────
// Reemplaza la ventanita de confirmación del navegador (gris, feo, sin estilo). Misma idea, pero
// asíncrono: fgConfirm(mensaje, {ok, cancelar, peligro, titulo, texto}, cb(si)).
// La primera línea del mensaje es el título; el resto, el cuerpo. Esc/click afuera
// = cancelar; el foco arranca en "Cancelar" (lo destructivo pide un gesto más).
function fgConfirm(msg,opts,cb){
  if(typeof opts==='function'){cb=opts;opts={};}
  opts=opts||{};
  return new Promise(function(res){
    var viejo=document.getElementById('fg-cf-ov');if(viejo)viejo.remove();
    var lineas=String(msg||'').split(/\n+/);
    var titulo=opts.titulo||lineas[0]||'¿Confirmás?';
    var cuerpo=(opts.texto!=null)?opts.texto:lineas.slice(1).join('\n');
    var peligro=opts.peligro!==false;
    var icoPel='<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
    var icoPre='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var dlg=document.createElement('div');dlg.id='fg-cf-ov';dlg.className='fg-cf-ov';
    dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-labelledby','fg-cf-t');
    dlg.innerHTML='<div class="fg-cf"><div class="fg-cf-h"><div class="fg-cf-ico'+(peligro?' peligro':'')+'">'+(peligro?icoPel:icoPre)+'</div>'+
      '<div style="flex:1;min-width:0"><div class="fg-cf-t" id="fg-cf-t"></div><div class="fg-cf-b" id="fg-cf-b"></div></div></div>'+
      '<div class="fg-cf-acts"><button type="button" class="btn bg" id="fg-cf-no"></button><button type="button" class="btn bp'+(peligro?' peligro':'')+'" id="fg-cf-ok"></button></div></div>';
    var tEl=dlg.querySelector('#fg-cf-t'),bEl=dlg.querySelector('#fg-cf-b'),ok=dlg.querySelector('#fg-cf-ok'),no=dlg.querySelector('#fg-cf-no');
    tEl.textContent=titulo;bEl.textContent=cuerpo;if(!cuerpo)bEl.style.display='none';
    ok.textContent=opts.ok||'Confirmar';no.textContent=opts.cancelar||'Cancelar';
    var prev=document.activeElement,cerrado=false;
    function fin(r){
      if(cerrado)return;cerrado=true;
      document.removeEventListener('keydown',tecla,true);
      dlg.remove();
      if(prev&&prev.focus){try{prev.focus();}catch(e){}}
      res(!!r);if(cb)cb(!!r);
    }
    function tecla(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fin(false);return;}
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();fin(document.activeElement!==no);return;}
      if(e.key==='Tab'){e.preventDefault();e.stopPropagation();(document.activeElement===no?ok:no).focus();}
    }
    ok.onclick=function(){fin(true);};
    no.onclick=function(){fin(false);};
    dlg.addEventListener('click',function(e){if(e.target===dlg)fin(false);});
    document.addEventListener('keydown',tecla,true);
    document.body.appendChild(dlg);
    setTimeout(function(){try{no.focus();}catch(e){}},30);
  });
}

// ── ARRANQUE de todo lo de arriba (lo llama initApp, después de armar el formulario) ──
function _fgUxInit(){
  try{_fgValInit();}catch(e){console.warn('val:',e);}
  try{_fgLegalInit();}catch(e){console.warn('legal:',e);}
  try{_fgKbdInit();}catch(e){console.warn('kbd:',e);}
  try{_fgShareInit();}catch(e){console.warn('share:',e);}
  try{_fgWorkInit();}catch(e){console.warn('work:',e);}
}
