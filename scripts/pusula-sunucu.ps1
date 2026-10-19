# ---------------------------------------------------------------------------
#  Pusula - sunucuyu baslat / durdur (ORTAK CEKIRDEK, 2026-10-09)
#
#  Pusula-Baslat.cmd, Pusula-Durdur.cmd ve Gorev Zamanlayici gorevi
#  (scripts\install-autostart.ps1) AYNI bu betigi kullanir; boylece iki
#  bilgisayarda (C:\Pusula) baslatma ve durdurma birebir aynidir.
#
#    -Islem Baslat            : saglik (GET /api/health) cevap veriyorsa yalniz paneli acar;
#                               vermiyorsa denetleyiciyi (scripts\start-bot.cmd = npm run supervise)
#                               gizli pencerede baslatir, saglik cevabini bekler, paneli acar.
#        -PanelAcma           : paneli acma (gorev ve oz test icin)
#        -Bekle               : (gorev kipi) denetleyici kapanana kadar bekle; Durdur ile
#                               kapatildiysa 0, kendiliginden kapandiysa 1 ile cik
#    -Islem Durdur            : YALNIZ data\pusula.pid icindeki PID'leri kapatir (once nazik
#                               Ctrl+C, olmazsa taskkill /PID). Calisan bot / acik pozisyon
#                               varsa uyarir ve onay ister.
#        -Evet                : onay sormadan durdur (oz test icin)
#    -Islem Durum             : saglik ve PID kaydini yazar
#
#  KURAL: toplu ya da filtreli surec kapatma (taskkill /IM, /FI, Stop-Process -Name)
#  YOKTUR; yalniz bu betigin kaydettigi PID'ler kapatilir (scripts/baslat-selftest.js denetler).
#
#  Port: PORT ortam degiskeni (yoksa 3000). Bu bilgisayara ozel ayar:
#  data\makine.json  {"arastirmaModu": true}  -> sunucu ARASTIRMA_MODU=1 ile acilir
#  (gelistirme bilgisayari; evdeki bilgisayarda bu dosya OLMAMALI).
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [ValidateSet('Baslat', 'Durdur', 'Durum', 'CtrlC')]
    [string]$Islem = 'Baslat',
    [switch]$PanelAcma,
    [switch]$Bekle,
    [switch]$Evet,
    [switch]$Yinele,
    [int]$HedefPid = 0,
    [int]$BeklemeSn = 120
)

$ErrorActionPreference = 'Stop'

function Konsol-Tanimla {
    if (-not ('PusulaYerel.Konsol' -as [type])) {
        Add-Type -Namespace PusulaYerel -Name Konsol -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint dwProcessId);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(System.IntPtr handler, bool add);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);
'@
    }
}

# --- Yardimci: baska bir surecin konsoluna Ctrl+C gonder (ayri, gizli surecte calisir) ---
if ($Islem -eq 'CtrlC') {
    try {
        Konsol-Tanimla
        [PusulaYerel.Konsol]::FreeConsole() | Out-Null
        if (-not [PusulaYerel.Konsol]::AttachConsole([uint32]$HedefPid)) { exit 2 }
        [PusulaYerel.Konsol]::SetConsoleCtrlHandler([IntPtr]::Zero, $true) | Out-Null
        $gonderildi = [PusulaYerel.Konsol]::GenerateConsoleCtrlEvent(0, 0)
        Start-Sleep -Milliseconds 300
        [PusulaYerel.Konsol]::FreeConsole() | Out-Null
        if ($gonderildi) { exit 0 } else { exit 3 }
    } catch { exit 4 }
}

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

