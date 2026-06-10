import express from "express";
import Reagendacion from "../models/Reagendacion.js";
import Alumno from "../models/Alumno.js";
import Inscripcion from "../models/Inscripcion.js";
import Grupo from "../models/Grupo.js";
import Pago from "../models/Pago.js";
import Abono from "../models/Abono.js";
import { generarId } from "../utils/generarId.js";
import { parseFechaFlexible } from "../utils/parseFechas.js";
import { crearPagoId } from "../utils/pagos.js";
import {
  notificarReagendacionProfesor,
  notificarProfesoresReagendacion,
} from "../utils/notificaciones.js";

const router = express.Router();

const normalizar = (valor) => String(valor || "").trim().toUpperCase();

async function enviarNotificacionesReagendacion(reagendacionId, datos) {
  await notificarProfesoresReagendacion(datos);
  if (reagendacionId && datos.idProfesorOriginal) {
    await notificarReagendacionProfesor(reagendacionId, datos.idProfesorOriginal);
  }
  if (
    reagendacionId &&
    datos.idProfesorNuevo &&
    datos.idProfesorNuevo !== datos.idProfesorOriginal
  ) {
    await notificarReagendacionProfesor(reagendacionId, datos.idProfesorNuevo);
  }
}

const grupoIdDeInscripcion = (ins) =>
  String(ins?.grupoId || ins?.GrupoId || ins?.idGrupo || ins?.IdGrupo || "").trim();

const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

async function buscarGrupoPorId(grupoId) {
  const id = String(grupoId || "").trim();
  if (!id) return null;
  return Grupo.findOne({
    $or: [{ IdGrupo: id }, { idGrupo: id }],
  }).lean();
}

async function resolverGrupoDestinoPermanente({
  grupoNuevoFinal,
  nombreCurso,
  fechaNuevaDate,
  duracion,
  idProfesorNuevo,
  profesorNuevo,
}) {
  const existente = await buscarGrupoPorId(grupoNuevoFinal);
  if (existente) {
    return existente.IdGrupo || existente.idGrupo || grupoNuevoFinal;
  }

  const diaClase = DIAS_SEMANA[fechaNuevaDate.getDay()] || "Lunes";
  const horaClase = `${String(fechaNuevaDate.getHours()).padStart(2, "0")}:${String(
    fechaNuevaDate.getMinutes()
  ).padStart(2, "0")}`;
  const nuevoId = await generarId("grupo");

  const nuevoGrupo = new Grupo({
    IdGrupo: nuevoId,
    nombreCurso: nombreCurso || "",
    diaClase,
    horaClase,
    duracionClase: duracion || "2 horas",
    idProfesor: idProfesorNuevo || "",
    nombreProfesor: profesorNuevo || "Sin profesor",
    CapacidadMaxima: 8,
    Estatus: "Activo",
    fechaCreacion: new Date(),
  });

  await nuevoGrupo.save();
  return nuevoId;
}

async function moverPagoAlNuevoGrupo(
  idAlumno,
  grupoOrigen,
  grupoDestino,
  nombreCurso
) {
  const pagoIdViejo = crearPagoId(idAlumno, grupoOrigen);
  const pagoIdNuevo = crearPagoId(idAlumno, grupoDestino);

  const pago = await Pago.findOne({ pagoId: pagoIdViejo });
  if (!pago) return null;

  const pagoDestinoExistente = await Pago.findOne({ pagoId: pagoIdNuevo }).lean();
  if (pagoDestinoExistente) {
    return pagoDestinoExistente;
  }

  await Pago.findByIdAndUpdate(pago._id, {
    $set: {
      pagoId: pagoIdNuevo,
      grupoId: grupoDestino,
      nombreCurso: nombreCurso || pago.nombreCurso,
    },
  });

  await Abono.updateMany(
    { pagoId: pagoIdViejo },
    { $set: { pagoId: pagoIdNuevo } }
  );

  return { pagoIdAnterior: pagoIdViejo, pagoIdNuevo };
}

