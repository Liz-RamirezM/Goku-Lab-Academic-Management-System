import Inscripcion from "../models/Inscripcion.js";
import Grupo from "../models/Grupo.js";
import Curso from "../models/Curso.js";
import {
  buildCursosMaps,
  cursoEstaActivoEnCatalogo,
} from "./cursoCatalogo.js";
import {
  filtroInscripcionesPorGrupo,
  grupoIdDeInscripcion,
  idGrupoDeDocumentoGrupo,
  normalizarIdGrupo,
} from "./grupoInscripcion.js";
import {
  desactivarPagoDeInscripcion,
  reactivarPagoDeInscripcion,
} from "./pagos.js";

export const MOTIVO_BAJA_CURSO_INACTIVO = "Curso inactivo";

export function filtroGruposPorCurso(curso) {
  const idCurso = String(curso?.idCurso || "").trim();
  const nombreCurso = String(curso?.nombreCurso || "").trim();
  const or = [];

  if (idCurso) {
    or.push({ idCurso }, { IdCurso: idCurso });
  }
  if (nombreCurso) {
    const escaped = nombreCurso.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    or.push({ nombreCurso: new RegExp(`^${escaped}$`, "i") });
  }

  return or.length ? { $or: or } : { _id: null };
}

export async function idsGrupoDeCurso(curso) {
  const grupos = await Grupo.find(filtroGruposPorCurso(curso))
    .select("IdGrupo idGrupo GrupoId")
    .lean();

  return grupos.map((g) => idGrupoDeDocumentoGrupo(g)).filter(Boolean);
}

function esInscripcionActiva(ins) {
  return String(ins?.estatus || "Activa").trim().toLowerCase() === "activa";
}

function esBajaPorCursoInactivo(ins) {
  return (
    String(ins?.estatus || "").trim().toLowerCase() === "baja" &&
    String(ins?.motivoBaja || "").trim() === MOTIVO_BAJA_CURSO_INACTIVO
  );
}

function cursoActivoParaGrupo(grupo, cursosMaps) {
  if (!grupo) return false;
  return cursoEstaActivoEnCatalogo(
    {
      idCurso: grupo.idCurso || grupo.IdCurso || "",
      nombreCurso: grupo.nombreCurso || "",
    },
    cursosMaps
  );
}

/**
 * Inscripciones activas en grupos con curso inactivo o sin curso → Baja automática.
 * Inscripciones en Baja por curso inactivo → Activa cuando el curso vuelve o se reasigna otro activo.
 * No toca bajas manuales (sin motivoBaja de curso inactivo).
 */
export async function sincronizarInscripcionesConCursosCatalogo() {
  const [cursos, grupos, inscripciones] = await Promise.all([
    Curso.find().select("idCurso nombreCurso estatus").lean(),
    Grupo.find().select("IdGrupo idGrupo GrupoId idCurso IdCurso nombreCurso").lean(),
    Inscripcion.find().lean(),
  ]);

  const cursosMaps = buildCursosMaps(cursos);
  const gruposMap = new Map();
  for (const g of grupos) {
    const id = normalizarIdGrupo(idGrupoDeDocumentoGrupo(g));
    if (id) gruposMap.set(id, g);
  }

  let inactivadas = 0;
  let reactivadas = 0;
  const fechaBaja = new Date();

  for (const ins of inscripciones) {
    const grupoId = grupoIdDeInscripcion(ins);
    const idAlumno = String(ins.idAlumno || "").trim();
    if (!grupoId || !idAlumno) continue;

    const grupo = gruposMap.get(normalizarIdGrupo(grupoId));
    if (!grupo) continue;

    const cursoActivo = cursoActivoParaGrupo(grupo, cursosMaps);

    if (!cursoActivo && esInscripcionActiva(ins)) {
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Baja",
            fechaBaja,
            motivoBaja: MOTIVO_BAJA_CURSO_INACTIVO,
          },
        }
      );
      await desactivarPagoDeInscripcion(idAlumno, grupoId, fechaBaja);
      inactivadas += 1;
    } else if (cursoActivo && esBajaPorCursoInactivo(ins)) {
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Activa",
            fechaBaja: null,
            motivoBaja: "",
          },
        }
      );
      await reactivarPagoDeInscripcion(idAlumno, grupoId);
      reactivadas += 1;
    }
  }

  return { inactivadas, reactivadas };
}

