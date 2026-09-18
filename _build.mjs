import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

let html = readFileSync('_source.html', 'utf8');
const newCSS = readFileSync('_newcss.txt', 'utf8');

// ── LOGO GALICIA (SVG inline, self-contained) ──────────────────────────────
const swordPaths = '<circle cx="40" cy="23" r="4.3"/><rect x="37.8" y="26.5" width="4.4" height="6.5" rx="1"/><rect x="26" y="31.5" width="28" height="5.2" rx="2.6"/><polygon points="34.6,37 45.4,37 40,84"/>';
// Isotipo para header (D naranja oficial, espada blanca; rediseño del header 2026-09-17)
const headerIso = '<svg class="header-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Galicia"><path d="M6 6H48a44 44 0 0 1 0 88H6z" fill="#F26122"/><g fill="#fff">' + swordPaths + '</g></svg>';
// Logo completo para login (D blanca + espada granate + wordmark)
const galiciaLogoWhite = '<div class="lg-logo"><svg class="lg-iso" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Galicia"><path d="M6 6H48a44 44 0 0 1 0 88H6z" fill="#fff"/><g fill="#A6273B">' + swordPaths + '</g></svg><span class="lg-word">Galicia</span></div>';

// Íconos monocromáticos (estilo Feather) para el menú de usuario. Heredan el color
// del texto (currentColor) → look sobrio, sin emojis de color que quedan mal.
const _svgIco = (p) => '<svg class="dd-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const ICO_LOCK = _svgIco('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
const ICO_MOON = _svgIco('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>');
const ICO_DOC  = _svgIco('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>');
const ICO_DB   = _svgIco('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>');
const ICO_HELP = _svgIco('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
const ICO_OUT  = _svgIco('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');

// ── CSS FIXES ──────────────────────────────────────────────────────────────
html = html.replace(
  'body{font-family:"DM Sans",sans-serif;background:var(--light);color:var(--dark);min-height:100vh;}',
  'body{font-family:"DM Sans",sans-serif;background:var(--light);color:var(--dark);height:100vh;overflow:hidden;}'
);
html = html.replace(
  '.layout{display:grid;grid-template-columns:420px 1fr;min-height:calc(100vh - 60px);}',
  '.layout{display:grid;grid-template-columns:420px 1fr;height:calc(100vh - 62px);overflow:hidden;}'
);
html = html.replace(
  '.panel{background:var(--card);border-right:1px solid var(--border);padding:20px;overflow-y:auto;}',
  '.panel{background:var(--card);border-right:1px solid var(--border);padding:20px;overflow-y:auto;height:100%;}'
);
html = html.replace(
  'header{background:var(--dark);color:white;padding:12px 16px;display:flex;align-items:center;gap:14px;border-bottom:3px solid var(--red);}',
  'header{background:var(--dark);color:white;padding:0 16px;display:flex;align-items:center;gap:14px;border-bottom:3px solid var(--red);height:62px;flex-shrink:0;}'
);
html = html.replace(
  '.prev{padding:20px;display:flex;flex-direction:column;align-items:center;overflow-y:auto;background:#e4e4df;}',
  '.prev{padding:16px;display:flex;flex-direction:column;align-items:center;overflow:auto;background:#e8e8e3;height:100%;}'
);
html = html.replace('</style>', newCSS + '</style>');

// ── LOGO HEADER (reemplaza el <img> por isotipo SVG) ───────────────────────
html = html.replace(/<img src="data:image[^"]*" alt="Galicia" class="header-logo">/, headerIso);

// ── SDK SUPABASE + auth.js EXTERNO ─────────────────────────────────────────
// Versión FIJA de supabase-js (antes era "@2" flotante: cualquier release nueva
// del CDN entraba sola a producción y no se podía verificar su integridad).
const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js';
html = html.replace(
  '</head>',
  `<script src="${SUPABASE_JS_URL}"></script><script src="auth.js"></script></head>`
);

// ── SRI: integridad de TODOS los scripts que llegan por CDN ─────────────────
// El navegador compara el hash del archivo descargado con el que va acá; si el
// CDN devolviera otro contenido (compromiso, cambio silencioso), NO lo ejecuta.
// Los hashes se calculan una vez por versión:
//   curl -sL URL | openssl dgst -sha384 -binary | openssl base64 -A
// Al subir la versión de una librería hay que actualizar la URL y su hash acá.
// El build se aplica sobre _source.html (que el usuario regenera seguido), así
// que los atributos se inyectan en el build en vez de escribirse a mano allá.
const SRI = {
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js': 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js': 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz',
  [SUPABASE_JS_URL]: 'sha384-iLddHTLokph6Omwoyid4XKxHaWa6w41BnoEj0q5oOrzmYPpHIKt1wyjReA7s//pP',
};
const _scriptsSinSri = [];
html = html.replace(/<script src="(https:\/\/[^"]+)"><\/script>/g, (tag, url) => {
  const h = SRI[url];
  if (!h) { _scriptsSinSri.push(url); return tag; }
  return `<script src="${url}" integrity="${h}" crossorigin="anonymous"></script>`;
});

// ── LIBRERÍAS DE EXPORTACIÓN BAJO DEMANDA ───────────────────────────────────
// jsPDF, SheetJS (xlsx), JSZip y ExcelJS suman ~2,2 MB y sólo se usan al
// descargar PDF / Excel / ZIP. Antes se bajaban y ejecutaban en el arranque,
// frenando la pantalla de login. Se sacan del <head> y la app las carga la
// primera vez que hacen falta (_lib en auth.js), con el MISMO hash SRI. Aplica a
// index.html y a index_export.html. supabase-js y auth.js siguen en el <head>.
const LAZY_LIBS = {
  jspdf:   'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  xlsx:    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jszip:   'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
};
const _lazyMeta = {};
for (const [name, url] of Object.entries(LAZY_LIBS)) {
  if (!SRI[url]) throw new Error('LAZY_LIBS sin hash SRI: ' + url);
  _lazyMeta[name] = { src: url, integrity: SRI[url] };
  html = html.replace(`<script src="${url}" integrity="${SRI[url]}" crossorigin="anonymous"></script>\n`, '');
}
// El comentario del template sobre ExcelJS queda huérfano sin el <script>: se saca también.
html = html.replace(/<!-- ExcelJS:[\s\S]*?-->\n/, '');
html = html.replace('<meta name="viewport"', `<meta name="fg-libs" content='${JSON.stringify(_lazyMeta)}'>\n<meta name="viewport"`);

// ── CSP (Content-Security-Policy) ───────────────────────────────────────────
// GitHub Pages no deja mandar headers, así que va como <meta>. 'unsafe-inline'
// en script/style es inevitable (la app usa onclick/style inline en todo el
// HTML); el valor real está en cerrar las SALIDAS: connect-src e img-src son
// listas cerradas (nada puede mandar datos a un dominio ajeno), object-src
// 'none' y base-uri 'self'. Sólo va en index.html: index_export.html se abre
// desde file:// o desde el bucket y no tiene que quedar atado a estos orígenes.
// Nota esperable: pdf.js prueba `new Function` al rasterizar y cae a su ruta
// sin eval; el "Refused to evaluate" en consola es inofensivo.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net blob:",
  "worker-src blob:",
  "connect-src 'self' https://cajyjnxjbobdpltflgnb.supabase.co https://www.galicia.ar https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https://cajyjnxjbobdpltflgnb.supabase.co https://www.galicia.ar",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
// Tiene que ir ANTES del primer <script> para cubrirlos a todos.
html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + CSP_META);

// ── LAYOUT ID + oculto ─────────────────────────────────────────────────────
html = html.replace('<div class="layout">', '<div class="layout" id="layout" style="display:none">');

// ── HEADER con user info ────────────────────────────────────────────────────
// Anchor tolerante a la versión (5.5, 5.6, ...) para que el menú se inyecte
// aunque cambie el número de versión en una regeneración del HTML.
html = html.replace(
  /<h1>(Flyer Galicia[^<]*)<\/h1><\/header>/,
  // Tres solapas de primer nivel (no una dentro de la otra): "Flyer Galicia",
  // "Flyer Rubros" (mismo armador, opciones con el cartel "Beneficio exclusivo";
  // se muestra si el perfil tiene alguna opción de esa solapa) y "Promociones"
  // (oculta hasta que _applyFacultades la habilite por la facultad promos_buscar).
  // switchApp() las intercambia en auth.js.
  '<div class="header-text app-tab active" id="apptab-flyer" onclick="switchApp(\'flyer\')"><h1>$1</h1><span>ARMADOR</span></div>' +
  '<div class="header-text app-tab" id="apptab-rubros" style="display:none" onclick="switchApp(\'rubros\')"><h1>Flyer Rubros</h1><span>ARMADOR</span></div>' +
  '<div class="header-text app-tab" id="apptab-promos" style="display:none" onclick="switchApp(\'promos\')"><h1>Promociones</h1><span>BUSCADOR</span></div>' +
  '<div class="header-right" id="hdr-right" style="display:none">' +
  '<div class="hdr-user-menu">' +
    '<button class="hdr-user-btn" onclick="toggleUserMenu(event)"><span class="hdr-avatar" id="hdr-avatar"></span><span id="hdr-user"></span><span class="hdr-caret">&#9662;</span></button>' +
    '<div class="hdr-dropdown" id="hdr-dropdown">' +
      '<div class="hdr-dd-head"><div class="hdr-dd-name" id="hdr-dd-name"></div><div id="hdr-dd-role"></div></div>' +
      '<div class="hdr-dd-sep"></div>' +
      '<button class="hdr-dd-item" id="hdr-dd-pass" onclick="openMyPassModal();closeUserMenu()">' + ICO_LOCK + '<span>Cambiar mi clave</span></button>' +
      '<button class="hdr-dd-item" id="hdr-dd-theme" onclick="toggleTheme()">' + ICO_MOON + '<span>Modo oscuro</span></button>' +
      // Paleta (Marfil / Marino / Grafito / Cielo): la aplica setPalette (auth.js), clase t-* en <html>
      '<div class="hdr-dd-lbl">Tema</div><div class="hdr-dd-pal" id="hdr-dd-pal">' +
        '<button type="button" data-p="t-marfil" onclick="setPalette(\'t-marfil\')"><i style="background:#F7F4EE"></i>Marfil</button>' +
        '<button type="button" data-p="t-marino" onclick="setPalette(\'t-marino\')"><i style="background:#14213D"></i>Marino</button>' +
        '<button type="button" data-p="t-grafito" onclick="setPalette(\'t-grafito\')"><i style="background:#16181D"></i>Grafito</button>' +
        '<button type="button" data-p="t-cielo" onclick="setPalette(\'t-cielo\')"><i style="background:#2F6FED"></i>Cielo</button>' +
      '</div>' +
      '<button class="hdr-dd-item" id="hdr-dd-notes" onclick="openNotes();closeUserMenu()" style="display:none">' + ICO_DOC + '<span>Bloc de notas</span></button>' +
      // Mi padrón: subir Excel / editar en línea / descargar el padrón propio.
      // Lo muestra _applyFacultades a quien tenga la facultad padron_buscar.
      '<button class="hdr-dd-item" id="hdr-dd-padron" onclick="openMiPadron();closeUserMenu()" style="display:none">' + ICO_DB + '<span>Mi padr&oacute;n</span></button>' +
      // Tutorial guiado (para todos). El menú se cierra desde el propio tour.
      '<button class="hdr-dd-item" id="hdr-dd-tour" onclick="closeUserMenu();_tourStart()">' + ICO_HELP + '<span>Ver tutorial</span></button>' +
      '<div class="hdr-dd-sep"></div>' +
      '<button class="hdr-dd-item danger" onclick="doLogout()">' + ICO_OUT + '<span>Salir</span></button>' +
    '</div>' +
  '</div>' +
  '<button id="hdr-admin-btn" class="btn-hdr btn-hdr-admin" onclick="openAdminPanel()" style="display:none">' + _svgIco('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>') + ' Admin</button>' +
  '</div></header>'
);

