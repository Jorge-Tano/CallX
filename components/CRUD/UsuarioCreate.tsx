"use client";

import { useState, useEffect } from "react";

// Definir la interfaz Usuario localmente
interface Usuario {
  id: string;
  nombre: string;
  tipoUsuario?: string;
  numeroEmpleado: string;
  correo?: string;
  telefono?: string;
  fechaCreacion?: string;
  fechaModificacion?: string;
  estado?: string;
  departamento?: string;
  dispositivo?: string;
  cedula?: string;
  genero?: string;
  department_id?: number;
}

interface UsuarioCreateModalProps {
  onCreate: (usuario: Usuario) => void;
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

export default function UsuarioCreateModal({ onCreate }: UsuarioCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    cedula: "",
    genero: "",
    numeroEmpleado: "",
    correo: "",
    telefono: "",
    departamento: "",
    estado: "Activo"
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
        // El groupId se calculará automáticamente en el backend basado en el nombre del departamento
      };

      // Enviar a Hikvision
      const response = await fetch('/api/hikvision/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hikvisionData),
      });

      const result = await response.json();

      if (!result.success) {
        // Mostrar detalles del error por dispositivo
        const errorDetails = result.results
          .filter((r: any) => !r.success)
          .map((r: any) => `Dispositivo ${r.deviceIp}: ${r.error}`)
          .join('\n');
        
        throw new Error(`Error en creación:\n${errorDetails}`);
      }

      // Crear usuario local con department_id
      const nuevoUsuario: Usuario = {
        id: Date.now().toString(),
        cedula: form.cedula,
        nombre: form.nombre,
        genero: form.genero,
        numeroEmpleado: form.numeroEmpleado || form.cedula,
        correo: form.correo,
        telefono: form.telefono,
        departamento: form.departamento,
        department_id: result.userData.department_id, // ID numérico del departamento
        estado: form.estado,
        fechaCreacion: new Date().toISOString()
      };

      onCreate(nuevoUsuario);

      // Resetear formulario
      setForm({
        nombre: "",
        cedula: "",
        genero: "",
        numeroEmpleado: "",
        correo: "",
        telefono: "",
        departamento: "",
        estado: "Activo"
      });
      setOpen(false);

      // Mostrar resultado
      const successfulDevices = result.results.filter((r: any) => r.success).length;
      const totalDevices = result.results.length;
      
      if (successfulDevices === totalDevices) {
        alert("Usuario creado exitosamente en todos los dispositivos");
      } else {
        alert(`Usuario creado parcialmente: ${result.message}`);
      }

    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = 'Error desconocido al crear usuario';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Error al crear usuario: ${errorMessage}`);
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
              >
                <i className="bi bi-x-lg"></i>
              </button>

              <h2 className="text-xl font-semibold mb-4 text-gray-800">Crear Nuevo Usuario</h2>

              <form onSubmit={crear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Información Básica</h3>
                </div>

                <input
                  name="cedula"
                  type="text"
                  placeholder="Cédula *"
                  value={form.cedula}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  required
                  disabled={loading}
                />

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
                        {depto.nombre} (ID: {depto.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 mt-1">
                    El ID del departamento se asignará automáticamente
                  </p>
                </div>

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

                <select
                  name="estado"
                  value={form.estado}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  disabled={loading}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>

                {/* Información de contacto */}
                <div className="md:col-span-2 mt-4">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">Información de Contacto</h3>
                </div>

                <input
                  name="correo"
                  type="email"
                  placeholder="Correo electrónico"
                  value={form.correo}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  disabled={loading}
                />

                <input
                  name="telefono"
                  type="tel"
                  placeholder="Teléfono"
                  value={form.telefono}
                  onChange={handleChange}
                  className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  disabled={loading}
                />

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