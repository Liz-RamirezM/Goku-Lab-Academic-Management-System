import express from "express";
import Curso from "../models/Curso.js";
import Grupo from "../models/Grupo.js";
import Inscripcion from "../models/Inscripcion.js";
import Counter from "../models/Counter.js";
import Pago from "../models/Pago.js";
import { generarId } from "../utils/generarId.js";
import {
  sincronizarInscripcionesConCursosCatalogo,
} from "../utils/inscripcionesCurso.js";

const router = express.Router();

// Genera el siguiente idCurso evitando choques con IDs ya existentes.
async function generarIdCursoSeguro() {
  const cursos = await Curso.find().select("idCurso").lean();
  let maxActual = 0;
  for (const c of cursos) {
    const match = String(c.idCurso || "").match(/(\d+)\s*$/);
    if (match) {
      maxActual = Math.max(maxActual, parseInt(match[1], 10));
    }
  }

  await Counter.findOneAndUpdate(
    { nombre: "curso" },
    { $max: { secuencia: maxActual } },
    { upsert: true }
  );

  return generarId("curso");
}

router.get("/", async (req, res) => {
  try {
    const cursos = await Curso.find().lean();
    res.status(200).json(cursos);
  } catch (error) {
    console.error("ERROR GET CURSOS:", error);
    res.status(500).json({
      error: "Error al obtener cursos",
      detalle: error.message,
    });
  }
});

// Dar de alta (crear) un nuevo curso
router.post("/", async (req, res) => {
  try {
    const nombreCurso = String(req.body?.nombreCurso || req.body?.nombre || "").trim();

    if (!nombreCurso) {
      return res.status(400).json({ error: "El nombre del curso es obligatorio" });
    }

    const yaExiste = await Curso.findOne({
      nombreCurso: new RegExp(
        `^${nombreCurso.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    });
    if (yaExiste) {
      return res.status(409).json({ error: "Ya existe un curso con ese nombre" });
    }

    const idCurso = await generarIdCursoSeguro();

    const curso = await Curso.create({
      idCurso,
      nombreCurso,
      estatus: "Activo",
    });

    res.status(201).json(curso);
  } catch (error) {
    console.error("ERROR POST CURSO:", error);
    res.status(500).json({
      error: "Error al crear el curso",
      detalle: error.message,
    });
  }
});

// Editar el nombre de un curso (se refleja en sus grupos y pagos)
router.patch("/:idCurso", async (req, res) => {
  try {
    const { idCurso } = req.params;
    const nombreCurso = String(req.body?.nombreCurso || req.body?.nombre || "").trim();

    if (!nombreCurso) {
      return res.status(400).json({ error: "El nombre del curso es obligatorio" });
    }

    const curso = await Curso.findOne({ idCurso });
    if (!curso) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    const duplicado = await Curso.findOne({
      idCurso: { $ne: idCurso },
      nombreCurso: new RegExp(
        `^${nombreCurso.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    });
    if (duplicado) {
      return res.status(409).json({ error: "Ya existe un curso con ese nombre" });
    }

    const nombreAnterior = curso.nombreCurso;
    curso.nombreCurso = nombreCurso;
    await curso.save();

    // Reflejar el nuevo nombre en grupos y pagos relacionados
    await Grupo.updateMany(
      { $or: [{ idCurso }, { nombreCurso: nombreAnterior }] },
      { $set: { idCurso, nombreCurso } }
    );
    await Pago.updateMany({ nombreCurso: nombreAnterior }, { $set: { nombreCurso } });

    res.status(200).json(curso);
  } catch (error) {
    console.error("ERROR PATCH NOMBRE CURSO:", error);
    res.status(500).json({
      error: "Error al editar el nombre del curso",
      detalle: error.message,
    });
  }
});

// Dar de alta / inactivar un curso (cambiar estatus)
router.patch("/:idCurso/estatus", async (req, res) => {
  try {
    const { idCurso } = req.params;
    const estatus = String(req.body?.estatus || "").trim();

    if (!["Activo", "Inactivo"].includes(estatus)) {
      return res.status(400).json({ error: "Estatus inválido (Activo o Inactivo)" });
    }

    const curso = await Curso.findOneAndUpdate(
      { idCurso },
      { $set: { estatus } },
      { new: true }
    );

    if (!curso) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    const syncInscripciones = await sincronizarInscripcionesConCursosCatalogo();

    const cursoJson =
      typeof curso.toObject === "function" ? curso.toObject() : curso;

    res.status(200).json({
      ...cursoJson,
      inscripcionesInactivadas: syncInscripciones.inactivadas || 0,
      inscripcionesReactivadas: syncInscripciones.reactivadas || 0,
    });
  } catch (error) {
    console.error("ERROR PATCH CURSO ESTATUS:", error);
    res.status(500).json({
      error: "Error al actualizar el estatus del curso",
      detalle: error.message,
    });
  }
});

// Borrar un curso. Los grupos que lo usaban quedan SIN curso asignado.
router.delete("/:idCurso", async (req, res) => {
  try {
    const { idCurso } = req.params;

    const curso = await Curso.findOne({ idCurso });
    if (!curso) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    const filtroGrupos = {
      $or: [{ idCurso }, { nombreCurso: curso.nombreCurso }],
    };

    const gruposAfectados = await Grupo.find(filtroGrupos)
      .select("IdGrupo idGrupo GrupoId nombreCurso diaClase horaClase")
      .lean();

    const idsGrupo = gruposAfectados
      .map((g) =>
        String(g.IdGrupo || g.idGrupo || g.GrupoId || "").trim()
      )
      .filter(Boolean);

    if (idsGrupo.length > 0) {
      const inscripciones = await Inscripcion.find({
        $or: idsGrupo.flatMap((id) => [
          { grupoId: id },
          { GrupoId: id },
          { idGrupo: id },
          { IdGrupo: id },
        ]),
      }).lean();

      if (inscripciones.length > 0) {
        const activas = inscripciones.filter(
          (ins) => String(ins.estatus || "Activa").trim().toLowerCase() !== "baja"
        );

        if (activas.length > 0) {
          return res.status(409).json({
            error:
              "No se puede eliminar el curso porque tiene alumnos activos en sus grupos. " +
              "Primero inactiva a cada alumno en ese curso; el alumno sigue en el sistema y en sus otros cursos.",
            inscripciones: activas.length,
            grupos: idsGrupo.length,
            alumnos: activas.map((ins) => ({
              idAlumno: ins.idAlumno,
              nombreAlumno: ins.nombreAlumno,
              grupoId: ins.grupoId || ins.GrupoId,
              estatus: ins.estatus || "Activa",
            })),
          });
        }
      }
    }

    if (gruposAfectados.length > 0) {
      await Grupo.updateMany(filtroGrupos, {
        $set: { idCurso: "", nombreCurso: "" },
      });
    }

    await Curso.deleteOne({ idCurso });

    res.status(200).json({
      ok: true,
      eliminado: idCurso,
      gruposAfectados: gruposAfectados.length,
      grupos: gruposAfectados,
    });
  } catch (error) {
    console.error("ERROR DELETE CURSO:", error);
    res.status(500).json({
      error: "Error al borrar el curso",
      detalle: error.message,
    });
  }
});

export default router;
