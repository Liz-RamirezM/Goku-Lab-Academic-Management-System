import mongoose from "mongoose";

const abonoSchema = new mongoose.Schema(
  {
    abonoId: { type: String, required: true, index: true },
    pagoId: { type: String, required: true, index: true },
    nombreAlumno: { type: String, required: true },
    montoAbono: { type: Number, required: true },
    metodoAbono: { type: String, default: "Efectivo" },
    fechaAbono: { type: Date, default: () => new Date() },
    numeroDeabono: { type: String, default: "1" },
  },
  {
    collection: "abonos",
    versionKey: false,
    timestamps: true,
  }
);

export default mongoose.model("Abono", abonoSchema);
