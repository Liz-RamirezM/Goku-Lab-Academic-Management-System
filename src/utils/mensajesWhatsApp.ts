/** México móvil: WhatsApp usa 521 + 10 dígitos para wa.me */
export function normalizarTelefonoWhatsApp(telefono: string): string | null {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return null;

  if (digitos.length === 10) return `521${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("52")) {
    return `521${digitos.slice(2)}`;
  }
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos;
  if (digitos.length >= 10) return digitos;

  return null;
}

/** Teléfono para @mención en grupo (10 dígitos locales, ej. @5512345678) */
export function normalizarTelefonoMencionWhatsApp(telefono: string): string | null {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return null;

  if (digitos.length === 10) return digitos;
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos.slice(3);
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos.slice(2);
  if (digitos.length > 10) return digitos.slice(-10);

  return null;
}

/** Negrita en WhatsApp: *texto* (un solo asterisco a cada lado) */
export function negritaWhatsApp(texto: string): string {
  const t = String(texto || "").trim();
  return t ? `*${t}*` : "";
}

/** @mención en grupo (10 dígitos, ej. @5512345678). Sin teléfono → nombre en negrita */
export function mencionProfesorEnTexto(datos: {
  nombre?: string;
  telefono?: string;
}): string {
  const tel = normalizarTelefonoMencionWhatsApp(datos.telefono || "");
  if (tel) return `@${tel}`;

  const nombre = String(datos.nombre || "").trim();
  if (nombre) return negritaWhatsApp(nombre);

  return negritaWhatsApp("Sin asignar");
}

export function enlaceWhatsApp(telefono: string | undefined, mensaje: string): string {
  const encoded = encodeURIComponent(mensaje);
  const numero = telefono ? normalizarTelefonoWhatsApp(telefono) : null;
  const esDesktop =
    typeof navigator !== "undefined" &&
    !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  if (numero) {
    if (esDesktop) {
      return `https://web.whatsapp.com/send?phone=${numero}&text=${encoded}`;
    }
    return `https://wa.me/${numero}?text=${encoded}`;
  }

  if (esDesktop) {
    return `https://web.whatsapp.com/send?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/** Abre WhatsApp (app o Web) con el mensaje precargado — acción programada en un clic */
export function abrirWhatsAppDirecto(
  telefono: string | undefined,
  mensaje: string
): void {
  const url = enlaceWhatsApp(telefono, mensaje);
  const esMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Móvil: wa.me abre la app directamente en la misma acción
  if (esMobile) {
    window.location.assign(url);
    return;
  }

  // Escritorio: WhatsApp Web en una pestaña (respuesta al clic del usuario)
  window.open(url, "_blank", "noopener,noreferrer");
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function parseFechaLocal(fecha: string): Date | null {
  if (!fecha) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatearHorarioRecuperacion(fecha: string, hora: string): string {
  const date = parseFechaLocal(fecha);
  if (!date) return `${fecha} a las ${hora} h`;

  const diaSemana = DIAS[date.getDay()];
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = MESES[date.getMonth()];
  const horaFmt = hora ? `${hora} h` : "";

  return `${diaSemana} ${dia} de ${mes} a las ${horaFmt}`.replace(/\s+/g, " ").trim();
}

export function formatearSesionOriginal(fechaISO: string): string {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function construirMensajeRecuperacionClase(datos: {
  nombreAlumno: string;
  fechaNueva: string;
  horaNueva: string;
  nombreProfesor: string;
  telefonoProfesor?: string;
  modalidad?: string;
  fechaSesionOriginal?: string;
}): string {
  const date = parseFechaLocal(datos.fechaNueva);
  const sesion = formatearSesionOriginal(datos.fechaSesionOriginal || "");
  const responsable = mencionProfesorEnTexto({
    nombre: datos.nombreProfesor,
    telefono: datos.telefonoProfesor,
  });

  let lineaProgramacion: string;
  if (date) {
    const diaSemana = DIAS[date.getDay()];
    const dia = String(date.getDate()).padStart(2, "0");
    const mes = MESES[date.getMonth()];
    const horaFmt = datos.horaNueva ? `${datos.horaNueva} h` : "";
    lineaProgramacion = `La clase de ${negritaWhatsApp(datos.nombreAlumno)} ha sido programada para el ${negritaWhatsApp(`${diaSemana} ${dia}`)} de ${mes} a las ${negritaWhatsApp(horaFmt)}`;
  } else {
    lineaProgramacion = `La clase de ${negritaWhatsApp(datos.nombreAlumno)} ha sido programada para el ${formatearHorarioRecuperacion(datos.fechaNueva, datos.horaNueva)}`;
  }

  const lineas = [
    `✅ ${negritaWhatsApp("¡Clase de recuperación!")}`,
    lineaProgramacion,
    "",
    negritaWhatsApp("Detalles:"),
    `${negritaWhatsApp("Responsable")}: ${responsable}`,
    `${negritaWhatsApp("Modalidad")}: ${datos.modalidad || "Presencial"}`,
  ];

  if (sesion) {
    lineas.push(`Correspondiente a la sesión ${sesion}`);
  }

  return lineas.join("\n");
}

export function construirMensajeRecordatorioPago(datos: {
  nombreAlumno?: string;
  nombreTutor?: string;
  nombreCurso?: string;
  montoMensualidad?: number;
  montoTotal?: number;
  montoAbonado?: number;
  saldoPendiente?: number;
  diaPago?: number;
  fechaLimite?: string;
  mesCobro?: string;
}): string {
  const tutor = datos.nombreTutor?.trim();
  const curso = datos.nombreCurso?.trim() || "su curso";

  const fmt = (n: number) =>
    `$${Number(n || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  const mensualidad = Number(datos.montoMensualidad ?? datos.montoTotal ?? 0);
  const abonado = Math.max(0, Number(datos.montoAbonado ?? 0));
  const saldoExplicito = datos.saldoPendiente;
  const totalPagar =
    saldoExplicito != null && Number.isFinite(Number(saldoExplicito))
      ? Math.max(0, Number(saldoExplicito))
      : Math.max(0, mensualidad - abonado);
  const tieneAbono = abonado > 0.009;

  let mesNombre = "";
  let diaCorte = Number(datos.diaPago) || 0;
  let anio = new Date().getFullYear();

  if (datos.fechaLimite) {
    const f = parseFechaLocal(datos.fechaLimite);
    if (f) {
      mesNombre = MESES[f.getMonth()];
      diaCorte = f.getDate();
      anio = f.getFullYear();
    }
  }

  if (!mesNombre && datos.mesCobro) {
    const partes = String(datos.mesCobro).toLowerCase().split(/\s+/);
    const idxMes = MESES.findIndex((m) => partes.some((p) => p.startsWith(m.slice(0, 3))));
    if (idxMes >= 0) mesNombre = MESES[idxMes];
    const anioEnTexto = partes.find((p) => /^\d{4}$/.test(p));
    if (anioEnTexto) anio = Number(anioEnTexto);
  }

  const lineaFecha =
    mesNombre && diaCorte
      ? `${negritaWhatsApp("Fecha")}: ${diaCorte} ${mesNombre} ${anio}`
      : datos.mesCobro
        ? `${negritaWhatsApp("Fecha")}: ${datos.mesCobro}`
        : null;

  const saludo = tutor ? `Hola, ${tutor}` : "Hola,";

  const lineasMonto = [
    `${negritaWhatsApp("Monto")}: ${mensualidad > 0 ? fmt(mensualidad) : "$—"}`,
    ...(tieneAbono
      ? [
          `${negritaWhatsApp("Abonado")}: ${fmt(abonado)}`,
          `${negritaWhatsApp("Total a pagar")}: ${fmt(totalPagar)}`,
        ]
      : []),
  ];

  const lineas = [
    `🤝 ${negritaWhatsApp("Recordatorio")}`,
    `${saludo} su mensualidad se renueva pronto en ${curso}.`,
    "",
    lineaFecha,
    ...lineasMonto,
    "",
    "Cualquier duda, notifíquenos.",
    negritaWhatsApp("— Equipo Goku Lab"),
  ].filter(Boolean) as string[];

  return lineas.join("\n");
}
