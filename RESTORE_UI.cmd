@echo off
cd /d C:\Users\Yasin\Projects\touristlio

echo === Git log (son 8) ===
git log --oneline -8

echo.
echo === Sade UI oncesi commit'e reset ===
git reset --hard 8a7bde3f3ca014453569b4ba306e847d962de6f5

echo.
echo === Navbar kontrol ===
findstr /i "nav-tabs navSearch trip-planner nav-minimal" public\index.html

echo.
echo === Sunucu syntax ===
node --check server\index.js

echo.
echo === GitHub'a geri yuklemek icin (DIKKAT: force push) ===
echo git push --force-with-lease origin main

pause
