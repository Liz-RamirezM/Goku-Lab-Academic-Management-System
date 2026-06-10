import mongoose from "mongoose";

const inscripcionSchema = new mongoose.Schema(
  {
    idAlumno: { type: String, required: true, index: true },
    nombreAlumno: { type: String, required: true },
    grupoId: { type: String, required: true, index: true },
    modalidad: { type: String, default: "Presencial" },
    // Datos de pago - REQUERIDOS para nueva inscripción
    montoMensualidad: { type: Number, required: true },
    diaPago: { 
      type: Number, 
      required: true,
      min: 1,
      max: 31,
      description: "Día del mes en que vence el pago (1-31)"
    },
    fechaInicioPago: { 
      type: Date, 
      required: true,
      description: "Primer mes desde el cual comienza a aplicar el pago"
    },
    comentarios: { type: String, default: "" },
    /** Notas del alumno en este curso (después de inscribirse; visible en calendario) */
    comentarioAlumno: { type: String, default: "" },
    // Fecha efectiva desde la cual el alumno debe aparecer en el calendario.
    // Si no se envía, se usa la fecha en que se guarda la inscripción.
    // ✅ SIEMPRE es Date (ISO 8601), nunca string
    fechaInscripcion: { 
      type: Date, 
      required: true,
      default: () => new Date()
    },
    estatus: {
      type: String,
      enum: ["Activa", "Baja"],
      default: "Activa",
      index: true,
    },
    fechaBaja: { type: Date, default: null },
    motivoBaja: { type: String, default: "" },
  },
  {
    collection: "inscripciones",
    versionKey: false,
    timestamps: true
  }
);

// Índice para búsquedas por fechaInscripcion
inscripcionSchema.index({ grupoId: 1, fechaInscripcion: 1 });

const Inscripcion = mongoose.model("Inscripcion", inscripcionSchema);

export default Inscripcion;
