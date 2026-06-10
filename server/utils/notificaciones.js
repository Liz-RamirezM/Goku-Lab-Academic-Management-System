/**
 * Servicio de Notificaciones para Profesores
 * 
 * Maneja el envío de notificaciones cuando ocurren eventos importantes:
 * - Reagendación de clases de alumnos
 * - Cancelación de clases individuales
 * - Cambios en grupos
 */

import Reagendacion from "../models/Reagendacion.js";
import ClaseCancelada from "../models/ClaseCancelada.js";
import Profesor from "../models/Profesor.js";
import NotificacionProfesor from "../models/NotificacionProfesor.js";
import { generarId } from "./generarId.js";

/**
 * Notificar al profesor sobre una reagendación
 * Actualiza el documento y marca como notificado
 */
export async function notificarReagendacionProfesor(reagendacionId, idProfesor) {
  try {
    if (!reagendacionId || !idProfesor) {
      console.warn("notificarReagendacionProfesor: faltan parámetros", {
        reagendacionId,
        idProfesor,
      });
      return false;
    }

    const reagendacion = await Reagendacion.findOne({
      ReagendacionId: String(reagendacionId).trim(),
    });

    if (!reagendacion) {
      console.warn(`Reagendación no encontrada: ${reagendacionId}`);
      return false;
    }

    // ✅ Marcar como notificado
    reagendacion.notificacionProfesor = {
      enviada: true,
      fechaEnvio: new Date(),
      idProfesor: String(idProfesor).trim(),
    };

    await reagendacion.save();

    // En un sistema real aquí iría:
    // - Enviar email al profesor
    // - Enviar notificación push
    // - Registrar en log de auditoría
    // - Enviar a cola de mensajes

    console.log(`✅ Notificación de reagendación marcada para profesor ${idProfesor}`);

    return true;
  } catch (error) {
    console.error("ERROR notificarReagendacionProfesor:", error);
    return false;
  }
}

/**
 * Notificar al profesor sobre cancelación de clase
 */
export async function notificarCancelacionProfesor(
  claseCanceladaId,
  idProfesor
) {
  try {
    if (!claseCanceladaId || !idProfesor) {
      console.warn("notificarCancelacionProfesor: faltan parámetros", {
        claseCanceladaId,
        idProfesor,
      });
      return false;
    }

    const cancelacion = await ClaseCancelada.findOne({
      claseCanceladaId: String(claseCanceladaId).trim(),
    });

    if (!cancelacion) {
      console.warn(`Cancelación no encontrada: ${claseCanceladaId}`);
      return false;
    }

    // Aquí iría el envío real de notificación
    // Por ahora solo lo registramos
    console.log(
      `✅ Notificación de cancelación enviada a profesor ${idProfesor} para clase del ${cancelacion.fecha.toISOString()}`
    );

    return true;
  } catch (error) {
    console.error("ERROR notificarCancelacionProfesor:", error);
    return false;
  }
}

/**
 * Obtener todas las notificaciones pendientes de un profesor
 */
export async function obtenerNotificacionesPendientes(idProfesor) {
  try {
    // Reagendaciones no notificadas para este profesor
    const reagendacionesPendientes = await Reagendacion.find({
      $or: [
        { idProfesorOriginal: idProfesor },
        { idProfesorNuevo: idProfesor },
      ],
      "notificacionProfesor.enviada": false,
    })
      .sort({ createdAt: -1 })
      .lean();

    return {
      reagendaciones: reagendacionesPendientes || [],
      total: reagendacionesPendientes?.length || 0,
    };
  } catch (error) {
    console.error("ERROR obtenerNotificacionesPendientes:", error);
    return {
      reagendaciones: [],
      total: 0,
    };
  }
}

/**
 * Marcar notificación como leída por el profesor
 */
export async function marcarNotificacionComoLeida(reagendacionId) {
  try {
    await Reagendacion.updateOne(
      { ReagendacionId: String(reagendacionId).trim() },
      {
        $set: {
          "notificacionProfesor.leida": true,
          "notificacionProfesor.fechaLectura": new Date(),
        },
      }
    );

    return true;
  } catch (error) {
    console.error("ERROR marcarNotificacionComoLeida:", error);
    return false;
  }
}

function idGrupoDeDocumento(grupo) {
  return String(grupo?.IdGrupo || grupo?.idGrupo || grupo?.GrupoId || "").trim();
}

