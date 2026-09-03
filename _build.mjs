import { readFileSync, writeFileSync } from 'fs';

let html = readFileSync('_source.html', 'utf8');
const newCSS = readFileSync('_newcss.txt', 'utf8');

// ── LOGO GALICIA (SVG inline, self-contained) ──────────────────────────────
const swordPaths = '<circle cx="40" cy="23" r="4.3"/><rect x="37.8" y="26.5" width="4.4" height="6.5" rx="1"/><rect x="26" y="31.5" width="28" height="5.2" rx="2.6"/><polygon points="34.6,37 45.4,37 40,84"/>';
// Isotipo para header (D granate, espada blanca)
const headerIso = '<svg class="header-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Galicia"><path d="M6 6H48a44 44 0 0 1 0 88H6z" fill="#A6273B"/><g fill="#fff">' + swordPaths + '</g></svg>';
// Logo completo para login (D blanca + espada granate + wordmark)
const galiciaLogoWhite = '<div class="lg-logo"><svg class="lg-iso" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Galicia"><path d="M6 6H48a44 44 0 0 1 0 88H6z" fill="#fff"/><g fill="#A6273B">' + swordPaths + '</g></svg><span class="lg-word">Galicia</span></div>';

// Íconos monocromáticos (estilo Feather) para el menú de usuario. Heredan el color
// del texto (currentColor) → look sobrio, sin emojis de color que quedan mal.
const _svgIco = (p) => '<svg class="dd-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const ICO_LOCK = _svgIco('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
const ICO_MOON = _svgIco('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>');
const ICO_DOC  = _svgIco('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>');
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
html = html.replace(
  '</head>',
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script><script src="auth.js"></script></head>'
);

// ── LAYOUT ID + oculto ─────────────────────────────────────────────────────
html = html.replace('<div class="layout">', '<div class="layout" id="layout" style="display:none">');

// ── HEADER con user info ────────────────────────────────────────────────────
// Anchor tolerante a la versión (5.5, 5.6, ...) para que el menú se inyecte
// aunque cambie el número de versión en una regeneración del HTML.
html = html.replace(
  /<h1>(Flyer Galicia[^<]*)<\/h1><\/header>/,
  '<div class="header-text"><h1>$1</h1><span>ARMADOR</span></div>' +
  '<div class="header-right" id="hdr-right" style="display:none">' +
  '<div class="hdr-user-menu">' +
    '<button class="hdr-user-btn" onclick="toggleUserMenu(event)"><span id="hdr-user"></span><span class="hdr-caret">&#9662;</span></button>' +
    '<div class="hdr-dropdown" id="hdr-dropdown">' +
      '<div class="hdr-dd-head"><div class="hdr-dd-name" id="hdr-dd-name"></div><div id="hdr-dd-role"></div></div>' +
      '<div class="hdr-dd-sep"></div>' +
      '<button class="hdr-dd-item" id="hdr-dd-pass" onclick="openMyPassModal();closeUserMenu()">' + ICO_LOCK + '<span>Cambiar mi clave</span></button>' +
      '<button class="hdr-dd-item" id="hdr-dd-theme" onclick="toggleTheme()">' + ICO_MOON + '<span>Modo oscuro</span></button>' +
      '<button class="hdr-dd-item" id="hdr-dd-notes" onclick="openNotes();closeUserMenu()" style="display:none">' + ICO_DOC + '<span>Bloc de notas</span></button>' +
      '<div class="hdr-dd-sep"></div>' +
      '<button class="hdr-dd-item danger" onclick="doLogout()">' + ICO_OUT + '<span>Salir</span></button>' +
    '</div>' +
  '</div>' +
  '<button id="hdr-admin-btn" class="btn-hdr btn-hdr-admin" onclick="openAdminPanel()" style="display:none">&#9881; Admin</button>' +
  '</div></header>'
);

