# Drivers de la app

Cada dominio tiene acá su archivo, que cumple la interfaz de `driver/<dominio>.ts`, y `createAppDriver` en `app-driver.ts` los usa a todos.

Las interfaces de `driver/<dominio>.ts` hablan de lo que hace la persona, no de cómo está hecha la app: no se cambian para acomodar cómo está armada una pantalla.

## Cómo se escribe

- Lo que hace la persona, con mouse y teclado. Se busca, en este orden: por rol y texto visible; por `data-testid` o `data-*` en el DOM (`data-screen` dice qué pantalla es); por píxeles del canvas; y sólo lo que no se puede ver en pantalla, por la sonda de lectura (`registerProbe`, en `web/src/shared/lib/test-probe.ts`). La sonda sólo lee.
- Lo que una pantalla deja leer por la sonda se declara en `globals.d.ts`, con el mismo nombre que le da `registerProbe`.
- Cada dominio devuelve un objeto con su interfaz entera: TypeScript avisa si falta un método. Un método que pida algo que una persona no puede hacer no va: esa regla se prueba con una prueba de componente.
- `session.open` espera a que se vean el encabezado y el flyer, y respeta `startOption`: ver `session.ts`.
