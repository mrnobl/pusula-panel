# ---------------------------------------------------------------------------
#  Pusula - masaustu kisayollari (2026-10-09, C:\Pusula standardi)
#
#  Masaustune iki kisayol koyar:
#    "Pusula"            -> Pusula-Baslat.cmd  (calismiyorsa baslatir, paneli acar)
#    "Pusula'yi durdur"  -> Pusula-Durdur.cmd  (yalniz Pusula'nin kendi sureclerini kapatir)
#  Simge: public\img\pusula.ico (panelin PWA simgesi; node scripts/ico-uret.js uretir).
#  Proje klasorunu kendisi bulur (sabit yol yok). Hicbir sistem ayari degistirmez.
#
#  Kurulum : powershell -ExecutionPolicy Bypass -File scripts\kisayol-kur.ps1
#  Kaldirma: powershell -ExecutionPolicy Bypass -File scripts\kisayol-kur.ps1 -Kaldir
#  68.3    : -BaslatMenusu ayni iki kisayolu Baslat menusune de koyar (Programlar\Pusula; kur.js boyle cagirir).
#            -Klasor / -BaslatKlasor yalniz deneme icin (gecici klasor; gercek masaustu ve menu degismez).
#  Klasor tasindiysa kurulumu yeniden calistirmak yeterli (kisayollar yeni klasoru gosterir).
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param([switch]$Kaldir, [switch]$BaslatMenusu, [string]$Klasor = '', [string]$BaslatKlasor = '')

$ErrorActionPreference = 'Stop'
$Kok = Split-Path -Parent $PSScriptRoot
$Masaustu = if ($Klasor) { $Klasor } else { [Environment]::GetFolderPath('Desktop') }
$Hedefler = @($Masaustu)
if ($BaslatMenusu -or $BaslatKlasor) {
    $bm = if ($BaslatKlasor) { $BaslatKlasor } else { Join-Path ([Environment]::GetFolderPath('Programs')) 'Pusula' }
    $Hedefler += $bm
}
$Simge = Join-Path $Kok 'public\img\pusula.ico'
$ByI = [string][char]0x0131   # Turkce noktasiz i (dosya ASCII kalsin diye)
$Kisayollar = @(
    @{ Dosya = 'Pusula.lnk'; Hedef = 'Pusula-Baslat.cmd'; Aciklama = 'Pusula: sunucuyu baslat ve paneli ac' },
    @{ Dosya = "Pusula'y$ByI durdur.lnk"; Hedef = 'Pusula-Durdur.cmd'; Aciklama = 'Pusula: sunucuyu durdur (yalniz Pusula surecleri)' }
)

if ($Kaldir) {
    foreach ($h in $Hedefler) {
        foreach ($k in $Kisayollar) {
            $yol = Join-Path $h $k.Dosya
            if (Test-Path -LiteralPath $yol) { Remove-Item -LiteralPath $yol -Force; Write-Host "Kaldirildi: $yol" -ForegroundColor Yellow }
            else { Write-Host "Zaten yok: $yol" -ForegroundColor DarkGray }
        }
    }
    return
}

foreach ($k in $Kisayollar) {
    $hedef = Join-Path $Kok $k.Hedef
    if (-not (Test-Path -LiteralPath $hedef)) { throw "Bulunamadi: $hedef (git pull yapildi mi?)" }
}
if (-not (Test-Path -LiteralPath $Simge)) { Write-Host "Simge bulunamadi ($Simge); Windows'un varsayilan simgesi kullanilacak." -ForegroundColor Yellow }

$kabuk = New-Object -ComObject WScript.Shell
foreach ($h in $Hedefler) {
    if (-not (Test-Path -LiteralPath $h)) { New-Item -ItemType Directory -Force -Path $h | Out-Null }
    foreach ($k in $Kisayollar) {
        $yol = Join-Path $h $k.Dosya
        $lnk = $kabuk.CreateShortcut($yol)
        $lnk.TargetPath = Join-Path $Kok $k.Hedef
        $lnk.WorkingDirectory = $Kok
        $lnk.Description = $k.Aciklama
        $lnk.WindowStyle = 1
        if (Test-Path -LiteralPath $Simge) { $lnk.IconLocation = "$Simge,0" }
        $lnk.Save()
        Write-Host "Kisayol hazir: $yol" -ForegroundColor Green
    }
}
Write-Host ''
Write-Host "Kisayollar su klasoru gosteriyor: $Kok"
Write-Host 'Simge hemen degismezse masaustunde bos bir yere sag tik > Yenile.'
