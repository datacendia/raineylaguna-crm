# 05 — Cumplimiento y seguridad (SOP)

**Para quién es:** todas las personas que envían contacto, y el fundador. Este es el
reglamento de seguridad sobre a quién podemos contactar, por qué canal y cómo.

**Qué vas a hacer:** aprender las reglas simples que el CRM ya aplica por ti, entender
los límites por país y canal, y seguir una pequeña hoja de referencia para nunca enviar
algo que nos haga bloquear, multar o banear.

> ⚠️ **Esto es guía operativa, no asesoría legal.** Explica cómo trabajamos día a día y
> por qué el sistema bloquea ciertos envíos. No es una opinión legal. Si surge una
> pregunta legal real — una queja, una carta de cese, un oficio de un regulador —
> detente y escala al fundador antes de responder. Ver [Solución de problemas](06-solucion-de-problemas.md).

---

## La gran idea

Hacemos **contacto en frío** — contactamos negocios que no nos han pedido que les
escribamos. Distintos países tienen reglas muy diferentes sobre eso, y las plataformas
que usamos (WhatsApp, Twilio, correo) tienen sus propias reglas encima. Por eso el canal
seguro cambia según **en qué país está el lead**.

El CRM sabe la **ciudad** de cada lead, y la ciudad dice el **país**. El sistema usa eso
para **bloquear automáticamente** los envíos más riesgosos antes de que salgan. No tienes
que memorizar la ley. Sí necesitas entender qué significan los bloqueos y nunca tratar de
saltártelos.

Los cuatro canales que usamos:

- **Llamada en frío (CALL)** — una llamada que haces a mano. Siempre decisión humana; el
  CRM nunca marca solo.
- **TEXTO (TEXT)** — mensajes de SMS o WhatsApp. El CRM puede enviar WhatsApp
  automáticamente, pero **solo para Perú**.
- **CORREO (EMAIL)** — enviado automáticamente por nuestro proveedor (Resend), con reglas
  sobre qué direcciones se permiten.
- **DM SOCIAL (SOCIAL DM)** — mensajes directos de Instagram o LinkedIn. El CRM **nunca**
  los envía. Los envías tú a mano.

---

## Matriz país por canal

Muestra, para cada mercado, si cada canal está OK para contacto en frío y la razón en
una línea. "OK" = generalmente aceptable cuando se hace bien (negocio como objetivo,
mensaje educado, salida fácil). "Solo manual" = un humano debe enviarlo en persona, nada
automático.

| Mercado (ciudad) | País | Llamada | TEXTO (SMS + WhatsApp) | CORREO | DM SOCIAL |
|---|---|---|---|---|---|
| **Lima** | Perú | OK (humano) | **OK — WhatsApp automático** | OK (cualquier dirección, con salida) | Solo manual |
| **Boston** | EE. UU. | OK (humano, ojo con no-llamar) | **Evitar** — TCPA de EE. UU.: multas fuertes por mensaje | OK (cualquier dirección, con salida — CAN-SPAM) | Solo manual |
| **Los Ángeles** | EE. UU. | OK (humano, ojo con no-llamar) | **Evitar** — TCPA de EE. UU.: multas fuertes por mensaje | OK (cualquier dirección, con salida — CAN-SPAM) | Solo manual |
| **Glasgow** | Reino Unido | OK (humano) | **Evitar** — PECR/GDPR del RU: requiere consentimiento | **Solo direcciones de empresa** | Solo manual |
| México | México (candidato) | OK (humano) | Solo manual/personal | OK (cualquier dirección, con salida) | Solo manual |
| Colombia | Colombia (candidato) | OK (humano) | Solo manual/personal | OK (cualquier dirección, con salida) | Solo manual |
| Argentina | Argentina (candidato) | OK (humano) | Solo manual/personal | OK (cualquier dirección, con salida) | Solo manual |
| Panamá | Panamá (candidato) | OK (humano) | Solo manual/personal | OK (cualquier dirección, con salida) | Solo manual |
| Ecuador | Ecuador (candidato) | OK (humano) | Solo manual/personal | OK (cualquier dirección, con salida) | Solo manual |