// ── LOGIN OVERLAY ───────────────────────────────────────────────────────────
// Ilustración vectorial del ingreso (un flyer estilizado + tilde): SVG de ~1 KB,
// sin imágenes. El texto se apaga en celular (ver .login-hero en _newcss.txt).
const loginHeroArt = '<svg class="lh-art" viewBox="0 0 200 150" aria-hidden="true">'+
  '<rect x="110" y="18" width="82" height="130" rx="6" fill="#fff" opacity=".5"/>'+
  '<rect x="70" y="30" width="82" height="130" rx="6" fill="#fff" opacity=".96"/><rect class="a-acc" x="80" y="40" width="62" height="22" rx="3"/><rect class="a-line" x="80" y="70" width="62" height="5" rx="2"/><rect class="a-line" x="80" y="80" width="46" height="5" rx="2"/><rect class="a-ink" x="80" y="96" width="28" height="14" rx="3"/><rect class="a-acc" x="114" y="96" width="28" height="14" rx="3"/><rect x="80" y="118" width="62" height="4" rx="2" fill="#F5DCC3"/><rect x="80" y="126" width="50" height="4" rx="2" fill="#F5DCC3"/>'+
  '<circle class="a-ink" cx="52" cy="112" r="22"/><path d="M40 112l9 9 17-19" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const loginOverlay = `<div id="login-ov">
 <div class="login-shell">
  <div class="login-hero">
    <div class="lg-logo">${headerIso.replace('class="header-logo"','class="lg-iso"')}<span class="lg-word">Galicia</span></div>
    <h3>Tus flyers, listos en un minuto.</h3>
    ${loginHeroArt}
  </div>
  <div class="login-card">

    <div id="lv-login">
      <h2 class="login-card-title">Flyer Galicia</h2>
      <p class="login-card-sub">Ingres&aacute; con tu cuenta para continuar</p>
      <label class="login-lbl">Email</label>
      <input type="email" id="login-email" class="login-inp" placeholder="tu@bancogalicia.com.ar">
      <label class="login-lbl">Contrase&ntilde;a</label>
      <input type="password" id="login-pass" class="login-inp" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" onkeydown="if(event.key==='Enter')doLogin()">
      <div class="login-err" id="login-err"></div>
      <button class="login-submit" id="login-btn" onclick="doLogin()">Ingresar</button>
      <div class="login-links">
        <button class="login-link" onclick="showLoginView('forgot')">&#191;Olvidaste tu contrase&ntilde;a?</button>
        <button class="login-link" onclick="showLoginView('register')">Crear cuenta</button>
      </div>
    </div>

    <div id="lv-forgot" style="display:none">
      <h2 class="login-card-title">Recuperar contrase&ntilde;a</h2>
      <p class="login-card-sub">Eleg&iacute; una nueva contrase&ntilde;a. El cambio quedar&aacute; pendiente de aprobaci&oacute;n del administrador.</p>
      <label class="login-lbl">Email</label>
      <input type="email" id="forgot-email" class="login-inp" placeholder="tu@bancogalicia.com.ar">
      <label class="login-lbl">Nueva contrase&ntilde;a</label>
      <input type="password" id="forgot-pass" class="login-inp" placeholder="M&iacute;nimo 8 caracteres">
      <label class="login-lbl">Repetir nueva contrase&ntilde;a</label>
      <input type="password" id="forgot-pass2" class="login-inp" placeholder="Repet&iacute; la contrase&ntilde;a">
      <div class="login-err" id="forgot-err"></div>
      <div class="login-ok" id="forgot-ok"></div>
      <button class="login-submit" id="forgot-btn" onclick="doForgotPassword()">Solicitar cambio</button>
      <div class="login-links" style="justify-content:center">
        <button class="login-link" onclick="showLoginView('login')">&larr; Volver al inicio de sesi&oacute;n</button>
      </div>
    </div>

    <div id="lv-register" style="display:none">
      <h2 class="login-card-title">Crear cuenta</h2>
      <p class="login-card-sub">Tu acceso queda pendiente de aprobaci&oacute;n del administrador</p>
      <label class="login-lbl">Nombre completo</label>
      <input type="text" id="reg-name" class="login-inp" placeholder="Tu nombre y apellido">
      <label class="login-lbl">Email</label>
      <input type="email" id="reg-email" class="login-inp" placeholder="tu@bancogalicia.com.ar">
      <label class="login-lbl">Contrase&ntilde;a</label>
      <input type="password" id="reg-pass" class="login-inp" placeholder="M&iacute;nimo 8 caracteres">
      <div class="login-err" id="reg-err"></div>
      <div class="login-ok" id="reg-ok"></div>
      <button class="login-submit" id="reg-btn" onclick="doRegister()">Crear cuenta</button>
      <div class="login-links" style="justify-content:center">
        <button class="login-link" onclick="showLoginView('login')">&larr; Ya tengo cuenta</button>
      </div>
    </div>

  </div>
 </div>
