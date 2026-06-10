import { useCallback, useEffect, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Plus,
    UserRound,
    Users,
    AlertTriangle,
    GraduationCap,
    BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ClassDetailsDialog } from './ClassDetailsDialog';
import {
    actualizarNotaClaseSesion,
    actualizarInscripcionAlumno,
    bajaAlumnoDeGrupo,
    eliminarGrupo,
    eliminarReagendacion,
    eliminarReagendacionAlumno,
    getCalendario,
} from '../../services/api';
import { toast } from 'sonner';
import { useSyncDataReload } from '../../utils/dataSync';
import { esAdmin, esProfesor, getUsuario } from '../../utils/auth';
import { resolverGrupoIdInscripcion } from '../../utils/grupoInscripcion';
import { calcularHoraFinDesdeDuracion } from '../../utils/duracionClase';
import { fechaClaseClave, sanitizarNotaHtml } from '../../utils/notaClase';
import ReagendacionForm from './ReagendacionForm';
import InscripcionForm from './InscripcionForm';
import NuevoGrupoForm from './NuevoGrupoForm';
import { Navbar } from './Navbar'; 

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface StudentItem {
  idAlumno: string;
  nombreAlumno: string;
  modalidad?: string;
  comentarioAlumno?: string;
  inscripcionCreadaEn?: string | null;
  reagendacion?: {
    tipo: 'origen' | 'destino';
    texto: string;
    reagendacionId?: string;
  } | null;
}

interface CalendarClass {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  diaClase?: string;
  duracion?: string;
  teacher: {
    name: string;
    email: string;
  };
  students: StudentItem[];
  color: string;
  status: 'scheduled' | 'rescheduled-origin' | 'rescheduled-destination';
  tipoReagendacionClase?: 'origen' | 'destino' | null;
  esReagendacion?: boolean;
  reagendacionId?: string;
  reagendacionIds?: string[];
  fechaHoraOriginal?: string;
  fechaHoraNueva?: string;
  fechaEspecifica?: string;
  idGrupo?: string;
  idProfesor?: string;
  profesorActivo?: boolean;
  idCurso?: string;
  cursoActivo?: boolean;
  comentarioGrupo?: string;
  notaClase?: string;
}

function normalizar(valor: string) {
    return String(valor || '').trim().toUpperCase();
}

function obtenerFechasDelDiaEnMes(diaClase: string, year: number, month: number) {
    const diasMap: Record<string, number> = {
        Domingo: 0, Dom: 0, domingo: 0,
        Lunes: 1, Lun: 1, lunes: 1,
        Martes: 2, Mar: 2, martes: 2,
        Miércoles: 3, Miercoles: 3, Mié: 3, miércoles: 3, miercoles: 3,
        Jueves: 4, Jue: 4, jueves: 4,
        Viernes: 5, Vie: 5, viernes: 5,
        Sábado: 6, Sabado: 6, Sáb: 6, sábado: 6, sabado: 6,
    };

    const targetDay = diasMap[diaClase];
    if (targetDay === undefined) return [];

    const fechas: Date[] = [];
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= lastDay; day++) {
        const fecha = new Date(year, month, day);
        if (fecha.getDay() === targetDay) {
            fechas.push(fecha);
        }
    }
    return fechas;
}

// Paleta alineada al logo de Goku Lab
// y tonos hermanos. Colores alegres pero no fluorescentes; texto blanco encima.
const PALETA_GOKU: Array<[number, number, number]> = [
    [205, 72, 48], // Azul Goku
    [192, 68, 44], // Cian
    [133, 52, 42], // Verde Goku
    [42, 80, 48], // Ámbar
    [6, 68, 54], // Rojo / coral
    [172, 55, 40], // Teal
    [222, 58, 56], // Índigo
    [96, 46, 42], // Verde lima
    [26, 76, 50], // Naranja
    [200, 70, 54], // Azul cielo
    [160, 52, 42], // Verde menta
    [48, 70, 44], // Mostaza
    [262, 40, 58], // Morado suave
    [145, 48, 36], // Verde bosque
    [218, 64, 50], // Azul marino
    [330, 48, 56], // Frambuesa suave
];

function obtenerColorPorCurso(curso: string) {
    const nombre = String(curso || '').trim();
    if (!nombre) return 'hsl(215, 16%, 55%)';

    // Colores fijos por curso (coincidencia por palabra clave, ignora acentos)
    const clave = nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (clave.includes('robotica')) return 'hsl(2, 72%, 52%)'; // rojo
    if (clave.includes('matematica')) return 'hsl(205, 72%, 48%)'; // azul
    if (clave.includes('programacion visual')) return 'hsl(26, 82%, 52%)'; // naranja
    if (clave.includes('diseno grafico')) return 'hsl(45, 90%, 50%)'; // amarillo

    // Hash estable a partir del nombre del curso
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) {
        hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
    }

    const [h, s, l] = PALETA_GOKU[hash % PALETA_GOKU.length];

    // Para cursos que repiten color de la paleta, variamos un poco la tonalidad
    // (más claro / más oscuro) sin salirnos del rango legible con texto blanco.
    const variante = Math.floor(hash / PALETA_GOKU.length) % 3; // 0, 1, 2
    const ajuste = variante === 1 ? -7 : variante === 2 ? 7 : 0;
    const lightness = Math.max(36, Math.min(60, l + ajuste));

    return `hsl(${h}, ${s}%, ${lightness}%)`;
}

