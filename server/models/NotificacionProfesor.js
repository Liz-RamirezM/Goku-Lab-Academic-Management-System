import mongoose from "mongoose";

const notificacionProfesorSchema = new mongoose.Schema(
  {
    notificacionId: { type: String, required: true, unique: true },
    idProfesor: { type: String, required: true, index: true },
    tipo: {
      type: String,
      enum: [
        "asignacion_grupo",
        "inscripcion",
        "reagendacion",
        "reagendacion_origen",
        "reagendacion_destino",
      ],
      default: "asignacion_grupo",
    },
    titulo: { type: String, default: "" },
    mensaje: { type: String, default: "" },
    idGrupo: { type: String, default: "" },
    nombreCurso: { type: String, default: "" },
    diaClase: { type: String, default: "" },
    horaClase: { type: String, default: "" },
    leida: { type: Boolean, default: false },
    fechaLectura: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "notificaciones_profesor",
  }
);

notificacionProfesorSchema.index({ idProfesor: 1, leida: 1, createdAt: -1 });

export default mongoose.model("NotificacionProfesor", notificacionProfesorSchema);
