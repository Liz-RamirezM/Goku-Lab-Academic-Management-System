import express from "express";
import Grupo from "../models/Grupo.js";
import NotaClaseSesion from "../models/NotaClaseSesion.js";

const router = express.Router();

function normalizarFechaClase(fecha) {
  const texto = String(fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return texto;
}

const filtroGrupoPorId = (grupoId) => ({
  $or: [{ IdGrupo: grupoId }, { idGrupo: grupoId }, { GrupoId: grupoId }],
});

const idGrupoDeDocumento = (grupo) =>
  String(grupo?.IdGrupo || grupo?.idGrupo || grupo?.GrupoId || "").trim();

/** Lectura de notas por sesión — admin y profesor */
router.get("/:grupoId", async (req, res) => {
  try {
    const { grupoId } = req.params;
    const fechaClase = normalizarFechaClase(req.query.fecha);
    if (!fechaClase) {
      return res.status(400).json({ error: "Falta fecha válida (YYYY-MM-DD)" });
    }

    const idGrupoCanonico = String(grupoId || "").trim();
    const grupo = await Grupo.findOne(filtroGrupoPorId(grupoId)).lean();
    const idGrupoFinal = grupo ? idGrupoDeDocumento(grupo) : idGrupoCanonico;

    const rol = String(req.user?.rol || "").toLowerCase();
    if (rol === "profesor") {
      const idProfesorSesion = String(req.user?.idProfesor || "").trim();
      if (grupo) {
        const idProfesorGrupo = String(grupo.idProfesor || "").trim();
        if (idProfesorGrupo && idProfesorGrupo !== idProfesorSesion) {
          return res.status(403).json({
            error: "No tienes acceso a la nota de esta clase",
          });
        }
      }
    }

    const nota = await NotaClaseSesion.findOne({
      idGrupo: idGrupoFinal,
      fechaClase,
    }).lean();

    res.json({
      ok: true,
      idGrupo: idGrupoFinal,
      fechaClase,
      notaHtml: nota?.notaHtml || "",
    });
  } catch (error) {
    console.error("ERROR GET NOTA SESION:", error);
    res.status(500).json({
      error: "Error al obtener la nota de la clase",
      detalle: error.message,
    });
  }
});

export default router;