function formatearFechaNotificacion(fecha) {
  if (!fecha) return "";
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function crearNotificacionInApp(idProfesor, datos) {
  const id = String(idProfesor || "").trim();
  if (!id || !datos?.titulo) return null;

  const notificacionId = await generarId("notificacion");
  const doc = await NotificacionProfesor.create({
    notificacionId,
    idProfesor: id,
    tipo: datos.tipo || "asignacion_grupo",
    titulo: datos.titulo,
    mensaje: datos.mensaje || "",
    idGrupo: String(datos.idGrupo || "").trim(),
    nombreCurso: String(datos.nombreCurso || "").trim(),
    diaClase: String(datos.diaClase || "").trim(),
    horaClase: String(datos.horaClase || "").trim(),
    leida: false,
  });

  console.log(`✅ Notificación in-app (${datos.tipo}) para profesor ${id}`);
  return doc;
}

/**
 * Notificar al profesor que se le asignó un curso/grupo nuevo
 */
export async function crearNotificacionAsignacionGrupo(idProfesor, grupo) {
  try {
    const id = String(idProfesor || "").trim();
    if (!id || !grupo) return null;

    const nombreCurso = String(grupo.nombreCurso || "").trim();
    const idGrupo = idGrupoDeDocumento(grupo);
    const diaClase = String(grupo.diaClase || "").trim();
    const horaClase = String(grupo.horaClase || "").trim();

    return await crearNotificacionInApp(id, {
      tipo: "asignacion_grupo",
      titulo: "Nuevo curso asignado",
      mensaje: `Se te asignó el curso "${nombreCurso}" (${idGrupo}) los ${diaClase} a las ${horaClase}. Revisa tu calendario.`,
      idGrupo,
      nombreCurso,
      diaClase,
      horaClase,
    });
  } catch (error) {
    console.error("ERROR crearNotificacionAsignacionGrupo:", error);
    return null;
  }
}

/**
 * Notificar al profesor que un alumno fue inscrito en su grupo
 */
export async function crearNotificacionInscripcionProfesor(idProfesor, datos) {
  try {
    const id = String(idProfesor || "").trim();
    if (!id || !datos) return null;

    const nombreAlumno = String(datos.nombreAlumno || "").trim();
    const nombreCurso = String(datos.nombreCurso || "").trim();
    const idGrupo = String(datos.idGrupo || "").trim();
    const fechaTexto = formatearFechaNotificacion(datos.fechaInscripcion);

    return await crearNotificacionInApp(id, {
      tipo: "inscripcion",
      titulo: "Nuevo alumno inscrito",
      mensaje: `${nombreAlumno} fue inscrito en "${nombreCurso}" (${idGrupo})${fechaTexto ? `. Inicia clases: ${fechaTexto}` : ""}.`,
      idGrupo,
      nombreCurso,
      diaClase: String(datos.diaClase || "").trim(),
      horaClase: String(datos.horaClase || "").trim(),
    });
  } catch (error) {
    console.error("ERROR crearNotificacionInscripcionProfesor:", error);
    return null;
  }
}

/**
 * Notificar reagendación — origen, destino o ambos
 */
export async function notificarProfesoresReagendacion(datos) {
  try {
    const nombreAlumno = String(datos.nombreAlumno || "").trim();
    const nombreCurso = String(datos.nombreCurso || "curso").trim();
    const fechaOriginal = formatearFechaNotificacion(datos.fechaHoraOriginal);
    const fechaNueva = formatearFechaNotificacion(datos.fechaHoraNueva);
    const idProfesorOriginal = String(datos.idProfesorOriginal || "").trim();
    const idProfesorNuevo = String(datos.idProfesorNuevo || "").trim();
    const mismoProfesor =
      idProfesorOriginal &&
      idProfesorNuevo &&
      idProfesorOriginal === idProfesorNuevo;

    if (mismoProfesor) {
      return crearNotificacionInApp(idProfesorOriginal, {
        tipo: "reagendacion",
        titulo: "Reagendación de alumno",
        mensaje: `${nombreAlumno} (${nombreCurso}): la sesión del ${fechaOriginal} se movió al ${fechaNueva}. Revisa origen y destino en tu calendario.`,
        idGrupo: String(datos.idGrupoNuevo || datos.idGrupoOrigen || "").trim(),
        nombreCurso,
      });
    }

    const resultados = [];

    if (idProfesorOriginal) {
      resultados.push(
        await crearNotificacionInApp(idProfesorOriginal, {
          tipo: "reagendacion_origen",
          titulo: "Alumno reagendado (clase origen)",
          mensaje: `${nombreAlumno} NO asistirá a tu clase del ${fechaOriginal} (${nombreCurso}). Nueva fecha: ${fechaNueva}.`,
          idGrupo: String(datos.idGrupoOrigen || "").trim(),
          nombreCurso,
        })
      );
    }

    if (idProfesorNuevo) {
      resultados.push(
        await crearNotificacionInApp(idProfesorNuevo, {
          tipo: "reagendacion_destino",
          titulo: "Alumno reagendado (clase destino)",
          mensaje: `${nombreAlumno} asistirá a tu clase el ${fechaNueva} (${nombreCurso}). Correspondía a la sesión del ${fechaOriginal}.`,
          idGrupo: String(datos.idGrupoNuevo || "").trim(),
          nombreCurso,
        })
      );
    }

    return resultados.filter(Boolean);
  } catch (error) {
    console.error("ERROR notificarProfesoresReagendacion:", error);
    return null;
  }
}

/** @deprecated Usar notificarProfesoresReagendacion */
export async function crearNotificacionReagendacionProfesor(idProfesor, datos) {
  return notificarProfesoresReagendacion({
    ...datos,
    idProfesorOriginal: idProfesor,
    idProfesorNuevo: idProfesor,
  });
}

export async function obtenerNotificacionesInAppProfesor(idProfesor) {
  try {
    const id = String(idProfesor || "").trim();
    if (!id) return { notificaciones: [], total: 0, pendientes: 0 };

    const notificaciones = await NotificacionProfesor.find({ idProfesor: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const pendientes = notificaciones.filter((n) => !n.leida).length;

    return {
      notificaciones,
      total: notificaciones.length,
      pendientes,
    };
  } catch (error) {
    console.error("ERROR obtenerNotificacionesInAppProfesor:", error);
    return { notificaciones: [], total: 0, pendientes: 0 };
  }
}

export async function marcarNotificacionInAppLeida(notificacionId, idProfesor) {
  try {
    const filtro = {
      notificacionId: String(notificacionId).trim(),
    };
    if (idProfesor) {
      filtro.idProfesor = String(idProfesor).trim();
    }

    const actualizada = await NotificacionProfesor.findOneAndUpdate(
      filtro,
      { $set: { leida: true, fechaLectura: new Date() } },
      { new: true }
    ).lean();

    return actualizada;
  } catch (error) {
    console.error("ERROR marcarNotificacionInAppLeida:", error);
    return null;
  }
}
