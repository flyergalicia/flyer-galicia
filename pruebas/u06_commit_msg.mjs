// Prueba del hook commit-msg (Conventional Commits), sin navegador: valida mensajes
// sueltos y después activa el hook en un repo temporal y hace commits de verdad.
// Uso: node pruebas/u06_commit_msg.mjs
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { TIPOS, validarMensaje } from '../.githooks/commit-msg.mjs';
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };

// ── Mensajes válidos ──
for (const t of TIPOS) ok(validarMensaje(`${t}: descripción`) === null, `tipo aceptado: ${t}`);
for (const m of [
  'feat(promos): agrega el filtro por provincia',
  'fix(marcas guardadas): corrige la miniatura',
  'refactor!: cambia el formato del borrador',
  'feat(padrón)!: renombra las columnas de topes',
  'docs: explica cómo activar el hook\n\nCuerpo del mensaje.\n\nRefs: 123\n',
  'fix: con fin de línea de Windows\r\n\r\nCuerpo.\r\n',
  '﻿chore: archivo guardado con BOM\n',
  '\n\nfix: con líneas en blanco al principio\n',
]) ok(validarMensaje(m) === null, `se acepta: ${JSON.stringify(m)}`);

// ── Mensajes inválidos ──
for (const m of [
  '', '   \n\n', '# sólo comentarios\n',
  'Gestiones: agrega un filtro',
  'arregla el login',
  'feature: tipo que no existe',
  'FEAT: tipo en mayúsculas',
  'feat:sin espacio',
  'feat : espacio antes de los dos puntos',
  'feat: ',
  'feat:  ',
  'feat(): alcance vacío',
  'feat( ): alcance en blanco',
  'feat(a)(b): dos alcances',
  'feat!(a): el signo va después del alcance',
  'feat: asunto\nsin línea en blanco',
  ' feat: con un espacio adelante',
  'Merge de cosas varias',
  'Revert algo sin comillas',
]) ok(validarMensaje(m) !== null, `se rechaza: ${JSON.stringify(m)}`);

// ── Lo que arma Git solo ──
for (const m of [
  "Merge branch 'rama'\n",
  "Merge branch 'rama' into main\n",
  "Merge remote-tracking branch 'origin/main'\n",
  'Merge pull request #12 from usuario/rama\n',
  'Revert "feat: agrega algo"\n\nThis reverts commit abc123.\n',
  'Reapply "feat: agrega algo"\n',
  'fixup! feat: agrega algo\n',
]) ok(validarMensaje(m) === null, `automático: ${JSON.stringify(m)}`);

// ── El texto como lo recibe el hook desde el editor ──
ok(validarMensaje('# Combinación de 2 commits.\n\nfeat: junta dos cambios\n\n# Mensaje 2:\n') === null, 'los comentarios antes del asunto no cuentan (squash)');
ok(validarMensaje('feat: con diff abajo\n\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n') === null, 'con commit -v no se lee el diff');
ok(validarMensaje('# sólo el comentario\n\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n') !== null, 'con commit -v y sin asunto, se rechaza');

// ── De punta a punta: repo temporal con el comando que dice el README ──
const repo = mkdtempSync(join(tmpdir(), 'fg-commit-msg-'));
const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
entorno.GIT_EDITOR = 'true';
const git = (...a) => spawnSync('git', a, { cwd: repo, env: entorno, encoding: 'utf8' });
const commit = (...a) => git('commit', '--allow-empty', ...a);
const cuantos = () => +git('rev-list', '--count', 'HEAD').stdout;
try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Prueba');
  git('config', 'user.email', 'prueba@example.com');
  git('config', 'commit.gpgsign', 'false');
  cpSync(fileURLToPath(new URL('../.githooks', import.meta.url)), join(repo, '.githooks'), { recursive: true });

  // Sin activar, entra cualquier cosa
  ok(commit('-m', 'mensaje cualquiera').status === 0, 'sin activar el hook no se valida nada');

  ok(git('config', 'core.hooksPath', '.githooks').status === 0, 'se activa con git config core.hooksPath .githooks');
  const malo = commit('-m', 'mensaje cualquiera');
  ok(malo.status !== 0 && cuantos() === 1, 'activado: rechaza un mensaje inválido y no crea el commit');
  const ejemplo = (malo.stderr.match(/^Ejemplo:\s+(.+)$/m) || [])[1];
  ok(!!ejemplo && validarMensaje(ejemplo) === null, 'el error muestra un ejemplo, y el ejemplo es válido');
  ok(commit('-m', 'feat(promos): agrega el filtro por provincia').status === 0 && cuantos() === 2, 'activado: acepta un mensaje válido');
  ok(commit('-e', '-m', 'fix: pasando por el editor').status === 0, 'acepta por el editor, con la plantilla de comentarios');
  ok(commit('-e', '-v', '-m', 'fix: con commit -v').status === 0, 'acepta por el editor con commit -v');
  ok(commit('-e', '-m', 'mal por el editor').status !== 0, 'rechaza por el editor');
  ok(commit('--fixup', 'HEAD').status === 0, 'acepta git commit --fixup');

  // Merge de verdad: el mensaje lo arma Git y corre el hook
  git('checkout', '-q', '-b', 'rama');
  commit('-m', 'feat: cambio en la rama');
  git('checkout', '-q', 'main');
  ok(git('merge', '--no-ff', '--no-edit', 'rama').status === 0, 'acepta el merge automático');
  ok(git('log', '-1', '--format=%s').stdout.startsWith("Merge branch 'rama'"), 'el commit de merge quedó con el mensaje de Git');

  // Revert de verdad, sobre un commit que cambia un archivo
  writeFileSync(join(repo, 'a.txt'), 'hola\n');
  git('add', 'a.txt');
  commit('-m', 'feat: agrega un archivo');
  ok(git('revert', '--no-edit', 'HEAD').status === 0, 'acepta el revert automático');
  ok(git('log', '-1', '--format=%s').stdout.startsWith('Revert "feat: agrega un archivo"'), 'el commit de revert quedó con el mensaje de Git');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