$Kok = Split-Path -Parent $PSScriptRoot
$Denetleyici = Join-Path $Kok 'scripts\start-bot.cmd'
$VeriDizin = Pusula-VeriDizini $Kok 'pusula.pid'   # makineye ozel dosyalar (eski duzende <proje>\data)
$PidDosya = Join-Path $VeriDizin 'pusula.pid'
# 62.1 (DENETIM-CANLI-ALTYAPI O2/Y9): Durdur bu isareti yazar; bekci gorevi (-Yinele, PusulaBekci 10 dk) isaret varken BASLATMAZ.
# Elle / gorevle normal Baslat isareti siler.
$DurdurIsaret = Join-Path $VeriDizin 'pusula-durduruldu.txt'
$KonsolGunluk = Join-Path $VeriDizin 'sunucu-konsol.log'
$Port = 3000
if ($env:PORT -and ($env:PORT -match '^\d+$')) { $Port = [int]$env:PORT }
$PanelAdres = "http://localhost:$Port/"
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Yaz([string]$m, [string]$renk = 'Gray') { Write-Host $m -ForegroundColor $renk }
function Hata([string]$m) { Write-Host ''; Write-Host $m -ForegroundColor Red }

# --- HTTP: bir JSON ucunu oku. Cevap yoksa $null; 503 gibi hata kodlari da CEVAPTIR. ---
function Json-Oku([string]$yol, [int]$sureMs = 3000) {
    $istek = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port$yol")
    $istek.Timeout = $sureMs
    $istek.Proxy = $null
    $cevap = $null
    try { $cevap = $istek.GetResponse() } catch {
        $ex = $_.Exception
        while ($ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }
        if ($ex -and $ex.Response) { $cevap = $ex.Response } else { return $null }
    }
    try {
        $okuyucu = New-Object System.IO.StreamReader($cevap.GetResponseStream(), [System.Text.Encoding]::UTF8)
        $metin = $okuyucu.ReadToEnd()
        $okuyucu.Close()
    } finally { $cevap.Close() }
    try { return ($metin | ConvertFrom-Json) } catch { return [pscustomobject]@{ status = 'bilinmiyor'; ham = $metin } }
}
function Saglik { return (Json-Oku '/api/health' 3000) }

# --- PID kaydi ---
function Pid-Oku {
    if (-not (Test-Path $PidDosya)) { return $null }
    try { return ([System.IO.File]::ReadAllText($PidDosya, $Utf8) | ConvertFrom-Json) } catch { return $null }
}
function Pid-Yaz($denetleyiciPid, $sunucuPid) {
    if (-not (Test-Path $VeriDizin)) { New-Item -ItemType Directory -Path $VeriDizin | Out-Null }
    $kayit = [ordered]@{
        denetleyici = [int]$denetleyiciPid
        sunucu      = $(if ($sunucuPid) { [int]$sunucuPid } else { $null })
        port        = $Port
        klasor      = $Kok
        baslangic   = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
    }
    [System.IO.File]::WriteAllText($PidDosya, ($kayit | ConvertTo-Json), $Utf8)
}
function Pid-Sil { if (Test-Path $PidDosya) { Remove-Item $PidDosya -Force } }

function Surec([int]$p) {
    if (-not $p) { return $null }
    return (Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue)
}
# Kayittaki denetleyici gercekten BIZIM denetleyicimiz mi (PID baska bir surece gecmis olabilir)?
function Denetleyici-Dogrula([int]$p) {
    $s = Surec $p
    if (-not $s) { return $null }
    if ($s.Name -ne 'cmd.exe') { return $null }
    if ($s.CommandLine -and ($s.CommandLine -notlike '*start-bot.cmd*')) { return $null }
    return $s
}
# Denetleyicinin node cocuklari (yalniz bu PID'in dogrudan cocuklari)
function Sunucu-Cocuklari([int]$denetleyiciPid) {
    if (-not $denetleyiciPid) { return @() }
    return @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$denetleyiciPid" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -eq 'node.exe' })
}
function Sunucu-Dogrula([int]$p, [int]$denetleyiciPid) {
    $s = Surec $p
    if (-not $s -or $s.Name -ne 'node.exe') { return $null }
    if ($denetleyiciPid -and $s.ParentProcessId -eq $denetleyiciPid) { return $s }
    if ($s.CommandLine -and ($s.CommandLine -like '*server.js*')) { return $s }
    return $null
}

