import express from "express";
import Grupo from "../models/Grupo.js";
import Alumno from "../models/Alumno.js";
import Inscripcion from "../models/Inscripcion.js";
import Reagendacion from "../models/Reagendacion.js";
import Profesor from "../models/Profesor.js";
import Curso from "../models/Curso.js";
import NotaClaseSesion from "../models/NotaClaseSesion.js";
import { generarId } from "../utils/generarId.js";
import { parseFechaFlexible } from "../utils/parseFechas.js";
import {
  crearOActualizarPagoDeInscripcion,
  limpiarDatosPagosDeGrupo,
  normalizarDatosPago,
  validarMesPrimerCobro,
  propagarNombreCursoDeGrupo,
} from "../utils/pagos.js";
import {
  eliminarInscripcionesDeGrupo,
  filtroInscripcionesPorGrupo,
  idGrupoDeDocumentoGrupo,
} from "../utils/grupoInscripcion.js";
import { sincronizarInscripcionesDeGrupo } from "../utils/inscripcionesCurso.js";
import { parseDuracionAMinutos } from "../utils/duracionClase.js";
import { crearNotificacionAsignacionGrupo, crearNotificacionInscripcionProfesor } from "../utils/notificaciones.js";

const normalizarHoraClase = (hora) => {
  const texto = String(hora || "").trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return texto;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
};

const router = express.Router();

