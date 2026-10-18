module.exports = {
  apps: [
    {
      name: 'streamkit-bridge',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: 'scripts/kit-client-bridge.mjs',
      cwd: 'D:\\pong steam\\streamkit',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'streamkit-web',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: 'node_modules/next/dist/bin/next dev',
      cwd: 'D:\\pong steam\\streamkit',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      // VoiceStudio TTS. Without this, /api/tts/synthesize returns 502 the
      // moment the machine reboots, because nothing else starts it.
      //
      // PATH must carry the venv: dev-backend.mjs spawns bare "uv", which only
      // exists at .venv\Scripts\uv.exe and is not on the system PATH. Inlined
      // rather than appended to the machine PATH so this config stays the only
      // place that has to change if the venv moves.
      name: 'voicestudio',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: 'D:\\VoiceStudio\\scripts\\dev-backend.mjs',
      cwd: 'D:\\VoiceStudio',
      env: {
        PATH: 'D:\\VoiceStudio\\.venv\\Scripts;C:\\Program Files\\Common Files\\Oracle\\Java\\javapath;C:\\Python314\\Scripts\\;C:\\Python314\\;C:\\Python310\\Scripts\\;C:\\Python310\\;C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath;C:\\Program Files (x86)\\Common Files\\Intel\\Shared Libraries\\redist\\intel64\\compiler;C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\;C:\\Windows\\System32\\OpenSSH\\;C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common;C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\NvDLISR;C:\\Program Files (x86)\\Windows Kits\\10\\Windows Performance Toolkit\\;C:\\Program Files\\Git\\cmd;C:\\Program Files\\nodejs\\;C:\\ProgramData\\chocolatey\\bin;C:\\Program Files\\dotnet\\;C:\\Program Files\\GitHub CLI\\;C:\\Program Files\\Cloudflare\\Cloudflare WARP\\;C:\\Program Files (x86)\\cloudflared\\;C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\;C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\;C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\;C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python310\\;C:\\Users\\User\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\bin;C:\\msys64\\mingw64\\bin;C:\\Program Files (x86)\\Nmap;C:\\flutter_windows_3.35.5-stable\\flutter\\bin;C:\\Users\\User\\AppData\\Roaming\\npm;C:\\Users\\User\\AppData\\Local\\Programs\\Antigravity\\bin;C:\\Users\\User\\AppData\\Local\\Programs\\Antigravity IDE\\bin;C:\\Program Files\\CMake\\bin;C:\\msys64\\mingw64\\bin;C:\\Users\\User\\.dotnet\\tools;C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Links;'
      }
    }
  ]
}
