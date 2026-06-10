import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { abrirWhatsAppDirecto } from "../../utils/mensajesWhatsApp";

interface MensajeWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  mensajeInicial: string;
  telefono?: string;
  destinatarioLabel?: string;
  esGrupoProfesores?: boolean;
}

export function MensajeWhatsAppModal({
  open,
  onClose,
  titulo,
  mensajeInicial,
  telefono,
  destinatarioLabel,
  esGrupoProfesores,
}: MensajeWhatsAppModalProps) {
  const [mensaje, setMensaje] = useState(mensajeInicial);

  useEffect(() => {
    if (open) setMensaje(mensajeInicial);
  }, [open, mensajeInicial]);

  if (!open) return null;

  const enviar = () => {
    const texto = mensaje.trim();
    if (!texto) return;

    abrirWhatsAppDirecto(esGrupoProfesores ? undefined : telefono, texto);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between bg-emerald-600 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="h-5 w-5" />
            <h2 className="font-black">{titulo}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-emerald-100 hover:bg-emerald-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {destinatarioLabel ? (
            <p className="text-xs font-semibold text-gray-500">{destinatarioLabel}</p>
          ) : null}

          {esGrupoProfesores ? (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
              Se abrirá WhatsApp con el mensaje listo. Elige el{" "}
              <strong>grupo de maestros</strong>. Las @menciones van arriba (
              <code>@5512345678</code>). Si no se marcan en azul, borra esa línea y
              escribe <strong>@</strong> en WhatsApp para seleccionar al maestro del
              grupo.
            </div>
          ) : !telefono?.trim() ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No hay teléfono registrado. Se abrirá WhatsApp para que elijas el
              contacto.
            </p>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Se abrirá el chat de WhatsApp con este tutor y el mensaje precargado.
              Solo confirma con Enviar en WhatsApp.
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Mensaje (editable) · en WhatsApp la negrita es *así*
            </label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={!mensaje.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              Enviar por WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
