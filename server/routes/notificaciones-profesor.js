import express from "express";
import {
  obtenerNotificacionesInAppProfesor,
  marcarNotificacionInAppLeida,
} from "../utils/notificaciones.js";

const router = express.Router();

function idProfesorDeSesion(req) {
  if (String(req.user?.rol || "").toLowerCase() === "profesor") {
    return String(req.user?.idProfesor || "").trim();
  }
  return String(req.query?.idProfesor || req.params?.idProfesor || "").trim();
}

/** Notificaciones in-app del profesor autenticado (o admin consultando por id) */
router.get("/mis", async (req, res) => {
  try {
    const idProfesor = idProfesorDeSesion(req);
    if (!idProfesor) {
      return res.status(400).json({ error: "No se encontró idProfesor" });
    }

    const data = await obtenerNotificacionesInAppProfesor(idProfesor);
    res.json(data);
  } catch (error) {
    console.error("ERROR GET NOTIFICACIONES PROFESOR:", error);
    res.status(500).json({
      error: "Error al obtener notificaciones",
      detalle: error.message,
    });
  }
});

router.patch("/:notificacionId/leida", async (req, res) => {
  try {
    const { notificacionId } = req.params;
    const idProfesor = idProfesorDeSesion(req);

    const actualizada = await marcarNotificacionInAppLeida(
      notificacionId,
      String(req.user?.rol || "").toLowerCase() === "profesor"
        ? idProfesor
        : undefined
    );

    if (!actualizada) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    res.json({ ok: true, notificacion: actualizada });
  } catch (error) {
    console.error("ERROR PATCH NOTIFICACION LEIDA:", error);
    res.status(500).json({
      error: "Error al marcar notificación",
      detalle: error.message,
    });
  }
});

export default router;
