import { useEffect, useMemo, useState } from "react";
import {
  crearGrupoConAlumno,
  getAlumnos,
  getCursos,
  getProfesores,
} from "../../services/api";
import { toast } from "sonner";
import {
  mesCobroAFechaInicio,
  toMonthInputValue,
  validarFechasInscripcion,
} from "../../utils/fechasInscripcion";
import { useColaWhatsApp } from "../../hooks/useColaWhatsApp";
import { WhatsAppColaHost } from "./WhatsAppColaHost";
import {
  avisoGrupoAsignacionEInscripcion,
  normalizarProfesorContacto,
  type ItemWhatsAppCola,
} from "../../utils/avisosWhatsAppProfesor";

interface NuevoGrupoFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

function normalizar(valor: string) {
  return String(valor || "").trim().toUpperCase();
}

const DIAS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export default function NuevoGrupoForm({
  onClose,
  onSuccess,
}: NuevoGrupoFormProps) {
  const [cursos, setCursos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [alumnosEncontrados, setAlumnosEncontrados] = useState<any[]>([]);

  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [buscandoAlumnos, setBuscandoAlumnos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const colaWhatsApp = useColaWhatsApp();

  const [modoAlumno, setModoAlumno] = useState<"existente" | "nuevo">(
    "existente"
  );

  const [busquedaAlumno, setBusquedaAlumno] = useState("");
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(null);

  const [cursoSeleccionado, setCursoSeleccionado] = useState<any | null>(null);
  const [idProfesor, setIdProfesor] = useState("");
  const [diaClase, setDiaClase] = useState("");
  const [horaClase, setHoraClase] = useState("");
  const [duracionClase, setDuracionClase] = useState("2 horas");
  const [capacidadMaxima, setCapacidadMaxima] = useState("8");
  const [fechaCreacion, setFechaCreacion] = useState(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [comentarioGrupo, setComentarioGrupo] = useState("");
  const [modalidadAlumno, setModalidadAlumno] = useState<"Presencial" | "Virtual">(
    "Presencial"
  );
  const [montoMensualidad, setMontoMensualidad] = useState("");
  const [diaPago, setDiaPago] = useState("5");
  const [primerMesCobro, setPrimerMesCobro] = useState(() =>
    toMonthInputValue(new Date())
  );

  const [nombreAlumnoNuevo, setNombreAlumnoNuevo] = useState("");
  const [telefonoAlumnoNuevo, setTelefonoAlumnoNuevo] = useState("");
  const [tutorAlumnoNuevo, setTutorAlumnoNuevo] = useState("");
  const [observacionesAlumnoNuevo, setObservacionesAlumnoNuevo] = useState("");

  useEffect(() => {
    const cargarCatalogos = async () => {
      try {
        setCargandoCatalogos(true);

        const [cursosResp, profesoresResp] = await Promise.all([
          getCursos(),
          getProfesores(),
        ]);

        const cursosActivos = (cursosResp || [])
          .map((curso: any) => ({
            idCurso: curso.idCurso || curso.IdCurso || "",
            nombreCurso: curso.nombreCurso || curso.nombre || "",
            estatus: curso.estatus || curso.Estatus || "Activo",
          }))
          .filter(
            (curso: any) =>
              curso.nombreCurso &&
              ["ACTIVO", ""].includes(normalizar(curso.estatus))
          )
          .sort((a: any, b: any) =>
            a.nombreCurso.localeCompare(b.nombreCurso, "es")
          );

        const profesoresActivos = (profesoresResp || [])
          .map((prof: any) => ({
            idProfesor: prof.idProfesor || prof.IdProfesor || "",
            nombre: prof.nombre || prof.nombreProfesor || "",
            telefono: prof.telefono || "",
            estatus: prof.estatus || prof.Estatus || "Activo",
          }))
          .filter(
            (prof: any) =>
              prof.nombre &&
              ["ACTIVO", ""].includes(normalizar(prof.estatus))
          )
          .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, "es"));

        setCursos(cursosActivos);
        setProfesores(profesoresActivos);
      } catch (error) {
        console.error("Error al cargar cursos/profesores:", error);
        setCursos([]);
        setProfesores([]);
      } finally {
        setCargandoCatalogos(false);
      }
    };

    cargarCatalogos();
  }, []);

  useEffect(() => {
    const buscarAlumnos = async () => {
      if (modoAlumno !== "existente") return;

      try {
        setBuscandoAlumnos(true);
        const alumnos = await getAlumnos(busquedaAlumno, { soloInscribibles: true });
        setAlumnosEncontrados(alumnos || []);
      } catch (error) {
        console.error("Error al buscar alumnos:", error);
        setAlumnosEncontrados([]);
      } finally {
        setBuscandoAlumnos(false);
      }
    };

    buscarAlumnos();
  }, [busquedaAlumno, modoAlumno]);

  useEffect(() => {
    if (modoAlumno === "nuevo") {
      setAlumnoSeleccionado(null);
    }
  }, [modoAlumno]);

  const profesorSeleccionado = useMemo(
    () =>
      profesores.find(
        (prof: any) => normalizar(prof.idProfesor) === normalizar(idProfesor)
      ) || null,
    [profesores, idProfesor]
  );

  const puedeGuardarGrupo =
    Boolean(cursoSeleccionado?.nombreCurso) &&
    Boolean(idProfesor) &&
    Boolean(diaClase) &&
    Boolean(horaClase) &&
    Number(capacidadMaxima) > 0 &&
    Number(montoMensualidad) > 0 &&
    Boolean(primerMesCobro) &&
    Number(diaPago) >= 1 &&
    Number(diaPago) <= 31 &&
    (modoAlumno === "existente"
      ? Boolean(alumnoSeleccionado)
      : Boolean(nombreAlumnoNuevo.trim()));

  const handleGuardar = async () => {
    try {
      setGuardando(true);

      if (!cursoSeleccionado?.nombreCurso) {
        toast.error("Selecciona un curso");
        setGuardando(false);
        return;
      }

      if (!idProfesor || !profesorSeleccionado) {
        toast.error("Selecciona un profesor");
        setGuardando(false);
        return;
      }

      if (!diaClase) {
        toast.error("Selecciona el día de clase");
        setGuardando(false);
        return;
      }

      if (!horaClase) {
        toast.error("Selecciona la hora de clase");
        setGuardando(false);
        return;
      }

      if (!capacidadMaxima || Number(capacidadMaxima) <= 0) {
        toast.error("Indica una capacidad válida");
        setGuardando(false);
        return;
      }

      const montoPagoNumero = Number(montoMensualidad);

      if (!montoMensualidad || !Number.isFinite(montoPagoNumero) || montoPagoNumero <= 0) {
        toast.error("Captura un monto de mensualidad valido");
        setGuardando(false);
        return;
      }

      if (!primerMesCobro) {
        toast.error("Indica el primer mes de cobro");
        setGuardando(false);
        return;
      }

      const errorFechas = validarFechasInscripcion(
        fechaCreacion,
        primerMesCobro
      );
      if (errorFechas) {
        toast.error(errorFechas);
        setGuardando(false);
        return;
      }

      const diaPagoNumero = Number(diaPago);
      if (!Number.isInteger(diaPagoNumero) || diaPagoNumero < 1 || diaPagoNumero > 31) {
        toast.error("El día de pago debe ser entre 1 y 31");
        setGuardando(false);
        return;
      }

      const payload: any = {
        grupo: {
          idCurso: cursoSeleccionado.idCurso || "",
          nombreCurso: cursoSeleccionado.nombreCurso,
          diaClase,
          horaClase,
          duracionClase,
          idProfesor: profesorSeleccionado.idProfesor || "",
          nombreProfesor: profesorSeleccionado.nombre,
          comentario: comentarioGrupo,
          capacidadMaxima: Number(capacidadMaxima),
          Estatus: "Activo",
          fechaCreacion,
        },
        fechaInscripcion: fechaCreacion,
        datosPago: {
          montoMensualidad: montoPagoNumero,
          diaPago: diaPagoNumero,
          fechaInicioPago: mesCobroAFechaInicio(primerMesCobro),
        },
      };

      if (modoAlumno === "existente") {
        if (!alumnoSeleccionado?.idAlumno) {
          toast.error("Selecciona un alumno existente");
          setGuardando(false);
          return;
        }

        payload.alumnoExistente = {
          idAlumno: alumnoSeleccionado.idAlumno,
          nombreAlumno: alumnoSeleccionado.nombreAlumno,
          modalidad: modalidadAlumno,
        };
      } else {
        if (!nombreAlumnoNuevo.trim()) {
          toast.error("Captura el nombre del alumno");
          setGuardando(false);
          return;
        }

        payload.alumnoNuevo = {
          nombreAlumno: nombreAlumnoNuevo.trim(),
          telefono: telefonoAlumnoNuevo,
          tutor: tutorAlumnoNuevo,
          observaciones: observacionesAlumnoNuevo,
          estatus: "Activo",
          modalidad: modalidadAlumno,
        };
      }

      const respuesta = await crearGrupoConAlumno(payload);
      console.log("Grupo con alumno creado:", respuesta);

      toast.success("Grupo creado e inscripción realizada correctamente", {
        description: `Grupo: ${cursoSeleccionado.nombreCurso} - ${diaClase} ${horaClase}`,
        duration: 4000,
      });

      const nombreAlumnoFinal =
        modoAlumno === "existente"
          ? alumnoSeleccionado?.nombreAlumno || ""
          : nombreAlumnoNuevo.trim();
      const prof = normalizarProfesorContacto(profesorSeleccionado);
      const grupo = respuesta?.grupo || {};
      const idGrupo = grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId || "";
      const avisos: ItemWhatsAppCola[] = [];
      const combinado = avisoGrupoAsignacionEInscripcion(prof, {
        nombreCurso: cursoSeleccionado.nombreCurso,
        idGrupo: String(idGrupo),
        diaClase,
        horaClase,
        nombreAlumno: nombreAlumnoFinal,
        fechaInscripcion: fechaCreacion,
      });
      if (combinado) avisos.push(combinado);

      colaWhatsApp.iniciar(avisos, () => {
        onSuccess?.();
        onClose();
      });
    } catch (error: any) {
      console.error("Error al crear grupo con alumno:", error);
      
      let mensajeError = error.message || "Error al crear el grupo";

      if (error.message && error.message.includes("Ya existe")) {
        toast.error("El grupo ya existe", {
          description: error.message,
          duration: 5000,
        });
      } else {
        toast.error("Error al crear el grupo", {
          description: mensajeError,
          duration: 5000,
        });
      }
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoCatalogos) {
    return (
      <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
        <div className="bg-white rounded-xl p-6 shadow-lg w-[95vw] max-w-5xl">
          Cargando formulario...
        </div>
      </div>
    );
  }

  return (
    <>
      <WhatsAppColaHost {...colaWhatsApp} />
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div className="bg-white w-[95vw] max-w-6xl rounded-xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">Crear grupo nuevo e inscribir alumno</h2>

        <p className="text-sm text-gray-500 mb-6">
          Captura los datos del grupo y selecciona si el alumno ya existe o si
          será un registro nuevo.
        </p>

        <div className="bg-gray-100 rounded-lg p-4 mb-5">
          <h3 className="font-semibold mb-3">Datos del grupo</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Curso
              </label>
              <select
                value={cursoSeleccionado?.idCurso || ""}
                onChange={(e) => {
                  const curso =
                    cursos.find(
                      (c: any) =>
                        normalizar(c.idCurso) === normalizar(e.target.value)
                    ) || null;
                  setCursoSeleccionado(curso);
                }}
                className="w-full border p-2 rounded"
              >
                <option value="">Selecciona curso</option>
                {cursos.map((curso: any) => (
                  <option key={curso.idCurso} value={curso.idCurso}>
                    {curso.nombreCurso}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profesor
              </label>
              <select
                value={idProfesor}
                onChange={(e) => setIdProfesor(e.target.value)}
                className="w-full border p-2 rounded"
              >
                <option value="">Selecciona profesor</option>
                {profesores.map((profesor: any) => (
                  <option key={profesor.idProfesor} value={profesor.idProfesor}>
                    {profesor.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Día
              </label>
              <select
                value={diaClase}
                onChange={(e) => setDiaClase(e.target.value)}
                className="w-full border p-2 rounded"
              >
                <option value="">Selecciona día</option>
                {DIAS.map((dia) => (
                  <option key={dia} value={dia}>
                    {dia}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora
              </label>
              <input
                type="time"
                value={horaClase}
                onChange={(e) => setHoraClase(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duración de la clase
              </label>
              <select
                value={duracionClase}
                onChange={(e) => setDuracionClase(e.target.value)}
                className="w-full border p-2 rounded"
              >
                <option value="1 hora">1 hora</option>
                <option value="1:30 hr">1:30 horas</option>
                <option value="2 horas">2 horas</option>
                <option value="2:30 horas">2:30 horas</option>
                <option value="3 horas">3 horas</option>
                <option value="3:30 horas">3:30 horas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacidad máxima
              </label>
              <input
                type="number"
                min="1"
                value={capacidadMaxima}
                onChange={(e) => setCapacidadMaxima(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde qué día empieza su clase
              </label>
              <input
                type="date"
                value={fechaCreacion}
                onChange={(e) => setFechaCreacion(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota del grupo
            </label>
            <textarea
              value={comentarioGrupo}
              onChange={(e) => setComentarioGrupo(e.target.value)}
              rows={3}
              placeholder="Ej. profesor de apoyo, indicaciones especiales o recordatorios de la clase"
              className="w-full border p-2 rounded bg-white"
            />
          </div>
        </div>

        <div className="bg-gray-100 rounded-lg p-4 mb-5">
          <h3 className="font-semibold mb-3">Datos del alumno</h3>

          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setModoAlumno("existente")}
              className={`px-4 py-2 rounded-lg ${
                modoAlumno === "existente"
                  ? "bg-cyan-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Alumno existente
            </button>

            <button
              type="button"
              onClick={() => setModoAlumno("nuevo")}
              className={`px-4 py-2 rounded-lg ${
                modoAlumno === "nuevo"
                  ? "bg-cyan-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Alumno nuevo
            </button>
          </div>

          {modoAlumno === "existente" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modalidad del alumno
                </label>
                <select
                  value={modalidadAlumno}
                  onChange={(e) =>
                    setModalidadAlumno(e.target.value as "Presencial" | "Virtual")
                  }
                  className="w-full border p-2 rounded"
                >
                  <option value="Presencial">Presencial</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buscar alumno
                </label>
                <input
                  type="text"
                  value={busquedaAlumno}
                  onChange={(e) => setBusquedaAlumno(e.target.value)}
                  placeholder="Escribe nombre o id del alumno"
                  className="w-full border p-2 rounded"
                />
              </div>

              {alumnoSeleccionado && (
                <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 p-3 rounded text-sm">
                  <b>Alumno seleccionado:</b> {alumnoSeleccionado.nombreAlumno} (
                  {alumnoSeleccionado.idAlumno})
                </div>
              )}

              <div className="border rounded-lg max-h-64 overflow-y-auto bg-white">
                {buscandoAlumnos ? (
                  <p className="p-3 text-sm text-gray-500">Buscando...</p>
                ) : alumnosEncontrados.length > 0 ? (
                  alumnosEncontrados.map((alumno: any) => {
                    const seleccionado =
                      alumnoSeleccionado?.idAlumno === alumno.idAlumno;

                    return (
                      <div
                        key={`${alumno.idAlumno}-${alumno.nombreAlumno}`}
                        onClick={() => setAlumnoSeleccionado(alumno)}
                        className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                          seleccionado ? "bg-cyan-100 border-cyan-300" : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900">
                          {alumno.nombreAlumno}
                        </div>
                        <div className="text-sm text-gray-500">
                          {alumno.idAlumno || "Sin ID"}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="p-3 text-sm text-gray-500">
                    No se encontraron alumnos
                  </p>
                )}
              </div>
            </div>
          )}

          {modoAlumno === "nuevo" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modalidad del alumno
                </label>
                <select
                  value={modalidadAlumno}
                  onChange={(e) =>
                    setModalidadAlumno(e.target.value as "Presencial" | "Virtual")
                  }
                  className="w-full border p-2 rounded"
                >
                  <option value="Presencial">Presencial</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del alumno
                </label>
                <input
                  type="text"
                  value={nombreAlumnoNuevo}
                  onChange={(e) => setNombreAlumnoNuevo(e.target.value)}
                  className="w-full border p-2 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono del tutor (WhatsApp)
                </label>
                <input
                  type="text"
                  value={telefonoAlumnoNuevo}
                  onChange={(e) => setTelefonoAlumnoNuevo(e.target.value)}
                  className="w-full border p-2 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del tutor
                </label>
                <input
                  type="text"
                  value={tutorAlumnoNuevo}
                  onChange={(e) => setTutorAlumnoNuevo(e.target.value)}
                  className="w-full border p-2 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  value={observacionesAlumnoNuevo}
                  onChange={(e) => setObservacionesAlumnoNuevo(e.target.value)}
                  rows={3}
                  className="w-full border p-2 rounded"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-4 mb-5">
          <h3 className="font-semibold mb-3 text-gray-900">Datos de pago</h3>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto de mensualidad
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoMensualidad}
                onChange={(e) => setMontoMensualidad(e.target.value)}
                placeholder="0.00"
                className="w-full border p-2 rounded bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Día de pago (1-31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={diaPago}
                onChange={(e) => setDiaPago(e.target.value)}
                className="w-full border p-2 rounded bg-white"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primer mes de cobro
              </label>
              <input
                type="month"
                value={primerMesCobro}
                onChange={(e) => setPrimerMesCobro(e.target.value)}
                className="w-full border p-2 rounded bg-white"
              />
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando || !puedeGuardarGrupo}
            className={`px-4 py-2 rounded-lg text-white font-medium transition-all ${
              guardando || !puedeGuardarGrupo
                ? "bg-emerald-300 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 active:scale-95"
            }`}
            title={
              !puedeGuardarGrupo
                ? "Completa todos los campos requeridos"
                : "Crear grupo e inscribir al alumno"
            }
          >
            {guardando ? "Guardando..." : "Crear grupo e inscribir"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
