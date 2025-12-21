import { NextResponse } from 'next/server';
import { syncUsersFromHikvision, createSyncLog } from '@/lib/db/usuarios/sync-utils/route';

// Configuración
const HIKVISION_API = 'http://172.31.7.165:3000/api/users';

async function getHikvisionData() {
  console.log('📥 Obteniendo datos de Hikvision...');
  
  try {
    const response = await fetch(HIKVISION_API, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data.success || !Array.isArray(data.data)) {
      throw new Error('Respuesta inválida de Hikvision');
    }
    
    console.log(`✅ ${data.data.length} usuarios obtenidos`);
    return data.data;
    
  } catch (error) {
    console.error('❌ Error obteniendo datos:', error.message);
    throw error;
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Endpoint de sincronización activo",
    timestamp: new Date().toISOString()
  });
}

export async function POST(request) {
  console.log('🚀 Iniciando sincronización...');
  
  try {
    const { action, test_mode = true } = await request.json();
    
    if (action !== 'sync_now') {
      return NextResponse.json(
        { success: false, error: "Acción no válida. Use { action: 'sync_now' }" },
        { status: 400 }
      );
    }
    
    // 1. Obtener datos
    console.log('📥 Obteniendo datos de Hikvision...');
    const hikvisionUsers = await getHikvisionData();
    
    if (hikvisionUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay datos nuevos para sincronizar",
        timestamp: new Date().toISOString()
      });
    }
    
    // 2. Sincronizar
    console.log('🔄 Sincronizando con PostgreSQL...');
    const usersToSync = test_mode ? hikvisionUsers.slice(0, 3) : hikvisionUsers;
    
    if (test_mode) {
      console.log(`🧪 MODO PRUEBA: ${usersToSync.length} usuarios`);
    }
    
    const syncStart = Date.now();
    const syncResult = await syncUsersFromHikvision(usersToSync);
    const syncDuration = Date.now() - syncStart;
    
    console.log(`✅ Sincronización completada en ${syncDuration}ms`);
    console.log(`📊 Resultados: Creados: ${syncResult.created}, Actualizados: ${syncResult.updated}`);
    
    // 3. Crear log
    try {
      const logId = await createSyncLog({
        totalDevices: 1,
        successfulDevices: 1,
        devicesWithErrors: 0,
        totalUsers: usersToSync.length,
        newUsers: syncResult.created,
        updatedUsers: syncResult.updated,
        durationMs: syncDuration,
        status: 'completed'
      });
      console.log(`📝 Log creado: ${logId}`);
    } catch (logError) {
      console.error('⚠️ Error creando log:', logError.message);
    }
    
    return NextResponse.json({
      success: true,
      message: "Sincronización completada",
      summary: {
        usuarios_obtenidos: hikvisionUsers.length,
        usuarios_sincronizados: usersToSync.length,
        creados: syncResult.created,
        actualizados: syncResult.updated,
        errores: syncResult.errors,
        modo: test_mode ? 'prueba' : 'completo'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
    
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
        error_message: error.message.substring(0, 500)
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