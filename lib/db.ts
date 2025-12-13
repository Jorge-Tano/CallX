import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'BD_biometricos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: false, // ← DESHABILITAR SSL COMPLETAMENTE
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function testConnection() {
  try {
    const client = await pool.connect()
    client.release()
    return true
  } catch (error) {
    return false
  }
}

export async function query(text: string, params?: any[]) {
  const client = await pool.connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}