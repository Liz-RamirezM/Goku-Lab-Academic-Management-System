/** Convierte duracionClase (ej. "1:30 hr", "2 horas") a minutos totales */
export function parseDuracionAMinutos(
  duracion?: string | null,
  defaultMinutos = 120
): number {
  if (!duracion) return defaultMinutos;

  const duracionStr = String(duracion).toLowerCase().trim();

  const matchHoraMin = duracionStr.match(/^(\d+):(\d{2})\s*(?:hr|horas?)?$/);
  if (matchHoraMin) {
    return Number(matchHoraMin[1]) * 60 + Number(matchHoraMin[2]);
  }

  const matchHoras = duracionStr.match(/(\d+(?:\.\d+)?)\s*horas?/);
  if (matchHoras) {
    return Math.round(Number(matchHoras[1]) * 60);
  }

  const matchHr = duracionStr.match(/^(\d+(?:\.\d+)?)\s*hr$/);
  if (matchHr) {
    return Math.round(Number(matchHr[1]) * 60);
  }

  const matchMinutos = duracionStr.match(/(\d+)\s*min/);
  if (matchMinutos) {
    return Number(matchMinutos[1]);
  }

  return defaultMinutos;
}

export function calcularHoraFinDesdeDuracion(
  horaInicio: string,
  duracion?: string | null
): string {
  if (!horaInicio) return "";

  const [horas, minutos] = horaInicio.split(":").map(Number);
  if (isNaN(horas) || isNaN(minutos)) return "";

  const totalMinutos = parseDuracionAMinutos(duracion);
  let horaFin = horas;
  let minutoFin = minutos + totalMinutos;

  while (minutoFin >= 60) {
    horaFin += 1;
    minutoFin -= 60;
  }

  return `${String(horaFin).padStart(2, "0")}:${String(minutoFin).padStart(2, "0")}`;
}
