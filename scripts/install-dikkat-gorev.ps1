# ---------------------------------------------------------------------------
#  Pusula - dikkat listesi F1 gunluk ham arsiv gorevi (Windows Gorev Zamanlayici)
#
#  Her gece 00:30 UTC'ye denk gelen YEREL saatte (Turkiye UTC+3: 03:30) RESMI
#  kayit kosusu:
#    node scripts\tarama-gunluk.js --neden zamanlanmis --resmi
#  Cikti: data\tarama\gunluk-gorev.log (eklenir). Kayit: data\tarama\ (evren\, arsiv\).
#  "Uyandir" (WakeToRun): bilgisayar uykudaysa gorev icin uyanir.
#  "Oturum acilmasa da" (S8 karari): Windows parolanizi BIR KEZ sorar; parola
#  Windows'ta saklanir, bu betik onu hicbir yere yazmaz. Parola istemeyen yol:
#  -Oturum (yalniz siz oturum acikken calisir).
#  Proje klasorunu kendisi bulur (sabit yol YOK): C:\Pusula ya da baska bir yer.
#  Klasor tasininca betigi yeni yerden bir kez daha calistirin (gorev guncellenir).
#
#  Kurulum (proje klasorunde PowerShell; YONETICI gerekmez, -Oturum'suz kurulumda
#  parola sorulur):
#    powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1 -Oturum
#  Durum / kaldirma:
#    powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1 -Durum
#    powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1 -Kaldir
#
#  Not: gunluk tetik YEREL saattir; yaz saati uygulayan bir saat diliminde
#  00:30 UTC karsiligi yilda iki kez 1 saat kayar (Turkiye'de yaz saati yok).
#  Bu gelistirme makinesinde KURULMAZ (kullanici karari 2026-10-09: resmi arsiv
#  evdeki PC'de). Deneme kosusu: npm run tarama:gunluk -- --neden elle
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [switch]$Kaldir,
    [switch]$Durum,
    [switch]$Oturum,
    [string]$GorevAdi = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PusulaDikkatArsiv'
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
$Betik = Join-Path $ProjectRoot 'scripts\tarama-gunluk.js'
$LogDir = Join-Path (Pusula-VeriDizini $ProjectRoot 'tarama') 'tarama'
$Log = Join-Path $LogDir 'gunluk-gorev.log'

function Goster-Durum {
    $g = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $g) { Write-Host "Gorev kurulu degil: $TaskName"; return }
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    $a = @($g.Actions)[0]
    Write-Host "Gorev: $TaskName  durum: $($g.State)  oturum turu: $($g.Principal.LogonType)"
    Write-Host "Komut: $($a.Execute) $($a.Arguments)"
    Write-Host "Klasor: $($a.WorkingDirectory)"
    Write-Host "Uyandir: $($g.Settings.WakeToRun)  Son calisma: $($i.LastRunTime)  sonuc: $($i.LastTaskResult)  sonraki: $($i.NextRunTime)"
}

if ($Durum) { Goster-Durum; exit 0 }

if ($Kaldir) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Gorev kaldirildi: $TaskName" -ForegroundColor Yellow
    } else { Write-Host "Gorev zaten yok: $TaskName" }
    exit 0
}

if (-not (Test-Path $Betik)) { throw "Betik bulunamadi: $Betik (bu dosya proje\scripts klasorunde olmali)" }
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'node bulunamadi (PATH). Node.js kurulu olmali.' }
$NodeExe = $node.Source
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

# 00:30 UTC -> bu makinenin yerel saati (bugunun tarihiyle; DST notu yukarida)
$utc = [DateTime]::SpecifyKind([DateTime]::UtcNow.Date.AddMinutes(30), [DateTimeKind]::Utc)
$yerel = $utc.ToLocalTime()
$Saat = [DateTime]::Today.Add($yerel.TimeOfDay)
Write-Host ("00:30 UTC = yerel {0:HH:mm} ({1})" -f $yerel, [TimeZoneInfo]::Local.Id)

