interface HeaderProps {
  eventosCount: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
  selectedPeriodo: 'hoy' | 'mes' | 'año';
  onPeriodoChange: (periodo: 'hoy' | 'mes' | 'año') => void;
}

export function Header({ 
  eventosCount, 
  onRefresh, 
  isRefreshing = false,
  selectedPeriodo,
  onPeriodoChange 
}: HeaderProps) {
  
  const getPeriodoButtonClass = (periodo: 'hoy' | 'mes' | 'año') => {
    const isSelected = selectedPeriodo === periodo;
    return `px-4 py-2 text-sm font-medium rounded-lg transition-all ${
      isSelected
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
    }`;
  };

  const getPeriodoLabel = () => {
    switch (selectedPeriodo) {
      case 'hoy':
        return `Eventos de hoy - ${new Date().toLocaleDateString('es-CO')}`;
      case 'mes':
        return `Eventos del mes - ${new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}`;
      case 'año':
        return `Eventos del año - ${new Date().getFullYear()}`;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Título y descripción */}
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Control de Acceso</h1>
          <p className="text-gray-600 mt-2">{getPeriodoLabel()}</p>
          <div className="mt-3 flex gap-3 items-center">
            <span className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {eventosCount} evento{eventosCount !== 1 ? 's' : ''}
            </span>
            <button 
              onClick={onRefresh}
              disabled={isRefreshing}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {isRefreshing ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Actualizando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selector de periodo */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por periodo</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onPeriodoChange('hoy')}
              disabled={isRefreshing}
              className={`${getPeriodoButtonClass('hoy')} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hoy
              </span>
            </button>
            <button
              onClick={() => onPeriodoChange('mes')}
              disabled={isRefreshing}
              className={`${getPeriodoButtonClass('mes')} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Este mes
              </span>
            </button>
            <button
              onClick={() => onPeriodoChange('año')}
              disabled={isRefreshing}
              className={`${getPeriodoButtonClass('año')} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Este año
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}