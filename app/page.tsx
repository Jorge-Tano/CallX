'use client';

import { useState, useEffect } from 'react';
import { EventosTable } from '@/components/EventosTable';
import { Header } from '@/components/Header';


export interface Evento {
  empleadoId: string;
  nombre: string;
  hora: string;
  fecha: string;
  tipo: string;
  foto?: string;
}

export default function HomePage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriodo, setSelectedPeriodo] = useState<'hoy' | 'mes' | 'año'>('hoy');

  const cargarEventos = async (periodo: 'hoy' | 'mes' | 'año') => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/eventos?periodo=${periodo}`);
      const data = await response.json();
      
      if (data.success) {
        setEventos(data.eventos);
        console.log(`✅ Cargados ${data.accesos} eventos del periodo: ${periodo}`);
      }
    } catch (error) {
      console.error('❌ Error al cargar eventos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePeriodoChange = (periodo: 'hoy' | 'mes' | 'año') => {
    setSelectedPeriodo(periodo);
    cargarEventos(periodo);
  };

  const handleRefresh = () => {
    cargarEventos(selectedPeriodo);
  };

  useEffect(() => {
    cargarEventos('hoy');
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Header 
          eventosCount={eventos.length}
          onRefresh={handleRefresh}
          isRefreshing={isLoading}
          selectedPeriodo={selectedPeriodo}
          onPeriodoChange={handlePeriodoChange}
        />
        
        <EventosTable 
          eventos={eventos} 
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}