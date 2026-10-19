# ---------------------------------------------------------------------------
#  Pusula - otomatik baslatma kurulumu (Windows Gorev Zamanlayici)
#
#  Gorev, Pusula-Baslat.cmd ile AYNI cekirdegi calistirir:
#    scripts\pusula-sunucu.ps1 -Islem Baslat -PanelAcma -Bekle
#  (denetleyici scripts\start-bot.cmd gizli pencerede; PID'ler data\pusula.pid;
#   Pusula-Durdur.cmd ayni kayitla durdurur). Proje klasorunu kendisi bulur
#  (sabit yol yok): C:\Pusula ya da baska bir yer.
#
#  Kurulum (YONETICI PowerShell, proje klasorunde):
#    powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#        -> varsayilan -Tetik Acilis: bilgisayar ACILINCA baslar, kimse oturum
#           acmasa da (S8 karari). Windows parolanizi BIR KEZ sorar; parola
#           Windows'ta saklanir, bu betik onu hicbir yere yazmaz.
#    powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Tetik Oturum
#        -> eski davranis: yalniz siz oturum actiginizda baslar (parola istemez).
#  Kaldirma:
#    powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove   (ya da -Kaldir)
#
#  AD DEGISIKLIGI (2026-10-07): gorev adi 'AntigravityTradeBot' -> 'PusulaBot'.
#  Eski adli gorev ve BASKA KLASORU gosteren eski PusulaBot gorevi kurulumda
#  durdurulup SILINIR; aksi halde iki denetleyici ayni botu iki kez baslatirdi.
#  Adim adim gecis: EVDE-GECIS-PUSULA.md
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [switch]$Remove,
    [switch]$Kaldir,
    [ValidateSet('Acilis', 'Oturum')]
    [string]$Tetik = 'Acilis',
    [string]$GorevAdi = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PusulaBot'
if ($GorevAdi) { $TaskName = $GorevAdi }   # 68.3: yalniz kur.js deneme kosusu (sahte gorev adi); varsayilan ad degismez
$EskiGorevAdlari = @('AntigravityTradeBot')
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Cekirdek = Join-Path $ProjectRoot 'scripts\pusula-sunucu.ps1'
$Supervisor = Join-Path $ProjectRoot 'scripts\start-bot.cmd'

function Gorev-Klasoru($gorev) {
    try {
        $a = @($gorev.Actions)[0]
        return (@($a.WorkingDirectory, $a.Execute, $a.Arguments) | Where-Object { $_ }) -join ' '
    } catch { return '' }
}

function Remove-EskiGorevler {
    foreach ($eski in $EskiGorevAdlari) {
        $g = Get-ScheduledTask -TaskName $eski -ErrorAction SilentlyContinue
        if ($g) {
            Write-Host "Eski gorevin gosterdigi yer: $(Gorev-Klasoru $g)" -ForegroundColor DarkGray
            # Calisiyorsa once durdur: eski denetleyici penceresi botu yeniden baslatmasin.
            Stop-ScheduledTask -TaskName $eski -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $eski -Confirm:$false
            Write-Host "Eski adli gorev kaldirildi: $eski" -ForegroundColor Yellow
        }
    }
}

if ($Remove -or $Kaldir) {
    if (-not $GorevAdi) { Remove-EskiGorevler }
    $g = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($g) {
        Write-Host "Gorevin gosterdigi yer: $(Gorev-Klasoru $g)" -ForegroundColor DarkGray
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Otomatik baslatma kaldirildi: $TaskName" -ForegroundColor Yellow
    } else {
        Write-Host "Kayitli gorev bulunamadi: $TaskName" -ForegroundColor Yellow
    }
    Write-Host 'Not: gorevin durdurulmasi, onun baslattigi sunucuyu her zaman kapatmaz.'
    Write-Host '     Kontrol: netstat -ano | findstr :3000   (LISTENING satiri olmamali)'
    return
}