function sanitizarNotaHtmlServidor(html) {
  return String(html || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

function normalizarFechaClase(fecha) {
  const texto = String(fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return texto;
}

async function notificarInscripcionAlProfesor(grupoDoc, inscripcion) {
  const idProfesor = String(grupoDoc?.idProfesor || "").trim();
  if (!idProfesor) return;

  await crearNotificacionInscripcionProfesor(idProfesor, {
    nombreAlumno: inscripcion?.nombreAlumno || "",
    nombreCurso: grupoDoc?.nombreCurso || "",
    idGrupo: idGrupoDeDocumento(grupoDoc),
    diaClase: grupoDoc?.diaClase || "",
    horaClase: grupoDoc?.horaClase || "",
    fechaInscripcion: inscripcion?.fechaInscripcion || new Date(),
  });
}

const idGrupoDeDocumento = idGrupoDeDocumentoGrupo;

const esInscripcionActiva = (ins) => {
  const estatus = String(ins?.estatus || "Activa").trim().toLowerCase();
  return estatus !== "baja";
};

/** Misma lógica que el calendario: activa y ya vigente por fechaInscripcion */
const inscripcionCuentaParaCalendario = (ins) => {
  if (!esInscripcionActiva(ins)) return false;
  const fechaInscripcion = ins.fechaInscripcion
    ? new Date(ins.fechaInscripcion)
    : null;
  if (fechaInscripcion && fechaInscripcion.getTime() > Date.now()) {
    return false;
  }
  return true;
};

router.get("/", async (req, res) => {
  try {
    const grupos = await Grupo.find().lean();
    res.json(grupos);
  } catch (error) {
    console.error("ERROR GET GRUPOS:", error);
    res.status(500).json({ error: "Error al obtener grupos" });
  }
});

router.post("/crear-con-alumno", async (req, res) => {
  try {
    const { grupo, alumnoExistente, alumnoNuevo, datosPago, fechaInscripcion } =
      req.body;

    if (!grupo) {
      return res.status(400).json({ error: "Faltan datos del grupo" });
    }

    const {
      idCurso,
      nombreCurso,
      diaClase,
      horaClase,
      duracionClase = "2 horas",
      idProfesor,
      nombreProfesor,
      comentario,
      comentarioGrupo,
      capacidadMaxima,
      fechaCreacion,
      Estatus,
      estatus,
    } = grupo;

    if (!nombreCurso || !String(nombreCurso).trim()) {
      return res.status(400).json({ error: "Falta nombreCurso" });
    }

    if (!diaClase || !String(diaClase).trim()) {
      return res.status(400).json({ error: "Falta diaClase" });
    }

    if (!horaClase || !String(horaClase).trim()) {
      return res.status(400).json({ error: "Falta horaClase" });
    }

    if (!nombreProfesor || !String(nombreProfesor).trim()) {
      return res.status(400).json({ error: "Falta nombreProfesor" });
    }

    const capacidadGrupo =
      Number(capacidadMaxima) > 0 ? Number(capacidadMaxima) : 8;

    if (!alumnoExistente && !alumnoNuevo) {
      return res.status(400).json({
        error: "Debes enviar un alumno existente o un alumno nuevo",
      });
    }

    let datosPagoNormalizados = null;
    try {
      datosPagoNormalizados = normalizarDatosPago(datosPago || {});
    } catch (errorPago) {
      return res.status(400).json({ error: errorPago.message });
    }

    const fechaInscripcionFinal =
      parseFechaFlexible(fechaInscripcion || fechaCreacion) || new Date();

    const errorMesCobro = validarMesPrimerCobro(
      fechaInscripcionFinal,
      datosPagoNormalizados.fechaInicioPago
    );
    if (errorMesCobro) {
      return res.status(400).json({ error: errorMesCobro });
    }

    let alumnoFinal = null;

    if (alumnoExistente) {
      const idAlumnoBuscado =
        alumnoExistente.idAlumno || alumnoExistente["idAlumno "] || "";

      if (!idAlumnoBuscado) {
        return res.status(400).json({
          error: "El alumno existente no tiene idAlumno",
        });
      }

      alumnoFinal = {
        idAlumno: idAlumnoBuscado,
        nombreAlumno:
          alumnoExistente.nombreAlumno || alumnoExistente.nombre || "",
        modalidad: alumnoExistente.modalidad || "Presencial",
      };
    }

    if (alumnoNuevo) {
      if (!alumnoNuevo.nombreAlumno || !String(alumnoNuevo.nombreAlumno).trim()) {
        return res.status(400).json({
          error: "Falta nombreAlumno del alumno nuevo",
        });
      }

      const nuevoIdAlumno = await generarId("alumno");
      const nombreLimpio = String(alumnoNuevo.nombreAlumno).trim();

      const nuevoAlumno = new Alumno({
        idAlumno: nuevoIdAlumno,
        nombreAlumno: nombreLimpio,
        nombre: nombreLimpio,
        telefono: alumnoNuevo.telefono || "",
        tutor: alumnoNuevo.tutor || "",
        observaciones: alumnoNuevo.observaciones || "",
        estatus: alumnoNuevo.estatus || "Activo",
      });

      const alumnoGuardado = await nuevoAlumno.save();

      alumnoFinal = {
        idAlumno: alumnoGuardado.idAlumno,
        nombreAlumno: alumnoGuardado.nombreAlumno || alumnoGuardado.nombre || "",
        modalidad: alumnoNuevo.modalidad || "Presencial",
      };
    }

    if (!alumnoFinal?.idAlumno) {
      return res.status(400).json({
        error: "No se pudo resolver el alumno final",
      });
    }

    const horaNormalizada = normalizarHoraClase(horaClase);

    const grupoExistente = await Grupo.findOne({
      nombreCurso: { $regex: `^${String(nombreCurso).trim()}$`, $options: "i" },
      diaClase: { $regex: `^${String(diaClase).trim()}$`, $options: "i" },
      horaClase: horaNormalizada,
      $or: [
        ...(idProfesor ? [{ idProfesor: String(idProfesor).trim() }] : []),
        {
          nombreProfesor: {
            $regex: `^${String(nombreProfesor).trim()}$`,
            $options: "i",
          },
        },
      ],
    }).lean();

    let grupoGuardado = grupoExistente;
    let grupoCreado = false;

    if (!grupoExistente) {
      const nuevoIdGrupo = await generarId("grupo");

      const nuevoGrupo = new Grupo({
        IdGrupo: nuevoIdGrupo,
        idCurso: idCurso || "",
        nombreCurso: String(nombreCurso).trim(),
        diaClase: String(diaClase).trim(),
        horaClase: horaNormalizada,
        duracionClase: duracionClase || "2 horas",
        idProfesor: idProfesor || "",
        nombreProfesor: String(nombreProfesor).trim(),
        comentario: String(comentario ?? comentarioGrupo ?? "").trim(),
        CapacidadMaxima: capacidadGrupo,
        Estatus: Estatus || estatus || "Activo",
        // fechaCreacion = primer día en que el grupo aparece en el calendario
        fechaCreacion: parseFechaFlexible(grupo.fechaCreacion) || new Date(),
      });

      grupoGuardado = await nuevoGrupo.save();
      grupoCreado = true;

      if (idProfesor) {
        await crearNotificacionAsignacionGrupo(
          idProfesor,
          grupoGuardado.toObject ? grupoGuardado.toObject() : grupoGuardado
        );
      }
    }

    const idGrupoFinal = idGrupoDeDocumento(grupoGuardado);

    const inscripcionExistente = await Inscripcion.findOne({
      idAlumno: alumnoFinal.idAlumno,
      grupoId: idGrupoFinal,
    }).lean();

    if (inscripcionExistente && esInscripcionActiva(inscripcionExistente)) {
      return res.status(409).json({
        error: "El alumno ya está inscrito en este grupo",
      });
    }

    const datosInscripcion = {
      nombreAlumno: alumnoFinal.nombreAlumno,
      modalidad: alumnoFinal.modalidad,
      montoMensualidad: datosPagoNormalizados.montoMensualidad,
      diaPago: datosPagoNormalizados.diaPago,
      fechaInicioPago: datosPagoNormalizados.fechaInicioPago,
      comentarios: datosPagoNormalizados.comentarios ?? "",
      fechaInscripcion: fechaInscripcionFinal,
      estatus: "Activa",
      fechaBaja: null,
      motivoBaja: "",
    };

    let inscripcionGuardada;

    if (inscripcionExistente) {
      inscripcionGuardada = await Inscripcion.findOneAndUpdate(
        { _id: inscripcionExistente._id },
        { $set: datosInscripcion },
        { new: true }
      );
    } else {
      inscripcionGuardada = await new Inscripcion({
        idAlumno: alumnoFinal.idAlumno,
        grupoId: idGrupoFinal,
        ...datosInscripcion,
      }).save();
    }

    const pago = await crearOActualizarPagoDeInscripcion({
      idAlumno: alumnoFinal.idAlumno,
      nombreAlumno: alumnoFinal.nombreAlumno,
      grupoId: idGrupoFinal,
      nombreCurso: grupoGuardado.nombreCurso,
      datosPago: datosPagoNormalizados,
    });

    await notificarInscripcionAlProfesor(
      grupoGuardado.toObject ? grupoGuardado.toObject() : grupoGuardado,
      inscripcionGuardada?.toObject
        ? inscripcionGuardada.toObject()
        : inscripcionGuardada
    );

    res.status(201).json({
      ok: true,
      grupoCreado,
      grupo: grupoGuardado,
      alumno: alumnoFinal,
      inscripcion: inscripcionGuardada,
      pago,
    });
  } catch (error) {
    console.error("ERROR POST /crear-con-alumno:", error);
    res.status(500).json({
      error: "Error al crear grupo con alumno",
      detalle: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      idCurso,
      nombreCurso,
      diaClase,
      horaClase,
      duracionClase = "2 horas",
      idProfesor,
      nombreProfesor,
      comentario,
      comentarioGrupo,
      capacidadMaxima,
      fechaCreacion,
      Estatus,
      estatus,
    } = req.body;

    const nuevoIdGrupo = await generarId("grupo");

    const nuevoGrupo = new Grupo({
      IdGrupo: nuevoIdGrupo,
      idCurso: idCurso || "",
      nombreCurso: String(nombreCurso).trim(),
      diaClase: String(diaClase).trim(),
      horaClase: String(horaClase).trim(),
      duracionClase: duracionClase || "2 horas",
      idProfesor: idProfesor || "",
      nombreProfesor: String(nombreProfesor).trim(),
      comentario: String(comentario ?? comentarioGrupo ?? "").trim(),
      CapacidadMaxima: Number(capacidadMaxima),
      Estatus: Estatus || estatus || "Activo",
      fechaCreacion: fechaCreacion ? new Date(fechaCreacion) : new Date(),
    });

    const guardado = await nuevoGrupo.save();

    if (idProfesor) {
      await crearNotificacionAsignacionGrupo(idProfesor, guardado.toObject());
    }

    res.status(201).json(guardado);
  } catch (error) {
    console.error("ERROR POST GRUPOS:", error);
    res.status(500).json({
      error: "Error al crear grupo",
      detalle: error.message,
    });
  }
});

router.patch("/:grupoId/nota-sesion", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const fechaClase = normalizarFechaClase(req.body?.fecha || req.body?.fechaClase);
    const notaHtml = sanitizarNotaHtmlServidor(
      req.body?.notaHtml ?? req.body?.nota ?? req.body?.comentario ?? ""
    );

    if (!fechaClase) {
      return res.status(400).json({ error: "Falta fecha válida (YYYY-MM-DD)" });
    }

    const grupo = await Grupo.findOne(filtroGrupoPorId(grupoId)).lean();
    if (!grupo) {
      return res.status(404).json({ error: "No se encontró el grupo" });
    }

    const idGrupoCanonico = idGrupoDeDocumento(grupo) || String(grupoId).trim();
    const nota = await NotaClaseSesion.findOneAndUpdate(
      { idGrupo: idGrupoCanonico, fechaClase },
      { $set: { notaHtml } },
      { upsert: true, new: true }
    ).lean();

    res.json({ ok: true, nota });
  } catch (error) {
    console.error("ERROR PATCH NOTA SESION:", error);
    res.status(500).json({
      error: "Error al guardar la nota de la clase",
      detalle: error.message,
    });
  }
});

router.patch("/:grupoId/comentario", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const comentario = String(
      req.body?.comentario ?? req.body?.comentarioGrupo ?? ""
    ).trim();

    const grupo = await Grupo.findOneAndUpdate(
      {
        $or: [{ IdGrupo: grupoId }, { idGrupo: grupoId }, { GrupoId: grupoId }],
      },
      { $set: { comentario } },
      { new: true }
    ).lean();

    if (!grupo) {
      return res.status(404).json({
        error: "No se encontrÃ³ el grupo",
      });
    }

    res.status(200).json({
      ok: true,
      grupo,
    });
  } catch (error) {
    console.error("ERROR PATCH COMENTARIO GRUPO:", error);
    res.status(500).json({
      error: "Error al actualizar comentario del grupo",
      detalle: error.message,
    });
  }
});