# cmd /c ile cikti log dosyasina eklenir; yollar tirnakli (bosluk / Turkce karakter).
$komut = '/d /c ""' + $NodeExe + '" "' + $Betik + '" --neden zamanlanmis --resmi >> "' + $Log + '" 2>&1"'
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
$Trigger = New-ScheduledTaskTrigger -Daily -At $Saat
$Settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 5) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30)
$Aciklama = "Pusula dikkat listesi F1: gunluk ham arsiv (RESMI). Proje: $ProjectRoot. 00:30 UTC. scripts\install-dikkat-gorev.ps1 ile kuruldu."

$eski = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($eski) {
    # Eski gorev ONCEDEN SILINMEZ: Register-ScheduledTask -Force ayni adi yerinde degistirir; kayit basarisiz olursa eski gorev aynen kalir.
    Write-Host "Mevcut gorev bulundu (eski klasor: $(@($eski.Actions)[0].WorkingDirectory)); yeni kayit basarili olursa yerine gecer." -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'UYARI (okuyun):' -ForegroundColor Yellow
Write-Host '  - "Oturum acilmasa da" kurulumu Windows HESAP PAROLASI ister (PIN / Windows Hello degil). Microsoft hesabiyla' -ForegroundColor Yellow
Write-Host '    giriliyorsa o hesabin parolasi. Hic parolaniz yoksa ya da bilmiyorsaniz: -Oturum ile kurun.' -ForegroundColor Yellow
Write-Host '  - Bu tur gorev icin hesabin "Toplu is olarak oturum ac" (SeBatchLogonRight) hakki gerekir. Windows Home surumlerinde cogu' -ForegroundColor Yellow
Write-Host '    zaman vardir; kayit "erisim reddedildi / oturum acma hatasi" verirse -Oturum ile kurun.' -ForegroundColor Yellow
Write-Host '  - Uyandirma icin Denetim Masasi > Guc Secenekleri > Gelismis > Uyku > "Uyandirma zamanlayicilarina izin ver" = Etkin' -ForegroundColor Yellow
Write-Host '    olmali (dizustunde pilde de). Kapali ise bilgisayar uykudayken gorev calismaz; "bosluk" gunu yazilir.' -ForegroundColor Yellow
Write-Host ''

$kullanici = "$env:USERDOMAIN\$env:USERNAME"
try {
    if ($Oturum) {
        $Principal = New-ScheduledTaskPrincipal -UserId $kullanici -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description $Aciklama -Force | Out-Null
        Write-Host "Kuruldu (yalniz oturum acikken): $TaskName" -ForegroundColor Green
    } else {
        $cred = Get-Credential -UserName $kullanici -Message 'Pusula gunluk arsiv gorevi: Windows HESAP parolaniz (PIN degil). Oturum acilmasa da calismasi icin.'
        if (-not $cred) { throw 'Parola girilmedi; kurulum iptal. Parolasiz kurulum: -Oturum' }
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description $Aciklama `
            -User $cred.UserName -Password ($cred.GetNetworkCredential().Password) -RunLevel Limited -Force | Out-Null
        Write-Host "Kuruldu (oturum acilmasa da, uyandir): $TaskName" -ForegroundColor Green
    }
} catch {
    Write-Host "KAYIT BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
    if ($eski) { Write-Host 'Eski gorev DEGISMEDI (aynen duruyor).' -ForegroundColor Yellow }
    Write-Host 'Parola / "toplu is olarak oturum ac" hakki sorunu ise: powershell -ExecutionPolicy Bypass -File scripts\install-dikkat-gorev.ps1 -Oturum' -ForegroundColor Yellow
    exit 1
}
Write-Host "Komut: cmd.exe $komut"
Write-Host "Ilk resmi gun manifestte 'baslangic' olarak isaretlenir. Elle deneme ya da --resmi kosusu YAPMAYIN; ilk resmi kaydi gorev gece atar."
Write-Host ''
Goster-Durum
