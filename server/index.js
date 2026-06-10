import "dotenv/config";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { verifyToken, requireRole } from "./middleware/auth.js";
import gruposRoutes from "./routes/grupos.js";
import inscripcionesRoutes from "./routes/inscripciones.js";
import reagendacionesRoutes from "./routes/reagendaciones.js";
import calendarioRoutes from "./routes/calendario.js";
import clasesCanceladasRoutes from "./routes/clases-canceladas.js";
import notificacionesRoutes from "./routes/notificaciones.js";
import notificacionesProfesorRoutes from "./routes/notificaciones-profesor.js";
import notasClaseSesionRoutes from "./routes/notas-clase-sesion.js";
import pagosRoutes from "./routes/pagos.js";
import abonosRouter from "./routes/abonos.js";
import profesoresRoutes from "./routes/profesores.js";
import alumnosRoutes from "./routes/alumnos.js";
import cursosRoutes from "./routes/cursos.js";
import authRoutes from "./routes/auth.js";

dotenv.config({ path: "./server/.env" });

const app = express();

const corsOrigins =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ||
  [];

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" && corsOrigins.length > 0
        ? corsOrigins
        : true,
    credentials: true,
  })
);
app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.json({ ok: true, message: "API funcionando 🚀" });
});

app.use("/api/auth", authRoutes);

const apiProtegida = express.Router();
apiProtegida.use(verifyToken);

// Solo lectura del calendario: accesible para admin y profesor
apiProtegida.use("/calendario", requireRole("admin", "profesor"), calendarioRoutes);

// Recursos de administración: exclusivos del rol admin
const soloAdmin = requireRole("admin");
apiProtegida.use("/grupos", soloAdmin, gruposRoutes);
apiProtegida.use("/inscripciones", soloAdmin, inscripcionesRoutes);
apiProtegida.use("/reagendaciones", soloAdmin, reagendacionesRoutes);
apiProtegida.use("/clases-canceladas", soloAdmin, clasesCanceladasRoutes);
apiProtegida.use("/notificaciones", soloAdmin, notificacionesRoutes);
apiProtegida.use(
  "/notificaciones-profesor",
  requireRole("admin", "profesor"),
  notificacionesProfesorRoutes
);
apiProtegida.use(
  "/notas-clase-sesion",
  requireRole("admin", "profesor"),
  notasClaseSesionRoutes
);
apiProtegida.use("/pagos", soloAdmin, pagosRoutes);
apiProtegida.use("/abonos", soloAdmin, abonosRouter);
apiProtegida.use("/profesores", soloAdmin, profesoresRoutes);
apiProtegida.use("/alumnos", soloAdmin, alumnosRoutes);
apiProtegida.use("/cursos", soloAdmin, cursosRoutes);

app.use("/api", apiProtegida);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
