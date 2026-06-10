import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { PaymentRow } from '../components/PaymentRow';
import { RegisterPaymentModal } from '../components/RegisterPaymentModal';
import { getPagosConEstatus, registrarAbono, actualizarDiaPago, actualizarMontoMensualidad } from '../../services/api';
import { useSyncDataReload } from '../../utils/dataSync';
import { toast } from "sonner";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function periodoDelMesCalendario(
    periodos: any[],
    mes: number,
    anio: number
) {
    return (periodos || []).find((m: any) => {
        if (!m.vencimiento) return false;
        const v = new Date(m.vencimiento);
        return v.getMonth() === mes && v.getFullYear() === anio;
    });
}

function formatearKpi(monto: number) {
    return `$${Number(monto || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}

export function PagosPage() {
    const [pagos, setPagos] = useState<any[]>([]);
    const [cargando, setCargando] = useState(true);
    const [vista, setVista] = useState<'control' | 'registro' | 'proximos'>('control');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<any>(null);

    const [busquedaAlumno, setBusquedaAlumno] = useState('');
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [criterioFechaPagados, setCriterioFechaPagados] = useState<'limite' | 'real'>('real');
    const [modalMensualidades, setModalMensualidades] = useState<any | null>(null);
    const [montosDraft, setMontosDraft] = useState<Record<string, string>>({});
    const [guardandoMontos, setGuardandoMontos] = useState(false);

    const cargarDatos = useCallback(() => {
        getPagosConEstatus()
            .then((data) => {
                const alumnosMap: Record<string, any> = {};

                data.forEach((pago: any) => {
                    const key = pago.nombreAlumno?.trim();
                    if (!key) return;

                    const alumnoBaja =
                        pago.activo === false ||
                        String(pago.status || "").trim().toLowerCase() === "baja";
                    const cursoInactivo = pago.cursoActivo === false;

                    if (!alumnosMap[key]) {
                        alumnosMap[key] = {
                            id: pago.id || pago.pagoId,
                            idAlumno: pago.idAlumno || "",
                            nombreAlumno: pago.nombreAlumno,
                            telefonoTutor: pago.telefonoTutor || "",
                            nombreTutor: pago.nombreTutor || "",
                            cursosLista: [],
                            montoTotal: 0,
                            montoPagado: 0,
                            montoPagadoHistorico: 0,
                            saldo: 0,
                            activo: false,
                            fechaLimite: pago.fechaLimite,
                            fechaPagoReal: pago.fechaPagoReal,
                            metodoAbono: pago.metodoAbono,
                            periodosMap: {},
                            periodosHistoricoMap: {},
                            cursosDetalle: [] as any[],
                        };
                    }

                    const alum = alumnosMap[key];

                    alum.cursosDetalle.push({
                        pagoId: pago.id || pago.pagoId,
                        idAlumno: pago.idAlumno || "",
                        grupoId: pago.grupoId || "",
                        nombreCurso: pago.nombreCurso || "Curso",
                        montoMensualidad: Number(pago.montoTotal) || 0,
                        cobranzaActiva: !alumnoBaja && !cursoInactivo,
                    });

                    if (!alum.telefonoTutor && pago.telefonoTutor) {
                        alum.telefonoTutor = pago.telefonoTutor;
                        alum.nombreTutor = pago.nombreTutor || alum.nombreTutor;
                    }

                    const periodos = pago.periodosMensuales || [];

                    if (alumnoBaja || cursoInactivo) {
                        alum.montoPagadoHistorico += Number(pago.montoPagado || 0);
                        periodos.forEach((mes: any) => {
                            const mesKey = mes.clave;
                            if (!alum.periodosHistoricoMap[mesKey]) {
                                alum.periodosHistoricoMap[mesKey] = {
                                    clave: mes.clave,
                                    nombreMes: mes.nombreMes,
                                    vencimiento: mes.vencimiento,
                                    monto: 0,
                                    pagado: 0,
                                    saldo: 0,
                                    status: "Pendiente",
                                };
                            }
                            if (Number(mes.pagado) > 0 || mes.status === "Pagado") {
                                alum.periodosHistoricoMap[mesKey].pagado += Number(mes.pagado) || 0;
                                alum.periodosHistoricoMap[mesKey].monto += Number(mes.monto) || 0;
                                alum.periodosHistoricoMap[mesKey].saldo = Math.max(
                                    0,
                                    alum.periodosHistoricoMap[mesKey].monto -
                                        alum.periodosHistoricoMap[mesKey].pagado
                                );
                                alum.periodosHistoricoMap[mesKey].status =
                                    alum.periodosHistoricoMap[mesKey].saldo < 0.01
                                        ? "Pagado"
                                        : "Parcial";
                            }
                        });
                    } else {
                        alum.activo = true;
                        if (!alum.cursosLista.includes(pago.nombreCurso)) {
                            alum.cursosLista.push(pago.nombreCurso);
                        }
                        alum.montoTotal += Number(pago.montoTotal) || 0;
                        alum.montoPagado += Number(pago.montoPagado) || 0;

                        periodos.forEach((mes: any) => {
                            const mesKey = mes.clave;
                            if (!alum.periodosMap[mesKey]) {
                                alum.periodosMap[mesKey] = {
                                    clave: mes.clave,
                                    nombreMes: mes.nombreMes,
                                    vencimiento: mes.vencimiento,
                                    monto: 0,
                                    pagado: 0,
                                    saldo: 0,
                                    status: "Pendiente",
                                };
                            }
                            alum.periodosMap[mesKey].monto += Number(mes.monto) || 0;
                        });
                    }
                });

                const pagosAgrupados = Object.values(alumnosMap).map((alum: any) => {
                    const periodosMensuales = Object.values(alum.periodosMap).sort((a: any, b: any) => {
                        return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime();
                    });
                    const periodosHistorico = Object.values(alum.periodosHistoricoMap || {}).sort(
                        (a: any, b: any) =>
                            new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime()
                    );

                    // -----------------------------------------------------------------
                    // ALGORITMO DE DISTRIBUCIÓN EN CASCADA UNIFICADO (FRONTEND)
                    // -----------------------------------------------------------------
                    let bolsaDinero = alum.montoPagado;

                    periodosMensuales.forEach((m: any) => {
                        m.pagado = 0;
                        m.saldo = m.monto;
                        m.status = "Pendiente";

                        if (bolsaDinero > 0) {
                            if (bolsaDinero >= m.monto) {
                                m.pagado = m.monto;
                                m.saldo = 0;
                                m.status = "Pagado";
                                bolsaDinero -= m.monto;
                            } else {
                                m.pagado = bolsaDinero;
                                m.saldo = m.monto - bolsaDinero;
                                m.status = "Parcial";
                                bolsaDinero = 0;
                            }
                        }
                    });

                    const tienePendientes = periodosMensuales.some((m: any) => m.status !== "Pagado");
                    alum.status = !tienePendientes ? "Pagado" : (alum.montoPagado > 0 ? "Parcial" : "Pendiente");
                    alum.saldo = alum.montoTotal - alum.montoPagado;
                    alum.periodosMensuales = periodosMensuales;
                    alum.periodosHistorico = periodosHistorico;
                    alum.nombreCurso = alum.cursosDetalle
                        .map((c: any) => c.nombreCurso)
                        .filter(Boolean)
                        .join(", ") || alum.cursosLista.join(", ");

                    const hoy = new Date();
                    const periodoVigente =
                        periodosMensuales.find((m: any) => {
                            const v = new Date(m.vencimiento);
                            return (
                                v.getMonth() === hoy.getMonth() &&
                                v.getFullYear() === hoy.getFullYear()
                            );
                        }) ||
                        periodosMensuales.find((m: any) => m.status !== "Pagado") ||
                        periodosMensuales[0];

                    if (periodoVigente) {
                        alum.mesCobroVigente = periodoVigente.nombreMes;
                        alum.fechaLimite = periodoVigente.vencimiento;
                    }

                    return alum;
                });

                setPagos(pagosAgrupados);
                setCargando(false);
            })
            .catch((err) => {
                console.error("Error al traer pagos:", err);
                setCargando(false);
            });
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    useSyncDataReload(cargarDatos);

    useEffect(() => {
        setBusquedaAlumno('');
        setFechaInicio('');
        setFechaFin('');
    }, [vista]);

    const handleImprimirRecibo = (pago: any, mesEspecifico?: any) => {

        // ── helpers ──────────────────────────────────────────────────────────────
        const toBase64 = (url: string): Promise<string> =>
            fetch(url)
                .then((r) => r.blob())
                .then(
                    (blob) =>
                        new Promise((res, rej) => {
                            const reader = new FileReader();
                            reader.onloadend = () => res(reader.result as string);
                            reader.onerror = rej;
                            reader.readAsDataURL(blob);
                        })
                );

        const generarPDF = async (quiereFactura: boolean) => {
            // ── datos del recibo ────────────────────────────────────────────────────
            const estadoFacturacion = quiereFactura ? "Solicitada" : "No solicitada";

            const ahora = new Date();
            const anioActual = ahora.getFullYear();
            const mesActualNum = String(ahora.getMonth() + 1).padStart(2, "0");
            const anioMesNomenclatura = `${anioActual}-${mesActualNum}`;
            const numeroTresDigitos = String(Math.floor(Math.random() * 900) + 100).padStart(3, "0");
            const folioDocumento = `AL/CF/${anioMesNomenclatura}-R${numeroTresDigitos}`;

            const fechaConsulta = ahora.toLocaleString("es-MX", {
                year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
            });
            const fechaPago = ahora.toLocaleDateString("es-MX", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
            });

            const nombreConcepto = mesEspecifico
                ? `Mensualidad - ${mesEspecifico.nombreMes}`
                : "Mensualidad";

            const montoAImprimir = mesEspecifico ? mesEspecifico.pagado : pago.montoTotal;
            const esAbono = mesEspecifico && mesEspecifico.status !== "Pagado";

            // ── colores / tipografía de marca ───────────────────────────────────────
            const PURPLE: [number, number, number] = [88, 28, 135];   // Algorithmics violeta
            const DARK: [number, number, number] = [15, 23, 42];
            const GRAY: [number, number, number] = [100, 116, 139];
            const LIGHT_BG: [number, number, number] = [248, 250, 252];
            const BORDER: [number, number, number] = [226, 232, 240];

            // ── documento ───────────────────────────────────────────────────────────
            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            const PW = 210; // page width

            // ── logo ────────────────────────────────────────────────────────────────
            const logoB64 = await toBase64("/logo-goku-lab.png");
            doc.addImage(logoB64, "PNG", 15, 8, 22, 22);
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(13);
            doc.setTextColor(...PURPLE);
            doc.text("GOKU LAB", 40, 16);
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY);
            doc.text("Algorithmics", 40, 22);

            // Dirección bajo el logo
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(...GRAY);
            doc.text("Av. Vía Adolfo López Mateos 201-local 418 b, MZ 001,", 15, 34);
            doc.text("Sta Cruz Acatlan, 53150 Naucalpan de Juárez, Méx.", 15, 29);

            // "Recibo" — derecha
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(36);
            doc.setTextColor(...DARK);
            doc.text("Recibo", PW - 15, 28, { align: "right" });

            // Línea separadora
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.4);
            doc.line(15, 42, PW - 15, 42);

            // ── bloque folio / fechas ───────────────────────────────────────────────
            const ROW_H = 8;
            let y = 52;

            const drawRow = (label: string, value: string, yPos: number) => {
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(9.5);
                doc.setTextColor(...GRAY);
                doc.text(label, 15, yPos);
                doc.setTextColor(...DARK);
                doc.setFont("Helvetica", "bold");
                doc.text(value, PW - 15, yPos, { align: "right" });
            };

            drawRow("Folio", folioDocumento, y); y += ROW_H;
            drawRow("Fecha de pago", fechaPago, y); y += ROW_H;
            drawRow("Fecha de consulta", fechaConsulta, y); y += ROW_H + 4;

            // ── caja DETALLES ───────────────────────────────────────────────────────
            const boxX = 15, boxW = PW - 30;
            const boxY = y;
            const detRows = [
                ["Estudiante (s)", pago.nombreAlumno || "N/A"],
                ["Concepto", nombreConcepto],
                ["Forma de Pago", pago.metodoAbono || "Tarjeta débito/crédito"],
                ["Facturación", estadoFacturacion],
                ["Recibido por", "SYSTEM"],
            ];
            const boxH = 10 + detRows.length * ROW_H + 2;

            doc.setFillColor(...LIGHT_BG);
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.3);
            doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, "FD");

            doc.setFont("Helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY);
            doc.text("DETALLES:", boxX + 5, boxY + 7);

            let dy = boxY + 14;
            detRows.forEach(([lbl, val]) => {
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(9.5);
                doc.setTextColor(...GRAY);
                doc.text(lbl, boxX + 5, dy);
                doc.setFont("Helvetica", "bold");
                doc.setTextColor(...DARK);
                doc.text(val, boxX + boxW - 5, dy, { align: "right" });
                dy += ROW_H;
            });

            y = boxY + boxH + 6;

            // ── línea punteada + Monto / Total ──────────────────────────────────────
            doc.setDrawColor(...BORDER);
            doc.setLineDash([1.5, 1.5], 0);
            doc.line(15, y, PW - 15, y);
            doc.setLineDash([], 0);
            y += 8;

            // Observaciones + monto
            const montoFmt = `$${Number(montoAImprimir || 0).toLocaleString("es-MX", {
                minimumFractionDigits: 2, maximumFractionDigits: 2,
            })}`;

            doc.setFont("Helvetica", "normal");
            doc.setFontSize(9.5);
            doc.setTextColor(...GRAY);
            doc.text("Observaciones", boxX, y);

            if (esAbono) {
                doc.setFontSize(8);
                doc.setTextColor(180, 83, 9); // amber
                doc.text("ABONO PARCIAL", boxX + 35, y);
            }

            doc.setFont("Helvetica", "normal");
            doc.setTextColor(...GRAY);
            doc.setFontSize(9.5);
            doc.text("Monto", PW - 15 - 30, y);
            doc.setFont("Helvetica", "bold");
            doc.setTextColor(...DARK);
            doc.text(montoFmt, PW - 15, y, { align: "right" });

            y += ROW_H;

            // Fecha inicio / nombre concepto como observación
            const fechaInicioLabel = mesEspecifico
                ? `FECHA DE INICIO ${ahora.toLocaleDateString("es-MX")}, ${ahora.getHours()}:00 H`
                : `Historial completo al ${ahora.toLocaleDateString("es-MX")}`;

            doc.setFont("Helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(...DARK);
            doc.text(fechaInicioLabel, boxX, y);

            doc.text("Total", PW - 15 - 30, y);
            doc.setFontSize(11);
            doc.text(montoFmt, PW - 15, y, { align: "right" });

            y += 14;

            // ── Notas pie de página
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(18);
            doc.setTextColor(...DARK);
            doc.text("¡Gracias por tu pago!", PW / 2, y, { align: "center" });
            y += 8;

            doc.setFont("Helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(...GRAY);
            if (estadoFacturacion === "Solicitada") {
                const msg =
                    "Tienes hasta antes del fin de mes para solicitar tu factura. " +
                    "Solo escríbenos por chat o comunícate\n" +
                    "directamente con la gestión del centro. ¡Así de fácil! \n" +
                    "- Equipo Algorithmics";
                doc.text(msg, PW / 2, y, { align: "center", lineHeightFactor: 1.6 });
                y += 24;
            } else {
                const msg = "Cualquier aclaración sobre este recibo o tu pago" +
                    " solo escríbenos por chat o comunícate\n" +
                    "directamente con la gestión del centro. ¡Así de fácil! \n" +
                    "- Equipo Algorithmics";
                doc.text(msg, PW / 2, y, { align: "center", lineHeightFactor: 1.6 });
                y += 24;
            }

            // Contacto
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...DARK);
            doc.text("Contacto", PW / 2, y, { align: "center" });
            y += 6;
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(...GRAY);
            doc.text(
                "Teléfono & WhatsApp: (+52) 5612668168 & (+52) 5580177920",
                PW / 2, y, { align: "center" }
            );

            // ── pie de página ───────────────────────────────────────────────────────
            doc.setFont("Helvetica", "italic");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY);
            doc.text(
                "Este documento es solo informativo y no tiene validez fiscal.",
                PW / 2, 285, { align: "center" }
            );

            // ── guardar ─────────────────────────────────────────────────────────────
            const nombreArchivo = mesEspecifico
                ? `Recibo_${mesEspecifico.nombreMes.replace(/\s+/g, "_")}_${pago.nombreAlumno.replace(/\s+/g, "_")}.pdf`
                : `Recibo_Global_${pago.nombreAlumno.replace(/\s+/g, "_")}.pdf`;

            doc.save(nombreArchivo);
            toast.success(`Comprobante ${mesEspecifico ? "mensual" : "global"} generado exitosamente`);
        };

        // ── toast de confirmación de factura ─────────────────────────────────────
        toast.message("¿Desea Facturar?", {
            description: mesEspecifico
                ? `Recibo de: ${mesEspecifico.nombreMes}`
                : `Recibo Global: ${pago.nombreAlumno}`,
            duration: 8000,
            action: { label: "Sí, Facturar", onClick: () => generarPDF(true) },
            cancel: { label: "No", onClick: () => generarPDF(false) },
        });
    };



    const handleConfirmarPago = async (pagoId: string, monto: number, metodo: string, fechaAbono: string, nuevoMontoMensual?: number) => {
        try {
            await registrarAbono({
                pagoId,
                montoAbono: monto,
                nombreAlumno: selectedPayment?.nombreAlumno || "",
                metodoAbono: metodo,
                fechaAbono,
                nuevoMontoMensual: nuevoMontoMensual || null
            });
            toast.success("Pago registrado correctamente");
            setIsModalOpen(false);
            cargarDatos();
        } catch (error: any) { toast.error("Error al registrar: " + error.message); }
    };

    const abrirModalMensualidades = (payment: any) => {
        const draft: Record<string, string> = {};
        for (const curso of payment.cursosDetalle || []) {
            if (curso.pagoId) {
                draft[curso.pagoId] = String(curso.montoMensualidad ?? "");
            }
        }
        setMontosDraft(draft);
        setModalMensualidades(payment);
    };

    const handleGuardarMensualidades = async () => {
        if (!modalMensualidades?.cursosDetalle?.length) return;
        setGuardandoMontos(true);
        try {
            for (const curso of modalMensualidades.cursosDetalle) {
                const monto = Number(montosDraft[curso.pagoId]);
                if (!Number.isFinite(monto) || monto <= 0) {
                    throw new Error(`Monto inválido para ${curso.nombreCurso}`);
                }
                if (monto !== Number(curso.montoMensualidad)) {
                    await actualizarMontoMensualidad(curso.pagoId, monto);
                }
            }
            toast.success("Mensualidades actualizadas");
            setModalMensualidades(null);
            cargarDatos();
        } catch (error: any) {
            toast.error(error.message || "Error al actualizar mensualidades");
        } finally {
            setGuardandoMontos(false);
        }
    };

    const pagosFiltrados = pagos
        .filter(p => {
            const periodos = p.periodosMensuales || [];
            const hoy = new Date();
            const totalMesesHoy = hoy.getFullYear() * 12 + hoy.getMonth();

            // Validación estricta para segmentar las pestañas sin fugas
            const tienePendientesPasados = periodos.some((m: any) => {
                const v = new Date(m.vencimiento);
                return (v.getFullYear() * 12 + v.getMonth()) <= totalMesesHoy && m.status !== "Pagado";
            });

            const tieneProximosFuturos = periodos.some((m: any) => {
                const v = new Date(m.vencimiento);
                return (v.getFullYear() * 12 + v.getMonth()) > totalMesesHoy && m.status !== "Pagado";
            });

            if (vista === 'control') {
                return p.activo !== false && (p.periodosMensuales || []).length > 0 && tienePendientesPasados;
            } else if (vista === 'registro') {
                return (
                    periodos.some((m: any) => m.status === "Pagado") ||
                    (p.periodosHistorico || []).some((m: any) => m.status === "Pagado") ||
                    Number(p.montoPagadoHistorico || 0) > 0
                );
            } else if (vista === 'proximos') {
                return p.activo !== false && (p.periodosMensuales || []).length > 0 && tieneProximosFuturos;
            }
            return false;
        })
        .filter(p => !busquedaAlumno || p.nombreAlumno?.toLowerCase().includes(busquedaAlumno.toLowerCase()))
        .filter(p => {
            if (!fechaInicio && !fechaFin) return true;
            if (vista === 'control' || vista === 'proximos') {
                const pendientes = (p.periodosMensuales || []).filter((m: any) => m.status !== "Pagado" && m.status !== "Programado");
                if (pendientes.length === 0) return false;
                return pendientes.some((mes: any) => {
                    const fechaVence = mes.vencimiento ? mes.vencimiento.substring(0, 10) : "";
                    if (!fechaVence) return false;
                    if (fechaInicio && fechaVence < fechaInicio) return false;
                    if (fechaFin && fechaVence > fechaFin) return false;
                    return true;
                });
            } else {
                let fechaEvaluarTexto = criterioFechaPagados === 'real' ? p.fechaPagoReal : p.fechaLimite;
                if (!fechaEvaluarTexto) return false;
                const fechaLimpia = fechaEvaluarTexto.substring(0, 10);
                if (fechaInicio && fechaLimpia < fechaInicio) return false;
                if (fechaFin && fechaLimpia > fechaFin) return false;
                return true;
            }
        });

    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const nombreMesActual = hoy.toLocaleDateString('es-MX', {
        month: 'long',
        year: 'numeric',
    });

    const kpisMes = useMemo(() => {
        let porRecolectar = 0;
        let totalRecolectado = 0;
        let metaMes = 0;

        for (const p of pagos) {
            if (p.activo === false) continue;

            const mesEnCurso = periodoDelMesCalendario(
                p.periodosMensuales,
                mesActual,
                anioActual
            );
            if (!mesEnCurso) continue;

            metaMes += Number(mesEnCurso.monto) || 0;
            totalRecolectado += Number(mesEnCurso.pagado) || 0;
            porRecolectar += Number(mesEnCurso.saldo) || 0;
        }

        return { porRecolectar, totalRecolectado, metaMes };
    }, [pagos, mesActual, anioActual]);

    if (cargando) return <div className="p-10 text-center">Cargando informacion...</div>;

    return (
        <div className="bg-gray-50 min-h-screen w-full">
            <Navbar />

            <header className="relative overflow-hidden border-b border-cyan-100 bg-[linear-gradient(120deg,#eefbff_0%,#d9f3ff_48%,#8fd6f3_100%)] px-6 py-5 shadow-sm">
                <div className="absolute right-10 top-0 h-24 w-24 rounded-full border-[18px] border-white/40" />
                <div className="relative mx-auto flex w-full max-w-none items-center justify-between gap-6 px-4 lg:px-10">
                    <div className="flex min-w-0 items-center gap-4">
                        <img src="/logo-goku-lab.png" alt="Goku Lab" className="h-20 w-20 flex-shrink-0 object-contain drop-shadow-md" />
                        <div className="min-w-0">
                            <h1 className="text-3xl font-black leading-none text-[#0078D7]">Goku Lab</h1>
                            <p className="mt-1 text-base font-black leading-tight">
                                <span className="text-[#FFC400]">Juega, </span><span className="text-[#EF2D2D]">Aprende </span><span className="text-[#0078D7]">y </span><span className="text-[#2FB34A]">Emprende</span>
                            </p>
                            <p className="mt-1 text-sm font-black text-[#003B73]">Sistema de Gestión Académica</p>
                        </div>
                    </div>
                    <div className="flex rounded-xl border border-cyan-100 bg-white/80 p-1 shadow-sm gap-1">
                        <button onClick={() => setVista('control')} className={`rounded-lg px-6 py-2 text-xs font-black transition-all ${vista === 'control' ? 'bg-[#0047B8] text-white shadow-md shadow-blue-900/15' : 'text-gray-500 hover:bg-cyan-50 hover:text-cyan-700'}`}>PENDIENTES</button>
                        <button onClick={() => setVista('registro')} className={`rounded-lg px-6 py-2 text-xs font-black transition-all ${vista === 'registro' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/15' : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'}`}>PAGADOS</button>
                        <button onClick={() => setVista('proximos')} className={`rounded-lg px-6 py-2 text-xs font-black transition-all ${vista === 'proximos' ? 'bg-purple-600 text-white shadow-md shadow-purple-900/15' : 'text-gray-500 hover:bg-purple-50 hover:text-purple-700'}`}>PRÓXIMOS</button>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto space-y-6 py-8 px-4 lg:px-0">
                <div className="bg-white border rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Buscar Alumno</label><input type="text" placeholder="Escribe el nombre..." value={busquedaAlumno} onChange={(e) => setBusquedaAlumno(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-cyan-400 transition-colors" /></div>
                    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Desde fecha</label><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-cyan-400 text-gray-700 transition-colors" /></div>
                    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hasta fecha</label><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-cyan-400 text-gray-700 transition-colors" /></div>
                    {vista === 'registro' ? (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Filtrar Historial por</label>
                            <select value={criterioFechaPagados} onChange={(e) => setCriterioFechaPagados(e.target.value as 'limite' | 'real')} className="w-full bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold text-emerald-800 focus:outline-none transition-colors"><option value="real">📅 FECHA DE PAGO REAL</option><option value="limite">⏳ FECHA QUE DEBIÓ PAGAR</option></select>
                        </div>
                    ) : (
                        <button onClick={() => { setBusquedaAlumno(''); setFechaInicio(''); setFechaFin(''); }} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl py-2 text-xs font-bold transition-colors h-[34px]">Limpiar Filtros</button>
                    )}
                </div>

                {(vista === 'control' || vista === 'registro') && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
                            Resumen de {nombreMesActual}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                                <div>
                                    <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">
                                        Por recolectar en el mes
                                    </span>
                                    <h2 className="text-2xl font-black text-cyan-900 mt-1">
                                        {formatearKpi(kpisMes.porRecolectar)}
                                    </h2>
                                    <p className="text-[10px] text-cyan-700/80 mt-1 font-medium">
                                        Saldo pendiente del mes
                                    </p>
                                </div>
                                <span className="text-3xl bg-white p-2 rounded-xl shadow-sm border border-cyan-50">
                                    📅
                                </span>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                                <div>
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                        Total recolectado en el mes
                                    </span>
                                    <h2 className="text-2xl font-black text-emerald-900 mt-1">
                                        {formatearKpi(kpisMes.totalRecolectado)}
                                    </h2>
                                    <p className="text-[10px] text-emerald-700/80 mt-1 font-medium">
                                        Abonos registrados en el mes
                                    </p>
                                </div>
                                <span className="text-3xl bg-white p-2 rounded-xl shadow-sm border border-emerald-50">
                                    💰
                                </span>
                            </div>

                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                                <div>
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                        Meta del mes
                                    </span>
                                    <h2 className="text-2xl font-black text-indigo-900 mt-1">
                                        {formatearKpi(kpisMes.metaMes)}
                                    </h2>
                                    <p className="text-[10px] text-indigo-700/80 mt-1 font-medium">
                                        Total si todos pagan su mensualidad
                                    </p>
                                </div>
                                <span className="text-3xl bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                                    🎯
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    {pagosFiltrados.length > 0 ? (
                        pagosFiltrados.map((p) => (
                            <PaymentRow
                                key={p.id}
                                payment={p}
                                vista={vista}
                                onRegisterPayment={(mesElegido) => {
                                    setSelectedPayment({ ...p, saldo: mesElegido.saldo, montoTotal: mesElegido.monto, id: p.id, claveMes: mesElegido.clave });
                                    setIsModalOpen(true);
                                }}
                                onChangePaymentDate={() => { }}
                                onEditMensualidades={() => abrirModalMensualidades(p)}
                                onPrintReceipt={(mes) => handleImprimirRecibo(p, mes)}
                            />
                        ))
                    ) : (
                        <div className="py-20 text-center bg-white rounded-2xl border-2 border-dashed border-gray-200">
                            <p className="text-gray-400 font-medium">No se encontraron registros con los filtros aplicados.</p>
                        </div>
                    )}
                </div>

                {isModalOpen && selectedPayment && (
                    <RegisterPaymentModal
                        payment={selectedPayment}
                        onClose={() => setIsModalOpen(false)}
                        onConfirm={handleConfirmarPago}
                    />
                )}

                {modalMensualidades && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                            <div className="bg-cyan-600 px-6 py-4">
                                <h2 className="text-white font-black text-lg">Editar mensualidades</h2>
                                <p className="text-cyan-100 text-xs font-medium mt-0.5">
                                    {modalMensualidades.nombreAlumno}
                                </p>
                            </div>
                            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                                {(modalMensualidades.cursosDetalle || []).map((curso: any) => (
                                    <div key={curso.pagoId} className="rounded-xl border border-gray-200 p-4 space-y-2">
                                        <div className="text-sm font-black text-gray-900">{curso.nombreCurso}</div>
                                        <div className="text-[10px] text-gray-500">Grupo: {curso.grupoId}</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-500">$</span>
                                            <input
                                                type="number"
                                                min="1"
                                                step="0.01"
                                                value={montosDraft[curso.pagoId] ?? ""}
                                                onChange={(e) =>
                                                    setMontosDraft((prev) => ({
                                                        ...prev,
                                                        [curso.pagoId]: e.target.value,
                                                    }))
                                                }
                                                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold focus:outline-none focus:border-cyan-400"
                                            />
                                        </div>
                                        {!curso.cobranzaActiva ? (
                                            <p className="text-[10px] text-amber-700 font-medium">
                                                Curso inactivo o alumno en baja: no aparece en control de cobranza.
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setModalMensualidades(null)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={guardandoMontos}
                                    onClick={handleGuardarMensualidades}
                                    className="px-4 py-2 rounded-xl text-xs font-black text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                                >
                                    {guardandoMontos ? "Guardando..." : "Guardar cambios"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}