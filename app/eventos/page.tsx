'use client';

import { useState, useEffect } from 'react';
import { EventosTable } from '@/components/EventosTable';
import { Header } from '@/components/Header';
import Navbar from "@/components/navbar";

export interface Evento {
  empleadoId: string;
  nombre: string;
  fecha: string;
  horaEntrada?: string;
  horaSalida?: string;
  campaña?: string;
  tipo?: string;
  foto?: string;
  dispositivo?: string;
}

export default function HomePage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriodo, setSelectedPeriodo] = useState<'hoy' | '7dias' | '30dias' | 'personalizado'>('hoy');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');

  // Procesar eventos agrupados - CON DEBUG
  const procesarEventosAgrupados = (eventos: any[]): Evento[] => {
    console.log('🔄 Procesando eventos para vista:', eventos.length, 'eventos');

    const eventosAgrupados: { [key: string]: Evento } = {};

    eventos.forEach((evento, index) => {
      const clave = `${evento.empleadoId}-${evento.fecha}`;

      if (!eventosAgrupados[clave]) {
        eventosAgrupados[clave] = {
          empleadoId: evento.empleadoId,
          nombre: evento.nombre,
          fecha: evento.fecha,
          campaña: evento.campaña || 'Sin grupo',
          horaEntrada: '',
          horaSalida: '',
          dispositivo: evento.dispositivo || 'Desconocido',
          foto: evento.foto || '',
          tipo: evento.tipo || 'Registro'
        };
      }

      // DEBUG: Mostrar formato original de algunos eventos
      if (index < 3) {
        console.log(`🔍 Evento ${index + 1} desde BD:`, {
          empleadoId: evento.empleadoId,
          horaEntradaBD: evento.horaEntrada, // ← Esto viene de la BD
          horaSalidaBD: evento.horaSalida,   // ← Esto viene de la BD
          tipo: evento.tipo
        });
      }

      // FUNCIÓN QUE MANTIENE SEGUNDOS
      const formatearHora = (hora: string) => {
        if (!hora) return '';

        // Si ya tiene formato completo con segundos, mantenerlo
        if (hora.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
          return hora;
        }

        // Si solo tiene horas y minutos, agregar segundos
        if (hora.match(/^\d{1,2}:\d{2}$/)) {
          return `${hora}:00`;
        }

        return hora;
      };

      const horaEntradaFormateada = formatearHora(evento.horaEntrada);
      const horaSalidaFormateada = formatearHora(evento.horaSalida);

      // Asignar horas
      if (horaEntradaFormateada) {
        eventosAgrupados[clave].horaEntrada = horaEntradaFormateada;
      }
      if (horaSalidaFormateada) {
        eventosAgrupados[clave].horaSalida = horaSalidaFormateada;
      }

      // Actualizar tipo basado en horas disponibles
      if (eventosAgrupados[clave].horaEntrada && eventosAgrupados[clave].horaSalida) {
        eventosAgrupados[clave].tipo = 'Entrada/Salida';
      } else if (eventosAgrupados[clave].horaEntrada) {
        eventosAgrupados[clave].tipo = 'Solo Entrada';
      } else if (eventosAgrupados[clave].horaSalida) {
        eventosAgrupados[clave].tipo = 'Solo Salida';
      }
    });

    // DEBUG: Mostrar resultado final
    const resultado = Object.values(eventosAgrupados);
    console.log('✅ Eventos procesados para vista:', resultado.length);

    if (resultado.length > 0) {
      console.log('👤 Primer evento procesado:', {
        empleadoId: resultado[0].empleadoId,
        horaEntrada: resultado[0].horaEntrada, // ← Esto se mostrará en la tabla
        horaSalida: resultado[0].horaSalida,   // ← Esto se mostrará en la tabla
        tipo: resultado[0].tipo
      });
    }

    return resultado;
  };

  // Transformar para BD - SOLO ENVIAR HORAS SIMPLES
  const transformarParaBD = (eventos: Evento[]): any[] => {
    return eventos.map(evento => {
      if (!evento.empleadoId || !evento.fecha) {
        console.log('⚠️ Evento omitido - falta empleadoId o fecha:', evento);
        return null;
      }

      // Función para extraer solo la hora de formatos ISO
      const extraerHoraSimple = (horaCompleta: string | undefined) => {
        if (!horaCompleta) return null;

        // Si es formato ISO (2025-11-29T05:00:06-05:00)
        if (horaCompleta.includes('T')) {
          try {
            const fecha = new Date(horaCompleta);
            const horas = fecha.getHours().toString().padStart(2, '0');
            const minutos = fecha.getMinutes().toString().padStart(2, '0');
            return `${horas}:${minutos}`; // Enviar formato simple "05:00"
          } catch (error) {
            return null;
          }
        }

        // Si ya es formato simple o AM/PM, enviar tal cual
        return horaCompleta;
      };

      let tipo_evento = 'Registro';
      if (evento.horaEntrada && evento.horaSalida) {
        tipo_evento = 'Entrada/Salida';
      } else if (evento.horaEntrada) {
        tipo_evento = 'Solo Entrada';
      } else if (evento.horaSalida) {
        tipo_evento = 'Solo Salida';
      }

      return {
        documento: evento.empleadoId,
        nombre: evento.nombre || 'Sin nombre',
        fecha: evento.fecha,
        hora_entrada: extraerHoraSimple(evento.horaEntrada),
        hora_salida: extraerHoraSimple(evento.horaSalida),
        tipo_evento: tipo_evento,
        dispositivo_ip: evento.dispositivo || 'Desconocido',
        imagen: evento.foto || null
      };
    }).filter(evento => evento !== null);
  };

  // Guardar en BD
  const guardarEnBaseDatos = async (eventosParaGuardar?: Evento[]) => {
    const eventosAGuardar = eventosParaGuardar || eventos;

    if (eventosAGuardar.length === 0) {
      console.log('📝 No hay eventos para guardar');
      return;
    }

    try {
      const eventosParaBD = transformarParaBD(eventosAGuardar);

      const response = await fetch('/api/eventos/guardar-eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventosParaBD),
      });

      const result = await response.json();

      if (result.success) {
        console.log(`💾 BD: ${result.guardados} guardados, ${result.duplicados} actualizados`);
      }
    } catch (error) {
      console.error('❌ Error guardando en BD:', error);
    }
  };

  // Cargar eventos desde BD
  const cargarEventosDesdeBD = async (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado', inicio?: string, fin?: string) => {
    setIsLoading(true);
    try {
      let url = `/api/eventos/bd?rango=${periodo}`;

      if (periodo === 'personalizado' && inicio && fin) {
        url += `&fechaInicio=${inicio}&fechaFin=${fin}`;
      }

      console.log('🔍 Consultando BD:', url);
      const response = await fetch(url);
      const data = await response.json();

      console.log('📊 Respuesta CRUDA de BD:', {
        success: data.success,
        eventosCount: data.eventos?.length || 0,
        primerEvento: data.eventos?.[0] // ← Ver formato directo de BD
      });

      if (data.success) {
        console.log('🔄 Procesando eventos desde BD...');
        const eventosProcesados = procesarEventosAgrupados(data.eventos || []);
        setEventos(eventosProcesados);
        console.log(`✅ ${eventosProcesados.length} eventos cargados en la vista`);
      } else {
        console.error('❌ Error en respuesta BD:', data.error);
        setEventos([]);
      }
    } catch (error) {
      console.error('❌ Error cargando desde BD:', error);
      setEventos([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Sincronización automática cada minuto - VERSIÓN CORREGIDA
  useEffect(() => {
    const sincronizarYActualizar = async () => {
      try {
        console.log('🔄 Ejecutando sincronización automática (3 días)...');

        // Calcular fecha de hace 3 días
        const hoy = new Date();
        const hace3Dias = new Date(hoy);
        hace3Dias.setDate(hoy.getDate() - 3);

        const fechaHoy = hoy.toISOString().split('T')[0];
        const fechaHace3Dias = hace3Dias.toISOString().split('T')[0];

        console.log(`📅 Rango: ${fechaHace3Dias} a ${fechaHoy}`);

        // 1. Consultar dispositivos biométricos (últimos 3 días)
        const response = await fetch(`/api/eventos?rango=personalizado&fechaInicio=${fechaHace3Dias}&fechaFin=${fechaHoy}`);
        const data = await response.json();

        if (data.success && data.eventos && data.eventos.length > 0) {
          console.log(`📥 ${data.eventos.length} eventos nuevos de los últimos 3 días`);

          // 2. Transformar eventos del formato de dispositivos al formato de BD
          const eventosParaBD = data.eventos.map((evento: any) => {
            // Determinar si es entrada o salida basado en el tipo del dispositivo
            let tipo_evento = 'Solo Entrada'; // Por defecto asumimos entrada
            if (evento.tipo && evento.tipo.includes('Salida')) {
              tipo_evento = 'Solo Salida';
            }

            return {
              documento: evento.empleadoId,
              nombre: evento.nombre,
              fecha: evento.fecha,
              hora_entrada: tipo_evento === 'Solo Entrada' ? evento.hora : null,
              hora_salida: tipo_evento === 'Solo Salida' ? evento.hora : null,
              tipo_evento: tipo_evento,
              dispositivo_ip: evento.dispositivo || 'Desconocido',
              imagen: evento.foto || null
            };
          });

          console.log('📦 Eventos transformados para BD:', eventosParaBD.length);

          // 3. Guardar en BD
          const saveResponse = await fetch('/api/eventos/guardar-eventos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventosParaBD),
          });

          const saveResult = await saveResponse.json();

          if (saveResult.success) {
            console.log(`💾 BD: ${saveResult.guardados} eventos procesados (${saveResult.nuevos} nuevos, ${saveResult.actualizados} actualizados)`);

            // 4. Recargar vista desde BD solo si hay eventos de HOY
            // Pero para evitar recargas innecesarias, verificamos si estamos viendo "hoy"
            if (selectedPeriodo === 'hoy') {
              cargarEventosDesdeBD(selectedPeriodo, fechaInicio, fechaFin);
            }
          } else {
            console.error('❌ Error guardando en BD:', saveResult.error);
          }
        } else {
          console.log('📭 No hay eventos nuevos en dispositivos');
        }
      } catch (error) {
        console.error('❌ Error en sincronización automática:', error);
      }
    };
    
    // Sincronizar inmediatamente al cargar
    sincronizarYActualizar();

    // Sincronizar cada minuto
    const interval = setInterval(sincronizarYActualizar, 60000);

    return () => clearInterval(interval);
  }, [selectedPeriodo, fechaInicio, fechaFin]);


  const handlePeriodoChange = (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => {
    setSelectedPeriodo(periodo);
    if (periodo !== 'personalizado') {
      cargarEventosDesdeBD(periodo);
    }
  };

  const handleFechasChange = (inicio: string, fin: string) => {
    setFechaInicio(inicio);
    setFechaFin(fin);
  };

  const handleRefresh = () => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventosDesdeBD('personalizado', fechaInicio, fechaFin);
    } else {
      cargarEventosDesdeBD(selectedPeriodo);
    }
  };

  // Inicializar
  useEffect(() => {
    const hoy = new Date().toISOString().split('T')[0];
    setFechaInicio(hoy);
    setFechaFin(hoy);
    cargarEventosDesdeBD('hoy');
  }, []);

  // Buscar automáticamente en modo personalizado
  useEffect(() => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventosDesdeBD('personalizado', fechaInicio, fechaFin);
    }
  }, [fechaInicio, fechaFin, selectedPeriodo]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Header
            eventosCount={eventos.length}
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
            selectedPeriodo={selectedPeriodo}
            onPeriodoChange={handlePeriodoChange}
            onFechasChange={handleFechasChange}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
          />

          <EventosTable
            eventos={eventos}
            isLoading={isLoading}
          />
        </div>
      </div>
    </>
  );
}