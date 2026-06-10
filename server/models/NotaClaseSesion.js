import mongoose from "mongoose";

const notaClaseSesionSchema = new mongoose.Schema(
  {
    idGrupo: { type: String, required: true, index: true },
    fechaClase: { type: String, required: true, index: true },
    notaHtml: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "notas_clase_sesion",
  }
);

notaClaseSesionSchema.index({ idGrupo: 1, fechaClase: 1 }, { unique: true });

export default mongoose.model("NotaClaseSesion", notaClaseSesionSchema);