</div>`;
// Aplica el tema guardado lo antes posible para evitar parpadeo (flash) al cargar.
const themeBoot = `<script>try{var _h=document.documentElement;if(localStorage.getItem('fg_theme')==='dark')_h.classList.add('dark');var _p=localStorage.getItem('fg_palette');_h.classList.add(/^t-(marfil|marino|grafito|cielo)$/.test(_p||'')?_p:'t-marfil');}catch(e){document.documentElement.classList.add('t-marfil');}</script>`;
html = html.replace('<body>', '<body>\n' + themeBoot + '\n' + loginOverlay);

// ── ADMIN PANEL ─────────────────────────────────────────────────────────────
const adminPanel = `<div id="admin-panel">
  <div class="ap-header">
    <h2 class="ap-title">&#9881; Panel Administrador</h2>
    <button class="ap-close" onclick="closeAdminPanel()">&#10005;</button>
  </div>
  <div class="atabs">
    <div class="atab active" data-group="admin" onclick="switchAdminGroup(this,'admin')">Admin</div>
    <div class="atab" data-group="data" onclick="switchAdminGroup(this,'data')">Data</div>
    <div class="atab" data-group="config" onclick="switchAdminGroup(this,'config')">Config</div>
  </div>
  <div class="stabs" id="sg-admin">
    <div class="stab active" data-tab="dashboard" onclick="switchAdminTab(this,'dashboard')">Dashboard</div>
    <div class="stab" data-tab="usuarios" onclick="switchAdminTab(this,'usuarios')">Usuarios</div>
    <div class="stab" data-tab="registros" onclick="switchAdminTab(this,'registros')">Registros</div>
    <div class="stab" data-tab="facultades" onclick="switchAdminTab(this,'facultades')">Facultades</div>
  </div>
  <div class="stabs" id="sg-data" style="display:none">
    <div class="stab" data-tab="varios" onclick="switchAdminTab(this,'varios')">Mi padr&oacute;n</div>
    <div class="stab" data-tab="padronotros" onclick="switchAdminTab(this,'padronotros')">Padr&oacute;n Asesores</div>
    <div class="stab" data-tab="padronlog" onclick="switchAdminTab(this,'padronlog')">Cambios del padr&oacute;n</div>
  </div>
  <div class="stabs" id="sg-config" style="display:none">
    <div class="stab" data-tab="subir" onclick="switchAdminTab(this,'subir')">Flyer</div>
    <div class="stab" data-tab="cashback" onclick="switchAdminTab(this,'cashback')">Cashback</div>
    <div class="stab" data-tab="legales" onclick="switchAdminTab(this,'legales')">Legales</div>
    <div class="stab" data-tab="opciones" onclick="switchAdminTab(this,'opciones')">Opciones</div>
  </div>
  <div class="ap-body">

    <div id="at-dashboard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <p class="ap-sec" style="margin:0">Resumen general</p>
        <button class="usr-btn ok" id="btn-export-excel" onclick="exportFlyerLogsExcel()" style="font-size:.72rem;padding:5px 10px">&#11015; Exportar Excel</button>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><span>Total usuarios</span><strong id="stat-total">&mdash;</strong></div>
        <div class="stat-card sc-green"><span>Activos</span><strong id="stat-active">&mdash;</strong></div>
        <div class="stat-card sc-red"><span>Admins</span><strong id="stat-admins">&mdash;</strong></div>
        <div class="stat-card sc-blue"><span>Flyers generados</span><strong id="stat-logs">&mdash;</strong></div>
        <div class="stat-card sc-yellow"><span>Pendientes aprobaci&oacute;n</span><strong id="stat-pending">&mdash;</strong></div>
      </div>
      <p class="ap-sec" style="margin-top:20px">&Uacute;ltimos accesos</p>
      <div id="recent-logins"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
      <p class="ap-sec" style="margin-top:20px">Flyers recientes &mdash; qui&eacute;n gener&oacute; cada uno</p>
      <div id="recent-flyers"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
    </div>

    <div id="at-usuarios" style="display:none">
      <div class="usr-toolbar">
        <p class="ap-sec" style="margin:0">Usuarios del sistema</p>
        <button class="btn-new-usr" onclick="openNewUser()">+ Nuevo usuario</button>
      </div>
      <div class="usr-search-bar">
        <input type="text" id="usr-search" class="usr-search-inp" placeholder="Buscar por nombre o email..." oninput="filterUsers()">
        <select id="usr-filter" class="usr-filter-sel" onchange="filterUsers()">
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="pending">Pendientes</option>
          <option value="reset_pending">Cambio de clave</option>
        </select>
      </div>
      <div id="users-list"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
    </div>

    <div id="at-subir" style="display:none">
      <p class="ap-sec">Subir nueva versi&oacute;n del flyer</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:16px;line-height:1.5">Sub&iacute; el <strong>PDF limpio</strong> del flyer (sin los datos que completa cada asesor) &mdash; tambi&eacute;n vale PNG/JPG. Te pregunta a <strong>qu&eacute; opci&oacute;n</strong> va (las de Flyer Galicia y las de Flyer Rubros, seg&uacute;n Config &rarr; Opciones), se convierte solo y se abre el <strong>calibrador</strong> de esa opci&oacute;n para acomodar las zonas arrastrando. Para una opci&oacute;n de <strong>Flyer Rubros</strong> el PDF viene adem&aacute;s con el <strong>cuadro del beneficio vac&iacute;o</strong> (s&oacute;lo el dibujo del surtidor/changuito, sin ninguna l&iacute;nea de texto): la app escribe todo el cuadro con la misma letra, y en el calibrador eleg&iacute;s la plantilla del rubro (Combustible / Supermercado), ajust&aacute;s textos y tama&ntilde;os y arrastr&aacute;s las l&iacute;neas. Qu&eacute; opci&oacute;n ve cada perfil se define en Admin &rarr; Facultades. El HTML del build (<strong>index_export.html</strong>) tambi&eacute;n sirve como antes.</p>
      <div id="upload-drop" class="upload-drop"
        onclick="document.getElementById('upload-file').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="this.classList.remove('drag-over');handleFileDrop(event)">
        <div class="upload-icon">&#128196;</div>
        <p class="upload-hint">Hac&eacute; clic o arrastr&aacute; el <strong>PDF</strong> del flyer aqu&iacute;</p>
        <p class="upload-hint-sub">PDF, PNG, JPG o HTML &mdash; m&aacute;x. 25 MB</p>
      </div>
      <input type="file" id="upload-file" accept=".pdf,.png,.jpg,.jpeg,.html,application/pdf,image/*,text/html" style="display:none" onchange="handleFileSelect(this)">
      <div class="login-err" id="upload-err" style="margin-top:8px"></div>
      <div class="login-ok" id="upload-ok" style="margin-top:8px"></div>
      <div id="upload-progress" style="display:none;margin-top:10px">
        <div class="upload-prog"><div class="upload-prog-bar" id="upload-bar"></div></div>
        <p style="font-size:.72rem;color:var(--gray);margin-top:4px" id="upload-pct">0%</p>
      </div>
      <div id="upload-result" class="upload-result-box" style="display:none">
        <p style="font-size:.7rem;color:var(--gray);margin-bottom:2px">URL p&uacute;blica:</p>
        <a id="upload-url" href="#" target="_blank" class="upload-result-url"></a>
        <div style="display:flex;gap:8px">
          <button class="usr-btn ok" onclick="copyUploadUrl()">Copiar URL</button>
          <button class="usr-btn edit" onclick="downloadUploaded()">Descargar</button>
        </div>
      </div>
      <div id="upload-history" style="margin-top:20px"></div>
    </div>

    <div id="at-registros" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <p class="ap-sec" style="margin:0">Registros de flyers generados</p>
        <button class="usr-btn ok" id="btn-export-reg" onclick="exportRegistros()" style="font-size:.72rem;padding:5px 12px">&#11015; Exportar Excel</button>
      </div>
      <div class="reg-filter">
        <div class="reg-filter-group">
          <label>Empresa</label>
          <input type="text" id="reg-q-empresa" placeholder="Filtrar empresa...">
        </div>
        <div class="reg-filter-group">
          <label>Usuario</label>
          <input type="text" id="reg-q-user" placeholder="Filtrar usuario...">
        </div>
        <div class="reg-filter-group">
          <label>Desde</label>
          <input type="date" id="reg-q-from">
        </div>
        <div class="reg-filter-group">
          <label>Hasta</label>
          <input type="date" id="reg-q-to">
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <button class="btn-submit" onclick="loadRegistros()" style="padding:7px 14px;font-size:.72rem">Buscar</button>
          <button class="btn-cancel" onclick="document.getElementById('reg-q-empresa').value='';document.getElementById('reg-q-user').value='';document.getElementById('reg-q-from').value='';document.getElementById('reg-q-to').value='';loadRegistros();" style="padding:7px 10px;font-size:.72rem">&#10005;</button>
        </div>
      </div>
      <p style="font-size:.68rem;color:var(--gray);margin-bottom:8px" id="reg-count"></p>
      <div id="registros-list"></div>
    </div>

    <div id="at-legales" style="display:none">
      <p class="ap-sec">T&eacute;rminos y condiciones (legal global)</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:12px;line-height:1.5">Cada <strong>opci&oacute;n del armador tiene su propio legal</strong>, guardado por separado. Pod&eacute;s <strong>pegar desde Word/PDF/web y las negritas se mantienen</strong> (se marcan con **). Guard&aacute; para impactar a todos los usuarios de esa opci&oacute;n; cada asesor puede despu&eacute;s ajustar la fecha o alg&uacute;n dato en su pantalla.<br><br><strong>Marcadores (Flyer Rubros):</strong> dentro del legal pod&eacute;s escribir <code>{importe}</code>, <code>{importe2}</code> (el segundo tope, cuadro &laquo;Ambos&raquo;), <code>{total}</code> (la suma de los dos topes) y <code>{empresa}</code>: al armar cada flyer se reemplazan por los valores cargados, as&iacute; el legal siempre dice el mismo tope que el cartel sin editarlo a mano. Ejemplo: <code>&hellip; es de {importe} en Supermercados y {importe2} en Combustibles. Tope mensual total de {total}.</code></p>
      <!-- Una sub-solapa y un editor por opción: los arma _legalesRender() (auth.js)
           a partir de la lista de opciones (Config → Opciones), con los mismos ids
           de siempre: lt-N, glegal-text[N], glegal-err[N], glegal-ok[N]. -->
      <div class="stabs stabs-in" id="legales-tabs" style="margin-bottom:14px"></div>
      <div id="legales-panes"></div>
    </div>

    <div id="at-opciones" style="display:none">
      <p class="ap-sec">Opciones del armador</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:14px;line-height:1.5">Cada opci&oacute;n es un <strong>armador completo</strong>: tiene su propio flyer activo, su propio legal y su calibraci&oacute;n. Ac&aacute; agreg&aacute;s opciones nuevas y les pon&eacute;s nombre y color. Al agregar una, <strong>aparece sola en Facultades</strong> (para decidir qu&eacute; perfil la ve), en Legales, en Subir flyer y en el selector del armador. La <strong>Opci&oacute;n 1</strong> es la de todos los asesores y no se puede quitar.<br><br>El selector <strong>Solapa</strong> dice en qu&eacute; solapa del header vive la opci&oacute;n: <strong>Flyer Galicia</strong> (el armador de siempre) o <strong>Flyer Rubros</strong> (el mismo armador, pero el flyer trae el cuadro &laquo;&iexcl;Beneficio exclusivo EMPRESA!&raquo; con un tope de reintegro editable: combustible, supermercado, etc.). Para sumar un rubro nuevo: agreg&aacute;s la opci&oacute;n, la pon&eacute;s en Flyer Rubros, sub&iacute;s su PDF limpio (con el cuadro del beneficio vac&iacute;o) y lo calibr&aacute;s: el calibrador elige la plantilla por el nombre de la opci&oacute;n (Combustible, Supermercado o Ambos = las dos columnas con dos topes) y centra el cartel solo. La solapa Flyer Rubros aparece en el header de cada perfil que tenga habilitada al menos una de esas opciones.</p>
      <div id="opciones-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="usr-btn edit" onclick="_opcAgregar()">+ Agregar opci&oacute;n</button>
        <button class="btn-submit" id="opciones-save" onclick="_opcGuardar()" style="padding:8px 16px">Guardar cambios</button>
        <button class="usr-btn edit" onclick="renderOpcionesAdmin(true)">Recargar</button>
      </div>
      <p style="font-size:.72rem;color:var(--gray);margin-top:10px;line-height:1.5">Quitar una opci&oacute;n la saca de la vista de todos, pero <strong>no borra</strong> su flyer ni su legal guardados: si la volv&eacute;s a agregar con el mismo n&uacute;mero, reaparecen.</p>
    </div>

    <div id="at-facultades" style="display:none">
      <p class="ap-sec">Facultades por perfil</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:14px;line-height:1.5">Tild&aacute; qu&eacute; <strong>funcionalidades</strong> tiene cada perfil. Al guardar, el cambio impacta para todos los usuarios de ese perfil la pr&oacute;xima vez que entren.<br><br>La columna <strong>Vos</strong> es <strong>tu propia cuenta</strong>: destild&aacute; lo que no uses (por ejemplo, una opci&oacute;n del armador que no te sirve) y la app se te simplifica. No afecta al otro administrador ni al Panel Administrador, que siempre queda disponible; pod&eacute;s volver a tildarlo cuando quieras.<br><br>Toc&aacute; el <strong>nombre de un perfil</strong> (Asesor, VIP, Pro) para <strong>ver la app tal cual la ve ese perfil</strong>, sin salir de tu sesi&oacute;n. Para volver, us&aacute; el bot&oacute;n de la barra de abajo.<br><br>Esto controla <strong>qu&eacute; ve y qu&eacute; puede usar cada uno en la pantalla</strong>. Las acciones sensibles (crear o borrar usuarios, cambiar la configuraci&oacute;n global) siguen siendo exclusivas del administrador y las controla el servidor.</p>
      <div id="fac-grid"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn-submit" id="fac-save" onclick="saveFacultadesChanges()" style="padding:8px 16px">Guardar cambios</button>
        <button class="usr-btn edit" onclick="loadFacultades(true,renderFacultades)">Recargar</button>
      </div>
    </div>

    <div id="at-cashback" style="display:none">
      <p class="ap-sec">Montos de cashback</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:14px;line-height:1.5">Cada tarjeta es una <strong>configuraci&oacute;n de cashback</strong> con sus 4 montos. Pod&eacute;s <strong>agregar</strong> configs nuevas (Config 5, 6&hellip;) o <strong>quitar</strong> las que ya no se usen, y <strong>doble click en el t&iacute;tulo</strong> para cambiarle el nombre. Al guardar, el cambio <strong>impacta para todos los usuarios</strong> la pr&oacute;xima vez que entren o generen un flyer: los botones del armador, el masivo y el padr&oacute;n se adaptan solos. BAU es la de fallback y siempre queda.</p>
      <div id="cashback-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="usr-btn edit" onclick="_cbAgregar()">+ Agregar config</button>
        <button class="btn-submit" id="cashback-save" onclick="saveCashbackChanges()" style="padding:8px 16px">Guardar cambios</button>
        <button class="usr-btn edit" onclick="loadCashback(true,renderCashbackAdmin)">Recargar</button>
      </div>
    </div>

    <div id="at-varios" style="display:none">
      <p class="ap-sec">Mi padr&oacute;n de empresas</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:14px;line-height:1.5"><strong>Este padr&oacute;n es tuyo.</strong> Nadie m&aacute;s puede editarlo: lo impide el servidor, no el navegador. Cada usuario con la facultad de padr&oacute;n tiene el suyo, separado del tuyo. Un administrador puede consultar (nunca modificar) el padr&oacute;n de los asesores; el de un administrador no lo ve ni siquiera el otro administrador.<br><br>Sub&iacute; un Excel con las empresas precargadas (raz&oacute;n social, CUIT, cashback y hasta 4 asesores). Despu&eacute;s, en el armador, la <strong>lupa al lado de "Nombre de la empresa"</strong> busca por <strong>raz&oacute;n social o CUIT</strong> y completa todo de una. Si la empresa es un <strong>grupo con varios CUIT</strong>, pon&eacute;los en la misma celda separados por coma: buscando cualquiera de ellos aparece la empresa.<br><br>El padr&oacute;n <strong>no se retroalimenta</strong> con los flyers que se van generando: s&oacute;lo cambia cuando sub&iacute;s un Excel nuevo, as&iacute; el archivo de tu computadora sigue siendo el original. Es <strong>el mismo formato que la plantilla del masivo</strong> m&aacute;s la columna <code>cuit</code>, con lo cual el mismo archivo te sirve para las dos cosas.<br><br><strong>Cashback:</strong> la columna se llama <code>config</code> y acepta el nombre de cualquier configuraci&oacute;n que exista en Config &rarr; Cashback (<code>BAU</code>, <code>Config 1</code>, <code>Config 2</code>&hellip;; tambi&eacute;n vale escribir s&oacute;lo el n&uacute;mero). Si la celda queda <strong>vac&iacute;a</strong> (o dice algo que no reconozco), esa empresa sale <strong>sin cashback</strong>: el flyer se genera con los importes en blanco. As&iacute; se marcan las pocas empresas a las que no les corresponde. Al subir el Excel te muestro un informe con todo lo que detect&eacute;, antes de guardar nada.<br><br><strong>Beneficio por rubro (Flyer Rubros):</strong> columnas <code>rubro</code> (el nombre de una opci&oacute;n de Flyer Rubros: <code>Combustible</code>, <code>Supermercado</code>, <code>Ambos</code>&hellip; vac&iacute;a = sin rubro), <code>tope</code> (el tope de reintegro, ej. <code>24.000</code>) y <code>tope2</code> (s&oacute;lo para &laquo;Ambos&raquo;, si el tope de combustible difiere del de supermercado). Al elegir la empresa con la lupa se completan los topes, y si est&aacute;s armando el flyer en la solapa equivocada te aviso y te ofrezco cambiar. Al generar un flyer de Rubros para una empresa del padr&oacute;n, te propongo guardarle el rubro.<br><br><strong>Generar flyers:</strong> desde el bot&oacute;n &laquo;Generar flyers&raquo; eleg&iacute;s empresas del padr&oacute;n (o todas) y baj&aacute;s un ZIP con el flyer de cada una en <strong>su formato</strong>: el armador com&uacute;n, o Flyer Rubros seg&uacute;n el rubro cargado, con sus oficiales, cashback y topes. El ZIP viene ordenado en una carpeta por formato, con un <code>Resumen.txt</code>, y al terminar te muestro cu&aacute;ntos salieron de cada uno y qu&eacute; observaciones hubo.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn-submit" onclick="document.getElementById('padron-xls').click()" style="padding:8px 16px">&#8593; Subir Excel</button>
        <button class="usr-btn edit" id="padron-edit-btn" onclick="togglePadronEditor()">&#9998; Editar en l&iacute;nea</button>
        <button class="usr-btn edit" onclick="dlPadron()">&#11015; Descargar padr&oacute;n</button>
        <button class="usr-btn edit" onclick="dlPadronTemplate()">&#11015; Plantilla vac&iacute;a</button>
        <button class="usr-btn edit" id="padron-gen-btn" onclick="_pgToggle()">&#9889; Generar flyers</button>
        <button class="usr-btn edit" onclick="renderPadronAdmin(true)">Recargar</button>
        <input type="file" id="padron-xls" accept=".xlsx,.xls" style="display:none" onchange="importPadron(this)">
      </div>
      <p style="font-size:.76rem;color:var(--gray);margin-bottom:12px" id="padron-stat"></p>
      <div id="padron-view-normal">
        <input type="text" id="padron-q" class="login-inp" placeholder="Probar el buscador: raz&oacute;n social o CUIT..." autocomplete="off" oninput="renderPadronAdmin()" style="margin-bottom:0">
        <div id="padron-prev"></div>
      </div>
      <div id="padron-editor" style="display:none"></div>
      <div id="padron-gen" style="display:none"></div>
    </div>

    <div id="at-padronotros" style="display:none">
      <p class="ap-sec">Padr&oacute;n de otros usuarios</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:14px;line-height:1.5">Cada usuario tiene su <strong>padr&oacute;n privado</strong>: nadie puede ver ni editar el de otro. Desde ac&aacute; pod&eacute;s <strong>consultar y descargar</strong> el de los asesores, VIP y Pro, pero <strong>no modificarlo</strong>.<br><br>El padr&oacute;n de un administrador es privado incluso para los dem&aacute;s administradores, as&iacute; que no aparece en esta lista.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <select id="po-user" class="login-inp" style="margin-bottom:0;max-width:320px" onchange="renderPadronOtros()">
          <option value="">Eleg&iacute; un usuario...</option>
        </select>
        <button class="usr-btn edit" id="po-dl" onclick="dlPadronDe()" style="display:none">&#11015; Descargar Excel</button>
        <button class="usr-btn edit" onclick="loadPadronOtrosUsers(true)">Recargar</button>
      </div>
      <p style="font-size:.76rem;color:var(--gray);margin-bottom:12px" id="po-stat"></p>
      <input type="text" id="po-q" class="login-inp" placeholder="Filtrar: raz&oacute;n social o CUIT..." autocomplete="off" oninput="renderPadronOtrosList()" style="margin-bottom:0;display:none">
      <div id="po-list"></div>
    </div>

    <div id="at-padronlog" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <p class="ap-sec" style="margin:0">Cambios del padr&oacute;n</p>
        <button class="usr-btn ok" id="btn-export-plog" onclick="exportPadronLog()" style="font-size:.72rem;padding:5px 12px">&#11015; Exportar Excel</button>
      </div>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:12px;line-height:1.5">Cada vez que alguien guarda su padr&oacute;n (subiendo un Excel, con el editor en l&iacute;nea o desde el armador), queda constancia de <strong>qu&eacute; empresas se agregaron, cu&aacute;les se modificaron</strong> (y qu&eacute; cambi&oacute;: CUIT, cashback u oficiales) <strong>y cu&aacute;les se borraron</strong>, con fecha, hora y qui&eacute;n lo hizo. Un cambio de raz&oacute;n social aparece como una baja m&aacute;s un alta. Ves tus propios cambios y los de asesores, VIP y Pro; los de otro administrador no.</p>
      <div class="reg-filter">
        <div class="reg-filter-group">
          <label>Usuario</label>
          <input type="text" id="plog-q-user" placeholder="Filtrar usuario...">
        </div>
        <div class="reg-filter-group">
          <label>Empresa</label>
          <input type="text" id="plog-q-empresa" placeholder="Filtrar empresa...">
        </div>
        <div class="reg-filter-group">
          <label>Acci&oacute;n</label>
          <select id="plog-q-accion">
            <option value="">Todas</option>
            <option value="alta">Altas</option>
            <option value="modificacion">Modificaciones</option>
            <option value="baja">Bajas</option>
          </select>
        </div>
        <div class="reg-filter-group">
          <label>Desde</label>
          <input type="date" id="plog-q-from">
        </div>
        <div class="reg-filter-group">
          <label>Hasta</label>
          <input type="date" id="plog-q-to">
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <button class="btn-submit" onclick="loadPadronLog()" style="padding:7px 14px;font-size:.72rem">Buscar</button>
          <button class="btn-cancel" onclick="['plog-q-user','plog-q-empresa','plog-q-accion','plog-q-from','plog-q-to'].forEach(function(i){document.getElementById(i).value='';});loadPadronLog();" style="padding:7px 10px;font-size:.72rem">&#10005;</button>
        </div>
      </div>
      <p style="font-size:.68rem;color:var(--gray);margin-bottom:8px" id="plog-count"></p>
      <div id="plog-list"></div>
    </div>

  </div>
