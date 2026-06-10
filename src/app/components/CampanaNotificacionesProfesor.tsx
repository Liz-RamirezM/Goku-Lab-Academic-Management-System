import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  getNotificacionesProfesor,
  marcarNotificacionProfesorLeida,
} from "../../services/api";

export function CampanaNotificacionesProfesor() {
  const [pendientes, setPendientes] = useState(0);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await getNotificacionesProfesor();
      setNotificaciones(data.notificaciones || []);
      setPendientes(data.pendientes ?? 0);
    } catch {
      /* silencioso si falla el poll */
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(cargar, 60_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    if (abierto) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  const marcarLeida = async (notificacionId: string) => {
    try {
      await marcarNotificacionProfesorLeida(notificacionId);
      await cargar();
    } catch (err: any) {
      toast.error(err.message || "No se pudo marcar la notificación");
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Notificaciones"
        className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
      >
        <Bell className="h-5 w-5" />
        {pendientes > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
            {pendientes > 9 ? "9+" : pendientes}
          </span>
        ) : null}
      </button>

      {abierto ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wider text-cyan-800">
              Notificaciones
            </p>
            {pendientes > 0 ? (
              <p className="text-[10px] text-cyan-600">{pendientes} sin leer</p>
            ) : null}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                No hay notificaciones
              </p>
            ) : (
              notificaciones.map((n) => (
                <div
                  key={n.notificacionId}
                  className={`border-b border-gray-50 px-4 py-3 text-xs ${
                    n.leida ? "bg-white" : "bg-amber-50/60"
                  }`}
                >
                  <p className="font-bold text-gray-900">{n.titulo}</p>
                  <p className="mt-1 leading-relaxed text-gray-600">{n.mensaje}</p>
                  {!n.leida ? (
                    <button
                      type="button"
                      onClick={() => marcarLeida(n.notificacionId)}
                      className="mt-2 text-[10px] font-black uppercase tracking-wide text-cyan-700 hover:underline"
                    >
                      Marcar como leída
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
