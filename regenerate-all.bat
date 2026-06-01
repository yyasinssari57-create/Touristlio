@echo off
cd /d "%~dp0"
echo === Touristlio: logo + places + seed ===
call npm run logo:extract
if errorlevel 1 goto fail
call npm run places:merge
if errorlevel 1 goto fail
call npm run seed
if errorlevel 1 goto fail
echo.
echo Tamam. npm start ile sunucuyu yeniden baslatin, tarayicida Ctrl+F5.
goto end
:fail
echo Hata — yukaridaki ciktiyi kontrol edin.
:end
pause