const DIAS_CLASE_VALIDOS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const filtroGrupoPorId = (grupoId) => ({
  $or: [{ IdGrupo: grupoId }, { idGrupo: grupoId }, { GrupoId: grupoId }],
});

// Reasignar (o quitar) el profesor de un grupo existente
router.patch("/:grupoId/profesor", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const idProfesor = String(req.body?.idProfesor || "").trim();

    let datosProfesor = { idProfesor: "", nombreProfesor: "" };

    if (idProfesor) {
      const profesor = await Profesor.findOne({ idProfesor });
      if (!profesor) {
        return res.status(404).json({ error: "Maestro no encontrado" });
      }
      datosProfesor = {
        idProfesor: profesor.idProfesor,
        nombreProfesor: profesor.nombre,
      };
    }

    const grupoActual = await Grupo.findOne(filtroGrupoPorId(grupoId)).lean();

    const grupo = await Grupo.findOneAndUpdate(
      filtroGrupoPorId(grupoId),
      { $set: datosProfesor },
      { new: true }
    ).lean();

    if (!grupo) {
      return res.status(404).json({ error: "No se encontró el grupo" });
    }

    const profesorAnterior = String(grupoActual?.idProfesor || "").trim();
    const profesorNuevo = String(datosProfesor.idProfesor || "").trim();
    if (profesorNuevo && profesorNuevo !== profesorAnterior) {
      await crearNotificacionAsignacionGrupo(profesorNuevo, grupo);
    }

    res.status(200).json({ ok: true, grupo });
  } catch (error) {
    console.error("ERROR PATCH PROFESOR GRUPO:", error);
    res.status(500).json({
      error: "Error al reasignar el profesor del grupo",
      detalle: error.message,
    });
  }
});

