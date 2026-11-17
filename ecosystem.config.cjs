module.exports = {
  apps: [
    {
      name: "callx-next-prod",
      // server.mjs = "next start" + HTTPS opcional (ver comentarios del archivo)
      script: "server.mjs",
      cwd: "C:/Proyectos/CallX",
      interpreter: "node",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3600"
      }
    }
  ]
};
