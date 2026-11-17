module.exports = {
  apps: [
    {
      name: "callx-next-prod",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3600",
      cwd: "C:/proyectos/callx",
      interpreter: "node",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
