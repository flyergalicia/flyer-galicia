# Inventario de funciones de la base (schema public)

Generado el 2026-10-16 desde la base real (consulta a `pg_proc` + `has_function_privilege`).
**Regla:** una función expuesta a `authenticated` se puede llamar sin pasar por la pantalla, así que
tiene que comprobar ella misma quién llama. Esconder el botón no es una barrera.

| Función | Tipo | anon | authenticated | Comprueba | Para qué |
|---|---|---|---|---|---|
| `_prop_mi_nombre` | definer | no | no | auth.uid() | Ayudante interno de las propuestas (nombre de quien llama). |
| `colegas_para_suplente` | definer | no | sí | activo, auth.uid() | Lista de colegas elegibles como suplente. Exige cuenta activa. |
| `es_lider_de` | definer | no | **sí (047)** | auth.uid() | Ayudante de RLS de Gestiones (jerarquía de Líder). Sólo responde sobre quien llama ("¿esa persona es de mi equipo?"). La 019 se lo había quitado a `authenticated` porque entonces sólo la llamaban funciones `security definer`; la **045 la puso dentro de la policy "gestiones: editar"**, y una policy se evalúa con los permisos de quien consulta, así que sin el permiso el líder no podía editar nada de su equipo (`permission denied for function es_lider_de`). La 047 se lo devuelve. |
| `es_suplente_de` | definer | no | sí | auth.uid() | ¿Quien llama es suplente de ese oficial? Sólo responde sobre sí mismo. |
| `flyer_disenos_guardia` | definer | no | no | rol, auth.uid() | Trigger de Estudio (migración 026): el dueño y el autor salen de la sesión, y la revisión (nota, opción publicada, fecha) sólo la escribe el admin. Desde la 034 también fija las columnas de "compartido" (sólo las escribe `flyer_diseno_compartir`) y no deja que el autor pase un diseño a 'consulta'. No se llama a mano. |
| `gestion_marcar_vista` | definer | no | sí | activo, auth.uid() | Marca como vista una serie de gestiones. Exige cuenta activa y que quien llama sea parte (hunter o dueño). |
| `gestion_prospectos_antes` | definer | no | no | auth.uid() | Trigger de Gestiones (no se llama a mano). |
| `gestiones_antes` | definer | no | no | rol, auth.uid() | Trigger de Gestiones (no se llama a mano). |
| `gestiones_on` | definer | no | sí | rol, auth.uid() | Interruptor general de Gestiones comerciales. |
| `gestiones_personas` | definer | no | sí | activo | Lista de personas activas para los selectores de Gestiones. Exige cuenta activa y el módulo prendido. |
| `get_my_role` | definer | no | sí | auth.uid() | Rol de quien llama. Lo usan casi todas las políticas RLS. |
| `guard_profile_update` | definer | no | no | rol, auth.uid() | Trigger: impide que alguien cambie su propio rol o estado. |
| `handle_new_user` | definer | no | no | — | Trigger de alta de usuario. |
| `is_active` | definer | no | sí | auth.uid() | ¿Quien llama está activo? (active o reset_pending). Lo usan casi todas las políticas RLS. |
| `padron_propuesta_aprobar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) aprueba una propuesta: oficiales y, si es un pedido del suplente, cashback y rubro. Nadie aprueba lo que pidió, salvo el dueño (migración 032). |
| `padron_propuesta_consultar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) hace una consulta sobre una propuesta. No a un pedido del suplente (032). |
| `padron_propuesta_crear` | definer | no | sí | activo, rol, auth.uid() | Un Hunter (o admin) propone cambiar los oficiales de una empresa. Exige rol hunter/admin (migración 022). |
| `padron_propuesta_rechazar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) rechaza una propuesta. El suplente no rechaza su propio pedido (032). |
| `padron_suplencia_proponer` | definer | no | sí | activo, auth.uid() | El suplente pide guardar cambios (oficiales, cashback, rubro) en una empresa del oficial que lo eligió. Exige `es_suplente_de`; la foto "antes" la toma el servidor (migración 032). |
| `padron_suplencias` | definer | no | sí | activo, rol, auth.uid() | Empresas (sólo lectura) de los oficiales activos que eligieron a quien llama como suplente. No hunters (migración 032). |
| `padron_propuesta_responder` | definer | no | sí | activo, auth.uid() | Sólo quien creó la propuesta responde a una consulta. |
| `flyer_diseno_consultar` | definer | no | sí | activo, rol admin | El admin hace una pregunta sobre un diseño de Estudio pedido (pedido/consulta → consulta). Deja el mensaje en `flyer_diseno_mensajes` (migración 034). |
| `flyer_diseno_responder` | definer | no | sí | activo, auth.uid() | Sólo el autor del diseño responde la pregunta del admin (consulta → pedido) (migración 034). |
| `flyer_diseno_compartir` | definer | no | sí | activo, rol admin | El admin manda una copia de un diseño de Estudio a una o más personas activas (no hunters ni líderes). Usa `set_config('fg.estudio_compartir')` local para que la guardia deje nacer la fila a nombre de otro; si ya tenían copia privada, se reemplaza (migración 034). |
| `ids_prueba` | definer | no | sí | — | Ids de las cuentas de prueba (ayudante de RLS: separa las empresas de ejemplo de las reales, migración 032). |
| `soy_prueba` | definer | no | sí | auth.uid() | ¿Quien llama es una cuenta de prueba? (ayudante de RLS, migración 032). |
| `prueba_cambiar_rol` | definer | no | sí | activo, auth.uid() | Sólo la cuenta de prueba (es_prueba) puede cambiar de perfil. |
| `gestiones_empresas` | definer | no | sí | activo, interruptor, rol, auth.uid() | Empresas que quien llama puede asignar en la Agenda, con su oficial: admin todo el padrón; hunter todo el de su mundo (real o de prueba, migración 032); líder lo suyo y lo de su equipo; el resto lo suyo (migración 030). Desde la 045 devuelve también los CUIT y busca por CUIT (4 cifras o más). |
| `gestiones_ocupado` | definer | no | sí | activo, interruptor, auth.uid() | Horarios de un hunter en un día (para avisar si se pisan). La empresa sale sólo si quien llama puede ver esa gestión (migración 030; desde la 045 también el líder que reparte, y sin las bases de datos). |
| `gestiones_dia` | definer | no | sí | activo, interruptor, rol | Horarios de los hunters en un día, **sin empresas** (para "libres a esa hora", migración 045). Desde la 046 no responde a hunters y al líder le da sólo los de su equipo. |
| `gestiones_ocupacion` | definer | no | sí | activo, interruptor, rol | Horarios ocupados de los hunters entre dos fechas (tope 45 días), **sin la empresa** si quien pregunta no puede ver esa gestión (migración 047). Es `gestiones_dia` pero de a una semana y con la empresa de lo propio, para que el oficial vea en la grilla dónde hay lugar sin enterarse de qué hace el hunter con otros oficiales. No le contesta a un hunter; al líder, sólo los de su equipo. |
| `gestion_mensaje_enviar` | definer | no | sí | activo, interruptor, auth.uid() | Escribe en la conversación de una gestión que quien llama puede ver (como autor, siempre quien llama) y la marca leída (migración 045). |
| `gestion_no_puedo` | definer | no | sí | activo, interruptor, auth.uid() | Sólo el hunter de una gestión planificada avisa que no puede: marca `no_puede_*` (con `set_config('fg.no_puede')` local; el trigger no deja tocarlo de otra forma) y deja el mensaje (migración 045). |
| `gestion_marcar_leida` | definer | no | sí | activo, interruptor, auth.uid() | Marca leída la conversación de una gestión para quien llama, si la puede ver (migración 045). |
| `gestion_marcar_no_leida` | definer | no | sí | activo, interruptor, auth.uid() | Lo contrario: vuelve a dejar marcada una gestión para quien llama (borra su marca de lectura y pone `visto_hunter`/`visto_dueno` en false, sólo en lo suyo). Migración 049. |
| `gestiones_marcar_todas_leidas` | definer | no | sí | activo, interruptor, auth.uid() | Saca de una todas las marcas propias: novedades y mensajes sin leer de las conversaciones en las que participa. Migración 049. |
| `gestion_participa` | definer | no | sí | rol, auth.uid() | Ayudante: ¿quien llama participa de esta gestión? (hunter, dueño, quien la creó, el líder que reparte o el del hunter). Sólo responde sobre quien llama (migración 045). |
| `gestiones_despues` / `gestion_prospectos_despues` | definer | no | no | auth.uid() | Triggers que escriben el historial (`gestion_eventos`); no se llaman a mano (migración 045). |
| `ges_fin` | invoker | no | no | — | Fin de un tramo horario (sin "hasta" = una hora). Puro, lo usa el trigger (migración 045). |
| `puede_ver_gestion` | definer | no | sí | rol, auth.uid() | Ayudante de RLS de Gestiones (visibilidad por rol). |
| `rate_limit_hit` | definer | no | no | — | Cuenta intentos por IP para la Edge Function. SOLO service_role. |
| `asesores_replace` | invoker | no | sí | auth.uid() | Reemplaza los asesores guardados del usuario. Corre con los permisos de quien llama (RLS). |
| `gestiones_lista` | invoker | no | sí | auth.uid() | Lista de gestiones. Corre con los permisos de quien llama (RLS). |
| `gestiones_mensajes_nuevos` | invoker | no | sí | auth.uid() | Mensajes de otros sin leer, por gestión, de lo que quien llama participa. Corre con los permisos de quien llama (RLS) (migración 045). |
| `gestiones_tablero` | invoker | no | sí | rol, auth.uid() | Tablero de Gestiones. Corre con los permisos de quien llama (RLS). Devuelve además `duenos`: los oficiales que ceden algo en el período, sin mirar el filtro de oficial, para armar el desplegable (migración 049). |
| `padron_asesores_norm` | invoker | no | sí | — | Normalizador puro de datos (no accede a tablas). |
| `padron_cuits_norm` | invoker | no | sí | — | Normalizador puro de datos (no accede a tablas). |
| `padron_replace` | invoker | no | sí | auth.uid() | Reemplaza las empresas del usuario y registra los cambios. Corre con los permisos de quien llama (RLS). |
| `padron_rubro_norm` | invoker | no | sí | — | Normalizador puro de datos (no accede a tablas). |
| `update_updated_at` | invoker | no | no | — | Trigger de fecha de modificación. |

- **definer** = corre con los permisos del dueño (se salta RLS): TIENE que validar cuenta activa, rol y propiedad de los datos por sí misma.
- **invoker** = corre con los permisos de quien llama: RLS decide qué ve y qué escribe.
- Los *triggers* y los normalizadores no se exponen como API.

## Revisión (2026-10-16)
- Ninguna función es ejecutable por `anon` (migración 019); las nuevas heredan ese estado (`alter default privileges`).
- Todas las `security definer` llamables por `authenticated` validan cuenta activa (`is_active()`) salvo los ayudantes de RLS (`get_my_role`, `is_active`, `es_suplente_de`, `gestiones_on`, `puede_ver_gestion`), que sólo responden sobre quien llama.
- `padron_propuesta_crear` no comprobaba el rol → corregido en 022. `colegas_para_suplente` no comprobaba cuenta activa → corregido en 022.
- Las propuestas validan que quien resuelve sea el dueño o su suplente (`es_suplente_de`), y que quien responde sea quien la creó.

## Cómo mantenerlo
Al agregar una función `security definer` nueva: (1) `revoke ... from public, anon`, (2) `grant ... to authenticated` sólo si hace falta,
(3) validar `is_active()` + rol + dueño de los datos adentro, (4) `set search_path = public`, (5) volver a correr la consulta de este inventario.