</div>`;

const userModal = `<div id="user-modal">
  <div class="um-card">
    <div class="um-header">
      <h3 id="um-title">Nuevo usuario</h3>
      <button class="ap-close" onclick="closeUserModal()">&#10005;</button>
    </div>
    <div class="um-body">
      <div class="um-grid">
        <div>
          <label class="login-lbl">Nombre completo</label>
          <input type="text" id="um-name" class="login-inp" placeholder="Juan P&eacute;rez">
        </div>
        <div>
          <label class="login-lbl">Email</label>
          <input type="email" id="um-email" class="login-inp" placeholder="juan@banco.com">
        </div>
        <div id="um-pass-wrap">
          <label class="login-lbl">Contrase&ntilde;a</label>
          <input type="password" id="um-pass" class="login-inp" placeholder="M&iacute;nimo 8 caracteres">
        </div>
        <div>
          <label class="login-lbl">Rol</label>
          <select id="um-role" class="login-inp">
            <option value="asesor">Asesor</option>
            <option value="vip">VIP</option>
            <option value="pro">Pro</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div class="um-full">
          <label class="login-lbl">Estado</label>
          <select id="um-status" class="login-inp" style="width:50%">
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>
      </div>
    </div>
    <div id="um-err" class="um-err"></div>
    <div class="um-footer">
      <button class="btn-cancel" onclick="closeUserModal()">Cancelar</button>
      <button id="um-submit" class="btn-submit" onclick="submitUser()">Crear usuario</button>
    </div>
  </div>
