import { MensajeWhatsAppModal } from "./MensajeWhatsAppModal";
import { useColaWhatsApp } from "../../hooks/useColaWhatsApp";

type WhatsAppColaHostProps = ReturnType<typeof useColaWhatsApp>;

export function WhatsAppColaHost({ actual, activo, cerrar }: WhatsAppColaHostProps) {
  if (!activo || !actual) return null;

  return (
    <MensajeWhatsAppModal
      open={activo}
      onClose={cerrar}
      titulo={actual.titulo}
      mensajeInicial={actual.mensaje}
      telefono={actual.telefono}
      destinatarioLabel={actual.destinatarioLabel}
      esGrupoProfesores={actual.esGrupoProfesores}
    />
  );
}
