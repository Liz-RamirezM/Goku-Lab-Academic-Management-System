import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, CreditCard, LogOut, Users } from 'lucide-react';
import { toast } from 'sonner';
import { CampanaNotificacionesProfesor } from './CampanaNotificacionesProfesor';

export function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();

    const userStorage = localStorage.getItem('user');
    const user = userStorage ? JSON.parse(userStorage) : null;
    const esAdmin = String(user?.rol || '').toLowerCase() === 'admin';
    const esProfesor = String(user?.rol || '').toLowerCase() === 'profesor';

    const handleLogout = () => {
        localStorage.clear();
        toast.success('Sesión cerrada correctamente');
        navigate('/');
    };

    const isActive = (path: string) => location.pathname === path;

    const navButtonClass = (path: string) =>
        `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black transition-colors ${
            isActive(path)
                ? 'bg-cyan-50 text-cyan-700 shadow-sm ring-1 ring-cyan-100'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
        }`;

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-cyan-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="mx-auto grid h-16 w-full max-w-none grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 lg:px-12">
                <div />

                <div className="flex items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className={navButtonClass('/dashboard')}
                    >
                        <CalendarDays className="h-4 w-4" />
                        Calendario de clases
                    </button>

                    {esAdmin && (
                        <button
                            type="button"
                            onClick={() => navigate('/pagos')}
                            className={navButtonClass('/pagos')}
                        >
                            <CreditCard className="h-4 w-4" />
                            Control de pagos
                        </button>
                    )}

                    {esAdmin && (
                        <button
                            type="button"
                            onClick={() => navigate('/alumnos')}
                            className={navButtonClass('/alumnos')}
                        >
                            <Users className="h-4 w-4" />
                            Alumnos inscritos
                        </button>
                    )}
                </div>

                <div className="flex min-w-0 items-center justify-end gap-3">
                    {esProfesor ? <CampanaNotificacionesProfesor /> : null}
                    <div className="hidden min-w-0 flex-col text-right sm:flex">
                        <span className="max-w-56 truncate text-xs font-black text-gray-900">
                            {user?.nombreCompleto || 'Usuario'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-600">
                            {user?.rol || 'Admin'}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                        <LogOut className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </nav>
    );
}