</div>`;

const passModal = `<div id="pass-modal">
  <div class="um-card" style="width:420px">
    <div class="um-header">
      <h3>Cambiar mi contrase&ntilde;a</h3>
      <button class="ap-close" onclick="closeMyPassModal()">&#10005;</button>
    </div>
    <div class="um-body">
      <div class="um-grid">
        <div class="um-full">
          <label class="login-lbl">Contrase&ntilde;a actual</label>
          <input type="password" id="mp-cur" class="login-inp" placeholder="Tu contrase&ntilde;a actual">
        </div>
        <div class="um-full">
          <label class="login-lbl">Nueva contrase&ntilde;a</label>
          <input type="password" id="mp-new" class="login-inp" placeholder="M&iacute;nimo 8 caracteres">
        </div>
        <div class="um-full">
          <label class="login-lbl">Repetir nueva contrase&ntilde;a</label>
          <input type="password" id="mp-new2" class="login-inp" placeholder="Repet&iacute; la nueva contrase&ntilde;a" onkeydown="if(event.key==='Enter')submitMyPass()">
        </div>
      </div>
    </div>
    <div id="mp-err" class="um-err"></div>
    <div id="mp-ok" class="mp-ok"></div>
    <div class="um-footer">
      <button class="btn-cancel" onclick="closeMyPassModal()">Cancelar</button>
      <button id="mp-submit" class="btn-submit" onclick="submitMyPass()">Cambiar contrase&ntilde;a</button>
    </div>
  </div>
</div>`;

const notesModal = `<div id="notes-modal">
  <div class="um-card notes-card">
    <div class="um-header">
      <h3>&#128221; Bloc de notas</h3>
      <button class="ap-close" onclick="closeNotes()">&#10005;</button>
    </div>
    <div class="notes-body">
      <div class="notes-side">
        <button class="notes-new" onclick="newNote()">+ Nueva nota</button>
        <div id="notes-list"></div>
      </div>
      <div class="notes-main">
        <input type="text" id="note-title" class="login-inp note-title-inp" placeholder="T&iacute;tulo de la nota" oninput="_noteEdit(true)">
        <textarea id="note-body" class="login-inp note-body-inp" placeholder="Escrib&iacute; ac&aacute; legales, datos fijos o recordatorios..." oninput="_noteEdit(false)"></textarea>
        <div class="notes-foot">
          <div class="notes-foot-left">
            <button class="usr-btn note-move" onclick="moveNote(-1)" title="Subir esta nota">&#8593;</button>
            <button class="usr-btn note-move" onclick="moveNote(1)" title="Bajar esta nota">&#8595;</button>
            <span id="notes-status" class="mp-ok" style="padding:0"></span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="usr-btn warn" onclick="deleteNote()">&#128465; Eliminar</button>
            <button class="usr-btn edit" onclick="copyNotes()">&#128203; Copiar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

const toastEl = `<div id="toast"></div>`;

const adminBackdrop = `<div id="admin-backdrop" onclick="closeAdminPanel()"></div>`;
html = html.replace('</body>', adminBackdrop + '\n' + adminPanel + '\n' + userModal + '\n' + passModal + '\n' + notesModal + '\n' + toastEl + '\n</body>');

// ── ZOOM TOOLBAR EN EL PREVIEW ───────────────────────────────────────────────
html = html.replace(
  '<div class="cw"><canvas id="cv"></canvas></div>',
  '<div class="zoom-bar">' +
  '<button class="zoom-btn" onclick="zoomOut()" title="Alejar">&#8722;</button>' +
  '<span class="zoom-pct" id="zoom-pct">100%</span>' +
  '<button class="zoom-btn" onclick="zoomIn()" title="Acercar">&#43;</button>' +
  '<button class="zoom-btn" onclick="zoomReset()" title="Restablecer zoom" style="font-size:.75rem">&#10226;</button>' +
  '</div>' +
  '<div class="cw"><canvas id="cv"></canvas></div>'
);

// ── LOG FLYER AL GENERAR (PDF/PNG) ───────────────────────────────────────────
html = html.replace(
  'pdf.save(fn+".pdf");\n  addHistory(v,fn,fc);',
  'pdf.save(fn+".pdf");\n  addHistory(v,fn,fc);\n  if(typeof logFlyerToSupabase==="function")logFlyerToSupabase(v,fn||"","pdf");'
);
html = html.replace(
  'a.download=fn+".png";a.href=fc.toDataURL("image/png");a.click();\n  addHistory(v,fn,fc);',
  'a.download=fn+".png";a.href=fc.toDataURL("image/png");a.click();\n  addHistory(v,fn,fc);\n  if(typeof logFlyerToSupabase==="function")logFlyerToSupabase(v,fn||"","png");'
);

// ── REDRAW CON ALTA CALIDAD ──────────────────────────────────────────────────
html = html.replace(
  'function redraw(){\n  ctx.clearRect(0,0,cv.width,cv.height);\n  drawAll(ctx,SC,getVals());\n}',
  'function redraw(){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.clearRect(0,0,cv.width,cv.height);drawAll(ctx,SC,getVals());}'
);

// ── CANVAS DINAMICO ─────────────────────────────────────────────────────────
// Reemplazar baseImg.onload para usar calcSC (definida en auth.js)
const oldOnload = `baseImg.onload=function(){
  cv.width=Math.round(baseImg.width*SC);
  cv.height=Math.round(baseImg.height*SC);
  redraw();
  updateFnPreview();
};`;
const newOnload = `baseImg.onload=function(){
  calcSC();
  redraw();
  updateFnPreview();
};
window.addEventListener('resize', function(){
  if(baseImg.complete && baseImg.naturalWidth){ calcSC(); redraw(); }
});`;
html = html.replace(oldOnload, newOnload);

// ── initApp en DOMContentLoaded ─────────────────────────────────────────────
html = html.replace(
  'document.addEventListener("DOMContentLoaded", function(){',
  'document.addEventListener("DOMContentLoaded", function(){ initApp();'
);

// ── VERIFICACIONES ──────────────────────────────────────────────────────────
const _authSrc = readFileSync('auth.js', 'utf8');
// ── CACHE-BUSTING de auth.js ────────────────────────────────────────────────
// GitHub Pages sirve auth.js con Cache-Control: max-age=600, así que el navegador
// se quedaba hasta 10 min con la versión vieja (y el usuario "no veía" los cambios
// recién deployados). Le cuelgo un hash del contenido: cambia sólo cuando cambia
// auth.js, y fuerza la descarga al toque.
const _authHash = createHash('sha1').update(_authSrc).digest('hex').slice(0, 10);
const AUTH_TAG = `<script src="auth.js?v=${_authHash}"></script>`;
html = html.replace('<script src="auth.js"></script>', AUTH_TAG);
// ── AVISO DE VERSIÓN NUEVA ──────────────────────────────────────────────────
// El hash de arriba no alcanza: index.html TAMBIÉN se cachea 10 min, y el viejo
// apunta al auth.js viejo (mordió 3 veces: el admin "seguía viendo" código ya
// deployado). La app compara esta meta con version.json (pedido sin caché; SIN
// guion bajo: GitHub Pages/Jekyll no sirve archivos que empiezan con "_") y,
// si difieren, ofrece recargar con ?v=nuevo, que saltea el index.html cacheado.
const BUILD_V = createHash('sha1').update(html + _authSrc).digest('hex').slice(0, 10);
html = html.replace('<meta name="viewport"', `<meta name="build-v" content="${BUILD_V}">\n<meta name="viewport"`);
// index_export.html se deriva de html: auth.js inlineado y SIN la meta CSP.
const exportHtml = html
  // Reemplazo por FUNCIÓN: con un string, "$'" / "$&" dentro de auth.js (ej. el
  // '$'+importe del cartel de Rubros) se interpretan como patrones de replace y
  // duplican el resto del HTML (el export pasó de 2,2 a 4,1 MB sin que nadie lo note).
  .replace(AUTH_TAG, () => '<script>\n' + _authSrc + '\n</script>')
  .replace(CSP_META + '\n', '');
