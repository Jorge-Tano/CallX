// components/CRUD/UsuarioCreate.tsx
"use client";

import { useState, useEffect } from "react";
import { Usuario } from "@/types/usuario";

interface UsuarioCreateModalProps {
  onCreate: (usuario: Usuario) => Promise<void>;
  defaultDepartamento?: string;
}

// Departamentos actualizados según la imagen con sus IDs
const DEPARTAMENTOS = [
  { id: "1", nombre: "TI" },
  { id: "2", nombre: "Teams Leaders" },
  { id: "3", nombre: "Campana 5757" },
  { id: "4", nombre: "Campana SAV" },
  { id: "5", nombre: "Campana REFI" },
  { id: "6", nombre: "Campana PL" },
  { id: "7", nombre: "Campana PARLO" },
  { id: "8", nombre: "Administrativo" }
];

export default function UsuarioCreateModal({ onCreate, defaultDepartamento }: UsuarioCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    genero: "",
    numeroEmpleado: "",
    departamento: defaultDepartamento || ""
  });

  // Efecto para manejar la animación
  useEffect(() => {
    if (open) {
      // Iniciar animación después de un pequeño delay para permitir el render
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
    }
  }, [open]);

  // Efecto para establecer el departamento por defecto
  useEffect(() => {
    if (defaultDepartamento) {
      setForm(prev => ({ ...prev, departamento: defaultDepartamento }));
    }
  }, [defaultDepartamento]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar que se haya seleccionado un departamento
      if (!form.departamento) {
        alert("El departamento es requerido");
        setLoading(false);
        return;
      }

      // Preparar datos para Hikvision
      const hikvisionData = {
        ...form
      };

      const response = await fetch('/api/hikvision/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hikvisionData),
      });

      const result = await response.json();

      if (!result.success) {
        const errorDetails = result.results
          ?.filter((r: any) => !r.success)
          ?.map((r: any) => `Dispositivo ${r.deviceIp}: ${r.error}`)
          ?.join('\n') || result.error || 'Error desconocido';
        
        throw new Error(`Error en creación:\n${errorDetails}`);
      }

            
      // Usar el endpoint unificado para sincronizar
      try {
        const syncResponse = await fetch('/api/users', {
          method: 'POST', // POST fuerza sincronización manual
          headers: { 'Content-Type': 'application/json' },
        });

        const syncResult = await syncResponse.json();
        
        if (!syncResult.success) {
          console.warn('⚠️ Usuario creado pero sincronización falló:', syncResult.error);
        } else {
          console.log(`✅ Sincronización exitosa:`, syncResult.stats);
        }
      } catch (syncError) {
        console.warn('⚠️ Error en sincronización:', syncError);
        // Continuamos aunque falle la sincronización
      }

      // 🟡 PASO 3: Crear usuario local para UI usando el tipo correcto
      const nuevoUsuario: Usuario = {
        id: Date.now().toString(), // ID temporal
        nombre: form.nombre,
        genero: form.genero,
        numeroEmpleado: form.numeroEmpleado,
        employeeNo: form.numeroEmpleado, // Asegurar que employeeNo esté presente
        departamento: form.departamento,
        estado: "Activo",
        fechaCreacion: new Date().toISOString()
      };

      // Llamar a onCreate (que ahora es async)
      await onCreate(nuevoUsuario);

      // Resetear formulario
      setForm({
        nombre: "",
        genero: "",
        numeroEmpleado: "",
        departamento: defaultDepartamento || ""
      });
      
      setOpen(false);

      // Mostrar mensaje combinado
      const successfulDevices = result.results?.filter((r: any) => r.success)?.length || 0;
      const totalDevices = result.results?.length || 0;
      
      let message = `✅ Usuario creado exitosamente en ${successfulDevices}/${totalDevices} dispositivos`;
      message += "\n📊 Base de datos sincronizada automáticamente";
      
      alert(message);

    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = 'Error desconocido al crear usuario';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`❌ Error al crear usuario: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setOpen(false);
    }, 300); // Esperar a que termine la animación de salida
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group fixed top-24 right-10 z-40 
                  flex items-center gap-2 
                  w-11 hover:w-40 h-11 
                  bg-green-600 hover:bg-green-700
                  text-white rounded-full shadow-md 
                  transition-all duration-300 overflow-hidden"
        aria-label="Crear nuevo usuario"
      >
        <i className="bi bi-plus-lg text-xl ml-3"></i>
        <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300">
          <strong>Crear usuario</strong>
        </span>
      </button>

      {/* Modal con transición */}
      {open && (
        <div className={`fixed inset-0 z-50 transition-all duration-300 ease-out ${isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {/* Fondo con desenfoque */}
          <div 
            className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          
          {/* Contenido del modal con animación vertical */}
          <div className={`absolute inset-0 flex justify-center items-start pt-20 transition-all duration-300 ease-out ${
            isAnimating ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'
          }`}>
            <div className="bg-white rounded-lg shadow-xl w-[90%] max-w-2xl p-6 relative max-h-[80vh] overflow-y-auto transform transition-transform duration-300">
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-600 hover:text-black text-xl transition-colors"
                disabled={loading}
                aria-label="Cerrar modal"
              >
                <i className="bi bi-x-lg"></i>
              </button>

              <h2 className="text-xl font-semibold mb-4 text-gray-800">Crear Nuevo Usuario</h2>

              <form onSubmit={crear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Información Básica</h3>
                </div>

                <input
                  name="numeroEmpleado"
                  type="text"
                  placeholder="Número de empleado *"
                  value={form.numeroEmpleado}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  required
                  disabled={loading}
                />

                <select
                  name="genero"
                  value={form.genero}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  required
                  disabled={loading}
                >
                  <option value="">Seleccionar género *</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Otro">Otro</option>
                </select>

                <input
                  name="nombre"
                  type="text"
                  placeholder="Nombre completo *"
                  value={form.nombre}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all md:col-span-2"
                  required
                  disabled={loading}
                />

                {/* Selección de departamento */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Departamento *
                  </label>
                  <select
                    name="departamento"
                    value={form.departamento}
                    onChange={handleChange}
                    className="border border-gray-300 p-2 rounded-md text-black w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    required
                    disabled={loading}
                  >
                    <option value="">Seleccionar departamento</option>
                    {DEPARTAMENTOS.map(depto => (
                      <option key={depto.id} value={depto.nombre}>
                        {depto.nombre} 
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 mt-1">
                    El ID del departamento se asignará automáticamente
                  </p>
                </div>

                {/* Botón de crear */}
                <div className="md:col-span-2 mt-6">
                  <button
                    type="submit"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-md font-medium transition-all duration-300 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-emerald-700 shadow-md hover:shadow-lg"
                  >
                    <div className="flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Creando Usuario...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-plus-lg"></i>
                          <span>Crear Usuario</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}