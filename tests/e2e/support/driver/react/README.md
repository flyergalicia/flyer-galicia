# Drivers de la versión React

Cada implementación llega con su slice: cuando un slice se termina, acá va el archivo de su dominio, con la misma interfaz que ya usa `driver/legacy/`, y `createAppDriver` en `app-driver.ts` lo empieza a usar.

Las interfaces de `driver/<dominio>.ts` no se cambian para acomodar una versión: hablan de lo que hace la persona, no de cómo está hecha la app.

## Cómo se escribe

- Lo que hace la persona, con mouse y teclado. Se busca, en este orden: por rol y texto visible; por `data-testid` o `data-*` en el DOM (`data-screen` dice qué pantalla es); por píxeles del canvas; y sólo lo que no se puede ver en pantalla, por la sonda de lectura (`registerProbe`, en `web/src/shared/lib/test-probe.ts`). La sonda sólo lee.
- Lo que una pantalla deja leer por la sonda se declara en `globals.d.ts`, con el mismo nombre que le da `registerProbe`.
- Un dominio que todavía está a medias se arma con `partialDriver` (`pending.ts`): lo que no tiene falla al usarlo y dice que falta. `session` y `flyerEditor` ya existen a medias, y el slice que trae el resto (`flyer-editor`, sobre todo) agrega sus métodos en el mismo archivo.
- `session.open` espera hoy a que se vea el encabezado. Cuando llegue `flyer-editor`, espera además el flyer (y respeta `startOption`): ver el comentario en `session.ts`.
