// app/api/hikvision/users/delete/route.js
import { NextResponse } from 'next/server';

// CONFIGURACIÓN DE DISPOSITIVOS
const DEVICES = [
  { 
    ip: process.env.HIKVISION_IP1 , 
    username: process.env.HIKUSER, 
    password: process.env.HIKPASS,
    port: 443,
    protocol: 'https'
  },
  { 
    ip: process.env.HIKVISION_IP2, 
    username: process.env.HIKUSER, 
    password: process.env.HIKPASS ,
    port: 80,
    protocol: 'http'
  }
].filter(device => device.ip);

// VALIDADOR DE SEGURIDAD
class SecurityValidator {
  static validateDeleteRequest(employeeNo, requestBody) {
    if (!requestBody || typeof requestBody !== 'object') {
      return { valid: false, error: "Estructura de solicitud inválida" };
    }

    if (Array.isArray(requestBody)) {
      return { valid: false, error: "No se permiten arrays" };
    }

    const keys = Object.keys(requestBody);
    if (keys.length !== 1 || !keys.includes('employeeNo')) {
      return { 
        valid: false, 
        error: "Solo se permite el campo 'employeeNo'",
        code: "INVALID_BODY_STRUCTURE"
      };
    }

    if (employeeNo === undefined || employeeNo === null) {
      return { valid: false, error: "employeeNo es requerido" };
    }

    const type = typeof employeeNo;
    if (type !== 'string' && type !== 'number') {
      return { 
        valid: false, 
        error: "employeeNo debe ser string o number",
        code: "INVALID_TYPE"
      };
    }

    const employeeStr = employeeNo.toString().trim();
    
    if (employeeStr.length === 0) {
      return { valid: false, error: "employeeNo no puede estar vacío" };
    }

    if (!/^\d+$/.test(employeeStr)) {
      return { 
        valid: false, 
        error: "employeeNo debe contener solo números",
        code: "INVALID_FORMAT"
      };
    }

    return { valid: true, employeeNo: employeeStr };
  }

