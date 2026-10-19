@echo off
REM ---------------------------------------------------------------------------
REM  Pusula - denetleyici (supervisor)
REM
REM  Node surecini calistirir; surec herhangi bir sebeple sonlanirsa kisa bir
REM  bekleme sonrasi yeniden baslatir. Boylece cokme, borsa kaynakli olumcul
REM  hata veya bellek sorunu botu kalici olarak durdurmaz.
REM
REM  Gunluk kullanim: Pusula-Baslat.cmd / Pusula-Durdur.cmd (proje kokunde) bu
REM  denetleyiciyi gizli pencerede calistirir ve PID'ini data\pusula.pid'e yazar.
REM  Elle calistirmak icin:  scripts\start-bot.cmd  (ya da npm run supervise)
REM  Otomatik baslatma icin: scripts\install-autostart.ps1
REM
REM  PUSULA_KONSOL_GUNLUGU tanimliysa (gizli pencere) sunucunun ekran ciktisi o
REM  dosyaya eklenir (scripts\pusula-sunucu.ps1 data\sunucu-konsol.log verir).
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0.."

REM 68.0 (PLAN-TASIMA F2): gunluk klasoru lib/yollar.js ile (scripts\veri-yolu.js; program icindeyse goreli yazar).
REM node yoksa / hata verirse eski yer data.
set "LOGDIR=%CD%\data"
set "VDIR="
for /f "delims=" %%v in ('node scripts\veri-yolu.js --dizin supervisor.log 2^>nul') do set "VDIR=%%v"
if not defined VDIR goto :logdir_tamam
set "LOGDIR=%CD%\%VDIR%"
if "%VDIR:~1,1%"==":" set "LOGDIR=%VDIR%"
:logdir_tamam
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "SUPLOG=%LOGDIR%\supervisor.log"

echo [%date% %time%] Denetleyici baslatildi >> "%SUPLOG%"

:loop
echo.
echo ==========================================================
echo  Pusula baslatiliyor - %date% %time%
echo ==========================================================
echo [%date% %time%] Node sureci baslatiliyor >> "%SUPLOG%"
node scripts\denetleyici-bekle.js --basla >nul 2>&1

if defined PUSULA_KONSOL_GUNLUGU (
  node server.js >> "%PUSULA_KONSOL_GUNLUGU%" 2>&1
) else (
  node server.js
)

set "EXITCODE=%ERRORLEVEL%"
echo [%date% %time%] Node sonlandi - cikis kodu %EXITCODE% >> "%SUPLOG%"

REM Cikis kodu 0 ise kullanici bilerek durdurmustur (Ctrl+C / SIGTERM).
if "%EXITCODE%"=="0" (
  echo Bot duzgun sekilde durduruldu. Denetleyici sonlaniyor.
  echo [%date% %time%] Temiz kapanis - denetleyici sonlandi >> "%SUPLOG%"
  goto :eof
)

REM 62.0 (DENETIM-CANLI-ALTYAPI O1): ardisik hizli cokmede bekleme artar (10 - 30 - 60 - 300 sn); 5. cokmede Telegram.
REM Hesap scripts\denetleyici-bekle.js; o calismazsa eski 10 sn.
set "BEKLE=10"
for /f "delims=" %%s in ('node scripts\denetleyici-bekle.js %EXITCODE% 2^>nul') do set "BEKLE=%%s"
echo %BEKLE%| findstr /r "^[0-9][0-9]*$" >nul || set "BEKLE=10"
echo [%date% %time%] Yeniden baslatma %BEKLE% sn sonra >> "%SUPLOG%"

echo.
echo Bot beklenmedik sekilde sonlandi ^(kod %EXITCODE%^). %BEKLE% saniye icinde yeniden baslatilacak...
echo Durdurmak icin Pusula-Durdur.cmd (ya da bu pencereyi kapatin / Ctrl+C).
timeout /t %BEKLE% /nobreak >nul
goto loop
