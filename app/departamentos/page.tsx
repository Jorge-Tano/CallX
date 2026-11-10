"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/navbar";
import IdleSessionProtector from "@/components/IdleSessionProtector";
import { useHideFrom } from "@/lib/hooks/useRole";

interface Departamento {
  groupId: number;
  nombre: string;
}

export default function DepartamentosPage() {
  const { userRole, isLoading: loadingUser } = useHideFrom();
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState<number | null>(null);

  const puedeEditar = userRole === 'TI' || userRole === 'Administrador';

  const cargarDepartamentos = async () => {
    try {
      setCargando(true);
      setError(null);
      const response = await fetch('/api/departamentos', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setDepartamentos(data.data);
      } else {
        setError(data.error || 'Error al cargar departamentos');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!loadingUser) {
      cargarDepartamentos();
    }
  }, [loadingUser]);

  const guardarNombre = async (groupId: number) => {
    const nuevoNombre = (edicion[groupId] ?? '').trim();
    if (!nuevoNombre) {
      alert('El nombre no puede quedar vacío');
      return;
    }

    setGuardando(groupId);
    try {
      const response = await fetch('/api/departamentos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ groupId, nombre: nuevoNombre }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(`❌ ${data.error || 'No se pudo guardar'}`);
        return;
      }

      await cargarDepartamentos();
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <IdleSessionProtector timeoutMinutes={15}>
      <>
        <Navbar />

        <div className="p-4 pt-20 max-w-3xl mx-auto">
          <div className="mb-4 p-4 bg-gradient-to-r from-slate-600 via-emerald-600 to-slate-700 rounded-lg shadow-lg border border-slate-500/30">
            <h1 className="text-lg font-bold text-white">Departamentos</h1>
            <p className="text-sm text-slate-200 mt-1">
              Los dispositivos de control de acceso solo reportan un número por persona (groupId).
              Aquí se le pone el nombre real a cada número para que aparezca correctamente en toda la app.
            </p>
          </div>

          {cargando || loadingUser ? (
            <div className="flex justify-center items-center min-h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Grupo (dispositivo)</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Nombre</th>
                    {puedeEditar && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {departamentos.map((dept) => (
                    <tr key={dept.groupId}>
                      <td className="px-4 py-3 text-sm text-gray-600">Grupo {dept.groupId}</td>
                      <td className="px-4 py-3">
                        {puedeEditar ? (
                          <input
                            type="text"
                            value={edicion[dept.groupId] ?? dept.nombre}
                            onChange={(e) => setEdicion(prev => ({ ...prev, [dept.groupId]: e.target.value }))}
                            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        ) : (
                          <span className="text-sm text-gray-800">{dept.nombre}</span>
                        )}
                      </td>
                      {puedeEditar && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => guardarNombre(dept.groupId)}
                            disabled={guardando === dept.groupId || (edicion[dept.groupId] ?? dept.nombre) === dept.nombre}
                            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {guardando === dept.groupId ? 'Guardando...' : 'Guardar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!puedeEditar && !cargando && !error && (
            <p className="text-xs text-gray-500 mt-3">
              Solo TI/Administrador puede renombrar departamentos.
            </p>
          )}
        </div>
      </>
    </IdleSessionProtector>
  );
}
