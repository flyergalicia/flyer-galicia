# Drivers de la versión React

Todavía no hay ninguno. Cada implementación llega con su slice: cuando un slice se termina, acá va el archivo de su dominio, con la misma interfaz que ya usa `driver/legacy/`, y `createAppDriver` en `app-driver.ts` lo empieza a usar.

Las interfaces de `driver/<dominio>.ts` no se cambian para acomodar una versión: hablan de lo que hace la persona, no de cómo está hecha la app.
