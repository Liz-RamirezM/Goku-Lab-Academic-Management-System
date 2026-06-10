import { getProfesores } from "../services/api";
import {
  construirMensajeGrupoAsignacionCurso,
  construirMensajeGrupoAsignacionEInscripcion,
  construirMensajeGrupoInscripcionAlumno,
  construirMensajeGrupoReagendacion,
  mencionWhatsAppProfesor,
  type MencionProfesor,
} from "./mensajesWhatsAppProfesor";
import { normalizarTelefonoMencionWhatsApp } from "./mensajesWhatsApp";

export type ItemWhatsAppCola = {
  titulo: string;
  mensaje: string;
  telefono?: string;
  destinatarioLabel?: string;
  /** true = mensaje para grupo (sin teléfono individual) */
  esGrupoProfesores?: boolean;
};

export type ProfesorContacto = {
  idProfesor: string;
  nombre: string;
  telefono?: string;
};

export function normalizarProfesorContacto(prof: any): ProfesorContacto | null {
  const idProfesor = String(prof?.idProfesor || prof?.IdProfesor || "").trim();
  if (!idProfesor) return null;
  return {
    idProfesor,
    nombre: String(prof?.nombre || prof?.nombreProfesor || "").trim(),
    telefono: String(prof?.telefono || "").trim(),
  };
}

export async function cargarProfesorPorId(
  idProfesor: string
): Promise<ProfesorContacto | null> {
  const id = String(idProfesor || "").trim();
  if (!id) return null;
  const lista = await getProfesores();
  const prof = (lista || []).find(
    (p: any) => String(p.idProfesor || "").trim() === id
  );
  return prof ? normalizarProfesorContacto(prof) : null;
}

export async function cargarProfesoresPorIds(
  ids: string[]
): Promise<Map<string, ProfesorContacto>> {
  const unicos = [
    ...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
  ];
  const map = new Map<string, ProfesorContacto>();
  if (unicos.length === 0) return map;

  const lista = await getProfesores();
  for (const id of unicos) {
    const prof = (lista || []).find(
      (p: any) => String(p.idProfesor || "").trim() === id
    );
    const contacto = prof ? normalizarProfesorContacto(prof) : null;
    if (contacto) map.set(id, contacto);
  }
  return map;
}

function aMencion(prof: ProfesorContacto | null | undefined): MencionProfesor | null {
  if (!prof?.nombre?.trim()) return null;
  return { nombre: prof.nombre.trim(), telefono: prof.telefono?.trim() };
}

function mencionesDeProfesores(
  ...profs: Array<ProfesorContacto | null | undefined>
): MencionProfesor[] {
  const vistos = new Set<string>();
  const lista: MencionProfesor[] = [];

  for (const prof of profs) {
    const m = aMencion(prof);
    if (!m) continue;
    const clave =
      normalizarTelefonoMencionWhatsApp(m.telefono || "") ||
      m.nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(m);
  }

  return lista;
}

function etiquetaMenciones(profesores: MencionProfesor[]): string {
  return profesores.map((p) => mencionWhatsAppProfesor(p)).join(", ");
}

