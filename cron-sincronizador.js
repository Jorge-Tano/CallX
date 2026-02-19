// cron-sincronizador.js
import cron from 'node-cron';
import http from 'http';
import https from 'https';

// ================================================
// CONFIGURACIÓN
// ================================================

const CONFIG = {
  // URL de tu endpoint existente
  SYNC_ENDPOINT: process.env.SYNC_ENDPOINT || 'http://172.31.7.165:3001/api/eventos/guardar-eventos',
  
  // Intervalo: cada 1 minuto
  CRON_EXPRESSION: '* * * * *',
  
  // Zona horaria Colombia
  TIMEZONE: 'America/Bogota',
  
  // Puerto para monitoreo
  MONITOR_PORT: 3002,
  
  // Mostrar logs detallados
  DEBUG: true
};

// ================================================
// FUNCIÓN PARA MOSTRAR HORA COLOMBIA
// ================================================

function getHoraColombia() {
  return new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    hour12: true
  });
}
// ================================================
// LOGGER COLORIDO
// ================================================

const logger = {
  info: (msg) => console.log(`[${getHoraColombia()}] ℹ️ ${msg}`),
  success: (msg) => console.log(`[${getHoraColombia()}] ✅ ${msg}`),
  error: (msg) => console.log(`[${getHoraColombia()}] ❌ ${msg}`),
  warn: (msg) => console.log(`[${getHoraColombia()}] ⚠️ ${msg}`),
  cron: (msg) => console.log(`[${getHoraColombia()}] ⏰ ${msg}`)
};

// ================================================
// FUNCIÓN PARA LLAMAR AL ENDPOINT
// ================================================