async function aplicarReagendacionPermanente({
  inscripcionOrigen,
  idAlumno,
  grupoOrigenCanonico,
  grupoNuevoFinal,
  nombreCurso,
  fechaNuevaDate,
  duracion,
  modalidad,
  idProfesorNuevo,
  profesorNuevo,
  inscripcionesAlumno,
}) {
  const grupoDestinoId = await resolverGrupoDestinoPermanente({
    grupoNuevoFinal,
    nombreCurso,
    fechaNuevaDate,
    duracion,
    idProfesorNuevo,
    profesorNuevo,
  });

  if (normalizar(grupoOrigenCanonico) === normalizar(grupoDestinoId)) {
    const error = new Error("El grupo destino es el mismo que el grupo origen");
    error.status = 400;
    throw error;
  }

  const yaInscritoDestino = inscripcionesAlumno.find(
    (ins) =>
      normalizar(grupoIdDeInscripcion(ins)) === normalizar(grupoDestinoId) &&
      String(ins.estatus || "Activa").trim().toLowerCase() !== "baja"
  );

  if (yaInscritoDestino) {
    const error = new Error(
      "El alumno ya está inscrito en el grupo destino. Usa inactivar en el grupo anterior primero."
    );
    error.status = 409;
    throw error;
  }

  const inscripcionActualizada = await Inscripcion.findByIdAndUpdate(
    inscripcionOrigen._id,
    {
      $set: {
        grupoId: grupoDestinoId,
        modalidad: modalidad || inscripcionOrigen.modalidad || "Presencial",
        fechaInscripcion: fechaNuevaDate,
      },
    },
    { new: true, runValidators: false }
  );

  const pagoMovido = await moverPagoAlNuevoGrupo(
    idAlumno,
    grupoOrigenCanonico,
    grupoDestinoId,
    nombreCurso
  );

  const reagendacionesEliminadas = await Reagendacion.deleteMany({
    idAlumno,
    $or: [
      { idGrupoOrigen: grupoOrigenCanonico },
      { idGrupoNuevo: grupoNuevoFinal },
      { idGrupoNuevo: grupoDestinoId },
    ],
  });

  return {
    grupoIdAnterior: grupoOrigenCanonico,
    grupoIdNuevo: grupoDestinoId,
    inscripcion: inscripcionActualizada,
    pagoMovido,
    reagendacionesEliminadas: reagendacionesEliminadas.deletedCount,
  };
}