// Actualizar día y hora recurrentes del grupo (calendario completo)
router.patch("/:grupoId/horario", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const diaClase = String(req.body?.diaClase || "").trim();
    const horaClase = String(req.body?.horaClase || "").trim();
    const duracionClase = String(req.body?.duracionClase || "").trim();

    if (!diaClase) {
      return res.status(400).json({ error: "Falta el día de clase" });
    }
    if (!horaClase) {
      return res.status(400).json({ error: "Falta la hora de clase" });
    }

    const diaValido = DIAS_CLASE_VALIDOS.find(
      (dia) => dia.toLowerCase() === diaClase.toLowerCase()
    );
    if (!diaValido) {
      return res.status(400).json({ error: "Día de clase inválido" });
    }

    const horaNormalizada = normalizarHoraClase(horaClase);
    if (!/^\d{2}:\d{2}$/.test(horaNormalizada)) {
      return res.status(400).json({ error: "Hora de clase inválida" });
    }

    if (duracionClase && parseDuracionAMinutos(duracionClase, 0) <= 0) {
      return res.status(400).json({ error: "Duración de clase inválida" });
    }

    const grupoActual = await Grupo.findOne(filtroGrupoPorId(grupoId)).lean();
    if (!grupoActual) {
      return res.status(404).json({ error: "No se encontró el grupo" });
    }

    const idGrupoActual = idGrupoDeDocumento(grupoActual);
    const conflicto = await Grupo.findOne({
      $and: [
        {
          nombreCurso: {
            $regex: `^${String(grupoActual.nombreCurso || "").trim()}$`,
            $options: "i",
          },
        },
        { diaClase: { $regex: `^${diaValido}$`, $options: "i" } },
        {
          $or: [
            { horaClase: horaNormalizada },
            { "horaClase ": horaNormalizada },
          ],
        },
        {
          $nor: [
            { IdGrupo: idGrupoActual },
            { idGrupo: idGrupoActual },
            { GrupoId: idGrupoActual },
          ],
        },
      ],
    }).lean();

    if (conflicto) {
      return res.status(409).json({
        error: "Ya existe un grupo de este curso con el mismo día y hora",
      });
    }

    const grupo = await Grupo.findOneAndUpdate(
      filtroGrupoPorId(grupoId),
      {
        $set: {
          diaClase: diaValido,
          horaClase: horaNormalizada,
          ...(duracionClase ? { duracionClase } : {}),
        },
        $unset: { "horaClase ": "" },
      },
      { new: true }
    ).lean();

    res.status(200).json({ ok: true, grupo });
  } catch (error) {
    console.error("ERROR PATCH HORARIO GRUPO:", error);
    res.status(500).json({
      error: "Error al actualizar el horario del grupo",
      detalle: error.message,
    });
  }
});

