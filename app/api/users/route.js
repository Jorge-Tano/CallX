import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import { syncUsersFromHikvision, createSyncLog } from '@/lib/db/usuarios/sync-utils/route';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Configuración
const CONFIG = {
  username: process.env.HIKUSER,
  password: process.env.HIKPASS,
  deviceIp: process.env.HIKVISION_IP1,
  batchSize: 30,
  maxBatches: 15,
  authRetries: 3,
  delayBetweenBatches: 100
};

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

// Cliente Hikvision (copiado de tu código existente)
class HikvisionClient {
  constructor(deviceIp) {
    this.deviceIp = deviceIp;
    this.client = new DigestFetch(CONFIG.username, CONFIG.password, {
      disableRetry: false,
      algorithm: 'MD5'
    });
  }

  async fetchWithRetry(url, options, retryCount = 0) {
    try {
      const res = await this.client.fetch(url, options);
      
      if (res.status === 401 && retryCount < CONFIG.authRetries) {
        await new Promise(r => setTimeout(r, 500));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (retryCount < CONFIG.authRetries) {
        await new Promise(r => setTimeout(r, 800));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      throw error;
    }
  }

  async getUsersBatch(position) {
    const body = {
      UserInfoSearchCond: {
        searchID: "1",
        maxResults: CONFIG.batchSize,
        searchResultPosition: position
      }
    };

    const url = `https://${this.deviceIp}/ISAPI/AccessControl/UserInfo/Search?format=json`;

    return this.fetchWithRetry(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });
  }

  async getAllUsers() {
    let allUsers = [];
    let position = 0;
    let batchCount = 0;
    let errors = 0;

    while (batchCount < CONFIG.maxBatches && errors < 3) {
      batchCount++;

      try {
        const response = await this.getUsersBatch(position);
        const usersBatch = response?.UserInfoSearch?.UserInfo || [];

        if (usersBatch.length === 0) break;

        allUsers = [...allUsers, ...usersBatch];
        position += usersBatch.length;
        errors = 0;

        if (usersBatch.length < CONFIG.batchSize) break;
        await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches));
      } catch (error) {
        errors++;
        if (errors >= 2) position += CONFIG.batchSize;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return {
      deviceIp: this.deviceIp,
      users: allUsers,
      batches: batchCount,
      totalUsers: allUsers.length
    };
  }
}

// Función para procesar datos de usuario
function processUserData(user, deviceIp, index, total) {
  try {
    if (!user?.employeeNo) return null;

    const employeeId = user.employeeNo.toString().trim();
    
    console.log(`--- Procesando usuario ${index + 1}/${total}: ${employeeId} ---`);
    console.log(`📋 Datos procesados para ${employeeId}:`);
    console.log(`  Nombre: ${user.name || user.userName || 'Sin nombre'}`);

    const fotoPath = user.faceURL 
      ? user.faceURL
          .replace(/^https?:\/\//, '')
          .replace(/^[^\/]+\//, '')
          .replace(/@/g, '%40')
      : null;

    const grupoId = user.groupId || user.deptID;
    const departamento = DEPARTAMENTOS[grupoId] || (grupoId ? `Grupo ${grupoId}` : "No asignado");

    let genero = "No especificado";
    if (user.gender === 1 || user.gender === 'male') genero = 'Masculino';
    else if (user.gender === 2 || user.gender === 'female') genero = 'Femenino';

    let fechaCreacion = null;
    let fechaModificacion = null;
    
    if (user.Valid?.beginTime) fechaCreacion = user.Valid.beginTime.substring(0, 10);
    if (user.Valid?.endTime) fechaModificacion = user.Valid.endTime.substring(0, 10);

    const estado = user.Valid?.enable !== undefined 
      ? (user.Valid.enable ? 'Activo' : 'Inactivo') 
      : 'Desconocido';

    let tipoUsuario = 'Desconocido';
    if (user.userType === 0) tipoUsuario = 'Normal';
    else if (user.userType === 1) tipoUsuario = 'Administrador';
    else if (user.userType === 2) tipoUsuario = 'Supervisor';
    else if (typeof user.userType === 'string') tipoUsuario = user.userType;

    return {
      employeeNo: employeeId,
      nombre: (user.name || user.userName || 'Sin nombre').trim(),
      tipoUsuario,
      fechaCreacion,
      fechaModificacion,
      estado,
      departamento,
      genero,
      fotoPath,
      deviceIp
    };
  } catch (error) {
    return null;
  }
}

// 🌟 ENDPOINT GET PRINCIPAL: Consulta Hikvision + Sincroniza automáticamente
export async function GET(request) {
  const startTime = Date.now();
  console.log(`🌐 GET /api/users - Iniciando consulta y sincronización automática`);

  try {
    const { searchParams } = new URL(request.url);
    
    // Modo de operación (por compatibilidad)
    const mode = searchParams.get('mode') || 'full'; // 'full', 'bd-only', 'sync-only'
    const limit = parseInt(searchParams.get('limit') || '1000');
    const page = parseInt(searchParams.get('page') || '1');

    let processedUsers = [];
    
    if (mode !== 'bd-only') {
      console.log(`📥 Consultando Hikvision (${CONFIG.deviceIp})...`);
      const client = new HikvisionClient(CONFIG.deviceIp);
      const result = await client.getAllUsers();

      // Procesar usuarios
      processedUsers = result.users
        .map((user, index) => processUserData(user, result.deviceIp, index, result.totalUsers))
        .filter(user => user !== null);

      console.log(`✅ ${processedUsers.length} usuarios obtenidos de Hikvision`);
    }

    // Sincronizar con BD (excepto en modo bd-only)
    let syncResult = null;
    let logId = null;
    
    if (mode !== 'bd-only' && processedUsers.length > 0) {
      console.log(`🔄 Sincronizando automáticamente con base de datos...`);
      const syncStart = Date.now();
      
      syncResult = await syncUsersFromHikvision(processedUsers);
      const syncDuration = Date.now() - syncStart;
      
      // Crear log de sincronización
      try {
        logId = await createSyncLog({
          totalDevices: 1,
          successfulDevices: 1,
          devicesWithErrors: 0,
          totalUsers: processedUsers.length,
          newUsers: syncResult.created,
          updatedUsers: syncResult.updated,
          durationMs: syncDuration,
          status: 'completed',
          trigger: mode
        });
      } catch (logError) {
        console.warn('⚠️ No se pudo crear log:', logError.message);
      }
    }

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const paginatedUsers = processedUsers.slice(offset, offset + limit);
    
    const totalDuration = Date.now() - startTime;

    // Construir respuesta
    const responseData = {
      success: true,
      mode: mode,
      stats: {
        source: mode === 'bd-only' ? 'Database only' : 'Hikvision + Database',
        total_users: processedUsers.length,
        paginated_users: paginatedUsers.length,
        sync_enabled: mode !== 'bd-only',
        sync_created: syncResult?.created || 0,
        sync_updated: syncResult?.updated || 0,
        total_duration_ms: totalDuration
      },
      data: paginatedUsers,
      pagination: {
        page,
        limit,
        total: processedUsers.length,
        totalPages: Math.ceil(processedUsers.length / limit)
      },
      timestamp: new Date().toISOString()
    };

    if (syncResult) {
      responseData.syncResult = syncResult;
      responseData.logId = logId;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ Error en endpoint unificado:', error.message);
    
    try {
      await createSyncLog({
        totalDevices: 0,
        successfulDevices: 0,
        devicesWithErrors: 1,
        totalUsers: 0,
        newUsers: 0,
        updatedUsers: 0,
        durationMs: 0,
        status: 'error',
        error_message: error.message.substring(0, 500),
        trigger: 'get_unified'
      });
    } catch (logError) {
      console.error('❌ Error creando log de error:', logError);
    }
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// 🌟 ENDPOINT POST: Para sincronización manual
export async function POST(request) {
  console.log(`🔄 POST /api/users - Sincronización manual`);
  
  try {
    const startTime = Date.now();
    
    // 1. Consultar Hikvision
    console.log(`📥 Consultando Hikvision (${CONFIG.deviceIp})...`);
    const client = new HikvisionClient(CONFIG.deviceIp);
    const result = await client.getAllUsers();

    // 2. Procesar usuarios
    const processedUsers = result.users
      .map((user, index) => processUserData(user, result.deviceIp, index, result.totalUsers))
      .filter(user => user !== null);

    console.log(`✅ ${processedUsers.length} usuarios obtenidos de Hikvision`);

    // 3. Sincronizar con PostgreSQL
    console.log(`🔄 Sincronizando manualmente con base de datos...`);
    const syncStart = Date.now();
    
    const syncResult = await syncUsersFromHikvision(processedUsers);
    const syncDuration = Date.now() - syncStart;
    
    // 4. Crear log
    const logId = await createSyncLog({
      totalDevices: 1,
      successfulDevices: 1,
      devicesWithErrors: 0,
      totalUsers: processedUsers.length,
      newUsers: syncResult.created,
      updatedUsers: syncResult.updated,
      durationMs: syncDuration,
      status: 'completed',
      trigger: 'manual_sync'
    });

    const totalDuration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: "Sincronización manual completada",
      stats: {
        hikvision_users: processedUsers.length,
        sync_created: syncResult.created,
        sync_updated: syncResult.updated,
        sync_errors: syncResult.errors,
        sync_duration_ms: syncDuration,
        total_duration_ms: totalDuration
      },
      syncResult: syncResult,
      logId: logId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en sincronización manual:', error.message);
    
    try {
      await createSyncLog({
        totalDevices: 0,
        successfulDevices: 0,
        devicesWithErrors: 1,
        totalUsers: 0,
        newUsers: 0,
        updatedUsers: 0,
        durationMs: 0,
        status: 'error',
        error_message: error.message.substring(0, 500),
        trigger: 'manual_sync'
      });
    } catch (logError) {
      console.error('❌ Error creando log de error:', logError);
    }
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}