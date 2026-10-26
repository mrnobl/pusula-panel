# ---------------------------------------------------------------------------
#  Pusula - otomatik guncelleme gorevi (Windows Gorev Zamanlayici) - 61.3
#
#  Her gun 12:00 (yerel saat):
#    node scripts\guncelle.js
#  GitHub'da yeni surum varsa: panel/arastirma degisikligiyse KENDILIGINDEN kurar ve
#  Pusula'yi yeniden baslatir; bot kodu degistiyse KURMAZ, Telegram'dan haber verir
#  (onay: panel > Ayarlar > Bu bilgisayar > "Guncellemeyi kur"). Acilmazsa eski surume doner.
#  Cikti: data\guncelleme-gorev.log (eklenir); durum: data\guncelleme.json, gunluk: data\guncelleme.log.
#  "Oturum acilmasa da": Windows parolanizi BIR KEZ sorar (PusulaBot gibi); parola Windows'ta
#  saklanir, bu betik onu hicbir yere yazmaz. Parola istemeyen yol: -Oturum.
#  Bilgisayar 12:00'de kapaliysa acildiginda calisir (02:00-05:00 arasi atlanir: botun gunluk
#  karari ve gece veri indirmesi).
#  Proje klasorunu kendisi bulur (sabit yol YOK). Klasor tasininca betigi yeniden calistirin.
#
#  Kurulum (proje klasorunde PowerShell; YONETICI gerekmez):
#    powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1 -Oturum
#  Durum / kaldirma:
#    powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1 -Durum
#    powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1 -Kaldir
#  GELISTIRME bilgisayarina KURULMAZ (data\makine.json arastirmaModu): guncellemeler oradan gonderilir.
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [switch]$Kaldir,
    [switch]$Durum,
    [switch]$Oturum,
    [string]$Saat = '12:00',
    [string]$GorevAdi = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PusulaGuncelle'
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
$Betik = Join-Path $ProjectRoot 'scripts\guncelle.js'
$LogDir = Pusula-VeriDizini $ProjectRoot 'guncelleme-gorev.log'
$Log = Join-Path $LogDir 'guncelleme-gorev.log'

function Goster-Durum {
    $g = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $g) { Write-Host "Gorev kurulu degil: $TaskName"; return }
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    $a = @($g.Actions)[0]
    Write-Host "Gorev: $TaskName  durum: $($g.State)  oturum turu: $($g.Principal.LogonType)"
    Write-Host "Komut: $($a.Execute) $($a.Arguments)"
    Write-Host "Klasor: $($a.WorkingDirectory)"
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
        Write-Host 'Bu bilgisayar GELISTIRME kopyasi (data\makine.json arastirmaModu): guncelleme gorevi burada KURULMAZ.' -ForegroundColor Yellow
        Write-Host 'Gorev sunucuya (botun calistigi bilgisayar) kurulur.'
        exit 1
    }
}
if (-not (Test-Path $Betik)) { throw "Betik bulunamadi: $Betik (once 'git pull' yapin)" }
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'node bulunamadi (PATH). Node.js kurulu olmali.' }
$git = (Get-Command git -ErrorAction SilentlyContinue)
if (-not $git) { throw 'git bulunamadi (PATH). Git for Windows kurulu olmali.' }
$NodeExe = $node.Source
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

if ($Saat -notmatch '^\d{1,2}:\d{2}$') { throw "Saat HH:MM olmali (ornek 12:00), verilen: $Saat" }
$Tetik = [DateTime]::Today.Add([TimeSpan]::Parse($Saat))

# Gorev, Gorev Zamanlayici'nin PATH'iyle calisir: git'in klasorunu komutun basina ekle (git bulunamazsa guncelleme yapilamaz).
$GitDizin = Split-Path -Parent $git.Source
$komut = '/d /c "set "PATH=' + $GitDizin + ';%PATH%" && "' + $NodeExe + '" "' + $Betik + '" >> "' + $Log + '" 2>&1"'
$Action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $komut -WorkingDirectory $ProjectRoot
# -Oturum (Interactive) kipinde cmd penceresi masaustunde gorunur; kapatilirsa is yarida kalir (0xC000013A, 2026-10-18).
# Bu kipte komut data\gorevler\<gorev>.cmd dosyasina yazilir ve scripts\gizli-calistir.ps1 (-File) ile gizli calistirilir;
# cikis kodu korunur. -EncodedCommand KULLANILMAZ: Kaspersky engelliyor (0x80070005, sunucu 2026-10-18).
if ($Oturum) {
    $GorevDizin = Join-Path (Pusula-VeriDizini $ProjectRoot 'gorevler') 'gorevler'
    if (-not (Test-Path $GorevDizin)) { New-Item -ItemType Directory -Force -Path $GorevDizin | Out-Null }
    $GorevCmd = Join-Path $GorevDizin "$TaskName.cmd"
    $ic = $komut.Substring(7, $komut.Length - 8)   # '/d /c "' ... '"' kabugunu cikar
    $oem = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
    [IO.File]::WriteAllText($GorevCmd, "@echo off`r`n$ic`r`nexit /b %errorlevel%`r`n", $oem)
    $Baslatici = Join-Path $PSScriptRoot 'gizli-calistir.ps1'
    $Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Baslatici + '" -Cmd "' + $GorevCmd + '"') -WorkingDirectory $ProjectRoot
}
$Trigger = New-ScheduledTaskTrigger -Daily -At $Tetik
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$Aciklama = "Pusula otomatik guncelleme: panel degisiklikleri kendiliginden, bot kodu onayla. Proje: $ProjectRoot. Her gun $Saat. scripts\install-guncelleme-gorev.ps1 ile kuruldu."

Write-Host ''
Write-Host 'Ne yapacak:' -ForegroundColor Cyan
Write-Host "  - Her gun $Saat'de GitHub'da yeni Pusula surumu var mi bakar."
Write-Host '  - Panel/arastirma degisikligi: kurar, Pusula ~30 sn yeniden baslar, Telegram haber verir.'
Write-Host '  - Bot kodu degisikligi: KURMAZ; Telegram haber verir, siz panelden onaylarsiniz.'
Write-Host '  - Acilmazsa eski surume doner. Ayarlariniz (veri klasorundeki ayarlar.json) guncellemede korunur.'
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
        $cred = Get-Credential -UserName $kullanici -Message 'Pusula guncelleme gorevi: Windows HESAP parolaniz (PIN degil). Oturum acilmasa da calismasi icin.'
        if (-not $cred) { throw 'Parola girilmedi; kurulum iptal. Parolasiz kurulum: -Oturum' }
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $Aciklama `
            -User $cred.UserName -Password ($cred.GetNetworkCredential().Password) -RunLevel Limited -Force | Out-Null
        Write-Host "Kuruldu (oturum acilmasa da): $TaskName" -ForegroundColor Green
    }
} catch {
    Write-Host "KAYIT BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Parola sorunu ise: powershell -ExecutionPolicy Bypass -File scripts\install-guncelleme-gorev.ps1 -Oturum' -ForegroundColor Yellow
    exit 1
}
Write-Host ''
Write-Host 'Hemen denemek icin (yalniz kontrol eder; yeni surum yoksa "guncel" yazar):'
Write-Host '  node scripts\guncelle.js --kuru'
Write-Host ''
Goster-Durum
