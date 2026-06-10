import * as React from "react";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { construirMensajeRecordatorioPago } from "../../utils/mensajesWhatsApp";
import { MensajeWhatsAppModal } from "./MensajeWhatsAppModal";

const formatearFecha = (fechaIso: string) => {
    if (!fechaIso) return "Sin fecha";
    const opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return new Date(fechaIso).toLocaleDateString('es-ES', opciones);
};

const formatearMonto = (monto: number) => {
    return Number(monto || 0).toLocaleString('es-MX');
};

const estaVencido = (fechaIso: string, status: string) => {
    if (!fechaIso) return false;
    const hoy = new Date();
    const limite = new Date(fechaIso);
    return limite < hoy && status !== "Pagado";
};

interface PaymentRowProps {
    payment: any;
    vista?: 'control' | 'registro' | 'proximos';
    onRegisterPayment: (mesElegido?: any) => void;
    onChangePaymentDate: () => void;
    onEditMensualidades?: () => void;
    onPrintReceipt?: (mes: any) => void;
}

export function PaymentRow({ payment, vista, onRegisterPayment, onChangePaymentDate, onEditMensualidades, onPrintReceipt }: PaymentRowProps) {
    const [modalRecordatorio, setModalRecordatorio] = useState(false);
    const isPaid = payment.status === "Pagado" || vista === 'registro';
    const esProgramado = payment.status === "Programado" || payment.cobroProgramado;
    const periodosRaw = payment.periodosMensuales || [];

    const hoy = new Date();
    const totalMesesHoy = hoy.getFullYear() * 12 + hoy.getMonth();

    // --- SOLUCIÓN A LOS TOTALES GLOBALES ---
    // El TOTAL ahora filtra estrictamente para sumar solo lo que se debe cobrar hasta el mes actual
    const sumMontoReal = periodosRaw.reduce((sum: number, m: any) => {
        if (!m.vencimiento || m.status === "Programado") return sum;
        const v = new Date(m.vencimiento);
        const totalMesesVence = v.getFullYear() * 12 + v.getMonth();

        // Solo suma si el mes ya pasó o es el mes en curso (ignora el futuro)
        if (totalMesesVence <= totalMesesHoy) {
            return sum + (m.monto || 0);
        }
        return sum;
    }, 0);

    const totalGlobalMonto = periodosRaw.length > 0 ? sumMontoReal : (payment.montoTotal || 0);

    // El ABONADO suma todo el dinero que el alumno ha pagado históricamente (incluyendo adelantos)
    const totalGlobalPagado = periodosRaw.reduce((sum: number, m: any) => sum + (m.pagado || 0), 0) || payment.montoPagado || 0;

    // El ADEUDO REAL es lo que debía pagar hasta hoy, menos todo el dinero que ya ingresó
    const totalGlobalAdeudo = Math.max(0, totalGlobalMonto - totalGlobalPagado);

    // --- CANDADO DE TIEMPO ESTRICTO POR MES CALENDARIO PARA LAS TARJETAS ---
    const mesesAMostrar = periodosRaw.filter((m: any) => {
        if (!m.vencimiento) return false;

        const v = new Date(m.vencimiento);
        const totalMesesVence = v.getFullYear() * 12 + v.getMonth();

        if (vista === 'registro') {
            return m.status === "Pagado";
        } else if (vista === 'proximos') {
            return totalMesesVence > totalMesesHoy && m.status !== "Pagado";
        } else {
            return totalMesesVence <= totalMesesHoy && m.status !== "Pagado";
        }
    });

    const primerMesPendienteIndex = periodosRaw.findIndex((m: any) =>
        m.status === "Pendiente" || m.status === "Parcial"
    );

    const vencido = !esProgramado && estaVencido(payment.fechaLimite, payment.status);

    const puedeRecordatorio =
        !isPaid &&
        payment.status !== "Baja" &&
        payment.status !== "Programado";

    const periodoRecordatorio =
        periodosRaw.find((m: any) => {
            if (!payment.fechaLimite || !m.vencimiento) return false;
            const v = new Date(m.vencimiento);
            const lim = new Date(payment.fechaLimite);
            return (
                v.getFullYear() === lim.getFullYear() &&
                v.getMonth() === lim.getMonth()
            );
        }) ||
        periodosRaw.find(
            (m: any) => m.status === "Pendiente" || m.status === "Parcial"
        );

    const montoMes = Number(
        periodoRecordatorio?.monto ?? payment.montoTotal ?? 0
    );
    const abonadoMes = Number(
        periodoRecordatorio?.pagado ?? payment.montoPagado ?? 0
    );
    const saldoMes =
        periodoRecordatorio?.saldo != null
            ? Number(periodoRecordatorio.saldo)
            : Math.max(0, montoMes - abonadoMes);

    const mensajeRecordatorio = construirMensajeRecordatorioPago({
        nombreTutor: payment.nombreTutor,
        nombreCurso: payment.nombreCurso,
        montoMensualidad: montoMes,
        montoAbonado: abonadoMes,
        saldoPendiente: saldoMes,
        diaPago: payment.diaPagoFijo,
        fechaLimite: payment.fechaLimite,
        mesCobro: payment.mesCobroVigente,
    });

    return (
        <>
        <MensajeWhatsAppModal
            open={modalRecordatorio}
            onClose={() => setModalRecordatorio(false)}
            titulo="Recordatorio de pago"
            mensajeInicial={mensajeRecordatorio}
            telefono={payment.telefonoTutor}
            destinatarioLabel={
                payment.nombreTutor || payment.telefonoTutor
                    ? `Para: ${payment.nombreTutor || "Tutor"}${payment.telefonoTutor ? ` · ${payment.telefonoTutor}` : ""}`
                    : undefined
            }
        />
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">

            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-6 flex-1 flex-wrap">

                    <div className="flex flex-col min-w-[120px]">
                        <span className="text-[10px] font-bold text-cyan-600 uppercase">
                            {isPaid ? "Último Pago" : "Próximo Vencimiento"}
                        </span>
                        <span className={`text-sm font-bold ${vencido ? 'text-red-500' : 'text-gray-900'}`}>
                            {formatearFecha(payment.fechaLimite)}
                        </span>
                    </div>

                    {isPaid && (
                        <>
                            <div className="flex flex-col min-w-[100px]">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase">Pago Real</span>
                                <span className="text-sm font-bold text-emerald-700">
                                    {payment.fechaPagoReal ? formatearFecha(payment.fechaPagoReal) : "N/A"}
                                </span>
                            </div>
                            <div className="flex flex-col min-w-[100px]">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase">Método</span>
                                <span className="text-sm font-bold text-emerald-700 capitalize">
                                    {payment.metodoAbono || payment.metodoPago || "N/A"}
                                </span>
                            </div>
                        </>
                    )}

                    <div className="flex flex-col min-w-[150px]">
                        <span className="text-[10px] font-bold text-cyan-600 uppercase">Alumno</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{payment.nombreAlumno}</span>
                            {payment.activo === false ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">BAJA</span>
                            ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">ACTIVO</span>
                            )}
                        </div>
                        {payment.nombreTutor || payment.telefonoTutor ? (
                            <span className="text-[10px] text-gray-500 mt-0.5">
                                {payment.nombreTutor ? `Tutor: ${payment.nombreTutor}` : "Tutor"}
                                {payment.telefonoTutor ? ` · ${payment.telefonoTutor}` : ""}
                            </span>
                        ) : null}
                    </div>

                    <div className="flex flex-col min-w-[130px]">
                        <span className="text-[10px] font-bold text-cyan-600 uppercase">Curso</span>
                        <span className="text-sm font-bold text-gray-600 truncate max-w-[280px]" title={payment.nombreCurso}>
                            {payment.nombreCurso}
                        </span>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Total</span>
                        <span className="text-sm font-bold">${formatearMonto(totalGlobalMonto)}</span>
                    </div>

                    {!isPaid && (
                        <>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-emerald-500 uppercase">Abonado</span>
                                <span className="text-sm font-bold text-emerald-600">${formatearMonto(totalGlobalPagado)}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-red-400 uppercase">Adeudo Real</span>
                                <span className="text-sm font-bold text-red-500">${formatearMonto(totalGlobalAdeudo)}</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                {onEditMensualidades && (payment.cursosDetalle?.length || payment.nombreCurso) ? (
                    <button
                        type="button"
                        onClick={onEditMensualidades}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-800 hover:bg-cyan-100 transition-colors"
                        title="Editar mensualidad por curso"
                    >
                        Editar mensualidad
                    </button>
                ) : null}
                {puedeRecordatorio && (
                    <button
                        type="button"
                        onClick={() => setModalRecordatorio(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 transition-colors"
                        title="Abrir WhatsApp con recordatorio de pago al tutor"
                    >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Recordatorio
                    </button>
                )}
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${isPaid ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                    esProgramado ? "bg-sky-50 text-sky-700 border-sky-200" :
                        "bg-amber-50 text-amber-600 border-amber-100"
                    }`}>
                    {payment.status}
                </div>
                </div>
            </div>

            {mesesAMostrar.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-3">
                        {vista === 'registro' ? "Historial de pagos" : (vista === 'proximos' ? "Proyección de meses futuros" : "Meses pendientes")}
                    </p>

                    <div className="max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pb-2">
                            {mesesAMostrar.map((mes: any) => {
                                const esPagado = mes.status === "Pagado";
                                const indiceReal = periodosRaw.indexOf(mes);
                                const estaBloqueado = indiceReal > primerMesPendienteIndex && primerMesPendienteIndex !== -1;

                                return (
                                    <div key={mes.clave} className={`flex flex-col justify-between rounded-lg border px-4 py-3 text-xs ${esPagado ? 'border-emerald-100 bg-emerald-50/30' : 'border-gray-100 bg-gray-50'}`}>
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-gray-900 capitalize text-sm">{mes.nombreMes}</div>

                                                {mes.pagado > 0 && onPrintReceipt && (
                                                    <button
                                                        onClick={() => onPrintReceipt(mes)}
                                                        className="text-emerald-600 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-md transition-colors font-bold text-[10px]"
                                                        title="Imprimir comprobante"
                                                    >
                                                        🖨️ {mes.status === "Pagado" ? "RECIBO MES" : "RECIBO PARCIAL"}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="text-gray-500 mt-1">Vence: {formatearFecha(mes.vencimiento)}</div>

                                            <div className="mt-2 flex justify-between items-end border-t pt-2 font-medium">
                                                <div className="flex flex-col">
                                                    <span>${formatearMonto(mes.pagado)} / ${formatearMonto(mes.monto)}</span>
                                                    {mes.pagado > 0 && (mes.metodoAbono || mes.metodoPago) && (
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                                                            💳 {mes.metodoAbono || mes.metodoPago}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={esPagado ? "text-emerald-600" : "text-amber-600"}>{mes.status}</span>
                                            </div>
                                        </div>

                                        {!esPagado && (
                                            <button
                                                onClick={() => !estaBloqueado && onRegisterPayment(mes)}
                                                disabled={estaBloqueado}
                                                className={`mt-3 w-full rounded-md py-2 text-[10px] font-black uppercase tracking-widest transition-all ${estaBloqueado
                                                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                    : "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 shadow-sm"
                                                    }`}
                                            >
                                                {estaBloqueado ? "Paga mes anterior" : `Abonar a ${mes.nombreMes.split(' ')[0]}`}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}