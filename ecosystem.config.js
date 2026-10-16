module.exports = {
  apps: [
    {
      name: 'streamkit-bridge',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: 'scripts/kit-client-bridge.mjs',
      cwd: 'C:\\Users\\User\\Desktop\\pong steam\\streamkit',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'streamkit-web',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: 'node_modules/next/dist/bin/next dev',
      cwd: 'C:\\Users\\User\\Desktop\\pong steam\\streamkit',
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
}
