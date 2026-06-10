import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario.js";
import { getJwtSecret } from "../utils/jwtSecret.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const user = await Usuario.findOne({
      usuario: String(usuario).toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({ error: "El usuario no existe en Goku Lab" });
    }

    const passwordCorrecto = await bcrypt.compare(password, user.password);
    if (!passwordCorrecto) {
      return res.status(401).json({ error: "Usuario o contrase?a incorrectos" });
    }

    const rol = String(user.rol || "").toLowerCase();
    const idProfesor = String(user.idProfesor || "").trim();

    if (rol === "profesor" && !idProfesor) {
      return res.status(403).json({
        error:
          "Tu cuenta de profesor no est? vinculada al cat?logo. Contacta al administrador.",
      });
    }

    const token = jwt.sign(
      { id: user._id, rol: user.rol, usuario: user.usuario, idProfesor },
      getJwtSecret(),
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        usuario: user.usuario,
        nombreCompleto: user.nombreCompleto,
        rol: user.rol,
        idProfesor: idProfesor || undefined,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
