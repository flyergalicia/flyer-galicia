# Los mails de aviso no llevan links: la dirección va como texto para copiar

El filtro de correo del banco bloqueaba el click en el botón y daba error. En los mails para entrar va la dirección fija `APP_URL` (nunca una que llegue en el pedido) en una cajita, con "copiá esta dirección y pegala en el navegador". Un mail que falla nunca hace fallar la operación.

## Consecuencias

La clave viaja sólo en dos mails que dispara el admin al ponerla él: el de alta y Admin → Usuarios → Editar con el tilde "Enviar usuario y contraseña por mail". Supabase guarda sólo la huella de la clave, así que el envío va en el mismo paso del cambio y nunca se guarda.
