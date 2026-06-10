import { useEffect, useMemo, useState } from "react";
import {
  crearAlumno,
  crearGrupoConAlumno,
  crearInscripcion,
  getAlumnos,
  getCursos,
  getProfesores,
} from "../../services/api";
import {
  mesCobroAFechaInicio,
  toDateInputValue,
  toMonthInputValue,
  validarFechasInscripcion,
} from "../../utils/fechasInscripcion";
import { useColaWhatsApp } from "../../hooks/useColaWhatsApp";
import { WhatsAppColaHost } from "./WhatsAppColaHost";
import {
  avisoGrupoAsignacionEInscripcion,
  avisoGrupoInscripcionAlumno,
  cargarProfesorPorId,
  normalizarProfesorContacto,
  type ItemWhatsAppCola,
} from "../../utils/avisosWhatsAppProfesor";

interface InscripcionFormProps {
  /** Si viene del calendario, el grupo queda fijo */
  classData?: any | null;
  onClose: () => void;
  onSuccess?: () => void;
  /** Preseleccionar alumno (desde Alumnos inscritos) */
  alumnoInicial?: {
    idAlumno: string;
    nombreAlumno?: string;
    nombre?: string;
  } | null;
}

function normalizar(valor: string) {
  return String(valor || "").trim().toUpperCase();
}

const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const DURACIONES_CLASE = [
  "1 hora",
  "1:30 hr",
  "2 horas",
  "2:30 horas",
  "3 horas",
  "3:30 horas",
];

