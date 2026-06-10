import express from "express";
import Grupo from "../models/Grupo.js";
import Inscripcion from "../models/Inscripcion.js";
import Reagendacion from "../models/Reagendacion.js";
import ClaseCancelada from "../models/ClaseCancelada.js";
import Profesor from "../models/Profesor.js";
import Curso from "../models/Curso.js";
import { sincronizarInscripcionesConCursosCatalogo } from "../utils/inscripcionesCurso.js";
import { extraerFecha } from "../utils/parseFechas.js";
import { calcularHoraFinDesdeDuracion } from "../utils/duracionClase.js";

const router = express.Router();

const normalizar = (valor) => String(valor || "").trim().toUpperCase();

const idReagendacion = (r) => String(r.ReagendacionId || r._id || "");

const limpiarFecha = (valor) => {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (!isNaN(fecha.getTime())) return fecha.toISOString();
  return String(valor);
};

const parseFechaFlexible = (valor) => {
  if (!valor) return null;

  const directa = new Date(valor);
  if (!isNaN(directa.getTime())) return directa;

  const matchRaro = String(valor).match(
    /([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}).*?(\d{1,2}:\d{2})$/
  );

  if (matchRaro) {
    const fechaTexto = matchRaro[1];
    const horaTexto = matchRaro[2];
    const base = new Date(fechaTexto);

    if (!isNaN(base.getTime())) {
      const [h, m] = horaTexto.split(":").map(Number);
      base.setHours(h, m, 0, 0);
      return base;
    }
  }

  const matchSql = String(valor).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
  );

  if (matchSql) {
    const [, y, mo, d, h, mi] = matchSql;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      0,
      0
    );
  }

  return null;
};