const _htmlLenConImagen = html.length;
// ── IMAGEN BASE FUERA DE index.html ─────────────────────────────────────────
// El template trae el flyer de ejemplo incrustado en base64 (~1,75 MB, más que
// todas las librerías juntas). La app lo descarta al toque porque trae el flyer
// activo desde Supabase, así que en index.html se saca y se guarda aparte como
// flyer_default.jpg: se carga SOLO si no hay flyer activo (fallback, ver auth.js).
// index_export.html lo conserva: sigue valiendo para subirlo como flyer (activateFlyer
// extrae la imagen de ahí) y para usarlo standalone.
const _imgRe = /baseImg\.src="data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)";?/;
const _imgM = html.match(_imgRe);
let _imgBuf = null, _imgFile = '';
if (_imgM) {
  _imgBuf = Buffer.from(_imgM[2], 'base64');
  _imgFile = 'flyer_default.' + (_imgM[1] === 'jpeg' ? 'jpg' : _imgM[1]);
  html = html.replace(_imgRe, () => `baseImg.dataset.fallback="${_imgFile}";`);
}
const _cdnTags = html.match(/<script src="https:\/\/[^"]+"[^>]*>/g) || [];
const checks = {
  'CSS full-screen': html.includes('height:100vh;overflow:hidden'),
  'layout height': html.includes('height:calc(100vh - 62px)'),
  'panel height': html.includes('.panel{') && html.includes('overflow-y:auto;height:100%;}'),
  'Supabase SDK (version fija)': html.includes(SUPABASE_JS_URL) && /supabase-js@\d+\.\d+\.\d+\//.test(SUPABASE_JS_URL),
  'auth.js': html.includes('<script src="auth.js?v='),
  'cache-busting auth.js': html.includes('auth.js?v=') && !html.includes('<script src="auth.js"></script>'),
  // ── Seguridad del front (SRI + CSP) ──
  'SRI: todos los scripts CDN con integrity': _cdnTags.length >= 1 && _cdnTags.every(t => /integrity="sha384-[A-Za-z0-9+/=]+"/.test(t) && t.includes('crossorigin="anonymous"')) && _scriptsSinSri.length === 0,
  'libs de exportacion bajo demanda (fuera del head, con SRI en la meta)': Object.values(LAZY_LIBS).every(u => !html.includes(`<script src="${u}"`)) && html.includes(`<meta name="fg-libs" content='`) && Object.values(_lazyMeta).every(l => /^sha384-/.test(l.integrity)) && _authSrc.includes("meta[name=fg-libs]") && _authSrc.includes('function _libWrap(') && ['savePDF', 'genAll', 'dlTemplate', 'loadExcel', 'importAsesores', 'importPadron', 'exportRegistros', 'exportPadronLog', 'exportFlyerLogsExcel', 'descargarExcelPromos', '_padXlsx', '_pgGenerarRows'].every(f => _authSrc.includes(`_libWrap('${f}'`)),
  'SRI: pdf.js dinamico con integrity': _authSrc.includes("s.integrity='sha384-") && _authSrc.includes('fetch(wsrc,{integrity:wsri'),
  'CSP: en index.html, no en export': html.includes(CSP_META) && html.indexOf(CSP_META) < html.indexOf('<script src=') && !exportHtml.includes('Content-Security-Policy'),
  'export: auth.js inlineado': !exportHtml.includes('auth.js?v=') && !_authSrc.includes('</script>'),
  // Un "$'" en auth.js duplicaba el resto del HTML dentro del export (patrón de String.replace)
  'export: sin HTML duplicado (una sola imagen base, un solo auth.js)': (exportHtml.match(/baseImg\.src="data:image/g) || []).length === 1 && (exportHtml.match(/function _installFlyerEngine\(/g) || []).length === 1 && exportHtml.length < _htmlLenConImagen + _authSrc.length + 200,
  // La imagen de ejemplo del template no viaja en index.html: queda en flyer_default.jpg
  // y la app la carga sólo si no hay flyer activo (index_export.html sí la conserva).
  'imagen base fuera de index.html (fallback flyer_default)': !!_imgBuf && _imgBuf.length > 100000 && !html.includes('baseImg.src="data:image') && html.includes(`baseImg.dataset.fallback="${_imgFile}"`) && html.length < 400000 && _authSrc.includes('baseImg.dataset.fallback'),
  // ── Hardening del cliente (auditoria 2026-09-11) ──
  'escape: helper con comillas': _authSrc.includes("replace(/\"/g,'&quot;').replace(/'/g,'&#39;')"),
  'escape: panel usuarios/registros': _authSrc.includes("_escHtml(u.full_name||mail||'Sin nombre')") && _authSrc.includes("_escHtml(row.empresa||'—')") && _authSrc.includes("_escHtml(row.empresa||'Sin empresa')"),
  'onclick solo con ids (versiones/eliminar)': _authSrc.includes('function _upAct(') && _authSrc.includes("onclick=\"_upDel(this,'+i+')\"") && _authSrc.includes("onclick=\"deleteUser(this,\\''+_escHtml(u.id)+'\\')\"") && !_authSrc.includes("deleteUpload(this,\\''+f.name"),
  'sesion: signOut si la cuenta no esta activa': _authSrc.includes("_sb.auth.signOut().catch(function(){});") && _authSrc.includes("if(event==='SIGNED_OUT'&&_me)"),
  'portapapeles: DOMParser': _authSrc.includes("new DOMParser().parseFromString(String(html||''),'text/html').body"),
  'excel: vista previa escapada': _authSrc.includes('function fgValidateExcel(') && _authSrc.includes('window.validateExcel=fgValidateExcel'),
  'toast: unico (debounce)': _authSrc.includes('function fgShowToast(') && _authSrc.includes('window.showToast=fgShowToast'),
  'promos: espera de catalogo en vuelo': _authSrc.includes('var _promosCatWaiters=') && _authSrc.includes('function _promosPedirDetalle(') && _authSrc.includes("typeof ExcelJS==='undefined'"),
  'registro: solo dominio del banco': _authSrc.includes('@bancogalicia\\.com\\.ar$/i.test(email)') && html.includes('placeholder="M&iacute;nimo 8 caracteres"'),
  'asesores guardados: slot 3/4': _authSrc.includes("var n=_gv('nombre'+sfx),c=_gv('celular'+sfx),m=_gv('email'+sfx);"),
  'layout hidden': html.includes('id="layout" style="display:none"'),
  'version: meta build-v + chequeo en auth.js': html.includes('<meta name="build-v" content="'+BUILD_V+'">') && _authSrc.includes("fetch('version.json?t=") && _authSrc.includes("meta[name=build-v]"),
  'login-ov': html.includes('id="login-ov"'),
  'admin-panel': html.includes('id="admin-panel"'),
  'calcSC': html.includes('calcSC()'),
  'initApp': html.includes('initApp()'),
  // ── Contrato de estructura que necesita auth.js (si algo da ✗, ese feature se rompe) ──
  'header menu (hdr-dropdown)': html.includes('id="hdr-dropdown"'),
  'modal clave': html.includes('id="pass-modal"'),
  'modal notas': html.includes('id="notes-modal"'),
  'campos asesor (nombre/nombre2)': html.includes('id="nombre"') && html.includes('id="nombre2"'),
  'campos empresa/celular/email': html.includes('id="empresa"') && html.includes('id="celular"') && html.includes('id="email"'),
  'titulos Asesor 1/2 (popover)': /Asesor\s*1/i.test(html) && /Asesor\s*2/i.test(html),
  'config setCfg': html.includes('setCfg('),
  'toggles a1/a2': html.includes('toggleA1(') && html.includes('toggleA2('),
  'legal-text': html.includes('id="legal-text"'),
  'loadExcel (override)': html.includes('loadExcel('),
  // ── Subida PDF/imagen + calibrador visual (viven en auth.js) ──
  'subir acepta PDF/img': html.includes('accept=".pdf') && html.includes('handleFileSelect'),
  'rasterizar PDF/img': _authSrc.includes('function _rasterizeFlyer(') && _authSrc.includes('_fgLoadPdfJs'),
  // CRITICO: sin bandas, los PDFs con soft masks salen con media pagina en blanco
  'render PDF en bandas': _authSrc.includes('function _renderPageBanded(') && _authSrc.includes('transform:[1,0,0,1,0,-y0]'),
  'calibrador visual': _authSrc.includes('function _calOpen(') && _authSrc.includes('function _calSave('),
  'activar flyer imagen': _authSrc.includes('function activateImageFlyer('),
  // Dos armadores: Opcion 1 / Opcion 2 (selector solo ADMIN)
  'selector 3 opciones': _authSrc.includes('function switchFlyerOption(') && _authSrc.includes('var _FG_OPTS=[1,2,3]'),
  'archivos por opcion': _authSrc.includes("'_active'+n+'.json'") && _authSrc.includes("'_legal'+n+'.json'"),
  'legales: una solapa por opcion (dinamico)': html.includes('id="legales-tabs"') && html.includes('id="legales-panes"') && _authSrc.includes('function _legalesRender(') && !html.includes('id="glegal-text2"'),
  // Config → Opciones: la lista de armadores vive en _opciones.json (nombre, color) y
  // alimenta facultades, barra del armador, legales, subir flyer y registros.
  'opciones configurables': html.includes('id="at-opciones"') && html.includes('data-tab="opciones"') && _authSrc.includes("var OPCIONES_FILE='_opciones.json'") && _authSrc.includes('function loadOpciones(') && _authSrc.includes('function saveOpciones(') && _authSrc.includes('function renderOpcionesAdmin(') && _authSrc.includes("loadOpciones(false,function(){_loadFacultadesRaw(force,cb);});") && _authSrc.includes("'opciones'") && !_authSrc.includes("'Opción '+o+'</div>'"),
  'preguntar opcion al subir': _authSrc.includes('function _askOption(') && _authSrc.includes('function _startUpload('),
  // El log estaba muerto (nadie llamaba a logFlyerToSupabase): sin esto no se registra nada
  'registro de descargas': _authSrc.includes('window.savePDF=fgSavePDF') && _authSrc.includes("logFlyerToSupabase(v,fn,'pdf')"),
  'opcion en registros/historial': _authSrc.includes('opcion:_optN(_fgOpt)') && _authSrc.includes('function fgRenderHistory('),
  'legal persistente por opcion': _authSrc.includes('function _fgStashLegal(') && _authSrc.includes('legalEdited'),
  // El legal de una opcion NUNCA se guarda como edicion de otra: el stash va a la opcion
  // que esta en pantalla (_fgLegalShownFor), solo si difiere del guardado; una sola
  // carga en vuelo por opcion; sin caer al LEGAL_DEFAULT del template al Restaurar.
  'legal: sin arrastre entre opciones': _authSrc.includes('var _fgLegalShownFor=null') && _authSrc.includes('var _fgOptLoading={}') && _authSrc.includes('var c=_fgOptCache[_fgLegalShownFor];') && _authSrc.includes("if(el.value!==c.legal)c.legalEdited=el.value;else delete c.legalEdited;") && _authSrc.includes('if(_fgOptLoading[opt]){') && _authSrc.includes('function _fgLegalArrived(') && !_authSrc.includes("c.legal.trim())?c.legal:(window.LEGAL_DEFAULT||'')"),
  'empresa sin default': _authSrc.includes("_eE0.placeholder='Nombre de la empresa'"),
  // Hasta 4 asesores (3 en fila, 4 en 2x2 con el flyer creciendo)
  'asesores 3 y 4': _authSrc.includes('function _fgEnsureAsesores34(') && _authSrc.includes('window.getVals=fgGetVals'),
  'flyer crece (2 filas)': _authSrc.includes('function _fgExtraBaseFor(') && _authSrc.includes('_fgBottomYRaw'),
  'masivo/plantilla 4 asesores': _authSrc.includes('window.genAll=fgGenAll') && _authSrc.includes('window.dlTemplate=fgDlTemplate'),
  'etiquetas Agregar asesor N': _authSrc.includes('function _fgFixAsesorLabels(') && _authSrc.includes("'Agregar asesor '+n"),
  'autocompletar mail': _authSrc.includes('function _fgMailFromName(') && _authSrc.includes('_fgAutoMail();'),
  'alta progresiva asesores': _authSrc.includes('function _fgAddNextAsesor(') && _authSrc.includes('id="fg-add-asesor"') && _authSrc.includes('function _fgRemoveAsesor('),
  // Padron de empresas: Excel precargado + buscador por razon social / CUIT (solo admin)
  // Padron PRIVADO por usuario: vive en la tabla padron_empresas con RLS, ya no
  // en el JSON publico del bucket (que se leia sin login).
  'padron: privado por usuario (tabla, no archivo)': _authSrc.includes("var _PADRON_TABLE='padron_empresas'") && _authSrc.includes(".eq('user_id',_me.id)") && _authSrc.includes("_sb.rpc('padron_replace'") && !_authSrc.includes("_PADRON_FILE"),
  'padron: solapa Padron Asesores (solo lectura)': html.includes('id="at-padronotros"') && html.includes('id="po-user"') && _authSrc.includes('function loadPadronDe(') && _authSrc.includes('function dlPadronDe(') && _authSrc.includes(".neq('role','admin')"),
  'padron: motor': _authSrc.includes('function padronSearch(') && _authSrc.includes('_PADRON_TABLE') && _authSrc.includes('function _padCuits('),
  'padron: excel': _authSrc.includes('function importPadron(') && _authSrc.includes('function dlPadron(') && _authSrc.includes('function dlPadronTemplate('),
  'padron: lupita solo admin': _authSrc.includes('_fgEnsurePadronBtn();') && _authSrc.includes('function applyPadronRow('),
  // Quien tiene la lupa administra su propio padrón desde el menú del nombre
  // (antes el bloque sólo era alcanzable desde el panel Admin).
  'padron: "Mi padron" para no-admins': html.includes('id="hdr-dd-padron"') && _authSrc.includes('function openMiPadron(') && _authSrc.includes('function closeMiPadron(') && _authSrc.includes("document.getElementById('hdr-dd-padron');if(dpad)dpad.style.display=_can('padron_buscar')") && _authSrc.includes('onclick="openMiPadron()"') && !_authSrc.includes('Panel Administrador &rarr; Varios'),
  'padron: solapa Varios': html.includes('id="at-varios"') && html.includes('id="padron-xls"') && _authSrc.includes("if(t==='varios')renderPadronAdmin(true);"),
  'premium: capa visual (marino + naranja, Figtree, tarjetas, login partido)': newCSS.includes('PREMIUM (2026-09-17)') && html.includes('class="login-shell"') && html.includes('class="login-hero"') && html.includes('family=Figtree') && _authSrc.includes('function _fgCardify(') && _authSrc.includes('_fgCardify();') && _authSrc.includes('function setPalette(') && newCSS.includes('html.t-marino{') && newCSS.includes('html.t-cielo{') && html.includes('id="hdr-dd-pal"') && html.includes("fg_palette") && html.includes('<svg class="ico"') && !html.includes('&#128269; Vista previa'),
  'padron: generar flyers (ZIP por formato + resumen)': html.includes('id="padron-gen"') && html.includes('onclick="_pgToggle()"') && _authSrc.includes('function _pgGenerar(') && _authSrc.includes('function _pgResumenModal(') && _authSrc.includes("zip.file('Resumen.txt',_pgResumenTxt(res));") && _authSrc.includes("logFlyerBulkToSupabase(res.total,'padron')") && _authSrc.includes('function _fgRowBenef(') && _authSrc.includes('function _fgMasivoHint('),
  'padron: editor en linea': html.includes('id="padron-edit-btn"') && html.includes('id="padron-editor"') && _authSrc.includes('function openPadronEditor(') && _authSrc.includes('function _padEditSave('),
  'panel admin: 3 pilares': html.includes('data-group="admin"') && html.includes('data-group="data"') && html.includes('data-group="config"') && _authSrc.includes('function switchAdminGroup('),
  'panel admin: subsolapas por pilar': html.includes('id="sg-admin"') && html.includes('id="sg-data"') && html.includes('id="sg-config"') && html.includes('data-tab="varios"'),
  // Facultades por perfil: la matriz vive en la nube y gobierna el gating de la UI
  'facultades: matriz por rol': html.includes('id="at-facultades"') && html.includes('id="fac-grid"') && _authSrc.includes('function _can(') && _authSrc.includes('function loadFacultades(') && _authSrc.includes('function _applyFacultades('),
  'facultades: defaults = comportamiento previo': _authSrc.includes('var _FAC_DEF={') && _authSrc.includes('vip:   {padron_buscar:false,pegar_oficial:false,notas:true, asesores_guardados:true, promos_buscar:false,tutorial_auto:false,guardar_trabajo:false}') && !_authSrc.includes('_canNotes'),
  // Tutorial guiado: "Ver tutorial" en el menú para todos; el arranque
  // automático al primer ingreso es una facultad (apagada por default).
  'tutorial guiado': html.includes('id="hdr-dd-tour"') && _authSrc.includes('function _tourStart(') && _authSrc.includes('function _tourEnd(') && _authSrc.includes('function _tourCapitulos(') && _authSrc.includes("rows.push(['tutorial_auto',") && _authSrc.includes('_tourAutoStart();') && _authSrc.includes("_can('tutorial_auto')"),
  // Buscador de promociones: pestaña nueva, gateada por facultad (default false
  // para todos los roles: sólo el admin la ve hasta que se la habiliten a otro perfil).
  'promos: solapa de primer nivel + facultad + matching + excel': html.includes('id="apptab-promos"') && html.includes('id="view-promos"') && html.includes('onclick="switchApp(') && _authSrc.includes('function switchApp(') && _authSrc.includes("rows.push(['promos_buscar',") && _authSrc.includes('function _promoBuscarCandidatos(') && _authSrc.includes('function validarPromos(') && _authSrc.includes('function descargarExcelPromos(') && _authSrc.includes('function _callPromosFn('),
  // Nombres que difieren entre el flyer y el catálogo: "Sushi Club"/"SushiClub"
  // (sin espacios) y palabras genéricas que no deben sostener una coincidencia
  // ("Golf Club", "Niceto Club" se colgaban de cualquier "... Club").
  'promos: match tolerante a espacios y palabras genericas': _authSrc.includes('function _promoSinEspacios(') && _authSrc.includes('var _PROMO_STOPWORDS=') && _authSrc.includes('function _promoEsGenerica(') && _authSrc.includes('sinEspMarca===sinEspTitulo') && html.includes('id="promos-validar-btn"') && _authSrc.includes('function _promosValidarBtn('),
  // El catalogo tiene ~1700 filas y PostgREST corta en 1000: sin paginar, las
  // marcas de la cola (SushiClub, Starbucks, Freddo...) no existian para la app.
  'promos: catalogo paginado (limite de 1000 de PostgREST)': _authSrc.includes('function _promosTraerTodo(') && _authSrc.includes('var _PROMOS_PAGINA=1000') && _authSrc.includes(".order('id',{ascending:true})") && _authSrc.includes('.range(desde,desde+_PROMOS_PAGINA-1)'),
  // Filtros por columna + buscador general, repintando solo el tbody para no
  // perder el foco del input en cada tecla.
  'promos: filtros por columna + buscador': html.includes('id="promos-buscar"') && html.includes('id="promos-search-box"') && _authSrc.includes('var _promosFiltros=') && _authSrc.includes('function _promoCoincideFiltro(') && _authSrc.includes('function _promosPintarFilas(') && _authSrc.includes("id=\"promos-tbody\"") && _authSrc.includes('function _promoLimpiarFiltros('),
  // Orden por columna: el estado NO va alfabetico sino por urgencia, y los
  // vacios (sin coincidencia) caen al final en vez de encabezar la tabla.
  // El estado ordena por urgencia: primero lo que hay que corregir en el flyer
  // (una marca que no esta en el catalogo hay que sacarla), ultimo lo vigente.
  'promos: orden por columna': _authSrc.includes('function _promoOrdenar(') && _authSrc.includes('var _PROMO_ORDEN_ESTADO=') && _authSrc.includes('function _promoValorOrden(') && _authSrc.includes('function _promoTh(') && _authSrc.includes('NO_ENCONTRADA:0,VENCIDA:1,VENCE_ESTE_MES:2,REVISAR:3') && _authSrc.includes("chipDefs=[['NO_ENCONTRADA'"),
  // Una facultad por opcion del armador: al sumar una Opcion 4 a _FG_OPTS, su fila sale sola
  'facultades: una por opcion del armador': _authSrc.includes('function _facOptList(') && _authSrc.includes("rows.push(['opcion_'+o,") && _authSrc.includes("if(!_can('opcion_'+_optN(opt)))return;") && _authSrc.includes('bar.innerHTML=_facOptsDe(_fgVista).map(') && !_authSrc.includes('opciones_armador'),
  // Flyer Rubros: tercera solapa del header que reusa el armador. Cada opción tiene
  // `solapa` ('flyer'|'rubros'); las de rubros dibujan el cartel "¡Beneficio
  // exclusivo EMPRESA!" + "Tope de reintegro mensual $X" (zonas calibrables con
  // textos fijos editables) y muestran los dos campos en el formulario.
  'rubros: solapa + opciones por solapa + cartel del beneficio': html.includes('id="apptab-rubros"') && html.indexOf('id="apptab-rubros"') > html.indexOf('id="apptab-flyer"') && html.indexOf('id="apptab-rubros"') < html.indexOf('id="apptab-promos"') && _authSrc.includes('function _optSolapa(') && _authSrc.includes('function _facOptsDe(') && _authSrc.includes('function _fgSyncVista(') && _authSrc.includes('function fgDrawBenef(') && _authSrc.includes('if(v.benef)fgDrawBenef(c,s,v);') && _authSrc.includes('function _fgEnsureBenefFields(') && _authSrc.includes('function _fgFmtImporte(') && _authSrc.includes('function _calZones(') && _authSrc.includes('function _calBenefLinea(') && _authSrc.includes('var _BENEF_PLANTILLAS=') && _authSrc.includes('function _fgBenefLineas(') && _authSrc.includes('{importe2}') && _authSrc.includes('function _fgBenefFieldsSync(') && _authSrc.includes('function _padCheckRubro(') && _authSrc.includes("_PADRON_COLS='empresa,cuits,config,asesores,rubro,created_at'") && _authSrc.includes('ambos:{nombre:') && _authSrc.includes('function _padRubroOf(') && _authSrc.includes('id="benef-importe2"') && _authSrc.includes('function fgSavePDF(fc,v,force)') && _authSrc.includes('function _fgLegalConValores(') && _authSrc.includes('function _fgImporteSuma(') && _authSrc.includes('fgDrawLegal(c,s,_fgLegalConValores(v.legal,v))') && _authSrc.includes('function _fgBenefDetectarCuadro(') && _authSrc.includes('function _calBenefCentrar(') && _authSrc.includes('function _calBenefPlantillaPorOpcion(') && _authSrc.includes('onclick="_calBenefCentrar(false)"') && _authSrc.includes('id="cal-benef-row"') && _authSrc.includes('class="opc-sol"') && _authSrc.includes("solapa:sol") && html.includes('Flyer Rubros'),
  'facultades: vista previa por perfil': _authSrc.includes('function startFacSim(') && _authSrc.includes('function stopFacSim(') && _authSrc.includes('function _adminNow(') && _authSrc.includes('if(_simRole)return !!((_FAC&&_FAC[_simRole]||{})[f]);') && html.includes('id="fac-grid"'),
  // El admin se puede destildar cosas a sí mismo (columna "Vos", guardada por
  // cuenta en profiles.facultades): ya no hay bypass fijo en _can.
  'facultades: columna Vos del admin (profiles.facultades)': _authSrc.includes('function _facMe(') && _authSrc.includes('if(_admin)return _facMe(f);') && _authSrc.includes("update({facultades:me})") && _authSrc.includes('function _facFieldMe(') && _authSrc.includes(',facultades\').eq(\'id\',user.id)') && !_authSrc.includes('checked disabled title="El administrador siempre tiene todas') && !html.includes('por eso su columna no se puede editar'),
  // Data → Cambios del padrón: lo escribe padron_replace (servidor, migración 007).
  'padron: log de cambios (solapa Data)': html.includes('id="at-padronlog"') && html.includes('data-tab="padronlog"') && html.includes('id="plog-list"') && _authSrc.includes('function loadPadronLog(') && _authSrc.includes('function exportPadronLog(') && _authSrc.includes("'padronlog'") && _authSrc.includes("if(t==='padronlog')loadPadronLog();") && _authSrc.includes("_sb.from('padron_log')"),
  'facultades: gating bidireccional (quitar tambien saca)': _authSrc.includes('function _facShowPaste(') && _authSrc.includes('function _facShowAsesores(') && _authSrc.includes('function _facSyncOptBar('),
  'facultades: gating aplicado tras cargar la matriz': _authSrc.includes('loadFacultades(false,_applyFacultades);') && !_authSrc.includes('if(_admin){_refreshPendingBadge();_fgEnsureOptBar();_fgEnsurePadronBtn();}'),
  'rol Pro': html.includes('<option value="pro">Pro</option>') && _authSrc.includes("pro:'Pro'"),
  'cashback: solapa + guardado en la nube': html.includes('id="at-cashback"') && html.includes('id="cashback-list"') && _authSrc.includes('function loadCashback(') && _authSrc.includes('function saveCashback(') && _authSrc.includes('function renderCashbackAdmin('),
  'cashback: se aplica a todos al loguear': _authSrc.includes("loadCashback(false,function(){if(typeof redraw==='function')redraw();});"),
  'padron: sin oficiales asignados': _authSrc.includes('function _padAsesoresLbl(') && _authSrc.includes('sin oficiales asignados') && _authSrc.includes('function _padShowNote('),
  'padron: actualizar al generar': _authSrc.includes('function _padDiff(') && _authSrc.includes('function _padAskUpdate(') && _authSrc.includes('_padAfterFlyer();'),
  'padron: alta de empresa nueva': _authSrc.includes('function _padAskNew(') && _authSrc.includes('function _padDoNew(') && _authSrc.includes('function _padFindByName(') && _authSrc.includes('function _padCuitField('),
  'padron: typeahead en empresa': _authSrc.includes('function _padSugRender(') && _authSrc.includes('function _padPickSug(') && _authSrc.includes('inp.addEventListener(\x27input\x27,_padSugRender)') && _authSrc.includes('function _padApply('),
  'padron: popup sin cierre accidental': !_authSrc.includes('ov.addEventListener('+String.fromCharCode(39)) && _authSrc.includes('onclick="_padCloseUpdate(1)"'),
  'padron: el nombre identifica la empresa': _authSrc.includes('function _padCuitDupes(') && _authSrc.includes('if(_padNorm(emp)!==_padNorm(_padRef.empresa))return null;') && !_authSrc.includes('d.row.empresa=d.empresa;'),
  'padron: cashback tolerante + informe': _authSrc.includes('function _padCfgParse(') && _authSrc.includes('function _padValidate(') && _authSrc.includes('_padAskImport(informe)') && !_authSrc.includes('cfgIdx(row.config||row.Config'),
  'padron: sin cashback': _authSrc.includes('function _padCfgOf(') && _authSrc.includes('function _fgSetNoCB(') && _authSrc.includes('window.setCfg=fgSetCfg') && _authSrc.includes("var vals=v.nocb?['','','','']"),
  'padron: SIN explicito + nombre de archivo': _authSrc.includes('function _padCfgSin(') && _authSrc.includes('function _padAvisoSinCB(') && _authSrc.includes("_fn.value='Flyer_'+(r.empresa||'')"),
  '3 asesores: banda ancha': _authSrc.includes('ew3:1140') && _authSrc.includes('xs=[bx+bw/6,bx+bw/2,bx+5*bw/6];colW=bw/3;'),
  // Bugs encontrados en la revision general (ver tests en scratchpad)
  'padron: filas saneadas al cargar': _authSrc.includes('function _padSane(') && _authSrc.includes('_padron=_padSane(r.data)'),
  'historial: aplica los 4 asesores': _authSrc.includes('var hay=(k===1&&h.v.has1===undefined)'),
  'nombre de archivo seguro': _authSrc.includes('function _fgSafeName(') && _authSrc.includes('window.buildFn=fgBuildFn'),
  'masivo: el ZIP no pisa repetidos': _authSrc.includes('usados[base]=(usados[base]||0)+1'),
  // Empresa y montos tapan con el color REAL del flyer (muestreado), no con uno fijo:
  // con color fijo se notaba el recuadro alrededor de cada importe.
  'montos y empresa: fondo muestreado (sin cuadrito)': _authSrc.includes('function _fgBgMuestra(') && _authSrc.includes('c.fillStyle=_bgDe(mx,mw,mh);c.fillRect(') && _authSrc.includes('c.fillStyle=_fgBgMuestra(c,ex,ex+mw,') && !_authSrc.includes('c.fillStyle=E.bg;'),
  'preview: zoom maximo 130% + full canvas reutilizado': _authSrc.includes('var _ZOOM_MAX=1.3;') && _authSrc.includes('ZOOM=Math.min(ZOOM*1.25,_ZOOM_MAX)') && _authSrc.includes('var _fgFullCv=null') && _authSrc.includes("_fgFullCv.getContext('2d',{willReadFrequently:true})"),
  'calibrador: zoom + zona elegida sola': _authSrc.includes('function _calZoom(') && _authSrc.includes('function _calWheel(') && _authSrc.includes("cv.addEventListener('wheel',_calWheel,{passive:false});") && _authSrc.includes('if(_cal.sel&&_cal.sel!==z.id)return;') && _authSrc.includes('id="cal-zoom-pct"'),
  // Pegar datos del oficial (nombre/celular/mail) desde un texto pegado — SOLO ADMIN
  'pegar: parser': _authSrc.includes('function _fgParseContacto(') && _authSrc.includes('function _fgPartirTel(') && _authSrc.includes('function _fgVerificaTel('),
  'pegar: prioriza mail de Galicia': _authSrc.includes("x.indexOf('@'+_PAD_DOMINIO)") && _authSrc.includes("_PAD_DOMINIO='bancogalicia.com.ar'"),
  'pegar: boton por asesor, segun facultad': _authSrc.includes('function _fgEnsurePasteBtns(') && _authSrc.includes("if(!_can('pegar_oficial'))return;") && _authSrc.includes('_fgEnsurePasteBtns();'),
  'pegar: aplica/limpia/deshace': _authSrc.includes('function _fgApplyParsed(') && _authSrc.includes('function _fgUndoPaste(') && _authSrc.includes('esPersona'),
  'pegar: celular sin codigo de area (15+8)': _authSrc.includes("d.slice(0,2)==='15'") && _authSrc.includes("d.slice(q.pos+(q.len||0))"),
  'pegar: el cuadro se cierra al traer del padron': _authSrc.includes('function _fgClosePasteAll(') && _authSrc.includes("if(typeof _fgClosePasteAll==='function')_fgClosePasteAll();"),
  'pegar: el mail solo si tiene arroba, textual': _authSrc.includes('El mail se toma SOLO si viene escrito con arroba') && !_authSrc.includes('mailFinal=_fgMailFromName('),
  'pegar: el legajo no se cuela en el nombre': _authSrc.includes('MEZCLAN letras y dígitos'),
  // Mejoras UX 2026-09: trabajo guardado (facultad), validacion en linea, compartir,
  // teclado, negrita del legal y dialogos propios (sin confirm() del navegador).
  'ux: trabajo guardado gateado por facultad': _authSrc.includes("_fgWorkApply(_can('guardar_trabajo'))") && _authSrc.includes("['guardar_trabajo','Guardar historial y borrador'") && _authSrc.includes('function _fgApplyHistItem(') && _authSrc.includes('_fgWorkSaveHist();'),
  'ux: validacion en linea (no bloquea)': _authSrc.includes('function _fgValField(') && _authSrc.includes('function _fgValAvisar(') && _authSrc.includes('(se generó igual)'),
  'ux: compartir + Otros (PNG)': html.includes('id="btn-share"') && html.includes('onclick="fgCompartir()"') && html.includes('id="fg-otros-menu"') && html.includes('onclick="modalCompartir()"') && _authSrc.includes("logFlyerToSupabase(v,fn,'compartir')") && _authSrc.includes('function _fgCompartirCanvas('),
  'ux: teclado (solapas + Ctrl+Enter + Esc)': html.includes('role="tablist"') && _authSrc.includes('function _fgKbdInit(') && _authSrc.includes("(e.ctrlKey||e.metaKey)&&e.key==='Enter'"),
  'ux: negrita del legal': html.includes('onclick="fgLegalBold()"') && _authSrc.includes('function fgLegalBold(') && _authSrc.includes("(e.key==='b'||e.key==='B')"),
  'ux: sin confirm() nativo': _authSrc.includes('function fgConfirm(') && !/[^a-zA-Z_]confirm\(/.test(_authSrc),
  'pegar: telefono por grupos de digitos': _authSrc.includes('function _fgTelCandidatos(') && _authSrc.includes('_FG_TEL_SEP') && !_authSrc.includes('reTel=/(?:[+(]?'),
};
let _fallos = 0;
for (const [k, v] of Object.entries(checks)) {
  if (!v) _fallos++;
  console.log(`${v ? '✓' : '✗'} ${k}`);
}
if (_scriptsSinSri.length) console.log('  scripts CDN sin hash SRI:', _scriptsSinSri.join(', '));

// Un check en ✗ significa que algún feature quedó roto (o un script sin
// integridad). Antes se escribía igual y el index.html roto quedaba listo para
// commitear; ahora el build se detiene y no toca los archivos generados.
if (_fallos) {
  console.error(`\n✗ ${_fallos} check(s) fallaron: NO se escribió index.html ni index_export.html.`);
  process.exitCode = 1;
} else {
  writeFileSync('index.html', html, 'utf8');
  writeFileSync('version.json', JSON.stringify({ v: BUILD_V }), 'utf8');
  if (_imgBuf) { writeFileSync(_imgFile, _imgBuf); console.log(`${_imgFile} guardado: ${(_imgBuf.length / 1024 / 1024).toFixed(2)} MB (fallback, ya no viaja dentro de index.html)`); }
  console.log(`\nindex.html guardado: ${(html.length / 1024 / 1024).toFixed(2)} MB`);

  // ── EXPORT SELF-CONTAINED (para subir a Supabase Storage) ─────────────────
  // index_export.html tiene auth.js inlineado → funciona desde cualquier dominio
  writeFileSync('index_export.html', exportHtml, 'utf8');
  console.log(`index_export.html guardado: ${(exportHtml.length / 1024 / 1024).toFixed(2)} MB  ← subir este a Supabase`);
}