if (-not (Test-Path $Cekirdek)) { throw "Baslatma betigi bulunamadi: $Cekirdek (git pull yapildi mi?)" }
if (-not (Test-Path $Supervisor)) { throw "Denetleyici bulunamadi: $Supervisor" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node komutu PATH uzerinde bulunamadi. Node.js kurulu mu? (https://nodejs.org, LTS; kurduktan sonra PowerShell'i kapatip acin)"
}

Write-Host "Proje      : $ProjectRoot"
Write-Host "Baslatma   : $Cekirdek"

if (-not $GorevAdi) { Remove-EskiGorevler }

$onceki = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($onceki) {
    $k = Gorev-Klasoru $onceki
    if ($k -and ($k -notlike "*$ProjectRoot*")) {
        Write-Host "Eski PusulaBot gorevi BASKA bir klasoru gosteriyor: $k" -ForegroundColor Yellow
        Write-Host 'Durdurulup bu klasor icin yeniden kuruluyor.' -ForegroundColor Yellow
    }
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host 'Onceki gorev kaldirildi.' -ForegroundColor DarkGray
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Cekirdek`" -Islem Baslat -PanelAcma -Bekle" `
    -WorkingDirectory $ProjectRoot

# Gorev seviyesinde de yeniden deneme: denetleyici kendiliginden kapanirsa devreye girer.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

$aciklama = 'Pusula - scripts\pusula-sunucu.ps1 ile baslar (Pusula-Baslat ile ayni), cokerse yeniden baslatilir. Durdurmak: Pusula-Durdur.cmd'

if ($Tetik -eq 'Acilis') {
    # S8: oturum acilmadan baslama. "Kullanici oturum acmis olsun ya da olmasin" = parola ile kayit
    # (Register-ScheduledTask -User/-Password -> LogonType Password).
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $trigger.Delay = 'PT1M'   # ag ve Tailscale ayaga kalksin
    $kullanici = "$env:USERDOMAIN\$env:USERNAME"
    Write-Host ''
    Write-Host '--------------------------------------------------------------------' -ForegroundColor Cyan
    Write-Host ' Bilgisayar acilinca, kimse oturum acmasa da Pusula baslasin diye'      -ForegroundColor Cyan
    Write-Host ' Windows bu gorev icin parolanizi BIR KEZ istiyor.'                      -ForegroundColor Cyan
    Write-Host ''
    Write-Host " Kullanici adi: $kullanici  (acilan pencerede hazir yazili)"
    Write-Host ' Parola      : Windows oturum PAROLANIZ. Girisi PIN ile yapiyorsaniz'
    Write-Host '               PIN degil, Microsoft hesabinizin parolasi (e-posta ile'
    Write-Host '               girdiginiz hesap) yazilir.'
    Write-Host ' Parola Windows Gorev Zamanlayici''da saklanir; bu betik hicbir dosyaya'
    Write-Host ' yazmaz. Parolanizi degistirirseniz bu kurulumu tekrar calistirin.'
    Write-Host ' Vazgecerseniz: -Tetik Oturum ile kurun (yalniz oturum acilinca baslar).'
    Write-Host '--------------------------------------------------------------------' -ForegroundColor Cyan
    $cred = Get-Credential -UserName $kullanici -Message 'Pusula otomatik baslatma: Windows parolaniz (PIN degil)'
    if (-not $cred) { throw 'Parola girilmedi; gorev kurulmadi.' }
    try {
        Register-ScheduledTask -TaskName $TaskName `
            -Action $action -Trigger $trigger -Settings $settings `
            -User $cred.UserName -Password ($cred.GetNetworkCredential().Password) `
            -RunLevel Limited -Description $aciklama | Out-Null
    } catch {
        Write-Host ''
        Write-Host 'Gorev kurulamadi. En sik neden: parola yanlis (PIN yazilmis olabilir).' -ForegroundColor Red
        Write-Host "Ayrinti: $($_.Exception.Message)" -ForegroundColor DarkGray
        Write-Host 'Tekrar deneyin; olmazsa yalniz oturum acilinca baslayan kurulum:'
        Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Tetik Oturum'
        exit 1
    }
    $tetikMetni = 'Bilgisayar acilinca (1 dk gecikmeli), oturum acilmasa da (MSFT_TaskBootTrigger)'
} else {
    # Eski davranis: oturum acildiginda calisir; parola gerektirmez.
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    Register-ScheduledTask -TaskName $TaskName `
        -Action $action -Trigger $trigger -Settings $settings `
        -Description $aciklama | Out-Null
    $tetikMetni = 'Kullanici oturum actiginda (MSFT_TaskLogonTrigger)'
}

Write-Host ''
Write-Host 'Otomatik baslatma kuruldu.' -ForegroundColor Green
Write-Host "  Gorev adi  : $TaskName"
Write-Host "  Klasor     : $ProjectRoot"
Write-Host "  Tetikleyici: $tetikMetni"
Write-Host '  Panel      : http://localhost:3000'
Write-Host ''
Write-Host 'Simdi gorevle baslatmak icin (Pusula aciksa once Pusula-Durdur):'
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host 'Kaldirmak icin:'
Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove'
Write-Host 'Kontrol:'
Write-Host '  Get-ScheduledTask -TaskName PusulaBot, AntigravityTradeBot -ErrorAction SilentlyContinue'
