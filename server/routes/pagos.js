import express from "express";
import Pago from "../models/Pago.js";
import Inscripcion from "../models/Inscripcion.js";
import Grupo from "../models/Grupo.js";
import Curso from "../models/Curso.js";
import Alumno from "../models/Alumno.js";
import {
    cobroAunNoInicia,
    construirPeriodosMensuales,
  crearOActualizarPagoDeInscripcion,
  crearPagoId,
  desactivarPagoDeInscripcion,
  sincronizarPagosInactivosConInscripciones,
  sincronizarPagosHuérfanosDeGruposEliminados,
  sincronizarNombreCursoEnPagos,
  actualizarMontoMensualidadAlumnoGrupo,
  indiceMes,
} from "../utils/pagos.js";
import {
  buildCursosMaps,
  buildGruposMapPorId,
  cursoActivoParaPago,
} from "../utils/cursoCatalogo.js";
import { sincronizarInscripcionesConCursosCatalogo } from "../utils/inscripcionesCurso.js";

const router = express.Router();

async function sincronizarPagosDesdeInscripciones() {
    const inscripciones = await Inscripcion.find({
        estatus: { $ne: "Baja" },
        montoMensualidad: { $gt: 0 },
    }).lean();

    if (!inscripciones.length) return;

    const grupos = await Grupo.find().lean();
    const gruposMap = new Map();
    for (const g of grupos) {
        const id = String(g.IdGrupo || g.idGrupo || "").trim();
        if (id) gruposMap.set(id.toUpperCase(), g);
    }

    for (const ins of inscripciones) {
        const idAlumno = String(ins.idAlumno || "").trim();
        const grupoId = String(ins.grupoId || ins.GrupoId || "").trim();
        if (!idAlumno || !grupoId) continue;

        const pagoId = crearPagoId(idAlumno, grupoId);
        const existe = await Pago.findOne({ pagoId }).lean();
        if (existe) continue;

        const grupo = gruposMap.get(grupoId.toUpperCase());
        await crearOActualizarPagoDeInscripcion({
            idAlumno,
            nombreAlumno: ins.nombreAlumno || idAlumno,
            grupoId,
            nombreCurso: grupo?.nombreCurso || "Curso",
            datosPago: {
                montoMensualidad: Number(ins.montoMensualidad),
                diaPago: Number(ins.diaPago) || 1,
                fechaInicioPago: ins.fechaInicioPago || ins.fechaInscripcion || new Date(),
                comentarios: ins.comentarios || "",
            },
        });
    }
}