function llamarEndpoint() {
  return new Promise((resolve, reject) => {
    const url = CONFIG.SYNC_ENDPOINT;
    const protocol = url.startsWith('https') ? https : http;
    
    logger.cron(`Llamando a: ${url}`);
    
    const req = protocol.get(url, (res) => {
      let data = '';
      
      // Verificar si es redirección (3xx) o error
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        logger.warn(`⚠️  Redirección detectada (${res.statusCode}) a: ${location}`);
        resolve({
          status: res.statusCode,
          data: null,
          redirected: true,
          location: location,
          success: false,
          message: `Redirigido a: ${location}`
        });
        return;
      }
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Verificar si la respuesta es HTML (no JSON)
        const isHtml = data.includes('<!DOCTYPE') || 
                       data.includes('<html') || 
                       data.includes('/login') ||
                       res.headers['content-type']?.includes('text/html');
        
        if (isHtml) {
          logger.error(`❌ El endpoint devolvió HTML (posible página de login)`);
          logger.error(`📄 Primeros 200 caracteres: ${data.substring(0, 200)}...`);
          
          resolve({
            status: res.statusCode,
            data: null,
            isHtml: true,
            success: false,
            message: 'El endpoint devolvió HTML en lugar de JSON',
            htmlPreview: data.substring(0, 500) // Para debugging
          });
          return;
        }
        
        try {
          const jsonData = JSON.parse(data);
          logger.success(`✅ Respuesta recibida (${res.statusCode})`);
          
          if (CONFIG.DEBUG && jsonData) {
            console.log('📊 Datos recibidos:', JSON.stringify(jsonData, null, 2));
          }
          
          resolve({
            status: res.statusCode,
            data: jsonData,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (error) {
          logger.error(`❌ Error parseando JSON: ${error.message}`);
          logger.error(`📄 Respuesta recibida (primeros 500 chars): ${data.substring(0, 500)}`);
          
          resolve({
            status: res.statusCode,
            data: null,
            rawResponse: data.substring(0, 1000),
            success: false,
            parseError: error.message
          });
        }
      });
    });
    
    req.on('error', (error) => {
      logger.error(`❌ Error en la petición: ${error.message}`);
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      logger.error('⏱️  Timeout de 30 segundos');
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    // Agregar headers si la API los requiere
    req.setHeader('User-Agent', 'Cron-Sincronizador/1.0');
    req.setHeader('Accept', 'application/json');
  });
}

// ================================================
// EJECUTAR SINCRONIZACIÓN
// ================================================

async function ejecutarSincronizacion() {
  const inicio = Date.now();
  
  try {
    logger.cron('══════════════════════════════════════════════');
    logger.cron('🚀 INICIANDO SINCRONIZACIÓN AUTOMÁTICA');
    logger.cron(`🕐 ${getHoraColombia()}`);
    logger.cron('══════════════════════════════════════════════');
    
    const resultado = await llamarEndpoint();
    const duracion = ((Date.now() - inicio) / 1000).toFixed(2);
    
    logger.success(`✅ Sincronización completada en ${duracion} segundos`);
    
    if (resultado.data) {
      const { eventos_obtenidos = 0, registros_procesados = 0, message = '' } = resultado.data;
      logger.info(`📊 Eventos obtenidos: ${eventos_obtenidos}`);
      logger.info(`💾 Registros procesados: ${registros_procesados}`);
      if (message) logger.info(`📝 ${message}`);
    }
    
    // Calcular próxima ejecución
    const ahora = new Date();
    const proxima = new Date(ahora.getTime() + 60000); // +1 minuto
    proxima.setHours(proxima.getHours() - 5); // Ajustar a Colombia
    
    logger.cron(`⏰ Próxima ejecución: ${proxima.toLocaleString('es-CO')}`);
    logger.cron('══════════════════════════════════════════════\n');
    
    return resultado;
    
  } catch (error) {
    logger.error(`❌ Error en sincronización: ${error.message}`);
    
    const duracion = ((Date.now() - inicio) / 1000).toFixed(2);
    logger.cron(`⏱️  Duración: ${duracion}s`);
    logger.cron('══════════════════════════════════════════════\n');
    
    throw error;
  }
}

// ================================================
// CONFIGURAR CRON-JOB
// ================================================

function iniciarCronJob() {
  logger.info('==================================================');
  logger.info('🚀 CONFIGURANDO CRON-JOB');
  logger.info(`   • Endpoint: ${CONFIG.SYNC_ENDPOINT}`);
  logger.info(`   • Intervalo: ${CONFIG.CRON_EXPRESSION} (cada minuto)`);
  logger.info(`   • Zona: ${CONFIG.TIMEZONE}`);
  logger.info(`   • Hora Colombia: ${getHoraColombia()}`);
  logger.info('==================================================');
  
  // Validar expresión cron
  if (!cron.validate(CONFIG.CRON_EXPRESSION)) {
    logger.error(`❌ Expresión cron inválida: ${CONFIG.CRON_EXPRESSION}`);
    process.exit(1);
  }
  
  // Programar la tarea
  const tarea = cron.schedule(
    CONFIG.CRON_EXPRESSION,
    ejecutarSincronizacion,
    {
      scheduled: true,
      timezone: CONFIG.TIMEZONE
    }
  );
  
  logger.success('✅ Cron-job configurado correctamente');
  
  return tarea;
}

// ================================================
// SERVIDOR DE MONITOREO SIMPLE
// ================================================

function iniciarMonitoreo() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'running',
        service: 'cron-sincronizador',
        timestamp: new Date().toISOString(),
        hora_colombia: getHoraColombia(),
        config: CONFIG
      }));
      return;
    }
    
    if (req.url === '/execute' && req.method === 'POST') {
      ejecutarSincronizacion()
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(error => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });
      return;
    }
    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  });
  
  server.listen(CONFIG.MONITOR_PORT, () => {
    logger.info(`📊 Servidor de monitoreo: http://localhost:${CONFIG.MONITOR_PORT}`);
    logger.info(`   • Health check: GET /health`);
    logger.info(`   • Ejecutar manual: POST /execute`);
  });
  
  return server;
}

// ================================================
// MANEJO DE SEÑALES
// ================================================

function configurarApagado(tarea, server) {
  const apagar = () => {
    logger.info('\n==================================================');
    logger.warn('🛑 Recibida señal de apagado...');
    
    if (tarea) {
      tarea.stop();
      logger.info('   • Cron-job detenido');
    }
    
    if (server) {
      server.close(() => {
        logger.info('   • Servidor cerrado');
        logger.info('👋 Apagado completo');
        process.exit(0);
      });
    } else {
      logger.info('👋 Apagado completo');
      process.exit(0);
    }
  };
  
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

// ================================================
// INICIO PRINCIPAL
// ================================================

async function main() {
  try {
    logger.info('🎯 Iniciando servidor cron de sincronización...');
    
    // Iniciar cron-job
    const tarea = iniciarCronJob();
    
    // Iniciar servidor de monitoreo
    const server = iniciarMonitoreo();
    
    // Configurar manejo de señales
    configurarApagado(tarea, server);
    
    // Ejecutar inmediatamente
    logger.info('\n🚀 Ejecutando primera sincronización ahora...');
    setTimeout(async () => {
      await ejecutarSincronizacion();
      logger.info('✅ Servidor cron listo y funcionando\n');
    }, 1000);
    
  } catch (error) {
    logger.error(`Error fatal: ${error.message}`);
    process.exit(1);
  }
}

// ================================================
// EJECUTAR
// ================================================

main();