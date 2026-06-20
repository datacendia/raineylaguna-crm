# 04 — Mensajes y contacto

**Para quién es:** la operadora que envía el primer mensaje a un negocio nuevo, y el
fundador que quiere saber exactamente qué escribe la IA y por qué. No necesitas
conocimientos técnicos.

**Qué vas a hacer:** entender las cuatro formas en que contactamos a un negocio (los
"canales"), dejar que la IA escriba un borrador del primer mensaje, leerlo y editarlo,
enviarlo, y — cuando ayude a la venta — generar una "demo de propuesta" (una web de
una página) para mostrar. También aprenderás qué hace bueno a un mensaje y qué nunca
hacer.

En este capítulo, "lead" significa un negocio con el que quizá queramos trabajar. Un
"borrador" (draft) es un mensaje que la IA escribió y que espera tu revisión antes de
salir.

---

## El panorama

Cuando contactamos a un negocio por primera vez, la meta es **una respuesta, no una
venta.** Queremos que el dueño nos escriba de vuelta. Todo lo de abajo gira en torno
a esa única meta.

El contacto tiene dos partes:

1. **El mensaje** — un primer mensaje corto, en frío. La IA te escribe un borrador.
   Lo lees, quizá lo ajustas, y lo envías (o lo mandas a mano).
2. **La demo de propuesta** (opcional) — una web de una página de muestra que la IA
   arma para un negocio específico, para tener algo que mostrar cuando la conversación
   avance.

---

## Los cuatro canales

Un "canal" es la forma en que un mensaje llega a un negocio. Usamos cuatro, en dos grupos.

| Canal | Grupo | Cómo se envía | Dónde se usa |
|---|---|---|---|
| **WhatsApp** | Automático | El sistema lo envía por ti | **Solo Perú** (ver la regla abajo) |
| **Email** | Automático | El sistema lo envía por ti | En todas partes |
| **Instagram DM** | Manual | **Lo envías tú a mano** | Donde sea |
| **LinkedIn** | Manual | **Lo envías tú a mano** | Donde sea |

**Los canales automáticos (WhatsApp, Email)** tienen una conexión real que entrega el
mensaje — WhatsApp sale por un servicio llamado Twilio, y el correo por uno llamado
Resend. Aprietas un botón y se entrega.

**Los canales manuales (Instagram DM, LinkedIn)** no tienen una forma segura y
permitida de que un software los envíe por nosotros. Por eso el sistema prepara y
guarda el mensaje, pero **tú lo copias y lo envías tú misma** en Instagram o LinkedIn,
y luego lo marcas como enviado. El sistema nunca fingirá que entregó un mensaje de
Instagram o LinkedIn — siempre te avisa que es tu turno.

> ⚠️ Si algo se ve raro: si esperabas que un WhatsApp o correo saliera pero quedó en
> "Pending" con una razón al lado, eso es el sistema protegiéndote, no un error. Las
> razones más comunes están más abajo. Ver también [Solución de problemas](06-solucion-de-problemas.md).

### La regla "WhatsApp solo Perú"

Ahora mismo, **el WhatsApp automático solo está permitido para negocios en Perú.** Es
a propósito, y es importante:

- Enviar WhatsApp o SMS automáticos en frío a números que sacamos de internet es
  **ilegal** en EE. UU. (multas fuertes, por mensaje) y en el Reino Unido/UE, y rompe
  las reglas de los servicios que usamos.
- Hasta que tengamos un camino claro de "aceptaron que los contacten" en cada país, el
  sistema **bloquea** el WhatsApp automático en todas partes salvo Perú.
- Si intentas enviar WhatsApp a un negocio fuera de Perú, quedará en **Pending** con una
  razón como `whatsapp_gated`. Es correcto y esperado. Usa Email, o manda un mensaje
  manual por Instagram/LinkedIn.

El correo y los canales manuales no se ven afectados por esta regla.

---

