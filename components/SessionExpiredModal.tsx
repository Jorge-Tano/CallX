// components/SessionExpiredModalSimple.tsx (VERSIÓN MEJORADA)
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function SessionExpiredModalSimple() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Debug: Ver qué parámetros hay
    
    
    // Debug: Ver localStorage
    
    
    const expiredParam = searchParams.get('expired');
    const wasExpiredByInactivity = localStorage.getItem('sessionExpiredByInactivity');
    
    // Verificar si debemos mostrar el modal
    if (expiredParam === 'true' || wasExpiredByInactivity === 'true') {
      setIsOpen(true);
      
      // Solo limpiar localStorage si fue por inactividad
      if (wasExpiredByInactivity === 'true') {
        localStorage.removeItem('sessionExpiredByInactivity');
      }
      
      // Remover parámetro de URL sin recargar
      if (expiredParam === 'true') {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    } 
  }, [searchParams]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleLogin = () => {
    setIsOpen(false);
    router.push('/login'); // O '/' si tu login está en la raíz
  };

  // Añade un efecto para debug
  useEffect(() => {
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Fondo oscuro */}
      <div 
        className="fixed inset-0 bg-black/70 z-50"
        style={{ animation: 'fadeIn 0.3s ease-out' }}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ animation: 'modalIn 0.3s ease-out' }}
      >
        <div 
          className="relative w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
            
            {/* Encabezado con icono */}
            <div className="relative p-11 text-center">
              {/* Icono decorativo */}
              <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-red-100 to-orange-100 flex items-center justify-center shadow-lg">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center">
                    <svg 
                      className="w-8 h-8 text-white" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Contenido */}
              <div className="pt-10">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Sesión Expirada
                </h2>
                <p className="text-gray-600 mb-2">
                  Tu sesión se cerró automáticamente por inactividad.
                </p>
                <p className="text-sm text-gray-500">
                  Por seguridad, las sesiones se cierran después de {15} minutos sin actividad.
                </p>
              </div>
            </div>

            {/* Línea decorativa */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

            

            {/* Botones */}
            <div className="p-6">
              <div className="flex flex-col sm:flex-row gap-3">                
                <button
                  onClick={handleClose}
                  className="flex-1 border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-semibold py-3.5 px-6 rounded-xl transition-all duration-300"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cerrar</span>
                  </div>
                </button>
              </div>
              
              
            </div>
          </div>
        </div>
      </div>
    </>
  );
}