// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "nextjs-biometric-api",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "./", // Ruta a tu proyecto Next.js
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      },
      error_file: "logs/error.log",
      out_file: "logs/output.log",
      time: true,
      // Configuración específica para Next.js
      exec_mode: "fork", // Para Next.js es mejor usar fork en lugar de cluster
      listen_timeout: 5000,
      kill_timeout: 5000
    }
  ]
};