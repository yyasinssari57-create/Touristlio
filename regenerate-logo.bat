@echo off
cd /d "%~dp0"
echo Touristlio logo dosyalarini olusturuluyor...
node server\scripts\extract-nav-logo.js
if errorlevel 1 (
  echo HATA: logo cikarilamadi. Desktop\touristlio7c.html dosyasi var mi kontrol edin.
  pause
  exit /b 1
)
echo Tamam: logo.png, icon.svg, icon-white.svg guncellendi.
pause
