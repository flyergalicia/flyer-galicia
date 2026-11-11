# El alta de usuarios pasa siempre por la Edge Function auth-admin

El registro directo de Supabase está cerrado. `auth-admin` exige mail del banco y nunca toma el rol de los datos del registro: así nadie se da de alta como admin desde el navegador. Si el alta desde Admin → Usuarios fallara, la salida de emergencia es `disable_signup=false`, avisando al dueño.
