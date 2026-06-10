import express from "express";
import Inscripcion from "../models/Inscripcion.js";
import Reagendacion from "../models/Reagendacion.js";
import Grupo from "../models/Grupo.js";
import Pago from "../models/Pago.js";
import Alumno from "../models/Alumno.js";
import { parseFechaFlexible } from "../utils/parseFechas.js";
import Abono from "../models/Abono.js";
import {
  crearOActualizarPagoDeInscripcion,
  crearPagoId,
  desactivarPagoDeInscripcion,
  reactivarPagoDeInscripcion,
  actualizarMontoMensualidadAlumnoGrupo,
  normalizarDatosPago,
  validarMesPrimerCobro,
  validarPagoAlCorrienteParaBaja,
} from "../utils/pagos.js";
import { crearNotificacionInscripcionProfesor } from "../utils/notificaciones.js";
import { sincronizarInscripcionesHuerfanas } from "../utils/grupoInscripcion.js";
import { sincronizarInscripcionesConCursosCatalogo } from "../utils/inscripcionesCurso.js";

const router = express.Router();

const normalizar = (valor) => String(valor || "").trim().toUpperCase();

const grupoIdDeInscripcion = (ins) =>
  String(ins?.grupoId || ins?.GrupoId || ins?.idGrupo || ins?.IdGrupo || "").trim();

const filtroIdAlumno = (idAlumno) => {
  const id = String(idAlumno).trim();
  return {
    $or: [
      { idAlumno: id },
      { IdAlumno: id },
      { id_alumno: id },
      { "idAlumno ": id },
    ],
  };
};

async function buscarInscripcionPorAlumnoYGrupo(idAlumno, grupoId) {
  const grupoBuscado = normalizar(grupoId);
  const inscripciones = await Inscripcion.find(filtroIdAlumno(idAlumno)).lean();
  return inscripciones.find(
    (ins) => normalizar(grupoIdDeInscripcion(ins)) === grupoBuscado
  );
}

/** Campos de pago en inscripciones antiguas (diaPagoFijo, fechaPago) */
async function resolverCamposPagoInscripcion(inscripcionDoc) {
  const raw = await Inscripcion.collection.findOne({ _id: inscripcionDoc._id });

  const diaPago =
    inscripcionDoc.diaPago ??
    raw?.diaPago ??
    raw?.diaPagoFijo ??
    null;

  const fechaInicioPago =
    inscripcionDoc.fechaInicioPago ??
    raw?.fechaInicioPago ??
    raw?.fechaPago ??
    inscripcionDoc.fechaInscripcion ??
    null;

  return { diaPago, fechaInicioPago };
}

