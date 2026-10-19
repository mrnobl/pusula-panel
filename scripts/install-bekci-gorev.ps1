# ---------------------------------------------------------------------------
#  Pusula - BEKCI gorevi (Windows Gorev Zamanlayici) - 62.1 (DENETIM-CANLI-ALTYAPI O2/Y9)
#
#  Her 10 dakikada bir:  scripts\pusula-sunucu.ps1 -Islem Baslat -Yinele -PanelAcma
#  - Pusula calisiyorsa ya da denetleyicisi yasiyorsa (yeniden baslatma beklemesi) HICBIR SEY yapmaz.
#  - "Pusula'yi durdur" ile BILEREK durdurulduysa (data\pusula-durduruldu.txt) baslatmaz; Pusula kisayolu isareti siler.
#  - Aksi halde (denetleyici kendiliginden kapandi, gorev baslamadi...) Pusula'yi baslatir.
#  Neden: PusulaBot gorevinin "basarisiz olursa yeniden dene" ayari programin kendisi kapandiginda calismaz; denetleyici
#  kapanirsa bot bir sonraki acilisa kadar yoktu.
#  Cikti: data\bekci-gorev.log (eklenir).
#
#  Kurulum / durum / kaldirma (proje klasorunde PowerShell; YONETICI gerekmez):
#    powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1 -Oturum
#    powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1 -Durum
#    powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1 -Kaldir
#  GELISTIRME bilgisayarina KURULMAZ (data\makine.json arastirmaModu).
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [switch]$Kaldir,
    [switch]$Durum,
    [switch]$Oturum,
    [int]$AralikDk = 10,
    [string]$GorevAdi = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PusulaBekci'
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
$Betik = Join-Path $ProjectRoot 'scripts\pusula-sunucu.ps1'
$LogDir = Pusula-VeriDizini $ProjectRoot 'bekci-gorev.log'
$Log = Join-Path $LogDir 'bekci-gorev.log'

function Goster-Durum {
    $g = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $g) { Write-Host "Gorev kurulu degil: $TaskName"; return }
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Gorev: $TaskName  durum: $($g.State)  oturum turu: $($g.Principal.LogonType)"
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
        Write-Host 'Bu bilgisayar GELISTIRME kopyasi (data\makine.json arastirmaModu): bekci gorevi burada KURULMAZ.' -ForegroundColor Yellow
        exit 1
    }
}
if (-not (Test-Path $Betik)) { throw "Betik bulunamadi: $Betik" }
if ($AralikDk -lt 5 -or $AralikDk -gt 60) { throw 'AralikDk 5-60 arasi olmali' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$komut = '/d /c ""' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Betik + '" -Islem Baslat -Yinele -PanelAcma >> "' + $Log + '" 2>&1"'
$Action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $komut -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(5)) -RepetitionInterval (New-TimeSpan -Minutes $AralikDk) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$Aciklama = "Pusula bekci: $AralikDk dakikada bir Pusula calisiyor mu bakar; bilerek durdurulmadiysa baslatir. Proje: $ProjectRoot. scripts\install-bekci-gorev.ps1 ile kuruldu."

Write-Host ''
Write-Host 'Ne yapacak:' -ForegroundColor Cyan
Write-Host "  - $AralikDk dakikada bir Pusula calisiyor mu bakar; calisiyorsa hicbir sey yapmaz."
Write-Host '  - Pusula kendiliginden kapandiysa yeniden baslatir.'
Write-Host '  - "Pusula''yi durdur" ile bilerek durdurduysaniz BASLATMAZ (Pusula kisayolu ile acinca normale doner).'
Write-Host ''
Write-Host 'UYARI: "Oturum acilmasa da" kurulumu Windows HESAP PAROLASI ister (PIN degil). Bilmiyorsaniz: -Oturum ile kurun.' -ForegroundColor Yellow
Write-Host ''

$kullanici = "$env:USERDOMAIN\$env:USERNAME"
try {
    if ($Oturum) {
        $Principal = New-ScheduledTaskPrincipal -UserId $kullanici -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description $Aciklama -Force | Out-Null
        Write-Host "Kuruldu (yalniz oturum acikken): $TaskName" -ForegroundColor Green
    } else {
        $cred = Get-Credential -UserName $kullanici -Message 'Pusula bekci gorevi: Windows HESAP parolaniz (PIN degil). Oturum acilmasa da calismasi icin.'
        if (-not $cred) { throw 'Parola girilmedi; kurulum iptal. Parolasiz kurulum: -Oturum' }
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $Aciklama `
            -User $cred.UserName -Password ($cred.GetNetworkCredential().Password) -RunLevel Limited -Force | Out-Null
        Write-Host "Kuruldu (oturum acilmasa da): $TaskName" -ForegroundColor Green
    }
} catch {
    Write-Host "KAYIT BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Parola sorunu ise: powershell -ExecutionPolicy Bypass -File scripts\install-bekci-gorev.ps1 -Oturum' -ForegroundColor Yellow
    exit 1
}
Write-Host ''
Goster-Durum
