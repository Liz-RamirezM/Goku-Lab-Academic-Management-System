import mongoose from "mongoose";

const profesorSchema = new mongoose.Schema(
  {
    idProfesor: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    telefono: { type: String, default: "" },
    estatus: { type: String, default: "Activo" },
  },
  {
    collection: "profesores",
  }
);

const Profesor = mongoose.model("Profesor", profesorSchema);

export default Profesor;