function itemGrupoProfesores(
  titulo: string,
  mensaje: string,
  profesoresInvolucrados: MencionProfesor[]
): ItemWhatsAppCola | null {
  if (!profesoresInvolucrados.length) return null;

  const lista = etiquetaMenciones(profesoresInvolucrados);
  const sinTelefono = profesoresInvolucrados.some(
    (p) => !normalizarTelefonoMencionWhatsApp(p.telefono || "")
  );

  return {
    titulo,
    mensaje,
    esGrupoProfesores: true,
    destinatarioLabel: [
      "Grupo de maestros",
      `Menciones: ${lista}`,
      sinTelefono
        ? "Falta teléfono de algún maestro — captúralo en Maestros para @mención real"
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function avisoGrupoAsignacionCurso(
  prof: ProfesorContacto | null | undefined,
  datos: {
    nombreCurso: string;
    idGrupo: string;
    diaClase: string;
    horaClase: string;
  }
): ItemWhatsAppCola | null {
  const menciones = mencionesDeProfesores(prof);
  if (!menciones.length) return null;

  return itemGrupoProfesores(
    "Aviso al grupo de maestros — curso asignado",
    construirMensajeGrupoAsignacionCurso({
      profesoresInvolucrados: menciones,
      ...datos,
    }),
    menciones
  );
}

export function avisoGrupoInscripcionAlumno(
  prof: ProfesorContacto | null | undefined,
  datos: {
    nombreAlumno: string;
    nombreCurso: string;
    idGrupo: string;
    fechaInscripcion?: string;
  }
): ItemWhatsAppCola | null {
  const menciones = mencionesDeProfesores(prof);
  if (!menciones.length) return null;

  return itemGrupoProfesores(
    "Aviso al grupo de maestros — nuevo alumno",
    construirMensajeGrupoInscripcionAlumno({
      profesoresInvolucrados: menciones,
      ...datos,
    }),
    menciones
  );
}

export function avisoGrupoAsignacionEInscripcion(
  prof: ProfesorContacto | null | undefined,
  datos: {
    nombreCurso: string;
    idGrupo: string;
    diaClase: string;
    horaClase: string;
    nombreAlumno: string;
    fechaInscripcion?: string;
  }
): ItemWhatsAppCola | null {
  const menciones = mencionesDeProfesores(prof);
  if (!menciones.length) return null;

  return itemGrupoProfesores(
    "Aviso al grupo de maestros — grupo e inscripción",
    construirMensajeGrupoAsignacionEInscripcion({
      profesoresInvolucrados: menciones,
      ...datos,
    }),
    menciones
  );
}

export async function avisoGrupoReagendacion(datos: {
  idProfesorOriginal?: string;
  idProfesorNuevo?: string;
  nombreAlumno: string;
  nombreCurso: string;
  fechaHoraOriginal: string;
  fechaHoraNueva: string;
}): Promise<ItemWhatsAppCola | null> {
  const idOriginal = String(datos.idProfesorOriginal || "").trim();
  const idNuevo = String(datos.idProfesorNuevo || "").trim();
  const ids =
    idOriginal && idNuevo && idOriginal === idNuevo
      ? [idOriginal]
      : [idOriginal, idNuevo].filter(Boolean);

  const mapa = await cargarProfesoresPorIds(ids);
  const profOrigen = idOriginal ? mapa.get(idOriginal) : undefined;
  const profDestino = idNuevo ? mapa.get(idNuevo) : undefined;

  const menciones = mencionesDeProfesores(profOrigen, profDestino);
  if (!menciones.length) return null;

  return itemGrupoProfesores(
    "Aviso al grupo de maestros — reagendación",
    construirMensajeGrupoReagendacion({
      profesoresInvolucrados: menciones,
      nombreAlumno: datos.nombreAlumno,
      nombreCurso: datos.nombreCurso,
      fechaOriginal: datos.fechaHoraOriginal,
      fechaNueva: datos.fechaHoraNueva,
      profesorOrigen: aMencion(profOrigen) || undefined,
      profesorDestino: aMencion(profDestino) || undefined,
    }),
    menciones
  );
}

/** @deprecated Usar avisoGrupoReagendacion */
export async function avisosReagendacionProfesores(datos: {
  idProfesorOriginal?: string;
  idProfesorNuevo?: string;
  nombreAlumno: string;
  nombreCurso: string;
  fechaHoraOriginal: string;
  fechaHoraNueva: string;
}): Promise<ItemWhatsAppCola[]> {
  const item = await avisoGrupoReagendacion(datos);
  return item ? [item] : [];
}

/** @deprecated Usar avisoGrupoAsignacionCurso */
export function avisoAsignacionGrupo(
  prof: ProfesorContacto | null | undefined,
  datos: {
    nombreCurso: string;
    idGrupo: string;
    diaClase: string;
    horaClase: string;
  }
): ItemWhatsAppCola | null {
  return avisoGrupoAsignacionCurso(prof, datos);
}

/** @deprecated Usar avisoGrupoInscripcionAlumno */
export function avisoInscripcionAlumno(
  prof: ProfesorContacto | null | undefined,
  datos: {
    nombreAlumno: string;
    nombreCurso: string;
    idGrupo: string;
    fechaInscripcion?: string;
  }
): ItemWhatsAppCola | null {
  return avisoGrupoInscripcionAlumno(prof, datos);
}