router.get("/", async (req, res) => {
  try {
    await sincronizarInscripcionesHuerfanas();
    await sincronizarInscripcionesConCursosCatalogo();
    const inscripciones = await Inscripcion.find().lean();
    res.json(inscripciones);
  } catch (error) {
    console.error("ERROR GET INSCRIPCIONES:", error);
    res.status(500).json({ error: "Error al obtener inscripciones" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      idAlumno,
      nombreAlumno,
      grupoId,
      modalidad,
      fechaInscripcion,
      montoMensualidad,
      diaPago,
      fechaInicioPago,
      comentarios,
    } = req.body;

    // Validar inputs básicos
    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    if (!nombreAlumno || !String(nombreAlumno).trim()) {
      return res.status(400).json({ error: "Falta nombreAlumno" });
    }

    if (!grupoId || !String(grupoId).trim()) {
      return res.status(400).json({ error: "Falta grupoId" });
    }

    const grupoIdTrimmed = String(grupoId).trim();

    // ✅ CAMBIO 4: Usar parseador centralizado de fechas
    // Soporta ISO 8601, SQL format, input date, y JavaScript Date strings
    let fechaInscripcionFinal = undefined;
    if (fechaInscripcion) {
      const d = parseFechaFlexible(fechaInscripcion);
      if (d && !isNaN(d.getTime())) {
        fechaInscripcionFinal = d;
      } else {
        return res.status(400).json({
          error: "fechaInscripcion no es válida. Usa formato YYYY-MM-DD o ISO 8601"
        });
      }
    }

    // ✅ Normalizar y validar datos de pago (REQUERIDOS)
    let datosPagoNormalizados = null;
    try {
      datosPagoNormalizados = normalizarDatosPago({
        montoMensualidad,
        diaPago,
        fechaInicioPago,
        comentarios,
      });
    } catch (errorPago) {
      return res.status(400).json({ error: errorPago.message });
    }

    if (!datosPagoNormalizados) {
      return res.status(400).json({ error: "Datos de pago requeridos (monto, día de pago, fecha de inicio)" });
    }

    if (!fechaInscripcionFinal) {
      return res.status(400).json({
        error: "Indica desde qué día empieza a tomar clase (fechaInscripcion)",
      });
    }

    const errorMesCobro = validarMesPrimerCobro(
      fechaInscripcionFinal,
      datosPagoNormalizados.fechaInicioPago
    );
    if (errorMesCobro) {
      return res.status(400).json({ error: errorMesCobro });
    }

    // ✅ CAMBIO 3a: Validar que el grupo existe ANTES de hacer anything
    const grupoNuevo = await Grupo.findOne({
      $or: [
        { IdGrupo: grupoIdTrimmed },
        { idGrupo: grupoIdTrimmed },
      ],
    }).lean();

    if (!grupoNuevo) {
      return res.status(404).json({
        error: `Grupo "${grupoIdTrimmed}" no existe en la base de datos`
      });
    }

    // ✅ CAMBIO 3b: Validar que el alumno existe
    const alumnoExiste = await Alumno.findOne({
      $or: [
        { idAlumno: String(idAlumno).trim() },
        { "idAlumno ": String(idAlumno).trim() },
        { IdAlumno: String(idAlumno).trim() },
        { id_alumno: String(idAlumno).trim() },
      ]
    }).lean();

    if (!alumnoExiste) {
      return res.status(404).json({
        error: `Alumno "${idAlumno}" no existe en la base de datos`
      });
    }

    // Verificar si el alumno ya está inscrito en este grupo
    const inscripcionExistente = await Inscripcion.findOne({
      idAlumno: String(idAlumno).trim(),
      grupoId: grupoIdTrimmed,
    }).lean();

    if (inscripcionExistente) {
      return res.status(409).json({
        error: "El alumno ya está inscrito en este grupo",
      });
    }

    console.log("Búsqueda de grupo:", { grupoId: grupoIdTrimmed, grupoEncontrado: !!grupoNuevo });

    // Buscar todas las inscripciones del alumno
    const inscripcionesAlumno = await Inscripcion.find({
      idAlumno,
    }).lean();

    // Verificar si el alumno ya está inscrito en una clase del mismo profesor a la misma hora
    for (const inscripcion of inscripcionesAlumno) {
      const grupoExistente = await Grupo.findOne({
        $or: [
          { IdGrupo: inscripcion.grupoId },
          { idGrupo: inscripcion.grupoId },
        ],
      }).lean();

      if (grupoExistente) {
        const mismoProfesor =
          (grupoNuevo.idProfesor || grupoNuevo.IdProfesor) ===
          (grupoExistente.idProfesor || grupoExistente.IdProfesor);

        const mismaHora =
          String(grupoNuevo.horaClase || "").trim() ===
          String(grupoExistente.horaClase || "").trim();

        const mismoDia =
          String(grupoNuevo.diaClase || "").trim().toLowerCase() ===
          String(grupoExistente.diaClase || "").trim().toLowerCase();

        if (mismoProfesor && mismaHora && mismoDia) {
          return res.status(409).json({
            error: `El alumno ya está inscrito en una clase del profesor ${grupoExistente.nombreProfesor} a la misma hora`,
          });
        }
      }
    }

    const nuevaInscripcion = new Inscripcion({
      idAlumno: String(idAlumno).trim(),
      nombreAlumno: String(nombreAlumno).trim(),
      grupoId: grupoIdTrimmed,
      modalidad: modalidad || "Presencial",
      montoMensualidad: datosPagoNormalizados.montoMensualidad,
      diaPago: datosPagoNormalizados.diaPago,
      fechaInicioPago: datosPagoNormalizados.fechaInicioPago,
      comentarios: datosPagoNormalizados.comentarios || "",
      fechaInscripcion: fechaInscripcionFinal,
    });

    const guardada = await nuevaInscripcion.save();

    const pago = await crearOActualizarPagoDeInscripcion({
      idAlumno: guardada.idAlumno,
      nombreAlumno: guardada.nombreAlumno,
      grupoId: guardada.grupoId,
      nombreCurso: grupoNuevo?.nombreCurso || "",
      datosPago: datosPagoNormalizados,
    });

    const idProfesor = String(grupoNuevo?.idProfesor || "").trim();
    if (idProfesor) {
      await crearNotificacionInscripcionProfesor(idProfesor, {
        nombreAlumno: guardada.nombreAlumno,
        nombreCurso: grupoNuevo?.nombreCurso || "",
        idGrupo: grupoIdTrimmed,
        diaClase: grupoNuevo?.diaClase || "",
        horaClase: grupoNuevo?.horaClase || "",
        fechaInscripcion: guardada.fechaInscripcion,
      });
    }

    res.status(201).json({
      ...guardada.toObject(),
      pago,
    });
  } catch (error) {
    console.error("ERROR POST INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al crear inscripción",
      detalle: error.message,
    });
  }
});

