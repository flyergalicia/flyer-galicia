# Las cuentas de prueba viven en un mundo aparte

Las cuentas con `es_prueba` (Prospect y el equipo que simula Gestiones) tienen empresas inventadas (CUIT 30-90… y 30-91…, de `supabase/_seed_*`) y no se mezclan con las reales: un hunter real no ve empresas de prueba, uno de prueba ve sólo las de prueba, y lo de prueba no cuenta en el tablero salvo con «Incluir pruebas».

## Consecuencias

- **Cambiar de cuenta (prueba)** lo autoriza el servidor (`auth-admin`, `entrar_como`): quien pide es admin o de prueba, y el destino es siempre de prueba y forma parte de un equipo. A una cuenta común no se entra nunca por ahí, y el navegador no guarda claves ni sesiones ajenas.
- Para darle Gestiones a una cuenta de prueba se le cambia el perfil (por ejemplo a Pro) en vez de prender la facultad en Asesor, que la habilitaría para todos los asesores reales.
