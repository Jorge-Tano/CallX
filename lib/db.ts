import { query, connect, testConnection } from './db/mssql-pool';

// Objeto compatible con la forma en que el código ya usaba `pool` de `pg`:
// pool.query(text, params) y pool.connect() -> client.query()/client.release().
export const pool = {
  query,
  connect,
};

export { testConnection, query };
