# Glosario

Cómo se llama en el código cada término del negocio. El código va en inglés; las pantallas siguen en español.

| En pantalla | En el código | Qué es |
|---|---|---|
| Armador | `flyer-editor` | Pantalla donde se arma el flyer |
| Cambiar logos | `logo-editor` | Edición de logos sobre el flyer |
| Franja | `logoStrip` | Fila o grilla de logos armada de una vez |
| Marcas guardadas | `savedBrandSet` | Combinación de marcas que se vuelve a aplicar |
| Borrador | `draft` | Cambios temporales sobre un flyer |
| Flyer a medio armar | `sessionDraft` | Lo que queda en el navegador para retomar al volver a entrar (facultad "Guardar historial y borrador") |
| Historial | `flyerHistory` | Los flyers que salieron, para volver a bajarlos o traerlos al formulario |
| Tu favorito | `favoriteFlyer` | El tercer flyer de la barra, que elige cada persona con la estrellita |
| Oficiales por sede | `branches` | Hasta 8 oficiales, cada uno con su ubicación |
| Ventana de Vista previa | `previewWindow` | El flyer tal como se baja, con su zoom |
| Recortar | `cropSection` | Quitar una franja horizontal del flyer |
| Insertar | `insertSection` | Sumar una sección copiada de otro flyer |
| Opción | `flyerOption` | Cada flyer disponible en una solapa |
| Legal | `legalText` | Texto legal del flyer |
| Masivo | `bulkGeneration` | Generar flyers desde un Excel |
| Generar flyers | `companyBatch` | El ZIP de varias empresas de la lista, cada una en su flyer |
| Todo el segmento | `segment` | Las empresas de la lista que salen con el flyer en pantalla, desde la tarjeta de Masivo |
| Tanda | `batch` | Muchos flyers de una, en un ZIP: Masivo, Generar flyers y el del Hunter |
| Buscar flyer, Flyer por empresa | `hunter` | La pantalla del perfil Hunter: busca una empresa y baja su flyer |
| Descarga múltiple | `tickedCompanies` | Las empresas que el Hunter tilda para bajarlas en un ZIP |
| Padrón, Mis empresas | `company-registry` | Base de empresas de cada usuario |
| Oficial, asesor | `officer` | Persona del banco que figura en el flyer |
| Tope | `cap` | Monto máximo de cashback |
| Rubro | `category` | Combustible, supermercado, etc. |
| Suplente | `substitute` | Quien cubre a otro y ve su base |
| Propuesta | `proposal` | Pedido de cambio sobre una empresa |
| Promociones | `promotions` | Buscador de promociones vigentes |
| Marcas vigiladas | `watchedBrand` | Marcas cuya vigencia se revisa cada día |
| Estudio | `studio` | Diseños guardados y su publicación |
| Flyers para copiar | `sourceFlyer` | Depósito de flyers de donde se copia una sección |
| Gestiones | `commercial-actions` | Visitas, ferias y altas con su tablero |
| Gestión, acción | `action` | Una visita, feria, posición comercial o base de datos, en la tabla `gestiones` |
| Derivar | `forward` | El oficial le pasa una acción a un hunter o al líder |
| Base de datos (de una acción) | `dataList` | Una lista de personas para contactar. No es la "Base de datos" del menú del nombre |
| Que la asigne el líder, por asignar | `toLeader` | Una acción derivada que todavía no tiene hunter |
| No puedo ir | `cannotAttend` | El hunter avisa que hay que pasársela a otro |
| Prospecto | `prospect` | Persona contactada en una gestión |
| Alta | `signup` | Prospecto que abrió un paquete |
| Paquete | `accountPackage` | Producto del banco que capta el hunter |
| Líder | `leader` | Quien tiene un equipo de hunters |
| Agenda | `agenda` | El calendario de Gestiones: Semana, Día, Día del equipo y Mes |
| Día del equipo | `teamDay` | Una fila por hunter y una columna por hora, para ver quién tiene lugar |
| Ocupado (tapado) | `hidden` / `occupied` | Horario de un hunter con una empresa que quien mira no puede ver |
| Bandejas | `trays` | Lo que va arriba de la agenda: Para contactar, Por asignar, Piden que se la pasen a otro, Bases para trabajar |
| Para contactar | `toContact` | Personas con fecha de próximo contacto vencida o de hoy |
| Tablero | `dashboard` | Los números de Gestiones en un período |
| Oficial Payroll | `officer` (en el tablero) | El oficial dueño de la empresa |
| Benchmark | `benchmark` | Galicia contra la competencia, promo por promo |
| Compra de referencia | `referencePurchase` | El monto por rubro con el que se calcula cuánto devuelve cada promo |
| Lo que devuelve | `returned` | El menor entre compra de referencia × % y el tope |
| Compartidas de MODO | `sharedPromotion` | Promos de MODO que valen con cualquier banco: no cuentan para ganar |
| Cargadas a mano | `handLoadedPromotion` | Promos de Macro, Santander o de un paquete que carga el administrador |
| Etiqueta de fuente | `sourceLabel` | De dónde sale cada banco y cuándo se leyó |
| Tarjetas y salas VIP | `premiumCard` | Tarjetas premium con sus pases a salas VIP, cargadas a mano |
| Facultades | `permissions` | Lo que puede hacer cada perfil |
| Panel del administrador | `admin` | Lo que abre el botón ⚙ Admin del encabezado |
| Pilar | `pillar` | Admin, Data o Config: cada uno con sus hojas |
| Hoja (del panel) | `sheet` | Dashboard, Usuarios, Registros, Uso, Facultades, Auditoría, Mis empresas, Mis asesores, Empresas por usuario, Cambios en las empresas y las de Config |
| Columna «Vos» | `own` | Lo que el administrador se saca a sí mismo en Facultades |
| Vista previa de un perfil | `rolePreview` | El administrador ve la app como la ve un perfil, con la barra negra de abajo |
| Registros | `flyerLogs` | Los flyers que salieron, de `flyer_logs` |
| Uso | `usage` | Cuántos flyers salen, de qué flyer, por perfil y por semana |
| Auditoría | `audit` | Quién hizo qué sobre las cuentas, de `audit_log` |
| Cambios en las empresas | `companyLog` | Altas, modificaciones y bajas de las empresas, de `padron_log` |
| Empresas por usuario | `otherPeople` | El administrador lee la lista de otro, sin poder editarla |
| Perfil | `role` | Admin, VIP, asesor, Hunter, Líder, Prospect |
| Config → Flyer | `FlyerSheet` | La hoja del panel donde se sube un flyer y se activa o desactiva el de cada opción |
| Versión (de un flyer) | `uploadedFlyer` | Un archivo subido al bucket (`flyer_<hora>_op<n>.jpg`, o `index_<hora>.html` si se subió un HTML con la imagen adentro) |
| Flyer activo | `activeFlyer` | Lo que dice `_active<n>.json`: la imagen y la calibración que usa esa opción |
| Calibrador | `calibrator` | La ventana donde se acomodan las zonas del flyer sobre su imagen |
| Zona | `zone` | Empresa, Montos, cada caja, Cashback, Asesores, Legales y cada línea del cartel |
| Partir de esta base | `calibrationBase` | Un punto de partida medido para un modelo de flyer (Galicia, Pasá tu sueldo) |
| Plantilla del cartel | `benefitTemplate` | Las líneas del cuadro del beneficio de cada rubro (Flyer Rubros) |
| Configuración de cashback | `cashbackConfig` | BAU, Config 1…: los cuatro montos que se eligen en el armador; Config → Cashback las edita (`_cashback.json`) |
| Marcador (del legal) | `legalMarker` | `{empresa}`, `{importe}`, `{importe2}`… en el legal de una opción: el armador los completa solo |
| Reemplaza a | `reemplaza` (en `_opciones.json`) | La opción de la campaña anterior: las empresas que la tenían pasan solas a la nueva |
| Vigente (de un rubro) | `currentOfCategory` | El flyer que hoy recibe las empresas de su rubro (la etiqueta VIGENTE de Config → Opciones) |
| Versión sin cashback | `sinCB` (en `_opciones.json`) | La opción hecha con Recortar + Estudio a la que van las empresas sin cashback |
| Buscador de pantallas | `search` | Lo que abre Cmd+K (Ctrl+K en Windows) o el botón Buscar del encabezado |
| Entrada (del buscador) | `SearchEntry` | Cada cosa a la que lleva el buscador: una solapa, un flyer, un panel del armador, una hoja… |
| Recientes | `recent` | Lo último que se eligió en el buscador, primero; sólo los ids, en `fg_cmdk_rec` |
| Lugar (dentro de una pantalla) | `place` | Masivo del armador, Activas de Promociones, una vista de Benchmark, una hoja del panel: adonde se llega desde afuera por el `PlaceDesk` |
| Ventana-pantalla | `screenWindow` | Base de datos y el panel del administrador: el buscador abre encima y, al ir a otro lado, las cierra con su pregunta |
| Tutorial, Ver tutorial | `tour` | El recorrido guiado sobre la pantalla real, por capítulos y por perfil. Arranca solo la primera vez con la facultad «Tutorial al primer ingreso» (`tutorial_auto`); lo visto queda en `fg_tour_done_<id>` |
| Capítulo (del tutorial) | `chapter` | Armar un flyer, Masivo, Historial, Tu menú, Buscar flyer, Promociones, Gestiones, Opciones, Flyer Rubros: las pastillas de arriba del globo |
| Paso (del tutorial) | `step` | Lo que se ilumina y su explicación; «Omitir capítulo» salta al primero del capítulo siguiente |
| Globo, luz y velo | `tip`, `spotlight`, `veil` | El cartel con flecha, el recuadro rojo sobre el elemento y lo que oscurece el resto de la pantalla |

Los perfiles Hunter y Prospect, la palabra cashback y el nombre Benchmark quedan igual.

**No se traducen**, porque son contratos con la base o con datos ya guardados: `padron_empresas`, `gestiones`, `flyer_disenos`, `importe`, `importe2`, `{importe}`, las claves de los JSON del bucket y las de `localStorage`.
