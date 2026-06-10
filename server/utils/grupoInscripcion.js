import Inscripcion from "../models/Inscripcion.js";
import Grupo from "../models/Grupo.js";

export function normalizarIdGrupo(id) {
  return String(id || "").trim().toUpperCase();
}

export function idGrupoDeDocumentoGrupo(grupo) {
  return String(grupo?.IdGrupo || grupo?.idGrupo || grupo?.GrupoId || "").trim();
}

export function grupoIdDeInscripcion(ins) {
  return String(
    ins?.grupoId || ins?.GrupoId || ins?.idGrupo || ins?.IdGrupo || ""
  ).trim();
}

/** Filtro insensible a mayúsculas para inscripciones de un grupo */
export function filtroInscripcionesPorGrupo(idGrupo) {
  const id = String(idGrupo || "").trim();
  if (!id) return { _id: null };

  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}$`, "i");

  return {
    $or: [
      { grupoId: regex },
      { GrupoId: regex },
      { idGrupo: regex },
      { IdGrupo: regex },
    ],
  };
}

export async function eliminarInscripcionesDeGrupo(...idsGrupo) {
  const ids = [
    ...new Set(
      idsGrupo.map((id) => String(id || "").trim()).filter(Boolean)
    ),
  ];

  let total = 0;
  for (const id of ids) {
    const res = await Inscripcion.deleteMany(filtroInscripcionesPorGrupo(id));
    total += res.deletedCount || 0;
  }
  return total;
}

/** Inscripciones cuyo grupo ya no existe (p. ej. grupo eliminado del calendario) */
export async function sincronizarInscripcionesHuerfanas() {
  const [inscripciones, grupos] = await Promise.all([
    Inscripcion.find().select("_id grupoId GrupoId idGrupo IdGrupo").lean(),
    Grupo.find().select("IdGrupo idGrupo GrupoId").lean(),
  ]);

  const idsGrupos = new Set(
    grupos
      .map((g) => normalizarIdGrupo(idGrupoDeDocumentoGrupo(g)))
      .filter(Boolean)
  );

  const idsEliminar = inscripciones
    .filter((ins) => {
      const gid = normalizarIdGrupo(grupoIdDeInscripcion(ins));
      return gid && !idsGrupos.has(gid);
    })
    .map((ins) => ins._id);

  if (!idsEliminar.length) return { eliminadas: 0 };

  const res = await Inscripcion.deleteMany({ _id: { $in: idsEliminar } });
  return { eliminadas: res.deletedCount || 0 };
}