router.get("/lista-completa", async (req, res) => {
    try {
        await sincronizarPagosDesdeInscripciones();
        await sincronizarInscripcionesConCursosCatalogo();
        await sincronizarNombreCursoEnPagos();
        await sincronizarPagosInactivosConInscripciones();
        await sincronizarPagosHuérfanosDeGruposEliminados();

        const hoy = new Date();

        const respuestaProcesada = await Pago.aggregate([
            {
                $lookup: {
                    from: "abonos",
                    let: { idDelPago: "$pagoId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$pagoId", "$$idDelPago"] }
                            }
                        },
                        { $sort: { fechaAbono: 1 } }
                    ],
                    as: "historialAbonos"
                }
            },
            {
                $addFields: {
                    diaPagoResuelto: { $ifNull: ["$diaPago", "$diaPagoFijo"] },
                    fechaInicioResuelta: { $ifNull: ["$fechaInicioPago", "$fechaPago"] }
                }
            },
            {
                $project: {
                    _id: 0,
                    id: { $toUpper: { $trim: { input: "$pagoId" } } },
                    idAlumno: 1,
                    grupoId: 1,
                    nombreAlumno: 1,
                    nombreCurso: 1,
                    montoTotal: { $toDouble: "$montoPago" },
                    diaPagoFijo: "$diaPagoResuelto",
                    fechaPago: "$fechaInicioResuelta",
                    activo: { $ifNull: ["$activo", true] },
                    fechaBaja: 1,
                    historialAbonos: {
                        $map: {
                            input: "$historialAbonos",
                            as: "a",
                            in: {
                                abonoId: "$$a.abonoId",
                                fechaAbono: "$$a.fechaAbono",
                                montoAbono: { $toDouble: "$$a.montoAbono" },
                                metodoAbono: "$$a.metodoAbono",
                            }
                        }
                    },
                    montoPagado: {
                        $sum: {
                            $map: {
                                input: "$historialAbonos",
                                as: "a",
                                in: { $toDouble: "$$a.montoAbono" }
                            }
                        }
                    },
                    metodoAbono: {
                        $cond: {
                            if: { $gt: [{ $size: "$historialAbonos" }, 0] },
                            then: { $last: "$historialAbonos.metodoAbono" },
                            else: "No registrado"
                        }
                    },
                    fechaPagoReal: {
                        $cond: {
                            if: { $gt: [{ $size: "$historialAbonos" }, 0] },
                            then: { $last: "$historialAbonos.fechaAbono" },
                            else: null
                        }
                    }
                }
            },
            {
                $addFields: {
                    saldo: { $subtract: ["$montoTotal", "$montoPagado"] }
                }
            },
            {
                $addFields: {
                    status: {
                        $cond: {
                            if: { $gte: ["$montoPagado", "$montoTotal"] },
                            then: "Pagado",
                            else: {
                                $cond: {
                                    if: { $gt: ["$montoPagado", 0] },
                                    then: "Parcial",
                                    else: "Pendiente"
                                }
                            }
                        }
                    }
                }
            },
            {
                $sort: { fechaPagoReal: -1 }
            }
        ]);

        const idsAlumno = [
            ...new Set(
                respuestaProcesada
                    .map((p) => String(p.idAlumno || "").trim())
                    .filter(Boolean)
            ),
        ];

        const alumnosRaw = idsAlumno.length
            ? await Alumno.find({
                  $or: [
                      { idAlumno: { $in: idsAlumno } },
                      { "idAlumno ": { $in: idsAlumno } },
                  ],
              })
                  .select("idAlumno telefono tutor nombreAlumno")
                  .lean()
            : [];

        const alumnosMap = new Map();
        for (const a of alumnosRaw) {
            const key = String(a.idAlumno || a["idAlumno "] || "")
                .trim()
                .toUpperCase();
            if (key) alumnosMap.set(key, a);
        }

        const [gruposRaw, cursosRaw] = await Promise.all([
            Grupo.find().select("IdGrupo idGrupo GrupoId idCurso IdCurso nombreCurso").lean(),
            Curso.find().select("idCurso nombreCurso estatus").lean(),
        ]);
        const gruposMap = buildGruposMapPorId(gruposRaw);
        const cursosMaps = buildCursosMaps(cursosRaw);

        const resultadoFinal = respuestaProcesada.map((p) => {
            const hoy = new Date();
            const diaPago = Number(p.diaPagoFijo) || 1;
            const fechaInicio = p.fechaPago ? new Date(p.fechaPago) : null;
            const programado = fechaInicio && cobroAunNoInicia(fechaInicio, hoy);

            // AQUÍ ESTABA EL ERROR: Cambiamos mesesFuturosVisibles de 0 a 3
            // Esto permite que el dinero sobrante fluya hacia Julio, Agosto y Septiembre
            const periodosMensuales = construirPeriodosMensuales({
                fechaInicioCobro: fechaInicio,
                diaPagoFijo: diaPago,
                montoMensualidad: p.montoTotal,
                abonos: p.historialAbonos || [],
                hoy,
                mesesFuturosVisibles: 3,
            });

            const periodoVigente =
                periodosMensuales.find((mes) => {
                    const idx = indiceMes(new Date(mes.vencimiento));
                    return idx === indiceMes(hoy);
                }) ||
                periodosMensuales.find((mes) => mes.status !== "Programado") ||
                periodosMensuales[0];

            let status = p.status;
            let saldo = p.saldo < 0 ? 0 : p.saldo;
            let fechaLimite = periodoVigente?.vencimiento || p.fechaPago;
            const cursoActivo = cursoActivoParaPago(p, gruposMap, cursosMaps);

            if (p.activo === false) {
                status = "Baja";
                saldo = 0;
            } else if (!cursoActivo) {
                status = "CursoInactivo";
                saldo = 0;
            } else if (programado) {
                status = "Programado";
                const primerMes = periodosMensuales.find((mes) => mes.status === "Programado") || periodosMensuales[0];
                saldo = Number(primerMes?.saldo ?? primerMes?.monto ?? p.montoTotal ?? 0);
                fechaLimite = primerMes?.vencimiento || fechaLimite;
            } else if (periodoVigente) {
                fechaLimite = periodoVigente.vencimiento;
                saldo = periodoVigente.saldo;
                if (periodoVigente.status === "Pagado") status = "Pagado";
                else if (periodoVigente.status === "Parcial") status = "Parcial";
                else if (periodoVigente.status === "Pendiente") status = "Pendiente";
            }

            const alumnoKey = String(p.idAlumno || "").trim().toUpperCase();
            const alumno = alumnosMap.get(alumnoKey);
            const grupoRef = gruposMap.get(
              String(p.grupoId || "").trim().toUpperCase()
            );
            const nombreCursoResuelto =
              String(grupoRef?.nombreCurso || p.nombreCurso || "").trim() ||
              "Curso";

            return {
                ...p,
                nombreCurso: nombreCursoResuelto,
                cursoActivo,
                telefonoTutor: String(alumno?.telefono || "").trim(),
                nombreTutor: String(alumno?.tutor || "").trim(),
                status,
                saldo,
                fechaLimite,
                periodosMensuales,
                mesCobroVigente: periodoVigente?.nombreMes || (fechaInicio ? fechaInicio.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) : ""),
                cobroProgramado: programado,
            };
        });

        res.json(resultadoFinal);

    } catch (error) {
        console.error("Error en agregación:", error);
        res.status(500).json({ error: "Error al procesar pagos optimizados" });
    }
});