function Paneli-Ac {
    $edge = $null
    try {
        $ap = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction SilentlyContinue
        if ($ap -and $ap.'(default)' -and (Test-Path $ap.'(default)')) { $edge = $ap.'(default)' }
    } catch { }
    if (-not $edge) {
        $adaylar = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
        )
        foreach ($a in $adaylar) { if ($a -and (Test-Path $a)) { $edge = $a; break } }
    }
    if ($edge) {
        Start-Process -FilePath $edge -ArgumentList "--app=$PanelAdres"
        Yaz "Panel kendi penceresinde acildi: $PanelAdres" 'Green'
    } else {
        Start-Process $PanelAdres
        Yaz "Panel varsayilan tarayicida acildi: $PanelAdres" 'Green'
    }
}

function Gunluk-Sonu {
    if (Test-Path $KonsolGunluk) {
        Yaz ''
        Yaz '--- Sunucunun son satirlari (data\sunucu-konsol.log) ---' 'DarkGray'
        Get-Content $KonsolGunluk -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Yaz $_ 'DarkGray' }
    }
}

function Makine-Ayari {
    $d = Join-Path $VeriDizin 'makine.json'
    if (-not (Test-Path $d)) { return $null }
    try { return ([System.IO.File]::ReadAllText($d) | ConvertFrom-Json) } catch { return $null }
}

# Gorev kipi: denetleyici kapanana kadar bekle. Durdur once PID kaydini siler, sonra kapatir.
function Denetleyiciyi-Bekle([int]$p) {
    try { Wait-Process -Id $p -ErrorAction SilentlyContinue } catch { }
    if (Test-Path $PidDosya) {
        $k = Pid-Oku
        if ($k -and [int]$k.denetleyici -eq $p) { Pid-Sil; exit 1 }  # kendiliginden kapandi -> gorev yeniden denesin
    }
    exit 0
}

# ===========================================================================
#  BASLAT
# ===========================================================================
if ($Islem -eq 'Baslat' -and $Yinele) {
    # Bekci: kullanici bilerek durdurduysa dokunma; calisiyorsa ya da denetleyici yasiyorsa (yeniden baslatma beklemesi) cik.
    if (Test-Path $DurdurIsaret) { exit 0 }
    if (Saglik) { exit 0 }
    $kb = Pid-Oku
    if ($kb -and (Denetleyici-Dogrula ([int]$kb.denetleyici))) { exit 0 }
    Yaz "[$(Get-Date -Format s)] Bekci: Pusula calismiyor ve bilerek durdurulmamis - baslatiliyor" 'Yellow'
    $PanelAcma = $true
}

