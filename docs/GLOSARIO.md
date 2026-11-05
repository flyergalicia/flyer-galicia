# Glosario

Cómo se llama en el código nuevo cada término del negocio. El código va en inglés; las pantallas siguen en español.

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
| Prospecto | `prospect` | Persona contactada en una gestión |
| Alta | `signup` | Prospecto que abrió un paquete |
| Paquete | `accountPackage` | Producto del banco que capta el hunter |
| Líder | `leader` | Quien tiene un equipo de hunters |
| Facultades | `permissions` | Lo que puede hacer cada perfil |
| Perfil | `role` | Admin, VIP, asesor, Hunter, Líder, Prospect |

Los perfiles Hunter y Prospect, la palabra cashback y el nombre Benchmark quedan igual.

**No se traducen**, porque son contratos con la base o con datos ya guardados: `padron_empresas`, `gestiones`, `flyer_disenos`, `importe`, `importe2`, `{importe}`, las claves de los JSON del bucket y las de `localStorage`.
