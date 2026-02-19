// components/CRUD/UsuarioCreate.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Usuario } from "@/types/usuario";
import * as XLSX from 'xlsx';

interface UsuarioCreateModalProps {
  onCreate: (usuarios: Usuario[]) => Promise<void>;
  defaultDepartamento?: string;
}

interface UsuarioForm {
  nombre: string;
  genero: string;
  numeroEmpleado: string;
  departamento: string;
}

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

const GENEROS = ["Masculino", "Femenino", "Otro"];

export default function UsuarioCreateModal({ onCreate, defaultDepartamento }: UsuarioCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'masivo'>('individual');
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number>(0);

  // Formulario individual
  const [individualForm, setIndividualForm] = useState<UsuarioForm>({
    nombre: "",
    genero: "",
    numeroEmpleado: "",
    departamento: defaultDepartamento || ""
  });

  // Usuarios masivos
  const [usuariosMasivos, setUsuariosMasivos] = useState<UsuarioForm[]>([
    { nombre: "", genero: "", numeroEmpleado: "", departamento: defaultDepartamento || "" }
  ]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
    }
  }, [open]);

  useEffect(() => {
    if (defaultDepartamento) {
      setIndividualForm(prev => ({ ...prev, departamento: defaultDepartamento }));
      setUsuariosMasivos(prev =>
        prev.map(usuario => ({ ...usuario, departamento: defaultDepartamento }))
      );
    }
  }, [defaultDepartamento]);

  // Manejar cambios en formulario individual
  const handleIndividualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setIndividualForm({ ...individualForm, [e.target.name]: e.target.value });
  };

  // Manejar cambios en formulario masivo
  const handleMasivoChange = (index: number, field: keyof UsuarioForm, value: string) => {
    const nuevosUsuarios = [...usuariosMasivos];
    nuevosUsuarios[index][field] = value;
    setUsuariosMasivos(nuevosUsuarios);
  };

  // Agregar fila al formulario masivo
  const agregarFila = () => {
    setUsuariosMasivos([
      ...usuariosMasivos,
      { nombre: "", genero: "", numeroEmpleado: "", departamento: defaultDepartamento || "" }
    ]);
  };

  // Eliminar fila del formulario masivo
  const eliminarFila = (index: number) => {
    if (usuariosMasivos.length > 1) {
      const nuevosUsuarios = [...usuariosMasivos];
      nuevosUsuarios.splice(index, 1);
      setUsuariosMasivos(nuevosUsuarios);
    }
  };

  // Manejar subida de archivo Excel
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const usuarios: UsuarioForm[] = jsonData.map((row: any) => ({
          nombre: row.nombre || row.Nombre || '',
          genero: row.genero || row.Genero || row.Género || '',
          numeroEmpleado: String(row.numeroEmpleado || row['Número Empleado'] || row.employeeNo || ''),
          departamento: row.departamento || row.Departamento || defaultDepartamento || ''
        }));

        setUsuariosMasivos(usuarios.length > 0 ? usuarios : [
          { nombre: "", genero: "", numeroEmpleado: "", departamento: defaultDepartamento || "" }
        ]);
      } catch (error) {
        console.error('Error al procesar archivo Excel:', error);
        alert('Error al procesar el archivo Excel. Verifique el formato.');
        setUploadedFileName(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Descargar plantilla Excel
  const descargarPlantilla = () => {
    const plantilla = [
      ['nombre', 'genero', 'numeroEmpleado', 'departamento']
    ];

    const ws = XLSX.utils.aoa_to_sheet(plantilla);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'plantilla_usuarios.xlsx');
  };

  // Crear usuario individual
  const crearIndividual = async (e: React.FormEvent) => {
    e.preventDefault();
    await crearUsuarios([individualForm]);
  };

  // Crear usuarios masivos
  const crearMasivo = async (e: React.FormEvent) => {
    e.preventDefault();
    // Filtrar usuarios que tienen datos
    const usuariosValidos = usuariosMasivos.filter(user =>
      user.nombre && user.genero && user.numeroEmpleado && user.departamento
    );

    if (usuariosValidos.length === 0) {
      alert('Por favor, complete al menos un usuario');
      return;
    }

    await crearUsuarios(usuariosValidos);
  };

  // Función principal para crear usuarios
  const crearUsuarios = async (usuarios: UsuarioForm[]) => {
    setLoading(true);
    setProgress(0);

    try {
      // Enviar datos al endpoint
      const response = await fetch('/api/hikvision/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(usuarios.length === 1 ? usuarios[0] : usuarios),
      });

      const result = await response.json();
      setProgress(50);

      if (!result.success) {
        let errorMessage = 'Error al crear usuarios:\n';

        if (result.details) {
          errorMessage += result.details.join('\n');
        } else if (result.results) {
          result.results.forEach((userResult: any) => {
            if (!userResult.success) {
              errorMessage += `\nUsuario ${userResult.userIndex} (${userResult.nombre}):\n`;
              userResult.deviceResults.forEach((device: any) => {
                if (!device.success) {
                  errorMessage += `  • Dispositivo ${device.deviceIp}: ${device.error}\n`;
                }
              });
            }
          });
        } else {
          errorMessage += result.error || 'Error desconocido';
        }

        throw new Error(errorMessage);
      }

      // Actualizar progreso
      setProgress(75);

      // Sincronizar con la base de datos
      try {
        const syncResponse = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const syncResult = await syncResponse.json();

        if (!syncResult.success) {
          console.warn('⚠️ Usuarios creados pero sincronización falló:', syncResult.error);
        }
      } catch (syncError) {
        console.warn('⚠️ Error en sincronización:', syncError);
      }

      setProgress(100);

      // Crear usuarios locales para UI
      const nuevosUsuarios: Usuario[] = usuarios.map(user => ({
        id: Date.now().toString() + Math.random(),
        nombre: user.nombre,
        genero: user.genero,
        numeroEmpleado: user.numeroEmpleado,
        employeeNo: user.numeroEmpleado,
        departamento: user.departamento,
        estado: "Activo",
        fechaCreacion: new Date().toISOString()
      }));

      await onCreate(nuevosUsuarios);

      // Resetear formularios
      setIndividualForm({
        nombre: "",
        genero: "",
        numeroEmpleado: "",
        departamento: defaultDepartamento || ""
      });

      setUsuariosMasivos([
        { nombre: "", genero: "", numeroEmpleado: "", departamento: defaultDepartamento || "" }
      ]);

      setUploadedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Mostrar mensaje de éxito
      const successCount = result.summary?.successfulUsers || 0;
      const totalCount = result.summary?.totalUsers || 0;

      let message = `✅ ${successCount} de ${totalCount} usuario(s) creado(s) exitosamente`;

      if (result.syncResult?.success) {
        message += "\n📊 Base de datos sincronizada automáticamente";
      }

      alert(message);

      setOpen(false);

    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = 'Error desconocido al crear usuario(s)';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const closeModal = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setOpen(false);
    }, 300);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group fixed top-24 right-10 z-40 
                  flex items-center gap-2 
                  w-11 hover:w-44 h-11 
                  bg-green-600 hover:bg-green-700
                  text-white rounded-full shadow-md 
                  transition-all duration-300 overflow-hidden"
        aria-label="Crear nuevo usuario"
      >
        <i className="bi bi-plus-lg text-xl ml-3"></i>
        <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300">
          <strong>Crear usuario(s)</strong>
        </span>
      </button>

      {open && (
        <div className={`fixed inset-0 z-50 transition-all duration-300 ease-out ${isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />

          <div className={`absolute inset-0 flex justify-center items-start pt-10 transition-all duration-300 ease-out ${isAnimating ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'
            }`}>
            <div className="bg-white rounded-lg shadow-xl w-[95%] max-w-6xl p-6 relative max-h-[90vh] overflow-y-auto transform transition-transform duration-300">
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-600 hover:text-black text-xl transition-colors"
                disabled={loading}
                aria-label="Cerrar modal"
              >
                <i className="bi bi-x-lg"></i>
              </button>

              <h2 className="text-xl font-semibold mb-6 text-gray-800">Crear Usuario(s)</h2>

              {/* Pestañas */}
              <div className="flex border-b border-gray-200 mb-6">
                <button
                  type="button"
                  className={`px-4 py-2 font-medium transition-colors ${activeTab === 'individual'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('individual')}
                  disabled={loading}
                >
                  <i className="bi bi-person-plus mr-2"></i>
                  Individual
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 font-medium transition-colors ${activeTab === 'masivo'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('masivo')}
                  disabled={loading}
                >
                  <i className="bi bi-people-fill mr-2"></i>
                  Masivo
                </button>
              </div>

              {/* Barra de progreso */}
              {loading && (
                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progreso: {progress}%</span>
                    <span>{progress === 100 ? 'Completado' : 'Procesando...'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Formulario Individual */}
              {activeTab === 'individual' && (
                <form onSubmit={crearIndividual} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Información del Usuario</h3>
                  </div>

                  <input
                    name="numeroEmpleado"
                    type="text"
                    placeholder="Número de empleado *"
                    value={individualForm.numeroEmpleado}
                    onChange={handleIndividualChange}
                    className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    required
                    disabled={loading}
                  />

                  <select
                    name="genero"
                    value={individualForm.genero}
                    onChange={handleIndividualChange}
                    className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    required
                    disabled={loading}
                  >
                    <option value="">Seleccionar género *</option>
                    {GENEROS.map(genero => (
                      <option key={genero} value={genero}>{genero}</option>
                    ))}
                  </select>

                  <input
                    name="nombre"
                    type="text"
                    placeholder="Nombre completo *"
                    value={individualForm.nombre}
                    onChange={handleIndividualChange}
                    className="border border-gray-300 p-2 rounded-md text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all md:col-span-2"
                    required
                    disabled={loading}
                  />

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Departamento *
                    </label>
                    <select
                      name="departamento"
                      value={individualForm.departamento}
                      onChange={handleIndividualChange}
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
                  </div>

                  <div className="md:col-span-2 mt-6">
                    <button
                      type="submit"
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
              )}

              {/* Formulario Masivo */}
              {activeTab === 'masivo' && (
                <div>
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-medium text-blue-800 mb-2">
                      <i className="bi bi-info-circle mr-2"></i>
                      Carga masiva de usuarios
                    </h3>
                    <div className="flex flex-wrap gap-4">
                      <button
                        type="button"
                        onClick={descargarPlantilla}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 transition-colors"
                        disabled={loading}
                      >
                        <i className="bi bi-download"></i>
                        Descargar plantilla Excel
                      </button>

                      <div className="flex-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="excel-upload"
                          disabled={loading}
                        />
                        <label
                          htmlFor="excel-upload"
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <i className="bi bi-upload"></i>
                          {uploadedFileName || 'Subir archivo Excel'}
                        </label>
                        {uploadedFileName && (
                          <p className="text-sm text-green-600 mt-1">
                            <i className="bi bi-check-circle mr-1"></i>
                            {uploadedFileName} cargado
                          </p>
                        )}
                      </div>

                    </div>
                  </div>

                  <form onSubmit={crearMasivo}>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-600">
                        Total de usuarios: {usuariosMasivos.length}
                      </p>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full max-w-md bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-md font-medium transition-all duration-300 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-blue-700 shadow-md hover:shadow-lg"
                      >
                        <div className="flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Creando {usuariosMasivos.length} Usuarios...</span>
                            </>
                          ) : (
                            <>
                              <i className="bi bi-people-fill"></i>
                              <span>Crear {usuariosMasivos.length} Usuario(s)</span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}