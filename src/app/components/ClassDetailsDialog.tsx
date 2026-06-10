import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Calendar, Clock, User, Users, RotateCcw, Trash2, StickyNote, BookOpen } from 'lucide-react';
import { resolverGrupoIdInscripcion } from '../../utils/grupoInscripcion';
import {
  getProfesores,
  reasignarProfesorGrupo,
  getCursos,
  reasignarCursoGrupo,
  actualizarHorarioGrupo,
  getNotaClaseSesion,
} from '../../services/api';
import { toast } from 'sonner';
import { calcularHoraFinDesdeDuracion } from '../../utils/duracionClase';
import { NotaRichTextEditor } from './NotaRichTextEditor';
import { fechaClaseClave, sanitizarNotaHtml } from '../../utils/notaClase';
import { useColaWhatsApp } from '../../hooks/useColaWhatsApp';
import { WhatsAppColaHost } from './WhatsAppColaHost';
import {
  avisoGrupoAsignacionCurso,
  normalizarProfesorContacto,
} from '../../utils/avisosWhatsAppProfesor';

const DIAS_CLASE = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

const DURACIONES_CLASE = [
  { value: '1 hora', label: '1 hora' },
  { value: '1:30 hr', label: '1:30 horas' },
  { value: '2 horas', label: '2 horas' },
  { value: '2:30 horas', label: '2:30 horas' },
  { value: '3 horas', label: '3 horas' },
  { value: '3:30 horas', label: '3:30 horas' },
];

function diaDesdeFecha(date: Date) {
  const dias = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  return dias[new Date(date).getDay()] || '';
}

interface ClassDetailsDialogProps {
  classData: any;
  isOpen: boolean;
  /** Si es false, el diálogo es solo lectura (perfil profesor) */
  puedeEditar?: boolean;
  onClose: () => void;
  onReagendar: (student: any) => void;
  onInscribirAlumno: (classData: any) => void;
  onEliminarGrupo: (classData: any) => void;
  onGuardarComentarioGrupo: (classData: any, notaHtml: string) => Promise<void> | void;
  onEliminarReagendacion: (classData: any) => void;
  onBajaAlumno: (student: any, classData: any) => void;
  onEliminarReagendacionAlumno: (student: any, classData: any) => void;
  onActualizarInscripcion: (
    student: any,
    classData: any,
    datos: { modalidad?: string; comentarioAlumno?: string }
  ) => Promise<void>;
}

