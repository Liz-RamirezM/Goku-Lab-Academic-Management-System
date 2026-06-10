import { mencionProfesorEnTexto, negritaWhatsApp, normalizarTelefonoMencionWhatsApp } from "./mensajesWhatsApp";

export type MencionProfesor = {
  nombre: string;
  telefono?: string;
};

/** @mención en grupo por teléfono WhatsApp México */
export function mencionWhatsAppProfesor(prof: MencionProfesor): string {
  return mencionProfesorEnTexto({
    nombre: prof.nombre,
    telefono: prof.telefono,
  });
}

function encabezadoGrupo(profesores: MencionProfesor[]): string {
  const vistos = new Set<string>();
  const lineas: string[] = [];

  for (const prof of profesores) {
    const clave =
      normalizarTelefonoMencionWhatsApp(prof.telefono || "") ||
      String(prof.nombre || "").trim().toLowerCase();
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);

    const mencion = mencionWhatsAppProfesor(prof);
    if (mencion) lineas.push(mencion);
  }

  return lineas.length ? `${lineas.join("\n")}\n\n` : "";
}

function formatearFechaNotificacion(fecha: string | Date | undefined): string {
  if (!fecha) return "";
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function construirMensajeGrupoAsignacionCurso(datos: {
  profesoresInvolucrados: MencionProfesor[];
  nombreCurso: string;
  idGrupo: string;
  diaClase: string;
  horaClase: string;
}): string {
  return (
    encabezadoGrupo(datos.profesoresInvolucrados) +
    [
      "📢 *Goku Lab — curso asignado*",
      "",
      `Se asignó el curso *${datos.nombreCurso}* (${datos.idGrupo}).`,
      `Horario: ${datos.diaClase} a las ${datos.horaClase}.`,
      "",
      "Revisa tu calendario en el sistema.",
    ].join("\n")
  );
}

export function construirMensajeGrupoInscripcionAlumno(datos: {
  profesoresInvolucrados: MencionProfesor[];
  nombreAlumno: string;
  nombreCurso: string;
  idGrupo: string;
  fechaInscripcion?: string;
}): string {
  const fechaTexto = formatearFechaNotificacion(datos.fechaInscripcion);
  const lineas = [
    "📢 *Goku Lab — nuevo alumno inscrito*",
    "",
    `*${datos.nombreAlumno}* fue inscrito en *${datos.nombreCurso}* (${datos.idGrupo}).`,
  ];
  if (fechaTexto) lineas.push(`Inicia clases: ${fechaTexto}.`);
  lineas.push("", "Revisa tu calendario en el sistema.");
  return encabezadoGrupo(datos.profesoresInvolucrados) + lineas.join("\n");
}

export function construirMensajeGrupoAsignacionEInscripcion(datos: {
  profesoresInvolucrados: MencionProfesor[];
  nombreCurso: string;
  idGrupo: string;
  diaClase: string;
  horaClase: string;
  nombreAlumno: string;
  fechaInscripcion?: string;
}): string {
  const fechaTexto = formatearFechaNotificacion(datos.fechaInscripcion);
  const lineas = [
    "📢 *Goku Lab — nuevo grupo e inscripción*",
    "",
    `Curso: *${datos.nombreCurso}* (${datos.idGrupo})`,
    `Horario: ${datos.diaClase} a las ${datos.horaClase}.`,
    "",
    `Alumno inscrito: *${datos.nombreAlumno}*.`,
  ];
  if (fechaTexto) lineas.push(`Inicia clases: ${fechaTexto}.`);
  lineas.push("", "Revisa tu calendario en el sistema.");
  return encabezadoGrupo(datos.profesoresInvolucrados) + lineas.join("\n");
}

export function construirMensajeGrupoReagendacion(datos: {
  profesoresInvolucrados: MencionProfesor[];
  nombreAlumno: string;
  nombreCurso: string;
  fechaOriginal: string;
  fechaNueva: string;
  profesorOrigen?: MencionProfesor;
  profesorDestino?: MencionProfesor;
}): string {
  const origen = formatearFechaNotificacion(datos.fechaOriginal);
  const nueva = formatearFechaNotificacion(datos.fechaNueva);
  const mismoProfesor =
    datos.profesorOrigen?.nombre &&
    datos.profesorDestino?.nombre &&
    datos.profesorOrigen.nombre === datos.profesorDestino.nombre;

  const lineas = [
    "📢 *Goku Lab — reagendación de alumno*",
    "",
    `Alumno: *${datos.nombreAlumno}* (${datos.nombreCurso})`,
    `Sesión original: ${origen}`,
    `Nueva sesión: ${nueva}`,
    "",
  ];

  if (mismoProfesor) {
    lineas.push("Revisa origen y destino en tu calendario.");
  } else {
    if (datos.profesorOrigen?.nombre) {
      lineas.push(
        `*Clase origen* (${mencionWhatsAppProfesor(datos.profesorOrigen)}): el alumno NO asistirá a la sesión original.`
      );
    }
    if (datos.profesorDestino?.nombre) {
      lineas.push(
        `*Clase destino* (${mencionWhatsAppProfesor(datos.profesorDestino)}): el alumno SÍ asistirá a la nueva sesión.`
      );
    }
    lineas.push("", "Ambos maestros: revisen su calendario.");
  }

  return encabezadoGrupo(datos.profesoresInvolucrados) + lineas.join("\n");
}
