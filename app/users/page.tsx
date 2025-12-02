"use client";

import { useEffect, useState } from "react";
import UsuariosList from "@/components/CRUD/UsuarioList";
import UsuarioCreate from "@/components/CRUD/UsuarioCreate";
import UsuarioEdit from "@/components/CRUD/UsuarioEdit";
import UsuarioDelete from "@/components/CRUD/UsuarioDelete";
import Navbar from "@/components/navbar";

// Interfaces TypeScript
interface Usuario {
  id: string;
  nombre: string;
  tipoUsuario?: string;
  numeroEmpleado: string;
  fechaCreacion?: string;
  fechaModificacion?: string;
  estado?: string;
  departamento?: string;
  dispositivo?: string;
  cedula?: string;
  genero?: string;
  department_id?: number;
  fotoPath?: string;
  fotoDeviceIp?: string;
  groupId?: number;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  timestamp: string;
  devices: string[];
  data: Usuario[];
  estadisticas: {
    totalDevices: number;
    successfulDevices: number;
    devicesWithErrors: number;
    totalUsers: number;
    usersWithPhotoInfo: number;
    porDepartamento: Record<string, number>;
  };
}

interface Estadisticas {
  dispositivosConectados: number;
  totalDispositivos: number;
  usuariosPorDepartamento: Record<string, number>;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosFiltrados, setUsuariosFiltrados] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [estadisticas, setEstadisticas] = useState<Estadisticas>({
    dispositivosConectados: 0,
    totalDispositivos: 0,
    usuariosPorDepartamento: {}
  });

  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string | null>(null);

  // Función para eliminar duplicados
  const eliminarDuplicados = (listaUsuarios: Usuario[]): Usuario[] => {
    if (!Array.isArray(listaUsuarios)) {
      return [];
    }

    const usuariosUnicos: Usuario[] = [];
    const empleadosVistos = new Set<string>();
    
    listaUsuarios.forEach(usuario => {
      if (!usuario || typeof usuario !== 'object') return;
      
      const claveUnica = usuario.numeroEmpleado || usuario.id;
      if (claveUnica && !empleadosVistos.has(claveUnica)) {
        empleadosVistos.add(claveUnica);
        usuariosUnicos.push(usuario);
      }
    });
    
    return usuariosUnicos;
  };

  // Función para aplicar filtro por departamento
  const aplicarFiltroDepartamento = (departamento: string | null) => {
    setDepartamentoFiltro(departamento);
    
    if (!departamento) {
      setUsuariosFiltrados(usuarios);
    } else {
      const filtrados = usuarios.filter(u => u.departamento === departamento);
      setUsuariosFiltrados(filtrados);
    }
  };

  // Cargar usuarios desde el endpoint Hikvision
  useEffect(() => {
    async function cargar() {
      try {
        console.log("🔄 Iniciando carga de usuarios...");
        setCargando(true);
        setError(null);
        
        // Usar la URL completa para evitar problemas de proxy
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/users`, { 
          cache: "no-store",
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          const errorMsg = `Error HTTP ${response.status} cargando usuarios`;
          console.error("❌", errorMsg);
          setError(errorMsg);
          setCargando(false);
          return;
        }

        const data: ApiResponse = await response.json();
        console.log("📦 Respuesta de la API recibida");
        
        if (data.success) {
          console.log(`📊 Total usuarios en data: ${data.data?.length || 0}`);
          
          const usuariosUnicos = eliminarDuplicados(data.data || []);
          setUsuarios(usuariosUnicos);
          setUsuariosFiltrados(usuariosUnicos); // Inicialmente mostrar todos
          
          // Calcular estadísticas basadas en usuarios únicos
          const estadisticasUnicas: Record<string, number> = {};
          usuariosUnicos.forEach(usuario => {
            const depto = usuario.departamento || "No asignado";
            estadisticasUnicas[depto] = (estadisticasUnicas[depto] || 0) + 1;
          });

          setEstadisticas({
            dispositivosConectados: data.estadisticas?.successfulDevices || 0,
            totalDispositivos: data.devices?.length || 0,
            usuariosPorDepartamento: estadisticasUnicas
          });

          console.log(`🎯 Carga completada: ${usuariosUnicos.length} usuarios únicos`);
          console.log(`📊 Usuarios por departamento:`, estadisticasUnicas);
          
          // Mostrar información de algunos usuarios para debugging
          if (usuariosUnicos.length > 0) {
            console.log("🔍 Primer usuario:", {
              nombre: usuariosUnicos[0].nombre,
              employeeNo: usuariosUnicos[0].numeroEmpleado,
              departamento: usuariosUnicos[0].departamento,
              groupId: usuariosUnicos[0].groupId
            });
          }
        } else {
          const errorMsg = data.message || "Error en la respuesta del servidor";
          console.error("❌", errorMsg);
          setError(errorMsg);
        }
      } catch (error: any) {
        console.error("❌ Error en fetch:", error);
        setError(error.message || "Error desconocido al cargar usuarios");
      } finally {
        setCargando(false);
      }
    }

    cargar();
  }, []);

  // Crear usuario localmente
  const crearUsuario = (user: Usuario) => {
    const nuevosUsuarios = [...usuarios, user];
    const usuariosUnicos = eliminarDuplicados(nuevosUsuarios);
    setUsuarios(usuariosUnicos);
    
    // Actualizar estadísticas
    const nuevasEstadisticas = { ...estadisticas.usuariosPorDepartamento };
    const depto = user.departamento || "No asignado";
    nuevasEstadisticas[depto] = (nuevasEstadisticas[depto] || 0) + 1;
    setEstadisticas(prev => ({
      ...prev,
      usuariosPorDepartamento: nuevasEstadisticas
    }));
    
    // Aplicar filtro actual si existe
    if (departamentoFiltro) {
      const filtrados = usuariosUnicos.filter(u => u.departamento === departamentoFiltro);
      setUsuariosFiltrados(filtrados);
    } else {
      setUsuariosFiltrados(usuariosUnicos);
    }
  };

  // Editar usuario local
  const actualizarUsuario = (user: Usuario) => {
    const usuarioAnterior = usuarios.find(u => u.id === user.id);
    const usuariosActualizados = eliminarDuplicados(
      usuarios.map(u => (u.id === user.id ? user : u))
    );
    setUsuarios(usuariosActualizados);
    
    // Actualizar estadísticas si cambió el departamento
    if (usuarioAnterior && usuarioAnterior.departamento !== user.departamento) {
      const nuevasEstadisticas = { ...estadisticas.usuariosPorDepartamento };
      
      // Restar del departamento anterior
      if (usuarioAnterior.departamento) {
        nuevasEstadisticas[usuarioAnterior.departamento] = 
          Math.max(0, (nuevasEstadisticas[usuarioAnterior.departamento] || 1) - 1);
      }
      
      // Sumar al nuevo departamento
      const nuevoDepto = user.departamento || "No asignado";
      nuevasEstadisticas[nuevoDepto] = (nuevasEstadisticas[nuevoDepto] || 0) + 1;
      
      setEstadisticas(prev => ({
        ...prev,
        usuariosPorDepartamento: nuevasEstadisticas
      }));
    }
    
    // Aplicar filtro actual si existe
    if (departamentoFiltro) {
      const filtrados = usuariosActualizados.filter(u => u.departamento === departamentoFiltro);
      setUsuariosFiltrados(filtrados);
    } else {
      setUsuariosFiltrados(usuariosActualizados);
    }
    
    setUsuarioEditando(null);
  };

  // Eliminar usuario local
  const eliminarUsuario = () => {
    if (!usuarioAEliminar) return;
    
    const usuariosRestantes = usuarios.filter(u => u.id !== usuarioAEliminar.id);
    setUsuarios(usuariosRestantes);
    
    // Actualizar estadísticas
    if (usuarioAEliminar.departamento) {
      const nuevasEstadisticas = { ...estadisticas.usuariosPorDepartamento };
      nuevasEstadisticas[usuarioAEliminar.departamento] = 
        Math.max(0, (nuevasEstadisticas[usuarioAEliminar.departamento] || 1) - 1);
      
      setEstadisticas(prev => ({
        ...prev,
        usuariosPorDepartamento: nuevasEstadisticas
      }));
    }
    
    // Aplicar filtro actual si existe
    if (departamentoFiltro) {
      const filtrados = usuariosRestantes.filter(u => u.departamento === departamentoFiltro);
      setUsuariosFiltrados(filtrados);
    } else {
      setUsuariosFiltrados(usuariosRestantes);
    }
    
    setUsuarioAEliminar(null);
  };

  // Función para recargar usuarios
  const recargarUsuarios = () => {
    window.location.reload();
  };

  // Limpiar filtro
  const limpiarFiltro = () => {
    setDepartamentoFiltro(null);
    setUsuariosFiltrados(usuarios);
  };

  if (cargando) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando usuarios desde múltiples dispositivos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center p-6 bg-red-50 border border-red-200 rounded-lg max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Error al cargar usuarios</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={recargarUsuarios}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />

      <div className="p-4 pt-20">
        {/* Header rediseñado con paleta equilibrada */}
        <div className="mb-4 p-4 bg-gradient-to-r from-slate-700 via-emerald-700 to-slate-800 rounded-lg shadow-lg border border-slate-600/30 mx-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
            
            {/* Sección izquierda: Título y estadísticas */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-lg font-bold text-white">Gestión de Usuarios</h1>
                
                {/* Indicador de filtro activo */}
                {departamentoFiltro && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-emerald-600/80 text-white text-xs rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                      </svg>
                      {departamentoFiltro}
                    </span>
                    <button
                      onClick={limpiarFiltro}
                      className="text-xs text-slate-300 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center bg-emerald-800/60 text-emerald-100 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 bg-emerald-300 rounded-full mr-1.5"></span>
                  {usuariosFiltrados.length} {departamentoFiltro ? `en ${departamentoFiltro}` : 'Totales'}
                </span>
                <span className="inline-flex items-center bg-blue-800/60 text-blue-100 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 bg-blue-300 rounded-full mr-1.5"></span>
                  {usuariosFiltrados.filter(u => u.fotoPath && u.fotoPath !== u.numeroEmpleado).length} Con foto
                </span>
                <span className="inline-flex items-center bg-purple-800/60 text-purple-100 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 bg-purple-300 rounded-full mr-1.5"></span>
                  {estadisticas.dispositivosConectados}/{estadisticas.totalDispositivos} disp.
                </span>
              </div>
            </div>
            
            {/* Sección derecha: Botón de agregar usuario */}
            <div className="flex-shrink-0 mt-2 md:mt-0">
              <UsuarioCreate onCreate={crearUsuario} />
            </div>
          </div>
          
          {/* Lista horizontal de departamentos como filtros */}
          <div className="mt-3 pt-3 border-t border-slate-600/50">
            <div className="flex items-center text-sm font-medium mb-2 text-slate-200">
              <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              Filtrar por Departamento ({Object.keys(estadisticas.usuariosPorDepartamento).length})
              <span className="ml-2 text-xs text-slate-400">
                • Click para filtrar
              </span>
            </div>
            
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-2 min-w-min">
                {/* Botón para mostrar todos */}
                <button
                  onClick={() => aplicarFiltroDepartamento(null)}
                  className={`transition-all duration-200 px-4 py-2.5 rounded-lg border flex-shrink-0 shadow-sm ${
                    !departamentoFiltro 
                      ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 border-emerald-500/50 text-white' 
                      : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                  }`}
                >
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    Todos
                  </div>
                </button>
                
                {/* Botones para cada departamento */}
                {Object.keys(estadisticas.usuariosPorDepartamento)
                  .sort((a, b) => a.localeCompare(b)) // Ordenar alfabéticamente
                  .map((depto) => {
                    // Determinar color base según departamento
                    const coloresDepartamentos: Record<string, string> = {
                      "TI": "from-purple-600 to-purple-500 border-purple-500/50",
                      "Teams Leaders": "from-blue-600 to-blue-500 border-blue-500/50",
                      "Campaña 5757": "from-emerald-600 to-emerald-500 border-emerald-500/50",
                      "Campaña SAV": "from-yellow-600 to-yellow-500 border-yellow-500/50",
                      "Campaña REFI": "from-red-600 to-red-500 border-red-500/50",
                      "Campaña PL": "from-indigo-600 to-indigo-500 border-indigo-500/50",
                      "Campaña PARLO": "from-pink-600 to-pink-500 border-pink-500/50",
                      "Administrativo": "from-slate-600 to-slate-500 border-slate-500/50",
                      "No asignado": "from-gray-600 to-gray-500 border-gray-500/50"
                    };
                    
                    const colorClase = coloresDepartamentos[depto] || "from-gray-600 to-gray-500 border-gray-500/50";
                    const isActive = departamentoFiltro === depto;
                    
                    return (
                      <button
                        key={depto}
                        onClick={() => aplicarFiltroDepartamento(depto)}
                        className={`transition-all duration-200 px-4 py-2.5 rounded-lg border flex-shrink-0 shadow-sm ${
                          isActive
                            ? `bg-gradient-to-br ${colorClase} text-white font-medium`
                            : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                        }`}
                        title={`Filtrar por ${depto}`}
                      >
                        <div className="text-xs font-medium truncate max-w-[120px]">
                          {depto}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Editar */}
        {usuarioEditando && (
          <div className="mb-4">
            <UsuarioEdit
              usuario={usuarioEditando}
              onEdit={actualizarUsuario}
              onCancel={() => setUsuarioEditando(null)}
            />
          </div>
        )}

        {/* Lista */}
        <div className="mb-4">
          <UsuariosList
            usuarios={usuariosFiltrados}
            onEdit={(u: Usuario) => setUsuarioEditando(u)}
            onDelete={(u: Usuario) => setUsuarioAEliminar(u)}
          />
        </div>

        {/* Eliminar */}
        <UsuarioDelete
          usuario={usuarioAEliminar}
          onCancel={() => setUsuarioAEliminar(null)}
          onConfirm={eliminarUsuario}
        />
      </div>
    </>
  );
}