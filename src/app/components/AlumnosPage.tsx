import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "./Navbar";
import {
  bajaAlumnoDeGrupo,
  eliminarHistorialCursoBaja,
  reactivarInscripcion,
  actualizarAlumno,
  actualizarInscripcionAlumno,
  getAlumnos,
  getGrupos,
  getInscripciones,
  getPagosConEstatus,
  guardarNotasAlumno,
} from "../../services/api";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  StickyNote,
  UserPlus,
  UserMinus,
} from "lucide-react";
import InscripcionForm from "./InscripcionForm";
import { useSyncDataReload } from "../../utils/dataSync";
import {
  buildPagosMap,
  crearPagoId,
  resolverPagoParaInscripcion,
  saldoVisiblePago,
} from "../../utils/pagoInscripcion";

function normalizar(valor: any) {
  return String(valor || "").trim().toUpperCase();
}

function esGrupoInactivo(
  estatus?: string,
  pago?: { activo?: boolean; status?: string }
) {
  const e = String(estatus || "Activa").trim().toLowerCase();
  if (e === "baja" || e === "inactivo" || e === "inactiva") return true;
  if (pago?.activo === false) return true;
  if (String(pago?.status || "").trim().toLowerCase() === "baja") return true;
  return false;
}

function estatusInscripcion(ins: { estatus?: string; Estatus?: string }) {
  return String(ins.estatus || ins.Estatus || "Activa").trim();
}

function grupoIdDeInscripcion(ins: {
  grupoId?: string;
  GrupoId?: string;
  idGrupo?: string;
  IdGrupo?: string;
}) {
  return String(
    ins.grupoId || ins.GrupoId || ins.idGrupo || ins.IdGrupo || ""
  ).trim();
}

type FiltroVistaAlumnos = "activos" | "inactivos" | "todos";

