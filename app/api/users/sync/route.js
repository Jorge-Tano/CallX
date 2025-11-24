import { NextResponse } from 'next/server';
import { AutoSyncService } from '@/lib/services/autoSyncService';

const autoSyncService = new AutoSyncService();

export async function GET() {
  try {
    const syncStatus = autoSyncService.getSyncStatus();
    
    return NextResponse.json({
      success: true,
      ...syncStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await autoSyncService.intelligentSync();
    
    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}