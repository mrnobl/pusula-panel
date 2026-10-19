@echo off
REM ---------------------------------------------------------------------------
REM  Pusula'yi baslat (cift tiklayin ya da masaustundeki "Pusula" kisayolu)
REM
REM  - Pusula zaten calisiyorsa yalniz paneli acar.
REM  - Calismiyorsa sunucuyu denetleyiciyle (scripts\start-bot.cmd = npm run supervise)
REM    gizli pencerede baslatir, acilmasini bekler, paneli kendi penceresinde acar.
REM  - Klasoru kendisi bulur (sabit yol yok): C:\Pusula ya da baska bir yer.
REM  - Asil is: scripts\pusula-sunucu.ps1 (Durdur ve otomatik baslatma gorevi de onu kullanir).
REM
REM  Ek secenek: Pusula-Baslat.cmd -PanelAcma   (paneli acmadan yalniz sunucuyu baslatir)
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"
title Pusula - baslatiliyor

where powershell >nul 2>nul
if errorlevel 1 (
  echo HATA: Windows PowerShell bulunamadi.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pusula-sunucu.ps1" -Islem Baslat %*
if errorlevel 1 (
  echo.
  echo Pusula baslatilamadi. Yukaridaki aciklamayi okuyun.
  echo Takilirsaniz bu pencerenin ekran goruntusunu gelistirme sohbetine gonderin.
  echo.
  echo Kapatmak icin bir tusa basin.
  pause >nul
  exit /b 1
)
exit /b 0
