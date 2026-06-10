import { useEffect, useMemo, useState } from "react";
import {
  crearReagendacion,
  getCalendario,
  getProfesores,
  getAlumnos,
} from "../../services/api";
import { construirMensajeRecuperacionClase } from "../../utils/mensajesWhatsApp";
import { avisoGrupoReagendacion } from "../../utils/avisosWhatsAppProfesor";
import { useColaWhatsApp } from "../../hooks/useColaWhatsApp";
import { WhatsAppColaHost } from "./WhatsAppColaHost";

interface ReagendacionFormProps {
  data: any;
  onClose: () => void;
  onSuccess?: () => void;
}

function normalizar(valor: string) {
  return String(valor || "").trim().toUpperCase();
}

function obtenerNombreDia(fechaISO: string) {
  if (!fechaISO) return "";
  const fecha = new Date(`${fechaISO}T00:00:00`);
  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return dias[fecha.getDay()];
}

export default function ReagendacionForm({
  data,
  onClose,
  onSuccess,
}: ReagendacionFormProps) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState("2 horas");
  const [modalidad, setModalidad] = useState(data?.alumno?.modalidad || "Presencial");
  const [idProfesorNuevo, setIdProfesorNuevo] = useState("");
  const [tipoReagendacion, setTipoReagendacion] = useState<"temporal" | "permanente">("temporal");
  const [guardando, setGuardando] = useState(false);
  const [grupoSugerido, setGrupoSugerido] = useState<any>(null);
  const [buscandoGrupo, setBuscandoGrupo] = useState(false);
  const [profesoresDisponibles, setProfesoresDisponibles] = useState<any[]>([]);
  const colaWhatsApp = useColaWhatsApp();

  const cursoActual = data?.clase?.title || data?.clase?.nombreCurso || "";
  const profesorOriginal =
    data?.clase?.teacher?.name || data?.clase?.nombreProfesor || "";
  const idProfesorOriginal =
    data?.clase?.idProfesor ||
    data?.clase?.IdProfesor ||
    data?.clase?.profesorId ||
    "";

  const profesorSeleccionado = profesoresDisponibles.find(
    (prof) => prof.idProfesor === idProfesorNuevo
  );

  const profesorFinal = profesorSeleccionado?.nombre || profesorOriginal;
  const idProfesorFinal = profesorSeleccionado?.idProfesor || idProfesorOriginal;

  const idGrupoOrigenDetectado =
    data?.clase?.idGrupo ||
    data?.clase?.IdgrupoOrigen ||
    data?.clase?.GrupoId ||
    data?.clase?.groupId ||
    "";

  const diaNuevo = useMemo(() => obtenerNombreDia(fecha), [fecha]);

  const nombreAlumno =
    data?.alumno?.nombreAlumno || data?.alumno?.Alumno || data?.alumno?.nombre || "";

  const telefonoProfesorFinal =
    profesorSeleccionado?.telefono ||
    profesoresDisponibles.find((p) => p.idProfesor === idProfesorOriginal)?.telefono ||
    "";

  const construirMensajeTutor = (fechaOriginalISO: string) =>
    construirMensajeRecuperacionClase({
      nombreAlumno,
      fechaNueva: fecha,
      horaNueva: hora,
      nombreProfesor: profesorFinal,
      telefonoProfesor: telefonoProfesorFinal,
      modalidad,
      fechaSesionOriginal: fechaOriginalISO,
    });

  const abrirColaAvisos = async (fechaOriginalISO: string, alCerrar?: () => void) => {
    let telefonoTutor = "";
    try {
      const alumnos = await getAlumnos(data?.alumno?.idAlumno || "");
      const alumnoDb =
        alumnos.find(
          (a: any) =>
            String(a.idAlumno || "").trim() ===
            String(data?.alumno?.idAlumno || "").trim()
        ) || alumnos[0];
      telefonoTutor = String(alumnoDb?.telefono || "").trim();
    } catch {
      telefonoTutor = "";
    }

    const [anio, mes, dia] = fecha.split("-").map(Number);
    const fechaNuevaDate = new Date(anio, mes - 1, dia);
    const fechaHoraLocal = (d: Date, horaStr: string) => {
      const [h = 0, m = 0] = horaStr.split(":").map((x) => parseInt(x, 10));
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      return `${y}-${mo}-${day}T${hh}:${mm}:00`;
    };
    const fechaNuevaISO = fechaHoraLocal(fechaNuevaDate, hora);

    const avisoGrupoProfesores = await avisoGrupoReagendacion({
      idProfesorOriginal,
      idProfesorNuevo: idProfesorFinal,
      nombreAlumno,
      nombreCurso: cursoActual,
      fechaHoraOriginal: fechaOriginalISO,
      fechaHoraNueva: fechaNuevaISO,
    });

    const cola = [
      {
        titulo: "Aviso al tutor — clase de recuperación",
        mensaje: construirMensajeTutor(fechaOriginalISO),
        telefono: telefonoTutor || undefined,
        destinatarioLabel: telefonoTutor
          ? `Teléfono del tutor: ${telefonoTutor}`
          : "Sin teléfono registrado — elige el contacto en WhatsApp",
      },
      ...(avisoGrupoProfesores ? [avisoGrupoProfesores] : []),
    ];

    colaWhatsApp.iniciar(cola, alCerrar);
  };

  useEffect(() => {
    const cargarProfesores = async () => {
      try {
        const profesores = await getProfesores();

        const profesoresActivos = profesores
          .filter((prof: any) => {
            const estatus = String(prof.estatus || "").trim().toUpperCase();
            return estatus === "ACTIVO" || estatus === "";
          })
          .map((prof: any) => ({
            idProfesor:
              prof.idProfesor || prof.IdProfesor || prof.profesorId || "",
            nombre: String(prof.nombre || prof.nombreProfesor || "").trim(),
            telefono: String(prof.telefono || "").trim(),
          }))
          .filter((prof: any) => prof.idProfesor && prof.nombre);

        profesoresActivos.sort((a: any, b: any) =>
          a.nombre.localeCompare(b.nombre, "es")
        );

        setProfesoresDisponibles(profesoresActivos);
      } catch (error) {
        console.error("Error al cargar profesores:", error);
        setProfesoresDisponibles([]);
      }
    };

    cargarProfesores();
  }, []);

  useEffect(() => {
    const buscarGrupoCompatible = async () => {
      if (!fecha || !hora || !cursoActual || !idProfesorFinal) {
        setGrupoSugerido(null);
        return;
      }

      try {
        setBuscandoGrupo(true);

        const calendario = await getCalendario();
        const clasesBase = calendario?.clasesBase || [];

        const coincidencia = clasesBase.find((grupo: any) => {
          const mismoCurso =
            normalizar(grupo.nombreCurso) === normalizar(cursoActual);

          const mismoProfesor =
            normalizar(grupo.idProfesor) === normalizar(idProfesorFinal);

          const mismaHora =
            normalizar(grupo.horaClase) === normalizar(hora);

          const mismoDia =
            normalizar(grupo.diaClase) === normalizar(diaNuevo);

          return mismoCurso && mismoProfesor && mismaHora && mismoDia;
        });

        setGrupoSugerido(coincidencia || null);
      } catch (error) {
        console.error("Error al buscar grupo compatible:", error);
        setGrupoSugerido(null);
      } finally {
        setBuscandoGrupo(false);
      }
    };

    buscarGrupoCompatible();
  }, [fecha, hora, cursoActual, idProfesorFinal, diaNuevo]);

  const handleSubmit = async () => {
    try {
      setGuardando(true);

      console.log("========== DEBUG REAGENDACION ==========");
      console.log("data completa:", data);
      console.log("data.alumno:", data?.alumno);
      console.log("data.clase:", data?.clase);
      console.log("grupo sugerido:", grupoSugerido);

      if (!data?.alumno?.idAlumno) {
        console.error("Falta data.alumno.idAlumno");
        alert("No se encontró el id del alumno");
        return;
      }

      if (!idGrupoOrigenDetectado) {
        console.error("No se encontró el grupo de origen");
        alert("No se encontró el grupo de origen. Revisa la consola.");
        return;
      }

      if (!fecha || !hora) {
        console.error("Faltan fecha u hora");
        alert("Debes seleccionar fecha y hora");
        return;
      }

      const idGrupoNuevoFinal =
        grupoSugerido?.idGrupo ||
        `VIRTUAL_${cursoActual}_${idProfesorFinal}_${fecha}_${hora}`
          .replace(/\s+/g, "_")
          .replace(/[^A-Za-z0-9_\-]/g, "");

      // Fechas en hora local (sin Z) para evitar desfase UTC en el calendario
      const fechaHoraLocal = (d: Date, horaStr: string) => {
        const [h = 0, m = 0] = horaStr.split(":").map((x) => parseInt(x, 10));
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        return `${y}-${mo}-${day}T${hh}:${mm}:00`;
      };

      const fechaOriginal = data.clase.date ? new Date(data.clase.date) : new Date();
      const horaClaseOrigen = String(data.clase.startTime || "00:00").trim();
      const fechaOriginalISO = fechaHoraLocal(fechaOriginal, horaClaseOrigen);

      const [anio, mes, dia] = fecha.split("-").map(Number);
      const fechaNuevaDate = new Date(anio, mes - 1, dia);
      const fechaNuevaISO = fechaHoraLocal(fechaNuevaDate, hora);

      const payload = {
        idAlumno: data.alumno.idAlumno,
        nombreAlumno:
          data.alumno.nombreAlumno ||
          data.alumno.Alumno ||
          data.alumno.nombre ||
          "",
        idGrupoOrigen: idGrupoOrigenDetectado, // ✅ Normalizado (era IdgrupoOrigen)
        idGrupoNuevo: idGrupoNuevoFinal,
        nombreCurso: cursoActual,
        profesorOriginal: profesorOriginal,
        profesorNuevo: profesorFinal,
        idProfesorOriginal: idProfesorOriginal,
        idProfesorNuevo: idProfesorFinal,
        // ✅ CAMBIO CRÍTICO: Enviar fechas en ISO 8601 (no strings con espacios)
        fechaHoraOriginal: fechaOriginalISO,
        fechaHoraNueva: fechaNuevaISO,
        duracion: duracion,
        modalidad: modalidad,
        tipoReagendacion: tipoReagendacion, // ✅ CAMBIO 7: Usuario elige tipo
        comentario: "",
        motivo: grupoSugerido
          ? "Reagendado a grupo existente"
          : "Reagendado a clase virtual",
        estatus: "reagendado",
      };

      console.log("PAYLOAD FINAL:", payload);

      const respuesta = await crearReagendacion(payload);
      console.log("RESPUESTA SERVIDOR:", respuesta);

      const cerrarFlujo = () => {
        if (onSuccess) onSuccess();
        else onClose();
      };

      if (respuesta?.permanente) {
        alert(
          respuesta.mensaje ||
            "Reagendación permanente aplicada. El alumno fue movido al nuevo grupo."
        );
      } else {
        alert(
          grupoSugerido
            ? "Reagendación temporal guardada en un grupo existente"
            : "Reagendación temporal guardada como clase reagendada"
        );
      }

      await abrirColaAvisos(fechaOriginalISO, cerrarFlujo);
    } catch (error: any) {
      console.error("ERROR EN handleSubmit:", error);
      alert(error?.message || "Error al guardar la reagendación");
    } finally {
      setGuardando(false);
      console.log("========== FIN DEBUG ==========");
    }
  };

  const handleEnviarMensaje = () => {
    if (!fecha || !hora) {
      alert("Selecciona fecha y hora para generar el mensaje");
      return;
    }

    const fechaOriginal = data.clase.date ? new Date(data.clase.date) : new Date();
    const horaClaseOrigen = String(data.clase.startTime || "00:00").trim();
    const [h = 0, m = 0] = horaClaseOrigen.split(":").map((x: string) => parseInt(x, 10));
    const y = fechaOriginal.getFullYear();
    const mo = String(fechaOriginal.getMonth() + 1).padStart(2, "0");
    const day = String(fechaOriginal.getDate()).padStart(2, "0");
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const fechaOriginalISO = `${y}-${mo}-${day}T${hh}:${mm}:00`;

    colaWhatsApp.iniciar([
      {
        titulo: "Vista previa — aviso de recuperación",
        mensaje: construirMensajeTutor(fechaOriginalISO),
        destinatarioLabel: "Mensaje para tutor (editable)",
      },
    ]);
  };

  return (
    <>
      <WhatsAppColaHost {...colaWhatsApp} />
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div className="bg-white w-[900px] max-h-[90vh] overflow-y-auto rounded-2xl p-8 shadow-2xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Reprogramación de Clase</h2>
          <p className="text-lg text-cyan-600 font-semibold">
            Alumno: {data?.alumno?.nombreAlumno || data?.alumno?.Alumno || ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl">
            <h3 className="font-bold text-lg text-blue-900 mb-4">Clase Original</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-blue-600 font-semibold">Materia:</span>
                <p className="text-gray-800">{cursoActual}</p>
              </div>
              <div>
                <span className="text-blue-600 font-semibold">Profesor:</span>
                <p className="text-gray-800">{profesorOriginal}</p>
              </div>
              <div>
                <span className="text-blue-600 font-semibold">Horario:</span>
                <p className="text-gray-800">{data?.clase?.startTime} - {data?.clase?.endTime}</p>
              </div>
              <div>
                <span className="text-blue-600 font-semibold">Grupo:</span>
                <p className="text-gray-800 font-mono">{idGrupoOrigenDetectado}</p>
              </div>
              <div>
                <span className="text-blue-600 font-semibold">Modalidad Actual:</span>
                <p className={`font-semibold ${
                  data?.alumno?.modalidad === 'Virtual' 
                    ? 'text-purple-700' 
                    : 'text-emerald-700'
                }`}>
                  {data?.alumno?.modalidad || 'Presencial'}
                </p>
              </div>
            </div>
          </div>

        </div>

        <button
          onClick={handleEnviarMensaje}
          className="w-full border border-emerald-200 bg-emerald-50 py-3 rounded-lg mb-6 font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          Vista previa del mensaje al tutor
        </button>

        <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 p-6 rounded-xl mb-6">
          <h3 className="font-bold text-lg text-gray-900 mb-4">Nueva Fecha, Hora y Profesor</h3>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Duración</label>
              <select
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="1 hora">1 hora</option>
                <option value="1:30 horas">1:30 horas</option>
                <option value="2 horas">2 horas</option>
                <option value="2:30 horas">2:30 horas</option>
                <option value="3 horas">3 horas</option>
                <option value="3:30 horas">3:30 horas</option>
                <option value="4 horas">4 horas</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Modalidad</label>
              <select
                value={modalidad}
                onChange={(e) => setModalidad(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="Presencial">Presencial</option>
                <option value="Virtual">Virtual</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Profesor Nuevo</label>
              <select
                value={idProfesorNuevo}
                onChange={(e) => setIdProfesorNuevo(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="">Selecciona profesor disponible</option>
                {profesoresDisponibles.map((profesor) => (
                  <option key={profesor.idProfesor} value={profesor.idProfesor}>
                    {profesor.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              ✅ Tipo de Reagendación
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTipoReagendacion("temporal")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tipoReagendacion === "temporal"
                    ? "border-blue-500 bg-blue-50 text-blue-900 shadow-md"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                <div className="font-bold text-lg mb-1">⏰ Temporal</div>
                <div className="text-xs">Solo esta clase</div>
                <div className="text-xs mt-2">El alumno sigue en el grupo original para próximas semanas</div>
              </button>

              <button
                type="button"
                onClick={() => setTipoReagendacion("permanente")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tipoReagendacion === "permanente"
                    ? "border-green-500 bg-green-50 text-green-900 shadow-md"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                <div className="font-bold text-lg mb-1">♻️ Permanente</div>
                <div className="text-xs">Cambio definitivo</div>
                <div className="text-xs mt-2">El alumno se mueve al nuevo grupo/horario definitivamente</div>
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6">
          {buscandoGrupo ? (
            <div className="bg-blue-50 border border-blue-300 text-blue-700 p-4 rounded-lg text-sm font-semibold">
              Buscando grupo compatible...
            </div>
          ) : grupoSugerido ? (
            <div className="bg-green-50 border border-green-300 text-green-900 p-4 rounded-lg text-sm">
              <div className="font-bold mb-3 text-lg">Grupo existente encontrado</div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-semibold">ID Grupo:</span> <span className="font-mono">{grupoSugerido.idGrupo}</span></div>
                <div><span className="font-semibold">Curso:</span> {grupoSugerido.nombreCurso}</div>
                <div><span className="font-semibold">Profesor:</span> {grupoSugerido.nombreProfesor}</div>
                <div><span className="font-semibold">Día:</span> {grupoSugerido.diaClase}</div>
                <div><span className="font-semibold">Hora:</span> {grupoSugerido.horaClase}</div>
              </div>
            </div>
          ) : fecha && hora ? (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-lg text-sm font-semibold">
              No se encontró un grupo compatible. Se creará una clase reagendada nueva.
            </div>
          ) : (
            <div className="bg-gray-100 border border-gray-300 text-gray-600 p-4 rounded-lg text-sm">
              Selecciona fecha, hora y profesor para buscar automáticamente un grupo compatible.
            </div>
          )}
        </div>

        <div className="bg-amber-100 border-2 border-amber-400 text-amber-900 p-4 rounded-lg mb-6 text-sm font-semibold">
          Esta clase quedará marcada como <span className="font-bold">"Reprogramado"</span> en el sistema.
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={guardando}
            className="px-6 py-3 border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 rounded-lg font-semibold transition-colors"
          >
            {guardando ? "Guardando reagendación..." : "Confirmar reagendación"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
