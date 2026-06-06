@echo off
chcp 65001 >nul
cd /d C:\Users\Yasin\Projects\touristlio

echo.
echo ============================================================
echo  Touristlio - NIHAI PROMPT ONCESI geri yukleme
echo ============================================================
echo.
echo  Hedef commit : 1dd581dd9e162b136db1d9e2d0af2c0810916046
echo  Commit mesaji : V2 guncelleme
echo  (Nihai paket commit'i 8a7bde3 - bunun BIR ONCESI)
echo.

echo [1/3] Git reset --hard ...
git reset --hard 1dd581dd9e162b136db1d9e2d0af2c0810916046
if errorlevel 1 (
  echo Git reset basarisiz - Node yedek script calistiriliyor...
  node _git_restore.js
  if errorlevel 1 goto :fail
) else (
  echo Git reset OK - Admin link ve splash patch uygulaniyor...
  node _git_restore.js --patch-only
  echo. > .pre_nihai_restored
)

echo.
echo [2/3] Navbar kontrol ...
findstr /i "nt-explore class=\"hero\" nav-minimal adminLink" public\index.html

echo.
echo [3/3] Sunucu syntax kontrol ...
node --check server\index.js
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo  TAMAMLANDI
echo ============================================================
echo.
echo  Gordugunuz UI (1dd581d + patch):
echo    - Tam navbar: logo, slogan, Keşfet / Arama / Gezi Planlayici / Blog
echo    - Hero bolumu, kategori sekmeleri, destinasyon kartlari
echo    - Ust menude ADMIN YOK  (admin sadece /admin URL)
echo    - Acilis: siyah T harfi splash animasyonu
echo.
echo  Calistirmak icin CMD:
echo    cd /d C:\Users\Yasin\Projects\touristlio
echo    npm start
echo    Tarayici: Ctrl+F5  (sert yenileme)
echo.
echo  GitHub'a bu eski surumu yuklemek icin DIKKAT:
echo    git push --force-with-lease origin main
echo    (Uzak repodaki nihai commit silinir - sadece eminseniz)
echo.
goto :end

:fail
echo.
echo HATA olustu. _restore_result.txt dosyasini kontrol edin.
pause
exit /b 1

:end
pause
