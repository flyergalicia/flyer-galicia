# Inventario de funciones de la base (schema public)

Generado el 2026-10-16 desde la base real (consulta a `pg_proc` + `has_function_privilege`).
**Regla:** una función expuesta a `authenticated` se puede llamar sin pasar por la pantalla, así que
tiene que comprobar ella misma quién llama. Esconder el botón no es una barrera.

| Función | Tipo | anon | authenticated | Comprueba | Para qué |
|---|---|---|---|---|---|
| `_prop_mi_nombre` | definer | no | no | auth.uid() | Ayudante interno de las propuestas (nombre de quien llama). |
| `colegas_para_suplente` | definer | no | sí | activo, auth.uid() | Lista de colegas elegibles como suplente. Exige cuenta activa. |
| `es_lider_de` | definer | no | no | auth.uid() | Ayudante de RLS de Gestiones (jerarquía de Líder). |
| `es_suplente_de` | definer | no | sí | auth.uid() | ¿Quien llama es suplente de ese oficial? Sólo responde sobre sí mismo. |
| `flyer_disenos_guardia` | definer | no | no | rol, auth.uid() | Trigger de Estudio (migración 026): el dueño y el autor salen de la sesión, y la revisión (nota, opción publicada, fecha) sólo la escribe el admin. No se llama a mano. |
| `gestion_marcar_vista` | definer | no | sí | activo, auth.uid() | Marca como vista una serie de gestiones. Exige cuenta activa y que quien llama sea parte (hunter o dueño). |
| `gestion_prospectos_antes` | definer | no | no | auth.uid() | Trigger de Gestiones (no se llama a mano). |
| `gestiones_antes` | definer | no | no | rol, auth.uid() | Trigger de Gestiones (no se llama a mano). |
| `gestiones_on` | definer | no | sí | rol, auth.uid() | Interruptor general de Gestiones comerciales. |
| `gestiones_personas` | definer | no | sí | activo | Lista de personas activas para los selectores de Gestiones. Exige cuenta activa y el módulo prendido. |
| `get_my_role` | definer | no | sí | auth.uid() | Rol de quien llama. Lo usan casi todas las políticas RLS. |
| `guard_profile_update` | definer | no | no | rol, auth.uid() | Trigger: impide que alguien cambie su propio rol o estado. |
| `handle_new_user` | definer | no | no | — | Trigger de alta de usuario. |
| `is_active` | definer | no | sí | auth.uid() | ¿Quien llama está activo? (active o reset_pending). Lo usan casi todas las políticas RLS. |
| `padron_propuesta_aprobar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) aprueba una propuesta de oficiales. |
| `padron_propuesta_consultar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) hace una consulta sobre una propuesta. |
| `padron_propuesta_crear` | definer | no | sí | activo, rol, auth.uid() | Un Hunter (o admin) propone cambiar los oficiales de una empresa. Exige rol hunter/admin (migración 022). |
| `padron_propuesta_rechazar` | definer | no | sí | activo, auth.uid() | El dueño (o su suplente) rechaza una propuesta. |
| `padron_propuesta_responder` | definer | no | sí | activo, auth.uid() | Sólo quien creó la propuesta responde a una consulta. |
| `prueba_cambiar_rol` | definer | no | sí | activo, auth.uid() | Sólo la cuenta de prueba (es_prueba) puede cambiar de perfil. |
| `puede_ver_gestion` | definer | no | sí | rol, auth.uid() | Ayudante de RLS de Gestiones (visibilidad por rol). |
| `rate_limit_hit` | definer | no | no | — | Cuenta intentos por IP para la Edge Function. SOLO service_role. |
| `asesores_replace` | invoker | no | sí | auth.uid() | Reemplaza los asesores guardados del usuario. Corre con los permisos de quien llama (RLS). |
| `gestiones_lista` | invoker | no | sí | auth.uid() | Lista de gestiones. Corre con los permisos de quien llama (RLS). |
| `gestiones_tablero` | invoker | no | sí | rol, auth.uid() | Tablero de Gestiones. Corre con los permisos de quien llama (RLS). |
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