router.get("/", async (req, res) => {
  try {
    const reagendaciones = await Reagendacion.find().lean();
    console.log("GET /api/reagendaciones:", reagendaciones);
    res.status(200).json(reagendaciones);
  } catch (error) {
    console.error("ERROR GET REAGENDACIONES:", error);
    res.status(500).json({
      error: "Error al obtener reagendaciones",
      detalle: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    console.log("BODY REAGENDACION RECIBIDO:", req.body);

    const {
      idAlumno,
      nombreAlumno,
      IdgrupoOrigen,
      idGrupoOrigen,
      idGrupoNuevo,
      nombreCurso,
      profesorOriginal,
      profesorNuevo,
      idProfesorOriginal,
      idProfesorNuevo,
      fechaHoraOriginal,
      fechaHoraNueva,
      duracion,
      modalidad,
      motivo,
      tipoReagendacion,
      comentario,
      comentarios,
      FechaMovimiento,
      estatus,
    } = req.body;

    // ✅ CAMBIO 1D: Normalizar nombre del campo a idGrupoOrigen
    const grupoOrigenFinal = idGrupoOrigen || IdgrupoOrigen || "";
    const grupoNuevoFinal = idGrupoNuevo || "";

    if (!idAlumno) {
      return res.status(400).json({ error: "Falta idAlumno" });
    }

    if (!grupoOrigenFinal) {
      return res.status(400).json({ error: "Falta idGrupoOrigen" });
    }

    if (!grupoNuevoFinal) {
      return res.status(400).json({ error: "Falta idGrupoNuevo" });
    }

    if (!fechaHoraOriginal) {
      return res.status(400).json({ error: "Falta fechaHoraOriginal" });
    }

    if (!fechaHoraNueva) {
      return res.status(400).json({ error: "Falta fechaHoraNueva" });
    }

    // ✅ CAMBIO 4: Usar parseador centralizado de fechas
    // Reemplaza la lógica inline de parseFecha con la versión unificada
    const fechaOriginalDate = parseFechaFlexible(fechaHoraOriginal);
    const fechaNuevaDate = parseFechaFlexible(fechaHoraNueva);

    if (!fechaOriginalDate) {
      return res.status(400).json({ 
        error: "fechaHoraOriginal no es una fecha válida (usa YYYY-MM-DD o ISO 8601)" 
      });
    }

    if (!fechaNuevaDate) {
      return res.status(400).json({ 
        error: "fechaHoraNueva no es una fecha válida (usa YYYY-MM-DD o ISO 8601)" 
      });
    }

    const idAlumnoLimpio = String(idAlumno).trim();

    const filtroIdAlumno = {
      $or: [
        { idAlumno: idAlumnoLimpio },
        { IdAlumno: idAlumnoLimpio },
        { id_alumno: idAlumnoLimpio },
        { "idAlumno ": idAlumnoLimpio },
      ],
    };

    // Inscripción en grupo origen (tolera mayúsculas y campos legacy)
    const inscripcionesAlumno = await Inscripcion.find(filtroIdAlumno).lean();

    const inscripcionOrigen = inscripcionesAlumno.find(
      (ins) => normalizar(grupoIdDeInscripcion(ins)) === normalizar(grupoOrigenFinal)
    );

    if (!inscripcionOrigen) {
      return res.status(404).json({
        error: `Alumno no está inscrito en el grupo origen "${grupoOrigenFinal}"`,
      });
    }

    const alumnoExiste = await Alumno.findOne(filtroIdAlumno).lean();

    if (!alumnoExiste) {
      console.warn(
        `[reagendaciones] ${idAlumnoLimpio} tiene inscripción pero no está en colección alumnos`
      );
    }

    const nombreAlumnoFinal =
      String(nombreAlumno || "").trim() ||
      String(alumnoExiste?.nombreAlumno || alumnoExiste?.nombre || "").trim() ||
      String(
        inscripcionOrigen.nombreAlumno ||
          inscripcionOrigen.nombre ||
          inscripcionOrigen.Alumno ||
          ""
      ).trim();

    if (!nombreAlumnoFinal) {
      return res.status(400).json({ error: "Falta nombreAlumno" });
    }

    const estatusInscripcion = String(inscripcionOrigen.estatus || "Activa")
      .trim()
      .toLowerCase();
    if (estatusInscripcion === "baja") {
      return res.status(400).json({
        error: "El alumno tiene este curso dado de baja. Reactívalo antes de reagendar.",
      });
    }

    const grupoOrigenCanonico = grupoIdDeInscripcion(inscripcionOrigen);
    const esPermanente =
      String(tipoReagendacion || "temporal").trim().toLowerCase() === "permanente";

    if (esPermanente) {
      try {
        const resultado = await aplicarReagendacionPermanente({
          inscripcionOrigen,
          idAlumno: idAlumnoLimpio,
          grupoOrigenCanonico,
          grupoNuevoFinal,
          nombreCurso,
          fechaNuevaDate,
          duracion,
          modalidad,
          idProfesorNuevo,
          profesorNuevo,
          inscripcionesAlumno,
        });

        const [grupoOrigen, grupoDestino] = await Promise.all([
          buscarGrupoPorId(grupoOrigenCanonico),
          buscarGrupoPorId(resultado.grupoIdNuevo),
        ]);

        await notificarProfesoresReagendacion({
          nombreAlumno: nombreAlumnoFinal,
          nombreCurso: nombreCurso || "",
          idGrupoOrigen: grupoOrigenCanonico,
          idGrupoNuevo: resultado.grupoIdNuevo,
          idProfesorOriginal: String(
            idProfesorOriginal || grupoOrigen?.idProfesor || ""
          ).trim(),
          idProfesorNuevo: String(
            idProfesorNuevo || grupoDestino?.idProfesor || ""
          ).trim(),
          fechaHoraOriginal: fechaOriginalDate,
          fechaHoraNueva: fechaNuevaDate,
        });

        return res.status(200).json({
          ok: true,
          permanente: true,
          mensaje:
            "Reagendación permanente aplicada. El alumno fue movido al nuevo grupo y ya no aparece en el horario original.",
          ...resultado,
        });
      } catch (errorPermanente) {
        const status = errorPermanente.status || 500;
        return res.status(status).json({
          error: errorPermanente.message || "Error al aplicar reagendación permanente",
        });
      }
    }

    const datosReagendacion = {
      idAlumno: idAlumnoLimpio,
      nombreAlumno: nombreAlumnoFinal,
      idGrupoOrigen: grupoOrigenCanonico,
      idGrupoNuevo: grupoNuevoFinal,
      nombreCurso: nombreCurso || "",
      profesorOriginal: profesorOriginal || "",
      profesorNuevo: profesorNuevo || "",
      idProfesorOriginal: idProfesorOriginal || "",
      idProfesorNuevo: idProfesorNuevo || "",
      // ✅ CAMBIO CRÍTICO: Fechas como Date, no como strings
      fechaHoraOriginal: fechaOriginalDate,
      fechaHoraNueva: fechaNuevaDate,
      duracion: duracion || "2 horas",
      modalidad: modalidad || "Presencial",
      motivo: motivo || "Reagendado desde sistema",
      tipoReagendacion: tipoReagendacion || "temporal", // ✅ NUEVO
      comentario: String(comentario || comentarios || "").trim(),
      FechaMovimiento: new Date(), // ✅ Ahora es Date, no string ISO
      estatus: estatus || "reagendado",
    };

    // ✅ CAMBIO: Buscar por idGrupoOrigen (campo normalizado)
    const actualizada = await Reagendacion.findOneAndUpdate(
      {
        idAlumno: idAlumnoLimpio,
        $or: [
          { idGrupoOrigen: grupoOrigenCanonico },
          { IdgrupoOrigen: grupoOrigenCanonico },
        ],
        fechaHoraOriginal: fechaOriginalDate,
      },
      { $set: datosReagendacion },
      { new: true }
    );

    if (actualizada) {
      console.log("REAGENDACION ACTUALIZADA:", actualizada);
      
      await enviarNotificacionesReagendacion(
        actualizada.ReagendacionId,
        datosReagendacion
      );
      
      return res.status(200).json(actualizada);
    }

    const nuevoReagendacionId = await generarId("reagendacion");

    const nuevaReagendacion = new Reagendacion({
      ReagendacionId: nuevoReagendacionId,
      ...datosReagendacion,
    });

    console.log("DOCUMENTO A GUARDAR:", nuevaReagendacion);

    const guardada = await nuevaReagendacion.save();

    console.log("REAGENDACION GUARDADA:", guardada);

    await enviarNotificacionesReagendacion(nuevoReagendacionId, datosReagendacion);

    res.status(201).json(guardada);
  } catch (error) {
    console.error("ERROR AL GUARDAR REAGENDACION:", error);
    res.status(500).json({
      error: "Error al guardar reagendación",
      detalle: error.message,
    });
  }
});

// Eliminar reagendación de un alumno específico (mantiene la inscripción)
router.delete("/alumno/:idAlumno/:idGrupoNuevo", async (req, res) => {
  try {
    const { idAlumno, idGrupoNuevo } = req.params;

    const eliminada = await Reagendacion.findOneAndDelete({
      idAlumno,
      idGrupoNuevo,
    });

    if (!eliminada) {
      return res.status(404).json({
        error: "No se encontró la reagendación del alumno",
      });
    }

    res.status(200).json({
      ok: true,
      mensaje: "Reagendación eliminada correctamente",
      reagendacion: eliminada,
    });
  } catch (error) {
    console.error("ERROR DELETE REAGENDACION ALUMNO:", error);
    res.status(500).json({
      error: "Error al eliminar reagendación",
      detalle: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const eliminada =
      (await Reagendacion.findByIdAndDelete(id)) ||
      (await Reagendacion.findOneAndDelete({ ReagendacionId: id }));

    if (!eliminada) {
      return res.status(404).json({
        error: "No se encontró la reagendación",
      });
    }

    res.status(200).json({
      ok: true,
      mensaje: "Reagendación eliminada correctamente",
      reagendacion: eliminada,
    });
  } catch (error) {
    console.error("ERROR DELETE REAGENDACION:", error);
    res.status(500).json({
      error: "Error al eliminar reagendación",
      detalle: error.message,
    });
  }
});

export default router;