// Reasignar el curso de un grupo existente (para grupos que quedaron sin curso)
router.patch("/:grupoId/curso", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const idCurso = String(req.body?.idCurso || "").trim();

    if (!idCurso) {
      return res.status(400).json({ error: "Falta el curso a asignar" });
    }

    const curso = await Curso.findOne({ idCurso });
    if (!curso) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    const grupo = await Grupo.findOneAndUpdate(
      {
        $or: [{ IdGrupo: grupoId }, { idGrupo: grupoId }, { GrupoId: grupoId }],
      },
      { $set: { idCurso: curso.idCurso, nombreCurso: curso.nombreCurso } },
      { new: true }
    ).lean();

    if (!grupo) {
      return res.status(404).json({ error: "No se encontró el grupo" });
    }

    const syncInscripciones = await sincronizarInscripcionesDeGrupo(
      grupo.IdGrupo || grupo.idGrupo || grupoId
    );

    const idGrupoCanonico =
      grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId || String(grupoId).trim();
    const pagosCurso = await propagarNombreCursoDeGrupo(
      idGrupoCanonico,
      curso.nombreCurso
    );

    res.status(200).json({
      ok: true,
      grupo,
      inscripcionesInactivadas: syncInscripciones.inactivadas,
      inscripcionesReactivadas: syncInscripciones.reactivadas,
      pagosActualizados: pagosCurso.pagosActualizados,
    });
  } catch (error) {
    console.error("ERROR PATCH CURSO GRUPO:", error);
    res.status(500).json({
      error: "Error al reasignar el curso del grupo",
      detalle: error.message,
    });
  }
});

