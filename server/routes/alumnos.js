import express from "express";
import Alumno from "../models/Alumno.js";
import { generarId } from "../utils/generarId.js";
import Inscripcion from "../models/Inscripcion.js";
import Pago from "../models/Pago.js";
import { validarPagoAlCorrienteParaBaja } from "../utils/pagos.js";

const router = express.Router();

function normalizar(valor) {
  return String(valor || "").trim().toUpperCase();
}

const filtroIdAlumno = (idAlumno) => {
  const id = String(idAlumno).trim();
  return {
    $or: [
      { idAlumno: id },
      { "idAlumno ": id },
      { IdAlumno: id },
      { id_alumno: id },
    ],
  };
};

function estatusAlumnoInactivo(estatus) {
  const e = String(estatus || "Activo").trim().toLowerCase();
  return e === "inactivo" || e === "baja";
}

function esInscripcionActiva(estatus) {
  return String(estatus || "Activa").trim().toLowerCase() !== "baja";
}

/** Alumno visible al inscribir: activo y con al menos un curso vigente (o sin historial). */
function alumnoEsInscribible(alumno, resumenInscripciones) {
  if (estatusAlumnoInactivo(alumno?.estatus)) return false;

  const id = String(alumno?.idAlumno || "").trim();
  if (!id) return false;

  const stats = resumenInscripciones.get(id);
  if (!stats) return true;
  return stats.activas > 0;
}

async function resumenInscripcionesPorAlumno(idsAlumnos) {
  const ids = [...new Set(idsAlumnos.map((id) => String(id || "").trim()).filter(Boolean))];
  const resumen = new Map();

  if (ids.length === 0) return resumen;

  const inscripciones = await Inscripcion.find(
    { idAlumno: { $in: ids } },
    { idAlumno: 1, estatus: 1 }
  ).lean();

  for (const ins of inscripciones) {
    const id = String(ins.idAlumno || "").trim();
    if (!id) continue;

    if (!resumen.has(id)) {
      resumen.set(id, { total: 0, activas: 0 });
    }

    const stats = resumen.get(id);
    stats.total += 1;
    if (esInscripcionActiva(ins.estatus)) {
      stats.activas += 1;
    }
  }

  return resumen;
}