Notas que aplican a toda la tabla:

- **TEXTO, en todas partes:** aunque la ley sea más ligera con el texto, **la política de
  WhatsApp Business y las reglas de Twilio igual aplican**. Requieren que el contacto
  haya dado su consentimiento. Por eso el CRM solo envía WhatsApp automático a **Perú**
  hoy, donde existe nuestro camino de consentimiento. Los mercados candidatos de Latam
  están como "Solo manual/personal" para texto porque **aún no** activamos el texto
  automático ahí — si alguna vez les escribes, debe ser un mensaje personal, único y
  humano, no un envío masivo.
- **EE. UU. (Boston, LA):** la ley que muerde es **TCPA**. Permite multas de
  aproximadamente **$500 a $1,500 por cada mensaje** sin consentimiento. Las llamadas se
  permiten pero debes respetar los pedidos de no-llamar. El correo está bien bajo
  **CAN-SPAM** si cada mensaje tiene una forma clara de darse de baja.
- **Reino Unido (Glasgow):** **PECR/GDPR** requiere consentimiento primero. Solo enviamos
  correo a direcciones de **dominio de empresa** (p. ej. `nombre@sutienda.co.uk`), nunca a
  direcciones personales gratuitas (Gmail, Hotmail, etc.), porque la dirección personal de
  un trabajador independiente cuenta como un individuo que debe haber dado su consentimiento.
- **Latam (Perú + candidatos):** la fiscalización es más ligera, así que el correo a
  cualquier dirección está bien **mientras haya una salida**. Eso no quiere decir "todo
  vale" — sé respetuosa y para cuando te lo pidan.

> ⚠️ **Si un mercado no está en la tabla:** el CRM trata las ciudades desconocidas como la
> opción *más estricta* y bloquea el WhatsApp automático y el correo a direcciones
> personales. Es a propósito (falla "del lado seguro"). No inventes el nombre de una
> ciudad para saltarte esto — habla con el fundador para agregar el mercado bien.

---

## Las reglas en simple

Estas son las reglas que el código ya aplica. Conocerlas te ayuda a leer los mensajes del CRM.

### Regla 1 — El WhatsApp automático va SOLO A PERÚ

El CRM solo enviará un WhatsApp automático a un lead cuya ciudad sea un mercado de
**Perú** (hoy, Lima). Para cualquier otro país, lo rechaza.

Cuando lo rechaza, el envío **no** sale. Queda en estado de espera ("Pending") y la razón
se registra como:

```
whatsapp_gated:<ciudad>_market_not_allowed
```

En simple: *"No envié este WhatsApp porque el país de esa ciudad no está permitido para
WhatsApp automático."* Es normal y esperado para cualquier lead fuera de Perú. **No** es
un error que tengas que arreglar. No lo reintentes como WhatsApp — usa otro canal
(normalmente correo) o manda un mensaje personal a mano si corresponde.

> 📷 Captura: un envío con una razón `whatsapp_gated:...` en estado Pending, para reconocerlo.

### Regla 2 — Correo automático solo a direcciones de EMPRESA en el Reino Unido/UE

En países que **requieren consentimiento primero** (el Reino Unido, y Europa en general),
el CRM solo enviará correo automático a una dirección de **dominio de empresa** — por
ejemplo `info@bellashair.co.uk`.

Si la dirección es de un proveedor **gratuito y personal** — Gmail, Hotmail, Outlook,
Yahoo, iCloud, Proton y similares — el CRM la trata como de un individuo y la **retiene
para revisión manual**. No la envía sola. La razón registrada es:

```
email_gated:personal_address_in_<ciudad>
```

En simple: *"El correo de este lead de RU/UE parece personal, no de empresa, así que lo
retengo en vez de enviarlo solo."* Si igual quieres llegar a ese lead, hazlo como un
correo personal y cuidado, escrito a mano — no un envío automático.

