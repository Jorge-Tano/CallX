import { query as runQuery, getTransactionClient } from '@/lib/db/mssql-pool';

/**
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
export async function query(text, params) {
  try {
    return await runQuery(text, params);
  } catch (error) {
    console.error(`❌ Error en query:`, error.message);
    throw error;
  }
}

// Cliente con soporte de transacción real (BEGIN/COMMIT/ROLLBACK),
// usado por sync-utils/route.js para sincronizar usuarios en bloque.
export async function getClient() {
  return await getTransactionClient();
}
