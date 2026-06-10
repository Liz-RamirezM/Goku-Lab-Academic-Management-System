const normalizar = (valor) => String(valor || "").trim().toUpperCase();

export function buildCursosMaps(cursos = []) {
  const porId = new Map();
  const porNombre = new Map();

  for (const c of cursos) {
    const id = normalizar(c.idCurso);
    const nombre = normalizar(c.nombreCurso);
    if (id) porId.set(id, c);
    if (nombre) porNombre.set(nombre, c);
  }

  return { porId, porNombre };
}

export function buildGruposMapPorId(grupos = []) {
  const map = new Map();
  for (const g of grupos) {
    const id = normalizar(g.IdGrupo || g.idGrupo || g.GrupoId);
    if (id) map.set(id, g);
  }
  return map;
}

/** Misma regla que el calendario: sin curso en catálogo no se pausa el cobro */
export function cursoEstaActivoEnCatalogo(
  { idCurso, nombreCurso },
  cursosMaps
) {
  const sinCurso =
    !String(nombreCurso || "").trim() && !String(idCurso || "").trim();
  if (sinCurso) return false;

  const curso =
    cursosMaps.porId.get(normalizar(idCurso)) ||
    cursosMaps.porNombre.get(normalizar(nombreCurso));

  if (!curso) return true;
  return String(curso.estatus || "Activo").trim().toLowerCase() === "activo";
}

export function cursoActivoParaPago(pago, gruposMap, cursosMaps) {
  const grupoId = normalizar(pago.grupoId);
  const grupo = gruposMap.get(grupoId);
  const idCurso = grupo?.idCurso || grupo?.IdCurso || "";
  const nombreCurso = pago.nombreCurso || grupo?.nombreCurso || "";

  return cursoEstaActivoEnCatalogo({ idCurso, nombreCurso }, cursosMaps);
}
