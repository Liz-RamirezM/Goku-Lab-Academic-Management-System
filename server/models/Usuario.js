import mongoose from 'mongoose';

const usuarioSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    nombreCompleto: { type: String, required: true },
    rol: { type: String, enum: ['admin', 'profesor', 'recepcion'], required: true },
    idProfesor: { type: String, default: '', index: true },
}, { collection: 'usuarios', timestamps: true });

export default mongoose.model('Usuario', usuarioSchema);