export async function inactivarInscripcionesPorCursoInactivo(curso) {
  const idsGrupo = await idsGrupoDeCurso(curso);
  if (!idsGrupo.length) return { inactivadas: 0 };

  let inactivadas = 0;
  const fechaBaja = new Date();

  for (const grupoId of idsGrupo) {
    const inscripciones = await Inscripcion.find({
      ...filtroInscripcionesPorGrupo(grupoId),
      estatus: { $regex: /^activa$/i },
    }).lean();

    for (const ins of inscripciones) {
      const idAlumno = String(ins.idAlumno || "").trim();
      const gid = grupoIdDeInscripcion(ins) || grupoId;
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Baja",
            fechaBaja,
            motivoBaja: MOTIVO_BAJA_CURSO_INACTIVO,
          },
        }
      );
      await desactivarPagoDeInscripcion(idAlumno, gid, fechaBaja);
      inactivadas += 1;
    }
  }

  return { inactivadas };
}

export async function reactivarInscripcionesPorCursoActivo(curso) {
  const idsGrupo = await idsGrupoDeCurso(curso);
  if (!idsGrupo.length) return { reactivadas: 0 };

  let reactivadas = 0;

  for (const grupoId of idsGrupo) {
    const inscripciones = await Inscripcion.find({
      ...filtroInscripcionesPorGrupo(grupoId),
      estatus: { $regex: /^baja$/i },
      motivoBaja: MOTIVO_BAJA_CURSO_INACTIVO,
    }).lean();

    for (const ins of inscripciones) {
      const idAlumno = String(ins.idAlumno || "").trim();
      const gid = grupoIdDeInscripcion(ins) || grupoId;
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Activa",
            fechaBaja: null,
            motivoBaja: "",
          },
        }
      );
      await reactivarPagoDeInscripcion(idAlumno, gid);
      reactivadas += 1;
    }
  }

  return { reactivadas };
}

export async function sincronizarInscripcionesDeGrupo(grupoId) {
  const grupo = await Grupo.findOne({
    $or: [
      { IdGrupo: grupoId },
      { idGrupo: grupoId },
      { GrupoId: grupoId },
    ],
  }).lean();

  if (!grupo) return { inactivadas: 0, reactivadas: 0 };

  const cursos = await Curso.find().select("idCurso nombreCurso estatus").lean();
  const cursosMaps = buildCursosMaps(cursos);
  const cursoActivo = cursoActivoParaGrupo(grupo, cursosMaps);
  const idGrupoCanonico = idGrupoDeDocumentoGrupo(grupo) || String(grupoId).trim();

  const inscripciones = await Inscripcion.find(
    filtroInscripcionesPorGrupo(idGrupoCanonico)
  ).lean();

  let inactivadas = 0;
  let reactivadas = 0;
  const fechaBaja = new Date();

  for (const ins of inscripciones) {
    const idAlumno = String(ins.idAlumno || "").trim();
    const gid = grupoIdDeInscripcion(ins) || idGrupoCanonico;
    if (!idAlumno) continue;

    if (!cursoActivo && esInscripcionActiva(ins)) {
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Baja",
            fechaBaja,
            motivoBaja: MOTIVO_BAJA_CURSO_INACTIVO,
          },
        }
      );
      await desactivarPagoDeInscripcion(idAlumno, gid, fechaBaja);
      inactivadas += 1;
    } else if (cursoActivo && esBajaPorCursoInactivo(ins)) {
      await Inscripcion.updateOne(
        { _id: ins._id },
        {
          $set: {
            estatus: "Activa",
            fechaBaja: null,
            motivoBaja: "",
          },
        }
      );
      await reactivarPagoDeInscripcion(idAlumno, gid);
      reactivadas += 1;
    }
  }

  return { inactivadas, reactivadas };
}