## Cómo escribe la IA un borrador (el mensaje "v3")

El sistema tiene una sola hoja de instrucciones, escrita con cuidado (la llamamos el
**prompt v3**), que le dice a la IA exactamente cómo escribir un primer mensaje.
Conocer las reglas te ayuda a confiar en el borrador y a detectar algo fuera de lugar.

> 📷 Captura: un borrador generado en la página de un lead, mostrando la etiqueta del canal y el cuerpo del mensaje.

Esto es lo que se le indica a la IA, en simple:

### Elige el idioma y el canal por ti, según el mercado del negocio

Tú **no** eliges esto — siguen al negocio automáticamente:

- **Canal:** WhatsApp si el negocio está en un mercado donde el WhatsApp automático está
  permitido (Perú hoy); si no, Email.
- **Idioma:** **español** para Perú y Latinoamérica, **inglés** para EE. UU. y Reino Unido.

Así cada borrador queda alineado con las reglas de arriba: nunca se escribe en el idioma
equivocado ni para un canal bloqueado.

### Siempre abre con evidencia sobre *su* negocio

La primera frase es **una observación verdadera sobre el negocio mismo** — normalmente
un problema real de la auditoría de su web (por ejemplo, "sin web propia" o "el sitio no
funciona en celular"). A la IA se le dice que **nunca** abra con "Hola, somos Rainey
Laguna". Nos ganamos la respuesta mostrando que de verdad los miramos primero.

### Un hallazgo, una consecuencia, una pregunta

Un buen mensaje es corto y enfocado:

1. **Gancho** — un hallazgo real sobre ellos.
2. **Consecuencia** — una frase de por qué ese hallazgo les importa.
3. **Presentación** — una línea corta de quiénes somos ("un estudio de web pequeño en
   Lima; hacemos pocas cosas, bien").
4. **Llamado a la acción** — un paso fácil (normalmente "te puedo pasar un video de 90
   segundos con dos cambios") **más una pregunta explícita** que hace fácil decir "sí",
   como "¿Te lo paso?". La pregunta es obligatoria — pedimos el siguiente paso, no solo
   lo anunciamos.
5. **Salida (opt-out)** — un amable "si no es para ti, avísame y no te escribo más".
6. **Firma** — "— Equipo Rainey Laguna" (español) o "— The Rainey Laguna team" (inglés).

### La regla dura de "no inventar datos"

Esta es la regla más importante, y vale repetirla porque protege nuestra reputación:

> **Cada dato del mensaje debe venir de información real sobre el negocio.** La IA tiene
> prohibido inventar o adivinar números, porcentajes, rankings, "eres de los mejores del
> distrito", "muchos negocios ya hacen esto", o decir que ya les construimos algo.

Si la IA no tiene un hallazgo fuerte, se le dice que **diga menos** en vez de inventar.
Cuando revises un borrador, esto es lo principal que hay que verificar.

### Formato por canal

- **WhatsApp:** exactamente dos párrafos cortos, máximo unas 90 palabras. Sin asunto.
- **Email:** la primera línea es el asunto (empieza con "Asunto:" en español o "Subject:"
  en inglés), luego una línea en blanco, luego el cuerpo (máximo unas 120 palabras).

---

## Cómo revisar, editar y enviar un borrador

Este es tu trabajo del día a día. Los pasos:

1. Abre el área **Leads** desde el menú de la izquierda.
2. Haz clic en el nombre del negocio para abrir su página de detalle.
3. Busca el **borrador de outreach** de ese lead. Si todavía no hay borrador, usa el
   botón para **generar** uno (la IA lo escribe en unos segundos).
4. **Lee todo el borrador con calma.** Compáralo con los DO y DON'T de abajo — sobre
   todo que cada afirmación sea verdadera y que nada esté inventado.
5. **Edita lo que esté fuera de lugar.** Puedes arreglar la redacción, suavizar una
   línea o corregir un dato. Tú eres el filtro final; confía en tu criterio por encima
   de la IA.
6. **Envíalo:**
   - Si el canal es **WhatsApp o Email** (automático), aprieta el botón **Send**. El
     sistema lo entrega y actualiza el estado.
   - Si el canal es **Instagram DM o LinkedIn** (manual), el sistema te dirá que es un
     canal manual. **Copia el mensaje, abre Instagram o LinkedIn tú misma, pégalo y
     envíalo,** luego regresa y **márcalo como enviado** para que nuestros registros
     queden exactos.

> 📷 Captura: el botón Send en un borrador automático, y el estado "canal manual — marcar como enviado" en un borrador de Instagram/LinkedIn.

### Qué significan los estados

Después de apretar Send, un borrador cae en uno de estos estados:

| Estado | Qué significa | Qué haces |
|---|---|---|
| **Sent** | El proveedor lo aceptó y lo entregó (WhatsApp/Email). | Nada — listo. |
| **Pending** | No se pudo enviar ahora y se reintentará. Hay una razón corta. | Lee la razón (abajo). Arréglala si puedes y reintenta. |
| **Manual** | Es un mensaje de Instagram/LinkedIn — es tu turno. | Envíalo a mano y luego márcalo como enviado. |

Razones de **Pending** comunes, en simple:

| Razón que puedes ver | Qué significa de verdad |
|---|---|
| `whatsapp_gated` | WhatsApp aún no está permitido para ese mercado (no es Perú). Usa Email o un canal manual. |
| `lead_phone_missing` | No tenemos un número de teléfono para ese negocio. |
| `lead_email_missing` | No tenemos un correo para ese negocio. |
| `email_gated` | En el Reino Unido/UE solo enviamos correo automático a direcciones de empresa; una dirección personal (como Gmail) se retiene para que la revises a mano. |
| `twilio_not_configured` / `resend_not_configured` | El servicio de envío no está configurado. Es un tema de configuración, no es culpa tuya — avísale al fundador. |

> ⚠️ Si algo se ve raro: "Pending" casi siempre es el sistema siendo cuidadoso, no algo
> roto. Si puedes arreglar la causa (p. ej. agregar un correo que falta), hazlo y
> reintenta. Si la razón dice "not configured", es una tarea de configuración — ver
> [Solución de problemas](06-solucion-de-problemas.md).

---

## El generador de "demo de propuesta" (a pedido)

Aparte del primer mensaje, hay una herramienta que arma una **web de una página de
muestra** hecha a medida de un negocio específico — algo visual que puedes mostrar
durante una conversación de venta para hacer la idea real.

**Qué produce:**

- Una sola página web autocontenida (una maqueta) con nuestros colores de marca, armada
  alrededor de lo que de verdad le venderíamos a ese negocio — por ejemplo una página de
  **catálogo/carta**, una **landing**, un **portal de cliente**, un **portafolio**, un
  **brand board**, o una **homepage** completa. La IA elige la forma correcta según el
  "potencial" (la oportunidad anotada en el lead).
- Usa el **nombre, distrito y rubro reales** del negocio, con productos o secciones de
  ejemplo que calzan con su tipo de negocio.
- Al final hay un pequeño **panel de brief interno** ("Rainey Laguna · Brief interno") —
  una nota solo para nosotros, con lo que necesitaría el proyecto y una o dos ideas con
  buen gusto. Está diseñado para verse como anotación interna, no como parte de la
  maqueta pública.

**Cosas importantes que debes saber:**

- **Es solo a pedido.** Generar una demo cuesta mucho más que un mensaje de texto, así
  que solo corre cuando **haces clic en el botón**. Nunca corre sola en segundo plano.
- **Aplican las mismas reglas de honestidad.** La demo puede incluir platos o precios de
  ejemplo claramente marcados como ejemplos, pero la IA tiene **prohibido inventar datos
  de contacto reales, estadísticas reales, número de reseñas o testimonios con nombre.**

Cómo usarla: abre el lead, haz clic en el botón **pitch demo / generate demo**, espera
unos segundos, luego abre el resultado para previsualizarlo antes de mostrarlo o
enviarlo al negocio.

> 📷 Captura: el botón de demo en un lead, y la maqueta de una página resultante.

---

## DO y DON'T del mensaje

Estas son las reglas que la IA sigue — y con las que tú debes medir cada mensaje antes
de que salga.

**SÍ (DO):**

- Abre con una observación verdadera sobre **su** negocio.
- Mantén **un hallazgo + una consecuencia** — no amontones tres problemas.
- Incluye la línea corta de quiénes somos **después** del gancho.
- Termina con un paso fácil **y una pregunta explícita** ("¿Te lo paso?").
- Conserva la línea amable de salida (opt-out).
- Usa el nombre real del negocio y, si lo tenemos, su Instagram real.
- Calza el idioma: español (peruano, "tú" cercano) para Perú/Latam; inglés para EE. UU./Reino Unido.

**NO (DON'T):**

- No inventes números, porcentajes, rankings, ni "eres el mejor del distrito".
- No digas que ya construimos o auditamos algo que no hicimos.
- No abras con "Hola, somos Rainey Laguna".
- No uses emojis, ni signos de exclamación al abrir, ni relleno como "espero que te encuentres bien".
- No amontones varios hallazgos ni escribas un muro de texto.
- No uses español con voseo ("vos", "tenés", "querés") — siempre "tú" peruano neutral.

### Un buen ejemplo en español (WhatsApp, Perú)

> Hola, equipo de Sazón Criolla. Vi que reciben pedidos por DM y que no tienen una carta
> propia en línea; cada pedido pasa por un ida y vuelta manual de mensajes.
>
> Somos Rainey Laguna, un estudio de web en Lima; hacemos pocas cosas, bien. Te puedo
> pasar un video de 90 segundos con dos cambios concretos para que el cliente pida solo.
> ¿Te lo paso? Si no es para ti, sin problema: avísame y no te escribo más.
> — Equipo Rainey Laguna

Por qué es bueno: abre con un hallazgo real sobre *ellos*, una consecuencia (ida y vuelta
manual), una presentación corta, un paso concreto más una pregunta clara, la salida y la
firma correcta — y cero números inventados.

### Un buen ejemplo en inglés (Email, EE. UU.)

> Subject: A note on your booking flow
>
> Hi Riverside Dental team. I noticed your site doesn't let patients book an appointment
> online — every request still goes through a phone call.
>
> We're Rainey Laguna, a small web studio in Lima; we do a few things, well. I can send a
> 90-second video showing two specific changes that would let patients book themselves.
> Want me to send it over? If it's not for you, no problem — just say so and I won't write again.
> — The Rainey Laguna team

Por qué es bueno: asunto corto, apertura con evidencia sobre *su* negocio, una
consecuencia, una línea de presentación, un paso concreto con una pregunta explícita, la
salida y la firma. (Va en inglés porque es un lead de EE. UU.)

---

## Una nota sobre las plantillas antiguas (legacy)

Quizá escuches de unas "plantillas de scripts" más viejas — mensajes fijos para
rellenar, por rubro (gastronomía, legal, automotriz, belleza, fitness). **Son legacy
(antiguas).** Vinieron antes de los borradores v3 de la IA y se guardan solo como
referencia. Para contacto nuevo, **usa el borrador de la IA.** Es bilingüe, abre con
evidencia, sigue la regla de no inventar, y es la versión que seguimos mejorando.

---

## Capítulos relacionados

- [Leads, pipeline y ciudades](03-leads-y-pipeline.md) — encontrar negocios, auditorías y el "potencial" que guía borradores y demos.
- [Solución de problemas](06-solucion-de-problemas.md) — qué hacer cuando un envío queda en Pending o un servicio no está configurado.
