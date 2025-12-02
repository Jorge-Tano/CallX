import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  username: "admin",
  password: "Tattered3483",
  deviceIp: ["172.31.0.165", "172.31.0.164"],
  batchSize: 30,
  maxBatches: 15,
  authRetryAttempts: 3,
  delayBetweenBatches: 300
};

// Mapeo de departamentos basado en groupId
const DEPARTAMENTOS = {
  1: "TI",
  2: "Teams Leaders", 
  3: "Campana 5757",
  4: "Campana SAV",
  5: "Campana REFI",
  6: "Campana PL",
  7: "Campana PARLO",
  8: "Administrativo"
};

class AuthManager {
  static createDigestClient() {
    return new DigestFetch(CONFIG.username, CONFIG.password, {
      disableRetry: false,
      algorithm: 'MD5'
    });
  }
}

class UserInfoClient {
  constructor(deviceIp) {
    this.deviceIp = deviceIp;
    this.refreshClient();
  }

  refreshClient() {
    this.client = AuthManager.createDigestClient();
  }

  async searchUsersBatch(searchResultPosition = 0, maxResults = CONFIG.batchSize, retryCount = 0) {
    const body = {
      UserInfoSearchCond: {
        searchID: "1",
        maxResults: maxResults,
        searchResultPosition: searchResultPosition
      }
    };

    const url = `https://${this.deviceIp}/ISAPI/AccessControl/UserInfo/Search?format=json`;

    try {
      const res = await this.client.fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      });

