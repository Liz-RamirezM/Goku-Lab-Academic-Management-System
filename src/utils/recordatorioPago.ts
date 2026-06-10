export {
  normalizarTelefonoWhatsApp,
  enlaceWhatsApp,
  construirMensajeRecordatorioPago,
} from "./mensajesWhatsApp";

import { enlaceWhatsApp, normalizarTelefonoWhatsApp } from "./mensajesWhatsApp";

/** Compatibilidad con código que esperaba null si no hay teléfono válido */
export function enlaceWhatsAppRecordatorio(
  telefono: string,
  mensaje: string
): string | null {
  if (!normalizarTelefonoWhatsApp(telefono)) return null;
  return enlaceWhatsApp(telefono, mensaje);
}