  static logDeleteAttempt(employeeNo, ip, userAgent) {
    const timestamp = new Date().toISOString();
    console.log(`🔐 LOG ELIMINACIÓN - ${timestamp}:
      • EmployeeNo: ${employeeNo}
      • IP: ${ip || 'N/A'}
      • User-Agent: ${userAgent?.substring(0, 50) || 'N/A'}
      • Dispositivos: ${DEVICES.map(d => `${d.protocol}://${d.ip}:${d.port}`).join(', ')}
    `);
  }
}

// FUNCIÓN DE ELIMINACIÓN
async function deleteUserFromDevice(device, employeeNo) {
  console.log(`🔄 Eliminando usuario ${employeeNo} del dispositivo: ${device.protocol}://${device.ip}:${device.port}`);
  
  try {
    const DigestFetch = (await import('digest-fetch')).default;
    const client = new DigestFetch(device.username, device.password, {
      disableRetry: false,
      algorithm: 'MD5'
    });

    // Deshabilitar verificación SSL para HTTPS (solo desarrollo)
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (device.protocol === 'https') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    // Formatos de API para Hikvision
    const formats = [
      {
        method: 'PUT',
        url: `${device.protocol}://${device.ip}:${device.port}/ISAPI/AccessControl/UserInfo/Delete?format=json`,
        payload: {
          UserInfoDelCond: {
            EmployeeNoList: [{ employeeNo: employeeNo.toString() }]
          }
        }
      },
      {
        method: 'DELETE',
        url: `${device.protocol}://${device.ip}:${device.port}/ISAPI/AccessControl/UserInfo/Record/${employeeNo}`,
        payload: null
      }
    ];

    for (const format of formats) {
      console.log(`🔍 Probando: ${format.method} ${format.url}`);
      
      const options = {
        method: format.method,
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(10000)
      };

      if (format.payload) {
        options.body = JSON.stringify(format.payload);
      }

      try {
        const response = await client.fetch(format.url, options);
        const responseText = await response.text();
        
        console.log(`📥 Respuesta de ${device.ip}:`, {
          status: response.status,
          statusText: response.statusText,
          protocol: device.protocol
        });

        if (response.status === 200 || response.status === 204) {
          // Restaurar verificación SSL
          if (device.protocol === 'https') {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
          }
          
          return {
            success: true,
            message: "Usuario eliminado exitosamente",
            deviceIp: device.ip,
            devicePort: device.port,
            deviceProtocol: device.protocol,
            method: format.method
          };
        }
        
        if (response.status === 404) {
          // Restaurar verificación SSL
          if (device.protocol === 'https') {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
          }
          
          return {
            success: true,
            message: "Usuario no encontrado (posiblemente ya fue eliminado)",
            deviceIp: device.ip,
            devicePort: device.port,
            deviceProtocol: device.protocol,
            method: format.method,
            warning: true
          };
        }
        
        // Restaurar verificación SSL antes de continuar
        if (device.protocol === 'https') {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        }
        
      } catch (error) {
        console.log(`❌ Error en formato ${format.method}:`, error.message);
        
        // Restaurar verificación SSL si hubo error
        if (device.protocol === 'https') {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return {
      success: false,
      error: "Todos los métodos de eliminación fallaron",
      deviceIp: device.ip,
      devicePort: device.port,
      deviceProtocol: device.protocol
    };

  } catch (error) {
    console.error(`💥 ERROR GENERAL EN ${device.ip}:`, error);
    return {
      success: false,
      error: error.message || 'Error de conexión',
      deviceIp: device.ip,
      devicePort: device.port,
      deviceProtocol: device.protocol,
      networkError: true
    };
  }
}

// RATE LIMITER
class RateLimiter {
  static requests = new Map();
  
  static isRateLimited(ip, employeeNo) {
    const key = `${ip}_${employeeNo}`;
    const now = Date.now();
    const lastRequest = this.requests.get(key);
    
    if (lastRequest && (now - lastRequest) < 5000) return true;
    
    this.requests.set(key, now);
    setTimeout(() => this.requests.delete(key), 60000);
    
    return false;
  }
}

// ENDPOINT POST PRINCIPAL
export async function POST(request) {
  try {
    if (request.method !== 'POST') {
      return NextResponse.json({ success: false, error: 'Método no permitido' }, { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Cuerpo de solicitud inválido' }, { status: 400 });
    }

    if (Array.isArray(body)) {
      return NextResponse.json({ 
        success: false, 
        error: 'No se permiten eliminaciones masivas. Solo un employeeNo por solicitud.',
        code: 'BULK_DELETE_NOT_ALLOWED'
      }, { status: 400 });
    }

    const { employeeNo } = body;
    const validation = SecurityValidator.validateDeleteRequest(employeeNo, body);
    
    if (!validation.valid) {
      return NextResponse.json({ 
        success: false, 
        error: validation.error,
        code: validation.code || 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const validatedEmployeeNo = validation.employeeNo;
    const ip = request.headers.get('x-forwarded-for') || 'N/A';
    const userAgent = request.headers.get('user-agent');
    
    if (RateLimiter.isRateLimited(ip, validatedEmployeeNo)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Demasiadas solicitudes. Por favor, espere 5 segundos.',
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }
    
    SecurityValidator.logDeleteAttempt(validatedEmployeeNo, ip, userAgent);
    console.log(`🔴 SOLICITUD DE ELIMINACIÓN PARA EMPLEADO: ${validatedEmployeeNo}`);

    // Procesar eliminación
    const results = [];
    let successCount = 0;

    for (const device of DEVICES) {
      console.log(`⚙️ Procesando dispositivo: ${device.protocol}://${device.ip}:${device.port}`);
      const result = await deleteUserFromDevice(device, validatedEmployeeNo);
      results.push(result);
      
      if (result.success) {
        successCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const allSuccess = successCount === DEVICES.length;
    const finalResult = {
      success: allSuccess,
      message: allSuccess 
        ? "Usuario eliminado de todos los dispositivos" 
        : `Usuario eliminado de ${successCount} de ${DEVICES.length} dispositivos`,
      results: results,
      deletedEmployeeNo: validatedEmployeeNo,
      timestamp: new Date().toISOString()
    };

    console.log('🎯 RESULTADO FINAL DE ELIMINACIÓN:', finalResult);
    
    return NextResponse.json(finalResult);

  } catch (error) {
    console.error('💥 ERROR GENERAL EN ENDPOINT:', error);
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 });
  }
  // Llamar al endpoint de base de datos para sincronizar
  try {
    console.log(`🔄 Sincronizando eliminación en base de datos...`);
    
    // Llamada interna al endpoint de DB
    const dbResponse = await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/database/users/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pasar algunas cabeceras para seguridad
        'x-forwarded-for': ip,
        'user-agent': userAgent
      },
      body: JSON.stringify({ employeeNo: validatedEmployeeNo })
    });
    
    const dbResult = await dbResponse.json();
    
    // Incluir resultado de DB en la respuesta final
    finalResult.databaseSync = {
      attempted: true,
      success: dbResult.success,
      message: dbResult.message || 'Sin respuesta de DB',
      warning: dbResult.warning || false
    };
    
    console.log(`🗄️ Resultado sincronización DB:`, dbResult);
    
  } catch (dbError) {
    console.error(`❌ Error al sincronizar con DB:`, dbError.message);
    finalResult.databaseSync = {
      attempted: true,
      success: false,
      error: dbError.message,
      warning: true
    };
  }

}

// ENDPOINT GET PARA INFORMACIÓN
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Endpoint de eliminación de usuarios Hikvision funcionando",
    security: {
      singleUserOnly: true,
      bulkDeletePrevention: true,
      rateLimiting: true
    },
    devices: DEVICES.map(d => ({ 
      ip: d.ip, 
      port: d.port, 
      protocol: d.protocol,
      url: `${d.protocol}://${d.ip}:${d.port}`
    })),
    usage: {
      method: "POST",
      body: "{ employeeNo: 'numeroEmpleado' }",
      note: "Los dispositivos pueden usar HTTP o HTTPS según configuración"
    }
  });
}