function formatearMoneda(monto: number) {
  return Number(monto || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

function parseFecha(fechaIso?: string) {
  if (!fechaIso) return null;
  const d = new Date(fechaIso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function keyMes(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function etiquetaMes(d: Date) {
  return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function listarMeses(desde: Date, hasta: Date) {
  const months: Date[] = [];
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
  const end = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

type Alumno = {
  idAlumno: string;
  nombreAlumno?: string;
  nombre?: string;
  telefono?: string;
  tutor?: string;
  observaciones?: string;
  estatus?: string;
};

type Grupo = {
  IdGrupo?: string;
  idGrupo?: string;
  GrupoId?: string;
  nombreCurso?: string;
};

type Inscripcion = {
  idAlumno: string;
  nombreAlumno: string;
  grupoId: string;
  modalidad?: string;
  montoMensualidad: number;
  diaPago: number;
  fechaInicioPago: string;
  comentarios?: string;
  estatus?: string;
  fechaInscripcion?: string;
  fechaBaja?: string | null;
  createdAt?: string;
};

type PagoConEstatus = {
  id: string;
  idAlumno?: string;
  grupoId?: string;
  nombreAlumno?: string;
  nombreCurso?: string;
  montoTotal: number;
  diaPagoFijo?: number;
  fechaPago?: string;
  activo?: boolean;
  montoPagado?: number;
  saldo?: number;
  status?: string;
  historialAbonos?: Array<{
    abonoId?: string;
    fechaAbono?: string;
    montoAbono?: number;
    metodoAbono?: string;
  }>;
};

function HistorialMensual({
  pago,
}: {
  pago: PagoConEstatus;
}) {
  const resumen = useMemo(() => {
    const inicio = parseFecha(pago.fechaPago);
    if (!inicio) return null;

    const abonos = Array.isArray(pago.historialAbonos) ? pago.historialAbonos : [];
    const abonosPorMes = new Map<string, number>();
    for (const a of abonos) {
      const d = parseFecha(a.fechaAbono);
      if (!d) continue;
      const k = keyMes(d);
      abonosPorMes.set(k, (abonosPorMes.get(k) || 0) + Number(a.montoAbono || 0));
    }

    const meses = listarMeses(inicio, new Date());
    return meses.map((m) => {
      const k = keyMes(m);
      const pagado = abonosPorMes.get(k) || 0;
      const requerido = Number(pago.montoTotal || 0);
      const saldo = Math.max(requerido - pagado, 0);
      const estatus = saldo < 0.01 ? "Pagado" : pagado > 0 ? "Parcial" : "Pendiente";
      return {
        key: k,
        etiqueta: etiquetaMes(m),
        requerido,
        pagado,
        saldo,
        estatus,
      };
    }).slice().reverse(); // último mes arriba
  }, [pago]);

  if (!resumen) {
    return (
      <div className="text-sm text-gray-500">
        No hay fecha de inicio de pago para calcular meses.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-black text-gray-600 uppercase tracking-wider">
        Historial por mes
      </div>
      <div className="divide-y divide-gray-100">
        {resumen.map((m) => (
          <div key={m.key} className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">{m.etiqueta}</div>
              <div className="text-xs text-gray-500">
                Requerido: {formatearMoneda(m.requerido)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-emerald-700">{formatearMoneda(m.pagado)}</div>
              <div className="text-sm font-bold text-red-600">{formatearMoneda(m.saldo)}</div>
              <div
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${
                  m.estatus === "Pagado"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : m.estatus === "Parcial"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {m.estatus}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function claveInscripcion(idAlumno: string, grupoId: string) {
  return `${normalizar(idAlumno)}|${normalizar(grupoId)}`;
}

export function AlumnosPage() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");

  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [pagos, setPagos] = useState<PagoConEstatus[]>([]);

  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [notasDraft, setNotasDraft] = useState<Record<string, string>>({});
  const [guardandoNota, setGuardandoNota] = useState<Record<string, boolean>>({});
  const [alumnoDraft, setAlumnoDraft] = useState<Record<string, any>>({});
  const [guardandoAlumno, setGuardandoAlumno] = useState<Record<string, boolean>>({});
  const [comentariosInscripcionDraft, setComentariosInscripcionDraft] = useState<
    Record<string, string>
  >({});
  const [guardandoComentarioInscripcion, setGuardandoComentarioInscripcion] =
    useState<Record<string, boolean>>({});
  const [montoMensualidadDraft, setMontoMensualidadDraft] = useState<
    Record<string, string>
  >({});
  const [guardandoMontoMensualidad, setGuardandoMontoMensualidad] = useState<
    Record<string, boolean>
  >({});
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [filtroVista, setFiltroVista] = useState<FiltroVistaAlumnos>("activos");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [alumnoParaInscripcion, setAlumnoParaInscripcion] = useState<{
    idAlumno: string;
    nombreAlumno?: string;
    nombre?: string;
  } | null>(null);

  const abrirInscripcion = (
    alumno?: { idAlumno: string; nombreAlumno?: string; nombre?: string } | null
  ) => {
    setAlumnoParaInscripcion(alumno || null);
    setShowInscripcion(true);
  };

  const recargar = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      const [alumnosResp, gruposResp, inscResp, pagosResp] = await Promise.all([
        getAlumnos(""),
        getGrupos(),
        getInscripciones(),
        getPagosConEstatus(),
      ]);

      setAlumnos(alumnosResp || []);
      setGrupos(gruposResp || []);
      setInscripciones(inscResp || []);
      setPagos(pagosResp || []);
    } catch (e: any) {
      setError(e.message || "Error al cargar alumnos inscritos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useSyncDataReload(recargar);

  const gruposMap = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const g of grupos) {
      const id = (g.IdGrupo || g.idGrupo || g.GrupoId || "").toString();
      if (!id) continue;
      map.set(normalizar(id), g);
    }
    return map;
  }, [grupos]);

  const alumnosMap = useMemo(() => {
    const map = new Map<string, Alumno>();
    for (const a of alumnos) {
      if (!a?.idAlumno) continue;
      map.set(normalizar(a.idAlumno), a);
    }
    return map;
  }, [alumnos]);

  const pagosMap = useMemo(() => buildPagosMap(pagos), [pagos]);

  const cursosDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    for (const ins of inscripciones) {
      const grupoId = grupoIdDeInscripcion(ins);
      if (!grupoId) continue;
      const grupo = gruposMap.get(normalizar(grupoId));
      if (!grupo) continue;
      const nombre = (grupo?.nombreCurso || "").trim();
      if (nombre) nombres.add(nombre);
    }
    return Array.from(nombres).sort((a, b) => a.localeCompare(b, "es"));
  }, [inscripciones, gruposMap]);

  const resumen = useMemo(() => {
    const alumnosSet = new Set<string>();
    let totalCursos = 0;

    for (const ins of inscripciones) {
      const idAlumno = String(ins.idAlumno || (ins as any).IdAlumno || "").trim();
      const grupoId = grupoIdDeInscripcion(ins);
      if (!idAlumno || !grupoId) continue;

      const grupo = gruposMap.get(normalizar(grupoId));
      if (!grupo) continue;

      const nombreCurso = (grupo.nombreCurso || "Curso").toString();
      const pago = resolverPagoParaInscripcion(
        pagosMap,
        {
          idAlumno,
          grupoId,
          montoMensualidad: ins.montoMensualidad,
          diaPago: ins.diaPago,
          fechaInicioPago: ins.fechaInicioPago,
          estatus: estatusInscripcion(ins),
        },
        nombreCurso
      );
      const inactivo = esGrupoInactivo(estatusInscripcion(ins), pago);
      if (filtroVista === "activos" && inactivo) continue;
      if (filtroVista === "inactivos" && !inactivo) continue;
      if (
        filtroCurso &&
        normalizar(nombreCurso) !== normalizar(filtroCurso)
      ) {
        continue;
      }

      const alumnoDb = alumnosMap.get(normalizar(idAlumno));
      const nombre = (
        alumnoDb?.nombreAlumno ||
        alumnoDb?.nombre ||
        ins.nombreAlumno ||
        idAlumno
      ).toString();

      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        if (
          !nombre.toLowerCase().includes(q) &&
          !idAlumno.toLowerCase().includes(q)
        ) {
          continue;
        }
      }

      alumnosSet.add(normalizar(idAlumno));
      totalCursos += 1;
    }

    return {
      totalAlumnos: alumnosSet.size,
      totalCursos,
    };
  }, [inscripciones, alumnosMap, gruposMap, pagosMap, filtroVista, filtroCurso, busqueda]);

  const alumnosInscritos = useMemo(() => {
    const porAlumno = new Map<string, { alumnoId: string; nombre: string; cursos: any[] }>();

    for (const ins of inscripciones) {
      const idAlumno = String(ins.idAlumno || "").trim();
      const grupoId = grupoIdDeInscripcion(ins);
      if (!idAlumno || !grupoId) continue;

      const grupo = gruposMap.get(normalizar(grupoId));
      if (!grupo) continue;

      const alumnoDb = alumnosMap.get(normalizar(idAlumno));
      const nombre = (alumnoDb?.nombreAlumno || alumnoDb?.nombre || ins.nombreAlumno || idAlumno).toString();

      const nombreCurso = (grupo.nombreCurso || "Curso").toString();

      const pago = resolverPagoParaInscripcion(
        pagosMap,
        {
          idAlumno,
          grupoId,
          montoMensualidad: ins.montoMensualidad,
          diaPago: ins.diaPago,
          fechaInicioPago: ins.fechaInicioPago,
          estatus: estatusInscripcion(ins),
        },
        nombreCurso
      );

      const keyAlumno = normalizar(idAlumno);
      if (!porAlumno.has(keyAlumno)) {
        porAlumno.set(keyAlumno, { alumnoId: idAlumno, nombre, cursos: [] });
      }

      const montoDesdeIns = Number(
        ins.montoMensualidad ?? (ins as any).montoPago ?? 0
      );
      const montoDesdePago = Number(pago?.montoTotal ?? 0);

      porAlumno.get(keyAlumno)!.cursos.push({
        idAlumno,
        grupoId,
        nombreCurso,
        modalidad: ins.modalidad || "Presencial",
        diaPago: ins.diaPago ?? pago?.diaPagoFijo,
        fechaInicioPago: ins.fechaInicioPago ?? pago?.fechaPago,
        fechaInscripcion: ins.fechaInscripcion,
        createdAt: ins.createdAt,
        estatus: esGrupoInactivo(estatusInscripcion(ins), pago)
          ? "Baja"
          : estatusInscripcion(ins),
        fechaBaja: ins.fechaBaja,
        motivoBaja: ins.motivoBaja || "",
        montoMensualidad:
          montoDesdeIns > 0 ? montoDesdeIns : montoDesdePago,
        comentarios: ins.comentarios || "",
        pago,
      });
    }

    let lista = Array.from(porAlumno.values()).map((item) => {
      const alumnoDb = alumnosMap.get(normalizar(item.alumnoId));
      return {
        ...item,
        alumnoDb,
        cursos: item.cursos.sort((a: any, b: any) =>
          String(a.nombreCurso).localeCompare(String(b.nombreCurso), "es")
        ),
      };
    });

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter((a) => {
        const nombre = (a.alumnoDb?.nombreAlumno || a.alumnoDb?.nombre || a.nombre || "").toLowerCase();
        return nombre.includes(q) || String(a.alumnoId).toLowerCase().includes(q);
      });
    }

    lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

    if (filtroVista === "activos") {
      lista = lista
        .map((item) => ({
          ...item,
          cursos: item.cursos.filter(
            (c: any) => !esGrupoInactivo(c.estatus, c.pago)
          ),
        }))
        .filter((item) => item.cursos.length > 0);
    } else if (filtroVista === "inactivos") {
      lista = lista
        .map((item) => ({
          ...item,
          cursos: item.cursos.filter((c: any) => esGrupoInactivo(c.estatus, c.pago)),
        }))
        .filter((item) => item.cursos.length > 0);
    }

    if (filtroCurso) {
      lista = lista
        .map((item) => ({
          ...item,
          cursos: item.cursos.filter(
            (c: any) => normalizar(c.nombreCurso) === normalizar(filtroCurso)
          ),
        }))
        .filter((item) => item.cursos.length > 0);
    }

    return lista;
  }, [inscripciones, alumnosMap, gruposMap, pagosMap, busqueda, filtroVista, filtroCurso]);

  const handleInactivarEnGrupo = async (
    idAlumno: string,
    grupoId: string,
    nombreCurso: string
  ) => {
    const confirmado = window.confirm(
      `¿Inactivar al alumno en este grupo?\n\nAlumno: ${idAlumno}\nGrupo: ${grupoId}\nCurso: ${nombreCurso}\n\nDeja de aparecer en el calendario. Solo se permite si no tiene pagos pendientes.`
    );
    if (!confirmado) return;

    try {
      await bajaAlumnoDeGrupo(idAlumno, grupoId);
      toast.success("Alumno inactivo en este grupo");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al inactivar en el grupo");
    }
  };

  const handleBajaDelSistemaGrupo = async (
    idAlumno: string,
    grupoId: string,
    nombreCurso: string
  ) => {
    const confirmado = window.confirm(
      `¿Dar de baja del sistema este grupo?\n\nCurso: ${nombreCurso}\nGrupo: ${grupoId}\n\nSe borrarán la inscripción y los pagos de este grupo. Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    try {
      await eliminarHistorialCursoBaja(idAlumno, grupoId);
      toast.success("Grupo dado de baja del sistema");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al dar de baja del sistema");
    }
  };

  const handleGuardarNotaAlumno = async (idAlumno: string) => {
    const key = normalizar(idAlumno);
    const observaciones = notasDraft[key] ?? "";

    try {
      setGuardandoNota((prev) => ({ ...prev, [key]: true }));
      await guardarNotasAlumno({ idAlumno, observaciones });
      toast.success("Notas del alumno guardadas");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar notas");
    } finally {
      setGuardandoNota((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleGuardarDatosAlumno = async (idAlumno: string) => {
    const key = normalizar(idAlumno);
    const draft = alumnoDraft[key] || {};

    try {
      setGuardandoAlumno((prev) => ({ ...prev, [key]: true }));
      await actualizarAlumno(idAlumno, {
        nombreAlumno: draft.nombreAlumno,
        telefono: draft.telefono,
        tutor: draft.tutor,
      });
      toast.success("Datos del alumno actualizados");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar alumno");
    } finally {
      setGuardandoAlumno((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleGuardarComentarioInscripcion = async (
    idAlumno: string,
    grupoId: string
  ) => {
    const key = claveInscripcion(idAlumno, grupoId);
    const comentarios = comentariosInscripcionDraft[key] ?? "";

    try {
      setGuardandoComentarioInscripcion((prev) => ({ ...prev, [key]: true }));
      await actualizarInscripcionAlumno(idAlumno, grupoId, { comentarios });
      toast.success("Comentario de inscripción guardado");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar comentario de inscripción");
    } finally {
      setGuardandoComentarioInscripcion((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleGuardarMontoMensualidad = async (
    idAlumno: string,
    grupoId: string
  ) => {
    const key = claveInscripcion(idAlumno, grupoId);
    const monto = Number(montoMensualidadDraft[key]);

    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Captura un monto válido mayor a 0");
      return;
    }

    try {
      setGuardandoMontoMensualidad((prev) => ({ ...prev, [key]: true }));
      await actualizarInscripcionAlumno(idAlumno, grupoId, {
        montoMensualidad: monto,
      });
      toast.success("Mensualidad actualizada");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar la mensualidad");
    } finally {
      setGuardandoMontoMensualidad((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleReactivarCurso = async (
    idAlumno: string,
    grupoId: string,
    nombreCurso: string
  ) => {
    const confirmado = window.confirm(
      `¿Reactivar al alumno en este grupo?\n\nCurso: ${nombreCurso}\n\nSe mantienen las fechas de inicio de clases y de cobro. Para cambiar el día de pago, usa Control de pagos.`
    );
    if (!confirmado) return;

    try {
      await reactivarInscripcion(idAlumno, grupoId);
      toast.success("Curso reactivado");
      await recargar();
    } catch (e: any) {
      toast.error(e.message || "Error al reactivar curso");
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="p-10 text-center">Cargando alumnos inscritos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="p-10 text-center text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <header className="relative overflow-hidden border-b border-cyan-100 bg-[linear-gradient(120deg,#eefbff_0%,#d9f3ff_48%,#8fd6f3_100%)] px-6 py-5 shadow-sm">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-6 px-4 lg:px-10">
          <div className="min-w-0">
            <h1 className="text-3xl font-black leading-none text-[#0078D7]">
              Alumnos inscritos
            </h1>
            <p className="mt-1 text-sm font-black text-[#003B73]">
              Por cada grupo: Activo → Inactivo → Baja del sistema
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => abrirInscripcion(null)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0078D7] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0066b8] transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Inscribir a curso
            </button>
            <div className="inline-flex rounded-xl border border-cyan-100 bg-white p-1 text-xs font-bold">
              {(
                [
                  { id: "activos" as const, label: "Activos" },
                  { id: "inactivos" as const, label: "Inactivos" },
                  { id: "todos" as const, label: "Todos" },
                ] as const
              ).map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => setFiltroVista(opcion.id)}
                  className={`rounded-lg px-3 py-2 transition-colors ${
                    filtroVista === opcion.id
                      ? opcion.id === "inactivos"
                        ? "bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-100"
                        : "bg-cyan-50 text-cyan-800 shadow-sm ring-1 ring-cyan-100"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
            <select
              value={filtroCurso}
              onChange={(e) => setFiltroCurso(e.target.value)}
              className="w-[220px] rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <option value="">Todos los cursos</option>
              {cursosDisponibles.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por alumno o ID..."
              className="w-[280px] rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-6 py-8 lg:px-10">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-cyan-100 bg-white px-6 py-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
              Alumnos inscritos
            </div>
            <div className="mt-2 text-4xl font-black text-[#0078D7]">
              {resumen.totalAlumnos}
            </div>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Según filtros actuales
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-white px-6 py-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
              Cursos dados
            </div>
            <div className="mt-2 text-4xl font-black text-[#003B73]">
              {resumen.totalCursos}
            </div>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Inscripciones a grupos
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-cyan-100 bg-white px-5 py-4 text-sm text-gray-700 shadow-sm">
          <p className="font-black text-gray-900 mb-2">Flujo por grupo inscrito</p>
          <p className="mb-2 text-xs text-gray-600">
            Un alumno puede estar en varios cursos a la vez. Inactivar o dar de baja
            afecta <strong>solo ese curso</strong>; el alumno sigue en el sistema y en
            sus demás clases.
          </p>
          <ol className="list-decimal list-inside space-y-1 font-medium">
            <li>
              <span className="font-black text-emerald-700">Activo</span> — inscrito
              al grupo (aparece en calendario y pagos).
            </li>
            <li>
              <span className="font-black text-amber-800">Inactivo</span> — con
              «Inactivar en este grupo» deja ese curso (calendario y cobros de ese
              grupo). Puede eliminarse el grupo del calendario cuando todos estén
              inactivos.
            </li>
            <li>
              <span className="font-black text-red-700">Baja del sistema</span>{" "}
              (opcional) — borra el historial de <strong>ese curso</strong> en Alumnos
              inscritos. No elimina al alumno del catálogo ni de sus otros cursos.
            </li>
          </ol>
        </div>

        <div className="space-y-4">
          {alumnosInscritos.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <p className="text-gray-400 font-medium">
                {filtroVista === "inactivos"
                  ? "No hay alumnos con grupos inactivos."
                  : filtroVista === "activos"
                    ? "No hay alumnos con grupos activos."
                    : "No hay alumnos inscritos (o no coinciden con la búsqueda)."}
              </p>
            </div>
          ) : (
            alumnosInscritos.map((a) => {
              const idAlumno = a.alumnoId;
              const alumnoDb = a.alumnoDb as Alumno | undefined;
              const nombre = alumnoDb?.nombreAlumno || alumnoDb?.nombre || a.nombre;
              const isOpen = Boolean(expandido[normalizar(idAlumno)]);
              const keyAlumno = normalizar(idAlumno);
              const draftDatos = alumnoDraft[keyAlumno] || {};
              const nombreValue =
                draftDatos.nombreAlumno ??
                alumnoDb?.nombreAlumno ??
                alumnoDb?.nombre ??
                a.nombre ??
                "";
              const telefonoValue =
                draftDatos.telefono ?? alumnoDb?.telefono ?? "";
              const tutorValue = draftDatos.tutor ?? alumnoDb?.tutor ?? "";
              const gruposActivos = a.cursos.filter(
                (c: any) => !esGrupoInactivo(c.estatus, c.pago)
              );
              const gruposInactivos = a.cursos.filter((c: any) =>
                esGrupoInactivo(c.estatus, c.pago)
              );
              const soloGruposInactivos =
                gruposActivos.length === 0 && gruposInactivos.length > 0;

              const cursosVisibles =
                filtroVista === "inactivos"
                  ? gruposInactivos
                  : filtroVista === "activos"
                    ? gruposActivos
                    : a.cursos;

              const etiquetaEstatus =
                gruposActivos.length > 0 && gruposInactivos.length > 0
                  ? {
                      texto: "Activo e inactivo",
                      clase:
                        "bg-amber-50 text-amber-800 border-amber-200",
                    }
                  : soloGruposInactivos
                    ? {
                        texto: "Inactivo",
                        clase:
                          "bg-amber-50 text-amber-800 border-amber-200",
                      }
                    : {
                        texto: "Activo",
                        clase:
                          "bg-emerald-50 text-emerald-700 border-emerald-200",
                      };

              return (
                <div key={idAlumno} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandido((prev) => ({
                        ...prev,
                        [normalizar(idAlumno)]: !prev[normalizar(idAlumno)],
                      }))
                    }
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 text-left">
                      <div className="text-base font-black text-gray-900 truncate">
                        {nombre}
                      </div>
                      <div className="text-xs text-gray-500 font-bold">
                        ID: {idAlumno}
                        {alumnoDb?.telefono ? ` · Tel: ${alumnoDb.telefono}` : ""}
                        {alumnoDb?.tutor ? ` · Tutor: ${alumnoDb.tutor}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 border ${etiquetaEstatus.clase}`}
                      >
                        {etiquetaEstatus.texto}
                      </span>
                      <span className="text-xs font-black text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                        {gruposActivos.length} activo
                        {gruposActivos.length === 1 ? "" : "s"}
                        {gruposInactivos.length > 0
                          ? ` · ${gruposInactivos.length} inactivo${gruposInactivos.length === 1 ? "" : "s"}`
                          : ""}
                      </span>
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-6">
                      {gruposActivos.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirInscripcion({
                                idAlumno,
                                nombreAlumno: nombre,
                              });
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
                          >
                            <UserPlus className="w-4 h-4" />
                            Inscribir a otro curso
                          </button>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Nombre del alumno
                          </div>
                          <input
                            value={nombreValue}
                            onChange={(e) =>
                              setAlumnoDraft((prev) => ({
                                ...prev,
                                [keyAlumno]: {
                                  ...(prev[keyAlumno] || {}),
                                  nombreAlumno: e.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-300"
                          />
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Teléfono del tutor (WhatsApp)
                          </div>
                          <input
                            value={telefonoValue}
                            onChange={(e) =>
                              setAlumnoDraft((prev) => ({
                                ...prev,
                                [keyAlumno]: {
                                  ...(prev[keyAlumno] || {}),
                                  telefono: e.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-300"
                          />
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Nombre del tutor
                          </div>
                          <input
                            value={tutorValue}
                            onChange={(e) =>
                              setAlumnoDraft((prev) => ({
                                ...prev,
                                [keyAlumno]: {
                                  ...(prev[keyAlumno] || {}),
                                  tutor: e.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-300"
                          />
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={() => handleGuardarDatosAlumno(idAlumno)}
                            disabled={Boolean(guardandoAlumno[keyAlumno])}
                            className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${
                              Boolean(guardandoAlumno[keyAlumno])
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-cyan-500 text-white hover:bg-cyan-600"
                            }`}
                          >
                            {Boolean(guardandoAlumno[keyAlumno])
                              ? "Guardando..."
                              : "Guardar datos"}
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const notaActual = alumnoDb?.observaciones || "";
                        const draft = notasDraft[keyAlumno] ?? notaActual;

                        return (
                          <div className="mb-4 rounded-2xl border border-gray-200 overflow-hidden">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                              <StickyNote className="w-4 h-4 text-gray-600" />
                              <div className="text-xs font-black text-gray-600 uppercase tracking-wider">
                                Notas del alumno
                              </div>
                            </div>
                            <div className="p-4 space-y-3">
                              <textarea
                                value={draft}
                                onChange={(e) =>
                                  setNotasDraft((prev) => ({
                                    ...prev,
                                    [keyAlumno]: e.target.value,
                                  }))
                                }
                                rows={4}
                                placeholder="Notas generales del alumno..."
                                className="w-full resize-y rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-cyan-300"
                              />
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleGuardarNotaAlumno(idAlumno)}
                                  disabled={
                                    Boolean(guardandoNota[keyAlumno]) ||
                                    draft.trim() === String(notaActual).trim()
                                  }
                                  className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${
                                    Boolean(guardandoNota[keyAlumno]) ||
                                    draft.trim() === String(notaActual).trim()
                                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                      : "bg-cyan-500 text-white hover:bg-cyan-600"
                                  }`}
                                >
                                  {Boolean(guardandoNota[keyAlumno])
                                    ? "Guardando..."
                                    : "Guardar notas"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="space-y-4">
                        {cursosVisibles.length === 0 ? (
                          <p className="text-sm text-gray-500 py-4 text-center">
                            No hay cursos en esta vista para este alumno.
                          </p>
                        ) : null}
                        {cursosVisibles.map((c: any) => {
                          const pago = c.pago as PagoConEstatus | undefined;
                          const fechaAltaSistema = c.createdAt || null;
                          const fechaInicioClases = c.fechaInscripcion || null;
                          const fechaBaja = c.fechaBaja || null;
                          const esInactivo = esGrupoInactivo(c.estatus, c.pago);

                          return (
                            <div
                              key={`${c.grupoId}`}
                              className={`rounded-2xl border overflow-hidden ${
                                esInactivo
                                  ? "border-amber-200 bg-amber-50/30"
                                  : "border-gray-200"
                              }`}
                            >
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-black text-gray-900 truncate">
                                    {c.nombreCurso}
                                  </div>
                                  <div className="text-xs text-gray-500 font-bold">
                                    Grupo: {c.grupoId} · Modalidad: {c.modalidad}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1">
                                    Día pago: {c.diaPago}
                                  </div>
                                  <div
                                    className="text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1"
                                    title="Fecha en que se registró la inscripción en el sistema"
                                  >
                                    Alta en sistema:{" "}
                                    {fechaAltaSistema
                                      ? new Date(fechaAltaSistema).toLocaleDateString(
                                          "es-MX"
                                        )
                                      : "—"}
                                  </div>
                                  {fechaInicioClases ? (
                                    <div
                                      className="text-xs font-bold text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-full px-3 py-1"
                                      title="Fecha desde la que aparece en el calendario"
                                    >
                                      Inicio clases:{" "}
                                      {new Date(fechaInicioClases).toLocaleDateString(
                                        "es-MX"
                                      )}
                                    </div>
                                  ) : null}
                                  {esInactivo ? (
                                    <div className="text-xs font-black uppercase text-amber-900 bg-amber-100 border border-amber-200 rounded-full px-3 py-1">
                                      Inactivo
                                      {c.motivoBaja === "Curso inactivo"
                                        ? " · curso pausado"
                                        : ""}
                                      {fechaBaja
                                        ? ` · ${new Date(fechaBaja).toLocaleDateString("es-MX")}`
                                        : ""}
                                    </div>
                                  ) : (
                                    <div className="text-xs font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                                      Activo
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                                    <span className="text-[10px] font-black uppercase text-gray-500">
                                      Mensualidad
                                    </span>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                                        $
                                      </span>
                                      <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={
                                          montoMensualidadDraft[
                                            claveInscripcion(c.idAlumno, c.grupoId)
                                          ] ?? String(c.montoMensualidad ?? "")
                                        }
                                        onChange={(e) =>
                                          setMontoMensualidadDraft((prev) => ({
                                            ...prev,
                                            [claveInscripcion(c.idAlumno, c.grupoId)]:
                                              e.target.value,
                                          }))
                                        }
                                        className="w-28 rounded-lg border border-gray-200 bg-gray-50 pl-6 pr-2 py-1.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-cyan-400"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      disabled={
                                        guardandoMontoMensualidad[
                                          claveInscripcion(c.idAlumno, c.grupoId)
                                        ]
                                      }
                                      onClick={() =>
                                        handleGuardarMontoMensualidad(
                                          c.idAlumno,
                                          c.grupoId
                                        )
                                      }
                                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-cyan-700 disabled:opacity-50"
                                    >
                                      {guardandoMontoMensualidad[
                                        claveInscripcion(c.idAlumno, c.grupoId)
                                      ]
                                        ? "..."
                                        : "Guardar"}
                                    </button>
                                  </div>
                                  {pago?.status ? (
                                    <div
                                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                        pago.status === "Pagado"
                                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                          : pago.status === "Parcial"
                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-red-50 text-red-700 border-red-200"
                                      }`}
                                    >
                                      {pago.status}
                                    </div>
                                  ) : null}

                                  {!esInactivo ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleInactivarEnGrupo(
                                          c.idAlumno,
                                          c.grupoId,
                                          c.nombreCurso
                                        )
                                      }
                                      className="inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 transition-colors"
                                    >
                                      <UserMinus className="w-4 h-4" />
                                      Inactivar en este grupo
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleReactivarCurso(
                                            c.idAlumno,
                                            c.grupoId,
                                            c.nombreCurso
                                          )
                                        }
                                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-2 text-xs font-black text-cyan-800 hover:bg-cyan-100 transition-colors"
                                      >
                                        Reactivar en este grupo
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleBajaDelSistemaGrupo(
                                            c.idAlumno,
                                            c.grupoId,
                                            c.nombreCurso
                                          )
                                        }
                                        className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-black text-red-800 hover:bg-red-100 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        Dar de baja del sistema
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="p-4 space-y-4">
                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                                      Comentario de inscripción
                                    </div>
                                  </div>
                                  <div className="p-4 space-y-3">
                                    {(() => {
                                      const keyIns = claveInscripcion(
                                        c.idAlumno,
                                        c.grupoId
                                      );
                                      const comentarioActual = c.comentarios || "";
                                      const draft =
                                        comentariosInscripcionDraft[keyIns] ??
                                        comentarioActual;

                                      return (
                                        <>
                                          <textarea
                                            value={draft}
                                            onChange={(e) =>
                                              setComentariosInscripcionDraft(
                                                (prev) => ({
                                                  ...prev,
                                                  [keyIns]: e.target.value,
                                                })
                                              )
                                            }
                                            rows={2}
                                            placeholder="Notas al momento de inscribir al alumno en este curso..."
                                            className="w-full resize-y rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-cyan-300"
                                          />
                                          <div className="flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleGuardarComentarioInscripcion(
                                                  c.idAlumno,
                                                  c.grupoId
                                                )
                                              }
                                              disabled={
                                                Boolean(
                                                  guardandoComentarioInscripcion[
                                                    keyIns
                                                  ]
                                                ) ||
                                                draft.trim() ===
                                                  String(comentarioActual).trim()
                                              }
                                              className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${
                                                Boolean(
                                                  guardandoComentarioInscripcion[
                                                    keyIns
                                                  ]
                                                ) ||
                                                draft.trim() ===
                                                  String(comentarioActual).trim()
                                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                                  : "bg-cyan-500 text-white hover:bg-cyan-600"
                                              }`}
                                            >
                                              {Boolean(
                                                guardandoComentarioInscripcion[
                                                  keyIns
                                                ]
                                              )
                                                ? "Guardando..."
                                                : "Guardar comentario"}
                                            </button>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {pago ? (
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        Pagado total
                                      </div>
                                      <div className="text-base font-black text-gray-900">
                                        {formatearMoneda(Number(pago.montoPagado || 0))}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        Saldo
                                      </div>
                                      <div className="text-base font-black text-red-600">
                                        {formatearMoneda(Number(pago.saldo || 0))}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        Inicio de cobro
                                      </div>
                                      <div className="text-base font-black text-gray-900">
                                        {pago.fechaPago ? new Date(pago.fechaPago).toLocaleDateString("es-MX") : "—"}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    No hay registro de pago para este curso (pagoId: {crearPagoId(c.idAlumno, c.grupoId)}).
                                  </div>
                                )}

                                {pago ? <HistorialMensual pago={pago} /> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {showInscripcion && (
        <InscripcionForm
          alumnoInicial={alumnoParaInscripcion}
          onClose={() => {
            setShowInscripcion(false);
            setAlumnoParaInscripcion(null);
          }}
          onSuccess={async () => {
            setShowInscripcion(false);
            setAlumnoParaInscripcion(null);
            await recargar();
          }}
        />
      )}
    </div>
  );
}

