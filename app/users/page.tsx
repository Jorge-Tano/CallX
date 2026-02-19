// app/usuarios/page.tsx - VERSIÓN CORREGIDA CON PERSISTENCIA DE PAGINACIÓN
"use client";

import { useEffect, useState, useMemo } from "react";
import UsuarioList from "@/components/CRUD/UsuarioList";
import UsuarioEdit from "@/components/CRUD/UsuarioEdit";
import UsuarioDeleteReal from "@/components/CRUD/UsuarioDelete";
import Navbar from "@/components/navbar";
import UsuarioCreateModal from "@/components/CRUD/UsuarioCreate";
import IdleSessionProtector from '@/components/IdleSessionProtector';
import { useHideFrom } from "@/lib/hooks/useRole";
import { Usuario } from "@/types/usuario";

// Constante para la clave de almacenamiento
const PAGINATION_STORAGE_KEY = 'usuarios_pagination_page';

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string | null>(null);
  
  // Estado para la página actual de paginación
  const [paginaActual, setPaginaActual] = useState<number>(() => {
    // Intentar recuperar la página guardada al inicializar
    if (typeof window !== 'undefined') {
      const savedPage = sessionStorage.getItem(PAGINATION_STORAGE_KEY);
      return savedPage ? parseInt(savedPage, 10) : 1;
    }
    return 1;
  });

  // Guardar la página actual en sessionStorage cada vez que cambie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(PAGINATION_STORAGE_KEY, paginaActual.toString());
    }
  }, [paginaActual]);

  // Obtener información del usuario actual
  const {
    userRole,
    userCampaign,
    userCampaignRaw,
    userDepartments,
    esTeamLeaderVentas,
    userName,
    shouldHide,
    isLoading: loadingUser,
    refreshSession
  } = useHideFrom();

  // Determinar si es Team Leader
  const isTeamLeader = userRole === 'Team Leader';

  // Determinar si es TI o Administrador (acceso global)
  const isGlobalAccess = userRole === 'TI' || userRole === 'Administrador';

  // Cargar usuarios (solo una vez al inicio)
  const cargarUsuarios = async () => {
    try {
      setCargando(true);
      setError(null);

      // SIEMPRE cargar todos los usuarios sin filtro inicial
      const url = '/api/users/bd?limit=1000';

      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();

      if (data.success) {
        const usuariosFormateados = (data.data || []).map((user: any) => ({
          ...user,
          employeeNo: String(user.employeeNo || ''),
          numeroEmpleado: String(user.employeeNo || ''),
          nombre: user.nombre || '',
          departamento: user.departamento || 'No asignado',
          campana: user.campana || 'No asignada'
        }));

        setUsuarios(usuariosFormateados);

        // Establecer filtro inicial basado en la respuesta (para Team Leaders)
        if (isTeamLeader && data.metadata?.forcedDepartment) {
          // Team Leader: usar el departamento forzado por el backend
          setDepartamentoFiltro(data.metadata.forcedDepartment);
        }
      }
    } catch (error: any) {
      console.error('❌ Error cargando usuarios:', error);
      setError(error.message);
    } finally {
      setCargando(false);
    }
  };

  // Cargar usuarios una sola vez al inicio
  useEffect(() => {
    if (!loadingUser) {
      cargarUsuarios();
    }
  }, [loadingUser]);

  // Limpiar el storage cuando el componente se desmonte (opcional)
  useEffect(() => {
    return () => {
      // Si quieres que la paginación se resetee al cerrar la pestaña, 
      // pero se mantenga al recargar, puedes mantener esto comentado
      // sessionStorage.removeItem(PAGINATION_STORAGE_KEY);
    };
  }, []);

  // Filtrar usuarios localmente basado en el departamento seleccionado
  const usuariosFiltrados = useMemo(() => {
    if (!departamentoFiltro) {
      // Si es Team Leader sin filtro explícito, aplicar filtro por sus departamentos
      if (isTeamLeader && userDepartments && userDepartments.length > 0) {
        return usuarios.filter(usuario =>
          userDepartments.includes(usuario.departamento || '')
        );
      }
      return usuarios;
    }

    // Aplicar filtro específico
    return usuarios.filter(usuario => usuario.departamento === departamentoFiltro);
  }, [usuarios, departamentoFiltro, isTeamLeader, userDepartments]);

  // Aplicar filtro por departamento - SIN RECARGAR PÁGINA
  const aplicarFiltroDepartamento = (departamento: string | null) => {
    // Solo TI/Admin pueden cambiar filtros manualmente
    if (isTeamLeader && departamento !== null) {
      console.warn('⚠️ Team Leader intentó cambiar filtro');
      alert('Los Team Leaders solo pueden ver usuarios de su(s) campaña(s) asignada(s)');
      return;
    }

    // Si se hace clic en el filtro activo, limpiarlo
    if (departamento === departamentoFiltro) {
      setDepartamentoFiltro(null);
    } else {
      setDepartamentoFiltro(departamento);
    }
    
    // Resetear a la primera página cuando se cambia el filtro
    setPaginaActual(1);
  };

  // Botón para forzar recarga de datos
  const handleRefreshData = async () => {
    await cargarUsuarios();
  };

  // 🔥 FUNCIONES CRUD ACTUALIZADAS PARA RECARGAR PÁGINA

  // Función para actualizar usuario - SIMPLIFICADA
  const actualizarUsuario = async (usuarioActualizado: Usuario) => {
    try {
      setUsuarioEditando(null);
      // Recargar después de editar
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Error en actualización:', error);
    }
  };

  // Función para eliminar usuario - SIMPLIFICADA
  const eliminarUsuario = async (deletedEmployeeNo: string) => {
    try {
      setUsuarioAEliminar(null);
      // Recargar después de eliminar
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Error al procesar eliminación:', error);
    }
  };

  // Función para crear usuario - CORREGIDA
  const crearUsuario = async (usuarios: Usuario[]) => {
    try {
      // Recargar la página después de crear
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Error recargando después de crear:', error);
    }
  };

  // Validación para Team Leaders
  const puedeGestionarUsuario = (usuario: Usuario) => {
    if (!isTeamLeader) return true;

    const usuarioDepartamento = usuario.departamento || '';
    const resultado = userDepartments?.includes(usuarioDepartamento) || false;

    return resultado;
  };

  // Obtener departamentos únicos de los usuarios
  const getDepartamentosUnicos = () => {
    // Si es Team Leader, mostrar solo sus departamentos
    if (isTeamLeader && userDepartments && userDepartments.length > 0) {
      return userDepartments;
    }

    // Para TI/Admin, mostrar todos los departamentos disponibles
    const departamentos = new Set<string>();
    usuarios.forEach(usuario => {
      if (usuario.departamento && usuario.departamento !== 'No asignado') {
        departamentos.add(usuario.departamento);
      }
    });
    return Array.from(departamentos).sort();
  };

  if (cargando || loadingUser) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando usuarios...</p>
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
            onClick={cargarUsuarios}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <IdleSessionProtector timeoutMinutes={15}>
      <>
        <Navbar />

        <div className="p-4 pt-20">
          {/* Header con información del usuario */}
          <div className="mb-4 p-4 bg-gradient-to-r from-slate-600 via-emerald-600 to-slate-700 rounded-lg shadow-lg border border-slate-500/30">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h1 className="text-lg font-bold text-white">Gestión de Usuarios</h1>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-1 bg-slate-800/70 text-slate-200 rounded text-xs">
                      {userRole || 'Usuario'}
                    </span>
                    {userName && (
                      <span className="text-slate-300 text-xs">
                        {userName}
                      </span>
                    )}

                    {isTeamLeader && userDepartments && userDepartments.length > 0 && (
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs text-slate-300">Campañas:</span>
                        <div className="flex gap-1">
                          {userDepartments.map((depto, idx) => (
                            <span key={idx} className="px-2 py-1 bg-emerald-800/70 text-emerald-100 rounded text-xs">
                              {depto.replace('Campana ', '')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botón flotante de crear usuario - OCULTAR para Team Leader */}
                  {!shouldHide(['Team Leader']) && (
                    <UsuarioCreateModal
                      onCreate={crearUsuario}
                      defaultDepartamento={isTeamLeader ? (userDepartments?.[0] || undefined) : undefined}
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center bg-emerald-800/70 text-emerald-100 px-2.5 py-1 rounded-lg">
                    <span className="w-2 h-2 bg-emerald-300 rounded-full mr-1.5"></span>
                    {usuariosFiltrados.length} {isTeamLeader ? 'en tus campañas' : (departamentoFiltro ? `en ${departamentoFiltro}` : 'Totales')}
                  </span>

                  {esTeamLeaderVentas && (
                    <span className="inline-flex items-center bg-yellow-800/70 text-yellow-100 px-2.5 py-1 rounded-lg">
                      <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Team Leader de Ventas (SAV+REFI+PL)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* MOSTRAR FILTROS SOLO PARA TI/Admin */}
            {isGlobalAccess && (
              <div className="mt-3 pt-3 border-t border-slate-500/50">
                <div className="flex items-center text-sm font-medium mb-2 text-slate-200">
                  <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                  Filtrar por Departamento ({getDepartamentosUnicos().length})
                  <span className="ml-2 text-xs text-slate-400">• Click para filtrar/desfiltrar</span>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-2 min-w-min">
                    <button
                      onClick={() => aplicarFiltroDepartamento(null)}
                      className={`transition-all duration-200 px-4 py-2.5 rounded-lg border flex-shrink-0 shadow-sm ${!departamentoFiltro
                        ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 border-emerald-500/50 text-white'
                        : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                        }`}
                    >
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                        Todos ({usuarios.length})
                      </div>
                    </button>

                    {getDepartamentosUnicos().map((depto) => {
                      const coloresDepartamentos: Record<string, string> = {
                        "TI": "from-purple-600 to-purple-500 border-purple-500/50",
                        "Teams Leaders": "from-blue-600 to-blue-500 border-blue-500/50",
                        "Campana 5757": "from-emerald-600 to-emerald-500 border-emerald-500/50",
                        "Campana SAV": "from-yellow-600 to-yellow-500 border-yellow-500/50",
                        "Campana REFI": "from-red-600 to-red-500 border-red-500/50",
                        "Campana PL": "from-indigo-600 to-indigo-500 border-indigo-500/50",
                        "Campana PARLO": "from-pink-600 to-pink-500 border-pink-500/50",
                        "Administrativo": "from-slate-600 to-slate-500 border-slate-500/50",
                        "No asignado": "from-gray-600 to-gray-500 border-gray-500/50"
                      };

                      const colorClase = coloresDepartamentos[depto] || "from-gray-600 to-gray-500 border-gray-500/50";
                      const isActive = departamentoFiltro === depto;

                      // Contar cuántos usuarios hay en este departamento
                      const count = usuarios.filter(u => u.departamento === depto).length;

                      return (
                        <button
                          key={depto}
                          onClick={() => aplicarFiltroDepartamento(depto)}
                          className={`transition-all duration-200 px-4 py-2.5 rounded-lg border flex-shrink-0 shadow-sm ${isActive
                            ? `bg-gradient-to-br ${colorClase} text-white font-medium`
                            : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                            }`}
                          title={`Filtrar por ${depto} (${count} usuarios)`}
                        >
                          <div className="text-xs font-medium flex items-center gap-1.5">
                            <span className="truncate max-w-[100px]">{depto}</span>
                            <span className="bg-slate-800/50 text-slate-200 text-[10px] px-1.5 py-0.5 rounded">
                              {count}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Mensaje para Team Leaders */}
            {isTeamLeader && (
              <div className="mt-3 pt-3 border-t border-slate-500/50">
                <div className="text-sm text-slate-300 flex items-center">
                  <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Como Team Leader, solo puedes ver y gestionar usuarios de {userDepartments?.join(', ') || 'tu(s) campaña(s) asignada(s)'}
                  <span className="ml-2 text-emerald-400">({usuariosFiltrados.length} usuarios)</span>
                </div>
              </div>
            )}
          </div>

          {/* Lista de usuarios - Pasamos paginaActual y setPaginaActual como props */}
          <div className="mb-4">
            <UsuarioList
              usuarios={usuariosFiltrados}
              onEdit={(u: Usuario) => {
                if (!puedeGestionarUsuario(u)) {
                  alert(`Solo puedes editar usuarios de tus campañas asignadas: ${userDepartments?.join(', ')}`);
                  return;
                }
                setUsuarioEditando(u);
              }}
              onDelete={(u: Usuario) => {
                if (!puedeGestionarUsuario(u)) {
                  alert(`Solo puedes eliminar usuarios de tus campañas asignadas: ${userDepartments?.join(', ')}`);
                  return;
                }
                setUsuarioAEliminar(u);
              }}
              currentUserRol={userRole}
              allowedDepartment={userDepartments?.[0] || null}
              allowedDepartments={userDepartments || []}
              // Nuevas props para la paginación
              currentPage={paginaActual}
              onPageChange={setPaginaActual}
            />
          </div>

          {/* Eliminar usuario */}
          {usuarioAEliminar && (
            <UsuarioDeleteReal
              usuario={usuarioAEliminar}
              onCancel={() => setUsuarioAEliminar(null)}
              onConfirm={eliminarUsuario}
            />
          )}

          {/* Modal de edición */}
          {usuarioEditando && (
            <UsuarioEdit
              usuario={usuarioEditando}
              onEdit={actualizarUsuario}
              onCancel={() => setUsuarioEditando(null)}
              isOpen={!!usuarioEditando}
            />
          )}
        </div>
      </>
    </IdleSessionProtector>
  );
}