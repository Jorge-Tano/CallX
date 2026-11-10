// lib/db/mssql-pool.js
//
// Conexión central a SQL Server (AsistenciaEjecutivos) para toda la app.
// Call-X (Laravel) escribe los eventos de asistencia ahí; CallX solo
// consulta/administra sus propias tablas (auth, departamentos, sync_logs,
// usuarios_eliminados_audit, hikvision_users) en la misma base.
//
// runQuery() imita la forma de resultado de `pg` ({ rows, rowCount }) y
// acepta placeholders estilo Postgres ($1, $2, ...), convirtiéndolos a
// parámetros con nombre (@p1, @p2, ...) de mssql. Esto evita tener que
// reescribir la firma de cada llamada existente a query(text, params).
import sql from 'mssql';

const sqlConfig = {
  server: process.env.MSSQL_SERVER,
  port: process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT) : 1433,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: (process.env.MSSQL_ENCRYPT ?? 'yes') !== 'no',
    trustServerCertificate: (process.env.MSSQL_TRUST_SERVER_CERTIFICATE ?? 'true') === 'true',
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig).connect();
  }
  return poolPromise;
}

// Reemplaza $1, $2... por @p1, @p2... y registra cada valor como input del request.
function bindParams(request, text, params) {
  let sqlText = text;
  params.forEach((value, i) => {
    const paramName = `p${i + 1}`;
    request.input(paramName, value === undefined ? null : value);
    sqlText = sqlText.replace(new RegExp(`\\$${i + 1}(?!\\d)`, 'g'), `@${paramName}`);
  });
  return sqlText;
}

/**
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
export async function runQuery(request, text, params = []) {
  const sqlText = bindParams(request, text, params);
  const result = await request.query(sqlText);
  return {
    rows: /** @type {any[]} */ (result.recordset || []),
    rowCount: result.rowsAffected?.[0] ?? (result.recordset ? result.recordset.length : 0),
  };
}

/**
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
export async function query(text, params = []) {
  const p = await getPool();
  const request = p.request();
  return runQuery(request, text, params);
}

// Cliente "simple": varias queries seguidas reutilizando el mismo request,
// sin transacción real. Sirve para los call sites que hacían
// pool.connect() -> client.query() -> client.release() sin BEGIN/COMMIT.
export async function connect() {
  const p = await getPool();
  const request = p.request();
  return {
    query: (text, params = []) => runQuery(request, text, params),
    release: () => {},
  };
}

// Cliente transaccional real: entiende 'BEGIN' / 'COMMIT' / 'ROLLBACK'
// (los mismos literales que ya usaba el código con Postgres) y ejecuta el
// resto de queries dentro de la transacción de mssql.
export async function getTransactionClient() {
  const p = await getPool();
  const transaction = new sql.Transaction(p);
  let started = false;

  return {
    query: async (text, params = []) => {
      const trimmed = text.trim().toUpperCase();

      if (trimmed === 'BEGIN') {
        await transaction.begin();
        started = true;
        return { rows: [], rowCount: 0 };
      }
      if (trimmed === 'COMMIT') {
        await transaction.commit();
        return { rows: [], rowCount: 0 };
      }
      if (trimmed === 'ROLLBACK') {
        if (started) await transaction.rollback();
        return { rows: [], rowCount: 0 };
      }

      const request = new sql.Request(transaction);
      return runQuery(request, text, params);
    },
    release: () => {},
  };
}

export async function testConnection() {
  try {
    await getPool();
    return true;
  } catch {
    return false;
  }
}