router.get("/grupo/:grupoId", async (req, res) => {
  try {
    const { grupoId } = req.params;

    const inscripciones = await Inscripcion.find({
      grupoId: String(grupoId).trim(),
    }).lean();

    res.status(200).json(inscripciones);
  } catch (error) {
    console.error("ERROR GET INSCRIPCIONES POR GRUPO:", error);
    res.status(500).json({
      error: "Error al obtener inscripciones del grupo",
      detalle: error.message,
    });
  }
});

router.get("/alumno/:idAlumno", async (req, res) => {
  try {
    const { idAlumno } = req.params;

    const inscripciones = await Inscripcion.find({
      idAlumno: String(idAlumno).trim(),
    }).lean();

    res.status(200).json(inscripciones);
  } catch (error) {
    console.error("ERROR GET INSCRIPCIONES POR ALUMNO:", error);
    res.status(500).json({
      error: "Error al obtener inscripciones del alumno",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno/:grupoId", async (req, res) => {
  try {
    const { idAlumno, grupoId } = req.params;
    const { modalidad, comentarios, comentario, comentarioAlumno, montoMensualidad } =
      req.body || {};

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }
    if (!grupoId || !String(grupoId).trim()) {
      return res.status(400).json({ error: "Falta grupoId" });
    }

    let inscripcion = await buscarInscripcionPorAlumnoYGrupo(idAlumno, grupoId);

    if (!inscripcion) {
      const grupoParam = String(grupoId).trim();
      if (grupoParam.toUpperCase().startsWith("VIRTUAL_")) {
        const reag = await Reagendacion.findOne({
          idAlumno: String(idAlumno).trim(),
          $or: [
            { idGrupoNuevo: grupoParam },
            { IdgrupoNuevo: grupoParam },
            { IdGrupoNuevo: grupoParam },
          ],
        }).lean();

        const grupoOrigen =
          reag?.idGrupoOrigen ||
          reag?.IdgrupoOrigen ||
          reag?.IdGrupoOrigen ||
          "";

        if (grupoOrigen) {
          inscripcion = await buscarInscripcionPorAlumnoYGrupo(
            idAlumno,
            grupoOrigen
          );
        }
      }
    }

    if (!inscripcion) {
      return res.status(404).json({ error: "No se encontró la inscripción" });
    }

    const update = {};

    if (modalidad !== undefined) {
      const modalidadFinal = String(modalidad).trim();
      if (!["Presencial", "Virtual"].includes(modalidadFinal)) {
        return res.status(400).json({
          error: 'Modalidad inválida. Usa "Presencial" o "Virtual"',
        });
      }
      update.modalidad = modalidadFinal;
    }

    if (comentarios !== undefined || comentario !== undefined) {
      update.comentarios = String(comentarios ?? comentario ?? "").trim();
    }

    if (comentarioAlumno !== undefined) {
      update.comentarioAlumno = String(comentarioAlumno ?? "").trim();
    }

    if (montoMensualidad !== undefined) {
      const monto = Number(montoMensualidad);
      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({
          error: "Captura un monto de mensualidad válido (mayor a 0)",
        });
      }
      update.montoMensualidad = monto;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error:
          "Indica modalidad, comentarios, comentario de alumno y/o mensualidad",
      });
    }

    const grupoCanonico = grupoIdDeInscripcion(inscripcion);
    const idAlumnoLimpio = String(idAlumno).trim();

    const actualizada = await Inscripcion.findOneAndUpdate(
      { _id: inscripcion._id },
      { $set: update },
      { new: true }
    ).lean();

    if (update.modalidad) {
      await Reagendacion.updateMany(
        {
          idAlumno: idAlumnoLimpio,
          $or: [
            { idGrupoOrigen: grupoCanonico },
            { IdgrupoOrigen: grupoCanonico },
          ],
        },
        { $set: { modalidad: update.modalidad } }
      );
    }

    if (update.montoMensualidad != null) {
      await actualizarMontoMensualidadAlumnoGrupo(
        idAlumnoLimpio,
        grupoCanonico,
        update.montoMensualidad
      );
    }

    res.status(200).json({ ok: true, inscripcion: actualizada });
  } catch (error) {
    console.error("ERROR PATCH INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al actualizar inscripción",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno/:grupoId/nota", async (req, res) => {
  try {
    const { idAlumno, grupoId } = req.params;
    const comentario = String(req.body?.comentarios ?? req.body?.comentario ?? "").trim();

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }
    if (!grupoId || !String(grupoId).trim()) {
      return res.status(400).json({ error: "Falta grupoId" });
    }

    const inscripcion = await buscarInscripcionPorAlumnoYGrupo(idAlumno, grupoId);

    if (!inscripcion) {
      return res.status(404).json({ error: "No se encontró la inscripción" });
    }

    const actualizada = await Inscripcion.findOneAndUpdate(
      { _id: inscripcion._id },
      { $set: { comentarios: comentario } },
      { new: true }
    ).lean();

    res.status(200).json({ ok: true, inscripcion: actualizada });
  } catch (error) {
    console.error("ERROR PATCH NOTA INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al guardar la nota",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno/:grupoId/reactivar", async (req, res) => {
  try {
    const { idAlumno, grupoId } = req.params;
    const idTrimmed = String(idAlumno).trim();

    if (!idTrimmed) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }
    if (!grupoId || !String(grupoId).trim()) {
      return res.status(400).json({ error: "Falta grupoId" });
    }

    const inscripcionDoc = await buscarInscripcionPorAlumnoYGrupo(
      idTrimmed,
      grupoId
    );

    if (!inscripcionDoc) {
      return res.status(404).json({ error: "No se encontró la inscripción" });
    }

    if (String(inscripcionDoc.estatus || "").toLowerCase() !== "baja") {
      return res.status(409).json({ error: "La inscripción ya está activa" });
    }

    const grupoCanonico = grupoIdDeInscripcion(inscripcionDoc);
    const { diaPago, fechaInicioPago } =
      await resolverCamposPagoInscripcion(inscripcionDoc);

    const update = {
      estatus: "Activa",
      fechaBaja: null,
      motivoBaja: "",
    };

    if (diaPago != null && inscripcionDoc.diaPago == null) {
      update.diaPago = Number(diaPago);
    }
    if (fechaInicioPago != null && inscripcionDoc.fechaInicioPago == null) {
      update.fechaInicioPago = new Date(fechaInicioPago);
    }

    const inscripcion = await Inscripcion.findByIdAndUpdate(
      inscripcionDoc._id,
      { $set: update },
      { new: true, runValidators: false }
    ).lean();

    const pago = await reactivarPagoDeInscripcion(idTrimmed, grupoCanonico);

    res.status(200).json({
      ok: true,
      inscripcion,
      pago: pago || null,
    });
  } catch (error) {
    console.error("ERROR PATCH REACTIVAR INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al reactivar la inscripción",
      detalle: error.message,
    });
  }
});

