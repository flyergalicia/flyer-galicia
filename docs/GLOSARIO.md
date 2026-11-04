# Glosario

Cómo se llama en el código nuevo cada término del negocio. El código va en inglés; las pantallas siguen en español.

| En pantalla | En el código | Qué es |
|---|---|---|
| Armador | `flyer-editor` | Pantalla donde se arma el flyer |
| Cambiar logos | `logo-editor` | Edición de logos sobre el flyer |
| Franja | `logoStrip` | Fila o grilla de logos armada de una vez |
| Marcas guardadas | `savedBrandSet` | Combinación de marcas que se vuelve a aplicar |
| Borrador | `draft` | Cambios temporales sobre un flyer |
| Recortar | `cropSection` | Quitar una franja horizontal del flyer |
| Insertar | `insertSection` | Sumar una sección copiada de otro flyer |
| Opción | `flyerOption` | Cada flyer disponible en una solapa |
| Legal | `legalText` | Texto legal del flyer |
| Masivo | `bulkGeneration` | Generar flyers desde un Excel |
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
