import { NextResponse } from 'next/server';
import { AutoSyncService } from '@/lib/services/autoSyncService';
import { UserRepository } from '@/lib/db/repositories/userRepository';

// Instancia singleton para la sincronización automática
const autoSyncService = new AutoSyncService();
const userRepository = new UserRepository();

/**
 * Sincronización automática cada 30 minutos
 */
async function startAutoSync() {
  // Solo sincronizar si ha pasado más de 30 minutos desde la última sincronización
  const syncStatus = autoSyncService.getSyncStatus();
  const now = new Date();
  
  if (!syncStatus.lastSyncTime || 
      (now - syncStatus.lastSyncTime) > 30 * 60 * 1000) {
    
    console.log('🔄 Iniciando sincronización automática...');
    try {
      const result = await autoSyncService.intelligentSync();
      console.log('✅ Sincronización automática completada:', result);
    } catch (error) {
      console.error('❌ Error en sincronización automática:', error);
    }
  }
}

/**
 * Endpoint principal inteligente
 * - Sincronización automática en segundo plano
 * - Respuesta rápida desde base de datos
 * - Filtros y búsqueda
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const search = searchParams.get('search');
    const forceSync = searchParams.get('forceSync') === 'true';
    const stats = searchParams.get('stats') === 'true';

    // Iniciar sincronización automática en segundo plano (no bloqueante)
    if (!forceSync) {
      startAutoSync().catch(console.error);
    }

    // Acciones específicas
    if (action === 'sync' || forceSync) {
      const syncResult = await autoSyncService.intelligentSync();
      
      return NextResponse.json({
        success: true,
        action: 'sync',
        ...syncResult,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'sync-status') {
      const syncStatus = autoSyncService.getSyncStatus();
      
      return NextResponse.json({
        success: true,
        action: 'sync-status',
        ...syncStatus,
        timestamp: new Date().toISOString()
      });
    }

    if (stats) {
      const userStats = await userRepository.getUserStats();
      
      return NextResponse.json({
        success: true,
        action: 'stats',
        stats: userStats,
        timestamp: new Date().toISOString()
      });
    }

    // Obtener usuarios (con búsqueda si se especifica)
    let users;
    if (search) {
      users = await userRepository.searchUsers(search);
    } else {
      users = await userRepository.getAllUsers();
    }

    const syncStatus = autoSyncService.getSyncStatus();

    return NextResponse.json({
      success: true,
      source: 'database',
      syncStatus: {
        lastSync: syncStatus.lastSyncTime,
        nextSync: syncStatus.nextSyncTime
      },
      users: users,
      pagination: {
        total: users.length,
        returned: users.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("ERROR en endpoint de usuarios:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        action: 'error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * Endpoint para forzar sincronización manual
 */
export async function POST(request) {
  try {
    const { action } = await request.json();

    if (action === 'force-sync') {
      const syncResult = await autoSyncService.intelligentSync();
      
      return NextResponse.json({
        success: true,
        action: 'force-sync',
        ...syncResult
      });
    }

    return NextResponse.json(
      { success: false, error: 'Acción no válida' },
      { status: 400 }
    );

  } catch (error) {
    console.error("ERROR en POST usuarios:", error);
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}