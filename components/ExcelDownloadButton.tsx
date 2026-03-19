// /components/ExcelDownloadButton.tsx
import React, { useRef, useEffect } from 'react';
import { descargarExcel, descargarExcelNocturno, salidaDespuesDeNoche } from '@/utils/excelGenerator';

interface ExcelDownloadButtonProps {
  eventos: any[];
  filtroInfo?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const ExcelDownloadButton: React.FC<ExcelDownloadButtonProps> = ({
  eventos,
  filtroInfo,
  disabled = false,
  className = '',
  variant = 'primary',
  size = 'md',
}) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingType, setLoadingType] = React.useState<'normal' | 'nocturno' | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const countNocturno = React.useMemo(
    () => eventos.filter(e => salidaDespuesDeNoche(e.horaSalida)).length,
    [eventos]
  );

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleDownload = async (tipo: 'normal' | 'nocturno') => {
    if (eventos.length === 0 || disabled) return;
    setMenuOpen(false);
    setIsLoading(true);
    setLoadingType(tipo);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (tipo === 'normal') {
        descargarExcel(eventos, filtroInfo);
      } else {
        descargarExcelNocturno(eventos, filtroInfo);
      }
    } catch (error) {
      console.error('Error al generar Excel:', error);
      alert('Error al generar el archivo Excel. Por favor, intente nuevamente.');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md',
    secondary: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md',
    outline: 'bg-transparent border border-blue-500 text-blue-500 hover:bg-blue-500/10',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const isDisabled = disabled || eventos.length === 0 || isLoading;

  return (
    <div className="relative inline-flex" ref={menuRef}>

      {/* ── Botón principal único que abre el menú ── */}
      <button
        onClick={() => setMenuOpen(prev => !prev)}
        disabled={isDisabled}
        title="Opciones de descarga Excel"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        className={`
          rounded-lg font-medium flex items-center justify-center gap-2 transition-all
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}
        `}
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            <span>Generando...</span>
          </>
        ) : (
          <>
            {/* Ícono descarga */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>

            <span>Descargar Excel ({eventos.length})</span>
          </>
        )}
      </button>

      {/* ── Menú desplegable ── */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-76 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden"
          style={{ minWidth: '17rem' }}
        >
          {/* Opción 1: reporte completo */}
          <button
            onClick={() => handleDownload('normal')}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
          >
            <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              {isLoading && loadingType === 'normal' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800">Reporte completo</div>
            </div>
          </button>

          <div className="border-t border-gray-100" />

          {/* Opción 2: reporte nocturno */}
          <button
            onClick={() => handleDownload('nocturno')}
            disabled={countNocturno === 0}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-orange-50 transition-colors text-left group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              {isLoading && loadingType === 'nocturno' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">Salidas después de 19:00</span>
                {countNocturno > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                    {countNocturno}
                  </span>
                )}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};