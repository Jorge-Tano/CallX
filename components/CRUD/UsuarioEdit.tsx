// components/CRUD/UsuarioEdit.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Usuario } from "@/types/usuario";

interface UsuarioEditProps {
  usuario: Usuario;
  onEdit: (usuario: Usuario) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export default function UsuarioEdit({
  usuario,
  onEdit,
  onCancel,
  isOpen
}: UsuarioEditProps) {
  const [form, setForm] = useState<Usuario>({
    ...usuario,
    // Asegurar que employeeNo tenga valor (usar numeroEmpleado si employeeNo está vacío)
    employeeNo: usuario.employeeNo || usuario.numeroEmpleado || ""
  });
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Evitar problemas de hidratación
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Cerrar modal al presionar Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onCancel]);

  // Actualizar el formulario cuando cambie el usuario
  useEffect(() => {
    setForm({
      ...usuario,
      employeeNo: usuario.employeeNo || usuario.numeroEmpleado || ""
    });
  }, [usuario]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Preparar los datos en el formato que espera el endpoint
      const datosParaEnviar = {
        employeeNo: form.employeeNo || form.numeroEmpleado || "",
        nombre: form.nombre || "",
        departamento: form.departamento || "No asignado",
        genero: form.genero || "Masculino",
        estado: form.estado || "Activo"
      };

      // Validar campos requeridos
      if (!datosParaEnviar.employeeNo || !datosParaEnviar.nombre) {
        alert("El número de empleado y el nombre son campos requeridos");
        setLoading(false);
        return;
      }

      // Llamar al endpoint de edición de Hikvision
      const response = await fetch('/api/hikvision/users/edit', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(datosParaEnviar),
      });

      const result = await response.json();

      if (!result.success) {
        // Si hay errores específicos de dispositivos
        if (result.hikvision?.results) {
          const errores = result.hikvision.results
            .filter((r: any) => !r.success)
            .map((r: any) => `Dispositivo ${r.deviceIp}: ${r.error || 'Error desconocido'}`)
            .join('\n');
          
          if (errores) {
            throw new Error(`Errores en dispositivos:\n${errores}`);
          }
        }
        
        throw new Error(result.error || 'Error al editar usuario');
      }

      // Si la base de datos se actualizó exitosamente
      if (result.database?.success) {
        // Mostrar mensaje de éxito
        const successMessage = result.hikvision?.successfulDevices > 0
          ? `✅ Usuario editado exitosamente en ${result.hikvision.successfulDevices} de ${result.hikvision.totalDevices} dispositivos y en la base de datos`
          : '✅ Usuario editado exitosamente en la base de datos';

        alert(successMessage + '\n\nLa página se recargará automáticamente.');
        
        // Cerrar el modal primero
        onCancel();
        
        // Dar tiempo para que el usuario vea el mensaje
        setTimeout(() => {
          // Recargar la página para mostrar los cambios
          window.location.reload();
        }, 1500);
        
      } else {
        throw new Error('Error al actualizar en la base de datos');
      }

    } catch (error: unknown) {
      console.error('❌ Error al editar usuario:', error);
      
      let errorMessage = 'Error desconocido al editar usuario';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // No renderizar nada en el servidor o durante la hidratación inicial
  if (!isMounted) {
    return null;
  }

  // Solo renderizar el modal si está abierto
  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Fondo difuminado */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onCancel}
      />
      
      {/* Modal centrado */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          ref={modalRef}
          className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Editar Usuario</h2>
              <button
                type="button"
                onClick={onCancel}
                className="text-gray-500 hover:text-gray-700 text-2xl font-light leading-none p-1 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                aria-label="Cerrar"
                disabled={loading}
              >
                &times;
              </button>
            </div>
          </div>

          <form onSubmit={guardar} className="p-6 space-y-4">
            {/* Nombre completo */}
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre completo *
              </label>
              <input
                id="nombre"
                name="nombre"
                placeholder="Ingrese el nombre completo"
                value={form.nombre || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 placeholder-gray-400 text-gray-800 p-3 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                required
                disabled={loading}
              />
            </div>

            {/* Número de empleado */}
            <div>
              <label htmlFor="employeeNo" className="block text-sm font-medium text-gray-700 mb-1">
                Número de empleado *
              </label>
              <input
                id="employeeNo"
                name="employeeNo"
                placeholder="Ingrese el número de empleado"
                value={form.employeeNo || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 placeholder-gray-400 text-gray-800 p-3 rounded-lg
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                required
                disabled={loading}
                title="Este es el ID que se usa en los dispositivos Hikvision"
              />
              <p className="text-xs text-gray-500 mt-1">
                Este campo se mapea a <code>employee_no</code> en la base de datos
              </p>
            </div>

            {/* Número de empleado alternativo (solo lectura para referencia) */}
            {form.numeroEmpleado && form.numeroEmpleado !== form.employeeNo && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número alternativo (solo lectura)
                </label>
                <input
                  value={form.numeroEmpleado}
                  readOnly
                  className="w-full border border-gray-300 bg-gray-100 text-gray-600 p-3 rounded-lg cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Este valor no se modifica en la base de datos
                </p>
              </div>
            )}

            {/* Género */}
            <div>
              <label htmlFor="genero" className="block text-sm font-medium text-gray-700 mb-1">
                Género
              </label>
              <select
                id="genero"
                name="genero"
                value={form.genero || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 text-gray-800 p-3 rounded-lg
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                disabled={loading}
              >
                <option value="">Seleccionar género</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {/* Departamento */}
            <div>
              <label htmlFor="departamento" className="block text-sm font-medium text-gray-700 mb-1">
                Departamento
              </label>
              <input
                id="departamento"
                name="departamento"
                placeholder="Ingrese el departamento"
                value={form.departamento || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 placeholder-gray-400 text-gray-800 p-3 rounded-lg
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                disabled={loading}
              />
            </div>

            {/* Estado */}
            <div>
              <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                value={form.estado || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 text-gray-800 p-3 rounded-lg
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                disabled={loading}
              >
                <option value="">Seleccionar estado</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium
                         hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Editando...
                  </>
                ) : (
                  'Guardar Cambios'
                )}
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium
                         hover:bg-gray-300 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}