router.get("/", async (req, res) => {
  try {
    const { q, paraInscripcion } = req.query;

    let filtro = {};

    if (q) {
      filtro = {
        $or: [
          { nombreAlumno: { $regex: q, $options: "i" } },
          { nombre: { $regex: q, $options: "i" } },
          { idAlumno: { $regex: q, $options: "i" } },
          { "idAlumno ": { $regex: q, $options: "i" } },
          { id_alumno: { $regex: q, $options: "i" } },
        ],
      };
    }

    const alumnosRaw = await Alumno.find(filtro).lean();

    const alumnosNormalizados = alumnosRaw.map((alumno) => ({
      ...alumno,
      idAlumno:
        alumno.idAlumno ||
        alumno["idAlumno "] ||
        alumno.IdAlumno ||
        alumno.id_alumno ||
        "",
      nombreAlumno:
        alumno.nombreAlumno ||
        alumno.nombre ||
        alumno.Alumno ||
        "",
    }));

    const mapaUnicos = new Map();

    for (const alumno of alumnosNormalizados) {
      const key = normalizar(alumno.nombreAlumno);

      if (!mapaUnicos.has(key)) {
        mapaUnicos.set(key, alumno);
        continue;
      }

      const existente = mapaUnicos.get(key);
      const existenteTieneId = Boolean(existente?.idAlumno);
      const actualTieneId = Boolean(alumno?.idAlumno);

      if (!existenteTieneId && actualTieneId) {
        mapaUnicos.set(key, alumno);
      }
    }

    const alumnosUnicos = Array.from(mapaUnicos.values()).filter(
      (alumno) => alumno.nombreAlumno
    );

    let alumnosRespuesta = alumnosUnicos;

    const soloInscribibles =
      paraInscripcion === "1" ||
      String(paraInscripcion || "").toLowerCase() === "true";

    if (soloInscribibles) {
      const resumen = await resumenInscripcionesPorAlumno(
        alumnosUnicos.map((a) => a.idAlumno)
      );
      alumnosRespuesta = alumnosUnicos.filter((alumno) =>
        alumnoEsInscribible(alumno, resumen)
      );
    }

    res.status(200).json(alumnosRespuesta);
  } catch (error) {
    console.error("ERROR GET ALUMNOS:", error);
    res.status(500).json({
      error: "Error al obtener alumnos",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno/nota", async (req, res) => {
  try {
    const { idAlumno } = req.params;
    const observaciones = String(
      req.body?.observaciones ?? req.body?.nota ?? req.body?.comentarios ?? ""
    ).trim();

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    const idTrimmed = String(idAlumno).trim();

    const actualizado = await Alumno.findOneAndUpdate(
      {
        $or: [
          { idAlumno: idTrimmed },
          { "idAlumno ": idTrimmed },
          { IdAlumno: idTrimmed },
          { id_alumno: idTrimmed },
        ],
      },
      { $set: { observaciones } },
      { new: true }
    ).lean();

    if (!actualizado) {
      return res.status(404).json({ error: "No se encontró el alumno" });
    }

    res.status(200).json({
      ok: true,
      alumno: {
        ...actualizado,
        idAlumno:
          actualizado.idAlumno ||
          actualizado["idAlumno "] ||
          actualizado.IdAlumno ||
          actualizado.id_alumno ||
          idTrimmed,
        nombreAlumno:
          actualizado.nombreAlumno || actualizado.nombre || "",
        observaciones: actualizado.observaciones || "",
      },
    });
  } catch (error) {
    console.error("ERROR PATCH NOTA ALUMNO:", error);
    res.status(500).json({
      error: "Error al guardar la nota del alumno",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno", async (req, res) => {
  try {
    const { idAlumno } = req.params;

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    const idTrimmed = String(idAlumno).trim();
    const telefono = req.body?.telefono;
    const tutor = req.body?.tutor;
    const estatus = req.body?.estatus;
    const nombreAlumno = req.body?.nombreAlumno;

    const update = {};
    if (telefono !== undefined) update.telefono = String(telefono || "").trim();
    if (tutor !== undefined) update.tutor = String(tutor || "").trim();
    if (estatus !== undefined) update.estatus = String(estatus || "").trim();
    if (req.body?.observaciones !== undefined) {
      update.observaciones = String(req.body?.observaciones || "").trim();
    }
    if (nombreAlumno !== undefined) {
      const nombreLimpio = String(nombreAlumno || "").trim();
      if (!nombreLimpio) {
        return res.status(400).json({ error: "El nombre del alumno no puede estar vacío" });
      }
      update.nombreAlumno = nombreLimpio;
      update.nombre = nombreLimpio;
    }

    const filtroAlumno = {
      $or: [
        { idAlumno: idTrimmed },
        { "idAlumno ": idTrimmed },
        { IdAlumno: idTrimmed },
        { id_alumno: idTrimmed },
      ],
    };

    const actualizado = await Alumno.findOneAndUpdate(
      filtroAlumno,
      { $set: update },
      { new: true }
    ).lean();

    if (!actualizado) {
      return res.status(404).json({ error: "No se encontró el alumno" });
    }

    if (update.nombreAlumno) {
      const filtroInscripcion = filtroIdAlumno(idTrimmed);
      await Inscripcion.updateMany(filtroInscripcion, {
        $set: { nombreAlumno: update.nombreAlumno },
      });
      await Pago.updateMany(filtroInscripcion, {
        $set: { nombreAlumno: update.nombreAlumno },
      });
    }

    res.status(200).json({
      ok: true,
      alumno: {
        ...actualizado,
        idAlumno:
          actualizado.idAlumno ||
          actualizado["idAlumno "] ||
          actualizado.IdAlumno ||
          actualizado.id_alumno ||
          idTrimmed,
        nombreAlumno: actualizado.nombreAlumno || actualizado.nombre || "",
      },
    });
  } catch (error) {
    console.error("ERROR PATCH ALUMNOS:", error);
    res.status(500).json({
      error: "Error al actualizar alumno",
      detalle: error.message,
    });
  }
});

router.patch("/:idAlumno/desactivar", async (req, res) => {
  try {
    const { idAlumno } = req.params;

    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    const idTrimmed = String(idAlumno).trim();

    // Validar que no tenga pagos pendientes en cursos activos
    const inscripcionesActivas = await Inscripcion.find({
      idAlumno: idTrimmed,
      estatus: { $ne: "Baja" },
    }).lean();

    for (const ins of inscripcionesActivas) {
      const validacion = await validarPagoAlCorrienteParaBaja({
        idAlumno: idTrimmed,
        grupoId: ins.grupoId,
        montoMensualidadInscripcion: ins.montoMensualidad,
        fechaInicioCobro:
          ins.fechaInicioPago ||
          ins.fechaPago ||
          ins.fechaInscripcion ||
          ins.createdAt,
      });

      if (!validacion.ok) {
        const saldo = Number(validacion.saldoPendiente || 0);
        let mensaje =
          validacion.motivo ||
          "No se puede desactivar mientras existan pagos pendientes";
        if (saldo > 0) {
          mensaje = `No se puede desactivar. Saldo pendiente: $${saldo.toFixed(2)}`;
        }

        return res.status(409).json({
          error: mensaje,
          detalle: {
            grupoId: ins.grupoId,
            mesRequerido: validacion.periodo?.nombreMes || null,
            saldoPendiente: saldo,
            saldoPeriodo: validacion.saldoPeriodo,
          },
        });
      }
    }

    const actualizado = await Alumno.findOneAndUpdate(
      {
        $or: [
          { idAlumno: idTrimmed },
          { "idAlumno ": idTrimmed },
          { IdAlumno: idTrimmed },
          { id_alumno: idTrimmed },
        ],
      },
      { $set: { estatus: "Inactivo" } },
      { new: true }
    ).lean();

    if (!actualizado) {
      return res.status(404).json({ error: "No se encontró el alumno" });
    }

    res.status(200).json({ ok: true, alumno: actualizado });
  } catch (error) {
    console.error("ERROR DESACTIVAR ALUMNO:", error);
    res.status(500).json({
      error: "Error al desactivar alumno",
      detalle: error.message,
    });
  }
});

router.delete("/:idAlumno", async (req, res) => {
  try {
    const { idAlumno } = req.params;
    if (!idAlumno || !String(idAlumno).trim()) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    const idTrimmed = String(idAlumno).trim();

    const activas = await Inscripcion.countDocuments({
      ...filtroIdAlumno(idTrimmed),
      estatus: { $ne: "Baja" },
    });

    if (activas > 0) {
      return res.status(409).json({
        error: "No se puede eliminar el alumno porque tiene cursos activos",
        detalle: { inscripcionesActivas: activas },
      });
    }

    const eliminado = await Alumno.findOneAndDelete({
      $or: filtroIdAlumno(idTrimmed).$or,
    }).lean();

    const inscripcionesResult = await Inscripcion.deleteMany(
      filtroIdAlumno(idTrimmed)
    );
    const pagosResult = await Pago.deleteMany(filtroIdAlumno(idTrimmed));

    if (
      !eliminado &&
      inscripcionesResult.deletedCount === 0 &&
      pagosResult.deletedCount === 0
    ) {
      return res.status(404).json({
        error: "No se encontró el alumno ni historial de inscripciones",
      });
    }

    res.status(200).json({
      ok: true,
      alumno: eliminado,
      historialLimpiado: !eliminado,
      inscripcionesEliminadas: inscripcionesResult.deletedCount,
      pagosEliminados: pagosResult.deletedCount,
      mensaje: eliminado
        ? "Alumno eliminado"
        : "Se quitó el historial del listado (el alumno ya no estaba en el catálogo)",
    });
  } catch (error) {
    console.error("ERROR DELETE ALUMNO:", error);
    res.status(500).json({
      error: "Error al eliminar alumno",
      detalle: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nombreAlumno, telefono, tutor, observaciones, estatus } = req.body;

    if (!nombreAlumno || !String(nombreAlumno).trim()) {
      return res.status(400).json({
        error: "Falta nombreAlumno",
      });
    }

    const nuevoIdAlumno = await generarId("alumno");
    const nombreLimpio = String(nombreAlumno).trim();

    const nuevoAlumno = new Alumno({
      idAlumno: nuevoIdAlumno,
      nombreAlumno: nombreLimpio,
      nombre: nombreLimpio,
      telefono: telefono || "",
      tutor: tutor || "",
      observaciones: observaciones || "",
      estatus: estatus || "Activo",
    });

    const guardado = await nuevoAlumno.save();

    res.status(201).json({
      ...guardado.toObject(),
      idAlumno: guardado.idAlumno || "",
      nombreAlumno: guardado.nombreAlumno || guardado.nombre || "",
    });
  } catch (error) {
    console.error("ERROR POST ALUMNOS:", error);
    res.status(500).json({
      error: "Error al crear alumno",
      detalle: error.message,
    });
  }
});

export default router;