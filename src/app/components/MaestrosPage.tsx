import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, UserPlus, CheckCircle2, XCircle, Trash2, Pencil, Check, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import {
    getProfesores,
    crearProfesor,
    actualizarEstatusProfesor,
    eliminarProfesor,
    renombrarProfesor,
    restablecerPasswordProfesor,
} from '../../services/api';
import { useSyncDataReload } from '../../utils/dataSync';

interface Profesor {
    _id?: string;
    idProfesor: string;
    nombre: string;
    telefono?: string;
    estatus: string;
    usuarioAcceso?: string;
}

export function MaestrosPage() {
    const [profesores, setProfesores] = useState<Profesor[]>([]);
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [usuarioAcceso, setUsuarioAcceso] = useState('');
    const [passwordAcceso, setPasswordAcceso] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [actualizandoId, setActualizandoId] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'todos' | 'activos' | 'inactivos'>('todos');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [nombreEditado, setNombreEditado] = useState('');
    const [telefonoEditado, setTelefonoEditado] = useState('');
    const [profesorResetPassword, setProfesorResetPassword] = useState<Profesor | null>(null);
    const [nuevaPassword, setNuevaPassword] = useState('');
    const [confirmarPassword, setConfirmarPassword] = useState('');
    const [guardandoPassword, setGuardandoPassword] = useState(false);

    const cargarDatos = useCallback(() => {
        setCargando(true);
        getProfesores()
            .then((data) => setProfesores(Array.isArray(data) ? data : []))
            .catch((err) => {
                console.error('Error al traer maestros:', err);
                toast.error('No se pudieron cargar los maestros');
            })
            .finally(() => setCargando(false));
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    useSyncDataReload(cargarDatos);

    const handleCrear = async (e: React.FormEvent) => {
        e.preventDefault();
        const limpio = nombre.trim();
        const usuario = usuarioAcceso.trim().toLowerCase();
        const password = passwordAcceso;

        if (!limpio) {
            toast.error('Escribe el nombre del maestro');
            return;
        }
        if (!usuario || usuario.length < 3) {
            toast.error('El usuario de acceso debe tener al menos 3 caracteres');
            return;
        }
        if (!password || password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setGuardando(true);
        try {
            const creado = await crearProfesor({
                nombre: limpio,
                usuario,
                password,
                telefono: telefono.trim(),
            });
            toast.success('Maestro inscrito con acceso al calendario', {
                description: `Usuario: ${creado?.usuarioAcceso || usuario}`,
            });
            setNombre('');
            setTelefono('');
            setUsuarioAcceso('');
            setPasswordAcceso('');
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al inscribir al maestro');
        } finally {
            setGuardando(false);
        }
    };

    const handleCambiarEstatus = async (prof: Profesor) => {
        const activo = String(prof.estatus).toLowerCase() === 'activo';
        const nuevoEstatus = activo ? 'Inactivo' : 'Activo';

        setActualizandoId(prof.idProfesor);
        try {
            await actualizarEstatusProfesor(prof.idProfesor, nuevoEstatus);
            toast.success(
                nuevoEstatus === 'Activo'
                    ? 'Maestro activado (ya aparece en el catálogo)'
                    : 'Maestro inactivado (oculto del catálogo)'
            );
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al actualizar el maestro');
        } finally {
            setActualizandoId(null);
        }
    };

    const handleEliminar = async (prof: Profesor) => {
        if (
            !window.confirm(
                `¿Dar de baja del sistema a ${prof.nombre}?\n\n` +
                    'Se eliminará por completo. Si tiene grupos asignados, esas clases quedarán SIN profesor asignado.'
            )
        ) {
            return;
        }

        setActualizandoId(prof.idProfesor);
        try {
            const resultado = await eliminarProfesor(prof.idProfesor);
            const afectados = resultado?.gruposAfectados || 0;
            if (afectados > 0) {
                toast.warning(
                    `Maestro dado de baja. ${afectados} clase(s) quedaron sin profesor asignado.`
                );
            } else {
                toast.success('Maestro dado de baja del sistema');
            }
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al dar de baja al maestro');
        } finally {
            setActualizandoId(null);
        }
    };

    const iniciarEdicion = (prof: Profesor) => {
        setEditandoId(prof.idProfesor);
        setNombreEditado(prof.nombre);
        setTelefonoEditado(prof.telefono || '');
    };

    const cancelarEdicion = () => {
        setEditandoId(null);
        setNombreEditado('');
        setTelefonoEditado('');
    };

    const handleGuardarEdicion = async (prof: Profesor) => {
        const limpio = nombreEditado.trim();
        const tel = telefonoEditado.trim();
        if (!limpio) {
            toast.error('El nombre no puede estar vacío');
            return;
        }
        if (limpio === prof.nombre && tel === (prof.telefono || '')) {
            cancelarEdicion();
            return;
        }

        setActualizandoId(prof.idProfesor);
        try {
            await renombrarProfesor(prof.idProfesor, {
                nombre: limpio,
                telefono: tel,
            });
            toast.success('Datos del maestro actualizados');
            cancelarEdicion();
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al editar el maestro');
        } finally {
            setActualizandoId(null);
        }
    };

    const abrirResetPassword = (prof: Profesor) => {
        setProfesorResetPassword(prof);
        setNuevaPassword('');
        setConfirmarPassword('');
    };

    const cerrarResetPassword = () => {
        setProfesorResetPassword(null);
        setNuevaPassword('');
        setConfirmarPassword('');
    };

    const handleRestablecerPassword = async () => {
        if (!profesorResetPassword) return;

        if (!nuevaPassword || nuevaPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (nuevaPassword !== confirmarPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        setGuardandoPassword(true);
        try {
            await restablecerPasswordProfesor(
                profesorResetPassword.idProfesor,
                nuevaPassword
            );
            toast.success('Contraseña restablecida', {
                description: `Usuario: ${profesorResetPassword.usuarioAcceso}`,
            });
            cerrarResetPassword();
        } catch (err: any) {
            toast.error(err.message || 'Error al restablecer la contraseña');
        } finally {
            setGuardandoPassword(false);
        }
    };

    const esActivo = (p: Profesor) => String(p.estatus).toLowerCase() === 'activo';

    const profesoresFiltrados = profesores.filter((p) => {
        if (filtro === 'activos') return esActivo(p);
        if (filtro === 'inactivos') return !esActivo(p);
        return true;
    });

    const totalActivos = profesores.filter(esActivo).length;
    const totalInactivos = profesores.length - totalActivos;

    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#e9f8ff_0%,#f8fcff_45%,#e7f7ff_100%)]">
            <Navbar />

            <main className="mx-auto w-full max-w-5xl px-6 py-8">
                <header className="mb-8 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-md">
                        <GraduationCap className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Maestros</h1>
                        <p className="text-sm font-medium text-gray-500">
                            Inscribe maestros con usuario y contraseña para su calendario.
                        </p>
                    </div>
                </header>

                {/* Explicación del flujo */}
                <div className="mb-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-cyan-900">
                    <p className="font-bold">¿Cómo funcionan los estados?</p>
                    <ul className="mt-2 space-y-1">
                        <li>
                            <span className="font-black">Activo:</span> aparece en el catálogo
                            al asignar profesor a un grupo.
                        </li>
                        <li>
                            <span className="font-black">Inactivo:</span> no aparece en el
                            catálogo, pero se conserva en el sistema (puedes reactivarlo).
                        </li>
                        <li>
                            <span className="font-black">WhatsApp grupal:</span> los avisos
                            van al grupo con @mención por teléfono (
                            <code className="text-xs">@5512345678</code>
                            , 10 dígitos). Debe coincidir con el WhatsApp del maestro.
                        </li>
                        <li>
                            <span className="font-black">Teléfono WhatsApp:</span> importante
                            para las @menciones en el grupo (10 dígitos, México).
                        </li>
                        <li>
                            <span className="font-black">Acceso:</span> cada maestro recibe
                            usuario y contraseña para ver únicamente sus clases en el calendario.
                        </li>
                        <li>
                            <span className="font-black">Contraseña olvidada:</span> el
                            administrador puede restablecerla desde la lista de maestros.
                        </li>
                        <li>
                            <span className="font-black">Baja del sistema:</span> se elimina por
                            completo. Si tenía grupos, esas clases quedan sin profesor asignado.
                        </li>
                    </ul>
                </div>

                {/* Formulario para inscribir */}
                <form
                    onSubmit={handleCrear}
                    className="mb-8 rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm"
                >
                    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-cyan-700">
                        Inscribir nuevo maestro
                    </label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input
                            type="text"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Nombre completo del maestro"
                            className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 md:col-span-2"
                        />
                        <input
                            type="text"
                            value={usuarioAcceso}
                            onChange={(e) => setUsuarioAcceso(e.target.value)}
                            placeholder="Usuario de acceso (ej. ana.matias)"
                            autoComplete="off"
                            className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                        />
                        <input
                            type="password"
                            value={passwordAcceso}
                            onChange={(e) => setPasswordAcceso(e.target.value)}
                            placeholder="Contraseña (mín. 6 caracteres)"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                        />
                        <input
                            type="tel"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                            placeholder="Teléfono WhatsApp (10 dígitos, para @menciones en grupo)"
                            autoComplete="tel"
                            className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 md:col-span-2"
                        />
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0047B8] px-6 text-sm font-black text-white shadow-md transition-colors hover:bg-[#003A96] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <UserPlus className="h-4 w-4" />
                            {guardando ? 'Inscribiendo...' : 'Inscribir maestro'}
                        </button>
                    </div>
                </form>

                {/* Filtros */}
                <div className="mb-4 inline-flex rounded-xl border border-cyan-100 bg-white p-1 text-xs font-bold">
                    {([
                        { id: 'activos', label: `Activos (${totalActivos})` },
                        { id: 'inactivos', label: `Inactivos (${totalInactivos})` },
                        { id: 'todos', label: `Todos (${profesores.length})` },
                    ] as const).map((opcion) => (
                        <button
                            key={opcion.id}
                            type="button"
                            onClick={() => setFiltro(opcion.id)}
                            className={`rounded-lg px-3 py-2 transition-colors ${
                                filtro === opcion.id
                                    ? opcion.id === 'inactivos'
                                        ? 'bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-100'
                                        : 'bg-cyan-50 text-cyan-800 shadow-sm ring-1 ring-cyan-100'
                                    : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            {opcion.label}
                        </button>
                    ))}
                </div>

                {/* Lista */}
                <div className="rounded-2xl border border-cyan-100 bg-white shadow-sm">
                    {cargando ? (
                        <p className="p-8 text-center text-sm font-medium text-gray-500">
                            Cargando maestros...
                        </p>
                    ) : profesoresFiltrados.length === 0 ? (
                        <p className="p-8 text-center text-sm font-medium text-gray-500">
                            No hay maestros para mostrar.
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {profesoresFiltrados.map((prof) => {
                                const activo = esActivo(prof);
                                return (
                                    <li
                                        key={prof.idProfesor}
                                        className="flex items-center justify-between gap-4 px-5 py-4"
                                    >
                                        <div className="min-w-0 flex-1">
                                            {editandoId === prof.idProfesor ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            value={nombreEditado}
                                                            onChange={(e) => setNombreEditado(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleGuardarEdicion(prof);
                                                                if (e.key === 'Escape') cancelarEdicion();
                                                            }}
                                                            placeholder="Nombre"
                                                            className="h-9 w-full max-w-sm rounded-lg border border-cyan-300 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-cyan-200"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleGuardarEdicion(prof)}
                                                            disabled={actualizandoId === prof.idProfesor}
                                                            title="Guardar"
                                                            className="rounded-lg border border-green-200 bg-green-50 p-2 text-green-700 hover:bg-green-100 disabled:opacity-60"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelarEdicion}
                                                            title="Cancelar"
                                                            className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-500 hover:bg-gray-100"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="tel"
                                                        value={telefonoEditado}
                                                        onChange={(e) => setTelefonoEditado(e.target.value)}
                                                        placeholder="Teléfono WhatsApp"
                                                        className="h-9 w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-gray-900">
                                                            {prof.nombre}
                                                        </p>
                                                        <p className="text-xs font-medium text-gray-400">
                                                            {prof.idProfesor}
                                                            {prof.usuarioAcceso
                                                                ? ` · @${prof.usuarioAcceso}`
                                                                : ' · Sin cuenta de acceso'}
                                                            {prof.telefono
                                                                ? ` · Tel: ${prof.telefono}`
                                                                : ' · Sin teléfono'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => iniciarEdicion(prof)}
                                                        title="Editar nombre y teléfono"
                                                        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-shrink-0 items-center gap-3">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
                                                    activo
                                                        ? 'bg-green-50 text-green-700'
                                                        : 'bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                {activo ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5" />
                                                )}
                                                {activo ? 'Activo' : 'Inactivo'}
                                            </span>

                                            <button
                                                type="button"
                                                disabled={actualizandoId === prof.idProfesor}
                                                onClick={() => handleCambiarEstatus(prof)}
                                                className={`rounded-lg px-4 py-2 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                                    activo
                                                        ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                        : 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                                }`}
                                            >
                                                {actualizandoId === prof.idProfesor
                                                    ? 'Guardando...'
                                                    : activo
                                                    ? 'Inactivar'
                                                    : 'Activar'}
                                            </button>

                                            {prof.usuarioAcceso ? (
                                                <button
                                                    type="button"
                                                    disabled={actualizandoId === prof.idProfesor}
                                                    onClick={() => abrirResetPassword(prof)}
                                                    title="Restablecer contraseña de acceso"
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-800 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <Lock className="h-3.5 w-3.5" />
                                                    Restablecer contraseña
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                disabled={actualizandoId === prof.idProfesor}
                                                onClick={() => handleEliminar(prof)}
                                                title="Dar de baja del sistema (eliminar)"
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Baja del sistema
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </main>

            <Dialog
                open={Boolean(profesorResetPassword)}
                onOpenChange={(open) => {
                    if (!open) cerrarResetPassword();
                }}
            >
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Restablecer contraseña</DialogTitle>
                        <DialogDescription>
                            {profesorResetPassword
                                ? `Nueva contraseña para ${profesorResetPassword.nombre} (@${profesorResetPassword.usuarioAcceso}). Solo el administrador puede hacer este cambio.`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <input
                            type="password"
                            value={nuevaPassword}
                            onChange={(e) => setNuevaPassword(e.target.value)}
                            placeholder="Nueva contraseña (mín. 6 caracteres)"
                            autoComplete="new-password"
                            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                        />
                        <input
                            type="password"
                            value={confirmarPassword}
                            onChange={(e) => setConfirmarPassword(e.target.value)}
                            placeholder="Confirmar contraseña"
                            autoComplete="new-password"
                            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                        />
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={cerrarResetPassword}
                            disabled={guardandoPassword}
                            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleRestablecerPassword}
                            disabled={guardandoPassword}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#0047B8] px-4 py-2 text-sm font-black text-white hover:bg-[#003A96] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Lock className="h-4 w-4" />
                            {guardandoPassword ? 'Guardando...' : 'Guardar contraseña'}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