router.delete("/:idAlumno/:grupoId/historial", async (req, res) => {
  try {
    const { idAlumno, grupoId } = req.params;

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }
    if (!grupoId || !String(grupoId).trim()) {
      return res.status(400).json({ error: "Falta grupoId" });
    }

    const idTrimmed = String(idAlumno).trim();
    const inscripcionDoc = await buscarInscripcionPorAlumnoYGrupo(
      idTrimmed,
      grupoId
    );

    if (!inscripcionDoc) {
      return res.status(404).json({
        error: "No se encontró la inscripción del alumno en ese grupo",
      });
    }

    if (String(inscripcionDoc.estatus || "").toLowerCase() !== "baja") {
      return res.status(409).json({
        error:
          "Solo se puede eliminar del sistema un curso que ya esté de baja. Usa «Dar de baja» primero.",
      });
    }

    const grupoCanonico = grupoIdDeInscripcion(inscripcionDoc);
    const pagoId = crearPagoId(idTrimmed, grupoCanonico);

    await Inscripcion.deleteOne({ _id: inscripcionDoc._id });

    const abonosResult = await Abono.deleteMany({ pagoId });
    const pagosResult = await Pago.deleteMany({
      $or: [
        { pagoId },
        { idAlumno: idTrimmed, grupoId: grupoCanonico },
      ],
    });

    const reagendacionesResult = await Reagendacion.deleteMany({
      idAlumno: idTrimmed,
      $or: [
        { idGrupoOrigen: grupoCanonico },
        { idGrupoNuevo: grupoCanonico },
      ],
    });

    res.status(200).json({
      ok: true,
      mensaje: "Curso de baja eliminado del sistema",
      inscripcionEliminada: true,
      abonosEliminados: abonosResult.deletedCount,
      pagosEliminados: pagosResult.deletedCount,
      reagendacionesEliminadas: reagendacionesResult.deletedCount,
    });
  } catch (error) {
    console.error("ERROR DELETE HISTORIAL INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al eliminar el curso del sistema",
      detalle: error.message,
    });
  }
});

