// components/CRUD/UsuarioDeleteReal.tsx
"use client";

import { useState, useEffect } from "react";
import { Usuario } from "@/types/usuario";

interface DeviceResult {
  success: boolean;
  deviceIp: string;
  error?: string;
  message?: string;
  method?: string;
  format?: string;
}

interface DatabaseResult {
  success: boolean;
  message?: string;
  error?: string;
  warning?: boolean;
  databaseError?: boolean;
}

interface UsuarioDeleteProps {
  usuario: Usuario | null;
  onCancel: () => void;
  onConfirm: (deletedEmployeeNo: string) => void;
}

export default function UsuarioDeleteReal({
  usuario,
  onCancel,
  onConfirm
}: UsuarioDeleteProps) {
  const [loading, setLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ 
    success: boolean; 
    message: string; 
    results?: DeviceResult[];
    deletedEmployeeNo?: string;
    databaseSync?: {
      attempted: boolean;
      success?: boolean;
      message?: string;
      warning?: boolean;
      error?: string;
    };
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(null);

  // Limpiar el timer cuando el componente se desmonte
  useEffect(() => {
    return () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
    };
  }, [autoCloseTimer]);

  // Función para eliminar de la base de datos
  const deleteFromDatabase = async (employeeNo: string): Promise<DatabaseResult> => {
    
    try {
      const response = await fetch('/api/database/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          employeeNo: employeeNo.trim()
        })
      });

      const result = await response.json();
      console.log('📋 RESULTADO DE DB:', result);

      return {
        success: result.success || false,
        message: result.message,
        error: result.error,
        warning: result.warning,
        databaseError: result.databaseError
      };
    } catch (error: unknown) {
      console.error('💥 ERROR al eliminar de DB:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido en conexión a DB',
        databaseError: true
      };
    }
  };

  const handleDelete = async () => {
    if (!usuario) return;
    
    setLoading(true);
    setDbLoading(false);
    setDeleteResult(null);
    setConfirmed(false);
    
    try {
      const employeeNo = usuario.employeeNo || usuario.numeroEmpleado;
      
      if (!employeeNo || employeeNo.trim() === '') {
        throw new Error("El usuario no tiene un número de empleado válido");
      }

      
      // 1. Primero eliminar de dispositivos Hikvision
      const hikvisionResponse = await fetch('/api/hikvision/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          employeeNo: employeeNo.trim()
        })
      });

      if (!hikvisionResponse.ok) {
        throw new Error(`Error HTTP ${hikvisionResponse.status}: ${hikvisionResponse.statusText}`);
      }

      const hikvisionResult = await hikvisionResponse.json();
      console.log('📋 RESULTADO REAL DE LA API HIKVISION:', hikvisionResult);

      if (hikvisionResult.securityViolation) {
        setDeleteResult({
          success: false,
          message: `❌ Violación de seguridad: ${hikvisionResult.error}`,
          deletedEmployeeNo: employeeNo
        });
        return;
      }

      const successfulDevices = hikvisionResult.results?.filter((r: DeviceResult) => r.success).length || 0;
      const totalDevices = hikvisionResult.results?.length || 0;
      
      // 2. Luego eliminar de la base de datos (solo si hubo éxito en al menos un dispositivo)
      let databaseResult: DatabaseResult | null = null;
      
      if (successfulDevices > 0) {
        setDbLoading(true);
        databaseResult = await deleteFromDatabase(employeeNo);
        setDbLoading(false);
      }

      // Determinar éxito general
      const generalSuccess = successfulDevices > 0 && (!databaseResult || databaseResult.success !== false);
      
      // Preparar mensaje general
      let generalMessage = '';
      if (generalSuccess) {
        const dbMessage = databaseResult?.warning ? 
          ` (DB: ${databaseResult.message})` : 
          ` (DB: ${databaseResult?.message || 'Eliminado'})`;
        generalMessage = `✅ Eliminado de ${successfulDevices}/${totalDevices} dispositivos${dbMessage}`;
      } else if (successfulDevices === 0) {
        generalMessage = `❌ No se eliminó de ningún dispositivo`;
      } else {
        const dbError = databaseResult?.error ? ` | Error en DB: ${databaseResult.error}` : '';
        generalMessage = `⚠️ Eliminado de ${successfulDevices}/${totalDevices} dispositivos pero falló en DB${dbError}`;
      }

      setDeleteResult({
        success: generalSuccess,
        message: generalMessage,
        results: hikvisionResult.results,
        deletedEmployeeNo: employeeNo,
        databaseSync: {
          attempted: successfulDevices > 0,
          success: databaseResult?.success,
          message: databaseResult?.message,
          warning: databaseResult?.warning,
          error: databaseResult?.error
        }
      });
      
      setConfirmed(generalSuccess);
      
      // Mostrar mensaje de éxito y recargar
      if (generalSuccess) {
        alert(`✅ Usuario eliminado exitosamente.\nLa página se recargará automáticamente.`);
        
        // Cerrar el modal y recargar la página
        const timer = setTimeout(() => {
          // Primero cerrar el modal llamando al callback
          onConfirm(employeeNo);
          // Luego recargar la página
          window.location.reload();
        }, 1500);
        setAutoCloseTimer(timer);
      }
      
    } catch (error: unknown) {
      console.error('💥 ERROR EN ELIMINACIÓN:', error);
      
      let errorMessage = 'Error desconocido al eliminar usuario';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setDeleteResult({
        success: false,
        message: `❌ ${errorMessage}`,
        deletedEmployeeNo: usuario.employeeNo || usuario.numeroEmpleado
      });
    } finally {
      setLoading(false);
      setDbLoading(false);
    }
  };

  const handleDeleteFromDBOnly = async () => {
    if (!usuario) return;
    
    const employeeNo = usuario.employeeNo || usuario.numeroEmpleado;
    if (!employeeNo) return;
    
    setDbLoading(true);
    
    try {
      const databaseResult = await deleteFromDatabase(employeeNo);
      
      if (databaseResult.success) {
        setDeleteResult({
          success: true,
          message: `✅ ${databaseResult.message || 'Eliminado solo de la base de datos'}`,
          deletedEmployeeNo: employeeNo,
          databaseSync: {
            attempted: true,
            success: true,
            message: databaseResult.message,
            warning: databaseResult.warning
          }
        });
        
        setConfirmed(true);
        alert(`✅ Usuario eliminado de la base de datos.\nLa página se recargará automáticamente.`);
        
        const timer = setTimeout(() => {
          onConfirm(employeeNo);
          window.location.reload();
        }, 1500);
        setAutoCloseTimer(timer);
      } else {
        setDeleteResult({
          success: false,
          message: `❌ ${databaseResult.error || 'Error al eliminar de la base de datos'}`,
          deletedEmployeeNo: employeeNo,
          databaseSync: {
            attempted: true,
            success: false,
            error: databaseResult.error
          }
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setDeleteResult({
        success: false,
        message: `❌ Error: ${errorMessage}`,
        deletedEmployeeNo: employeeNo
      });
    } finally {
      setDbLoading(false);
    }
  };

  const handleManualClose = () => {
    // Limpiar timer si existe
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    
    if (confirmed) {
      // Si ya está confirmado, llamar a onConfirm y recargar
      if (deleteResult?.deletedEmployeeNo) {
        onConfirm(deleteResult.deletedEmployeeNo);
        window.location.reload();
      } else {
        onCancel();
      }
    } else {
      // Si no está confirmado, cancelar
      onCancel();
    }
  };

  if (!usuario) return null;

  const employeeNo = usuario.employeeNo || usuario.numeroEmpleado;
  const isProcessing = loading || dbLoading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold">Eliminar Usuario</h3>
                <p className="text-red-100 text-sm mt-1">Acción REAL en dispositivos Hikvision y Base de Datos</p>
              </div>
            </div>
            <button
              onClick={handleManualClose}
              className="text-white/80 hover:text-white text-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing && !confirmed}
            >
              ×
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {/* Información del usuario */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center gap-4 mb-3">
              {usuario.foto ? (
                <img 
                  src={usuario.foto} 
                  alt={usuario.nombre}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white shadow"
                />
              ) : (
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center border-2 border-white shadow">
                  <span className="text-2xl text-blue-600 font-bold">
                    {usuario.nombre?.charAt(0) || 'U'}
                  </span>
                </div>
              )}
              <div>
                <h4 className="text-lg font-bold text-gray-800">{usuario.nombre}</h4>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                    ID: {employeeNo}
                  </span>
                  {usuario.departamento && (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                      {usuario.departamento}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Resultado de eliminación */}
          {deleteResult && (
            <div className={`mb-6 rounded-lg p-4 ${deleteResult.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'}`}
            >
              <div className="flex items-center gap-3">
                {deleteResult.success ? (
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div>
                  <p className={`font-medium ${deleteResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {deleteResult.message}
                  </p>
                  
                  {/* Detalles de sincronización con DB */}
                  {deleteResult.databaseSync?.attempted && (
                    <div className="mt-2 pl-1">
                      <div className={`text-sm ${deleteResult.databaseSync.success 
                        ? 'text-green-700' 
                        : deleteResult.databaseSync.warning 
                          ? 'text-yellow-700' 
                          : 'text-red-700'}`}>
                        <span className="font-medium">Base de Datos:</span>{" "}
                        {deleteResult.databaseSync.message || 
                         (deleteResult.databaseSync.success ? 'Sincronizado' : 'No sincronizado')}
                      </div>
                    </div>
                  )}
                  
                  {deleteResult.results && (
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showDetails ? 'Ocultar detalles' : 'Ver detalles por dispositivo'}
                    </button>
                  )}
                </div>
              </div>
              
              {showDetails && deleteResult.results && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Resultados por dispositivo:</h5>
                  <div className="space-y-2">
                    {deleteResult.results.map((result, index) => (
                      <div key={index} className={`flex flex-col p-2 rounded ${result.success ? 'bg-green-100' : 'bg-red-100'}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm">{result.deviceIp}</span>
                          <span className={`text-xs font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                            {result.success ? '✅ Éxito' : `❌ ${result.error || 'Error'}`}
                          </span>
                        </div>
                        {result.method && (
                          <div className="text-xs text-gray-600 mt-1">
                            Método: {result.method} | Formato: {result.format || 'N/A'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Indicadores de carga */}
          {(loading || dbLoading) && (
            <div className="mb-6 space-y-3">
              {loading && (
                <div className="flex items-center gap-3 text-blue-700">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
                  <span className="text-sm font-medium">Eliminando de dispositivos Hikvision...</span>
                </div>
              )}
              {dbLoading && (
                <div className="flex items-center gap-3 text-purple-700">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-700"></div>
                  <span className="text-sm font-medium">Sincronizando con Base de Datos...</span>
                </div>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex flex-col gap-3">
            {!deleteResult ? (
              <>
                <button
                  onClick={handleDelete}
                  disabled={isProcessing}
                  className={`px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    isProcessing
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Eliminando...
                    </>
                  ) : (
                    'ELIMINAR DE HIKVISION Y BASE DE DATOS'
                  )}
                </button>

                <button
                  onClick={onCancel}
                  disabled={isProcessing}
                  className="px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  Cancelar
                </button>
              </>
            ) : confirmed ? (
              <>
                <button
                  onClick={handleManualClose}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                >
                  {autoCloseTimer ? 'Recargar ahora' : 'Continuar'}
                </button>
                {autoCloseTimer && (
                  <p className="text-xs text-center text-gray-500 mt-2">
                    La página se recargará automáticamente en 2 segundos...
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleDeleteFromDBOnly}
                  disabled={dbLoading}
                  className={`w-full px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors flex items-center justify-center gap-2 ${
                    dbLoading ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {dbLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Procesando...
                    </>
                  ) : (
                    'Eliminar solo de la Base de Datos'
                  )}
                </button>
                
                <button
                  onClick={handleManualClose}
                  disabled={dbLoading}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}