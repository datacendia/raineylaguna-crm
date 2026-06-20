# 03 — Leads, pipeline, descubrimiento y ciudades

**Para quién es:** la operación.
**Qué vas a hacer:** entender la lista de Leads y el Pipeline, cómo se puntúan y de
dónde vienen los leads, y cómo se encuentran nuevos.

---

## Etapas del pipeline

Cada lead tiene una **etapa** que dice dónde está en el recorrido:

| Etapa | Significado |
|-------|-------------|
| **Lead** | En el sistema, aún sin contactar. |
| **Contacted** | Primer mensaje enviado. |
| **Audited** | Le compartimos una auditoría / le mostramos qué arreglaríamos. |
| **Proposal** | Hay una propuesta concreta afuera. |
| **Closed** | Ganado, o dejado de lado. |

Mueves la etapa de un lead hacia adelante a medida que avanza la conversación. La
página **Pipeline** muestra a todos agrupados por etapa.

## Potencial y prioridad

Cada lead tiene un **Potential** (potencial, p. ej. High / Medium) y un **puntaje de
prioridad** interno. Te ayudan a decidir a quién contactar primero. El puntaje toma
en cuenta cosas como el nivel del distrito y la salud digital del lead. **Ordena por
potencial** para invertir tu tiempo en los negocios más prometedores.

## Origen (Source)

Cada lead está etiquetado con su origen. El CRM ordena las muchas etiquetas crudas
en unos pocos **grupos de origen** para que puedas filtrar:

`audit` · `whatsapp` · `contact-form` · `proto` (sitio de 60 segundos) · `discovery`
(encontrado automáticamente) · `import` · `referral` · `event` · `other`

Usa el filtro **Source** en la página Leads para enfocarte — p. ej. los leads `audit`
y `contact-form` están más tibios porque ellos vinieron a nosotros.

## Etiquetas, posponer y próxima acción

- **Tags (etiquetas)** — rótulos libres que agregas para agrupar leads a tu manera.
- **Snooze (posponer)** — esconde un lead hasta una fecha futura (p. ej. "ahora no,
  reviso en marzo").
- **Next action (próxima acción)** — una nota corta de lo siguiente que hay que hacer
  (p. ej. "enviar propuesta el viernes"). Pon siempre una cuando toques un lead para
  que nada se escape.

## Sin duplicados

Cuando llega un lead con un correo o teléfono que ya tenemos, el CRM lo **une** al
registro existente (agregando una nota con fecha) en vez de crear un duplicado. No
tienes que limpiar duplicados a mano.

## Importar y exportar

- **Import** — trae una lista de negocios desde un archivo CSV.
- **Export** — descarga tus leads (p. ej. para un respaldo o un reporte).

## Descubrimiento — encontrar leads nuevos automáticamente

El CRM puede salir a buscar negocios por ti, de dos maneras:

| Método | Costo | Notas |
|--------|-------|-------|
| **OpenStreetMap (gratis)** | **Gratis** | Sin factura de API. La opción por defecto para sumar volumen. |
| **Google Places** | Pagado (por consulta) | Datos más ricos, pero cuesta dinero cada vez. |

Ambos agregan negocios como leads `discovery` y saltan a quien ya esté en el sistema.
Correr el descubrimiento suele ser tarea del fundador (ver [07 — Configuración](../07-configuration.md)).

## Ciudades y mercados

El CRM es **multiciudad**. Cada lead pertenece a una **ciudad** (Lima, Boston, Glasgow,
Los Ángeles, …). La ciudad importa porque decide:

- el **idioma** en que escribimos el mensaje (español para Perú/Latinoamérica, inglés
  para EE. UU./Reino Unido), y
- qué **canales** podemos usar (ver [05 — Cumplimiento y seguridad](05-cumplimiento.md)).

Usa el filtro **City** en la página Leads para trabajar un mercado a la vez.

## Capítulos relacionados

- [02 — Flujo diario](02-flujo-diario.md) · [04 — Mensajes](04-mensajes.md) · [05 — Cumplimiento](05-cumplimiento.md)
