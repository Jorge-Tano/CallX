import pkg from 'pg';
const { Pool } = pkg;

// Configuración del pool de conexiones
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Función para ejecutar consultas
export async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error(`❌ Error en query:`, error.message);
    throw error;
  }
}

// Obtener cliente del pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;