if ($Islem -eq 'Baslat') {
    if (-not $Yinele -and (Test-Path $DurdurIsaret)) { Remove-Item $DurdurIsaret -Force -ErrorAction SilentlyContinue }
    Yaz "Pusula - klasor: $Kok"
    $s = Saglik
    if ($s) {
        Yaz "Pusula zaten calisiyor (port $Port, surum $($s.appVersion))." 'Green'
        if (-not $PanelAcma) { Paneli-Ac }
        if ($Bekle) {
            $k = Pid-Oku
            if ($k -and (Denetleyici-Dogrula ([int]$k.denetleyici))) { Denetleyiciyi-Bekle ([int]$k.denetleyici) }
            Yaz 'Calisan sunucu bu betikle baslatilmamis (PID kaydi yok); gorev bekleme yapmadan bitiyor.' 'Yellow'
        }
        exit 0
    }

    # On kosullar: Node.js, npm, paketler
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Hata 'Node.js bulunamadi.'
        Yaz 'Ne yapmali: https://nodejs.org adresinden "LTS" surumunu indirip kurun,'
        Yaz 'bilgisayari yeniden baslatin (ya da oturumu kapatip acin), sonra Pusula''ya tekrar tiklayin.'
        exit 1
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Hata 'npm bulunamadi (Node.js ile birlikte gelir).'
        Yaz 'Ne yapmali: Node.js''i https://nodejs.org adresinden yeniden kurun (LTS), sonra tekrar deneyin.'
        exit 1
    }
    if (-not (Test-Path (Join-Path $Kok 'node_modules\express\package.json'))) {
        Hata 'Paketler kurulu degil (node_modules klasoru eksik).'
        Yaz 'Ne yapmali: PowerShell acin ve sunlari yazin:'
        Yaz "    cd `"$Kok`""
        Yaz '    npm install'
        Yaz 'Bitince Pusula''ya tekrar tiklayin.'
        exit 1
    }
    if (-not (Test-Path $Denetleyici)) { Hata "Denetleyici bulunamadi: $Denetleyici"; exit 1 }

    # Kayitta hala yasayan bir denetleyici var ama saglik cevap vermiyorsa: acilisin ortasindadir.
    $eski = Pid-Oku
    $calisan = $null
    if ($eski) { $calisan = Denetleyici-Dogrula ([int]$eski.denetleyici) }
    if ($calisan) {
        Yaz "Onceki baslatma hala surecte (denetleyici PID $($calisan.ProcessId)); acilmasi bekleniyor..." 'Yellow'
        $sup = Get-Process -Id $calisan.ProcessId
    } else {
        if ($eski) { Pid-Sil }
        $ayar = Makine-Ayari
        if ($ayar -and $ayar.arastirmaModu) {
            $env:ARASTIRMA_MODU = '1'
            Yaz 'Bu bilgisayar: ARASTIRMA MODU (data\makine.json) - botlar ve Telegram kapali.' 'Cyan'
        }
        if (-not (Test-Path $VeriDizin)) { New-Item -ItemType Directory -Path $VeriDizin | Out-Null }
        # Konsol gunlugu 5 MB'i gecerse bir eskisini sakla
        if ((Test-Path $KonsolGunluk) -and ((Get-Item $KonsolGunluk).Length -gt 5MB)) {
            Move-Item $KonsolGunluk "$KonsolGunluk.1" -Force
        }
        $env:PUSULA_KONSOL_GUNLUGU = $KonsolGunluk
        # Ctrl+C'yi yok sayma ozelligi cocuk sureclere miras gecer (ust surec ozel bir yoldan
        # baslatildiysa). Durdur'un nazik Ctrl+C'si calissin diye denetleyiciden once normale cevir.
        try { Konsol-Tanimla; [PusulaYerel.Konsol]::SetConsoleCtrlHandler([IntPtr]::Zero, $false) | Out-Null } catch { }
        Yaz "Sunucu baslatiliyor (port $Port)..."
        $sup = Start-Process -FilePath "$env:ComSpec" -ArgumentList '/c', "`"$Denetleyici`"" `
                             -WorkingDirectory $Kok -WindowStyle Hidden -PassThru
        Pid-Yaz $sup.Id $null
    }

    # Saglik cevabini bekle
    $bitis = (Get-Date).AddSeconds($BeklemeSn)
    $s = $null
    while ((Get-Date) -lt $bitis) {
        Start-Sleep -Milliseconds 1000
        $s = Saglik
        if ($s) { break }
        if ($sup.HasExited) { break }
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    if (-not $s) {
        if ($sup.HasExited) {
            Pid-Sil
            Hata 'Sunucu acilir acilmaz kapandi.'
        } else {
            Hata "Pusula $BeklemeSn saniyede cevap vermedi (hala aciliyor olabilir)."
            Yaz 'Bir dakika sonra Pusula''ya tekrar tiklayin. Yine olmazsa bu pencerenin ekran goruntusunu gelistirme sohbetine gonderin.'
        }
        Gunluk-Sonu
        exit 1
    }

    $cocuk = Sunucu-Cocuklari $sup.Id | Select-Object -First 1
    Pid-Yaz $sup.Id $(if ($cocuk) { $cocuk.ProcessId } else { $null })
    $mod = ''
    if ($s.arastirmaModu) { $mod = ', ARASTIRMA MODU' }
    Yaz "Pusula calisiyor (surum $($s.appVersion)$mod). Denetleyici PID $($sup.Id), sunucu PID $(if ($cocuk) { $cocuk.ProcessId } else { '?' })." 'Green'
    if (-not $PanelAcma) { Paneli-Ac }
    if ($Bekle) { Denetleyiciyi-Bekle $sup.Id }
    exit 0
}

