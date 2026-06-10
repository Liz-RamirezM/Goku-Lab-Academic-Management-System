/**
 * Limpia datos del sistema para empezar la carga real desde cero.
 *
 * SIEMPRE BORRA (con --confirm):
 *   reagendaciones, clases-canceladas, abonos, pago, inscripciones, grupos, alumnos
 *   Reinicia contadores: alumno, grupo, reagendacion
 *
 * CON --catalogos ADEMÁS BORRA:
 *   cursos, profesores
 *   usuarios con rol distinto de admin (profesor, recepcion, etc.)
 *   Reinicia contadores: curso, profesor
 *
 * SIEMPRE CONSERVA:
 *   usuarios con rol admin
 *
 * Uso:
 *   Vista previa:  node server/scripts/limpiarDatos.js
 *   Solo operación: node server/scripts/limpiarDatos.js --confirm
 *   Limpieza total: node server/scripts/limpiarDatos.js --confirm --catalogos
 *
 * IMPORTANTE: haz respaldo (mongodump) antes de --confirm.
 */
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

import Grupo from "../models/Grupo.js";
import Alumno from "../models/Alumno.js";
import Inscripcion from "../models/Inscripcion.js";
import Pago from "../models/Pago.js";
import Abono from "../models/Abono.js";
import Reagendacion from "../models/Reagendacion.js";
import ClaseCancelada from "../models/ClaseCancelada.js";
import Curso from "../models/Curso.js";
import Profesor from "../models/Profesor.js";
import Usuario from "../models/Usuario.js";
import Counter from "../models/Counter.js";

dotenv.config({ path: "./server/.env" });

const MODELOS_TRANSACCIONALES = [
  { nombre: "reagendaciones", modelo: Reagendacion },
  { nombre: "clases-canceladas", modelo: ClaseCancelada },
  { nombre: "abonos", modelo: Abono },
  { nombre: "pago", modelo: Pago },
  { nombre: "inscripciones", modelo: Inscripcion },
  { nombre: "grupos", modelo: Grupo },
  { nombre: "alumnos", modelo: Alumno },
];

const MODELOS_CATALOGO = [
  { nombre: "cursos", modelo: Curso },
  { nombre: "profesores", modelo: Profesor },
];

const COUNTERS_TRANSACCIONALES = ["alumno", "grupo", "reagendacion"];
const COUNTERS_CATALOGO = ["curso", "profesor"];

async function contarAdmins() {
  return Usuario.countDocuments({ rol: { $regex: /^admin$/i } });
}

async function contarUsuariosNoAdmin() {
  return Usuario.countDocuments({ rol: { $not: /^admin$/i } });
}

async function main() {
  const confirmar = process.argv.includes("--confirm");
  const borrarCatalogos = process.argv.includes("--catalogos");

  await connectDB();

  console.log("\n=== Estado actual ===\n");

  for (const { nombre, modelo } of MODELOS_TRANSACCIONALES) {
    const total = await modelo.countDocuments();
    console.log(`  ${nombre.padEnd(22)} ${total} documentos  → se borrará`);
  }

  if (borrarCatalogos) {
    console.log("");
    for (const { nombre, modelo } of MODELOS_CATALOGO) {
      const total = await modelo.countDocuments();
      console.log(`  ${nombre.padEnd(22)} ${total} documentos  → se borrará (--catalogos)`);
    }
    const noAdmin = await contarUsuariosNoAdmin();
    const admins = await contarAdmins();
    console.log(`  ${"usuarios (admin)".padEnd(22)} ${admins} documentos  → se conserva`);
    console.log(
      `  ${"usuarios (no admin)".padEnd(22)} ${noAdmin} documentos  → se borrará (--catalogos)`
    );
  } else {
    console.log("");
    console.log("  Catálogos (cursos, profesores): se conservan");
    console.log("  Usuarios: se conservan todos");
    console.log("  Tip: agrega --catalogos para borrar catálogos y cuentas no admin");
  }

  if (!confirmar) {
    console.log(
      "\n[VISTA PREVIA] No se borró nada.\n" +
        "Para ejecutar:\n" +
        "  node server/scripts/limpiarDatos.js --confirm\n" +
        "  node server/scripts/limpiarDatos.js --confirm --catalogos\n"
    );
    await mongoose.connection.close();
    process.exit(0);
  }

  console.log("\n=== Borrando datos transaccionales ===");
  for (const { nombre, modelo } of MODELOS_TRANSACCIONALES) {
    const { deletedCount } = await modelo.deleteMany({});
    console.log(`  ${nombre.padEnd(22)} ${deletedCount} eliminados`);
  }

  if (borrarCatalogos) {
    console.log("\n=== Borrando catálogos ===");
    for (const { nombre, modelo } of MODELOS_CATALOGO) {
      const { deletedCount } = await modelo.deleteMany({});
      console.log(`  ${nombre.padEnd(22)} ${deletedCount} eliminados`);
    }

    const usuariosResult = await Usuario.deleteMany({
      rol: { $not: /^admin$/i },
    });
    console.log(
      `  ${"usuarios (no admin)".padEnd(22)} ${usuariosResult.deletedCount} eliminados`
    );
  }

  console.log("\n=== Reiniciando contadores ===");
  const counters = borrarCatalogos
    ? [...COUNTERS_TRANSACCIONALES, ...COUNTERS_CATALOGO]
    : COUNTERS_TRANSACCIONALES;

  for (const nombre of counters) {
    await Counter.findOneAndUpdate(
      { nombre },
      { $set: { secuencia: 0 } },
      { upsert: true }
    );
    console.log(`  ${nombre.padEnd(22)} → secuencia 0`);
  }

  const adminsRestantes = await contarAdmins();
  console.log(
    "\nListo." +
      (borrarCatalogos
        ? "\n  • Catálogos vacíos\n  • Solo cuentas admin conservadas"
        : "\n  • Cursos y profesores conservados") +
      `\n  • Administradores activos: ${adminsRestantes}\n` +
      "  Sigue la checklist en guidelines/CARGA_INICIAL_GOKU_LAB.md\n"
  );

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Error durante la limpieza:", err.message);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