router.delete("/:grupoId", async (req, res) => {
  try {
    const { grupoId } = req.params;

    const grupo = await Grupo.findOne({
      $or: [{ IdGrupo: grupoId }, { idGrupo: grupoId }, { GrupoId: grupoId }],
    });

    if (!grupo) {
      return res.status(404).json({
        error: "No se encontró el grupo",
      });
    }

    const idGrupoCanonico = idGrupoDeDocumento(grupo) || String(grupoId).trim();
    const filtroGrupo = filtroInscripcionesPorGrupo(idGrupoCanonico);

    const inscripciones = await Inscripcion.find(filtroGrupo).lean();
    const inscripcionesActivas = inscripciones.filter(esInscripcionActiva);

    if (inscripcionesActivas.length > 0) {
      return res.status(409).json({
        error:
          "No se puede eliminar el grupo mientras tenga alumnos activos. " +
          "Primero inactiva a cada alumno en ese curso (Alumnos inscritos). " +
          "El alumno sigue en el sistema y en sus otros cursos.",
        alumnosInscritos: inscripcionesActivas.length,
        alumnos: inscripcionesActivas.map((ins) => ({
          idAlumno: ins.idAlumno,
          nombreAlumno: ins.nombreAlumno,
          estatus: ins.estatus || "Activa",
        })),
      });
    }

    const reagendacionesRelacionadas = await Reagendacion.find({
      $or: [
        { idGrupoOrigen: idGrupoCanonico },
        { IdgrupoOrigen: idGrupoCanonico },
        { idGrupoNuevo: idGrupoCanonico },
        { IdgrupoNuevo: idGrupoCanonico },
      ],
    }).lean();

    const reagendacionesActivas = reagendacionesRelacionadas.filter(
      (r) => String(r.estatus || "reagendado").toLowerCase() !== "cancelado"
    );

    if (reagendacionesActivas.length > 0) {
      return res.status(409).json({
        error:
          "No se puede eliminar el grupo porque tiene reagendaciones activas. Elimínalas desde el calendario primero.",
        reagendacionesRelacionadas: reagendacionesActivas.length,
      });
    }

    const limpiezaPagos = await limpiarDatosPagosDeGrupo(idGrupoCanonico);

    const inscripcionesEliminadasCount = await eliminarInscripcionesDeGrupo(
      idGrupoCanonico,
      String(grupoId).trim()
    );

    await Reagendacion.deleteMany({
      $or: [
        { idGrupoOrigen: idGrupoCanonico },
        { IdgrupoOrigen: idGrupoCanonico },
        { idGrupoNuevo: idGrupoCanonico },
        { IdgrupoNuevo: idGrupoCanonico },
      ],
    });

    await Grupo.deleteOne({ _id: grupo._id });

    res.status(200).json({
      ok: true,
      mensaje: "Grupo eliminado correctamente",
      grupoEliminado: grupo,
      inscripcionesEliminadas: inscripcionesEliminadasCount,
      pagosEliminados: limpiezaPagos.pagosEliminados,
      abonosEliminados: limpiezaPagos.abonosEliminados,
    });
  } catch (error) {
    console.error("ERROR DELETE GRUPO:", error);
    res.status(500).json({
      error: "Error al eliminar grupo",
      detalle: error.message,
    });
  }
});

export default router;
