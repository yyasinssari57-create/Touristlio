@echo off
chcp 65001 >nul
title Touristlio - GitHub'a Yukle
cd /d "%~dp0"

set "GIT=C:\Program Files\Git\cmd\git.exe"
if not exist "%GIT%" set "GIT=git"

echo ============================================
echo   TOURISTLIO - GitHub'a Yukleme
echo ============================================
echo.

echo Degisiklikler ekleniyor...
"%GIT%" add .

echo.
set /p MESAJ="Bu yuklemeye bir aciklama yaz (bos birakirsan tarih kullanilir): "
if "%MESAJ%"=="" set "MESAJ=Guncelleme %date% %time%"

echo.
echo Kaydediliyor (commit)...
"%GIT%" commit -m "%MESAJ%"

echo.
echo GitHub'a gonderiliyor (push)...
"%GIT%" push origin main

echo.
echo ============================================
echo   ISLEM TAMAMLANDI
echo ============================================
echo.
pause
