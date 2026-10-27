@echo off
rem Arranca el dashboard de Costa Brava Corp y abre el navegador.
rem Para pararlo: boton Apagar del dashboard, o cerrar la ventana "Costa Brava Corp - servidor".
cd /d "%~dp0"
where node >nul 2>nul || (echo No se encuentra Node.js. Instalalo desde nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --omit=dev || (pause & exit /b 1)
)
start "Costa Brava Corp - servidor" /min node server.js
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4321"