      if (res.status === 401 && retryCount < CONFIG.authRetryAttempts) {
        this.refreshClient();
        await new Promise(r => setTimeout(r, 500));
        return this.searchUsersBatch(searchResultPosition, maxResults, retryCount + 1);
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Error ${res.status}: ${err}`);
      }

      return await res.json();

    } catch (err) {
      if (retryCount < CONFIG.authRetryAttempts &&
        (err.message.includes('401') || err.message.includes('network'))) {
        this.refreshClient();
        await new Promise(r => setTimeout(r, 800));
        return this.searchUsersBatch(searchResultPosition, maxResults, retryCount + 1);
      }
      throw err;
    }
  }
}

class UserQueryService {
  constructor(userInfoClient) {
    this.client = userInfoClient;
    this.deviceIp = userInfoClient.deviceIp;
  }

  async getAllUsersWithPagination() {
    let allRawResponses = [];
    let currentPos = 0;
    let batchCount = 0;
    let consecutiveErrors = 0;

    while (batchCount < CONFIG.maxBatches && consecutiveErrors < 3) {
      batchCount++;

      try {
        const response = await this.client.searchUsersBatch(currentPos);
        const usersBatch = response?.UserInfoSearch?.UserInfo || [];

        allRawResponses.push({
          batch: batchCount,
          raw: response
        });

        if (usersBatch.length === 0) break;

        currentPos += usersBatch.length;
        consecutiveErrors = 0;

        if (usersBatch.length < CONFIG.batchSize) break;

        await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches));

      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 2) {
          currentPos += CONFIG.batchSize;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return {
      deviceIp: this.deviceIp,
      rawResponses: allRawResponses,
      stats: {
        batchesAttempted: batchCount,
        consecutiveErrors
      }
    };
  }
}

class MultiDeviceUserService {
  constructor() {
    this.deviceServices = CONFIG.deviceIp.map(ip => {
      const client = new UserInfoClient(ip);
      return new UserQueryService(client);
    });
  }

  async getAllUsersFromAllDevices() {
    const results = [];

    for (const service of this.deviceServices) {
      try {
        const data = await service.getAllUsersWithPagination();
        results.push(data);
      } catch (err) {
        results.push({
          deviceIp: service.deviceIp,
          error: err.message,
          rawResponses: [],
          stats: {}
        });
      }
    }

    return { results };
  }
}

// Función para transformar usuarios desde raw data
function transformarUsuariosDesdeRaw(rawData) {
  const usuariosTransformados = [];

  rawData.forEach(dispositivo => {
    if (!dispositivo || !dispositivo.rawResponses) return;

    const deviceIp = dispositivo.deviceIp || 'Desconocido';
    
    dispositivo.rawResponses.forEach((lote) => {
      if (!lote || !lote.raw || !lote.raw.UserInfoSearch) return;

      const usuariosLote = lote.raw.UserInfoSearch.UserInfo;
      
      if (Array.isArray(usuariosLote)) {
        usuariosLote.forEach((user) => {
          if (user && user.employeeNo) {
            // Extraer información de la foto
            let fotoPath = null;
            if (user.faceURL) {
              // Convertir URL absoluta a ruta relativa
              fotoPath = user.faceURL
                .replace(/^https?:\/\//, '')
                .replace(/^[^\/]+\//, '') // Quitar el dominio
                .replace(/@/g, '%40'); // Codificar @ si existe
            }
            
            // Obtener departamento basado en groupId o deptID
            let departamento = "No asignado";
            const grupoId = user.groupId || user.deptID;
            
            if (grupoId && DEPARTAMENTOS[grupoId]) {
              departamento = DEPARTAMENTOS[grupoId];
            } else if (grupoId) {
              departamento = `Grupo ${grupoId}`;
            }
            
            // Determinar género
            let genero = "No especificado";
            if (user.gender === 1) genero = 'Masculino';
            else if (user.gender === 2) genero = 'Femenino';
            
            const usuarioTransformado = {
              id: user.employeeNo,
              nombre: user.name || 'Sin nombre',
              tipoUsuario: user.userType || 'Desconocido',
              numeroEmpleado: user.employeeNo,
              fechaCreacion: user.createTime || 'No disponible',
              fechaModificacion: user.modifyTime || 'No disponible',
              estado: user.enable ? 'Activo' : 'Inactivo',
              departamento: departamento,
              dispositivo: deviceIp,
              cedula: user.employeeNo,
              genero: genero,
              department_id: user.deptID,
              groupId: user.groupId,
              valid: user.Valid ? {
                inicio: user.Valid.beginTime,
                fin: user.Valid.endTime
              } : undefined,
              // Información para la foto
              fotoPath: fotoPath || user.employeeNo,
              fotoDeviceIp: deviceIp,
              // Datos originales para debugging
              _rawData: process.env.NODE_ENV === 'development' ? user : undefined
            };
            
            usuariosTransformados.push(usuarioTransformado);
          }
        });
      }
    });
  });

  return usuariosTransformados;
}

export async function GET(request) {
  try {
    console.log('🔄 INICIANDO CONSULTA DE USUARIOS HIKVISION...');
    
    const multi = new MultiDeviceUserService();
    const result = await multi.getAllUsersFromAllDevices();

    // Transformar usuarios para el frontend
    const usuariosTransformados = transformarUsuariosDesdeRaw(result.results);

    // Calcular estadísticas por departamento
    const estadisticasPorDepartamento = {};
    usuariosTransformados.forEach(usuario => {
      const depto = usuario.departamento;
      estadisticasPorDepartamento[depto] = (estadisticasPorDepartamento[depto] || 0) + 1;
    });

    // Devolver datos transformados
    const responseData = {
      success: true,
      message: "Usuarios obtenidos correctamente",
      timestamp: new Date().toISOString(),
      devices: CONFIG.deviceIp,
      data: usuariosTransformados,
      estadisticas: {
        totalDevices: CONFIG.deviceIp.length,
        successfulDevices: result.results.filter(device => !device.error).length,
        devicesWithErrors: result.results.filter(device => device.error).length,
        totalUsers: usuariosTransformados.length,
        usersWithPhotoInfo: usuariosTransformados.filter(u => u.fotoPath && u.fotoPath !== u.numeroEmpleado).length,
        porDepartamento: estadisticasPorDepartamento
      },
      // Para debugging, mantener raw data solo en desarrollo
      rawData: process.env.NODE_ENV === 'development' ? result.results : undefined
    };

    console.log(`✅ CONSULTA COMPLETADA: ${usuariosTransformados.length} usuarios`);
    console.log(`📊 Estadísticas por departamento:`, estadisticasPorDepartamento);

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ ERROR EN CONSULTA DE USUARIOS:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}