@echo off
REM ---------------------------------------------------------------------------
REM  Pusula'yi durdur (cift tiklayin ya da masaustundeki "Pusula'yi durdur" kisayolu)
REM
REM  - YALNIZ Pusula-Baslat'in (ya da otomatik baslatma gorevinin) kaydettigi
REM    surecleri kapatir: data\pusula.pid icindeki PID'ler. Bilgisayardaki baska
REM    hicbir programa dokunmaz (toplu kapatma YOK).
REM  - Calisan bot ya da acik pozisyon varsa uyarir ve onay ister.
REM  - Asil is: scripts\pusula-sunucu.ps1 -Islem Durdur
REM
REM  Ek secenek: Pusula-Durdur.cmd -Evet   (onay sormadan durdurur)
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"
title Pusula - durduruluyor

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pusula-sunucu.ps1" -Islem Durdur %*
set "SONUC=%ERRORLEVEL%"
echo.
if "%SONUC%"=="0" (
  echo Bu pencere 5 saniye sonra kapanacak.
  timeout /t 5 >nul 2>nul
  exit /b 0
)
if "%SONUC%"=="2" (
  timeout /t 5 >nul 2>nul
  exit /b 2
)
echo Takilirsaniz bu pencerenin ekran goruntusunu gelistirme sohbetine gonderin.
echo Kapatmak icin bir tusa basin.
pause >nul
exit /b %SONUC%
