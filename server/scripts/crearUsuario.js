/**
 * Crea (o actualiza) un usuario del sistema con su contraseña encriptada.
 *
 * Uso:
 *   node server/scripts/crearUsuario.js <usuario> <password> "<Nombre Completo>" <rol>
 *
 * Ejemplos:
 *   node server/scripts/crearUsuario.js admin.goku Secret123 "Administrador Goku" admin
 *   node server/scripts/crearUsuario.js maestro.juan Clase123 "Juan Pérez" profesor PROF001
 *
 * Roles válidos: admin | profesor | recepcion
 * Para profesor, el 5º argumento idProfesor es obligatorio (ej. PROF001).
 */
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import Usuario from "../models/Usuario.js";

dotenv.config({ path: "./server/.env" });

const ROLES_VALIDOS = ["admin", "profesor", "recepcion"];

async function main() {
  const [, , usuarioArg, passwordArg, nombreArg, rolArg, idProfesorArg] =
    process.argv;

  if (!usuarioArg || !passwordArg || !nombreArg || !rolArg) {
    console.error(
      'Uso: node server/scripts/crearUsuario.js <usuario> <password> "<Nombre Completo>" <rol> [idProfesor]'
    );
    process.exit(1);
  }

  const rol = String(rolArg).toLowerCase();
  if (!ROLES_VALIDOS.includes(rol)) {
    console.error(`Rol inválido "${rolArg}". Usa uno de: ${ROLES_VALIDOS.join(", ")}`);
    process.exit(1);
  }

  const idProfesor = String(idProfesorArg || "").trim();
  if (rol === "profesor" && !idProfesor) {
    console.error(
      'Para rol profesor debes indicar el idProfesor del catálogo (ej. PROF001)'
    );
    process.exit(1);
  }

  await connectDB();

  const usuario = String(usuarioArg).toLowerCase().trim();
  const passwordHash = await bcrypt.hash(passwordArg, 10);

  const existente = await Usuario.findOne({ usuario });

  if (existente) {
    existente.password = passwordHash;
    existente.nombreCompleto = nombreArg;
    existente.rol = rol;
    if (rol === "profesor") existente.idProfesor = idProfesor;
    await existente.save();
    console.log(`Usuario actualizado: ${usuario} (rol: ${rol})`);
  } else {
    await Usuario.create({
      usuario,
      password: passwordHash,
      nombreCompleto: nombreArg,
      rol,
      ...(rol === "profesor" ? { idProfesor } : {}),
    });
    console.log(`Usuario creado: ${usuario} (rol: ${rol})`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Error al crear el usuario:", err.message);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
