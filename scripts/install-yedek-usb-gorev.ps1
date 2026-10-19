# ---------------------------------------------------------------------------
#  Pusula - haftalik USB yedek GOREVI (Windows Gorev Zamanlayici) - 2026-10-18
#
#  Her Pazar 06:00 (gunluk yedekten sonra):
#    powershell -WindowStyle Hidden -File scripts\yedek-usb.ps1 [-Surucu F]
#  Gunluk yedegin en son kopyasini USB'ye alir (sirlar haric); USB takili degilse o hafta atlanir.
#  Cikti: data\yedek-usb.log. Gizli pencere -File ile (Kaspersky -EncodedCommand'i engelliyor).
#  "Oturum acilmasa da": Windows parolanizi BIR KEZ sorar; parola istemeyen yol: -Oturum.
#
#  Kurulum / durum / kaldirma (proje klasorunde PowerShell; YONETICI gerekmez):
#    powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Oturum
#    powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Oturum -Surucu G
#    powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Durum
#    powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Kaldir
#  GELISTIRME bilgisayarina KURULMAZ (data\makine.json arastirmaModu).
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [switch]$Kaldir,
    [switch]$Durum,
    [switch]$Oturum,
    [string]$Surucu = 'F',
    [string]$Saat = '06:00',
    [string]$GorevAdi = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PusulaYedekUSB'
if ($GorevAdi) { $TaskName = $GorevAdi }   # 68.3: yalniz kur.js deneme kosusu (sahte gorev adi); varsayilan ad degismez
# 68.0 (PLAN-TASIMA F2): veri yolu lib/yollar.js'ten (scripts\veri-yolu.js); node yoksa / hata verirse eski yer <proje>\data.
function Pusula-VeriDizini([string]$ProjeKok, [string]$Parca) {
    $eski = Join-Path $ProjeKok 'data'
    $onceki = $null
    try { $onceki = [Console]::OutputEncoding; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
    try {
        $y = & node (Join-Path $ProjeKok 'scripts\veri-yolu.js') '--dizin' $Parca 2>$null
        if ($LASTEXITCODE -eq 0 -and $y) {
            $y = ([string]($y | Select-Object -First 1)).Trim()
            if ($y) {
                if (-not [System.IO.Path]::IsPathRooted($y)) { $y = Join-Path $ProjeKok $y }
                return $y
            }
        }
    } catch { } finally { if ($onceki) { try { [Console]::OutputEncoding = $onceki } catch { } } }
    return $eski
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Betik = Join-Path $ProjectRoot 'scripts\yedek-usb.ps1'

function Goster-Durum {
    $g = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $g) { Write-Host "Gorev kurulu degil: $TaskName"; return }
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    $a = @($g.Actions)[0]
    Write-Host "Gorev: $TaskName  durum: $($g.State)  oturum turu: $($g.Principal.LogonType)"
    Write-Host "Komut: $($a.Execute) $($a.Arguments)"
    Write-Host "Son calisma: $($i.LastRunTime)  sonuc: $($i.LastTaskResult)  sonraki: $($i.NextRunTime)"
}

if ($Durum) { Goster-Durum; exit 0 }

if ($Kaldir) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Gorev kaldirildi: $TaskName" -ForegroundColor Yellow
    } else { Write-Host "Gorev zaten yok: $TaskName" }
    exit 0
}

$makine = Join-Path (Pusula-VeriDizini $ProjectRoot 'makine.json') 'makine.json'
if (Test-Path $makine) {
    try { $m = [System.IO.File]::ReadAllText($makine) | ConvertFrom-Json } catch { $m = $null }
    if ($m -and $m.arastirmaModu) {
        Write-Host 'Bu bilgisayar GELISTIRME kopyasi (data\makine.json arastirmaModu): USB yedek gorevi burada KURULMAZ.' -ForegroundColor Yellow
        exit 1
    }
}
if (-not (Test-Path $Betik)) { throw "Betik bulunamadi: $Betik (once guncellemeyi kurun)" }
if ($Surucu -notmatch '^[A-Za-z]$') { throw "Surucu tek harf olmali (ornek F), verilen: $Surucu" }
if ($Saat -notmatch '^\d{1,2}:\d{2}$') { throw "Saat HH:MM olmali (ornek 06:00), verilen: $Saat" }
$Tetik = [DateTime]::Today.Add([TimeSpan]::Parse($Saat))

$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Betik + '" -Surucu ' + $Surucu) -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $Tetik
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$Aciklama = "Pusula haftalik USB yedek: gunluk yedegin son kopyasi $Surucu`:\PusulaYedek (sirlar haric). Proje: $ProjectRoot. Pazar $Saat. scripts\install-yedek-usb-gorev.ps1 ile kuruldu."

Write-Host ''
Write-Host 'Ne yapacak:' -ForegroundColor Cyan
Write-Host "  - Her Pazar $Saat'de gunluk yedegin en son kopyasini $Surucu`:\PusulaYedek\<tarih> klasorune alir."
Write-Host '  - API anahtarlari, panel/telefon jetonu ve acil PIN ozeti USB''ye KOPYALANMAZ.'
Write-Host '  - USB takili degilse o hafta atlanir (data\yedek-usb.log).'
Write-Host ''

$kullanici = "$env:USERDOMAIN\$env:USERNAME"
try {
    if ($Oturum) {
        $Principal = New-ScheduledTaskPrincipal -UserId $kullanici -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description $Aciklama -Force | Out-Null
        Write-Host "Kuruldu (yalniz oturum acikken): $TaskName" -ForegroundColor Green
    } else {
        $cred = Get-Credential -UserName $kullanici -Message 'Pusula USB yedek gorevi: Windows HESAP parolaniz (PIN degil). Oturum acilmasa da calismasi icin.'
        if (-not $cred) { throw 'Parola girilmedi; kurulum iptal. Parolasiz kurulum: -Oturum' }
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $Aciklama `
            -User $cred.UserName -Password ($cred.GetNetworkCredential().Password) -RunLevel Limited -Force | Out-Null
        Write-Host "Kuruldu (oturum acilmasa da): $TaskName" -ForegroundColor Green
    }
} catch {
    Write-Host "KAYIT BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Parola sorunu ise: powershell -ExecutionPolicy Bypass -File scripts\install-yedek-usb-gorev.ps1 -Oturum' -ForegroundColor Yellow
    exit 1
}
Write-Host ''
Write-Host 'Hemen denemek icin:'
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\yedek-usb.ps1 -Surucu $Surucu"
Write-Host ''
Goster-Durum