export function ClassDetailsDialog({
  classData,
  isOpen,
  puedeEditar = true,
  onClose,
  onReagendar,
  onInscribirAlumno,
  onEliminarGrupo,
  onGuardarComentarioGrupo,
  onEliminarReagendacion,
  onBajaAlumno,
  onEliminarReagendacionAlumno,
  onActualizarInscripcion,
}: ClassDetailsDialogProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const teacherAvailable =
    classData?.teacher?.available !== undefined
      ? classData.teacher.available
      : false;

  const profesorRequiereAtencion =
    !classData?.teacher?.name || classData?.profesorActivo === false;

  const esReagendada = Boolean(classData?.tipoReagendacionClase);
  const [notaClaseHtml, setNotaClaseHtml] = useState('');
  const [notaClaseInicial, setNotaClaseInicial] = useState('');
  const [notaClaseCargada, setNotaClaseCargada] = useState(false);
  const [guardandoComentario, setGuardandoComentario] = useState(false);
  const [comentariosPorAlumno, setComentariosPorAlumno] = useState<
    Record<string, string>
  >({});
  const [guardandoComentarioAlumno, setGuardandoComentarioAlumno] = useState<
    string | null
  >(null);
  const [cambiandoModalidadAlumno, setCambiandoModalidadAlumno] = useState<
    string | null
  >(null);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState('');
  const [reasignandoProfesor, setReasignandoProfesor] = useState(false);
  const [cursos, setCursos] = useState<any[]>([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState('');
  const [reasignandoCurso, setReasignandoCurso] = useState(false);
  const [diaClase, setDiaClase] = useState('');
  const [horaClase, setHoraClase] = useState('');
  const [duracionClase, setDuracionClase] = useState('2 horas');
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const colaWhatsApp = useColaWhatsApp();

  useEffect(() => {
    if (!isOpen || !classData?.idGrupo || !classData?.date) {
      setNotaClaseHtml('');
      setNotaClaseCargada(false);
      return;
    }

    const fecha = fechaClaseClave(classData.date);
    let cancelado = false;
    setNotaClaseCargada(false);

    getNotaClaseSesion(classData.idGrupo, fecha)
      .then((data) => {
        if (cancelado) return;
        const html = sanitizarNotaHtml(data?.notaHtml || '');
        setNotaClaseHtml(html);
        setNotaClaseInicial(html);
        setNotaClaseCargada(true);
      })
      .catch(() => {
        if (cancelado) return;
        setNotaClaseHtml('');
        setNotaClaseInicial('');
        setNotaClaseCargada(true);
      });

    return () => {
      cancelado = true;
    };
  }, [isOpen, classData?.idGrupo, classData?.date, classData?.notaClase]);

  useEffect(() => {
    if (isOpen) {
      const inicial: Record<string, string> = {};
      for (const student of classData?.students || []) {
        if (student?.idAlumno) {
          inicial[student.idAlumno] = student.comentarioAlumno || '';
        }
      }
      setComentariosPorAlumno(inicial);
      setProfesorSeleccionado(classData?.idProfesor || '');
      setCursoSeleccionado(classData?.idCurso || '');
      setDiaClase(
        classData?.diaClase ||
          (classData?.date ? diaDesdeFecha(classData.date) : '')
      );
      setHoraClase(classData?.startTime || '');
      setDuracionClase(classData?.duracion || '2 horas');
    }
  }, [classData?.id, classData?.students, classData?.idProfesor, classData?.idCurso, classData?.diaClase, classData?.startTime, classData?.duracion, classData?.date, isOpen]);

  // Cargar catálogos activos (solo para reasignar, no en reagendadas)
  useEffect(() => {
    if (!isOpen || !puedeEditar || esReagendada) return;
    let cancelado = false;
    const soloActivos = (data: any[]) =>
      (data || []).filter(
        (x) => String(x.estatus || 'Activo').toLowerCase() === 'activo'
      );
    getProfesores()
      .then((data: any[]) => {
        if (!cancelado) setProfesores(soloActivos(data));
      })
      .catch(() => setProfesores([]));
    getCursos()
      .then((data: any[]) => {
        if (!cancelado) setCursos(soloActivos(data));
      })
      .catch(() => setCursos([]));
    return () => {
      cancelado = true;
    };
  }, [isOpen, puedeEditar, esReagendada]);

  const handleReasignarProfesor = async () => {
    const idGrupo = classData?.idGrupo;
    if (!idGrupo) return;
    const profesorAnterior = String(classData?.idProfesor || '').trim();
    setReasignandoProfesor(true);
    try {
      await reasignarProfesorGrupo(idGrupo, profesorSeleccionado);
      toast.success(
        profesorSeleccionado
          ? 'Profesor asignado correctamente'
          : 'Grupo dejado sin profesor asignado'
      );

      const profesorNuevo = String(profesorSeleccionado || '').trim();
      if (profesorNuevo && profesorNuevo !== profesorAnterior) {
        const profDb = profesores.find(
          (p) => String(p.idProfesor || '').trim() === profesorNuevo
        );
        const contacto = normalizarProfesorContacto(profDb);
        const aviso = avisoGrupoAsignacionCurso(contacto, {
          nombreCurso: classData?.title || classData?.nombreCurso || '',
          idGrupo,
          diaClase:
            classData?.diaClase ||
            (classData?.date ? diaDesdeFecha(classData.date) : ''),
          horaClase: classData?.startTime || '',
        });
        if (aviso) {
          colaWhatsApp.iniciar([aviso], () => onClose());
          return;
        }
      }

      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al asignar el profesor');
    } finally {
      setReasignandoProfesor(false);
    }
  };

  const handleReasignarCurso = async () => {
    const idGrupo = classData?.idGrupo;
    if (!idGrupo || !cursoSeleccionado) return;
    setReasignandoCurso(true);
    try {
      await reasignarCursoGrupo(idGrupo, cursoSeleccionado);
      toast.success('Curso asignado correctamente');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al asignar el curso');
    } finally {
      setReasignandoCurso(false);
    }
  };

  const handleGuardarHorario = async () => {
    const idGrupo = classData?.idGrupo;
    if (!idGrupo || !diaClase || !horaClase) return;

    setGuardandoHorario(true);
    try {
      await actualizarHorarioGrupo(idGrupo, {
        diaClase,
        horaClase,
        duracionClase,
      });
      toast.success('Horario del grupo actualizado en el calendario');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el horario');
    } finally {
      setGuardandoHorario(false);
    }
  };

  const horarioSinCambios =
    diaClase ===
      (classData?.diaClase ||
        (classData?.date ? diaDesdeFecha(classData.date) : '')) &&
    horaClase === (classData?.startTime || '') &&
    duracionClase === (classData?.duracion || '2 horas');

  const horaFinPreview =
    horaClase && calcularHoraFinDesdeDuracion(horaClase, duracionClase);

  const grupoIdInscripcionDe = (student: any) =>
    resolverGrupoIdInscripcion(student, classData);

  const handleCambiarModalidad = async (
    student: any,
    modalidad: 'Presencial' | 'Virtual'
  ) => {
    const grupoId = grupoIdInscripcionDe(student);
    if (!student?.idAlumno || !grupoId) return;
    if (student.modalidad === modalidad) return;

    try {
      setCambiandoModalidadAlumno(student.idAlumno);
      await onActualizarInscripcion(student, classData, { modalidad });
    } finally {
      setCambiandoModalidadAlumno(null);
    }
  };

  const handleGuardarComentarioAlumno = async (student: any) => {
    const grupoId = grupoIdInscripcionDe(student);
    if (!student?.idAlumno || !grupoId) return;

    const comentarioAlumno = comentariosPorAlumno[student.idAlumno] ?? '';
    const guardado = String(student.comentarioAlumno || '').trim();

    if (comentarioAlumno.trim() === guardado) return;

    try {
      setGuardandoComentarioAlumno(student.idAlumno);
      await onActualizarInscripcion(student, classData, { comentarioAlumno });
    } finally {
      setGuardandoComentarioAlumno(null);
    }
  };

  const handleGuardarComentarioGrupo = async () => {
    try {
      setGuardandoComentario(true);
      await onGuardarComentarioGrupo(classData, notaClaseHtml);
      setNotaClaseInicial(sanitizarNotaHtml(notaClaseHtml));
    } finally {
      setGuardandoComentario(false);
    }
  };

  const notaClaseSinCambios =
    !notaClaseCargada ||
    sanitizarNotaHtml(notaClaseHtml) === sanitizarNotaHtml(notaClaseInicial);

  return (
    <>
      <WhatsAppColaHost {...colaWhatsApp} />
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[98vw] !max-w-[1120px] rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                {classData.title}
              </DialogTitle>
              <DialogDescription className="mt-2">
                Detalles completos de la clase programada
              </DialogDescription>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {classData.tipoReagendacionClase === 'origen' && (
                  <Badge className="bg-yellow-400 text-yellow-900 rounded-lg">
                    RP
                  </Badge>
                )}

                {classData.tipoReagendacionClase === 'destino' && (
                  <Badge className="bg-sky-300 text-sky-900 rounded-lg">
                    RP
                  </Badge>
                )}
              </div>

              {puedeEditar && !esReagendada && (
                <>
                  <button
                    onClick={() => onInscribirAlumno(classData)}
                    className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 rounded-lg w-full transition-colors"
                  >
                    Inscribir alumno
                  </button>

                  <button
                    onClick={() => onEliminarGrupo(classData)}
                    className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 rounded-lg w-full transition-colors"
                  >
                    Eliminar grupo
                  </button>
                </>
              )}

            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <Card className="p-4 bg-gray-50 rounded-lg border-none">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-cyan-500 shrink-0" />
                <div>
                  <div className="text-xs text-gray-500">Fecha de esta clase</div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(classData.date)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-cyan-500 shrink-0" />
                <div>
                  <div className="text-xs text-gray-500">Horario actual</div>
                  <div className="text-sm font-medium text-gray-900">
                    {classData.startTime} - {classData.endTime}
                  </div>
                </div>
              </div>
            </div>

            {puedeEditar && !esReagendada && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="mb-3 text-xs font-semibold text-gray-500">
                  Cambiar día, hora y duración del grupo (se actualiza en todo el calendario)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Día de clase
                    </label>
                    <select
                      value={diaClase}
                      onChange={(e) => setDiaClase(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-cyan-300"
                    >
                      <option value="">Selecciona día</option>
                      {DIAS_CLASE.map((dia) => (
                        <option key={dia} value={dia}>
                          {dia}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Hora de inicio
                    </label>
                    <input
                      type="time"
                      value={horaClase}
                      onChange={(e) => setHoraClase(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-cyan-300"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Duración
                    </label>
                    <select
                      value={duracionClase}
                      onChange={(e) => setDuracionClase(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-cyan-300"
                    >
                      {DURACIONES_CLASE.map((duracion) => (
                        <option key={duracion.value} value={duracion.value}>
                          {duracion.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    {horaFinPreview ? (
                      <p className="text-xs text-gray-500">
                        Termina: <span className="font-semibold text-gray-800">{horaFinPreview}</span>
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleGuardarHorario}
                      disabled={
                        guardandoHorario ||
                        !diaClase ||
                        !horaClase ||
                        !duracionClase ||
                        horarioSinCambios
                      }
                      className={`h-10 w-full rounded-lg px-4 text-sm font-medium transition-colors ${
                        guardandoHorario ||
                        !diaClase ||
                        !horaClase ||
                        !duracionClase ||
                        horarioSinCambios
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-cyan-600 text-white hover:bg-cyan-700'
                      }`}
                    >
                      {guardandoHorario ? 'Guardando...' : 'Guardar horario'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-5 w-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">Curso</h3>
            </div>

            <Card
              className={`p-4 rounded-lg ${
                classData.cursoActivo === false
                  ? 'border border-orange-200 bg-orange-50'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`font-medium ${
                    classData.cursoActivo === false
                      ? 'text-orange-700'
                      : 'text-gray-900'
                  }`}
                >
                  {classData.title || 'Sin curso asignado'}
                </div>

                {classData.cursoActivo === false && (
                  <Badge className="rounded-lg bg-orange-600 text-white">
                    {classData.title &&
                    classData.title !== 'Sin curso asignado'
                      ? 'Curso inactivo'
                      : 'Requiere curso'}
                  </Badge>
                )}
              </div>

              {puedeEditar && !esReagendada && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs font-semibold text-gray-500">
                    Cambiar curso
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={cursoSeleccionado}
                      onChange={(e) => setCursoSeleccionado(e.target.value)}
                      className="h-10 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-cyan-300 focus:bg-white"
                    >
                      <option value="">Selecciona un curso</option>
                      {cursos.map((curso) => (
                        <option key={curso.idCurso} value={curso.idCurso}>
                          {curso.nombreCurso}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleReasignarCurso}
                      disabled={
                        reasignandoCurso ||
                        !cursoSeleccionado ||
                        cursoSeleccionado === (classData?.idCurso || '')
                      }
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        reasignandoCurso ||
                        !cursoSeleccionado ||
                        cursoSeleccionado === (classData?.idCurso || '')
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-cyan-600 text-white hover:bg-cyan-700'
                      }`}
                    >
                      {reasignandoCurso ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <StickyNote className="h-5 w-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">Nota de esta clase</h3>
              {classData?.date ? (
                <span className="text-xs text-gray-400">
                  ({fechaClaseClave(classData.date)})
                </span>
              ) : null}
            </div>

            <Card className="p-4 rounded-lg">
              {!notaClaseCargada ? (
                <p className="text-sm text-gray-400">Cargando nota…</p>
              ) : puedeEditar ? (
                <>
                  <NotaRichTextEditor
                    value={notaClaseHtml}
                    onChange={setNotaClaseHtml}
                    placeholder="Agrega una nota solo para esta fecha (negrita, colores, viñetas…)"
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleGuardarComentarioGrupo}
                      disabled={guardandoComentario || notaClaseSinCambios}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        guardandoComentario || notaClaseSinCambios
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
                      }`}
                    >
                      {guardandoComentario ? 'Guardando...' : 'Guardar nota'}
                    </button>
                  </div>
                </>
              ) : (
                <NotaRichTextEditor
                  value={notaClaseHtml}
                  onChange={() => {}}
                  readOnly
                />
              )}
            </Card>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <User className="h-5 w-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">Profesor Asignado</h3>
            </div>

            <Card
              className={`p-4 rounded-lg ${
                profesorRequiereAtencion ? 'border border-red-200 bg-red-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className={`font-medium ${
                      profesorRequiereAtencion ? 'text-red-700' : 'text-gray-900'
                    }`}
                  >
                    {classData.teacher?.name || 'Sin profesor asignado'}
                  </div>
                  <div className="text-sm text-gray-500">
                    {classData.teacher?.email || ''}
                  </div>
                </div>

                {!classData.teacher?.name ? (
                  <Badge className="rounded-lg bg-red-600 text-white">
                    Requiere asignación
                  </Badge>
                ) : classData.profesorActivo === false ? (
                  <Badge className="rounded-lg bg-red-600 text-white">
                    Profesor inactivo
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={`rounded-lg ${
                      teacherAvailable
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {teacherAvailable ? 'Disponible' : 'No disponible'}
                  </Badge>
                )}
              </div>

              {puedeEditar && !esReagendada && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs font-semibold text-gray-500">
                    {classData.teacher?.name
                      ? 'Cambiar profesor'
                      : 'Asignar profesor'}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={profesorSeleccionado}
                      onChange={(e) => setProfesorSeleccionado(e.target.value)}
                      className="h-10 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-cyan-300 focus:bg-white"
                    >
                      <option value="">Sin profesor asignado</option>
                      {profesores.map((prof) => (
                        <option key={prof.idProfesor} value={prof.idProfesor}>
                          {prof.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleReasignarProfesor}
                      disabled={
                        reasignandoProfesor ||
                        profesorSeleccionado === (classData?.idProfesor || '')
                      }
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        reasignandoProfesor ||
                        profesorSeleccionado === (classData?.idProfesor || '')
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-cyan-600 text-white hover:bg-cyan-700'
                      }`}
                    >
                      {reasignandoProfesor ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">Alumnos Matriculados</h3>
              <Badge variant="outline" className="rounded-lg">
                {classData.students?.length || 0}
              </Badge>
            </div>

            {classData.students && classData.students.length > 0 ? (
              <div className="space-y-3">
                {classData.students.map((student: any, index: number) => {
                  const puedeEditarInscripcion = Boolean(
                    puedeEditar && student.idAlumno && grupoIdInscripcionDe(student)
                  );
                  const comentarioEditado =
                    comentariosPorAlumno[student.idAlumno] ?? '';
                  const comentarioSinCambios =
                    comentarioEditado.trim() ===
                    String(student.comentarioAlumno || '').trim();
                  const modalidadActual = student.modalidad || 'Presencial';

                  return (
                  <Card key={student.idAlumno || index} className="p-4 rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">
                            {student.nombreAlumno || 'Sin nombre'}
                          </p>

                          {student.reagendacion?.tipo === 'origen' && (
                            <Badge className="bg-yellow-400 text-yellow-900 rounded-lg">
                              Reagendada (origen)
                            </Badge>
                          )}

                          {student.reagendacion?.tipo === 'destino' && (
                            <Badge className="bg-blue-400 text-blue-900 rounded-lg">
                              Reagendada (destino)
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-500">
                          {student.idAlumno || ''}
                        </p>

                        {puedeEditarInscripcion && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 mb-1.5">Modalidad</p>
                            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                              {(['Presencial', 'Virtual'] as const).map((opcion) => {
                                const activa = modalidadActual === opcion;
                                const cargando =
                                  cambiandoModalidadAlumno === student.idAlumno;

                                return (
                                  <button
                                    key={opcion}
                                    type="button"
                                    disabled={cargando}
                                    onClick={() =>
                                      handleCambiarModalidad(student, opcion)
                                    }
                                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                      activa
                                        ? opcion === 'Virtual'
                                          ? 'bg-purple-600 text-white shadow-sm'
                                          : 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:bg-white'
                                    } ${cargando ? 'opacity-60 cursor-wait' : ''}`}
                                  >
                                    {opcion}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {puedeEditarInscripcion && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 mb-1.5">
                              Comentario de alumno
                            </p>
                            <textarea
                              value={comentarioEditado}
                              onChange={(event) =>
                                setComentariosPorAlumno((prev) => ({
                                  ...prev,
                                  [student.idAlumno]: event.target.value,
                                }))
                              }
                              rows={2}
                              placeholder="Notas del alumno en este curso (después de inscribir)"
                              className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-cyan-300 focus:bg-white"
                            />
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  handleGuardarComentarioAlumno(student)
                                }
                                disabled={
                                  guardandoComentarioAlumno ===
                                    student.idAlumno || comentarioSinCambios
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                  guardandoComentarioAlumno ===
                                    student.idAlumno || comentarioSinCambios
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
                                }`}
                              >
                                {guardandoComentarioAlumno === student.idAlumno
                                  ? 'Guardando...'
                                  : 'Guardar comentario'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Vista de solo lectura (perfil profesor): modalidad y notas */}
                        {!puedeEditar && student.idAlumno && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Modalidad:</span>
                              <Badge
                                variant="outline"
                                className={`rounded-lg ${
                                  modalidadActual === 'Virtual'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {modalidadActual}
                              </Badge>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500 mb-1">
                                Comentario de alumno
                              </p>
                              {String(student.comentarioAlumno || '').trim() ? (
                                <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-2.5 text-sm text-gray-700">
                                  {student.comentarioAlumno}
                                </p>
                              ) : (
                                <p className="text-sm italic text-gray-400">
                                  Sin comentario de alumno
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {student.reagendacion?.texto && (
                          <p className="text-sm text-gray-500 mt-1">
                            {student.reagendacion.texto}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        {/* Reprogramar: solo en clases fijas y si el alumno no tiene reagendación */}
                        {puedeEditar && !student.reagendacion &&
                          classData.tipoReagendacionClase !== 'destino' && (
                          <button
                            onClick={() => onReagendar(student)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors"
                            title="Reprogramar alumno"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">Reprogramar</span>
                          </button>
                        )}

                        {/* Inactivar: solo clases fijas (no clases reagendadas destino) */}
                        {puedeEditar &&
                          classData.tipoReagendacionClase !== 'destino' &&
                          student.reagendacion?.tipo !== 'destino' && (
                          <button
                            onClick={() => onBajaAlumno(student, classData)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                            title="Inactivar al alumno en este grupo"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Inactivar en grupo</span>
                          </button>
                        )}

                        {/* Clase reagendada (destino): quitar reprogramación temporal */}
                        {puedeEditar &&
                          (classData.tipoReagendacionClase === 'destino' ||
                          student.reagendacion?.tipo === 'destino') && (
                          <button
                            onClick={() =>
                              onEliminarReagendacionAlumno(student, classData)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                            title="Eliminar esta reagendación temporal"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">Quitar reagendación</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No hay alumnos inscritos.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
