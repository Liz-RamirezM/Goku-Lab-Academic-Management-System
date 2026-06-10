import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, CheckCircle2, XCircle, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';
import {
    getCursos,
    crearCurso,
    actualizarEstatusCurso,
    eliminarCurso,
    renombrarCurso,
} from '../../services/api';
import { useSyncDataReload } from '../../utils/dataSync';

interface Curso {
    _id?: string;
    idCurso: string;
    nombreCurso: string;
    estatus: string;
}

export function CursosPage() {
    const [cursos, setCursos] = useState<Curso[]>([]);
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [actualizandoId, setActualizandoId] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'todos' | 'activos' | 'inactivos'>('todos');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [nombreEditado, setNombreEditado] = useState('');

    const cargarDatos = useCallback(() => {
        setCargando(true);
        getCursos()
            .then((data) => setCursos(Array.isArray(data) ? data : []))
            .catch((err) => {
                console.error('Error al traer cursos:', err);
                toast.error('No se pudieron cargar los cursos');
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
        if (!limpio) {
            toast.error('Escribe el nombre del curso');
            return;
        }

        setGuardando(true);
        try {
            await crearCurso(limpio);
            toast.success('Curso dado de alta correctamente');
            setNombre('');
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al dar de alta el curso');
        } finally {
            setGuardando(false);
        }
    };

    const handleCambiarEstatus = async (curso: Curso) => {
        const activo = String(curso.estatus).toLowerCase() === 'activo';
        const nuevoEstatus = activo ? 'Inactivo' : 'Activo';

        setActualizandoId(curso.idCurso);
        try {
            await actualizarEstatusCurso(curso.idCurso, nuevoEstatus);
            toast.success(
                nuevoEstatus === 'Activo'
                    ? 'Curso activado. Los alumnos pausados por este curso se reactivaron.'
                    : 'Curso inactivado. Los alumnos de sus grupos pasaron a inactivos.'
            );
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al actualizar el curso');
        } finally {
            setActualizandoId(null);
        }
    };

    const handleEliminar = async (curso: Curso) => {
        if (
            !window.confirm(
                `¿Borrar del sistema el curso "${curso.nombreCurso}"?\n\n` +
                    "No se puede borrar si tiene alumnos activos en sus grupos. " +
                    "Inactiva a los alumnos en ese curso (siguen en el sistema) y elimina los grupos antes."
            )
        ) {
            return;
        }

        setActualizandoId(curso.idCurso);
        try {
            const resultado = await eliminarCurso(curso.idCurso);
            const afectados = resultado?.gruposAfectados || 0;
            if (afectados > 0) {
                toast.warning(
                    `Curso borrado. ${afectados} clase(s) quedaron sin curso asignado.`
                );
            } else {
                toast.success('Curso borrado del sistema');
            }
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al borrar el curso');
        } finally {
            setActualizandoId(null);
        }
    };

    const iniciarEdicion = (curso: Curso) => {
        setEditandoId(curso.idCurso);
        setNombreEditado(curso.nombreCurso);
    };

    const cancelarEdicion = () => {
        setEditandoId(null);
        setNombreEditado('');
    };

    const handleGuardarNombre = async (curso: Curso) => {
        const limpio = nombreEditado.trim();
        if (!limpio) {
            toast.error('El nombre no puede estar vacío');
            return;
        }
        if (limpio === curso.nombreCurso) {
            cancelarEdicion();
            return;
        }

        setActualizandoId(curso.idCurso);
        try {
            await renombrarCurso(curso.idCurso, limpio);
            toast.success('Nombre actualizado');
            cancelarEdicion();
            cargarDatos();
        } catch (err: any) {
            toast.error(err.message || 'Error al editar el curso');
        } finally {
            setActualizandoId(null);
        }
    };

    const esActivo = (c: Curso) => String(c.estatus).toLowerCase() === 'activo';

    const cursosFiltrados = cursos.filter((c) => {
        if (filtro === 'activos') return esActivo(c);
        if (filtro === 'inactivos') return !esActivo(c);
        return true;
    });

    const totalActivos = cursos.filter(esActivo).length;
    const totalInactivos = cursos.length - totalActivos;

    return (
        <div className="min-h-screen bg-[linear-gradient(135deg,#e9f8ff_0%,#f8fcff_45%,#e7f7ff_100%)]">
            <Navbar />

            <main className="mx-auto w-full max-w-5xl px-6 py-8">
                <header className="mb-8 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-md">
                        <BookOpen className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Cursos</h1>
                        <p className="text-sm font-medium text-gray-500">
                            Da de alta cursos y administra su disponibilidad.
                        </p>
                    </div>
                </header>

                {/* Explicación del flujo */}
                <div className="mb-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-cyan-900">
                    <p className="font-bold">¿Cómo funcionan los estados?</p>
                    <ul className="mt-2 space-y-1">
                        <li>
                            <span className="font-black">Activo:</span> aparece en el catálogo
                            al crear o asignar el curso de un grupo.
                        </li>
                        <li>
                            <span className="font-black">Inactivo:</span> no aparece en el
                            catálogo, pero se conserva en el sistema (puedes reactivarlo).
                        </li>
                        <li>
                            <span className="font-black">Borrar del sistema:</span> se elimina
                            por completo. Si tenía grupos, esas clases quedan sin curso asignado.
                        </li>
                    </ul>
                </div>

                {/* Formulario para dar de alta */}
                <form
                    onSubmit={handleCrear}
                    className="mb-8 rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm"
                >
                    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-cyan-700">
                        Dar de alta nuevo curso
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                            type="text"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Nombre del curso"
                            className="h-12 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                        />
                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0047B8] px-6 text-sm font-black text-white shadow-md transition-colors hover:bg-[#003A96] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Plus className="h-4 w-4" />
                            {guardando ? 'Guardando...' : 'Dar de alta'}
                        </button>
                    </div>
                </form>

                {/* Filtros */}
                <div className="mb-4 inline-flex rounded-xl border border-cyan-100 bg-white p-1 text-xs font-bold">
                    {([
                        { id: 'activos', label: `Activos (${totalActivos})` },
                        { id: 'inactivos', label: `Inactivos (${totalInactivos})` },
                        { id: 'todos', label: `Todos (${cursos.length})` },
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
                            Cargando cursos...
                        </p>
                    ) : cursosFiltrados.length === 0 ? (
                        <p className="p-8 text-center text-sm font-medium text-gray-500">
                            No hay cursos para mostrar.
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {cursosFiltrados.map((curso) => {
                                const activo = esActivo(curso);
                                return (
                                    <li
                                        key={curso.idCurso}
                                        className="flex items-center justify-between gap-4 px-5 py-4"
                                    >
                                        <div className="min-w-0 flex-1">
                                            {editandoId === curso.idCurso ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        autoFocus
                                                        value={nombreEditado}
                                                        onChange={(e) => setNombreEditado(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleGuardarNombre(curso);
                                                            if (e.key === 'Escape') cancelarEdicion();
                                                        }}
                                                        className="h-9 w-full max-w-sm rounded-lg border border-cyan-300 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-cyan-200"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleGuardarNombre(curso)}
                                                        disabled={actualizandoId === curso.idCurso}
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
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-gray-900">
                                                            {curso.nombreCurso}
                                                        </p>
                                                        <p className="text-xs font-medium text-gray-400">
                                                            {curso.idCurso}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => iniciarEdicion(curso)}
                                                        title="Editar nombre"
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
                                                disabled={actualizandoId === curso.idCurso}
                                                onClick={() => handleCambiarEstatus(curso)}
                                                className={`rounded-lg px-4 py-2 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                                    activo
                                                        ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                        : 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                                }`}
                                            >
                                                {actualizandoId === curso.idCurso
                                                    ? 'Guardando...'
                                                    : activo
                                                    ? 'Inactivar'
                                                    : 'Activar'}
                                            </button>

                                            <button
                                                type="button"
                                                disabled={actualizandoId === curso.idCurso}
                                                onClick={() => handleEliminar(curso)}
                                                title="Borrar del sistema (eliminar)"
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Borrar del sistema
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </main>
        </div>
    );
}