// ── LOGIN OVERLAY ───────────────────────────────────────────────────────────
const loginOverlay = `<div id="login-ov">
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
      <input type="password" id="reg-pass" class="login-inp" placeholder="M&iacute;nimo 6 caracteres">
      <div class="login-err" id="reg-err"></div>
      <div class="login-ok" id="reg-ok"></div>
      <button class="login-submit" id="reg-btn" onclick="doRegister()">Crear cuenta</button>
      <div class="login-links" style="justify-content:center">
        <button class="login-link" onclick="showLoginView('login')">&larr; Ya tengo cuenta</button>
      </div>
    </div>

  </div>
</div>`;
// Aplica el tema guardado lo antes posible para evitar parpadeo (flash) al cargar.
const themeBoot = `<script>try{if(localStorage.getItem('fg_theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}</script>`;
html = html.replace('<body>', '<body>\n' + themeBoot + '\n' + loginOverlay);

// ── ADMIN PANEL ─────────────────────────────────────────────────────────────
const adminPanel = `<div id="admin-panel">
  <div class="ap-header">
    <h2 class="ap-title">&#9881; Panel Administrador</h2>
    <button class="ap-close" onclick="closeAdminPanel()">&#10005;</button>
  </div>
  <div class="atabs">
    <div class="atab active" data-tab="dashboard" onclick="switchAdminTab(this,'dashboard')">Dashboard</div>
    <div class="atab" data-tab="usuarios" onclick="switchAdminTab(this,'usuarios')">Usuarios</div>
    <div class="atab" data-tab="registros" onclick="switchAdminTab(this,'registros')">Registros</div>
    <div class="atab" data-tab="legales" onclick="switchAdminTab(this,'legales')">Legales</div>
    <div class="atab" data-tab="subir" onclick="switchAdminTab(this,'subir')">Subir Flyer</div>
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
        <div class="stat-card" style="border-color:#f5c542"><span style="color:#c07000">Pendientes aprobaci&oacute;n</span><strong id="stat-pending" style="color:#c07000">&mdash;</strong></div>
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
        </select>
      </div>
      <div id="users-list"><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
    </div>

    <div id="at-subir" style="display:none">
      <p class="ap-sec">Subir nueva versi&oacute;n del flyer</p>
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:16px;line-height:1.5">Sub&iacute; el <strong>PDF limpio</strong> del flyer (sin los datos que completa cada asesor) &mdash; tambi&eacute;n vale PNG/JPG. Te pregunta si va a la <strong>Opci&oacute;n 1</strong> o la <strong>Opci&oacute;n 2</strong>, se convierte solo y se abre el <strong>calibrador</strong> de esa opci&oacute;n para acomodar las zonas arrastrando. Ojo: los asesores y VIP siempre ven la <strong>Opci&oacute;n 1</strong>. El HTML del build (<strong>index_export.html</strong>) tambi&eacute;n sirve como antes.</p>
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
      <p style="font-size:.82rem;color:var(--gray);margin-bottom:12px;line-height:1.5">Cada <strong>opci&oacute;n del armador tiene su propio legal</strong>, guardado por separado. Pod&eacute;s <strong>pegar desde Word/PDF/web y las negritas se mantienen</strong> (se marcan con **). Guard&aacute; para impactar a todos los usuarios de esa opci&oacute;n; cada asesor puede despu&eacute;s ajustar la fecha o alg&uacute;n dato en su pantalla.</p>
      <div class="atabs" style="margin-bottom:14px">
        <div class="atab ltab active" data-ltab="1" onclick="switchLegalTab(this,1)">Opci&oacute;n 1</div>
        <div class="atab ltab" data-ltab="2" onclick="switchLegalTab(this,2)">Opci&oacute;n 2</div>
        <div class="atab ltab" data-ltab="3" onclick="switchLegalTab(this,3)">Opci&oacute;n 3</div>
      </div>
      <div id="lt-1">
        <textarea id="glegal-text" class="login-inp" style="min-height:320px;resize:vertical;font-family:inherit;line-height:1.5;margin-bottom:0" placeholder="Legal de la Opci&oacute;n 1..."></textarea>
        <div class="login-err" id="glegal-err" style="margin-top:6px"></div>
        <div class="login-ok" id="glegal-ok" style="margin-top:6px"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-submit" id="glegal-save" onclick="saveGlobalLegal(1)">Guardar y aplicar a todos</button>
          <button class="usr-btn edit" onclick="loadGlobalLegal(true,1)">Recargar</button>
        </div>
      </div>
      <div id="lt-2" style="display:none">
        <textarea id="glegal-text2" class="login-inp" style="min-height:320px;resize:vertical;font-family:inherit;line-height:1.5;margin-bottom:0" placeholder="Legal de la Opci&oacute;n 2..."></textarea>
        <div class="login-err" id="glegal-err2" style="margin-top:6px"></div>
        <div class="login-ok" id="glegal-ok2" style="margin-top:6px"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-submit" id="glegal-save2" onclick="saveGlobalLegal(2)">Guardar y aplicar a todos</button>
          <button class="usr-btn edit" onclick="loadGlobalLegal(true,2)">Recargar</button>
        </div>
      </div>
      <div id="lt-3" style="display:none">
        <textarea id="glegal-text3" class="login-inp" style="min-height:320px;resize:vertical;font-family:inherit;line-height:1.5;margin-bottom:0" placeholder="Legal de la Opci&oacute;n 3..."></textarea>
        <div class="login-err" id="glegal-err3" style="margin-top:6px"></div>
        <div class="login-ok" id="glegal-ok3" style="margin-top:6px"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-submit" id="glegal-save3" onclick="saveGlobalLegal(3)">Guardar y aplicar a todos</button>
          <button class="usr-btn edit" onclick="loadGlobalLegal(true,3)">Recargar</button>
        </div>
      </div>
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
const checks = {
  'CSS full-screen': html.includes('height:100vh;overflow:hidden'),
  'layout height': html.includes('height:calc(100vh - 62px)'),
  'panel height': html.includes('height:100%'),
  'Supabase SDK': html.includes('supabase.js'),
  'auth.js': html.includes('auth.js'),
  'layout hidden': html.includes('id="layout" style="display:none"'),
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
  'legales 3 solapas': html.includes('id="glegal-text2"') && html.includes('id="glegal-text3"') && html.includes('saveGlobalLegal(3)'),
  'preguntar opcion al subir': _authSrc.includes('function _askOption(') && _authSrc.includes('function _startUpload('),
  // El log estaba muerto (nadie llamaba a logFlyerToSupabase): sin esto no se registra nada
  'registro de descargas': _authSrc.includes('window.savePDF=fgSavePDF') && _authSrc.includes("logFlyerToSupabase(v,fn,'pdf')"),
  'opcion en registros/historial': _authSrc.includes('opcion:_optN(_fgOpt)') && _authSrc.includes('function fgRenderHistory('),
  'legal persistente por opcion': _authSrc.includes('function _fgStashLegal(') && _authSrc.includes('legalEdited'),
  'empresa sin default': _authSrc.includes("_eE0.placeholder='Nombre de la empresa'"),
};
for (const [k, v] of Object.entries(checks)) {
  console.log(`${v ? '✓' : '✗'} ${k}`);
}

writeFileSync('index.html', html, 'utf8');
console.log(`\nindex.html guardado: ${(html.length / 1024 / 1024).toFixed(2)} MB`);

// ── EXPORT SELF-CONTAINED (para subir a Supabase Storage) ───────────────────
// index_export.html tiene auth.js inlineado → funciona desde cualquier dominio
const exportHtml = html.replace(
  '<script src="auth.js"></script>',
  '<script>\n' + _authSrc + '\n</script>'
);
writeFileSync('index_export.html', exportHtml, 'utf8');
console.log(`index_export.html guardado: ${(exportHtml.length / 1024 / 1024).toFixed(2)} MB  ← subir este a Supabase`);
