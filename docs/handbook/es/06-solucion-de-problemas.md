# 06 — Solución de problemas

**Para quién es:** primero la operadora; algunas soluciones están marcadas **(fundador)**
porque necesitan acceso a servidores/ajustes.
**Qué vas a hacer:** reconocer qué significa un problema y probar la solución en simple.

> Regla práctica: un mensaje atascado en **Pending** con una razón `*_gated` es el
> **sistema de seguridad funcionando a propósito** — no un error. Otras razones suelen
> significar que falta un ajuste o un dato.

---

## Un mensaje no se envía

| Ves… | Qué significa | Qué hacer |
|------|---------------|-----------|
| `whatsapp_gated:<ciudad>_market_not_allowed` | El WhatsApp automático solo se permite en Perú. Este lead está en otro lado. | **Esperado.** No reintentes como WhatsApp. Usa **correo**, o manda un mensaje personal a mano. Ver [05 — Cumplimiento](05-cumplimiento.md). |
| `email_gated:personal_address_in_<ciudad>` | El correo de un lead de RU/UE es personal (Gmail, etc.); ahí solo enviamos automático a direcciones de empresa. | **Esperado.** Usa el correo de dominio de empresa, o escribe un correo personal a mano. |
| `lead_phone_missing` | Intentamos enviar WhatsApp pero el lead no tiene número. | Agrega un número al lead, o cambia el mensaje a correo. |
| `lead_email_missing` | Intentamos enviar correo pero el lead no tiene un correo (válido). | Agrega un correo válido, o usa otro canal. |
| `twilio_not_configured` | El envío por WhatsApp no está configurado. **(fundador)** | Fundador: pon las llaves de Twilio (ver [07 — Configuración](../07-configuration.md)). |
| `resend_not_configured` | El envío de correo no está configurado. **(fundador)** | Fundador: pon las llaves de Resend (ver [07 — Configuración](../07-configuration.md)). |
| `manual_channel:instagram_dm` / `manual_channel:linkedin` | Estos canales nunca se autoenvían. | Envía el mensaje a mano desde tu cuenta y luego márcalo como enviado. |

## Los leads de la web no aparecen en el CRM

- **Lo más probable:** la conexión entre la web y el CRM aún no está activada. Hasta que
  lo esté, la web solo registra los leads en vez de enviarlos (modo "log-only").
- **Solución (fundador):** pon `CRM_PUBLIC_API` y un `CRM_LEAD_INTAKE_SECRET` que coincida
  en **ambos**, la web y el CRM. Ver [07 — Configuración](../07-configuration.md).

## La auditoría instantánea falla / dice que un sitio está "inalcanzable"

- La web auditada puede estar de verdad caída, muy lenta, o bloqueando nuestro verificador.
- Intenta de nuevo en unos minutos. Si solo falla para un sitio, anótalo y sigue —
  normalmente es el sitio del prospecto, no nuestra herramienta.

## No puedo ingresar / perdí mi código de dos pasos

- **Demasiados intentos:** después de 5 intentos fallidos en un minuto te pausan un
  minuto. Espera y vuelve a intentar.
- **Perdiste la app de autenticación / el código:** esto necesita que el fundador
  reinicie los dos pasos en tu cuenta. No sigas adivinando.
- Ver [01 — Primeros pasos](01-primeros-pasos.md) para el ingreso normal.

## No llegó el digest del lunes

- El digest llega por correo cada **lunes ~9am (hora de Lima)**. Si falta:
  - Revisa la página **Digest** en el tablero — los números siempre están ahí aunque el
    correo no haya salido.
  - **(fundador)** Confirma que `DIGEST_EMAIL_TO` y las llaves de correo estén puestas, y
    que el cron del lunes haya corrido. Ver [07 — Configuración](../07-configuration.md).

## El descubrimiento no encontró nada

- El área de búsqueda o el tipo de negocio puede no haber dado resultados nuevos, o todo
  lo encontrado ya está en el sistema (saltamos duplicados).
- **(fundador)** Vuelve a correr con otro rubro/ciudad, o revisa los ajustes de descubrimiento.

## En la duda

Si un envío está bloqueado por una razón `*_gated`, déjalo — es a propósito. Para
cualquier cosa que parezca un error real (un ajuste que falta, datos malos, o un mensaje
legal de alguien), **detente y pregunta al fundador** en vez de buscar la vuelta.

## Capítulos relacionados

- [05 — Cumplimiento y seguridad](05-cumplimiento.md) · [07 — Configuración](../07-configuration.md)
