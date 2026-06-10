import express from "express";
import bcrypt from "bcryptjs";
import Profesor from "../models/Profesor.js";
import Usuario from "../models/Usuario.js";
import Grupo from "../models/Grupo.js";
import Counter from "../models/Counter.js";
import { generarId } from "../utils/generarId.js";

const router = express.Router();

// Genera el siguiente idProfesor evitando choques con IDs ya existentes.
// (El contador podía estar desincronizado y generar un PROF### duplicado.)
async function generarIdProfesorSeguro() {
  const profesores = await Profesor.find().select("idProfesor").lean();
  let maxActual = 0;
  for (const p of profesores) {
    const match = String(p.idProfesor || "").match(/(\d+)\s*$/);
    if (match) {
      maxActual = Math.max(maxActual, parseInt(match[1], 10));
    }
  }

  // Aseguramos que el contador esté al menos en el máximo existente
  await Counter.findOneAndUpdate(
    { nombre: "profesor" },
    { $max: { secuencia: maxActual } },
    { upsert: true }
  );

  return generarId("profesor");
}

router.get("/", async (req, res) => {
  try {
    const [profesores, cuentas] = await Promise.all([
      Profesor.find().lean(),
      Usuario.find({ rol: "profesor" }).select("usuario idProfesor").lean(),
    ]);

    const cuentaPorProfesor = new Map(
      cuentas
        .filter((u) => u.idProfesor)
        .map((u) => [String(u.idProfesor).trim(), String(u.usuario || "").trim()])
    );

    res.status(200).json(
      profesores.map((p) => ({
        ...p,
        usuarioAcceso: cuentaPorProfesor.get(String(p.idProfesor || "").trim()) || "",
      }))
    );
  } catch (error) {
    console.error("ERROR GET PROFESORES:", error);
    res.status(500).json({
      error: "Error al obtener profesores",
      detalle: error.message,
    });
  }
});

// Inscribir (crear) un nuevo maestro
router.post("/", async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const usuarioLogin = String(req.body?.usuario || "").toLowerCase().trim();
    const password = String(req.body?.password || "");
    const telefono = String(req.body?.telefono || "").trim();

    if (!nombre) {
      return res.status(400).json({ error: "El nombre del maestro es obligatorio" });
    }

    if (!usuarioLogin || usuarioLogin.length < 3) {
      return res.status(400).json({
        error: "El usuario de acceso es obligatorio (mínimo 3 caracteres)",
      });
    }

    if (!/^[a-z0-9._-]+$/.test(usuarioLogin)) {
      return res.status(400).json({
        error: "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        error: "La contraseña es obligatoria (mínimo 6 caracteres)",
      });
    }

    const yaExiste = await Profesor.findOne({
      nombre: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (yaExiste) {
      return res.status(409).json({ error: "Ya existe un maestro con ese nombre" });
    }

    const usuarioDuplicado = await Usuario.findOne({ usuario: usuarioLogin }).lean();
    if (usuarioDuplicado) {
      return res.status(409).json({ error: "Ese usuario de acceso ya está en uso" });
    }

    const idProfesor = await generarIdProfesorSeguro();

    const profesor = await Profesor.create({
      idProfesor,
      nombre,
      telefono,
      estatus: "Activo",
    });

    const passwordHash = await bcrypt.hash(password, 10);
    await Usuario.create({
      usuario: usuarioLogin,
      password: passwordHash,
      nombreCompleto: nombre,
      rol: "profesor",
      idProfesor,
    });

    res.status(201).json({
      ...profesor.toObject(),
      usuarioAcceso: usuarioLogin,
    });
  } catch (error) {
    console.error("ERROR POST PROFESOR:", error);
    res.status(500).json({
      error: "Error al crear el maestro",
      detalle: error.message,
    });
  }
});

// Restablecer contraseña de acceso (solo administrador vía ruta protegida)
router.patch("/:idProfesor/password", async (req, res) => {
  try {
    const { idProfesor } = req.params;
    const password = String(req.body?.password || "");

    if (!password || password.length < 6) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres",
      });
    }

    const profesor = await Profesor.findOne({ idProfesor });
    if (!profesor) {
      return res.status(404).json({ error: "Maestro no encontrado" });
    }

    const usuario = await Usuario.findOne({ idProfesor, rol: "profesor" });
    if (!usuario) {
      return res.status(404).json({
        error: "Este maestro no tiene cuenta de acceso configurada",
      });
    }

    usuario.password = await bcrypt.hash(password, 10);
    await usuario.save();

    res.status(200).json({
      ok: true,
      idProfesor,
      usuarioAcceso: usuario.usuario,
    });
  } catch (error) {
    console.error("ERROR PATCH PROFESOR PASSWORD:", error);
    res.status(500).json({
      error: "Error al restablecer la contraseña",
      detalle: error.message,
    });
  }
});