# ===========================================================================
#  DURUM
# ===========================================================================
if ($Islem -eq 'Durum') {
    $s = Saglik
    if ($s) { Yaz "Saglik: $($s.status), surum $($s.appVersion), port $Port" 'Green' } else { Yaz "Saglik: cevap yok (port $Port)" 'Yellow' }
    $k = Pid-Oku
    if ($k) { Yaz "PID kaydi: denetleyici $($k.denetleyici), sunucu $($k.sunucu), baslangic $($k.baslangic)" } else { Yaz 'PID kaydi yok (data\pusula.pid).' }
    exit 0
}

# ===========================================================================
#  DURDUR
# ===========================================================================
if ($Islem -eq 'Durdur') {
    $k = Pid-Oku
    $s = Saglik
    if (-not $k) {
        if (-not $s) { Yaz 'Pusula zaten kapali.' 'Green'; exit 0 }
        Hata "Pusula calisiyor (port $Port) ama Pusula kisayoluyla baslatilmamis: PID kaydi (data\pusula.pid) yok."
        Yaz 'Guvenlik icin baska surecleri kapatmiyorum. Elle acilan bir pencere varsa onu kapatin;'
        Yaz 'eski otomatik baslatma gorevi calisiyorsa: Stop-ScheduledTask -TaskName PusulaBot'
        exit 1
    }

    $denPid = [int]$k.denetleyici
    $den = Denetleyici-Dogrula $denPid
    $hedefler = New-Object System.Collections.Generic.List[int]
    if ($den) {
        foreach ($c in (Sunucu-Cocuklari $denPid)) { if (-not $hedefler.Contains([int]$c.ProcessId)) { $hedefler.Add([int]$c.ProcessId) } }
    }
    if ($k.sunucu) {
        $sv = Sunucu-Dogrula ([int]$k.sunucu) $(if ($den) { $denPid } else { 0 })
        if ($sv -and -not $hedefler.Contains([int]$sv.ProcessId)) { $hedefler.Add([int]$sv.ProcessId) }
    }
    if (-not $den -and $hedefler.Count -eq 0) {
        Pid-Sil
        if ($s) {
            Hata 'PID kaydindaki surecler artik yok ama Pusula cevap veriyor: baska bir yoldan baslatilmis.'
            Yaz 'Guvenlik icin baska surecleri kapatmiyorum. Eski gorev calisiyorsa: Stop-ScheduledTask -TaskName PusulaBot'
            exit 1
        }
        Yaz 'Pusula zaten kapali (eski PID kaydi temizlendi).' 'Green'
        exit 0
    }

    # Botlar: calisiyor mu, acik pozisyon var mi?
    $uyarilar = New-Object System.Collections.Generic.List[string]
    $bilgiYok = $false
    if ($s) {
        foreach ($ad in @('hucum', 'denge')) {
            $d = Json-Oku "/api/bindirme/$ad/durum" 20000
            if (-not $d) { $bilgiYok = $true; continue }
            if (-not $d.success) { continue }
            $gorunen = $ad
            if ($d.bot -and $d.bot.adGorunen) { $gorunen = $d.bot.adGorunen }
            $poz = 0
            if ($d.hesap -and $d.hesap.pozisyonlar) { $poz = @($d.hesap.pozisyonlar).Count }
            $btc = 0
            if ($d.btc -and $d.btc.miktar) { $btc = [double]$d.btc.miktar }
            $parca = @()
            if ($d.bot -and $d.bot.calisiyor) { $parca += 'bot CALISIYOR' }
            if ($poz -gt 0) { $parca += "$poz acik pozisyon" }
            if ($btc -ne 0) { $parca += "BTC: $btc" }
            if ($parca.Count -gt 0) { $uyarilar.Add("  - $gorunen ($($d.mod)): $($parca -join ', ')") }
        }
    }
    if ($uyarilar.Count -gt 0 -or $bilgiYok) {
        Yaz ''
        Yaz 'DIKKAT:' 'Yellow'
        foreach ($u in $uyarilar) { Yaz $u 'Yellow' }
        if ($bilgiYok) { Yaz '  - Bot bilgisi alinamadi (sunucu cevap vermedi).' 'Yellow' }
        Yaz 'Sunucu durursa botlar gunluk kararlarini veremez. Acik pozisyonlar borsada KALIR (kapanmaz);'
        Yaz 'felaket stopu borsada beklemeye devam eder. Telegram bildirimleri de durur.'
        if (-not $Evet) {
            $c = Read-Host 'Yine de durdurmak icin E yazip Enter''a basin (vazgecmek icin yalniz Enter)'
            if ($c -notmatch '^\s*[eEyY]') { Yaz 'Vazgecildi; Pusula calismaya devam ediyor.' 'Green'; exit 2 }
        }
    }

    Yaz 'Pusula durduruluyor...'
    try { Set-Content -Path $DurdurIsaret -Value "bilerek durduruldu $(Get-Date -Format s)" -Encoding ASCII } catch { }
    # Once kaydi sil: gorev kipi (-Bekle) bunu "bilerek durduruldu" diye okur, yeniden baslatmaz.
    Pid-Sil
    $nazik = $false
    if ($den) {
        # 1) Nazik: denetleyicinin konsoluna Ctrl+C -> node kaydi diske yazip temiz kapanir.
        try {
            $yardimci = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
                '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Islem', 'CtrlC', '-HedefPid', "$denPid")
            if ($yardimci.ExitCode -eq 0) {
                # 62.0 (denetim 61.8 #5): sunucu, suren bot isini (gunluk calisma, DCA senkronu) en cok 120 sn bekleyip kapanir
                # (server.js KAPANIS_BEKLE_MS). Burada 15 sn sonra zorla kapatmak emrin ortasinda kesmek demekti -> 135 sn.
                # Bot mesgul degilse sunucu hemen kapanir, dongu de hemen biter.
                $bitis = (Get-Date).AddSeconds(135)
                $yazildi = $false
                while ((Get-Date) -lt $bitis) {
                    $yasayan = @($hedefler | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
                    if ($yasayan.Count -eq 0) { $nazik = $true; break }
                    if (-not $yazildi -and ((Get-Date) -gt $bitis.AddSeconds(-125))) { Yaz 'Bot isini bitiriyor olabilir; en cok 2 dakika bekleniyor...' 'Yellow'; $yazildi = $true }
                    Start-Sleep -Milliseconds 500
                }
            }
        } catch { }
        # 2) Denetleyiciyi kapat (yeniden baslatmasin) - yalniz kendi PID'i
        if (Get-Process -Id $denPid -ErrorAction SilentlyContinue) {
            & taskkill.exe /PID $denPid /F 2>&1 | Out-Null
        }
    }
    # 3) Hala yasayan sunucu surecleri - yalniz kayittaki / denetleyicinin cocugu olan PID'ler
    foreach ($p in $hedefler) {
        if (Get-Process -Id $p -ErrorAction SilentlyContinue) {
            $nazik = $false
            & taskkill.exe /PID $p /F 2>&1 | Out-Null
        }
    }

    Start-Sleep -Milliseconds 800
    if (Saglik) {
        Hata 'Pusula hala cevap veriyor: baska bir yoldan da baslatilmis olabilir (eski gorev?).'
        Yaz 'Kontrol: Get-ScheduledTask -TaskName PusulaBot, AntigravityTradeBot -ErrorAction SilentlyContinue'
        exit 1
    }
    if ($nazik) { Yaz 'Pusula durduruldu (kayitlar diske yazildi).' 'Green' }
    else { Yaz 'Pusula durduruldu (zorla kapatildi; son birkac saniyelik gunluk satiri yazilmamis olabilir).' 'Green' }
    exit 0
}
