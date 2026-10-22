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
    // Sin tope de tiempo, una red de sucursal que se cuelga deja el botón en
    // "Guardando..." para siempre. A los 25 s se corta y se avisa.
    var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
    var tm=ctl?setTimeout(function(){ctl.abort();},25000):0;
    return fetch(url,{method:'POST',headers:headers,body:JSON.stringify(b),signal:ctl?ctl.signal:undefined})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(res){clearTimeout(tm);
              // Si el callback del que llama falla, no es un error de red: sin este
              // try el .catch de abajo lo tomaba por uno y lo volvía a invocar.
              try{cb(res.ok?null:(res.d&&res.d.error||'Error'),res.d);}catch(ex){console.error(ex);}},
            function(e){clearTimeout(tm);throw e;});
  }).catch(function(e){cb(e&&e.name==='AbortError'?'Tardó demasiado en responder. Revisá tu conexión y probá de nuevo.':((e&&e.message)||'Error de red'));});
}

// ── JSON DE CONFIGURACIÓN DEL BUCKET ─────────────────────────────────────────────
// Opciones, facultades, títulos, cashback, y el flyer activo y el legal de cada
// opción son JSON públicos del bucket. Se piden SIEMPRE frescos (?t= + no-cache):
// un cambio del admin se ve en la próxima carga (invariante: los JSON no se
// cachean). Lo único que se reusa es una descarga pedida por adelantado
// (_bucketJsonPre) que todavía nadie usó y tiene menos de _BJ_FRESCO: así el
// ingreso pide todo junto apenas sabe que hay sesión, y cada cargador toma su
// archivo cuando le toca, sin otra vuelta a la red. La primera lectura la
// consume; la siguiente (un "Recargar" del admin, por ejemplo) vuelve a pedir.
// Devuelve una promesa con el JSON, o null si el archivo no existe (404).
var _BJ_FRESCO=30000,_bjPre={};
function _bucketJsonPedir(file){
  return fetch(FLYERS_PUBLIC+file+'?t='+Date.now(),{cache:'no-cache'})
    .then(function(r){return r.ok?r.json():null;});
}
function _bucketJsonPre(file){
  var e=_bjPre[file];
  if(e&&Date.now()-e.t<_BJ_FRESCO)return e.p;
  var p=_bucketJsonPedir(file);
  p.catch(function(){}); // si falla, lo atiende quien la consuma (con su propio catch)
  _bjPre[file]={t:Date.now(),p:p};
  return p;
}
function _bucketJson(file){
  var e=_bjPre[file];
  if(e){delete _bjPre[file];if(Date.now()-e.t<_BJ_FRESCO)return e.p;}
  return _bucketJsonPedir(file);
}
// Ingreso: lo que la app va a necesitar sí o sí se pide JUNTO, mientras se
// consulta el perfil. Antes iba en fila (perfil → opciones → facultades → datos
// de la opción → legal → imagen): seis vueltas a la red hasta ver el flyer. Esto
// sólo PIDE: el orden en que se APLICA cada cosa no cambia (las facultades
// siguen esperando al perfil y a las opciones). Además adelanta la opción con
// la que este usuario arrancó la vez anterior (fg_ultopt_<uid>, la anota
// _fgPrevAbrir): sus datos, su legal y su imagen ya están viniendo cuando las
// facultades confirman cuál le toca. Si la predicción falla, se pierden unos KB.
var _fgPreImg={};
function _fgPrecargaInicio(uid){
  [OPCIONES_FILE,FACULTADES_FILE,TITULOS_FILE,CASHBACK_FILE].forEach(_bucketJsonPre);
  var ult={};try{ult=JSON.parse(localStorage.getItem('fg_ultopt_'+uid)||'{}')||{};}catch(e){}
  if(typeof ult!=='object')ult={o:ult}; // sólo el número de opción, sin imagen
  var n=parseInt(ult.o,10)||0;
  _fgPrecargaOpt(1,n<=1,n===1?ult.img:'');
  if(n>1)_fgPrecargaOpt(n,true,ult.img);
}
// Nombres "crudos": _activeFile/_legalFile pasan por _optN, que antes de que
// lleguen las opciones sólo conoce la 1, 2 y 3. imgUrl: la imagen que tenía la
// vez anterior; se empieza a bajar YA (si el admin la cambió, llega la nueva con
// los datos de la opción y ésa se descarta).
function _fgPrecargaOpt(n,conImagen,imgUrl){
  var act=n===1?'_active.json':'_active'+n+'.json',leg=n===1?'_legal.json':'_legal'+n+'.json';
  _bucketJsonPre(leg);
  function bajar(url){
    if(!conImagen||!url||(_fgPreImg[n]&&_fgPreImg[n].src===url))return;
    var im=new Image();im.crossOrigin='anonymous';im.src=url;
    _fgPreImg[n]=im;
  }
  if(typeof imgUrl==='string'&&imgUrl.indexOf(FLYERS_PUBLIC)===0)bajar(imgUrl);
  _bucketJsonPre(act).then(function(d){if(d&&d.imageUrl)bajar(d.imageUrl);},function(){});
}
// La imagen precargada de una opción, si es la que pide url y no falló. Se usa
// una sola vez: después cada carga de esa opción crea la suya, como siempre.
function _fgPreImgDe(n,url){
  var im=_fgPreImg[n];delete _fgPreImg[n];
  if(!im||!url||im.src!==url)return null;
  if(im.complete&&!im.naturalWidth)return null; // falló: que la pida de nuevo
  return im;
}

// ── LECTURAS COMPLETAS (sin el corte de 1000 filas) ─────────────────────────────
// PostgREST devuelve como mucho 1000 filas por consulta: sin paginar, una lista
// más larga llega cortada EN SILENCIO. Pasó con el catálogo de promociones y con
// las empresas del Hunter, y seguía pasando en los Excel de Registros, de flyers
// generados y de cambios de empresas. armar(desde,hasta) arma la consulta de ESA
// tanda, siempre con un orden estable (sin él, las tandas pueden repetir o
// saltear filas). cb(error, filas): todas juntas, o las que llegaron hasta el error.
var _SB_PAGINA=1000;
function _sbTodo(armar,cb,pagina,desde,acc){
  pagina=pagina||_SB_PAGINA;desde=desde||0;acc=acc||[];
  armar(desde,desde+pagina-1).then(function(r){
    if(r&&r.error){cb(r.error,acc);return;}
    var filas=(r&&r.data)||[];
    for(var i=0;i<filas.length;i++)acc.push(filas[i]); // sin copiar todo lo anterior en cada página
    if(filas.length===pagina)_sbTodo(armar,cb,pagina,desde+pagina,acc);
    else cb(null,acc);
  },function(e){cb(e,acc);});
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
    },function(e){
      // sin red: se sigue con la caché (si no, _asLoading quedaba prendido y
      // "Guardar el actual" / "Eliminar" no volvían a responder)
      _asLoading=false;console.warn('asesores_guardados:',e&&e.message);
      var cbs=_asCbs;_asCbs=[];
      cbs.forEach(function(f){try{f(_asesores);}catch(e2){}});
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
    for(var k=1;k<=8;k++){if(t.indexOf('asesor '+k)>=0){slot=k;break;}} // 5-8: modo "oficiales por sede"
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
    '</div>';
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
  var sfx=_fgSfx(slot);
  _setVal('nombre'+sfx,a.nombre);_setVal('celular'+sfx,a.celular);_setVal('email'+sfx,a.email);
  // _fgSetAsesorOn cubre los 8 slots. Antes era un if/else por slot con un "else"
  // final que caía en el Asesor 1: con los slots 5-8 del modo "oficiales por sede"
  // eso prendía (y mostraba) el bloque equivocado.
  _fgSetAsesorOn(slot,true);
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
    (_asEditQ?'<p style="font-size:.75rem;color:var(--gray);margin-bottom:6px">Mostrando '+idxs.length+' de '+rows.length+'.</p>':'')+
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

// Devuelve el badge HTML del rol (admin / vip / pro / asesor / hunter).
var _ROLE_LBL={admin:'Admin',vip:'VIP',pro:'Pro',asesor:'Asesor',hunter:'Hunter',lider:'Líder'};
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
  // se vacía el selector: si no, volver a elegir el MISMO Excel (ya corregido) no
  // dispara nada (como en la carga de flyers y de asesores)
  try{input.value='';}catch(e){}
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
  if(n==='ges')return typeof window.gesInit==='function';
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
  _libWrap('_hunBajar',['jspdf']);               // perfil Hunter
  _libWrap('descargarExcelPromos',['exceljs']);
}
// Bajar el PDF es la acción central de la app: apenas la pantalla queda quieta
// después del login, jsPDF se trae en segundo plano para que el primer "Descargar"
// no espere. Las de Excel/ZIP sólo se cargan si se usan.
function _libPrefetch(){if(_LIBS.jspdf&&!_libReady('jspdf'))setTimeout(function(){_lib('jspdf').catch(function(){});},2500);}
function initApp(){
  _initTheme();
  _inicioSolapaInit(); // respeta la solapa que el usuario toque mientras carga
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
  _fgOfInit();           // interruptor "Mostrar en el flyer" en el título de Oficiales
  _fgUxInit();           // validación en línea, negrita del legal, teclado, "Otros", compartir
  _libInit();            // PDF/Excel/ZIP se cargan la primera vez que se usan (va después del motor: envuelve sus overrides)
  _sb.auth.onAuthStateChange(function(event){
    if(event==='PASSWORD_RECOVERY'){_bootFin();showLoginView('forgot');}
    // Sesión cerrada por afuera (venció el refresh token, logout desde otra
    // pestaña): sin esto la app seguía "logueada" con _me seteado, y cada
    // guardado/registro fallaba en silencio. Recargar la lleva al login.
    if(event==='SIGNED_OUT'&&_me){_me=null;location.reload();}
  });
  _sb.auth.getSession().then(function(r){
    if(r.data&&r.data.session){checkProfile(r.data.session.user);}
    else _bootFin(); // la sesión guardada ya no sirve: el formulario de siempre
  }).catch(function(){_bootFin();});
  // Red de seguridad del "Ingresando…": si la app no terminó de entrar en 10 s
  // (red caída), aparece el formulario para que se pueda volver a intentar; si
  // lo que no contesta es el perfil de una sesión válida, la tarjeta de
  // Reintentar (no hace falta volver a poner la clave).
  setTimeout(function(){
    if(_fgIngresoPend&&!_me&&document.documentElement.classList.contains('fg-boot'))_fgIngresoSinRed(_fgIngresoPend,true);
    else _bootFin();
  },10000);
  var prevEl=document.querySelector('.prev');
  if(prevEl){
    // La rueda manda decenas de eventos por gesto; cada uno redibujaba el flyer entero
    // de una y la pestaña se trababa. Se acumulan los pasos y se aplica un solo
    // zoom+redibujo por cuadro, anclado a la última posición del cursor.
    var _pwPend=null,_pwPasos=0,_pwX=0,_pwY=0;
    prevEl.addEventListener('wheel',function(e){
      // Zoom sólo con Ctrl (o el pellizco del touchpad, que llega como wheel +
      // ctrlKey). La rueda sola recorre el flyer acercado con el scroll nativo
      // (decisión del 2026-10-11, como Canva/Figma/PDF: sin zoom sin querer).
      if(!(e.ctrlKey||e.metaKey)){_zoomTip(prevEl);return;}
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
        // redrawNow y NO redraw: el redraw normal junta las llamadas y pinta
        // recién en el frame siguiente, así que el canvas que mido abajo todavía
        // tendría el tamaño VIEJO, la corrección del scroll daría 0 y el zoom
        // dejaría de seguir al cursor (se iría siempre al borde de arriba).
        // Acá ya estamos adentro de un requestAnimationFrame: sigue siendo un
        // solo dibujado por cuadro.
        calcSC();(window.redrawNow||redraw)();_updateZoomPct();
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

// "Ingresando…": si al abrir hay una sesión guardada, el script de arranque
// (themeBoot en _build.mjs) marca <html> con fg-boot y el CSS cambia la tarjeta
// del formulario por el aviso; antes se veía el formulario de usuario y clave un
// instante aunque ya estuvieras adentro. Esto lo saca: cuando la app se muestra
// o cuando hace falta el formulario (sesión vencida, cuenta pendiente/inactiva,
// recuperar clave, o 10 s sin poder entrar).
function _bootFin(){document.documentElement.classList.remove('fg-boot');}
function showLoginView(v){
  ['login','forgot','register','red'].forEach(function(x){ // 'red' = sin conexión (_fgIngresoSinRed)
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
  _fgPrecargaInicio(user.id); // la configuración viene en paralelo con el perfil
  _fgIngresoPend=user;
  _sb.from('profiles').select('role,full_name,nombre_asesor,celular_asesor,email_asesor,status,facultades,es_prueba,lider_id').eq('id',user.id).single().then(function(r){
    _fgIngresoPend=null;
    var p=r.data;
    // Un corte de red o el servidor caído NO es una cuenta rechazada: antes caía
    // abajo, cerraba la sesión y mostraba "Error: Failed to fetch" (en una
    // sucursal con la red inestable el asesor tenía que volver a poner la clave).
    // Ahora se ofrece reintentar con la misma sesión.
    if(r.error&&_fgErrTransitorio(r)){console.warn('checkProfile:',r.error);_fgIngresoSinRed(user);return;}
    // 'reset_pending' = pidió cambiar la clave y espera al admin: entra igual con
    // la clave de siempre (si se lo bloqueara, cualquiera con su mail podría dejarlo
    // afuera pidiendo un cambio de clave en su nombre).
    if(r.error||!p||(p.status!=='active'&&p.status!=='reset_pending')){
      _bootFin(); // hace falta el formulario: el mensaje va ahí
      var msg;
      if(r.error){
        console.warn('checkProfile:',r.error);
        msg=(r.error.code==='PGRST116')?'Tu cuenta no está habilitada. Contactá al administrador.':'No se pudo verificar tu cuenta. Volvé a ingresar.';
      }
      else if(p&&p.status==='pending')msg='Tu cuenta está pendiente de aprobación del administrador.';
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
    // Gestiones comerciales: cuenta de prueba (Prospect) y el interruptor general.
    // Cuando llega el interruptor se re-aplica el gating (es idempotente).
    _esPrueba=!!p.es_prueba;_myLiderId=p.lider_id||null;
    _gesFlagCargar(function(){if(_facLoaded)_applyFacultades();_gesAvisoCargar();});
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
    // Cambios de oficiales propuestos por un Hunter, a la espera de que ESTE
    // usuario (dueño o su suplente) los apruebe. El cartel sale una vez, al
    // entrar; el número en "Base de datos" queda mientras no se resuelvan.
    _propCargarPendientes(_propCartel);
    _msgPollInit();
    // Al Hunter: consultas sin responder y cambios resueltos que todavía no vio.
    if(p.role==='hunter')_hunPropCargarMias(_hunPropCartel);
    // Aplicar imagen del flyer activo (Opción 1)
    _fetchActiveFlyer(function(imageUrl,_nombre1,cfg1){
      _showApp();
      // Con la app ya visible, re-aplico: es idempotente, y recién acá puede
      // corregir la opción activa si este perfil no tiene habilitada la 1.
      // La imagen de ejemplo (flyer_default.jpg, 1,3 MB) sólo hace falta si el
      // perfil SE QUEDA en la Opción 1 y ésta no tiene flyer. Se decide después
      // de aplicar facultades: _facSyncOptBar ya lo pasó a su primera opción, que
      // trae su propia imagen. Antes se bajaba siempre, aunque nadie la viera.
      var _fb1=function(){if(!imageUrl&&_optN(_fgOpt)===1&&_can('opcion_1'))_fgBaseFallback();};
      if(_facLoaded){_applyFacultades();_tourAutoStart();_fb1();}
      else loadFacultades(false,function(){_applyFacultades();_tourAutoStart();_fb1();});
      // Cacheo la Opción 1 para que volver a ella sea instantáneo. El mapa es el
      // de SU _active.json (cfg1), no window.FLYER_CFG: si el perfil ya pasó a la
      // opción que le toca, el global es el de esa otra.
      _fgOptCache[1]={loaded:true,cfg:cfg1||_readDocCfg()||null,imageUrl:imageUrl,
        name:_activeFlyerName,legal:null,img:null};
      // el legal viene de la misma descarga de arriba; si ya llegó, esto lo copia al caché
      _legal1P.then(function(t){_fgLegalArrived(1,t);});
      if(imageUrl&&window.baseImg){
        // La imagen de la Opción 1 puede llegar DESPUÉS de que el perfil pasó a la
        // opción que le toca (la 1 suele no estar habilitada): en ese caso se
        // guarda en su caché y NO tapa a la que está en pantalla. Antes la pisaba:
        // se veía el flyer de la 1 con el mapa de la otra (verificado con una
        // imagen lenta en la prueba de arranque).
        var _ni=_fgPreImgDe(1,imageUrl);
        var _listo1=function(){
          if(_fgOptCache[1])_fgOptCache[1].img=_ni;
          if(_optN(_fgOpt)!==1)return;
          _fgRecOlvidar();
          window.baseImg=_ni;
          if(typeof calcSC==='function')calcSC();
          if(typeof redraw==='function')redraw();
        };
        if(_ni&&_ni.complete)_listo1();
        else{
          var _pre1=!!_ni;
          if(!_ni){_ni=new Image();_ni.crossOrigin='anonymous';}
          _ni.onload=_listo1;
          _ni.onerror=function(){
            console.warn('Active flyer image failed:',imageUrl);
            if(_optN(_fgOpt)===1)_fgBaseFallback();
          };
          // Sin anti-caché: imageUrl ya trae ?v=<hora de activación> (cada activación
          // y recalibración escribe uno nuevo), así que un flyer nuevo es otra
          // dirección y se baja; el mismo flyer sale de la memoria del navegador
          // en vez de bajar ~1 MB en cada ingreso.
          if(!_pre1)_ni.src=imageUrl;
        }
      }
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
  // Si las facultades o los títulos no llegan (red caída), la vista previa se
  // destraba igual: mejor ver el flyer de la Opción 1 que una pantalla en blanco.
  setTimeout(_fgPrevAbrir,8000);
  document.getElementById('hdr-right').style.display='flex';
  document.getElementById('login-ov').style.display='none';
  _bootFin();
  // El Hunter no tiene armador: su pantalla la abre switchApp('hunter') desde
  // _applyFacultades/_inicioListo. Sin esta guarda se ve el armador un instante.
  // Tampoco el Líder: su pantalla es el tablero de Gestiones.
  if(!_esHunter()&&!_esLider())document.getElementById('layout').style.display='grid';
}

// Muestra cuántas cuentas están pendientes de aprobación en el botón Admin
function _refreshPendingBadge(){
  var ab=document.getElementById('hdr-admin-btn');if(!ab)return;
  _sb.from('profiles').select('id',{count:'exact',head:true}).in('status',['pending','reset_pending']).then(function(r){
    var n=r.count||0;
    ab.innerHTML='&#9881; Admin'+(n>0?' <span style="background:#fff;color:var(--red);border-radius:10px;padding:0 6px;font-size:.75rem;font-weight:800;margin-left:2px">'+n+'</span>':'');
    // "Usuarios" quedó un nivel más abajo (dentro del pilar Admin): un puntito
    // avisa que hay algo pendiente sin tener que entrar a mirar.
    var pa=document.querySelector('.atab[data-group="admin"]');
    if(pa)pa.classList.toggle('has-dot',n>0);
  });
}


// ── INGRESO SIN RED ──────────────────────────────────────────────────────────
// Error "pasajero": sin respuesta (status 0, la red se cortó), tiempo agotado,
// demasiados pedidos o el servidor caído. Lo demás (perfil inexistente, sesión
// inválida) sí es una respuesta y sigue el camino de siempre.
var _fgIngresoPend=null,_fgIngresoUser=null;
function _fgErrTransitorio(r){var s=r&&r.status;return !s||s===408||s===429||s>=500;}
// Tarjeta "No se pudo conectar" en el lugar del formulario: la sesión NO se
// cierra; Reintentar vuelve a pedir el perfil con la misma sesión. lento = el
// pedido no contestó en 10 s (sin esto quedaba "Ingresando…" o el formulario).
function _fgIngresoSinRed(user,lento){
  var card=document.querySelector('#login-ov .login-card');if(!card)return;
  _fgIngresoUser=user||_fgIngresoUser;
  var v=document.getElementById('lv-red');
  if(!v){v=document.createElement('div');v.id='lv-red';v.setAttribute('role','alert');card.appendChild(v);}
  v.innerHTML='<span class="lv-red-ico" aria-hidden="true">!</span>'+
    '<h2 class="login-card-title">'+(lento?'Est&aacute; tardando m&aacute;s de lo normal':'No se pudo conectar')+'</h2>'+
    '<p class="login-card-sub">Revis&aacute; la conexi&oacute;n y prob&aacute; de nuevo. Tu sesi&oacute;n sigue abierta: no hace falta volver a poner la clave.</p>'+
    '<button class="login-submit" id="lv-red-btn" onclick="_fgReintentarIngreso()">Reintentar</button>'+
    '<div class="login-links lv-red-links"><button class="login-link" onclick="_fgIngresarOtraCuenta()">Ingresar con otra cuenta</button></div>';
  _bootFin();showLoginView('red');
}
function _fgReintentarIngreso(){
  var b=document.getElementById('lv-red-btn');if(b){b.disabled=true;b.textContent='Conectando…';}
  document.documentElement.classList.add('fg-boot'); // vuelve el "Ingresando…"
  // Si leer la sesión tampoco contesta (la red se cortó justo al tocar), a los
  // 10 s vuelve la tarjeta: nunca un "Ingresando…" eterno.
  var resp=false;
  setTimeout(function(){if(!resp&&!_me)_fgIngresoSinRed(_fgIngresoUser,true);},10000);
  _sb.auth.getSession().then(function(r){
    resp=true;
    var s=r&&r.data&&r.data.session;
    if(s){checkProfile(s.user);_fgVigilarIngreso();}
    else if(r&&r.error)_fgIngresoSinRed(_fgIngresoUser);
    else{_bootFin();showLoginView('login');} // la sesión venció mientras tanto
  }).catch(function(){resp=true;_fgIngresoSinRed(_fgIngresoUser);});
}
// Si el perfil no contesta en 10 s, la tarjeta de reintentar en vez de un
// "Ingresando…" eterno.
function _fgVigilarIngreso(){
  setTimeout(function(){
    if(_fgIngresoPend&&!_me&&document.documentElement.classList.contains('fg-boot'))_fgIngresoSinRed(_fgIngresoPend,true);
  },10000);
}
// scope local: sin red, el signOut global falla ANTES de borrar la sesión del
// navegador y el botón no hacía nada.
function _fgIngresarOtraCuenta(){
  _fgIngresoUser=null;
  _sb.auth.signOut({scope:'local'}).catch(function(){}).then(function(){showLoginView('login');});
}
// Supabase contesta en inglés ("Invalid login credentials"): se muestra en
// castellano. Lo que no se reconoce va con un texto general.
function _fgErrLogin(e){
  var m=String((e&&e.message)||''),s=e&&e.status;
  if(/invalid login credentials|invalid_grant|invalid email or password/i.test(m))return 'Mail o contraseña incorrectos.';
  if(/email not confirmed/i.test(m))return 'Tu cuenta todavía no está confirmada. Avisale al administrador.';
  if(s===429||/rate limit|too many|security purposes/i.test(m))return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
  if(/banned|disabled/i.test(m))return 'Tu cuenta está deshabilitada. Contactá al administrador.';
  if(!s||/fetch|network/i.test(m))return 'No se pudo conectar. Revisá tu conexión y probá de nuevo.';
  return 'No se pudo ingresar. Probá de nuevo en un momento.';
}

function doLogin(){
  var email=document.getElementById('login-email').value.trim();
  var pass=document.getElementById('login-pass').value;
  var errEl=document.getElementById('login-err');errEl.textContent='';
  if(!email||!pass){errEl.textContent='Completá el mail y la contraseña.';return;}
  var btn=document.getElementById('login-btn');btn.textContent='Ingresando...';btn.disabled=true;
  _sb.auth.signInWithPassword({email:email,password:pass}).then(function(r){
    btn.textContent='Ingresar';btn.disabled=false;
    if(r.error){errEl.textContent=_fgErrLogin(r.error);return;}
    checkProfile(r.data.user);
  }).catch(function(){
    // Sin red / error inesperado: el botón no puede quedar trabado en "Ingresando...".
    btn.textContent='Ingresar';btn.disabled=false;
    errEl.textContent='No se pudo conectar. Revisá tu conexión y probá de nuevo.';
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
  var _mpFalla=function(){
    btn.textContent='Cambiar contraseña';btn.disabled=false;
    errEl.textContent='No se pudo conectar. Revisá tu conexión y probá de nuevo.';
  };
  _sb.auth.signInWithPassword({email:_me.email,password:cur}).then(function(r){
    if(r.error){btn.textContent='Cambiar contraseña';btn.disabled=false;errEl.textContent='La contraseña actual es incorrecta.';return;}
    btn.textContent='Guardando...';
    _sb.auth.updateUser({password:np}).then(function(r2){
      btn.textContent='Cambiar contraseña';btn.disabled=false;
      if(r2.error){errEl.textContent=r2.error.message;return;}
      _callFn('notify_self_password',{},function(){}); // aviso por mail (no se espera)
      okEl.textContent='✅ Tu contraseña se cambió correctamente.';
      document.getElementById('mp-cur').value='';
      document.getElementById('mp-new').value='';
      document.getElementById('mp-new2').value='';
      showToast('Contraseña actualizada');
      setTimeout(closeMyPassModal,1600);
    }).catch(_mpFalla);
  }).catch(_mpFalla);
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
var _AP_GROUPS={admin:['dashboard','usuarios','registros','uso','facultades','auditoria'],data:['varios','asesores','padronotros','padronlog'],config:['subir','cashback','legales','opciones','vigiladas']};
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
  if(t==='uso')_usoCargar();
  if(t==='vigiladas')_vigPintarAdmin();
  if(t==='cashback'){var _cbh=document.getElementById('cashback-list');if(_cbh&&!_cbh.children.length)_cbh.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Cargando...</p>';loadCashback(true,renderCashbackAdmin);}
  if(t==='facultades')loadFacultades(true,renderFacultades);
  if(t==='varios')renderPadronAdmin(true);
  if(t==='asesores')renderAsesoresAdmin(true);
  if(t==='padronotros')loadPadronOtrosUsers(false);
  if(t==='padronlog')loadPadronLog();
  if(t==='auditoria')loadAuditoria();
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
  asesor:{padron_buscar:false,pegar_oficial:false,notas:false,asesores_guardados:false,promos_buscar:false,tutorial_auto:false,guardar_trabajo:false,oficiales_sede:false,estudio:false},
  vip:   {padron_buscar:false,pegar_oficial:false,notas:true, asesores_guardados:true, promos_buscar:false,tutorial_auto:false,guardar_trabajo:false,oficiales_sede:false,estudio:false},
  pro:   {padron_buscar:false,pegar_oficial:false,notas:true, asesores_guardados:true, promos_buscar:false,tutorial_auto:false,guardar_trabajo:false,oficiales_sede:false,estudio:false},
  // El Hunter no tiene NINGUNA de estas: lo único que se le decide son las filas
  // opcion_N (qué flyers puede bajar). El candado está en _can, así que esta fila
  // es sólo la foto coherente de lo que se guarda.
  hunter:{padron_buscar:false,pegar_oficial:false,notas:false,asesores_guardados:false,promos_buscar:false,tutorial_auto:false,guardar_trabajo:false,oficiales_sede:false,estudio:false,proponer_oficiales:false},
  // El Líder sólo mira el tablero de su equipo: igual que el Hunter, el candado
  // está en _can (_LID_FAC) y esta fila es la foto de lo que se guarda.
  lider:{padron_buscar:false,pegar_oficial:false,notas:true,asesores_guardados:false,promos_buscar:false,tutorial_auto:false,guardar_trabajo:false,oficiales_sede:false,estudio:false,gestiones:true}
};
// Las opciones del armador son UNA FACULTAD CADA UNA (opcion_1, opcion_2, ...),
// así se puede dar sólo algunas. Se generan desde _FG_OPTS en tiempo de ejecución:
// cuando se sume una Opción 4, su fila aparece sola en la pantalla.
function _facOptList(){return (typeof _FG_OPTS!=='undefined'&&_FG_OPTS.length)?_FG_OPTS:[1,2,3];}
// Default de las opciones: hoy todos ven la Opción 1 y nadie más puede cambiarla.
// El Hunter es la excepción: arranca SIN ninguna. Él no arma flyers, baja el que
// le toca a cada empresa, así que el admin tiene que decir explícitamente cuáles
// son los vigentes; hasta entonces no baja nada (decisión del 2026-10-08, después
// de que heredara la Opción 1 —"VIEJO FLYER", sin imagen— y sacara el flyer de
// ejemplo del template con las coordenadas por defecto).
function _facDefault(role,key){
  if(key.indexOf('opcion_')===0)return role!=='hunter'&&role!=='lider'&&key==='opcion_1';
  return !!((_FAC_DEF[role]||{})[key]);
}
// Opciones de UNA solapa, en orden de número. Es la lista completa (habilitadas
// o no): la pantalla de Facultades muestra todas, es donde se deciden.
function _facOptsSol(sol){return _facOptList().filter(function(o){return _optSolapa(o)===sol;});}
// Solapas del armador en el orden del header (el que el admin dejó arrastrando
// las solapas, guardado en _titulos.json). Las que no estén en ese orden van al
// final, como las lista el registro _SOLAPAS. Así los grupos de Facultades
// quedan en el mismo orden que el menú de arriba.
function _facSolOrden(){
  var ord=Array.isArray(_TIT_ORDEN)?_TIT_ORDEN:[];
  return _OPC_SOLAPAS.slice().sort(function(a,b){
    var ia=ord.indexOf(a),ib=ord.indexOf(b);
    if(ia<0)ia=999+_OPC_SOLAPAS.indexOf(a);
    if(ib<0)ib=999+_OPC_SOLAPAS.indexOf(b);
    return ia-ib;
  });
}
// Filas de la pantalla, en orden.
function _facRows(){
  var rows=[
    ['padron_buscar','Base de datos: mis empresas','Le da <strong>su propia lista privada de empresas</strong> (su nombre &rarr; Base de datos): carga las suyas y las busca con la lupa por raz&oacute;n social o CUIT. <strong>Nadie m&aacute;s puede ver ni editar lo que cargue</strong>; vos s&iacute; pod&eacute;s consultarlo desde Data &rarr; Empresas por usuario.'],
    ['pegar_oficial','Pegar datos del oficial','Bot&oacute;n "Pegar" en cada bloque de asesor: saca nombre, celular y mail de un texto copiado.']
  ];
  // Las opciones del armador van AGRUPADAS por solapa: la pantalla las muestra
  // plegadas bajo el nombre del menú y se despliegan con la flecha (ver
  // _facGrpRow). Por eso se recorre solapa por solapa y no 1,2,3…: en orden
  // numérico las solapas se intercalan (la opción 1 es del flyer, la 2 de
  // rubros, la 5 otra vez del flyer) y un grupo tiene que ser contiguo.
  // El 4º campo de la fila es el id de la solapa; las filas que no son de
  // opción no lo llevan y se pintan como siempre.
  _facSolOrden().forEach(function(sol){
    var otra=(sol!=='flyer')?_escHtml(_solapaLabel(sol)):'';
    _facOptsSol(sol).forEach(function(o){
      rows.push(['opcion_'+o,'Ver &laquo;'+_escHtml(_optLabel(o))+'&raquo; (opci&oacute;n '+o+(otra?', solapa '+otra:'')+')',
        'Habilita ese armador (flyer + legal propios; se administra en Config &rarr; Opciones). El selector aparece s&oacute;lo si tiene m&aacute;s de una habilitada.'+
        (otra?' Con al menos una opci&oacute;n de esa solapa habilitada, el perfil ve la solapa <strong>'+otra+'</strong> en el header.':''),sol]);
    });
  });
  rows.push(['notas','Bloc de notas','&Iacute;tem "Bloc de notas" en el men&uacute; del usuario.']);
  rows.push(['asesores_guardados','Base de datos: mis asesores','Permite guardar asesores predeterminados y cargarlos con un click desde los t&iacute;tulos "Asesor 1..4". Desde su nombre &rarr; <strong>Base de datos &rarr; Mis asesores</strong> los ve, los corrige, los sube por Excel o se los baja. La lista viaja con su cuenta (la ve desde cualquier computadora) y es privada.']);
  rows.push(['promos_buscar','Buscador de promociones','Agrega la pesta&ntilde;a "Promociones": pega las marcas del flyer y las cruza contra el buscador oficial de Galicia, con logo, fechas de vigencia y estado (vigente / vence este mes / vencida).']);
  rows.push(['guardar_trabajo','Guardar historial y borrador','El <strong>Historial</strong> queda guardado en el dispositivo (hoy se borra al cerrar o recargar la p&aacute;gina) y el formulario se guarda solo mientras escribe: si cierra la pesta&ntilde;a a mitad de un flyer, al volver le ofrece <em>&laquo;Seguir con ese flyer&raquo;</em>. Todo vive en su navegador, nada sale a la nube.']);
  rows.push(['oficiales_sede','Oficiales por sede','Suma una barrita en <strong>Otros &rarr; Oficiales por sede</strong>, para los flyers donde el banco pone un referente por zona. Prendida: puede cargar <strong>hasta 8 oficiales</strong> (en vez de 4), ponerle a cada uno su <strong>ubicaci&oacute;n</strong> (sale con el pin &#128205; y en negrita arriba del nombre) y escribir el <strong>t&iacute;tulo</strong> que va arriba del bloque. Apagada, el armador queda igual que siempre. Los oficiales 5 al 8 se cargan igual que los otros (Pegar y asesores guardados); lo &uacute;nico que no los alcanza es la carga masiva: la base de empresas y el Excel del masivo siguen trayendo hasta 4.']);
  rows.push(['estudio','Estudio (dise&ntilde;os de flyer)','Agrega la solapa <strong>Estudio</strong> y el bot&oacute;n <strong>Guardar en Estudio</strong> en &laquo;Cambiar logos&raquo;. Cada uno guarda <strong>sus propios dise&ntilde;os</strong> (logos cambiados, movidos y textos) sin que nadie m&aacute;s los vea, y puede <strong>pedirte que se publiquen</strong>: el pedido te llega a vos en Estudio &rarr; Pedidos, y al aprobarlo se crea un flyer nuevo en la barra de opciones para todos los que usan ese flyer. Vos ves los dise&ntilde;os de todos.']);
  rows.push(['tutorial_auto','Tutorial al primer ingreso','La primera vez que entra, se le abre solo el recorrido guiado por el armador (flechas sobre cada bot&oacute;n, por cap&iacute;tulos, se puede omitir). Siempre puede repetirlo desde su nombre &rarr; "Ver tutorial". Para verlo vos antes de activarlo: tu nombre &rarr; Ver tutorial.']);
  rows.push(['proponer_oficiales','Proponer cambios de oficiales','S&oacute;lo aplica al perfil <strong>Hunter</strong>: le agrega un bot&oacute;n &laquo;&#9998; Oficiales&raquo; en cada empresa para proponer agregar, corregir o quitar un oficial. El cambio <strong>no impacta</strong> hasta que lo aprueba el oficial due&ntilde;o de esa empresa (o su suplente); hasta entonces, el flyer sigue saliendo con los datos de hoy.']);
  rows.push(['gestiones','Gestiones comerciales','Registrar visitas, ferias y acciones en empresas, con sus prospectos y altas, y ver el tablero. El <strong>Hunter</strong> registra (bot&oacute;n &laquo;Registrar gesti&oacute;n&raquo;), el <strong>oficial</strong> deriva visitas de sus empresas y ve c&oacute;mo le fue, y el <strong>L&iacute;der</strong> ve el tablero de su equipo. S&oacute;lo cuenta si el interruptor de arriba est&aacute; en &laquo;Activo&raquo;.']);
  return rows;
}
var _FAC_ROLES=[['asesor','Asesor'],['vip','VIP'],['pro','Pro'],['hunter','Hunter'],['lider','L\u00edder']];
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
// Una sola descarga en vuelo: al entrar la pedían dos caminos a la vez (el que
// aplica el gating y el de _showApp) y el archivo bajaba dos veces. Los que
// llegan mientras viene se suman y se avisan juntos.
var _facCbs=null;
function _loadFacultadesRaw(force,cb){
  if(_facLoaded&&!force){if(cb)cb();return;}
  if(_facCbs){if(cb)_facCbs.push(cb);return;}
  _facCbs=cb?[cb]:[];
  function fin(roles){
    _FAC=_facMerge(roles);
    _facLoaded=true;
    var cbs=_facCbs;_facCbs=null;
    cbs.forEach(function(f){try{f();}catch(e){console.error('facultades:',e);}});
  }
  _bucketJson(FACULTADES_FILE)
    .then(function(d){return d&&d.roles;},function(){return null;})
    .then(fin);
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
// El rol que manda ahora mismo (el simulado gana, para que la vista previa sea fiel).
function _rolVigente(){return _simRole||_myRole;}
// Perfil HUNTER: la app se reduce a buscar una empresa ya cargada y bajar su flyer.
// No arma, no carga, no edita. Ver el bloque "PERFIL HUNTER" al final del archivo.
function _esHunter(){return _rolVigente()==='hunter';}
// Lo único que un Hunter puede tener habilitado además de qué flyers ve
// (opcion_N): esta lista corta. Todo lo demás sigue apagándose de una sola vez
// (ni hay que acordarse de apagar la próxima facultad que se agregue, ni una
// tildada por error en el JSON lo alcanza). Ampliada el 2026-10-09: Promociones,
// Bloc de notas, Tutorial y Proponer cambios de oficiales.
var _HUN_FAC={promos_buscar:1,notas:1,tutorial_auto:1,proponer_oficiales:1,asesores_guardados:1,gestiones:1};
// Perfil LÍDER: no arma ni baja flyers; mira el tablero de Gestiones de su equipo.
function _esLider(){return _rolVigente()==='lider';}
var _LID_FAC={notas:1,tutorial_auto:1,gestiones:1};
function _can(f){
  // Candado del perfil Hunter. El admin que simula "hunter" cae acá también.
  if(_esHunter()&&f.indexOf('opcion_')!==0&&!_HUN_FAC[f])return false;
  if(_esLider()&&!_LID_FAC[f])return false;
  if(_simRole)return !!((_FAC&&_FAC[_simRole]||{})[f]);
  if(_admin)return _facMe(f); // todo, menos lo que se destildó a sí mismo
  return !!((_FAC&&_FAC[_myRole]||{})[f]);
}
// "¿Es admin AHORA?" — false mientras se simula, para que la vista previa sea fiel.
function _adminNow(){return _admin&&!_simRole;}
// Opciones del armador habilitadas para el rol vigente.
function _facOpts(){return _facOptList().filter(function(o){return _can('opcion_'+o);});}
// Idem, pero sólo las de una solapa del header (ver _SOLAPAS).
function _facOptsDe(solapa){return _facOpts().filter(function(o){return _optSolapa(o)===solapa;});}

// Aplica el gating de la interfaz. Es BIDIRECCIONAL (muestra y oculta) y seguro
// de repetir: hace falta así para que al quitar una facultad desaparezca sin
// recargar, y para que la vista previa pueda entrar y salir.
function _applyFacultades(){
  var dp=document.getElementById('hdr-dd-pass');if(dp)dp.style.display=_adminNow()?'none':'flex';
  var ab=document.getElementById('hdr-admin-btn');if(ab)ab.style.display=_adminNow()?'inline-flex':'none';
  var dn=document.getElementById('hdr-dd-notes');if(dn)dn.style.display=_can('notas')?'flex':'none';
  // El tutorial recorre el armador: a un Hunter no le aplica ni un capítulo.
  // El Hunter ya tiene su propio capítulo (ver _tourCapitulos): el ítem se ve
  // para todos, como para el resto de los roles.
  var dt=document.getElementById('hdr-dd-tour');if(dt)dt.style.display='flex';
  _hunPropBadgeSync(); // "Mis propuestas" (sólo Hunter con la facultad)

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
  // + _propPendCount: el suplente (o el dueño) tiene que ver el ítem aunque no
  // tenga él mismo padron_buscar/asesores_guardados habilitado.
  if(dpad)dpad.style.display=(_can('padron_buscar')||_can('asesores_guardados')||_propPendCount>0)?'flex':'none';
  _propBadgeSync();
  _bdSync();
  _mpRefresh(); // tarjeta "todo el segmento" del masivo (sólo con empresas cargadas)

  _fgWorkApply(_can('guardar_trabajo')); // historial persistente + borrador automático

  // "Oficiales por sede": la barrita del menú Otros. Si el perfil pierde la
  // facultad con el modo prendido, _fgSedesFac lo apaga (y limpia lo cargado).
  if(_can('oficiales_sede'))_fgEnsureSedesSwitch();
  _fgSedesFac(_can('oficiales_sede'));

  _facSyncOptBar();

  // Las solapas del armador que no son "Flyer Galicia" no tienen facultad propia:
  // se ven si el perfil tiene habilitada al menos una opción de esa solapa
  // (opcion_N en Facultades). Si la pierde estando parado ahí, vuelve al flyer.
  _OPC_SOLAPAS.forEach(function(s){
    if(s==='flyer')return;
    var t=_apptab(s);if(!t)return;
    var hay=_facOptsDe(s).length>0;
    t.style.display=hay?'':'none';
    if(!hay&&t.classList.contains('active')&&typeof switchApp==='function')switchApp('flyer');
  });

  // Solapas de primer nivel que NO son el armador (Promociones, Buscar flyer):
  // cada una se ve si su condición da true, y si el perfil la pierde estando
  // parado ahí (o durante la vista previa de otro rol) se lo saca de esa pantalla.
  _VISTAS.forEach(function(v){
    var t=_apptab(v.id);if(!t)return;
    var ok=v.ver();
    t.style.display=ok?'':'none';
    if(!ok&&t.classList.contains('active')&&typeof switchApp==='function')switchApp('flyer');
  });

  // El Hunter no arma flyers: las solapas del armador no existen para él (el
  // bucle de arriba puede haber mostrado una solapa de rubros porque tiene
  // habilitada esa opción para DESCARGARLA, que no es lo mismo que armarla).
  // Bidireccional como todo lo de acá: "Flyer Galicia" no tiene facultad propia,
  // así que si no se la vuelve a mostrar explícitamente, salir de la vista previa
  // de un Hunter dejaba al admin sin armador hasta recargar la página.
  var _hun=_esHunter();
  var tFly=_apptab('flyer');if(tFly)tFly.style.display=_hun?'none':'';
  if(_hun){
    _OPC_SOLAPAS.forEach(function(s){var t=_apptab(s);if(t)t.style.display='none';});
    var layH=document.getElementById('layout');if(layH)layH.style.display='none';
    // No lo reubica si ya está parado en una vista propia (Promociones, Buscar
    // flyer): si no, cada pasada de _applyFacultades —p.ej. al abrir/cerrar la
    // vista previa de otro rol— lo sacaba de Promociones de vuelta a su pantalla.
    var yaPermitida=_VISTAS.some(function(v){var t=_apptab(v.id);return v.ver()&&t&&t.classList.contains('active');});
    if(!yaPermitida&&typeof switchApp==='function')switchApp('hunter');
  }
  // Líder: lo mismo que el Hunter, pero su pantalla es el tablero de Gestiones.
  if(_esLider()){
    if(tFly)tFly.style.display='none';
    _OPC_SOLAPAS.forEach(function(s){var t=_apptab(s);if(t)t.style.display='none';});
    var layL=document.getElementById('layout');if(layL)layL.style.display='none';
    var yaL=_VISTAS.some(function(v){var t=_apptab(v.id);return v.ver()&&t&&t.classList.contains('active');});
    if(!yaL&&typeof switchApp==='function')switchApp('gestiones');
  }
  _gesSync();
  try{_estBadgeInicio();}catch(e){}
  _inicioListo('fac'); // recién acá se sabe qué solapas ve este perfil
}

// Solapas de primer nivel del header. Las del armador ("Flyer Galicia", "Flyer
// Rubros", "Flyer Sueldo") usan el MISMO layout: cambia qué opciones lista la
// barra y si se ven los campos del beneficio. Las demás tienen pantalla propia y
// salen del registro de abajo.
//
// Vistas de primer nivel que NO son el armador: cada una tiene su propio <div>,
// su condición para existir y qué hacer al abrirla. Sumar una es una entrada acá
// + su div en _build.mjs, igual que _SOLAPAS para las del armador (antes
// "Promociones" estaba escrita a mano en switchApp, _fgSyncVista y
// _applyFacultades, y sumar una segunda era duplicar los tres).
var _VISTAS=[
  {id:'promos',el:'view-promos',ver:function(){return _can('promos_buscar');},
   init:function(){if(typeof initPromosTab==='function')initPromosTab();}},
  {id:'hunter',el:'view-hunter',ver:function(){return _esHunter();},
   init:function(){if(typeof _hunInit==='function')_hunInit();}},
  // Gestiones comerciales: el código vive en gestiones.js y se baja recién acá.
  {id:'gestiones',el:'view-gestiones',ver:function(){return _gesOn();},
   init:function(){_gesAbrir('gesInit');}},
  // Estudio: diseños de flyer guardados (ver el bloque ESTUDIO más abajo).
  {id:'estudio',el:'view-estudio',ver:function(){return _estVer();},
   init:function(){_estInit();}}
];
function _vista(id){for(var i=0;i<_VISTAS.length;i++)if(_VISTAS[i].id===id)return _VISTAS[i];return null;}
function switchApp(view){
  var lay=document.getElementById('layout');
  var vi=_vista(view);
  if(vi&&!vi.ver())view='flyer'; // por si lo llaman sin permiso
  // El Hunter nunca llega al armador, pero SÍ puede entrar a una vista propia
  // que tenga habilitada (hoy: Promociones, además de su pantalla de siempre).
  if(_esHunter()&&!_vista(view))view='hunter';
  if(_esLider()&&!_vista(view))view='gestiones';
  if(_esSolapaArmador(view)&&view!=='flyer'&&!_facOptsDe(view).length)view='flyer';
  vi=_vista(view);
  var arm=_esSolapaArmador(view);
  if(lay)lay.style.display=arm?'grid':'none';
  document.body.classList.toggle('en-armador',!!arm);
  _mvInit();
  _VISTAS.forEach(function(v){
    var el=document.getElementById(v.el);if(el)el.style.display=(v.id===view)?'grid':'none';
    var t=_apptab(v.id);if(t)t.classList.toggle('active',v.id===view);
  });
  if(vi){
    _OPC_SOLAPAS.forEach(function(s){var t=_apptab(s);if(t)t.classList.remove('active');});
    vi.init();
    return;
  }
  // Armador: si la opción activa no es de esta solapa, paso a la última que usé
  // en ella (o a la primera habilitada). switchFlyerOption → _fgSyncVista marca
  // la solapa y rearma la barra. También si es de esta solapa pero el perfil no
  // la tiene habilitada (al entrar todos arrancan en la 1, que casi nadie
  // tiene): así la solapa de arranque cae en una opción permitida, llegue
  // primero lo que llegue de la red. Sin facultades cargadas no hay ninguna
  // habilitada y no se mueve nada, como antes.
  if(_optSolapa(_fgOpt)!==view||!_can('opcion_'+_optN(_fgOpt))){
    var opts=_facOptsDe(view),ult=_fgUltOpt[view];
    if(opts.length){switchFlyerOption(opts.indexOf(ult)>=0?ult:opts[0]);return;}
  }
  _fgSyncVista();
}
// Celular: selector fijo Editar / Vista previa. Sólo sube o baja la página hasta
// el panel o hasta el flyer (no oculta nada, así el zoom y el canvas no se tocan).
function _mvInit(){
  if(document.getElementById('mv-toggle'))return;
  var d=document.createElement('div');d.id='mv-toggle';d.setAttribute('role','group');d.setAttribute('aria-label','Ir a');
  d.innerHTML='<button type="button" class="on" data-mv="edit">Editar</button><button type="button" data-mv="prev">Vista previa</button>';
  document.body.appendChild(d);
  function marcar(w){Array.prototype.forEach.call(d.querySelectorAll('button'),function(b){b.classList.toggle('on',b.dataset.mv===w);});}
  d.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');if(!b)return;
    var pv=document.querySelector('#layout .prev');
    if(b.dataset.mv==='prev'&&pv){var y=pv.getBoundingClientRect().top+window.pageYOffset-70;window.scrollTo({top:y,behavior:'smooth'});}
    else window.scrollTo({top:0,behavior:'smooth'});
    marcar(b.dataset.mv);
  });
  window.addEventListener('scroll',function(){
    var pv=document.querySelector('#layout .prev');if(!pv)return;
    marcar(pv.getBoundingClientRect().top<window.innerHeight*0.45?'prev':'edit');
  },{passive:true});
}
// Última opción usada en cada solapa, para volver a la misma al cambiar de solapa.
var _fgUltOpt={flyer:1}; // las demás solapas se anotan solas al visitarlas
// Deja la interfaz acorde a la opción activa: solapa del header marcada, barra
// de opciones de ESA solapa, campos del beneficio visibles sólo en Rubros.
function _fgSyncVista(){
  var v=_optSolapa(_fgOpt),cambio=(v!==_fgVista);
  _fgVista=v;_fgUltOpt[v]=_optN(_fgOpt);
  var lay=document.getElementById('layout'),enArmador=!!(lay&&lay.style.display==='grid');
  if(enArmador){
    _OPC_SOLAPAS.forEach(function(s){var t=_apptab(s);if(t)t.classList.toggle('active',v===s);});
    _VISTAS.forEach(function(x){var t=_apptab(x.id);if(t)t.classList.remove('active');});
  }
  if(cambio)_facSyncOptBar();else _fgRenderOptBar();
  _ptitleSync();
  var bf=document.getElementById('fg-benef-fields');if(bf)bf.style.display=_solCfg(v).benef?'':'none';
  _fgMarcarMontoFlyer(); // el cuadro "Montos activos" marca cuál sale impreso
  if(typeof _mpRefresh==='function'&&_facLoaded)_mpRefresh(); // la tarjeta del masivo sigue a la opción activa
  if(_solCfg(v).benef&&typeof _fgBenefSyncNombre==='function'){_fgBenefSyncNombre();_fgBenefFieldsSync();}
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
  // con un prototipo abierto la barra se ve aunque haya una sola opción: es la
  // forma de volver al flyer original
  if(opts.length>1||_fgProtos.some(function(p){return opts.indexOf(p.opcion)>=0;}))_fgEnsureOptBar();
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
// La barra negra de abajo es position:fixed: sin esto tapaba el final de la
// lista y del flyer. Publica su alto real en --simbar-h y las pantallas
// (.layout/.promos-view/.hunter-view) se achican esa cantidad.
function _facSimAlto(){
  var b=document.getElementById('fac-simbar');
  if(b)document.documentElement.style.setProperty('--simbar-h',(b.offsetHeight||0)+'px');
  else document.documentElement.style.removeProperty('--simbar-h');
}
window.addEventListener('resize',function(){if(_simRole)_facSimAlto();});
function _facSimBar(){
  var b=document.getElementById('fac-simbar');
  if(!_simRole){if(b&&b.parentNode)b.parentNode.removeChild(b);_facSimAlto();return;}
  if(!b){
    b=document.createElement('div');b.id='fac-simbar';
    document.body.appendChild(b);
  }
  b.innerHTML='<span>Vista previa: <strong>'+_escHtml(_ROLE_LBL[_simRole]||_simRole)+'</strong>. '+
    'As&iacute; ve la app este perfil.</span>'+
    '<button onclick="stopFacSim()">Salir de la vista previa</button>';
  _facSimAlto();
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
    '<div>Funcionalidad</div><div title="Tu propia cuenta: lo que destildes ac&aacute; no afecta al otro administrador">Vos<br><span style="font-weight:400;font-size:.75rem;opacity:.7">(tu cuenta)</span></div>'+
    _FAC_ROLES.map(function(r){
      return '<div><span class="fac-sim" onclick="startFacSim(\''+r[0]+'\')" '+
        'title="Ver la app como la ve un '+_escAttr(r[1])+'">'+_escHtml(r[1])+' <span class="fac-eye">&#128065;</span></span></div>';
    }).join('')+'</div>';
  var grpAnt='';
  var rows=_facRows().map(function(f){
    var id=f[0],grp=f[3]||'';
    // Al entrar en un grupo nuevo, primero su cabecera plegable.
    var cab=(grp&&grp!==grpAnt)?_facGrpRow(grp,cols):'';
    grpAnt=grp;
    var clase='fac-row'+(grp?' fac-sub':'')+((grp&&!_facGrpOpen[grp])?' fac-oculta':'');
    // El tutorial automático nunca corre para el admin (_tourAutoStart corta
    // por _adminNow): en su columna no hay nada que decidir.
    var meCell=(id==='tutorial_auto')
      ?'<div title="No aplica al administrador: pod&eacute;s verlo desde tu nombre &rarr; Ver tutorial" style="color:var(--gray)">&mdash;</div>'
      :'<div><input type="checkbox"'+(_facEditMe[id]?' checked':'')+' onchange="_facFieldMe(\''+id+'\',this)"></div>';
    return cab+'<div class="'+clase+'"'+(grp?' data-grp="'+grp+'"':'')+' style="grid-template-columns:'+cols+'">'+
      '<div><div class="fac-name">'+f[1]+'</div><div class="fac-desc">'+f[2]+'</div></div>'+
      meCell+
      _FAC_ROLES.map(function(r){
        // El Hunter sólo descarga: de todas estas filas, las que significan algo
        // para él son las opcion_N (qué flyers puede bajar) y la lista corta de
        // _HUN_FAC (Promociones, Notas, Tutorial, Proponer cambios). El resto no
        // se puede tildar, y si quedó tildado en el JSON viejo _can lo ignora igual.
        if(r[0]==='hunter'&&id.indexOf('opcion_')!==0&&!_HUN_FAC[id])
          return '<div title="No aplica al perfil Hunter: s&oacute;lo busca una empresa y baja su flyer" style="color:var(--gray)">&mdash;</div>';
        if(r[0]==='lider'&&!_LID_FAC[id])
          return '<div title="No aplica al perfil L&iacute;der: s&oacute;lo mira el tablero de su equipo" style="color:var(--gray)">&mdash;</div>';
        var on=_facEdit[r[0]]&&_facEdit[r[0]][id];
        return '<div><input type="checkbox"'+(on?' checked':'')+
          ' onchange="_facField(\''+r[0]+'\',\''+id+'\',this.checked)"></div>';
      }).join('')+
    '</div>';
  }).join('');
  host.innerHTML='<div class="fac-grid">'+head+rows+'</div>';
  _gesFlagRender();
}
// Qué grupos de opciones están desplegados. Arrancan TODOS plegados (la lista de
// opciones crece con cada flyer nuevo y así la pantalla se lee de un vistazo);
// vive fuera de renderFacultades para que un re-render no cierre lo que el admin
// acababa de abrir.
var _facGrpOpen={};
// Cabecera de un grupo: flecha, el nombre del menú (si el admin renombró la
// solapa, acá se llama igual), cuántas opciones tiene, y por columna cuántas
// están habilitadas — así no hay que desplegar para saber cómo está cada perfil.
function _facGrpRow(sol,cols){
  var opts=_facOptsSol(sol),n=opts.length;
  var cuenta=function(fn){var k=0;opts.forEach(function(o){if(fn('opcion_'+o))k++;});return k;};
  var cel=function(col,k){return '<div class="fac-cnt" id="fac-cnt-'+sol+'-'+col+'">'+k+'/'+n+'</div>';};
  return '<div class="fac-row fac-grp'+(_facGrpOpen[sol]?' abierto':'')+'" data-grph="'+sol+'"'+
      ' onclick="_facGrpTog(\''+sol+'\')" title="Mostrar u ocultar las opciones de esta solapa"'+
      ' style="grid-template-columns:'+cols+'">'+
    '<div><div class="fac-name"><span class="fac-car">&#9654;</span>'+_escHtml(_solapaLabel(sol))+
      '<span class="fac-grp-n">'+n+(n===1?' opci&oacute;n':' opciones')+'</span></div></div>'+
    cel('me',cuenta(function(k){return _facEditMe&&_facEditMe[k];}))+
    _FAC_ROLES.map(function(r){
      return cel(r[0],cuenta(function(k){return _facEdit&&_facEdit[r[0]]&&_facEdit[r[0]][k];}));
    }).join('')+
  '</div>';
}
function _facGrpTog(sol){
  var host=document.getElementById('fac-grid');if(!host)return;
  var abierto=!_facGrpOpen[sol];_facGrpOpen[sol]=abierto;
  Array.prototype.forEach.call(host.querySelectorAll('[data-grp="'+sol+'"]'),function(el){
    el.classList.toggle('fac-oculta',!abierto);
  });
  var h=host.querySelector('[data-grph="'+sol+'"]');if(h)h.classList.toggle('abierto',abierto);
}
// Refresca los números de las cabeceras al tildar. No se re-renderiza la grilla
// a propósito: eso rearmaría _facEdit desde lo guardado y perdería los cambios
// que todavía no se apretó "Guardar cambios".
function _facCntSync(){
  var host=document.getElementById('fac-grid');if(!host)return;
  _facSolOrden().forEach(function(sol){
    var opts=_facOptsSol(sol),n=opts.length;
    var cuenta=function(fn){var k=0;opts.forEach(function(o){if(fn('opcion_'+o))k++;});return k;};
    var set=function(col,k){var el=document.getElementById('fac-cnt-'+sol+'-'+col);if(el)el.textContent=k+'/'+n;};
    set('me',cuenta(function(k){return _facEditMe&&_facEditMe[k];}));
    _FAC_ROLES.forEach(function(r){
      set(r[0],cuenta(function(k){return _facEdit&&_facEdit[r[0]]&&_facEdit[r[0]][k];}));
    });
  });
}
function _facField(role,f,v){if(_facEdit&&_facEdit[role])_facEdit[role][f]=!!v;_facCntSync();}
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
  _facCntSync();
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
// Ficha pública de una promoción en el sitio de Galicia. El formato lo usa el
// propio buscador: /promocion/{id}|{titulo}|{tipoPromocion}. Abre sin login y
// muestra vigencia, días, medios de pago y los términos y condiciones.
// Verificado sobre los tres tipos que trae el catálogo (Marca, Categoria,
// Shopping). El id es lo único que manda: el título de la URL sólo se ve en el
// encabezado de la página, así que un título con acentos o "&" no la rompe.
var PROMO_DETALLE_BASE='https://beneficios.galicia.ar/promocion/';
function _promoUrl(p){
  if(!p||!p.id)return '';
  var t=_promoDecodeEntities(p.titulo||''),tipo=p.tipo_promocion||p.tipoPromocion||'Marca';
  return PROMO_DETALLE_BASE+encodeURIComponent(p.id)+'|'+encodeURIComponent(t)+'|'+encodeURIComponent(tipo);
}
var _promosCat=null,_promosCatLoading=false,_promosResultados=null,_promosMesRef=null;

// ── Provincia ───────────────────────────────────────────────────────────────
// El catálogo de Galicia es nacional: una promo puede estar perfectamente
// vigente y no tener un solo local en la zona del asesor, y esa marca no sirve
// para su flyer. La provincia de cada promo se sincroniza junto con el catálogo
// (columna provincias) y el filtrado corre acá, en memoria.
var _promosUbic=[];       // lista maestra de Galicia: [{nombre, localidades:[...]}]
var _promosProv='';       // provincia elegida; '' = todas
var _promosLoc='';        // localidad (extra de la solapa "Activas")
var _promosRubro='';      // rubro/categoría (idem)
var _promosLocIds=null;   // ids que devolvió Galicia para la localidad elegida
var _promosModo='buscar'; // 'buscar' (valida un flyer) | 'activas' (lista una provincia)

// Ojo con los tres valores de provincias (ver migración 011): un array con
// nombres, un array VACÍO (se verificó: no tiene locales, es compra online) y
// null (nunca se calculó). Confundir los dos últimos haría que un catálogo sin
// geografía pareciera "todo online" y el filtro no descartara nada en silencio.
function _promoGeoConocida(p){return !!(p&&Array.isArray(p.provincias));}
function _promoProvsDe(p){return _promoGeoConocida(p)?p.provincias:[];}
function _promoEsOnline(p){return _promoGeoConocida(p)&&!p.provincias.length;}
function _promoEnProvincia(p,prov){
  if(!prov)return true;
  if(!_promoGeoConocida(p))return true; // sin el dato no se castiga a la promo
  if(!p.provincias.length)return true;  // online: entra en cualquier provincia
  var k=_promoNormalizar(prov);
  for(var i=0;i<p.provincias.length;i++)if(_promoNormalizar(p.provincias[i])===k)return true;
  return false;
}
// ¿El catálogo cargado trae geografía? Si no, el filtro por provincia no puede
// hacer su trabajo y hay que decirlo en vez de fingir que filtró.
function _promosHayGeo(){
  var c=_promosCat||[];
  for(var i=0;i<c.length;i++)if(_promoGeoConocida(c[i]))return true;
  return false;
}
// Texto de la columna "Dónde". Devuelve la lista COMPLETA aunque en pantalla se
// muestre resumida: es contra esto que corre el filtro, así que buscar "neuquen"
// encuentra la promo aunque la celda diga "Buenos Aires y 6 más".
// Se recuerda por la lista de provincias de la promo (no cambia una vez cargada):
// los filtros de Promociones la armaban de nuevo por fila en cada tecla.
var _promoDondeC=new WeakMap();
function _promoDondeNombres(p){
  var v=_promoDondeC.get(p.provincias);
  if(!v)_promoDondeC.set(p.provincias,v=p.provincias.map(_promoTitulizar).sort());
  return v;
}
function _promoDondeTexto(p){
  if(!_promoGeoConocida(p))return '';
  if(!p.provincias.length)return 'Online';
  return _promoDondeNombres(p).join(', ');
}
// Cuántas provincias hay en total (para resumir "Todo el país"): se pedía por
// cada fila de la tabla y, sin la geografía cargada, recorría el catálogo entero.
var _promoProvN={cat:null,ub:-1,n:0};
function _promosProvinciasN(){
  if(_promoProvN.cat!==_promosCat||_promoProvN.ub!==_promosUbic.length)
    _promoProvN={cat:_promosCat,ub:_promosUbic.length,n:_promosProvincias().length};
  return _promoProvN.n;
}
function _promoDondeHtml(r){
  var p=r.promo;
  if(!p||!_promoGeoConocida(p))return '<span class="promos-donde">-</span>';
  if(!p.provincias.length){
    return '<span class="promos-online" title="Compra por internet: no tiene local, as&iacute; que sirve desde cualquier provincia.">Online</span>';
  }
  var nombres=_promoDondeNombres(p),full=nombres.join(', '),txt;
  var todas=_promosProvinciasN();
  // Una promo puede estar en las 24: escupir la lista entera en cada fila
  // rompía el ancho de la tabla, así que se resume y el detalle va al title.
  if(todas&&nombres.length>=todas)txt='Todo el país';
  else if(nombres.length>2)txt=nombres.slice(0,2).join(', ')+' y '+(nombres.length-2)+' más';
  else txt=full;
  return '<span class="promos-donde" title="'+_escAttr(full)+'">'+_escHtml(txt)+'</span>';
}

// Primera vez que se entra a la pestaña: pone el mes actual por default y
// dispara la carga del catálogo (que a su vez sincroniza sola si está vieja).
function initPromosTab(){
  var mesInp=document.getElementById('promos-mes');
  if(mesInp&&!mesInp.value){
    var d=new Date();
    mesInp.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  _promoTildeNuevas();
  if(!_promosCat&&!_promosCatLoading)loadPromosCatalogo();
}
// Tilde "Sólo las nuevas" de la solapa Activas, al lado de "Una sola fila por
// marca". Se agrega desde acá y no en _source.html para que sobreviva si se
// regenera la plantilla.
function _promoTildeNuevas(){
  if(document.getElementById('promos-nuevas'))return;
  var um=document.getElementById('promos-unamarca');
  var lbl=um&&um.closest('label');if(!lbl)return;
  var l=document.createElement('label');
  l.className='promos-chk';l.htmlFor='promos-nuevas';
  l.title='Promociones que aparecieron en el catálogo de Galicia en los últimos '+_PROMO_NUEVA_DIAS+' días.';
  l.innerHTML='<input type="checkbox" id="promos-nuevas" onchange="_promoSetSoloNuevas(this.checked)"> Sólo las nuevas (últimos '+_PROMO_NUEVA_DIAS+' días)';
  lbl.parentNode.insertBefore(l,lbl.nextSibling);
}
function _promoSetSoloNuevas(on){
  _promosFiltros.nuevas=on?'solo':'';
  _promosPintarFilas();
}
// "Nueva" = apareció en el catálogo en los últimos 7 días (primera_vez la pone
// la base al insertarla; null = ya estaba antes de que se llevara la cuenta).
var _PROMO_NUEVA_DIAS=7;
function _promoEsNueva(p){
  if(!p||!p.primera_vez)return false;
  var t=Date.parse(p.primera_vez);
  return isFinite(t)&&(Date.now()-t)<_PROMO_NUEVA_DIAS*864e5;
}
function _promoNuevaHtml(p){
  if(!_promoEsNueva(p))return '';
  return ' <span class="promos-nueva" title="Apareci&oacute; en el cat&aacute;logo de Galicia el '+
    _promosFmtFecha(String(p.primera_vez).slice(0,10))+'">Nueva</span>';
}

// ── Solapas de la vista Promociones ─────────────────────────────────────────
// "Buscar" valida las marcas de un flyer ya armado; "Activas" lista todo lo
// vigente de una provincia para armar uno desde cero. Comparten la provincia,
// la tabla de resultados y el Excel; lo único que cambia es de dónde salen las
// filas y qué columnas tienen sentido.
function switchPromoTab(t){
  _promosModo=(t==='activas')?'activas':'buscar';
  ['buscar','activas'].forEach(function(id){
    var pane=document.getElementById('ptab-'+id);
    if(pane)pane.classList.toggle('active',id===_promosModo);
  });
  var tabs=document.querySelectorAll('.promos-view .tabs .ptab');
  Array.prototype.forEach.call(tabs,function(el,i){
    var on=(i===0)===(_promosModo==='buscar');
    el.classList.toggle('active',on);
    el.setAttribute('aria-selected',on?'true':'false');
    el.setAttribute('tabindex',on?'0':'-1');
  });
  // Los resultados de un modo no tienen sentido en el otro (distintas columnas
  // y distinto significado de cada fila), así que la tabla se vacía al cambiar.
  _promosResultados=null;
  _promosLocIds=null;
  _promoResetFiltros();
  if(_promosModo==='activas')_promosPoblarRubros();
  renderPromosResultados();
}

// El <select> de provincias sale de la lista maestra que Galicia devuelve en el
// mismo sync del catálogo. Si todavía no hay (catálogo nunca sincronizado), se
// arma con las provincias que aparezcan en las promos, para no dejar el filtro
// inservible mientras tanto.
function _promosProvincias(){
  if(_promosUbic.length)return _promosUbic.map(function(u){return String(u&&u.nombre||'');}).filter(Boolean);
  var vistas={};
  (_promosCat||[]).forEach(function(p){_promoProvsDe(p).forEach(function(n){vistas[n]=1;});});
  return Object.keys(vistas).sort();
}
function _promosPoblarProvincias(){
  var sel=document.getElementById('promos-prov');if(!sel)return;
  // Catálogo sincronizado por una versión vieja (sin la columna provincias):
  // antes que filtrar por un dato que no existe, se desactiva y se explica.
  if(_promosCat&&_promosCat.length&&!_promosHayGeo()){
    _promosProv='';
    sel.disabled=true;
    sel.innerHTML='<option value="">Actualizá el catálogo para filtrar por provincia</option>';
    _promosPoblarLocalidades();
    return;
  }
  sel.disabled=false;
  var provs=_promosProvincias();
  sel.innerHTML='<option value="">Todas las provincias</option>'+provs.map(function(n){
    return '<option value="'+_escAttr(n)+'"'+(_promosProv===n?' selected':'')+'>'+_escHtml(_promoTitulizar(n))+'</option>';
  }).join('');
  _promosPoblarLocalidades();
}
function _promosPoblarLocalidades(){
  var sel=document.getElementById('promos-loc');if(!sel)return;
  var u=null;
  for(var i=0;i<_promosUbic.length;i++){if(String(_promosUbic[i].nombre)===_promosProv){u=_promosUbic[i];break;}}
  var locs=(u&&Array.isArray(u.localidades))?u.localidades:[];
  sel.disabled=!locs.length;
  sel.innerHTML='<option value="">'+(_promosProv?'Todas las localidades':'Elegí una provincia primero')+'</option>'+
    locs.map(function(n){
      return '<option value="'+_escAttr(n)+'"'+(_promosLoc===n?' selected':'')+'>'+_escHtml(_promoTitulizar(n))+'</option>';
    }).join('');
}
function _promosPoblarRubros(){
  var sel=document.getElementById('promos-rubro');if(!sel)return;
  var vistos={};
  (_promosCat||[]).forEach(function(p){
    if(p.subtitulo)vistos[_promoDecodeEntities(p.subtitulo)]=1;
  });
  sel.innerHTML='<option value="">Todos los rubros</option>'+Object.keys(vistos).sort().map(function(n){
    return '<option value="'+_escAttr(n)+'"'+(_promosRubro===n?' selected':'')+'>'+_escHtml(n)+'</option>';
  }).join('');
}
// Galicia manda todo en mayúsculas ("SAN CARLOS DE BARILOCHE"): en un
// desplegable de 300 opciones eso se lee mal, así que se muestra capitalizado.
function _promoTitulizar(s){
  return String(s||'').toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúñ])/g,function(m,a,b){return a+b.toUpperCase();});
}

function _promoSetProvincia(v){
  _promosProv=v||'';
  _promosLoc='';_promosLocIds=null;
  _promosPoblarLocalidades();
  // Cambiar de provincia cambia el veredicto de cada marca, no sólo qué filas
  // se ven. En "Buscar" alcanza con recalcular el estado; en "Activas" la
  // lista entera es de la provincia, así que se rehace.
  if(_promosModo==='activas'){if(_promosResultados)buscarPromosActivas();}
  else _promoRecalcularEstados();
}
function _promoSetLocalidad(v){_promosLoc=v||'';_promosLocIds=null;if(_promosResultados)buscarPromosActivas();}
function _promoSetRubro(v){_promosRubro=v||'';if(_promosResultados)buscarPromosActivas();}
// Las online se muestran siempre marcadas; el tilde sólo las saca de la vista.
// Va como filtro (no como bandera aparte) para que lo respeten el contador
// "Mostrando X de Y" y el Excel, que exporta lo que se está viendo.
function _promoSetOcultarOnline(on){
  _promosFiltros.online=on?'ocultar':'';
  _promosPintarFilas();
}
// Una marca suele tener varias promociones a la vez (una por tarjeta, otra por
// plazo): en la lista de una provincia eso es casi el 40% de las filas
// ("Digital Sport" aparece 10 veces en Neuquén, "Combustible" 8). Con el tilde
// puesto queda una fila por marca.
function _promoSetUnaPorMarca(on){
  _promosFiltros.repetidas=on?'ocultar':'';
  _promosPintarFilas();
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
  el.textContent='Catálogo actualizado: '+d.toLocaleDateString('es-AR')+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+
    _promosHace(d)+'. '+(meta.total||0).toLocaleString('es-AR')+' promociones. Se actualiza solo todos los días a las 9.';
}
// Antigüedad de la copia en palabras. Importa que se vea: Galicia publica las
// promos nuevas en tandas a lo largo del día, así que "de hace 20 horas" ya
// puede no tener la campaña que el asesor está buscando.
function _promosHace(d){
  var min=Math.round((Date.now()-d.getTime())/60000);
  if(min<60)return '';
  var hs=Math.round(min/60);
  if(hs<24)return ' (hace '+hs+' h)';
  var dd=Math.round(hs/24);
  return ' (hace '+dd+(dd===1?' día)':' días)');
}

// Trae el catálogo completo a memoria + la metadata de sincronización. Sólo
// dispara un sync si el catálogo nunca se sincronizó: la copia la refresca
// todos los días a las 9 una tarea programada en la base (pg_cron, migración
// 024), y para lo publicado durante el día está el botón "Actualizar catálogo
// ahora". Antes se refrescaba sola al abrir la solapa (copia de más de 6 h) y
// al no encontrar una marca, y las dos cosas hacían esperar al asesor (pedido
// del dueño, 16-oct-2026).
// PostgREST corta cada consulta en 1000 filas. El catálogo tiene ~1700, así
// que una sola select devolvía apenas las primeras 1000 y TODA marca que
// cayera más abajo (SushiClub, Starbucks, Freddo, Volta...) parecía "no
// existir". Por eso hay que traerlo por tandas hasta que una venga incompleta.
var _PROMOS_PAGINA=1000;
function _promosTraerTodo(desde,acc,cb){
  // El .order('id') es imprescindible: sin un orden estable, paginar con
  // .range() puede repetir o saltearse filas entre tandas (ver _sbTodo).
  _sbTodo(function(d,h){
    return _sb.from('promos_galicia_cache')
      .select('id,titulo,subtitulo,imagen,fecha_hasta,tipo_promocion,provincias,primera_vez,proximamente,fecha_desde,dias,beneficio')
      .order('id',{ascending:true})
      .range(d,h);
  },cb,_PROMOS_PAGINA,desde,acc);
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
    _sb.from('promos_galicia_meta').select('last_sync_at,total,ubicaciones').eq('id',1).single()
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
    _promosUbic=(meta&&Array.isArray(meta.ubicaciones))?meta.ubicaciones:[];
    _promosPoblarProvincias();
    _promosPoblarRubros();
    _promosCatLoading=false;
    // Auto-sync sólo si nunca se sincronizó (catálogo vacío y meta sin fecha).
    // No se dispara cuando el vacío se explica por un error o por RLS (meta
    // dice que hay filas): ahí sincronizar no arregla nada.
    var nuncaSync=!_promosCat.length&&!(meta&&meta.total>0);
    if(!(catRes&&catRes.error)&&nuncaSync&&!_promosSyncing){syncPromosCatalogo(false);}
    _promosCatDone();
  }).catch(function(e){
    console.error('loadPromosCatalogo:',e);
    showToast('Error cargando el catálogo de promociones: '+((e&&e.message)||e));
    _promosCat=_promosCat||[];
    _promosCatLoading=false;
    _promosCatDone();
  });
}

// Los botones de esta vista tienen un ícono SVG adentro: poner textContent para
// el "Cargando..." se lo comía y volvían con un emoji pegado. Se guarda el
// contenido original la primera vez y se restaura al soltar el botón.
function _promosBtnOcupado(btn,txt){
  if(!btn)return;
  if(btn._fgHtml==null)btn._fgHtml=btn.innerHTML;
  if(txt){btn.disabled=true;btn.textContent=txt;}
  else{btn.disabled=false;btn.innerHTML=btn._fgHtml;}
}
// Un solo auto-sync por carga de página: si Galicia falla, la recarga del
// catálogo que sigue al sync no tiene que volver a disparar otro sync (loop).
var _promosSyncing=false,_promosAutoSynced=false,_promosSyncWaiters=[];
function _promosSyncDone(err){
  var ws=_promosSyncWaiters;_promosSyncWaiters=[];
  ws.forEach(function(f){try{f(err);}catch(e){console.error('promos sync waiter:',e);}});
}
// cb(err) se llama siempre, también en los cortes de arriba: quien lo pasa
// suele tener un botón deshabilitado esperando y no puede quedar colgado.
function syncPromosCatalogo(manual,cb){
  // Si ya hay un sync en vuelo (el del arranque, típicamente), el que llega se
  // cuelga de ése en vez de pedir otro a Galicia.
  if(_promosSyncing){if(cb)_promosSyncWaiters.push(cb);return;}
  if(!manual){
    if(_promosAutoSynced){if(cb)cb('El catálogo ya se sincronizó en esta visita');return;}
    _promosAutoSynced=true;
  }
  if(cb)_promosSyncWaiters.push(cb);
  _promosSyncing=true;
  var btn=document.getElementById('promos-sync-btn');
  _promosBtnOcupado(btn,'Actualizando catálogo…');
  _callPromosFn('sync',{},function(err,d){
    _promosSyncing=false;
    _promosBtnOcupado(btn,'');
    if(err){
      console.error('promos sync:',err);
      // Si es manual siempre avisa; si fue el auto-sync en segundo plano, avisa
      // igual cuando no hay NADA cargado (si no, el usuario se queda mirando un
      // catálogo vacío sin ninguna pista de por qué).
      if(manual||!_promosCat||!_promosCat.length)showToast(/\b403\b/.test(String(err))
        ?'Galicia no dejó actualizar el catálogo ahora. Seguís viendo la última copia guardada.'
        :'No se pudo actualizar el catálogo de promociones: '+err);
      _promosSyncDone(err);
      return;
    }
    if(manual)showToast('Catálogo actualizado: '+((d&&d.data&&d.data.total)||0)+' promociones');
    // Los que esperan recién siguen cuando la copia nueva está en memoria.
    loadPromosCatalogo(function(){_promosSyncDone(null);});
  });
}

// ── Matching: marca del flyer -> promo del catálogo ─────────────────────────
// Galicia guarda algunos títulos con entidades HTML sin decodificar (ej. "Le
// Club Libros &amp; Música"). Se decodifican las comunes antes de comparar o
// mostrar; si no, "amp" quedaba colado como palabra en el normalizado y el
// nombre se veía mal en pantalla/Excel.
var _PROMO_ENTITIES={'&amp;':'&','&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&ntilde;':'ñ','&Ntilde;':'Ñ','&quot;':'"','&#39;':"'",'&apos;':"'"};
// Se llama por cada fila en cada tecla de los filtros de Promociones: las
// entidades empiezan todas con "&", así que sin "&" no hay nada que cambiar.
function _promoDecodeEntities(s){
  s=String(s||'');
  if(s.indexOf('&')<0)return s;
  for(var k in _PROMO_ENTITIES)s=s.split(k).join(_PROMO_ENTITIES[k]);
  return s;
}
// El resultado depende sólo del texto, así que se recuerda: "Validar" compara
// cada marca contra las ~1.900 promos del catálogo y normalizaba el título de
// cada una en cada marca (con 60 marcas, ~350.000 veces: la pantalla quedaba
// congelada unos segundos). Ahora cada texto se normaliza una sola vez.
var _promoNormC=new Map();
function _promoNormalizar(s){
  var k=String(s||''),v=_promoNormC.get(k);
  if(v!==undefined)return v;
  if(_promoNormC.size>=50000)_promoNormC.clear(); // techo de memoria
  _promoNormC.set(k,v=_promoNormalizarCalc(k));
  return v;
}
function _promoNormalizarCalc(s){
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
// Título normalizado, sus palabras y su forma sin espacios, POR PROMO: se arman
// una vez y se recuerdan mientras exista el objeto (un catálogo nuevo trae
// objetos nuevos; si el título cambiara, se rearma). Las palabras son de sólo
// lectura: nadie las modifica.
var _promoIdxC=(typeof WeakMap==='function')?new WeakMap():null;
function _promoIdx(p){
  var obj=!!(p&&typeof p==='object'),t=obj?p.titulo:undefined;
  var e=(_promoIdxC&&obj)?_promoIdxC.get(p):null;
  if(e&&e.t===t)return e;
  var n=_promoNormalizar(t);
  e={t:t,n:n,toks:_promoTokens(n),sinEsp:n.replace(/ /g,'')};
  if(_promoIdxC&&obj)_promoIdxC.set(p,e);
  return e;
}
function _promoBuscarCandidatos(marca,catalogo){
  var nMarca=_promoNormalizar(marca),tokensMarca=_promoTokens(nMarca);
  var sinEspMarca=_promoSinEspacios(marca);
  var scored=catalogo.map(function(p){
    var ix=_promoIdx(p),nTitulo=ix.n,tokensTitulo=ix.toks,score=0;
    var sinEspTitulo=ix.sinEsp;
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
    if(!actual||c.score>actual.score||(c.score===actual.score&&_promoMejorQue(c.promo,actual.promo)))porTitulo[key]=c;
  });
  var out=[];for(var k in porTitulo)out.push(porTitulo[k]);
  out.sort(function(a,b){return b.score-a.score;});
  return out;
}
// Entre dos promos de la misma marca, cuál sirve más para el flyer: primero
// la que ya está vigente (una "próximamente" todavía no se puede usar) y,
// entre iguales, la que vence más tarde.
function _promoMejorQue(a,b){
  if(!!a.proximamente!==!!b.proximamente)return !a.proximamente;
  return (a.fecha_hasta||'')>(b.fecha_hasta||'');
}
function _promoEstado(fechaHasta,mesRef){
  if(!fechaHasta)return 'SIN_FECHA';
  var fin=new Date(fechaHasta+'T23:59:59');
  var finDelMes=new Date(mesRef.getFullYear(),mesRef.getMonth()+1,0,23,59,59);
  if(fin<mesRef)return 'VENCIDA';
  if(fin<=finDelMes)return 'VENCE_ESTE_MES';
  return 'VIGENTE';
}
var _PROMO_ESTADO_LBL={VIGENTE:'Vigente',VENCE_ESTE_MES:'Vence este mes',VENCIDA:'Vencida',REVISAR:'Revisar',NO_ENCONTRADA:'No encontrada',SIN_FECHA:'Sin fecha informada',FUERA_PROV:'Fuera de la provincia',PROXIMA:'Próximamente'};
var _PROMO_ESTADO_CSS={VIGENTE:'vigente',VENCE_ESTE_MES:'vence',VENCIDA:'vencida',REVISAR:'revisar',NO_ENCONTRADA:'no',SIN_FECHA:'no',FUERA_PROV:'fuera',PROXIMA:'proxima'};

// Estado de una promo ya matcheada, con la provincia elegida puesta encima.
// Una vencida sigue diciendo "Vencida" aunque además esté fuera de la
// provincia: es el problema más grave de los dos y el que hay que arreglar
// primero en el flyer. Lo mismo para la que no informa fecha. "Próximamente"
// (Galicia ya la publicó pero todavía no arrancó) va después de la provincia:
// fuera de la provincia no sirve, empiece cuando empiece.
function _promoEstadoFinal(promo,mesRef){
  var base=_promoEstado(promo.fecha_hasta,mesRef);
  if(base==='VENCIDA'||base==='SIN_FECHA')return base;
  if(!_promoEnProvincia(promo,_promosProv))return 'FUERA_PROV';
  return promo.proximamente?'PROXIMA':base;
}
// Texto del estado como se ve en la etiqueta y en el Excel: la próxima dice
// cuándo empieza si se sabe ("Empieza el 20/10/2026").
function _promoEstadoTxt(r){
  if(r.estado==='PROXIMA'&&r.fechaDesde)return 'Empieza el '+_promosFmtFecha(r.fechaDesde);
  return _PROMO_ESTADO_LBL[r.estado]||r.estado;
}
// La fecha de inicio de las próximas ya viene en el catálogo: se usa de una y
// no se le pide a Galicia (fechaDesde undefined = "falta pedirla").
function _promoDesdeInicial(fila){
  if(fila.promo&&fila.promo.fecha_desde)fila.fechaDesde=fila.promo.fecha_desde;
  return fila;
}
// Cambiar de provincia no vuelve a matchear nada: el match no depende de la
// geografía, sólo el veredicto. Se recalcula el estado de lo que ya está en
// pantalla (y se conservan las fechas "Desde" que ya se trajeron).
function _promoRecalcularEstados(){
  if(!_promosResultados||!_promosMesRef)return;
  _promosResultados.forEach(function(r){
    if(r.promo&&!r.necesitaRevision)r.estado=_promoEstadoFinal(r.promo,_promosMesRef);
  });
  renderPromosResultados();
}

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
    _promosBtnOcupado(btn,'Cargando catálogo...');
    // loadPromosCatalogo encola el callback aunque ya haya una carga en vuelo,
    // así el botón siempre se vuelve a habilitar.
    loadPromosCatalogo(function(){
      _promosValidarPendiente=false;
      _promosBtnOcupado(btn,'');
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
    return _promoDesdeInicial({
      marca:marca,
      estado:necesitaRevision?'REVISAR':_promoEstadoFinal(mejor.promo,mesRef),
      promo:mejor.promo,
      candidatos:candidatos.slice(0,5),
      necesitaRevision:necesitaRevision,
      excluir:false
    });
  });

  _promosResultados=resultados;
  _promoResetFiltros();
  renderPromosResultados();

  // Aviso proactivo: el nombre del flyer y el del catálogo no siempre coinciden
  // ("Sushi Club" vs "SushiClub", "Alta Volta" vs "Volta"). Si algo quedó dudoso
  // o sin encontrar, se avisa con la propuesta ("Alta Volta → ¿Volta?") en vez de
  // esperar que lo descubra mirando la tabla fila por fila.
  var aRevisar=resultados.filter(function(r){return r.necesitaRevision;});
  var noHallada=resultados.filter(function(r){return r.estado==='NO_ENCONTRADA';});
  // Una marca sin ninguna coincidencia puede ser una promo que Galicia publicó
  // después de la actualización de las 9. Antes se refrescaba el catálogo y se
  // revalidaba sola, pero hacía esperar cada vez; ahora se avisa y el asesor
  // decide si toca "Actualizar catálogo ahora".
  if(aRevisar.length||noHallada.length){
    var partes=[];
    if(aRevisar.length){
      partes.push(aRevisar.length+' para revisar: '+aRevisar.slice(0,3).map(function(r){
        return r.marca+' → ¿'+_promoDecodeEntities(r.promo?r.promo.titulo:'?')+'?';
      }).join(', ')+(aRevisar.length>3?'...':''));
    }
    if(noHallada.length){
      partes.push(noHallada.length+' sin coincidencia: '+noHallada.slice(0,4).map(function(r){return r.marca;}).join(', ')+(noHallada.length>4?'...':'')+
        '. Si es una promo nueva de hoy, tocá «Actualizar catálogo ahora» y volvé a validar');
    }
    showToast(partes.join(' · '));
  }

  // Pide fechaDesde (no viene en el listado) sólo de los matches confirmados,
  // que son los que se van a mostrar como certeros.
  var ids=resultados.filter(function(r){return r.promo&&!r.necesitaRevision;}).map(function(r){return r.promo.id;});
  if(ids.length)_promosPedirDetalle(ids,resultados);
}

// ── Solapa "Promociones activas" ───────────────────────────────────────────
// No hay marcas pegadas: la lista sale del catálogo filtrado por la provincia
// elegida. Como el catálogo de Galicia nunca trae promociones vencidas, "lo
// vigente de esta provincia" es directamente lo que quedó después de filtrar.
function _promosActivasBtn(){return document.getElementById('promos-activas-btn');}
function buscarPromosActivas(){
  if(_promosModo!=='activas')switchPromoTab('activas');
  if(!_promosProv){showToast('Elegí una provincia para ver sus promociones');return;}
  var btn=_promosActivasBtn();
  if(!_promosCat||!_promosCat.length){
    // Mismo reintento que validarPromos: si el catálogo todavía venía en
    // camino, se busca solo al llegar en vez de pedir otro click.
    if(_promosActivasPendiente)return;
    _promosActivasPendiente=true;
    _promosBtnOcupado(btn,'Cargando catálogo...');
    loadPromosCatalogo(function(){
      _promosActivasPendiente=false;
      _promosBtnOcupado(btn,'');
      if(_promosCat&&_promosCat.length){buscarPromosActivas();return;}
      if(_promosSyncing)showToast('El catálogo se está sincronizando por primera vez; probá de nuevo en unos segundos.');
      else showToast('El catálogo de promociones está vacío. Tocá "Actualizar catálogo ahora".');
    });
    return;
  }
  _promosActivasPendiente=false;

  // La localidad no se puede precalcular (son ~4200), así que se la pedimos a
  // Galicia en el momento y nos quedamos sólo con los ids: el resto de los
  // datos ya está en memoria.
  if(_promosLoc&&!_promosLocIds){
    _promosBtnOcupado(btn,'Buscando en la localidad...');
    _callPromosFn('ubicacion',{provincia:_promosProv,localidad:_promosLoc},function(err,d){
      _promosBtnOcupado(btn,'');
      if(err||!d||!d.data){
        console.error('promos ubicacion:',err||d);
        showToast('No se pudo filtrar por localidad, mostramos toda la provincia.');
        _promosLoc='';
        var sl=document.getElementById('promos-loc');if(sl)sl.value='';
      }else{
        _promosLocIds=d.data.ids||[];
      }
      buscarPromosActivas();
    });
    return;
  }

  var mesRef=new Date();
  _promosMesRef=mesRef;
  var porId=null;
  if(_promosLoc&&_promosLocIds){
    porId={};
    _promosLocIds.forEach(function(id){porId[id]=1;});
  }
  var filas=[];
  (_promosCat||[]).forEach(function(pr){
    if(!_promoEnProvincia(pr,_promosProv))return;
    if(porId&&!porId[pr.id]&&!_promoEsOnline(pr))return; // las online no son de ninguna localidad
    if(_promosRubro&&_promoDecodeEntities(pr.subtitulo||'')!==_promosRubro)return;
    filas.push(_promoDesdeInicial({
      marca:_promoDecodeEntities(pr.titulo||''),
      estado:_promoEstadoFinal(pr,mesRef), // ya están todas en la provincia
      promo:pr,
      candidatos:[],
      necesitaRevision:false,
      excluir:false
    }));
  });
  filas.sort(function(a,b){return a.marca.toLowerCase()<b.marca.toLowerCase()?-1:1;});
  _promosResultados=filas;
  _promoResetFiltros();
  renderPromosResultados();
  if(!filas.length)showToast('No hay promociones vigentes con esos filtros.');
}
var _promosActivasPendiente=false;

// La fecha de inicio no viene en el listado: hay que pedirla de a una. Para un
// flyer de 40 marcas eso es transparente, pero una provincia entera son cientos
// de consultas a Galicia, así que acá se piden a pedido y sólo de lo que se
// está viendo.
var _PROMO_DESDE_MAX=400,_PROMO_DESDE_CONFIRMA=160;
function _promosSinDesde(){
  return _promosFilasVisibles().filter(function(v){
    return v.r.promo&&!v.r.excluir&&v.r.fechaDesde===undefined;
  });
}
function completarFechasDesde(){
  var faltan=_promosSinDesde();
  if(!faltan.length){showToast('Ya están todas las fechas "Desde" de lo que estás viendo.');return;}
  var ids=faltan.map(function(v){return v.r.promo.id;});
  if(ids.length>_PROMO_DESDE_MAX){
    showToast('Son '+ids.length+' promociones y hay que consultarlas de a una: filtrá un poco más (máximo '+_PROMO_DESDE_MAX+').');
    return;
  }
  var resultados=_promosResultados;
  function arrancar(){_promosPedirDetalle(ids,resultados);}
  if(ids.length>_PROMO_DESDE_CONFIRMA){
    fgConfirm('¿Traemos las fechas de inicio?\nHay que consultarle a Galicia '+ids.length+' promociones, de a 80 por vez. Puede tardar unos segundos.',
      {peligro:false},function(ok){if(ok)arrancar();});
  }else arrancar();
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
  // Si esta fila ya estaba elegida para "Armar franja" con la coincidencia de
  // antes, se reemplaza por la nueva en el mismo lugar del orden (o se saca si
  // ahora no tiene coincidencia o no sirve para el flyer). Ver _fgElegir.
  var antes=(typeof _fgElegirNum==='function')?_fgElegirNum(r):0;
  if(sel<0||!r.candidatos[sel]){
    r.promo=null;r.estado='NO_ENCONTRADA';r.necesitaRevision=false;r.fechaDesde=null;
  }else{
    r.promo=r.candidatos[sel].promo;
    r.necesitaRevision=false;
    r.estado=_promoEstadoFinal(r.promo,_promosMesRef||new Date());
    r.fechaDesde=null;
    // el detalle (fechaDesde) de esta única fila recién confirmada
    // la respuesta vale sólo si la fila sigue con ESTA coincidencia (si se
    // cambió otra vez mientras tanto, r.promo ya es otra o es null)
    var pid=r.promo.id;
    _callPromosFn('detalle',{ids:[pid]},function(err,d){
      if(!err&&d&&d.data&&d.data[pid]!==undefined&&r.promo&&r.promo.id===pid){r.fechaDesde=d.data[pid];renderPromosResultados();}
    });
  }
  if(antes&&_fgElegir){
    var S=_fgElegir.st.sel,sirve=r.promo&&r.promo.imagen&&r.estado!=='VENCIDA'&&r.estado!=='FUERA_PROV';
    var ya=sirve&&S.some(function(x,j){return j!==antes-1&&x.img===r.promo.imagen;});
    if(sirve&&!ya){S[antes-1]={img:r.promo.imagen,t:_promoDecodeEntities(r.promo.titulo||'')};_fgLgTraer(r.promo.imagen).catch(function(){});}
    else S.splice(antes-1,1);
    _fgElegirBar();
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
var _promosFiltros={global:'',logo:'',marca:'',match:'',cat:'',donde:'',desde:'',hasta:'',estado:'',online:'',repetidas:'',nuevas:''};
// Filtros en cero para una corrida nueva: si quedaran los de la anterior,
// esconderían parte de los resultados y parecería que "faltan" marcas. El
// orden también vuelve al natural. La provincia y el tilde de "ocultar las
// online" NO se tocan: son el contexto en el que el asesor está trabajando,
// no un filtro de estos resultados, y perderlos en cada validación obligaría
// a volver a elegirlos todo el tiempo.
function _promoResetFiltros(){
  var online=_promosFiltros.online,repetidas=_promosFiltros.repetidas,nuevas=_promosFiltros.nuevas;
  for(var k in _promosFiltros)_promosFiltros[k]='';
  _promosFiltros.online=online;
  _promosFiltros.repetidas=repetidas;
  _promosFiltros.nuevas=nuevas;
  _promosOrden={campo:'',dir:1};
  var b=document.getElementById('promos-buscar');if(b)b.value='';
}
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
  // El tilde de "ocultar las online" vive en _promosFiltros para que lo
  // respeten el contador y el Excel, así que limpiar los filtros lo destilda.
  var o=document.getElementById('promos-sinubic');if(o)o.checked=false;
  var um=document.getElementById('promos-unamarca');if(um)um.checked=false;
  var nu=document.getElementById('promos-nuevas');if(nu)nu.checked=false;
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
    donde:r.promo?_promoDondeTexto(r.promo):'',
    online:!!(r.promo&&_promoEsOnline(r.promo)),
    tieneLogo:!!(r.promo&&r.promo.imagen)
  };
}
// Minúsculas recordadas por texto: cada tecla en un filtro pasaba a minúsculas
// los mismos ~7 campos de cada una de las ~1.500 filas.
var _promoMinC=new Map();
function _promoMin(s){
  var k=String(s),v=_promoMinC.get(k);
  if(v!==undefined)return v;
  if(_promoMinC.size>=50000)_promoMinC.clear(); // techo de memoria
  _promoMinC.set(k,v=k.toLowerCase());
  return v;
}
function _promoCoincideFiltro(r){
  var f=_promosFiltros,c=_promoCampos(r);
  function contiene(txt,q){return !q||_promoMin(txt).indexOf(_promoMin(q))>=0;}
  if(f.logo==='con'&&!c.tieneLogo)return false;
  if(f.logo==='sin'&&c.tieneLogo)return false;
  if(!contiene(c.marca,f.marca))return false;
  if(!contiene(c.match,f.match))return false;
  if(f.cat&&c.cat!==f.cat)return false;
  // Las de compra online se muestran siempre marcadas; el tilde sólo las saca
  // de la vista (y por lo tanto también del contador y del Excel).
  if(f.online==='ocultar'&&c.online)return false;
  if(f.nuevas==='solo'&&!(r.promo&&_promoEsNueva(r.promo)))return false;
  if(!contiene(c.donde,f.donde))return false;
  if(!contiene(c.desde,f.desde))return false;
  if(!contiene(c.hasta,f.hasta))return false;
  if(f.estado&&c.estado!==f.estado)return false;
  if(f.global){
    var enAlguno=contiene(c.marca,f.global)||contiene(c.match,f.global)||contiene(c.cat,f.global)||
      contiene(c.donde,f.global)||contiene(_promoEstadoTxt(r),f.global)||(r.promo&&_promoEsNueva(r.promo)&&contiene('Nueva',f.global));
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
var _PROMO_ORDEN_ESTADO={NO_ENCONTRADA:0,VENCIDA:1,FUERA_PROV:2,VENCE_ESTE_MES:3,REVISAR:4,PROXIMA:5,SIN_FECHA:6,VIGENTE:7};
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
  ['donde','Dónde (A → Z)'],
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
  // Sólo en "Activas": en "Buscar" cada fila ya es una marca distinta pegada
  // por el usuario, y esconderle una que escribió sería una sorpresa fea.
  if(_promoModoActivas()&&_promosFiltros.repetidas==='ocultar')out=_promoUnaPorMarca(out);
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

// En "Activas" no hay marca pegada por el usuario ni ambigüedad que
// resolver, así que esa columna (y su desplegable de candidatos) no van.
function _promoModoActivas(){return _promosModo==='activas';}
function _promoNumCols(){return _promoModoActivas()?9:10;}
// Nombre de la marca sin la variante: Galicia carga la misma marca muchas
// veces con un sufijo distinto ("Serú Giran - Neuquén", "Babasonicos en
// Tucumán", "Columbia.com.ar", "Centro de Esquí Cerro Bayo - Oso Café").
// Depende sólo del texto: se recuerda ("Una por marca" la pedía dos veces por
// fila en cada tecla de los filtros).
var _promoBaseC=new Map();
function _promoBaseMarca(t){
  var k=String(t||''),v=_promoBaseC.get(k);
  if(v!==undefined)return v;
  var s=_promoDecodeEntities(k).split(/\s[-–—]\s|\s+en\s+|\.com|\s*\(/i)[0];
  if(_promoBaseC.size>=50000)_promoBaseC.clear(); // techo de memoria
  _promoBaseC.set(k,v=_promoNormalizar(s)||_promoNormalizar(t));
  return v;
}
// Agrupar por la primera palabra sería fácil y estaría mal: juntaría las 16
// farmacias distintas de Buenos Aires ("Farmacia Selma", "Farmacia Vera"...),
// las 4 ópticas y "El Zar" con "El Kuelgue". La regla es más exigente: un
// nombre corto agrupa a los que empiezan con él SÓLO si ese nombre existe como
// promoción por sí solo. Hay una promo que se llama "Adidas." y por eso
// "Adidas MDQ" y "Adidas Nordelta" caen con ella; no hay ninguna que se llame
// sólo "Farmacia", así que esas no se tocan. Auditado sobre Neuquén, Buenos
// Aires y Córdoba: ningún grupo junta marcas distintas.
function _promoClaveMarca(base,bases){
  var pal=base.split(' '),acc='';
  for(var i=0;i<pal.length;i++){
    acc=acc?acc+' '+pal[i]:pal[i];
    if(bases[acc])return acc; // el nombre más corto que existe como marca
  }
  return base;
}
// De cada grupo queda la ya vigente de vencimiento más lejano, que es la que
// sirve para armar un flyer (dura más). Mismo desempate que usa el matcher del
// buscador (_promoMejorQue).
function _promoUnaPorMarca(filas){
  // Las bases salen de la lista ENTERA y no de lo ya filtrado: si no, esconder
  // una fila cambiaría cómo se agrupan las demás.
  var bases={};
  (_promosResultados||[]).forEach(function(r){
    var t=r.marca||(r.promo?r.promo.titulo:'');
    if(t)bases[_promoBaseMarca(t)]=1;
  });
  var grupos={},orden=[];
  filas.forEach(function(v){
    var t=v.r.marca||(v.r.promo?v.r.promo.titulo:'');
    var k=t?_promoClaveMarca(_promoBaseMarca(t),bases):('#'+v.i); // sin título, cada fila es su grupo
    if(!grupos[k]){grupos[k]={mejor:v,n:0,nombres:[]};orden.push(k);}
    var g=grupos[k];g.n++;
    if(g.nombres.indexOf(t)<0)g.nombres.push(t);
    if(v.r.promo&&(!g.mejor.r.promo||_promoMejorQue(v.r.promo,g.mejor.r.promo)))g.mejor=v;
  });
  return orden.map(function(k){
    var g=grupos[k];
    g.mejor.r._otras=g.n-1;                                       // cuántas quedaron tapadas
    g.mejor.r._otrosNombres=g.nombres.length>1?g.nombres:null;    // y con qué nombre, para el globito
    return g.mejor;
  });
}
function _promoFilaHtml(r,i){
  var css=_PROMO_ESTADO_CSS[r.estado]||'no',act=_promoModoActivas();
  var logo=r.promo&&r.promo.imagen?
    '<img class="promos-logo" loading="lazy" decoding="async" src="'+_escAttr(PROMO_LOGO_BASE+r.promo.imagen)+'" onerror="this.classList.add(\'promos-logo-err\');this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'promos-logo promos-logo-err\',title:\'No se pudo cargar el logo\'}))" alt="">':
    '<div class="promos-logo promos-logo-empty" title="Sin coincidencia"></div>';
  var candSel='';
  if(r.necesitaRevision||r.estado==='NO_ENCONTRADA'){
    var opts=(r.candidatos||[]).map(function(c,ci){
      return '<option value="'+ci+'"'+(r.promo&&c.promo.id===r.promo.id?' selected':'')+'>'+_escHtml(_promoDecodeEntities(c.promo.titulo))+'</option>';
    }).join('');
    candSel='<select class="promos-cand-sel" onchange="_promoElegirCandidato('+i+',this.value)">'+
      '<option value="-1"'+(!r.promo?' selected':'')+'>— Elegir coincidencia —</option>'+opts+'</select>';
  }
  // Eligiendo marcas para "Armar franja": la primera columna es el botón "+"
  // (con el número de orden si ya está elegida), en Activas y en Buscar. Una
  // vencida o de otra provincia no va a un flyer: el "+" queda apagado y dice por qué.
  var eleg=(_fgElegir&&r.promo&&r.promo.imagen)?_fgElegirNum(r):-1;
  var noVa=eleg===0&&(r.estado==='VENCIDA'||r.estado==='FUERA_PROV');
  var primera=noVa?
    '<td><button type="button" class="promos-elegir" disabled title="'+(r.estado==='VENCIDA'?'Est&aacute; vencida: no se puede poner en la franja':'Es de otra provincia: no se puede poner en la franja')+'">+</button></td>':
    eleg>=0?
    '<td><button type="button" class="promos-elegir'+(eleg?' on':'')+'" onclick="fgElegirToggle('+i+')" aria-pressed="'+(eleg?'true':'false')+'" title="'+(_fgElegir.st.uno?'Poner esta marca en el flyer':eleg?'Sacar de la franja':'Agregar a la franja')+'">'+(eleg?eleg:'+')+'</button></td>':
    '<td><input type="checkbox" class="promos-excl" title="Excluir del reporte"'+(r.excluir?' checked':'')+
      ' onchange="_promoToggleExcluir('+i+',this.checked)"></td>';
  return '<tr class="'+(r.excluir?'excluida':'')+(eleg>0?' elegida':'')+'">'+primera+
    '<td>'+logo+'</td>'+
    (act?'':'<td>'+_escHtml(r.marca)+'</td>')+
    '<td>'+(r.promo?_escHtml(_promoDecodeEntities(r.promo.titulo))+_promoNuevaHtml(r.promo)+_promoOtrasHtml(r)+_promoDiasHtml(r.promo)+(candSel?'<br>'+candSel:''):(candSel||'-'))+'</td>'+
    '<td>'+(r.promo?_escHtml(_promoDecodeEntities(r.promo.subtitulo||'-')):'-')+'</td>'+
    '<td>'+_promoDondeHtml(r)+'</td>'+
    '<td>'+(r.promo?_promosFmtFecha(r.fechaDesde):'-')+'</td>'+
    '<td>'+(r.promo?_promosFmtFecha(r.promo.fecha_hasta):'-')+'</td>'+
    '<td><span class="promos-badge b-'+css+'">'+_escHtml(_promoEstadoTxt(r))+'</span></td>'+
    '<td>'+_promoLinkHtml(r)+'</td>'+
  '</tr>';
}
// "+N promos": la marca tiene otras promociones vigentes que quedaron
// tapadas por el tilde de "una sola fila por marca". Sin esto, la fila se ve
// igual que una marca que de verdad tiene una sola.
// Días de aplicación (los manda Galicia: "Viernes", "Martes y Jueves"). Se
// muestran en los supermercados, que es donde van debajo del logo en el flyer.
function _promoEsSuper(p){return !!(p&&/supermercado/i.test(_promoDecodeEntities(p.subtitulo||'')));}
function _promoDiasCrudo(p){return p&&p.dias?_promoDecodeEntities(String(p.dias)).replace(/\s+/g,' ').trim():'';}
// En el flyer van SÓLO los días del % de descuento. Un súper suele tener varias
// promos a la vez (Coto: "Hasta 12 cuotas · Todos los días" y "25% de ahorro ·
// Martes"): se juntan las vigentes del mismo súper (mismo logo o misma marca)
// cuyo beneficio tiene un "%" y se unen sus días. Sin ninguna con %, no hay días.
// Si la base todavía no trae el beneficio, queda el día de la promo como antes.
var _FG_DIAS=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
var _FG_DIAS_TXT=['lunes','martes','miércoles','jueves','viernes','sábados','domingos'];
function _promoDiasLeer(t){
  var n=_promoNormalizar(_promoDecodeEntities(String(t||''))),set={};
  if(/todos los dias/.test(n))return {todos:true,set:{}};
  // "de lunes a viernes"
  var m=n.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s? a (lunes|martes|miercoles|jueves|viernes|sabado|domingo)/);
  if(m){var a=_FG_DIAS.indexOf(m[1]),b=_FG_DIAS.indexOf(m[2]);for(var i=a,c=0;c<7;i=(i+1)%7,c++){set[i]=1;if(i===b)break;}}
  _FG_DIAS.forEach(function(d,i){if(new RegExp('\\b'+d).test(n))set[i]=1;});
  return {todos:false,set:set};
}
function _promoDiasFormato(set){
  var ds=Object.keys(set).map(Number).sort(function(a,b){return a-b;});
  if(!ds.length)return '';
  if(ds.length===7)return 'Todos los días';
  var t=ds.map(function(i){return _FG_DIAS_TXT[i];});
  var s2=t.length===1?t[0]:t.slice(0,-1).join(', ')+' y '+t[t.length-1];
  return s2.charAt(0).toUpperCase()+s2.slice(1);
}
var _promoDiasIdx={cat:null,porClave:null,cache:null};
function _promoDias(p){
  if(!p)return '';
  if(!_promoEsSuper(p)||!_promosCat)return _promoDiasCrudo(p);
  var I=_promoDiasIdx;
  if(I.cat!==_promosCat){
    I.cat=_promosCat;I.porClave=Object.create(null);I.cache=Object.create(null);
    _promosCat.forEach(function(q){
      if(!_promoEsSuper(q))return;
      [q.imagen?'i:'+q.imagen:'','m:'+_promoBaseMarca(q.titulo)].forEach(function(k){if(k)(I.porClave[k]=I.porClave[k]||[]).push(q);});
    });
  }
  var ck=(p.imagen||'')+'|'+(p.titulo||'');
  if(I.cache[ck]!=null)return I.cache[ck];
  var hoy=new Date(),vistos=Object.create(null),grupo=[];
  ((I.porClave['i:'+p.imagen]||[]).concat(I.porClave['m:'+_promoBaseMarca(p.titulo)]||[])).forEach(function(q){
    if(vistos[q.id])return;vistos[q.id]=1;
    if(q.proximamente||_promoEstado(q.fecha_hasta,hoy)==='VENCIDA')return;
    grupo.push(q);
  });
  var out;
  if(!grupo.some(function(q){return q.beneficio;}))out=_promoDiasCrudo(p);
  else{
    var set={},todos=false,crudo='';
    grupo.forEach(function(q){
      if(!/%/.test(String(q.beneficio||'')))return;
      var L=_promoDiasLeer(q.dias),k=Object.keys(L.set);
      if(L.todos)todos=true;
      k.forEach(function(i){set[i]=1;});
      if(!L.todos&&!k.length&&q.dias)crudo=_promoDiasCrudo(q); // frase que no se entiende: tal cual
    });
    out=todos?'Todos los días':(_promoDiasFormato(set)||crudo);
  }
  return (I.cache[ck]=out);
}
function _promoDiasHtml(p){var d=_promoEsSuper(p)?_promoDias(p):'';return d?'<div class="promos-dias">'+_escHtml(d)+'</div>':'';}
function _promoOtrasHtml(r){
  if(_promosFiltros.repetidas!=='ocultar'||!r._otras)return '';
  var det='Esta marca tiene '+(r._otras+1)+' promociones vigentes (distintas tarjetas, plazos o locales).';
  if(r._otrosNombres){
    det+=' Se juntaron: '+r._otrosNombres.slice(0,6).map(_promoDecodeEntities).join(', ')+
      (r._otrosNombres.length>6?'...':'')+'.';
  }
  det+=' Se muestra la que vence más tarde; destildá "Una sola fila por marca" para verlas todas.';
  return ' <span class="promos-otras" title="'+_escAttr(det)+'">+'+r._otras+'</span>';
}
// Enlace a la ficha de la promoción en el sitio de Galicia. Sin coincidencia no
// hay adónde ir, así que queda un guión. Abre en otra pestaña (el asesor está a
// mitad de un flyer: no se lo saca de la app) y con rel=noopener.
function _promoLinkHtml(r){
  var u=r.promo?_promoUrl(r.promo):'';
  if(!u)return '<span class="promos-link-no">-</span>';
  return '<a class="promos-link" href="'+_escAttr(u)+'" target="_blank" rel="noopener noreferrer" '+
    'title="Abrir esta promoción en el sitio de Galicia (vigencia, d&iacute;as, tarjetas y letra chica)">Ver</a>';
}

// Repinta SÓLO el cuerpo de la tabla (+ contadores). Separado del armado de la
// tabla para que escribir en un filtro no lo desenfoque en cada tecla.
function _promosPintarFilas(){
  var tbody=document.getElementById('promos-tbody');if(!tbody)return;
  var visibles=_promosFilasVisibles();
  tbody.innerHTML=visibles.length?
    visibles.map(function(v){return _promoFilaHtml(v.r,v.i);}).join(''):
    '<tr><td colspan="'+_promoNumCols()+'" class="promos-sinfiltro">Ninguna fila coincide con el filtro.</td></tr>';

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

  // En "Buscar" las fechas de inicio llegan solas (son pocas marcas); en
  // "Activas" pueden ser cientos, así que ahí se piden a mano y el botón
  // aparece únicamente si de verdad falta alguna de las que se están viendo.
  var db=document.getElementById('promos-desde-btn');
  if(db&&!db.disabled){
    var faltan=_promoModoActivas()?_promosSinDesde().length:0;
    db.style.display=faltan?'':'none';
    if(faltan)db.innerHTML='&#128197; Completar fechas "Desde" ('+faltan+')';
  }
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
    host.innerHTML='<p class="promos-empty">'+(_promoModoActivas()?
      'Elegí una provincia a la izquierda y tocá "Ver promociones" para ver todo lo vigente ahí.':
      'Pegá las marcas a la izquierda y tocá "Validar vigencia" para ver el resultado acá.')+'</p>';
    if(actions)actions.style.display='none';
    if(searchBox)searchBox.style.display='none';
    return;
  }
  if(actions)actions.style.display='flex';
  _vigBarraBuscar(actions); // admin: "Vigilar estas marcas en…"
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

  var conteo={VIGENTE:0,VENCE_ESTE_MES:0,VENCIDA:0,REVISAR:0,NO_ENCONTRADA:0,SIN_FECHA:0,FUERA_PROV:0,PROXIMA:0};
  resultados.forEach(function(r){if(!r.excluir)conteo[r.estado]=(conteo[r.estado]||0)+1;});
  // Los chips también filtran: tocar "Vencidas" deja sólo esas.
  // Mismo criterio que el orden por estado: primero lo que hay que corregir en
  // el flyer (una marca que no está en el catálogo hay que sacarla), último lo
  // que ya está bien.
  var chipDefs=[['NO_ENCONTRADA','c-no'],['VENCIDA','c-vencida'],['VENCE_ESTE_MES','c-vence'],['REVISAR','c-revisar'],['VIGENTE','c-vigente']];
  // "Próximamente" sólo cuando hay alguna: casi siempre sería un 0 de más.
  if(conteo.PROXIMA)chipDefs.splice(chipDefs.length-1,0,['PROXIMA','c-proxima']);
  // Sin provincia elegida ese chip diría siempre 0: es ruido, no se muestra.
  if(_promosProv)chipDefs.splice(1,0,['FUERA_PROV','c-fuera']);
  sumHost.innerHTML=chipDefs.map(function(c){
    var act=_promosFiltros.estado===c[0]?' activo':'';
    return '<span class="promos-chip '+c[1]+act+'" title="Filtrar por '+_escAttr(_PROMO_ESTADO_LBL[c[0]])+'" '+
      'onclick="_promoFiltroEstadoChip(\''+c[0]+'\')">'+_PROMO_ESTADO_LBL[c[0]]+': '+(conteo[c[0]]||0)+'</span>';
  }).join('');

  var act=_promoModoActivas();
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
      _promoTh('logo','Logo')+(act?'':_promoTh('marca','Marca (flyer)'))+_promoTh('match',act?'Promoción':'Coincidencia en Galicia')+
      _promoTh('cat','Categoría')+_promoTh('donde','Dónde')+_promoTh('desde','Desde')+_promoTh('hasta','Hasta')+_promoTh('estado','Estado')+
      '<th class="promos-th-link" title="Abre la promoción en el sitio de Galicia">En Galicia</th>'+
    '</tr>'+
    '<tr class="promos-filrow">'+
      '<th></th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'logo\',this.value)">'+
        '<option value="">Todos</option>'+
        '<option value="con"'+(_promosFiltros.logo==='con'?' selected':'')+'>Con logo</option>'+
        '<option value="sin"'+(_promosFiltros.logo==='sin'?' selected':'')+'>Sin logo</option>'+
      '</select></th>'+
      (act?'':'<th>'+inp('marca','Filtrar...')+'</th>')+
      '<th>'+inp('match','Filtrar...')+'</th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'cat\',this.value)">'+
        '<option value="">Todas</option>'+catOpts+'</select></th>'+
      '<th>'+inp('donde','Provincia...')+'</th>'+
      '<th>'+inp('desde','dd/mm')+'</th>'+
      '<th>'+inp('hasta','dd/mm')+'</th>'+
      '<th><select class="promos-fil" onchange="_promoFiltrar(\'estado\',this.value)">'+
        '<option value="">Todos</option>'+estOpts+'</select></th>'+
      '<th></th>'+
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
  // Este no pasa por _promosBtnOcupado: su etiqueta lleva el conteo de filas y
  // la repinta _promosPintarFilas al volver a habilitarlo.
  if(btn){btn.disabled=true;btn.textContent='Generando...';}

  var wb=new ExcelJS.Workbook();
  var actExcel=_promoModoActivas();
  var ws=wb.addWorksheet(actExcel?'Promociones activas':'Promociones');
  // Mismas columnas que la tabla en pantalla: en "Activas" no hay marca pegada
  // por el usuario, así que esa columna no va.
  ws.columns=[{header:'Logo',key:'logo',width:12}]
    .concat(actExcel?[]:[{header:'Marca (flyer)',key:'marca',width:24}])
    .concat([
      {header:actExcel?'Promoción':'Coincidencia en Galicia',key:'match',width:28},
      {header:'Categoría',key:'cat',width:18},
      {header:'Dónde',key:'donde',width:30},
      {header:'Desde',key:'desde',width:12},
      {header:'Hasta',key:'hasta',width:12},
      {header:'Días',key:'dias',width:16},
      {header:'Estado',key:'estado',width:16},
      {header:'En Galicia',key:'link',width:14}
    ]);
  ws.getRow(1).font={bold:true};
  var fills={VIGENTE:'FFDFF5E1',VENCE_ESTE_MES:'FFFFF1CC',VENCIDA:'FFFCE0DF',REVISAR:'FFFFE7D1',NO_ENCONTRADA:'FFECECEC',SIN_FECHA:'FFECECEC',FUERA_PROV:'FFEAE6F9',PROXIMA:'FFE0EEFB'};

  // Baja lo que se está viendo: filtros aplicados y sin las marcadas "excluir".
  var incluidos=_promosFilasVisibles().map(function(v){return v.r;}).filter(function(r){return !r.excluir;});
  if(!incluidos.length){
    showToast('No hay filas para exportar con el filtro actual');
    if(btn){btn.disabled=false;_promosPintarFilas();}
    return;
  }
  var logosPuestos=0,logosSinPoner=0;
  // Cada logo es una descarga al CDN de Galicia, y acá se disparan todas
  // juntas: con 800 filas eso lo hace fallar. Pasado el tope se exportan los
  // datos sin logos, que es lo que importa en una lista larga.
  var CAP_LOGOS=150,conLogos=incluidos.length<=CAP_LOGOS;
  // Los logos se bajan de a 6 a la vez (antes salían los 150 juntos y el
  // navegador/CDN dejaba pendientes o rechazaba a los últimos).
  var _logoCola=[],_logoAct=0,LOGOS_A_LA_VEZ=6;
  function _logoSig(){
    while(_logoAct<LOGOS_A_LA_VEZ&&_logoCola.length){
      var t=_logoCola.shift();_logoAct++;
      t.fn().then(t.ok,t.no).then(function(){_logoAct--;_logoSig();});
    }
  }
  function _logoConCupo(fn){return new Promise(function(ok,no){_logoCola.push({fn:fn,ok:ok,no:no});_logoSig();});}
  var idPorLogo={}; // archivo del logo → promesa del id de la imagen en el Excel (o null)
  var pendientes=incluidos.map(function(r,i){
    var rowIdx=i+2;
    var row=ws.addRow({
      marca:r.marca,
      match:r.promo?_promoDecodeEntities(r.promo.titulo)+(_promoEsNueva(r.promo)?' (nueva)':''):'-',
      cat:r.promo?_promoDecodeEntities(r.promo.subtitulo||'-'):'-',
      donde:r.promo?(_promoDondeTexto(r.promo)||'-'):'-',
      desde:r.promo?_promosFmtFecha(r.fechaDesde):'-',
      hasta:r.promo?_promosFmtFecha(r.promo.fecha_hasta):'-',
      dias:r.promo?_promoDias(r.promo):'',
      estado:_promoEstadoTxt(r)
    });
    row.height=32;
    row.eachCell(function(cell){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fills[r.estado]||'FFFFFFFF'}};});
    // El link va como hipervínculo de Excel: se toca la celda y abre la ficha.
    // Se escribe después del fill para que el formato de link no se pise.
    var url=r.promo?_promoUrl(r.promo):'';
    var celLink=row.getCell('link');
    if(url){
      celLink.value={text:'Ver',hyperlink:url};
      celLink.font={color:{argb:'FF1155CC'},underline:true};
    }else{
      celLink.value='-';
    }
    if(!conLogos||!r.promo||!r.promo.imagen)return Promise.resolve();
    // ExcelJS sólo incrusta jpeg/png/gif; otros formatos se saltean.
    var ext=/\.jpe?g$/i.test(r.promo.imagen)?'jpeg':(/\.png$/i.test(r.promo.imagen)?'png':(/\.gif$/i.test(r.promo.imagen)?'gif':null));
    if(!ext){logosSinPoner++;return Promise.resolve();}
    // El mismo logo (una marca con varias promos) se baja e incrusta UNA vez y se
    // reusa en cada fila: antes era una descarga y una copia en el archivo por fila.
    var f=r.promo.imagen;
    if(!(f in idPorLogo))idPorLogo[f]=_logoConCupo(function(){return fetch(PROMO_LOGO_BASE+f).then(function(resp){
      return resp.ok?resp.arrayBuffer():null;
    }).then(function(buf){return buf?wb.addImage({buffer:buf,extension:ext}):null;});})
      .catch(function(){return null;/* si el logo no carga, la fila igual queda con sus datos */});
    return idPorLogo[f].then(function(imgId){
      if(imgId==null){logosSinPoner++;return;}
      ws.addImage(imgId,{tl:{col:0,row:rowIdx-1},ext:{width:26,height:26},editAs:'oneCell'});
      logosPuestos++;
    });
  });

  Promise.all(pendientes).then(function(){
    return wb.xlsx.writeBuffer();
  }).then(function(buf){
    // Si NINGÚN logo entró (típico: el CDN de Galicia no habilita CORS para
    // descargarlos por fetch), se avisa en vez de entregar el Excel "sin logos"
    // en silencio; los datos van completos igual.
    if(!conLogos)showToast('Excel generado sin logos: son '+incluidos.length+' filas y bajarlos de a una haría fallar la descarga.');
    else if(logosSinPoner&&!logosPuestos)showToast('Excel generado sin logos (no se pudieron descargar desde Galicia). Los datos están completos.');
    else if(logosSinPoner)showToast('Excel generado; '+logosSinPoner+' logo(s) no se pudieron descargar.');
    var blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    var slug=_promosProv?('_'+_promoNormalizar(_promosProv).replace(/ +/g,'_')):'';
    a.download=(actExcel?'promociones_activas':'promociones_galicia')+slug+'_'+new Date().toISOString().slice(0,10)+'.xlsx';
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
  _fgMarcarMontoFlyer();
}
function loadCashback(force,cb){
  if(_cashbackLoaded&&!force){if(cb)cb();return;}
  _bucketJson(CASHBACK_FILE)
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
      '.cb-hint{font-size:.75rem;color:var(--gray,#777)}'+
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
  return _bucketJson(_legalFile(opt))
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
// Los marcadores que puede usar el legal, explicados en castellano llano. Son
// chips que PEGAN el texto en el cursor: escribirlos a mano se presta a un typo
// que no avisa (el marcador mal escrito termina impreso en el flyer).
var _GLEGAL_VARS_UI=[
  ['{empresa}',     'el nombre de la empresa que se carga en el flyer'],
  ['{eminentblack}','el monto de Eminent Black: es el que sale en naranja en el Flyer Sueldo'],
  ['{platinum}',    'el monto de Eminent Platinum de la configuración elegida'],
  ['{plusgold}',    'el monto de Plus Gold de la configuración elegida'],
  ['{plus}',        'el monto de Plus de la configuración elegida'],
  ['{importe}',     'el tope de reintegro cargado (Flyer Rubros)'],
  ['{importe2}',    'el segundo tope (Flyer Rubros, cuadro «Ambos»)'],
  ['{total}',       'la suma de los dos topes']
];
function _glegalVarChips(opt){
  return '<div class="glegal-vars">'+
    '<span class="glegal-vars-lbl">Datos que se completan solos (toc&aacute; para pegarlos):</span>'+
    _GLEGAL_VARS_UI.map(function(p){
      return '<span class="ftag" title="'+_escAttr(p[1])+'" onclick="_glegalVar('+opt+',\''+p[0]+'\')">'+_escHtml(p[0])+'</span>';
    }).join('')+'</div>';
}
// Pega el marcador donde quedó el cursor. Si el editor no se tocó todavía va al
// final del texto (nunca al principio, que es lo que daría selectionStart=0).
function _glegalVar(opt,tag){
  var ta=document.getElementById(_glegalId(opt));if(!ta)return;
  if(!ta.dataset.posOk){
    ta.dataset.posOk='1';
    ['keyup','click','blur'].forEach(function(ev){ta.addEventListener(ev,function(){ta.dataset.pos=ta.selectionStart;});});
  }
  var p=(ta.dataset.pos!=null)?+ta.dataset.pos:ta.value.length;
  if(!(p>=0&&p<=ta.value.length))p=ta.value.length;
  ta.value=ta.value.slice(0,p)+tag+ta.value.slice(p);
  ta.dataset.pos=p+tag.length;
  ta.focus();try{ta.setSelectionRange(p+tag.length,p+tag.length);}catch(e){}
  showToast('Pegé '+tag+' — se reemplaza solo al armar el flyer');
}
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
      _glegalVarChips(o)+
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
  // Los usuarios y el total de flyers se piden a la vez (antes uno detrás del otro).
  Promise.all([
    _sb.from('profiles').select('id,role,status,full_name,email_asesor,last_login').order('last_login',{ascending:false}),
    _sb.from('flyer_logs').select('id',{count:'exact',head:true}).not('user_id','is',null)
  ]).then(function(res){
    var r1=res[0]||{},r2=res[1]||{};
    (function(){
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
    })();
  });
}

// ── USO DE LA APP (admin) ────────────────────────────────────────────────────
// Cuántos flyers se bajan, de qué flyer, qué perfiles y por semana, más lo de
// Estudio. Sale de flyer_logs (un registro por descarga; el Masivo y el padrón,
// uno por tanda con bulk_count) y se calcula en el navegador. Barras en HTML
// puro: nada pesado para las PC de sucursal.
var _uso={per:'30'};
var _USO_ROLES={admin:'Admin',vip:'VIP',pro:'Pro',asesor:'Asesor',hunter:'Hunter',lider:'Líder',prospect:'Prospect'};
function _usoDesde(per){
  var h=new Date();
  if(per==='anio')return new Date(h.getFullYear(),0,1);
  return new Date(h.getTime()-(+per||30)*86400000);
}
function _usoCargar(per){
  if(per)_uso.per=per;
  var box=document.getElementById('uso-body');if(!box)return;
  var bt=document.getElementById('uso-per');
  if(bt&&!bt._ok){bt._ok=true;bt.addEventListener('click',function(e){var x=e.target.closest&&e.target.closest('button[data-d]');if(x)_usoCargar(x.getAttribute('data-d'));});}
  if(bt)Array.prototype.forEach.call(bt.querySelectorAll('button'),function(x){x.classList.toggle('on',x.getAttribute('data-d')===_uso.per);});
  box.innerHTML=skelRows(4);
  var desde=_usoDesde(_uso.per).toISOString(),turno=_uso.turno=(_uso.turno||0)+1;
  var logs=null,perf=null,dis=null;
  function listo(){if(logs&&perf&&dis&&turno===_uso.turno)_usoPintar(logs,perf,dis,desde);}
  _sbTodo(function(d,h){return _sb.from('flyer_logs').select('user_id,is_bulk,bulk_count,flyer_type,created_at').not('user_id','is',null).gte('created_at',desde).order('created_at',{ascending:true}).range(d,h);},
    function(err,filas){logs=err?[]:filas;if(err)showToast('No se pudieron leer los registros: '+(err.message||err));listo();});
  _sb.from('profiles').select('id,full_name,email_asesor,role').then(function(r){perf=(r&&r.data)||[];listo();},function(){perf=[];listo();});
  _sb.from('flyer_disenos').select('estado,created_at,pedido_at,revisado_at').gte('updated_at',desde).then(function(r){dis=(r&&!r.error&&r.data)||[];listo();},function(){dis=[];listo();});
}
function _usoBarras(items){
  var max=Math.max.apply(null,items.map(function(i){return i.n;}).concat([1]));
  return '<div class="uso-barras">'+items.map(function(i){
    return '<div class="uso-fila"><span class="uso-et" title="'+_escAttr(i.l)+'">'+_escHtml(i.l)+'</span>'+
      '<span class="uso-pista"><span class="uso-barra" style="width:'+Math.max(2,Math.round(i.n/max*100))+'%;'+(i.c?'background:'+_escAttr(i.c):'')+'"></span></span>'+
      '<span class="uso-n">'+i.n+'</span></div>';
  }).join('')+'</div>';
}
function _usoPintar(logs,perf,dis,desde){
  var box=document.getElementById('uso-body');if(!box)return;
  var porId={};perf.forEach(function(p){porId[p.id]=p;});
  var total=0,ind=0,mas=0,porOpt={},porRol={},porUsr={},porSem={};
  function lunes(d){var x=new Date(d);x.setHours(0,0,0,0);var w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);return x;}
  logs.forEach(function(l){
    var n=l.is_bulk?(+l.bulk_count||0):1;if(!n)return;
    total+=n;if(l.is_bulk)mas+=n;else ind+=n;
    var o=0;try{o=+(JSON.parse(l.flyer_type||'{}').opcion)||0;}catch(e){}
    porOpt[o]=(porOpt[o]||0)+n;
    var p=porId[l.user_id],rol=(p&&p.role)||'?';porRol[rol]=(porRol[rol]||0)+n;
    porUsr[l.user_id]=(porUsr[l.user_id]||0)+n;
    var k=lunes(l.created_at).getTime();porSem[k]=(porSem[k]||0)+n;
  });
  var usuarios=Object.keys(porUsr).length;
  var tarjeta=function(n,t,sub){return '<div class="uso-card"><div class="uso-card-n">'+n+'</div><div class="uso-card-t">'+t+'</div>'+(sub?'<div class="uso-card-s">'+sub+'</div>':'')+'</div>';};
  var html='<div class="uso-cards">'+
    tarjeta(total.toLocaleString('es-AR'),'flyers bajados',ind+' de a uno · '+mas+' en tandas (Masivo y padrón)')+
    tarjeta(usuarios,'usuarios que bajaron flyers','')+
    tarjeta(usuarios?(total/usuarios).toFixed(1).replace('.',','):'0','flyers por usuario','promedio del período')+'</div>';
  if(!total){box.innerHTML=html+'<p class="uso-vacio">No se bajaron flyers en este período.</p>'+_usoEstudio(dis,desde);return;}
  var opts=Object.keys(porOpt).map(function(o){o=+o;return {l:o?(_FG_OPTS.indexOf(o)>=0?_optLabel(o):'Opción '+o+' (ya no está)'):'Sin dato',n:porOpt[o],c:o&&_FG_OPTS.indexOf(o)>=0?_optColor(o):''};}).sort(function(a,b){return b.n-a.n;});
  var roles=Object.keys(porRol).map(function(r){return {l:_USO_ROLES[r]||r,n:porRol[r]};}).sort(function(a,b){return b.n-a.n;});
  var sem=[],ini=lunes(desde).getTime(),hoy=lunes(new Date()).getTime();
  for(var t=Math.max(ini,hoy-11*7*86400000);t<=hoy;t+=7*86400000){var d=new Date(t);sem.push({l:'Sem. '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),n:porSem[t]||0});}
  var top=Object.keys(porUsr).map(function(u){var p=porId[u]||{};return {l:p.full_name||p.email_asesor||'Usuario',n:porUsr[u]};}).sort(function(a,b){return b.n-a.n;}).slice(0,10);
  html+='<div class="uso-grid">'+
    '<section class="uso-sec"><h4>Por flyer</h4>'+_usoBarras(opts)+'</section>'+
    '<section class="uso-sec"><h4>Por perfil</h4>'+_usoBarras(roles)+'</section>'+
    '<section class="uso-sec"><h4>Por semana</h4>'+_usoBarras(sem)+'</section>'+
    '<section class="uso-sec"><h4>Los 10 que m&aacute;s bajaron</h4>'+_usoBarras(top)+'</section>'+
  '</div>'+_usoEstudio(dis,desde);
  box.innerHTML=html;
}
function _usoEstudio(dis,desde){
  var d0=new Date(desde),en=function(x){return x&&new Date(x)>=d0;};
  var guard=dis.filter(function(d){return en(d.created_at);}).length;
  var ped=dis.filter(function(d){return en(d.pedido_at);}).length;
  var pub=dis.filter(function(d){return d.estado==='publicado'&&en(d.revisado_at);}).length;
  return '<section class="uso-sec uso-est"><h4>Estudio en el per&iacute;odo</h4><div class="uso-cards">'+
    '<div class="uso-card"><div class="uso-card-n">'+guard+'</div><div class="uso-card-t">dise&ntilde;os guardados</div></div>'+
    '<div class="uso-card"><div class="uso-card-n">'+ped+'</div><div class="uso-card-t">pedidos de publicaci&oacute;n</div></div>'+
    '<div class="uso-card"><div class="uso-card-n">'+pub+'</div><div class="uso-card-t">publicados</div></div></div></section>';
}

// ── MARCAS VIGILADAS ─────────────────────────────────────────────────────────
// Qué marcas tiene cada flyer, para avisar cuando se vencen. Las impresas en el
// PDF original no se pueden "leer": el admin las carga una vez desde
// Promociones → Buscar ("Vigilar estas marcas"). Las que se ponen con Cambiar
// logos / Armar franja y se publican desde Estudio se suman solas. Vive en
// _vigilar.json del bucket; la revisión diaria (y el mail) la hace la Edge
// Function promos-galicia después de la actualización de las 9.
var _VIG_ARCHIVO='_vigilar.json';
function _vigLeer(){
  return _bucketJson(_VIG_ARCHIVO).then(function(d){return (d&&d.opciones)?d:{opciones:{}};},function(){return {opciones:{}};});
}
// Los cambios a la lista van en fila (uno espera al otro) y cada uno relee el
// archivo antes de modificarlo: quitar una marca mientras se publica un diseño
// no pisa lo del otro.
var _vigCola=Promise.resolve();
function _vigCambiar(fn){
  var p=_vigCola.then(function(){return _vigLeer().then(function(d){return fn(d)===false?d:_vigGuardar(d);});});
  _vigCola=p.catch(function(){});
  return p;
}
function _vigGuardar(d){
  d.updated_at=new Date().toISOString();
  return _sb.storage.from('flyers').upload(_VIG_ARCHIVO,new Blob([JSON.stringify(d)],{type:'application/json'}),{contentType:'application/json',upsert:true})
    .then(function(r){if(r&&r.error)throw r.error;return d;});
}
// Estado de una marca contra el catálogo cargado: 'ok' | 'vence' (7 días o menos) | 'vencida'
function _vigEstado(v,hoy){
  var dia=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()).getTime(),k=_promoNormalizar(v.t||v.m||''),mejor=-1,sinFecha=false;
  (_promosCat||[]).forEach(function(p){
    if(p.proximamente)return;
    if(!((v.img&&p.imagen===v.img)||(k&&_promoNormalizar(p.titulo||'')===k)))return;
    if(!p.fecha_hasta){sinFecha=true;return;}
    var f=new Date(p.fecha_hasta+'T00:00:00').getTime();if(f>=dia&&f>mejor)mejor=f;
  });
  if(sinFecha)return {e:'ok'};
  if(mejor<0)return {e:'vencida'};
  var dias=Math.round((mejor-dia)/86400000);
  return dias<=7?{e:'vence',dias:dias,hasta:new Date(mejor)}:{e:'ok',hasta:new Date(mejor)};
}
// Promociones → Buscar: guardar las marcas validadas como las de un flyer (admin)
function _vigBarraBuscar(actions){
  var vb=document.getElementById('vig-bar');
  if(!_admin||_promoModoActivas()||!actions){if(vb)vb.remove();return;}
  if(!vb){
    vb=document.createElement('span');vb.id='vig-bar';vb.className='vig-bar';
    actions.appendChild(vb);
  }
  var sel=document.getElementById('vig-opt'),val=sel?sel.value:String(_optN(_fgOpt));
  vb.innerHTML='<label for="vig-opt">Vigilar estas marcas en</label><select id="vig-opt">'+_FG_OPTS.map(function(o){
    return '<option value="'+o+'"'+(String(o)===val?' selected':'')+'>'+_escHtml(_optLabel(o))+'</option>';}).join('')+'</select>'+
    '<button type="button" class="btn bg" id="vig-btn" title="Todos los días se revisan y te llega un mail si alguna se vence">Guardar</button>';
  document.getElementById('vig-btn').onclick=function(){_vigDesdeBuscar(+document.getElementById('vig-opt').value);};
}
function _vigDesdeBuscar(n){
  var R=_promosResultados||[];
  var ok=R.filter(function(r){return r.promo&&!r.excluir&&!r.necesitaRevision&&r.estado!=='NO_ENCONTRADA';});
  var afuera=R.filter(function(r){return !r.excluir&&ok.indexOf(r)<0;}).map(function(r){return r.marca;});
  if(!ok.length){showToast('No hay marcas encontradas para vigilar. Revisá las que dicen «Revisar» o «No encontrada».');return;}
  fgConfirm('',{titulo:'¿Vigilar '+ok.length+' marcas en «'+_optLabel(n)+'»?',peligro:false,ok:'Vigilar',
    texto:'Reemplaza la lista cargada a mano de ese flyer (las que se sumaron desde Estudio se conservan).'+(afuera.length?' Quedan afuera '+afuera.length+' que no se encontraron o hay que revisar: '+afuera.slice(0,5).join(', ')+(afuera.length>5?'…':'')+'.':'')},function(si){
    if(!si)return;
    _vigCambiar(function(d){
      var est=(d.opciones[n]||[]).filter(function(x){return x.origen==='estudio';}),vistos={},lista=[];
      ok.forEach(function(r){var it={m:r.marca,t:_promoDecodeEntities(r.promo.titulo||''),img:r.promo.imagen||'',origen:'manual'};if(it.img&&vistos[it.img])return;vistos[it.img]=1;lista.push(it);});
      est.forEach(function(x){if(!x.img||!vistos[x.img]){vistos[x.img]=1;lista.push(x);}});
      d.opciones[n]=lista;
    }).then(function(){showToast('Listo: se vigilan '+ok.length+' marcas de «'+_optLabel(n)+'». Si alguna se vence te llega un mail.');},
      function(e){showToast('No se pudo guardar: '+((e&&e.message)||e));});
  });
}
// Al publicar desde Estudio: los logos de Promociones del diseño se suman a la opción nueva
function _vigSumarEstudio(base,nueva,cambios){
  return _vigCambiar(function(d){
    var lista=(d.opciones[base]||[]).filter(function(x){return x.origen!=='estudio';}).map(function(x){return Object.assign({},x);}),vistos={};
    lista.forEach(function(x){if(x.img)vistos[x.img]=1;});
    (cambios||[]).forEach(function(e){
      if(e.tipo==='txt'||!e.img||_fgLgEsSubido(e.img)||String(e.img).indexOf('orig:')===0||vistos[e.img])return;
      vistos[e.img]=1;lista.push({m:e.t||'',t:e.t||'',img:e.img,origen:'estudio'});
    });
    if(!lista.length)return false;
    d.opciones[nueva]=lista;
  });
}
// Admin → Config → Marcas vigiladas
function _vigPintarAdmin(){
  var box=document.getElementById('vig-body');if(!box)return;
  box.innerHTML=skelRows(3);
  var pintar=function(d){
    var hoy=new Date(),ops=Object.keys(d.opciones).filter(function(n){return (d.opciones[n]||[]).length;});
    if(!ops.length){box.innerHTML='<p class="uso-vacio">Todav&iacute;a no hay marcas vigiladas.</p>';return;}
    box.innerHTML=ops.map(function(n){
      var L=d.opciones[n],filas=L.map(function(v,i){
        var e=_vigEstado(v,hoy),et=e.e==='vencida'?'<span class="vig-e vig-mal">Sin promo vigente</span>':e.e==='vence'?'<span class="vig-e vig-vence">Vence en '+e.dias+(e.dias===1?' d&iacute;a':' d&iacute;as')+'</span>':'<span class="vig-e vig-ok">Vigente</span>';
        return '<div class="vig-fila"><span class="vig-m">'+_escHtml(v.m||v.t)+(v.t&&v.t!==v.m?' <small>('+_escHtml(v.t)+')</small>':'')+(v.origen==='estudio'?' <small class="vig-or">Estudio</small>':'')+'</span>'+et+
          '<button type="button" class="vig-x" data-n="'+_escAttr(n)+'" data-k="'+_escAttr(v.img||v.m||'')+'" aria-label="Dejar de vigilar">&times;</button></div>';
      }).join('');
      var mal=L.filter(function(v){return _vigEstado(v,hoy).e!=='ok';}).length;
      return '<section class="uso-sec vig-sec"><h4>'+_escHtml(_FG_OPTS.indexOf(+n)>=0?_optLabel(+n):'Opción '+n+' (ya no está)')+' <small>'+L.length+' marcas'+(mal?' &middot; <b class="vig-mal-t">'+mal+' para revisar</b>':'')+'</small></h4>'+filas+'</section>';
    }).join('');
    box.onclick=function(ev){
      var x=ev.target.closest&&ev.target.closest('.vig-x');if(!x)return;
      var n=x.getAttribute('data-n'),k=x.getAttribute('data-k');
      // por marca (no por posición): si la lista cambió mientras tanto, igual saca la correcta
      _vigCambiar(function(d2){var L=d2.opciones[n]||[],j=L.findIndex(function(y){return (y.img||y.m||'')===k;});if(j<0)return false;L.splice(j,1);}).then(function(d3){pintar(d3);showToast('Listo: esa marca ya no se vigila.');},function(e){showToast('No se pudo: '+((e&&e.message)||e));});
    };
  };
  var seguir=function(){_vigLeer().then(pintar);};
  if(_promosCat&&_promosCat.length)seguir();else loadPromosCatalogo(seguir);
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

// Va por la Edge Function (no por un update directo) para que le llegue el
// mail de "tu cuenta ya está activa".
function approveUser(btn,uid){
  btn.disabled=true;
  _callFn('approve_user',{uid:uid},function(err){
    if(err){btn.disabled=false;showToast('No se pudo aprobar: '+err);return;}
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
  _umLiderFill(null);
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
  _umLiderFill(u.lider_id||null,u.id);
  document.getElementById('um-submit').textContent='Guardar cambios';
  document.getElementById('um-err').textContent='';
  document.getElementById('user-modal').style.display='flex';
  setTimeout(function(){document.getElementById('um-name').focus();},100);
}

// "Líder a cargo": a qué Líder responde este usuario (arma los equipos que ve
// cada Líder en Gestiones). Se listan los usuarios con rol Líder.
function _umLiderFill(actual,yo){
  var s=document.getElementById('um-lider');if(!s)return;
  var lids=(_allUsers||[]).filter(function(u){return u.role==='lider'&&u.id!==yo;});
  s.innerHTML='<option value="">Sin l\u00edder</option>'+lids.map(function(u){
    return '<option value="'+_escAttr(u.id)+'"'+(u.id===actual?' selected':'')+'>'+_escHtml(u.full_name||u.email||'Sin nombre')+'</option>';
  }).join('');
  var w=document.getElementById('um-lider-wrap');if(w)w.style.display=lids.length?'':'none';
}
function _umLiderVal(){var s=document.getElementById('um-lider');return (s&&s.value)||null;}
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
    // Si pasa de no-activo a activo, después del guardado sale el mail de
    // "tu cuenta ya está activa" (approve_user es idempotente).
    var _uPrev=(_allUsers||[]).find(function(x){return x.id===_editUid;});
    var _activa=status==='active'&&_uPrev&&_uPrev.status!=='active'&&_uPrev.status!=='reset_pending';
    var _uid=_editUid;
    // El perfil (rol/estado/nombre) se actualiza con RLS (admin). La contraseña,
    // si se ingresó, va por la Edge Function.
    _sb.from('profiles').update({full_name:name,role:role,status:status,lider_id:_umLiderVal()}).eq('id',_editUid).then(function(r){
      if(r.error){btn.textContent='Guardar cambios';btn.disabled=false;errEl.textContent=r.error.message;return;}
      if(_activa)_callFn('approve_user',{uid:_uid},function(){});
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
      // El líder se asigna después del alta (la Edge Function no lo conoce).
      var lid=_umLiderVal();
      var fin=function(){closeUserModal();loadUsers();loadStats();_refreshPendingBadge();showToast('✅ Usuario creado exitosamente');};
      if(lid)_sb.from('profiles').update({lider_id:lid}).eq('email',email.toLowerCase()).then(fin);else fin();
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
    // Caché de un año: el nombre lleva la hora, así que este archivo nunca se
    // vuelve a escribir (un flyer nuevo es otro archivo) y cada usuario lo baja
    // UNA vez en vez de una vez por hora (~1 MB). Sólo para nombres únicos: un
    // archivo de nombre fijo que se re-sube (_active_img.jpg) queda en 1 hora,
    // si no se seguiría viendo el viejo.
    _sb.storage.from('flyers').upload(imgName,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'31536000'}).then(function(r){
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
        _optBadge(o,'font-size:.75rem;padding:4px 8px')+
        '<span class="af-banner-name af-banner-opt" style="color:'+_optColor(o)+'">'+_escHtml(_optLabel(o))+'</span>'+
        '<span class="af-banner-name" style="font-weight:400;color:var(--gray)">'+_escHtml(d.name||'')+'</span></div>'+
        '<div style="display:flex;gap:6px">'+
        (hUrl?'<a href="'+_escHtml(hUrl)+'" target="_blank" rel="noopener noreferrer" class="usr-btn edit" style="font-size:.75rem;padding:5px 10px;text-decoration:none;display:inline-flex;align-items:center">Ver</a>':'')+
        '<button class="usr-btn warn" onclick="deactivateFlyer(this,'+o+')" style="font-size:.75rem;padding:5px 10px">Desactivar</button>'+
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
        var tag=isImg?'<span class="badge" style="font-size:.75rem;padding:3px 7px;background:#eef3fb;color:#1d4070;margin-left:6px">PDF/IMG</span>':'';
        var titulo;
        if(home){
          titulo=od.act.map(function(o){return _optBadge(o,'margin-right:5px');}).join('')+(isAct?'':_optBadge(home,'margin-right:5px;opacity:.55'))+
            '<span class="usr-row-optname" style="color:'+_optColor(home)+'">'+_escHtml(_optLabel(home))+'</span>'+
            (od.act.length>1?' <span style="font-weight:400;color:var(--gray)">+ '+od.act.slice(1).map(function(o){return _escHtml(_optLabel(o));}).join(', ')+'</span>':'')+
            (isAct?'<span class="badge" style="font-size:.75rem;padding:3px 7px;background:var(--green,#2e7d32);color:#fff;margin-left:6px">ACTIVO</span>':
              '<span class="badge" style="font-size:.75rem;padding:3px 7px;background:#eee;color:#666;margin-left:6px" title="Subido para esta opci&oacute;n, pero no es el flyer activo">NO ACTIVO</span>');
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
// solapa: en qué solapa del header vive la opción. La 1 es siempre 'flyer'.
// Las solapas se declaran en UN solo lugar, este registro: de acá salen los tabs
// del header, los títulos editables (4 toques), el <select> de Config → Opciones,
// las zonas del calibrador y los flags que viajan en v. Sumar una solapa = una
// entrada acá + su div en _build.mjs; no hay que tocar nada más.
//   flyer     : el armador de siempre (4 cajas de montos)
//   rubros    : + el cartel "¡Beneficio exclusivo EMPRESA!" y el tope de reintegro
//   sueldo    : UN importe de cashback en naranja en vez de las 4 cajas
//   zonas     : las zonas que el calibrador deja mover en esa solapa
//   benef     : dibuja el cartel del beneficio exclusivo
//   cashUnico : dibuja el importe único (el mayor de la config activa)
var _SOLAPAS=[
  {id:'flyer', def:'Flyer Galicia', zonas:['empresa','montos','asesores','legal']},
  {id:'rubros',def:'Flyer Rubros',  zonas:['empresa','montos','asesores','legal'],benef:true},
  {id:'sueldo',def:'Flyer Sueldo',  zonas:['empresa','cashback','asesores','legal'],cashUnico:true}
];
var _OPC_SOLAPAS=_SOLAPAS.map(function(s){return s.id;});
function _solCfg(id){for(var i=0;i<_SOLAPAS.length;i++)if(_SOLAPAS[i].id===id)return _SOLAPAS[i];return _SOLAPAS[0];}
function _esSolapaArmador(v){return _OPC_SOLAPAS.indexOf(v)>=0;}
function _apptab(s){return document.getElementById('apptab-'+s);}
// Rubros que puede tener un flyer de la solapa Rubros. "ninguno" = queda afuera
// del ruteo por rubro (una opción suelta que no reemplaza a nada).
var _OPC_RUBROS=['combustible','supermercado','ambos','ninguno'];
var _OPC_RUBRO_LBL={combustible:'Combustible',supermercado:'Supermercado',ambos:'S\u00faper y combustible',ninguno:'Ninguno (no entra en el ruteo)'};
function _opcSane(list){
  var out=[],vistos={};
  (Array.isArray(list)?list:[]).forEach(function(o){
    var n=parseInt(o&&o.n,10);if(!(n>=1)||vistos[n])return;vistos[n]=1;
    var sol=(n!==1&&_OPC_SOLAPAS.indexOf(o&&o.solapa)>=0)?o.solapa:'flyer';
    // orden: posición elegida a mano (arrastrando en la barra). Sin orden va al final, por número.
    var ord=(o&&typeof o.orden==='number'&&isFinite(o.orden))?o.orden:(1e6+n);
    // reemplaza: nº de la opción a la que sucede (0 = ninguna). Ver _optVigente.
    var rem=parseInt(o&&o.reemplaza,10);if(!(rem>=1)||rem===n)rem=0;
    // rubro: de qué rubro es este flyer. Vacío = se deduce del nombre
    // (_optRubroTipo); "ninguno" = no entra en el ruteo por rubro.
    var rub=(_OPC_RUBROS.indexOf(o&&o.rubro)>=0)?o.rubro:'';
    // sinCB: esta opción es la versión SIN cashback de esa otra (nace en Estudio con un recorte)
    var scb=parseInt(o&&o.sinCB,10);if(!(scb>=1)||scb===n)scb=0;
    var fila={n:n,nombre:String((o&&o.nombre)||'').replace(/[<>]/g,'').trim().slice(0,40)||('Opción '+n),
      color:/^#[0-9a-f]{6}$/i.test(o&&o.color||'')?o.color.toLowerCase():'',solapa:sol,orden:ord,reemplaza:rem,rubro:rub};
    if(scb)fila.sinCB=scb;
    out.push(fila);
  });
  // Una opción borrada deja de ser reemplazable: si no, la cadena apunta al aire.
  out.forEach(function(o){if(o.reemplaza&&!vistos[o.reemplaza])o.reemplaza=0;if(o.sinCB&&!vistos[o.sinCB])delete o.sinCB;});
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
// Igual que las facultades: una sola descarga en vuelo, los demás esperan.
var _opcCbs=null;
function loadOpciones(force,cb){
  if(_opcLoaded&&!force){if(cb)cb();return;}
  if(_opcCbs){if(cb)_opcCbs.push(cb);return;}
  _opcCbs=cb?[cb]:[];
  function fin(list){
    _aplicarOpciones(list);_opcLoaded=true;
    var cbs=_opcCbs;_opcCbs=null;
    cbs.forEach(function(f){try{f();}catch(e){console.error('opciones:',e);}});
  }
  _bucketJson(OPCIONES_FILE)
    .then(function(d){return d&&d.opts;},function(){return null;})
    .then(fin);
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
// Versión "sin cashback" de una opción (la que el perfil puede ver), o 0.
function _fgVarianteSinCB(o){
  o=+o;if(!o)return 0;
  for(var i=0;i<_FG_OPTS.length;i++){var n=_FG_OPTS[i];if(_OPC[n]&&_OPC[n].sinCB===o&&_can('opcion_'+n))return n;}
  return 0;
}
// La opción "de verdad" de una versión sin cashback (si no es una, ella misma).
function _fgOptBase(o){o=+o;return (_OPC[o]&&_OPC[o].sinCB&&_FG_OPTS.indexOf(_OPC[o].sinCB)>=0)?_OPC[o].sinCB:o;}
function _optLabel(opt){var n=_optN(opt);return (_OPC[n]&&_OPC[n].nombre)||('Opción '+n);}
// Solapa del header a la que pertenece la opción (ver _SOLAPAS).
// Flyer vigente de una opción. Cada campaña nueva es una OPCIÓN nueva (con su
// imagen, su legal y su calibración), pero las empresas del padrón tienen
// guardado el NÚMERO de opción de su rubro: al armar el flyer del año siguiente
// todas seguían apuntando al viejo. La opción nueva declara a cuál reemplaza
// (Config → Opciones) y acá se sigue la cadena hasta la última: no se toca ni un
// dato del padrón y sirve igual para la campaña que viene (3 → 7 → 9 …).
// "visto" corta cualquier vuelta sobre sí misma, por si alguien arma un círculo.
function _optVigente(opt){
  var n=parseInt(opt,10)||0,visto={};
  while(n&&!visto[n]){
    visto[n]=1;
    var sig=0;
    for(var k=0;k<_FG_OPTS.length;k++){
      var o=_OPC[_FG_OPTS[k]];
      if(o&&parseInt(o.reemplaza,10)===n&&!visto[o.n]){sig=o.n;break;}
    }
    if(!sig)break;
    n=sig;
  }
  return n;
}
function _optSolapa(opt){var n=_optN(opt),s=_OPC[n]&&_OPC[n].solapa;return (n!==1&&_OPC_SOLAPAS.indexOf(s)>=0)?s:'flyer';}
// La VIGENTE entre varias candidatas: la que ninguna otra de la lista reemplaza
// y, a igualdad, la de NÚMERO más alto. Las opciones se crean con número
// creciente, así que la más nueva gana; el "orden" de la barra es de presentación
// (el admin lo reacomoda arrastrando) y por eso no sirve de señal de recencia.
function _optVigenteEntre(cand){
  if(!cand||!cand.length)return 0;
  var vivas=cand.filter(function(o){
    return !cand.some(function(x){return x!==o&&_OPC[x]&&_optN(_OPC[x].reemplaza)===o;});
  });
  if(!vivas.length)vivas=cand;
  return vivas.slice().sort(function(a,b){return a-b;})[vivas.length-1];
}
function _solapaLabel(s){return _titLabel(_solCfg(s).id);} // nombre editable (4 toques en el header)
// Solapa del armador que está a la vista. Se deriva SIEMPRE de la opción activa
// (ver _fgSyncVista), así historial/registros que cambian de opción cambian de solapa solos.
var _fgVista='flyer';
// Color por opción: se usa igual en registros, historial y badges (control visual).
function _optColor(opt){var n=_optN(opt);return (_OPC[n]&&_OPC[n].color)||_OPC_PALETA[(n-1)%_OPC_PALETA.length];}
function _optBadge(opt,extraCss){
  var n=_optN(opt),c=_optColor(n);
  return '<span class="badge" style="font-size:.75rem;padding:3px 7px;background:'+c+
    ';color:#fff;letter-spacing:.3px;'+(extraCss||'')+'" title="'+_escHtml(_optLabel(n))+'">OP.'+n+'</span>';
}
function _fetchActiveMeta(opt,cb){
  _bucketJson(_activeFile(opt))
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
    // mantener apretado: barrita que se llena mientras dura el gesto (_FG_HOLD_MS)
    '#fg-optbar .fgo.hold::after{content:"";position:absolute;left:8px;right:8px;bottom:1px;height:2px;border-radius:2px;background:currentColor;opacity:.6;animation:fgoHold 4s linear forwards;transform-origin:left}'+
    '@keyframes fgoHold{from{transform:scaleX(0)}to{transform:scaleX(1)}}'+
    '#fg-optbar .fgo.lift{transform:scale(1.06) translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.22);z-index:2;cursor:grabbing;outline:2px dashed currentColor}'+
    '#fg-optbar.reorder .fgo:not(.lift){opacity:.7}'+
    '#fg-optbar .fgo input{font:inherit;font-weight:600;width:100%;box-sizing:border-box;text-align:center;border:1px solid var(--red,#c33);border-radius:5px;padding:2px 4px;background:#fff;color:#222}'+
    'html.dark #fg-optbar .fgo input{background:#2c2f36;color:#eee}';
  // La barra se destruye y recrea al cambiar facultades; el estilo se agrega una vez.
  if(!document.getElementById('fg-optbar-style'))document.head.appendChild(st);
  var bar=document.createElement('div');bar.id='fg-optbar';
  bar.innerHTML=_facOptsDe(_fgVista).map(function(o){
    // los diseños de Estudio abiertos con "Usar" van al lado de su flyer base
    var protos=_fgProtos.filter(function(p){return p.opcion===o;}).map(function(p){
      var tit=p.temp?'Borrador sin guardar sobre &laquo;'+_escAttr(_optLabel(o))+'&raquo;. Queda hasta que recargues la p&aacute;gina o lo cierres; para conservarlo, toc&aacute; &laquo;Guardar en Estudio&raquo;.':
        'Prototipo de Estudio sobre &laquo;'+_escAttr(_optLabel(o))+'&raquo;. Queda ac&aacute; hasta que recargues la p&aacute;gina; el dise&ntilde;o sigue guardado en Estudio.';
      return '<div class="fgp'+(p.temp?' fgp-bor':'')+'" data-p="'+_escAttr(p.id)+'" onclick="fgProtoAbrir(\''+_escAttr(p.id)+'\')" title="'+tit+'">'+
        '<svg class="fgp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'+
        '<span class="fgp-t">'+_escHtml(p.nombre)+'</span><button type="button" class="fgp-x" onclick="fgProtoCerrar(\''+_escAttr(p.id)+'\',event)" aria-label="Cerrar" title="'+(p.temp?'Cerrar borrador':'Cerrar (sigue guardado en Estudio)')+'">&times;</button></div>';
    }).join('');
    return '<div class="fgo" data-o="'+o+'" onclick="fgOptElegir('+o+')">'+_escHtml(_optLabel(o))+'</div>'+protos;
  }).join('');
  tabs.parentNode.insertBefore(bar,tabs);
  if(_admin)_fgOptBarGestos(bar);
  _fgRenderOptBar();
}
function _fgRenderOptBar(){
  if(typeof _fgBorrGuardarPronto==='function')_fgBorrGuardarPronto(); // pestañas de borrador: se guardan en la PC
  var bar=document.getElementById('fg-optbar');if(!bar)return;
  var pAct=_fgProtoActivo();
  bar.querySelectorAll('.fgp').forEach(function(x){x.classList.toggle('on',!!pAct&&x.getAttribute('data-p')===pAct.id);});
  bar.querySelectorAll('.fgo').forEach(function(x){
    var o=+x.getAttribute('data-o'),on=(o===_optN(_fgOpt))&&!pAct;
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
var _FG_HOLD_MS=4000,_FG_TAPS=4,_FG_TAP_VENTANA=1600;
// Mantener apretado _FG_HOLD_MS sobre un ítem lo "levanta" y a partir de ahí se
// arrastra para cambiar el orden; al soltar se llama onDrop(cont). Mover el dedo
// antes de tiempo cancela: son barras que se tocan todo el día, el modo mover no
// puede salir sin querer. Lo usan la barra de opciones del armador y las solapas
// del header. Devuelve recienMovido(), para que el click con el que termina el
// arrastre no cuente como "tocar el ítem".
function _holdReorder(cont,sel,onDrop,onLift){
  var hold=null,lift=null,startX=0,startY=0,hasta=0;
  function limpiarHold(){if(hold){clearTimeout(hold.t);hold.el.classList.remove('hold');hold=null;}}
  function soltar(){
    if(!lift)return;
    lift.classList.remove('lift');cont.classList.remove('reorder');
    lift=null;hasta=Date.now()+500;
    onDrop(cont);
  }
  cont.addEventListener('pointerdown',function(e){
    var el=e.target.closest?e.target.closest(sel):null;
    if(!el||el.classList.contains('editing')||el.querySelector('input'))return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    limpiarHold();
    startX=e.clientX;startY=e.clientY;
    hold={el:el,t:setTimeout(function(){
      el.classList.remove('hold');el.classList.add('lift');cont.classList.add('reorder');
      lift=el;hold=null;
      try{cont.setPointerCapture(e.pointerId);}catch(x){}
      if(navigator.vibrate)try{navigator.vibrate(30);}catch(x){}
      if(onLift)onLift(el);
      showToast('Arrastrá para cambiar el orden y soltá');
    },_FG_HOLD_MS)};
    el.classList.add('hold');
  });
  cont.addEventListener('pointermove',function(e){
    // si se mueve el dedo/mouse antes de tiempo, no es "mantener apretado"
    if(hold&&(Math.abs(e.clientX-startX)>8||Math.abs(e.clientY-startY)>8))limpiarHold();
    if(!lift)return;
    e.preventDefault();
    // los ítems ocultos (una solapa que el perfil no ve) no participan: tienen
    // ancho 0 y el cursor nunca cae adentro
    var otros=Array.prototype.filter.call(cont.querySelectorAll(sel),function(x){return x!==lift&&x.offsetWidth>0;});
    for(var i=0;i<otros.length;i++){
      var r=otros[i].getBoundingClientRect();
      if(e.clientX>=r.left&&e.clientX<=r.right){
        var mid=r.left+r.width/2;
        if(e.clientX<mid)cont.insertBefore(lift,otros[i]);else cont.insertBefore(lift,otros[i].nextSibling);
        break;
      }
    }
  });
  cont.addEventListener('pointerup',function(){limpiarHold();soltar();});
  cont.addEventListener('pointercancel',function(){limpiarHold();soltar();});
  cont.addEventListener('pointerleave',function(){if(!lift)limpiarHold();});
  cont.addEventListener('contextmenu',function(e){if(hold||lift)e.preventDefault();});
  return {recienMovido:function(){return !!lift||Date.now()<hasta;}};
}
function _fgOptBarGestos(bar){
  var taps=0,tapsEl=null,tapsT=0;
  _holdReorder(bar,'.fgo',_fgOptAplicarOrden,function(){taps=0;});
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
// ¿Hay alguna opción en vuelo? Lo usa el arranque para saber si la vista previa
// ya puede pintar o si todavía está viniendo la imagen de otra opción.
function _fgOptCargando(){for(var k in _fgOptLoading)if(Object.prototype.hasOwnProperty.call(_fgOptLoading,k))return true;return false;}
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
  var cargando='Cargando '+_optLabel(opt)+'...';
  showToast(cargando);
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
    fgHideToast(cargando);
    if(_optN(_fgOpt)===opt){_fgApplyOption(cache);if(aviso)showToast(aviso);}
    waiters.forEach(function(f){try{f();}catch(e){console.error('switchFlyerOption cb:',e);}});
  };
  // El legal se pide JUNTO con los datos de la opción (antes recién cuando éstos
  // llegaban: una vuelta más a la red en cada cambio de opción). Se aplica en el
  // mismo orden que siempre: primero los datos, después el legal, después la imagen.
  var legalP=loadGlobalLegal(false,opt);
  _fetchActiveMeta(opt,function(d){
    var cache=_fgOptCache[opt]={loaded:false,cfg:(d&&d.cfg)||null,
      imageUrl:(d&&d.imageUrl)||null,name:(d&&d.name)||'',legal:null,img:null,legalEdited:keepEdited};
    legalP.then(function(txt){
      cache.legal=(typeof txt==='string')?txt:(opt===1?(window.LEGAL_DEFAULT||''):'');
      if(!cache.imageUrl){done(cache,_optLabel(opt)+' todavía no tiene flyer: subilo desde el panel.');return;}
      // Si el ingreso ya la venía bajando (_fgPrecargaInicio), se usa esa.
      var im=_fgPreImgDe(opt,cache.imageUrl);
      if(im&&im.complete){cache.img=im;done(cache);return;}
      var pre=!!im;
      if(!im){im=new Image();im.crossOrigin='anonymous';}
      im.onload=function(){cache.img=im;done(cache);};
      im.onerror=function(){done(cache,'No se pudo cargar la imagen de '+_optLabel(opt));};
      if(!pre)im.src=cache.imageUrl; // versionada por ?v= al activar: ver la carga inicial
    });
  });
}
function _fgApplyOption(cache){
  _fgRecOlvidar();
  if(!_fgBorr.revisado&&_me)setTimeout(_fgBorrOfrecer,900); // borradores de la última vez
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
  _fgPrevAbrir();   // si venía trabada del ingreso: este ya es el flyer que corresponde
  _fgMontosVisibles();
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
    return (conRotulo?'<div style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray,#777);margin:10px 0 5px">'+_escHtml(_solapaLabel(sol))+'</div>':'')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+os.map(function(o){
        return '<button class="btn-submit" style="flex:1;min-width:110px;background:'+_optColor(o)+'" data-o="'+o+'">'+_escHtml(_optLabel(o))+'</button>';
      }).join('')+'</div>';
  }
  var hayOtras=_FG_OPTS.some(function(o){return _optSolapa(o)!=='flyer';});
  d.innerHTML='<div class="box"><h3>'+_escHtml(title)+'</h3>'+
    '<p>Eleg&iacute; a qu&eacute; armador corresponde.</p>'+
    _OPC_SOLAPAS.map(function(s){return fila(s,hayOtras);}).join('')+
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
var _TIT_DEF={ptitle:'Flyer Galicia 5.5',promos:'Promociones',estudio:'Estudio',promos_ptitle:'Buscador de Promociones',
  hunter:'Buscar flyer',hunter_ptitle:'Flyer por empresa'};
// Un título por solapa del armador, derivado del registro: la solapa nueva
// aparece sola en los 4 toques y en _titulos.json, sin tocar esta lista.
_SOLAPAS.forEach(function(s){_TIT_DEF[s.id]=s.def;});
// Orden de las solapas del header: lo elige el admin manteniendo apretada una
// solapa y arrastrándola, y se guarda junto a los nombres en _titulos.json (clave
// "orden": los ids de los tabs). Lo ven todos los usuarios, igual que los nombres.
// Sin orden guardado rige el del HTML.
var _TIT_ORDEN=null;
function _appTabs(){
  var h=document.querySelector('header');
  return h?Array.prototype.slice.call(h.querySelectorAll('.app-tab')):[];
}
function _appTabId(el){return String(el.id||'').replace(/^apptab-/,'');}
function _titAplicarOrden(){
  var els=_appTabs();
  if(els.length<2||!Array.isArray(_TIT_ORDEN)||!_TIT_ORDEN.length)return;
  var ord=_TIT_ORDEN,pad=els.length;
  var orden=els.slice().sort(function(a,b){
    var ia=ord.indexOf(_appTabId(a)),ib=ord.indexOf(_appTabId(b));
    // una solapa que no está en la lista guardada (agregada después) va al final,
    // en el orden en que viene del HTML
    if(ia<0)ia=pad+els.indexOf(a);
    if(ib<0)ib=pad+els.indexOf(b);
    return ia-ib;
  });
  // Los tabs son hermanos del menú del usuario dentro del <header>: se reinsertan
  // todos antes de lo que venga después del último, así ninguno puede terminar
  // detrás del menú por más que se lo arrastre hasta el borde.
  var padre=els[0].parentNode,ref=els[els.length-1].nextSibling;
  orden.forEach(function(el){padre.insertBefore(el,ref);});
}
// ── SOLAPA CON LA QUE ARRANCA LA APP ─────────────────────────────────────────
// Al entrar se abre la PRIMERA solapa del header de izquierda a derecha: la que
// el admin dejó primera, salteando las que ese perfil no ve. Antes arrancaba
// siempre en Flyer Galicia (el tab venía con .active puesto desde el HTML).
// Hay que esperar DOS cosas que cargan por separado: el orden viene con los
// títulos y la visibilidad con las facultades; la que termina última dispara el
// cambio. Si el usuario alcanzó a elegir una solapa a mano mientras cargaban, se
// respeta la suya y no se le mueve la pantalla abajo del dedo.
var _inicioOrden=false,_inicioFac=false,_inicioHecho=false,_solapaAMano=false;
// Y mientras eso se resuelve, la vista previa no se pinta. El flyer de la Opción 1
// se descarga desde el primer momento (es el del flyer activo), así que sin esta
// traba se veía un instante ESE flyer —el "original"— y recién después el de la
// solapa que quedó primera. Nadie dibuja hasta saber cuál va: la destraba
// _inicioListo (si la solapa de arranque usa la opción que ya está cargada) o
// _fgApplyOption (cuando llegó la imagen de la otra), y como red de seguridad un
// timeout en _showApp, para que un error de red no deje la pantalla en blanco.
var _fgPrevGate=true;
function _fgPrevAbrir(){
  if(!_fgPrevGate)return;_fgPrevGate=false;
  // Con qué opción (y qué imagen) arrancó: la próxima vez _fgPrecargaInicio la
  // empieza a bajar mientras se consulta el perfil.
  try{
    if(_me){var n=_optN(_fgOpt),c=_fgOptCache[n];
      localStorage.setItem('fg_ultopt_'+_me.id,JSON.stringify({o:n,img:(c&&c.imageUrl)||''}));}
  }catch(e){}
  if(typeof redraw==='function')redraw();
}
function _inicioSolapaInit(){
  var h=document.querySelector('header');
  if(!h||h.dataset.inicioOk)return;
  h.dataset.inicioOk='1';
  h.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('.app-tab'))_solapaAMano=true;
  },true);
}
function _inicioListo(que){
  if(que==='orden')_inicioOrden=true;else _inicioFac=true;
  if(_inicioHecho||!_inicioOrden||!_inicioFac)return;
  _inicioHecho=true;
  if(_solapaAMano){_fgPrevAbrir();return;} // eligió él: su propio switchApp manda
  var vis=_appTabs().filter(function(el){return el.style.display!=='none';});
  var id=vis.length?_appTabId(vis[0]):'';
  if(id&&typeof switchApp==='function')switchApp(id);
  // Si la solapa de arranque pidió otra opción, su imagen está viniendo: la vista
  // previa la destraba _fgApplyOption, ya con el flyer que corresponde.
  if(!_fgOptCargando())_fgPrevAbrir();
}
function _titGuardarOrden(){
  var nuevo=_appTabs().map(_appTabId);
  if(Array.isArray(_TIT_ORDEN)&&_TIT_ORDEN.join(',')===nuevo.join(','))return;
  _TIT_ORDEN=nuevo;
  saveTitulos(function(ok){if(ok)showToast('Orden de las solapas guardado');});
}
function _titElem(key){
  if(key==='ptitle')return document.querySelector('#layout .panel .ptitle');
  if(key==='promos_ptitle')return document.querySelector('#view-promos .ptitle');
  if(key==='hunter_ptitle')return document.querySelector('#view-hunter .ptitle');
  return document.querySelector('#apptab-'+key+' h1');
}
function _titLabel(key){return (_TIT[key]&&String(_TIT[key]).trim())||_TIT_DEF[key]||'';}
function _titAplicar(){
  Object.keys(_TIT_DEF).forEach(function(k){
    var el=_titElem(k);if(!el||el.querySelector('input'))return;
    el.textContent=_titLabel(k==='ptitle'?_ptitleKey():k);
  });
}
// El título del panel izquierdo sigue a la solapa del armador a la vista: en
// Flyer Eminent / Flyer Rubros dice el nombre de ESA solapa, no "Flyer Galicia 5.5".
function _ptitleKey(){return(_fgVista&&_fgVista!=='flyer'&&_TIT_DEF[_fgVista])?_fgVista:'ptitle';}
function _ptitleSync(){
  var el=_titElem('ptitle');if(!el||el.querySelector('input'))return;
  el.textContent=_titLabel(_ptitleKey());
}
function loadTitulos(cb){
  _bucketJson(TITULOS_FILE)
    .then(function(d){
      _TIT={};
      if(d&&typeof d==='object')Object.keys(_TIT_DEF).forEach(function(k){if(typeof d[k]==='string')_TIT[k]=d[k].replace(/[<>]/g,'').trim().slice(0,40);});
      _TIT_ORDEN=(d&&Array.isArray(d.orden))?d.orden.filter(function(x){return typeof x==='string'&&/^[a-z0-9_-]{1,20}$/i.test(x);}).slice(0,12):null;
      _titAplicar();_titAplicarOrden();_inicioListo('orden');if(cb)cb();
    }).catch(function(){_inicioListo('orden');if(cb)cb();});
}
function saveTitulos(cb){
  var meta=JSON.stringify(Object.assign({},_TIT,{orden:_TIT_ORDEN||undefined,updated_at:new Date().toISOString()}));
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
    var mueve=(k!=='ptitle'&&k!=='promos_ptitle'); // los títulos de panel no son solapas
    el.title='4 toques seguidos para cambiar el nombre'+(mueve?' · mantenelo apretado para mover la solapa':'');
    _tap4(el,function(){_titRenombrar(el,k);});
  });
  _titGestosOrden();
}
// Mantener apretada una solapa del header la levanta para arrastrarla y cambiar
// el orden (el mismo gesto que la barra de opciones del armador).
function _titGestosOrden(){
  var h=document.querySelector('header');
  if(!h||h.dataset.ordenOk)return;
  h.dataset.ordenOk='1';
  h.classList.add('mover-ok'); // habilita touch-action:none en las solapas (ver _newcss)
  var gest=_holdReorder(h,'.app-tab',_titGuardarOrden);
  // El click con el que termina el arrastre no tiene que cambiar de solapa ni
  // contar como uno de los 4 toques del renombrado: se corta en CAPTURA, antes
  // de llegar al onclick del tab y al listener de _tap4 que está en el h1.
  h.addEventListener('click',function(e){
    if(!gest.recienMovido())return;
    if(!e.target||!e.target.closest||!e.target.closest('.app-tab'))return;
    e.stopPropagation();e.preventDefault();
  },true);
}

// ── FLYER ACTIVO ──────────────────────────────────────────────────────────────
// _active.json: {name, imageUrl, updated_at}
// imageUrl apunta a _active_img.jpg subido al bucket (imagen extraída del HTML)

function _fetchActiveFlyer(cb){
  _bucketJson('_active.json')
    .then(function(d){
      _activeFlyerUrl=(d&&d.imageUrl)||null;
      _activeFlyerName=(d&&d.name)||'';
      var cfg=(d&&d.cfg&&typeof d.cfg==='object')?d.cfg:null;
      // El flyer activo trae su propio "mapa" de coordenadas → se dibuja alineado.
      // Sólo si la que está en pantalla sigue siendo la Opción 1: si el perfil ya
      // pasó a la opción que le toca, ponerle el mapa de la 1 la desalinearía.
      if(cfg&&_optN(_fgOpt)===1){_fgRecOlvidar();window.FLYER_CFG=cfg;}
      if(cb)cb(_activeFlyerUrl,_activeFlyerName,cfg);
    })
    .catch(function(){_activeFlyerUrl=null;_activeFlyerName='';if(cb)cb(null,'',null);});
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

function deactivateFlyer(btn,opt,ok){
  opt=_optN(opt);
  // Sin flyer activo, esa opción muestra el flyer de ejemplo con las posiciones
  // por defecto ("se ve con formato mal"): no puede pasar por un clic de más.
  if(!ok){
    fgConfirm('¿Desactivar el flyer de «'+_optLabel(opt)+'»?',{texto:'Mientras no tenga un flyer activo, quien use esa opción va a ver el flyer de ejemplo. Lo podés volver a activar desde la lista de versiones de abajo.',ok:'Desactivar'},function(si){if(si)deactivateFlyer(btn,opt,true);});
    return;
  }
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
  empresa:{xc:620,yc:725,lh:52,mw:1100,fs:46,ex:70,bg:"#f7f2ef",color:"#111111",peso:700},
  montos:{y:1069,fs:56,mh:58,bg:"#f4e0d3",peso:700,boxes:[
    {xc:224,ew:220,col:"#1d4070"},{xc:493,ew:215,col:"#1d4070"},
    {xc:760,ew:195,col:"#f5921e"},{xc:1008,ew:185,col:"#f5921e"}]},
  // Flyer Sueldo: UN solo importe de cashback, en naranja, en vez de las 4 cajas.
  // Sale el MAYOR de m1..m4 de la config activa (Eminent Black, Platinum, Plus
  // Gold y Plus). Mismo criterio de tapado que montos: se pinta con el color REAL
  // del fondo aun "sin cashback", por si el PDF trae un importe impreso debajo.
  // mw = ancho máximo: si el número no entra, se achica la letra hasta minFs.
  // Arranca donde la banda de montos; cada flyer se calibra una vez y queda.
  cashback:{xc:620,y:1069,mw:560,mh:80,fs:92,minFs:28,col:"#fa6400",peso:700,bg:"#f4e0d3"},
  // ew3: ancho de la banda cuando hay 3 asesores (la franja está limpia de punta a
  // punta, así los 3 entran separados y los mails no se achican). 1,2 y 4 usan ew.
  contacto:{ex:150,ey:5330,ew:940,ew3:1140,eh:130,bg:"#ffffff",y1:5360,y2:5390,y3:5418,
    xSingle:619,xLeft:310,xRight:930,fnBold:24,frReg:21,color:"#111",peso:700,
    // ── Modo "Oficiales por sede" (hasta 8 oficiales, cada uno con su ubicación) ──
    // Sólo se leen con el modo prendido: con el modo apagado el flyer se dibuja por
    // la rama de siempre y estos valores no participan. Van acá (y no como
    // constantes sueltas) para que viajen en el cfg por flyer de _flyer_cfgs.json:
    // el día que haya que ajustarlos por flyer, es sumar inputs al calibrador.
    ewS:1140,   // ancho de la banda en modo sedes (la franja está limpia de punta a punta)
    ehS:172,    // alto de cada fila: 4 líneas (sede + nombre + cel + mail) en vez de 3
    // Las 4 líneas, medidas desde el top de SU fila. El salto sede -> nombre (42px)
    // es más grande que el del resto (30/28): la sede es el encabezado del oficial,
    // y pegada al nombre se leían como una sola cosa.
    sedeDy:24, nomDy:66, celDy:96, mailDy:124,
    fnSede:21, colSede:"#111",                 // la sede va en negrita
    titH:64, titFs:27, titPeso:700, titColor:"#111"}, // franja del título, arriba de la grilla
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
// ── CALIBRACIONES DE ARRANQUE ───────────────────────────────────────────────
// La de fábrica (FLYER_CFG_DEFAULT) es la del Flyer Galicia. Un flyer de la
// familia "Pasá tu sueldo" tiene otra geometría (7382 px de alto contra 6457, el
// nombre de empresa más arriba, los 4 importes en grilla 2x2 y la banda de
// oficiales en otro lado), así que arrancar de la de fábrica obliga a arrastrar
// todas las zonas. Estos números salen de medir el PDF real: la app lo rasteriza
// a 1240 px de ancho (_rasterizeFlyer), así que la coordenada del PDF por
// 1240/ancho_pt da el px base, y lo que escribe la app se ubicó comparando el PDF
// vacío contra uno ya completado.
// OJO: contacto y legal se anclan ABAJO (_fgBottomYRaw usa imgH), por eso la base
// trae su propio imgH; si se cambia uno hay que mover el otro.
// El cartel del beneficio NO va acá: eso es la plantilla (_BENEF_PLANTILLAS), que
// se elige aparte en la misma pantalla.
var _CFG_BASES=[
  {id:'galicia',nombre:'Flyer Galicia (de fábrica)',cfg:null},
  {id:'sueldo',nombre:'Pasá tu sueldo: combustible',cfg:{
    imgH:7382,
    empresa:{xc:620,yc:658,lh:46,mw:1100,fs:42,ex:70},
    // Las cajas tapan poco a propósito: arriba de cada importe hay texto impreso
    // ("hasta alcanzar el límite" en la fila de arriba, las etiquetas Éminent
    // Black/Platinum en la de abajo) y de ahí sale la muestra del color de fondo.
    montos:{y:824,fs:46,mh:46,boxes:[
      {xc:626,ew:240,col:'#1d4070'},{xc:890,ew:240,col:'#1d4070'},
      {xc:626,ew:240,y:905,col:'#f5921e'},{xc:890,ew:240,y:905,col:'#f5921e'}]},
    contacto:{ex:150,ey:6107,ew:940,ew3:1140,eh:130,y1:6137,y2:6167,y3:6196,
      xSingle:620,xLeft:310,xRight:930,fnBold:25,frReg:23},
    legal:{x0:79,yStart:6350,yEnd:7360,maxW:1085,fs:12,lh:16}
  }},
  // El de los dos rubros es el mismo modelo pero más alto (7711 px) y con todo
  // unos píxeles más abajo y a la derecha: por eso es una base aparte y no un
  // retoque de la anterior.
  {id:'sueldo2',nombre:'Pasá tu sueldo: súper + combustible',cfg:{
    imgH:7711,
    empresa:{xc:620,yc:658,lh:46,mw:1100,fs:42,ex:70},
    montos:{y:839,fs:46,mh:46,boxes:[
      {xc:651,ew:240,col:'#1d4070'},{xc:915,ew:240,col:'#1d4070'},
      {xc:651,ew:240,y:920,col:'#f5921e'},{xc:915,ew:240,y:920,col:'#f5921e'}]},
    contacto:{ex:150,ey:6157,ew:940,ew3:1140,eh:130,y1:6187,y2:6216,y3:6245,
      xSingle:620,xLeft:310,xRight:930,fnBold:25,frReg:23},
    legal:{x0:79,yStart:6410,yEnd:7690,maxW:1085,fs:12,lh:16}
  }}
];
function _calBase(id){for(var i=0;i<_CFG_BASES.length;i++)if(_CFG_BASES[i].id===id)return _CFG_BASES[i];return null;}
// Vuelca una base sobre la calibración que se está editando. Pisa SÓLO las zonas
// que la base define; el resto queda como estaba. No se guarda nada hasta
// "Guardar y activar", así que cerrar la pantalla deshace.
function _calBaseAplicar(){
  if(!_cal)return;
  var sel=document.getElementById('cal-base');
  var b=_calBase(sel?sel.value:'');if(!b)return;
  // Clon profundo SIEMPRE: _fgMerge es shallow, así que sin clonar el array de
  // montos.boxes quedaría compartido con el registro y mover una caja en una
  // opción se las movería a todas las de la sesión.
  var nb=JSON.parse(JSON.stringify(b.cfg||FLYER_CFG_DEFAULT));
  Object.keys(nb).forEach(function(k){
    var v=nb[k];
    if(v&&typeof v==='object'&&!Array.isArray(v))_cal.cfg[k]=_fgMerge(_cal.cfg[k]||{},v);
    else _cal.cfg[k]=v;
  });
  _calPropsSync();_calRenderLegend();_calDraw();
  if(typeof showToast==='function')showToast('Base «'+b.nombre+'» cargada. Si no era, cerrá sin guardar.');
}
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
  // "Pasá tu sueldo": en estos flyers el cuadro NO viene vacío — el arte ya trae
  // impreso "25% de ahorro / en combustible los domingos (5)" — así que la app
  // escribe sólo dos cosas: la bajada con el nombre de la empresa (a la izquierda
  // del dibujo) y el tope (debajo del texto impreso). Medido sobre el PDF real
  // (595x3542 pt rasterizado a 1240 px): y 2428/2462 para la bajada y 2498 para
  // el tope. Las tres líneas llevan dx a propósito: _calBenefCentrar le pisa la x
  // a toda línea SIN dx y la fuerza a centrada, y acá cada una va en su columna.
  // fijo: NO se recentra en el cuadro al cargarla. Las otras plantillas escriben
  // el cartel entero sobre un cuadro vacío, así que centrarlas es lo correcto;
  // estas dos van pegadas a texto que YA está impreso en el arte, con posiciones
  // medidas del PDF, y recentrarlas las bajaba. "Centrar en el cuadro" sigue
  // estando a mano por si hace falta.
  adicional:{nombre:'Promo adicional: combustible',fijo:true,campos:{importe:'Tope de reintegro mensual'},lineas:[
    {t:'Además, **{nombre}** tiene una promo adicional.',x:119,dx:-501,y:2445,fs:29,lh:34,maxLin:3,peso:500,color:'#000000',align:'left',mw:320},
    {t:'Tope de reintegro mensual {importe}',x:673,dx:53,y:2498,fs:21,peso:500,color:'#000000',align:'left',mw:470}
  ]},
  // Variante con los dos rubros: el cuadro trae impresos los dos bloques ("25% de
  // ahorro en combustible los domingos" a la izquierda y "en supermercados los
  // martes" a la derecha) y la app escribe SÓLO los dos topes, uno abajo de cada
  // bloque. {importe} = supermercado y {importe2} = combustible, igual que en la
  // plantilla "Ambos", para que las etiquetas del formulario digan lo mismo.
  // La bajada "Además, tenés esta promo adicional" va impresa en el arte (no lleva
  // el nombre de la empresa); si algún PDF viniera sin ella, se agrega con "+ Línea"
  // centrada (x = el eje del bloque) en y 2400, letra 29.
  adicional2:{nombre:'Promo adicional: súper + combustible',fijo:true,campos:{importe:'Tope supermercado',importe2:'Tope combustible (si es distinto)'},lineas:[
    {t:'Tope de reintegro mensual {importe2}',g:'t',x:279,dx:-341,y:2572,fs:17,peso:500,color:'#000000',align:'left',mw:390},
    {t:'Tope de reintegro mensual {importe}',g:'t',x:667,dx:47,y:2572,fs:17,peso:500,color:'#000000',align:'left',mw:390}
  ]},
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
function _fgCfg(){return _fgCfgDe(window.FLYER_CFG);}
function _fgCfgDe(c){
  var d=FLYER_CFG_DEFAULT;c=c||{};var cb=c.benef||{};
  return {imgW:c.imgW||d.imgW,imgH:c.imgH||d.imgH,recDe:c.recDe||0,
    cropH:c.cropH||0, // altura final fijada a mano (0 = automático)
    bottomMargin:(c.bottomMargin!=null?c.bottomMargin:d.bottomMargin),
    empresa:_fgMerge(d.empresa,c.empresa),montos:_fgMerge(d.montos,c.montos),cashback:_fgMerge(d.cashback,c.cashback),
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
// Sufijo de los ids/claves de un asesor: el 1 va sin número (nombre, celular, email)
// y del 2 en adelante con número (nombre2, celular3...). Invariante en toda la app.
function _fgSfx(n){return (n===1)?'':String(n);}
// Asesores cargados, en orden. Sólo cuentan los que tienen nombre.
// El tope sale de v.sedes (no del global _fgSedes): así el historial, el borrador y
// el masivo rinden igual que la pantalla, aunque el modo esté apagado en ese momento.
function _fgAsesores(v){
  var out=[];if(!v)return out;
  var max=v.sedes?8:4;
  for(var n=1;n<=max;n++){
    var s=_fgSfx(n);
    if(v['has'+n]&&(v['nombre'+s]||'').trim())
      out.push({n:v['nombre'+s],c:v['celular'+s]||'',e:v['email'+s]||'',u:(v['ubic'+n]||'').trim()});
  }
  return out;
}
// Filas de la grilla. Modo normal: 1 sola hasta 3 asesores, 2 con 4. Modo sedes:
// siempre 2 columnas (5->3 filas, 6->3, 7->4, 8->4).
function _fgRows(n,sedes){
  if(sedes)return Math.max(1,Math.ceil(n/(n>1?2:1)));
  return (n>=4)?2:1;
}
// Alto extra (px BASE) que se le inserta al flyer para que entre el bloque de asesores.
// Normal: cada fila de más suma eh. Sedes: el bloque entero (rows*ehS) reemplaza a la
// banda de una fila (eh), más la franja del título si hay título.
// Con esto _fgBottomYRaw(ey)+extra+eh == _fgBottomYRaw(ey)+titH+rows*ehS, o sea: el
// título entra JUSTO en el hueco que abre fgDrawAll, sin pisar el "¡Consultanos!".
function _fgExtraBaseFor(v){
  var C=_fgCfg().contacto,eh=C.eh||130;
  var n=_fgAsesores(v).length;
  if(v&&v.sedes){
    var alto=_fgRows(n,true)*(C.ehS||160)-eh;
    if((v.sedesTit||'').trim())alto+=(C.titH||64);
    return Math.max(0,alto)*_fgSE(1);
  }
  return (_fgRows(n)-1)*eh*_fgSE(1);
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
// Corta en la frase que aparece PRIMERO en el texto (a igual lugar, la que va
// antes en la lista). Antes cortaba en la primera de la lista que apareciera en
// cualquier lado, y lo de antes de ese corte quedaba sin negrita: con
// "(1) Promoción del 100% de ahorro. … **tope**" el (1) salía en letra común.
function _fgPhraseSplit(text,phrases){
  var result=[],remaining=text;
  while(remaining.length>0){
    var bi=-1,bp='';
    for(var i=0;i<phrases.length;i++){
      var p=phrases[i];if(!p)continue;
      var idx=remaining.indexOf(p);
      if(idx>=0&&(bi<0||idx<bi)){bi=idx;bp=p;if(!idx)break;}
    }
    if(bi<0){result.push({text:remaining,bold:false});break;}
    if(bi>0)result.push({text:remaining.slice(0,bi),bold:false});
    result.push({text:bp+" ",bold:true});
    remaining=remaining.slice(bi+bp.length).replace(/^\s+/,"");
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
  _fgLgDibujar(c,s,v);               // logos cambiados a mano (van sobre el arte, debajo de todo lo demás)
  fgDrawEmpresa(c,s,v.empresa);
  // cashUnico viaja en v (igual que benef) para que pantalla, masivo, padrón y
  // calibrador rindan igual. Un ítem viejo del historial no lo trae: si la opción
  // activa es de una solapa de monto único, se deduce de ahí.
  var _cu=(v.cashUnico!=null)?v.cashUnico:!!_solCfg(_optSolapa(_fgOpt)).cashUnico;
  if(_cu)fgDrawCashback(c,s,v);else fgDrawMontos(c,s,v);
  if(v.benef)fgDrawBenef(c,s,v);      // Flyer Rubros: cartel del beneficio exclusivo
  var cb=fgDrawContacto(c,s,v)||0;   // fondo (px escalados) del bloque de asesores
  var lb=fgDrawLegal(c,s,_fgLegalConValores(v.legal,v))||0; // fondo (px escalados) del último renglón de legales
  var bottomScaled=Math.max(cb,lb);
  // guardo el fondo del contenido en coords base para poder recortar el blanco sobrante
  window._fgContentBottomBase=(s>0?bottomScaled/s:bottomScaled);
}
// Color REAL del fondo del flyer en la franja bx0..bx1 a la altura by, TODO en
// coordenadas base (las del calibrador, ancho _fgCfg().imgW). Las zonas que se
// tapan antes de escribir encima (empresa, montos, cashback) usan esto en vez de
// un color fijo: el tono del PDF cambia de una versión a otra y con color fijo se
// notaba el cuadrito alrededor del número.
// Lee la IMAGEN ORIGINAL, NO el canvas de la vista previa. El canvas está
// dibujado a la escala del zoom, así que al alejar la vista la fila que se leía
// caía bastante más arriba del arte y encima con los píxeles vecinos promediados
// por el reescalado: salía un color que no era el fondo y el importe quedaba
// "resaltado". Leyendo la imagen el color es el mismo a cualquier zoom y es el
// mismo que sale en el flyer descargado.
// Muestrea 5 puntos y devuelve la mediana (una letra suelta no lo desvía). Si la
// imagen no deja leer píxeles (cargada sin CORS), cae en fallback.
// El color de un punto fijo de una imagen fija no cambia: se recuerda por imagen
// y coordenadas (antes se leían píxeles 5-6 veces en cada tecla). Si la imagen
// cambia de tamaño se olvida todo; con un tope, porque el calibrador pide puntos
// nuevos a cada paso del arrastre. Un fallo (imagen sin CORS) no se recuerda.
var _fgBgCv=null,_fgBgCtx=null;
var _fgBgMemo=(typeof WeakMap==='function')?new WeakMap():null;
function _fgBgMuestra(bx0,bx1,by,fallback){
  var im=window.baseImg;if(!im||!im.width)return fallback;
  var mem=null,clave=bx0+'|'+bx1+'|'+by+'|'+_fgSE(1);
  if(_fgBgMemo){
    mem=_fgBgMemo.get(im);
    if(!mem||mem.w!==im.width||mem.h!==im.height||mem.n>400){mem={w:im.width,h:im.height,n:0,c:Object.create(null)};_fgBgMemo.set(im,mem);}
    var ya=mem.c[clave];if(ya!==undefined)return ya;
  }
  var col=_fgBgLeer(im,bx0,bx1,by,null);
  if(col===null)return fallback;
  if(mem){mem.c[clave]=col;mem.n++;}
  return col;
}
function _fgBgLeer(im,bx0,bx1,by,fallback){
  try{
    var k=_fgSE(1);                                   // base → píxeles reales de la imagen
    var y=Math.max(0,Math.min(im.height-1,Math.round(by*k)));
    var x0=Math.max(0,Math.min(im.width-1,Math.round(bx0*k)));
    var x1=Math.max(x0+1,Math.min(im.width,Math.round(bx1*k)));
    var w=x1-x0;
    if(!_fgBgCv){_fgBgCv=document.createElement('canvas');_fgBgCv.height=1;_fgBgCtx=_fgBgCv.getContext('2d',{willReadFrequently:true});}
    if(_fgBgCv.width<w)_fgBgCv.width=w;               // sólo crece: reasignar el buffer es caro
    _fgBgCtx.imageSmoothingEnabled=false;
    _fgBgCtx.clearRect(0,0,w,1);
    _fgBgCtx.drawImage(im,x0,y,w,1,0,0,w,1);          // copia 1:1, sin reescalar
    var d=_fgBgCtx.getImageData(0,0,w,1).data,rs=[],gs=[],bs=[];
    for(var i=0;i<5;i++){
      var p=Math.min(w-1,Math.floor(w*(i+0.5)/5))*4;
      rs.push(d[p]);gs.push(d[p+1]);bs.push(d[p+2]);
    }
    function med(a){a.sort(function(p,q){return p-q;});return a[2];}
    return 'rgb('+med(rs)+','+med(gs)+','+med(bs)+')';
  }catch(e){return fallback;}
}
// Peso de la tipografía como prefijo de c.font ("bold ", "600 ", …). Cada zona
// lo elige desde el calibrador; sin valor guardado, la negrita de siempre.
function _fgPeso(p){return (p==null||p==='')?'bold ':(String(p)+' ');}
// Posición y alto de UNA caja de montos. Las dos claves son opcionales: sin
// valor propio manda la del grupo (M.y / M.mh), o sea la fila horizontal de
// siempre. Un flyer con los cuatro importes en grilla (MIXTO) le pone y a cada
// caja desde el calibrador. OJO: NUNCA escribir estos valores al dibujar.
// _fgMerge es shallow, así que si el cfg del flyer no trae boxes, M.boxes ES el
// array de FLYER_CFG_DEFAULT y se contaminarían todas las opciones de la sesión.
function _fgMBoxY(M,m){return (m&&m.y!=null)?m.y:M.y;}
function _fgMBoxH(M,m){return (m&&m.mh!=null)?m.mh:M.mh;}
function fgDrawEmpresa(c,s,empresa){
  var E=_fgCfg().empresa,se=_fgSE(s);
  if(E.off)return; // la zona se quitó con "Recortar"
  var xc=Math.round(E.xc*se),yc=Math.round(E.yc*se);
  var lh=Math.round(E.lh*se),mw=Math.round(E.mw*se),fs=Math.round(E.fs*se);
  var ex=Math.round(E.ex*se),ry=yc-lh;
  c.fillStyle=_fgBgMuestra(E.ex,E.ex+E.mw,E.yc-E.lh-4,E.bg); // fondo real, 4px (base) arriba del recuadro
  c.fillRect(ex,ry,mw,lh*2+Math.round(8*se));
  var pe=_fgPeso(E.peso);
  c.font=pe+fs+"px Arial,sans-serif";
  c.fillStyle=E.color||"#111";c.textAlign="center";c.textBaseline="middle";
  var full="Por ser parte de "+empresa;
  if(c.measureText(full).width<=mw){c.fillText(full,xc,yc);}
  else{
    c.fillText("Por ser parte de",xc,yc-Math.round(lh*0.5));
    var efs=fs,ew=c.measureText(empresa).width;
    if(ew>mw){efs=Math.floor(fs*(mw/ew));c.font=pe+efs+"px Arial,sans-serif";}
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
  function font(L,seg,size){return (seg.f?(B.peso2||800):(L.peso||500))+' '+size+'px '+fam;}
  function ancho(L,segs,size){var w=0;segs.forEach(function(sg){c.font=font(L,sg,size);w+=c.measureText(sg.t).width;});return w;}
  // Reparte el texto en renglones que entren en mw, palabra por palabra y sin
  // perder qué tramos van resaltados. Sólo para las líneas con lh (interlínea):
  // sin lh se comporta como siempre, un renglón que se achica si no entra.
  // Es lo que hace que la bajada del cartel sea UN texto: el nombre de la empresa
  // puede ser corto o larguísimo y el renglón se parte solo, sin que queden dos
  // tamaños distintos pegados.
  function renglones(L,segs,size,mw){
    var toks=[];
    segs.forEach(function(sg){
      String(sg.t).split(/(\s+)/).forEach(function(p){if(p!=='')toks.push({t:p,f:sg.f});});
    });
    var lins=[],act=[],w=0;
    function cerrar(){
      while(act.length&&!act[act.length-1].t.trim())act.pop(); // sin espacios colgando
      if(act.length)lins.push(act);
      act=[];w=0;
    }
    toks.forEach(function(tk){
      c.font=font(L,tk,size);
      var tw=c.measureText(tk.t).width;
      if(tk.t.trim()&&act.length&&w+tw>mw)cerrar();
      if(!act.length&&!tk.t.trim())return;  // un renglón no arranca con espacios
      act.push(tk);w+=tw;
    });
    cerrar();
    return lins.length?lins:[[]];
  }
  function anchoLin(L,ln,size){var w=0;ln.forEach(function(tk){c.font=font(L,tk,size);w+=c.measureText(tk.t).width;});return w;}
  function anchoMax(L,lins,size){var m=0;lins.forEach(function(ln){m=Math.max(m,anchoLin(L,ln,size));});return m;}
  // 1ª pasada: resuelvo el texto de cada línea y con qué tamaño entra en su ancho.
  var items=[];
  (B.lineas||[]).forEach(function(L){
    var t=String(L.t||'');
    if(t.indexOf('{importe}')>=0&&!importe.trim())return;
    if(t.indexOf('{importe2}')>=0&&!importe2.trim())return;
    if(nombre)t=t.replace(/\{nombre\}/g,function(){return nombre;});
    // Sin nombre cargado: se saca el {nombre} con sus espacios, y si venía
    // resaltado (**{nombre}**) también los asteriscos, para que no quede un
    // hueco en negrita ni los ** a la vista.
    else t=t.replace(/\*\*\s*\{nombre\}\s*\*\*/g,' ').replace(/\s*\{nombre\}\s*/g,' ').replace(/\s+([!?.,;:])/g,'$1').replace(/\s{2,}/g,' ').trim();
    t=t.replace(/\{importe2\}/g,function(){return importe2;}).replace(/\{total\}/g,function(){return _fgImporteSuma(importe,importe2);}).replace(/\{importe\}/g,function(){return importe;});
    if(!t.trim())return;
    var segs=_fgBenefSegs(t),base=Math.round(L.fs*se*2)/2,mw=Math.round(L.mw*se),fs=base;
    var min=Math.max(1,Math.round(8*se));
    if(L.lh){
      // Con interlínea: primero intenta repartir en renglones a tamaño normal, y
      // sólo achica si ni así entra (una palabra más ancha que el recuadro, o más
      // renglones de los permitidos).
      var maxLin=L.maxLin||3;
      while(fs>min){
        var ls=renglones(L,segs,fs,mw);
        if(ls.length<=maxLin&&anchoMax(L,ls,fs)<=mw)break;
        fs=Math.round((fs-0.5)*2)/2;
      }
      if(fs<min)fs=min;
    }else{
      var w=ancho(L,segs,fs);
      if(w>mw&&w>0)fs=Math.max(Math.floor(fs*mw/w*2)/2,min);
    }
    items.push({L:L,segs:segs,base:base,fs:fs});
  });
  // Las líneas con la misma "g" son UN texto partido en renglones (p. ej. la
  // bajada con el nombre de la empresa): si una se tiene que achicar para entrar,
  // las demás la acompañan en la misma proporción. Sin esto, un nombre largo
  // dejaba un renglón chico arriba de otro grande y no se leía como un solo texto.
  var kMin={};
  items.forEach(function(it){
    var g=it.L.g;if(!g||!it.base)return;
    var k=it.fs/it.base;if(kMin[g]==null||k<kMin[g])kMin[g]=k;
  });
  items.forEach(function(it){
    var g=it.L.g;if(!g||kMin[g]==null||kMin[g]>=1)return;
    it.fs=Math.max(Math.max(1,Math.round(8*se)),Math.round(it.base*kMin[g]*2)/2);
  });
  // 2ª pasada: dibujo, ya con el tamaño definitivo (el ancho se vuelve a medir
  // porque de él sale el centrado).
  items.forEach(function(it){
    var L=it.L,fs=it.fs,mw=Math.round(L.mw*se);
    // Los renglones se vuelven a repartir acá: el tamaño pudo cambiar al
    // emparejar el grupo. Sin lh es uno solo, o sea lo de siempre.
    var lins=L.lh?renglones(L,it.segs,fs,mw):[it.segs],n=lins.length;
    var x=Math.round(L.x*se),y=Math.round(L.y*se),lh=Math.round((L.lh||0)*se);
    c.textBaseline='middle';c.textAlign='left';
    lins.forEach(function(ln,i){
      // El bloque queda centrado en la y de la línea: crece para arriba y para
      // abajo por igual, así no se come lo que tiene debajo al sumar un renglón.
      var yy=Math.round(y+(i-(n-1)/2)*lh);
      var cx=(L.align==='center')?x-anchoLin(L,ln,fs)/2:x;
      ln.forEach(function(sg){
        c.font=font(L,sg,fs);c.fillStyle=sg.f?(B.color2||'#fa6400'):(L.color||'#000');
        c.fillText(sg.t,cx,yy);cx+=c.measureText(sg.t).width;
      });
    });
  });
}
function fgDrawMontos(c,s,v){
  var M=_fgCfg().montos,se=_fgSE(s);
  if(M.off)return; // la franja de importes se quitó con "Recortar"
  var fs=Math.round(M.fs*se);
  // "sin cashback": hay que TAPAR igual la zona (por si el flyer trae importes
  // impresos debajo) pero sin escribir número y sin que se vean cuatro cajitas
  // vacías: pinto con el color real del fondo, muestreado del margen izquierdo
  // a la misma altura. Si el canvas no deja leer píxeles, caigo en M.bg.
  var vals=v.nocb?['','','','']:[v.m1,v.m2,v.m3,v.m4];
  // Cada caja puede traer SU posición y SU alto (flyer MIXTO: los cuatro
  // importes en grilla 2x2 en vez de la fila de siempre). Sin valores propios
  // usa los del grupo, que es exactamente el flyer de toda la vida.
  var cajas=M.boxes.map(function(m){
    var by=_fgMBoxY(M,m),bh=_fgMBoxH(M,m);
    return {mx:Math.round(m.xc*se),mw:Math.round(m.ew*se),
            my:Math.round(by*se),mh:Math.round(bh*se),col:m.col,
            bx:m.xc,bw:m.ew,by:by,bh:bh};   // las mismas medidas en coords base, para el muestreo
  });
  // Color de fondo REAL justo arriba de cada caja (_fgBgMuestra), con o sin
  // cashback: el tono del flyer cambia entre versiones del PDF y con M.bg fijo
  // se notaba el recuadro alrededor de cada importe. Va en coords base: el
  // muestreo lee la imagen, no el canvas, así el color no cambia con el zoom.
  function _bgDe(b){
    return _fgBgMuestra(b.bx-b.bw/2,b.bx+b.bw/2,b.by-b.bh/2-5,M.bg);
  }
  // Se muestrea TODO antes de pintar: en la grilla 2x2 la caja de abajo tomaría
  // el color de la de arriba ya tapada (o de su número) en vez del arte.
  var bgs=cajas.map(function(b){return _bgDe(b);});
  cajas.forEach(function(b,i){
    c.fillStyle=bgs[i];c.fillRect(b.mx-b.mw/2,b.my-b.mh/2,b.mw,b.mh);
    c.font=_fgPeso(M.peso)+fs+"px Arial,sans-serif";
    c.fillStyle=b.col;c.textAlign="center";c.textBaseline="middle";
    c.fillText(vals[i],b.mx,b.my);
  });
}
// Flyer Sueldo: el único importe del flyer (el mayor de la config), en naranja.
// Tapa SIEMPRE la zona —con o sin cashback— con el color real del fondo, igual
// que fgDrawMontos: el tono del PDF cambia entre versiones y con un color fijo se
// notaba el recuadro. Si el número no entra en mw, se achica la letra (como el
// nombre de empresa) en vez de pisar el arte de al lado.
function fgDrawCashback(c,s,v){
  var K=_fgCfg().cashback,se=_fgSE(s);
  if(K.off)return;
  var xc=Math.round(K.xc*se),y=Math.round(K.y*se);
  var mw=Math.round(K.mw*se),mh=Math.round(K.mh*se);
  c.fillStyle=_fgBgMuestra(K.xc-K.mw/2,K.xc+K.mw/2,K.y-K.mh/2-5,K.bg);
  c.fillRect(xc-mw/2,y-mh/2,mw,mh);
  var txt=v.nocb?'':_fgMontoMayor(v);
  if(!txt)return;                       // sin cashback: zona tapada, sin número
  var fs=Math.round(K.fs*se),pk=_fgPeso(K.peso);
  c.font=pk+fs+"px Arial,sans-serif";
  var w=c.measureText(txt).width;
  if(w>mw&&w>0){
    fs=Math.max(Math.floor(fs*mw/w),Math.max(1,Math.round((K.minFs||28)*se)));
    c.font=pk+fs+"px Arial,sans-serif";
  }
  c.fillStyle=K.col||"#fa6400";c.textAlign="center";c.textBaseline="middle";
  c.fillText(txt,xc,y);
}
// Layout de asesores: 1 centrado · 2 lado a lado · 3 en fila · 4 en 2x2 (el flyer crece).
// Con 1 y 2 usa EXACTAMENTE las coords calibradas de siempre => cero regresión.
function fgDrawContacto(c,s,v){
  if(v&&v.sedes)return _fgDrawContactoSedes(c,s,v); // modo "oficiales por sede": otra grilla
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
    c.font=(bold?_fgPeso(C.peso):'')+size+'px Arial,sans-serif';
    var w=c.measureText(txt).width;
    return (w>maxW&&w>0)?Math.max(Math.floor(size*maxW/w),minF):size;
  }
  c.textAlign="center";c.textBaseline="middle";c.fillStyle=C.color;
  var f1=fit(nom,fn,true);
  c.font=_fgPeso(C.peso)+f1+"px Arial,sans-serif";c.fillText(nom,cx,Math.round(_fgBottomY(C.y1,s))+dy);
  if(cel){var f2=fit(cel,fr,false);c.font=f2+"px Arial,sans-serif";c.fillText(cel,cx,Math.round(_fgBottomY(C.y2,s))+dy);}
  if(mail){var f3=fit(mail,fr,false);c.font=f3+"px Arial,sans-serif";c.fillText(mail,cx,Math.round(_fgBottomY(C.y3,s))+dy);}
}
// ── MODO "OFICIALES POR SEDE" ────────────────────────────────────────────────
// Hasta 8 oficiales en 2 columnas, cada uno con su ubicación arriba del nombre
// (pin + sede en negrita) y un título editable arriba de toda la grilla. Es una
// rama aparte a propósito: la de siempre (1 a 4, sin ubicación) queda intacta.
//
// Acá las Y se calculan ABSOLUTAS desde el top del bloque, no con el dy relativo
// de fgDrawContacto: el bloque cambia de alto según cuántas filas haya, así que
// anclar cada línea a su fila es más simple de seguir que corregir la de abajo.
//
// El pin se traza a mano (silueta del map-pin de Feather) en vez de escribir el
// emoji 📍 con fillText: el emoji sale de colores, depende de la fuente que tenga
// el sistema y rinde distinto en el PDF. Mismo criterio que los íconos del header.
// El pin de la ubicación es el EMOJI 📍 (U+1F4CD), igual que en el flyer del banco,
// y vive dentro del campo de texto: el campo arranca con "📍 " puesto y el flyer
// dibuja literalmente lo que haya ahí. Así sale a color (lo rasteriza la fuente de
// emoji del sistema) y el que no lo quiera simplemente lo borra del campo.
var _FG_UBIC_PIN=String.fromCodePoint(0x1F4CD); // por codepoint: el emoji no viaja en el fuente
// Arial no tiene el emoji: sin este fallback el navegador dibuja el cuadrito "tofu".
var _FG_UBIC_FONT='Arial,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
// Lo que el usuario realmente escribió: si en el campo quedó sólo el pin (o nada),
// la ubicación está vacía y no se dibuja ni cuenta como dato cargado.
function _fgUbicTexto(raw){
  var t=(raw||'').trim();
  return t.split(_FG_UBIC_PIN).join('').trim()?t:'';
}
function _fgDrawContactoSedes(c,s,v){
  var C=_fgCfg().contacto,se=_fgSE(s);
  var list=_fgAsesores(v),n=list.length;
  var tit=(v.sedesTit||'').trim();
  var titH=tit?(C.titH||64):0;
  var rows=_fgRows(n,true),cols=(n>1)?2:1;
  var pitch=(C.ehS||160);
  var top=Math.round(_fgBottomYRaw(C.ey,s));   // arranque del hueco que abrió fgDrawAll
  var boxTop=top+Math.round(titH*se);
  var boxH=Math.round(rows*pitch*se);
  // Banda ancha (ewS), centrada donde está la de siempre: la franja está limpia de
  // punta a punta, así los mails largos entran sin achicarse tanto.
  var im=_fgCfg().imgW||1240,bw=C.ewS||C.ew3||C.ew;
  if(bw>im)bw=im;
  var bx=C.ex+C.ew/2-bw/2;
  if(bx<0)bx=0;if(bx+bw>im)bx=im-bw;
  c.fillStyle=C.bg;
  c.fillRect(Math.round(bx*se),top,Math.round(bw*se),Math.round(titH*se)+boxH);
  if(tit){
    var tfs=Math.round((C.titFs||27)*se),tmax=Math.round((bw-40)*se);
    c.textAlign="center";c.textBaseline="middle";c.fillStyle=C.titColor||C.color;
    c.font=(C.titPeso||700)+" "+tfs+"px Arial,sans-serif";
    var tw=c.measureText(tit).width;
    if(tw>tmax&&tw>0){ // si no entra, se achica (mismo criterio que el resto del flyer)
      tfs=Math.max(Math.round(10*se),Math.floor(tfs*tmax/tw));
      c.font=(C.titPeso||700)+" "+tfs+"px Arial,sans-serif";
    }
    c.fillText(tit,Math.round((bx+bw/2)*se),top+Math.round(titH*se/2));
  }
  if(!n)return boxTop+boxH;
  var colW=bw/cols;
  var xs=(cols===1)?[bx+bw/2]:[bx+bw/4,bx+3*bw/4];
  list.forEach(function(a,i){
    var r=Math.floor(i/cols),ci=i%cols;
    var filaTop=boxTop+Math.round(r*pitch*se);
    _fgDrawSedeC1(c,s,xs[ci],C,a,filaTop,colW);
  });
  return boxTop+boxH; // fondo del bloque (px escalados)
}
// Un oficial del modo sedes. filaTop: top de SU fila (px ya escalados).
function _fgDrawSedeC1(c,s,xc,C,a,filaTop,colW){
  var se=_fgSE(s),cx=Math.round(xc*se);
  var maxW=colW?Math.round((colW-24)*se):0;
  var minF=Math.max(1,Math.round(9*se));
  function fit(txt,size,bold,fam){
    if(!maxW||!txt)return size;
    c.font=(bold?_fgPeso(C.peso):'')+size+'px '+(fam||'Arial,sans-serif');
    var w=c.measureText(txt).width;
    return (w>maxW&&w>0)?Math.max(Math.floor(size*maxW/w),minF):size;
  }
  function linea(txt,dy,size,bold,color,fam){
    if(!txt)return;
    fam=fam||'Arial,sans-serif';
    var f=fit(txt,size,bold,fam);
    c.font=(bold?_fgPeso(C.peso):'')+f+"px "+fam;
    c.fillStyle=color;c.textAlign="center";c.textBaseline="middle";
    c.fillText(txt,cx,filaTop+Math.round(dy*se));
  }
  // La ubicación es una línea más: el emoji 📍 viene DENTRO del texto (ver
  // _FG_UBIC_PIN), así que se centra solo junto con el nombre de la sede.
  linea(a.u,C.sedeDy||24,Math.round((C.fnSede||21)*se),true,C.colSede||C.color,_FG_UBIC_FONT);
  linea(a.n,C.nomDy||66,Math.round(C.fnBold*se),true,C.color);
  linea(a.c,C.celDy||96,Math.round(C.frReg*se),false,C.color);
  linea(a.e,C.mailDy||124,Math.round(C.frReg*se),false,C.color);
}
// Marcadores dentro del legal ({empresa}, {cashback}, {plusgold}, …): se
// reemplazan por los valores del flyer al dibujar (el legal lo escribe la app
// desde el texto, así que es sólo texto: sin recuadros ni posiciones). Así el
// legal de Rubros ("… $24.000 en Supermercados y $30.000 en Combustibles") sigue
// al tope sin editarlo a mano, y el de Sueldo puede nombrar los cuatro paquetes
// sin tocarlo cuando cambia la configuración de montos. Un marcador sin valor
// (p. ej. {importe} en Flyer Galicia, o cualquiera con "sin cashback") se saca
// para que nunca quede impreso. El texto guardado y el del textarea conservan el
// marcador. Replacer por función: el texto trae "$".
// {total} = importe + importe2 ("$24.000" + "$30.000" → "$54.000"); vacío sin importes.
function _fgImporteSuma(a,b){
  var da=(a==null?'':String(a)).replace(/\D/g,''),db=(b==null?'':String(b)).replace(/\D/g,'');
  if(!da&&!db)return '';
  return _fgFmtImporte(String((parseInt(da||'0',10)||0)+(parseInt(db||'0',10)||0)));
}
// Los montos de CONFIGS vienen YA formateados ("$250.000"): se comparan por
// dígitos pero se devuelve el string TAL CUAL, así lo que sale en naranja es
// idéntico a lo que habría escrito la caja y a lo que escribe {cashback} en el
// legal. Con "sin cashback" (v.nocb) todos dan '' y el marcador se borra solo.
function _fgMontoDig(x){var d=(x==null?'':String(x)).replace(/\D/g,'');return d?parseInt(d,10):0;}
function _fgMontoN(v,n){return (v&&!v.nocb&&!_fgSinImportes()&&v['m'+n]!=null)?String(v['m'+n]).trim():'';}
// ¿El flyer en pantalla no lleva importes? (se recortó esa parte, o la opción
// publicada desde Estudio ya nació sin ellos)
function _fgSinImportes(){
  var C=_fgCfg(),cu=false;
  try{cu=!!_solCfg(_optSolapa(_fgOpt)).cashUnico;}catch(e){}
  return !!(cu?C.cashback.off:C.montos.off);
}
function _fgMontoMayor(v){
  if(!v||v.nocb||_fgSinImportes())return '';
  var best='',bd=0;
  for(var n=1;n<=4;n++){
    var t=_fgMontoN(v,n);if(!t)continue;
    var d=_fgMontoDig(t);if(d>bd){bd=d;best=t;}
  }
  return bd>0?best:'';
}
// Tabla de marcadores: sumar uno es UNA línea acá. La clave se normaliza
// (minúsculas, sin espacios ni guiones bajos), así {Plus Gold} y {plusgold} son
// lo mismo. Los montos salen de la configuración activa (BAU, Config 1, …), así
// que el mismo legal sirve para todas sin reescribirlo.
var _FG_LEGAL_VARS=[
  ['importe',     function(v){return v.importe||'';}],
  ['importe2',    function(v){return v.importe2||v.importe||'';}],
  ['total',       function(v){return _fgImporteSuma(v.importe,v.importe2||v.importe);}],
  ['empresa',     function(v){return v.empresa||'';}],
  ['nombre',      function(v){return v.empresa||'';}],     // alias histórico de {empresa}
  // {cashback} = el importe que sale en naranja. Hoy es siempre el de Eminent
  // Black (el más alto de toda config), así que no se ofrece como botón aparte
  // para no tener dos marcadores que escriben lo mismo; sigue andando por si
  // quedó escrito en algún legal.
  ['cashback',    function(v){return _fgMontoMayor(v);}],
  ['eminentblack',function(v){return _fgMontoN(v,1);}],
  ['platinum',    function(v){return _fgMontoN(v,2);}],
  ['plusgold',    function(v){return _fgMontoN(v,3);}],
  ['plus',        function(v){return _fgMontoN(v,4);}]
];
function _fgLegalVarKey(k){return String(k).toLowerCase().replace(/[\s_]+/g,'');}
function _fgLegalConValores(text,v){
  text=(text==null?'':String(text));
  if(text.indexOf('{')<0)return text;
  v=v||{};
  var vals={};
  _FG_LEGAL_VARS.forEach(function(p){vals[p[0]]=p[1](v)||'';});
  return text.replace(/\{\s*([A-Za-z0-9]+(?:[ _]+[A-Za-z0-9]+)*)\s*\}( ?)/g,function(m,k,sp){
    var key=_fgLegalVarKey(k);
    // Un {algo} que no está en la tabla se deja TAL CUAL: el legal puede traer
    // llaves escritas a propósito y nunca se las tiene que comer.
    if(!Object.prototype.hasOwnProperty.call(vals,key))return m;
    return vals[key]?vals[key]+sp:''; // sin valor: se va el marcador y el espacio que lo seguía
  });
}
// ── CACHES DEL TEXTO LEGAL ────────────────────────────────────────────────────
// Medir texto en canvas es caro, y asignar c.font lo es MÁS (el navegador parsea
// el shorthand CSS en cada asignación). El legal son ~1000 palabras: como estaba,
// cada tecla disparaba ~2000 asignaciones de c.font y ~1000 measureText, y si el
// texto no entraba el word-wrap corría DOS veces (~3000 y ~2000). De ahí venía el
// tipeo pastoso. Dos caches lo sacan sin cambiar un pixel del resultado:
//  _fgMeasC  → ancho por (negrita, fs, token). El ancho depende sólo de esos tres
//              datos porque la familia es fija (Arial), así que el valor sirve
//              entre contextos (preview y full-res) y entre redibujos.
//  _fgLegalC → el word-wrap YA resuelto, por (fs, maxW, texto). calcLines es puro:
//              fgSplitBold saca las negritas del propio texto y FG_BOLD_PHRASES no
//              se muta nunca. Tipear la empresa no toca el legal → acierta siempre.
// Los colores (L.bg / L.color) NO se cachean: se aplican en cada llamada, así el
// tema y el calibrador siguen mandando.
var _fgMeasC=Object.create(null),_fgMeasN=0;
var _fgLegalC=Object.create(null),_fgLegalN=0;
function _fgMeas(c,bold,fs,tok){
  var k=(bold?'b':'n')+fs+'|'+tok,w=_fgMeasC[k];
  if(w===undefined){
    c.font=(bold?"bold ":"")+fs+"px Arial,sans-serif";
    if(_fgMeasN>20000){_fgMeasC=Object.create(null);_fgMeasN=0;} // techo de memoria
    w=_fgMeasC[k]=c.measureText(tok).width;_fgMeasN++;
  }
  return w;
}
function fgDrawLegal(c,s,text){
  if(!text||!text.trim())return 0;
  var L=_fgCfg().legal,se=_fgSE(s);
  var x0=Math.round(L.x0*se),yStart=Math.round(_fgBottomY(L.yStart,s)),yEnd=Math.round(_fgBottomY(L.yEnd,s));
  var maxW=Math.round(L.maxW*se),availH=yEnd-yStart;
  c.fillStyle=L.bg;
  c.fillRect(x0-Math.round(2*se),yStart-Math.round(5*se),maxW+Math.round(20*se),availH+Math.round(30*se));
  c.textAlign="left";c.textBaseline="top";
  var paragraphs=null;
  function calcLines(fs){
    var ck=fs+'|'+maxW+'|'+text,hit=_fgLegalC[ck];
    if(hit)return hit;
    if(paragraphs===null)paragraphs=text.split("\n");
    var allLines=[];
    paragraphs.forEach(function(para){
      if(!para.trim()){allLines.push({gap:true});return;}
      var segs=fgSplitBold(para),currentTokens=[],lineW=0;
      segs.forEach(function(seg){
        seg.text.split(" ").forEach(function(word,wi,arr){
          if(!word)return;
          var tok=word+(wi<arr.length-1?" ":"");
          var w=_fgMeas(c,seg.bold,fs,tok);
          if(lineW+w>maxW&&currentTokens.length>0){allLines.push({tokens:currentTokens,gap:false});currentTokens=[];lineW=0;}
          currentTokens.push({text:tok,bold:seg.bold,w:w});lineW+=w;
        });
      });
      if(currentTokens.length>0)allLines.push({tokens:currentTokens,gap:false});
    });
    if(_fgLegalN>24){_fgLegalC=Object.create(null);_fgLegalN=0;} // techo de memoria
    _fgLegalC[ck]=allLines;_fgLegalN++;
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
  // El color y la fuente salen del loop por token: adentro nada más los cambia,
  // así que asignarlos sólo cuando cambia la negrita da el mismo dibujo.
  var y=yStart,font='',regular=fs+"px Arial,sans-serif",negrita="bold "+regular;
  c.fillStyle=L.color;
  lines.forEach(function(line){
    if(line.gap){y+=gapH;return;}
    var cx=x0;
    line.tokens.forEach(function(tok){
      var f=tok.bold?negrita:regular;
      if(f!==font)c.font=font=f;
      c.fillText(tok.text,cx,y);cx+=tok.w;
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
// tecla/zoom: con zoom alto son ~150MB reservados y tirados cada vez), lo que sacó
// el tironeo de la vista previa. Nadie le lee píxeles (_fgBgMuestra lee la imagen
// original en un canvas de una fila), así que NO lleva willReadFrequently: con esa
// bandera el navegador lo mantiene en memoria del CPU y dibujar el flyer entero en
// cada tecla es más lento.
var _fgFullCv=null,_fgFullCtx=null;
// ── REDIBUJADO COALESCIDO ─────────────────────────────────────────────────────
// redraw() es puramente visual (no devuelve nada y nadie lee el canvas justo
// después) y se lo llama muchísimas veces seguidas: una por tecla, y varias
// funciones lo encadenan 2-3 veces (setCfg, los toggles de asesor, cargar del
// historial). Pintar más de una vez por frame no se ve en pantalla. El wrapper
// junta todas las llamadas de un mismo frame en un solo dibujado y lo hace en
// requestAnimationFrame, justo cuando el navegador va a pintar.
// Quien necesite el canvas ya dibujado en la misma vuelta usa redrawNow().
var _fgRafId=0;
function fgRedrawCoalesced(){
  if(_fgRafId)return;
  _fgRafId=requestAnimationFrame(function(){_fgRafId=0;fgRedraw();});
}
function fgRedraw(){
  // un dibujado directo ya satisface al que estaba esperando el cuadro
  if(_fgRafId){cancelAnimationFrame(_fgRafId);_fgRafId=0;}
  if(_fgPrevGate)return;              // recién ingresó: todavía no se sabe qué flyer va
  if(!window.baseImg||!baseImg.width)return;
  _fgBenefSyncNombre(); // la empresa puede cambiar sin evento input (padrón, historial)
  var v=getVals();
  _fgExtra=_fgExtraBaseFor(v); // el canvas tiene que contemplar el crecimiento
  var w=Math.round(baseImg.width*SC),fh=Math.round((baseImg.height+_fgExtra)*SC);
  if(!_fgFullCv){_fgFullCv=document.createElement('canvas');_fgFullCtx=_fgFullCv.getContext('2d');}
  var full=_fgFullCv;
  if(full.width!==w||full.height!==fh){full.width=w;full.height=fh;}else _fgFullCtx.clearRect(0,0,w,fh);
  fgDrawAll(_fgFullCtx,SC,v); // setea _fgContentBottomBase
  var h=Math.min(fh,Math.round(_fgFinalHeightBase()*SC));
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
  var cc=cv.getContext('2d');window.ctx=cc;
  cc.clearRect(0,0,w,h);cc.drawImage(full,0,0);
  if(_fgLg.on)_fgLgMarcas(); // los bordes punteados siguen al zoom
}
// Descarga / preview modal / historial: canvas full-res ya recortado.
// El canvas grande de trabajo (el flyer entero sin recortar, ~35 MB de memoria)
// se reutiliza entre llamadas, como el de la vista previa: el masivo y "Generar
// flyers" creaban y tiraban uno por flyer. save/restore deja el contexto en su
// estado inicial en cada vuelta, igual que si fuera nuevo. El que se DEVUELVE
// (recortado) sigue siendo nuevo cada vez: quien lo recibe puede guardarlo.
var _fgResCv=null;
function fgFullRes(v){
  // _fgExtra y _fgContentBottomBase son de la PANTALLA (Cambiar logos los usa
  // para ubicar los toques): un flyer con otra cantidad de oficiales (historial,
  // padrón, masivo) los cambiaba hasta el próximo redibujado. Se devuelven al salir.
  var exAntes=_fgExtra,fondoAntes=window._fgContentBottomBase;
  _fgExtra=_fgExtraBaseFor(v);
  var W=baseImg.width,H=Math.round(baseImg.height+_fgExtra);
  if(!_fgResCv)_fgResCv=document.createElement('canvas');
  var full=_fgResCv,fctx=full.getContext('2d');
  if(full.width!==W||full.height!==H){full.width=W;full.height=H;}else fctx.clearRect(0,0,W,H);
  fctx.save();
  try{fgDrawAll(fctx,1.0,v);}finally{fctx.restore();} // setea _fgContentBottomBase
  var h=Math.min(full.height,Math.round(_fgFinalHeightBase()));
  _fgExtra=exAntes;window._fgContentBottomBase=fondoAntes;
  var out=document.createElement('canvas');out.width=W;out.height=h;
  out.getContext('2d').drawImage(full,0,0);
  return out;
}
// ── ASESORES 3 y 4 ────────────────────────────────────────────────────────────
// Los campos se INYECTAN desde acá (no en _source.html, que lo regenera el usuario),
// replicando la estructura del bloque de Asesor 2.
var _fgA3=false,_fgA4=false;
// Modo "oficiales por sede": prendido sube el tope de 4 a 8. Arranca SIEMPRE apagado
// (se vuelve a prender solo al cargar un flyer del historial o retomar el borrador).
var _fgSedes=false,_fgAOn={5:false,6:false,7:false,8:false};
function _fgMaxAsesores(){return _fgSedes?8:4;}
function toggleA3(){_fgA3=!_fgA3;_fgToggleUI(3,_fgA3);if(typeof redraw==='function')redraw();}
function toggleA4(){_fgA4=!_fgA4;_fgToggleUI(4,_fgA4);if(typeof redraw==='function')redraw();}
// toggleA5..toggleA8: mismo contrato que las de arriba (las llama el onclick inline
// de la barrita), pero con el estado en _fgAOn en vez de una variable por asesor.
[5,6,7,8].forEach(function(n){
  window['toggleA'+n]=function(){_fgAOn[n]=!_fgAOn[n];_fgToggleUI(n,_fgAOn[n]);if(typeof redraw==='function')redraw();};
});
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
// ── MODO "OFICIALES POR SEDE": formulario ────────────────────────────────────
// Se prende con una barrita en el menú "Otros" (facultad oficiales_sede). Prendido:
// sube el tope de 4 a 8 oficiales, suma un campo de ubicación a cada uno y un
// título editable arriba del bloque. Apagado, el formulario queda igual que siempre.
//
// Los asesores 5-8 tienen lo mismo que los otros para cargar de a uno: "⚡ Pegar",
// el popover de asesores guardados y el autocompletado de mail desde el nombre.
// Lo que NO los alcanza es la carga MASIVA —el padrón y el Excel del masivo siguen
// tocando sólo del 1 al 4—: esos flyers son casos sueltos, no una tanda.
function _fgEnsureAsesores58(){
  if(document.getElementById('fields5'))return;
  var f4=document.getElementById('fields4');if(!f4||!f4.parentNode)return;
  var html='';
  [5,6,7,8].forEach(function(n){
    // La tripleta .sec -> .toggle-row -> .collapsible es obligatoria: _fgBlock
    // navega hermanos y se rompe si falta alguna.
    html+='<div class="sec">Asesor '+n+' (opcional)</div>'+
      '<div class="toggle-row" onclick="toggleA'+n+'()"><span>Agregar asesor '+n+'</span><div class="sw" id="sw'+n+'"></div></div>'+
      '<div class="collapsible" id="fields'+n+'">'+
        '<div class="field"><label>Nombre</label><input type="text" id="nombre'+n+'" placeholder="Nombre Asesor '+n+'"></div>'+
        '<div class="field"><label>Celular</label><input type="text" id="celular'+n+'" placeholder="11 XXXX XXXX"></div>'+
        '<div class="field"><label>Email</label><input type="text" id="email'+n+'" placeholder="mail@bancogalicia.com.ar"></div>'+
      '</div>';
  });
  f4.insertAdjacentHTML('afterend',html); // quedan dentro de la tarjeta "Oficiales", antes del botón "+ Agregar"
  // Nacen ocultos y apagados: el alta es siempre explícita ("+ Agregar asesor"),
  // igual que los slots 2-4. Si quedaran a la vista pero con el switch apagado,
  // se podrían cargar datos que después no salen en el flyer.
  [5,6,7,8].forEach(function(n){_fgShowBlock(n,false);});
  [5,6,7,8].forEach(function(n){
    ['nombre','celular','email'].forEach(function(k){
      var e=document.getElementById(k+n);
      if(e)e.addEventListener('input',function(){if(typeof redraw==='function')redraw();});
    });
  });
  _fgAutoMail(); // engancha nombre -> mail también en los slots nuevos
  if(typeof _fgValWire==='function')_fgValInputs().forEach(_fgValWire); // y la validación de cel/mail
  if(_can('asesores_guardados'))_initAsesoresUI(); // popover de asesores guardados en 5-8
  if(_can('pegar_oficial'))_fgEnsurePasteBtns();   // y el botón "⚡ Pegar"
}
// Campo "Ubicación" al final de cada #fields{n} (1 a 8) + el título arriba de todo.
// Se inyectan una sola vez y después sólo se muestran/ocultan con display.
function _fgEnsureSedesFields(){
  for(var n=1;n<=8;n++){
    if(document.getElementById('ubic'+n))continue;
    var f=document.getElementById('fields'+n);if(!f)continue;
    f.insertAdjacentHTML('beforeend',
      '<div class="field fg-sede-f" id="fg-sede-f-'+n+'"><label>Ubicación</label>'+
      '<input type="text" id="ubic'+n+'" placeholder="'+_FG_UBIC_PIN+' BUENOS AIRES" autocomplete="off"></div>');
    var e=document.getElementById('ubic'+n);
    // El campo arranca con el pin puesto, listo para completar al lado. Se puede
    // borrar: el flyer dibuja literalmente lo que quede acá.
    if(e){e.value=_FG_UBIC_PIN+' ';
      e.addEventListener('input',function(){if(typeof redraw==='function')redraw();});}
  }
  if(!document.getElementById('fg-sedes-tit')){
    var b1=_fgBlock(1);
    if(b1&&b1.sec&&b1.sec.parentNode){
      b1.sec.insertAdjacentHTML('beforebegin',
        '<div id="fg-sedes-tit" style="display:none"><div class="field">'+
        '<label>Título arriba de los oficiales</label>'+
        '<input type="text" id="sedes-titulo" placeholder="Ahora tenés un referente por sede según tu zona" autocomplete="off">'+
        '</div></div>');
      var t=document.getElementById('sedes-titulo');
      if(t)t.addEventListener('input',function(){if(typeof redraw==='function')redraw();});
    }
  }
}
// La barrita en el menú "Otros". Reusa la pastilla .sw del resto de la app.
function _fgEnsureSedesSwitch(){
  if(document.getElementById('fg-sedes-item'))return;
  var m=document.getElementById('fg-otros-menu');if(!m)return;
  m.insertAdjacentHTML('beforeend',
    '<button type="button" class="fg-otros-item fg-otros-sw" id="fg-sedes-item" onclick="fgToggleSedes()" aria-pressed="false">'+
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'+
      '<span class="fg-sedes-lbl">Oficiales por sede (hasta 8)</span>'+
      '<span class="sw" id="fg-sedes-sw"></span>'+
    '</button>');
}
// Muestra/oculta el ítem según la facultad. Si se la sacan con el modo prendido, lo apaga.
function _fgSedesFac(on){
  var it=document.getElementById('fg-sedes-item');
  if(it)it.style.display=on?'':'none';
  if(!on&&_fgSedes)_fgSedesSet(false);
}
function _fgSedesApplyUI(on){
  var sw=document.getElementById('fg-sedes-sw');if(sw)sw.classList.toggle('on',on);
  var it=document.getElementById('fg-sedes-item');if(it)it.setAttribute('aria-pressed',on?'true':'false');
  var t=document.getElementById('fg-sedes-tit');if(t)t.style.display=on?'':'none';
  for(var n=1;n<=8;n++){
    var f=document.getElementById('fg-sede-f-'+n);
    if(f)f.style.display=on?'':'none';
  }
}
// ¿Hay algo cargado que se pierda al apagar el modo? (oficiales 5-8, ubicaciones o título)
function _fgSedesTieneDatos(){
  if((_gv('sedes-titulo')||'').trim())return true;
  for(var n=1;n<=8;n++){
    if(_fgUbicTexto(_gv('ubic'+n)))return true; // el pin solo no cuenta como dato
    if(n>=5&&(_gv('nombre'+n)||'').trim())return true;
  }
  return false;
}
// Prende/apaga el modo sin preguntar nada (lo usan el historial, el borrador y Restaurar).
function _fgSedesSet(on){
  on=!!on;
  if(on){_fgEnsureAsesores58();_fgEnsureSedesFields();}
  else{
    for(var n=5;n<=8;n++){
      if(_fgAsesorOn(n))_fgSetAsesorOn(n,false);
      ['nombre','celular','email'].forEach(function(k){var e=document.getElementById(k+n);if(e)e.value='';});
      _fgShowBlock(n,false);
    }
    for(var u=1;u<=8;u++){var e2=document.getElementById('ubic'+u);if(e2)e2.value=_FG_UBIC_PIN+' ';}
    var t=document.getElementById('sedes-titulo');if(t)t.value='';
  }
  _fgSedes=on;
  _fgSedesApplyUI(on);
  _fgRefreshAddBtn();
  if(typeof redraw==='function')redraw();
}
function fgToggleSedes(){
  if(_fgSedes&&_fgSedesTieneDatos()){
    fgConfirm('¿Apagar "Oficiales por sede"?\n\nSe borran las ubicaciones, el título y los oficiales 5 al 8. El flyer vuelve a los 4 de siempre.',
      {ok:'Apagar igual'},function(si){
        if(!si)return;
        _fgSedesSet(false);
        if(typeof showToast==='function')showToast('Oficiales por sede: apagado');
      });
    return;
  }
  var nuevo=!_fgSedes;
  _fgSedesSet(nuevo);
  if(typeof showToast==='function')showToast(nuevo?'Oficiales por sede: ya podés cargar hasta 8 con su ubicación':'Oficiales por sede: apagado');
  if(nuevo){
    fgToggleOtros(false); // cierro el menú: lo que sigue pasa en el formulario
    var t2=document.getElementById('sedes-titulo');if(t2)t2.focus();
  }
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
  [1,2,3,4,5,6,7,8].forEach(function(i){ // 5-8 sólo existen con el modo sedes
    var sfx=_fgSfx(i);
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
  if(n===3)return _fgA3;
  if(n===4)return _fgA4;
  return !!_fgAOn[n];
}
function _fgSetAsesorOn(n,on){
  if(_fgAsesorOn(n)===!!on)return;
  if(n===1&&typeof toggleA1==='function')toggleA1();
  else if(n===2&&typeof toggleA2==='function')toggleA2();
  else if(n===3)toggleA3();
  else if(n===4)toggleA4();
  else if(typeof window['toggleA'+n]==='function')window['toggleA'+n]();
}
// Muestra/oculta el bloque entero (título + fila del switch + campos).
// El Asesor 1 conserva su barrita (el switch a la vista) y NO se puede quitar:
// en su título va "✕ Borrar", que vacía los campos. En los bloques 2-4 la fila
// del switch queda oculta —el alta la maneja "+ Agregar asesor" y la baja
// "✕ Quitar"— y los dos botones se ven igual, en la esquina del título.
// Las dos acciones del título ("⚡ Pegar" y "✕ Borrar"/"✕ Quitar") viven juntas
// en esta cajita, al lado del nombre del asesor. Antes el Borrar flotaba solo
// contra el borde derecho, lejos del Pegar. El orden visual lo fija el CSS
// (order), así no depende de quién se inyecte primero: el Pegar sale del login
// (sólo con la facultad) y el Borrar del armado del formulario.
function _fgSecActs(n){
  var box=document.getElementById('fg-sec-acts-'+n);
  if(box)return box;
  var b=_fgBlock(n);if(!b)return null;
  b.sec.insertAdjacentHTML('beforeend',
    ' <span class="fg-sec-acts" id="fg-sec-acts-'+n+'" onclick="event.stopPropagation()"></span>');
  return document.getElementById('fg-sec-acts-'+n);
}
function _fgShowBlock(n,show){
  var b=_fgBlock(n);if(!b)return;
  b.sec.style.display=show?'':'none';
  b.fields.style.display=show?'':'none';
  if(n>1)b.row.style.display='none';
  if(show&&!b.sec.dataset.fgDel){
    var box=_fgSecActs(n);
    if(box){
      b.sec.dataset.fgDel='1';
      box.insertAdjacentHTML('beforeend', n===1
        ? '<span class="fg-del" role="button" tabindex="0" onclick="event.stopPropagation();_fgClearAsesor(1,1)" title="Borrar los datos del asesor 1">&#10005; Borrar</span>'
        : '<span class="fg-del" role="button" tabindex="0" onclick="event.stopPropagation();_fgRemoveAsesor('+n+')" title="Quitar asesor '+n+'">&#10005; Quitar</span>');
    }
  }
}
function _fgIsBlockVisible(n){
  var b=_fgBlock(n);return !!(b&&b.sec.style.display!=='none');
}
function _fgAddNextAsesor(){
  for(var n=2;n<=_fgMaxAsesores();n++){
    if(_fgIsBlockVisible(n))continue;
    _fgShowBlock(n,true);_fgSetAsesorOn(n,true);_fgRefreshAddBtn();
    var el=document.getElementById('nombre'+n);if(el)el.focus();
    return;
  }
}
// Vacía nombre, celular y mail de un asesor. Es lo que hace "✕ Borrar" en el
// Asesor 1 y lo primero que hace "✕ Quitar" en los otros tres: sacar un asesor
// deja el slot limpio, no con los datos escondidos esperando para reaparecer.
// Al limpiar el mail se saca la marca de "escrito a mano" para que el
// autocompletado (nombre.apellido@) vuelva a sugerir con el asesor siguiente.
function _fgClearAsesor(n,avisar){
  var sfx=_fgSfx(n),algo=false;
  ['nombre','celular','email'].forEach(function(k){
    var e=document.getElementById(k+sfx);if(!e)return;
    if(e.value)algo=true;
    e.value='';
  });
  var uEl=document.getElementById('ubic'+n); // la ubicación es parte del asesor: se va con él
  if(uEl){if(_fgUbicTexto(uEl.value))algo=true;uEl.value=_FG_UBIC_PIN+' ';} // queda el pin, listo para la próxima
  var mEl=document.getElementById('email'+sfx);if(mEl)mEl.dataset.fgManual='';
  if(typeof redraw==='function')redraw();
  if(algo&&avisar&&typeof showToast==='function')showToast('Datos del asesor '+n+' borrados');
  return algo;
}
// Quitar un asesor lo saca del flyer, esconde el bloque Y BORRA lo que tenía
// cargado (pedido del usuario: antes los datos quedaban guardados y volvían al
// re-agregarlo, lo que confundía cuando el slot se reusaba para otra persona).
function _fgRemoveAsesor(n){
  var tenia=_fgClearAsesor(n,0);
  _fgSetAsesorOn(n,false);_fgShowBlock(n,false);_fgRefreshAddBtn();
  if(typeof redraw==='function')redraw();
  if(tenia&&typeof showToast==='function')showToast('Asesor '+n+' quitado');
}
function _fgRefreshAddBtn(){
  var b=document.getElementById('fg-add-asesor');if(!b)return;
  var libre=false,max=_fgMaxAsesores();
  for(var n=2;n<=max;n++)if(!_fgIsBlockVisible(n))libre=true;
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
      // Las acciones del título, una al lado de la otra. El "order" deja siempre
      // el Pegar primero y el Borrar/Quitar después, sin importar el orden en
      // que se inyecten (el Pegar llega recién al loguear, según la facultad).
      '.fg-sec-acts{display:inline-flex;align-items:center;gap:6px;margin-left:8px;vertical-align:middle}'+
      '.fg-sec-acts .fg-paste-btn{order:1;margin-left:0}'+
      '.fg-sec-acts .fg-del{order:2}'+
      '.fg-del{display:inline-flex;align-items:center;font-size:.75rem;font-weight:700;'+
      'text-transform:none;letter-spacing:0;color:var(--gray,#999);background:rgba(128,128,128,.12);'+
      'border:1px solid transparent;border-radius:999px;padding:2px 8px;cursor:pointer;'+
      'transition:.15s;vertical-align:middle}'+
      '.fg-del:hover{color:var(--danger,#B3261E);background:rgba(179,38,30,.1)}';
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
    st.textContent='#fg-benef-fields .fg-benef-hint{font-size:.75rem;color:var(--gray,#777);line-height:1.4;margin:-4px 0 8px}'+
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
  if(!h){h=document.createElement('div');h.id='fg-masivo-hint';h.style.cssText='font-size:.75rem;color:var(--gray,#777);line-height:1.45;margin:6px 0 10px;padding:7px 10px;border-radius:8px;background:rgba(245,146,30,.08);border:1px solid rgba(245,146,30,.3)';
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
  _fgShowBlock(1,true); // el bloque 1 está siempre a la vista: se vacía con "Borrar", no se quita
  for(var n=2;n<=8;n++){
    if(!document.getElementById('fields'+n))continue; // 5-8 sólo existen con el modo sedes
    var el=document.getElementById('nombre'+n);
    var tiene=(n<=_fgMaxAsesores())&&(!!(el&&el.value.trim())||_fgAsesorOn(n));
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
    if(!n||n<1||n>8)return;
    var sp=r.querySelector('span');
    if(sp)sp.textContent='Agregar asesor '+n;
  });
}
// ── INTERRUPTOR DE OFICIALES (en el título de la tarjeta) ─────────────────────
// Pedido del dueño (16-oct-2026): la barrita del Asesor 1 pasó a ser un
// interruptor de TODOS los oficiales, a la derecha del título "Oficiales".
// Apagado: el flyer sale sin oficiales y la tarjeta esconde los asesores SIN
// borrar nada (la clase fg-of-off los oculta por CSS: al prenderlo vuelven tal
// cual estaban). La barrita vieja del Asesor 1 queda escondida pero en el DOM:
// _fgBlock depende de la tripleta .sec → .toggle-row → campos, y de ahí cuelgan
// "Pegar" y "Borrar". El masivo, el padrón y el Hunter no lo usan (arman sus
// propios datos).
var _fgOficialesOn=true;
function _fgOfCard(){var f=document.getElementById('fields1');return (f&&f.closest)?f.closest('.fg-card'):null;}
function _fgOfInit(){
  var card=_fgOfCard();if(!card||document.getElementById('fg-of-sw'))return;
  var h=card.querySelector('.fg-card-h');if(!h)return;
  h.insertAdjacentHTML('beforeend','<button type="button" class="fg-of-sw" id="fg-of-sw" role="switch" aria-checked="true" '+
    'onclick="fgToggleOficiales()" title="Mostrar u ocultar los oficiales en el flyer">Mostrar en el flyer<span class="sw on"></span></button>');
  card.insertAdjacentHTML('beforeend','<p class="fg-of-off-msg">El flyer sale sin oficiales. Tus datos quedan guardados: prendelo y vuelven.</p>');
  var b1=_fgBlock(1);if(b1)b1.row.classList.add('fg-of-row1'); // la barrita vieja del Asesor 1 (la esconde el CSS)
  if(typeof a1!=='undefined'&&!a1&&typeof toggleA1==='function')toggleA1(); // sin su barrita, el Asesor 1 va siempre prendido
  _fgOfAplicar();
}
function _fgOfAplicar(){
  var card=_fgOfCard(),b=document.getElementById('fg-of-sw');
  if(card)card.classList.toggle('fg-of-off',!_fgOficialesOn);
  if(b){b.setAttribute('aria-checked',_fgOficialesOn?'true':'false');var sw=b.querySelector('.sw');if(sw)sw.classList.toggle('on',_fgOficialesOn);}
}
function fgSetOficiales(on){_fgOficialesOn=!!on;_fgOfAplicar();if(typeof redraw==='function')redraw();}
function fgToggleOficiales(){fgSetOficiales(!_fgOficialesOn);}
// getVals ampliado a 4 asesores —8 con el modo sedes— (pisa el de _source.html,
// que sólo conoce 2). Los nombres de clave NO cambian (nombre, nombre2, ...): el
// historial, el borrador, el Excel y los logs viejos dependen de ellos.
function fgGetVals(){
  function g(id){var e=document.getElementById(id);return e?e.value:'';}
  function cel(id){var t=g(id).trim();return t?'Cel: '+t:'';}
  var c=CONFIGS[ac]||CONFIGS[0];
  var o={
    empresa:g('empresa'),
    nocb:_fgNoCB,
    config:_fgNoCB?'Sin cashback':((typeof CNAMES!=='undefined'&&CNAMES[ac])?CNAMES[ac]:''),
    m1:c.m1,m2:c.m2,m3:c.m3,m4:c.m4,
    legal:g('legal-text'),
    // Modo "oficiales por sede": va en v (no en estado global) para que el historial,
    // el borrador y el masivo rindan igual que la pantalla. Ver _fgAsesores.
    sedes:_fgSedes,
    sedesTit:_fgSedes?g('sedes-titulo').trim():'',
    // Flyer Rubros: el cartel "¡Beneficio exclusivo NOMBRE!" + tope. benef va en
    // v (no en estado global) para que historial, masivo y calibrador rindan igual.
    benef:!!_solCfg(_fgVista).benef,
    // Flyer Sueldo: un solo importe de cashback en naranja en vez de las 4 cajas.
    cashUnico:!!_solCfg(_fgVista).cashUnico,
    benefNombre:g('benef-nombre').trim(), // vacío a propósito = "¡Beneficio exclusivo!" sin empresa
    importe:_fgFmtImporte(g('benef-importe')),
    importe2:_fgFmtImporte(g('benef-importe2'))||_fgFmtImporte(g('benef-importe'))
  };
  // Los 8 slots: del 5 al 8 sólo cuentan con el modo sedes prendido.
  for(var n=1;n<=8;n++){
    var s=_fgSfx(n);
    o['has'+n]=_fgOficialesOn&&(n<=_fgMaxAsesores())&&_fgAsesorOn(n)&&g('nombre'+s).trim()!=='';
    o['nombre'+s]=g('nombre'+s);o['celular'+s]=cel('celular'+s);o['email'+s]=g('email'+s);
    o['ubic'+n]=_fgSedes?_fgUbicTexto(g('ubic'+n)):''; // el pin solo = sin ubicación
  }
  // Interruptor de Oficiales apagado: el historial y el borrador lo recuerdan
  // (los nombres viajan igual, para que al prenderlo vuelvan).
  if(!_fgOficialesOn)o.sinOficiales=true;
  _fgLgVals(o); // logos cambiados en la vista previa (sólo para este flyer)
  return o;
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
// Historial vacío: dice qué pasó y qué hacer (el botón vuelve a Individual).
function _histVacioHtml(){
  return '<div class="history-empty"><span class="he-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>'
    +'<strong>Todavía no hay flyers en tu historial</strong>'
    +'<span>Armá uno en Individual y queda guardado acá.</span>'
    +'<button class="btn bp" onclick="switchTab(\'individual\')">Ir a Individual</button></div>';
}
function fgRenderHistory(){
  var el=document.getElementById('history-list');if(!el)return;
  if(!flyerHistory.length){el.innerHTML=_histVacioHtml();return;}
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
function _fgWithOpt(o,fn2,_vuelta){
  o=_optN(o);
  // Si mientras cargaba se eligió otra opción, la carga termina pero esa opción
  // no queda aplicada: se vuelve a pedir antes de seguir (si no, el Masivo o
  // "volver a descargar" salían con la imagen y el legal de la otra).
  var listo=function(){
    if(_optN(_fgOpt)!==o&&_can('opcion_'+o)&&(_vuelta||0)<3){_fgWithOpt(o,fn2,(_vuelta||0)+1);return;}
    fn2();
  };
  if(_can('opcion_'+o)&&o!==_optN(_fgOpt)){showToast('Cambiando a '+_optLabel(o)+'...');switchFlyerOption(o,listo);}
  else if(_fgOptLoading[o])_fgOptLoading[o].push(listo); // ya es la activa pero todavía carga: espero a que aplique
  else fn2();
}
function fgRedlPDF(i){
  var h=flyerHistory[i];if(!h)return;
  // sin aviso de rubro: es un flyer ya hecho; con su recorte, si tenía
  _fgWithOpt(h.opt||1,function(){var fc=_fgConRecortes(h.v,function(){return fullRes(h.v);});savePDF(fc,h.v,true);});
}
function fgLoadHistory(i){
  var h=flyerHistory[i];if(!h)return;
  _fgApplyHistItem(h);
  _fgWithOpt(h.opt||1,function(){_fgHistDiseno(h.v);}); // recortes y logos: en un borrador
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
    // El modo sedes va ANTES de los asesores: prenderlo crea los slots 5-8 y los
    // campos de ubicación, que el loop de abajo necesita para escribir.
    _fgSedesSet(!!h.v.sedes);
    if(h.v.sedes)s('sedes-titulo',h.v.sedesTit||'');
    // Los asesores se aplican SIEMPRE, los tuviera o no el flyer guardado.
    // Antes sólo se tocaban los que el ítem tenía, así que cargar un flyer de 1
    // asesor después de uno de 3 dejaba pegados los otros dos del anterior.
    var max=h.v.sedes?8:4,sinOf=!!h.v.sinOficiales;
    for(var k=1;k<=8;k++){
      var sfx=_fgSfx(k);
      // Guardado con los oficiales apagados: los hasN vienen en false, pero los
      // nombres están; se cargan igual y el interruptor queda apagado (abajo).
      var hay=sinOf?!!(h.v['nombre'+sfx]||'').trim():
        (k===1&&h.v.has1===undefined)?!!(h.v.nombre||'').trim():!!h.v['has'+k];
      if(k>max)hay=false; // un flyer sin modo sedes nunca reabre los slots 5-8
      if(!document.getElementById('nombre'+sfx))continue;
      s('nombre'+sfx,hay?(h.v['nombre'+sfx]||''):'');
      s('celular'+sfx,hay?((h.v['celular'+sfx]||'').replace('Cel: ','')):'');
      s('email'+sfx,hay?(h.v['email'+sfx]||''):'');
      s('ubic'+k,(hay&&h.v['ubic'+k])?h.v['ubic'+k]:(h.v.sedes?_FG_UBIC_PIN+' ':''));
      if(k===1)_fgSetAsesorOn(1,true);   // el bloque 1 queda siempre abierto
      else _fgSetAsesorOn(k,hay);
    }
    _fgSyncAsesorBlocks(); // muestra los bloques que el flyer del historial tenía
    fgSetOficiales(!sinOf);
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
  _fgProtoGuardarActual(); // si estaba en un borrador o diseño, conserva lo suyo en su pestaña
  _fgLgLimpiar(); // Restaurar también vuelve los logos al original
  if(_fgRec){_fgRecOlvidar();_fgMontosVisibles();if(typeof calcSC==='function')calcSC();} // y la parte recortada
  var s=function(id,val){var e=document.getElementById(id);if(e)e.value=val;};
  ['empresa','nombre','celular','email','nombre2','celular2','email2',
   'nombre3','celular3','email3','nombre4','celular4','email4'].forEach(function(id){s(id,'');});
  _fgSedesSet(false); // apaga el modo sedes y limpia ubicaciones, título y oficiales 5-8
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
  fgSetOficiales(true);  // y con los oficiales prendidos
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
  window.redraw=fgRedrawCoalesced;window.redrawNow=fgRedraw; // un dibujado por frame
  window.fullRes=fgFullRes; // recorte responsive del blanco inferior
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
  if(cfg&&typeof cfg==='object'){_fgRecOlvidar();window.FLYER_CFG=cfg;}
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
  _bucketJson('_flyer_cfgs.json').catch(function(){return {};})
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
var _CAL_ZONA={
  empresa: {id:'empresa', label:'Empresa', color:'#8e44ad'},
  montos:  {id:'montos',  label:'Montos (todo)',  color:'#1d4070'},
  cashback:{id:'cashback',label:'Cashback',color:'#f5921e'}, // Flyer Sueldo: el importe único
  asesores:{id:'asesores',label:'Asesores',color:'#c0392b'},
  legal:   {id:'legal',   label:'Legales', color:'#0e8a5f'}
};
// Rótulo y color del chip de cada caja de montos (van en el orden del flyer).
var _MB_LABELS=['Eminent Black','Eminent Platinum','Plus Gold','Plus'];
var _MB_ZONE_COLORS=['#2f6fb0','#7b5ea7','#f5921e','#b26a00'];
// Las cajas de montos como zonas sueltas, para moverlas de a una (el flyer MIXTO
// las lleva en grilla 2x2). Sólo si la solapa dibuja montos: en Flyer Sueldo
// _cal.cfg igual trae montos.boxes (es un clon del default entero) y quedarían
// cuatro zonas invisibles pero clickeables pisando la de Cashback.
function _calMBoxes(){
  if(!_cal||_solCfg(_calSol()).zonas.indexOf('montos')<0)return [];
  return ((_cal.cfg&&_cal.cfg.montos&&_cal.cfg.montos.boxes)||[]).slice(0,4);
}
// Zonas de la solapa del flyer que se está calibrando (ver _SOLAPAS[].zonas): en
// Flyer Sueldo aparece "Cashback" y no "Montos", así no se mueve lo que no se
// dibuja. Detrás de "Montos (todo)" van las cuatro cajas sueltas.
function _calZonesBase(){
  var out=[];
  _solCfg(_calSol()).zonas.forEach(function(z){
    var d=_CAL_ZONA[z];if(!d)return;
    out.push(d);
    if(z==='montos')_calMBoxes().forEach(function(_b,i){
      out.push({id:'mb'+i,label:_MB_LABELS[i]||('Monto '+(i+1)),color:_MB_ZONE_COLORS[i%_MB_ZONE_COLORS.length]});
    });
  });
  return out;
}
// Zonas extra del cartel "Beneficio exclusivo": sólo para opciones de Flyer Rubros.
// Flyer Rubros: una zona por línea del cartel (bl0, bl1, ...) más "Cartel" (blAll)
// que mueve todas juntas. Las líneas viven en _cal.cfg.benef.lineas.
var _BENEF_ZONE_COLORS=['#f5921e','#b26a00','#7b4a12','#c0392b','#8e44ad','#2c3e50','#16a085','#d35400'];
function _calSol(){return _cal?_optSolapa(_cal.opt):'flyer';}
function _calEsRubros(){return !!(_cal&&_solCfg(_calSol()).benef);}
// Plantilla que corresponde a la opción por su nombre ("Combustible" →
// combustible); si ninguna calza, la primera.
function _calBenefPlantillaPorOpcion(){
  return _fgBenefPlantillaPorNombre(_cal?_optLabel(_cal.opt):'');
}
// ¿La plantilla que está elegida trae las posiciones ya medidas? Entonces no se
// recentra sola (ni al abrir ni al cargarla).
function _calBenefPlantillaFija(){
  var sel=document.getElementById('cal-benef-plantilla');
  var k=(sel&&sel.value)||_calBenefPlantillaPorOpcion();
  return !!(_BENEF_PLANTILLAS[k]&&_BENEF_PLANTILLAS[k].fijo);
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
  if(!_calEsRubros())return _calZonesBase();
  var ls=_calBenefLineas();
  var z=[{id:'blAll',label:'Cartel (todo)',color:'#e30613'}];
  ls.forEach(function(l,i){var t=String(l.t||'').replace(/\*\*/g,'').replace('{nombre}','NOMBRE').replace('{importe2}','$').replace('{importe}','$');z.push({id:'bl'+i,label:(t.length>18?t.slice(0,17)+'…':t)||('Línea '+(i+1)),color:_BENEF_ZONE_COLORS[i%_BENEF_ZONE_COLORS.length]});});
  return z.concat(_calZonesBase());
}
var _CAL_SAMPLE_LEGAL="Ejemplo de términos y condiciones del flyer. **Bonificación de comisiones** por 6 meses para nuevos clientes. Promociones sujetas a disponibilidad y a las bases y condiciones vigentes.\nPARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN: www.bancogalicia.com.ar";
function _calSampleVals(){
  var rub=_calEsRubros();
  return {empresa:'EMPRESA EJEMPLO S.A.',
    m1:'$100.000',m2:'$80.000',m3:'$50.000',m4:'$30.000',
    has1:true,nombre:'Nombre Apellido',celular:'11 1234 5678',email:'nombre.apellido@bancogalicia.com.ar',
    has2:true,nombre2:'Segundo Asesor',celular2:'11 8765 4321',email2:'segundo.asesor@bancogalicia.com.ar',
    legal:(_cal&&_cal.legalText)||_CAL_SAMPLE_LEGAL,
    benef:rub,benefNombre:rub?'EMPRESA EJEMPLO':'',importe:rub?'$24.000':'',importe2:rub?'$30.000':'',
    cashUnico:!!_solCfg(_calSol()).cashUnico};
}
function _calEnsureDom(){
  if(document.getElementById('cal-modal'))return;
  var st=document.createElement('style');st.id='cal-style';
  st.textContent=
    '#cal-modal{position:fixed;inset:0;z-index:100000;background:rgba(20,18,16,.72);display:none;padding:16px}'+
    '#cal-modal.show{display:flex;align-items:stretch;justify-content:center}'+
    '.cal-card{position:relative;background:#fff;color:#1a1a1a;width:100%;max-width:720px;margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}'+
    // Tamaño a mano (grip de la esquina / «Ampliar»): _calSizeSet pone width/height en línea
    '.cal-card.sized{max-width:none}'+
    // Imagen arriba, controles abajo con su propia barra: los controles ya no le
    // comen el alto a la imagen. Con la barrita (.cal-split) arrastrada, la imagen
    // queda con alto fijo y los controles toman el resto.
    '.cal-ctl{flex:0 1 auto;overflow:auto;min-height:60px}'+
    '.cal-card.split .cal-body{flex:0 0 auto}.cal-card.split .cal-ctl{flex:1 1 0}'+
    '.cal-split{flex:0 0 auto;height:9px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;border-top:1px solid rgba(128,128,128,.25);background:rgba(128,128,128,.08);touch-action:none}'+
    '.cal-split:hover{background:rgba(245,146,30,.18)}'+
    '.cal-split::before{content:"";width:46px;height:3px;border-radius:2px;background:rgba(128,128,128,.55)}'+
    '.cal-grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;z-index:2;'+
      'background:linear-gradient(135deg,transparent 50%,rgba(128,128,128,.55) 50%,rgba(128,128,128,.55) 58%,transparent 58%,transparent 70%,rgba(128,128,128,.55) 70%,rgba(128,128,128,.55) 78%,transparent 78%)}'+
    '@media (max-width:900px){.cal-split,.cal-grip,#cal-ampliar{display:none}}'+
    'html.dark .cal-card{background:#22242a;color:#e9e9ea}'+
    '.cal-hd{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid rgba(128,128,128,.25)}'+
    '.cal-hd h3{margin:0;font-size:1rem;flex:1}'+
    '.cal-legend{display:flex;flex-wrap:wrap;gap:7px;padding:9px 16px;border-bottom:1px solid rgba(128,128,128,.18)}'+
    '.cal-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;cursor:pointer;border:1.5px solid transparent;font-size:.75rem;user-select:none}'+
    '.cal-chip .dot{width:11px;height:11px;border-radius:3px;display:inline-block}'+
    '.cal-chip.on{border-color:currentColor;font-weight:700}'+
    '.cal-body{flex:1 1 0;min-height:150px;overflow:auto;background:#e9e9e6;padding:16px}'+
    'html.dark .cal-body{background:#15161a}'+
    '.cal-body canvas{display:block;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);touch-action:none;cursor:grab}'+
    '.cal-zoom{display:inline-flex;gap:4px;align-items:center}.cal-zoom button{padding:2px 8px;font-size:.75rem;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;cursor:pointer}.cal-zoom button:hover{border-color:var(--orange,#f5921e)}'+
    '.cal-ft{padding:11px 16px;border-top:1px solid rgba(128,128,128,.25);display:flex;gap:10px;align-items:center;font-size:.75rem;color:var(--gray,#777)}'+
    '.cal-ft .sp{flex:1}'+
    // Propiedades de la zona elegida (tamaño, peso, color)
    '#cal-prop-row{display:none;padding:9px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.75rem}'+
    '#cal-prop-row.show{display:block}'+
    '.cal-props{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}'+
    '.cal-props>b{font-size:.75rem;align-self:center}'+
    '.cal-props .sp{flex:1}'+
    '.cal-props label{display:flex;flex-direction:column;gap:3px;font-size:.6875rem;text-transform:uppercase;letter-spacing:.4px;color:var(--gray,#777)}'+
    '.cal-props input,.cal-props select{padding:3px 5px;font-size:.75rem;border:1px solid rgba(128,128,128,.4);border-radius:5px;background:transparent;color:inherit;font-family:inherit;text-transform:none;letter-spacing:0}'+
    '.cal-props input[type=number]{width:74px}'+
    '.cal-props input[type=color]{padding:1px 2px;height:24px;width:40px;cursor:pointer}'+
    'html.dark .cal-props select{background:#22242a}'+
    '.cal-cols{display:flex;gap:4px}'+
    // Textos fijos del cartel del beneficio (sólo Flyer Rubros)
    '#cal-benef-row{display:none;padding:9px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.75rem}'+
    '#cal-benef-row.show{display:block}'+
    '.cal-bl{display:grid;grid-template-columns:18px 1fr 58px 62px 36px 62px 22px;gap:5px;align-items:center;margin-bottom:4px}'+
    '.cal-bl .dot{width:11px;height:11px;border-radius:3px;display:inline-block;cursor:pointer}'+
    '.cal-bl input,.cal-bl select{padding:3px 5px;font-size:.75rem;border:1px solid rgba(128,128,128,.4);border-radius:5px;background:transparent;color:inherit;min-width:0;font-family:inherit}'+
    'html.dark .cal-bl select{background:#22242a}'+
    '.cal-bl input[type=color]{padding:1px 2px;height:24px;cursor:pointer}'+
    '.cal-bl .x{cursor:pointer;color:var(--gray,#888);font-size:.8rem;text-align:center}.cal-bl .x:hover{color:var(--red,#e30613)}'+
    '.cal-bl-head{color:var(--gray,#777);font-size:.6875rem;text-transform:uppercase;letter-spacing:.4px}'+
    '.cal-bl-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px}'+
    '.cal-bl-top select,#cal-base{padding:3px 6px;font-size:.75rem;border:1px solid rgba(128,128,128,.4);border-radius:5px;background:transparent;color:inherit;font-family:inherit}'+
    'html.dark .cal-bl-top select,html.dark #cal-base{background:#22242a}';
  document.head.appendChild(st);
  var m=document.createElement('div');m.id='cal-modal';
  m.innerHTML=
    '<div class="cal-card">'+
      '<div class="cal-hd"><h3 id="cal-title">Calibrar flyer</h3>'+
        '<button class="btn-submit" onclick="_calSave()" style="padding:7px 14px">Guardar y activar</button>'+
        '<button class="ap-close" onclick="_calClose()">&#10005;</button></div>'+
      '<div class="cal-legend" id="cal-legend"></div>'+
      '<div class="cal-body"><canvas id="cal-cv"></canvas></div>'+
      '<div class="cal-split" id="cal-split" title="Arrastr&aacute; para agrandar la imagen (doble clic: volver al reparto normal)"></div>'+
      '<div class="cal-ctl">'+
      '<div style="padding:9px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.75rem;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
        '<label>Partir de esta base:</label>'+
        '<select id="cal-base">'+_CFG_BASES.map(function(b){return '<option value="'+b.id+'">'+_escHtml(b.nombre)+'</option>';}).join('')+'</select>'+
        '<button class="usr-btn edit" style="font-size:.75rem;padding:3px 9px" onclick="_calBaseAplicar()">Cargar base</button>'+
        '<span style="color:var(--gray)">Pone las zonas donde van en ese modelo de flyer; despu&eacute;s se retoca arrastrando. El cartel del beneficio se elige abajo, con su plantilla.</span>'+
      '</div>'+
      '<div style="padding:11px 16px;border-top:1px solid rgba(128,128,128,.25);font-size:.75rem;display:flex;gap:12px;align-items:center">'+
        '<label>Altura final (px):</label><input id="cal-height" type="number" placeholder="auto" style="width:90px;padding:4px 6px" onchange="_calHeightChanged()">'+
        '<button class="usr-btn edit" style="font-size:.75rem;padding:4px 9px" onclick="document.getElementById(\'cal-height\').value=\'\';_calHeightChanged()">Auto</button>'+
        '<span style="color:var(--gray)">vac&iacute;o = corta solo despu&eacute;s de los legales (l&iacute;nea naranja)</span>'+
      '</div>'+
      // Tamaño, peso y color de la zona elegida (la arma _calPropsSync).
      '<div id="cal-prop-row"></div>'+
      // Flyer Rubros: las líneas del cartel (texto, tamaño, peso, color, alineación). Plantillas por rubro.
      '<div id="cal-benef-row">'+
        '<div class="cal-bl-top"><b style="font-size:.75rem">Cartel del beneficio</b>'+
          '<span style="color:var(--gray)">Plantilla:</span><select id="cal-benef-plantilla">'+
            Object.keys(_BENEF_PLANTILLAS).map(function(k){return '<option value="'+k+'">'+_escHtml(_BENEF_PLANTILLAS[k].nombre)+'</option>';}).join('')+
          '</select><button class="usr-btn edit" style="font-size:.75rem;padding:3px 9px" onclick="_calBenefPlantilla()">Cargar plantilla</button>'+
          '<button class="usr-btn edit" style="font-size:.75rem;padding:3px 9px" onclick="_calBenefCentrar(false)" title="Detecta el cuadro en la imagen y centra el bloque de l&iacute;neas ah&iacute;">&#8982; Centrar en el cuadro</button>'+
          '<span class="sp" style="flex:1"></span>'+
          '<button class="usr-btn edit" style="font-size:.75rem;padding:3px 9px" onclick="_calBenefAgregar()">+ L&iacute;nea</button></div>'+
        '<div class="cal-bl cal-bl-head"><span></span><span>Texto ({nombre}, {importe}, {importe2}, **naranja**)</span><span>Letra px</span><span>Peso</span><span>Color</span><span>Alinear</span><span></span></div>'+
        '<div id="cal-benef-lineas"></div>'+
        '<div style="color:var(--gray);font-size:.75rem;margin-top:4px">El PDF va con el cuadro vac&iacute;o (s&oacute;lo el dibujo): la app escribe todas las l&iacute;neas con la misma letra. {nombre}, {importe} y {importe2} (segundo tope, cuadro &laquo;Ambos&raquo;) los carga cada asesor; **as&iacute;** sale en naranja y negrita. Al abrir y al cargar una plantilla el bloque se centra solo en el cuadro (&laquo;Centrar en el cuadro&raquo; lo vuelve a hacer). Para retocar: arrastr&aacute; &laquo;Cartel (todo)&raquo; para mover el bloque entero, o cada l&iacute;nea por separado.</div>'+
      '</div>'+
      '<div class="cal-ft"><span>Eleg&iacute; una zona arriba (se ve s&oacute;lo esa; tocala de nuevo para ver todas) y arrastrala en la imagen: ah&iacute; mismo te aparecen su <b>tama&ntilde;o, peso y color</b>. Los cuatro montos se mueven juntos con &laquo;Montos (todo)&raquo; o de a uno eligiendo cada importe. Flechas del teclado = ajuste fino (Shift = 10px). <b>Ctrl + rueda</b> = zoom.</span><span class="sp"></span>'+
        '<span class="cal-zoom"><button type="button" onclick="_calZoom(1/1.25)" title="Alejar">&minus;</button><button type="button" id="cal-zoom-pct" onclick="_calZoom(0)" title="Volver al tama&ntilde;o inicial">100%</button><button type="button" onclick="_calZoom(1.25)" title="Acercar">+</button></span>'+
        '<span class="cal-zoom"><button type="button" id="cal-ampliar" onclick="_calAmpliar()" title="Agrandar el editor a casi toda la pantalla (o volver al tama&ntilde;o normal)">&#x2922; Ampliar</button></span></div>'+
      '</div>'+ // .cal-ctl
      '<div class="cal-grip" id="cal-grip" title="Arrastr&aacute; para cambiar el ancho y el alto del editor (doble clic: tama&ntilde;o normal)"></div>'+
    '</div>';
  document.body.appendChild(m);
  var cv=document.getElementById('cal-cv');
  cv.addEventListener('pointerdown',_calDown);
  cv.addEventListener('wheel',_calWheel,{passive:false});
  cv.addEventListener('pointermove',_calMove);
  window.addEventListener('pointerup',_calUp);
  document.addEventListener('keydown',_calKey);
  _calResizeBind(document.getElementById('cal-split'),'split');
  _calResizeBind(document.getElementById('cal-grip'),'card');
}
// ── Tamaño del editor (pedido del admin: con muchas líneas en el cartel la
// imagen quedaba en una franja). La barrita entre imagen y controles fija el
// alto de la imagen; el grip de la esquina, el ancho y alto de la tarjeta (que
// está centrada, por eso crece el doble de lo que se mueve el cursor). Se
// recuerda por navegador en localStorage; null = como venía.
var _CAL_SIZE_KEY='fg_cal_size';
function _calSizeLoad(){try{return JSON.parse(localStorage.getItem(_CAL_SIZE_KEY)||'null')||{};}catch(e){return {};}}
function _calSizeSave(s){try{localStorage.setItem(_CAL_SIZE_KEY,JSON.stringify(s));}catch(e){}}
// Aplica {w,h,bh} recortado a la ventana actual. En pantallas chicas no se toca nada.
function _calSizeSet(s){
  var card=document.querySelector('#cal-modal .cal-card'),body=document.querySelector('#cal-modal .cal-body');if(!card||!body)return;
  var chica=(window.innerWidth||0)<=900;
  var W=(window.innerWidth||800)-32,H=(window.innerHeight||600)-32;
  if(!chica&&s.w){card.style.width=Math.max(480,Math.min(W,s.w))+'px';card.classList.add('sized');}
  else{card.style.width='';card.classList.remove('sized');}
  if(!chica&&s.h)card.style.height=Math.max(320,Math.min(H,s.h))+'px';else card.style.height='';
  // tope: lo que entra en la tarjeta dejando la barrita y 60px de controles
  var tope=(card.style.height?card.clientHeight:H)-body.offsetTop-9-60;
  if(!chica&&s.bh){body.style.height=Math.max(150,Math.min(tope,s.bh))+'px';card.classList.add('split');}
  else{body.style.height='';card.classList.remove('split');}
}
function _calSizeApply(){_calSizeSet(_calSizeLoad());}
function _calAmpliar(){
  var s=_calSizeLoad(),W=(window.innerWidth||800)-32,H=(window.innerHeight||600)-32;
  var grande=s.w>=W-4&&s.h>=H-4;
  s=grande?{}:{w:W,h:H,bh:s.bh||null};
  _calSizeSave(s);_calSizeSet(s);
}
function _calResizeBind(el,modo){
  if(!el)return;
  var st=null;
  el.addEventListener('pointerdown',function(e){
    var card=document.querySelector('#cal-modal .cal-card'),body=document.querySelector('#cal-modal .cal-body'),ctl=document.querySelector('#cal-modal .cal-ctl');
    if(!card||!body||!ctl)return;
    e.preventDefault();el.setPointerCapture(e.pointerId);
    st={x:e.clientX,y:e.clientY,w:card.offsetWidth,h:card.offsetHeight,bh:body.offsetHeight,
      bmax:body.offsetHeight+ctl.offsetHeight-60}; // a los controles les quedan al menos 60px
  });
  el.addEventListener('pointermove',function(e){
    if(!st)return;
    var s=_calSizeLoad();
    if(modo==='split')s.bh=Math.max(150,Math.min(st.bmax,st.bh+(e.clientY-st.y)));
    else{s.w=st.w+2*(e.clientX-st.x);s.h=st.h+2*(e.clientY-st.y);}
    _calSizeSet(s);el._s=s;
  });
  function fin(){if(st&&el._s)_calSizeSave(el._s);st=null;el._s=null;}
  el.addEventListener('pointerup',fin);el.addEventListener('pointercancel',fin);
  el.addEventListener('dblclick',function(){
    var s=_calSizeLoad();
    if(modo==='split')delete s.bh;else{delete s.w;delete s.h;}
    _calSizeSave(s);_calSizeSet(s);
  });
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
    if(P.fijo){ // posiciones medidas del PDF: centrarlas las correría
      _calBenefRowSync();_calRenderLegend();_calDraw();
      showToast('Plantilla "'+P.nombre+'" cargada en su posición. Si hace falta, movela con «Cartel (todo)».');
      return;
    }
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
// ── PROPIEDADES DE CADA ZONA (tamaño, peso, color…) ──────────────────────────
// Los mismos controles que ya tenían las líneas del cartel de Rubros, pero para
// TODAS las zonas: al elegir una en la leyenda aparece su fila, y lo que se toca
// se escribe en el cfg de ESE flyer (queda con "Guardar y activar").
//   obj = de qué objeto del cfg sale · k = la clave · t = tipo de control
var _CAL_PROPS={
  empresa: {obj:'empresa', props:[
    {k:'fs',   t:'num',lbl:'Letra px',   min:10,max:160,step:1},
    {k:'peso', t:'peso',lbl:'Peso'},
    {k:'color',t:'col', lbl:'Color',def:'#111111'},
    {k:'mw',   t:'num',lbl:'Ancho máx.',min:100,max:1240,step:5}
  ]},
  montos:  {obj:'montos',  props:[
    {k:'fs',   t:'num',lbl:'Letra px',min:10,max:160,step:1},
    {k:'peso', t:'peso',lbl:'Peso'},
    {k:'mh',   t:'num',lbl:'Alto caja',min:20,max:220,step:1},
    {k:'boxes',t:'cols',lbl:'Color de cada monto'}
  ]},
  cashback:{obj:'cashback',props:[
    {k:'fs',   t:'num',lbl:'Letra px',min:10,max:240,step:1},
    {k:'peso', t:'peso',lbl:'Peso'},
    {k:'col',  t:'col', lbl:'Color',def:'#fa6400'},
    {k:'mw',   t:'num',lbl:'Ancho máx.',min:100,max:1240,step:5}
  ]},
  asesores:{obj:'contacto',props:[
    {k:'fnBold',t:'num',lbl:'Nombre px',min:8,max:90,step:1},
    {k:'frReg', t:'num',lbl:'Cel./mail px',min:8,max:90,step:1},
    {k:'peso',  t:'peso',lbl:'Peso del nombre'},
    {k:'color', t:'col',lbl:'Color',def:'#111111'}
  ]},
  legal:   {obj:'legal',   props:[
    {k:'fs',   t:'num',lbl:'Letra px',min:5,max:48,step:0.5},
    {k:'lh',   t:'num',lbl:'Interlineado',min:6,max:70,step:0.5},
    {k:'color',t:'col', lbl:'Color',def:'#222222'}
  ]}
};
// Una caja suelta de montos tiene sus propias perillas. El ancho y el alto
// importan de verdad: definen cuánto del arte se tapa antes de escribir el
// importe, y de dónde sale la muestra del color de fondo (justo arriba de la
// caja). En la grilla 2x2, arriba del importe de abajo está la etiqueta impresa
// del de arriba: si el tapado se nota, se baja el alto de esa caja.
var _CAL_MBOX_PROPS=[
  {k:'ew', t:'num',lbl:'Ancho caja',min:40,max:1240,step:5},
  {k:'mh', t:'num',lbl:'Alto caja', min:20,max:220,step:1},
  {k:'col',t:'col',lbl:'Color',def:'#1d4070'}
];
// Qué propiedades tiene una zona: las fijas de _CAL_PROPS o, para una caja
// suelta (mb0..mb3), una definición que apunta a montos.boxes[i]. arr+idx = la
// zona ES un elemento de un array, no un objeto del cfg.
function _calPropsDef(zona){
  var m=/^mb(\d+)$/.exec(zona||'');
  if(m)return {obj:'montos',arr:'boxes',idx:+m[1],props:_CAL_MBOX_PROPS};
  return _CAL_PROPS[zona]||null;
}
// Resuelve el objeto a leer/escribir dentro de un cfg (el del flyer o el default).
function _calPropsObj(root,d){
  var o=root&&d&&root[d.obj];if(!o)return null;
  return d.arr?(((o[d.arr]||[])[d.idx])||null):o;
}
// #abc → #aabbcc: <input type="color"> sólo entiende los de 6 dígitos.
function _calHex(v,def){
  v=String(v==null?'':v).trim();
  if(/^#[0-9a-f]{3}$/i.test(v))return '#'+v[1]+v[1]+v[2]+v[2]+v[3]+v[3];
  return /^#[0-9a-f]{6}$/i.test(v)?v:(def||'#000000');
}
// Escribe una propiedad en el cfg del flyer que se está calibrando y redibuja.
// idx != null = el color de una de las cajas de montos.
function _calProp(zona,k,val,idx){
  var d=_calPropsDef(zona);if(!d||!_cal)return;
  var o=_calPropsObj(_cal.cfg,d);if(!o)return;
  if(idx!=null){
    // control 'cols': desde la zona padre se edita el color de sus N hijos
    if(o[k]&&o[k][idx])o[k][idx].col=val;
  }else{
    var def=null;d.props.forEach(function(p){if(p.k===k)def=p;});
    o[k]=(def&&def.t==='num')?(parseFloat(val)||0):val;
  }
  _calDraw();
}
// Arma la fila de la zona elegida. Sin zona elegida (o con una del cartel, que
// tiene su propio editor abajo) la fila no se muestra.
function _calPropsSync(){
  var row=document.getElementById('cal-prop-row');if(!row)return;
  var zona=_cal&&_cal.sel,d=zona&&_calPropsDef(zona);
  row.classList.toggle('show',!!d);
  if(!d)return;
  var o=_calPropsObj(_cal.cfg,d)||{},lbl='';
  _calZones().forEach(function(z){if(z.id===zona)lbl=z.label;});
  function ev(ev1,k,extra){return ev1+'="_calProp(\''+zona+'\',\''+k+'\',this.value'+(extra||'')+')"';}
  var campos=d.props.map(function(p){
    var v=o[p.k];
    if(p.t==='num')
      return '<label>'+_escHtml(p.lbl)+'<input type="number" min="'+p.min+'" max="'+p.max+'" step="'+(p.step||1)+'" value="'+_escAttr(String(v==null?'':v))+'" '+ev('oninput',p.k)+'></label>';
    if(p.t==='peso')
      return '<label>'+_escHtml(p.lbl)+'<select '+ev('onchange',p.k)+'>'+
        [400,500,600,700,800].map(function(w){return '<option value="'+w+'"'+((+v||700)===w?' selected':'')+'>'+w+(w===400?' fina':w===800?' negrita':'')+'</option>';}).join('')+'</select></label>';
    if(p.t==='col')
      return '<label>'+_escHtml(p.lbl)+'<input type="color" value="'+_calHex(v,p.def)+'" '+ev('oninput',p.k)+'></label>';
    if(p.t==='cols')
      return '<label>'+_escHtml(p.lbl)+'<span class="cal-cols">'+(o.boxes||[]).map(function(b,i){
        return '<input type="color" value="'+_calHex(b.col,'#1d4070')+'" title="Monto '+(i+1)+'" '+ev('oninput','boxes',','+i)+'>';
      }).join('')+'</span></label>';
    return '';
  }).join('');
  row.innerHTML='<div class="cal-props"><b>'+_escHtml(lbl||zona)+'</b>'+campos+
    '<span class="sp"></span><button class="usr-btn edit" onclick="_calPropReset()" title="Vuelve esta zona a los valores de f&aacute;brica">Restablecer</button></div>';
}
// Vuelve la zona elegida a los valores de fábrica, sin tocar su posición.
function _calPropReset(){
  var zona=_cal&&_cal.sel,d=zona&&_calPropsDef(zona);if(!d)return;
  var base=_calPropsObj(FLYER_CFG_DEFAULT,d)||{},o=_calPropsObj(_cal.cfg,d);if(!o)return;
  d.props.forEach(function(p){
    if(p.t==='cols'){(o.boxes||[]).forEach(function(b,i){if(base.boxes&&base.boxes[i])b.col=base.boxes[i].col;});}
    else if(base[p.k]!=null)o[p.k]=base[p.k];
  });
  _calPropsSync();_calDraw();
}
function _calRenderLegend(){
  var el=document.getElementById('cal-legend');if(!el)return;
  el.innerHTML=_calZones().map(function(z){
    var on=_cal&&_cal.sel===z.id;
    return '<span class="cal-chip'+(on?' on':'')+'" style="color:'+z.color+'" onclick="_calSelect(\''+z.id+'\')"><span class="dot" style="background:'+z.color+'"></span>'+z.label+'</span>';
  }).join('');
  _calPropsSync(); // la fila de tamaño/peso/color sigue a la zona elegida
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
  // Una caja por importe (con su posición y su alto) y, alrededor, el bloque
  // entero: con la grilla 2x2 el grupo ocupa dos filas, así que el bounding box
  // va en x Y en y. El aire de ±10/±8 es el mismo que usa el cartel de Rubros,
  // para que el borde del grupo no se pegue a las cajas de adentro.
  var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  (M.boxes||[]).forEach(function(b,i){
    var by=_fgMBoxY(M,b),bh=_fgMBoxH(M,b),x0=b.xc-b.ew/2;
    r['mb'+i]={x:x0,y:by-bh/2,w:b.ew,h:bh};
    minx=Math.min(minx,x0);maxx=Math.max(maxx,x0+b.ew);
    miny=Math.min(miny,by-bh/2);maxy=Math.max(maxy,by+bh/2);
  });
  r.montos={x:minx-10,y:miny-8,w:(maxx-minx)+20,h:(maxy-miny)+16};
  r.asesores={x:C.ex,y:C.ey+DBOT,w:C.ew,h:C.eh};
  r.legal={x:L.x0,y:L.yStart+DBOT,w:L.maxW,h:(L.yEnd-L.yStart)};
  var K=cfg.cashback||FLYER_CFG_DEFAULT.cashback;
  r.cashback={x:K.xc-K.mw/2,y:K.y-K.mh/2,w:K.mw,h:K.mh};
  if(_calEsRubros()){
    // ancho estimado del texto (sin canvas a mano): ~0.55em por carácter, tope mw
    var all=null;
    _calBenefLineas().forEach(function(L,i){
      var w=_calBenefAnchoEst(L),h=Math.round(L.lh?L.lh*2:L.fs*1.25); // con interlínea, el texto ocupa varios renglones
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
  // Sin willReadFrequently: nadie lee píxeles de este canvas (el muestreo del fondo
  // lee la imagen original, no lo dibujado), y con esa bandera el navegador lo baja
  // de la GPU a memoria del CPU — con el canvas agrandado por el zoom, arrastrar una
  // zona (que redibuja en cada movimiento) se sentía trabado.
  var cv=document.getElementById('cal-cv');if(!cv)return;var g=cv.getContext('2d');var ds=_cal.ds;
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
  // Las cajas sueltas van antes que "Montos (todo)", que ahora las contiene a
  // las cuatro; si no, el rect del grupo se comería todos los clicks.
  _calMBoxes().forEach(function(_b,i){order.push('mb'+i);});
  order=order.concat(_calZonesBase().map(function(z){return z.id;})
    .filter(function(id){return !/^mb\d+$/.test(id);}));
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
  // "Montos (todo)" mueve el bloque entero sin deformarlo: M.y corre las cajas
  // que heredan la fila y las que ya tienen y propio se corren el mismo dy.
  else if(drag.zone==='montos'){M.y+=dy;M.boxes.forEach(function(b){b.xc+=dx;if(b.y!=null)b.y+=dy;});}
  // Una caja sola: al moverla por primera vez se le fija su y (hasta ahí heredaba M.y).
  else if(/^mb\d+$/.test(drag.zone)){var mb=(M.boxes||[])[+drag.zone.slice(2)];if(mb){mb.xc+=dx;mb.y=_fgMBoxY(M,mb)+dy;}}
  else if(drag.zone==='cashback'){var K=cfg.cashback||(cfg.cashback=_fgMerge(FLYER_CFG_DEFAULT.cashback,null));K.y+=dy;K.xc+=dx;}
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
  _calSizeApply(); // el tamaño del editor que dejó la última vez
  var t=document.getElementById('cal-title');if(t)t.textContent='Calibrar flyer — '+_optLabel(opt)+(_calEsRubros()?' (Flyer Rubros)':'');
  var hInput=document.getElementById('cal-height');if(hInput)hInput.value='';
  _calRenderLegend();_calBenefRowSync();
  if(_calEsRubros()){
    // arranca con la plantilla de la opción, centrada en el cuadro de la imagen;
    // si hay líneas guardadas, las pisa la carga de abajo
    var ps=document.getElementById('cal-benef-plantilla');if(ps)ps.value=_calBenefPlantillaPorOpcion();
    if(!_calBenefPlantillaFija())_calBenefCentrar(true);
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
     'nombre3','celular3','email3','nombre4','celular4','email4',
     'nombre5','celular5','email5','nombre6','celular6','email6',
     'nombre7','celular7','email7','nombre8','celular8','email8'].forEach(function(k){
      if(v[k])extra[k]=v[k];
    });
    // Modo "oficiales por sede": va todo en flyer_type (texto JSON), sin columnas nuevas.
    if(v.sedes){
      extra.sedes=1;
      if(v.sedesTit)extra.sedesTit=v.sedesTit;
      for(var _u=1;_u<=8;_u++)if(v['ubic'+_u])extra['ubic'+_u]=v['ubic'+_u];
    }
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
// El PDF de un flyer (canvas ya recortado): una página de 210 mm de ancho y el
// alto exacto del flyer, con la imagen en JPEG 0,95. Era el mismo bloque copiado
// en cuatro lugares (descarga, masivo, generar desde la base y compartir).
function _fgPdfDe(fc){
  var jsPDF=window.jspdf.jsPDF,pw=210,ph=(fc.height/fc.width)*pw;
  var pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[pw,ph]});
  pdf.addImage(fc.toDataURL('image/jpeg',0.95),'JPEG',0,0,pw,ph);
  return pdf;
}
// Generación en tanda (masivo, "Generar flyers", descarga múltiple del Hunter):
// entre flyer y flyer se cede el hilo lo justo para que se pinte la barra de
// progreso, un cuadro. Antes había pausas fijas de 200/120/60 ms: con 100 flyers
// eran 12 a 20 segundos de espera pura. El setTimeout de respaldo cubre la
// pestaña en segundo plano, donde requestAnimationFrame no corre.
function _fgCeder(fn){
  var hecho=false;
  function seguir(){if(hecho)return;hecho=true;fn();}
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(function(){setTimeout(seguir,0);});
  setTimeout(seguir,50);
}
// OJO: logFlyerToSupabase existía pero NADIE lo llamaba => no se registraba ninguna
// descarga. Lo engancho acá pisando savePDF/savePNG de _source.html (que regenera).
function fgSavePDF(fc,v,force){
  if(!force&&_padCheckRubro(_padFilaActual(),'descarga',function(){fgSavePDF(fc,v,true);}))return;
  var pdf=_fgPdfDe(fc);
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
// Baja un archivo armado en memoria (los ZIP del masivo y del padrón) y después
// lo suelta. Sin el revoke, un ZIP de 100 flyers (~120 MB) quedaba ocupando
// memoria hasta recargar la página. El minuto de margen es para PCs lentas o con
// antivirus que revisan la descarga antes de escribirla.
var _FG_SOLTAR_MS=60000;
function _fgBajarBlob(blob,nombre){
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.download=nombre;a.href=url;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);if(a.parentNode)a.parentNode.removeChild(a);},_FG_SOLTAR_MS);
}
// MASIVO con hasta 4 asesores. Pisa genAll de _source.html (que sólo mapea 1 y 2).
// Los Excel viejos (sin columnas 3/4) siguen funcionando igual.
function fgGenAll(){
  if(!window.excelData||!excelData.length)return;
  var total=excelData.length,cur=0,zip=new JSZip(),usados={},errores=[];
  // Con versión "sin cashback" de la opción en pantalla: primero las filas con
  // cashback y después, en esa versión, las que no tienen (con su legal).
  // Funciona igual arrancando desde la original o desde la versión sin cashback:
  // cada fila va a la que le toca y primero salen las de la opción en pantalla.
  var origen=_optN(_fgOpt),libre=!_fgProtoActivo()&&!_fgRecActivo(),orden=[],corte=-1,cambiado=false,V=0;
  var bOpt=_fgOptBase(origen),optSin=libre?(_fgVarianteSinCB(bOpt)||origen):origen;
  var optCon=(libre&&origen!==bOpt&&_can('opcion_'+bOpt))?bOpt:origen;
  function _sinCB(row){return _padCfgOf(row.config||row.Config||'')<0;}
  function destinoDe(row){return _sinCB(row)?optSin:optCon;}
  excelData.forEach(function(row,i){if(destinoDe(row)===origen)orden.push(i);});
  corte=orden.length;
  excelData.forEach(function(row,i){var dd=destinoDe(row);if(dd!==origen){orden.push(i);V=dd;}});
  if(corte>=orden.length)V=0;
  var legalText=document.getElementById('legal-text').value;
  // Flyer Rubros: si la fila no trae importe, se usa el del formulario (uno para todos)
  var enRubros=!!_solCfg(_fgVista).benef,cashUnico=!!_solCfg(_fgVista).cashUnico,impForm=_fgFmtImporte((document.getElementById('benef-importe')||{}).value||''),imp2Form=_fgFmtImporte((document.getElementById('benef-importe2')||{}).value||'');
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
  function volver(){if(cambiado&&_optN(_fgOpt)!==origen&&_can('opcion_'+origen))switchFlyerOption(origen);}
  function next(){
    if(V&&!cambiado&&cur===corte&&cur<total){
      cambiado=true;if(pt)pt.textContent='Cambiando a '+_optLabel(V)+' para las empresas sin cashback...';
      _fgWithOpt(V,function(){legalText=(document.getElementById('legal-text')||{}).value||'';cashUnico=!!_solCfg(_fgVista).cashUnico;_fgCeder(next);});
      return;
    }
    if(cur>=total){
      if(pt)pt.textContent='Empaquetando ZIP...';
      // Sin el catch, si el ZIP fallaba (memoria, por ejemplo) el botón quedaba
      // deshabilitado y la barra en "Empaquetando ZIP..." hasta recargar.
      zip.generateAsync({type:'blob'}).then(function(content){
        var d=new Date();
        var fecha=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        _fgBajarBlob(content,'Flyers_Galicia_'+fecha+'.zip');volver();
        var ok=total-errores.length;
        if(pt)pt.textContent='✓ ZIP con '+ok+' flyer'+(ok!==1?'s':'')+(errores.length?' — '+errores.length+' con error: '+errores.slice(0,3).join(' · ')+(errores.length>3?' …':''):'!');
        if(bg)bg.disabled=false;
        showToast(errores.length?'ZIP descargado: '+errores.length+' fila(s) no se pudieron generar':'ZIP descargado!');
      }).catch(function(e){
        if(pt)pt.textContent='No se pudo armar el ZIP: '+((e&&e.message)||e);volver();
        if(bg)bg.disabled=false;
        showToast('No se pudo armar el ZIP. Probá con menos filas.');
      });return;
    }
    // Una fila que falla (un dato raro) ya no corta la tanda con el botón
    // trabado: se anota y se sigue con la próxima, como en "Generar flyers".
    var fi=orden[cur];
    try{genFila();}catch(e){errores.push((excelData[fi]&&(excelData[fi].empresa||excelData[fi].Empresa))||('fila '+(fi+2)));console.error('masivo:',e);}
    cur++;
    if(pf)pf.style.width=Math.round((cur/total)*100)+'%';
    if(pt)pt.textContent=cur<total?('Generando '+(cur+1)+' de '+total+'...'):'Finalizando...';
    _fgCeder(next);
  }
  function genFila(){
    var row=excelData[orden[cur]];
    // misma regla que el padrón: sin config válida, ese flyer sale sin montos
    var ci=_padCfgOf(row.config||row.Config||'');
    var cfg=CONFIGS[ci<0?0:ci];
    var v={empresa:(row.empresa||row.Empresa||'flyer'+(cur+1)),
      nocb:ci<0,m1:cfg.m1,m2:cfg.m2,m3:cfg.m3,m4:cfg.m4,legal:legalText,cashUnico:cashUnico};
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
    var fc=fullRes(v),pdf=_fgPdfDe(fc);
    // Dos filas con la misma razón social generaban el MISMO nombre y la segunda
    // pisaba a la primera: el ZIP salía con menos flyers de los que decía.
    var base='Flyer '+_fgSafeName(v.empresa),nom=base;
    usados[base]=(usados[base]||0)+1;
    if(usados[base]>1)nom=base+' ('+usados[base]+')';
    zip.file(nom+'.pdf',pdf.output('arraybuffer'));
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
  // Los registros y los nombres de los usuarios se piden A LA VEZ (antes los
  // nombres recién cuando llegaban los registros: una vuelta más a la red).
  var r=null,profileMap=null;
  query.limit(300).then(function(x){r=x;pintar();});
  _loadProfileMap(function(m){profileMap=m;pintar();});
  function pintar(){
    if(!r)return;
    if(r.error){container.innerHTML='<p style="color:var(--red);font-size:.8rem">Error: '+_escHtml(r.error.message)+'</p>';return;}
    if(!profileMap)return;
    (function(){
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
        var fmtBadge=row.format?'<span class="badge badge-asesor" style="font-size:.75rem">'+_escHtml(String(row.format).toUpperCase())+'</span>':'';
        var ex={};try{if(row.flyer_type)ex=JSON.parse(row.flyer_type)||{};}catch(e){}
        if(typeof ex!=='object'||Array.isArray(ex))ex={};
        // Opción usada (control de visibilidad). Registros viejos no la tienen.
        var optBadge=ex.opcion?_optBadge(ex.opcion,'font-size:.75rem;margin-left:4px'):'';
        var bulkBadge=ex.masivo?'<span class="badge" style="font-size:.75rem;padding:3px 7px;background:#fff3e0;color:#b26a00;margin-left:4px">'+(ex.padron?'EMPRESAS':'MASIVO')+'</span>':'';
        var cfgHtml=ex.config?'<span class="reg-monto" style="background:#eef0ff;color:#3a3a8c">'+_escHtml(ex.config)+'</span>':'';
        // Flyer Rubros: tope del beneficio (y el nombre del cartel si difiere de la empresa)
        if(ex.importe)cfgHtml+='<span class="reg-monto" style="background:#fff3e0;color:#b26a00" title="Tope de reintegro del beneficio exclusivo">Tope '+_escHtml(ex.importe)+(ex.importe2&&ex.importe2!==ex.importe?' / '+_escHtml(ex.importe2):'')+'</span>';
        if(ex.beneficio&&ex.beneficio!==(row.empresa||''))cfgHtml+='<span class="reg-monto" style="background:#fff3e0;color:#b26a00" title="Nombre en el cartel del beneficio">'+_escHtml(ex.beneficio)+'</span>';
        var cfgWrap=cfgHtml?'<div class="reg-montos">'+cfgHtml+'</div>':'';
        var asesorHtml=ex.nombre?'<div style="font-size:.75rem;color:#555;margin-top:3px"><b>Asesor:</b> '+_escHtml(ex.nombre)+(ex.celular?' &middot; '+_escHtml(ex.celular):'')+(ex.email?' &middot; '+_escHtml(ex.email):'')+'</div>':'';
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
    })();
  }
}

function exportRegistros(){
  var btn=document.getElementById('btn-export-reg');
  if(btn){btn.textContent='Exportando...';btn.disabled=true;}
  var qemp=(document.getElementById('reg-q-empresa')||{}).value||'';
  var qusr=(document.getElementById('reg-q-user')||{}).value||'';
  var qfrom=(document.getElementById('reg-q-from')||{}).value||'';
  var qto=(document.getElementById('reg-q-to')||{}).value||'';
  // TODO lo que coincide, por tandas (_sbTodo): antes se cortaba en 1000 filas sin
  // avisar. El id desempata el orden para que ninguna tanda repita ni saltee filas.
  function armar(d,h){
    var query=_sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,flyer_type,created_at')
      .not('user_id','is',null).order('created_at',{ascending:false}).order('id',{ascending:false});
    if(qemp.trim())query=query.ilike('empresa','%'+qemp.trim()+'%');
    if(qfrom)query=query.gte('created_at',qfrom+'T00:00:00');
    if(qto)query=query.lte('created_at',qto+'T23:59:59');
    return query.range(d,h);
  }
  _sbTodo(armar,function(err,filas){
    // innerHTML: con textContent el botón quedaba mostrando "&#11015;" en letras.
    if(btn){btn.innerHTML='&#11015; Exportar Excel';btn.disabled=false;}
    if(err){showToast('No se pudo exportar: '+(err.message||err));return;}
    var r={data:filas};
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
      if(acc==='alta')badge='<span class="badge badge-active" style="font-size:.75rem">Alta</span>';
      else if(acc==='baja')badge='<span class="badge badge-inactive" style="font-size:.75rem">Baja</span>';
      else badge='<span class="badge" style="font-size:.75rem;background:#eef0ff;color:#3a3a8c">Modificaci&oacute;n</span>';
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
// ── ADMIN → AUDITORÍA ────────────────────────────────────────────────────────
// Tabla audit_log (migración 023): la escribe la Edge Function auth-admin con la
// service_role; el admin sólo la LEE (RLS) y nadie la puede modificar ni borrar.
// Hay emails y nombres que escribió un usuario: todo se escapa antes de pintarlo.
var _AUD_LBL={
  register:'Pidió acceso',request_reset:'Pidió cambiar su contraseña',
  approve_user:'Aprobó la cuenta de',create_user:'Creó el usuario',
  approve_reset:'Aprobó el cambio de contraseña de',deny_reset:'Rechazó el cambio de contraseña de',
  set_password:'Cambió la contraseña de',delete_user:'Eliminó al usuario',
  alta_a_medias:'⚠ Alta a medias (revisar)',baja_a_medias:'⚠ Baja a medias (revisar)'
};
function _audDetalleTxt(row){
  var d=row.detalle||{},out=[];
  if(d.ip)out.push('IP '+d.ip);
  if(d.rol)out.push('rol '+(_ROLE_LBL[d.rol]||d.rol));
  if(d.estado)out.push('estado '+d.estado);
  if(d.estado_anterior)out.push('estaba '+d.estado_anterior);
  if(d.nombre)out.push(d.nombre);
  if(d.parcial)out.push('quedó a medias: se pidió reintentar');
  return out.join(' · ');
}
function loadAuditoria(){
  var container=document.getElementById('aud-list');
  if(!container)return;
  container.innerHTML=skelRows(4);
  var acc=((document.getElementById('aud-q-accion')||{}).value||'');
  var q=_sb.from('audit_log').select('id,created_at,actor_email,accion,objetivo_email,detalle')
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(300);
  if(acc)q=q.eq('accion',acc);
  q.then(function(r){
    if(r.error){container.innerHTML='<p style="color:var(--red);font-size:.8rem">Error: '+_escHtml(r.error.message)+'</p>';return;}
    var data=r.data||[];
    var countEl=document.getElementById('aud-count');
    if(countEl)countEl.textContent=data.length+' registro'+(data.length!==1?'s':'')+(data.length>=300?' (se muestran los últimos 300)':'');
    if(!data.length){container.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin registros todav&iacute;a. Desde ahora queda constancia de cada alta, aprobaci&oacute;n, cambio de contrase&ntilde;a y baja de cuentas.</p>';return;}
    container.innerHTML=data.map(function(row){
      var quien=row.actor_email||'Visitante (sin sesión)';
      var col=_avatarColor(quien);
      var det=_audDetalleTxt(row);
      return '<div class="reg-row">'+
        '<div class="usr-avatar sm" style="background:'+col+';flex-shrink:0">'+_escHtml(_initials(row.actor_email||'?',row.actor_email||''))+'</div>'+
        '<div class="reg-info">'+
          '<div class="reg-top"><span class="reg-empresa">'+_escHtml(_AUD_LBL[row.accion]||row.accion||'—')+'</span></div>'+
          '<div class="reg-mid"><span class="reg-lbl">Cuenta</span> '+_escHtml(row.objetivo_email||'—')+'</div>'+
          '<div class="reg-mid"><span class="reg-lbl">Por</span> '+_escHtml(quien)+(det?' &nbsp;&middot;&nbsp; <span class="reg-lbl">'+_escHtml(det)+'</span>':'')+'</div>'+
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
  // Todo el registro que coincide, por tandas (antes se cortaba en 1000 sin avisar).
  _sbTodo(function(d,h){return _plogQuery(f,0).range(d,h);},function(err,filas){
    var r={data:filas,error:err};
    if(btn){btn.innerHTML='&#11015; Exportar Excel';btn.disabled=false;}
    var data=_plogFiltraUser(r.data||[],f).filter(_plogRelevante);
    if(r.error||!data.length){showToast(r.error?('Error: '+(r.error.message||r.error)):'Sin datos para exportar');return;}
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
  // Los últimos flyers y los nombres de los usuarios, a la vez.
  var r=null,profileMap=null;
  _sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,created_at')
    .not('user_id','is',null)
    .order('created_at',{ascending:false}).limit(10)
    .then(function(x){r=x;pintar();});
  _loadProfileMap(function(m){profileMap=m;pintar();});
  function pintar(){
      if(!r)return;
      var data=(r.data||[]).filter(function(row){return row.user_id;});
      if(!data.length){
        el.innerHTML='<p style="color:var(--gray);font-size:.8rem">Sin flyers generados aún. Cuando un usuario descargue un flyer aparecerá aquí.</p>';return;
      }
      if(!profileMap)return;
      (function(){
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
      })();
  }
}

function exportFlyerLogsExcel(){
  var btn=document.getElementById('btn-export-excel');
  if(btn){btn.textContent='Exportando...';btn.disabled=true;}
  // Todos los registros, por tandas (antes se cortaba en 1000 sin avisar).
  _sbTodo(function(d,h){
    return _sb.from('flyer_logs').select('id,user_id,empresa,config_name,format,created_at')
      .not('user_id','is',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(d,h);
  },function(err,filas){
    // innerHTML: con textContent el botón quedaba mostrando "&#11015;" en letras.
    if(btn){btn.innerHTML='&#11015; Exportar Excel';btn.disabled=false;}
    if(err){showToast('No se pudo exportar: '+(err.message||err));return;}
    var r={data:filas};
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
// Saca el aviso SÓLO si todavía dice msg: un "Cargando…" no tiene que quedar
// 3 s con el flyer ya en pantalla, pero tampoco puede borrar un aviso más nuevo.
function fgHideToast(msg){
  var t=document.getElementById('toast-el')||document.getElementById('toast');if(!t||t.textContent!==msg)return;
  clearTimeout(t._tid);
  if(t.id==='toast-el')t.classList.remove('show');else t.style.opacity='0';
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

// ── PADRÓN DE EMPRESAS (buscador por razón social / CUIT) — SOLO ADMIN ─────────
// Excel precargado desde Panel Administrador → Varios. Se guarda en el bucket
// flyers como _padron.json {rows,count,updated_at}. NO se retroalimenta con lo que
// se va generando: la fuente de verdad es el Excel del admin. Es el MISMO formato
// que la plantilla del masivo + la columna cuit (que el masivo ignora), así un solo
// archivo sirve para las dos cosas.
var _padron=null,_padronAt='',_padHits=[];
// true si la última lectura del padrón falló: el freno del Excel no puede
// comparar contra lo guardado, así que no se reemplaza nada a ciegas.
var _padLoadErr=false;
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
  // txt: lo que decía la columna "rubro" del Excel. Se guarda para poder deducir
  // el rubro aunque la opción de entonces ya no exista o se haya renombrado.
  var txt=String(r.txt==null?'':r.txt).replace(/[<>]/g,'').trim().slice(0,40);
  return {opcion:n,importe:_padDigits(r.importe),importe2:_padDigits(r.importe2),txt:txt};
}
function _padRubroOpts(){return _FG_OPTS.filter(function(o){return _optSolapa(o)==='rubros';});}
// ── DE QUÉ RUBRO ES CADA FLYER ──────────────────────────────────────────────
// Lo que no cambia de una campaña a otra es el RUBRO de la empresa: combustible,
// supermercado o los dos. El flyer sí cambia (cada campaña es una opción nueva).
// Por eso el padrón se resuelve por rubro y no por el número guardado: siempre
// hay un flyer vigente de cada rubro y ahí va la empresa, sin tocar un dato.
// El tipo sale del nombre de la opción ("Súper y combustible 2027" → ambos), y el
// admin lo puede fijar a mano en Config → Opciones si el nombre no lo dice.
function _padRubroTipo(txt){
  var t=_padNorm(txt);if(!t)return '';
  var comb=t.indexOf('combustible')>=0||t.indexOf('nafta')>=0||t.indexOf('estacion')>=0;
  var sup=t.indexOf('super')>=0||t.indexOf('hiper')>=0||t.indexOf('mercado')>=0;
  if(t.indexOf('ambos')>=0||(comb&&sup))return 'ambos';
  if(comb)return 'combustible';
  if(sup)return 'supermercado';
  return '';
}
function _optRubroTipo(opt){
  var o=_OPC[_optN(opt)];if(!o)return '';
  if(o.rubro==='ninguno')return '';
  return o.rubro||_padRubroTipo(o.nombre||'');
}
// Flyer vigente de un rubro: entre las opciones de ese rubro, la última que el
// admin dejó en la barra y que nadie reemplazó. 0 si no hay ninguna.
function _padRubroActivo(tipo){
  if(!tipo)return 0;
  var cand=_padRubroOpts().filter(function(o){return _optRubroTipo(o)===tipo&&_optVigente(o)===o;});
  if(!cand.length)return 0;
  return cand.sort(function(a,b){
    var oa=(_OPC[a]&&_OPC[a].orden),ob=(_OPC[b]&&_OPC[b].orden);
    if(oa==null)oa=a;if(ob==null)ob=b;
    return oa-ob||a-b;
  })[cand.length-1];
}
// De qué RUBRO es una empresa ('combustible' / 'supermercado' / 'ambos' o ''):
// se deduce de la opción que tiene guardada (aunque sea de una campaña vieja) o,
// si esa ya no existe, del texto con el que se cargó (la columna del Excel).
function _padRubroTipoDe(ru){
  ru=_padRubroSane(ru);
  var n=_optVigente(ru.opcion);
  var tipo=(n&&_FG_OPTS.indexOf(n)>=0)?_optRubroTipo(n):'';
  return tipo||_padRubroTipo(ru.txt);
}
// A qué opción va una empresa: el flyer vigente de SU rubro. Si no se puede
// deducir nada, queda la opción guardada siguiendo "Reemplaza a".
function _padOptDeRubro(ru){
  ru=_padRubroSane(ru);
  return _padRubroActivo(_padRubroTipoDe(ru))||_optVigente(ru.opcion);
}
// "Ambos" / "combustible" / "5" → nº de opción de rubros (0 si no coincide)
function _padRubroOf(txt){
  var t=_padNorm(txt);if(!t||t==='-'||t==='no'||t==='sin rubro')return 0;
  var opts=_padRubroOpts(),i;
  // Un Excel viejo nombra el flyer del año pasado: se acepta igual y queda
  // apuntando al vigente (_optVigente), que es a donde va a ir.
  if(/^\d+$/.test(t)){var n=parseInt(t,10);return opts.indexOf(n)>=0?_optVigente(n):0;}
  for(i=0;i<opts.length;i++)if(_padNorm(_optLabel(opts[i]))===t)return _optVigente(opts[i]);
  for(i=0;i<opts.length;i++){var l=_padNorm(_optLabel(opts[i]));if(l.indexOf(t)>=0||t.indexOf(l)>=0)return _optVigente(opts[i]);}
  return 0;
}
function _padRubroLabel(r){
  var ru=_padRubroSane(r&&r.rubro),vig=_padOptDeRubro(ru);if(!vig)return '';
  // se muestra el flyer VIGENTE de su rubro, que es al que va a ir: el nombre de
  // la campaña vieja sólo confundiría.
  var lbl=_optLabel(vig),imp=_fgFmtImporte(ru.importe),imp2=_fgFmtImporte(ru.importe2);
  if(imp)lbl+=' · '+imp+((imp2&&imp2!==imp)?' / '+imp2:'');
  return lbl;
}
function _padRubroIgual(a,b){a=_padRubroSane(a);b=_padRubroSane(b);return a.opcion===b.opcion&&(!a.opcion||(a.importe===b.importe&&(a.importe2||a.importe)===(b.importe2||b.importe)));}

// Se recuerda por texto (depende sólo de él): el buscador de empresas y el del
// Hunter normalizaban la razón social de CADA fila en cada tecla, y el orden de
// la lista del Hunter, dos veces por comparación.
var _padNormC=new Map();
function _padNorm(s){
  var k=(s==null?'':String(s)),v=_padNormC.get(k);
  if(v!==undefined)return v;
  if(_padNormC.size>=50000)_padNormC.clear(); // techo de memoria
  _padNormC.set(k,v=_padNormCalc(k));
  return v;
}
function _padNormCalc(s){
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
  var rtxt=g('rubro','rubros','beneficio','opcionrubro');
  var rubro={opcion:_padRubroOf(rtxt),importe:_padDigits(g('tope','importe','tope1','importe1')),importe2:_padDigits(g('tope2','importe2')),txt:rtxt};
  return {empresa:emp,cuits:cuits,config:g('config','cashback','tipocashback','tipodecashback','tipo','configuracion'),asesores:as,rubro:rubro};
}
// Busca por CUIT (si hay 3+ dígitos) o por coincidencia parcial de la razón social:
// todas las palabras que escribís tienen que estar en el nombre, en cualquier orden.
// El tercer parámetro deja buscar en OTRA lista que no sea el padrón propio (lo
// usa el perfil Hunter, que busca en las empresas de todos los oficiales).
// Los puntos no cuentan al BUSCAR: "AMIC S.A." encuentra "AMIC SA" y al revés.
// Sólo acá: _padNorm también compara razones sociales (la clave del padrón).
function _padSinPuntos(s){return s.indexOf('.')<0?s:s.replace(/\./g,'');}
function padronSearch(q,limit,lista){
  var rows=lista||_padron||[],lim=limit||60;
  var t=_padSinPuntos(_padNorm(q)).trim();
  if(!t)return rows.slice(0,lim);
  var dig=_padDigits(q),toks=t.split(' ').filter(Boolean),out=[];
  for(var i=0;i<rows.length&&out.length<lim;i++){
    var r=rows[i],hit=false;
    if(!r)continue;
    if(dig.length>=3&&r.cuits){
      for(var j=0;j<r.cuits.length;j++){if(r.cuits[j].indexOf(dig)>=0){hit=true;break;}}
    }
    if(!hit){
      var e=_padSinPuntos(_padNorm(r.empresa));
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
    var o={empresa:emp,cuits:cu,config:(r.config==null?'':String(r.config)).trim(),asesores:as,rubro:_padRubroSane(r.rubro)};
    // Passthrough opcional: sólo lo lleva si la consulta lo pidió (loadPadron no
    // selecciona ni id ni user_id; el Hunter sí, porque los necesita para
    // proponer un cambio al dueño correcto).
    if(r.id!=null)o.id=r.id;
    if(r.user_id!=null)o.user_id=r.user_id;
    out.push(o);
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
        _padLoadErr=true;_padron=_padron||[];if(cb)cb(_padron);return;
      }
      _padLoadErr=false;
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
    var vg=_padOptDeRubro(ru);
    line.push(vg?_optLabel(vg):'',f1?f1.slice(1):'',(f2&&f2!==f1)?f2.slice(1):'');
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
      // Freno: comparo contra lo guardado RECIÉN leído de la base (no la copia
      // en memoria) y, si se pierde o cambia algo, muestro el resumen antes de
      // reemplazar. Sólo guarda directo la primera carga (no había nada).
      loadPadron(true,function(actual){
        if(_padLoadErr){
          showToast('No pude leer tus empresas guardadas para compararlas: no se reemplazó nada. Probá de nuevo.');
          renderPadronAdmin();return;
        }
        informe.diff=_padImportDiff(actual,informe.rows);
        if(informe.problemas.length||(informe.diff.actual&&informe.diff.hayCambios)){_padAskImport(informe);return;}
        if(informe.diff.actual&&!informe.diff.hayCambios){
          showToast('El Excel es igual a lo que ya tenés: no hubo nada que cambiar');
          renderPadronAdmin();return;
        }
        if(st)st.innerHTML='<span style="color:var(--gray)">Guardando '+informe.rows.length+' empresas...</span>';
        savePadron(informe.rows,function(ok){
          if(!ok){renderPadronAdmin();return;}
          showToast('Empresas actualizadas: '+informe.rows.length);
          renderPadronAdmin();
        });
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
    prev.innerHTML='<p style="font-size:.75rem;color:var(--gray);margin:10px 0 6px">'+
        (q?('Coincidencias: '+res.length+(res.length>=25?'+':'')):('Primeras '+res.length+' de '+rows.length))+'</p>'+
      res.map(function(r){
        return '<div class="usr-row" style="align-items:flex-start">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
            '<div style="font-size:.75rem;color:var(--gray);margin-top:2px">'+
              (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+'</div>'+
          '</div>'+
          '<span style="font-size:.75rem;color:var(--gray);white-space:nowrap">'+
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
    '<p style="font-size:.75rem;color:var(--gray);margin-bottom:10px">Los cambios quedan guardados en la nube reci&eacute;n cuando tocas <strong>Guardar cambios</strong>.</p>'+
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
// Con muchas empresas se espera a que deje de tipear (cada pintada son miles de campos).
var _padEditFT=0;
function _padEditFilter(v){
  _padEditQ=v;clearTimeout(_padEditFT);
  if((_padEdit||[]).length<400){_padEditRenderList();return;}
  _padEditFT=setTimeout(_padEditRenderList,150);
}
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
  var op=_padEditOpciones();
  host.innerHTML=
    (_padEditQ?'<p style="font-size:.75rem;color:var(--gray);margin-bottom:6px">Mostrando '+idxs.length+' de '+rows.length+'.</p>':'')+
    idxs.map(function(i){return _padEditRowHtml(_padEdit[i],i,op);}).join('');
}
// Las opciones de los desplegables son las mismas para todas las filas: se arman
// una vez por pintada (con 3.000 empresas se recalculaban 3.000 veces).
function _padEditOpciones(){
  return {cfg:[['','Sin cashback']].concat((typeof CNAMES!=='undefined'?CNAMES:['BAU','Config 1','Config 2','Config 3','Config 4']).map(function(n){return [n,n];})),
    rub:_padRubroOpts().filter(function(o){return _optVigente(o)===o;})};
}
// Mantiene compatibilidad con los llamadores existentes (toggle/agregar/eliminar):
// si el shell ya está armado sólo refresca la lista, sin tocar el filtro en foco.
function renderPadronEditor(){
  if(!document.getElementById('padron-edit-list'))_padEditRenderShell();
  _padEditRenderList();
}
function _padEditRowHtml(r,i,op){
  op=op||_padEditOpciones();
  var cfgOpts=op.cfg;
  var cfgSel='<select onchange="_padEditField('+i+',\'config\',this.value)">'+
    cfgOpts.map(function(o){return '<option value="'+_escAttr(o[0])+'"'+(r.config===o[0]?' selected':'')+'>'+_escHtml(o[1])+'</option>';}).join('')+
    '</select>';
  var nAs=_padNumAsesores(r),open=!!_padEditAsOpen[i];
  // Flyer Rubros: rubro (opción) + topes; los topes sólo se habilitan con rubro
  // sólo los flyers vigentes: elegir uno ya reemplazado no tendría sentido
  var ru=_padRubroSane(r.rubro),rOpts=op.rub;
  var f1=_fgFmtImporte(ru.importe),f2=_fgFmtImporte(ru.importe2);
  var rubSel=!rOpts.length?'':'<select title="Rubro (Flyer Rubros)" onchange="_padEditRubro('+i+',\'opcion\',this.value)">'+
    '<option value="0">Sin rubro</option>'+rOpts.map(function(o){return '<option value="'+o+'"'+(_padOptDeRubro(ru)===o?' selected':'')+'>'+_escHtml(_optLabel(o))+'</option>';}).join('')+'</select>'+
    '<input class="login-inp pad-tope" placeholder="Tope" inputmode="numeric" value="'+_escAttr(f1?f1.slice(1):'')+'"'+(ru.opcion?'':' disabled')+' oninput="_padEditRubro('+i+',\'importe\',this.value)">'+
    '<input class="login-inp pad-tope" placeholder="Tope 2" title="Segundo tope, s&oacute;lo si difiere (cuadro Ambos)" inputmode="numeric" value="'+_escAttr((f2&&f2!==f1)?f2.slice(1):'')+'"'+(ru.opcion?'':' disabled')+' oninput="_padEditRubro('+i+',\'importe2\',this.value)">';
  // Los oficiales se arman sólo desplegados (abrir/cerrar ya repinta la lista):
  // plegados eran 12 campos escondidos por empresa, 36.000 con 3.000 empresas.
  var asHtml=!open?'':r.asesores.map(function(a,n){
    return '<div class="pad-eas-row">'+
      '<input class="login-inp" placeholder="Oficial '+(n+1)+': nombre" value="'+_escAttr(a.nombre)+'" oninput="_padEditAs('+i+','+n+',\'nombre\',this.value)">'+
      '<input class="login-inp" placeholder="Celular" value="'+_escAttr(a.celular)+'" oninput="_padEditAs('+i+','+n+',\'celular\',this.value)">'+
      '<input class="login-inp" placeholder="Email" value="'+_escAttr(a.email)+'" oninput="_padEditAs('+i+','+n+',\'email\',this.value)">'+
    '</div>';
  }).join('');
  return '<div class="pad-erow" data-i="'+i+'">'+
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
    r.rubro.txt=r.rubro.opcion?String(_optLabel(r.rubro.opcion)).slice(0,40):'';
    // habilita/deshabilita los topes de esa fila sin repintar todo (por su
    // número: con el buscador puesto, la fila i no es la i-ésima de la pantalla)
    var row=document.querySelector('#padron-edit-list .pad-erow[data-i="'+i+'"]');
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
    // los desplegables abiertos van por número de fila: los de abajo suben uno
    var ab={};Object.keys(_padEditAsOpen).forEach(function(k){var n=+k;if(n<i)ab[n]=_padEditAsOpen[k];else if(n>i)ab[n-1]=_padEditAsOpen[k];});
    _padEditAsOpen=ab;
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
  host.innerHTML='<p style="font-size:.75rem;color:var(--gray);margin:10px 0 6px">'+
      (t?('Coincidencias: '+res.length):('Mostrando '+res.length))+'</p>'+
    res.map(function(r){
      return '<div class="usr-row" style="align-items:flex-start">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
          '<div style="font-size:.75rem;color:var(--gray);margin-top:2px">'+
            (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+'</div>'+
        '</div>'+
        '<span style="font-size:.75rem;color:var(--gray);white-space:nowrap">'+
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
      '<p id="fg-mp-txt" style="font-size:.75rem;color:var(--gray);line-height:1.45;margin:0 0 8px"></p>'+
      '<button class="btn bgreen" id="fg-mp-btn" style="width:100%" onclick="_mpGenerar()">&#9889; Descargar todos</button>'+
      '<div id="fg-mp-prog" style="display:none;margin-top:8px"><div class="progress-bar" style="display:block"><div class="progress-fill" id="fg-mp-fill" style="width:0%"></div></div><div class="progress-text" id="fg-mp-text"></div></div>'+
      '<p style="font-size:.75rem;color:var(--gray);line-height:1.45;margin:8px 0 0">&iquest;Quer&eacute;s bajar <b style="display:inline;font-size:inherit;text-transform:none;letter-spacing:0;font-weight:700">todas tus empresas</b>, cada una en su formato? And&aacute; a <a href="#" onclick="openMiPadron();return false" style="color:var(--red);font-weight:600">Base de datos &rarr; Generar flyers</a>.</p>'+
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
// Opción con la que se genera esa empresa. Sale de la FILA, no de la pantalla:
//   · con rubro  → el flyer vigente de ese rubro (_padOptDeRubro)
//   · sin rubro  → el armador general: la Opción 1, SIEMPRE.
// Lo segundo antes era "la última opción de Flyer Galicia que hayas mirado", así
// que una descarga masiva salía distinta según dónde estuvieras parado (viniendo
// del MIXTO, las comunes salían en MIXTO). En 180 flyers eso no se nota hasta que
// ya están hechos.
// "Sin cashback" no entra acá: no cambia de flyer, sólo deja los importes vacíos.
// Negativo = tiene rubro pero ese flyer no está habilitado para el perfil (la
// pantalla lo muestra y no deja tildarla); 0 = no hay ninguna opción habilitada.
function _pgOptDe(r){
  var o=_pgOptDeBase(r);
  // sin cashback: su versión "sin cashback", si existe
  if(o>0&&_padCfgOf(r&&r.config)<0){var v=_fgVarianteSinCB(o);if(v)return v;}
  return o;
}
function _pgOptDeBase(r){
  var ru=_padRubroSane(r&&r.rubro);
  var q=_padOptDeRubro(ru);
  if(q)return (_FG_OPTS.indexOf(q)>=0&&_can('opcion_'+q))?q:-q;
  return _optVigenteEntre(_facOptsDe('flyer').filter(function(n){return !(_OPC[n]&&_OPC[n].sinCB);}));
}
function _pgFormatoLbl(opt){return opt>0?(_solapaLabel(_optSolapa(opt))+' · '+_optLabel(opt)):'sin formato disponible';}
function _pgAvisos(r,opt){
  var a=[];
  // opt<0: tiene rubro pero no se puede generar. Dos motivos muy distintos, y el
  // segundo no se puede confundir con el primero: si el flyer ya no existe,
  // _optLabel caería en la Opción 1 y el aviso diría cualquier cosa.
  if(opt<0)a.push(_FG_OPTS.indexOf(-opt)>=0
    ? ('rubro «'+_optLabel(-opt)+'» no habilitado para tu perfil')
    : 'el flyer de su rubro ya no está: revisá el rubro de esta empresa');
  else if(!opt)a.push('sin opción habilitada');
  if(!_padNumAsesores(r))a.push('sin oficiales');
  if(_padCfgOf(r.config)<0)a.push('sin cashback');
  if(opt>0&&_optSolapa(opt)==='rubros'&&!_padRubroSane(r.rubro).importe)a.push('sin tope (se usa el del formulario o $24.000)');
  return a;
}
function _pgFiltrados(){
  if(!_padron)return [];
  if(!_pgQ)return _padron.map(function(_,i){return i;});
  // de fila a número con un mapa (indexOf por cada fila recorría el padrón entero)
  var pos=new Map();_padron.forEach(function(r,i){pos.set(r,i);});
  return padronSearch(_pgQ,100000).map(function(r){return pos.has(r)?pos.get(r):-1;}).filter(function(i){return i>=0;});
}
function _pgCount(){var n=0;for(var k in _pgSel)if(_pgSel[k]&&_padron&&_padron[k])n++;return n;}
function _pgRender(){
  var pg=document.getElementById('padron-gen');if(!pg||!_pgOpen)return;
  if(!_padron||!_padron.length){pg.innerHTML='<p style="font-size:.78rem;color:var(--gray)">Todav&iacute;a no cargaste empresas.</p>';return;}
  if(!document.getElementById('pg-list')){
    pg.innerHTML=
      '<p style="font-size:.76rem;color:var(--gray);line-height:1.5;margin-bottom:10px">Tild&aacute; las empresas (o &laquo;Todas&raquo;) y gener&aacute; el ZIP: cada flyer sale en <strong>su formato</strong> seg&uacute;n el rubro que tenga cargado, con sus oficiales, cashback y topes. Al lado de cada empresa ves con qu&eacute; formato va a salir.</p>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'+
        '<input type="text" id="pg-q" class="login-inp" placeholder="Filtrar por raz&oacute;n social o CUIT..." autocomplete="off" style="margin-bottom:0;flex:1;min-width:180px" oninput="_pgFiltrar(this.value)">'+
        '<button type="button" class="usr-btn edit" onclick="_pgTodas(true)">Todas</button>'+
        '<button type="button" class="usr-btn edit" onclick="_pgTodas(false)">Ninguna</button>'+
        '<select id="pg-fmt" class="login-inp" style="margin-bottom:0;width:auto;padding:6px 8px"><option value="pdf">PDF</option><option value="png">PNG</option></select>'+
        '<button type="button" class="btn-submit" id="pg-btn" style="padding:8px 16px" onclick="_pgGenerar()">&#9889; Generar ZIP</button>'+
      '</div>'+
      '<div id="pg-count" style="font-size:.75rem;color:var(--gray);margin-bottom:6px"></div>'+
      '<div id="pg-prog" style="display:none;margin:6px 0 10px"><div class="progress-bar" style="display:block"><div class="progress-fill" id="pg-fill" style="width:0%"></div></div><div class="progress-text" id="pg-text"></div></div>'+
      '<div id="pg-list"></div>';
    var q=document.getElementById('pg-q');if(q)q.value=_pgQ;
  }
  var idx=_pgFiltrados(),host=document.getElementById('pg-list');
  _pgContar(idx);
  if(!idx.length){host.innerHTML='<p style="font-size:.78rem;color:var(--gray);margin-top:10px">Sin resultados para "'+_escHtml(_pgQ)+'".</p>';return;}
  host.innerHTML=idx.map(function(i){
    var r=_padron[i],opt=_pgOptDe(r),av=_pgAvisos(r,opt);
    var lbl=_pgFormatoLbl(opt),rub=_padRubroLabel(r);
    return '<label class="usr-row" style="align-items:flex-start;cursor:pointer;gap:10px">'+
      '<input type="checkbox" style="margin-top:3px;width:auto"'+(_pgSel[i]?' checked':'')+(opt>0?'':' disabled')+' onchange="_pgSet('+i+',this.checked)">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:600;font-size:.82rem">'+_escHtml(r.empresa||'(sin razón social)')+'</div>'+
        '<div style="font-size:.75rem;color:var(--gray);margin-top:2px">'+
          (r.cuits.length?_escHtml(r.cuits.map(_padFmtCuit).join('  ·  ')):'sin CUIT')+
          ' &nbsp;·&nbsp; '+_escHtml(_padCfgName(_padCfgOf(r.config)))+' &nbsp;·&nbsp; '+_escHtml(_padAsesoresLbl(r))+
          (rub?' &nbsp;·&nbsp; <span style="color:#b26a00">'+_escHtml(rub)+'</span>':'')+
        '</div>'+
        (av.length?'<div style="font-size:.75rem;color:#b06000;margin-top:2px">&#9888; '+_escHtml(av.join(' · '))+'</div>':'')+
      '</div>'+
      '<span style="font-size:.75rem;white-space:nowrap;padding:3px 8px;border-radius:12px;background:'+(opt>0?(_optSolapa(opt)==='rubros'?'#fff3e0':'#eef3fb'):'#f3f3f3')+';color:'+(opt>0?(_optSolapa(opt)==='rubros'?'#b26a00':'#1d4070'):'#999')+'">'+_escHtml(lbl)+'</span>'+
    '</label>';
  }).join('');
}
// Mismo criterio que el buscador del editor: con muchas empresas, al dejar de tipear.
var _pgFT=0;
function _pgFiltrar(v){
  _pgQ=v;clearTimeout(_pgFT);
  if(!_padron||_padron.length<400){_pgRender();return;}
  _pgFT=setTimeout(_pgRender,150);
}
function _pgContar(idx){
  var sel=_pgCount(),vis=idx.filter(function(i){return _pgSel[i];}).length;
  var cnt=document.getElementById('pg-count');
  if(cnt)cnt.innerHTML='<strong>'+sel+'</strong> de '+_padron.length+' empresa'+(_padron.length!==1?'s':'')+' seleccionada'+(sel!==1?'s':'')+(_pgQ?(' &middot; mostrando '+idx.length+' ('+vis+' tildada'+(vis!==1?'s':'')+')'):'');
}
// Tildar una sola: el tilde ya lo puso el navegador, sólo cambia el contador
// (antes se volvía a pintar la lista entera en cada tilde).
function _pgSet(i,on){if(on)_pgSel[i]=true;else delete _pgSel[i];if(document.getElementById('pg-list'))_pgContar(_pgFiltrados());else _pgRender();}
function _pgTodas(on){
  _pgFiltrados().forEach(function(i){if(on&&_pgOptDe(_padron[i])>0)_pgSel[i]=true;else if(!on)delete _pgSel[i];});
  _pgRender();
}
// Valores del flyer de una fila del padrón (mismo contrato v que el masivo).
function _pgVals(r,opt,legal,impForm,res){
  var ci=_padCfgOf(r.config),cfg=CONFIGS[ci<0?0:ci]||{};
  var v={empresa:r.empresa||'',nocb:ci<0,m1:cfg.m1,m2:cfg.m2,m3:cfg.m3,m4:cfg.m4,legal:legal,
    cashUnico:!!_solCfg(_optSolapa(opt)).cashUnico}; // la solapa sale de la opción, no de la vista
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
// resolver: opcional, qué función decide el flyer de cada fila (default
// _pgOptDe, el del dueño del padrón). El Hunter le pasa _hunOptDe —mismo
// motor, pero ESE resolutor sólo elige opciones que de verdad tienen flyer
// cargado— así no reaparece el problema del flyer viejo con otro resolutor.
function _pgGenerarRows(rows,fmt,ui,zipBase,resolver){
  if(_pgBusy||!rows||!rows.length)return;
  var optDe=resolver||_pgOptDe;
  var grupos={},orden=[],res={total:0,fmt:fmt,fecha:new Date(),porOpt:{},sinOf:[],sinCB:[],sinTope:[],omitidas:[],errores:[],carpetas:{}};
  rows.forEach(function(r){var o=optDe(r);if(o<=0){res.omitidas.push(r.empresa+(o<0?' (rubro '+_optLabel(-o)+' no habilitado)':' (sin opción habilitada)'));return;}if(!grupos[o]){grupos[o]=[];orden.push(o);}grupos[o].push(r);});
  if(!orden.length){showToast('Ninguna de las empresas tildadas se puede generar con tu perfil');return;}
  // Última parada antes de generar: en qué flyer cae cada empresa. Con 180 flyers,
  // descubrir un desvío después es rehacer todo (y mandar flyers equivocados).
  var _detalle=orden.map(function(o){return '• '+grupos[o].length+' en '+_pgFormatoLbl(o);}).join('\n');
  var _fuera=res.omitidas.length?('\n\n'+res.omitidas.length+' quedan afuera:\n• '+res.omitidas.slice(0,4).join('\n• ')+(res.omitidas.length>4?'\n• …':'')):'';
  fgConfirm('',{titulo:'Revisá antes de generar',
    texto:'Se van a generar '+(rows.length-res.omitidas.length)+' flyers:\n'+_detalle+_fuera,
    ok:'Generar',cancelar:'Volver',peligro:false},function(si){if(si)_pgArrancar();});
  function _pgArrancar(){
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
        if(k>=lista.length){_fgCeder(grupo);return;}
        var r=lista[k++];
        if(txt)txt.textContent='Generando '+(hecho+1)+' de '+n+' — '+_pgFormatoLbl(opt)+': '+(r.empresa||'');
        try{
          var v=_pgVals(r,opt,legal,impForm,res),fc=fullRes(v);
          var base='Flyer '+_fgSafeName(v.empresa||'empresa'),nom=base;
          usados[base]=(usados[base]||0)+1;if(usados[base]>1)nom=base+' ('+usados[base]+')';
          if(fmt==='png')zip.file(carpeta+'/'+nom+'.png',fc.toDataURL('image/png').split(',')[1],{base64:true});
          else zip.file(carpeta+'/'+nom+'.pdf',_fgPdfDe(fc).output('arraybuffer'));
          res.total++;res.porOpt[opt]=(res.porOpt[opt]||0)+1;
        }catch(e){res.errores.push((r.empresa||'?')+': '+((e&&e.message)||e));}
        hecho++;if(fill)fill.style.width=Math.round(hecho/n*100)+'%';
        _fgCeder(uno);
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
      _fgBajarBlob(content,res.zip);
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
  } // _pgArrancar
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
    '<table style="width:100%;border-collapse:collapse;font-size:.8rem;margin:8px 0"><thead><tr style="color:var(--gray);font-size:.6875rem;text-transform:uppercase"><th style="text-align:left;padding:4px 0">Formato</th><th style="text-align:right;padding:4px 0">Cantidad</th><th style="text-align:left;padding:4px 8px">Carpeta</th></tr></thead><tbody>'+filas+'</tbody></table>'+
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
      '.pad-sub{display:block;font-size:.75rem;color:var(--gray,#888);margin-top:2px}'+
      '.pad-empty{padding:16px 12px;font-size:.76rem;color:var(--gray,#888);text-align:center;line-height:1.5}'+
      '.pad-more{padding:7px 12px;font-size:.75rem;color:var(--gray,#888);text-align:center;'+
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
    '#pad-mine .pm-tabs .stab{font-size:.75rem;padding:7px 16px;border:1.5px solid var(--border,#e2e2e2);'+
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
    '.pad-head .pad-adm{font-size:.75rem;font-weight:700;text-transform:none;letter-spacing:0;cursor:pointer;'+
      'color:var(--red,#c62828);margin-left:auto;margin-right:10px}'+
    '.pad-head .pad-adm:hover{text-decoration:underline}'+
    '.pad-empty .usr-btn{margin-top:10px}';
  document.head.appendChild(st);
}
// Qué paneles puede ver AHORA: la facultad se revalida en cada llamada, porque el
// admin puede quitarla en caliente o estar en vista previa de otro perfil.
function _bdPanes(){
  var p=[];
  if(_can('padron_buscar'))p.push({id:'empresas',blk:'at-varios',lbl:'Mis empresas',render:function(){renderPadronAdmin(true);}});
  if(_can('asesores_guardados'))p.push({id:'asesores',blk:'at-asesores',lbl:'Mis asesores',render:function(){renderAsesoresAdmin(false);}});
  // "Cambios pendientes": se ve si tiene empresas propias (es candidato a
  // recibir propuestas) o si YA tiene algo para resolver (el caso del
  // suplente, que puede no tener padrón propio).
  if(_can('padron_buscar')||_propPendCount>0)
    p.push({id:'propuestas',blk:'at-propuestas',
      lbl:'Cambios pendientes'+(_propPendCount?(' ('+_propPendCount+')'):''),
      render:function(){_propRenderPendientes();}});
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
  var def=_bdPanes().filter(function(p){return p.id===pane;})[0];
  var wanted=def?def.blk:'at-varios';
  document.querySelectorAll('#pad-mine .pm-body .bd-pane').forEach(function(el){
    el.classList.toggle('bd-on',el.id===wanted);
  });
  _bdRenderTabs();
  if(def&&def.render)def.render();
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
  // otra empresa: los logos vuelven a como vienen en el flyer, salvo dentro de un
  // borrador o un diseño de Estudio (ahí los cambios son el trabajo en curso)
  if(!_fgProtoActivo())_fgLgLimpiar();
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
  // Traer una empresa SIEMPRE la trae con sus oficiales: el interruptor "Mostrar en el
  // flyer" vale para el flyer que se está armando, no queda trabado para la próxima.
  fgSetOficiales(true);
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
  _padRef=r;_padDismissed='';_padRubroDismissed='';   // desde acá se vigilan los cambios contra el padrón
  _padShowNote(tiene?'':'Esta empresa no tiene oficiales asignados.');
  closePadronPop();_padCloseSug();
  // los asesores acaban de completarse desde el padrón: el cuadro de pegado
  // abierto ya no aporta nada y tapa el formulario
  if(typeof _fgClosePasteAll==='function')_fgClosePasteAll();
  if(typeof updateFnPreview==='function')updateFnPreview();
  if(typeof redraw==='function')redraw();
  showToast('"'+(r.empresa||'Empresa')+'" cargada de tus empresas — '+_padAsesoresLbl(r));
  // Con una versión "sin cashback" publicada, el flyer se elige solo: empresa sin
  // cashback → esa versión; con cashback → la original. No dentro de un borrador
  // ni con un recorte puesto (ahí manda lo que se está armando).
  var cur=_optN(_fgOpt),libre=!_fgProtoActivo()&&!_fgRecActivo(),destino=0;
  if(libre&&_ci<0)destino=_fgVarianteSinCB(_fgOptBase(cur));
  else if(libre&&_ci>=0&&_OPC[cur]&&_OPC[cur].sinCB){var ob=_fgOptBase(cur);if(ob!==cur&&_can('opcion_'+ob))destino=ob;}
  if(destino&&destino!==cur){
    var nomE=r.empresa||'La empresa';
    setTimeout(function(){
      switchFlyerOption(destino,function(){
        showToast(_ci<0?(nomE+' no tiene cashback: se usa «'+_optLabel(destino)+'».'):(nomE+' tiene cashback: se usa «'+_optLabel(destino)+'».'));
        setTimeout(function(){_padCheckRubro(r,'padron');},150);
      });
    },120);
  }
  else if(_ci<0&&!_fgSinImportes())setTimeout(function(){_padAvisoSinCB(r);},120); // que no pase desapercibido
  else if(_ci<0)setTimeout(function(){_padCheckRubro(r,'padron');},120); // ya es un flyer sin importes
  else if(_fgSinImportes())setTimeout(function(){_padAvisoSinImportes(r,function(){_padCheckRubro(r,'padron');});},120);
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
// cargado. Nunca bloquea.
// origen: 'padron' (al elegir la empresa) | 'descarga' (antes de bajar el
// flyer; cont = qué hacer si igual quiere descargar). Devuelve true si mostró
// el aviso (la descarga espera al botón).
// "Seguir acá" se recuerda por empresa+opción SÓLO para la descarga, para no
// preguntar de nuevo si bajás PDF, PNG y Compartir uno atrás del otro. Al traer
// la empresa del padrón el aviso sale SIEMPRE (y _padApply borra lo recordado,
// así la descarga vuelve a tener su red de seguridad).
var _padRubroDismissed='';
function _padCheckRubro(r,origen,cont){
  try{
    if(!r||!_can('padron_buscar'))return false;
    var ru=_padRubroSane(r.rubro),act=_optN(_fgOpt),enRubros=(_fgVista==='rubros');
    var vig=_padOptDeRubro(ru);
    var quiere=vig&&_FG_OPTS.indexOf(vig)>=0&&_can('opcion_'+vig)?vig:0;
    if(quiere===act||(quiere&&quiere===_fgOptBase(act)))return false; // la versión sin cashback es "la misma"
    if(!quiere&&!enRubros)return false; // sin rubro en Flyer Galicia: todo bien
    var firma=_padNorm(r.empresa)+'|'+quiere+'|'+act;
    if(origen!=='padron'&&firma===_padRubroDismissed)return false;
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
// La empresa SÍ tiene cashback pero el flyer en pantalla no muestra importes
// (se recortó esa parte, o es una opción "sin cashback" publicada desde Estudio).
// Ofrece volver a mostrarlos; después sigue con el aviso de rubro (despues()).
function _padAvisoSinImportes(r,despues){
  var nom='<b>'+_escHtml(r.empresa||'Esta empresa')+'</b>';
  var orig=_fgCfg().recDe||0,puede=_fgRecActivo()||(orig&&_FG_OPTS.indexOf(orig)>=0&&_can('opcion_'+orig));
  if(!puede){
    _padModal('<h3>&#9888; Esta empresa tiene cashback</h3>'+
      '<p class="pu-sub">'+nom+' tiene cashback, pero <strong>este flyer no muestra importes</strong>.</p>'+
      '<p class="pu-sub">Si le corresponde mostrarlos, eleg&iacute; arriba el flyer original (el que tiene la parte de los importes).</p>'+
      '<div class="pu-foot"><button class="pu-si" onclick="_padCloseUpdate(0)">Entendido</button></div>');
    return;
  }
  var dlg=fgConfirm('',{titulo:'Esta empresa tiene cashback',peligro:false,ok:'Mostrar los importes',cancelar:'Seguir así',
    texto:' '},function(si){
      if(si){
        if(_fgRecActivo())fgRecQuitar();
        else fgOptElegir(orig);
        showToast('Listo: el flyer vuelve a mostrar los importes de '+(r.empresa||'la empresa')+'.');
      }
      if(typeof despues==='function')setTimeout(despues,150);
    });
  // el cuerpo lleva el nombre en negrita (fgConfirm escribe texto plano)
  var b=document.getElementById('fg-cf-b');
  if(b)b.innerHTML=nom+' tiene cashback, pero este flyer no muestra importes'+(_fgRecActivo()?' (se quit&oacute; esa parte)':'')+'. &iquest;Quer&eacute;s mostrarlos?';
  return dlg;
}
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
// (no se dibuja en el flyer, así que para el padrón es "no asignado"). Con el
// interruptor "Mostrar en el flyer" apagado TODOS cuentan como vacíos: ocultar es
// una modificación (pedido del dueño) y se avisa igual que si los hubiera quitado.
function _padFormAsesores(){
  var out=[];
  for(var n=1;n<=4;n++){
    var sfx=(n===1)?'':String(n);
    var on=_fgOficialesOn&&_fgAsesorOn(n),nom=on?(_gv('nombre'+sfx)||'').trim():'';
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
    if(!c.nombre){chg.push('<span class="pu-quita">'+lbl+': <strong>&minus; '+_escHtml(o.nombre)+'</strong> (se quita)</span>');continue;}
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
    '#fg-pad-note{display:none;margin-top:6px;font-size:.75rem;line-height:1.4;color:#b06000;'+
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
    '#pad-upd .pu-lbl{display:block;font-size:.6875rem;font-weight:700;text-transform:uppercase;'+
      'letter-spacing:.04em;color:var(--gray,#888);margin-bottom:5px}'+
    '#pad-upd input{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#ddd);border-radius:8px;'+
      'padding:9px 11px;font-size:.82rem;font-family:inherit;background:none;color:inherit;outline:none}'+
    '#pad-upd input:focus{border-color:var(--red,#c62828)}'+
    'html.dark #pad-upd input{border-color:#3a3e46}'+
    '#pad-upd .pu-hint{font-size:.75rem;line-height:1.45;color:var(--gray,#888);margin:6px 0 0}'+
    '#pad-upd .pu-warn{font-size:.75rem;line-height:1.45;color:#b06000;margin:6px 0 0}'+
    '#pad-upd .pu-foot{display:flex;gap:8px;justify-content:flex-end;padding:14px 18px 16px}'+
    '#pad-upd button{border:none;border-radius:8px;padding:9px 15px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}'+
    '#pad-upd .pu-no{background:rgba(128,128,128,.16);color:inherit}'+
    '#pad-upd .pu-si{background:var(--red,#c62828);color:#fff}'+
    // freno del Excel: resumen de lo que cambia antes de reemplazar
    '#pad-upd .pu-dif{margin:12px 18px 4px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}'+
    '#pad-upd .pu-dif div{border-radius:8px;padding:7px 4px;text-align:center;background:rgba(128,128,128,.1);font-size:.75rem;line-height:1.3}'+
    '#pad-upd .pu-dif b{display:block;font-size:1.05rem}'+
    '#pad-upd .pu-dif .pu-van{background:var(--danger-soft,#FDE3E3);color:var(--danger,#B3261E)}'+
    '#pad-upd details{margin:6px 18px 0;font-size:.75rem}'+
    '#pad-upd summary{cursor:pointer;font-weight:600;padding:3px 0}'+
    '#pad-upd details p{margin:4px 0 2px 14px;line-height:1.5;color:var(--gray,#888)}'+
    '#pad-upd .pu-quita{color:var(--danger,#B3261E)}'+
    '#pad-upd .pu-alerta{margin:10px 18px 0;padding:8px 10px;border-radius:8px;font-size:.75rem;line-height:1.45;'+
      'background:var(--danger-soft,#FDE3E3);color:var(--danger,#B3261E)}'+
    '@media (max-width:420px){#pad-upd .pu-dif{grid-template-columns:repeat(2,1fr)}}';
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
    // Oficiales ocultos con "Mostrar en el flyer": que quede claro, en rojo y antes
    // de la lista, que actualizar deja la empresa guardada SIN oficiales.
    ((!_fgOficialesOn&&_padNumAsesores(d.row))?'<div class="pu-alerta">Ocultaste los oficiales: si actualiz&aacute;s, '+
      '<strong>esta empresa queda guardada sin sus oficiales</strong>. Si s&oacute;lo quer&iacute;as este flyer sin ellos, '+
      'eleg&iacute; &laquo;No, dejarlo como est&aacute;&raquo;.</div>':'')+
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
  // si no se puede guardar, la empresa vuelve a como estaba (como en _padDoNew):
  // si no, el cambio quedaba en memoria y se subía en el próximo guardado
  var antes={config:d.row.config,asesores:d.row.asesores,rubro:d.row.rubro,cuits:d.row.cuits};
  d.row.config=d.config;   // la razón social NO se toca nunca
  d.row.asesores=d.asesores.map(function(a){return {nombre:a.nombre,celular:a.celular,email:a.email};});
  if(d.rubro)d.row.rubro=_padRubroSane(d.rubro);
  if(el)d.row.cuits=_padCuits(el.value); // el CUIT se puede completar acá mismo
  savePadron(_padron,function(ok){
    _padCloseUpdate(0);
    if(!ok){
      for(var k in antes){if(antes[k]===undefined)delete d.row[k];else d.row[k]=antes[k];}
      return;
    }
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

// ── FRENO DEL EXCEL: qué cambia antes de reemplazar ─────────────────────────
// Subir un Excel REEMPLAZA todas las empresas, y la base no tiene copias de
// seguridad: una copia vieja o una hoja filtrada borraba empresas sin avisar.
// Ahora se compara contra lo guardado y se muestra el resumen antes de pisar.
// La razón social es la clave (no el CUIT: dos grupos pueden compartirlo).
function _padImpKey(r){return _padNorm(r&&r.empresa)||('#cuit:'+((r&&r.cuits)||[]).join(','));}
function _padImpLbl(r){
  return (r&&r.empresa)||('(sin razón social) '+((r&&r.cuits)||[]).map(_padFmtCuit).join(', '));
}
// Qué cambió entre dos versiones de la misma empresa (vacío = igual).
function _padImpCambios(a,b){
  var que=[];
  var ca=(a.cuits||[]).slice().sort().join(','),cb=(b.cuits||[]).slice().sort().join(',');
  if(ca!==cb)que.push('CUIT');
  if(_padCfgOf(a.config)!==_padCfgOf(b.config))que.push('cashback');
  for(var n=0;n<4;n++){
    var x=(a.asesores&&a.asesores[n])||{},y=(b.asesores&&b.asesores[n])||{};
    if(String(x.nombre||'').trim()!==String(y.nombre||'').trim()||
       String(x.celular||'').trim()!==String(y.celular||'').trim()||
       String(x.email||'').trim().toLowerCase()!==String(y.email||'').trim().toLowerCase())que.push('oficial '+(n+1));
  }
  if(!_padRubroIgual(a.rubro,b.rubro))que.push('rubro');
  return que;
}
function _padImportDiff(actual,nuevas){
  var A={},N={},kA=[],kN=[];
  (actual||[]).forEach(function(r){var k=_padImpKey(r);if(!A[k]){A[k]=[];kA.push(k);}A[k].push(r);});
  (nuevas||[]).forEach(function(r){var k=_padImpKey(r);if(!N[k]){N[k]=[];kN.push(k);}N[k].push(r);});
  var d={se_van:[],entran:[],cambian:[],iguales:0,actual:(actual||[]).length,nuevas:(nuevas||[]).length};
  kA.forEach(function(k){if(!N[k])A[k].forEach(function(r){d.se_van.push(_padImpLbl(r));});});
  kN.forEach(function(k){
    if(!A[k]){N[k].forEach(function(r){d.entran.push(_padImpLbl(r));});return;}
    var a=A[k],b=N[k];
    // Razón social repetida: si cambia cuántas veces figura, lo digo tal cual
    // en vez de inventar qué fila "cambió" contra cuál.
    if(a.length!==b.length){
      d.cambian.push({empresa:_padImpLbl(b[0]),que:['figura '+b.length+' veces (antes '+a.length+')']});return;
    }
    for(var i=0;i<b.length;i++){
      var que=_padImpCambios(a[i],b[i]);
      if(que.length)d.cambian.push({empresa:_padImpLbl(b[i]),que:que});else d.iguales++;
    }
  });
  d.hayCambios=!!(d.se_van.length||d.entran.length||d.cambian.length);
  return d;
}
function _padImportResumen(d){
  function lista(arr,f){
    var n=Math.min(arr.length,10),out=[];
    for(var i=0;i<n;i++)out.push(f(arr[i]));
    if(arr.length>n)out.push('y '+(arr.length-n)+' m&aacute;s');
    return out.join('<br>');
  }
  function det(tit,arr,f,abierto){
    return arr.length?('<details'+(abierto?' open':'')+'><summary>'+tit+' ('+arr.length+')</summary><p>'+lista(arr,f)+'</p></details>'):'';
  }
  var esc=function(s){return _escHtml(s);};
  var pct=d.actual?d.se_van.length/d.actual:0;
  return '<p class="pu-sub">Hoy ten&eacute;s <strong>'+d.actual+' empresa'+(d.actual===1?'':'s')+'</strong>. '+
      'Este Excel trae <strong>'+d.nuevas+'</strong> y <strong>reemplaza todo</strong> lo que ten&eacute;s guardado:</p>'+
    '<div class="pu-dif">'+
      '<div class="'+(d.se_van.length?'pu-van':'')+'"><b>'+d.se_van.length+'</b>se van</div>'+
      '<div><b>'+d.entran.length+'</b>entran</div>'+
      '<div><b>'+d.cambian.length+'</b>cambian</div>'+
      '<div><b>'+d.iguales+'</b>sin cambios</div>'+
    '</div>'+
    (pct>0.2?('<div class="pu-alerta">&#9888; <strong>Se borra'+(d.se_van.length>1?'n ':' ')+d.se_van.length+' de tus '+d.actual+' empresas.</strong> '+
      '&iquest;Es el Excel correcto? Puede ser una copia vieja o una hoja filtrada.</div>'):'')+
    det('Se van',d.se_van,esc,pct>0.2||d.se_van.length<=5)+
    det('Entran',d.entran,esc,false)+
    det('Cambian',d.cambian,function(c){return esc(c.empresa)+' &mdash; '+esc(c.que.join(', '));},false);
}

// ── Popup del informe de importación ────────────────────────────────────────
// rep.diff (si viene) = comparación con lo guardado; rep.problemas = avisos del
// formato. Un solo cartel con las dos cosas.
var _padImportPend=null;
function _padAskImport(rep){
  _padImportPend=rep;
  _padPending=null;
  var graves=rep.graves>0,d=rep.diff,hayDif=!!(d&&d.actual);
  var tit=graves?'&#9888; Revis&aacute; el Excel':(hayDif?'&#128194; Antes de reemplazar tus empresas':'&#8505; Informe de la carga');
  _padModal('<h3>'+tit+'</h3>'+
    (hayDif?_padImportResumen(d):'')+
    (rep.problemas.length?(
      '<p class="pu-sub"'+(hayDif?' style="margin-top:14px"':'')+'>'+
        (hayDif?'Adem&aacute;s, ':'')+(hayDif?'le&iacute;':'Le&iacute;')+' <strong>'+rep.rows.length+' empresa'+(rep.rows.length===1?'':'s')+'</strong>'+
        (graves?', pero hay cosas que conviene corregir antes de guardar:':', con estas observaciones:')+'</p>'+
      '<ul><li>'+rep.problemas.map(function(p){return p.txt;}).join('</li><li>')+'</li></ul>'):'')+
    '<p class="pu-sub"'+(rep.problemas.length?'':' style="margin-top:12px"')+'>Si cancel&aacute;s, tus empresas quedan como estaban'+
      (rep.problemas.length?' y pod&eacute;s corregir el Excel y volver a subirlo':'')+'.</p>'+
    '<div class="pu-foot">'+
      '<button class="pu-no" onclick="_padImportCancel()">Cancelar</button>'+
      '<button class="pu-si" onclick="_padImportGo()">'+(hayDif?'Reemplazar':'Guardar igual')+' ('+rep.rows.length+')</button>'+
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
    st.textContent='#fg-nocb{display:none;margin:0 0 10px;font-size:.75rem;line-height:1.45;color:#b06000;'+
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
  _fgMarcarMontoFlyer(); // sin cashback no hay importe que marcar
  if(typeof redraw==='function')redraw();
}
// En las solapas de monto único el flyer imprime UN solo importe (el más alto de
// la config), así que se marca cuál es en el cuadro "Montos activos": si no, el
// asesor ve cuatro números y uno solo en el flyer, y no sabe de dónde salió. En
// las otras solapas salen los cuatro y no se marca ninguno.
function _fgMarcarMontoFlyer(){
  var uni=(typeof _fgVista!=='undefined')&&!!_solCfg(_fgVista).cashUnico;
  var noCB=(typeof _fgNoCB!=='undefined')&&_fgNoCB;
  var ids=['d1','d2','d3','d4'],best=-1,bd=0;
  if(uni&&!noCB)ids.forEach(function(id,i){
    var e=document.getElementById(id),d=e?_fgMontoDig(e.textContent):0;
    if(d>bd){bd=d;best=i;}
  });
  ids.forEach(function(id,i){
    var e=document.getElementById(id),row=e&&e.parentNode;if(!row||!row.classList)return;
    row.classList.toggle('cfg-row-flyer',i===best);
    row.title=(i===best)?'Es el importe que sale impreso en este flyer':'';
  });
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
  _fgMarcarMontoFlyer();
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
      'font-size:.75rem;font-weight:700;text-transform:none;letter-spacing:0;'+
      'color:var(--gray,#888);background:rgba(128,128,128,.12);border:1px solid transparent;'+
      'border-radius:999px;padding:2px 8px;cursor:pointer;transition:.15s;vertical-align:middle}'+
    '.fg-paste-btn:hover{color:var(--red,#c62828);background:rgba(198,40,40,.1)}'+
    '.fg-paste-btn.on{color:#fff;background:var(--red,#c62828)}'+
    '.fg-paste-wrap{margin:2px 0 10px;padding:8px 9px;border:1.5px dashed rgba(128,128,128,.4);'+
      'border-radius:8px;background:rgba(128,128,128,.05)}'+
    '.fg-paste-hint{font-size:.75rem;color:var(--gray,#888);line-height:1.4;margin-bottom:6px}'+
    '.fg-paste-ta{width:100%;box-sizing:border-box;min-height:52px;padding:7px 9px;'+
      'border:1.5px solid var(--border,#ddd);border-radius:7px;font-family:"DM Sans",sans-serif;'+
      'font-size:.78rem;background:var(--light,#fafafa);outline:none;resize:vertical;'+
      'color:inherit;transition:border-color .2s}'+
    '.fg-paste-ta:focus{border-color:var(--red,#c62828);background:#fff}'+
    '.fg-paste-res{margin-top:7px;font-size:.75rem;line-height:1.5}'+
    '.fg-paste-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:3px}'+
    '.fg-paste-chip{padding:1px 7px;border-radius:999px;background:rgba(128,128,128,.14);'+
      'color:var(--gray,#888);font-weight:600}'+
    '.fg-paste-chip.ok{background:rgba(46,125,50,.14);color:#2e7d32}'+
    '.fg-paste-lines{color:var(--gray,#777);margin-bottom:2px}'+
    '.fg-paste-ign{color:var(--gray,#999);font-style:italic;margin-bottom:2px}'+
    '.fg-paste-warn{color:#b06000}'+
    '.fg-paste-undone{color:var(--gray,#888)}'+
    '.fg-paste-undo{margin-top:2px;border:none;background:none;color:var(--gray,#888);'+
      'text-decoration:underline;font-size:.75rem;cursor:pointer;padding:0}'+
    '.fg-paste-undo:hover{color:var(--red,#c62828)}';
  document.head.appendChild(st);
}
// Inyecta el botón "⚡ Pegar" en el título de cada asesor y el panel dentro de
// su bloque de campos (así se muestra/oculta solo junto con el bloque). Sólo
// para ADMIN; idempotente (dataset.fgPaste evita duplicar si se llama de nuevo.
function _fgEnsurePasteBtns(){
  if(!_can('pegar_oficial'))return;
  _fgPasteStyle();
  for(var n=1;n<=8;n++){ // 5-8 sólo existen con el modo "oficiales por sede" prendido
    var b=_fgBlock(n);if(!b||b.sec.dataset.fgPaste)continue;
    var box=_fgSecActs(n);if(!box)continue; // va en la misma cajita que el Borrar/Quitar
    b.sec.dataset.fgPaste='1';
    box.insertAdjacentHTML('beforeend',
      '<span class="fg-paste-btn" id="fg-paste-btn-'+n+'" role="button" tabindex="0" '+
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
  for(var n=1;n<=8;n++)if(_fgClosePaste(n))hubo=true;
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
    '#fg-tour-tip .ft-cap{font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;'+
      'border-radius:20px;background:rgba(128,128,128,.14);color:var(--gray,#777);cursor:pointer;user-select:none}'+
    '#fg-tour-tip .ft-cap.on{background:var(--red,#e30613);color:#fff}'+
    '#fg-tour-tip .ft-cap:hover:not(.on){background:rgba(128,128,128,.26)}'+
    '#fg-tour-tip h4{margin:0 0 6px;font-family:"Syne",sans-serif;font-size:.98rem;font-weight:800;line-height:1.25}'+
    '#fg-tour-tip p{margin:0;font-size:.8rem;line-height:1.55;color:#333}'+
    'html.dark #fg-tour-tip p{color:#cfd2d8}'+
    '#fg-tour-tip .ft-foot{display:flex;align-items:center;gap:6px;margin-top:12px;flex-wrap:wrap}'+
    '#fg-tour-tip .ft-n{font-size:.75rem;color:var(--gray,#888);margin-right:auto}'+
    '#fg-tour-tip .ft-btn{border:none;border-radius:8px;padding:7px 11px;font-family:"Syne",sans-serif;font-size:.75rem;'+
      'font-weight:700;cursor:pointer;background:rgba(128,128,128,.14);color:inherit;transition:.15s}'+
    '#fg-tour-tip .ft-btn:hover{background:rgba(128,128,128,.28)}'+
    '#fg-tour-tip .ft-btn.main{background:var(--red,#e30613);color:#fff}'+
    '#fg-tour-tip .ft-btn.main:hover{background:#b8000f}'+
    '#fg-tour-tip .ft-btn:disabled{opacity:.4;cursor:default}'+
    '#fg-tour-tip .ft-x{position:absolute;top:8px;right:10px;font-size:.85rem;color:var(--gray,#888);cursor:pointer;padding:2px 5px}'+
    '#fg-tour-tip .ft-x:hover{color:var(--red,#e30613)}'+
    '#fg-tour-tip .ft-skip{font-size:.75rem;color:var(--gray,#888);cursor:pointer;text-decoration:underline;margin-left:4px}'+
    '#fg-tour-tip kbd{font-family:inherit;font-size:.75rem;background:rgba(128,128,128,.16);border-radius:4px;padding:1px 5px}';
  document.head.appendChild(st);
}
// Capítulos y pasos. target: selector o función → elemento. cond: si aplica al
// perfil. antes: deja la pantalla lista para que el elemento sea visible.
function _tourCapitulos(){
  var puedePad=_can('padron_buscar'),puedePegar=_can('pegar_oficial'),puedeNotas=_can('notas'),
      puedeAs=_can('asesores_guardados'),puedePromos=_can('promos_buscar'),varias=_facOptsDe('flyer').length>1,
      puedeRubros=_facOptsDe('rubros').length>0,puedeSedes=_can('oficiales_sede'),
      guardaTrabajo=_can('guardar_trabajo'),esHunter=_esHunter(),
      // El Líder tampoco tiene armador: ni un capítulo del armador le aplica.
      sinArm=esHunter||_esLider(),puedeGes=(typeof _gesOn==='function')&&_gesOn();
  // El menú "Otros" se abre para hablar de Compartir / PNG / Oficiales por sede, y
  // lo cierra cualquier paso que se vaya a otra parte de la pantalla.
  function cerrarOtros(){if(typeof fgToggleOtros==='function')fgToggleOtros(false);}
  function irIndividual(){cerrarOtros();closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('individual');}
  function irOtros(){closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('individual');if(typeof fgToggleOtros==='function')fgToggleOtros(true);}
  function irRubros(){cerrarOtros();closeUserMenu();if(typeof switchApp==='function')switchApp('rubros');if(typeof switchTab==='function')switchTab('individual');}
  function irMasivo(){cerrarOtros();closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('masivo');}
  function irHistorial(){cerrarOtros();closeUserMenu();if(typeof switchApp==='function')switchApp('flyer');if(typeof switchTab==='function')switchTab('historial');}
  function irHunter(){closeUserMenu();if(typeof switchApp==='function')switchApp('hunter');if(typeof _hunOtrosClose==='function')_hunOtrosClose();}
  function irHunterOtros(){closeUserMenu();if(typeof switchApp==='function')switchApp('hunter');if(typeof _hunOtrosOpen==='function')_hunOtrosOpen();}
  // Los pasos de Promociones son los de la solapa "Buscar". Si el usuario está en
  // "Activas" SIN resultados, se vuelve a "Buscar"; con resultados cargados no se
  // toca nada (cambiar de solapa vacía la tabla) y los pasos que no se vean se
  // saltean solos.
  function irPromos(){
    cerrarOtros();closeUserMenu();
    if(typeof switchApp==='function')switchApp('promos');
    if(typeof switchPromoTab==='function'&&typeof _promoModoActivas==='function'&&_promoModoActivas()&&!_promosResultados)switchPromoTab('buscar');
  }
  function elPtabActivas(){var t=document.querySelectorAll('.promos-view .tabs .ptab');return t[1]||null;}
  return [
    {id:'flyer',titulo:'Armar un flyer',cond:!sinArm,pasos:[
      {target:'#empresa',titulo:'Empez&aacute; por la empresa',
       texto:'Escrib&iacute; la raz&oacute;n social: el flyer de la derecha se actualiza al instante y el <strong>nombre del archivo</strong> se arma solo con ese nombre.'+(puedePad?' Si la empresa ya est&aacute; en tu base, mientras tipe&aacute;s te la sugiere.':''),
       antes:irIndividual},
      {target:'#fg-pad-btn',cond:puedePad,titulo:'La lupa: tus empresas',
       texto:'Busc&aacute; por <strong>raz&oacute;n social o CUIT</strong> y se completa todo de una: empresa, cashback y hasta 4 oficiales. Desde "Administrar" (o tu nombre &rarr; <strong>Base de datos</strong>) sub&iacute;s un Excel o las edit&aacute;s a mano.',
       antes:irIndividual},
      {target:function(){var b=_fgBlock(1);return b&&b.sec;},titulo:'Datos del oficial',
       texto:'Nombre, celular y mail del asesor que va al pie del flyer. Al escribir el nombre, el <strong>mail se sugiere solo</strong> (nombre.apellido@bancogalicia.com.ar); si es distinto, corregilo. Si un celular o un mail no cierra, te lo marca ah&iacute; mismo en rojo (igual te deja generar).'+(puedeAs?' <strong>Tocando este t&iacute;tulo</strong> eleg&iacute;s un asesor guardado y lo carg&aacute;s con un click, o guard&aacute;s el que tengas cargado con <em>&laquo;+ Guardar el actual&raquo;</em>.':'')+' A la derecha del t&iacute;tulo, <strong>&#10005; Borrar</strong> vac&iacute;a los campos de ese oficial.',
       antes:irIndividual},
      {target:'#fg-paste-btn-1',cond:puedePegar,titulo:'&#9889; Pegar: sin tipear nada',
       texto:'Copi&aacute; la firma de un mail o un mensaje con los datos del oficial y pegalo ac&aacute;: detecta <strong>nombre, celular y mail</strong> y los acomoda al formato correcto. Si algo no cierra, <em>Deshacer</em>.',
       antes:irIndividual},
      {target:'#fg-add-asesor',titulo:'Hasta 4 asesores'+(puedeSedes?' (u 8)':''),
       texto:'Agreg&aacute; un segundo, tercer o cuarto oficial: el flyer los acomoda solo (2 lado a lado, 3 en fila, 4 en dos filas). <strong>&#10005; Quitar</strong> lo saca del flyer y borra lo que ten&iacute;a cargado.'+(puedeSedes?' Con <strong>Oficiales por sede</strong> prendido (est&aacute; en <em>Otros</em>, lo vemos al final) llegan hasta 8.':''),
       antes:irIndividual},
      {target:'.cfg-btns',titulo:'Cashback',
       texto:'Eleg&iacute; la configuraci&oacute;n de montos que le corresponde a la empresa (<strong>BAU</strong> o <strong>Config 1 a 4</strong>). Los importes vigentes los carga el administrador; ac&aacute; solo eleg&iacute;s cu&aacute;l.',
       antes:irIndividual},
      {target:'#legal-text',titulo:'Texto legal',
       texto:'Viene precargado con los t&eacute;rminos del mes. Pod&eacute;s ajustar una fecha o un dato: lo que va entre <kbd>**dobles asteriscos**</kbd> sale en <strong>negrita</strong>. Si peg&aacute;s desde Word, la negrita se conserva sola.',
       antes:irIndividual},
      {target:'.fg-legal-b',titulo:'El bot&oacute;n B: negrita sin asteriscos',
       texto:'Seleccion&aacute; un tramo del legal y toc&aacute; <strong>B</strong> (o <kbd>Ctrl</kbd>+<kbd>B</kbd>): te pone los asteriscos por vos. Toc&aacute;ndolo de nuevo sobre el mismo texto, se los saca. Los asteriscos se ven ac&aacute; porque son la marca; en el flyer sale la negrita.',
       antes:irIndividual},
      {target:'.zoom-bar',titulo:'Vista previa',
       texto:'Acerc&aacute; o alej&aacute; con <kbd>+</kbd> / <kbd>&minus;</kbd> o con <kbd>Ctrl</kbd> + ruedita (pellizcando en el touchpad), y recorr&eacute; la imagen con la ruedita o <strong>arrastr&aacute;ndola</strong>. Lo que ves ac&aacute; es exactamente lo que se descarga.',
       antes:irIndividual},
      {target:'#tab-individual .btn.bblue',titulo:'Verlo en grande',
       texto:'Abre el flyer a pantalla completa para revisarlo con tranquilidad antes de mandarlo, con <strong>Descargar PDF</strong>, <strong>Compartir</strong> y <strong>PNG</strong> ah&iacute; mismo. Se cierra con <kbd>Esc</kbd>.',
       antes:irIndividual},
      {target:'#btn-dl-pdf',titulo:'Descargar',
       texto:'<strong>Descargar PDF</strong> (o <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) lo guarda en tu equipo. En la PC est&aacute; siempre a la vista, al pie del formulario. En <em>Otros</em> est&aacute;n <strong>Compartir el PDF</strong> y la descarga como imagen (PNG). Si qued&oacute; un celular o un mail raro, te avisa reci&eacute;n despu&eacute;s de generar: nunca te frena el flyer. Todo queda en la solapa <em>Historial</em>.',
       antes:irIndividual},
      {target:'.btns .btn.bg',titulo:'Restaurar',
       texto:'Limpia empresa y oficiales, apaga lo que hayas prendido en <em>Otros</em> y vuelve el legal al texto guardado, para arrancar el pr&oacute;ximo flyer de cero.',
       antes:irIndividual},
      {target:'#fg-otros',titulo:'&laquo;Otros&raquo;: compartir y m&aacute;s',
       texto:'Ac&aacute; est&aacute; <strong>Compartir el PDF</strong>: abre el men&uacute; del celular o de Windows y lo mand&aacute;s directo por WhatsApp, mail o Teams (si tu navegador no sabe compartir archivos, el bot&oacute;n no aparece y us&aacute;s Descargar PDF). Tambi&eacute;n la descarga como <strong>imagen (PNG)</strong>'+(puedeSedes?' y la barrita de <strong>Oficiales por sede</strong>.':'.'),
       antes:irOtros},
      {target:'#fg-sedes-item',cond:puedeSedes,titulo:'&#128205; Oficiales por sede',
       texto:'Para los flyers en los que el banco pone un referente por zona. Prendida, carg&aacute;s <strong>hasta 8 oficiales</strong>, cada uno con su <strong>ubicaci&oacute;n</strong> (sale con el pin &#128205; y en negrita arriba del nombre) y un <strong>t&iacute;tulo</strong> que va arriba de todo el bloque. Al apagarla se borran las ubicaciones, el t&iacute;tulo y los oficiales 5 al 8 (te pregunta antes). La lupa y el Excel del masivo siguen trayendo hasta 4.',
       antes:irOtros}
    ]},
    {id:'masivo',titulo:'Masivo',cond:!sinArm,pasos:[
      {target:'.template-btn',titulo:'Muchas empresas de una vez',
       texto:'Baj&aacute; la <strong>plantilla Excel</strong>: una fila por empresa (raz&oacute;n social, cashback y hasta 4 asesores). Es el mismo formato que us&aacute;s en <strong>Base de datos</strong>.',
       antes:irMasivo},
      {target:'#excel-drop',titulo:'Sub&iacute; el Excel y gener&aacute;',
       texto:'Arrastralo ac&aacute; o hac&eacute; click para elegirlo. Te muestra una vista previa y avisa si alguna fila tiene un problema (empresa vac&iacute;a, cashback que no reconoce). Despu&eacute;s, el bot&oacute;n <strong>&#9889; Generar ZIP</strong> arma <strong>un PDF por empresa</strong> y los baja todos juntos.',
       antes:irMasivo},
      {target:'#fg-mp-box',cond:puedePad,titulo:'Sin Excel: desde tus empresas',
       texto:'Si ya tenés tu base cargada, ac&aacute; abajo sale <strong>&laquo;Todo el segmento&raquo;</strong>: un click y te baja el flyer de todas las empresas de tu base que usan <strong>este formato</strong> (con sus oficiales, cashback y topes). Para bajar <em>todas</em> tus empresas, cada una con el formato que le toca, est&aacute; <strong>Base de datos &rarr; Generar flyers</strong>.',
       antes:irMasivo}
    ]},
    {id:'historial',titulo:'Historial',cond:!sinArm,pasos:[
      {target:function(){return document.querySelectorAll('.tabs .tab')[2]||null;},
       titulo:guardaTrabajo?'Tus flyers quedan guardados':'Lo que generaste en esta sesi&oacute;n',
       texto:'Cada flyer descargado queda listado ac&aacute;: pod&eacute;s <strong>volver a bajar el PDF</strong> o <strong>recargar</strong> sus datos en el formulario para retocarlo. '+
         (guardaTrabajo
           ? 'La lista queda guardada en esta computadora, as&iacute; que ma&ntilde;ana sigue estando. Y si cerr&aacute;s la pesta&ntilde;a a mitad de un flyer, al volver te ofrece <strong>&laquo;Seguir con ese&raquo;</strong> con todo como lo dejaste.'
           : 'Se vac&iacute;a al cerrar la pesta&ntilde;a del navegador.'),
       antes:irHistorial}
    ]},
    {id:'menu',titulo:'Tu men&uacute;',pasos:[
      {target:'#hdr-dd-padron',cond:(puedePad||puedeAs),titulo:'Base de datos',
       texto:'Ac&aacute; viven <strong>tus empresas</strong> (sub&iacute; un Excel o editalas en l&iacute;nea, para que la lupa las encuentre'+(puedePad?', y desde <strong>Generar flyers</strong> baj&aacute;s las que quieras de una':'')+') y <strong>tus asesores</strong> guardados (correg&iacute; un celular o un mail sin borrar y volver a cargar). Es <strong>privado</strong>: nadie m&aacute;s lo ve ni lo edita, y viaja con tu cuenta (lo ten&eacute;s desde cualquier computadora).',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-notes',cond:puedeNotas,titulo:'Bloc de notas',
       texto:'Anotaciones r&aacute;pidas que quedan guardadas en este navegador, por si necesit&aacute;s tener algo a mano mientras arm&aacute;s flyers.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-theme',titulo:'Modo oscuro',
       texto:'Cambi&aacute; entre tema claro y oscuro. Se recuerda para la pr&oacute;xima vez.',antes:_tourAbrirMenu},
      {target:'#hdr-dd-pal',titulo:'El color de la app',
       texto:'Cuatro temas para elegir: <strong>Marfil</strong>, <strong>Marino</strong>, <strong>Grafito</strong> y <strong>Cielo</strong>. Es s&oacute;lo c&oacute;mo se ve la pantalla: <strong>el flyer que descarg&aacute;s no cambia</strong>. Queda guardado en este navegador.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-pass',cond:!_adminNow(),titulo:'Cambiar mi clave',
       texto:'Cambi&aacute; tu contrase&ntilde;a cuando quieras (te pide la actual). Si la olvidaste, desde el login ped&iacute;s una nueva y el administrador la aprueba.',
       antes:_tourAbrirMenu},
      {target:'#hdr-dd-tour',titulo:'Ver tutorial',
       texto:'Este recorrido queda siempre ac&aacute; para repasarlo cuando quieras.',antes:_tourAbrirMenu}
    ]},
    {id:'hunter',titulo:'Buscar flyer',cond:esHunter,pasos:[
      {target:'#hun-q',titulo:'Busc&aacute; la empresa',
       texto:'Escrib&iacute; la raz&oacute;n social o el <strong>CUIT</strong>. Si alg&uacute;n oficial la carg&oacute;, te aparece en la lista.',
       antes:irHunter},
      {target:'#hun-list',titulo:'Eleg&iacute; la empresa',
       texto:'Si dos oficiales distintos cargaron la misma empresa, aparecen las <strong>dos filas</strong> por separado: fij&aacute;te los nombres antes de elegir. Si dice <strong>&laquo;No figura&raquo;</strong>, nadie la carg&oacute; todav&iacute;a.',
       antes:irHunter},
      {target:'.hun-zoom-bar',titulo:'Acerc&aacute; la imagen',
       texto:'Con <kbd>+</kbd> / <kbd>&minus;</kbd> o <kbd>Ctrl</kbd> + ruedita acerc&aacute;s el flyer para revisar un dato; con la ruedita sola o arrastrando lo recorr&eacute;s.',
       antes:irHunter},
      {target:'#hun-otros',titulo:'&laquo;Otros&raquo;: m&aacute;s herramientas',
       texto:'Ac&aacute; est&aacute;n <strong>Beneficios Haberes</strong> (el tablero), y la <strong>descarga de varias empresas juntas</strong> en un ZIP. El instructivo completo est&aacute; en tu nombre &rarr; <strong>Ver tutorial</strong>.',
       antes:irHunterOtros},
      {target:'#hun-dl',titulo:'Descargar PDF',
       texto:'Baja el flyer con los datos que esa empresa tiene cargados <strong>hoy</strong>. Si propusiste un cambio de oficial, sigue sali&eacute;ndo as&iacute; hasta que el oficial lo apruebe.',
       antes:irHunter}
    ]},
    {id:'promos',titulo:'Promociones',cond:puedePromos,pasos:[
      {target:'#promos-prov',titulo:'Primero, tu provincia',
       texto:'La provincia que elijas ac&aacute; vale para las <strong>dos solapas</strong>: quedan s&oacute;lo las promociones que corren en esa zona. Justo abajo, <strong>&laquo;Ocultar las de compra online&raquo;</strong> saca las de internet (no tienen local, as&iacute; que valen desde cualquier provincia).',
       antes:irPromos},
      {target:'#promos-marcas',titulo:'&iquest;Qu&eacute; marcas siguen vigentes?',
       texto:'Peg&aacute; la lista de marcas del flyer, <strong>una por l&iacute;nea</strong>. Se cruzan contra el buscador oficial de promociones de Galicia.',
       antes:irPromos},
      {target:'#promos-mes',titulo:'Mes a validar',
       texto:'El mes del flyer: una promo que vence dentro de ese mes se marca <em>"vence este mes"</em>, y una ya vencida, <em>"vencida"</em>.',
       antes:irPromos},
      {target:'#promos-validar-btn',titulo:'Validar vigencia',
       texto:'Tambi&eacute;n con <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. Devuelve una tabla con logo, nombre en Galicia, fechas desde/hasta y estado. Las dudosas quedan como <strong>Revisar</strong> con las opciones para elegir a mano; las que no est&aacute;n, como <strong>No encontrada</strong>. La columna <strong>En Galicia</strong> abre esa promoci&oacute;n en el sitio del banco (vigencia, d&iacute;as, tarjetas y letra chica). Arriba de la tabla pod&eacute;s <strong>buscar</strong> dentro del resultado y <strong>ordenarlo</strong>, y con <strong>Descargar Excel</strong> te llev&aacute;s todo con el logo de cada marca.',
       antes:irPromos},
      {target:elPtabActivas,titulo:'&laquo;Activas&raquo;: armar un flyer de cero',
       texto:'La otra solapa va al rev&eacute;s: no peg&aacute;s nada y te trae <strong>todas las promociones vigentes</strong> de esa provincia. Adentro afin&aacute;s por <strong>localidad</strong> y por <strong>rubro</strong>, y con <strong>&laquo;Una sola fila por marca&raquo;</strong> queda una l&iacute;nea por marca (la que vence m&aacute;s tarde; el <strong>+N</strong> te dice cu&aacute;ntas junt&oacute; y cu&aacute;les). La fecha de inicio no viene en el listado: la trae el bot&oacute;n <strong>Completar fechas &laquo;Desde&raquo;</strong>. Ojo: al cambiar de solapa se vac&iacute;a la tabla.',
       antes:irPromos},
      {target:'#promos-sync-btn',titulo:'El cat&aacute;logo de Galicia',
       texto:'La app se guarda una copia del listado de Galicia para no pedirlo cada vez (arriba te dice de cu&aacute;ndo es) y la renueva sola <strong>todos los d&iacute;as a las 9</strong>. Si Galicia carg&oacute; promociones nuevas hoy, toc&aacute; <strong>Actualizar cat&aacute;logo ahora</strong> y las trae.',
       antes:irPromos}
    ]},
    {id:'gestiones',titulo:'Gestiones',cond:puedeGes,pasos:[
      {target:'#hun-ges',titulo:'Registr&aacute; la gesti&oacute;n',cond:esHunter,
       texto:'Despu&eacute;s de cada visita o feria, con la empresa elegida, toc&aacute; <strong>Registrar gesti&oacute;n</strong>. El oficial que te la cedi&oacute; se completa solo.',
       antes:irHunter},
      {target:'#apptab-gestiones',titulo:'Gestiones comerciales',
       texto:'Ac&aacute; est&aacute;n las visitas (las que te derivaron y las que registraste), los <strong>prospectos</strong> y las <strong>altas</strong> de cada una, y el <strong>tablero</strong> con la conversi&oacute;n.',
       antes:function(){cerrarOtros();closeUserMenu();}}
    ]},
    {id:'opciones',titulo:'Opciones',cond:varias&&!sinArm,pasos:[
      {target:'#fg-optbar',titulo:'Varios armadores',
       texto:'Cada opci&oacute;n tiene su propio flyer y su propio legal. Cambi&aacute;s ac&aacute; y todo lo dem&aacute;s (individual, masivo, historial) usa el flyer de esa opci&oacute;n. Los datos que cargaste no se pierden al cambiar.',
       antes:irIndividual}
    ]},
    {id:'rubros',titulo:'Flyer Rubros',cond:puedeRubros&&!sinArm,pasos:[
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
  if(typeof fgToggleOtros==='function')fgToggleOtros(false); // si venimos del paso de "Otros"
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
  if(typeof fgToggleOtros==='function')fgToggleOtros(false); // el tour puede haber quedado en el paso de "Otros"
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
    '.opc-vig{font-size:.75rem;font-weight:800;letter-spacing:.5px;padding:3px 7px;border-radius:10px;background:#e8f5e9;color:#1b5e20;white-space:nowrap}'+
    'html.dark .opc-vig{background:#1b3a1f;color:#a5d6a7}'+
    'html.dark .opc-row .opc-sol{border-color:#3a3e46;background:#22242a}'+
    '.opc-est{font-size:.75rem;color:var(--gray,#888);flex-basis:100%;padding-left:44px}'+
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
      // De qué rubro es el flyer: es lo que hace que una empresa del padrón caiga
      // SIEMPRE en el flyer vigente de su rubro, campaña tras campaña.
      (o.solapa!=='rubros'?'':'<select class="opc-sol" title="De qu&eacute; rubro es este flyer. Las empresas de ese rubro van siempre al &uacute;ltimo flyer que tenga este valor." onchange="_opcSet('+i+',\'rubro\',this.value)">'+
        '<option value="">Rubro: seg&uacute;n el nombre'+(_padRubroTipo(o.nombre)?' ('+_escHtml(_OPC_RUBRO_LBL[_padRubroTipo(o.nombre)])+')':' (no lo dice)')+'</option>'+
        _OPC_RUBROS.map(function(rb){return '<option value="'+rb+'"'+(o.rubro===rb?' selected':'')+'>Rubro: '+_escHtml(_OPC_RUBRO_LBL[rb])+'</option>';}).join('')+
      '</select>')+
      // "Reemplaza a": las empresas del padrón que tienen cargado el flyer viejo
      // pasan solas a éste (ver _optVigente). Sólo entre opciones de la misma solapa.
      (o.n===1?'':'<select class="opc-sol" title="Si este flyer reemplaza a uno anterior, las empresas que ten&iacute;an cargado el viejo pasan solas a &eacute;ste" onchange="_opcSet('+i+',\'reemplaza\',this.value)">'+
        '<option value="0">No reemplaza a ninguno</option>'+
        _opcEdit.filter(function(x){return x.n!==o.n&&x.solapa===o.solapa;}).map(function(x){
          return '<option value="'+x.n+'"'+((parseInt(o.reemplaza,10)||0)===x.n?' selected':'')+'>Reemplaza a: '+_escHtml(x.nombre)+'</option>';
        }).join('')+
      '</select>')+
      (o.n===1?'<span style="font-size:.75rem;color:var(--gray)">La de todos los asesores</span>':
        '<button type="button" class="usr-btn warn" onclick="_opcQuitar('+i+')">Quitar</button>')+
      // Cuál es HOY el flyer que recibe las empresas de ese rubro. Se muestra para
      // no tener que deducirlo: si la vigente no es la que esperabas, se arrastra
      // en la barra de opciones o se usa "Reemplaza a".
      ((o.solapa==='rubros'&&_optRubroTipo(o.n)&&_padRubroActivo(_optRubroTipo(o.n))===o.n)
        ? '<span class="opc-vig" title="Las empresas de este rubro salen con este flyer">VIGENTE</span>':'')+
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
  if(k==='solapa'){_opcEdit[i].reemplaza=0;_opcPintar();} // cambian los candidatos a reemplazar
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
  return !!((v.empresa||'').trim()||typeof v.legal==='string'||(v.nombre2||'').trim()||(v.nombre3||'').trim()||(v.nombre4||'').trim()||(v.benefNombre||'').trim()||
    (v.sedesTit||'').trim()||(v.nombre5||'').trim()||(v.nombre6||'').trim()||(v.nombre7||'').trim()||(v.nombre8||'').trim());
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
  for(var k=1;k<=8;k++){ // 5-8 sólo existen con el modo sedes: el guard los saltea
    var s=_fgSfx(k);
    ['celular'+s,'email'+s].forEach(function(id){var e=document.getElementById(id);if(e)out.push(e);});
  }
  return out;
}
function _fgValTodos(){_fgValInputs().forEach(_fgValField);}
// Resumen para el aviso al generar: sólo asesores que van al flyer y sólo errores (no avisos).
function _fgValProblemas(){
  var p=[],max=_fgMaxAsesores();
  if(!_fgOficialesOn)return p; // sin oficiales en el flyer no hay celulares ni mails que revisar
  for(var k=1;k<=max;k++){
    if(!_fgAsesorOn(k))continue;
    var s=_fgSfx(k);
    var n=(_gv('nombre'+s)||'').trim();if(!n)continue;
    var c=_fgValCel(_gv('celular'+s)),m=_fgValMail(_gv('email'+s));
    if(c&&c.tipo==='inv')p.push('el celular de '+n);
    if(m&&m.tipo==='inv')p.push('el mail de '+n);
  }
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
// Engancha la validación a un campo. Separado de _fgValInit porque los asesores
// 5-8 nacen después (al prender el modo sedes) y también la necesitan.
function _fgValWire(inp){
  if(!inp||inp.dataset.fgVal)return;
  inp.dataset.fgVal='1';
  inp.addEventListener('input',function(){_fgValField(inp);});
  inp.addEventListener('blur',function(){_fgValField(inp);});
}
function _fgValInit(){
  _fgValInputs().forEach(_fgValWire);
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
  return new File([_fgPdfDe(fc).output('blob')],fn+'.pdf',{type:'application/pdf'});
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
// En la barra fija de la PC (fg-dock) se abre hacia arriba, como un menú: ahí
// sí se cierra al tocar afuera (abajo, en la columna del celular, sigue como siempre).
function fgToggleOtros(force){
  var tg=document.querySelector('#fg-otros .fg-otros-tg'),m=document.getElementById('fg-otros-menu');if(!tg||!m)return;
  var abrir=(force===undefined)?m.hidden:!!force;
  m.hidden=!abrir;tg.setAttribute('aria-expanded',abrir?'true':'false');
  document.removeEventListener('click',_fgOtrosFuera,true);
  if(abrir&&m.closest('.fg-dock'))setTimeout(function(){document.addEventListener('click',_fgOtrosFuera,true);},0);
}
function _fgOtrosFuera(e){
  var o=document.getElementById('fg-otros');
  if(!o||o.contains(e.target))return;
  if(e.target.closest&&e.target.closest('#fg-tour-tip'))return; // el tutorial lo abre a propósito
  fgToggleOtros(false);
}

// ── ZOOM DE LA VISTA PREVIA (ventana #modal de la plantilla) ─────────────────
// En la PC la ventana mostraba el flyer entero en una tira de ~110 px: ilegible.
// Abre igual que antes (100 % = el flyer entero en la PC; al ancho en el
// celular) y se acerca con − / +, Ctrl + ruedita anclada al mouse (la rueda sola
// recorre, como en el armador), doble clic, pellizco y las teclas + − 0.
// Arrastrando se recorre. La matemática del anclaje es la del Hunter
// (_hunZoomAplicar); no se reusa su código porque está atado a esa pantalla.
var _fgMZ={z:1,init:false,arrastro:false},_FG_MZ_PASO=1.25;
function _fgMZImg(){return document.getElementById('modal-img');}
function _fgMZBody(){var i=_fgMZImg();return (i&&i.closest)?i.closest('.modal-body'):null;}
function _fgMZMovil(){return !!(window.matchMedia&&window.matchMedia('(max-width:900px)').matches);}
// Ancho de la imagen a 100 %: en la PC el flyer ENTERO (cabe a lo alto y a lo
// ancho); en el celular, al ancho de la pantalla. Nunca más grande que su tamaño real.
function _fgMZBase(){
  var img=_fgMZImg(),b=_fgMZBody();if(!img||!b||!img.naturalWidth)return 0;
  var cw=Math.max(b.clientWidth-2,100),ch=Math.max(b.clientHeight-2,100);
  var esc=_fgMZMovil()?cw/img.naturalWidth:Math.min(cw/img.naturalWidth,ch/img.naturalHeight);
  return Math.min(esc,1)*img.naturalWidth;
}
function _fgMZMax(){var img=_fgMZImg(),bw=_fgMZBase();return (img&&bw)?Math.max(1,img.naturalWidth*1.5/bw):1;}
function _fgMZAplicar(){
  var img=_fgMZImg(),bw=_fgMZBase();if(!img||!bw)return;
  img.classList.add('fg-mz-img');
  img.style.width=Math.round(bw*_fgMZ.z)+'px';
  var b=_fgMZBody();if(b)b.classList.toggle('fg-mz-zoom',_fgMZ.z>1.001);
  var p=document.getElementById('fg-mzoom-pct');if(p)p.textContent=Math.round(_fgMZ.z*100)+'%';
}
// Cambia el zoom dejando quieto el punto (x,y) de la pantalla: el mouse, el
// centro del pellizco o, con los botones, el centro de la ventana.
function _fgMZIr(z,x,y){
  var img=_fgMZImg(),b=_fgMZBody();if(!img||!b||!img.naturalWidth)return;
  z=Math.min(Math.max(z,1),_fgMZMax());if(Math.abs(z-_fgMZ.z)<0.0001)return;
  if(x==null){var rb=b.getBoundingClientRect();x=rb.left+rb.width/2;y=rb.top+rb.height/2;}
  var r0=img.getBoundingClientRect();
  var fx=Math.min(Math.max((x-r0.left)/r0.width,0),1),fy=Math.min(Math.max((y-r0.top)/r0.height,0),1);
  _fgMZ.z=z;_fgMZAplicar();
  var r1=img.getBoundingClientRect();
  b.scrollLeft+=(r1.left+fx*r1.width)-x;b.scrollTop+=(r1.top+fy*r1.height)-y;
}
function fgMZoom(d){_fgMZIr(d>0?_fgMZ.z*_FG_MZ_PASO:_fgMZ.z/_FG_MZ_PASO);}
function fgMZoomReset(){_fgMZ.z=1;_fgMZAplicar();var b=_fgMZBody();if(b){b.scrollTop=0;b.scrollLeft=0;}}
function _fgMZInit(){
  var m=document.getElementById('modal'),img=_fgMZImg(),b=_fgMZBody();
  if(_fgMZ.init||!m||!img||!b)return;
  _fgMZ.init=true;
  var caja=m.querySelector('.modal');if(caja)caja.classList.add('fg-mz');
  var cerrar=m.querySelector('.modal-header .modal-close');
  if(cerrar)cerrar.insertAdjacentHTML('beforebegin',
    '<div class="fg-mzoom" role="group" aria-label="Zoom de la vista previa">'+
      '<button type="button" onclick="fgMZoom(-1)" aria-label="Alejar" title="Alejar (−)">&minus;</button>'+
      '<span id="fg-mzoom-pct">100%</span>'+
      '<button type="button" onclick="fgMZoom(1)" aria-label="Acercar" title="Acercar (+, Ctrl + ruedita o doble clic)">+</button>'+
      '<button type="button" onclick="fgMZoomReset()" aria-label="Ver entero" title="Ver entero (0)">&#10226;</button>'+
    '</div>');
  img.draggable=false;
  img.addEventListener('load',fgMZoomReset); // cada vista previa nueva arranca entera
  var oOpen=window.openPreview,oClose=window.closeModal;
  if(typeof oOpen==='function')window.openPreview=function(){var r=oOpen.apply(this,arguments);_fgMZ.z=1;_fgMZAplicar();b.scrollTop=0;b.scrollLeft=0;return r;};
  if(typeof oClose==='function')window.closeModal=function(){_fgMZ.z=1;return oClose.apply(this,arguments);};
  // Ctrl + ruedita (o pellizco en el touchpad): varios eventos por gesto se
  // juntan en un cuadro, anclados al mouse. La rueda sola recorre la imagen.
  var pasos=0,px=0,py=0,pend=0;
  b.addEventListener('wheel',function(e){
    if(!(e.ctrlKey||e.metaKey))return;
    e.preventDefault();pasos+=(e.deltaY<0?1:-1);px=e.clientX;py=e.clientY;
    if(pend)return;
    pend=requestAnimationFrame(function(){pend=0;var n=pasos;pasos=0;if(n)_fgMZIr(_fgMZ.z*Math.pow(_FG_MZ_PASO,n),px,py);});
  },{passive:false});
  // Doble clic: acerca donde apuntás (al ancho de la ventana); otro, vuelve a verlo entero.
  b.addEventListener('dblclick',function(e){
    if(_fgMZ.z>1.001){fgMZoomReset();return;}
    var bw=_fgMZBase();if(!bw)return;
    var ancho=(b.clientWidth-2)/bw;
    _fgMZIr(ancho>1.5?ancho:2.5,e.clientX,e.clientY);
  });
  // Arrastrar para recorrer (sólo con zoom). Soltar el mouse afuera de la
  // ventana no la cierra: el clic que genera ese arrastre se descarta.
  var arr=false,ax=0,ay=0,sx=0,sy=0;
  b.addEventListener('mousedown',function(e){
    if(e.button!==0||_fgMZ.z<=1.001)return;
    arr=true;_fgMZ.arrastro=false;ax=e.clientX;ay=e.clientY;sx=b.scrollLeft;sy=b.scrollTop;
    b.classList.add('fg-mz-pan');e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!arr)return;
    if(Math.abs(e.clientX-ax)+Math.abs(e.clientY-ay)>4)_fgMZ.arrastro=true;
    b.scrollLeft=sx-(e.clientX-ax);b.scrollTop=sy-(e.clientY-ay);
  });
  document.addEventListener('mouseup',function(){if(arr){arr=false;b.classList.remove('fg-mz-pan');setTimeout(function(){_fgMZ.arrastro=false;},0);}});
  window.addEventListener('click',function(e){if(_fgMZ.arrastro&&e.target===m){e.stopImmediatePropagation();_fgMZ.arrastro=false;}},true);
  // Celular: pellizco con dos dedos dentro de la imagen (un dedo recorre, como siempre).
  var pz=null;
  function dist(t){var dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;return Math.sqrt(dx*dx+dy*dy)||1;}
  b.addEventListener('touchstart',function(e){if(e.touches.length===2){pz={d:dist(e.touches),z:_fgMZ.z};e.preventDefault();}},{passive:false});
  b.addEventListener('touchmove',function(e){
    if(!pz||e.touches.length!==2)return;
    e.preventDefault();
    _fgMZIr(pz.z*dist(e.touches)/pz.d,(e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2);
  },{passive:false});
  b.addEventListener('touchend',function(e){if(e.touches.length<2)pz=null;});
  // Teclas + − 0 con la ventana abierta.
  document.addEventListener('keydown',function(e){
    if(!m.classList.contains('show')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='+'||e.key==='='){e.preventDefault();fgMZoom(1);}
    else if(e.key==='-'||e.key==='_'){e.preventDefault();fgMZoom(-1);}
    else if(e.key==='0'){e.preventDefault();fgMZoomReset();}
  });
  var rt=0;
  window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){if(m.classList.contains('show'))_fgMZAplicar();},150);});
}

// ── BARRA FIJA DE ACCIONES (Vista previa · Descargar PDF · Otros) ────────────
// En una PC de sucursal (1366×768) "Descargar PDF" quedaba ~700 px abajo del
// formulario: había que bajar cada vez. En la PC los tres botones van en una
// barra pegada al pie del panel, a la vista mientras se completa el formulario.
// "Restaurar" queda en su lugar (abajo de todo), lejos del PDF: borra el
// formulario y no conviene tenerlo a mano. En el celular todo queda como antes
// (en columna), porque ahí está la pastilla Editar / Vista previa.
var _fgDockMQ=null;
function _fgDockInit(){
  var tab=document.getElementById('tab-individual'),pdf=document.getElementById('btn-dl-pdf');
  if(!tab||!pdf||document.getElementById('fg-dock'))return;
  if(!pdf.parentNode||!pdf.parentNode.classList.contains('btns'))return;
  var dock=document.createElement('div');dock.id='fg-dock';dock.className='fg-dock';
  tab.appendChild(dock); // último del panel: así se queda pegado abajo al recorrerlo
  var m=document.getElementById('fg-otros-menu');
  if(m)m.addEventListener('click',function(e){ // en la barra, elegir una acción cierra el menú
    var it=e.target.closest&&e.target.closest('.fg-otros-item');
    if(it&&!it.classList.contains('fg-otros-sw')&&m.closest('.fg-dock'))setTimeout(function(){fgToggleOtros(false);},0);
  });
  _fgDockMQ=window.matchMedia?window.matchMedia('(max-width:900px)'):null;
  _fgDockUbicar();
  if(_fgDockMQ){
    if(_fgDockMQ.addEventListener)_fgDockMQ.addEventListener('change',_fgDockUbicar);
    else if(_fgDockMQ.addListener)_fgDockMQ.addListener(_fgDockUbicar);
  }
}
function _fgDockUbicar(){
  var dock=document.getElementById('fg-dock'),pdf=document.getElementById('btn-dl-pdf');if(!dock||!pdf)return;
  var btns=document.querySelector('#tab-individual .btns'),prev=document.querySelector('#tab-individual .btn.bblue'),otros=document.getElementById('fg-otros');
  if(!btns)return;
  if(_fgDockMQ&&_fgDockMQ.matches){
    // celular: el orden de siempre (Vista previa, Descargar PDF, Restaurar, Otros)
    var rest=btns.querySelector('.btn.bg');
    [prev,pdf].forEach(function(el){if(el)btns.insertBefore(el,rest||null);});
    if(otros)btns.appendChild(otros);
    dock.hidden=true;
  }else{
    [prev,pdf,otros].forEach(function(el){if(el)dock.appendChild(el);});
    dock.hidden=false;
  }
  fgToggleOtros(false);
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
  // pad-upd-ov: modal de proponer cambios / "Mis cambios" del Hunter (se crea y
  // se borra del DOM, como fg-cf-ov).
  if(document.getElementById('pad-upd-ov'))return true;
  if(document.getElementById('ges-ov'))return true; // modales de Gestiones
  var ids=['pass-modal','notes-modal','user-modal','pad-mine-ov'];
  for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el&&el.style.display&&el.style.display!=='none')return true;}
  return false;
}
function _fgArmadorVisible(){
  var lay=document.getElementById('layout'),ti=document.getElementById('tab-individual');
  return !!(lay&&lay.style.display!=='none'&&ti&&ti.classList.contains('active'));
}
// La vista "Promociones" (solapa de primer nivel, no el armador).
function _fgPromosVisible(){
  var pv=document.getElementById('view-promos');
  return !!(pv&&pv.style.display&&pv.style.display!=='none');
}
function _fgHunterVisible(){
  var hv=document.getElementById('view-hunter');
  return !!(hv&&hv.style.display&&hv.style.display!=='none');
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
      // Cualquier otro elemento que no es <button> pero se presenta como botón
      // (las píldoras "⚡ Pegar" y "✕ Borrar/Quitar" de cada asesor).
      if(t.tagName!=='BUTTON'&&t.getAttribute('role')==='button'&&t.hasAttribute('tabindex')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();t.click();return;}
    }
    // Alt+G = "Registrar gestión" en la pantalla del Hunter (G de gestión).
    // Ctrl+G no: en algunos navegadores busca en internet. AltGr llega como
    // Ctrl+Alt, por eso se excluye Ctrl (no choca con escribir @). Se mira
    // e.code porque en Mac Opción+G escribe "©" en e.key.
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&(e.code==='KeyG'||e.key==='g'||e.key==='G')){
      if(!_fgHayDialogo()&&_fgHunterVisible()&&_gesOn()){e.preventDefault();_hunGesRegistrar();return;}
    }
    // Ctrl+Enter = la acción principal de la vista en la que estás: en el
    // armador descarga el PDF, en Promociones valida la lista de marcas. Anda
    // también con el cursor dentro del cuadro de texto (es el caso normal:
    // pegás las marcas y validás sin soltar el teclado).
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      if(_fgHayDialogo())return;
      if(_fgArmadorVisible()&&typeof dlPDF==='function'){e.preventDefault();dlPDF();return;}
      if(_fgPromosVisible()&&typeof validarPromos==='function'){
        var enActivas=_promoModoActivas();
        var vb=enActivas?_promosActivasBtn():_promosValidarBtn();
        if(vb&&vb.disabled)return; // ya está trabajando: no encolar otra
        e.preventDefault();
        if(enActivas)buscarPromosActivas();else validarPromos();
        return;
      }
      // Hunter: con empresas tildadas baja el ZIP de todas; si no, el PDF de la
      // que está viendo. Nunca los dos, y nunca si ya está generando.
      if(_fgHunterVisible()){
        if(_hunMultiOn&&_hunMultiCount()>0){
          var md=document.getElementById('hun-multi-dl');
          if(md&&md.disabled)return;
          e.preventDefault();_hunMultiBajar();return;
        }
        if(_hunCv&&!_hunBusy){e.preventDefault();_hunBajar();}
      }
      return;
    }
    if(e.key==='Escape'){
      var m=document.getElementById('modal');
      if(m&&m.classList.contains('show')){closeModal();return;}
      var om=document.getElementById('fg-otros-menu');if(om&&!om.hidden)fgToggleOtros(false);
      var hm=document.getElementById('hun-otros-menu');if(hm&&!hm.hidden&&typeof _hunToggleOtros==='function')_hunToggleOtros(false);
    }
  });
}

// ── GLOBITO DE ATAJO ─────────────────────────────────────────────────────────
// Cartelito propio al apoyar el mouse sobre un botón que tiene atajo de teclado.
// No se usa el title nativo: tarda cerca de un segundo, no se puede estilar y
// sale con la tipografía del sistema. Sólo se engancha donde hay mouse de
// verdad (hover:hover + pointer:fine): en un celular no hay teclado, así que el
// globito sería ruido. El botón NO cambia de tamaño: el cartelito va fixed por
// encima, medido con getBoundingClientRect.
var _FG_TIP_DELAY=400,_fgTipTimer=null,_fgTipFor=null;
// En Mac el atajo es Cmd; en Windows/Linux, Ctrl.
function _fgTipMod(){
  var p=(navigator.platform||'')+' '+(navigator.userAgent||'');
  return /Mac|iPhone|iPad|iPod/.test(p)?'⌘':'Ctrl';
}
function _fgTipStyle(){
  if(document.getElementById('fg-tip-style'))return;
  var st=document.createElement('style');st.id='fg-tip-style';
  st.textContent=
    // El anillo claro es lo que lo despega del botón de arriba ("Vista previa"
    // es casi negro en la paleta Marfil, y sin el anillo el globito marino se
    // confundía con él).
    '#fg-tip{position:fixed;z-index:9600;pointer-events:none;opacity:0;'+
      'transform:translateY(3px);transition:opacity .13s ease,transform .13s ease;'+
      'background:var(--navy,#14213D);color:#fff;font-size:.75rem;font-weight:600;'+
      'letter-spacing:.01em;padding:5px 9px;border-radius:7px;white-space:nowrap;'+
      'box-shadow:0 0 0 2px rgba(255,255,255,.92),0 6px 18px rgba(0,0,0,.3)}'+
    '#fg-tip.on{opacity:1;transform:translateY(0)}'+
    '#fg-tip:after{content:"";position:absolute;left:50%;margin-left:-5px;'+
      'border:5px solid transparent;border-top-color:var(--navy,#14213D)}'+
    '#fg-tip.abajo:after{border-top-color:transparent;border-bottom-color:var(--navy,#14213D)}'+
    '#fg-tip kbd{font:inherit;background:rgba(255,255,255,.18);border-radius:4px;'+
      'padding:0 4px;margin:0 1px}'+
    '@media (prefers-reduced-motion:reduce){#fg-tip{transition:none}}';
  document.head.appendChild(st);
}
function _fgTipNode(){
  var t=document.getElementById('fg-tip');
  if(!t){
    _fgTipStyle();
    t=document.createElement('div');t.id='fg-tip';t.setAttribute('role','tooltip');
    document.body.appendChild(t);
  }
  return t;
}
function _fgTipShow(el){
  var txt=el.getAttribute('data-fgtip');if(!txt)return;
  var t=_fgTipNode();
  // Las teclas van en <kbd> para que se lean como teclas; el texto viene del
  // código (nunca de datos del usuario), pero igual se arma con _escHtml.
  t.innerHTML=txt.split('+').map(function(p,i){
    p=p.trim();
    return i===0&&!/^(Ctrl|⌘|Shift|Alt)$/.test(p)
      ? _escHtml(p)
      : '<kbd>'+_escHtml(p)+'</kbd>';
  }).join(' + ');
  t.className='';t.style.left='-9999px';t.style.top='0';t.classList.add('on');
  var r=el.getBoundingClientRect(),b=t.getBoundingClientRect();
  var left=Math.round(r.left+r.width/2-b.width/2);
  left=Math.max(8,Math.min(left,(window.innerWidth||0)-b.width-8));
  var arriba=r.top-b.height-9;
  if(arriba<8){ // no entra arriba: va debajo del botón
    t.classList.add('abajo');
    t.style.top=Math.round(r.bottom+9)+'px';
  }else{
    t.style.top=Math.round(arriba)+'px';
  }
  t.style.left=left+'px';
  // La flecha apunta al centro del botón aunque el globito se haya corrido para
  // no salirse de la pantalla. Va por <style> propio porque el :after no se
  // puede posicionar desde el style inline del elemento.
  var ax=Math.round(r.left+r.width/2-left);
  var st=document.getElementById('fg-tip-arrow');
  if(!st){st=document.createElement('style');st.id='fg-tip-arrow';document.head.appendChild(st);}
  st.textContent='#fg-tip:after{left:'+ax+'px;'+(t.classList.contains('abajo')?'top:-10px':'bottom:-10px')+'}';
  _fgTipFor=el;
}
function _fgTipHide(){
  if(_fgTipTimer){clearTimeout(_fgTipTimer);_fgTipTimer=null;}
  var t=document.getElementById('fg-tip');if(t)t.classList.remove('on');
  _fgTipFor=null;
}
// Cualquier elemento con data-fgtip se engancha solo (delegación en el body),
// así un botón inyectado más tarde no necesita re-inicializar nada.
function _fgTipInit(){
  if(!window.matchMedia||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  // Los botones que tienen atajo. Mismo globito en los dos: en cada vista,
  // Ctrl+Enter hace lo principal de esa pantalla.
  ['btn-dl-pdf','promos-validar-btn','hun-dl','hun-multi-dl'].forEach(function(id){
    var b=document.getElementById(id);
    if(b&&!b.getAttribute('data-fgtip'))b.setAttribute('data-fgtip',_fgTipMod()+' + Enter');
  });
  if(document.body.dataset.fgTip)return;
  document.body.dataset.fgTip='1';
  function target(e){
    var n=e.target;
    while(n&&n!==document.body){
      if(n.getAttribute&&n.getAttribute('data-fgtip'))return n;
      n=n.parentNode;
    }
    return null;
  }
  document.body.addEventListener('mouseover',function(e){
    var el=target(e);if(!el||el===_fgTipFor)return;
    _fgTipHide();
    _fgTipTimer=setTimeout(function(){_fgTipShow(el);},_FG_TIP_DELAY);
  });
  document.body.addEventListener('mouseout',function(e){
    var el=target(e);if(!el)return;
    // moverse DENTRO del mismo botón (al svg, al texto) no es salir de él
    var to=e.relatedTarget;
    while(to&&to!==document.body){if(to===el)return;to=to.parentNode;}
    _fgTipHide();
  });
  // al hacer clic el globito estorba (encima se dispara "Generando...")
  document.body.addEventListener('click',function(e){if(target(e))_fgTipHide();},true);
  window.addEventListener('scroll',_fgTipHide,true);
  window.addEventListener('resize',_fgTipHide);
  window.addEventListener('blur',_fgTipHide);
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

// ── RECORTAR UNA PARTE DEL FLYER (19-oct-2026) ───────────────────────────────
// Se quita una franja horizontal (por ejemplo, la de los importes para una
// empresa sin cashback): lo de abajo sube y se une con lo de arriba.
// Mismo truco que el calibrador (_calDraw): se cambia window.baseImg por la
// imagen ya recortada y window.FLYER_CFG por la calibración corrida. Así todo el
// motor (oficiales, legal, crecimiento con 4 oficiales, muestreo del fondo,
// detección de logos) trabaja sobre el flyer recortado sin enterarse.
// · Oficiales y legal se anclan ABAJO: con la imagen más corta suben solos; sólo
//   se compensa lo que está ARRIBA del corte. Lo anclado arriba (empresa,
//   importes, cartel) que queda debajo del corte sube; lo que cae adentro se apaga.
// · Las y de cada corte son px de la imagen ya recortada por los anteriores.
// · Temporal: cambiar de opción lo suelta (_fgApplyOption → _fgRecOlvidar). Se
//   guarda y se publica desde Estudio (datos.recortes).
var _fgRec=null;           // {orig, cfg0, cortes:[{y,h}], cut, src}
var _fgRecM={modo:false};
function _fgRecActivo(){return !!(_fgRec&&window.baseImg===_fgRec.cut);}
// La imagen recortada: mismo ancho, alto H − Σh, armada por tramos.
function _fgRecArte(img,cortes){
  var W=img.naturalWidth||img.width,H=img.naturalHeight||img.height,src=img;
  cortes.forEach(function(k){
    var y0=Math.max(0,Math.min(H,Math.round(k.y))),h=Math.max(0,Math.min(H-y0,Math.round(k.h)));
    var c=document.createElement('canvas');c.width=W;c.height=H-h;
    var g=c.getContext('2d');
    if(y0>0)g.drawImage(src,0,0,W,y0,0,0,W,y0);
    if(H-y0-h>0)g.drawImage(src,0,y0+h,W,H-y0-h,0,y0,W,H-y0-h);
    src=c;H=H-h;
  });
  return src;
}
// La calibración corrida para el flyer recortado (copia: nunca toca la original).
// W/H = tamaño real de la imagen ENTERA.
function _fgRecCfg(raw,cortes,W,H){
  var C=JSON.parse(JSON.stringify(_fgCfgDe(raw))),k=W/(C.imgW||1240),ih=C.imgH||6457,Hc=H;
  cortes.forEach(function(cut){
    var y0=cut.y,y1=cut.y+cut.h,hb=cut.h/k;
    function arriba(yb){if(yb==null)return yb;var p=yb*k;return p>=y1?yb-hb:(p>=y0?null:yb);}
    function abajo(yb){
      if(yb==null)return yb;var p=Hc-(ih-yb)*k;
      if(p<y0)return yb+hb;                // arriba del corte: compensa que la imagen se acortó
      if(p>=y1)return yb;                  // abajo del corte: sube solo
      return ih-(Hc-cut.h-y0)/k;           // adentro: al borde del corte
    }
    var E=C.empresa,ey=arriba(E.yc);if(ey===null)E.off=true;else E.yc=ey;
    var M=C.montos,my=arriba(M.y);if(my===null)M.off=true;else M.y=my;
    (M.boxes||[]).forEach(function(b){if(b.y!=null){var by=arriba(b.y);if(by===null)M.off=true;else b.y=by;}});
    var K=C.cashback,ky=arriba(K.y);if(ky===null)K.off=true;else K.y=ky;
    var lin=[];(C.benef.lineas||[]).forEach(function(l){var ly=arriba(l.y);if(ly!==null){l.y=ly;lin.push(l);}});
    C.benef.lineas=lin.length?lin:[{t:'',x:0,y:-9999,fs:12,mw:10}]; // vacía: sin líneas (si no, vuelve la plantilla)
    var T=C.contacto;['ey','y1','y2','y3'].forEach(function(q){if(T[q]!=null)T[q]=abajo(T[q]);});
    var L=C.legal;L.yStart=abajo(L.yStart);L.yEnd=abajo(L.yEnd);
    if(C.cropH>0)C.cropH=Math.max(1,C.cropH-cut.h);
    Hc-=cut.h;
  });
  return C;
}
// Ajusta los bordes (±25 px) a las dos filas que más se parecen: la de arriba
// del corte y la de abajo quedan pegadas, y así la unión no se nota.
function _fgRecMejorUnion(y0,y1){
  var im=window.baseImg,W=im.width,H=im.height,R=25,paso=4;
  var a0=Math.max(1,y0-R),a1=Math.min(H-2,y0+R),b0=Math.max(1,y1-R),b1=Math.min(H-1,y1+R);
  try{
    var A=_fgLgPixeles(0,a0-1,W,a1-a0+2),B=_fgLgPixeles(0,b0,W,b1-b0+1);
    var mejor={d:Infinity,a:y0,b:y1};
    for(var a=a0;a<=a1;a++){
      var fa=(a-1-(a0-1))*W*4;
      for(var b=b0;b<=b1;b++){
        if(b-a<10)continue;
        var fb=(b-b0)*W*4,d=0,n=0;
        for(var x=0;x<W;x+=paso){var p=x*4;d+=Math.abs(A[fa+p]-B[fb+p])+Math.abs(A[fa+p+1]-B[fb+p+1])+Math.abs(A[fa+p+2]-B[fb+p+2]);n++;}
        d=d/n+Math.abs((b-a)-(y1-y0))*0.02; // a igual parecido, el más cercano a lo marcado
        if(d<mejor.d)mejor={d:d,a:a,b:b};
      }
    }
    return {y:mejor.a,h:mejor.b-mejor.a,d:mejor.d};
  }catch(e){return {y:y0,h:y1-y0,d:-1};}
}
function _fgRecFirma(cortes){return cortes.map(function(c){return Math.round(c.y)+'-'+Math.round(c.h);}).join('_');}
// Para volver a descargar del historial un flyer que tenía recortes: arma el
// recorte un momento, ejecuta fn y deja todo como estaba (como _calDraw).
function _fgConRecortes(v,fn){
  if(!v||!v.recortes||!v.recortes.length)return fn();
  var entera=_fgRecActivo()?_fgRec.orig:window.baseImg,cfg0=_fgRecActivo()?_fgRec.cfg0:(window.FLYER_CFG||{});
  if(!entera||v.recBase!==_estNombreImg(entera.src)){showToast('El flyer cambió desde que se descargó ese: sale sin el recorte.');return fn();}
  var sb=window.baseImg,sc=window.FLYER_CFG,sr=_fgRec;
  try{
    var cut=_fgRecArte(entera,v.recortes);try{cut.src=(entera.src||'')+'#rec='+_fgRecFirma(v.recortes);}catch(e){}
    window.baseImg=cut;window.FLYER_CFG=_fgRecCfg(cfg0,v.recortes,entera.naturalWidth||entera.width,entera.naturalHeight||entera.height);
    return fn();
  }finally{window.baseImg=sb;window.FLYER_CFG=sc;_fgRec=sr;}
}
// Cargar del historial un flyer con recortes o logos: se abre como borrador
// (el original queda limpio, igual que con los cambios a mano).
function _fgHistDiseno(v){
  var hayR=!!(v&&v.recortes&&v.recortes.length),hayL=!!(v&&v.logos&&v.logos.length);
  if(!hayR&&!hayL)return;
  if(_fgProtoActivo()){_fgProtoGuardarActual();_fgProtoAct=null;_fgLg.proy=null;if(typeof _fgRenderOptBar==='function')_fgRenderOptBar();}
  _fgRecOlvidar();
  var entera=window.baseImg,src=(entera&&entera.src)||'';
  if(hayR&&v.recBase!==_estNombreImg(src)){showToast('El flyer cambió desde entonces: se cargaron los datos, sin el recorte ni los logos.');return;}
  if(hayR)_fgRecAplicarLista(v.recortes);
  var okL=hayL&&(v.logosSrc===_fgLgSrc());
  _fgLg.list=okL?JSON.parse(JSON.stringify(v.logos)):[];_fgLg.src=_fgLgSrc();_fgLg.sel=-1;_fgLg.grupo=[];
  _fgLgHistReiniciar();
  if(_fgLgActivos().length||_fgRecActivo())_fgBorradorAuto(true);
  if(typeof calcSC==='function')calcSC();
  _fgLgListo();
  if(hayL&&!okL)showToast('Los logos de ese flyer eran de otra versión del flyer y no se cargaron.');
}
// Arma el estado (imagen + calibración) para una lista de cortes. No toca logos.
function _fgRecPoner(cortes){
  var r=_fgRec;
  r.cortes=cortes;
  r.cut=_fgRecArte(r.orig,cortes);
  r.src=(r.orig.src||'')+'#rec='+_fgRecFirma(cortes);
  try{r.cut.src=r.src;}catch(e){}
  window.baseImg=r.cut;
  window.FLYER_CFG=_fgRecCfg(r.cfg0,cortes,r.orig.naturalWidth||r.orig.width,r.orig.naturalHeight||r.orig.height);
}
function _fgRecDespues(){
  if(typeof calcSC==='function')calcSC();
  var pa=_fgProtoActivo();if(pa&&pa.temp)_fgBorrGuardarPronto();
  _fgLgHistMarcar();_fgMontosVisibles();_fgLgBarra(); // el recorte es un paso de Deshacer
  if(typeof redrawNow==='function')redrawNow();
  _fgLgMarcas();
}
// Quitar una parte (la que marcó el usuario, ya ajustada).
function fgRecAplicar(y,h){
  y=Math.round(y);h=Math.round(h);if(!(h>0))return;
  var antes=_fgLgSrc(),activo=_fgRecActivo();
  if(!activo)_fgRec={orig:window.baseImg,cfg0:window.FLYER_CFG||{},cortes:[]};
  // los logos cambiados: lo de abajo del corte sube; lo de adentro se va
  var conLogos=_fgLg.src===antes&&_fgLg.list.length,perdidos=0;
  if(conLogos){
    _fgLg.list=_fgLg.list.filter(function(e){
      var cy=(e.ty!=null&&!isNaN(e.ty))?e.ty+e.th/2:e.y+e.h/2;
      if(cy>=y&&cy<y+h){perdidos++;return false;}
      if(cy>=y+h){e.y-=h;if(e.oy!=null)e.oy-=h;if(e.ty!=null)e.ty-=h;}
      return true;
    });
  }
  _fgRecPoner(_fgRec.cortes.concat([{y:y,h:h}]));
  if(conLogos||!_fgLg.list.length)_fgLg.src=_fgLgSrc(); // la lista (aunque vacía) es la del flyer recortado
  _fgLg.sel=-1;_fgLg.grupo=[];
  _fgRecDespues();_fgBorradorAuto();
  showToast('Listo: se quitó esa parte'+(_fgSinImportes()?' y el flyer ya no lleva importes':'')+'.'+(perdidos?' '+perdidos+(perdidos===1?' cambio de logo quedaba':' cambios de logos quedaban')+' adentro y se sacaron.':''));
}
// Para abrir un diseño de Estudio: aplica sus cortes tal cual (sin ajustar).
function _fgRecAplicarLista(cortes){
  if(!cortes||!cortes.length||!window.baseImg)return;
  _fgRec={orig:window.baseImg,cfg0:window.FLYER_CFG||{},cortes:[]};
  _fgRecPoner(JSON.parse(JSON.stringify(cortes)));
  _fgMontosVisibles();
}
// "Volver a como estaba": el flyer entero; los logos bajan a su lugar.
function fgRecQuitar(){
  if(!_fgRecActivo())return;
  var r=_fgRec,conLogos=_fgLg.src===_fgLgSrc()&&_fgLg.list.length;
  if(conLogos){
    r.cortes.slice().reverse().forEach(function(c){
      _fgLg.list.forEach(function(e){
        var cy=(e.ty!=null&&!isNaN(e.ty))?e.ty+e.th/2:e.y+e.h/2;
        if(cy>=c.y){e.y+=c.h;if(e.oy!=null)e.oy+=c.h;if(e.ty!=null)e.ty+=c.h;}
      });
    });
  }
  window.baseImg=r.orig;window.FLYER_CFG=r.cfg0;_fgRec=null;
  if(conLogos||!_fgLg.list.length)_fgLg.src=_fgLgSrc();
  _fgLg.sel=-1;_fgLg.grupo=[];
  _fgRecDespues();
  showToast('El flyer volvió a estar entero.');
}
// Suelta el recorte sin tocar logos (cambio de opción, otra calibración…).
function _fgRecOlvidar(){
  if(!_fgRec)return;
  if(window.baseImg===_fgRec.cut){window.baseImg=_fgRec.orig;window.FLYER_CFG=_fgRec.cfg0;}
  _fgRec=null;_fgRecM.modo=false;
  var b=document.getElementById('fg-rec-conf');if(b)b.remove();
  var bd=document.getElementById('fg-rec-banda');if(bd)bd.remove();
  if(typeof _fgLgBarra==='function')_fgLgBarra();
}
// La tarjeta "Configuración de Montos" no tiene sentido si el flyer no lleva importes.
function _fgMontosVisibles(){
  var d=document.getElementById('d1'),card=d&&d.closest&&d.closest('.fg-card');if(!card)return;
  var off=_fgSinImportes();card.classList.toggle('fg-sin-importes',off);
  var av=card.querySelector('.fg-sin-imp-aviso');
  if(off&&!av){av=document.createElement('div');av.className='fg-sin-imp-aviso';
    av.textContent='Este flyer no lleva importes de cashback (se quitó esa parte del flyer).';card.appendChild(av);}
}
// ·· Marcar la parte a quitar ··
function fgRecModo(on){
  _fgRecM.modo=(on===undefined)?!_fgRecM.modo:!!on;
  if(_fgRecM.modo){if(_fgFr.modo)fgFranjaModo(false);if(!_fgLg.on)fgLogosModo(true);_fgLg.sel=-1;_fgLg.grupo=[];_fgLgMarcas();}
  var prev=document.querySelector('.prev');if(prev)prev.classList.toggle('fg-rec-on',_fgRecM.modo);
  _fgLgBarra();
}
// Mientras se arrastra: una franja de todo el ancho (coordenadas de pantalla).
function _fgRecBanda(ya,yb){
  var capa=document.getElementById('fg-lg-capa'),cvs=document.getElementById('cv');if(!capa||!cvs)return;
  var b=document.getElementById('fg-rec-banda');
  if(ya==null){if(b)b.remove();return;}
  if(!b){b=document.createElement('div');b.id='fg-rec-banda';b.className='fg-rec-banda';capa.appendChild(b);}
  var r=cvs.getBoundingClientRect();
  b.style.top=(Math.min(ya,yb)-r.top)+'px';b.style.height=Math.abs(yb-ya)+'px';b.innerHTML='';
}
function _fgRecDesdeArrastre(ya,yb){
  var cvs=document.getElementById('cv'),r=cvs.getBoundingClientRect(),x=r.left+r.width/2;
  var a=_fgLgAImagen(x,Math.min(ya,yb)),b=_fgLgAImagen(x,Math.max(ya,yb));
  if(!a||!b){_fgRecBanda(null);showToast('Esa zona cae en el espacio de los oficiales. Marcá la parte un poco más arriba.');return;}
  var y0=Math.max(0,a.y),y1=Math.min(window.baseImg.height,b.y);
  if(y1-y0<12){_fgRecBanda(null);showToast('Esa parte es muy finita. Arrastrá de arriba hacia abajo sobre lo que querés quitar.');return;}
  if(y1-y0>window.baseImg.height*0.6){_fgRecBanda(null);showToast('Es demasiado para quitar de una vez. Marcá una parte más chica.');return;}
  var u=_fgRecMejorUnion(Math.round(y0),Math.round(y1));
  _fgRecConfirmar(u.y,u.h);
}
// Muestra la franja ajustada y pregunta. La imagen todavía no se tocó.
function _fgRecConfirmar(y,h){
  var p=_fgLgAPantalla(0,y,10,h);
  var capa=document.getElementById('fg-lg-capa');if(!capa)return;
  var b=document.getElementById('fg-rec-banda');
  if(!b){b=document.createElement('div');b.id='fg-rec-banda';b.className='fg-rec-banda';capa.appendChild(b);}
  b.style.top=p.t.toFixed(1)+'px';b.style.height=Math.max(2,p.h).toFixed(1)+'px';
  b.innerHTML='<span>Se quita esta parte</span>';
  var prev=document.querySelector('.prev'),c=document.getElementById('fg-rec-conf');if(c)c.remove();
  c=document.createElement('div');c.id='fg-rec-conf';c.className='fg-rec-conf';c.setAttribute('role','dialog');c.setAttribute('aria-label','Quitar una parte del flyer');
  c.innerHTML='<span class="fg-rec-conf-t">Se quita la parte marcada en rojo y lo de abajo sube a unirse. Los oficiales y los legales se acomodan solos.</span>'+
    '<button type="button" class="btn bg" id="fg-rec-no">Cancelar</button><button type="button" class="btn bp" id="fg-rec-ok">Quitar esta parte</button>';
  c.addEventListener('mousedown',function(e){e.stopPropagation();});c.addEventListener('pointerdown',function(e){e.stopPropagation();});
  prev.appendChild(c);
  function cerrar(){document.removeEventListener('keydown',tecla,true);c.remove();_fgRecBanda(null);}
  function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();}}
  document.addEventListener('keydown',tecla,true);
  document.getElementById('fg-rec-no').onclick=cerrar;
  document.getElementById('fg-rec-ok').onclick=function(){cerrar();fgRecAplicar(y,h);};
  try{document.getElementById('fg-rec-ok').focus();}catch(e){}
}

// ── CAMBIAR LOGOS DEL FLYER (prototipo 16-oct-2026) ──────────────────────────
// El flyer trae logos de marcas impresos (la franja "Aprovechá beneficios…",
// los súper, etc.). El oficial toca uno en la vista previa y lo cambia por otra
// marca del catálogo de Promociones (o lo deja vacío), sin pasar por Figma.
// · Nada se calibra: al tocar, la app busca el logo en la IMAGEN ORIGINAL (no en
//   el canvas): toma el color de fondo que más se repite alrededor y junta las
//   partes que están a menos de _FG_LG_GAP px (ícono + texto de un mismo logo).
//   Si no lo encuentra, se puede arrastrar un recuadro a mano.
// · Es TEMPORAL: vale para el flyer en curso. Traer otra empresa de la base,
//   Restaurar o cambiar de opción lo vuelve al original.
// · Viaja en v (v.logos + v.logosSrc) como el resto del flyer, así la vista
//   previa, la descarga y el historial dibujan lo mismo. Sólo datos (el logo se
//   busca por nombre de archivo en _fgLg.imgs): v se copia con JSON.
// · El masivo, el padrón y el Hunter no lo usan (su v no trae logos).
var _fgLg={on:false,src:'',list:[],imgs:Object.create(null),carga:Object.create(null),sel:-1,proy:null,grupo:[],lugares:[]};
// Lo elegido: con Shift se eligen varios (_fgLg.grupo) y se mueven, agrandan o
// centran juntos. _fgLg.sel sigue siendo "el principal" (el último tocado).
function _fgLgElegidos(){
  var L=_fgLgActivos(),g=(_fgLg.grupo||[]).filter(function(i){return _fgLgAjustable(L[i]);});
  if(g.length>1)return g;
  return (_fgLg.sel>=0&&_fgLgAjustable(L[_fgLg.sel]))?[_fgLg.sel]:[];
}
// Shift + clic: suma o saca un logo de lo elegido
function _fgLgGrupoTocar(i){
  var g=_fgLgElegidos().slice(),j=g.indexOf(i);
  if(j>=0)g.splice(j,1);else g.push(i);
  _fgLg.grupo=g;_fgLg.sel=g.length?g[g.length-1]:-1;
}
var _FG_LG_GAP=12;  // px de imagen: separación máxima entre partes de UN logo (Megatlon↔farmacity están a 18)
var _FG_LG_TOL=40;  // diferencia de color (canal mayor) para separar el logo del fondo
function _fgLgSrc(){return (window.baseImg&&baseImg.src)||'';}
function _fgLgActivos(){return (_fgLg.list.length&&_fgLg.src===_fgLgSrc())?_fgLg.list:[];}
function _fgLgLimpiar(){
  _fgLg.list=[];_fgLg.src=_fgLgSrc();_fgLg.sel=-1;_fgLg.proy=null;
  if(_fgProtoAct){_fgProtoAct=null;if(typeof _fgRenderOptBar==='function')_fgRenderOptBar();}
  _fgLgHistReiniciar();_fgLgBarra();_fgLgMarcas();
}
// Para fgGetVals: copia plana (el historial la guarda tal cual).
function _fgLgVals(o){
  if(_fgRecActivo()){o.recortes=JSON.parse(JSON.stringify(_fgRec.cortes));o.recBase=_estNombreImg(_fgRec.orig.src);}
  var L=_fgLgActivos();if(!L.length)return;
  o.logos=L.map(function(e){var c={};for(var k in e)c[k]=e[k];return c;});
  o.logosSrc=_fgLg.src;
}
// Alto (px de imagen) donde fgDrawAll corta el arte para abrir lugar a más
// oficiales: lo que está abajo del corte baja _fgExtra px.
function _fgLgCorte(){return _fgExtra>0?Math.round(_fgBottomYRaw(_fgCfg().contacto.ey,1)):Infinity;}
// Lo llama fgDrawAll justo después de pintar la imagen base.
// Dos pasadas: primero se tapa TODO lo que cambia y recién después se dibuja lo
// nuevo. Si no, mover el logo A al lugar del B y después tocar el B borraba al A.
function _fgLgDibujar(c,s,v){
  var L=v&&v.logos;if(!L||!L.length||v.logosSrc!==_fgLgSrc())return;
  _fgLgPintar(c,s,L,window.baseImg,_fgLgCorte(),_fgExtra);
}
// base = la imagen del flyer sobre la que se armaron los cambios; corte/extra =
// el hueco que abre fgDrawAll para más oficiales (Infinity/0 = sin hueco).
var _fgLgFallo={}; // logo → cuándo falló su descarga desde el redibujado
function _fgLgPintar(c,s,L,base,corte,extra){
  var listos=[];
  L.forEach(function(e){
    var im=null;
    if(e.tipo!=='txt'&&e.img){
      im=_fgLgImg(e.img,base);
      // Un logo que todavía no está en memoria (p. ej. al reabrir del historial)
      // se pide y se redibuja al llegar; mientras tanto queda el original.
      if(!im){
        // Si falló (el logo ya no está en galicia.ar o no hay red) no se vuelve a
        // pedir en cada redibujado (= cada tecla): como mucho una vez por minuto.
        var fk=e.img,fa=_fgLgFallo[fk];
        if(!_fgLgEsSubido(fk)&&String(fk).indexOf('orig:')!==0&&!(fa&&Date.now()-fa<60000))
          _fgLgTraer(fk).then(function(){delete _fgLgFallo[fk];if(typeof redraw==='function')redraw();}).catch(function(){_fgLgFallo[fk]=Date.now();});
        return; // subido de la PC y ya no está en memoria: queda el original
      }
    }
    var dy=(e.y>=corte)?extra:0;
    if(e.w>0&&e.h>0){
      c.fillStyle=e.bg;
      c.fillRect(Math.floor(e.x*s),Math.floor((e.y+dy)*s),Math.ceil(e.w*s)+1,Math.ceil(e.h*s)+1);
    }
    listos.push({e:e,im:im});
  });
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high'; // logos achicados sin pixelar
  listos.forEach(function(o){
    var e=o.e,dy=(e.ty+e.th/2>=corte)?extra:0;
    if(e.tipo==='txt')_fgLgTxtPintar(c,s,e,dy);
    else if(o.im)c.drawImage(o.im,Math.round(e.tx*s),Math.round((e.ty+dy)*s),Math.max(1,Math.round(e.tw*s)),Math.max(1,Math.round(e.th*s)));
  });
}
// Imagen lista para dibujar. "orig:x,y,w,h" = un logo del propio flyer que se
// movió o se agrandó: se recorta de la imagen base (siempre está a mano).
function _fgLgImg(k,base){
  k=String(k);
  if(k.indexOf('orig:')!==0)return _fgLg.imgs[k]||null;
  base=base||window.baseImg;if(!base||!base.width)return null;
  // el recorte depende de la imagen: se recuerda por imagen
  var ck=k+'|'+(base.src||''),im=_fgLg.imgs[ck];if(im)return im;
  var p=k.slice(5).split(',').map(Number);if(p.length!==4||p.some(isNaN))return null;
  var c=document.createElement('canvas');c.width=Math.max(1,p[2]);c.height=Math.max(1,p[3]);
  try{c.getContext('2d').drawImage(base,p[0],p[1],p[2],p[3],0,0,p[2],p[3]);}catch(e){return null;}
  // sin recortar los bordes: el logo movido se dibuja en una caja del tamaño del
  // recuadro original; si se le recortara el blanco (que no es parejo de todos los
  // lados), se estiraría para llenarla y saldría deformado (pasó con La Anónima)
  return (_fgLg.imgs[ck]=_fgLgLimpiarLogo(c,true));
}
// ·· Textos (como los "Martes y jueves" de los súper) ··
var _FG_LG_FUENTE='Figtree,Arial,sans-serif',_FG_LG_INTER=1.18;
function _fgLgTxtFont(e,px){return (e.peso||500)+' '+px+'px '+_FG_LG_FUENTE;}
// La letra del flyer se baja de Google Fonts: si todavía no llegó, el canvas
// usaría Arial. Se pide una vez y al llegar se redibuja.
var _fgLgFuenteOk=false;
function _fgLgFuente(){
  if(_fgLgFuenteOk||!document.fonts||!document.fonts.load)return;
  _fgLgFuenteOk=true;
  Promise.all(['500','700'].map(function(p){return document.fonts.load(p+' 40px Figtree');}))
    .then(function(){if(typeof redraw==='function')redraw();}).catch(function(){});
}
function _fgLgTxtPintar(c,s,e,dy){
  _fgLgFuente();
  var px=e.fs*s,lines=String(e.texto||'').split('\n'),n=lines.length,lh=px*_FG_LG_INTER;
  var cx=(e.tx+e.tw/2)*s,cy=(e.ty+dy+e.th/2)*s;
  c.font=_fgLgTxtFont(e,px);c.fillStyle=e.color||'#1A1A1A';c.textAlign='center';c.textBaseline='middle';
  lines.forEach(function(t,i){c.fillText(t,cx,cy+(i-(n-1)/2)*lh);});
}
// Mide el texto y le pone ancho/alto, sin moverle el centro.
var _fgLgMedCv=null;
function _fgLgTxtMedir(e){
  if(!_fgLgMedCv)_fgLgMedCv=document.createElement('canvas');
  var g=_fgLgMedCv.getContext('2d'),lines=String(e.texto||'').split('\n'),w=0;
  g.font=_fgLgTxtFont(e,e.fs);
  lines.forEach(function(t){w=Math.max(w,g.measureText(t).width);});
  var cx=(e.tw!=null)?e.tx+e.tw/2:e.tx,cy=(e.th!=null)?e.ty+e.th/2:e.ty;
  e.tw=Math.max(4,Math.ceil(w)+4);e.th=Math.max(4,Math.ceil(lines.length*e.fs*_FG_LG_INTER));
  e.tx=cx-e.tw/2;e.ty=cy-e.th/2;
}
// Cuántos renglones tiene lo que hay en el recuadro. Se cuenta la tinta de cada
// fila: entre renglón y renglón casi no hay (sólo la cola de una "y" o el
// palito de una "j"), así que una fila con menos del 8% de la más cargada
// cuenta como separación.
function _fgLgRenglones(det){
  try{
    var d=_fgLgPixeles(det.x,det.y,det.w,det.h),bg=String(det.bg).match(/\d+/g).map(Number),cnt=[],max=0,y,x,p,c;
    for(y=0;y<det.h;y++){
      c=0;
      for(x=0;x<det.w;x++){p=(y*det.w+x)*4;if(Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]))>_FG_LG_TOL)c++;}
      cnt.push(c);if(c>max)max=c;
    }
    // un renglón = al menos 5 filas seguidas con tinta (el punto de una "j" o un acento sueltos no cuentan)
    var umbral=Math.max(1,max*0.08),n=0,seguidas=0;
    cnt.concat([0]).forEach(function(c){if(c>umbral)seguidas++;else{if(seguidas>=5)n++;seguidas=0;}});
    return Math.max(1,Math.min(6,n));
  }catch(e){return 1;}
}
// Color que más se repite en lo que NO es fondo: el del texto original, para
// que el texto nuevo salga igual.
function _fgLgColorDe(det){
  try{
    var d=_fgLgPixeles(det.x,det.y,det.w,det.h),bg=String(det.bg).match(/\d+/g).map(Number),cnt={},best=null,bn=0,i;
    for(i=0;i<d.length;i+=4){
      if(Math.max(Math.abs(d[i]-bg[0]),Math.abs(d[i+1]-bg[1]),Math.abs(d[i+2]-bg[2]))<=120)continue; // bordes suavizados: no
      var k=(d[i]>>3)+'|'+(d[i+1]>>3)+'|'+(d[i+2]>>3),n=(cnt[k]||0)+1;cnt[k]=n;if(n>bn){bn=n;best=k;}
    }
    if(!best)return null;
    var p=best.split('|').map(function(x){return Math.min(255,(+x<<3)+4);});
    return '#'+p.map(function(x){return ('0'+x.toString(16)).slice(-2);}).join('');
  }catch(e){return null;}
}
// Píxeles de un recuadro de la imagen original (px reales).
function _fgLgPixeles(x0,y0,w,h){
  var k=document.createElement('canvas');k.width=w;k.height=h;
  var g=k.getContext('2d',{willReadFrequently:true});
  g.drawImage(baseImg,x0,y0,w,h,0,0,w,h);
  return g.getImageData(0,0,w,h).data;
}
// Color de fondo = el que más se repite (agrupado de a 16 tonos por canal) y,
// dentro de ese grupo, el promedio exacto. En la franja de marcas es el blanco
// de la tarjeta aunque el recuadro agarre un pedazo del crema de afuera.
function _fgLgFondo(d){
  var cnt=Object.create(null),best=null,bn=0,i,k;
  for(i=0;i<d.length;i+=8){
    k=(d[i]>>4)+'|'+(d[i+1]>>4)+'|'+(d[i+2]>>4);
    var n=(cnt[k]||0)+1;cnt[k]=n;if(n>bn){bn=n;best=k;}
  }
  var r=0,g=0,b=0,m=0;
  for(i=0;i<d.length;i+=8){
    if((d[i]>>4)+'|'+(d[i+1]>>4)+'|'+(d[i+2]>>4)!==best)continue;
    r+=d[i];g+=d[i+1];b+=d[i+2];m++;
  }
  return m?[Math.round(r/m),Math.round(g/m),Math.round(b/m)]:[255,255,255];
}
function _fgLgRgb(c){return 'rgb('+c[0]+','+c[1]+','+c[2]+')';}
// Busca el logo que hay en (ix,iy), px de la imagen original. Devuelve
// {x,y,w,h,bg,win} o {error:'nada'|'grande'}.
function _fgLgDetectar(ix,iy){
  var W=baseImg.width,H=baseImg.height;
  var x0=Math.max(0,Math.round(ix-330)),y0=Math.max(0,Math.round(iy-230));
  var x1=Math.min(W,Math.round(ix+330)),y1=Math.min(H,Math.round(iy+230));
  var w=x1-x0,h=y1-y0;if(w<30||h<30)return {error:'nada'};
  var d=_fgLgPixeles(x0,y0,w,h),bg=_fgLgFondo(d);
  // Grilla de celdas de 3 px: una celda "tiene logo" si algún píxel se aparta del fondo.
  var CS=3,cw=Math.ceil(w/CS),ch=Math.ceil(h/CS),on=new Uint8Array(cw*ch),x,y,p;
  for(y=0;y<h;y++){
    var fila=((y/CS)|0)*cw;
    for(x=0;x<w;x++){
      p=(y*w+x)*4;
      if(Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]))>_FG_LG_TOL)on[fila+((x/CS)|0)]=1;
    }
  }
  // Arranque: la celda tocada o la más cercana con logo (hasta ~30 px).
  var sx=Math.min(cw-1,Math.max(0,Math.floor((ix-x0)/CS))),sy=Math.min(ch-1,Math.max(0,Math.floor((iy-y0)/CS))),semilla=-1;
  for(var rad=0;rad<=10&&semilla<0;rad++){
    for(var dy=-rad;dy<=rad&&semilla<0;dy++)for(var dx=-rad;dx<=rad;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==rad)continue;
      var qx=sx+dx,qy=sy+dy;if(qx<0||qy<0||qx>=cw||qy>=ch)continue;
      if(on[qy*cw+qx]){semilla=qy*cw+qx;break;}
    }
  }
  if(semilla<0)return {error:'nada'};
  // Componente: celdas con logo a menos de R celdas una de otra.
  var R=Math.ceil(_FG_LG_GAP/CS),comp=new Uint8Array(cw*ch),cola=[semilla],bx0=cw,by0=ch,bx1=-1,by1=-1;
  comp[semilla]=1;
  while(cola.length){
    var c=cola.pop(),cx=c%cw,cy=(c/cw)|0;
    if(cx<bx0)bx0=cx;if(cx>bx1)bx1=cx;if(cy<by0)by0=cy;if(cy>by1)by1=cy;
    for(var ny=Math.max(0,cy-R);ny<=Math.min(ch-1,cy+R);ny++)for(var nx=Math.max(0,cx-R);nx<=Math.min(cw-1,cx+R);nx++){
      var q=ny*cw+nx;if(on[q]&&!comp[q]){comp[q]=1;cola.push(q);}
    }
  }
  var toca=(bx0===0&&x0>0)||(by0===0&&y0>0)||(bx1===cw-1&&x1<W)||(by1===ch-1&&y1<H);
  var bw=(bx1-bx0+1)*CS,bh=(by1-by0+1)*CS;
  if(toca||bw>560||bh>380)return {error:'grande'};
  if(bw<8&&bh<8)return {error:'nada'};
  return {x:x0+bx0*CS,y:y0+by0*CS,w:Math.min(bw,w-bx0*CS),h:Math.min(bh,h-by0*CS),bg:_fgLgRgb(bg),
          win:{x0:x0,y0:y0,cw:cw,ch:ch,CS:CS,on:on,comp:comp}};
}
// Recuadro marcado a mano (arrastrando): el fondo sale del borde del recuadro.
function _fgLgManual(x,y,w,h){
  x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));
  w=Math.min(baseImg.width-x,Math.round(w));h=Math.min(baseImg.height-y,Math.round(h));
  if(w<6||h<6)return null;
  var d=_fgLgPixeles(x,y,w,h),borde=[],i;
  for(i=0;i<w;i++){borde.push(i,(h-1)*w+i);}
  for(i=0;i<h;i++){borde.push(i*w,i*w+w-1);}
  var px=new Uint8ClampedArray(borde.length*4);
  borde.forEach(function(o,j){px[j*4]=d[o*4];px[j*4+1]=d[o*4+1];px[j*4+2]=d[o*4+2];});
  var bg=_fgLgFondo(px),dibujo=0;
  for(i=0;i<d.length;i+=4){if(Math.max(Math.abs(d[i]-bg[0]),Math.abs(d[i+1]-bg[1]),Math.abs(d[i+2]-bg[2]))>_FG_LG_TOL)dibujo++;}
  // corta: el borde del recuadro pasa por encima de un dibujo (lo taparía a medias)
  var enBorde=0;
  borde.forEach(function(o){if(Math.max(Math.abs(d[o*4]-bg[0]),Math.abs(d[o*4+1]-bg[1]),Math.abs(d[o*4+2]-bg[2]))>_FG_LG_TOL)enBorde++;});
  // vacio: no hay nada que tapar (se agrega un logo en un lugar libre)
  return {x:x,y:y,w:w,h:h,bg:_fgLgRgb(bg),manual:true,vacio:dibujo<w*h*0.002,corta:enBorde>borde.length*0.02};
}
// ¿El recuadro (px de imagen, con 8 px de aire) está libre de OTRO dibujo? El
// propio logo que se tapa no cuenta. Fuera de la ventana analizada: no se sabe → no.
function _fgLgLibre(det,x,y,w,h){
  var W=det.win;if(!W)return false;
  var m=8,a=Math.floor((x-m-W.x0)/W.CS),b=Math.floor((y-m-W.y0)/W.CS),c=Math.ceil((x+w+m-W.x0)/W.CS),e=Math.ceil((y+h+m-W.y0)/W.CS);
  if(a<0||b<0||c>W.cw||e>W.ch)return false;
  for(var j=b;j<e;j++)for(var i=a;i<c;i++){var q=j*W.cw+i;if(W.on[q]&&!W.comp[q])return false;}
  return true;
}
// Dónde va el logo nuevo: encajado en el lugar del viejo, sin estirarlo. Si por
// la forma queda mucho más chico (uno cuadrado en el lugar de uno apaisado),
// crece de a poco mientras tenga fondo libre alrededor y hasta ocupar más o
// menos la misma superficie que el original.
function _fgLgDestino(det,asp){
  var cx=det.x+det.w/2,cy=det.y+det.h/2;
  var tw=det.w,th=tw/asp;if(th>det.h){th=det.h;tw=th*asp;}
  var area=det.w*det.h,bw=tw,bh=th;
  for(var k=1.05;k<=1.9;k+=0.05){
    var w2=tw*k,h2=th*k;
    if(w2*h2>area*1.1)break;
    if(!_fgLgLibre(det,cx-w2/2,cy-h2/2,w2,h2))break;
    bw=w2;bh=h2;
  }
  return {tx:cx-bw/2,ty:cy-bh/2,tw:bw,th:bh};
}
// Trae un logo del catálogo de Galicia y lo deja listo para dibujar: el fondo
// del PNG (el color de las esquinas, blanco casi siempre) pasa a transparente
// llenando desde los bordes —así no se come letras blancas de adentro— y se
// recorta el margen vacío, para que el logo ocupe su lugar y no un cuadrado con aire.
function _fgLgTraer(file){
  if(_fgLg.imgs[file])return Promise.resolve(_fgLg.imgs[file]);
  if(_fgLg.carga[file])return _fgLg.carga[file];
  var p=fetch(PROMO_LOGO_BASE+file).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();
  }).then(function(b){
    return new Promise(function(res,rej){
      var u=URL.createObjectURL(b),i=new Image();
      i.onload=function(){URL.revokeObjectURL(u);res(i);};
      i.onerror=function(){URL.revokeObjectURL(u);rej(new Error('imagen'));};
      i.src=u;
    });
  }).then(function(i){
    var cv2=_fgLgLimpiarLogo(i);_fgLg.imgs[file]=cv2;delete _fgLg.carga[file];return cv2;
  },function(e){delete _fgLg.carga[file];throw e;});
  _fgLg.carga[file]=p;
  return p;
}
// Achica una imagen de a la mitad por vez (achicar de una sola pasada pixela
// las letras finas) y con el suavizado de mejor calidad.
function _fgLgAchicar(src,w,h){
  var cur=src,cw=src.naturalWidth||src.width,ch=src.naturalHeight||src.height;
  while(cw/2>=w&&ch/2>=h){
    var t=document.createElement('canvas');t.width=Math.round(cw/2);t.height=Math.round(ch/2);
    var gt=t.getContext('2d');gt.imageSmoothingQuality='high';gt.drawImage(cur,0,0,t.width,t.height);
    cur=t;cw=t.width;ch=t.height;
  }
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(cur,0,0,w,h);
  return c;
}
// ¿El logo es casi todo blanco? (versión para fondos oscuros)
function _fgLgEsBlanco(cv){
  try{
    var d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,n=0,cl=0;
    for(var p=0;p<d.length;p+=16){if(d[p+3]<128)continue;n++;if(d[p]>225&&d[p+1]>225&&d[p+2]>225)cl++;}
    return n>20&&cl>n*0.85;
  }catch(e){return false;}
}
// Logos subidos desde la PC (marcas que no están en Promociones): quedan sólo en
// la memoria de esta pestaña, con una clave propia que nunca va a Galicia.
var _fgLgSubidos=0;
function _fgLgEsSubido(k){return String(k).indexOf('pc:')===0;}
function _fgLgLeerArchivo(f){
  return new Promise(function(res,rej){
    if(!f)return rej(new Error('sin archivo'));
    if(!/^image\/(png|jpeg|webp)$/.test(f.type))return rej(new Error('formato'));
    if(f.size>8*1024*1024)return rej(new Error('pesado'));
    var u=URL.createObjectURL(f),i=new Image();
    i.onload=function(){
      URL.revokeObjectURL(u);
      // Una foto enorme no hace falta: el logo en el flyer mide unos cientos de px.
      var w=i.naturalWidth,h=i.naturalHeight,k=Math.min(1,1200/Math.max(w,h));
      var c=_fgLgAchicar(i,Math.max(1,Math.round(w*k)),Math.max(1,Math.round(h*k)));
      var limpio=_fgLgLimpiarLogo(c),clave='pc:'+(++_fgLgSubidos)+':'+f.name;
      if(_fgLgEsBlanco(limpio))showToast('Ese logo es blanco (para fondos oscuros): sobre el flyer casi no se va a ver. Si podés, subí la versión a color.');
      _fgLg.imgs[clave]=limpio;
      res({clave:clave,nombre:f.name.replace(/\.[a-z0-9]+$/i,''),logo:limpio});
    };
    i.onerror=function(){URL.revokeObjectURL(u);rej(new Error('imagen'));};
    i.src=u;
  });
}
// En un PNG transparente: si adentro hay un recuadro blanco grande (su caja
// ocupa más del 25% de la imagen y la mancha llena al menos el 40% de esa caja:
// el logo de adentro le deja huecos), se borra. Las letras blancas sueltas no
// cumplen eso (cada una es chica) y se quedan.
function _fgLgSinParche(d,w,h){
  var visto=new Uint8Array(w*h),blanco=function(q){var o=q*4;return d[o+3]>200&&d[o]>235&&d[o+1]>235&&d[o+2]>235;};
  for(var q0=0;q0<w*h;q0++){
    if(visto[q0]||!blanco(q0))continue;
    var comp=[],cola=[q0],x0=w,y0=h,x1=0,y1=0;visto[q0]=1;
    while(cola.length){
      var q=cola.pop(),x=q%w,y=(q/w)|0;comp.push(q);
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1].forEach(function(n){if(n>=0&&!visto[n]&&blanco(n)){visto[n]=1;cola.push(n);}});
    }
    var caja=(x1-x0+1)*(y1-y0+1);
    if(caja>=w*h*0.25&&comp.length>=caja*0.4)comp.forEach(function(q){d[q*4+3]=0;});
  }
}
function _fgLgLimpiarLogo(i,sinRecorte){
  var w=i.naturalWidth||i.width,h=i.naturalHeight||i.height;
  var k=document.createElement('canvas');k.width=w;k.height=h;
  var g=k.getContext('2d',{willReadFrequently:true});g.drawImage(i,0,0);
  var im=g.getImageData(0,0,w,h),d=im.data,x,y,p;
  // Fondo de referencia: el de las esquinas si son opacas; si no, blanco (hay
  // PNG transparentes con un recuadro blanco adentro, que en un flyer crema se
  // vería como un parche).
  var esq=[0,(w-1)*4,(h-1)*w*4,((h-1)*w+w-1)*4].filter(function(o){return d[o+3]>200;});
  var ref=esq.length>=3?[0,1,2].map(function(c){var v=esq.map(function(o){return d[o+c];}).sort(function(a,b){return a-b;});return v[v.length>>1];}):[255,255,255];
  // Un PNG que YA trae el fondo transparente (la mayor parte del borde) no se
  // limpia entero: llenar desde los bordes se comía las letras claras y dejaba
  // sólo el contorno dentado (pasó con un logo de Toledo subido de la PC). Sólo
  // se le saca un recuadro blanco grande de adentro, si lo tiene (_fgLgSinParche).
  var borde=0,transp=0;
  for(x=0;x<w;x++){borde+=2;if(d[x*4+3]<=24)transp++;if(d[((h-1)*w+x)*4+3]<=24)transp++;}
  for(y=0;y<h;y++){borde+=2;if(d[y*w*4+3]<=24)transp++;if(d[(y*w+w-1)*4+3]<=24)transp++;}
  var lum=function(r,g2,b){return 0.3*r+0.59*g2+0.11*b;},lr=lum(ref[0],ref[1],ref[2]);
  if(transp>=borde*0.3)_fgLgSinParche(d,w,h);
  else if(lr<150){
    // Fondo OSCURO (p. ej. Toledo: letras blancas en un cuadrado azul). Sacarle el
    // fondo dejaba letras blancas sobre el flyer blanco (sólo se veían los bordes).
    // Si lo de adentro es claro, se pinta del color del fondo y el fondo se va:
    // "Toledo" en azul, con bordes suaves. Si tiene colores, queda el cuadrado.
    var tinta=0,claras=0;
    for(p=0;p<w*h*4;p+=4){
      if(Math.max(Math.abs(d[p]-ref[0]),Math.abs(d[p+1]-ref[1]),Math.abs(d[p+2]-ref[2]))<=60)continue;
      tinta++;if(d[p]>190&&d[p+1]>190&&d[p+2]>190)claras++;
    }
    if(tinta&&claras>=tinta*0.8){
      for(p=0;p<w*h*4;p+=4){
        var a2=Math.max(0,Math.min(1,(lum(d[p],d[p+1],d[p+2])-lr-12)/(255-lr-24)));
        d[p]=ref[0];d[p+1]=ref[1];d[p+2]=ref[2];d[p+3]=Math.round(d[p+3]*a2);
      }
    }
  }
  else{
    var visto=new Uint8Array(w*h),cola=[];
    var esFondo=function(q){var o=q*4;return d[o+3]<=24||(Math.abs(d[o]-ref[0])<=28&&Math.abs(d[o+1]-ref[1])<=28&&Math.abs(d[o+2]-ref[2])<=28);};
    for(x=0;x<w;x++){cola.push(x,(h-1)*w+x);}
    for(y=0;y<h;y++){cola.push(y*w,y*w+w-1);}
    while(cola.length){
      var q=cola.pop();if(visto[q])continue;visto[q]=1;
      if(!esFondo(q))continue;
      d[q*4+3]=0;
      x=q%w;y=(q/w)|0;
      if(x>0)cola.push(q-1);if(x<w-1)cola.push(q+1);if(y>0)cola.push(q-w);if(y<h-1)cola.push(q+w);
    }
    // Bordes suaves: los píxeles del borde del dibujo son mezcla de tinta y fondo.
    // Se les da transparencia según cuánto se parecen al fondo y se les quita el
    // fondo del color (si no, queda un halo dentado del color del fondo viejo).
    for(y=0;y<h;y++)for(x=0;x<w;x++){
      var q2=y*w+x,o=q2*4;if(d[o+3]===0)continue;
      if(!((x>0&&d[o-1]===0)||(x<w-1&&d[o+7]===0)||(y>0&&d[o-w*4+3]===0)||(y<h-1&&d[o+w*4+3]===0)))continue;
      var dif=Math.max(Math.abs(d[o]-ref[0]),Math.abs(d[o+1]-ref[1]),Math.abs(d[o+2]-ref[2]));
      if(dif>=110)continue;
      var a=Math.max(0.15,dif/110);
      for(var c3=0;c3<3;c3++)d[o+c3]=Math.max(0,Math.min(255,Math.round((d[o+c3]-ref[c3]*(1-a))/a)));
      d[o+3]=Math.round(d[o+3]*a);
    }
  }
  g.putImageData(im,0,0);
  if(sinRecorte)return k;
  var x0=w,y0=h,x1=-1,y1=-1;
  for(y=0;y<h;y++)for(x=0;x<w;x++){
    p=(y*w+x)*4;if(d[p+3]<=24)continue;
    if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
  }
  if(x1<0)return k;
  var out=document.createElement('canvas');out.width=x1-x0+1;out.height=y1-y0+1;
  out.getContext('2d').drawImage(k,x0,y0,out.width,out.height,0,0,out.width,out.height);
  return out;
}

// ·· Pantalla ··
// Botón "Cambiar logos" arriba a la derecha de la vista previa. Prendido, tocar
// el flyer busca el logo y abre la ventana para elegir el reemplazo; arrastrar
// marca un recuadro a mano. Los logos ya cambiados se ven con un borde punteado
// (sólo en este modo: el flyer descargado es el canvas, sin bordes).
function _fgLgInit(){
  var prev=document.querySelector('.prev'),cw=prev&&prev.querySelector('.cw');
  if(!prev||!cw||document.getElementById('fg-lg-bar'))return;
  var bar=document.createElement('div');bar.id='fg-lg-bar';bar.className='fg-lg-bar';
  bar.innerHTML='<span class="fg-lg-tip" id="fg-lg-tip" hidden>Toc&aacute; un logo o un texto para cambiarlo o moverlo. Arrastr&aacute; un recuadro en un lugar libre para agregar. Con <b>Shift</b> eleg&iacute;s varios y los mov&eacute;s juntos.</span>'+
    '<span class="fg-lg-hist"><button type="button" class="fg-lg-undo fg-lg-hb" id="fg-lg-desh" onclick="fgLgDeshacer()" hidden disabled aria-label="Deshacer">'+
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg><span>Deshacer</span></button>'+
    '<button type="button" class="fg-lg-undo fg-lg-hb" id="fg-lg-reh" onclick="fgLgRehacer()" hidden disabled aria-label="Rehacer">'+
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg><span>Rehacer</span></button></span>'+
    '<button type="button" class="fg-lg-undo fg-lg-ver" id="fg-lg-ver" onclick="fgLgLimpio()" hidden aria-pressed="false" title="Ver el flyer tal como se va a descargar, sin marcas">'+
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span id="fg-lg-ver-t">Vista previa</span></button>'+
    '<button type="button" class="fg-lg-undo fg-lg-nbor" id="fg-lg-nbor" onclick="fgBorradorNuevo()" hidden title="Abre otra pesta&ntilde;a con el flyer limpio para armar una versi&oacute;n en paralelo">+ Nuevo borrador</button>'+
    '<button type="button" class="fg-lg-undo fg-lg-rec" id="fg-lg-rec" onclick="fgRecModo()" hidden title="Quitar una parte del flyer (por ejemplo, la de los importes): lo de abajo sube y se une">Recortar</button>'+
    '<span class="fg-lg-proy fg-rec-chip" id="fg-rec-chip" hidden></span>'+
    '<button type="button" class="fg-lg-undo fg-lg-franja" id="fg-lg-franja" onclick="fgFranjaModo()" hidden title="Rehacer toda una franja de logos de una vez, eligiendo marcas de Promociones">Armar franja</button>'+
    '<button type="button" class="fg-lg-undo" id="fg-lg-undo" onclick="fgLogosDeshacer()" hidden>Volver todos al original</button>'+
    '<span class="fg-lg-proy" id="fg-lg-proy" hidden></span>'+
    '<button type="button" class="fg-lg-undo fg-lg-guardar" id="fg-lg-guardar" onclick="fgEstGuardar()" hidden>Guardar en Estudio</button>'+
    '<button type="button" class="fg-lg-btn" id="fg-lg-btn" onclick="fgLogosModo()" aria-pressed="false" title="Cambiar un logo de marca del flyer por otro de Promociones (s&oacute;lo para este flyer)">'+
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> '+
      '<span id="fg-lg-btn-t">Cambiar logos</span></button>';
  prev.insertBefore(bar,cw); // en el celular queda arriba del flyer, debajo del zoom
  var capa=document.createElement('div');capa.id='fg-lg-capa';capa.className='fg-lg-capa';
  cw.appendChild(capa);
  var cvs=document.getElementById('cv');if(!cvs)return;
  // Mouse: clic = buscar el logo; arrastrar = recuadro a mano. Sobre un logo YA
  // cambiado: clic = elegirlo (aparece la barrita de tamaño) y arrastrar = moverlo.
  // Dedo: sólo tocar (arrastrar con el dedo sigue recorriendo la página, como
  // siempre); para mover en el celular están las flechas de la barrita.
  var ini=null;
  cvs.addEventListener('pointerdown',function(e){
    if(!_fgLg.on||_fgLg.limpio||e.button!==0)return; // en "Vista previa" (fgLgLimpio) el flyer no se toca
    var p=_fgLgAImagen(e.clientX,e.clientY),i=p?_fgLgLogoEn(p.x,p.y):-1;
    // en modo franja el dedo también marca el recuadro (si no, arrastrar recorre la página)
    var esp=_fgFr.modo||_fgRecM.modo; // modos de marcar una zona: el dedo también marca
    // logos del flyer elegidos con Shift (sin cambiar): al agarrar uno de ellos o
    // uno del grupo, pasan a ser movibles y se arrastran todos juntos
    // (recién al empezar a arrastrar: un clic suelto no crea cambios)
    var juntar=false;
    if(!esp&&p&&(_fgLg.lugares||[]).length&&e.pointerType!=='touch'){
      var enLugar=_fgLg.lugares.some(function(d){return p.x>=d.x&&p.x<=d.x+d.w&&p.y>=d.y&&p.y<=d.y+d.h;});
      juntar=enLugar||(i>=0&&_fgLgElegidos().indexOf(i)>=0);
    }
    ini={x:e.clientX,y:e.clientY,touch:e.pointerType==='touch'&&!esp,mov:false,logo:esp?-1:i,shift:!!e.shiftKey&&!esp,rec:_fgRecM.modo,juntar:juntar?p:null};
    if(i>=0&&ini.logo>=0){
      // si toca uno que ya es parte de lo elegido, arrastra a todos; si no, sólo a ese
      var g=_fgLgElegidos(),As=_fgLgActivos();
      if(g.indexOf(i)<0)g=ini.shift?g.concat([i]):[i];
      ini.pos=g.map(function(j){return {i:j,tx:As[j].tx,ty:As[j].ty};});
      _fgLg.arrastre=true;
    }
    if(!ini.touch){e.preventDefault();e.stopPropagation();}
  });
  cvs.addEventListener('mousedown',function(e){if(_fgLg.on&&!_fgLg.limpio){e.stopPropagation();e.preventDefault();}}); // sin esto, la vista previa se "agarra" para recorrer
  // doble clic sobre un logo ya cambiado: abre la ventana para cambiarlo
  cvs.addEventListener('dblclick',function(e){
    if(!_fgLg.on||_fgLg.limpio||_fgFr.modo||_fgRecM.modo||document.getElementById('fg-lg-ov'))return;
    var p=_fgLgAImagen(e.clientX,e.clientY),i=p?_fgLgLogoEn(p.x,p.y):-1;if(i<0)return;
    e.preventDefault();e.stopPropagation();
    _fgLg.sel=i;_fgLg.grupo=[];_fgLg.lugares=[];_fgLgMarcas();_fgLgCambiarMarca();
  });
  document.addEventListener('pointermove',function(e){
    if(!ini){
      // la cruz de "mover" sobre los logos ya cambiados
      if(_fgLg.on&&!_fgLg.limpio&&e.target===cvs&&e.pointerType!=='touch'){var q=_fgLgAImagen(e.clientX,e.clientY);cvs.style.cursor=(q&&_fgLgLogoEn(q.x,q.y)>=0)?'move':'';}
      _fgLgCerca(e.target===cvs&&e.pointerType!=='touch'?e:null);
      return;
    }
    if(Math.abs(e.clientX-ini.x)+Math.abs(e.clientY-ini.y)>8)ini.mov=true;
    if(!ini.mov||ini.touch)return;
    if(ini.juntar){
      // empezó a arrastrar sobre lo elegido con Shift: los del flyer pasan a ser movibles
      var q0=ini.juntar;ini.juntar=null;
      _fgLgLugaresAMovibles();
      var j0=_fgLgLogoEn(q0.x,q0.y),As0=_fgLgActivos();
      if(j0>=0){
        ini.logo=j0;ini.pos=_fgLgElegidos().map(function(j){return {i:j,tx:As0[j].tx,ty:As0[j].ty};});
        _fgLg.arrastre=true;
      }
    }
    if(ini.logo>=0){
      var As=_fgLgActivos();if(!As[ini.logo])return;
      if(!ini.grupoListo){ini.grupoListo=true;_fgLg.grupo=ini.pos.map(function(p){return p.i;});_fgLg.sel=ini.logo;}
      var k=_fgLgEscala(),dx=(e.clientX-ini.x)/k,dy=(e.clientY-ini.y)/k,G=null;
      // guías: se pega a la línea más cercana (con Alt, sin imán)
      if(!e.altKey){G=_fgLgGuias(ini.pos,ini.logo,dx,dy,k);dx+=G.dx;dy+=G.dy;}
      ini.pos.forEach(function(p){var L=As[p.i];if(L){L.tx=p.tx+dx;L.ty=p.ty+dy;}});
      _fgLgGuiasPintar(G?G.lineas:[]);
      _fgLgRedibujarPronto();
    }else if(ini.rec)_fgRecBanda(ini.y,e.clientY);
    else _fgLgSel(ini.x,ini.y,e.clientX,e.clientY);
  });
  document.addEventListener('pointerup',function(e){
    if(!ini)return;var a=ini;ini=null;_fgLgGuiasPintar([]);
    if(_fgLg.arrastre){_fgLg.arrastre=false;_fgLgHistPronto();}
    if(a.touch&&a.mov)return;
    if(a.logo>=0){
      if(a.mov){_fgLgListo();return;}
      if(a.shift)_fgLgGrupoTocar(a.logo);
      else{var g0=_fgLgElegidos();if(g0.indexOf(a.logo)<0||g0.length<2)_fgLg.grupo=[];_fgLg.sel=a.logo;_fgLg.lugares=[];}
      _fgLgListo();return;
    }
    if(a.rec){
      if(!a.mov){_fgRecBanda(null);showToast('Arrastrá de arriba hacia abajo sobre la parte que querés quitar.');return;}
      fgRecModo(false);_fgRecDesdeArrastre(a.y,e.clientY);return;
    }
    if(_fgFr.modo){
      _fgLgSel(null);
      if(!a.mov){showToast('Arrastrá un recuadro alrededor de TODA la franja de logos.');return;}
      fgFranjaModo(false);_fgFrDesdeRecuadro(a.x,a.y,e.clientX,e.clientY);return;
    }
    if(a.mov&&a.shift){_fgLgSel(null);_fgLgElegirVarios(a.x,a.y,e.clientX,e.clientY);return;}
    if(a.mov){_fgLgSel(null);_fgLgElegirRecuadro(a.x,a.y,e.clientX,e.clientY);}
    else if(a.shift)_fgLgLugarTocar(a.x,a.y); // Shift + clic en un logo del flyer: se suma a lo elegido
    else{_fgLg.sel=-1;_fgLg.lugares=[];_fgLgMarcas();_fgLgElegirPunto(a.x,a.y);}
  });
  // gesto interrumpido (el dedo pasó a recorrer la página, etc.): se suelta todo
  document.addEventListener('pointercancel',function(){
    if(!ini)return;var a0=ini;ini=null;_fgLgSel(null);_fgLgGuiasPintar([]);if(a0.rec)_fgRecBanda(null);
    if(_fgLg.arrastre){_fgLg.arrastre=false;_fgLgListo();}
  });
  // Ctrl+Z = deshacer; Ctrl+Y o Ctrl+Shift+Z = rehacer. Sólo con el modo prendido,
  // sin ventanas abiertas y fuera de los campos de texto (ahí es el del navegador).
  document.addEventListener('keydown',function(e){
    if(!_fgLg.on||!(e.ctrlKey||e.metaKey)||e.altKey)return;
    if(document.getElementById('fg-lg-ov')||document.getElementById('fg-fr-ov'))return;
    var t=e.target&&e.target.tagName;
    if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||(e.target&&e.target.isContentEditable))return;
    var k=String(e.key||'').toLowerCase();
    if(k==='z'&&!e.shiftKey){e.preventDefault();fgLgDeshacer();}
    else if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();fgLgRehacer();}
    else if(k==='c'&&!_fgLg.limpio){var tx='';try{tx=String(window.getSelection&&window.getSelection()||'');}catch(x){}if(!tx&&_fgLgCopiar())e.preventDefault();} // con texto marcado en la página, copia ese texto (lo normal)
    else if(k==='v'&&!_fgLg.limpio&&_fgLg.copia){e.preventDefault();_fgLgPegar();}
  });
  // Escape sale de "Vista previa" (fgLgLimpio) y del modo recorte
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&_fgRecM.modo&&!document.getElementById('fg-rec-conf')){e.preventDefault();fgRecModo(false);return;}
    if(e.key==='Escape'&&_fgLg.limpio&&!document.getElementById('fg-lg-ov')&&!document.getElementById('fg-fr-ov')){e.preventDefault();fgLgLimpio(false);}
  });
  // Con logos del flyer elegidos con Shift (sin cambios todavía): Escape los
  // suelta y Supr los borra junto con lo demás elegido.
  document.addEventListener('keydown',function(e){
    if(!_fgLg.on||_fgLg.limpio||!(_fgLg.lugares||[]).length||document.getElementById('fg-lg-ov'))return;
    var t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
    if(e.key==='Escape'){_fgLg.lugares=[];_fgLg.sel=-1;_fgLg.grupo=[];_fgLgMarcas();}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();_fgLgGrpAccion('borrar');}
  },true);
  // Flechas = mover el logo elegido 1 px (con Shift, 10). Escape = soltarlo.
  document.addEventListener('keydown',function(e){
    if(_fgLg.limpio)return;
    if(!_fgLg.on||_fgLg.sel<0||document.getElementById('fg-lg-ov'))return;
    var t=e.target&&e.target.tagName;
    if((t==='INPUT'&&e.target.type!=='range')||t==='TEXTAREA'||t==='SELECT')return;
    if(e.key==='Escape'){_fgLg.sel=-1;_fgLg.grupo=[];_fgLgMarcas();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&!(e.target&&e.target.type==='range')){e.preventDefault();_fgLgBorrarElegidos();return;}
    var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;
    e.preventDefault();_fgLgMover(d[0]*(e.shiftKey?10:1),d[1]*(e.shiftKey?10:1));
  });
}
// ·· Guías al mover ··
// Mientras se arrastra, el recuadro de lo que se mueve (bordes y centro) se
// compara con los bordes y centros de los demás logos cambiados, con el centro
// del flyer y con el centro del lugar original del logo tocado. Si queda a menos
// de 6 px de pantalla, se pega y se muestra la línea.
function _fgLgGuias(pos,principal,dx,dy,k){
  var As=_fgLgActivos(),mueve={},x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  pos.forEach(function(p){var L=As[p.i];if(!L)return;mueve[p.i]=1;
    x0=Math.min(x0,p.tx+dx);y0=Math.min(y0,p.ty+dy);x1=Math.max(x1,p.tx+dx+L.tw);y1=Math.max(y1,p.ty+dy+L.th);});
  var cx=[],cy=[];
  As.forEach(function(L,i){if(mueve[i]||!_fgLgAjustable(L))return;cx.push(L.tx,L.tx+L.tw/2,L.tx+L.tw);cy.push(L.ty,L.ty+L.th/2,L.ty+L.th);});
  if(window.baseImg&&baseImg.width)cx.push(baseImg.width/2);
  var P=As[principal];if(P&&P.ow){cx.push(P.ox+P.ow/2);cy.push(P.oy+P.oh/2);}
  var umbral=6/k;
  function mejor(mios,cands){
    var b=null;
    mios.forEach(function(m){cands.forEach(function(c){var d=c-m;if(Math.abs(d)<=umbral&&(!b||Math.abs(d)<Math.abs(b.d)))b={d:d,c:c};});});
    return b;
  }
  var bx=mejor([x0,(x0+x1)/2,x1],cx),by=mejor([y0,(y0+y1)/2,y1],cy),lineas=[];
  if(bx)lineas.push({v:bx.c,d:bx.d});if(by)lineas.push({h:by.c,d:by.d});
  return {dx:bx?bx.d:0,dy:by?by.d:0,lineas:lineas};
}
function _fgLgGuiasPintar(lineas){
  var capa=document.getElementById('fg-lg-capa');if(!capa)return;
  var g=document.getElementById('fg-lg-guias');
  if(!lineas.length){if(g)g.innerHTML='';return;}
  if(!g){g=document.createElement('div');g.id='fg-lg-guias';capa.appendChild(g);}
  g.innerHTML=lineas.map(function(l){
    var cl=(l.cerca?' cerca':'')+(l.tecla?' tecla':''); // con el teclado: "cerca" = todavía no está justo alineado
    if(l.v!=null){var p=_fgLgAPantalla(l.v,0,0,0);return '<div class="fg-lg-guia v'+cl+'" style="left:'+p.l.toFixed(1)+'px"></div>';}
    var q=_fgLgAPantalla(0,l.h,0,0);return '<div class="fg-lg-guia h'+cl+'" style="top:'+q.t.toFixed(1)+'px"></div>';
  }).join('');
}
// Lo que se puede mover y agrandar: un logo (de Promociones, de la PC o del
// propio flyer) o un texto. Un lugar "dejado vacío" no.
function _fgLgAjustable(e){return !!(e&&(e.tipo==='txt'||e.img));}
// Escala pantalla/imagen: cuántos px de pantalla mide 1 px de la imagen.
function _fgLgEscala(){var c=document.getElementById('cv'),r=c.getBoundingClientRect();return (r.width/c.width)*SC;}
// ¿Hay un logo cambiado (no vacío) en ese punto? El último puesto gana.
function _fgLgLogoEn(x,y){
  var L=_fgLgActivos();
  for(var i=L.length-1;i>=0;i--){var e=L[i];if(_fgLgAjustable(e)&&x>=e.tx-4&&x<=e.tx+e.tw+4&&y>=e.ty-4&&y<=e.ty+e.th+4)return i;}
  return -1;
}
// Mientras se arrastra o se mueve la regla: un dibujado por cuadro.
var _fgLgRaf=0;
function _fgLgRedibujarPronto(){
  if(_fgLgRaf)return;
  _fgLgRaf=requestAnimationFrame(function(){_fgLgRaf=0;_fgLgListo();});
}
function _fgLgMover(dx,dy){
  var As=_fgLgActivos(),g=_fgLgElegidos();if(!g.length)return;
  g.forEach(function(i){As[i].tx+=dx;As[i].ty+=dy;});_fgLgRedibujarPronto();
  _fgLgGuiasTeclado(g);
}
// Con las flechas también se ven las guías (sin imán: de a 1 px pelearía con
// el teclado). Línea llena = justo alineado; punteada clarita = está cerca.
// Se van 1 s después de la última tecla.
var _fgLgGuiasT=0;
function _fgLgGuiasTeclado(g){
  clearTimeout(_fgLgGuiasT);
  var As=_fgLgActivos(),pos=g.filter(function(i){return As[i]&&_fgLgAjustable(As[i]);}).map(function(i){return {i:i,tx:As[i].tx,ty:As[i].ty};});
  if(!pos.length)return;
  var G=_fgLgGuias(pos,_fgLg.sel>=0?_fgLg.sel:pos[0].i,0,0,_fgLgEscala());
  _fgLgGuiasPintar(G.lineas.map(function(l){l.cerca=Math.abs(l.d)>=0.5;l.tecla=!l.cerca;return l;}));
  _fgLgGuiasT=setTimeout(function(){_fgLgGuiasPintar([]);},1000);
}
// Tamaño en % del que puso la app al elegir la marca; crece y se achica desde
// el centro, así no se corre.
// Con varios elegidos, cada uno crece en la misma proporción que el principal.
function _fgLgTam(pct){
  var As=_fgLgActivos(),P=As[_fgLg.sel];if(!P)return;
  pct=Math.max(30,Math.min(250,Math.round(pct)));
  var f=pct/Math.max(1,_fgLgPct(P));
  _fgLgElegidos().forEach(function(i){var L=As[i];_fgLgTamUno(L,i===_fgLg.sel?pct:_fgLgPct(L)*f);});
  _fgLgRedibujarPronto();
}
function _fgLgTamUno(L,pct){
  pct=Math.max(30,Math.min(250,Math.round(pct)));
  if(L.tipo==='txt'){L.fs=L.bfs*pct/100;_fgLgTxtMedir(L);return;}
  var cx=L.tx+L.tw/2,cy=L.ty+L.th/2;
  L.tw=L.bw*pct/100;L.th=L.bh*pct/100;L.tx=cx-L.tw/2;L.ty=cy-L.th/2;
}
function _fgLgPct(L){return Math.round(L.tipo==='txt'?L.fs/L.bfs*100:L.tw/L.bw*100);}
// Centrar = en el medio del lugar donde estaba el logo original.
function _fgLgCentrar(){
  var As=_fgLgActivos(),g=_fgLgElegidos();if(!g.length)return;
  g.forEach(function(i){var L=As[i];L.tx=L.ox+L.ow/2-L.tw/2;L.ty=L.oy+L.oh/2-L.th/2;});_fgLgListo();
}
function _fgLgCambiarMarca(){
  var L=_fgLgActivos()[_fgLg.sel];if(!L)return;
  if(L.tipo==='txt'){_fgLgAbrir({x:L.ox,y:L.oy,w:L.ow,h:L.oh,bg:L.bg,manual:true,vacio:!!L.vacio},{texto:L});return;}
  var det=null;
  try{det=_fgLgDetectar(L.ox+L.ow/2,L.oy+L.oh/2);}catch(e){}
  if(!det||det.error||_fgLgIndiceDe(det)!==_fgLg.sel)det={x:L.ox,y:L.oy,w:L.ow,h:L.oh,bg:L.bg,manual:true};
  _fgLgAbrir(det);
}
// Barrita de ajuste del logo elegido. Se crea una vez y se reubica: si se
// rearmara en cada dibujado, la regla de tamaño se soltaría mientras se arrastra.
function _fgLgHerr(capa){
  var h=document.getElementById('fg-lg-herr'),L=_fgLg.sel>=0?_fgLgActivos()[_fgLg.sel]:null;
  if(!_fgLgAjustable(L)){if(h)h.hidden=true;return;}
  if(!h){
    h=document.createElement('div');h.id='fg-lg-herr';h.className='fg-lg-herr';
    var tactil=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
    h.setAttribute('role','toolbar');h.setAttribute('aria-label','Ajustar el elemento elegido');
    h.innerHTML='<span class="fg-lg-herr-nom" id="fg-lg-herr-nom"></span>'+
      '<button type="button" data-a="menos" title="M&aacute;s chico" aria-label="M&aacute;s chico">&minus;</button>'+
      '<input type="range" id="fg-lg-tam" min="30" max="250" step="5" aria-label="Tama&ntilde;o del logo">'+
      '<button type="button" data-a="mas" title="M&aacute;s grande" aria-label="M&aacute;s grande">+</button>'+
      '<span class="fg-lg-pct" id="fg-lg-pct"></span>'+
      (tactil?'<span class="fg-lg-fl"><button type="button" data-a="izq" aria-label="Mover a la izquierda">&larr;</button><button type="button" data-a="arr" aria-label="Mover arriba">&uarr;</button><button type="button" data-a="aba" aria-label="Mover abajo">&darr;</button><button type="button" data-a="der" aria-label="Mover a la derecha">&rarr;</button></span>':'')+
      '<button type="button" data-a="centrar" title="Volver a ponerlo en el medio de su lugar">Centrar</button>'+
      '<span class="fg-lg-alin" id="fg-lg-alin" hidden>'+
        '<button type="button" data-a="al-arr" title="Alinear arriba (con el &uacute;ltimo tocado)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="4" x2="20" y2="4"/><rect x="6" y="7" width="4" height="12"/><rect x="14" y="7" width="4" height="7"/></svg><span>Arriba</span></button>'+
        '<button type="button" data-a="al-med" title="Alinear al medio (con el &uacute;ltimo tocado)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/></svg><span>Al medio</span></button>'+
        '<button type="button" data-a="al-aba" title="Alinear abajo (con el &uacute;ltimo tocado)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="5" width="4" height="12"/><rect x="14" y="10" width="4" height="7"/></svg><span>Abajo</span></button>'+
        '<button type="button" data-a="repartir" title="Mismo espacio entre uno y otro"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="4" height="10"/><rect x="10" y="7" width="4" height="10"/><rect x="17" y="7" width="4" height="10"/></svg><span>Repartir</span></button>'+
        '<button type="button" data-a="mismo" title="Mismo alto que el &uacute;ltimo tocado"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="7" height="12"/><rect x="14" y="6" width="7" height="12"/></svg><span>Mismo tama&ntilde;o</span></button>'+
      '</span>'+
      '<button type="button" data-a="dup" title="Duplicar (Ctrl+C y Ctrl+V)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg><span>Duplicar</span></button>'+
      '<button type="button" data-a="original" title="Volver a como ven&iacute;a en el flyer">Original</button>'+
      '<button type="button" data-a="quitar" title="Borrar (Supr)" aria-label="Borrar"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>'+
      '<button type="button" data-a="cambiar">Cambiar marca</button>'+
      '<button type="button" data-a="soltar" class="fg-lg-herr-x" title="Listo con este" aria-label="Listo con este">&times;</button>';
    h.addEventListener('mousedown',function(e){e.stopPropagation();});   // que no "agarre" la vista previa para recorrerla
    h.addEventListener('pointerdown',function(e){e.stopPropagation();});
    h.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('button[data-a]');if(!b)return;
      var a=b.getAttribute('data-a');
      if(a==='soltar'){_fgLg.sel=-1;_fgLg.grupo=[];_fgLgMarcas();return;}
      var L2=_fgLgActivos()[_fgLg.sel];if(!L2)return;
      if(a==='menos')_fgLgTam(_fgLgPct(L2)-10);
      else if(a==='mas')_fgLgTam(_fgLgPct(L2)+10);
      else if(a==='centrar')_fgLgCentrar();
      else if(a==='cambiar')_fgLgCambiarMarca();
      else if(a==='al-arr'||a==='al-med'||a==='al-aba')_fgLgAlinear(a.slice(3));
      else if(a==='repartir')_fgLgRepartir();
      else if(a==='mismo')_fgLgMismoTam();
      else if(a==='dup'){if(_fgLgCopiar(true))_fgLgPegar();}
      else if(a==='quitar')_fgLgBorrarElegidos();
      else if(a==='original')_fgLgQuitarElegidos();
      else{var m={izq:[-3,0],der:[3,0],arr:[0,-3],aba:[0,3]}[a];if(m)_fgLgMover(m[0],m[1]);}
    });
    h.querySelector('#fg-lg-tam').addEventListener('input',function(){_fgLgTam(+this.value);});
  }
  // vive al pie de la vista previa (pegada abajo mientras se recorre el flyer):
  // al lado del logo tapaba a los vecinos
  var prev=document.querySelector('.prev');
  if(prev&&h.parentNode!==prev)prev.appendChild(h);
  h.hidden=false;
  var nG=_fgLgElegidos().length;
  var nm=document.getElementById('fg-lg-herr-nom');if(nm)nm.title=nG>1?'Shift + clic suma o saca un logo':'';if(nm)nm.textContent=nG>1?(nG+' elegidos'):((L.tipo==='txt'?'Texto: ':'')+(L.t||'Logo'));
  var r=document.getElementById('fg-lg-tam');if(r&&document.activeElement!==r)r.value=_fgLgPct(L);
  var cb=h.querySelector('button[data-a=cambiar]');if(cb){cb.textContent=(L.tipo==='txt')?'Editar texto':'Cambiar';cb.hidden=nG>1;}
  var pc=document.getElementById('fg-lg-pct');if(pc)pc.textContent=_fgLgPct(L)+'%';
  var al=document.getElementById('fg-lg-alin');if(al){al.hidden=nG<2;var rp=al.querySelector('[data-a=repartir]');if(rp)rp.hidden=nG<3;}
}
// ·· Alinear / repartir / mismo tamaño (con varios elegidos) ··
// La referencia es el principal (el último tocado).
function _fgLgAlinear(modo){
  var As=_fgLgActivos(),P=As[_fgLg.sel],g=_fgLgElegidos();if(!P||g.length<2)return;
  var ref=modo==='arr'?P.ty:modo==='med'?P.ty+P.th/2:P.ty+P.th;
  g.forEach(function(i){var L=As[i];L.ty=modo==='arr'?ref:modo==='med'?ref-L.th/2:ref-L.th;});
  _fgLgListo();
}
// El primero y el último quedan quietos; los del medio, con el mismo espacio
// entre uno y otro (no entre centros: así logos de distinto ancho quedan parejos).
function _fgLgRepartir(){
  var As=_fgLgActivos(),g=_fgLgElegidos().slice();if(g.length<3)return;
  g.sort(function(a,b){return (As[a].tx+As[a].tw/2)-(As[b].tx+As[b].tw/2);});
  var pri=As[g[0]],ult=As[g[g.length-1]],anchos=0;
  g.forEach(function(i){anchos+=As[i].tw;});
  var hueco=((ult.tx+ult.tw)-pri.tx-anchos)/(g.length-1),x=pri.tx;
  g.forEach(function(i){As[i].tx=x;x+=As[i].tw+hueco;});
  _fgLgListo();
}
function _fgLgMismoTam(){
  var As=_fgLgActivos(),P=As[_fgLg.sel],g=_fgLgElegidos();if(!P||g.length<2)return;
  g.forEach(function(i){if(i===_fgLg.sel)return;var L=As[i];if(L.th>0)_fgLgTamUno(L,_fgLgPct(L)*P.th/L.th);});
  _fgLgListo();
}
// ·· Duplicar (Ctrl+C / Ctrl+V) y quitar (Supr) ··
// Una copia no tapa nada (como los logos de una franja: w/h 0) y su "lugar
// original" es donde cae, así Centrar la deja donde está.
function _fgLgCopiar(callado){
  var As=_fgLgActivos(),g=_fgLgElegidos();if(!g.length)return false;
  _fgLg.copia={src:_fgLgSrc(),items:JSON.parse(JSON.stringify(g.map(function(i){return As[i];}))),n:0};
  if(!callado)showToast(g.length===1?'Copiado. Pegalo con Ctrl+V.':'Copiados '+g.length+'. Pegalos con Ctrl+V.');
  return true;
}
function _fgLgPegar(){
  var C=_fgLg.copia;if(!C||!C.items.length)return;
  if(C.src!==_fgLgSrc()){showToast('Lo copiado era de otro flyer.');return;}
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  C.n++;var off=16*C.n,nuevos=[];
  C.items.forEach(function(o){
    var c=JSON.parse(JSON.stringify(o));
    ['franja','franjaBase','franjaSel','franjaCols','franjaKt','franjaInfo','vacio'].forEach(function(k){delete c[k];});
    c.tx+=off;c.ty+=off;c.ox=c.tx;c.oy=c.ty;c.ow=c.tw;c.oh=c.th;c.x=c.tx;c.y=c.ty;c.w=0;c.h=0;c.dup=true;
    _fgLg.list.push(c);nuevos.push(_fgLg.list.length-1);
  });
  _fgLg.grupo=nuevos.length>1?nuevos:[];_fgLg.sel=nuevos[nuevos.length-1];
  _fgLgListo();
}
// Borrar (tacho / Supr): lo elegido desaparece y su lugar queda vacío (tapado),
// sin que vuelva el logo de abajo. Lo que no tapaba nada (una copia, un logo de
// una franja —la tapa es la de la franja— o algo puesto en un lugar libre) se va.
function _fgLgBorrarElegidos(callado){
  var g=_fgLgElegidos();if(!g.length)return 0;
  var As=_fgLgActivos(),fuera={};
  g.forEach(function(i){
    var e=As[i];if(!e||e.franjaBase)return;
    if(e.dup||e.franja||!(e.w>0&&e.h>0)){fuera[i]=1;return;}
    As[i]={x:e.x,y:e.y,w:e.w,h:e.h,bg:e.bg,img:'',t:'',ox:e.ox,oy:e.oy,ow:e.ow,oh:e.oh};
  });
  _fgLg.list=_fgLg.list.filter(function(e,i){return !fuera[i];});
  _fgLg.sel=-1;_fgLg.grupo=[];_fgLgListo();
  if(!callado)showToast((g.length===1?'Borrado':'Borrados: '+g.length)+'. Con Ctrl+Z lo recuperás.');
  return g.length;
}
// ·· Shift + clic sobre logos del flyer (21-oct-2026) ··
// Un logo que todavía no se cambió también se puede sumar a lo elegido: queda
// como "lugar" (_fgLg.lugares, la detección en la imagen base) sin crear ningún
// cambio. Con lugares elegidos aparece la barra de grupo: Reemplazar (una marca
// por lugar, en orden de lectura), Borrar y Original.
function _fgLgLugarTocar(cx,cy){
  var p=_fgLgAImagen(cx,cy);if(!p)return;
  var det;try{det=_fgLgDetectar(p.x,p.y);}catch(e){return;}
  if(!det||det.error){showToast('Ahí no encontré un logo para sumar.');return;}
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  var i=_fgLgIndiceDe(det);
  if(i>=0&&_fgLgAjustable(_fgLgActivos()[i])){_fgLgGrupoTocar(i);_fgLgListo();return;}
  var L=_fgLg.lugares,cxd=det.x+det.w/2,cyd=det.y+det.h/2,k=-1;
  for(var j=0;j<L.length;j++){var d=L[j];if(cxd>=d.x&&cxd<=d.x+d.w&&cyd>=d.y&&cyd<=d.y+d.h){k=j;break;}}
  if(k>=0)L.splice(k,1);else L.push(det);
  // lo que ya estaba elegido (un logo cambiado) queda en el grupo
  if(_fgLg.sel>=0&&!_fgLg.grupo.length&&_fgLgAjustable(_fgLgActivos()[_fgLg.sel]))_fgLg.grupo=[_fgLg.sel];
  _fgLgMarcas();
}
// Para moverlos: cada logo del flyer elegido con Shift pasa a ser un cambio
// "orig:" (el mismo recorte, en el mismo lugar) y se suma al grupo. Sin redibujar
// nada todavía: el arrastre es el que lo hace.
function _fgLgLugaresAMovibles(){
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  var g=_fgLgElegidos().slice();
  (_fgLg.lugares||[]).forEach(function(det){
    var k='orig:'+[det.x,det.y,det.w,det.h].join(',');if(!_fgLgImg(k))return;
    var e={x:det.x-4,y:det.y-4,w:det.w+8,h:det.h+8,bg:det.bg,img:k,t:'Logo del flyer',ox:det.x,oy:det.y,ow:det.w,oh:det.h,
           tx:det.x,ty:det.y,tw:det.w,th:det.h,bw:det.w,bh:det.h};
    var i=_fgLgIndiceDe(det);
    if(i>=0)_fgLg.list[i]=e;else{_fgLg.list.push(e);i=_fgLg.list.length-1;}
    if(g.indexOf(i)<0)g.push(i);
  });
  _fgLg.lugares=[];_fgLg.grupo=g;if(g.length&&_fgLg.sel<0)_fgLg.sel=g[g.length-1];
}
// Los lugares a reemplazar: los logos cambiados elegidos (en su lugar original)
// y los del flyer sumados con Shift, en orden de lectura.
function _fgLgGrpLugares(){
  var As=_fgLgActivos(),T=[];
  _fgLgElegidos().forEach(function(i){
    var e=As[i];if(!e)return;
    T.push(e.dup||!(e.ow>0)?{x:e.tx,y:e.ty,w:e.tw,h:e.th,bg:e.bg,manual:true}:{x:e.ox,y:e.oy,w:e.ow,h:e.oh,bg:e.bg,manual:true});
  });
  (_fgLg.lugares||[]).forEach(function(d){T.push(d);});
  // misma fila si los centros están a menos de medio alto; si no, de arriba abajo
  T.sort(function(a,b){var ca=a.y+a.h/2,cb=b.y+b.h/2;if(Math.abs(ca-cb)<Math.min(a.h,b.h)/2)return (a.x+a.w/2)-(b.x+b.w/2);return ca-cb;});
  return T;
}
function _fgLgGrpBar(){
  var b=document.getElementById('fg-lg-grp'),nL=(_fgLg.lugares||[]).length,nE=_fgLg.on?_fgLgElegidos().length:0,n=nL+nE;
  if(!(_fgLg.on&&!_fgLg.limpio&&nL>0)){if(b)b.hidden=true;return;}
  if(!b){
    b=document.createElement('div');b.id='fg-lg-grp';b.className='fg-lg-grp';b.setAttribute('role','toolbar');b.setAttribute('aria-label','Varios elegidos');
    b.addEventListener('mousedown',function(e){e.stopPropagation();});
    b.addEventListener('pointerdown',function(e){e.stopPropagation();});
    b.addEventListener('click',function(e){var x=e.target.closest&&e.target.closest('button[data-g]');if(x)_fgLgGrpAccion(x.getAttribute('data-g'));});
  }
  var prev=document.querySelector('.prev');if(prev&&b.parentNode!==prev)prev.appendChild(b);
  b.hidden=false;
  b.innerHTML='<span class="fg-lg-grp-n"><b>'+n+(n===1?' elegido':' elegidos')+'</b> <span>(Shift + clic suma o saca)</span></span>'+
    '<button type="button" class="btn bp" data-g="reemplazar">Reemplazar</button>'+
    '<button type="button" class="btn bg" data-g="borrar">Borrar</button>'+
    (nE?'<button type="button" class="btn bg" data-g="original" title="Volver a como ven&iacute;an en el flyer">Original</button>':'')+
    '<button type="button" class="fg-lg-herr-x" data-g="soltar" aria-label="Soltar lo elegido" title="Soltar lo elegido">&times;</button>';
}
function _fgLgGrpAccion(a){
  if(a==='soltar'){_fgLg.lugares=[];_fgLg.sel=-1;_fgLg.grupo=[];_fgLgMarcas();return;}
  if(a==='reemplazar'){var T=_fgLgGrpLugares();if(T.length)_fgLgAbrir(T[0],{varios:T});return;}
  if(a==='original'){_fgLg.lugares=[];_fgLgQuitarElegidos();return;}
  if(a==='borrar'){
    if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
    var nL=_fgLg.lugares.length;
    _fgLg.lugares.forEach(function(d){
      var i=_fgLgIndiceDe(d),e={x:d.x-4,y:d.y-4,w:d.w+8,h:d.h+8,bg:d.bg,img:'',t:'',ox:d.x,oy:d.y,ow:d.w,oh:d.h};
      if(i>=0)_fgLg.list[i]=e;else _fgLg.list.push(e);
    });
    _fgLg.lugares=[];
    var nE=_fgLgBorrarElegidos(true);
    if(!nE){_fgLg.sel=-1;_fgLg.grupo=[];_fgLgListo();}
    var n=nL+nE;showToast((n===1?'Borrado':'Borrados: '+n)+'. Con Ctrl+Z lo recuperás.');
  }
}
function _fgLgQuitarElegidos(){
  var g=_fgLgElegidos();if(!g.length)return;
  var fuera={};g.forEach(function(i){fuera[i]=1;});
  _fgLg.list=_fgLg.list.filter(function(e,i){return !fuera[i];});
  _fgLg.sel=-1;_fgLg.grupo=[];_fgLgListo();
  showToast((g.length===1?'Volvió al original':'Volvieron al original: '+g.length)+'. Con Ctrl+Z lo recuperás.');
}
// Pantalla → px de la imagen original. null si cae en el hueco que abre fgDrawAll.
function _fgLgAImagen(cx,cy){
  var cvs=document.getElementById('cv'),r=cvs.getBoundingClientRect();
  if(!r.width||!r.height||!window.baseImg||!baseImg.width)return null;
  var x=(cx-r.left)/r.width*cvs.width/SC,y=(cy-r.top)/r.height*cvs.height/SC;
  var corte=_fgLgCorte();
  if(y>=corte){if(y<corte+_fgExtra)return null;y-=_fgExtra;}
  return {x:x,y:y};
}
// px de la imagen → px de pantalla relativos al canvas (para los bordes punteados).
function _fgLgAPantalla(x,y,w,h){
  var cvs=document.getElementById('cv'),r=cvs.getBoundingClientRect(),k=(r.width/cvs.width)*SC;
  if(y>=_fgLgCorte())y+=_fgExtra;
  return {l:x*k,t:y*k,w:w*k,h:h*k};
}
var _fgLgTipT=0;
function fgLogosModo(on){
  _fgLg.on=(on===undefined)?!_fgLg.on:!!on;
  // la ayuda se muestra unos segundos al prender el modo y después se va (no tapa el flyer)
  clearTimeout(_fgLgTipT);_fgLg.tipOff=false;
  if(_fgLg.on)_fgLgTipT=setTimeout(function(){_fgLg.tipOff=true;_fgLgBarra();},7000);
  if(!_fgLg.on&&_fgLg.limpio)fgLgLimpio(false);
  if(!_fgLg.on&&_fgRecM.modo){_fgRecM.modo=false;var pr0=document.querySelector('.prev');if(pr0)pr0.classList.remove('fg-rec-on');}
  if(!_fgLg.on&&_fgLg.arrastre){_fgLg.arrastre=false;_fgLgHistPronto();}
  if(!_fgLg.on){
    _fgFr.pendiente=null; // "Listo": lo que quedaba elegido para una franja ya no vuelve a aparecer
    if(_fgFr.modo){_fgFr.modo=false;var pv=document.querySelector('.prev');if(pv)pv.classList.remove('fg-fr-on');}
  }
  var prev=document.querySelector('.prev');if(prev)prev.classList.toggle('fg-lg-on',_fgLg.on);
  if(_fgLg.on&&!_promosCat)loadPromosCatalogo(); // así la ventana abre con la lista ya cargada
  _fgLgBarra();_fgLgMarcas();
}
// "Vista previa" (antes "Ver limpio"): el flyer limpio, sin marcos ni barritas (es el mismo lienzo
// que se descarga). Mientras tanto el flyer no responde a los toques.
function fgLgLimpio(on){
  _fgLg.limpio=(on===undefined)?!_fgLg.limpio:!!on;
  if(_fgLg.limpio){_fgLg.sel=-1;if(_fgFr.modo)fgFranjaModo(false);}
  var prev=document.querySelector('.prev');if(prev)prev.classList.toggle('fg-lg-limpio',!!_fgLg.limpio);
  _fgLgBarra();_fgLgMarcas();
}
function _fgLgBarra(){
  var b=document.getElementById('fg-lg-btn');if(!b)return;
  var ver=document.getElementById('fg-lg-ver');
  if(ver){ver.hidden=!_fgLg.on;ver.setAttribute('aria-pressed',_fgLg.limpio?'true':'false');ver.classList.toggle('on',!!_fgLg.limpio);
    var vt=document.getElementById('fg-lg-ver-t');if(vt)vt.textContent=_fgLg.limpio?'Seguir editando':'Vista previa';}
  b.setAttribute('aria-pressed',_fgLg.on?'true':'false');b.classList.toggle('on',_fgLg.on);
  var t=document.getElementById('fg-lg-btn-t');if(t)t.textContent=_fgLg.on?'Listo':'Cambiar logos';
  var tip=document.getElementById('fg-lg-tip');
  if(tip){
    // en modo franja se queda: es la instrucción de lo que hay que hacer ahora
    tip.hidden=!_fgLg.on||(_fgLg.tipOff&&!_fgFr.modo&&!_fgRecM.modo);
    if(!tip.dataset.base)tip.dataset.base=tip.innerHTML;
    tip.innerHTML=_fgRecM.modo?'Arrastr&aacute; de arriba hacia abajo sobre la parte que quer&eacute;s <b>quitar</b> (toma todo el ancho).':
      _fgFr.modo?'Arrastr&aacute; un recuadro alrededor de <b>toda la franja</b> de logos.':tip.dataset.base;
  }
  var fb=document.getElementById('fg-lg-franja');
  if(fb){fb.hidden=!_fgLg.on;fb.classList.toggle('on',_fgFr.modo);fb.textContent=_fgFr.modo?'Cancelar franja':'Armar franja';}
  var nb=document.getElementById('fg-lg-nbor');if(nb)nb.hidden=!_fgLg.on;
  var rb=document.getElementById('fg-lg-rec'),rc=document.getElementById('fg-rec-chip');
  if(rb){rb.hidden=!_fgLg.on;rb.classList.toggle('on',_fgRecM.modo);rb.textContent=_fgRecM.modo?'Cancelar recorte':'Recortar';}
  if(rc){var nr=_fgRecActivo()?_fgRec.cortes.length:0;rc.hidden=!(_fgLg.on&&nr);
    if(nr)rc.innerHTML='Recortado: '+nr+(nr===1?' parte':' partes')+' <button type="button" class="fg-rec-volver" onclick="fgRecQuitar()">Volver a como estaba</button>';}
  _fgLgHistBotones();
  var n=_fgLgActivos().length,u=document.getElementById('fg-lg-undo');
  if(u){u.hidden=!(_fgLg.on&&n);u.textContent=n===1?'Volver el cambio al original':'Volver los '+n+' cambios al original';}
  if(_fgLg.proy&&_fgLg.src!==_fgLgSrc())_fgLg.proy=null; // cambió de flyer: salió del diseño abierto
  var g=document.getElementById('fg-lg-guardar'),pr=document.getElementById('fg-lg-proy');
  var est=false;try{est=_estVer();}catch(e){}
  if(g){g.hidden=!(_fgLg.on&&(n||_fgRecActivo())&&est);g.textContent=(_fgLg.proy&&_fgLg.proy.mio&&_fgLg.proy.estado!=='publicado')?'Guardar cambios':'Guardar en Estudio';}
  if(pr){
    var p=_fgLg.proy;pr.hidden=!(_fgLg.on&&p);
    if(p)pr.innerHTML=p.temp?('<b>'+_escHtml(p.nombre)+'</b> (sin guardar)'):('Diseño: <b>'+_escHtml(p.nombre)+'</b> <button type="button" onclick="fgEstSoltar()" aria-label="Dejar de editar este diseño" title="Dejar de editar este diseño">&times;</button>');
  }
}
function _fgLgMarcas(){
  var capa=document.getElementById('fg-lg-capa');if(!capa)return;
  // Las marcas van en su propia cajita: la barrita de ajuste NO se toca al
  // redibujar (si se la sacara del documento, la regla se soltaría al arrastrarla).
  var mk=document.getElementById('fg-lg-mk');
  if(!mk){mk=document.createElement('div');mk.id='fg-lg-mk';capa.appendChild(mk);}
  if(!_fgLg.on){mk.innerHTML='';_fgLg.sel=-1;_fgLg.grupo=[];_fgLg.lugares=[];_fgLgMkAntes=null;_fgLgHerr(capa);_fgLgGrpBar();return;} // (_fgLgHerr la esconde)
  if(_fgLg.lugares.length&&_fgLg.src!==_fgLgSrc())_fgLg.lugares=[]; // otro flyer
  if(_fgLg.sel<0)_fgLg.grupo=[];
  var eleg=_fgLgElegidos();if(eleg.length<2)_fgLg.grupo=[];
  // los recuadros no se ven en reposo: el que se acaba de cambiar parpadea un
  // momento para que se vea dónde fue (no al entrar al modo ni mientras se arrastra)
  // (se dibuja varias veces por cambio: lo que parpadea se recuerda 1,3 s por su contenido)
  var A=_fgLgActivos(),antes=_fgLgMkAntes,ahora={},nuevos=[],ya=Date.now();
  A.forEach(function(e,i){
    var k=JSON.stringify(e);ahora[k]=1;
    if(antes&&!_fgLg.arrastre&&!antes[k])_fgLgMkFlash[k]=ya+1300;
    if(_fgLgMkFlash[k]>ya)nuevos.push(i);
  });
  Object.keys(_fgLgMkFlash).forEach(function(k){if(_fgLgMkFlash[k]<=ya)delete _fgLgMkFlash[k];});
  _fgLgMkAntes=ahora;
  mk.innerHTML=A.map(function(e,i){
    // logo nuevo: su recuadro (se mueve con él); lugar vacío: lo que se tapó
    var p=_fgLgAjustable(e)?_fgLgAPantalla(e.tx,e.ty,e.tw,e.th):_fgLgAPantalla(e.x,e.y,e.w,e.h);
    return '<div class="fg-lg-marca'+(i===_fgLg.sel||eleg.indexOf(i)>=0?' elegido':'')+(eleg.length>1&&eleg.indexOf(i)>=0?' grupo':'')+'" style="left:'+p.l.toFixed(1)+'px;top:'+p.t.toFixed(1)+'px;width:'+p.w.toFixed(1)+'px;height:'+p.h.toFixed(1)+'px"></div>';
  }).join('')+(_fgLg.lugares||[]).map(function(d){
    var p=_fgLgAPantalla(d.x,d.y,d.w,d.h);
    return '<div class="fg-lg-marca elegido grupo lugar" style="left:'+p.l.toFixed(1)+'px;top:'+p.t.toFixed(1)+'px;width:'+p.w.toFixed(1)+'px;height:'+p.h.toFixed(1)+'px"></div>';
  }).join('')+'<div class="fg-lg-sel" id="fg-lg-sel" hidden></div>';
  _fgLgGrpBar();
  nuevos.forEach(function(i){var m=mk.children[i],k=JSON.stringify(A[i]);if(m){m.classList.add('flash');setTimeout(function(){m.classList.remove('flash');},Math.max(0,_fgLgMkFlash[k]-ya));}});
  _fgLgHerr(capa);
}
var _fgLgMkAntes=null,_fgLgMkFlash={};
// El recuadro que queda debajo del mouse se ve entero (los demás, tenues).
function _fgLgCerca(e){
  var mk=document.getElementById('fg-lg-mk');if(!mk)return;
  var hit=null;
  if(e&&_fgLg.on&&!_fgLg.limpio){
    for(var i=mk.children.length-1;i>=0;i--){
      var m=mk.children[i];if(!m.classList.contains('fg-lg-marca'))continue;
      var r=m.getBoundingClientRect();
      if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){hit=m;break;}
    }
  }
  Array.prototype.forEach.call(mk.querySelectorAll('.fg-lg-marca.cerca'),function(m){if(m!==hit)m.classList.remove('cerca');});
  if(hit)hit.classList.add('cerca');
}
// Recuadro que se ve mientras se arrastra (coordenadas de pantalla).
function _fgLgSel(x0,y0,x1,y1){
  var s=document.getElementById('fg-lg-sel'),cvs=document.getElementById('cv');if(!s||!cvs)return;
  if(x0==null){s.hidden=true;return;}
  var r=cvs.getBoundingClientRect();
  s.hidden=false;
  s.style.left=(Math.min(x0,x1)-r.left)+'px';s.style.top=(Math.min(y0,y1)-r.top)+'px';
  s.style.width=Math.abs(x1-x0)+'px';s.style.height=Math.abs(y1-y0)+'px';
}
function _fgLgElegirPunto(cx,cy){
  var p=_fgLgAImagen(cx,cy);if(!p)return;
  var det;
  try{det=_fgLgDetectar(p.x,p.y);}catch(e){console.warn('logos:',e);showToast('No se pudo leer el flyer para buscar el logo.');return;}
  if(det.error==='grande'){showToast('Ahí no encontré un logo suelto. Arrastrá un recuadro alrededor del logo para marcarlo.');return;}
  if(det.error){showToast('Ahí no hay ningún logo. Tocá justo encima del logo que querés cambiar.');return;}
  _fgLgAbrir(det);
}
function _fgLgElegirVarios(ax,ay,bx,by){
  var a=_fgLgAImagen(Math.min(ax,bx),Math.min(ay,by)),b=_fgLgAImagen(Math.max(ax,bx),Math.max(ay,by));if(!a||!b)return;
  var g=_fgLgElegidos().slice();
  _fgLgActivos().forEach(function(e,i){
    if(_fgLgAjustable(e)&&e.tx<b.x&&e.tx+e.tw>a.x&&e.ty<b.y&&e.ty+e.th>a.y&&g.indexOf(i)<0)g.push(i);
  });
  if(!g.length){showToast('Ahí no hay logos cambiados para elegir.');return;}
  _fgLg.grupo=g;_fgLg.sel=g[g.length-1];_fgLgListo();
}
function _fgLgElegirRecuadro(ax,ay,bx,by){
  var a=_fgLgAImagen(Math.min(ax,bx),Math.min(ay,by)),b=_fgLgAImagen(Math.max(ax,bx),Math.max(ay,by));
  if(!a||!b)return;
  var det=_fgLgManual(a.x,a.y,b.x-a.x,b.y-a.y);
  if(det)_fgLgAbrir(det);
}
// ¿Ese lugar ya tiene un cambio? (se compara contra el recuadro original)
function _fgLgIndiceDe(det){
  var L=_fgLgActivos();
  for(var i=0;i<L.length;i++){
    var e=L[i];if(e.franjaBase)continue; // la franja se retoca con "Armar franja"
    var ix=Math.min(e.ox+e.ow,det.x+det.w)-Math.max(e.ox,det.x),iy=Math.min(e.oy+e.oh,det.y+det.h)-Math.max(e.oy,det.y);
    if(ix>0&&iy>0&&ix*iy>0.5*Math.min(e.ow*e.oh,det.w*det.h))return i;
  }
  return -1;
}
function _fgLgPoner(det,file,titulo,logo){
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  var e={x:det.x-4,y:det.y-4,w:det.w+8,h:det.h+8,bg:det.bg,img:file||'',t:titulo||'',ox:det.x,oy:det.y,ow:det.w,oh:det.h};
  if(logo){var dst=_fgLgDestino(det,logo.width/logo.height);e.tx=dst.tx;e.ty=dst.ty;e.tw=dst.tw;e.th=dst.th;e.bw=dst.tw;e.bh=dst.th;}
  var i=_fgLgIndiceDe(det);
  if(i>=0)_fgLg.list[i]=e;else{_fgLg.list.push(e);i=_fgLg.list.length-1;}
  _fgLg.sel=logo?i:-1; // queda elegido: así aparece la barrita para ajustarlo
  _fgLgListo();
}
// Mover o agrandar un logo del propio flyer: se tapa donde estaba y se vuelve a
// dibujar recortado de la imagen, ahora ajustable como cualquier otro.
function _fgLgMoverOriginal(det){
  var k='orig:'+[det.x,det.y,det.w,det.h].join(','),im=_fgLgImg(k);if(!im)return;
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  var e={x:det.x-4,y:det.y-4,w:det.w+8,h:det.h+8,bg:det.bg,img:k,t:'Logo del flyer',ox:det.x,oy:det.y,ow:det.w,oh:det.h,
         tx:det.x,ty:det.y,tw:det.w,th:det.h,bw:det.w,bh:det.h};
  var i=_fgLgIndiceDe(det);
  if(i>=0)_fgLg.list[i]=e;else{_fgLg.list.push(e);i=_fgLg.list.length-1;}
  _fgLg.sel=i;_fgLgListo();
}
// Poner (o corregir) un texto. det = el lugar marcado; previo = el texto que se
// está editando (conserva su posición y su tamaño relativo).
// ·· Días de los súper (21-oct-2026) ··
// En la franja de supermercados cada logo lleva debajo sus días ("Martes y
// jueves"). Al poner un súper con el tilde "Poner también sus días", se busca ese
// texto en la imagen base y se reemplaza por los días de la promo, con la misma
// letra y color. El texto puede venir pegado al logo (la detección los junta si
// están cerca) o un poco más abajo.
// Bloques de filas con tinta dentro de un recuadro (px de imagen).
function _fgLgBloquesFilas(x,y,w,h,bgTxt,tol){
  if(tol==null)tol=2; // filas vacías que se toleran dentro de un mismo bloque
  var d=_fgLgPixeles(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
  var W=Math.max(1,Math.round(w)),H=Math.max(1,Math.round(h)),bg=String(bgTxt).match(/\d+/g).map(Number),bl=[],cur=null,hueco=0;
  for(var r=0;r<H;r++){
    var x0=W,x1=-1;
    for(var c=0;c<W;c++){var p=(r*W+c)*4;if(Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]))>_FG_LG_TOL){if(c<x0)x0=c;x1=c;}}
    if(x1>=0){
      if(cur&&hueco<=tol){cur.y1=r;cur.x0=Math.min(cur.x0,x0);cur.x1=Math.max(cur.x1,x1);}
      else{cur={y0:r,y1:r,x0:x0,x1:x1};bl.push(cur);}
      hueco=0;
    }else if(cur)hueco++;
  }
  return bl.map(function(b){return {x:x+b.x0,y:y+b.y0,w:b.x1-b.x0+1,h:b.y1-b.y0+1};});
}
// Devuelve {logo, texto, lineas}: el recuadro del logo y el del texto de días de
// esa celda (o null). Revisado con Codex y Gemini (21-oct): el texto se busca
// DEBAJO del logo, como un bloque centrado bajo él, con medidas en px del flyer
// (escaladas a su ancho, base 1240) y no en proporción al alto del logo (un logo
// bajo y ancho de 30 px dejaba el texto afuera). No se parte el logo por dentro
// salvo que la caja sea muy alta (la detección pudo juntar logo y días): las
// letras chicas de un logo ("cencosud" en Disco) no son días.
function _fgLgPartirDias(det){
  var u=Math.max(0.5,baseImg.width/1240),cx=det.x+det.w/2,abajo=det.y+det.h;
  try{
    var bw=Math.max(det.w*1.25,150*u),bx=Math.max(0,cx-bw/2),by=abajo+2,bh=Math.min(baseImg.height-by,120*u);
    bw=Math.min(baseImg.width-bx,bw);
    if(bh>8&&bw>8){
      var bl=_fgLgBloquesFilas(bx,by,bw,bh,det.bg,1),tol=Math.max(det.w*0.35,30*u),txt=[];
      for(var i=0;i<bl.length;i++){
        var b=bl[i],bcx=b.x+b.w/2;
        if(b.h>44*u)break;                                   // un logo (la fila de abajo): se termina
        if(Math.abs(bcx-cx)>tol)continue;                    // tinta de la celda de al lado
        if(!txt.length){
          if(b.y-abajo>42*u)break;                           // muy lejos del logo: no es su texto
          if(b.h<7*u)continue;                               // una pelusa
          txt.push(b);continue;
        }
        var ult=txt[txt.length-1];
        if(b.y-(ult.y+ult.h)>Math.max(8*u,ult.h*0.7))break;   // otro bloque, más abajo
        if(b.y+b.h-txt[0].y>72*u)break;                      // más de 2-3 renglones: no
        txt.push(b);
      }
      if(txt.length){
        var x0=Math.min.apply(null,txt.map(function(b){return b.x;})),x1=Math.max.apply(null,txt.map(function(b){return b.x+b.w;}));
        var y0=txt[0].y,y1=txt[txt.length-1].y+txt[txt.length-1].h;
        return {logo:det,texto:{x:x0,y:y0,w:x1-x0,h:y1-y0,bg:det.bg},lineas:_fgLgLineasDe(txt)};
      }
    }
    // caja muy alta: logo y días pueden venir juntos en la detección
    if(det.h>110*u){
      var bi=_fgLgBloquesFilas(det.x,det.y,det.w,det.h,det.bg,0),k=bi.length-1;
      if(k>=1){
        var ub=bi[k],j=k;
        while(j>1&&bi[j-1].h<=36*u&&ub.y+ub.h-bi[j-1].y<=72*u&&bi[j].y-(bi[j-1].y+bi[j-1].h)<=Math.max(8*u,bi[j-1].h*0.7))j--;
        var tb=bi.slice(j),ty0=tb[0].y,gap=ty0-(bi[j-1].y+bi[j-1].h);
        if(gap>=3*u&&ub.y+ub.h-ty0<=72*u&&tb.every(function(b){return b.h<=36*u;})){
          var lx0=Math.min.apply(null,tb.map(function(b){return b.x;})),lx1=Math.max.apply(null,tb.map(function(b){return b.x+b.w;}));
          var ly1=bi[j-1].y+bi[j-1].h;
          return {logo:{x:det.x,y:det.y,w:det.w,h:Math.max(4,ly1-det.y),bg:det.bg,manual:det.manual},
                  texto:{x:lx0,y:ty0,w:lx1-lx0,h:ub.y+ub.h-ty0,bg:det.bg},lineas:_fgLgLineasDe(tb)};
        }
      }
    }
  }catch(e){console.warn('días:',e);}
  return {logo:det,texto:null,lineas:[]};
}
// Renglones de un bloque de texto: los pedazos que se separan con aire de verdad
// (el punto de una "i" o un acento no cuentan como renglón).
function _fgLgLineasDe(bl){
  var L=[];
  bl.forEach(function(b){
    var u=L[L.length-1];
    if(b.h<5&&u){u.x1=Math.max(u.x1,b.x+b.w);u.x0=Math.min(u.x0,b.x);u.y1=Math.max(u.y1,b.y+b.h);return;}
    if(u&&b.y<=u.y1+1){u.y1=Math.max(u.y1,b.y+b.h);u.x0=Math.min(u.x0,b.x);u.x1=Math.max(u.x1,b.x+b.w);return;}
    L.push({x0:b.x,x1:b.x+b.w,y0:b.y,y1:b.y+b.h});
  });
  return L.map(function(l){return {x:l.x0,y:l.y0,w:l.x1-l.x0,h:l.y1-l.y0};});
}
// Tamaño de letra de un texto ya impreso, por el alto de la tinta de cada renglón: si las letras que
// bajan de la línea (g, j, p, q, y) están, la tinta mide ~0,93 del tamaño; si no
// ("Viernes"), ~0,73.
function _fgLgFsDe(lineas,bg){
  if(!lineas||!lineas.length)return 0;
  // (con varios renglones, el promedio de cada uno: el interlineado del flyer
  // no es el de la app, así que no sirve medir la distancia entre renglones)
  if(lineas.length>=2){var t=0;lineas.forEach(function(x){t+=_fgLgFsDe([x],bg);});return t/lineas.length;}
  var l=lineas[0],H=Math.max(1,Math.round(l.h)),W=Math.max(1,Math.round(l.w));
  try{
    var d=_fgLgPixeles(Math.round(l.x),Math.round(l.y),W,H),c=String(bg).match(/\d+/g).map(Number),fil=[],mx=0;
    for(var y=0;y<H;y++){var k=0;for(var x=0;x<W;x++){var p=(y*W+x)*4;if(Math.max(Math.abs(d[p]-c[0]),Math.abs(d[p+1]-c[1]),Math.abs(d[p+2]-c[2]))>_FG_LG_TOL)k++;}fil.push(k);if(k>mx)mx=k;}
    var desde=Math.floor(H*0.78),suma=0,m=0;for(var y2=desde;y2<H;y2++){suma+=fil[y2];m++;}
    var colas=m&&mx&&(suma/m)/mx<0.3;
    return H/(colas?0.93:0.73);
  }catch(e){return H/0.8;}
}
// Tamaño del logo nuevo: la misma superficie que el logo que reemplaza (peso
// visual parejo con los vecinos), con su proporción, sin crecer por haber lugar
// libre y sin pisar el texto de días de abajo.
function _fgLgDestinoParejo(det,asp,limiteAbajo){
  var u=Math.max(0.5,baseImg.width/1240),A=det.w*det.h;
  var w=Math.sqrt(A*asp),h=w/asp;
  var maxW=Math.max(det.w,det.h*2.4,150*u)*1.0,maxH=Math.max(det.h,Math.min(det.h*2.2,95*u));
  if(limiteAbajo!=null)maxH=Math.min(maxH,Math.max(det.h,limiteAbajo-det.y+det.h*0.15));
  var k=Math.min(1,maxW/w,maxH/h);w*=k;h*=k;
  var cx=det.x+det.w/2,cy=det.y+det.h/2;
  if(limiteAbajo!=null&&cy+h/2>limiteAbajo)cy=limiteAbajo-h/2;
  return {tx:cx-w/2,ty:cy-h/2,tw:w,th:h};
}
// Pone los días debajo del logo: tapa el texto viejo entero y escribe los días
// con la letra del original (alto de cada renglón), centrados bajo el logo. Si
// no entra en un renglón, se parte en dos ("Martes y" / "jueves") antes de
// achicar la letra.
function _fgLgPonerDias(logoDet,texto,dias,lineas,cxLogo){
  var u=Math.max(0.5,baseImg.width/1240),fs,color,peso=500;
  var cx=cxLogo!=null?cxLogo:logoDet.x+logoDet.w/2;
  if(texto){
    var ren=Math.max(1,(lineas&&lineas.length)||_fgLgRenglones(texto));
    fs=Math.max(12*u,Math.min(40*u,_fgLgFsDe(lineas,texto.bg)||(texto.h/ren)));
    // color: el de la tinta "llena" (en letras finas casi todo es borde suavizado
    // y el más repetido salía gris). Peso normal: los días del flyer no van en negrita.
    color=_fgLgColorTexto(texto)||'#1A1A1A';
  }else{fs=20*u;color='#1A1A1A';}
  if(!_fgLgMedCv)_fgLgMedCv=document.createElement('canvas');
  var g=_fgLgMedCv.getContext('2d'),anchoMax=Math.max(texto?texto.w*1.15:0,logoDet.w*1.1,130*u);
  function ancho(t,f){g.font=_fgLgTxtFont({peso:peso},f);return Math.max.apply(null,t.split('\n').map(function(l){return g.measureText(l).width;}));}
  var t=dias;
  if(ancho(t,fs)>anchoMax){
    // en dos renglones: corta en el último " y " o en el espacio más al medio
    var iy=t.lastIndexOf(' y ');
    var corte=iy>0?iy+2:(function(){var m=t.length/2,b=-1;for(var i=0;i<t.length;i++)if(t[i]===' '&&(b<0||Math.abs(i-m)<Math.abs(b-m)))b=i;return b;})();
    if(corte>0)t=t.slice(0,corte).trim()+'\n'+t.slice(corte).trim();
  }
  var a=ancho(t,fs);if(a>anchoMax)fs=Math.max(10*u,fs*anchoMax/a);
  fs=Math.round(fs);
  var n=t.split('\n').length,altoNuevo=Math.ceil(n*fs*_FG_LG_INTER);
  var top=texto?texto.y:(logoDet.y+logoDet.h+8*u);
  var anchoNuevo=Math.ceil(ancho(t,fs))+4;
  // la tapa cubre el texto viejo Y el nuevo
  var tx0=Math.min(texto?texto.x:cx,cx-anchoNuevo/2),tx1=Math.max(texto?texto.x+texto.w:cx,cx+anchoNuevo/2);
  var ty1=Math.max(texto?texto.y+texto.h:top,top+altoNuevo);
  var tdet={x:Math.round(tx0),y:Math.round(Math.min(top,texto?texto.y:top)),w:Math.round(tx1-tx0),h:Math.round(ty1-Math.min(top,texto?texto.y:top)),bg:texto?texto.bg:logoDet.bg,vacio:!texto};
  _fgLgPonerTexto(tdet,{texto:t,color:color,peso:peso,fs:fs},null);
  // centrado bajo el logo, arriba alineado con el texto viejo
  var e=_fgLgActivos()[_fgLg.sel];
  if(e&&e.tipo==='txt'){e.tx=cx-e.tw/2;e.ty=top+(texto&&n===1&&ren>1?(texto.h-e.th)/2:0);}
}
// Pone una marca de Promociones en un lugar; si es un súper y el tilde está
// puesto, también sus días (sólo los del % de descuento). Si el súper no tiene
// días con %, el texto de días viejo se borra (no quedan días que no van).
// Devuelve 'dias', 'sinDias' o ''. Queda elegido el logo.
function _fgLgAvisoMarca(nom,p,res){
  if(res==='dias')return 'Listo: '+nom+' con sus días de descuento ('+_promoDias(p)+').';
  if(res==='sinDias')return 'Listo: '+nom+'. No tiene días con % de descuento: saqué los días que había abajo.';
  return 'Listo: '+nom+' en este flyer.';
}
function _fgLgPonerMarca(det,p,logo,conDias){
  var esSuper=conDias&&_promoEsSuper(p),dias=esSuper?_promoDias(p):'';
  if(!esSuper){_fgLgPoner(det,p.imagen,p.titulo,logo);return '';}
  var pt=_fgLgPartirDias(det),L=pt.logo;
  // el logo, con un tamaño parejo y sin pisar el texto de abajo
  _fgLgPoner(L,p.imagen,p.titulo,logo);
  var iLogo=_fgLgIndiceDe(L),eL=_fgLgActivos()[iLogo];
  if(eL&&logo){
    var d=_fgLgDestinoParejo(L,logo.width/logo.height,pt.texto?pt.texto.y-4:null);
    eL.tx=d.tx;eL.ty=d.ty;eL.tw=d.tw;eL.th=d.th;eL.bw=d.tw;eL.bh=d.th;
  }
  var res='';
  if(dias){_fgLgPonerDias(L,pt.texto,dias,pt.lineas,L.x+L.w/2);res='dias';}
  else if(pt.texto){_fgLgPoner(pt.texto,'','',null);res='sinDias';}
  if(iLogo>=0)_fgLg.sel=iLogo;
  _fgLgListo();
  return res;
}
// Color de un texto impreso: entre los píxeles con tinta, el del 15% más alejado
// del fondo (el centro de los trazos, no los bordes suavizados).
function _fgLgColorTexto(det){
  try{
    var d=_fgLgPixeles(Math.round(det.x),Math.round(det.y),Math.max(1,Math.round(det.w)),Math.max(1,Math.round(det.h))),bg=String(det.bg).match(/\d+/g).map(Number),px=[];
    for(var p=0;p<d.length;p+=4){var df=Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]));if(df>_FG_LG_TOL)px.push([df,d[p],d[p+1],d[p+2]]);}
    if(!px.length)return null;
    px.sort(function(a,b){return b[0]-a[0];});
    var n=Math.max(1,Math.round(px.length*0.15)),r=0,g=0,b=0;
    for(var i=0;i<n;i++){r+=px[i][1];g+=px[i][2];b+=px[i][3];}
    return '#'+[r,g,b].map(function(v){return ('0'+Math.round(v/n).toString(16)).slice(-2);}).join('');
  }catch(e){return null;}
}
// Proporción de píxeles con tinta en un recuadro (para adivinar la negrita).
function _fgLgTintaRel(det){
  var d=_fgLgPixeles(Math.round(det.x),Math.round(det.y),Math.max(1,Math.round(det.w)),Math.max(1,Math.round(det.h))),bg=String(det.bg).match(/\d+/g).map(Number),n=0,t=0;
  for(var p=0;p<d.length;p+=4){t++;if(Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]))>_FG_LG_TOL)n++;}
  return t?n/t:0;
}
function _fgLgPonerTexto(det,d,previo){
  if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
  var e={tipo:'txt',texto:d.texto,color:d.color,peso:d.peso,fs:d.fs,bfs:d.fs,
         x:det.x-4,y:det.y-4,w:det.w+8,h:det.h+8,bg:det.bg,t:d.texto.replace(/\n/g,' '),ox:det.x,oy:det.y,ow:det.w,oh:det.h,vacio:!!det.vacio};
  if(previo){e.tx=previo.tx;e.ty=previo.ty;e.tw=previo.tw;e.th=previo.th;}
  else{e.tx=det.x+det.w/2;e.ty=det.y+det.h/2;}
  _fgLgTxtMedir(e);
  var i=previo?_fgLg.list.indexOf(previo):_fgLgIndiceDe(det);
  if(i>=0)_fgLg.list[i]=e;else{_fgLg.list.push(e);i=_fgLg.list.length-1;}
  _fgLg.sel=i;_fgLgListo();
}
function _fgLgListo(){
  if(typeof redrawNow==='function')redrawNow();else if(typeof redraw==='function')redraw();
  _fgLgBarra();_fgLgMarcas();_fgLgHistPronto();_fgBorradorAuto();
  var pa=_fgProtoActivo();if(pa&&pa.temp)_fgBorrGuardarPronto();
}
// ·· Deshacer / Rehacer de a un paso ··
// Cada paso es una copia (JSON) de la lista de cambios. No hace falta marcar
// los pasos a mano en cada lugar que cambia algo: todo pasa por _fgLgListo, que
// compara la lista con el paso actual un ratito después del último toque. Así un
// arrastre, una tanda de "+" o de flechas cuentan como UN paso. El nombre del
// paso sale de comparar las dos copias (_fgLgHistEtiqueta).
// Arranca de cero al cambiar de flyer, al traer otra empresa (_fgLgLimpiar) y
// al abrir o cerrar un diseño de Estudio.
var _fgLgHist={pasos:[],i:-1,src:'',t:0};
var _FG_LG_HIST_MAX=60;
// Cada paso guarda los logos (L) Y los recortes (R): así Deshacer también
// deshace un recorte. La clave es la imagen ENTERA (un recorte no reinicia).
function _fgLgHistFoto(){return JSON.stringify({L:_fgLg.src===_fgLgSrc()?_fgLg.list:[],R:_fgRecActivo()?_fgRec.cortes:[]});}
function _fgLgHistLeer(t){var o=JSON.parse(t);return Array.isArray(o)?{L:o,R:[]}:{L:o.L||[],R:o.R||[]};}
function _fgLgHistClave(){return _fgRecActivo()?(_fgRec.orig.src||''):_fgLgSrc();}
function _fgLgHistReiniciar(){
  clearTimeout(_fgLgHist.t);_fgLg.arrastre=false;
  _fgLgHist={pasos:[{lista:_fgLgHistFoto(),et:''}],i:0,src:_fgLgHistClave(),t:0};
  _fgLgHistBotones();
}
function _fgLgHistPronto(){
  if(_fgLg.arrastre)return; // se marca al soltar
  clearTimeout(_fgLgHist.t);_fgLgHist.t=setTimeout(_fgLgHistMarcar,450);
}
// Si la lista cambió desde el paso actual, suma un paso (y descarta lo que se
// podía rehacer).
function _fgLgHistMarcar(){
  clearTimeout(_fgLgHist.t);_fgLgHist.t=0;
  var H=_fgLgHist,src=_fgLgHistClave();
  // otro flyer: la base es el flyer tal como viene
  if(H.src!==src||H.i<0){H=_fgLgHist={pasos:[{lista:'{"L":[],"R":[]}',et:''}],i:0,src:src,t:0};}
  var f=_fgLgHistFoto(),cur=H.pasos[H.i];
  if(f!==cur.lista){
    var et='';try{var A=_fgLgHistLeer(cur.lista),B=_fgLgHistLeer(f);
      et=JSON.stringify(A.R)!==JSON.stringify(B.R)?(B.R.length>A.R.length?'Recortar una parte':'Volver a como estaba (recorte)'):_fgLgHistEtiqueta(A.L,B.L);}catch(e){}
    H.pasos=H.pasos.slice(0,H.i+1);H.pasos.push({lista:f,et:et||'el último cambio'});
    if(H.pasos.length>_FG_LG_HIST_MAX+1)H.pasos.shift();
    H.i=H.pasos.length-1;
  }
  _fgLgHistBotones();
}
function _fgLgHistNom(e){return e.tipo==='txt'?('el texto «'+(e.t||'')+'»'):(e.t&&e.t!=='Logo del flyer'?e.t:'el logo');}
function _fgLgHistEtiqueta(a,b){
  if(!b.length)return 'Volver todo al original';
  var J=function(x){return JSON.stringify(x);},i,cambian=[];
  var largo=Math.max(a.length,b.length);
  for(i=0;i<largo;i++)if(J(a[i])!==J(b[i]))cambian.push(i);
  // un solo elemento distinto (o uno nuevo al final): se describe qué le pasó
  if(cambian.length===1&&b.length>=a.length){
    var o=a[cambian[0]],e=b[cambian[0]];
    if(e.franjaBase)return 'Armar franja';
    if(!o)return e.dup?'Duplicar '+_fgLgHistNom(e):(e.tipo==='txt'?'Poner '+_fgLgHistNom(e):(e.img?'Poner '+_fgLgHistNom(e):'Dejar un lugar vacío'));
    if(o.img!==e.img||o.tipo!==e.tipo||o.texto!==e.texto||o.color!==e.color||o.peso!==e.peso)
      return e.tipo==='txt'?'Cambiar '+_fgLgHistNom(e):(e.img?'Cambiar '+_fgLgHistNom(o)+' por '+_fgLgHistNom(e):'Dejar vacío');
    if(o.tw!==e.tw||o.th!==e.th||o.fs!==e.fs)return 'Tamaño de '+_fgLgHistNom(e);
    return 'Mover '+_fgLgHistNom(e);
  }
  var fr=function(L){return J(L.filter(function(x){return x.franja;}));};
  if(fr(a)!==fr(b)){
    var na=a.filter(function(x){return x.franjaBase;}).length,nb=b.filter(function(x){return x.franjaBase;}).length;
    if(nb<na)return 'Volver la franja al original';
    var n=b.filter(function(x){return x.franja&&!x.franjaBase;}).length;
    return 'Armar franja ('+n+(n===1?' logo)':' logos)');
  }
  if(b.length<a.length){
    var falta=a.filter(function(x){var j=J(x);return !b.some(function(y){return J(y)===j;});})[0];
    return falta?'Volver '+_fgLgHistNom(falta)+' al original':'Volver un cambio al original';
  }
  var nuevos=b.slice(a.length);
  if(b.length>a.length&&nuevos.every(function(x){return x.dup;})&&a.every(function(x,i){return J(x)===J(b[i]);}))return 'Duplicar '+nuevos.length;
  if(a.length===b.length&&cambian.every(function(i){var o=a[i],e=b[i];return o.img===e.img&&o.tipo===e.tipo&&o.texto===e.texto;})){
    var tam=cambian.some(function(i){return a[i].tw!==b[i].tw||a[i].th!==b[i].th||a[i].fs!==b[i].fs;});
    return (tam?'Tamaño de ':'Mover ')+cambian.length+' logos';
  }
  return cambian.length+' cambios';
}
function _fgLgHistBotones(){
  var H=_fgLgHist,ok=H.src===_fgLgHistClave();
  var d=document.getElementById('fg-lg-desh'),r=document.getElementById('fg-lg-reh');
  var puedeD=ok&&H.i>0,puedeR=ok&&H.i>=0&&H.i<H.pasos.length-1;
  if(d){d.hidden=!_fgLg.on;d.disabled=!puedeD;d.title=puedeD?'Deshacer: '+H.pasos[H.i].et+' (Ctrl+Z)':'Nada para deshacer';}
  if(r){r.hidden=!_fgLg.on;r.disabled=!puedeR;r.title=puedeR?'Rehacer: '+H.pasos[H.i+1].et+' (Ctrl+Y)':'Nada para rehacer';}
}
function fgLgDeshacer(){
  _fgLgHistMarcar(); // un cambio recién hecho primero se anota (si no, se saltearía)
  var H=_fgLgHist;if(H.i<=0)return;
  var et=H.pasos[H.i].et;H.i--;_fgLgHistAplicar();showToast('Deshecho: '+et);
}
function fgLgRehacer(){
  _fgLgHistMarcar();
  var H=_fgLgHist;if(H.i>=H.pasos.length-1)return;
  H.i++;_fgLgHistAplicar();showToast('Rehecho: '+H.pasos[H.i].et);
}
function _fgLgHistAplicar(){
  var H=_fgLgHist,antes={},P=_fgLgHistLeer(H.pasos[H.i].lista);
  _fgLgActivos().forEach(function(e){antes[JSON.stringify(e)]=1;});
  // primero el recorte de ese paso (la lista está en sus coordenadas)
  var ahora=_fgRecActivo()?_fgRec.cortes:[];
  if(JSON.stringify(ahora)!==JSON.stringify(P.R)){
    if(P.R.length){
      if(!_fgRecActivo())_fgRec={orig:window.baseImg,cfg0:window.FLYER_CFG||{},cortes:[]};
      _fgRecPoner(JSON.parse(JSON.stringify(P.R)));
    }else if(_fgRecActivo()){window.baseImg=_fgRec.orig;window.FLYER_CFG=_fgRec.cfg0;_fgRec=null;}
    if(typeof calcSC==='function')calcSC();
    _fgMontosVisibles();
  }
  _fgLg.list=P.L;_fgLg.src=_fgLgSrc();_fgLg.sel=-1;_fgLg.grupo=[];
  _fgLgListo();_fgLgHistBotones();
  // parpadean los que cambiaron, así se ve qué se deshizo
  var mk=document.getElementById('fg-lg-mk');if(!mk)return;
  _fgLg.list.forEach(function(e,i){
    if(antes[JSON.stringify(e)])return;
    var m=mk.children[i];if(m&&m.classList.contains('fg-lg-marca')){m.classList.add('flash');setTimeout(function(){m.classList.remove('flash');},1300);}
  });
}
function fgLogosDeshacer(){_fgLg.list=[];_fgLg.sel=-1;if(!_fgProtoActivo())_fgLg.proy=null;_fgLgListo();showToast('Los logos volvieron a como vienen en el flyer.');}

// ·· Ventana para elegir el reemplazo ··
var _fgLgV={det:null,res:[],prov:'',rubro:'',q:'',loc:'',una:true,sinOnline:false};
var _FG_LG_COLORES=[['#1A1A1A','Negro'],['#6B6B6B','Gris'],['#FA6400','Naranja'],['#0B2C5F','Azul'],['#FFFFFF','Blanco']];
function _fgLgAbrir(det,op){
  op=op||{};
  var viejo=document.getElementById('fg-lg-ov');if(viejo)viejo.remove();
  // arranca con los filtros de Promociones → Activas (rubro y "ocultar online")
  _fgLgV.det=det;_fgLgV.q='';_fgLgV.rubro=_promosRubro||'';_fgLgV.sinOnline=_promosFiltros.online==='ocultar';
  // provincia y localidad: las de la última vez (o la de Promociones)
  if(!_fgLgV.prov){_fgLgV.prov=_promosProv||'';_fgLgV.loc=_fgLgV.prov===_promosProv?(_promosLoc||''):'';}
  var idx=_fgLgIndiceDe(det),ya=idx>=0?_fgLgActivos()[idx]:null;
  // Un lugar borrado (o tapado por una franja) ya no esconde nada: tocarlo es
  // para agregar algo nuevo. Sin esto, "Mover lo que hay" revivía el logo tapado.
  var cxd=det.x+det.w/2,cyd=det.y+det.h/2;
  // (si en el lugar hay un logo cambiado —p. ej. uno de una franja— no está tapado:
  // se reemplaza ese logo, con todas las opciones)
  var tapado=!(ya&&_fgLgAjustable(ya))&&(ya&&!_fgLgAjustable(ya)||_fgLgActivos().some(function(e){return e.franjaBase&&cxd>=e.x&&cxd<=e.x+e.w&&cyd>=e.y&&cyd<=e.y+e.h;}));
  if(tapado)det.vacio=true;
  // "Mover lo que hay" mueve el logo ORIGINAL del flyer: no va si encima ya hay
  // dentro de una franja armada (el de abajo está tapado por la franja)
  var sinMover=det.vacio||_fgLgActivos().some(function(e){return e.franjaBase&&cxd>=e.x&&cxd<=e.x+e.w&&cyd>=e.y&&cyd<=e.y+e.h;});
  var paraAgregar=det.vacio&&(!ya||!_fgLgAjustable(ya));
  // Reemplazar varios: una marca por lugar, en el orden en que se tocan
  var V=op.varios&&op.varios.length?{T:op.varios,picks:[]}:null;_fgLgV.varios=V;
  if(V){det.vacio=true;paraAgregar=false;ya=null;}
  var lgOv=document.createElement('div');lgOv.id='fg-lg-ov';lgOv.className='fg-cf-ov';
  lgOv.setAttribute('role','dialog');lgOv.setAttribute('aria-modal','true');lgOv.setAttribute('aria-labelledby','fg-lg-t');
  lgOv.innerHTML='<div class="fg-cf fg-lg">'+
    '<div class="fg-lg-h"><canvas id="fg-lg-ori" class="fg-lg-ori" aria-hidden="true"></canvas>'+
      '<div style="flex:1;min-width:0"><div class="fg-cf-t" id="fg-lg-t">'+(paraAgregar?'Agregar ac&aacute;':'Cambiar esto')+'</div>'+
      '<div class="fg-cf-b">'+(ya?(_fgLgAjustable(ya)?'Ahora dice <b>'+_escHtml(ya.t)+'</b>. ':'Ahora est&aacute; vac&iacute;o. '):'')+'Eleg&iacute; una marca de Promociones, sub&iacute; un logo, escrib&iacute; un texto o mov&eacute; lo que hay. El cambio vale s&oacute;lo para este flyer.</div></div>'+
      '<button type="button" class="fg-lg-x" id="fg-lg-x" aria-label="Cerrar">&times;</button></div>'+
    '<div class="fg-lg-modos">'+
      (sinMover?'':'<button type="button" class="btn bg" id="fg-lg-mover"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg> Mover o agrandar lo que hay</button>')+
      '<button type="button" class="btn bg" id="fg-lg-escribir"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> Escribir un texto</button>'+
      '<button type="button" class="btn bg" id="fg-lg-subir" title="Para marcas que no est&aacute;n en Promociones (PNG o JPG; mejor con fondo blanco o transparente)">'+
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Subir logo de la PC</button>'+
      '<input type="file" id="fg-lg-file" accept="image/png,image/jpeg,image/webp" hidden>'+
    '</div>'+
    '<div class="fg-lg-txt" id="fg-lg-txt" hidden>'+
      '<button type="button" class="fg-lg-atras" id="fg-lg-txt-volver">&larr; Elegir una marca</button>'+
      '<label class="fg-lg-txt-l" for="fg-lg-tx">Texto <span>(Enter = otro rengl&oacute;n)</span></label>'+
      '<textarea id="fg-lg-tx" rows="2" maxlength="120" placeholder="Ej.: Martes y jueves"></textarea>'+
      '<div class="fg-lg-txt-fila"><span class="fg-lg-txt-l">Color</span><span class="fg-lg-cols" id="fg-lg-cols" role="radiogroup" aria-label="Color del texto"></span><span class="fg-lg-col-nom" id="fg-lg-col-nom"></span></div>'+
      '<div class="fg-lg-txt-fila"><span class="fg-lg-txt-l">Tama&ntilde;o</span><input type="range" id="fg-lg-fs" min="10" max="120" step="1"><span class="fg-lg-pct" id="fg-lg-fs-v"></span>'+
        '<label class="fg-lg-neg"><input type="checkbox" id="fg-lg-neg"> Negrita</label></div>'+
      '<div class="fg-lg-muestra" id="fg-lg-muestra"></div>'+
    '</div>'+
    _fgPfHtml('fg-lg','Buscar marca (ej.: Farmacia del Pueblo)')+
    (det.corta?'<div class="fg-lg-aviso">Ojo: el recuadro que marcaste corta parte de otro dibujo del flyer y lo va a tapar a medias. Si no es lo que quer&eacute;s, cancel&aacute; y marcalo de nuevo.</div>':'')+
    (''+'<label class="fg-lg-dias-chk" id="fg-lg-dias-l"><input type="checkbox" id="fg-lg-dias"'+(_fgLgV.conDias!==false?' checked':'')+'> Si es un s&uacute;per, poner tambi&eacute;n sus d&iacute;as debajo <span>(reemplaza el texto de d&iacute;as que hay)</span></label>')+
    '<div class="fg-lg-info-fila"><div class="fg-lg-info" id="fg-lg-info"></div>'+
      '<button type="button" class="fg-lg-enlace fg-lg-full" id="fg-lg-full" title="Ver todas las promociones en la solapa Activas y elegir de ah&iacute;">Elegir en pantalla completa</button></div>'+
    '<div class="fg-lg-list" id="fg-lg-list"><div class="fg-lg-vacio">Cargando promociones&hellip;</div></div>'+
    '<div class="fg-cf-acts fg-lg-acts" id="fg-lg-acts">'+
      '<span class="fg-lg-acts-izq">'+
        (ya?'<button type="button" class="fg-lg-enlace" id="fg-lg-ori-btn">Volver al original</button>':'')+
        (paraAgregar?'':'<button type="button" class="fg-lg-enlace" id="fg-lg-nada">Dejar el lugar vac&iacute;o</button>')+
      '</span>'+
      '<button type="button" class="btn bg" id="fg-lg-no">Cancelar</button>'+
      '<button type="button" class="btn bp" id="fg-lg-txt-ok" hidden>Poner el texto</button></div></div>';
  document.body.appendChild(lgOv);
  // Muestra del logo original, tal cual está en el flyer.
  try{
    var o=document.getElementById('fg-lg-ori'),k=Math.min(1,96/det.w,56/det.h);
    if(det.vacio)o.hidden=true; // lugar libre: no hay logo original que mostrar
    o.width=Math.max(1,Math.round(det.w*k));o.height=Math.max(1,Math.round(det.h*k));
    o.getContext('2d').drawImage(baseImg,det.x,det.y,det.w,det.h,0,0,o.width,o.height);
  }catch(e){}
  function cerrar(){document.removeEventListener('keydown',tecla,true);lgOv.remove();_fgLgV.varios=null;}
  function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();}}
  document.addEventListener('keydown',tecla,true);
  lgOv.addEventListener('click',function(e){if(e.target===lgOv)cerrar();});
  document.getElementById('fg-lg-x').onclick=cerrar;
  document.getElementById('fg-lg-no').onclick=cerrar;
  var subir=document.getElementById('fg-lg-subir'),file=document.getElementById('fg-lg-file');
  subir.onclick=function(){file.value='';file.click();};
  file.onchange=function(){
    var f=file.files&&file.files[0];if(!f)return;
    subir.disabled=true;
    var src0=_fgLgSrc();
    _fgLgLeerArchivo(f).then(function(r){
      if(!lgOv.isConnected||_fgLgSrc()!==src0)return; // se cerró la ventana o cambió el flyer mientras tanto
      cerrar();_fgLgPoner(det,r.clave,r.nombre,r.logo);
      showToast('Listo: tu logo quedó en este flyer. Tocalo para agrandarlo o moverlo.');
    }).catch(function(e){
      subir.disabled=false;
      var m=e&&e.message;
      showToast(m==='formato'?'Ese archivo no es una imagen PNG o JPG.':m==='pesado'?'La imagen pesa más de 8 MB: probá con una más liviana.':'No se pudo leer esa imagen. Probá con otra.');
    });
  };
  var mov=document.getElementById('fg-lg-mover');
  if(mov)mov.onclick=function(){cerrar();_fgLgMoverOriginal(det);showToast('Arrastralo para moverlo, o usá la barrita para el tamaño.');};
  // ·· formulario del texto ··
  var previo=op.texto||null,col=previo?previo.color:null,orig=det.vacio?null:_fgLgColorDe(det),fsTocado=!!previo;
  var tx=document.getElementById('fg-lg-tx'),fsI=document.getElementById('fg-lg-fs'),fsV=document.getElementById('fg-lg-fs-v'),neg=document.getElementById('fg-lg-neg');
  var cols=(orig?[[orig,'Como estaba']]:[]).concat(_FG_LG_COLORES);
  if(!col)col=cols[0][0];
  function lineas(){return Math.max(1,(tx.value||'').split('\n').length);}
  // Tamaño sugerido: reemplazando un texto, la letra del original (su alto
  // repartido en los renglones que TENÍA, no en los que se escriben ahora); en un
  // lugar libre, que el texto escrito entre en el recuadro marcado.
  var renOrig=det.vacio?0:_fgLgRenglones(det);
  function fsSugerido(){var f=renOrig?det.h/renOrig:det.h/lineas()*0.8;return Math.max(12,Math.min(90,Math.round(f)));}
  function pintarCols(){
    var nom='';
    document.getElementById('fg-lg-cols').innerHTML=cols.map(function(c,i){
      var on=c[0].toLowerCase()===String(col).toLowerCase();if(on)nom=c[1];
      return '<button type="button" role="radio" aria-checked="'+on+'" class="fg-lg-col'+(on?' on':'')+'" data-c="'+i+'" title="'+c[1]+'" aria-label="'+c[1]+'"><span style="background:'+c[0]+'"></span></button>';
    }).join('');
    document.getElementById('fg-lg-col-nom').textContent=nom;
  }
  function muestra(){
    var m=document.getElementById('fg-lg-muestra'),t=(tx.value||'').trim()?tx.value:'Así se va a ver';
    m.style.background=det.bg;m.style.color=col;m.style.fontWeight=neg.checked?700:500;
    m.style.fontSize=Math.max(12,Math.min(44,+fsI.value))+'px';
    m.textContent=t;fsV.textContent=fsI.value+' px';
  }
  document.getElementById('fg-lg-cols').addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.fg-lg-col');if(!b)return;
    col=cols[+b.getAttribute('data-c')][0];pintarCols();muestra();
  });
  tx.addEventListener('input',function(){if(!fsTocado)fsI.value=fsSugerido();muestra();});
  fsI.addEventListener('input',function(){fsTocado=true;muestra();});
  neg.addEventListener('change',muestra);
  function modoTexto(on){
    document.getElementById('fg-lg-txt').hidden=!on;
    document.getElementById('fg-lg-txt-ok').hidden=!on;     // la acción principal sólo en el texto
    document.getElementById('fg-lg-txt-volver').hidden=!!previo; // editando un texto no hay "marcas" a las que volver
    ['fg-lg-filtros','fg-lg-chk','fg-lg-dias-l','fg-lg-info','fg-lg-list'].forEach(function(id){var x=document.getElementById(id);if(x)x.hidden=on;});
    var md=lgOv.querySelector('.fg-lg-modos');if(md)md.hidden=on;
    var av=lgOv.querySelector('.fg-lg-aviso');if(av&&on)av.hidden=false;
    if(on)setTimeout(function(){try{tx.focus();}catch(e){}},20);
  }
  if(previo){tx.value=previo.texto;neg.checked=(previo.peso||500)>=700;fsI.value=Math.round(previo.fs);}
  else fsI.value=fsSugerido();
  pintarCols();muestra();
  document.getElementById('fg-lg-escribir').onclick=function(){modoTexto(true);};
  document.getElementById('fg-lg-txt-volver').onclick=function(){if(previo){cerrar();return;}modoTexto(false);};
  document.getElementById('fg-lg-txt-ok').onclick=function(){
    var t=(tx.value||'').replace(/\r/g,'').replace(/[ \t]+$/gm,'').trim();
    if(!t){showToast('Escribí el texto primero.');tx.focus();return;}
    cerrar();
    _fgLgPonerTexto(det,{texto:t,color:col,peso:neg.checked?700:500,fs:+fsI.value},previo);
    showToast('Listo. Arrastralo para moverlo, o usá la barrita para el tamaño.');
  };
  if(previo)modoTexto(true);
  var nada=document.getElementById('fg-lg-nada');
  if(nada)nada.onclick=function(){cerrar();_fgLgPoner(det,'','',null);showToast('Listo: ese lugar queda vacío en este flyer.');};
  var ob=document.getElementById('fg-lg-ori-btn');
  if(ob)ob.onclick=function(){cerrar();_fgLg.list.splice(_fgLgIndiceDe(det),1);_fgLg.sel=-1;_fgLgListo();showToast('Ese logo volvió al original.');};
  var full=document.getElementById('fg-lg-full');
  if(full){
    if(V||previo)full.hidden=true;
    else full.onclick=function(){cerrar();_fgLgIrActivas(det);};
  }
  var dch=document.getElementById('fg-lg-dias');
  if(dch)dch.onchange=function(){_fgLgV.conDias=dch.checked;};
  var q=document.getElementById('fg-lg-q');
  _fgPfInit('fg-lg',_fgLgV,function(){if(document.getElementById('fg-lg-ov'))_fgLgLista();});
  if(V){
    lgOv.querySelector('.fg-lg').classList.add('varios');
    document.getElementById('fg-lg-t').textContent='Reemplazar '+V.T.length+' lugares';
    var bd=lgOv.querySelector('.fg-cf-b');if(bd)bd.innerHTML='Toc&aacute; las marcas en el orden en que van: la 1 va al primer lugar (de izquierda a derecha y de arriba abajo), la 2 al segundo, y as&iacute;. Tocala de nuevo para sacarla.';
    var md=lgOv.querySelector('.fg-lg-modos');if(md)md.hidden=true;
    var oc=document.getElementById('fg-lg-ori');if(oc)oc.hidden=true;
    var izq=lgOv.querySelector('.fg-lg-acts-izq');if(izq)izq.innerHTML='';
    var okv=document.createElement('button');okv.type='button';okv.className='btn bp';okv.id='fg-lg-varios-ok';okv.disabled=true;okv.textContent='Poner las marcas';
    document.getElementById('fg-lg-acts').appendChild(okv);
    okv.onclick=function(){
      var P=V.picks.slice(),T=V.T,src0=_fgLgSrc(),conD=_fgLgV.conDias!==false;if(!P.length)return;
      okv.disabled=true;okv.textContent='Poniendo…';
      Promise.all(P.map(function(p){return _fgLgTraer(p.imagen);})).then(function(logos){
        if(!lgOv.isConnected||_fgLgSrc()!==src0)return;
        cerrar();
        P.forEach(function(p,i){if(T[i])_fgLgPonerMarca(T[i],p,logos[i],conD);});
        _fgLg.lugares=[];_fgLg.grupo=[];_fgLg.sel=-1;_fgLgListo();
        showToast('Listo: '+P.length+(P.length===1?' marca puesta':' marcas puestas')+(P.length<T.length?' ('+(T.length-P.length)+' lugares quedaron como estaban)':'')+'. Con Ctrl+Z se deshace.');
      }).catch(function(){
        if(!lgOv.isConnected)return;
        okv.disabled=false;_fgLgVariosMarcar();
        showToast('No se pudo bajar algún logo. Probá de nuevo o elegí otra marca.');
      });
    };
  }
  document.getElementById('fg-lg-list').addEventListener('click',function(e){
    var it=e.target.closest&&e.target.closest('.fg-lg-it');if(!it||it.disabled)return;
    var p=_fgLgV.res[+it.getAttribute('data-i')];if(!p)return;
    if(V){
      var k=-1;for(var j=0;j<V.picks.length;j++)if(V.picks[j].imagen===p.imagen){k=j;break;}
      if(k>=0)V.picks.splice(k,1);
      else if(V.picks.length>=V.T.length){showToast('Ya elegiste '+V.T.length+': sacá una para cambiarla.');return;}
      else{V.picks.push(p);_fgLgTraer(p.imagen).catch(function(){});}
      _fgLgVariosMarcar();return;
    }
    it.disabled=true;it.classList.add('cargando');
    var src0=_fgLgSrc();
    _fgLgTraer(p.imagen).then(function(logo){
      // la descarga puede tardar: si mientras tanto se cerró la ventana o se
      // cambió de flyer, no se aplica (antes caía en el flyer nuevo con las
      // coordenadas del anterior)
      if(!lgOv.isConnected||_fgLgSrc()!==src0)return;
      cerrar();
      var conD=_fgLgPonerMarca(det,p,logo,_fgLgV.conDias!==false);
      showToast(_fgLgAvisoMarca(p.titulo,p,conD));
    }).catch(function(){
      if(!lgOv.isConnected)return;
      it.disabled=false;it.classList.remove('cargando');
      showToast('No se pudo bajar el logo de '+p.titulo+'. Probá con otro o revisá la conexión.');
    });
  });
  if(!previo)setTimeout(function(){try{q.focus();}catch(e){}},30);
  if(_promosCat)_fgLgFiltros();
  else loadPromosCatalogo(function(){if(document.getElementById('fg-lg-ov'))_fgLgFiltros();});
}
function _fgLgFiltros(){
  _fgPfPoblar('fg-lg',_fgLgV);
  _fgLgLista();
}
// ·· Filtros de marcas de las ventanas de logos (un logo y Armar franja) ··
// Los mismos que la solapa "Activas" de Promociones: provincia, LOCALIDAD (se le
// pregunta a Galicia en el momento, como allá: las de compra online valen en
// todas), rubro, UNA POR MARCA (junta "Adidas." con "Adidas MDQ", con la misma
// regla que Activas: _promoBaseMarca/_promoClaveMarca) y SIN LAS ONLINE.
// st = {q, rubro, prov, loc, una, sinOnline}; px = prefijo de los ids.
var _fgLocIds={}; // 'PROVINCIA|LOCALIDAD' → ids de Galicia | 'cargando' (si falla, se borra y se reintenta)
function _fgPfHtml(px,ph){
  return '<div class="fg-lg-fil" id="'+px+'-filtros"><input type="search" id="'+px+'-q" placeholder="'+ph+'" autocomplete="off">'+
      '<select id="'+px+'-rub" aria-label="Rubro"></select><select id="'+px+'-prov" aria-label="Provincia"></select>'+
      '<select id="'+px+'-loc" aria-label="Localidad" hidden></select></div>'+
    '<div class="fg-lg-chk" id="'+px+'-chk"><label><input type="checkbox" id="'+px+'-una"> Una por marca</label>'+
      '<label><input type="checkbox" id="'+px+'-onl"> Sin las de compra online</label></div>';
}
function _fgPfInit(px,st,cambio){
  var q=document.getElementById(px+'-q'),t=0;
  q.value=st.q||'';
  q.addEventListener('input',function(){clearTimeout(t);t=setTimeout(function(){st.q=q.value;cambio();},120);});
  document.getElementById(px+'-rub').onchange=function(){st.rubro=this.value;cambio();};
  document.getElementById(px+'-prov').onchange=function(){st.prov=this.value;st.loc='';_fgPfLocs(px,st);cambio();};
  document.getElementById(px+'-loc').onchange=function(){st.loc=this.value;cambio();};
  var una=document.getElementById(px+'-una'),onl=document.getElementById(px+'-onl');
  una.checked=st.una!==false;onl.checked=!!st.sinOnline;
  una.onchange=function(){st.una=una.checked;cambio();};
  // "sin las online" es el mismo filtro que el tilde de Activas: se mantienen iguales
  onl.onchange=function(){st.sinOnline=onl.checked;_promosFiltros.online=onl.checked?'ocultar':'';var so=document.getElementById('promos-sinubic');if(so)so.checked=onl.checked;cambio();};
}
function _fgPfPoblar(px,st){
  var rs={};(_promosCat||[]).forEach(function(p){if(p.subtitulo)rs[p.subtitulo]=1;});
  var rub=document.getElementById(px+'-rub'),prov=document.getElementById(px+'-prov');
  if(rub)rub.innerHTML='<option value="">Todos los rubros</option>'+Object.keys(rs).sort().map(function(r){return '<option value="'+_escAttr(r)+'"'+(r===st.rubro?' selected':'')+'>'+_escHtml(r)+'</option>';}).join('');
  if(prov){
    var ps=_promosHayGeo()?_promosProvincias():[];
    prov.hidden=!ps.length;
    if(st.prov&&ps.indexOf(st.prov)<0)st.prov='';
    prov.innerHTML='<option value="">Todas las provincias</option>'+ps.map(function(n){return '<option value="'+_escAttr(n)+'"'+(n===st.prov?' selected':'')+'>'+_escHtml(_promoTitulizar(n))+'</option>';}).join('');
  }
  _fgPfLocs(px,st);
}
function _fgPfLocs(px,st){
  var sel=document.getElementById(px+'-loc');if(!sel)return;
  var u=null;
  for(var i=0;i<_promosUbic.length;i++){if(String(_promosUbic[i].nombre)===st.prov){u=_promosUbic[i];break;}}
  var locs=(u&&Array.isArray(u.localidades))?u.localidades:[];
  if(st.loc&&locs.indexOf(st.loc)<0)st.loc='';
  sel.hidden=!st.prov||!locs.length;
  sel.innerHTML='<option value="">Todas las localidades</option>'+locs.map(function(n){
    return '<option value="'+_escAttr(n)+'"'+(n===st.loc?' selected':'')+'>'+_escHtml(_promoTitulizar(n))+'</option>';
  }).join('');
}
// Devuelve {lista} o {cargando:true} mientras Galicia contesta qué hay en la
// localidad (al llegar se llama a cambio() para volver a pintar).
function _fgPfFiltrar(st,cambio){
  var porId=null;
  if(st.prov&&st.loc){
    var k=st.prov+'|'+st.loc,ids=_fgLocIds[k];
    if(ids===undefined){
      _fgLocIds[k]='cargando';
      _callPromosFn('ubicacion',{provincia:st.prov,localidad:st.loc},function(err,d){
        if(err||!d||!d.data){
          // como en Activas: se avisa, se vuelve a 'Todas las localidades' y la
          // próxima vez que se la elija se le vuelve a preguntar a Galicia
          console.error('logos ubicacion:',err||d);
          delete _fgLocIds[k];
          var loc=st.loc;
          if(st.prov+'|'+st.loc===k){
            st.loc='';
            document.querySelectorAll('select[aria-label=Localidad]').forEach(function(sl){if(sl.value===loc)sl.value='';});
          }
          showToast('No se pudo filtrar por localidad: se muestra toda la provincia. Probá elegirla de nuevo en un rato.');
        }else _fgLocIds[k]=d.data.ids||[];
        cambio();
      });
      return {cargando:true,lista:[]};
    }
    if(ids==='cargando')return {cargando:true,lista:[]};
    if(Array.isArray(ids)){porId={};ids.forEach(function(id){porId[id]=1;});}
  }
  var hoy=new Date(),toks=_promoTokens(_promoNormalizar(st.q||'')),porImg={};
  (_promosCat||[]).forEach(function(p){
    if(!p.imagen||p.proximamente)return;
    if(_promoEstado(p.fecha_hasta,hoy)==='VENCIDA')return;
    if(st.rubro&&p.subtitulo!==st.rubro)return;
    if(st.prov&&!_promoEnProvincia(p,st.prov))return;
    var online=_promoEsOnline(p);
    if(st.sinOnline&&online)return;
    if(porId&&!porId[p.id]&&!online)return; // las online no son de ninguna localidad
    var o=porImg[p.imagen];if(!o||_promoMejorQue(p,o))porImg[p.imagen]=p;
  });
  // una por logo y por nombre (siempre); y, con el tilde, una por MARCA
  var vistos={},base=[];
  Object.keys(porImg).forEach(function(k){var p=porImg[k],n=_promoNormalizar(p.titulo||'');if(vistos[n])return;vistos[n]=1;base.push(p);});
  if(st.una!==false){
    var bases={},grupos={},orden=[];
    base.forEach(function(p){bases[_promoBaseMarca(p.titulo)]=1;});
    base.forEach(function(p){
      var k=_promoClaveMarca(_promoBaseMarca(p.titulo),bases);
      if(!grupos[k]){grupos[k]=p;orden.push(k);}
      else if(_promoMejorQue(p,grupos[k]))grupos[k]=p;
    });
    base=orden.map(function(k){return grupos[k];});
  }
  var L=toks.length?base.filter(function(p){var n=_promoNormalizar(p.titulo||'');for(var i=0;i<toks.length;i++)if(n.indexOf(toks[i])<0)return false;return true;}):base;
  var q0=toks.join(' ');
  L.sort(function(a,b){
    var na=_promoNormalizar(a.titulo||''),nb=_promoNormalizar(b.titulo||'');
    if(q0){var pa=na.indexOf(q0)===0?0:1,pb=nb.indexOf(q0)===0?0:1;if(pa!==pb)return pa-pb;}
    // con provincia elegida, primero las que son de ahí: las online (valen en
    // todo el país, casi siempre espectáculos) van después
    if(st.prov){var oa=_promoEsOnline(a)?1:0,ob=_promoEsOnline(b)?1:0;if(oa!==ob)return oa-ob;}
    return na<nb?-1:na>nb?1:0;
  });
  return {lista:L};
}
// Renglón chico de cada marca: rubro, si es de compra online (como en Activas) y hasta cuándo.
function _fgPfSub(p){
  var d=_promoEsSuper(p)?_promoDias(p):'';
  return _escHtml(p.subtitulo||'')+(d?' · <b class="fg-pf-dias">'+_escHtml(d)+'</b>':'')+(_promoEsOnline(p)?' · <b class="fg-pf-onl">Online</b>':'')+(p.fecha_hasta?' · hasta '+_escHtml(_promosFmtFecha(p.fecha_hasta).slice(0,5)):'');
}
// Texto de "dónde": provincia y localidad elegidas.
function _fgPfDonde(st){return st.prov?' en '+_promoTitulizar(st.loc||st.prov):'';}
function _fgLgLista(){
  var box=document.getElementById('fg-lg-list'),info=document.getElementById('fg-lg-info');if(!box)return;
  var r=_fgPfFiltrar(_fgLgV,function(){if(document.getElementById('fg-lg-ov'))_fgLgLista();});
  if(r.cargando){_fgLgV.res=[];if(info)info.textContent='';box.innerHTML='<div class="fg-lg-vacio">Buscando las promos de '+_escHtml(_promoTitulizar(_fgLgV.loc))+'&hellip;</div>';return;}
  var L=r.lista;
  var MAX=60;_fgLgV.res=L.slice(0,MAX);
  if(info)info.textContent=!(_promosCat&&_promosCat.length)?'':
    (L.length?(L.length>MAX?'Mostrando '+MAX+' de '+L.length+' marcas vigentes'+_fgPfDonde(_fgLgV)+': escribí o elegí un rubro para encontrar la tuya.':L.length+(L.length===1?' marca vigente':' marcas vigentes')+_fgPfDonde(_fgLgV)+'.'):'');
  if(!(_promosCat&&_promosCat.length)){box.innerHTML='<div class="fg-lg-vacio">No se pudo leer el catálogo de promociones.</div>';return;}
  if(!L.length){box.innerHTML='<div class="fg-lg-vacio">No hay promos vigentes con esos filtros'+_escHtml(_fgPfDonde(_fgLgV))+'. Si la marca no est&aacute; en Promociones, us&aacute; <b>Subir logo de la PC</b>.</div>';return;}
  box.innerHTML=_fgLgV.res.map(function(p,i){
    return '<button type="button" class="fg-lg-it" data-i="'+i+'" title="'+_escAttr(p.titulo)+'">'+
      '<span class="fg-lg-it-img"><img loading="lazy" decoding="async" alt="" src="'+_escAttr(PROMO_LOGO_BASE+p.imagen)+'"></span>'+
      '<span class="fg-lg-it-t">'+_escHtml(p.titulo)+'</span>'+
      '<span class="fg-lg-it-s">'+_fgPfSub(p)+'</span></button>';
  }).join('');
  if(_fgLgV.varios)_fgLgVariosMarcar();
}
// Reemplazar varios: número de orden en cada marca elegida y el botón con la cuenta.
function _fgLgVariosMarcar(){
  var V=_fgLgV.varios;if(!V)return;
  Array.prototype.forEach.call(document.querySelectorAll('#fg-lg-list .fg-lg-it'),function(it){
    var p=_fgLgV.res[+it.getAttribute('data-i')],n=0;
    if(p)for(var j=0;j<V.picks.length;j++)if(V.picks[j].imagen===p.imagen){n=j+1;break;}
    it.classList.toggle('elegida',!!n);if(n)it.setAttribute('data-n',n);else it.removeAttribute('data-n');
  });
  var ok=document.getElementById('fg-lg-varios-ok');
  if(ok&&ok.textContent!=='Poniendo…'){ok.disabled=!V.picks.length;ok.textContent=V.picks.length?'Poner '+V.picks.length+' de '+V.T.length:'Poner las marcas';}
}

// ══ ARMAR FRANJA (16-oct-2026) ════════════════════════════════════════════════
// Para cuando hay que rehacer TODA una franja de logos ("Aprovechá beneficios…",
// los súper) y no sólo cambiar uno o dos: se marca la franja con un recuadro, se
// tildan marcas de Promociones en el orden en que van (después se reordenan) y
// la app tapa la franja entera y acomoda los logos en filas, centrados y con un
// peso visual parejo. Por defecto respeta cuántos había por fila en el original.
// Cada logo queda como un cambio común (se ajusta con la barrita de siempre) y
// todos llevan el mismo "franja" para volver a abrir la franja y retocarla.
var _FG_FR_MAX=30;
var _fgFr={modo:false};
function fgFranjaModo(on){
  _fgFr.modo=(on===undefined)?!_fgFr.modo:!!on;
  if(!_fgFr.modo&&on===undefined)_fgFr.pendiente=null; // tocó "Cancelar franja": se descarta lo pendiente
  if(_fgFr.modo&&!_fgLg.on)fgLogosModo(true);
  var prev=document.querySelector('.prev');if(prev)prev.classList.toggle('fg-fr-on',_fgFr.modo);
  _fgLgBarra();
}
// Logos dentro del recuadro (px de imagen) y cómo están acomodados: mismo
// criterio que tocar un logo suelto (fondo = color que más se repite, partes a
// menos de _FG_LG_GAP px son el mismo logo), pero para todos a la vez.
function _fgFrDetectar(x,y,w,h){
  var d=_fgLgPixeles(x,y,w,h),bg=_fgLgFondo(d);
  var CS=3,cw=Math.ceil(w/CS),ch=Math.ceil(h/CS),on=new Uint8Array(cw*ch),i,j,p;
  for(j=0;j<h;j++){
    var f=((j/CS)|0)*cw;
    for(i=0;i<w;i++){p=(j*w+i)*4;if(Math.max(Math.abs(d[p]-bg[0]),Math.abs(d[p+1]-bg[1]),Math.abs(d[p+2]-bg[2]))>_FG_LG_TOL)on[f+((i/CS)|0)]=1;}
  }
  var R=Math.ceil(_FG_LG_GAP/CS),visto=new Uint8Array(cw*ch),logos=[];
  for(var s=0;s<cw*ch;s++){
    if(!on[s]||visto[s])continue;
    var cola=[s],bx0=cw,by0=ch,bx1=-1,by1=-1;visto[s]=1;
    while(cola.length){
      var c=cola.pop(),cx=c%cw,cy=(c/cw)|0;
      if(cx<bx0)bx0=cx;if(cx>bx1)bx1=cx;if(cy<by0)by0=cy;if(cy>by1)by1=cy;
      for(var ny=Math.max(0,cy-R);ny<=Math.min(ch-1,cy+R);ny++)for(var nx=Math.max(0,cx-R);nx<=Math.min(cw-1,cx+R);nx++){
        var q=ny*cw+nx;if(on[q]&&!visto[q]){visto[q]=1;cola.push(q);}
      }
    }
    var bw=(bx1-bx0+1)*CS,bh=(by1-by0+1)*CS;
    if(bw<12&&bh<12)continue; // motitas de la compresión
    logos.push({x:x+bx0*CS,y:y+by0*CS,w:bw,h:bh});
  }
  // filas por altura del centro
  logos.sort(function(a,b){return (a.y+a.h/2)-(b.y+b.h/2);});
  var filas=[];
  logos.forEach(function(l){
    var cy=l.y+l.h/2,f=filas[filas.length-1];
    if(f&&Math.abs(cy-f.cy)<=Math.max(f.h,l.h)*0.6){f.n++;f.cy=(f.cy*(f.n-1)+cy)/f.n;f.h=Math.max(f.h,l.h);}
    else filas.push({cy:cy,h:l.h,n:1,ls:[]});
    filas[filas.length-1].ls=(filas[filas.length-1].ls||[]).concat([l]);
  });
  // Una fila mucho más baja pegada debajo de otra es el TEXTO de esa fila (los
  // días de los súper: "Martes y jueves"), no logos: no cuenta como fila ni como
  // lugar. Sin esto, la grilla de súper daba 6 filas bajitas y los logos (y los
  // días) salían chiquitos.
  var sinTxt=[];
  filas.forEach(function(f){
    var ant=sinTxt[sinTxt.length-1];
    if(ant&&!ant.txt&&f.h<=ant.h*0.65&&f.cy-ant.cy<=ant.h*1.35+f.h){f.txt=true;ant.conTexto=true;}
    sinTxt.push(f);
  });
  var txtH=[];sinTxt.forEach(function(f){if(f.txt)(f.ls||[]).forEach(function(l){txtH.push(l.h);});});
  if(txtH.length){
    filas=sinTxt.filter(function(f){return !f.txt;});
    logos=[];filas.forEach(function(f){logos=logos.concat(f.ls);});
  }
  filas.forEach(function(f){delete f.ls;});
  var hs=logos.map(function(l){return l.h;}).sort(function(a,b){return a-b;});
  // conTexto: la franja original tenía días debajo; txtH: el alto del renglón más bajo (un renglón de días)
  return {bg:_fgLgRgb(bg),n:logos.length,filas:filas,porFila:filas.reduce(function(m,f){return Math.max(m,f.n);},0),medH:hs.length?hs[hs.length>>1]:0,
    conTexto:txtH.length>0,txtH:txtH.length?Math.min.apply(null,txtH):0,maxH:hs.length?hs[hs.length-1]:0};
}
// Lugares para n logos con "cols" por fila (0 = automático: se reparten parejo
// en las mismas filas que el original; 8 logos en una franja de 2 filas → 4 y 4,
// no 7 y 1; 20 en una de 2 filas de 7 → 10 y 10). Sólo se suma una fila si por
// fila quedarían más de 1,5 veces los que había. Si quedan las mismas filas que
// en el original, se usan sus alturas; si no, se reparten parejo DENTRO de la
// zona donde estaban los logos (no en todo el recuadro: si el recuadro agarra
// parte del título o del texto de abajo, la fila nueva los pisaba).
// La última fila, si queda corta, va centrada.
function _fgFrLugares(st,n){
  var r=st.rect,info=st.info,cols=st.cols;
  if(!cols){
    var F=info.filas.length;
    if(!F)cols=Math.min(6,Math.max(1,n));
    else{
      var tope=Math.max(info.porFila,Math.floor(info.porFila*1.5)),nf=F;
      while(Math.ceil(n/nf)>tope)nf++;
      cols=Math.ceil(n/nf);
    }
  }
  cols=Math.max(1,Math.min(cols,n||1));
  var filas=Math.max(1,Math.ceil(n/cols)),cys=[],paso;
  if(info.filas.length===filas&&filas>0){
    cys=info.filas.map(function(f){return f.cy;});
    paso=filas>1?(cys[filas-1]-cys[0])/(filas-1):r.h;
  }else{
    var F0=info.filas,ya=r.y,yb=r.y+r.h;
    if(F0.length>1){
      var p0=(F0[F0.length-1].cy-F0[0].cy)/(F0.length-1);
      ya=Math.max(r.y,F0[0].cy-p0/2);yb=Math.min(r.y+r.h,F0[F0.length-1].cy+p0/2);
    }
    paso=(yb-ya)/filas;
    for(var k=0;k<filas;k++)cys.push(ya+paso*(k+0.5));
  }
  var celda=r.w/cols,alto=Math.min(paso*0.82,info.medH?info.medH*1.15:paso*0.7),ancho=celda*0.86,out=[];
  // grilla con días debajo (súper): el lugar del logo es lo que queda entre fila y
  // fila menos dos renglones de días, sin pasar al logo más alto del original
  if(info.conTexto&&info.txtH&&paso>0){var fsT=info.txtH/0.75;alto=Math.max(alto,Math.min(paso*0.9-fsT*_FG_LG_INTER*2-fsT*0.35,(info.maxH||alto)*1.05));}
  for(var i=0;i<n;i++){
    var fi=Math.floor(i/cols),c=i%cols,enFila=Math.min(cols,n-fi*cols),x0=r.x+(r.w-enFila*celda)/2;
    out.push({cx:x0+celda*(c+0.5),cy:cys[fi],w:ancho,h:alto});
  }
  return out;
}
// Peso visual parejo: todos con más o menos la misma superficie (uno muy
// apaisado no queda finito, uno cuadrado no queda gigante), sin pasarse del lugar.
function _fgFrEncajar(l,asp){
  var A=l.h*l.h*1.5,w=Math.sqrt(A*asp),h=Math.sqrt(A/asp),k=Math.min(1,l.w/w,l.h/h);
  w*=k;h*=k;
  return {tx:l.cx-w/2,ty:l.cy-h/2,tw:w,th:h};
}
function _fgFrSolapa(a,r){
  var ix=Math.min(a.ox+a.ow,r.x+r.w)-Math.max(a.ox,r.x),iy=Math.min(a.oy+a.oh,r.y+r.h)-Math.max(a.oy,r.y);
  return (ix>0&&iy>0)?ix*iy/Math.max(1,Math.min(a.ow*a.oh,r.w*r.h)):0;
}
// ·· Elegir en Promociones → Activas, a pantalla completa ··
// La ventana de la franja se cierra pero su selección (_fgElegir.st) sigue viva:
// en la tabla de Activas cada fila trae un botón "+" (con el número de orden si
// ya está elegida) y arriba una barra fija con "Volver a la franja". Volver
// reabre la ventana con lo elegido y con los filtros que se dejaron en Activas.
var _fgElegir=null;
function _fgFrIrActivas(st){
  _fgElegir={st:st};
  switchApp('promos');
  if(typeof switchPromoTab==='function')switchPromoTab('activas');
  // los mismos filtros que en la ventana
  _promosFiltros.repetidas=st.una!==false?'ocultar':'';
  var um=document.getElementById('promos-unamarca');if(um)um.checked=st.una!==false;
  _promosFiltros.online=st.sinOnline?'ocultar':'';
  var so=document.getElementById('promos-sinubic');if(so)so.checked=!!st.sinOnline;
  function seguir(){
    if(!_fgElegir||_fgElegir.st!==st)return;
    _fgElegirBar();
    if(!st.prov){showToast('Elegí una provincia a la izquierda y tocá «Ver promociones».');renderPromosResultados();return;}
    var sp=document.getElementById('promos-prov');if(sp)sp.value=st.prov;
    _promosProv=st.prov;_promosLoc='';_promosLocIds=null;_promosPoblarLocalidades();
    if(st.loc){_promosLoc=st.loc;var sl=document.getElementById('promos-loc');if(sl)sl.value=st.loc;}
    _promosRubro=st.rubro||'';var sr=document.getElementById('promos-rubro');if(sr)sr.value=_promosRubro;
    buscarPromosActivas();
  }
  if(_promosCat&&_promosCat.length)seguir();else loadPromosCatalogo(seguir);
}
// Lo mismo que la franja, pero para UN logo: el "+" elige esa marca y se vuelve
// solo al flyer a ponerla en su lugar (con sus días, si es un súper y el tilde está).
function _fgLgIrActivas(det){
  _fgFrIrActivas({uno:true,det:det,sel:[],src:_fgLgSrc(),q:'',rubro:_fgLgV.rubro||'',prov:_fgLgV.prov||'',loc:_fgLgV.loc||'',una:_fgLgV.una!==false,sinOnline:!!_fgLgV.sinOnline});
}
function _fgElegirBar(){
  var host=document.querySelector('.promos-results');if(!host)return;
  var b=document.getElementById('fg-elegir-bar');
  host.classList.toggle('eligiendo',!!_fgElegir); // en el celular la barra va fija abajo: se deja lugar
  if(!_fgElegir){if(b)b.remove();return;}
  if(!b){b=document.createElement('div');b.id='fg-elegir-bar';b.className='fg-elegir-bar';b.setAttribute('role','region');b.setAttribute('aria-label','Marcas elegidas para la franja');host.insertBefore(b,host.firstChild);}
  var S=_fgElegir.st.sel,n=S.length;
  if(_fgElegir.st.uno){
    b.innerHTML='<div class="fg-elegir-txt"><b>Cambiar un logo</b> &middot; Toc&aacute; <b>+</b> en la marca que quer&eacute;s poner y vuelve sola al flyer.</div>'+
      '<div class="fg-elegir-acts"><button type="button" class="btn bg" onclick="fgElegirCancelar()">Cancelar</button>'+
      '<button type="button" class="btn bp" onclick="fgElegirVolver()">Volver al logo</button></div>';
    return;
  }
  b.innerHTML='<div class="fg-elegir-txt"><b>Armar franja</b> &middot; '+(n?n+(n===1?' marca elegida':' marcas elegidas')+': <span>'+S.slice(0,5).map(function(x,i){return (i+1)+'. '+_escHtml(x.t);}).join(', ')+(n>5?'&hellip;':'')+'</span>':'Toc&aacute; <b>+</b> en las marcas que quer&eacute;s, en el orden en que van. Tambi&eacute;n pod&eacute;s pegar marcas en <b>Buscar</b>, validarlas y elegir de ah&iacute;.')+'</div>'+
    '<div class="fg-elegir-acts"><button type="button" class="btn bg" onclick="fgElegirCancelar()">Cancelar</button>'+
    '<button type="button" class="btn bp" onclick="fgElegirVolver()">Volver a la franja'+(n?' ('+n+')':'')+'</button></div>';
}
// Botón "+" de una fila de Activas (i = índice en _promosResultados).
function fgElegirToggle(i){
  if(!_fgElegir)return;
  var r=(_promosResultados||[])[i];if(!r||!r.promo||!r.promo.imagen)return;
  if(!_fgElegirNum(r)&&(r.estado==='VENCIDA'||r.estado==='FUERA_PROV'))return;
  var S=_fgElegir.st.sel,img=r.promo.imagen,k=-1;
  for(var j=0;j<S.length;j++)if(S[j].img===img){k=j;break;}
  if(_fgElegir.st.uno){S.length=0;S.push({img:img,t:_promoDecodeEntities(r.promo.titulo||''),p:r.promo});fgElegirVolver();return;}
  if(k>=0)S.splice(k,1);
  else{
    if(S.length>=_FG_FR_MAX){showToast('Hasta '+_FG_FR_MAX+' logos por franja.');return;}
    S.push({img:img,t:_promoDecodeEntities(r.promo.titulo||'')});
    _fgLgTraer(img).catch(function(){});
  }
  _promosPintarFilas();_fgElegirBar();
}
function _fgElegirNum(r){
  if(!_fgElegir||!r||!r.promo)return 0;
  var S=_fgElegir.st.sel;for(var j=0;j<S.length;j++)if(S[j].img===r.promo.imagen)return j+1;return 0;
}
function fgElegirVolver(){
  var st=_fgElegir&&_fgElegir.st;
  _fgElegir=null;_fgElegirBar();if(typeof _promosPintarFilas==='function')_promosPintarFilas();
  if(!st)return;
  // los filtros que se dejaron en Activas vuelven a la ventana
  st.prov=_promosProv||'';st.loc=_promosLoc||'';st.rubro=_promosRubro||'';
  st.una=_promosFiltros.repetidas==='ocultar';st.sinOnline=_promosFiltros.online==='ocultar';
  switchApp(_optSolapa(_fgOpt));
  if(st.uno){_fgLgVolverUno(st);return;}
  if(_fgLgSrc()!==st.src){
    // otro flyer: el recuadro de antes no sirve, pero lo elegido no se pierde.
    // Se marca la franja en este flyer y la ventana abre con esas marcas.
    _fgFrSt=null;
    _fgFr.pendiente={sel:st.sel,cols:st.cols,q:st.q,rubro:st.rubro,prov:st.prov,loc:st.loc,una:st.una,sinOnline:st.sinOnline};
    if(!_fgLg.on)fgLogosModo(true);
    fgFranjaModo(true);
    showToast('Cambió el flyer mientras elegías. Marcá la franja en este flyer: tus '+st.sel.length+' marcas siguen elegidas.');
    return;
  }
  if(!_fgLg.on)fgLogosModo(true);
  _fgFrAbrir(st.rect,st);
}
function _fgLgVolverUno(st){
  _fgLgV.prov=st.prov;_fgLgV.loc=st.loc;_fgLgV.rubro=st.rubro;_fgLgV.una=st.una;_fgLgV.sinOnline=st.sinOnline;
  if(_fgLgSrc()!==st.src){showToast('Cambió el flyer mientras elegías: tocá de nuevo el logo que querés cambiar.');return;}
  if(!_fgLg.on)fgLogosModo(true);
  var pick=st.sel[0];
  if(!pick){_fgLgAbrir(st.det);return;}
  _fgLgTraer(pick.img).then(function(logo){
    if(_fgLgSrc()!==st.src)return;
    var p=pick.p||{imagen:pick.img,titulo:pick.t};
    var conD=_fgLgPonerMarca(st.det,p,logo,_fgLgV.conDias!==false);
    showToast(_fgLgAvisoMarca(pick.t,p,conD));
  }).catch(function(){showToast('No se pudo bajar el logo de '+pick.t+'. Probá con otro o revisá la conexión.');});
}
function fgElegirCancelar(callado){
  var st=_fgElegir&&_fgElegir.st;
  _fgElegir=null;_fgElegirBar();if(typeof _promosPintarFilas==='function')_promosPintarFilas();
  if(st&&_fgFrSt===st)_fgFrSt=null;
  if(!callado)showToast(st&&st.uno?'Listo: no se cambió el logo.':'Listo: no se armó la franja.');
}
// Recuadro marcado en pantalla → abrir la ventana.
function _fgFrDesdeRecuadro(ax,ay,bx,by){
  var a=_fgLgAImagen(Math.min(ax,bx),Math.min(ay,by)),b=_fgLgAImagen(Math.max(ax,bx),Math.max(ay,by));
  if(!a||!b)return;
  var det=_fgLgManual(a.x,a.y,b.x-a.x,b.y-a.y);
  if(!det||det.w<60||det.h<30){showToast('Ese recuadro es muy chico. Marcá toda la franja de logos.');return;}
  _fgFrAbrir(det);
}
var _fgFrSt=null;
// reuso = una selección en curso (vuelve de elegir en Promociones → Activas).
function _fgFrAbrir(rect,reuso){
  var st,previa;
  if(reuso){st=_fgFrSt=reuso;previa=st.previa;rect=st.rect;}
  else{
    if(_fgElegir)fgElegirCancelar(true); // una franja nueva deja atrás la que se estaba eligiendo en Activas
    // ¿ya había una franja armada en este lugar? Se retoma SÓLO si el centro de
    // lo marcado cae adentro de ella (antes alcanzaba con pisarla más de la
    // mitad: una franja nueva marcada justo abajo se tomaba como "editar la de
    // arriba" y las marcas se mezclaban). Si no, el recuadro se recorta para no
    // meterse en la otra franja.
    var cxr=rect.x+rect.w/2,cyr=rect.y+rect.h/2;
    previa=_fgLgActivos().filter(function(e){return e.franjaBase&&_fgFrSolapa(e,rect)>0.5&&cxr>=e.ox&&cxr<=e.ox+e.ow&&cyr>=e.oy&&cyr<=e.oy+e.oh;})[0]||null;
    if(previa)rect={x:previa.ox,y:previa.oy,w:previa.ow,h:previa.oh,bg:previa.bg,corta:false};
    else{
      var recortado=false;
      _fgLgActivos().forEach(function(e){
        if(!e.franjaBase||_fgFrSolapa(e,rect)<=0)return;
        var ecx=e.ox+e.ow/2,ecy=e.oy+e.oh/2,dx=Math.abs(cxr-ecx)/(e.ow+rect.w),dy=Math.abs(cyr-ecy)/(e.oh+rect.h);
        if(dy>=dx){ // una arriba de la otra
          if(ecy<cyr){var y0=e.oy+e.oh+4;rect.h-=Math.max(0,y0-rect.y);rect.y=Math.max(rect.y,y0);}
          else{var y1=e.oy-4;rect.h=Math.min(rect.h,y1-rect.y);}
        }else{      // una al lado de la otra
          if(ecx<cxr){var x0=e.ox+e.ow+4;rect.w-=Math.max(0,x0-rect.x);rect.x=Math.max(rect.x,x0);}
          else{var x1=e.ox-4;rect.w=Math.min(rect.w,x1-rect.x);}
        }
        recortado=true;
      });
      if(recortado){
        if(rect.h<30||rect.w<60){showToast('Ese recuadro cae casi todo sobre una franja que ya armaste. Marcá la zona nueva sin pisarla.');return;}
        showToast('Ajusté el recuadro para no pisar la franja que ya armaste.');
      }
    }
    var info;
    try{info=_fgFrDetectar(rect.x,rect.y,rect.w,rect.h);}catch(e){showToast('No se pudo leer el flyer.');return;}
    st=_fgFrSt={rect:rect,info:previa?previa.franjaInfo:info,previa:previa,
      sel:previa?_fgFrSelActual(previa):[],cols:previa?(previa.franjaCols||0):0,kt:previa?(previa.franjaKt||1):1,elegido:-1,
      q:'',rubro:_promosRubro||'',prov:_fgLgV.prov||_promosProv||'',loc:_fgLgV.prov?(_fgLgV.loc||''):(_promosLoc||''),una:_fgLgV.una!==false,sinOnline:_promosFiltros.online==='ocultar',res:[],src:_fgLgSrc()};
    if(!previa)st.info.bg=rect.bg||st.info.bg;
    // lo elegido en Activas para una franja de otro flyer (ver fgElegirVolver)
    var pend=_fgFr.pendiente;_fgFr.pendiente=null;
    if(pend){st.sel=pend.sel;st.cols=pend.cols||0;st.rubro=pend.rubro||'';st.prov=pend.prov||'';st.loc=pend.loc||'';st.una=pend.una!==false;st.sinOnline=!!pend.sinOnline;}
  }
  var v=document.getElementById('fg-fr-ov');if(v)v.remove();
  var ov=document.createElement('div');ov.id='fg-fr-ov';ov.className='fg-cf-ov';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','fg-fr-t');
  var I=st.info;
  ov.innerHTML='<div class="fg-cf fg-fr paso1" id="fg-fr-dlg">'+
    '<div class="fg-lg-h"><div style="flex:1;min-width:0"><div class="fg-cf-t" id="fg-fr-t">Armar franja</div>'+
      '<div class="fg-cf-b">'+(I.n?'La franja tiene <b>'+I.n+' logos</b> en '+I.filas.length+(I.filas.length===1?' fila':' filas')+' ('+I.porFila+' por fila). ':'')+
      'Tild&aacute; las marcas en el orden en que van; despu&eacute;s pod&eacute;s reordenarlas. Vale s&oacute;lo para este flyer.</div></div>'+
      '<button type="button" class="fg-lg-x" id="fg-fr-x" aria-label="Cerrar">&times;</button></div>'+
    // celular: dos pasos (elegir / ordenar y ver); en la PC no se ven
    '<div class="fg-fr-pasos" role="tablist" aria-label="Pasos">'+
      '<button type="button" role="tab" data-paso="1" aria-selected="true">1. Elegir marcas <span class="fg-fr-pn" id="fg-fr-pn"></span></button>'+
      '<button type="button" role="tab" data-paso="2" aria-selected="false">2. Ordenar y ver</button></div>'+
    (rect.corta?'<div class="fg-lg-aviso">Ojo: el recuadro corta parte de otro dibujo del flyer y lo va a tapar a medias. Si no es lo que quer&eacute;s, cancel&aacute; y marcalo de nuevo.</div>':'')+
    '<div class="fg-fr-arriba" id="fg-fr-arriba">'+
      '<div class="fg-fr-arr-h"><div class="fg-fr-l">As&iacute; va a quedar <span>(toc&aacute; un logo para moverlo; el n&uacute;mero es su orden)</span></div>'+
        '<button type="button" class="fg-fr-amp" id="fg-fr-amp" aria-pressed="false">'+
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'+
          '<span>Ampliar vista previa</span></button></div>'+
      '<div class="fg-fr-prevbox" id="fg-fr-prevbox"><canvas id="fg-fr-prev" aria-label="Vista previa de la franja: toc&aacute; un logo para acomodarlo"></canvas></div>'+
      '<div class="fg-fr-ctrl"><div class="fg-fr-ajuste" id="fg-fr-ajuste"></div>'+
        '<div class="fg-fr-por"><label for="fg-fr-por">Por fila</label><select id="fg-fr-por"></select></div></div>'+
    '</div>'+
    '<div class="fg-fr-cols">'+
      '<div class="fg-fr-izq">'+
        _fgPfHtml('fg-fr','Buscar marca')+
        '<label class="fg-lg-dias-chk" id="fg-fr-dias-l"><input type="checkbox" id="fg-fr-dias"'+(_fgLgV.conDias!==false?' checked':'')+'> S&uacute;per: poner sus d&iacute;as de descuento debajo</label>'+
        '<div class="fg-fr-infofila"><div class="fg-lg-info" id="fg-fr-info"></div>'+
          '<button type="button" class="fg-fr-act fg-fr-sug" id="fg-fr-sug" title="Completa los lugares que faltan con marcas vigentes de la zona elegida, de rubros variados">&#10024; Sugerir marcas</button>'+
          (_can('promos_buscar')?'<button type="button" class="fg-fr-act" id="fg-fr-act" title="Abre Promociones &rarr; Activas con estos filtros, a pantalla completa: eleg&iacute;s ah&iacute; y volv&eacute;s a esta ventana con todo">'+
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Elegir en pantalla completa</button>':'')+
        '</div>'+
        '<div class="fg-lg-list fg-fr-list" id="fg-fr-list"><div class="fg-lg-vacio">Cargando promociones&hellip;</div></div>'+
      '</div>'+
      '<div class="fg-fr-der">'+
        '<div class="fg-fr-l">Tu selecci&oacute;n <span>(en este orden; arrastr&aacute; o us&aacute; las flechas)</span>'+
          '<button type="button" class="fg-fr-qsug" id="fg-fr-qsug" hidden>Quitar sugeridas</button></div>'+
        '<div class="fg-fr-sel" id="fg-fr-sel"></div>'+
      '</div>'+
    '</div>'+
    '<div class="fg-cf-acts">'+
      (previa?'<button type="button" class="btn bg" id="fg-fr-quitar">Volver la franja al original</button>':'')+
      '<button type="button" class="btn bg" id="fg-fr-no">Cancelar</button>'+
      '<button type="button" class="btn bg fg-fr-atras" id="fg-fr-atras">&larr; Elegir m&aacute;s</button>'+
      '<button type="button" class="btn bp fg-fr-sig" id="fg-fr-sig"></button>'+
      '<button type="button" class="btn bp" id="fg-fr-ok"></button></div></div>';
  document.body.appendChild(ov);
  function cerrar(){document.removeEventListener('keydown',tecla,true);ov.remove();_fgFrSt=null;}
  function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();}}
  document.addEventListener('keydown',tecla,true);
  document.getElementById('fg-fr-x').onclick=cerrar;
  document.getElementById('fg-fr-no').onclick=cerrar;
  _fgFrPrevInit(st);
  st.prevW=0;
  // pasos del celular
  var dlg=document.getElementById('fg-fr-dlg');
  function paso(n){
    dlg.classList.toggle('paso1',n===1);dlg.classList.toggle('paso2',n===2);
    Array.prototype.forEach.call(dlg.querySelectorAll('.fg-fr-pasos button'),function(b){var on=+b.getAttribute('data-paso')===n;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');});
    if(n===2){st.prevW=0;_fgFrPreview();}
    try{dlg.scrollTop=0;}catch(e){}
  }
  dlg.querySelector('.fg-fr-pasos').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-paso]');if(b)paso(+b.getAttribute('data-paso'));});
  document.getElementById('fg-fr-sig').onclick=function(){paso(2);};
  document.getElementById('fg-fr-atras').onclick=function(){paso(1);};
  paso(reuso&&st.sel.length?2:1); // volviendo de Activas con marcas elegidas: directo a ordenar
  var amp=document.getElementById('fg-fr-amp');
  function ampPintar(){amp.setAttribute('aria-pressed',st.ampliar?'true':'false');amp.lastChild.textContent=st.ampliar?'Achicar vista previa':'Ampliar vista previa';}
  ampPintar();
  amp.onclick=function(){st.ampliar=!st.ampliar;st.prevW=0;ampPintar();_fgFrPreview();};
  if(!window._fgFrRsz){window._fgFrRsz=true;var _rszT=0;
    window.addEventListener('resize',function(){clearTimeout(_rszT);_rszT=setTimeout(function(){if(_fgFrSt&&document.getElementById('fg-fr-prev')){_fgFrSt.prevW=0;_fgFrPreview();}},150);});}
  document.getElementById('fg-fr-sug').onclick=function(){_fgFrSugerir(st);};
  document.getElementById('fg-fr-qsug').onclick=function(){
    var n0=st.sel.length;st.sel=st.sel.filter(function(x){return !x.sug;});st.elegido=-1;st.grupo=[];
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();showToast('Se quitaron '+(n0-st.sel.length)+' sugeridas.');
  };
  var ira=document.getElementById('fg-fr-act');
  // la ventana se va pero la selección (st) sigue viva hasta volver o cancelar
  if(ira)ira.onclick=function(){document.removeEventListener('keydown',tecla,true);ov.remove();_fgFrIrActivas(st);};
  var qt=document.getElementById('fg-fr-quitar');
  if(qt)qt.onclick=function(){
    var fid=previa.franja;cerrar();
    _fgLg.list=_fgLg.list.filter(function(e){return e.franja!==fid;});_fgLg.sel=-1;_fgLgListo();
    showToast('La franja volvió a como viene en el flyer.');
  };
  var por=document.getElementById('fg-fr-por');
  var opts='<option value="0">Autom&aacute;tico (como el original)</option>';
  for(var k=2;k<=10;k++)opts+='<option value="'+k+'">'+k+'</option>';
  por.innerHTML=opts;por.value=String(st.cols||0);
  por.onchange=function(){st.cols=+por.value;_fgFrPreview();};
  var frd=document.getElementById('fg-fr-dias');
  if(frd)frd.onchange=function(){_fgLgV.conDias=frd.checked;_fgFrPreview();};
  var q=document.getElementById('fg-fr-q');
  _fgPfInit('fg-fr',st,function(){
    if(_fgFrSt!==st)return;
    // la ventana de un logo recuerda lo elegido acá (provincia, localidad, tildes)
    _fgLgV.prov=st.prov;_fgLgV.loc=st.loc;_fgLgV.una=st.una;_fgLgV.sinOnline=st.sinOnline;
    _fgFrLista();
  });
  document.getElementById('fg-fr-list').addEventListener('click',function(e){
    var it=e.target.closest&&e.target.closest('.fg-lg-it');if(!it)return;
    var p=st.res[+it.getAttribute('data-i')];if(!p)return;
    var i=_fgFrIdx(p.imagen);
    if(i>=0){st.sel.splice(i,1);st.grupo=[];st.elegido=st.elegido===i?-1:(st.elegido>i?st.elegido-1:st.elegido);}
    else{
      if(st.sel.length>=_FG_FR_MAX){showToast('Hasta '+_FG_FR_MAX+' logos por franja.');return;}
      st.sel.push({img:p.imagen,t:p.titulo});
      _fgLgTraer(p.imagen).then(function(){if(_fgFrSt===st)_fgFrPreview();}).catch(function(){
        if(_fgFrSt!==st)return;
        var j=_fgFrIdx(p.imagen);if(j>=0)st.sel.splice(j,1);
        showToast('No se pudo bajar el logo de '+p.titulo+'.');_fgFrLista();_fgFrSelPintar();_fgFrPreview();
      });
    }
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();
  });
  document.getElementById('fg-fr-sel').addEventListener('click',function(e){
    var box=this,b=e.target.closest&&e.target.closest('button[data-a]');
    if(!b){
      // tocar una fila marca su logo en la vista previa (salvo que recién se haya arrastrado)
      var fila=e.target.closest&&e.target.closest('.fg-fr-it');
      if(!fila||Date.now()-(box._soltado||0)<350)return;
      var j=+fila.getAttribute('data-i');
      if(e.shiftKey)_fgFrGrupoTocar(st,j);
      else{st.grupo=[];st.elegido=st.elegido===j?-1:j;}
      _fgFrPreview();return;
    }
    var i=+b.getAttribute('data-i'),a=b.getAttribute('data-a'),S=st.sel,cur=S[st.elegido];st.grupo=[];
    if(a==='arr'&&i>0){var x=S[i];S[i]=S[i-1];S[i-1]=x;cur=x;}
    else if(a==='aba'&&i<S.length-1){var y=S[i];S[i]=S[i+1];S[i+1]=y;cur=y;}
    else if(a==='x')S.splice(i,1);
    // el que se movió queda marcado (así se ve en la vista previa dónde fue a parar)
    st.elegido=cur?S.indexOf(cur):-1;
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();
  });
  document.getElementById('fg-fr-ok').onclick=function(){
    if(!st.sel.length){showToast('Tildá al menos una marca.');return;}
    var ok=this;ok.disabled=true;ok.textContent='Poniendo…';
    _fgFrAplicar(st).then(function(n){
      if(n===null){ // se cerró la ventana (nada que hacer) o se cambió de flyer mientras bajaban
        if(_fgFrSt===st){cerrar();showToast('Cambiaste de flyer mientras se armaba la franja, así que no se aplicó. Volvé a marcarla en este flyer.');}
        return;
      }
      cerrar();showToast('Listo: '+n+(n===1?' logo':' logos')+' en la franja. Tocá uno para ajustarlo.');},
      function(){ok.disabled=false;_fgFrSelPintar();showToast('No se pudieron bajar algunos logos. Revisá la conexión y probá de nuevo.');});
  };
  // los logos que ya estaban elegidos se bajan para la vista previa
  st.sel.forEach(function(s){_fgLgTraer(s.img).then(function(){if(_fgFrSt===st)_fgFrPreview();}).catch(function(){});});
  _fgFrSelPintar();_fgFrPreview();
  setTimeout(function(){try{q.focus();}catch(e){}},30);
  if(_promosCat)_fgFrFiltros();
  else loadPromosCatalogo(function(){if(_fgFrSt===st)_fgFrFiltros();});
}
// Logos elegidos en la vista previa: con Shift, varios (st.grupo); si no, st.elegido.
function _fgFrElegidos(st){
  var g=(st.grupo||[]).filter(function(i){return i>=0&&i<st.sel.length;});
  if(g.length>1)return g;
  return (st.elegido!=null&&st.elegido>=0&&st.elegido<st.sel.length)?[st.elegido]:[];
}
// ·· Sugerir marcas ··
// Completa los lugares que faltan (hasta los logos que tenía la franja) con
// marcas vigentes de la zona elegida. Criterio (aprobado por el dueño):
// locales antes que online, una por marca, variedad de rubros (por turnos), las
// que vencen más tarde primero y un poco más de peso a las "Nuevas". Sólo entran
// las que se pueden bajar (el logo se pide antes de sumarla).
function _fgFrPuntaje(p,hoy){
  var pts=_promoEsOnline(p)?0:100;
  var dias=30;if(p.fecha_hasta){var f=new Date(p.fecha_hasta+'T23:59:59');if(!isNaN(f))dias=Math.round((f-hoy)/86400000);}
  pts+=Math.max(0,Math.min(60,dias));
  if(p.primera_vez){var pv=new Date(p.primera_vez);if(!isNaN(pv)&&(hoy-pv)<=7*86400000)pts+=15;}
  // desempate (menos de 1 punto): al azar pero fijo en el día, así entre marcas
  // que empatan no ganan siempre las que empiezan con A
  var sem=String(p.titulo||'')+hoy.toDateString(),h=0;for(var i=0;i<sem.length;i++)h=(h*31+sem.charCodeAt(i))|0;
  return pts+Math.abs(h%1000)/1000;
}
function _fgFrOrdenSugerido(lista,hoy){
  var grupos={},orden=[];
  lista.slice().sort(function(a,b){return _fgFrPuntaje(b,hoy)-_fgFrPuntaje(a,hoy);}).forEach(function(p){
    var r=p.subtitulo||'otros';if(!grupos[r]){grupos[r]=[];orden.push(r);}grupos[r].push(p);
  });
  // por turnos: la mejor de cada rubro, después la segunda de cada uno…
  var out=[],i=0,quedan=true;
  while(quedan){quedan=false;orden.forEach(function(r){if(grupos[r][i]){out.push(grupos[r][i]);quedan=true;}});i++;}
  return out;
}
function _fgFrSugerir(st){
  if(_fgFrSt!==st)return;
  var meta=(st.info&&st.info.n)||8,faltan=Math.max(0,Math.min(_FG_FR_MAX,meta)-st.sel.length);
  if(!faltan){showToast('La franja ya tiene sus '+meta+' lugares ocupados. Quitá alguna para que te sugiera otras.');return;}
  // respeta los filtros elegidos: rubro (sólo ese), provincia y localidad (sólo
  // las de ahí: con una zona elegida no se suman las online)
  var filtro=Object.assign({},st,{q:'',una:true,sinOnline:!!(st.sinOnline||st.prov||st.loc)});
  var r=_fgPfFiltrar(filtro,function(){if(_fgFrSt===st)_fgFrSugerir(st);});
  if(r.cargando){showToast('Buscando las promos de la zona… en un momento sugiero.');return;}
  var ya={};st.sel.forEach(function(x){ya[x.img]=1;});
  var cands=_fgFrOrdenSugerido(r.lista.filter(function(p){return !ya[p.imagen];}),new Date()).slice(0,faltan*2+4);
  if(!cands.length){showToast('No hay más marcas vigentes con esos filtros.');return;}
  var b=document.getElementById('fg-fr-sug');if(b){b.disabled=true;b.textContent='Sugiriendo…';}
  Promise.all(cands.map(function(p){return _fgLgTraer(p.imagen).then(function(){return p;},function(){return null;});})).then(function(res){
    if(b){b.disabled=false;b.innerHTML='&#10024; Sugerir marcas';}
    if(_fgFrSt!==st)return;
    var puestas=0;
    // el cupo se mira contra lo elegido AHORA (mientras bajaban se pudo tildar alguna a mano)
    var tope=Math.min(_FG_FR_MAX,meta);
    res.forEach(function(p){if(p&&st.sel.length<tope&&_fgFrIdx(p.imagen)<0){st.sel.push({img:p.imagen,t:p.titulo,sug:true});puestas++;}});
    _fgFrLista();_fgFrSelPintar();_fgFrPreview();
    var donde=st.loc?_promoTitulizar(st.loc):(st.prov?_promoTitulizar(st.prov):'');
    var de=(st.rubro?' de '+st.rubro:'')+(donde?' en '+donde:'');
    if(!puestas)showToast('No se pudieron bajar los logos sugeridos. Probá de nuevo.');
    else if(st.sel.length<tope)showToast('Con esos filtros encontré '+puestas+(puestas===1?' marca':' marcas')+de+'; los otros lugares quedan para que elijas vos.');
    else showToast('Sugerimos '+puestas+(puestas===1?' marca':' marcas')+de+'. Quitá o reordená las que no van.');
  });
}
// La selección de una franja ya armada, según lo que tiene HOY: si un logo se
// borró (Supr) o se cambió por otra marca después de armarla, ya no vuelve al
// retomarla. Se conservan el orden y los ajustes guardados (dx/dy/k).
function _fgFrSelActual(base){
  var guard=base.franjaSel||[],vivos=_fgLgActivos().filter(function(e){return e.franja===base.franja&&!e.franjaBase&&e.img;}),hay={};
  vivos.forEach(function(e){hay[e.img]=1;});
  var out=guard.filter(function(s){return hay[s.img];}).map(function(s){return JSON.parse(JSON.stringify(s));});
  vivos.forEach(function(e){if(!out.some(function(s){return s.img===e.img;}))out.push({img:e.img,t:e.t});});
  return out;
}
function _fgFrIdx(img){var S=_fgFrSt?_fgFrSt.sel:[];for(var i=0;i<S.length;i++)if(S[i].img===img)return i;return -1;}
function _fgFrFiltros(){
  var st=_fgFrSt;if(!st)return;
  _fgPfPoblar('fg-fr',st);
  _fgFrLista();
}
function _fgFrLista(){
  var st=_fgFrSt,box=document.getElementById('fg-fr-list'),info=document.getElementById('fg-fr-info');if(!st||!box)return;
  if(!(_promosCat&&_promosCat.length)){box.innerHTML='<div class="fg-lg-vacio">No se pudo leer el catálogo de promociones.</div>';return;}
  var r=_fgPfFiltrar(st,function(){if(_fgFrSt===st)_fgFrLista();});
  if(r.cargando){st.res=st.sel.map(function(s){return {imagen:s.img,titulo:s.t,subtitulo:''};});if(info)info.textContent='Buscando las promos de '+_promoTitulizar(st.loc)+'…';}
  var L=r.lista,MAX=60;
  // las ya tildadas siempre a mano (arriba), aunque el filtro no las traiga
  var tildadas=st.sel.map(function(s){return L.filter(function(p){return p.imagen===s.img;})[0]||{imagen:s.img,titulo:s.t,subtitulo:''};});
  var resto=L.filter(function(p){return _fgFrIdx(p.imagen)<0;});
  st.res=tildadas.concat(resto.slice(0,MAX));
  if(info&&!r.cargando)info.textContent=L.length>MAX?'Mostrando '+MAX+' de '+L.length+' marcas vigentes'+_fgPfDonde(st)+': escribí o elegí un rubro para encontrar las tuyas.':L.length+(L.length===1?' marca vigente':' marcas vigentes')+_fgPfDonde(st)+'.';
  if(!st.res.length){box.innerHTML='<div class="fg-lg-vacio">'+(r.cargando?'Buscando las promos de '+_escHtml(_promoTitulizar(st.loc))+'&hellip;':'No hay promos vigentes con esos filtros.')+'</div>';return;}
  box.innerHTML=st.res.map(function(p,i){
    var n=_fgFrIdx(p.imagen);
    return '<button type="button" class="fg-lg-it'+(n>=0?' fg-fr-on':'')+'" data-i="'+i+'" title="'+_escAttr(p.titulo)+'" aria-pressed="'+(n>=0)+'">'+
      (n>=0?'<span class="fg-fr-num">'+(n+1)+'</span>':'')+
      '<span class="fg-lg-it-img"><img loading="lazy" decoding="async" alt="" src="'+_escAttr(PROMO_LOGO_BASE+p.imagen)+'"></span>'+
      '<span class="fg-lg-it-t">'+_escHtml(p.titulo)+'</span>'+
      '<span class="fg-lg-it-s">'+_fgPfSub(p)+'</span></button>';
  }).join('');
}
function _fgFrSelPintar(){
  var st=_fgFrSt,box=document.getElementById('fg-fr-sel'),ok=document.getElementById('fg-fr-ok');if(!st||!box)return;
  var n=st.sel.length;
  if(ok)ok.textContent=n?('Poner '+n+(n===1?' logo':' logos')):'Poner logos';
  var qs=document.getElementById('fg-fr-qsug');if(qs)qs.hidden=!st.sel.some(function(x){return x.sug;});
  var pn=document.getElementById('fg-fr-pn'),sg=document.getElementById('fg-fr-sig');
  if(pn)pn.textContent=n?'('+n+')':'';
  if(sg)sg.innerHTML='Siguiente: ordenar'+(n?' ('+n+')':'')+' &rarr;';
  box.innerHTML=n?st.sel.map(function(s,i){
    return '<div class="fg-fr-it'+(_fgFrElegidos(st).indexOf(i)>=0?' sel':'')+'" data-i="'+i+'" title="Tocala para marcar el logo en la vista previa (con Shift, varios)"><span class="fg-fr-mango" aria-hidden="true" title="Mantené apretado y arrastrá para cambiar el orden">&#10303;</span><b>'+(i+1)+'</b>'+
      '<span class="fg-fr-mini"><img alt="" decoding="async" src="'+_escAttr(PROMO_LOGO_BASE+s.img)+'"></span><span class="fg-fr-it-t">'+_escHtml(s.t)+'</span>'+
      (s.sug?'<span class="fg-fr-sugmark" title="Sugerida por la app">&#10024;</span>':'')+
      '<button type="button" data-a="arr" data-i="'+i+'" aria-label="Subir"'+(i===0?' disabled':'')+'>&uarr;</button>'+
      '<button type="button" data-a="aba" data-i="'+i+'" aria-label="Bajar"'+(i===n-1?' disabled':'')+'>&darr;</button>'+
      '<button type="button" data-a="x" data-i="'+i+'" aria-label="Quitar">&times;</button></div>';
  }).join(''):'<div class="fg-fr-vac">Tild&aacute; marcas a la izquierda. El orden en que las tild&aacute;s es el orden en el flyer.</div>';
  st._marcado=_fgFrElegidos(st).join(',');
  _fgFrDragInit();
}
// Resalta en "Tu selección" la fila del logo marcado en la vista previa
// (sin rearmar la lista) y la trae a la vista si estaba escondida.
function _fgFrSelMarcar(){
  var st=_fgFrSt,box=document.getElementById('fg-fr-sel');if(!st||!box)return;
  var g=_fgFrElegidos(st),clave=g.join(',');if(st._marcado===clave)return;
  st._marcado=clave;
  Array.prototype.forEach.call(box.querySelectorAll('.fg-fr-it'),function(f){
    var i=+f.getAttribute('data-i'),on=g.indexOf(i)>=0;f.classList.toggle('sel',on);
    if(i===st.elegido)try{f.scrollIntoView({block:'nearest'});}catch(e){}
  });
}
// ·· Ordenar "Tu selección" arrastrando ··
// Con el mouse se arrastra desde cualquier parte de la fila (después de moverlo
// unos píxeles, así un clic en una flecha sigue siendo un clic); con el dedo,
// desde el agarre ⠿ (si no, no se podría recorrer la lista). Una línea naranja
// marca dónde va a caer; al soltar se reordena y se rearma la vista previa.
function _fgFrDragInit(){
  var box=document.getElementById('fg-fr-sel');if(!box||box._arrastre)return;box._arrastre=true;
  var d=null,linea=null;
  function filas(){return Array.prototype.slice.call(box.querySelectorAll('.fg-fr-it'));}
  function empezar(){
    d.on=true;d.it.classList.add('lift');box.classList.add('ordenando');
    d.rects=filas().map(function(x){return x.getBoundingClientRect();});
    try{box.setPointerCapture(d.id);}catch(x){}
    if(!linea){linea=document.createElement('div');linea.className='fg-fr-linea';}
    box.appendChild(linea);
  }
  function terminar(soltar){
    if(!d)return;
    var x=d;d=null;
    if(linea&&linea.parentNode)linea.parentNode.removeChild(linea);
    box.classList.remove('ordenando');
    if(!x.on)return;
    x.it.classList.remove('lift');x.it.style.transform='';
    var st=_fgFrSt;
    box._soltado=Date.now();
    if(soltar&&st&&x.to!=null&&x.to!==x.from&&x.to!==x.from+1){
      var it=st.sel.splice(x.from,1)[0],dest=x.to>x.from?x.to-1:x.to;
      st.sel.splice(dest,0,it);st.elegido=dest;st.grupo=[]; // queda marcado el que se movió
      _fgFrLista();_fgFrSelPintar();_fgFrPreview();
    }
  }
  box.addEventListener('pointerdown',function(e){
    var it=e.target.closest&&e.target.closest('.fg-fr-it');if(!it||(e.target.closest&&e.target.closest('button')))return;
    var mango=!!(e.target.closest&&e.target.closest('.fg-fr-mango'));
    if(e.pointerType==='mouse'){if(e.button!==0)return;}
    else if(!mango)return;
    d={it:it,from:+it.getAttribute('data-i'),y0:e.clientY,id:e.pointerId,on:false,to:null};
    if(mango){e.preventDefault();empezar();}
  });
  box.addEventListener('pointermove',function(e){
    if(!d||e.pointerId!==d.id)return;
    if(!d.on){if(Math.abs(e.clientY-d.y0)<5)return;empezar();}
    e.preventDefault();
    var dy=e.clientY-d.y0;d.it.style.transform='translateY('+dy+'px)';
    // posición de destino: antes de la primera fila cuyo centro está debajo del puntero
    var R=d.rects,to=R.length;
    for(var i=0;i<R.length;i++){if(e.clientY<R[i].top+R[i].height/2){to=i;break;}}
    d.to=to;
    var b=box.getBoundingClientRect(),y=(to<R.length?R[to].top:R[R.length-1].bottom)-b.top+box.scrollTop-3;
    linea.style.top=Math.round(y)+'px';
    linea.hidden=(to===d.from||to===d.from+1);
  });
  box.addEventListener('pointerup',function(){terminar(true);});
  box.addEventListener('pointercancel',function(){terminar(false);});
  box.addEventListener('lostpointercapture',function(){if(d&&d.on)terminar(true);});
}
// Vista previa: el pedazo del flyer con la franja ya armada (los logos que
// todavía se están bajando se ven como un cuadrito gris con su número).
function _fgFrPreview(){
  var st=_fgFrSt,cv2=document.getElementById('fg-fr-prev');if(!st||!cv2||!window.baseImg)return;
  var r=st.rect,m=6,x0=Math.max(0,r.x-m),y0=Math.max(0,r.y-m),x1=Math.min(baseImg.width,r.x+r.w+m),y1=Math.min(baseImg.height,r.y+r.h+m);
  // El tamaño se mide sólo al abrir, al cambiar el tamaño de la ventana o con
  // "Ampliar" (st.prevW = 0): tildar marcas nunca lo cambia.
  if(!st.prevW){
    var box=cv2.parentNode,bw=Math.max(160,(box.clientWidth||600)-2),cel=window.innerWidth<=900;
    var maxH=Math.max(110,window.innerHeight*(st.ampliar?(cel?0.42:0.56):(cel?0.24:0.29)));
    st.prevW=Math.round(Math.min(bw,maxH*(x1-x0)/(y1-y0)));
    // 'Ampliar' sólo aparece si de verdad la agranda (una franja ancha ya ocupa todo el ancho)
    var amp=document.getElementById('fg-fr-amp');
    if(amp){var hA=window.innerHeight*(cel?0.42:0.56),wA=Math.min(bw,hA*(x1-x0)/(y1-y0)),wN=Math.min(bw,window.innerHeight*(cel?0.24:0.29)*(x1-x0)/(y1-y0));amp.hidden=!st.ampliar&&wA<wN*1.15;}
  }
  var W=st.prevW,H=Math.round(W*(y1-y0)/(x1-x0)),dpr=Math.min(2,window.devicePixelRatio||1);
  if(cv2.style.width!==W+'px'){cv2.style.width=W+'px';cv2.style.height=H+'px';}
  var k=W*dpr/(x1-x0),u=dpr/k; // u = px de imagen por px de pantalla
  if(cv2.width!==Math.round(W*dpr))cv2.width=Math.round(W*dpr);
  if(cv2.height!==Math.round(H*dpr))cv2.height=Math.round(H*dpr);
  var g=cv2.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv2.width,cv2.height);
  g.scale(k,k);g.translate(-x0,-y0);
  g.drawImage(baseImg,0,0);
  g.fillStyle=st.info.bg;g.fillRect(r.x,r.y,r.w,r.h);
  var lug=_fgFrLugares(st,st.sel.length);
  st._vista={x0:x0,y0:y0,ancho:x1-x0};st._cajas=[];
  var nums=[],eleg=_fgFrElegidos(st);
  var DS=_fgFrDiasTodos(st,lug);
  st.sel.forEach(function(s,i){
    var im=_fgLg.imgs[s.img],l=lug[i],dz=DS.porI[i];
    if(im){
      var d=_fgFrAjustar(st,s,_fgFrEncajar(dz?dz.logo:l,im.width/im.height));
      g.drawImage(im,d.tx,d.ty,d.tw,d.th);st._cajas[i]=d;nums.push({i:i,x:d.tx,y:d.ty});
      if(dz){g.save();g.font=_fgLgTxtFont({peso:500},DS.fs);g.fillStyle=DS.color;g.textAlign='center';g.textBaseline='middle';
        var ls=dz.texto.split('\n');ls.forEach(function(t,k){g.fillText(t,d.tx+d.tw/2,dz.ty+(k-(ls.length-1)/2)*DS.fs*_FG_LG_INTER);});g.restore();}
      if(eleg.indexOf(i)>=0){g.save();g.setLineDash([6*u,4*u]);g.lineWidth=2*u;g.strokeStyle='#F26122';g.strokeRect(d.tx-3*u,d.ty-3*u,d.tw+6*u,d.th+6*u);g.restore();}
    }
    else{g.fillStyle='rgba(128,128,128,.18)';g.fillRect(l.cx-l.h*0.6,l.cy-l.h*0.4,l.h*1.2,l.h*0.8);
      g.fillStyle='#777';g.font='600 '+Math.round(l.h*0.35)+'px Figtree,Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(String(i+1),l.cx,l.cy);}
  });
  // circulito con el número de orden, arriba a la izquierda de cada logo (sólo en esta vista previa)
  var R=8*u;g.font='800 '+(10*u)+'px Figtree,Arial';g.textAlign='center';g.textBaseline='middle';
  nums.forEach(function(n){
    var cx=Math.max(x0+R+u,n.x),cy=Math.max(y0+R+u,n.y);
    g.beginPath();g.arc(cx,cy,R,0,Math.PI*2);g.fillStyle=eleg.indexOf(n.i)>=0?'#C2410C':'#F26122';g.fill();
    g.lineWidth=1.5*u;g.strokeStyle='#fff';g.stroke();g.fillStyle='#fff';g.fillText(String(n.i+1),cx,cy+0.5*u);
  });
  _fgFrAjustePintar();_fgFrSelMarcar();
}
// Punteros sobre la vista previa: tocar un logo lo marca, arrastrarlo lo corre.
// Las reglas de tamaño viven en #fg-fr-ajuste (delegado: se rearma seguido).
function _fgFrPrevInit(st){
  var cv2=document.getElementById('fg-fr-prev'),aj=document.getElementById('fg-fr-ajuste');if(!cv2||!aj)return;
  var arr=null;
  function aImagen(e){
    var r=cv2.getBoundingClientRect(),v=st._vista;if(!v||!r.width)return null;
    var k=v.ancho/r.width;return {x:v.x0+(e.clientX-r.left)*k,y:v.y0+(e.clientY-r.top)*k,k:k};
  }
  cv2.addEventListener('pointerdown',function(e){
    if(_fgFrSt!==st)return;
    var p=aImagen(e);if(!p)return;
    var hit=-1,C=st._cajas||[];
    for(var i=C.length-1;i>=0;i--){var c=C[i];if(c&&p.x>=c.tx-6&&p.x<=c.tx+c.tw+6&&p.y>=c.ty-6&&p.y<=c.ty+c.th+6){hit=i;break;}}
    if(hit<0){if(!e.shiftKey){st.elegido=-1;st.grupo=[];}_fgFrPreview();return;}
    e.preventDefault();
    var g=_fgFrElegidos(st);
    if(e.shiftKey){
      // Shift: suma o saca ese logo; si lo sacó, no hay nada que arrastrar
      _fgFrGrupoTocar(st,hit);g=_fgFrElegidos(st);
      if(g.indexOf(hit)<0){_fgFrPreview();return;}
    }else if(g.indexOf(hit)<0){st.grupo=[];g=[hit];}
    st.elegido=hit;
    arr={x:e.clientX,y:e.clientY,k:p.k,id:e.pointerId,pos:g.map(function(j){var s=st.sel[j];return {s:s,dx:s.dx||0,dy:s.dy||0};})};
    try{cv2.setPointerCapture(e.pointerId);}catch(x){}
    _fgFrPreview();
  });
  cv2.addEventListener('pointermove',function(e){
    if(!arr||e.pointerId!==arr.id||_fgFrSt!==st)return;
    var ddx=(e.clientX-arr.x)*arr.k,ddy=(e.clientY-arr.y)*arr.k;
    arr.pos.forEach(function(p){p.s.dx=Math.round(p.dx+ddx);p.s.dy=Math.round(p.dy+ddy);});
    _fgFrPreview();
  });
  function fin(){arr=null;}
  cv2.addEventListener('pointerup',fin);cv2.addEventListener('pointercancel',fin);
  aj.addEventListener('input',function(e){
    if(_fgFrSt!==st)return;
    if(e.target.id==='fg-fr-kt'){st.kt=(+e.target.value||100)/100;_fgFrPreview();}
    else if(e.target.id==='fg-fr-k1'){
      var s=st.sel[st.elegido];if(!s)return;
      var nk=(+e.target.value||100)/100,f=nk/(s.k||1);
      _fgFrElegidos(st).forEach(function(j){var o=st.sel[j];o.k=j===st.elegido?nk:Math.max(0.4,Math.min(2.5,Math.round((o.k||1)*f*100)/100));});
      _fgFrPreview();
    }
  });
  aj.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button[data-aj]');if(!b||_fgFrSt!==st)return;
    var a=b.getAttribute('data-aj'),G=_fgFrElegidos(st);if(!G.length)return;
    G.forEach(function(j){var s=st.sel[j];
      if(a==='menos')s.k=Math.max(0.4,Math.round(((s.k||1)-0.1)*100)/100);
      else if(a==='mas')s.k=Math.min(2.5,Math.round(((s.k||1)+0.1)*100)/100);
      else if(a==='lugar'){s.dx=0;s.dy=0;s.k=1;}
    });
    _fgFrPreview();
  });
}
function _fgFrGrupoTocar(st,i){
  var g=_fgFrElegidos(st).slice(),j=g.indexOf(i);
  if(j>=0)g.splice(j,1);else g.push(i);
  st.grupo=g;st.elegido=g.length?g[g.length-1]:-1;
}
// Ajuste a mano de un logo de la franja, hecho en la vista previa de la ventana:
// s.dx/s.dy = cuánto se corrió de su lugar (px de imagen) y s.k = su tamaño
// (1 = el que le tocó). st.kt = tamaño de todos. Crece desde el centro.
function _fgFrAjustar(st,s,d){
  var k=(s.k||1)*(st.kt||1),w=d.tw*k,h=d.th*k,cx=d.tx+d.tw/2+(s.dx||0),cy=d.ty+d.th/2+(s.dy||0);
  return {tx:cx-w/2,ty:cy-h/2,tw:w,th:h};
}
// Controles debajo de la vista previa: tamaño del logo elegido y de todos.
function _fgFrAjustePintar(){
  var st=_fgFrSt,box=document.getElementById('fg-fr-ajuste');if(!st||!box)return;
  var i=st.elegido,s=(i!=null&&i>=0)?st.sel[i]:null;
  var kt=Math.round((st.kt||1)*100);
  var todos='<div class="fg-fr-aj-fila"><span class="fg-fr-aj-l">Tama&ntilde;o de todos</span>'+
    '<input type="range" id="fg-fr-kt" min="60" max="150" step="5" value="'+kt+'" aria-label="Tama&ntilde;o de todos los logos"><span class="fg-fr-aj-v">'+kt+'%</span></div>';
  var nG=_fgFrElegidos(st).length;
  var uno=s?('<div class="fg-fr-aj-fila fg-fr-aj-uno"><span class="fg-fr-aj-l">'+(nG>1?'<b>'+nG+' elegidos</b>':'<b>'+(i+1)+'.</b> '+_escHtml(s.t))+'</span>'+
      '<button type="button" data-aj="menos" aria-label="M&aacute;s chico">&minus;</button>'+
      '<input type="range" id="fg-fr-k1" min="40" max="250" step="5" value="'+Math.round((s.k||1)*100)+'" aria-label="Tama&ntilde;o de este logo">'+
      '<button type="button" data-aj="mas" aria-label="M&aacute;s grande">+</button><span class="fg-fr-aj-v">'+Math.round((s.k||1)*100)+'%</span>'+
      '<button type="button" data-aj="lugar" class="fg-fr-aj-lugar" title="Vuelve a su lugar y a su tama&ntilde;o">'+(nG>1?'Volver a su lugar':'Volver a su lugar')+'</button></div>'):
    '<div class="fg-fr-aj-tip">Toc&aacute; un logo de la vista previa y arrastralo para acomodarlo (con <b>Shift</b> eleg&iacute;s varios); ac&aacute; abajo le cambi&aacute;s el tama&ntilde;o.</div>';
  // no se rearma mientras se arrastra una regla (se soltaría)
  var act=document.activeElement;
  if(act&&box.contains(act)&&act.type==='range'&&box._nG===nG){
    var v=box.querySelectorAll('.fg-fr-aj-v');if(v[0])v[0].textContent=kt+'%';
    if(s&&v[1])v[1].textContent=Math.round((s.k||1)*100)+'%';
    return;
  }
  box._nG=nG;box.innerHTML=uno+todos;
}
// Aplica: tapa la franja entera y pone los logos. Los cambios que había adentro
// (de antes) se reemplazan.
// Días de descuento de los súper en una franja (21-oct-2026): con el tilde, a
// cada súper con días su lugar se reparte: el logo arriba (66%) y los días
// abajo. La letra es la misma para toda la franja (la que entra en el lugar más
// justo), así quedan parejos. Devuelve {porI:[{logo,texto,ty}|null], fs, color}.
function _fgFrDiasTodos(st,lug){
  var out={porI:[],fs:0,color:'#1A1A1A'};
  if(_fgLgV.conDias===false)return out;
  var hay=false,u=Math.max(0.5,baseImg.width/1240),I=st.info||{};
  // franja que ya tenía días debajo (la grilla de súper): el logo queda en su
  // lugar y los días van debajo, donde estaban; si no, el lugar se reparte
  // (logo arriba 66%, días abajo)
  var conTexto=!!I.conTexto;
  st.sel.forEach(function(s,i){
    var p=null;for(var j=0;j<(_promosCat||[]).length;j++){var q=_promosCat[j];if(q.imagen===s.img&&_promoEsSuper(q)){p=q;break;}}
    var dias=p?_promoDias(p):'',l=lug[i];
    if(!dias||!l){out.porI.push(null);return;}
    hay=true;
    if(conTexto)out.porI.push({texto:dias,logo:l,ty:0,l:l});
    else out.porI.push({texto:dias,logo:{cx:l.cx,cy:l.cy-l.h*0.17,w:l.w,h:l.h*0.66},ty:l.cy+l.h*0.33,l:l});
  });
  if(!hay)return out;
  // letra: la del texto original (un renglón de días) o ~20% del alto del lugar;
  // si algún texto no entra a lo ancho, se parte en dos renglones y, si igual no
  // entra, se achica (para todos igual)
  var fs=conTexto&&I.txtH?I.txtH/0.75:lug[0].h*0.2;
  fs=Math.max(12*u,Math.min(26*u,fs));
  if(!_fgLgMedCv)_fgLgMedCv=document.createElement('canvas');
  var g=_fgLgMedCv.getContext('2d');
  function ancho(t,f){g.font=_fgLgTxtFont({peso:500},f);return Math.max.apply(null,t.split('\n').map(function(x){return g.measureText(x).width;}));}
  out.porI.forEach(function(z){
    if(!z)return;var lim=z.l.w*0.96;
    if(ancho(z.texto,fs)>lim&&z.texto.indexOf(' y ')>0){var k=z.texto.lastIndexOf(' y ');z.texto=z.texto.slice(0,k+2)+'\n'+z.texto.slice(k+3);}
    var a=ancho(z.texto,fs);if(a>lim)fs=Math.max(10*u,fs*lim/a);
  });
  out.fs=Math.round(fs);
  out.porI.forEach(function(z){
    if(!z)return;
    var n=z.texto.split('\n').length,alto=n*out.fs*_FG_LG_INTER;
    // debajo del logo, con el aire de una línea chica
    if(conTexto)z.ty=z.l.cy+z.l.h/2+out.fs*0.35+alto/2;
    else if(n>1)z.ty-=out.fs*_FG_LG_INTER*0.3; // dos renglones: sube un poco para no salirse del lugar
  });
  return out;
}
function _fgFrAplicar(st){
  return Promise.all(st.sel.map(function(s){return _fgLgTraer(s.img);})).then(function(ims){
    // mientras bajaban los logos se cerró la ventana o se cambió de flyer: no se aplica nada
    if(_fgFrSt!==st||_fgLgSrc()!==st.src)return null;
    if(_fgLg.src!==_fgLgSrc()){_fgLg.list=[];_fgLg.src=_fgLgSrc();}
    var r=st.rect,fid=(st.previa&&st.previa.franja)||('fr'+Date.now());
    var dentro=function(cx,cy){return cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h;};
    _fgLg.list=_fgLg.list.filter(function(e){
      if(e.franja===fid)return false;
      if(e.franja)return true; // los de OTRA franja nunca se tocan
      // lo de antes en esta zona se reemplaza: por su lugar original o por donde está dibujado
      if(dentro(e.ox+e.ow/2,e.oy+e.oh/2))return false;
      if(e.tx!=null&&!isNaN(e.tx)&&dentro(e.tx+e.tw/2,e.ty+e.th/2))return false;
      return true;
    });
    _fgLg.list.push({x:r.x-2,y:r.y-2,w:r.w+4,h:r.h+4,bg:st.info.bg,img:'',t:'Franja',ox:r.x,oy:r.y,ow:r.w,oh:r.h,
      franja:fid,franjaBase:true,franjaSel:JSON.parse(JSON.stringify(st.sel)),franjaCols:st.cols||0,franjaKt:st.kt||1,franjaInfo:st.info});
    var lug=_fgFrLugares(st,st.sel.length),DS=_fgFrDiasTodos(st,lug);
    st.sel.forEach(function(s,i){
      var im=ims[i],dz=DS.porI[i],d=_fgFrAjustar(st,s,_fgFrEncajar(dz?dz.logo:lug[i],im.width/im.height));
      // sin tapado propio (w/h 0): ya lo tapa la franja
      _fgLg.list.push({x:d.tx,y:d.ty,w:0,h:0,bg:st.info.bg,img:s.img,t:s.t,ox:d.tx,oy:d.ty,ow:d.tw,oh:d.th,
        tx:d.tx,ty:d.ty,tw:d.tw,th:d.th,bw:d.tw,bh:d.th,franja:fid});
      if(dz){
        // los días debajo, centrados en el logo (siguen al logo si se lo corrió en la vista previa)
        var e={tipo:'txt',texto:dz.texto,color:DS.color,peso:500,fs:DS.fs,bfs:DS.fs,x:0,y:0,w:0,h:0,bg:st.info.bg,t:dz.texto.replace(/\n/g,' '),
               tx:d.tx+d.tw/2,ty:dz.ty,franja:fid};
        _fgLgTxtMedir(e);e.tx=d.tx+d.tw/2-e.tw/2;e.ty=dz.ty-e.th/2;e.ox=e.tx;e.oy=e.ty;e.ow=e.tw;e.oh=e.th;
        _fgLg.list.push(e);
      }
    });
    _fgLg.sel=-1;_fgLgListo();
    return st.sel.length;
  });
}

// ══ ESTUDIO — diseños de flyer guardados (prototipo 16-oct-2026) ═════════════
// Lo que se arma con "Cambiar logos" (logos cambiados, movidos, textos) se puede
// guardar como un DISEÑO con nombre (y, si quiere, la empresa para la que es).
// · Cada uno ve los suyos en la solapa "Estudio"; el admin ve los de todos.
// · "Usar" lo vuelve a aplicar en el armador, sobre el mismo flyer (opción).
// · "Pedir que se publique" se lo manda al admin; al aprobarlo, la app arma la
//   imagen del flyer con los cambios ya pegados y crea una OPCIÓN nueva (misma
//   solapa, mismo legal y calibración que la original), que aparece en la barra
//   de opciones al lado de la original para todos los que la tenían habilitada.
// Tabla flyer_disenos (migración 026): RLS por dueño + admin; el trigger de
// guardia pone dueño/autor y la revisión, así no se falsean desde el navegador.
// Lo que se guarda es SÓLO el diseño (no oficiales ni montos): sirve para
// cualquier empresa. La empresa es un rótulo para encontrarlo.
var _EST={lista:null,cargando:false,filtro:'mios',q:'',elegido:false};
var _EST_COLS='id,user_id,autor,nombre,empresa,opcion,base_name,miniatura,estado,nota_admin,opcion_publicada,pedido_at,revisado_at,created_at,updated_at';
var _EST_ESTADO={privado:'Guardado',pedido:'Pedido enviado',publicado:'Publicado',rechazado:'No aprobado'};
function _estVer(){return !_esHunter()&&!_esLider()&&_can('estudio');}
function _estMio(d){return !!(d&&_me&&d.user_id===_me.id);}
function _estNombreImg(src){return String(src||'').split(/[?#]/)[0].split('/').pop();}

// ·· Guardar desde el armador ··
// Logos subidos de la PC: viajan DENTRO del diseño (achicados), si no al
// reabrirlo en otra computadora no estarían.
function _estSubidos(L){
  var out={},tot=0;
  L.forEach(function(e){
    if(e.tipo==='txt'||!e.img||!_fgLgEsSubido(e.img)||out[e.img])return;
    var c=_fgLg.imgs[e.img];if(!c)return;
    var k=Math.min(1,600/Math.max(c.width,c.height)),t=document.createElement('canvas');
    t.width=Math.max(1,Math.round(c.width*k));t.height=Math.max(1,Math.round(c.height*k));
    t.getContext('2d').drawImage(c,0,0,t.width,t.height);
    out[e.img]=t.toDataURL('image/png');tot+=out[e.img].length;
  });
  return {mapa:out,tam:tot};
}
// Miniatura: el pedazo del flyer donde hay MÁS cambios, ya dibujados, con la
// misma forma que la tarjeta de Estudio (520×200). Si los cambios están lejos
// entre sí (súper arriba, marcas abajo), un recorte que los abarque a todos
// queda alto y la tarjeta mostraba justo lo del medio, que no cambió.
var _EST_MINI_W=520,_EST_MINI_H=200;
function _estMiniatura(L){
  var rec=_fgRecActivo();
  if((!L.length&&!rec)||!window.baseImg)return '';
  var W=baseImg.width,alto=Math.round(W*_EST_MINI_H/_EST_MINI_W);
  // sólo un recorte: se muestra la unión
  var ys=L.length?L.map(function(e){return (e.ty!=null&&!isNaN(e.ty))?e.ty+e.th/2:e.y+e.h/2;}):[_fgRec.cortes[0].y];
  // la franja (del alto de la tarjeta) que junta más cambios
  var mejor=ys[0],cuantos=0;
  ys.forEach(function(y0){
    var n=ys.filter(function(y){return Math.abs(y-y0)<=alto/2;}).length;
    if(n>cuantos){cuantos=n;mejor=y0;}
  });
  var cerca=ys.filter(function(y){return Math.abs(y-mejor)<=alto/2;});
  var cy=(Math.min.apply(null,cerca)+Math.max.apply(null,cerca))/2;
  var y0=Math.max(0,Math.min(baseImg.height-alto,Math.round(cy-alto/2)));
  var c=document.createElement('canvas');c.width=_EST_MINI_W;c.height=_EST_MINI_H;
  var g=c.getContext('2d'),k=_EST_MINI_W/W;g.scale(k,k);g.translate(0,-y0);
  g.drawImage(baseImg,0,0);
  _fgLgPintar(g,1,L,baseImg,Infinity,0);
  try{return c.toDataURL('image/jpeg',0.82);}catch(e){return '';}
}
function fgEstGuardar(){
  var L=_fgLgActivos();
  if(!L.length&&!_fgRecActivo()){showToast('Primero cambiá algo del flyer (un logo, un texto o un recorte) con «Cambiar logos».');return;}
  var proy=_fgLg.proy&&_fgLg.proy.mio&&_fgLg.proy.estado!=='publicado'?_fgLg.proy:null;
  var emp=((document.getElementById('empresa')||{}).value||'').trim();
  var viejo=document.getElementById('fg-est-ov');if(viejo)viejo.remove();
  var ov=document.createElement('div');ov.id='fg-est-ov';ov.className='fg-cf-ov';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','fg-est-t');
  ov.innerHTML='<div class="fg-cf fg-est-g">'+
    '<div class="fg-cf-t" id="fg-est-t">Guardar en Estudio</div>'+
    '<div class="fg-cf-b">Se guarda el dise&ntilde;o (logos y textos) sobre el flyer &laquo;'+_escHtml(_optLabel(_fgOpt))+'&raquo;. Lo ves en la solapa <b>Estudio</b>: desde ah&iacute; lo volv&eacute;s a usar o ped&iacute;s que se publique para todos.</div>'+
    '<label class="fg-est-l" for="fg-est-nom">Nombre del dise&ntilde;o</label>'+
    '<input type="text" id="fg-est-nom" maxlength="80" autocomplete="off" placeholder="Ej.: Combustible con farmacias">'+
    '<label class="fg-est-l" for="fg-est-emp">Empresa <span>(opcional, para encontrarlo)</span></label>'+
    '<input type="text" id="fg-est-emp" maxlength="160" autocomplete="off" placeholder="Ej.: Farmacias del Sur S.A.">'+
    (proy?'<label class="fg-est-op"><input type="radio" name="fg-est-modo" value="mismo" checked> Guardar los cambios en &laquo;'+_escHtml(proy.nombre)+'&raquo;</label>'+
      '<label class="fg-est-op"><input type="radio" name="fg-est-modo" value="nuevo"> Guardar como un dise&ntilde;o nuevo</label>':'')+
    '<div class="fg-cf-acts"><button type="button" class="btn bg" id="fg-est-no">Cancelar</button><button type="button" class="btn bp" id="fg-est-ok">Guardar</button></div></div>';
  document.body.appendChild(ov);
  var nom=document.getElementById('fg-est-nom'),em=document.getElementById('fg-est-emp');
  nom.value=proy?proy.nombre:'';em.value=proy?(proy.empresa||emp):emp;
  function cerrar(){document.removeEventListener('keydown',tecla,true);ov.remove();}
  function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();}else if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type==='text'){e.preventDefault();ok.click();}}
  document.addEventListener('keydown',tecla,true);
  document.getElementById('fg-est-no').onclick=cerrar;
  var ok=document.getElementById('fg-est-ok');
  ok.onclick=function(){
    var n=nom.value.replace(/[<>]/g,'').trim();
    if(!n){showToast('Ponele un nombre al diseño.');nom.focus();return;}
    var modo=proy&&(ov.querySelector('input[name=fg-est-modo]:checked')||{}).value==='mismo'?'mismo':'nuevo';
    var sub=_estSubidos(L);
    if(sub.tam>2200000){showToast('Los logos subidos desde la PC pesan demasiado para guardarlos. Probá con imágenes más chicas.');return;}
    var fila={nombre:n,empresa:em.value.replace(/[<>]/g,'').trim().slice(0,160),opcion:_optN(_fgOpt),
      base_name:_estNombreImg(_fgLgSrc()),datos:{v:1,cambios:JSON.parse(JSON.stringify(L)),subidos:sub.mapa,
        recortes:_fgRecActivo()?JSON.parse(JSON.stringify(_fgRec.cortes)):[],legal:((document.getElementById('legal-text')||{}).value)||''},miniatura:_estMiniatura(L)};
    ok.disabled=true;ok.textContent='Guardando…';
    var src0=_fgLgSrc(),proto0=_fgProtoAct;
    var q=(modo==='mismo')?_sb.from('flyer_disenos').update(fila).eq('id',proy.id).select(_EST_COLS).single()
                         :_sb.from('flyer_disenos').insert(Object.assign({estado:'privado'},fila)).select(_EST_COLS).single();
    q.then(function(r){
      if(r.error){ok.disabled=false;ok.textContent='Guardar';showToast('No se pudo guardar: '+_estErr(r.error));return;}
      cerrar();
      // Guardado está: si mientras respondía se pasó a otro flyer o a otra pestaña
      // (Escape cierra la ventana), el diseño queda en Estudio pero no se le
      // pega a lo que está abierto ahora.
      if(_fgLgSrc()!==src0||_fgProtoAct!==proto0){_estUpsert(r.data);showToast('Guardado en Estudio: «'+r.data.nombre+'».');return;}
      _fgLg.proy={id:r.data.id,nombre:r.data.nombre,empresa:r.data.empresa,mio:true,estado:r.data.estado};
      // si estaba en un prototipo: la pestaña pasa a ser la del diseño guardado
      var pa=_fgProtoAct&&_fgProtoBuscar(_fgProtoAct);
      if(pa&&modo==='mismo'){pa.nombre=r.data.nombre;pa.empresa=r.data.empresa;pa.cambios=JSON.parse(JSON.stringify(L));pa.subidos=sub.mapa;pa.recortes=fila.datos.recortes;pa.legal=fila.datos.legal;_facSyncOptBar();_fgRenderOptBar();}
      else if(pa&&pa.temp){ // el borrador pasa a ser el diseño guardado (deja de ser borrador)
        pa.id=r.data.id;pa.temp=false;pa.nombre=r.data.nombre;pa.empresa=r.data.empresa||'';pa.mio=true;pa.estado=r.data.estado;
        pa.cambios=JSON.parse(JSON.stringify(L));pa.subidos=sub.mapa;pa.recortes=fila.datos.recortes;pa.legal=fila.datos.legal;
        _fgProtoAct=pa.id;_facSyncOptBar();_fgRenderOptBar();
      }
      _estUpsert(r.data);_fgLgBarra();
      showToast(modo==='mismo'?'Cambios guardados en «'+r.data.nombre+'».':'Guardado en Estudio: «'+r.data.nombre+'».');
    },function(e){ok.disabled=false;ok.textContent='Guardar';showToast('No se pudo guardar: '+_estErr(e));});
  };
  setTimeout(function(){try{nom.focus();}catch(e){}},30);
}
function _estErr(e){
  var m=String((e&&(e.message||e.details))||e||'');
  if(/does not exist|relation|schema cache/i.test(m))return 'falta preparar la base para Estudio (avisale al administrador).';
  if(/row-level security|permission|policy/i.test(m))return 'no tenés permiso para hacer eso.';
  if(/Failed to fetch|NetworkError|network/i.test(m))return 'sin conexión. Probá de nuevo.';
  return m||'error desconocido';
}
function _estUpsert(d){
  if(!_EST.lista)return;
  var i=_EST.lista.findIndex(function(x){return x.id===d.id;});
  if(i>=0)_EST.lista[i]=d;else _EST.lista.unshift(d);
  if(document.getElementById('est-grid'))_estRender();
}
// Al salir del diseño (cambia de opción, Restaurar…) se suelta el rótulo.
function _fgLgProySync(){
  if(_fgLg.proy&&(!_fgLgActivos().length&&!_fgLg.list.length||_fgLg.src!==_fgLgSrc()))_fgLg.proy=null;
}
function fgEstSoltar(){_fgLg.proy=null;_fgProtoAct=null;_fgLgBarra();_fgRenderOptBar();}

// ·· Usar un diseño ··
function _estDatos(id){
  return _sb.from('flyer_disenos').select('id,datos,opcion,base_name,nombre,empresa,user_id,estado').eq('id',id).single()
    .then(function(r){if(r.error)throw r.error;return r.data;});
}
function _estCargarImg(src){
  return new Promise(function(res,rej){var i=new Image();i.onload=function(){res(i);};i.onerror=rej;i.src=src;});
}
function _estPrepararSubidos(sub){
  var ks=Object.keys(sub||{});
  return Promise.all(ks.map(function(k){
    if(_fgLg.imgs[k])return null;
    return _estCargarImg(sub[k]).then(function(i){
      var c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);_fgLg.imgs[k]=c;
    }).catch(function(){});
  }));
}
// "Usar" no pisa el flyer original: el diseño se abre como una PESTAÑA DE
// PROTOTIPO en la barra de opciones, al lado de su flyer base y con el nombre
// con el que se guardó. Vive en la memoria de esta pestaña (al recargar la
// página desaparece de la barra; el diseño sigue guardado en Estudio). Los
// cambios que se le hagan sin guardar se recuerdan mientras dure la pestaña.
// _fgProtoTurno: cada apertura lleva un número; sólo la ÚLTIMA puede aplicarse.
// Sin esto, abrir un prototipo y tocar otra pestaña antes de que termine de
// cargar dejaba aplicado el anterior (y la descarga salía con ese diseño).
var _fgProtos=[],_fgProtoAct=null,_fgProtoTurno=0;
// ·· Borradores ··
// Un BORRADOR es una pestaña de prototipo SIN fila en Estudio (p.temp): el primer
// cambio sobre el flyer original (recorte, logo o texto) se muda solo a
// "Borrador N", al lado; el original queda limpio. "Nuevo borrador" arranca
// otro desde el flyer limpio. Viven en memoria hasta recargar o cerrarlos; para
// conservar uno, "Guardar en Estudio" lo convierte en diseño.
var _fgBorr={seq:0};
// ·· Borradores guardados en la PC ··
// Para que un corte de luz o recargar la página no los pierda: se guardan en el
// navegador (localStorage, por usuario) 1 s después del último cambio. Ocupan
// poco (los logos subidos ya vienen achicados) y no frenan nada. Al volver a
// entrar se ofrece "Recuperar" o "Descartar". Si el navegador no deja guardar,
// todo sigue como antes (try/catch).
var _FG_BORR_MAX=2000000;
function _fgBorrClave(){return 'fg_borradores_'+((_me&&_me.id)||'anon');}
function _fgBorrGuardarPronto(){
  if(!_fgBorr.revisado){ // hasta ofrecer los de la última vez no se pisa nada
    if(_me&&!_fgBorr.ofrecido){_fgBorr.ofrecido=true;setTimeout(_fgBorrOfrecer,900);} // respaldo si el ingreso no lo disparó
    return;
  }
  clearTimeout(_fgBorr.t);_fgBorr.t=setTimeout(_fgBorrGuardar,1000);
}
function _fgBorrGuardar(){
  try{
    _fgProtoGuardarActual();
    var L=_fgProtos.filter(function(p){return p.temp;}).map(function(p){
      return {id:p.id,opcion:p.opcion,nombre:p.nombre,cambios:p.cambios||[],recortes:p.recortes||[],legal:(typeof p.legal==='string'?p.legal:null),subidos:p.subidos||{}};
    }).concat(_fgBorr.pendientes||[]);
    var k=_fgBorrClave();
    if(!L.length){localStorage.removeItem(k);return;}
    var t=JSON.stringify({v:1,fecha:Date.now(),lista:L});
    if(t.length>_FG_BORR_MAX){
      L.forEach(function(x){x.subidos={};});t=JSON.stringify({v:1,fecha:Date.now(),lista:L});
      if(!_fgBorr.avisoGrande){_fgBorr.avisoGrande=true;showToast('Los borradores se guardan en la PC sin los logos subidos (son muy pesados). Para conservarlos, guardalos en Estudio.');}
    }
    localStorage.setItem(k,t);
  }catch(e){}
}
// Al entrar: ¿quedaron borradores de la última vez?
function _fgBorrOfrecer(){
  if(_fgBorr.revisado)return;_fgBorr.revisado=true;
  var L=[];
  try{var d=JSON.parse(localStorage.getItem(_fgBorrClave())||'null');L=(d&&Array.isArray(d.lista))?d.lista:[];}catch(e){L=[];}
  L=L.filter(function(x){return x&&_FG_OPTS.indexOf(+x.opcion)>=0&&_can('opcion_'+x.opcion);});
  if(!L.length){try{localStorage.removeItem(_fgBorrClave());}catch(e){}return;}
  _fgBorr.pendientes=L;
  var v=document.getElementById('fg-borr-rec');if(v)v.remove();
  var c=document.createElement('div');c.id='fg-borr-rec';c.className='fg-borr-rec';c.setAttribute('role','dialog');c.setAttribute('aria-label','Borradores de la última vez');
  var nombres=L.map(function(x){return _escHtml(_optLabel(x.opcion))+' &middot; '+_escHtml(x.nombre||'Borrador');}).join(', ');
  c.innerHTML='<div class="fg-borr-rec-t">Ten&eacute;s '+(L.length===1?'un borrador':L.length+' borradores')+' de la &uacute;ltima vez</div>'+
    '<div class="fg-borr-rec-b">'+nombres+'</div>'+
    '<div class="fg-borr-rec-a"><button type="button" class="btn bg" id="fg-borr-no">Descartar</button><button type="button" class="btn bp" id="fg-borr-si">Recuperar</button></div>';
  document.body.appendChild(c);
  document.getElementById('fg-borr-si').onclick=function(){c.remove();_fgBorrRecuperar();};
  document.getElementById('fg-borr-no').onclick=function(){
    c.remove();_fgBorr.pendientes=null;_fgBorrGuardar();showToast('Borradores descartados.');
  };
}
function _fgBorrRecuperar(){
  var L=_fgBorr.pendientes||[];_fgBorr.pendientes=null;
  L.forEach(function(x){
    var n=+x.opcion,p=_fgBorradorCrear(n); // nombre libre y id nuevo
    if(x.nombre&&!_fgProtos.some(function(q){return q!==p&&q.temp&&q.opcion===n&&q.nombre===x.nombre;}))p.nombre=x.nombre;
    p.cambios=Array.isArray(x.cambios)?x.cambios:[];p.recortes=Array.isArray(x.recortes)?x.recortes:[];
    p.legal=(typeof x.legal==='string')?x.legal:null;p.subidos=x.subidos||{};
  });
  _facSyncOptBar();_fgRenderOptBar();_fgBorrGuardar();
  showToast(L.length===1?'Borrador recuperado: está en su pestaña, al lado del flyer.':L.length+' borradores recuperados: están en sus pestañas, al lado de su flyer.');
}
function _fgBorradorCrear(n){
  var k=1;while(_fgProtos.some(function(x){return x.temp&&x.opcion===n&&x.nombre==='Borrador '+k;}))k++;
  var p={id:'bor-'+n+'-'+(++_fgBorr.seq),opcion:n,nombre:'Borrador '+k,temp:true,mio:false,estado:'borrador',empresa:'',cambios:[],recortes:[],legal:null,subidos:{}};
  _fgProtos.push(p);return p;
}
function _fgBorradorAuto(forzar){
  if((!_fgLg.on&&!forzar)||_fgProtoActivo()||_fgBorr.ocupado)return;
  if(!(_fgLgActivos().length||_fgRecActivo()))return;
  var n=_optN(_fgOpt);if(_FG_OPTS.indexOf(n)<0)return;
  _fgStashLegal(); // lo editado en el legal del original queda para el original
  var p=_fgBorradorCrear(n);
  _fgProtoAct=p.id;
  _fgLg.proy={id:p.id,nombre:p.nombre,empresa:'',mio:false,estado:'borrador',temp:true};
  _facSyncOptBar();_fgRenderOptBar();_fgLgBarra();
  showToast('Tus cambios quedaron en «'+p.nombre+'», al lado del flyer original. El original no se tocó.');
}
function fgBorradorNuevo(){
  var n=_optN(_fgOpt);if(_FG_OPTS.indexOf(n)<0)return;
  var p=_fgBorradorCrear(n);
  _facSyncOptBar();
  fgProtoAbrir(p.id);
  showToast('«'+p.nombre+'» listo: arranca del flyer original.');
}
function _fgBorradorConCambios(p){
  if(_fgProtoActivo()===p&&(_fgLgActivos().length||_fgRecActivo()))return true;
  return !!((p.cambios&&p.cambios.length)||(p.recortes&&p.recortes.length));
}
function _fgProtoBuscar(id){for(var i=0;i<_fgProtos.length;i++)if(_fgProtos[i].id===id)return _fgProtos[i];return null;}
// El prototipo que se ve ahora (su diseño está aplicado sobre su flyer base).
function _fgProtoActivo(){
  var p=_fgProtoAct?_fgProtoBuscar(_fgProtoAct):null;
  return (p&&_optN(_fgOpt)===p.opcion&&_fgLg.proy&&_fgLg.proy.id===p.id)?p:null;
}
// Antes de salir de un prototipo se guarda en memoria lo que se le cambió.
function _fgProtoGuardarActual(){
  var p=_fgProtoActivo();
  if(p&&_fgLg.src===_fgLgSrc())p.cambios=JSON.parse(JSON.stringify(_fgLg.list));
  if(p){p.recortes=_fgRecActivo()?JSON.parse(JSON.stringify(_fgRec.cortes)):[];var lt=document.getElementById('legal-text');if(lt&&(typeof p.legal==='string'||p.temp))p.legal=lt.value;}
  if(p&&p.temp&&_fgLg.src===_fgLgSrc()){try{p.subidos=_estSubidos(_fgLg.list).mapa;}catch(e){}}
}
// El legal de la opción (lo editado en la sesión o el guardado), para volver de un prototipo.
function _fgLegalDeOpcion(o){
  var c=_fgOptCache[_optN(o)],el=document.getElementById('legal-text');if(!c||!el)return;
  var t=(typeof c.legalEdited==='string')?c.legalEdited:c.legal;if(typeof t==='string')el.value=t;
}
function fgProtoAbrir(id){
  var p=_fgProtoBuscar(id);if(!p)return;
  if(_fgProtoActivo()===p)return;
  if(_FG_OPTS.indexOf(p.opcion)<0||!_can('opcion_'+p.opcion)){showToast('El flyer base de este prototipo ya no está disponible.');return;}
  if(!_fgProtoActivo())_fgStashLegal(); // desde el original: su legal editado queda para él
  _fgProtoGuardarActual();
  var turno=++_fgProtoTurno;
  _fgProtoAct=null;_fgLg.list=[];_fgLg.proy=null;_fgLg.sel=-1;
  _fgBorr.ocupado=true;_fgRecOlvidar();
  // si la apertura no termina (falla la carga, se elige otra cosa), no queda trabado
  setTimeout(function(){if(turno===_fgProtoTurno&&_fgProtoAct!==p.id)_fgBorr.ocupado=false;},15000);
  switchApp(_optSolapa(p.opcion));
  function vigente(){var v=turno===_fgProtoTurno&&_optN(_fgOpt)===p.opcion&&_fgProtoBuscar(p.id)===p;if(!v&&turno===_fgProtoTurno)_fgBorr.ocupado=false;return v;}
  switchFlyerOption(p.opcion,function(){
    if(!vigente())return;
    _estPrepararSubidos(p.subidos).then(function(){
      if(!vigente())return; // mientras se preparaba, se eligió otra cosa
      // primero el flyer entero, después los recortes del diseño y recién ahí sus logos
      _fgRecOlvidar();_fgRecAplicarLista(p.recortes);
      // su legal; si no tiene uno propio, el de la opción (nunca el de la pestaña anterior)
      if(typeof p.legal==='string'&&p.legal.trim()){var lt=document.getElementById('legal-text');if(lt)lt.value=p.legal;}
      else _fgLegalDeOpcion(p.opcion);
      _fgLg.list=JSON.parse(JSON.stringify(p.cambios||[]));_fgLg.src=_fgLgSrc();_fgLg.sel=-1;_fgLgHistReiniciar();
      _fgLg.proy={id:p.id,nombre:p.nombre,empresa:p.empresa||'',mio:p.mio,estado:p.estado,temp:!!p.temp};
      _fgProtoAct=p.id;_fgBorr.ocupado=false;_fgMontosVisibles();if(typeof calcSC==='function')calcSC();
      var e=document.getElementById('empresa');
      if(e&&p.empresa&&!e.value.trim()){e.value=p.empresa;if(typeof updateFnPreview==='function')updateFnPreview();}
      _fgLgListo();_fgRenderOptBar();
      if(p.avisarCambio){p.avisarCambio=false;showToast('Ojo: el flyer «'+_optLabel(p.opcion)+'» cambió desde que se guardó este diseño. Revisá que todo haya quedado en su lugar.');}
    });
  });
}
// Elegir una opción "de verdad" en la barra. Si se estaba en un prototipo de
// esa misma opción, se vuelve al flyer original (sin sus cambios).
function fgOptElegir(o){
  _fgProtoTurno++;_fgBorr.ocupado=false; // anula una apertura de prototipo que todavía esté cargando
  var p=_fgProtoActivo();
  if(p){
    _fgProtoGuardarActual();
    _fgProtoAct=null;_fgLg.list=[];_fgLg.proy=null;_fgLg.sel=-1;
    var habiaRec=!!_fgRec;_fgRecOlvidar();_fgLgHistReiniciar();
    if(_optN(_fgOpt)===o){if(typeof p.legal==='string')_fgLegalDeOpcion(o);if(habiaRec){_fgMontosVisibles();if(typeof calcSC==='function')calcSC();}_fgLgListo();_fgRenderOptBar();return;}
  }
  switchFlyerOption(o);
}
function fgProtoCerrar(id,ev,ya){
  if(ev){ev.stopPropagation();ev.preventDefault();}
  var p=_fgProtoBuscar(id);if(!p)return;
  if(p.temp&&!ya&&_fgBorradorConCambios(p)){
    fgConfirm('',{titulo:'¿Cerrar «'+p.nombre+'»?',texto:'Es un borrador sin guardar: se pierden sus cambios. Si lo querés conservar, primero tocá «Guardar en Estudio».',ok:'Cerrar borrador',cancelar:'Volver'},function(si){if(si)fgProtoCerrar(id,null,true);});
    return;
  }
  _fgProtoTurno++;
  if(_fgProtoActivo()===p){_fgProtoAct=null;_fgLg.list=[];_fgLg.proy=null;_fgLg.sel=-1;_fgRecOlvidar();_fgLgHistReiniciar();
    if(typeof p.legal==='string'||p.temp)_fgLegalDeOpcion(_fgOpt);_fgMontosVisibles();if(typeof calcSC==='function')calcSC();_fgLgListo();}
  _fgProtos=_fgProtos.filter(function(x){return x!==p;});
  _facSyncOptBar();_fgRenderOptBar();
}
function estUsar(id){
  var d0=_estBuscar(id);if(!d0)return;
  var n=+d0.opcion;
  if(_FG_OPTS.indexOf(n)<0){showToast('El flyer sobre el que se armó este diseño ya no existe.');return;}
  if(!_can('opcion_'+n)){showToast('No tenés habilitado el flyer «'+_optLabel(n)+'», que es la base de este diseño.');return;}
  showToast('Abriendo «'+d0.nombre+'»…');
  var turno=++_fgProtoTurno; // si mientras responde la base se elige otra cosa, no se abre
  _estDatos(id).then(function(d){
    if(turno!==_fgProtoTurno)return;
    var p=_fgProtoBuscar(d.id);
    if(!p){p={id:d.id};_fgProtos.push(p);}
    // siempre con lo último guardado en Estudio
    p.nombre=d.nombre;p.empresa=d.empresa||'';p.opcion=+d.opcion;p.mio=_estMio(d);p.estado=d.estado;
    p.cambios=(d.datos&&Array.isArray(d.datos.cambios))?d.datos.cambios:[];
    p.subidos=(d.datos&&d.datos.subidos)||{};
    p.recortes=(d.datos&&Array.isArray(d.datos.recortes))?d.datos.recortes:[];
    p.legal=(d.datos&&typeof d.datos.legal==='string')?d.datos.legal:null;
    var img=_fgOptCache[p.opcion]&&_fgOptCache[p.opcion].img;
    p.avisarCambio=!!(d.base_name&&img&&d.base_name!==_estNombreImg(img.src));
    if(_fgProtoActivo()===p)_fgProtoAct=null; // se vuelve a aplicar con lo guardado
    switchApp(_optSolapa(p.opcion));
    _facSyncOptBar();
    fgProtoAbrir(p.id);
  }).catch(function(e){showToast('No se pudo abrir el diseño: '+_estErr(e));});
}

// ·· Solapa Estudio ··
function _estInit(){
  var v=document.getElementById('view-estudio');if(!v)return;
  if(!document.getElementById('est-grid')){
    v.innerHTML='<div class="est-wrap">'+
      '<div class="est-head"><div><h2 class="est-tit">Estudio</h2>'+
      '<p class="est-sub">Tus dise&ntilde;os de flyer. Se arman en el armador con <b>Cambiar logos</b> y se guardan con <b>Guardar en Estudio</b>. Desde ac&aacute; los volv&eacute;s a usar o ped&iacute;s que se publiquen para todos.</p></div></div>'+
      '<div class="est-bar"><div class="est-fil" id="est-fil" role="tablist"></div>'+
      '<input type="search" id="est-q" placeholder="Buscar por nombre o empresa" autocomplete="off"></div>'+
      '<div class="est-grid" id="est-grid"></div></div>';
    var t=0,q=document.getElementById('est-q');
    q.addEventListener('input',function(){clearTimeout(t);t=setTimeout(function(){_EST.q=q.value;_estRender();},120);});
    document.getElementById('est-fil').addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('button[data-f]');if(!b)return;_EST.filtro=b.getAttribute('data-f');_EST.elegido=true;_estRender();
    });
    document.getElementById('est-grid').addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('button[data-acc]');if(!b)return;
      var id=b.getAttribute('data-id'),a=b.getAttribute('data-acc');
      ({usar:estUsar,ver:estVerCompleto,pedir:estPedir,cancelar:estCancelarPedido,borrar:estBorrar,aprobar:estAprobar,rechazar:estRechazar,ir:estIrVariante})[a](id);
    });
  }
  _estCargar();
}
function _estCargar(){
  if(_EST.cargando)return;_EST.cargando=true;
  var g=document.getElementById('est-grid');if(g&&!_EST.lista)g.innerHTML='<div class="est-vacio">Cargando dise&ntilde;os&hellip;</div>';
  _sbTodo(function(d,h){return _sb.from('flyer_disenos').select(_EST_COLS).order('updated_at',{ascending:false}).range(d,h);},function(err,filas){
    _EST.cargando=false;
    if(err){if(g)g.innerHTML='<div class="est-vacio">No se pudieron leer los dise&ntilde;os: '+_escHtml(_estErr(err))+'</div>';return;}
    _EST.lista=filas||[];
    // el admin abre directo en los pedidos si hay alguno esperando (hasta que elija otra cosa)
    if(_admin&&!_EST.elegido)_EST.filtro=_EST.lista.some(function(d){return d.estado==='pedido';})?'pedidos':'mios';
    _estBadge();_estRender();
  },1000,0,[]);
}
function _estBuscar(id){return (_EST.lista||[]).filter(function(x){return x.id===id;})[0]||null;}
function _estRender(){
  var g=document.getElementById('est-grid'),fb=document.getElementById('est-fil');if(!g)return;
  var L=_EST.lista||[],adm=!!_admin,mios=L.filter(_estMio),pend=L.filter(function(d){return d.estado==='pedido';});
  if(!adm)_EST.filtro='mios';
  if(fb)fb.innerHTML=adm?[['mios','Mis diseños',mios.length],['todos','Todos',L.length],['pedidos','Pedidos',pend.length]].map(function(f){
    return '<button type="button" role="tab" data-f="'+f[0]+'" class="'+(_EST.filtro===f[0]?'on':'')+'" aria-selected="'+(_EST.filtro===f[0])+'">'+f[1]+' <span>'+f[2]+'</span></button>';
  }).join(''):'';
  var base=_EST.filtro==='todos'?L:_EST.filtro==='pedidos'?pend:mios;
  var q=_promoNormalizar(_EST.q||'');
  var vis=q?base.filter(function(d){return _promoNormalizar((d.nombre||'')+' '+(d.empresa||'')+' '+(d.autor||'')).indexOf(q)>=0;}):base;
  if(!vis.length){
    g.innerHTML='<div class="est-vacio">'+(q?'No hay dise&ntilde;os con ese nombre.':
      _EST.filtro==='pedidos'?'No hay pedidos pendientes.':
      '<b>Todav&iacute;a no hay dise&ntilde;os.</b><br>En <b>Flyer Galicia</b> toc&aacute; <b>Cambiar logos</b> (arriba a la derecha de la vista previa), arm&aacute; tu versi&oacute;n y toc&aacute; <b>Guardar en Estudio</b>.')+'</div>';
    return;
  }
  g.innerHTML=vis.map(_estCard).join('');
}
function _estFecha(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function _estCard(d){
  var mio=_estMio(d),adm=!!_admin,id=_escAttr(d.id),est=d.estado||'privado';
  var b=function(acc,txt,cls){return '<button type="button" class="btn '+(cls||'bg')+'" data-acc="'+acc+'" data-id="'+id+'">'+txt+'</button>';};
  var acts=[b('usar','Usar','bp'),b('ver','Ver completo')];
  if(mio&&(est==='privado'||est==='rechazado'))acts.push(b('pedir',est==='rechazado'?'Volver a pedir':'Pedir que se publique'));
  if(mio&&est==='pedido')acts.push(b('cancelar','Cancelar pedido'));
  if(est==='publicado'&&d.opcion_publicada&&_FG_OPTS.indexOf(+d.opcion_publicada)>=0)acts.push(b('ir','Ir al flyer publicado'));
  if(adm&&est==='pedido'){acts.push(b('aprobar','Aprobar y publicar','bgreen'));acts.push(b('rechazar','No aprobar'));}
  if((mio&&est!=='publicado')||adm)acts.push(b('borrar','Borrar','bg est-borrar'));
  var estTxt=_EST_ESTADO[est]||est;
  if(est==='publicado'&&d.opcion_publicada)estTxt='Publicado como «'+_optLabel(d.opcion_publicada)+'»';
  return '<article class="est-card">'+
    '<div class="est-mini">'+(d.miniatura&&/^data:image\/jpeg;base64,/.test(d.miniatura)?'<img alt="" src="'+_escAttr(d.miniatura)+'">':'')+'</div>'+
    '<div class="est-info">'+
      '<div class="est-fila1"><span class="est-nom">'+_escHtml(d.nombre)+'</span><span class="est-estado est-'+_escAttr(est)+'">'+_escHtml(estTxt)+'</span></div>'+
      (d.empresa?'<div class="est-emp">'+_escHtml(d.empresa)+'</div>':'')+
      '<div class="est-meta">Sobre &laquo;'+_escHtml(_FG_OPTS.indexOf(+d.opcion)>=0?_optLabel(d.opcion):'opción '+d.opcion)+'&raquo; &middot; '+_escHtml(_estFecha(d.updated_at))+
        (adm&&!mio?' &middot; de <b>'+_escHtml(d.autor||'¿?')+'</b>':'')+'</div>'+
      (est==='rechazado'&&d.nota_admin?'<div class="est-nota">'+_escHtml(d.nota_admin)+'</div>':'')+
      '<div class="est-acts">'+acts.join('')+'</div>'+
    '</div></article>';
}
// esperado = estados en los que tiene que estar el diseño para que el cambio
// valga. Si mientras tanto alguien lo cambió (el autor canceló el pedido, otro
// admin lo resolvió), no se pisa: se avisa y se vuelve a leer la lista.
function _estCambiar(id,campos,msg,esperado){
  var q=_sb.from('flyer_disenos').update(campos).eq('id',id);
  if(esperado&&esperado.length)q=q.in('estado',esperado);
  return q.select(_EST_COLS).single().then(function(r){
    if(r.error){
      if(esperado&&/PGRST116|0 rows|no rows/i.test((r.error.code||'')+' '+(r.error.message||'')+' '+(r.error.details||''))){
        showToast('Ese diseño cambió mientras tanto. Te muestro cómo quedó.');_EST.lista=null;_estCargar();return null;
      }
      showToast('No se pudo: '+_estErr(r.error));return null;
    }
    _estUpsert(r.data);_estBadge();if(msg)showToast(msg);return r.data;
  },function(e){showToast('No se pudo: '+_estErr(e));return null;});
}
function estPedir(id){
  var d=_estBuscar(id);if(!d)return;
  fgConfirm('¿Pedir que se publique «'+d.nombre+'»?',{texto:'Le llega al administrador. Si lo aprueba, aparece como un flyer más (al lado de «'+_optLabel(d.opcion)+'») para todos los que usan ese flyer.',ok:'Pedir',peligro:false},function(si){
    if(si)_estCambiar(id,{estado:'pedido'},'Pedido enviado. Te vas a enterar acá cuando lo revise.',['privado','rechazado']).then(function(fila){
      if(fila)try{_callFn('notify_estudio_pedido',{id:id},function(){});}catch(e){} // mail al admin
    });
  });
}
function estCancelarPedido(id){_estCambiar(id,{estado:'privado'},'Pedido cancelado.',['pedido']);}
function estBorrar(id){
  var d=_estBuscar(id);if(!d)return;
  fgConfirm('¿Borrar «'+d.nombre+'»?',{texto:(d.estado==='publicado'?'El flyer ya publicado NO se borra: sigue en la barra de opciones (eso se maneja desde Config → Opciones).':'No se puede deshacer.'),ok:'Borrar'},function(si){
    if(!si)return;
    _sb.from('flyer_disenos').delete().eq('id',id).then(function(r){
      if(r.error){showToast('No se pudo borrar: '+_estErr(r.error));return;}
      _EST.lista=(_EST.lista||[]).filter(function(x){return x.id!==id;});
      if(_fgProtoBuscar(id))fgProtoCerrar(id);
      if(_fgLg.proy&&_fgLg.proy.id===id)_fgLg.proy=null;
      _estBadge();_estRender();_fgLgBarra();showToast('Diseño borrado.');
    });
  });
}
function estIrVariante(id){
  var d=_estBuscar(id);if(!d||!d.opcion_publicada)return;
  var n=+d.opcion_publicada;
  if(!_can('opcion_'+n)){showToast('Ese flyer no está habilitado para tu perfil.');return;}
  switchApp(_optSolapa(n));switchFlyerOption(n);
}
// Numerito de pedidos pendientes en la solapa (sólo admin).
function _estBadge(){
  var t=document.getElementById('apptab-estudio');if(!t)return;
  var n=_admin?(_EST.lista||[]).filter(function(d){return d.estado==='pedido';}).length:0;
  var b=document.getElementById('est-tab-badge');
  if(!b){b=document.createElement('i');b.id='est-tab-badge';b.className='tab-badge';t.appendChild(b);}
  b.textContent=n>9?'9+':String(n||'');b.style.display=n>0?'':'none';
}
// Al entrar el admin: cuántos pedidos hay, sin bajar las miniaturas.
var _estBadgeHecho=false;
function _estBadgeInicio(){
  if(_estBadgeHecho||!_admin||!_estVer())return;_estBadgeHecho=true;
  _sb.from('flyer_disenos').select('id',{count:'exact',head:true}).eq('estado','pedido').then(function(r){
    if(r.error||_EST.lista)return;
    var t=document.getElementById('apptab-estudio');if(!t)return;
    var n=r.count||0,b=document.getElementById('est-tab-badge');
    if(!b){b=document.createElement('i');b.id='est-tab-badge';b.className='tab-badge';t.appendChild(b);}
    b.textContent=n>9?'9+':String(n||'');b.style.display=n>0?'':'none';
  });
}

// ·· Aprobar (admin): imagen nueva + opción nueva ··
function estRechazar(id){
  var d=_estBuscar(id);if(!d)return;
  fgPedirTexto('No aprobar «'+d.nombre+'»','Contale por qué (lo ve quien lo pidió). Es opcional.','',{ok:'No aprobar',largo:500,area:true},function(nota){
    if(nota===null)return;
    _estCambiar(id,{estado:'rechazado',nota_admin:nota.slice(0,500)},'Listo: no aprobado.',['pedido']);
  });
}
// Ventanita para pedir un texto (mismo estilo que fgConfirm). cb(null) = canceló.
function fgPedirTexto(titulo,texto,valor,op,cb){
  op=op||{};
  var v=document.getElementById('fg-pt-ov');if(v)v.remove();
  var ov=document.createElement('div');ov.id='fg-pt-ov';ov.className='fg-cf-ov';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','fg-pt-t');
  ov.innerHTML='<div class="fg-cf fg-est-g"><div class="fg-cf-t" id="fg-pt-t"></div><div class="fg-cf-b" id="fg-pt-b"></div>'+
    (op.area?'<textarea id="fg-pt-i" rows="3"></textarea>':'<input type="text" id="fg-pt-i" autocomplete="off">')+
    '<div class="fg-cf-acts"><button type="button" class="btn bg" id="fg-pt-no">Cancelar</button><button type="button" class="btn bp" id="fg-pt-ok"></button></div></div>';
  document.body.appendChild(ov);
  var i=document.getElementById('fg-pt-i');
  document.getElementById('fg-pt-t').textContent=titulo;document.getElementById('fg-pt-b').textContent=texto||'';
  document.getElementById('fg-pt-ok').textContent=op.ok||'Aceptar';
  i.maxLength=op.largo||80;i.value=valor||'';
  var listo=false;
  function fin(r){if(listo)return;listo=true;document.removeEventListener('keydown',tecla,true);ov.remove();cb(r);}
  function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fin(null);}else if(e.key==='Enter'&&!op.area){e.preventDefault();fin(String(i.value).replace(/[<>]/g,'').trim());}}
  document.addEventListener('keydown',tecla,true);
  document.getElementById('fg-pt-no').onclick=function(){fin(null);};
  document.getElementById('fg-pt-ok').onclick=function(){fin(String(i.value).replace(/[<>]/g,'').trim());};
  setTimeout(function(){try{i.focus();i.select();}catch(e){}},30);
}
function estAprobar(id){
  if(!_admin)return;
  var d0=_estBuscar(id);if(!d0)return;
  var n=+d0.opcion;
  if(_FG_OPTS.indexOf(n)<0){showToast('El flyer base de este diseño ya no existe.');return;}
  fgPedirTexto('Aprobar y publicar «'+d0.nombre+'»','Así se va a llamar el flyer nuevo en la barra de opciones, al lado de «'+_optLabel(n)+'». Lo van a ver los mismos perfiles que hoy ven ese flyer.',d0.nombre.slice(0,40),{ok:'Publicar',largo:40},function(nombre){
    if(nombre===null)return;
    if(!nombre){showToast('Hace falta un nombre.');return;}
    _estPublicar(id,d0,n,nombre);
  });
}
// La imagen de un diseño tal como se publicaría: flyer base + recortes + logos.
// La usan la publicación y "Ver completo" (así lo que se ve es lo que se publica).
function _estArmarImagen(d,base){
  var L=(d.datos&&Array.isArray(d.datos.cambios))?d.datos.cambios:[];
  var cortes=(d.datos&&Array.isArray(d.datos.recortes))?d.datos.recortes:[];
  if(!L.length&&!cortes.length)return Promise.reject(new Error('el diseño no tiene cambios'));
  // los logos de Promociones se bajan antes de dibujar
  var faltan=L.filter(function(e){return e.tipo!=='txt'&&e.img&&!_fgLgEsSubido(e.img)&&String(e.img).indexOf('orig:')!==0;}).map(function(e){return _fgLgTraer(e.img);});
  return Promise.all(faltan.concat([_estPrepararSubidos(d.datos.subidos)])).then(function(){
    if(document.fonts&&document.fonts.load)return Promise.all(['500','700'].map(function(p){return document.fonts.load(p+' 40px Figtree');})).catch(function(){});
  }).then(function(){
    var arte=cortes.length?_fgRecArte(base,cortes):base;
    var c=document.createElement('canvas');c.width=arte.naturalWidth||arte.width;c.height=arte.naturalHeight||arte.height;
    var g=c.getContext('2d');g.drawImage(arte,0,0);
    _fgLgPintar(g,1,L,arte,Infinity,0);
    return c;
  });
}
// "Ver completo": el flyer entero del diseño, en una ventana con desplazamiento.
function estVerCompleto(id){
  var d0=_estBuscar(id);if(!d0)return;
  var n=+d0.opcion;
  if(_FG_OPTS.indexOf(n)<0){showToast('El flyer base de este diseño ya no existe.');return;}
  showToast('Armando la vista completa…');
  var d;
  _estDatos(id).then(function(x){d=x;return _bucketJson(_activeFile(n));}).then(function(meta){
    if(!meta||!meta.imageUrl)throw new Error('el flyer base no tiene imagen');
    return new Promise(function(res,rej){var i=new Image();i.crossOrigin='anonymous';i.onload=function(){res(i);};i.onerror=function(){rej(new Error('no se pudo bajar la imagen del flyer base'));};i.src=meta.imageUrl;});
  }).then(function(base){return _estArmarImagen(d,base);}).then(function(c){
    var v=document.getElementById('fg-ver-ov');if(v)v.remove();
    var ov=document.createElement('div');ov.id='fg-ver-ov';ov.className='fg-cf-ov';
    ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','fg-ver-t');
    ov.innerHTML='<div class="fg-cf fg-ver"><div class="fg-lg-h"><div style="flex:1;min-width:0"><div class="fg-cf-t" id="fg-ver-t"></div>'+
      '<div class="fg-cf-b">As&iacute; queda el flyer de este dise&ntilde;o (sin los datos de la empresa ni los oficiales, que se cargan al armarlo).</div></div>'+
      '<button type="button" class="fg-lg-x" id="fg-ver-x" aria-label="Cerrar">&times;</button></div>'+
      '<div class="fg-ver-img" id="fg-ver-img"></div>'+
      '<div class="fg-cf-acts">'+(_admin&&d0.estado==='pedido'?'<button type="button" class="btn bgreen" id="fg-ver-apr">Aprobar y publicar</button>':'')+
      '<button type="button" class="btn bp" id="fg-ver-ok">Cerrar</button></div></div>';
    document.body.appendChild(ov);
    document.getElementById('fg-ver-t').textContent=d0.nombre;
    c.className='fg-ver-cv';document.getElementById('fg-ver-img').appendChild(c);
    function cerrar(){document.removeEventListener('keydown',tecla,true);ov.remove();}
    function tecla(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();}}
    document.addEventListener('keydown',tecla,true);
    document.getElementById('fg-ver-x').onclick=cerrar;document.getElementById('fg-ver-ok').onclick=cerrar;
    var ap=document.getElementById('fg-ver-apr');if(ap)ap.onclick=function(){cerrar();estAprobar(id);};
  }).catch(function(e){showToast('No se pudo armar la vista completa: '+_estErr(e));});
}
function _estPublicar(id,d0,n,nombre){
  // un doble clic o dos pestañas no publican dos veces
  if(_EST.publicando){showToast('Ya hay una publicación en curso. Esperá a que termine.');return;}
  _EST.publicando=true;
  showToast('Publicando «'+nombre+'»… no cierres la página.');
  // reservado: ya se subió NUESTRO _activeN.json; enLista: la opción ya figura en la
  // lista. Si algo falla entre una cosa y la otra, se borra lo que se alcanzó a
  // subir (si no, ese número queda ocupado para siempre sin opción).
  var d,meta,legal,base,n2,img,blob,ts=Date.now(),reservado=false,enLista=false,cortes=[],cfgN=null;
  _estDatos(id).then(function(x){d=x;
    if(d.estado!=='pedido')throw new Error('ese diseño ya no está pedido (lo cancelaron o ya se resolvió)');
    return Promise.all([_bucketJson(_activeFile(n)),_bucketJson(_legalFile(n)).catch(function(){return null;})]);
  }).then(function(r){
    meta=r[0];legal=r[1];
    if(!meta||!meta.imageUrl)throw new Error('el flyer base no tiene imagen');
    return new Promise(function(res,rej){var i=new Image();i.crossOrigin='anonymous';i.onload=function(){res(i);};i.onerror=function(){rej(new Error('no se pudo bajar la imagen del flyer base'));};i.src=meta.imageUrl;});
  }).then(function(i){
    base=i;
    cortes=(d.datos&&Array.isArray(d.datos.recortes))?d.datos.recortes:[];
    return _estArmarImagen(d,base);
  }).then(function(c){
    // con recortes: la calibración corrida (los logos del diseño están en las
    // coordenadas del flyer recortado)
    cfgN=cortes.length?_fgRecCfg(meta.cfg||{},cortes,base.naturalWidth,base.naturalHeight):(meta.cfg||{});
    if(cortes.length)cfgN.recDe=n; // el flyer del que salió: el aviso "tiene cashback" ofrece volver a ese
    return new Promise(function(res,rej){c.toBlob(function(b){b?res(b):rej(new Error('no se pudo armar la imagen'));},'image/jpeg',0.92);});
  }).then(function(b){
    blob=b;
    // Número nuevo con la lista FRESCA de la nube. Se RESERVA subiendo su
    // _activeN.json sin pisar (upsert:false): si ese número ya tiene archivo
    // (otra publicación al mismo tiempo, o una que quedó a medias) se prueba el
    // siguiente. Así nunca se reescribe el flyer de una opción que ya existe.
    // Nombres ARMADOS a mano: _activeFile/_legalFile pasan el número por _optN,
    // que con una opción que todavía no existe devuelve la 1 y la pisaría.
    return new Promise(function(res){loadOpciones(true,res);}).then(function(){
      var cand=Math.max.apply(null,_FG_OPTS.concat([0]))+1,intentos=0,cfg=cfgN||meta.cfg||{};
      function reservar(){
        n2=cand;img='flyer_'+ts+'_op'+n2+'.jpg';
        var act=JSON.stringify({name:img,imageUrl:FLYERS_PUBLIC+img+'?v='+ts,cfg:cfg,updated_at:new Date().toISOString()});
        return _sb.storage.from('flyers').upload('_active'+n2+'.json',new Blob([act],{type:'application/json'}),{contentType:'application/json',upsert:false}).then(function(r){
          if(r&&r.error){
            if(++intentos<6&&/exist|duplicate|409/i.test((r.error.message||'')+' '+(r.error.statusCode||'')+' '+(r.error.error||''))){cand++;return reservar();}
            throw r.error;
          }
          reservado=true;
        });
      }
      return reservar();
    });
  }).then(function(){
    // el legal del diseño (si se guardó con uno); si no, el de la opción original
    var dl=(d.datos&&typeof d.datos.legal==='string'&&d.datos.legal.trim())?d.datos.legal:null;
    var leg=JSON.stringify({text:dl!==null?dl:((legal&&typeof legal.text==='string')?legal.text:''),updated_at:new Date().toISOString()});
    return Promise.all([
      _sb.storage.from('flyers').upload(img,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'}),
      _sb.storage.from('flyers').upload('_legal'+n2+'.json',new Blob([leg],{type:'application/json'}),{contentType:'application/json',upsert:true}),
      new Promise(function(res){_saveFlyerCfg(img,cfgN||meta.cfg||{},function(){res();});})
    ]);
  }).then(function(rs){
    rs.slice(0,2).forEach(function(r){if(r&&r.error)throw r.error;});
    // Último control antes de crear la opción: si el autor canceló el pedido (u
    // otro admin lo resolvió) mientras se armaba la imagen, no se crea nada.
    return _sb.from('flyer_disenos').select('estado').eq('id',id).single().then(function(r){
      if(r.error)throw r.error;
      if(r.data.estado!=='pedido'){var e=new Error('el pedido se canceló o ya se resolvió mientras se publicaba; no se creó el flyer');e.nada=true;throw e;}
    });
  }).then(function(){
    // La lista de opciones vive en un archivo: se vuelve a leer justo antes de
    // guardarla (para no borrar una creada mientras tanto) y, después, se
    // comprueba que la nueva haya quedado; si otro guardado la pisó, se agrega
    // de nuevo (un intento).
    // La opción nueva va justo después de la original, en su misma solapa; fuera
    // del ruteo por rubro (si no, le "ganaría" a la original en las empresas del padrón).
    function guardarLista(intento){
      return new Promise(function(res){loadOpciones(true,res);}).then(function(){
        if(_OPC[n2])return; // ya está
        var lista=[],k=0;
        _FG_OPTS.forEach(function(o){
          lista.push(Object.assign({},_OPC[o],{orden:k++}));
          if(o===n){
            var nueva={n:n2,nombre:nombre,color:'',solapa:_optSolapa(n),orden:k++,reemplaza:0,rubro:'ninguno'};
            // nació sin importes (recortes de Estudio): es la versión "sin cashback" de la original
            if(cortes.length&&cfgN&&((cfgN.montos&&cfgN.montos.off)||(cfgN.cashback&&cfgN.cashback.off)))nueva.sinCB=_fgOptBase(n);
            lista.push(nueva);
          }
        });
        return new Promise(function(res,rej){saveOpciones(lista,function(ok){ok?res():rej(new Error('no se pudo guardar la opción nueva'));});})
          .then(function(){return new Promise(function(res){loadOpciones(true,res);});})
          .then(function(){if(!_OPC[n2]){if(intento<2)return guardarLista(intento+1);throw new Error('la opción nueva no quedó guardada');}});
      });
    }
    return guardarLista(1).then(function(){enLista=true;
      // marcas vigiladas: los logos de Promociones del diseño pasan a la opción nueva
      return _vigSumarEstudio(n,n2,(d.datos&&d.datos.cambios)||[]).catch(function(e){console.warn('vigiladas:',e);});
    });
  }).then(function(){
    // la ven los mismos perfiles que veían la original (sobre las facultades
    // recién leídas, no las que quedaron en memoria al entrar)
    return new Promise(function(res){loadFacultades(true,res);}).then(function(){
      var roles=JSON.parse(JSON.stringify(_FAC||{}));
      Object.keys(roles).forEach(function(r){roles[r]['opcion_'+n2]=!!roles[r]['opcion_'+n];});
      return new Promise(function(res){saveFacultades(roles,function(ok){res(ok);});});
    });
  }).then(function(okFac){
    return _estCambiar(id,{estado:'publicado',opcion_publicada:n2,nota_admin:''},null,['pedido']).then(function(fila){
      _facSyncOptBar();_fgRenderOptBar();if(typeof _applyFacultades==='function')_applyFacultades();
      if(!fila){showToast('Se creó el flyer «'+nombre+'» (opción '+n2+'), pero el diseño no quedó marcado como publicado. No lo vuelvas a aprobar: si sobra, borralo desde Config → Opciones.');return;}
      showToast('Publicado: «'+nombre+'» ya está al lado de «'+_optLabel(n)+'».'+(okFac?'':' Revisá en Facultades quién lo ve.'));
    });
  }).catch(function(e){
    console.error('estudio aprobar:',e);
    // la opción no llegó a la lista: se borran los archivos que se alcanzaron a subir
    if(reservado&&!enLista)_sb.storage.from('flyers').remove(['_active'+n2+'.json','_legal'+n2+'.json',img]).catch(function(){});
    showToast('No se pudo publicar: '+_estErr(e)+(enLista&&!(e&&e.nada)?' (la opción '+n2+' quedó creada a medias: revisá Config → Opciones)':''));
    if(e&&e.nada){_EST.lista=null;_estCargar();}
  }).then(function(){_EST.publicando=false;});
}

// ── ARRANQUE de todo lo de arriba (lo llama initApp, después de armar el formulario) ──
function _fgUxInit(){
  try{_fgValInit();}catch(e){console.warn('val:',e);}
  try{_fgLegalInit();}catch(e){console.warn('legal:',e);}
  try{_fgKbdInit();}catch(e){console.warn('kbd:',e);}
  try{_fgShareInit();}catch(e){console.warn('share:',e);}
  try{_fgWorkInit();}catch(e){console.warn('work:',e);}
  try{_fgTipInit();}catch(e){console.warn('tip:',e);}
  try{_fgDockInit();}catch(e){console.warn('dock:',e);}
  try{_fgMZInit();}catch(e){console.warn('zoom vista previa:',e);}
  try{_fgLgInit();}catch(e){console.warn('cambiar logos:',e);}
}

// ══ PERFIL HUNTER — buscar una empresa y bajar SU flyer ══════════════════════
// El Hunter no arma nada: escribe el nombre de una empresa que algún oficial ya
// cargó y se baja el PDF que le corresponde, con los oficiales, el cashback, los
// topes y el legal que van con ESE flyer. Todo esto REUSA el motor del generador
// masivo (_pgVals → fullRes): no hay un segundo armador.
//
// Lo que NO hace, a propósito:
//   · no pasa por fgSavePDF/fgSavePNG: ésas leen #filename y disparan
//     _padAfterFlyer, que ofrece dar de alta o actualizar la empresa — justo lo
//     que un Hunter no puede hacer;
//   · no toca el formulario del armador (fullRes no lee inputs, ver fgDrawAll);
//   · no escribe NADA en la base, salvo el registro de la descarga en flyer_logs.
// Quién ve qué lo hace cumplir la RLS (migración 011_rol_hunter.sql), no esta
// pantalla: el candado de la interfaz está en _can (ver _esHunter).
var _HUN_MAX=40;      // filas listadas por búsqueda
var _HUN_PAGINA=1000; // PostgREST corta en 1000 filas: sin paginar faltarían empresas
var _HUN_TOPE_DEF='$24.000'; // tope de reintegro del template, si la empresa no trae uno
var _hunRows=null,_hunHits=[],_hunSel=-1,_hunV=null,_hunCv=null,_hunFn='',_hunBusy=false,_hunCargando=false;
// Zoom/paneo de la vista previa (sobre un <img>, no el canvas del armador: ver
// el bloque "ZOOM Y PANEO" más abajo). Descarga múltiple: selección por índice
// estable de fila (ver "_hi" en _hunCargar).
var _hunZoom=1,_HUN_ZOOM_MAX=3,_hunMultiOn=false,_hunMultiSel={};

// ── QUÉ FLYER LE TOCA A CADA EMPRESA ────────────────────────────────────────
// Reglas acordadas con el usuario el 2026-10-08, después de que el Hunter sacara
// "el flyer viejo y todo descentrado":
//   · sólo entran las opciones HABILITADAS para el perfil (Facultades) y que
//     TENGAN flyer cargado. Una opción sin imagen (acá: "VIEJO FLYER", "Sin
//     cashback", "VIEJO ComB") no es un flyer: si se la elige, el motor se queda
//     con la imagen que hubiera —o la de ejemplo del template— y encima le aplica
//     las coordenadas de la opción nueva. De ahí salían los flyers descentrados.
//   · entre las que compiten, la VIGENTE: la que ninguna otra candidata reemplaza
//     y, a igualdad, la de NÚMERO más alto. Las opciones se crean con número
//     creciente, así que la más nueva gana; el "orden" de la barra es de
//     presentación y el admin lo reacomoda, por eso no sirve de señal de recencia.
//   · si no queda ninguna, el flyer NO se arma. Antes caía en la Opción 1 a
//     ciegas; ahora la fila dice por qué y el botón queda apagado.
// Códigos negativos = no se puede armar, y cada uno tiene su motivo en _hunAvisos.
var _HUN_SIN_GENERICO=0, _HUN_RUBRO_NO_HABIL=-1, _HUN_RUBRO_RARO=-2;
var _hunMeta={},_hunMetaOk=false; // nº de opción -> ¿tiene flyer cargado?

// ¿Tiene flyer cargado esa opción? (lo dice el _active{N}.json del bucket)
function _hunMetasCargar(cb){
  var opts=(typeof _facOpts==='function')?_facOpts():[];
  var falta=opts.filter(function(n){return !(n in _hunMeta);});
  if(!falta.length){_hunMetaOk=true;if(cb)cb();return;}
  var pend=falta.length;
  falta.forEach(function(n){
    _fetchActiveMeta(n,function(d){
      _hunMeta[n]=!!(d&&d.imageUrl);
      if(!--pend){_hunMetaOk=true;if(cb)cb();}
    });
  });
}
function _hunUsable(n){
  n=_optN(n);
  return _FG_OPTS.indexOf(n)>=0&&_can('opcion_'+n)&&_hunMeta[n]===true;
}
// La vigente entre varias candidatas: el mismo criterio que usa el generador
// desde la base de datos (ver _optVigenteEntre).
function _hunVigente(cand){return _optVigenteEntre(cand);}
function _hunOptDe(r){
  var ru=_padRubroSane(r&&r.rubro);
  var tipo=_padRubroTipoDe(ru);
  if(tipo){
    var cr=_padRubroOpts().filter(function(o){return _optRubroTipo(o)===tipo&&_hunUsable(o);});
    return cr.length?_hunVigente(cr):_HUN_RUBRO_NO_HABIL;
  }
  // Tiene rubro guardado pero no se puede deducir de qué rubro es (la opción que
  // tenía ya no existe y la columna del Excel no lo dice). No se adivina con el
  // genérico: mandar el flyer equivocado es peor que no mandar ninguno.
  if(ru.opcion)return _HUN_RUBRO_RARO;
  var cg=_facOptsDe('flyer').filter(_hunUsable);
  return cg.length?_hunVigente(cg):_HUN_SIN_GENERICO;
}
function _hunFlyerLbl(opt){
  if(opt>0){
    var sl=_solapaLabel(_optSolapa(opt)),ol=_optLabel(opt);
    return sl===ol?sl:sl+' · '+ol; // "Flyer · Flyer" no aporta nada
  }
  if(opt===_HUN_RUBRO_NO_HABIL)return 'sin flyer para su rubro';
  if(opt===_HUN_RUBRO_RARO)return 'rubro sin identificar';
  return 'sin flyer habilitado';
}
function _hunAvisos(r,opt){
  var a=[];
  if(opt===_HUN_RUBRO_NO_HABIL)a.push('el flyer del rubro de esta empresa no está habilitado para tu perfil o todavía no está cargado');
  else if(opt===_HUN_RUBRO_RARO)a.push('no se puede saber de qué rubro es: hay que revisarla en la base de datos');
  else if(opt<=0)a.push('no hay ningún flyer habilitado para tu perfil');
  if(opt>0){
    if(!_padNumAsesores(r))a.push('el flyer sale sin datos de contacto');
    if(_padCfgOf(r.config)<0)a.push('sin cashback: sale sin importes');
    if(_optSolapa(opt)==='rubros'&&!_padRubroSane(r.rubro).importe)a.push('sin tope cargado: sale '+_HUN_TOPE_DEF);
  }
  return a;
}

// Se llama en cada switchApp('hunter'); los listeners se ponen una sola vez.
function _hunInit(){
  var q=document.getElementById('hun-q');
  if(q&&!q.dataset.hunOk){
    q.dataset.hunOk='1';
    q.addEventListener('input',_hunRender);
    q.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&_hunHits.length){e.preventDefault();_hunElegir(0);return;}
      if(e.key==='Escape'){q.value='';_hunRender();}
    });
  }
  _hunPrevInitGestos();
  _hunMetasCargar(_hunRender);
  if(_can('proponer_oficiales'))_hunPropCargarMias(_hunRender);
  _hunCargar(false,function(){if(q&&!_hunCargando){try{q.focus();}catch(e){}}});
}

// Todas las empresas que la RLS deja ver (para un Hunter: las de todos los
// oficiales). Sin .eq('user_id') a propósito — el filtro lo hace el servidor.
function _hunCargar(force,cb){
  if(_hunRows&&!force){if(cb)cb(_hunRows);return;}
  if(!_me){_hunRows=[];_hunRender();if(cb)cb(_hunRows);return;}
  if(_hunCargando){if(cb)cb(null);return;}
  _hunCargando=true;_hunRender();
  _hunTraerTodo(0,[],function(err,filas){
    _hunCargando=false;
    if(err){
      _hunRows=_hunRows||[];
      var est=document.getElementById('hun-estado');
      if(est)est.textContent='No se pudieron cargar las empresas: '+((err&&err.message)||err);
      if(cb)cb(_hunRows);return;
    }
    _hunRows=_padSane(filas);
    // El orden lo pone el cliente: el de la base es por id (hace falta una clave
    // única para paginar sin repetir ni saltear filas) y dos oficiales pueden
    // tener cargada la misma razón social.
    // Collator: compara igual que localeCompare (mismo idioma y opciones por
    // defecto) pero sin rearmar el comparador en cada una de las miles de
    // comparaciones del orden.
    var _col=(typeof Intl!=='undefined'&&Intl.Collator)?new Intl.Collator():null;
    _hunRows.sort(function(a,b){var x=_padNorm(a.empresa),y=_padNorm(b.empresa);return _col?_col.compare(x,y):x.localeCompare(y);});
    // Índice ESTABLE por fila (para la descarga múltiple: la selección sobrevive
    // a que la lista se filtre al tipear, porque _hunHits son las mismas
    // referencias que _hunRows, no copias).
    _hunRows.forEach(function(r,i){r._hi=i;});
    _hunSel=-1;_hunMultiSel={};
    _hunRender();
    if(cb)cb(_hunRows);
  });
}
function _hunTraerTodo(desde,acc,cb){
  // ',user_id': quién es el dueño — lo necesita la propuesta de cambio de
  // oficiales (padron_propuesta_crear exige el dueño) y la tarjeta "pendiente
  // de aprobación" (compara contra _hunPropMias). Por tandas: ver _sbTodo.
  _sbTodo(function(d,h){
    return _sb.from(_PADRON_TABLE).select(_PADRON_COLS+',id,user_id').order('id',{ascending:true}).range(d,h);
  },cb,_HUN_PAGINA,desde,acc);
}

// Los oficiales POR NOMBRE: es lo que distingue dos cargas de la misma empresa
// (el nombre de quien la cargó no se puede mostrar: la RLS no le deja leer los
// perfiles de los demás) y además es lo que va impreso en el flyer.
function _hunOficiales(r){
  var ns=[];
  ((r&&r.asesores)||[]).forEach(function(a){var n=((a&&a.nombre)||'').trim();if(n)ns.push(n);});
  return ns.length?ns.join('  ·  '):'sin oficiales asignados';
}
function _hunRender(){
  var list=document.getElementById('hun-list'),est=document.getElementById('hun-estado');
  if(!list)return;
  if(_hunCargando||!_hunMetaOk){if(est)est.textContent='Buscando las empresas cargadas…';list.innerHTML='';return;}
  var q=(document.getElementById('hun-q')||{}).value||'';
  var total=(_hunRows||[]).length;
  if(!total){
    if(est)est.textContent='';
    list.innerHTML='<div class="hun-nada">Todav&iacute;a no hay ninguna empresa cargada.</div>';
    return;
  }
  _hunHits=padronSearch(q,_HUN_MAX,_hunRows);
  if(!_hunHits.length){
    if(est)est.textContent='';
    list.innerHTML='<div class="hun-nada"><strong>No figura.</strong><br>Ninguna de las '+total+
      ' empresas cargadas coincide con &laquo;'+_escHtml(q.trim())+'&raquo;. Si corresponde, pedile al oficial que la cargue.</div>';
    return;
  }
  var n=_hunHits.length;
  if(est)est.textContent=q.trim()
    ? (n+' de '+total+(n>=_HUN_MAX?' — se muestran las primeras '+_HUN_MAX:''))
    : (total+(total===1?' empresa cargada':' empresas cargadas')+(total>_HUN_MAX?' — se muestran las primeras '+_HUN_MAX+', escribí para filtrar':''));
  // En el onclick va SÓLO el índice, nunca texto de otro usuario (el navegador
  // decodifica las entidades antes de ejecutar el JS: escapar ahí no alcanza).
  list.innerHTML=_hunHits.map(function(r,i){
    var opt=_hunOptDe(r),av=_hunAvisos(r,opt),puede=opt>0;
    // Modo descarga múltiple: casilla por fila (sólo tildable si se puede armar),
    // el click en la fila sigue abriendo la vista previa como siempre.
    var chk=_hunMultiOn?('<label class="hun-chk-wrap" onclick="event.stopPropagation()">'+
      '<input type="checkbox" class="hun-chk"'+(puede?'':' disabled')+
      (_hunMultiSel[r._hi]?' checked':'')+' onchange="_hunMultiChk('+r._hi+',this.checked)"></label>'):'';
    // ✎ Oficiales: sólo con la facultad, y no si YA hay una propuesta tuya
    // pendiente (padron_propuesta_crear la rechazaría igual, mejor avisarlo
    // antes de abrir el modal). Pendiente propia: tarjeta en vez de botón.
    var propBtn='',propTag='';
    if(_can('proponer_oficiales')){
      if(_hunPropPendiente(r)){
        var _pe=_hunPropEstado(r);
        propTag=(_pe==='consulta')
          ?'<div class="hun-prop-tag hun-prop-consulta">El oficial te hizo una consulta &middot; tu nombre &rarr; Mis propuestas</div>'
          :'<div class="hun-prop-tag">Propusiste un cambio: pendiente de aprobaci&oacute;n</div>';
      }
      else propBtn='<button type="button" class="hun-prop-btn" onclick="event.stopPropagation();_hunAbrirPropuesta('+i+')">&#9998; Oficiales</button>';
    }
    // La casilla va como flex-item propio al lado del cuerpo (no mezclada con
    // empresa/subtítulo/oficiales/tag, que siguen apiladas verticalmente): sin
    // este envoltorio, volver .hun-row flex habría puesto esas líneas en fila.
    return '<div class="hun-row'+(i===_hunSel?' sel':'')+(puede?'':' hun-no')+'" onclick="_hunElegir('+i+')">'+
      chk+
      '<div class="hun-row-body">'+
        '<div class="hun-emp">'+_escHtml(r.empresa||'(sin nombre)')+'</div>'+
        '<div class="hun-sub">'+_escHtml(_padSubtitulo(r))+'</div>'+
        (((r&&r.asesores)||[]).some(function(a){return a&&(a.nombre||'').trim();})?'<div class="hun-of">'+_escHtml(_hunOficiales(r))+'</div>':'')+
        '<div class="hun-tag">'+_escHtml(_hunFlyerLbl(opt))+'</div>'+
        (av.length?'<div class="hun-av">'+_escHtml(av.join('  ·  '))+'</div>':'')+
        propTag+propBtn+
      '</div>'+
    '</div>';
  }).join('');
  _hunMultiBarSync();
}

// Carga la opción y recién devuelve el cache cuando está aplicada. No usa
// _fgWithOpt a propósito: ése, si la opción pedida ya es la activa, llama al
// callback sin cargar nada — y al entrar la activa es la 1, que acá no tiene
// flyer. Así el cache queda siempre poblado y se puede verificar.
// ── ZOOM Y PANEO (sobre un <img>, no sobre el canvas del armador) ───────────
// No reusa zoomIn/zoomOut/calcSC del armador: esas funciones son globales
// acopladas a SC+redraw() y redibujarían el canvas oculto del armador, y
// #zoom-pct es un id único que se pisaría con el de esta pantalla. Sí se copia
// la matemática del anclaje al cursor (acumular pasos → requestAnimationFrame →
// fracción del rect → corregir scrollLeft/scrollTop con el rect nuevo): es
// agnóstica del canvas, sólo necesita un contenedor con scroll.
function _hunPrevEl(){return document.querySelector('.hun-prev');}
function _hunImgEl(){return document.getElementById('hun-img');}
// Ancho "a 100%": el de la imagen o el que entra en el contenedor, el que sea
// menor (mismo criterio que calcSC, sin el tope de 0.55 — acá no hay costo de
// redibujar: es una imagen ya hecha).
function _hunBaseWidth(){
  var img=_hunImgEl(),p=_hunPrevEl();
  if(!img||!img.naturalWidth||!p)return 0;
  var pw=Math.max(p.clientWidth-40,200);
  return Math.min(img.naturalWidth,pw);
}
function _hunUpdateZoomPct(){var el=document.getElementById('hun-zoom-pct');if(el)el.textContent=Math.round(_hunZoom*100)+'%';}
function _hunZoomAplicar(){
  var img=_hunImgEl();if(!img)return;
  if(_hunZoom===1||!img.naturalWidth){img.style.width='';img.style.maxWidth='';}
  else{img.style.maxWidth='none';img.style.width=Math.round(_hunBaseWidth()*_hunZoom)+'px';}
  _hunUpdateZoomPct();
}
function _hunZoomIn(){_hunZoom=Math.min(_hunZoom*1.25,_HUN_ZOOM_MAX);_hunZoomAplicar();}
function _hunZoomOut(){_hunZoom=Math.max(_hunZoom/1.25,0.2);_hunZoomAplicar();}
function _hunZoomReset(){_hunZoom=1;_hunZoomAplicar();}
var _hunResizeT=null;
window.addEventListener('resize',function(){clearTimeout(_hunResizeT);_hunResizeT=setTimeout(function(){if(_hunZoom!==1)_hunZoomAplicar();},150);});
// Rueda anclada al cursor + paneo con drag. Se instala una sola vez (idempotente
// vía dataset), igual que el del armador (auth.js, dentro de initApp()).
// La primera vez que alguien usa la rueda sola sobre una vista previa que no
// tiene nada para recorrer (o sea, probablemente quería acercar), un aviso de
// una línea. Una sola vez por navegador.
function _zoomTip(el){
  if(el&&el.scrollHeight>el.clientHeight+2)return; // estaba recorriendo: no molestar
  try{if(localStorage.getItem('fg_tip_zoom'))return;localStorage.setItem('fg_tip_zoom','1');}catch(e){return;}
  showToast('Para acercar el flyer: Ctrl + ruedita (o pellizcá en el touchpad). También con + y −.');
}
function _hunPrevInitGestos(){
  var prevEl=_hunPrevEl();if(!prevEl||prevEl.dataset.hunGestOk)return;prevEl.dataset.hunGestOk='1';
  var _pwPend=null,_pwPasos=0,_pwX=0,_pwY=0;
  prevEl.addEventListener('wheel',function(e){
    var img=_hunImgEl();if(!img||!img.naturalWidth)return;
    if(!(e.ctrlKey||e.metaKey)){_zoomTip(prevEl);return;} // igual que el armador
    e.preventDefault();
    _pwPasos+=(e.deltaY<0?1:-1);_pwX=e.clientX;_pwY=e.clientY;
    if(_pwPend)return;
    _pwPend=requestAnimationFrame(function(){
      _pwPend=null;
      var pasos=_pwPasos;_pwPasos=0;if(!pasos)return;
      var rBefore=img.getBoundingClientRect();
      var fx=Math.min(Math.max((_pwX-rBefore.left)/rBefore.width,0),1);
      var fy=Math.min(Math.max((_pwY-rBefore.top)/rBefore.height,0),1);
      var z0=_hunZoom;
      for(var i=0;i<Math.abs(pasos);i++)_hunZoom=pasos>0?Math.min(_hunZoom*1.25,_HUN_ZOOM_MAX):Math.max(_hunZoom/1.25,0.2);
      if(_hunZoom===z0)return;
      _hunZoomAplicar();
      var rAfter=img.getBoundingClientRect();
      prevEl.scrollLeft+=(rAfter.left+fx*rAfter.width)-_pwX;
      prevEl.scrollTop+=(rAfter.top+fy*rAfter.height)-_pwY;
    });
  },{passive:false});
  var _pd=false,_px,_py,_psx,_psy;
  prevEl.addEventListener('mousedown',function(e){
    if(e.button!==0||e.target.closest('.hun-head')||e.target.tagName==='BUTTON'||e.target.tagName==='A')return;
    _pd=true;_px=e.clientX;_py=e.clientY;_psx=prevEl.scrollLeft;_psy=prevEl.scrollTop;
    prevEl.classList.add('panning');e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){if(!_pd)return;prevEl.scrollLeft=_psx-(e.clientX-_px);prevEl.scrollTop=_psy-(e.clientY-_py);});
  document.addEventListener('mouseup',function(){if(_pd){_pd=false;prevEl.classList.remove('panning');}});
  document.addEventListener('mouseleave',function(){if(_pd){_pd=false;prevEl.classList.remove('panning');}});
}

// ── MENÚ "OTROS": Beneficios Haberes, Instructivo, Descarga múltiple ───────
// A diferencia del "Otros" del armador (que nunca se cierra solo), éste SÍ se
// cierra al tocar afuera, con el mismo patrón que el menú del nombre
// (toggleUserMenu/_closeUserMenuOutside): el setTimeout(...,0) es necesario,
// sin él el mismo click que abre el menú lo cierra en el acto.
function _hunOtrosEls(){return {tg:document.querySelector('#hun-otros .fg-otros-tg'),menu:document.getElementById('hun-otros-menu')};}
function _hunToggleOtros(force){
  var e=_hunOtrosEls();if(!e.tg||!e.menu)return;
  var abrir=(force===undefined)?e.menu.hidden:!!force;
  e.menu.hidden=!abrir;e.tg.setAttribute('aria-expanded',abrir?'true':'false');
  if(abrir)setTimeout(function(){document.addEventListener('click',_hunOtrosOutside);},0);
  else document.removeEventListener('click',_hunOtrosOutside);
}
function _hunOtrosOutside(e){var m=document.getElementById('hun-otros-menu');if(m&&!m.hidden&&e.target&&!e.target.closest('#hun-otros'))_hunToggleOtros(false);}
function _hunOtrosOpen(){_hunToggleOtros(true);}
function _hunOtrosClose(){_hunToggleOtros(false);}

// ── DESCARGA MÚLTIPLE: buscar, tildar varias y bajarlas en un ZIP ──────────
// Reusa el motor del generador masivo (_pgGenerarRows) con un resolutor PROPIO
// (_hunOptDe), no el del dueño del padrón: es el que garantiza que sólo entren
// opciones habilitadas y con flyer realmente cargado (ver el bloque de arriba),
// así no reaparece el problema del flyer viejo con este camino alternativo.
function _hunMultiToggle(){
  _hunOtrosClose();
  _hunMultiOn=!_hunMultiOn;
  if(!_hunMultiOn)_hunMultiSel={};
  _hunRender();
}
function _hunMultiChk(hi,on){
  if(on)_hunMultiSel[hi]=1;else delete _hunMultiSel[hi];
  _hunMultiBarSync();
}
function _hunMultiCount(){return Object.keys(_hunMultiSel).length;}
function _hunMultiTildarVisibles(on){
  _hunHits.forEach(function(r){
    if(_hunOptDe(r)<=0)return; // no se puede armar: no se tilda
    if(on)_hunMultiSel[r._hi]=1;else delete _hunMultiSel[r._hi];
  });
  _hunRender();
}
function _hunMultiBarSync(){
  var bar=document.getElementById('hun-multi-bar');if(!bar)return;
  bar.style.display=_hunMultiOn?'flex':'none';
  var n=_hunMultiCount();
  var txt=document.getElementById('hun-multi-count');if(txt)txt.textContent=n+(n===1?' empresa tildada':' empresas tildadas');
  var dl=document.getElementById('hun-multi-dl');
  if(dl){dl.disabled=!n;dl.textContent=n?('Descargar ZIP ('+n+')'):'Descargar ZIP';}
  _hunMultiSelRender();
}
// Las empresas tildadas, ARRIBA y siempre a la vista (aunque el buscador esté
// mostrando otras), para revisar qué se va a bajar antes de dar el OK. La
// selección vive en _hunMultiSel por índice estable (_hi); acá se arma desde
// _hunRows, no desde lo filtrado.
function _hunMultiSelRender(){
  var box=document.getElementById('hun-multi-sel');if(!box)return;
  var sel=(_hunRows||[]).filter(function(r){return _hunMultiSel[r._hi];});
  if(!_hunMultiOn||!sel.length){box.style.display='none';box.innerHTML='';return;}
  box.style.display='block';
  // En el onclick va sólo el índice estable.
  box.innerHTML='<div class="hun-sel-h">Seleccionadas ('+sel.length+')</div>'+
    sel.map(function(r){
      var opt=_hunOptDe(r);
      return '<div class="hun-sel-row"><div class="hun-sel-b"><span class="hun-sel-e">'+_escHtml(r.empresa||'(sin nombre)')+'</span>'+
        '<span class="hun-sel-d">'+_escHtml(_hunFlyerLbl(opt))+' &middot; '+_escHtml(_hunOficiales(r))+'</span></div>'+
        '<button type="button" class="hun-sel-x" title="Quitar de la selecci&oacute;n" aria-label="Quitar" onclick="_hunMultiQuitar('+r._hi+')">&#10005;</button></div>';
    }).join('');
}
function _hunMultiQuitar(hi){delete _hunMultiSel[hi];_hunRender();}
function _hunMultiCancelar(){_hunMultiOn=false;_hunMultiSel={};_hunRender();}
function _hunMultiBajar(){
  var n=_hunMultiCount();if(!n)return;
  var rows=[];(_hunRows||[]).forEach(function(r){if(_hunMultiSel[r._hi])rows.push(r);});
  _pgGenerarRows(rows,'pdf',{prog:'hun-multi-prog',fill:'hun-multi-fill',txt:'hun-multi-txt',btn:'hun-multi-dl'},'Flyers_Empresas',_hunOptDe);
}

function _hunConOpt(opt,cb){
  opt=_optN(opt);
  var c=_fgOptCache[opt];
  if(c&&c.loaded&&_optN(_fgOpt)===opt){cb(c);return;}
  switchFlyerOption(opt,function(){cb(_fgOptCache[_optN(opt)]);});
}
// Arma el flyer de esa fila y lo muestra. Un flyer a la vez: fgDrawAll escribe
// los globales _fgExtra / _fgContentBottomBase que después lee _fgFinalHeightBase.
function _hunElegir(i){
  if(_hunBusy)return;
  var r=_hunHits[i];if(!r)return;
  _hunSel=i;_hunRender();
  var dl=document.getElementById('hun-dl'),img=document.getElementById('hun-img'),vac=document.getElementById('hun-vacio');
  _hunV=null;_hunCv=null;_hunFn='';
  if(dl)dl.disabled=true;
  if(img)img.style.display='none';
  var opt=_hunOptDe(r);
  var frenar=function(titulo,detalle){
    if(img)img.style.display='none';
    if(vac){vac.style.display='';vac.innerHTML='<strong>'+titulo+'</strong>'+(detalle?'<br>'+_escHtml(detalle):'');}
    _hunBusy=false;
  };
  if(opt<=0){frenar('No hay flyer para esta empresa.',_hunAvisos(r,opt).join('  ·  '));return;}
  if(vac){vac.style.display='';vac.textContent='Armando el flyer…';}
  _hunBusy=true;
  _hunConOpt(opt,function(c){
    // Si la opción no trajo imagen propia, NO se dibuja: el motor se habría
    // quedado con la imagen anterior y las coordenadas de ésta (flyer viejo,
    // todo descentrado). Es la red de seguridad del criterio de _hunOptDe.
    if(!c||!c.img||!c.imageUrl){
      _hunMeta[opt]=false; // no volver a ofrecerla en esta sesión
      _hunRender();
      frenar('Ese flyer todavía no está cargado.','«'+_optLabel(opt)+'» no tiene ningún flyer subido: avisale al administrador.');
      return;
    }
    try{
      // El legal lo acaba de aplicar la opción (_fgApplyOption corre antes que
      // este callback), así que el textarea ya tiene el de ESTE flyer.
      var legal=(document.getElementById('legal-text')||{}).value||'';
      var v=_pgVals(r,opt,legal,_HUN_TOPE_DEF,{sinCB:[],sinOf:[],sinTope:[]});
      var fc=fullRes(v);
      _hunV=v;_hunCv=fc;_hunFn='Flyer '+_fgSafeName(v.empresa||'empresa');
      // Nueva empresa: arranca otra vez al 100% (y recién ahí se reaplica, una
      // vez que el navegador terminó de medir la imagen nueva).
      _hunZoom=1;
      if(img){img.onload=_hunZoomAplicar;img.src=fc.toDataURL('image/jpeg',0.9);img.style.display='';}
      if(vac)vac.style.display='none';
      if(dl)dl.disabled=false;
    }catch(e){
      frenar('No se pudo armar el flyer.',(e&&e.message)||String(e));
      console.error('hunter:',e);
      return;
    }
    _hunBusy=false;
  });
}
// Descarga. jsPDF se trae bajo demanda (_libWrap en _libInit).
function _hunBajar(){
  if(!_hunCv||!_hunV){showToast('Elegí una empresa de la lista.');return;}
  var fn=_hunFn||'Flyer',f;
  try{f=_fgPdfFile(_hunCv,fn);}catch(e){showToast('No se pudo armar el PDF: '+((e&&e.message)||e));return;}
  var url=URL.createObjectURL(f),a=document.createElement('a');
  a.download=fn+'.pdf';a.href=url;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);if(a.parentNode)a.parentNode.removeChild(a);},1500);
  logFlyerToSupabase(_hunV,fn,'pdf'); // queda en Registros, como cualquier descarga
  showToast('Flyer descargado');
}

// ══ FIN PERFIL HUNTER (búsqueda y descarga) — lo de abajo SÍ escribe en la base ══

// ══ PROPUESTAS DE CAMBIO DE OFICIALES ═════════════════════════════════════
// El Hunter ve un oficial desactualizado y PROPONE arreglarlo: sólo oficiales
// (nombre/celular/mail), nunca cashback, rubro, CUIT o razón social. El
// cambio no impacta nada hasta que lo apruebe el OFICIAL DUEÑO de esa
// empresa, o la persona que ese oficial puso como suplente (por vacaciones).
// Mientras está abierta, el flyer sigue saliendo con los datos de hoy — ver
// _hunOptDe/_pgVals más arriba, que no miran esto para nada.
//
// Conversación (migración 013): el dueño puede REPREGUNTAR (la propuesta pasa
// a "consulta") y el hunter responde y, si hace falta, corrige los oficiales
// (vuelve a "pendiente"). Al aprobar o rechazar se puede dejar un comentario.
// Todo queda en un hilo (padron_propuesta_mensajes) que ven los dos lados.
//
// Todo lo que escribe pasa por funciones security definer de la base
// (padron_propuesta_crear / _consultar / _responder / _aprobar / _rechazar):
// seguridad real, no cosmética. Esta sección SÍ escribe —por eso vive después
// de la marca de arriba, afuera de lo que el build verifica como "la pantalla
// de buscar y bajar no toca la base".

var _PROP_ESTADO={pendiente:'Pendiente de aprobación',consulta:'El oficial te hizo una consulta',
  aprobada:'Aprobado',rechazada:'Rechazado'};
var _PROP_TIPO={nota:'Nota',consulta:'Consulta',respuesta:'Respuesta',aprobacion:'Aprobó',rechazo:'Rechazó'};
// Hilos por propuesta: {id: [mensajes]}. Se cargan junto con las propuestas.
var _propHilos={};
function _propCargarHilos(ids,cb){
  if(!ids||!ids.length){if(cb)cb();return;}
  _sb.from('padron_propuesta_mensajes').select('*').in('propuesta_id',ids).order('created_at',{ascending:true})
    .then(function(r){
      ((r&&r.data)||[]).forEach(function(m){(_propHilos[m.propuesta_id]=_propHilos[m.propuesta_id]||[]).push(m);});
      if(cb)cb();
    }).catch(function(){if(cb)cb();});
}
function _propHiloReset(ids){(ids||[]).forEach(function(id){delete _propHilos[id];});}
function _propHiloHtml(id){
  var ms=(_propHilos[id]||[]).filter(function(m){return (m.texto||'').trim();});
  if(!ms.length)return '';
  return '<div class="prop-hilo">'+ms.map(function(m){
    var lado=m.rol==='hunter'?'hun':'ofi';
    return '<div class="prop-msg prop-msg-'+lado+'">'+
      '<div class="prop-msg-h"><strong>'+_escHtml(m.autor_nombre||(m.rol==='hunter'?'Hunter':'Oficial'))+'</strong>'+
        ' &middot; '+_escHtml(_PROP_TIPO[m.tipo]||'')+' &middot; '+_escHtml(_fmtDate(m.created_at))+'</div>'+
      '<div class="prop-msg-t">'+_escHtml(m.texto)+'</div></div>';
  }).join('')+'</div>';
}
function _propDiffHtml(antes,despues){
  var diff=_plogAsesorDiff(antes||[],despues||[]);
  if(!diff.length)return '<div class="pu-hint">Sin cambios en los oficiales.</div>';
  return '<ul class="prop-diff">'+diff.map(function(d){return '<li><b>'+_escHtml(d[0])+':</b> '+_escHtml(d[1])+'</li>';}).join('')+'</ul>';
}
function _propChip(estado){return '<span class="prop-chip prop-chip-'+_escAttr(estado)+'">'+_escHtml(_PROP_ESTADO[estado]||estado)+'</span>';}
// Los toasts son texto plano (fgShowToast usa textContent): nada de entidades.
function _propToast(msg){_fgToastLargo(msg,6000);}

// ── Slots de oficiales (proponer y responder comparten el mismo editor) ────
var _hunPropFila=null,_hunPropBase=[],_hunPropModo='crear',_hunPropId=null;
function _hunPropSlotHtml(i,a){
  a=a||{};
  return '<div class="hp-slot" data-n="'+i+'">'+
    '<div class="hp-slot-h"><b>Oficial '+(i+1)+'</b><span class="hp-acts">'+
      '<button type="button" class="hp-act" onclick="_hunPropPasteToggle('+i+')">&#9889; Pegar</button>'+
      '<button type="button" class="hp-act" onclick="_hpGuardadosAbrir('+i+',this)">&#9734; Guardados</button>'+
      '<button type="button" class="hp-act" onclick="_hpGuardar('+i+')">&#43; Guardar este</button>'+
    '</span></div>'+
    '<div class="hp-paste-wrap" id="hp-paste-'+i+'" style="display:none">'+
      '<textarea class="login-inp hp-paste-ta" id="hp-paste-ta-'+i+'" rows="2" '+
        'placeholder="Peg&aacute; el nombre, celular y/o mail" oninput="_hunPropPasteRun('+i+')"></textarea>'+
      '<div class="hp-paste-res" id="hp-paste-res-'+i+'"></div>'+
    '</div>'+
    '<div class="hp-row">'+
      '<input type="text" class="login-inp" id="hp-nombre-'+i+'" placeholder="Nombre" value="'+_escAttr(a.nombre||'')+'" '+
        'oninput="_hunPropAutoMail('+i+');_hunPropDiffSync()">'+
      '<input type="text" class="login-inp" id="hp-celular-'+i+'" placeholder="Celular" value="'+_escAttr(a.celular||'')+'" oninput="_hunPropDiffSync()">'+
      '<input type="text" class="login-inp" id="hp-email-'+i+'" placeholder="Mail" value="'+_escAttr(a.email||'')+'" '+
        'oninput="this.dataset.manual=\'1\';_hunPropDiffSync()">'+
    '</div>'+
  '</div>';
}
function _hunPropAutoMail(i){
  var nombre=(document.getElementById('hp-nombre-'+i)||{}).value||'';
  var email=document.getElementById('hp-email-'+i);
  if(email&&!email.value&&!email.dataset.manual&&nombre.trim())email.value=_fgMailFromName(nombre);
}
function _hunPropPasteToggle(i){
  var w=document.getElementById('hp-paste-'+i);if(!w)return;
  var abrir=(w.style.display==='none'||!w.style.display);
  w.style.display=abrir?'block':'none';
  if(abrir){var ta=document.getElementById('hp-paste-ta-'+i);if(ta){ta.value='';setTimeout(function(){ta.focus();},0);}}
}
var _hunPropPasteT={};
function _hunPropPasteRun(i){
  clearTimeout(_hunPropPasteT[i]);
  _hunPropPasteT[i]=setTimeout(function(){
    var ta=document.getElementById('hp-paste-ta-'+i);if(!ta)return;
    var p=_fgParseContacto(ta.value);
    var res=document.getElementById('hp-paste-res-'+i);
    var chips=[];
    if(p.nombre){document.getElementById('hp-nombre-'+i).value=p.nombre;chips.push('nombre');}
    if(p.celular){document.getElementById('hp-celular-'+i).value=p.celular;chips.push('celular');}
    if(p.email){var em=document.getElementById('hp-email-'+i);em.value=p.email;em.dataset.manual='1';chips.push('mail');}
    if(res)res.textContent=chips.length?('Completé: '+chips.join(', ')+(p.avisos.length?' — '+p.avisos.join('; '):'')):'No encontré nada reconocible.';
    _hunPropAutoMail(i);_hunPropDiffSync();
  },180);
}
function _hunPropLeerSlots(){
  var out=[];
  for(var i=0;i<4;i++){
    out.push({
      nombre:((document.getElementById('hp-nombre-'+i)||{}).value||'').trim(),
      celular:((document.getElementById('hp-celular-'+i)||{}).value||'').trim(),
      email:((document.getElementById('hp-email-'+i)||{}).value||'').trim()
    });
  }
  return out;
}
function _hunPropDiffSync(){
  var el=document.getElementById('hun-prop-diff');if(!el)return;
  var diff=_plogAsesorDiff(_hunPropBase||[],_hunPropLeerSlots());
  el.innerHTML=diff.length
    ? '<div class="prop-diff-t">Vas a proponer</div><ul class="prop-diff">'+diff.map(function(p){return '<li><b>'+_escHtml(p[0])+':</b> '+_escHtml(p[1])+'</li>';}).join('')+'</ul>'
    : '<div class="pu-hint">Todav&iacute;a no cambiaste ning&uacute;n oficial.</div>';
  var btn=document.getElementById('hun-prop-enviar');if(!btn)return;
  // Proponer exige un cambio; responder una consulta puede ser sólo texto.
  if(_hunPropModo==='crear')btn.disabled=!diff.length;
  else{var t=((document.getElementById('hun-prop-nota')||{}).value||'').trim();btn.disabled=!diff.length&&!t;}
}
function _hunPropCerrar(){
  _hpGuardadosCerrar();
  var o=document.getElementById('pad-upd-ov');
  if(o&&o.parentNode)o.parentNode.removeChild(o);
  _hunPropFila=null;_hunPropBase=[];_hunPropId=null;_hunPropModo='crear';
}

// ── Asesores pre-guardados dentro del modal (la misma lista del armador:
//    tabla asesores_guardados, por cuenta; _loadAsesores/_saveAsesores no
//    dependen del DOM del armador). ────────────────────────────────────────
function _hpGuardadosCerrar(){
  var p=document.getElementById('hp-as-pop');if(p&&p.parentNode)p.parentNode.removeChild(p);
  document.removeEventListener('click',_hpGuardadosFuera);
}
function _hpGuardadosFuera(e){
  var p=document.getElementById('hp-as-pop');
  if(p&&e&&e.target&&!(p.contains&&p.contains(e.target)))_hpGuardadosCerrar();
}
function _hpGuardadosAbrir(i,anchor){
  _hpGuardadosCerrar();
  var pop=document.createElement('div');pop.id='hp-as-pop';pop.className='hp-as-pop';
  pop.innerHTML='<div class="hp-as-h">Mis oficiales guardados</div><div class="hp-as-list">Cargando&hellip;</div>';
  document.body.appendChild(pop);
  if(anchor&&anchor.getBoundingClientRect){
    var r=anchor.getBoundingClientRect();
    pop.style.top=Math.round(r.bottom+4)+'px';
    pop.style.left=Math.round(Math.max(8,Math.min(r.right-260,(window.innerWidth||1200)-268)))+'px';
  }
  setTimeout(function(){document.addEventListener('click',_hpGuardadosFuera);},0);
  _loadAsesores(function(lista){
    var host=pop.querySelector('.hp-as-list')||pop;
    if(!lista||!lista.length){
      host.innerHTML='<div class="hp-as-vacio">Todav&iacute;a no guardaste ning&uacute;n oficial. Us&aacute; <b>+ Guardar este</b> en un oficial cargado.</div>';
      return;
    }
    // En el onclick van sólo los índices (slot y posición en la lista).
    host.innerHTML=lista.map(function(a,k){
      return '<button type="button" class="hp-as-item" onclick="_hpGuardadoAplicar('+i+','+k+')">'+
        '<span class="hp-as-n">'+_escHtml(a.name||a.nombre||'(sin nombre)')+'</span>'+
        '<span class="hp-as-d">'+_escHtml([a.celular,a.email].filter(Boolean).join(' · '))+'</span></button>';
    }).join('');
  });
}
function _hpGuardadoAplicar(i,k){
  var a=_asesores[k];if(!a)return;
  var n=document.getElementById('hp-nombre-'+i),c=document.getElementById('hp-celular-'+i),m=document.getElementById('hp-email-'+i);
  if(n)n.value=a.nombre||a.name||'';
  if(c)c.value=a.celular||'';
  if(m){m.value=a.email||'';m.dataset.manual='1';}
  _hpGuardadosCerrar();
  _hunPropDiffSync();
}
function _hpGuardar(i){
  var a={
    nombre:((document.getElementById('hp-nombre-'+i)||{}).value||'').trim(),
    celular:((document.getElementById('hp-celular-'+i)||{}).value||'').trim(),
    email:((document.getElementById('hp-email-'+i)||{}).value||'').trim()
  };
  if(!a.nombre){showToast('Completá al menos el nombre para guardarlo.');return;}
  _loadAsesores(function(){
    var ya=_asesores.some(function(x){return _padNorm(x.nombre)===_padNorm(a.nombre)&&_padNorm(x.email)===_padNorm(a.email);});
    if(ya){showToast(a.nombre+' ya está en tus guardados.');return;}
    // El rótulo es el nombre (sin cuadro de texto nativo: se corrige después en Mis asesores).
    _asesores.unshift({id:_asId(),name:a.nombre,nombre:a.nombre,celular:a.celular,email:a.email});
    _saveAsesores(function(ok){if(ok!==false)showToast(a.nombre+' guardado en tus oficiales.');});
  });
}

// ── LADO HUNTER: proponer ───────────────────────────────────────────────────
// Mis propuestas (RLS: "creada_por = auth.uid()" ya me las deja ver).
// _hunPropMias: empresa abierta (pendiente o consulta) → {id, estado}, para la
// tarjeta de la fila. _hunPropLista: todas, para "Mis propuestas".
var _hunPropMias={},_hunPropLista=[],_hunPropAviso=0;
function _hunPropVistoKey(){return 'fg_hunprop_visto_'+(_me?_me.id:'anon');}
function _hunPropVisto(){try{return localStorage.getItem(_hunPropVistoKey())||'';}catch(e){return '';}}
function _hunPropMarcarVisto(){try{localStorage.setItem(_hunPropVistoKey(),new Date().toISOString());}catch(e){}}
function _hunPropCargarMias(cb){
  if(!_me){if(cb)cb();return;}
  _sb.from('padron_propuestas')
    .select('id,dueno_id,empresa_key,empresa,estado,asesores_antes,asesores,created_at,resuelta_at,motivo')
    .eq('creada_por',_me.id).order('created_at',{ascending:false}).limit(100)
    .then(function(r){
      _hunPropLista=(r&&r.data)||[];
      _hunPropMias={};
      var visto=_hunPropVisto(),aviso=0;
      _hunPropLista.forEach(function(p){
        if(p.estado==='pendiente'||p.estado==='consulta')_hunPropMias[p.dueno_id+'|'+p.empresa_key]={id:p.id,estado:p.estado};
        // Para avisarle: consultas que esperan su respuesta + lo resuelto que no vio.
        if(p.estado==='consulta')aviso++;
        else if((p.estado==='aprobada'||p.estado==='rechazada')&&p.resuelta_at&&p.resuelta_at>visto)aviso++;
      });
      _hunPropAviso=aviso;
      _hunPropBadgeSync();
      if(cb)cb();
    }).catch(function(){if(cb)cb();});
}
function _hunPropPendiente(r){return !!(r&&r.user_id&&_hunPropMias[r.user_id+'|'+_padNorm(r.empresa)]);}
function _hunPropEstado(r){
  var x=r&&r.user_id&&_hunPropMias[r.user_id+'|'+_padNorm(r.empresa)];
  if(!x)return '';
  return (x===true)?'pendiente':(x.estado||'pendiente');
}
function _hunPropBadgeSync(){
  var it=document.getElementById('hdr-dd-hunprop');
  if(it)it.style.display=(_esHunter()&&_can('proponer_oficiales'))?'flex':'none';
  var b=document.getElementById('hunprop-badge');
  if(b)b.innerHTML=_hunPropAviso>0?'<span class="fg-badge">'+_hunPropAviso+'</span>':'';
  _hdrMsgSync();
}
// Marca en el encabezado (visible en cualquier pantalla, sin abrir el menú):
// suma lo que espera MI acción como oficial/suplente + lo que me contestaron
// o resolvieron como Hunter. Si es 0 no se ve nada.
function _hdrMsgSync(){
  var m=document.getElementById('hdr-msg');if(!m)return;
  var ofi=_propPendCount||0,hun=_esHunter()?(_hunPropAviso||0):0,ges=_gesAviso||0,n=ofi+hun+ges;
  m.style.display=n>0?'inline-flex':'none';
  m.textContent=n>9?'9+':String(n);
  var btn=m.parentNode,tip='';
  if(n>0){
    var p=[];
    if(ofi)p.push(ofi===1?'1 cambio de oficiales para revisar':ofi+' cambios de oficiales para revisar');
    if(hun)p.push(hun===1?'1 novedad en tus modificaciones':hun+' novedades en tus modificaciones');
    if(ges)p.push(ges===1?'1 novedad en Gestiones':ges+' novedades en Gestiones');
    tip='Tenés '+p.join(' y ');
  }
  if(btn&&btn.setAttribute)btn.setAttribute('title',tip);
}
// Refresco liviano cada 90 s (sólo con la pestaña a la vista) para que la marca
// aparezca sin recargar la página.
var _msgPollT=null;
function _msgPollInit(){
  if(_msgPollT)return;
  _msgPollT=setInterval(function(){
    if(!_me||document.hidden)return;
    _propCargarPendientes();
    _gesAvisoCargar();
    if(_esHunter()&&_can('proponer_oficiales'))_hunPropCargarMias(function(){
      if(document.getElementById('mis-cambios-list'))return;
      if(document.getElementById('hun-list'))_hunRender();
    });
  },90000);
}
function _hunPropCartel(){
  var cons=_hunPropLista.filter(function(p){return p.estado==='consulta';}).length;
  var res=_hunPropAviso-cons;
  if(!cons&&!res)return;
  var partes=[];
  if(cons)partes.push(cons===1?'1 consulta sobre un cambio que propusiste':cons+' consultas sobre cambios que propusiste');
  if(res>0)partes.push(res===1?'1 cambio resuelto':res+' cambios resueltos');
  _propToast('Tenés '+partes.join(' y ')+'. Tu nombre → Mis propuestas.');
}

// El modal de proponer/responder: título, contexto, los 4 slots, el campo de
// texto y el resumen de qué cambia. Más ancho que el modal genérico.
function _hunPropModal(o){
  _padStyle();
  var as=(o.asesores||[]).slice(0,4);while(as.length<4)as.push({nombre:'',celular:'',email:''});
  _padModal(
    '<h3>'+o.titulo+'</h3>'+
    '<p class="pu-sub">'+o.sub+'</p>'+
    (o.hilo||'')+
    '<div class="hp-slots">'+as.map(function(a,i){return _hunPropSlotHtml(i,a);}).join('')+'</div>'+
    '<div class="pu-fld"><label class="pu-lbl">'+o.lblTexto+'</label>'+
      '<textarea id="hun-prop-nota" class="login-inp" rows="2" placeholder="'+o.phTexto+'" oninput="_hunPropDiffSync()"></textarea></div>'+
    '<div id="hun-prop-diff" class="hp-diffbox"></div>'+
    '<div class="pu-foot">'+
      '<button type="button" class="pu-no" onclick="_hunPropCerrar()">Cancelar</button>'+
      '<button type="button" class="pu-si" id="hun-prop-enviar" onclick="_hunPropuestaEnviar()" disabled>'+o.btn+'</button>'+
    '</div>'
  );
  var box=document.getElementById('pad-upd');if(box)box.classList.add('pu-wide');
  _hunPropDiffSync();
}
function _hunAbrirPropuesta(i){
  if(!_can('proponer_oficiales')){showToast('No tenés habilitado proponer cambios.');return;}
  var r=_hunHits[i];if(!r)return;
  if(!r.user_id){showToast('No se pudo identificar al oficial dueño de esta empresa.');return;}
  if(_hunPropPendiente(r)){showToast('Ya hay un cambio tuyo abierto para esta empresa: miralo en tu nombre → Mis propuestas.');return;}
  _hunPropFila=r;_hunPropBase=r.asesores||[];_hunPropModo='crear';_hunPropId=null;
  _hunPropModal({
    titulo:'&#9998; Proponer un cambio de oficiales',
    sub:'<strong>'+_escHtml(r.empresa||'')+'</strong> &middot; El cambio queda <strong>pendiente</strong> hasta que lo apruebe el oficial due&ntilde;o (o su suplente). Mientras tanto, el flyer sigue saliendo con los datos de hoy.',
    asesores:r.asesores,
    lblTexto:'Nota para el oficial (opcional)',phTexto:'Ej: el celular de Juan qued&oacute; desactualizado',
    btn:'Enviar propuesta'
  });
}
// Responder una consulta: mismos slots, precargados con lo que había
// propuesto; el resumen compara contra los oficiales de hoy.
function _hunResponder(id){
  var p=_hunPropLista.filter(function(x){return x.id===id;})[0];if(!p)return;
  _hunPropCerrar();
  _hunPropFila={empresa:p.empresa,user_id:p.dueno_id};
  _hunPropBase=p.asesores_antes||[];_hunPropModo='responder';_hunPropId=id;
  _hunPropModal({
    titulo:'&#128172; Responder la consulta',
    sub:'<strong>'+_escHtml(p.empresa||'')+'</strong> &middot; Contest&aacute; y, si hace falta, correg&iacute; los oficiales. Vuelve a quedar pendiente de aprobaci&oacute;n.',
    hilo:_propHiloHtml(id),
    asesores:p.asesores,
    lblTexto:'Tu respuesta',phTexto:'Ej: confirmado con el cliente, el celular nuevo es ese',
    btn:'Responder y reenviar'
  });
}
function _hunPropuestaEnviar(){
  if(!_hunPropFila)return;
  var btn=document.getElementById('hun-prop-enviar');
  var lbl=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Enviando...';}
  var texto=((document.getElementById('hun-prop-nota')||{}).value||'').trim();
  var req=(_hunPropModo==='responder')
    ? _sb.rpc('padron_propuesta_responder',{p_id:_hunPropId,p_texto:texto,p_asesores:_hunPropLeerSlots()})
    : _sb.rpc('padron_propuesta_crear',{p_empresa:_hunPropFila.empresa,p_dueno:_hunPropFila.user_id,
        p_asesores:_hunPropLeerSlots(),p_nota:texto||null});
  var modo=_hunPropModo,pid=_hunPropId;
  req.then(function(r){
    if(r&&r.error){
      showToast('No se pudo enviar: '+r.error.message);
      if(btn){btn.disabled=false;btn.textContent=lbl;}
      return;
    }
    showToast(modo==='responder'?'Respuesta enviada: vuelve a quedar pendiente de aprobación.':'Propuesta enviada: queda pendiente de aprobación.');
    _hunPropCerrar();
    if(pid)_propHiloReset([pid]);
    _hunPropCargarMias(function(){_hunRender();if(document.getElementById('mis-cambios-list'))_hunMisCambiosRender();});
  }).catch(function(e){
    showToast('No se pudo enviar: '+((e&&e.message)||e));
    if(btn){btn.disabled=false;btn.textContent=lbl;}
  });
}

// ── "Mis propuestas" (menú del nombre del Hunter) ─────────
function openMisCambios(){
  if(!_can('proponer_oficiales'))return;
  _hunPropCerrar();
  _padStyle();
  _padModal('<h3>&#128203; Mis propuestas</h3>'+
    '<p class="pu-sub">Lo que propusiste y en qu&eacute; qued&oacute;. Si el oficial te hizo una consulta, respondela desde ac&aacute;.</p>'+
    '<div id="mis-cambios-list" class="prop-list">Cargando&hellip;</div>'+
    '<div class="pu-foot"><button type="button" class="pu-no" onclick="_hunPropCerrar()">Cerrar</button></div>');
  var box=document.getElementById('pad-upd');if(box)box.classList.add('pu-wide');
  _hunPropCargarMias(function(){
    _propCargarHilos(_hunPropLista.map(function(p){return p.id;}).filter(function(id){return !_propHilos[id];}),function(){
      _hunMisCambiosRender();
      // Lo que ve ahora deja de contar como novedad.
      _hunPropMarcarVisto();
      _hunPropAviso=_hunPropLista.filter(function(p){return p.estado==='consulta';}).length;
      _hunPropBadgeSync();
    });
  });
}
function _hunMisCambiosRender(){
  var host=document.getElementById('mis-cambios-list');if(!host)return;
  if(!_hunPropLista.length){host.innerHTML='<div class="prop-vacio">Todav&iacute;a no propusiste ning&uacute;n cambio.</div>';return;}
  // Primero lo que espera algo de él (consulta), después lo abierto, después lo resuelto.
  var orden={consulta:0,pendiente:1,aprobada:2,rechazada:2};
  var lista=_hunPropLista.slice().sort(function(a,b){return (orden[a.estado]-orden[b.estado])||(a.created_at<b.created_at?1:-1);});
  host.innerHTML=lista.map(function(p){
    return '<div class="prop-card prop-card-'+_escAttr(p.estado)+'">'+
      '<div class="prop-card-h"><div><div class="prop-emp">'+_escHtml(p.empresa||'')+'</div>'+
        '<div class="prop-meta">Propuesto '+_escHtml(_fmtDate(p.created_at))+'</div></div>'+_propChip(p.estado)+'</div>'+
      _propDiffHtml(p.asesores_antes,p.asesores)+
      _propHiloHtml(p.id)+
      (p.estado==='consulta'?'<div class="prop-acts"><button type="button" class="prop-btn prop-btn-pri" onclick="_hunResponder(\''+p.id+'\')">Responder</button></div>':'')+
    '</div>';
  }).join('');
}

// ── LADO OFICIAL: aprobar / repreguntar / rechazar / elegir suplente ───────
var _propPendCount=0,_propPendientes=[],_propColegas=null,_mySuplenteId=undefined;
// Todo lo ABIERTO (pendiente o en consulta) que la RLS me deja ver y que no
// creé yo: soy el dueño, o soy el suplente del dueño. El número del badge
// cuenta sólo lo que espera MI acción (pendiente); lo que está en consulta
// espera al hunter.
function _propCargarPendientes(cb){
  if(!_me){_propPendientes=[];_propPendCount=0;_propBadgeSync();if(cb)cb();return;}
  _sb.from('padron_propuestas').select('*').in('estado',['pendiente','consulta']).order('created_at',{ascending:false})
    .then(function(r){
      var rows=(r&&r.data)||[];
      // Las propias no (las revisa el dueño), salvo que la empresa sea mía:
      // pasa al simular el Hunter sobre mi propia base. Si no, quedaba
      // abierta para siempre y trababa nuevas propuestas de esa empresa.
      _propPendientes=rows.filter(function(x){return x.creada_por!==_me.id||x.dueno_id===_me.id;});
      _propPendCount=_propPendientes.filter(function(x){return x.estado!=='consulta';}).length;
      _propBadgeSync();
      if(cb)cb();
    }).catch(function(){if(cb)cb();});
}
function _propCartel(){
  if(!_propPendCount)return;
  _propToast('Tenés '+_propPendCount+(_propPendCount===1?' cambio de oficiales':' cambios de oficiales')+
    ' para revisar. Tu nombre → Base de datos → Cambios pendientes.');
}
function _propBadgeSync(){
  _hdrMsgSync();
  var dp=document.getElementById('hdr-dd-padron');if(!dp)return;
  var b=document.getElementById('bd-badge');
  if(!b){
    var sp=dp.querySelector('span');
    if(sp&&sp.parentNode){b=document.createElement('span');b.id='bd-badge';sp.parentNode.insertBefore(b,sp.nextSibling);}
  }
  if(b)b.innerHTML=_propPendCount>0?'<span class="fg-badge">'+_propPendCount+'</span>':'';
}
function _propColegasCargar(cb){
  if(_propColegas){if(cb)cb(_propColegas);return;}
  _sb.rpc('colegas_para_suplente').then(function(r){
    _propColegas=(r&&r.data)||[];
    if(cb)cb(_propColegas);
  }).catch(function(){_propColegas=[];if(cb)cb(_propColegas);});
}
function _propSuplenteCargar(cb){
  if(_mySuplenteId!==undefined){if(cb)cb();return;}
  _sb.from('profiles').select('suplente_id').eq('id',_me.id).single().then(function(r){
    _mySuplenteId=(r&&r.data&&r.data.suplente_id)||null;
    if(cb)cb();
  }).catch(function(){_mySuplenteId=null;if(cb)cb();});
}
function _propSuplenteGuardar(val){
  _sb.from('profiles').update({suplente_id:val||null}).eq('id',_me.id).then(function(r){
    if(r&&r.error){showToast('No se pudo guardar: '+r.error.message);return;}
    _mySuplenteId=val||null;
    showToast(val?'Suplente guardado':'Suplente quitado');
  });
}
function _propSuplenteHtml(){
  var opts=(_propColegas||[]).map(function(c){
    return '<option value="'+_escAttr(c.id)+'"'+(c.id===_mySuplenteId?' selected':'')+'>'+_escHtml(c.nombre)+'</option>';
  }).join('');
  return '<div class="prop-suplente">'+
    '<div><div class="prop-suplente-t">Mi suplente</div>'+
    '<div class="pu-hint">Mientras est&eacute; elegido, esa persona tambi&eacute;n puede revisar y aprobar los cambios de tus empresas (por ejemplo, durante tus vacaciones). Lo sac&aacute;s vos cuando vuelvas.</div></div>'+
    '<select class="login-inp" id="prop-suplente-sel" onchange="_propSuplenteGuardar(this.value)">'+
      '<option value="">Ninguno</option>'+opts+
    '</select></div>';
}
function _propRenderPendientes(){
  var host=document.getElementById('at-propuestas');if(!host)return;
  host.innerHTML='<p class="ap-sec">Cambios pendientes</p>'+
    '<div id="prop-suplente-box"></div>'+
    '<div id="prop-list" class="prop-list">Cargando&hellip;</div>';
  _propColegasCargar(function(){
    _propSuplenteCargar(function(){
      var box=document.getElementById('prop-suplente-box');if(box)box.innerHTML=_propSuplenteHtml();
    });
  });
  _propCargarHilos(_propPendientes.map(function(p){return p.id;}).filter(function(id){return !_propHilos[id];}),_propPintarLista);
}
function _propPintarLista(){
  var list=document.getElementById('prop-list');if(!list)return;
  if(!_propPendientes.length){
    list.innerHTML='<div class="prop-vacio">No ten&eacute;s cambios para revisar.</div>';
    return;
  }
  // En los onclick va SÓLO el id de la propuesta (lo genera la base): todo lo
  // demás es texto de otro usuario y va siempre a través de _escHtml.
  list.innerHTML=_propPendientes.map(function(p){
    var esperando=p.estado==='consulta';
    return '<div class="prop-card prop-card-'+_escAttr(p.estado)+'">'+
      '<div class="prop-card-h"><div><div class="prop-emp">'+_escHtml(p.empresa||'')+'</div>'+
        '<div class="prop-meta">Propuesto por '+_escHtml(p.creada_por_nombre||'alguien')+' &middot; '+_escHtml(_fmtDate(p.created_at))+'</div></div>'+
        (esperando?'<span class="prop-chip prop-chip-consulta">Esperando respuesta del hunter</span>':_propChip('pendiente'))+'</div>'+
      _propDiffHtml(p.asesores_antes,p.asesores)+
      _propHiloHtml(p.id)+
      '<div class="prop-acts">'+
        '<button type="button" class="prop-btn prop-btn-ok" onclick="_propAccion(\''+p.id+'\',\'aprobar\')">Aprobar</button>'+
        (esperando?'':'<button type="button" class="prop-btn" onclick="_propAccion(\''+p.id+'\',\'consultar\')">Repreguntar</button>')+
        '<button type="button" class="prop-btn prop-btn-no" onclick="_propAccion(\''+p.id+'\',\'rechazar\')">Rechazar</button>'+
      '</div>'+
      '<div class="prop-acc" id="prop-acc-'+p.id+'" style="display:none"></div>'+
    '</div>';
  }).join('');
}
// Abre (o cierra) el campo de la acción EN EL LUGAR, sin repintar la lista:
// así no se pierde lo que se esté escribiendo en otra tarjeta.
var _PROP_ACC={
  aprobar:{lbl:'Comentario para el hunter (opcional)',ph:'Ej: gracias, ya quedó actualizado',btn:'Confirmar aprobación',cls:'prop-btn-ok'},
  consultar:{lbl:'Tu consulta',ph:'Ej: ¿confirmaste el celular con el cliente?',btn:'Enviar consulta',cls:'prop-btn-pri'},
  rechazar:{lbl:'Motivo (opcional)',ph:'Ej: ese oficial ya no atiende la empresa',btn:'Confirmar rechazo',cls:'prop-btn-no'}
};
function _propAccion(id,tipo){
  var box=document.getElementById('prop-acc-'+id);if(!box)return;
  if(box.style.display!=='none'&&box.dataset.tipo===tipo){box.style.display='none';return;}
  var d=_PROP_ACC[tipo];if(!d)return;
  box.dataset.tipo=tipo;
  box.innerHTML='<label class="pu-lbl">'+d.lbl+'</label>'+
    '<textarea class="login-inp" id="prop-txt-'+id+'" rows="2" placeholder="'+_escAttr(d.ph)+'"></textarea>'+
    '<div class="prop-acts"><button type="button" class="prop-btn '+d.cls+'" onclick="_propConfirmar(\''+id+'\')">'+d.btn+'</button>'+
    '<button type="button" class="prop-btn prop-btn-link" onclick="_propAccion(\''+id+'\',\''+tipo+'\')">Cancelar</button></div>';
  box.style.display='block';
  setTimeout(function(){var t=document.getElementById('prop-txt-'+id);if(t&&t.focus)t.focus();},0);
}
function _propConfirmar(id){
  var box=document.getElementById('prop-acc-'+id);if(!box)return;
  var txt=((document.getElementById('prop-txt-'+id)||{}).value||'').trim();
  if(box.dataset.tipo==='aprobar')_propAprobar(id,txt);
  else if(box.dataset.tipo==='consultar')_propConsultar(id,txt);
  else _propRechazar(id,txt);
}
function _propTrasResolver(id,msg){
  return function(r){
    if(r&&r.error){showToast('No se pudo: '+r.error.message);return;}
    showToast(msg);
    _propHiloReset([id]);
    _propCargarPendientes(_propRenderPendientes);
  };
}
function _propFallo(e){showToast('No se pudo: '+((e&&e.message)||e));}
function _propAprobar(id,comentario){
  _sb.rpc('padron_propuesta_aprobar',{p_id:id,p_comentario:comentario||null})
    .then(_propTrasResolver(id,'Cambio aplicado')).catch(_propFallo);
}
function _propConsultar(id,texto){
  if(!texto){showToast('Escribí la consulta.');return;}
  _sb.rpc('padron_propuesta_consultar',{p_id:id,p_texto:texto})
    .then(_propTrasResolver(id,'Consulta enviada al hunter')).catch(_propFallo);
}
function _propRechazar(id,motivo){
  _sb.rpc('padron_propuesta_rechazar',{p_id:id,p_motivo:motivo||null})
    .then(_propTrasResolver(id,'Propuesta rechazada')).catch(_propFallo);
}


// ══ GESTIONES COMERCIALES: interruptor, cuenta de prueba y enganches ══════════
// Visitas, ferias y acciones en empresas, con sus prospectos y altas, y el
// tablero para el Líder. Todo el código de esas pantallas vive en gestiones.js
// y se baja recién cuando alguien abre "Gestiones" o "Registrar gestión": quien
// no lo usa no paga nada en la carga. Acá queda sólo lo que tiene que estar
// siempre: el interruptor, la marca del avatar y los botones.
//
// Interruptor (tabla app_flags, lo cambia el admin en Facultades):
//   off    → no existe para nadie (las policies de la base también lo cortan).
//   prueba → sólo el admin y las cuentas de prueba, sin mirar Facultades.
//   on     → según Facultades → "Gestiones comerciales" (el Líder siempre).
var _gesFlag='off',_esPrueba=false,_myLiderId=null,_gesAviso=0;
function _gesOn(){
  if(_gesFlag==='prueba')return !!(_admin||_esPrueba);
  if(_gesFlag!=='on')return false;
  return _esLider()||_can('gestiones');
}
function _gesFlagCargar(cb){
  _sb.from('app_flags').select('valor').eq('clave','gestiones').maybeSingle()
    .then(function(r){_gesFlag=(r&&r.data&&r.data.valor)||'off';},function(){_gesFlag='off';})
    .then(function(){if(cb)cb();});
}
// Visitas que un oficial le derivó a este hunter y todavía no abrió: suman a la
// marca del avatar. Es un count (head:true): no baja filas.
// Novedades sin ver, por SERIE (una serie de 3 fechas es un solo aviso):
//   - como hunter: lo que me derivaron y no abrí (visto_hunter);
//   - como oficial dueño: un hunter registró en una empresa mía o completó una
//     que derivé (visto_dueno, lo pone el servidor).
// Al entrar sale un cartel con el resumen; después, en cada refresco, un aviso
// sólo por lo que llegó nuevo. Son pocas filas y las filtra la RLS.
var _gesNov=[],_gesAvisados=null,_gesNombres=null;
function _gesAvisoCargar(){
  if(!_me||!_gesOn()){if(_gesAviso){_gesAviso=0;_gesNov=[];_hdrMsgSync();_gesBadgeSync();}return;}
  var yo=_me.id;
  _sb.from('gestiones').select('serie_id,empresa,origen,estado,creada_por,hunter_id,dueno_id,visto_hunter,visto_dueno')
    .or('and(hunter_id.eq.'+yo+',visto_hunter.eq.false),and(dueno_id.eq.'+yo+',visto_dueno.eq.false)')
    .order('created_at',{ascending:false}).limit(200)
    .then(function(r){
      var vistas={},nov=[];
      ((r&&r.data)||[]).forEach(function(g){
        var esHun=g.hunter_id===yo&&!g.visto_hunter,esDue=g.dueno_id===yo&&!g.visto_dueno;
        if(esHun&&!vistas['h'+g.serie_id]){vistas['h'+g.serie_id]=1;nov.push({serie:g.serie_id,empresa:g.empresa,tipo:'derivada',quien:g.creada_por});}
        if(esDue&&!vistas['d'+g.serie_id]){vistas['d'+g.serie_id]=1;
          nov.push({serie:g.serie_id,empresa:g.empresa,tipo:(g.origen==='derivada'?'completada':'registro'),quien:g.hunter_id});}
      });
      _gesNov=nov;_gesAviso=nov.length;_hdrMsgSync();_gesBadgeSync();
      if(typeof window.gesAvisoSync==='function')window.gesAvisoSync();
      _gesAvisar();
    }).catch(function(){});
}
// Primera carga: cartel con todo. Después: sólo lo que no se avisó antes.
function _gesAvisar(){
  var primera=!_gesAvisados;
  if(primera)_gesAvisados={};
  var nuevas=_gesNov.filter(function(n){return !_gesAvisados[n.tipo+n.serie];});
  nuevas.forEach(function(n){_gesAvisados[n.tipo+n.serie]=1;});
  if(!nuevas.length)return;
  _gesNombresCargar(function(){
    var msg=_gesAvisoTexto(nuevas,primera);if(!msg)return;
    // Si al entrar ya salió el cartel de propuestas, éste espera su turno.
    var demora=(primera&&((_propPendCount||0)+(_esHunter()?(_hunPropAviso||0):0)>0))?6500:0;
    setTimeout(function(){_propToast(msg);},demora);
  });
}
function _gesNombresCargar(cb){
  if(_gesNombres){cb();return;}
  _sb.rpc('gestiones_personas').then(function(r){
    _gesNombres={};((r&&r.data)||[]).forEach(function(p){_gesNombres[p.id]=p.nombre;});cb();
  }).catch(function(){_gesNombres={};cb();});
}
function _gesQuien(id){return (_gesNombres&&_gesNombres[id])||'Un hunter';}
function _gesAvisoTexto(l,primera){
  var der=l.filter(function(n){return n.tipo==='derivada';}),due=l.filter(function(n){return n.tipo!=='derivada';});
  var partes=[];
  if(der.length===1)partes.push(_gesQuien(der[0].quien)+' te derivó una acción en '+der[0].empresa);
  else if(der.length>1)partes.push('Te derivaron '+der.length+' acciones nuevas: '+der.slice(0,3).map(function(n){return n.empresa;}).join(', ')+(der.length>3?'…':''));
  if(due.length===1){var d=due[0];partes.push(_gesQuien(d.quien)+(d.tipo==='completada'?' completó la acción que derivaste en ':' registró una acción en ')+d.empresa);}
  else if(due.length>1)partes.push('Hay novedades en '+due.length+' acciones de tus empresas: '+due.slice(0,3).map(function(n){return n.empresa;}).join(', ')+(due.length>3?'…':''));
  if(!partes.length)return '';
  return partes.join('. ')+'. '+(l.length===1?'Está':'Están')+' en Gestiones.';
}
// Numerito en la solapa "Gestiones" del header.
function _gesBadgeSync(){
  var t=document.getElementById('apptab-gestiones');if(!t)return;
  var b=document.getElementById('ges-tab-badge');
  if(!b){b=document.createElement('i');b.id='ges-tab-badge';b.className='tab-badge';t.appendChild(b);}
  b.textContent=_gesAviso>9?'9+':String(_gesAviso||'');
  b.style.display=_gesAviso>0?'':'none';
}
// Botones que dependen del interruptor. Bidireccional, como todo el gating.
function _gesSync(){
  var on=_gesOn();
  var b=document.getElementById('hun-ges');if(b)b.style.display=on?'':'none';
  var pr=document.getElementById('hdr-dd-prueba');
  if(pr){pr.style.display=_esPrueba?'block':'none';if(_esPrueba)_pruebaRender();}
  if(!on&&_gesAviso){_gesAviso=0;_hdrMsgSync();}
}
function _gesAbrir(fn,arg){
  _lib(['ges']).then(function(){window[fn](arg);})
    .catch(function(){showToast('No se pudo cargar Gestiones. Revisá la conexión e intentá de nuevo.');});
}
// Desde la pantalla del Hunter, con la empresa que tiene elegida.
function _hunGesRegistrar(){
  var r=(typeof _hunSel==='number'&&_hunSel>=0)?_hunHits[_hunSel]:null;
  if(!r){showToast('Elegí primero una empresa de la lista.');return;}
  _gesAbrir('gesRegistrar',r);
}

// ── Interruptor en Admin → Facultades ──
function _gesFlagRender(){
  var host=document.getElementById('ges-flag');if(!host)return;
  var ops=[
    ['off','Apagado','Nadie lo ve.'],
    ['prueba','En prueba','S&oacute;lo vos y la cuenta de prueba (Prospect).'],
    ['on','Activo','Lo ve cada perfil seg&uacute;n la fila &laquo;Gestiones comerciales&raquo; de abajo. El L&iacute;der siempre.']
  ];
  host.innerHTML='<div class="ges-flag-t">Gestiones comerciales <span class="ges-flag-new">Nuevo</span></div>'+
    '<div class="ges-flag-d">Visitas, ferias, prospectos, altas y el tablero del L&iacute;der. Prendelo para probarlo sin que lo vea nadie m&aacute;s.</div>'+
    '<div class="ges-flag-ops" role="radiogroup" aria-label="Estado de Gestiones comerciales">'+ops.map(function(o){
      return '<button type="button" role="radio" aria-checked="'+(_gesFlag===o[0])+'" class="ges-flag-op'+(_gesFlag===o[0]?' on':'')+'" onclick="_gesFlagSet(\''+o[0]+'\')">'+
        '<b>'+o[1]+'</b><span>'+o[2]+'</span></button>';
    }).join('')+'</div>';
}
function _gesFlagSet(v){
  if(!_adminNow()||v===_gesFlag)return;
  var antes=_gesFlag;_gesFlag=v;_gesFlagRender();
  _sb.from('app_flags').upsert({clave:'gestiones',valor:v,updated_at:new Date().toISOString()},{onConflict:'clave'})
    .then(function(r){
      if(r&&r.error){_gesFlag=antes;_gesFlagRender();showToast('No se pudo guardar: '+r.error.message);return;}
      _applyFacultades();
      showToast(v==='off'?'Gestiones comerciales: apagado.':v==='prueba'?'Gestiones comerciales: en prueba (sólo vos y Prospect).':'Gestiones comerciales: activo según Facultades.');
    });
}

// ── Cuenta de prueba: cambiar de perfil desde el menú del nombre ──
// El cambio es REAL (la base lo deja sólo a cuentas marcadas es_prueba, y nunca
// a admin): así se prueba el circuito completo con otra sesión de verdad.
var _PRUEBA_ROLES=[['hunter','Hunter'],['vip','VIP'],['asesor','Asesor'],['pro','Pro'],['lider','Líder']];
function _pruebaRender(){
  var host=document.getElementById('hdr-dd-prueba');if(!host)return;
  host.innerHTML='<div class="hdr-dd-lbl">Probar como (cuenta de prueba)</div><div class="dd-prueba">'+
    _PRUEBA_ROLES.map(function(r){
      return '<button type="button" class="'+(_myRole===r[0]?'on':'')+'" onclick="_pruebaRol(\''+r[0]+'\')">'+r[1]+'</button>';
    }).join('')+'</div>';
}
function _pruebaRol(role){
  if(!_esPrueba||role===_myRole)return;
  _sb.rpc('prueba_cambiar_rol',{p_role:role}).then(function(r){
    if(r&&r.error){showToast('No se pudo cambiar: '+r.error.message);return;}
    showToast('Listo: ahora sos '+(_ROLE_LBL[role]||role)+'. Recargando…');
    setTimeout(function(){location.reload();},700);
  });
}
