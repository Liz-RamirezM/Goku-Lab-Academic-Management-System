import Counter from "../models/Counter.js";

export async function generarId(tipo) {
  const configuracion = {
    alumno: { prefijo: "ALU", digitos: 3 },
    curso: { prefijo: "CUR", digitos: 3 },
    grupo: { prefijo: "GRU", digitos: 3 },
    profesor: { prefijo: "PROF", digitos: 3 },
    reagendacion: { prefijo: "REA", digitos: 3 },
    notificacion: { prefijo: "NOT", digitos: 4 },
  };

  if (!configuracion[tipo]) {
    throw new Error(`Tipo de ID no válido: ${tipo}`);
  }

  const counter = await Counter.findOneAndUpdate(
    { nombre: tipo },
    { $inc: { secuencia: 1 } },
    { new: true, upsert: true }
  );

  const { prefijo, digitos } = configuracion[tipo];
  const numero = String(counter.secuencia).padStart(digitos, "0");

  return `${prefijo}${numero}`;
}