export default function InscripcionForm({
  classData = null,
  onClose,
  onSuccess,
  alumnoInicial = null,
}: InscripcionFormProps) {
  const modoLibre = !classData;

  const [modo, setModo] = useState<"existente" | "nuevo">("existente");
  const [busqueda, setBusqueda] = useState("");
  const [alumnosEncontrados, setAlumnosEncontrados] = useState<any[]>([]);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(
    alumnoInicial
      ? {
          idAlumno: alumnoInicial.idAlumno,
          nombreAlumno:
            alumnoInicial.nombreAlumno || alumnoInicial.nombre || "",
        }
      : null
  );

  const [nombreAlumno, setNombreAlumno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tutor, setTutor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [modalidad, setModalidad] = useState("Presencial");
  const [fechaInscripcion, setFechaInscripcion] = useState("");
  const [primerMesCobro, setPrimerMesCobro] = useState("");
  const [montoMensualidad, setMontoMensualidad] = useState("");
  const [diaPago, setDiaPago] = useState<string>("5");

  const [cursos, setCursos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(modoLibre);
  const [idCursoFiltro, setIdCursoFiltro] = useState("");
  const [idProfesorFiltro, setIdProfesorFiltro] = useState("");
  const [diaClaseSeleccionado, setDiaClaseSeleccionado] = useState("");
  const [horaClaseSeleccionada, setHoraClaseSeleccionada] = useState("");
  const [duracionClaseSeleccionada, setDuracionClaseSeleccionada] =
    useState("2 horas");

  const [guardando, setGuardando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const colaWhatsApp = useColaWhatsApp();

  const grupoIdDesdeClase = useMemo(() => {
    if (!classData) return "";
    return (
      classData?.idGrupo ||
      classData?.IdGrupo ||
      classData?.grupoId ||
      classData?.GrupoId ||
      classData?.id_grupo ||
      classData?.id ||
      ""
    );
  }, [classData]);

  const cursoSeleccionado = useMemo(
    () =>
      cursos.find(
        (c) => normalizar(c.idCurso) === normalizar(idCursoFiltro)
      ) || null,
    [cursos, idCursoFiltro]
  );

  const profesorSeleccionado = useMemo(
    () =>
      profesores.find(
        (p) => normalizar(p.idProfesor) === normalizar(idProfesorFiltro)
      ) || null,
    [profesores, idProfesorFiltro]
  );

  const horarioCompleto = useMemo(
    () =>
      Boolean(
        cursoSeleccionado &&
          profesorSeleccionado &&
          diaClaseSeleccionado &&
          horaClaseSeleccionada &&
          duracionClaseSeleccionada
      ),
    [
      cursoSeleccionado,
      profesorSeleccionado,
      diaClaseSeleccionado,
      horaClaseSeleccionada,
      duracionClaseSeleccionada,
    ]
  );

  useEffect(() => {
    const hoy = toDateInputValue(new Date());
    if (classData?.date) {
      const fechaClase = toDateInputValue(classData.date);
      setFechaInscripcion(fechaClase);
      setPrimerMesCobro(toMonthInputValue(classData.date));
      return;
    }
    setFechaInscripcion(hoy);
    setPrimerMesCobro(toMonthInputValue(new Date()));
  }, [classData]);

  useEffect(() => {
    if (!fechaInscripcion) return;
    const mesClase = toMonthInputValue(fechaInscripcion);
    if (!primerMesCobro) {
      setPrimerMesCobro(mesClase);
      return;
    }
    if (validarFechasInscripcion(fechaInscripcion, primerMesCobro)) {
      setPrimerMesCobro(mesClase);
    }
  }, [fechaInscripcion]);

  useEffect(() => {
    if (!modoLibre) return;

    const cargar = async () => {
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
          }))
          .filter((c: any) => c.nombreCurso)
          .sort((a: any, b: any) =>
            a.nombreCurso.localeCompare(b.nombreCurso, "es")
          );

        const profesoresActivos = (profesoresResp || [])
          .map((prof: any) => ({
            idProfesor: prof.idProfesor || prof.IdProfesor || "",
            nombre: prof.nombre || prof.nombreProfesor || "",
            telefono: prof.telefono || "",
          }))
          .filter((p: any) => p.nombre)
          .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, "es"));

        setCursos(cursosActivos);
        setProfesores(profesoresActivos);
      } catch (error) {
        console.error("Error al cargar catálogos:", error);
      } finally {
        setCargandoCatalogos(false);
      }
    };

    cargar();
  }, [modoLibre]);

  useEffect(() => {
    if (modo !== "existente" || alumnoInicial) return;

    const buscar = async () => {
      try {
        setBuscando(true);
        const alumnos = await getAlumnos(busqueda, { soloInscribibles: true });
        setAlumnosEncontrados(alumnos || []);
      } catch (error) {
        console.error("Error al buscar alumnos:", error);
        setAlumnosEncontrados([]);
      } finally {
        setBuscando(false);
      }
    };

    buscar();
  }, [busqueda, modo, alumnoInicial]);

  useEffect(() => {
    if (modo === "nuevo") {
      setAlumnoSeleccionado(null);
    } else if (alumnoInicial) {
      setAlumnoSeleccionado({
        idAlumno: alumnoInicial.idAlumno,
        nombreAlumno:
          alumnoInicial.nombreAlumno || alumnoInicial.nombre || "",
      });
    }
  }, [modo, alumnoInicial]);

  const alumnoYaElegidoTexto = useMemo(() => {
    if (!alumnoSeleccionado) return "";
    return `${alumnoSeleccionado.nombreAlumno || "Sin nombre"} (${alumnoSeleccionado.idAlumno || "Sin ID"})`;
  }, [alumnoSeleccionado]);

  const handleSeleccionarAlumno = (alumno: any) => {
    setAlumnoSeleccionado(alumno);
  };

  const handleGuardar = async () => {
    try {
      setGuardando(true);

      if (modoLibre && !horarioCompleto) {
        alert("Completa curso, profesor, día, hora y duración de la clase");
        return;
      }

      if (!modoLibre && !grupoIdDesdeClase?.trim()) {
        alert(
          "No se encontró el grupo de la clase. Recarga e intenta de nuevo."
        );
        return;
      }

      if (!fechaInscripcion) {
        alert("Indica desde qué día empieza a tomar clase");
        return;
      }

      const errorFechas = validarFechasInscripcion(
        fechaInscripcion,
        primerMesCobro
      );
      if (errorFechas) {
        alert(errorFechas);
        return;
      }

      const montoPagoNumero = Number(montoMensualidad);
      if (
        !montoMensualidad ||
        !Number.isFinite(montoPagoNumero) ||
        montoPagoNumero <= 0
      ) {
        alert("Captura un monto de mensualidad válido");
        return;
      }

      if (modo === "existente" && !alumnoSeleccionado) {
        alert("Debes seleccionar un alumno");
        return;
      }

      if (modo === "nuevo" && !nombreAlumno.trim()) {
        alert("Debes capturar el nombre del alumno");
        return;
      }

      const datosPago = {
        montoMensualidad: montoPagoNumero,
        diaPago: Number(diaPago),
        fechaInicioPago: mesCobroAFechaInicio(primerMesCobro),
      };

      try {
        if (modoLibre) {
          const respuesta = await crearGrupoConAlumno({
            grupo: {
              idCurso: cursoSeleccionado!.idCurso,
              nombreCurso: cursoSeleccionado!.nombreCurso,
              diaClase: diaClaseSeleccionado,
              horaClase: horaClaseSeleccionada,
              duracionClase: duracionClaseSeleccionada,
              idProfesor: profesorSeleccionado!.idProfesor,
              nombreProfesor: profesorSeleccionado!.nombre,
              capacidadMaxima: 8,
              fechaCreacion: fechaInscripcion,
              Estatus: "Activo",
            },
            fechaInscripcion,
            datosPago,
            ...(modo === "existente"
              ? {
                  alumnoExistente: {
                    idAlumno: alumnoSeleccionado!.idAlumno,
                    nombreAlumno: alumnoSeleccionado!.nombreAlumno,
                    modalidad,
                  },
                }
              : {
                  alumnoNuevo: {
                    nombreAlumno: nombreAlumno.trim(),
                    telefono,
                    tutor,
                    observaciones,
                    modalidad,
                  },
                }),
          });

          const mensajeGrupo = respuesta?.grupoCreado
            ? "Se creó el grupo y el alumno quedó inscrito."
            : "El alumno quedó inscrito en el grupo existente.";
          alert(`Inscripción correcta. ${mensajeGrupo}`);

          const nombreAlumnoFinal =
            modo === "existente"
              ? alumnoSeleccionado!.nombreAlumno
              : nombreAlumno.trim();
          const prof = normalizarProfesorContacto(profesorSeleccionado);
          const grupo = respuesta?.grupo || {};
          const idGrupo =
            grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId || "";
          const avisos: ItemWhatsAppCola[] = [];
          if (respuesta?.grupoCreado) {
            const combinado = avisoGrupoAsignacionEInscripcion(prof, {
              nombreCurso: cursoSeleccionado!.nombreCurso,
              idGrupo: String(idGrupo),
              diaClase: diaClaseSeleccionado,
              horaClase: horaClaseSeleccionada,
              nombreAlumno: nombreAlumnoFinal,
              fechaInscripcion,
            });
            if (combinado) avisos.push(combinado);
          } else {
            const inscripcion = avisoGrupoInscripcionAlumno(prof, {
              nombreAlumno: nombreAlumnoFinal,
              nombreCurso: cursoSeleccionado!.nombreCurso,
              idGrupo: String(idGrupo),
              fechaInscripcion,
            });
            if (inscripcion) avisos.push(inscripcion);
          }
          colaWhatsApp.iniciar(avisos, () => {
            onSuccess?.();
            onClose();
          });
          return;
        } else {
          let alumnoCalendario = alumnoSeleccionado;

          if (modo === "nuevo") {
            alumnoCalendario = await crearAlumno({
              nombreAlumno: nombreAlumno.trim(),
              telefono,
              tutor,
              observaciones,
              estatus: "Activo",
            });
          }

          if (!alumnoCalendario?.idAlumno) {
            alert("No se pudo obtener el ID del alumno");
            return;
          }

          await crearInscripcion({
            idAlumno: alumnoCalendario.idAlumno,
            nombreAlumno:
              alumnoCalendario.nombreAlumno || alumnoCalendario.nombre,
            grupoId: grupoIdDesdeClase.trim(),
            modalidad,
            fechaInscripcion,
            ...datosPago,
          });
          alert("Alumno inscrito correctamente");

          const idProfesor = String(
            classData?.idProfesor || classData?.IdProfesor || ""
          ).trim();
          const prof = idProfesor
            ? await cargarProfesorPorId(idProfesor)
            : null;
          const aviso = avisoGrupoInscripcionAlumno(prof, {
            nombreAlumno:
              alumnoCalendario.nombreAlumno || alumnoCalendario.nombre || "",
            nombreCurso: classData?.title || classData?.nombreCurso || "",
            idGrupo: grupoIdDesdeClase.trim(),
            fechaInscripcion,
          });
          colaWhatsApp.iniciar(aviso ? [aviso] : [], () => {
            onSuccess?.();
            onClose();
          });
          return;
        }
      } catch (errorInscripcion: any) {
        alert(
          `Error al inscribir: ${errorInscripcion.message || "Error desconocido"}`
        );
      }
    } catch (error: any) {
      alert(`Error inesperado: ${error.message || "Error al inscribir"}`);
    } finally {
      setGuardando(false);
    }
  };

  const puedeConfirmar =
    Boolean(fechaInscripcion) &&
    Boolean(primerMesCobro) &&
    Boolean(diaPago) &&
    Number(montoMensualidad) > 0 &&
    (modoLibre ? horarioCompleto : Boolean(grupoIdDesdeClase?.trim())) &&
    (modo === "existente"
      ? Boolean(alumnoSeleccionado)
      : Boolean(nombreAlumno.trim()));

  const selectorGrupo = modoLibre && (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
      <h3 className="font-semibold text-gray-900">Clase / grupo</h3>
      <p className="text-xs text-gray-500">
        Elige curso, profesor, día y horario libremente. Si no existe un grupo
        con esa combinación, se creará al confirmar la inscripción.
      </p>

      {cargandoCatalogos ? (
        <p className="text-sm text-gray-500">Cargando cursos y profesores...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Curso
              </label>
              <select
                value={idCursoFiltro}
                onChange={(e) => setIdCursoFiltro(e.target.value)}
                className="w-full border p-2 rounded bg-white"
                required
              >
                <option value="">Selecciona curso</option>
                {cursos.map((c) => (
                  <option key={c.idCurso || c.nombreCurso} value={c.idCurso}>
                    {c.nombreCurso}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profesor
              </label>
              <select
                value={idProfesorFiltro}
                onChange={(e) => setIdProfesorFiltro(e.target.value)}
                className="w-full border p-2 rounded bg-white"
                required
              >
                <option value="">Selecciona profesor</option>
                {profesores.map((p) => (
                  <option key={p.idProfesor} value={p.idProfesor}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Día
              </label>
              <select
                value={diaClaseSeleccionado}
                onChange={(e) => setDiaClaseSeleccionado(e.target.value)}
                className="w-full border p-2 rounded bg-white"
                required
              >
                <option value="">Selecciona día</option>
                {DIAS_SEMANA.map((dia) => (
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
                value={horaClaseSeleccionada}
                onChange={(e) => setHoraClaseSeleccionada(e.target.value)}
                className="w-full border p-2 rounded bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duración de la clase
              </label>
              <select
                value={duracionClaseSeleccionada}
                onChange={(e) => setDuracionClaseSeleccionada(e.target.value)}
                className="w-full border p-2 rounded bg-white"
                required
              >
                {DURACIONES_CLASE.map((dur) => (
                  <option key={dur} value={dur}>
                    {dur}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {horarioCompleto && (
            <p className="text-sm text-cyan-800 bg-cyan-50 border border-cyan-100 rounded p-2">
              <b>Horario:</b> {cursoSeleccionado?.nombreCurso} con{" "}
              {profesorSeleccionado?.nombre} — {diaClaseSeleccionado},{" "}
              {horaClaseSeleccionada} ({duracionClaseSeleccionada})
            </p>
          )}
        </>
      )}
    </div>
  );

  const camposClaseYPago = (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Modalidad
        </label>
        <select
          value={modalidad}
          onChange={(e) => setModalidad(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="Presencial">Presencial</option>
          <option value="Virtual">Virtual</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Desde qué día empieza su clase
        </label>
        <p className="text-xs text-gray-500 mb-1">
          Aparecerá en el calendario a partir de esta fecha
        </p>
        <input
          type="date"
          value={fechaInscripcion}
          onChange={(e) => setFechaInscripcion(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
      </div>
    </>
  );

  const datosPagoForm = (
    <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-4 mt-5 space-y-3">
      <h3 className="font-semibold text-gray-900">Datos de pago</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Día de pago (1-31)
          </label>
          <select
            value={diaPago}
            onChange={(e) => setDiaPago(e.target.value)}
            className="w-full border p-2 rounded bg-white"
            required
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Primer mes de cobro
          </label>
          <p className="text-xs text-gray-500 mb-1">
            El cobro mensual empieza en este mes (no el día exacto de hoy)
          </p>
          <input
            type="month"
            value={primerMesCobro}
            onChange={(e) => setPrimerMesCobro(e.target.value)}
            className="w-full border p-2 rounded bg-white"
            required
          />
        </div>
      </div>
    </div>
  );

  const tituloClase = classData
    ? `${classData?.title || classData?.nombreCurso || "Sin curso"} | ${
        classData?.teacher?.name || classData?.nombreProfesor || "Sin profesor"
      } | ${classData?.startTime || ""}`
    : null;

  return (
    <>
      <WhatsAppColaHost {...colaWhatsApp} />
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
      <div className="bg-white w-[95vw] max-w-5xl rounded-xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">Inscribir alumno</h2>

        {tituloClase && (
          <p className="text-sm text-gray-500 mb-4">Clase: {tituloClase}</p>
        )}

        {selectorGrupo}

        {!alumnoInicial && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setModo("existente")}
              className={`px-4 py-2 rounded-lg ${
                modo === "existente"
                  ? "bg-cyan-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Alumno existente
            </button>
            <button
              type="button"
              onClick={() => setModo("nuevo")}
              className={`px-4 py-2 rounded-lg ${
                modo === "nuevo"
                  ? "bg-cyan-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Alumno nuevo
            </button>
          </div>
        )}

        {modo === "existente" && (
          <div className="space-y-4">
            {alumnoInicial ? (
              <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 p-3 rounded text-sm">
                <b>Alumno:</b> {alumnoYaElegidoTexto}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar alumno
                  </label>
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Nombre o ID"
                    className="w-full border p-2 rounded"
                  />
                </div>

                {alumnoSeleccionado && (
                  <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 p-3 rounded text-sm">
                    <b>Seleccionado:</b> {alumnoYaElegidoTexto}
                  </div>
                )}

                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {buscando ? (
                    <p className="p-3 text-sm text-gray-500">Buscando...</p>
                  ) : alumnosEncontrados.length > 0 ? (
                    alumnosEncontrados.map((alumno) => {
                      const seleccionado =
                        alumnoSeleccionado?.idAlumno === alumno.idAlumno;
                      return (
                        <div
                          key={alumno.idAlumno}
                          onClick={() => handleSeleccionarAlumno(alumno)}
                          className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                            seleccionado ? "bg-cyan-100" : ""
                          }`}
                        >
                          <div className="font-medium">{alumno.nombreAlumno}</div>
                          <div className="text-sm text-gray-500">
                            {alumno.idAlumno}
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
              </>
            )}

            {camposClaseYPago}
          </div>
        )}

        {modo === "nuevo" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del alumno
              </label>
              <input
                type="text"
                value={nombreAlumno}
                onChange={(e) => setNombreAlumno(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
            {camposClaseYPago}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono del tutor (WhatsApp)
              </label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del tutor
              </label>
              <input
                type="text"
                value={tutor}
                onChange={(e) => setTutor(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full border p-2 rounded"
                rows={2}
              />
            </div>
          </div>
        )}

        {datosPagoForm}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando || !puedeConfirmar}
            className={`px-4 py-2 rounded text-white ${
              guardando || !puedeConfirmar
                ? "bg-emerald-300 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600"
            }`}
          >
            {guardando ? "Guardando..." : "Confirmar inscripción"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