router.delete("/:idAlumno/:grupoId", async (req, res) => {
  try {
    const { idAlumno, grupoId } = req.params;

    // Verificar si el grupoId es un grupo reagendado (idGrupoNuevo)
    const reagendacionDelGrupoNuevo = await Reagendacion.findOne({
      idAlumno,
      idGrupoNuevo: grupoId,
    }).lean();

    // Si es un grupo reagendado, solo eliminar la reagendación
    if (reagendacionDelGrupoNuevo) {
      const resultadoReagendaciones = await Reagendacion.deleteMany({
        idAlumno,
        idGrupoNuevo: grupoId,
      });

      return res.status(200).json({
        ok: true,
        mensaje: "Reagendación eliminada correctamente",
        reagendacionesEliminadas: resultadoReagendaciones.deletedCount,
      });
    }

    const inscripcionDoc = await buscarInscripcionPorAlumnoYGrupo(idAlumno, grupoId);

    if (!inscripcionDoc) {
      return res.status(404).json({
        error: "No se encontró la inscripción del alumno en ese grupo",
      });
    }

    const inscripcion = await Inscripcion.findById(inscripcionDoc._id);

    if (!inscripcion) {
      return res.status(404).json({
        error: "No se encontró la inscripción del alumno en ese grupo",
      });
    }

    if (String(inscripcion.estatus || "").toLowerCase() === "baja") {
      return res.status(409).json({
        error: "El alumno ya está dado de baja en este curso",
        detalle: {
          fechaBaja: inscripcion.fechaBaja || null,
        },
      });
    }

    const validacionPago = await validarPagoAlCorrienteParaBaja({
      idAlumno,
      grupoId,
      montoMensualidadInscripcion: inscripcion.montoMensualidad,
      fechaInicioCobro:
        inscripcion.fechaInicioPago ||
        inscripcion.fechaPago ||
        inscripcion.fechaInscripcion ||
        inscripcion.createdAt,
    });

    if (!validacionPago.ok) {
      const saldo = Number(
        validacionPago.saldoPendiente ?? validacionPago.saldoPeriodo ?? 0
      );
      const mes =
        validacionPago.periodo?.nombreMes || "el periodo vigente";

      let mensaje =
        validacionPago.motivo ||
        "No se puede dar de baja mientras existan pagos pendientes";

      if (saldo > 0) {
        mensaje = `No se puede dar de baja. Saldo pendiente: $${saldo.toFixed(2)}`;
      } else if (validacionPago.periodo) {
        mensaje = `No se puede dar de baja. Primero debe quedar pagado ${mes}.`;
      }

      return res.status(409).json({
        error: mensaje,
        detalle: {
          mesRequerido: validacionPago.periodo?.nombreMes || null,
          montoRequerido: validacionPago.montoRequerido,
          pagadoTotal: validacionPago.totalPagado,
          pagadoEnPeriodo: validacionPago.totalPagadoPeriodo,
          saldoPendiente: saldo,
          saldoPeriodo: validacionPago.saldoPeriodo,
          fechaLimite: validacionPago.periodo?.vencimiento || null,
        },
      });
    }

    const fechaBaja = new Date();
    const grupoCanonico = grupoIdDeInscripcion(inscripcion);
    const inscripcionBaja = await Inscripcion.findByIdAndUpdate(
      inscripcion._id,
      {
        $set: {
          estatus: "Baja",
          fechaBaja,
          motivoBaja: "Baja manual",
        },
      },
      { new: true, runValidators: false }
    );

    const pagoDesactivado = await desactivarPagoDeInscripcion(
      idAlumno,
      grupoCanonico || grupoId,
      fechaBaja
    );

    // Eliminar reagendaciones asociadas al grupo de origen
    const resultadoReagendaciones = await Reagendacion.deleteMany({
      idAlumno,
      $or: [
        // ✅ Normalizado: solo idGrupoOrigen
        { idGrupoOrigen: grupoId },
      ],
    });

    res.status(200).json({
      ok: true,
      mensaje: pagoDesactivado
        ? "Alumno dado de baja; sus pagos anteriores permanecen en el historial"
        : "Alumno dado de baja correctamente del grupo",
      inscripcionBaja: inscripcionBaja?.toObject?.() || inscripcionBaja,
      pagoDesactivado: pagoDesactivado || null,
      pagoValidado:
        validacionPago.pago && validacionPago.periodo
          ? {
              mesRequerido: validacionPago.periodo.nombreMes,
              montoRequerido: validacionPago.montoRequerido,
              pagadoEnPeriodo: validacionPago.totalPagadoPeriodo,
            }
          : null,
      reagendacionesEliminadas: resultadoReagendaciones.deletedCount,
    });
  } catch (error) {
    console.error("ERROR DELETE INSCRIPCION:", error);
    res.status(500).json({
      error: "Error al dar de baja al alumno del grupo",
      detalle: error.message,
    });
  }
});

export default router;
