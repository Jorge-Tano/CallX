import React from 'react';
import { descargarExcel } from '@/utils/excelGenerator';

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
  size = 'md'
}) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleDownload = async () => {
    if (eventos.length === 0 || disabled) return;
    
    setIsLoading(true);
    try {
      // Pequeño delay para mostrar feedback visual
      await new Promise(resolve => setTimeout(resolve, 300));
      descargarExcel(eventos, filtroInfo);
    } catch (error) {
      console.error('Error al generar Excel:', error);
      alert('Error al generar el archivo Excel. Por favor, intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md',
    secondary: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md',
    outline: 'bg-transparent border border-blue-500 text-blue-500 hover:bg-blue-500/10'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      onClick={handleDownload}
      disabled={disabled || eventos.length === 0 || isLoading}
      className={`
        rounded-lg font-medium flex items-center justify-center gap-2 transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      title={`Descargar ${eventos.length} eventos en Excel`}
    >
      {isLoading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Generando...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Excel ({eventos.length})</span>
        </>
      )}
    </button>
  );
};