function parseFechaFlexible(valor: string) {
    if (!valor) return null;
    const directa = new Date(valor);
    if (!isNaN(directa.getTime())) return directa;

    const matchRaro = String(valor).match(/([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}).*?(\d{1,2}:\d{2})$/);
    if (matchRaro) {
        const fechaTexto = matchRaro[1];
        const horaTexto = matchRaro[2];
        const base = new Date(fechaTexto);
        if (!isNaN(base.getTime())) {
            const [h, m] = horaTexto.split(':').map(Number);
            base.setHours(h, m, 0, 0);
            return base;
        }
    }

    const matchSql = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (matchSql) {
        const [, y, mo, d, h, mi] = matchSql;
        return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
    }
    return null;
}

function soloFecha(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function obtenerHoraDesdeFecha(valor: string) {
    const fecha = parseFechaFlexible(valor);
    if (!fecha) return '';
    return `${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
}

function horaAMinutos(hora: string) {
    if (!hora) return 9999;
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

export function Dashboard() {
    const [classes, setClasses] = useState<CalendarClass[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentDate, setCurrentDate] = useState(() => {
        const hoy = new Date();
        return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
    const [view, setView] = useState<'month' | 'week' | 'day'>('month');
    const [selectedClass, setSelectedClass] = useState<CalendarClass | null>(null);
    const [reagendacionData, setReagendacionData] = useState<any>(null);
    const [showReagendacion, setShowReagendacion] = useState(false);
    const [inscripcionClass, setInscripcionClass] = useState<CalendarClass | null>(null);
    const [showInscripcion, setShowInscripcion] = useState(false);
    const [showNuevoGrupo, setShowNuevoGrupo] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const puedeEditar = esAdmin();
    const esVistaProfesor = esProfesor();
    const nombreProfesorSesion = getUsuario()?.nombreCompleto || '';
    const navigate = useNavigate();

    const recargarCalendario = useCallback(() => {
        setReloadKey((prev) => prev + 1);
    }, []);

    useSyncDataReload(recargarCalendario);

    const handleReagendar = (student: any) => {
        setReagendacionData({ alumno: student, clase: selectedClass });
        setShowReagendacion(true);
        setIsDialogOpen(false);
    };

  const handleInscribirAlumno = (classData: CalendarClass) => {
    setInscripcionClass(classData);
    setShowInscripcion(true);
    setIsDialogOpen(false);
  };

  const handleEliminarReagendacion = async (classData: CalendarClass) => {
    try {
      const idsAEliminar = Array.from(
        new Set(
          [
            ...(classData.reagendacionIds || []),
            classData.reagendacionId,
          ].filter(Boolean) as string[]
        )
      );

      if (idsAEliminar.length === 0) {
        alert('No se encontró la reagendación a eliminar');
        return;
      }

      const confirmado = window.confirm(
        `¿Seguro que deseas eliminar esta reagendación de "${classData.title}"?`
      );

      if (!confirmado) return;

      await Promise.all(idsAEliminar.map((id) => eliminarReagendacion(id)));
      toast.success('Reagendación eliminada correctamente');
      setIsDialogOpen(false);
      setSelectedClass(null);
      recargarCalendario();
    } catch (error: any) {
      console.error('Error al eliminar reagendación:', error);
      toast.error(error.message || 'Error al eliminar reagendación');
    }
  };

    const handleBajaAlumno = async (student: any, classData: CalendarClass) => {
        try {
            const idAlumno = student?.idAlumno;
            const grupoId = resolverGrupoIdInscripcion(student, classData);
            if (!idAlumno || !grupoId) {
                alert('No se encontró el alumno o el grupo de inscripción');
                return;
            }
            const confirmado = window.confirm(
                `¿Inactivar a ${student.nombreAlumno} en este grupo?\n\nDeja de aparecer en el calendario. Solo se permitirá si no tiene pagos pendientes.`
            );
            if (!confirmado) return;

      const respuesta = await bajaAlumnoDeGrupo(idAlumno, grupoId);
      toast.success(respuesta?.mensaje || 'Alumno dado de baja correctamente');
      setIsDialogOpen(false);
      setSelectedClass(null);
      recargarCalendario();
    } catch (error: any) {
      console.error('Error al dar de baja al alumno:', error);
      toast.error(error.message || 'Error al dar de baja al alumno');
    }
  };

    const handleEliminarReagendacionAlumno = async (student: any, classData: CalendarClass) => {
        try {
            const idAlumno = student?.idAlumno;
            const idGrupoNuevo = classData?.idGrupo;
            if (!idAlumno || !idGrupoNuevo) {
                alert('No se encontró la información necesaria');
                return;
            }
            const confirmado = window.confirm(`¿Seguro que deseas eliminar la reagendación de ${student.nombreAlumno}? Se mantendrá inscrito en su grupo original.`);
            if (!confirmado) return;

            await eliminarReagendacionAlumno(idAlumno, idGrupoNuevo);
            toast.success('Reagendación eliminada correctamente');
            setIsDialogOpen(false);
            setSelectedClass(null);
            recargarCalendario();
        } catch (error: any) {
            console.error('Error al eliminar reagendación:', error);
            toast.error(error.message || 'Error al eliminar reagendación');
        }
    };

    const handleEliminarGrupo = async (classData: CalendarClass) => {
        try {
            const grupoId = classData?.idGrupo;
            if (!grupoId) {
                alert('No se encontró el grupo');
                return;
            }
            const confirmado = window.confirm(
                `¿Seguro que deseas eliminar el grupo "${classData.title}"?\n\n` +
                    "Solo se puede eliminar si no quedan alumnos activos en ese grupo. " +
                    "Si un alumno tiene otros cursos, inactívalo solo en este grupo: sigue en el sistema."
            );
            if (!confirmado) return;

            await eliminarGrupo(grupoId);
            toast.success('Grupo eliminado correctamente');
            setIsDialogOpen(false);
            setSelectedClass(null);
            recargarCalendario();
        } catch (error: any) {
            console.error('Error al eliminar grupo:', error);
            toast.error(error.message || 'Error al eliminar grupo');
        }
    };

    const actualizarAlumnoEnClases = (
        idAlumno: string,
        grupoIdInscripcion: string,
        cambios: { modalidad?: string; comentarioAlumno?: string }
    ) => {
        const aplicar = (students: any[]) =>
            students.map((alumno) => {
                if (alumno.idAlumno !== idAlumno) return alumno;
                const grupoAlumno =
                    alumno.grupoIdInscripcion || grupoIdInscripcion;
                if (
                    normalizar(grupoAlumno) !== normalizar(grupoIdInscripcion)
                ) {
                    return alumno;
                }
                return {
                    ...alumno,
                    ...(cambios.modalidad !== undefined
                        ? { modalidad: cambios.modalidad }
                        : {}),
                    ...(cambios.comentarioAlumno !== undefined
                        ? { comentarioAlumno: cambios.comentarioAlumno }
                        : {}),
                };
            });

        setClasses((prev) =>
            prev.map((cls) => ({
                ...cls,
                students: aplicar(cls.students || []),
            }))
        );

        setSelectedClass((prev) =>
            prev
                ? {
                      ...prev,
                      students: aplicar(prev.students || []),
                  }
                : prev
        );
    };

    const handleActualizarInscripcion = async (
        student: any,
        classData: CalendarClass,
        datos: { modalidad?: string; comentarioAlumno?: string }
    ) => {
        const idGrupoClase = String(classData.idGrupo || '');
        const esGrupoVirtual = idGrupoClase.toUpperCase().startsWith('VIRTUAL_');
        const grupoId =
            student.grupoIdInscripcion ||
            (classData as any).idGrupoOrigen ||
            (esGrupoVirtual ? '' : idGrupoClase);

        if (!student.idAlumno || !grupoId) {
            toast.error(
                'No se encontró el grupo de inscripción. Recarga el calendario e intenta de nuevo.'
            );
            return;
        }

        try {
            const respuesta = await actualizarInscripcionAlumno(
                student.idAlumno,
                grupoId,
                datos
            );

            const inscripcion = respuesta?.inscripcion || {};
            actualizarAlumnoEnClases(student.idAlumno, grupoId, {
                modalidad: inscripcion.modalidad ?? datos.modalidad,
                comentarioAlumno:
                    inscripcion.comentarioAlumno ?? datos.comentarioAlumno,
            });

            if (datos.modalidad) {
                toast.success(`Modalidad actualizada a ${datos.modalidad}`);
            } else {
                toast.success('Comentario de alumno guardado');
            }
        } catch (error: any) {
            console.error('Error al actualizar inscripción:', error);
            toast.error(error.message || 'Error al actualizar inscripción');
            throw error;
        }
    };

    const handleGuardarComentarioGrupo = async (
        classData: CalendarClass,
        notaHtml: string
    ) => {
        try {
            const grupoId = classData?.idGrupo;
            const fecha = classData?.date ? fechaClaseClave(classData.date) : '';
            if (!grupoId || !fecha) {
                toast.error('No se encontró la clase para guardar la nota');
                return;
            }

            const notaGuardada = sanitizarNotaHtml(
                (await actualizarNotaClaseSesion(grupoId, fecha, notaHtml))?.nota
                    ?.notaHtml ?? notaHtml
            );

            const mismaSesion = (cls: CalendarClass) =>
                normalizar(cls.idGrupo || '') === normalizar(grupoId) &&
                fechaClaseClave(cls.date) === fecha;

            setClasses((prev) =>
                prev.map((cls) =>
                    mismaSesion(cls) ? { ...cls, notaClase: notaGuardada } : cls
                )
            );

            setSelectedClass((prev) =>
                prev && mismaSesion(prev)
                    ? { ...prev, notaClase: notaGuardada }
                    : prev
            );

            toast.success('Nota de la clase guardada');
        } catch (error: any) {
            console.error('Error al guardar nota de la clase:', error);
            toast.error(error.message || 'Error al guardar la nota');
        }
    };

    useEffect(() => {
        const fetchCalendario = async () => {
            try {
                setLoading(true);
                setError('');
                const data = await getCalendario();
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const clasesBase = data.clasesBase || [];
                const reagendaciones = data.reagendaciones || [];

                // Generamos ocurrencias para el mes anterior, actual y siguiente,
                // así la vista de semana/día funciona correctamente en los bordes de mes.
                const ventanaMeses = [-1, 0, 1].map((delta) => {
                    const d = new Date(year, month + delta, 1);
                    return { y: d.getFullYear(), m: d.getMonth() };
                });
                const dentroDeVentana = (fecha: Date) =>
                    ventanaMeses.some(
                        (v) => fecha.getFullYear() === v.y && fecha.getMonth() === v.m
                    );

                const transformedBase: CalendarClass[] = clasesBase.reduce((acc: CalendarClass[], item: any) => {
                    if (!item.diaClase || !item.horaClase) return acc;
                    const fechas = ventanaMeses.flatMap((v) =>
                        obtenerFechasDelDiaEnMes(item.diaClase, v.y, v.m)
                    );

                    const eventos: CalendarClass[] = fechas
                        .filter((fecha) => {
                            if (item.fechaCreacion) {
                                const fechaCreacion = new Date(item.fechaCreacion);
                                const fechaEvento = new Date(fecha);
                                const soloFechaCreacion = new Date(fechaCreacion.getFullYear(), fechaCreacion.getMonth(), fechaCreacion.getDate());
                                const soloFechaEvento = new Date(fechaEvento.getFullYear(), fechaEvento.getMonth(), fechaEvento.getDate());
                                return soloFechaEvento >= soloFechaCreacion;
                            }
                            return true;
                        })
                        .map((fecha, index) => {
                            const fechaEvento = soloFecha(new Date(fecha));
                            const horaInicio = item.horaClase || '';
                            const horaFin =
                                item.horaFin ||
                                calcularHoraFinDesdeDuracion(horaInicio, item.duracion);

                            const studentsFiltrados = (item.alumnos || [])
                                .filter((alumno: any) => {
                                    const creada = alumno?.inscripcionCreadaEn ? new Date(alumno.inscripcionCreadaEn) : null;
                                    if (!creada || isNaN(creada.getTime())) return true;
                                    return fechaEvento.getTime() >= soloFecha(creada).getTime();
                                })
                                .map((alumno: any) => {
                                    if (!alumno.reagendacion) return { ...alumno, reagendacion: null };
                                    const reag = alumno.reagendacion;
                                    const fechaOriginal = reag.fechaHoraOriginal ? parseFechaFlexible(reag.fechaHoraOriginal) : null;
                                    const mismaFechaOriginal = reag.tipo === 'origen' && fechaOriginal && soloFecha(fechaOriginal).getTime() === fechaEvento.getTime();

                if (mismaFechaOriginal) {
                  const fechaNueva = reag.fechaHoraNueva
                    ? parseFechaFlexible(reag.fechaHoraNueva)
                    : null;

                  return {
                    ...alumno,
                    reagendacion: {
                      tipo: 'origen',
                      reagendacionId: reag.reagendacionId || '',
                      texto: fechaNueva
                        ? `Nuevo horario: ${fechaNueva.toLocaleDateString('es-MX', {
                            weekday: 'short',
                          })} ${
                            reag.horaClaseNueva ||
                            fechaNueva.toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })
                          }`
                        : '',
                    },
                  };
                }

                return { ...alumno, reagendacion: null };
              });

                            const tieneOrigen = studentsFiltrados.some((alumno: any) => alumno.reagendacion?.tipo === 'origen');

                            return {
                                id: `${item.idGrupo}-${index}`,
                                title: item.nombreCurso || 'Sin curso asignado',
                                date: fechaEvento,
                                startTime: horaInicio,
                                endTime: horaFin,
                                diaClase: item.diaClase || '',
                                duracion: item.duracion || '2 horas',
                                teacher: { name: item.nombreProfesor || '', email: '' },
                                students: studentsFiltrados,
                                color: obtenerColorPorCurso(item.nombreCurso),
                                status: tieneOrigen ? 'rescheduled-origin' : 'scheduled',
                                esReagendacion: false,
                                idGrupo: item.idGrupo || '',
                                idProfesor: item.idProfesor || '',
                                profesorActivo: item.profesorActivo !== false,
                                idCurso: item.idCurso || '',
                                cursoActivo: item.cursoActivo !== false,
                                comentarioGrupo: item.comentarioGrupo || item.comentario || '',
                                tipoReagendacionClase: tieneOrigen ? 'origen' : null,
                            };
                        });

                    return [...acc, ...eventos];
                }, []);

                const baseConDestinos: CalendarClass[] = transformedBase.map((item) => ({
                    ...item,
                    students: [...item.students],
                }));

                const transformedReagendaciones: CalendarClass[] = [];

                reagendaciones.forEach((r: any, index: number) => {
                    const fechaNuevaTexto = r.alumnos?.[0]?.reagendacion?.fechaHoraNueva || r.fechaHoraNueva || '';
                    const fechaNueva = parseFechaFlexible(fechaNuevaTexto);
                    if (!fechaNueva) return;
                    if (!dentroDeVentana(fechaNueva)) return;

                    const fechaSolo = soloFecha(fechaNueva);
                    const horaNueva = r.horaClase || obtenerHoraDesdeFecha(fechaNuevaTexto) || '00:00';
                    const horaFinReag =
                        r.horaFin ||
                        calcularHoraFinDesdeDuracion(horaNueva, r.duracion);

                    if (!r.esVirtual) {
                        const existente = baseConDestinos.find((cls) => {
                            return (
                                normalizar(cls.idGrupo || '') === normalizar(r.idGrupo || '') &&
                                soloFecha(new Date(cls.date)).getTime() === fechaSolo.getTime() &&
                                normalizar(cls.startTime) === normalizar(horaNueva)
                            );
                        });

                        if (existente) {
                            (r.alumnos || []).forEach((alumno: any) => {
                                const fechaOriginal = alumno.reagendacion?.fechaHoraOriginal
                                    ? parseFechaFlexible(alumno.reagendacion.fechaHoraOriginal)
                                    : null;

                                const yaExiste = existente.students.some(
                                    (s) =>
                                        normalizar(s.idAlumno) === normalizar(alumno.idAlumno) &&
                                        s.reagendacion?.tipo === 'destino'
                                );

                if (!yaExiste) {
                  existente.students.push({
                    idAlumno: alumno.idAlumno,
                    nombreAlumno: alumno.nombreAlumno,
                    modalidad: alumno.modalidad || 'Presencial',
                    comentarioAlumno: alumno.comentarioAlumno || '',
                    grupoIdInscripcion:
                      alumno.grupoIdInscripcion ||
                      r.idGrupoOrigen ||
                      '',
                    reagendacion: {
                      tipo: 'destino',
                      reagendacionId: alumno.reagendacion?.reagendacionId || '',
                      texto: fechaOriginal
                        ? `Viene de: ${fechaOriginal.toLocaleDateString('es-MX', {
                            weekday: 'short',
                          })} ${
                            alumno.reagendacion?.horaClaseOriginal ||
                            fechaOriginal.toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })
                          }`
                        : '',
                    },
                  });
                }
              });

              existente.tipoReagendacionClase = 'destino';
              existente.status = 'rescheduled-destination';
              const idsDestino = (r.reagendacionIds || r.alumnos || [])
                .map((item: any) =>
                  typeof item === 'string'
                    ? item
                    : item?.reagendacion?.reagendacionId
                )
                .filter(Boolean);
              existente.reagendacionIds = Array.from(
                new Set([...(existente.reagendacionIds || []), ...idsDestino])
              );
              existente.reagendacionId =
                existente.reagendacionId || existente.reagendacionIds[0] || '';
            }

            return;
          }

          const studentsDestino = (r.alumnos || []).map((alumno: any) => {
            const fechaOriginal = alumno.reagendacion?.fechaHoraOriginal
              ? parseFechaFlexible(alumno.reagendacion.fechaHoraOriginal)
              : null;

            return {
              idAlumno: alumno.idAlumno,
              nombreAlumno: alumno.nombreAlumno,
              modalidad: alumno.modalidad || 'Presencial',
              comentarioAlumno: alumno.comentarioAlumno || '',
              grupoIdInscripcion:
                alumno.grupoIdInscripcion ||
                r.idGrupoOrigen ||
                '',
              reagendacion: {
                tipo: 'destino' as const,
                reagendacionId: alumno.reagendacion?.reagendacionId || '',
                texto: fechaOriginal
                  ? `Viene de: ${fechaOriginal.toLocaleDateString('es-MX', {
                      weekday: 'short',
                    })} ${
                      alumno.reagendacion?.horaClaseOriginal ||
                      fechaOriginal.toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })
                    }`
                  : '',
              },
            };
          });

          transformedReagendaciones.push({
            id: `${r.idGrupo || 'virtual'}-${index}-${fechaNueva.getTime()}`,
            title: r.nombreCurso,
            date: fechaSolo,
            startTime: horaNueva,
            endTime: horaFinReag,
            teacher: {
              name: r.nombreProfesor || '',
              email: '',
            },
            students: studentsDestino,
            color: obtenerColorPorCurso(r.nombreCurso),
            status: 'rescheduled-destination',
            esReagendacion: true,
            idGrupo: r.idGrupo || '',
            idGrupoOrigen: r.idGrupoOrigen || '',
            idProfesor: r.idProfesor || '',
            comentarioGrupo: r.comentarioGrupo || r.comentario || '',
            reagendacionId: r.reagendacionId || r.reagendacionIds?.[0] || '',
            reagendacionIds: r.reagendacionIds || [],
            tipoReagendacionClase: 'destino',
          });
        });

                setClasses([...baseConDestinos, ...transformedReagendaciones]);
            } catch (err: any) {
                setError(err.message || 'Error al cargar calendario');
            } finally {
                setLoading(false);
            }
        };
        fetchCalendario();
    }, [currentDate, reloadKey]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            toast.success('Datos sincronizados correctamente desde CRM y KOMO');
        } catch {
            toast.error('Error al sincronizar datos');
        } finally {
            setIsSyncing(false);
        }
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (Date | null)[] = [];
        for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const getClassesForDate = (date: Date | null) => {
        if (!date) return [];
        return classes
            .filter((cls) => soloFecha(new Date(cls.date)).getTime() === soloFecha(new Date(date)).getTime())
            .sort((a, b) => horaAMinutos(a.startTime) - horaAMinutos(b.startTime));
    };

    const getInicioSemana = (date: Date) => {
        const inicio = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        inicio.setDate(inicio.getDate() - inicio.getDay()); // Domingo como inicio
        return inicio;
    };

    const getDiasSemana = (date: Date) => {
        const inicio = getInicioSemana(date);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(inicio);
            d.setDate(inicio.getDate() + i);
            return d;
        });
    };

    const handlePrev = () => {
        if (view === 'month') {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        } else if (view === 'week') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 7);
            setCurrentDate(d);
        } else {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 1);
            setCurrentDate(d);
        }
    };

    const handleNext = () => {
        if (view === 'month') {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        } else if (view === 'week') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 7);
            setCurrentDate(d);
        } else {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 1);
            setCurrentDate(d);
        }
    };

    const tituloVista = () => {
        if (view === 'month') {
            return (
                <>
                    {MONTHS[currentDate.getMonth()]}{' '}
                    <span className="text-cyan-600">{currentDate.getFullYear()}</span>
                </>
            );
        }
        if (view === 'week') {
            const dias = getDiasSemana(currentDate);
            const ini = dias[0];
            const fin = dias[6];
            const fmt = (d: Date) =>
                d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            return (
                <>
                    {fmt(ini)} - {fmt(fin)}{' '}
                    <span className="text-cyan-600">{fin.getFullYear()}</span>
                </>
            );
        }
        return (
            <>
                {currentDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}{' '}
                <span className="text-cyan-600">{currentDate.getFullYear()}</span>
            </>
        );
    };
    const handleClassClick = (cls: CalendarClass) => {
        setSelectedClass(cls);
        setIsDialogOpen(true);
    };

    const renderMonthView = () => {
        const days = getDaysInMonth(currentDate);
        return (
            <div className="grid grid-cols-7 gap-4 w-full">
                {DAYS.map((day) => (
                    <div key={day} className="p-4 text-center text-sm font-bold text-cyan-700 bg-cyan-50 rounded-lg">
                        {day}
                    </div>
                ))}

                {days.map((day, index) => {
                    const dayClasses = getClassesForDate(day);
                    const isToday = day && day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth() && day.getFullYear() === new Date().getFullYear();

                    return (
                        <div
                            key={index}
                            className={`min-h-[220px] p-4 border-2 rounded-xl overflow-y-auto transition-all shadow-sm hover:shadow-md ${!day ? 'bg-gray-100 border-gray-200' : isToday ? 'bg-gradient-to-br from-cyan-100 to-blue-50 border-cyan-400 shadow-md ring-2 ring-cyan-300' : 'bg-white border-gray-200 hover:border-cyan-300 hover:bg-cyan-50'
                                }`}
                        >
                            {day && (
                                <>
                                    <div className={`text-lg font-bold mb-3 px-2 py-1 rounded-lg inline-block ${isToday ? 'bg-cyan-500 text-white' : 'text-gray-700 bg-gray-100'}`}>
                                        {day.getDate()}
                                    </div>

                                    <div className="space-y-2">
                                        {dayClasses.map((cls) => (
                                            <button
                                                key={cls.id}
                                                onClick={() => handleClassClick(cls)}
                                                className={`w-full text-left p-2 rounded-lg text-xs text-white hover:opacity-85 transition-all relative shadow-md hover:shadow-lg transform hover:scale-105 ${cls.tipoReagendacionClase === 'origen' ? 'ring-2 ring-yellow-400 border-2 border-yellow-300' : cls.tipoReagendacionClase === 'destino' ? 'ring-2 ring-sky-300 border-2 border-sky-200' : ''
                                                    }`}
                                                style={{ backgroundColor: cls.color }}
                                                title={`${cls.title} - ${cls.startTime}`}
                                            >
                                                <div className="font-semibold truncate pr-7 text-sm leading-tight">{cls.title}</div>
                                                <div className="text-[11px] opacity-95 font-medium">{cls.startTime}</div>
                                                {cls.cursoActivo === false && (
                                                    <div className="mt-1 flex items-center gap-1 rounded bg-orange-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {cls.title && cls.title !== 'Sin curso asignado' ? 'Curso inactivo' : 'Sin curso'}
                                                    </div>
                                                )}
                                                {(!cls.teacher?.name || cls.profesorActivo === false) && (
                                                    <div className="mt-1 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Sin profesor
                                                    </div>
                                                )}
                                                {cls.tipoReagendacionClase === 'origen' && <div className="absolute top-1.5 right-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md">RP</div>}
                                                {cls.tipoReagendacionClase === 'destino' && <div className="absolute top-1.5 right-1.5 bg-sky-300 text-sky-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md">RP</div>}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderWeekView = () => {
        const dias = getDiasSemana(currentDate);
        const hoy = new Date();
        const esHoy = (d: Date) =>
            d.getDate() === hoy.getDate() &&
            d.getMonth() === hoy.getMonth() &&
            d.getFullYear() === hoy.getFullYear();

        return (
            <div className="grid grid-cols-7 gap-3 w-full">
                {dias.map((day, index) => {
                    const dayClasses = getClassesForDate(day);
                    const hoyFlag = esHoy(day);

                    return (
                        <div
                            key={index}
                            className={`min-h-[420px] p-3 border-2 rounded-xl overflow-y-auto transition-all shadow-sm hover:shadow-md ${
                                hoyFlag
                                    ? 'bg-gradient-to-br from-cyan-100 to-blue-50 border-cyan-400 ring-2 ring-cyan-300'
                                    : 'bg-white border-gray-200 hover:border-cyan-300'
                            }`}
                        >
                            <div className="mb-3 text-center">
                                <div className="text-xs font-bold uppercase text-cyan-700">
                                    {DAYS[day.getDay()]}
                                </div>
                                <div
                                    className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                                        hoyFlag ? 'bg-cyan-500 text-white' : 'text-gray-700 bg-gray-100'
                                    }`}
                                >
                                    {day.getDate()}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {dayClasses.length === 0 ? (
                                    <p className="text-center text-[11px] text-gray-300 italic mt-2">
                                        —
                                    </p>
                                ) : (
                                    dayClasses.map((cls) => (
                                        <button
                                            key={cls.id}
                                            onClick={() => handleClassClick(cls)}
                                            className={`w-full text-left p-2 rounded-lg text-xs text-white hover:opacity-85 transition-all relative shadow-md hover:shadow-lg ${
                                                cls.tipoReagendacionClase === 'origen'
                                                    ? 'ring-2 ring-yellow-400 border-2 border-yellow-300'
                                                    : cls.tipoReagendacionClase === 'destino'
                                                    ? 'ring-2 ring-sky-300 border-2 border-sky-200'
                                                    : ''
                                            }`}
                                            style={{ backgroundColor: cls.color }}
                                            title={`${cls.title} - ${cls.startTime}`}
                                        >
                                            <div className="font-semibold truncate pr-6 text-[13px] leading-tight">
                                                {cls.title}
                                            </div>
                                            <div className="text-[11px] opacity-95 font-medium">
                                                {cls.startTime} - {cls.endTime}
                                            </div>
                                            {cls.cursoActivo === false && (
                                                <div className="mt-1 flex items-center gap-1 rounded bg-orange-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    {cls.title && cls.title !== 'Sin curso asignado' ? 'Curso inactivo' : 'Sin curso'}
                                                </div>
                                            )}
                                            {(!cls.teacher?.name || cls.profesorActivo === false) && (
                                                <div className="mt-1 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Sin profesor
                                                </div>
                                            )}
                                            {cls.tipoReagendacionClase === 'origen' && <div className="absolute top-1 right-1 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1 py-0.5 rounded-full shadow-md">RP</div>}
                                            {cls.tipoReagendacionClase === 'destino' && <div className="absolute top-1 right-1 bg-sky-300 text-sky-900 text-[9px] font-bold px-1 py-0.5 rounded-full shadow-md">RP</div>}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderDayView = () => {
        const dayClasses = getClassesForDate(currentDate);
        const hours = Array.from({ length: 12 }, (_, i) => i + 8);
        const dayName = DAYS[currentDate.getDay()];

        return (
            <div className="space-y-1">
                <div className="bg-gradient-to-r from-cyan-100 to-blue-100 p-4 rounded-lg mb-4 border border-cyan-200">
                    <p className="text-sm text-cyan-700 font-semibold">
                        {dayName}, {currentDate.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>

                {hours.map((hour) => {
                    const hourString = `${hour.toString().padStart(2, '0')}:00`;
                    const hourClasses = dayClasses.filter((cls) => Number(cls.startTime.split(':')[0]) === hour);

                    return (
                        <div key={hour} className="flex border-l-4 border-cyan-300 bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-24 px-4 py-4 bg-gradient-to-b from-cyan-50 to-blue-50 text-sm text-gray-700 font-bold border-r border-gray-200 flex items-center justify-center flex-shrink-0">
                                {hourString}
                            </div>

                            <div className="flex-1 p-4 space-y-3">
                                {hourClasses.length > 0 ? (
                                    hourClasses.map((cls) => (
                                        <button
                                            key={cls.id}
                                            onClick={() => handleClassClick(cls)}
                                            className={`w-full text-left p-4 rounded-lg text-white hover:shadow-lg transition-all relative min-h-[100px] transform hover:scale-102 ${cls.tipoReagendacionClase === 'origen' ? 'ring-2 ring-yellow-400 shadow-md' : cls.tipoReagendacionClase === 'destino' ? 'ring-2 ring-sky-300 shadow-md' : 'shadow-md'
                                                }`}
                                            style={{ backgroundColor: cls.color }}
                                        >
                                            <div className="font-bold text-lg pr-8">{cls.title}</div>
                                            <div className="text-sm opacity-90 font-semibold">{cls.startTime} - {cls.endTime}</div>
                                            {cls.cursoActivo === false && (
                                                <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-orange-600/90 px-2 py-0.5 text-xs font-bold text-white">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    {cls.title && cls.title !== 'Sin curso asignado'
                                                        ? 'Curso inactivo'
                                                        : 'Sin curso asignado'}
                                                </div>
                                            )}
                                            {cls.teacher?.name && cls.profesorActivo !== false ? (
                                                <div className="mt-2 flex items-center gap-1.5 text-xs opacity-85">
                                                    <UserRound className="h-3.5 w-3.5" />
                                                    {cls.teacher.name}
                                                </div>
                                            ) : (
                                                <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-red-600/90 px-2 py-0.5 text-xs font-bold text-white">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    {cls.teacher?.name
                                                        ? 'Profesor inactivo'
                                                        : 'Sin profesor asignado'}
                                                </div>
                                            )}
                                            <div className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
                                                <Users className="h-3.5 w-3.5" />
                                                {cls.students.length} {cls.students.length === 1 ? 'alumno' : 'alumnos'}
                                            </div>
                                            {cls.tipoReagendacionClase === 'origen' && <div className="absolute top-3 right-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full shadow-sm">RP Origen</div>}
                                            {cls.tipoReagendacionClase === 'destino' && <div className="absolute top-3 right-3 bg-sky-300 text-sky-900 text-xs font-bold px-3 py-1 rounded-full shadow-sm">RP Destino</div>}
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-gray-400 text-sm italic py-2">Sin clases en este horario</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (loading) return <div className="p-6">Cargando calendario...</div>;
    if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">

            <Navbar />

            <header className="relative overflow-hidden border-b border-cyan-100 bg-[linear-gradient(120deg,#eefbff_0%,#d9f3ff_48%,#8fd6f3_100%)] px-6 py-5 shadow-sm">
                <div className="absolute right-10 top-0 h-24 w-24 rounded-full border-[18px] border-white/40" />

                <div className="relative mx-auto flex w-full max-w-none items-center justify-between gap-6 px-4 lg:px-10">
                    <div className="flex min-w-0 items-center gap-4">
                        <img
                            src="/logo-goku-lab.png"
                            alt="Goku Lab"
                            className="h-20 w-20 flex-shrink-0 object-contain drop-shadow-md"
                        />

                        <div className="min-w-0">
                            <h1 className="text-3xl font-black leading-none text-[#0078D7]">
                                Goku Lab
                            </h1>

                            <p className="mt-1 text-base font-black leading-tight">
                                <span className="text-[#FFC400]">Juega, </span>
                                <span className="text-[#EF2D2D]">Aprende </span>
                                <span className="text-[#0078D7]">y </span>
                                <span className="text-[#2FB34A]">Emprende</span>
                            </p>

                            <p className="mt-1 text-sm font-black text-[#003B73]">
                                {esVistaProfesor
                                    ? `Mis clases${nombreProfesorSesion ? ` · ${nombreProfesorSesion}` : ''}`
                                    : 'Sistema de Gestión Académica'}
                            </p>
                        </div>
                    </div>

                    {puedeEditar && (
                        <div className="flex flex-shrink-0 items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={() => navigate('/maestros')}
                                className="h-11 rounded-lg border-2 border-cyan-200 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm transition-colors hover:bg-cyan-50"
                            >
                                <GraduationCap className="mr-2 h-4 w-4" />
                                Maestros
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => navigate('/cursos')}
                                className="h-11 rounded-lg border-2 border-cyan-200 bg-white px-4 text-sm font-black text-cyan-700 shadow-sm transition-colors hover:bg-cyan-50"
                            >
                                <BookOpen className="mr-2 h-4 w-4" />
                                Cursos
                            </Button>

                            <Button
                                onClick={() => setShowNuevoGrupo(true)}
                                className="h-11 rounded-lg bg-[#0047B8] px-5 text-sm font-black text-white shadow-md shadow-blue-900/15 transition-colors hover:bg-[#003A96]"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Crear nuevo grupo
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            <main className="w-full max-w-none mx-auto px-10 py-8">
                <Card className="w-full p-8 mb-6 rounded-3xl shadow-xl border-2 border-cyan-100 bg-gradient-to-b from-white to-cyan-50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-6">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handlePrev}
                                className="rounded-lg border-2 border-cyan-300 hover:bg-cyan-100 hover:border-cyan-400 transition-all"
                            >
                                <ChevronLeft className="h-5 w-5 text-cyan-600" />
                            </Button>

                            <h2 className="text-4xl font-bold text-gray-900 min-w-fit capitalize">
                                {tituloVista()}
                            </h2>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleNext}
                                className="rounded-lg border-2 border-cyan-300 hover:bg-cyan-100 hover:border-cyan-400 transition-all"
                            >
                                <ChevronRight className="h-5 w-5 text-cyan-600" />
                            </Button>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant={view === 'month' ? 'default' : 'outline'}
                                onClick={() => setView('month')}
                                className={`rounded-lg font-semibold transition-all ${view === 'month' ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg' : 'border-2 border-cyan-200 hover:bg-cyan-50 text-gray-700'
                                    }`}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                Mes
                            </Button>

                            <Button
                                variant={view === 'week' ? 'default' : 'outline'}
                                onClick={() => setView('week')}
                                className={`rounded-lg font-semibold transition-all ${view === 'week' ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg' : 'border-2 border-cyan-200 hover:bg-cyan-50 text-gray-700'
                                    }`}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                Semana
                            </Button>

                            <Button
                                variant={view === 'day' ? 'default' : 'outline'}
                                onClick={() => setView('day')}
                                className={`rounded-lg font-semibold transition-all ${view === 'day' ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg' : 'border-2 border-cyan-200 hover:bg-cyan-50 text-gray-700'
                                    }`}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                Día
                            </Button>
                        </div>
                    </div>

                    {view === 'month'
                        ? renderMonthView()
                        : view === 'week'
                        ? renderWeekView()
                        : renderDayView()}
                </Card>

            </main>

            {selectedClass && (
                <ClassDetailsDialog
                    classData={selectedClass}
                    isOpen={isDialogOpen}
                    puedeEditar={puedeEditar}
                    onClose={() => setIsDialogOpen(false)}
                    onReagendar={handleReagendar}
                    onInscribirAlumno={handleInscribirAlumno}
                    onEliminarGrupo={handleEliminarGrupo}
                    onGuardarComentarioGrupo={handleGuardarComentarioGrupo}
                    onEliminarReagendacion={handleEliminarReagendacion}
                    onBajaAlumno={handleBajaAlumno}
                    onEliminarReagendacionAlumno={handleEliminarReagendacionAlumno}
                    onActualizarInscripcion={handleActualizarInscripcion}
                />
            )}

      {showReagendacion && reagendacionData && (
        <ReagendacionForm
          data={reagendacionData}
          onClose={() => setShowReagendacion(false)}
          onSuccess={() => {
            setShowReagendacion(false);
            setIsDialogOpen(false);
            recargarCalendario();
          }}
        />
      )}

            {showInscripcion && inscripcionClass && (
                <InscripcionForm
                    classData={inscripcionClass}
                    onClose={() => setShowInscripcion(false)}
                    onSuccess={() => {
                        setShowInscripcion(false);
                        setIsDialogOpen(false);
                        recargarCalendario();
                    }}
                />
            )}

      {showNuevoGrupo && (
        <NuevoGrupoForm
          onClose={() => setShowNuevoGrupo(false)}
          onSuccess={() => {
            setShowNuevoGrupo(false);
            recargarCalendario();
          }}
        />
      )}
    </div>
  );
}