// Editar nombre y/o teléfono de un maestro (el nombre se refleja en sus grupos)
router.patch("/:idProfesor", async (req, res) => {
  try {
    const { idProfesor } = req.params;
    const tieneNombre = req.body?.nombre !== undefined;
    const tieneTelefono = req.body?.telefono !== undefined;
    const nombre = tieneNombre ? String(req.body.nombre).trim() : undefined;
    const telefono = tieneTelefono ? String(req.body.telefono).trim() : undefined;

    if (!tieneNombre && !tieneTelefono) {
      return res.status(400).json({ error: "Indica nombre o teléfono a actualizar" });
    }

    if (tieneNombre && !nombre) {
      return res.status(400).json({ error: "El nombre del maestro es obligatorio" });
    }

    const profesor = await Profesor.findOne({ idProfesor });
    if (!profesor) {
      return res.status(404).json({ error: "Maestro no encontrado" });
    }

    let nombreAnterior = profesor.nombre;

    if (tieneNombre && nombre !== profesor.nombre) {
      const duplicado = await Profesor.findOne({
        idProfesor: { $ne: idProfesor },
        nombre: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });
      if (duplicado) {
        return res.status(409).json({ error: "Ya existe un maestro con ese nombre" });
      }
      profesor.nombre = nombre;
    }

    if (tieneTelefono) {
      profesor.telefono = telefono;
    }

    await profesor.save();

    if (tieneNombre && nombre !== nombreAnterior) {
      await Usuario.updateMany(
        { idProfesor, rol: "profesor" },
        { $set: { nombreCompleto: profesor.nombre } }
      );

      await Grupo.updateMany(
        { $or: [{ idProfesor }, { nombreProfesor: nombreAnterior }] },
        { $set: { idProfesor, nombreProfesor: profesor.nombre } }
      );
    }

    res.status(200).json(profesor);
  } catch (error) {
    console.error("ERROR PATCH PROFESOR:", error);
    res.status(500).json({
      error: "Error al editar el maestro",
      detalle: error.message,
    });
  }
});

// Dar de alta / baja un maestro (cambiar estatus)
router.patch("/:idProfesor/estatus", async (req, res) => {
  try {
    const { idProfesor } = req.params;
    const estatus = String(req.body?.estatus || "").trim();

    if (!["Activo", "Inactivo"].includes(estatus)) {
      return res.status(400).json({ error: "Estatus inválido (Activo o Inactivo)" });
    }

    const profesor = await Profesor.findOneAndUpdate(
      { idProfesor },
      { $set: { estatus } },
      { new: true }
    );

    if (!profesor) {
      return res.status(404).json({ error: "Maestro no encontrado" });
    }

    res.status(200).json(profesor);
  } catch (error) {
    console.error("ERROR PATCH PROFESOR ESTATUS:", error);
    res.status(500).json({
      error: "Error al actualizar el estatus del maestro",
      detalle: error.message,
    });
  }
});

// Dar de baja del sistema (eliminar) un maestro.
// Si tenía grupos asignados, esos grupos quedan SIN profesor asignado.
router.delete("/:idProfesor", async (req, res) => {
  try {
    const { idProfesor } = req.params;

    const profesor = await Profesor.findOne({ idProfesor });
    if (!profesor) {
      return res.status(404).json({ error: "Maestro no encontrado" });
    }

    // Grupos que dependían de este maestro (por id o por nombre)
    const filtroGrupos = {
      $or: [{ idProfesor }, { nombreProfesor: profesor.nombre }],
    };

    const gruposAfectados = await Grupo.find(filtroGrupos)
      .select("IdGrupo nombreCurso diaClase horaClase")
      .lean();

    // Se dejan sin profesor asignado (no se borran los grupos)
    if (gruposAfectados.length > 0) {
      await Grupo.updateMany(filtroGrupos, {
        $set: { idProfesor: "", nombreProfesor: "" },
      });
    }

    await Profesor.deleteOne({ idProfesor });
    await Usuario.deleteMany({ idProfesor, rol: "profesor" });

    res.status(200).json({
      ok: true,
      eliminado: idProfesor,
      gruposAfectados: gruposAfectados.length,
      grupos: gruposAfectados,
    });
  } catch (error) {
    console.error("ERROR DELETE PROFESOR:", error);
    res.status(500).json({
      error: "Error al dar de baja al maestro",
      detalle: error.message,
    });
  }
});

export default router;