const obtenerHoraDesdeFecha = (valor) => {
  const fecha = parseFechaFlexible(valor);
  if (!fecha) return "";

  return `${fecha.getHours().toString().padStart(2, "0")}:${fecha
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

const obtenerDiaDesdeFecha = (valor) => {
  const fecha = parseFechaFlexible(valor);
  if (!fecha) return "";

  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];

  return dias[fecha.getDay()];
};

router.get("/", async (req, res) => {
  try {
    await sincronizarInscripcionesConCursosCatalogo();
    const gruposRaw = await Grupo.find().lean();
    const inscripcionesRaw = await Inscripcion.find().lean();
    const reagendacionesRaw = (await Reagendacion.find().lean()).filter(
      (r) =>
        String(r.tipoReagendacion || "temporal").trim().toLowerCase() !==
        "permanente"
    );
    const clasesCanceladasRaw = await ClaseCancelada.find({ estatus: "activa" }).lean();
    const profesoresRaw = await Profesor.find().lean();
    const cursosRaw = await Curso.find().lean();

    const gruposMap = new Map();
    const profesoresMap = new Map();
    const profesoresNombreMap = new Map();
    const cursosMap = new Map();
    const cursosNombreMap = new Map();
    
    // ✅ CAMBIO 5: Crear mapa de clases canceladas para búsqueda rápida
    // Estructura: "${grupoId}|YYYY-MM-DD" → true
    const clasesCanceladasMap = new Map();
    for (const cancelacion of clasesCanceladasRaw) {
      const fechaStr = extraerFecha(cancelacion.fecha);
      if (!fechaStr) continue;
      const key = `${normalizar(cancelacion.idGrupo)}|${fechaStr}`;
      clasesCanceladasMap.set(key, true);
    }

    for (const profesor of profesoresRaw) {
      const idProfesor = profesor.idProfesor || profesor.IdProfesor || "";
      const nombreProfesor = profesor.nombre || profesor.nombreProfesor || "";

      if (idProfesor) {
        profesoresMap.set(normalizar(idProfesor), profesor);
      }

      if (nombreProfesor) {
        profesoresNombreMap.set(normalizar(nombreProfesor), profesor);
      }
    }

    for (const curso of cursosRaw) {
      const idCurso = curso.idCurso || curso.IdCurso || "";
      const nombreCurso = curso.nombreCurso || curso.nombre || "";

      if (idCurso) {
        cursosMap.set(normalizar(idCurso), curso);
      }
      if (nombreCurso) {
        cursosNombreMap.set(normalizar(nombreCurso), curso);
      }
    }

    for (const grupo of gruposRaw) {
      const key = normalizar(grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId);
      if (key && !gruposMap.has(key)) {
        gruposMap.set(key, grupo);
      }
    }

    const grupos = Array.from(gruposMap.values());

    const resolverProfesor = ({ idProfesor, nombreProfesor }) => {
      const profesorPorId = profesoresMap.get(normalizar(idProfesor || ""));
      if (profesorPorId?.nombre) {
        return profesorPorId;
      }

      const profesorPorNombre = profesoresNombreMap.get(
        normalizar(nombreProfesor || "")
      );
      if (profesorPorNombre?.nombre) {
        return profesorPorNombre;
      }

      return null;
    };

    const obtenerNombreProfesorCompleto = ({ idProfesor, nombreProfesor }) => {
      const profesor = resolverProfesor({ idProfesor, nombreProfesor });
      return profesor?.nombre || nombreProfesor || "";
    };

    // Una clase "requiere atención" en su profesor cuando no hay profesor asignado
    // o cuando el profesor del catálogo está Inactivo. Si el profesor tiene nombre
    // pero no está en el catálogo, NO se marca (puede ser un dato heredado).
    const profesorEstaActivo = ({ idProfesor, nombreProfesor }) => {
      const sinProfesor =
        !String(nombreProfesor || "").trim() && !String(idProfesor || "").trim();
      if (sinProfesor) return false;

      const profesor = resolverProfesor({ idProfesor, nombreProfesor });
      if (!profesor) return true; // tiene nombre pero no está catalogado
      return String(profesor.estatus || "Activo").toLowerCase() === "activo";
    };

    const resolverCurso = ({ idCurso, nombreCurso }) => {
      const porId = cursosMap.get(normalizar(idCurso || ""));
      if (porId) return porId;
      const porNombre = cursosNombreMap.get(normalizar(nombreCurso || ""));
      if (porNombre) return porNombre;
      return null;
    };

    // Igual que con profesores: se marca si no hay curso o si el curso está Inactivo.
    const cursoEstaActivo = ({ idCurso, nombreCurso }) => {
      const sinCurso =
        !String(nombreCurso || "").trim() && !String(idCurso || "").trim();
      if (sinCurso) return false;

      const curso = resolverCurso({ idCurso, nombreCurso });
      if (!curso) return true; // tiene nombre pero no está catalogado
      return String(curso.estatus || "Activo").toLowerCase() === "activo";
    };

    const clasesBase = grupos.map((grupo) => {
      const grupoKey = normalizar(
        grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId
      );

      const idProfesorGrupo =
        grupo.idProfesor || grupo.IdProfesor || grupo.profesorId || "";

      const nombreProfesorCompleto = obtenerNombreProfesorCompleto({
        idProfesor: idProfesorGrupo,
        nombreProfesor: grupo.nombreProfesor,
      });

      const profesorActivo = profesorEstaActivo({
        idProfesor: idProfesorGrupo,
        nombreProfesor: grupo.nombreProfesor,
      });

      const cursoActivo = cursoEstaActivo({
        idCurso: grupo.idCurso || grupo.IdCurso || "",
        nombreCurso: grupo.nombreCurso,
      });

      const alumnosBase = inscripcionesRaw
        .filter((ins) => {
          const estatus = String(ins.estatus || "").trim().toLowerCase();
          if (estatus === "baja") return false;

          const grupoInscripcion = normalizar(
            ins.GrupoId || ins.grupoId || ins.idGrupo || ins.IdGrupo
          );

          // La visibilidad por fecha la resuelve el calendario (por evento)
          return grupoInscripcion === grupoKey;
        })
        .map((a) => ({
          idAlumno: a.idAlumno || a.id_alumno || "",
          nombreAlumno: a.nombreAlumno || a.nombre || a.Alumno || "",
          modalidad: a.modalidad || "Presencial",
          comentarioAlumno: a.comentarioAlumno || "",
          grupoIdInscripcion:
            grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId || "",
          inscripcionCreadaEn: a.fechaInscripcion || a.createdAt || a.updatedAt || null,
          reagendacion: null,
        }));

      // ✅ CAMBIO 1: Usar normalización consistente de idGrupoOrigen
      const alumnosOrigen = reagendacionesRaw
        .filter((r) => {
          const grupoOrigen = normalizar(r.idGrupoOrigen); // ✅ Solo usa idGrupoOrigen (normalizado)
          return grupoOrigen === grupoKey;
        })
        .map((r) => {
          const grupoNuevo = gruposMap.get(
            normalizar(
              r.idGrupoNuevo || r.IdgrupoNuevo || r.IdGrupoNuevo || ""
            )
          );

          const grupoOrigenIns =
        r.idGrupoOrigen ||
        r.IdgrupoOrigen ||
        r.IdGrupoOrigen ||
        "";
          const insOrigenAlumno = inscripcionesRaw.find(
            (ins) =>
              normalizar(ins.idAlumno || ins.id_alumno || "") ===
                normalizar(r.idAlumno || "") &&
              normalizar(
                ins.GrupoId || ins.grupoId || ins.idGrupo || ins.IdGrupo || ""
              ) === normalizar(grupoOrigenIns)
          );

          return {
            idAlumno: r.idAlumno || "",
            nombreAlumno: r.nombreAlumno || "",
            modalidad: insOrigenAlumno?.modalidad || r.modalidad || "Presencial",
            comentarioAlumno: insOrigenAlumno?.comentarioAlumno || "",
            grupoIdInscripcion: grupoOrigenIns,
            reagendacion: {
              tipo: "origen",
              reagendacionId: idReagendacion(r),
              comentario: r.comentario || r.comentarios || "",
              // ✅ CAMBIO: Ahora fechas son Date objects, procesar directamente
              fechaHoraOriginal: r.fechaHoraOriginal ? new Date(r.fechaHoraOriginal).toISOString() : "",
              fechaHoraNueva: r.fechaHoraNueva ? new Date(r.fechaHoraNueva).toISOString() : "",
              horaClaseNueva:
                (grupoNuevo &&
                  (grupoNuevo.horaClase || grupoNuevo["horaClase "])) ||
                obtenerHoraDesdeFecha(r.fechaHoraNueva) ||
                "",
            },
          };
        });

      const alumnosMap = new Map();

      for (const alumno of alumnosBase) {
        alumnosMap.set(normalizar(alumno.idAlumno), alumno);
      }

      for (const alumno of alumnosOrigen) {
        const keyAlumno = normalizar(alumno.idAlumno);

        if (alumnosMap.has(keyAlumno)) {
          const existente = alumnosMap.get(keyAlumno);
          alumnosMap.set(keyAlumno, {
            ...existente,
            reagendacion: alumno.reagendacion,
          });
        } else {
          alumnosMap.set(keyAlumno, alumno);
        }
      }

      const alumnos = Array.from(alumnosMap.values());

      // ✅ CAMBIO 9: Calcular hora fin basada en duración
      const horaInicio = grupo.horaClase || grupo["horaClase "] || "";
      const duracion = grupo.duracionClase || "2 horas";
      const horaFin = calcularHoraFinDesdeDuracion(horaInicio, duracion);

      return {
        tipo: "base",
        idGrupo: grupo.IdGrupo || grupo.idGrupo || grupo.GrupoId,
        nombreCurso: grupo.nombreCurso,
        diaClase: grupo.diaClase || "",
        horaClase: horaInicio,
        horaFin: horaFin, // ✅ NUEVO: Hora de fin calculada
        duracion: duracion,
        fechaCreacion: grupo.fechaCreacion || null,
        comentarioGrupo: grupo.comentario || grupo.comentarioGrupo || "",
        idCurso: grupo.idCurso || grupo.IdCurso || "",
        cursoActivo: cursoActivo,
        idProfesor: idProfesorGrupo,
        nombreProfesor: nombreProfesorCompleto,
        profesorActivo: profesorActivo,
        capacidadMaxima: grupo.CapacidadMaxima,
        alumnosInscritos: alumnos.length,
        alumnos,
        estatus: grupo.Estatus,
      };
    });

    const reagendacionesAgrupadas = {};

    for (const r of reagendacionesRaw) {
      const idGrupoNuevo = r.idGrupoNuevo || ""; // ✅ Normalizado

      const grupoNuevo = gruposMap.get(normalizar(idGrupoNuevo));
      
      // ✅ CAMBIO: Ahora r.fechaHoraNueva es un Date object
      const fechaNuevaObj = r.fechaHoraNueva ? new Date(r.fechaHoraNueva) : null;
      
      const idProfesorNuevo =
        r.idProfesorNuevo ||
        r.IdProfesorNuevo ||
        (grupoNuevo &&
          (grupoNuevo.idProfesor ||
            grupoNuevo.IdProfesor ||
            grupoNuevo.profesorId)) ||
        "";

      const nombreProfesorNuevo = obtenerNombreProfesorCompleto({
        idProfesor: idProfesorNuevo,
        nombreProfesor:
          r.profesorNuevo || (grupoNuevo && grupoNuevo.nombreProfesor) || "",
      });

      const horaClaseNueva =
        (grupoNuevo &&
          (grupoNuevo.horaClase || grupoNuevo["horaClase "])) ||
        (fechaNuevaObj && !isNaN(fechaNuevaObj.getTime()) 
          ? `${String(fechaNuevaObj.getHours()).padStart(2, "0")}:${String(fechaNuevaObj.getMinutes()).padStart(2, "0")}`
          : "") ||
        "";

      const diaClaseNueva =
        (grupoNuevo && grupoNuevo.diaClase) ||
        (fechaNuevaObj && !isNaN(fechaNuevaObj.getTime())
          ? ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][fechaNuevaObj.getDay()]
          : "") ||
        "";

      const fechaKey =
        fechaNuevaObj && !isNaN(fechaNuevaObj.getTime())
          ? `${fechaNuevaObj.getFullYear()}-${String(fechaNuevaObj.getMonth() + 1).padStart(2, "0")}-${String(fechaNuevaObj.getDate()).padStart(2, "0")}`
          : "";

      const key = `${normalizar(idGrupoNuevo)}|${fechaKey}|${horaClaseNueva}`;

      if (!reagendacionesAgrupadas[key]) {
        reagendacionesAgrupadas[key] = {
          tipo: "reagendacion",
          idGrupo:
            idGrupoNuevo ||
            `REAGENDACION_${Object.keys(reagendacionesAgrupadas).length}`,
          nombreCurso:
            r.nombreCurso || (grupoNuevo && grupoNuevo.nombreCurso) || "",
          diaClase: diaClaseNueva,
          horaClase: horaClaseNueva,
          comentarioGrupo:
            (grupoNuevo &&
              (grupoNuevo.comentario || grupoNuevo.comentarioGrupo)) ||
            "",
          idProfesor: idProfesorNuevo,
          nombreProfesor: nombreProfesorNuevo,
          capacidadMaxima: (grupoNuevo && grupoNuevo.CapacidadMaxima) || 8,
          alumnos: [],
          reagendacionIds: [],
          reagendacionId: "",
          idGrupoOrigen:
            r.idGrupoOrigen ||
            r.IdgrupoOrigen ||
            r.IdGrupoOrigen ||
            "",
          estatus: "Reagendado",
          esVirtual: !grupoNuevo,
        };
      }

      const reagendacionId = idReagendacion(r);
      if (
        reagendacionId &&
        !reagendacionesAgrupadas[key].reagendacionIds.includes(reagendacionId)
      ) {
        reagendacionesAgrupadas[key].reagendacionIds.push(reagendacionId);
        if (!reagendacionesAgrupadas[key].reagendacionId) {
          reagendacionesAgrupadas[key].reagendacionId = reagendacionId;
        }
      }

      const grupoOrigen = gruposMap.get(
        normalizar(r.idGrupoOrigen || "") // ✅ Normalizado
      );

      const idProfesorOriginal =
        r.idProfesorOriginal ||
        r.IdProfesorOriginal ||
        (grupoOrigen &&
          (grupoOrigen.idProfesor ||
            grupoOrigen.IdProfesor ||
            grupoOrigen.profesorId)) ||
        "";

      // ✅ CAMBIO: Parsear fechas que ahora son Date objects
      const grupoOrigenIns =
        r.idGrupoOrigen ||
        r.IdgrupoOrigen ||
        r.IdGrupoOrigen ||
        "";
      const insOrigen = inscripcionesRaw.find(
        (ins) =>
          normalizar(ins.idAlumno || ins.id_alumno || "") ===
            normalizar(r.idAlumno || "") &&
          normalizar(
            ins.GrupoId || ins.grupoId || ins.idGrupo || ins.IdGrupo || ""
          ) === normalizar(grupoOrigenIns)
      );

      reagendacionesAgrupadas[key].alumnos.push({
        idAlumno: r.idAlumno || "",
        nombreAlumno: r.nombreAlumno || "",
        modalidad: insOrigen?.modalidad || r.modalidad || "Presencial",
        comentarioAlumno: insOrigen?.comentarioAlumno || "",
        grupoIdInscripcion: grupoOrigenIns,
        reagendacion: {
          tipo: "destino",
          reagendacionId,
          comentario: r.comentario || r.comentarios || "",
          fechaHoraOriginal: r.fechaHoraOriginal ? new Date(r.fechaHoraOriginal).toISOString() : "",
          fechaHoraNueva: r.fechaHoraNueva ? new Date(r.fechaHoraNueva).toISOString() : "",
          idProfesorOriginal: idProfesorOriginal,
          horaClaseOriginal:
            (grupoOrigen &&
              (grupoOrigen.horaClase || grupoOrigen["horaClase "])) ||
            (r.fechaHoraOriginal && new Date(r.fechaHoraOriginal) 
              ? `${String(new Date(r.fechaHoraOriginal).getHours()).padStart(2, "0")}:${String(new Date(r.fechaHoraOriginal).getMinutes()).padStart(2, "0")}`
              : "") ||
            "",
        },
      });
    }

    const clasesReagendadas = Object.values(reagendacionesAgrupadas).map(
      (grupo) => ({
        ...grupo,
        alumnosInscritos: grupo.alumnos.length,
      })
    );

    let clasesBaseResp = clasesBase;
    let reagendacionesResp = clasesReagendadas;
    let clasesCanceladasResp = clasesCanceladasRaw.map((cancelacion) => ({
      grupoId: cancelacion.idGrupo,
      fecha: extraerFecha(cancelacion.fecha),
      claseCanceladaId: cancelacion.claseCanceladaId,
      motivo: cancelacion.motivo || "",
    }));

    const rolUsuario = String(req.user?.rol || "").toLowerCase();
    if (rolUsuario === "profesor") {
      const idProfesorSesion = normalizar(req.user?.idProfesor || "");
      if (!idProfesorSesion) {
        return res.status(403).json({
          error: "Tu cuenta no está vinculada a un maestro del catálogo",
        });
      }

      clasesBaseResp = clasesBase.filter(
        (clase) => normalizar(clase.idProfesor) === idProfesorSesion
      );

      reagendacionesResp = clasesReagendadas.filter(
        (clase) => normalizar(clase.idProfesor) === idProfesorSesion
      );

      const gruposVisibles = new Set(
        [
          ...clasesBaseResp.map((c) => normalizar(c.idGrupo)),
          ...reagendacionesResp.map((c) => normalizar(c.idGrupo)),
        ].filter(Boolean)
      );

      clasesCanceladasResp = clasesCanceladasResp.filter((cancelacion) =>
        gruposVisibles.has(normalizar(cancelacion.grupoId))
      );
    }

    res.json({
      clasesBase: clasesBaseResp,
      reagendaciones: reagendacionesResp,
      clasesCanceladas: clasesCanceladasResp,
    });
  } catch (error) {
    console.error("Error al construir calendario:", error);
    res.status(500).json({ error: "Error al construir calendario" });
  }
});

export default router;