En países **permisivos** — **EE. UU., Perú, México, Colombia, Argentina, Panamá,
Ecuador** — el CRM enviará correo automático a **cualquier** dirección válida (de empresa
o personal), siempre que el mensaje lleve una salida. Así que **no** verás `email_gated`
en esos mercados.

### Regla 3 — El correo está bien en EE. UU. y Latam, con una salida

Cada correo automático debe darle al destinatario una forma fácil de decir "para". Esta
es la regla que hace seguro el correo en EE. UU. y Latam. Nunca quites la línea de salida
(opt-out) de una plantilla. Si un lead pide que lo saquen, hazlo de inmediato y márcalo
para que nunca se le vuelva a contactar.

### Regla 4 — Los DM sociales quedan MANUALES y personales

El CRM **no puede** y **no** envía mensajes de Instagram ni LinkedIn. No hay forma
aprobada de automatizarlos, e intentarlo haría que baneen las cuentas. El sistema marca
estos canales como **manual**: puede ayudarte a preparar y registrar el mensaje, pero
**tú** lo envías a mano desde tu propia cuenta y luego lo marcas como enviado.

Mantén los DM sociales cortos, personales y uno a uno. Nunca pegues el mismo mensaje a
docenas de personas — eso es lo que se marca como spam.

---

## Hoja de referencia "¿Qué puedo enviar y dónde?"

En la duda, prefiere **correo** (EE. UU./Latam) o un **canal personal** a mano.

| Si el lead está en… | Mejor canal automático | Texto | DM social |
|---|---|---|---|
| **Perú / Lima** | WhatsApp (automático) o correo | WhatsApp OK (automático) | A mano, personal |
| **EE. UU. (Boston / LA)** | Correo (con salida) | No autoenvíes texto — riesgo TCPA | A mano, personal |
| **Reino Unido (Glasgow)** | Correo — **solo direcciones de empresa** | No autoenvíes texto — PECR | A mano, personal |
| **México / Colombia / Argentina / Panamá / Ecuador** | Correo (con salida) | Personal, solo a mano | A mano, personal |
| **Una ciudad que no reconoces** | Detente — pregunta al fundador | No | No |

---

## Lista de PROHIBIDOS

- **NO** intentes autoenviar WhatsApp a ningún lead fuera de Perú. Si ves `whatsapp_gated`, ese es el sistema protegiéndote. Déjalo.
- **NO** autoenvíes texto (SMS o WhatsApp) a leads en EE. UU. Las multas de TCPA son por mensaje y suman rápido.
- **NO** autoenvíes correo a direcciones personales (Gmail, Hotmail, etc.) en el Reino Unido o la UE. Si ves `email_gated`, no lo fuerces.
- **NO** quites ni rompas la línea de salida (opt-out) en ninguna plantilla de correo.
- **NO** automatices mensajes de Instagram o LinkedIn, ni pegues el mismo DM a muchas personas.
- **NO** sigas contactando a quien pidió que pares — en cualquier canal, en cualquier país.
- **NO** inventes ni cambies mal la ciudad de un lead para pasar un bloqueo. Los bloqueos existen por una razón legal.
- **NO** respondas tú una queja legal. Escala al fundador.

> ⚠️ **Si algo se ve raro:** si un envío que esperabas está atascado en Pending con una
> razón como `whatsapp_gated` o `email_gated`, es el sistema de seguridad funcionando como
> debe, no un error. Si está atascado por otra razón (`twilio_not_configured`,
> `resend_not_configured`, `lead_phone_missing`, `lead_email_missing`), es un tema de
> configuración o de datos — ver [Solución de problemas](06-solucion-de-problemas.md). Si
> dudas si un contacto está permitido, la respuesta segura es **no enviar** y preguntar al
> fundador.

---

## Capítulos relacionados

- [04 — Mensajes y contacto](04-mensajes.md) — cómo enviar de verdad en cada canal, día a día.
- [06 — Solución de problemas](06-solucion-de-problemas.md) — qué significan las razones de Pending y cómo arreglar configuración/datos.
- [03 — Leads, pipeline y ciudades](03-leads-y-pipeline.md) — cómo las ciudades se mapean a mercados y países.
