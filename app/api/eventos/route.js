import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const username = "admin";
const password = "Tattered3483";
const deviceIp = "172.31.7.206";

export async function GET(request) {
  try {
    // Obtener parámetros de la URL
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'hoy'; // 'hoy', 'mes', 'año'
    
    const today = new Date();
    let startTime, endTime;

    // Configurar rango de fechas según el periodo solicitado
    switch (periodo) {
      case 'año':
        // Desde el 1 de enero del año actual hasta hoy
        startTime = `${today.getFullYear()}-01-01T00:00:00`;
        endTime = `${today.toISOString().split("T")[0]}T23:59:59`;
        break;
      
      case 'mes':
        // Desde el día 1 del mes actual hasta hoy
        const primerDiaMes = new Date(today.getFullYear(), today.getMonth(), 1);
        startTime = `${primerDiaMes.toISOString().split("T")[0]}T00:00:00`;
        endTime = `${today.toISOString().split("T")[0]}T23:59:59`;
        break;
      
      case 'hoy':
      default:
        // Solo hoy
        startTime = `${today.toISOString().split("T")[0]}T00:00:00`;
        endTime = `${today.toISOString().split("T")[0]}T23:59:59`;
        break;
    }

    const url = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;

    const client = new DigestFetch(username, password, {
      disableRetry: true,
    });

    let todosLosEventos = [];
    let position = 0;
    const maxResults = 30;
    let hasMore = true;

    console.log(`📅 Consultando eventos: ${periodo} (${startTime} - ${endTime})`);

    // Hacer peticiones hasta que no haya más eventos
    while (hasMore) {
      const body = {
        AcsEventCond: {
          searchID: "1",
          searchResultPosition: position,
          maxResults: maxResults,
          major: 5,
          minor: 0,
          startTime,
          endTime,
        },
      };

      const res = await client.fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      const eventos = data?.AcsEvent?.InfoList || [];

      if (eventos.length === 0) {
        hasMore = false;
      } else {
        todosLosEventos = [...todosLosEventos, ...eventos];
        position += maxResults;
        
        console.log(`📦 Lote ${Math.floor(position / maxResults)}: ${eventos.length} eventos (Total acumulado: ${todosLosEventos.length})`);
        
        // Si recibimos menos de maxResults, ya no hay más
        if (eventos.length < maxResults) {
          hasMore = false;
        }
      }
    }

    // Filtrar solo eventos de acceso de personas (minor: 75)
    const eventosFiltrados = todosLosEventos
    .filter(evento => evento.minor === 75)
    .map(evento => {
        const fechaObj = new Date(evento.time);

        return {
        nombre: evento.name,
        empleadoId: evento.employeeNoString,
        hora: evento.time,
        fecha: fechaObj.toLocaleDateString("es-CO"),  // <-- NUEVO
        tipo: evento.label,
        foto: evento.pictureURL
        };
    })
  .sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime());

    console.log(`✅ Total eventos filtrados: ${eventosFiltrados.length}`);

    return NextResponse.json({
      success: true,
      periodo,
      rangoFechas: {
        inicio: startTime,
        fin: endTime
      },
      total: todosLosEventos.length,
      accesos: eventosFiltrados.length,
      eventos: eventosFiltrados
    });

  } catch (error) {
    console.error("❌ Error al consultar:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}