router.patch("/actualizar-dia/:id", async (req, res) => {
    try {
        const pagoId = String(req.params.id || "").trim();
        const nuevoDia = Number(req.body?.nuevoDia);

        if (!pagoId) {
            return res.status(400).json({ error: "Falta el identificador del pago" });
        }
        if (!Number.isInteger(nuevoDia) || nuevoDia < 1 || nuevoDia > 31) {
            return res.status(400).json({ error: "Día de pago debe ser entre 1 y 31" });
        }

        const pago = await Pago.findOne({
            $or: [{ pagoId }, { pagoId: pagoId.toUpperCase() }],
        }).lean();

        if (!pago) {
            return res.status(404).json({ error: "No se encontró el pago" });
        }

        await Pago.updateOne({ _id: pago._id }, { $set: { diaPago: nuevoDia } });

        const idAlumno = String(pago.idAlumno || "").trim();
        const grupoId = String(pago.grupoId || "").trim();
        if (idAlumno && grupoId) {
            await Inscripcion.updateMany(
                {
                    idAlumno: { $regex: new RegExp(`^${idAlumno.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
                    grupoId: { $regex: new RegExp(`^${grupoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
                },
                { $set: { diaPago: nuevoDia } }
            );
        }

        res.status(200).json({ ok: true, pagoId, diaPago: nuevoDia });
    } catch (error) {
        console.error("ERROR PATCH DIA PAGO:", error);
        res.status(500).json({ error: "Error al actualizar día de pago", detalle: error.message });
    }
});

router.patch("/actualizar-monto/:id", async (req, res) => {
    try {
        const pagoId = String(req.params.id || "").trim();
        const monto = Number(req.body?.montoMensualidad ?? req.body?.monto);

        if (!pagoId) {
            return res.status(400).json({ error: "Falta el identificador del pago" });
        }

        const pago = await Pago.findOne({
            $or: [{ pagoId }, { pagoId: pagoId.toUpperCase() }],
        }).lean();

        if (!pago) {
            return res.status(404).json({ error: "No se encontró el pago" });
        }

        const idAlumno = String(pago.idAlumno || "").trim();
        const grupoId = String(pago.grupoId || "").trim();
        if (!idAlumno || !grupoId) {
            return res.status(400).json({ error: "El pago no tiene alumno o grupo asociado" });
        }

        const resultado = await actualizarMontoMensualidadAlumnoGrupo(
            idAlumno,
            grupoId,
            monto
        );

        res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
        console.error("ERROR PATCH MONTO PAGO:", error);
        res.status(400).json({
            error: error.message || "Error al actualizar la mensualidad",
        });
    }
});

export default router;