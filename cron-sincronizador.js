// cron-sincronizador.js
//
// DESACTIVADO: este cron duplicaba la sincronización de eventos Hikvision
// que ya hace Call-X (Laravel, tarea programada "CallX-Scheduler" -> hikvision:sync
// cada minuto), escribiendo directo a Postgres. Ahora Call-X es la única fuente
// que escribe eventos, hacia SQL Server (AsistenciaEjecutivos), y CallX (esta app)
// solo lee de ahí.
//
// Si esto sigue corriendo bajo pm2 como "sincronizador-cron", detenlo con:
//   npm run cron:stop
//   npm run cron:delete
//
// No reactivar sin antes confirmar que Call-X dejó de sincronizar eventos,
// para no volver a duplicar consultas a los dispositivos Hikvision.

console.log('[cron-sincronizador] Desactivado — la sincronización de eventos ahora la hace Call-X (Laravel). Saliendo.');
process.exit(0);
