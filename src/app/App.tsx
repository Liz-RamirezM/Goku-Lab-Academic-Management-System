import { createBrowserRouter, RouterProvider } from 'react-router-dom'; // o 'react-router-dom'
import { Dashboard } from './components/Dashboard';
import { ReschedulingFlow } from './components/ReschedulingFlow';
import { PagosPage } from './components/PagosPage';
import { AlumnosPage } from './components/AlumnosPage';
import { MaestrosPage } from './components/MaestrosPage';
import { CursosPage } from './components/CursosPage';
import { LoginPage } from './components/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';

// Importamos los contextos que tenùas originalmente en tu App.tsx
import { Toaster } from './components/ui/sonner';
import { ClassProvider } from './context/ClassContext';

// 1. Configuraciùn de los caminos (Lo que habùas puesto)
export const router = createBrowserRouter([
    {
        path: '/',
        Component: LoginPage,
    },
    {
        path: '/dashboard',
        element: (
            <ProtectedRoute>
                <Dashboard />
            </ProtectedRoute>
        ),
    },
    {
        path: '/reschedule',
        element: (
            <ProtectedRoute allowedRoles={['admin']}>
                <ReschedulingFlow />
            </ProtectedRoute>
        ),
    },
    {
        path: '/pagos',
        element: (
            <ProtectedRoute allowedRoles={['admin']}>
                <PagosPage />
            </ProtectedRoute>
        ),
    },
    {
        path: '/alumnos',
        element: (
            <ProtectedRoute allowedRoles={['admin']}>
                <AlumnosPage />
            </ProtectedRoute>
        ),
    },
    {
        path: '/maestros',
        element: (
            <ProtectedRoute allowedRoles={['admin']}>
                <MaestrosPage />
            </ProtectedRoute>
        ),
    },
    {
        path: '/cursos',
        element: (
            <ProtectedRoute allowedRoles={['admin']}>
                <CursosPage />
            </ProtectedRoute>
        ),
    },
]);

// 2. ?? ùESTE ES EL COMPONENTE QUE LE RECLAMA MAIN.TSX A TU APLICACIùN! ??
export default function App() {
    return (
        <ClassProvider>
            <RouterProvider router={router} />
            <Toaster />
        </ClassProvider>
    );
}