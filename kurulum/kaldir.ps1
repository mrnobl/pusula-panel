# ---------------------------------------------------------------------------
#  Pusula - kaldirma yardimcisi (68.3, PLAN-TASIMA F4). Kurulum programinin kaldiricisi cagirir (kurulum\pusula.iss).
#
#  YALNIZ bu program klasorunu gosteren zamanlanmis gorevleri ve kisayollari siler; baska bir klasordeki Pusula'nin
#  (or. eski elle kurulum) gorevlerine dokunmaz. VERIYE DOKUNMAZ (C:\Pusula-Veri ya da veri-yeri.json'daki yer).
#  Elle: powershell -ExecutionPolicy Bypass -File kurulum\kaldir.ps1 [-Kuru]
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param([switch]$Kuru)

$ErrorActionPreference = 'SilentlyContinue'
$Kok = (Split-Path -Parent $PSScriptRoot).TrimEnd('\')
$kokK = $Kok.ToLowerInvariant()
function Gosteriyor([string]$metin) { return ([string]$metin).ToLowerInvariant().Contains($kokK) }

$adlar = @('PusulaBot', 'PusulaBekci', 'PusulaDikkatArsiv', 'PusulaGuncelle', 'PusulaYedek', 'PusulaYedekUSB')
foreach ($a in $adlar) {
    $t = Get-ScheduledTask -TaskName $a -ErrorAction SilentlyContinue
    if (-not $t) { continue }
    $ac = @($t.Actions)[0]
    $yer = "$($ac.WorkingDirectory) $($ac.Execute) $($ac.Arguments)"
    if (Gosteriyor $yer) {
        if ($Kuru) { Write-Host "Silinecek gorev: $a"; continue }
        Stop-ScheduledTask -TaskName $a -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $a -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "Gorev silindi: $a"
    } else {
        Write-Host "Baska klasoru gosteriyor, dokunulmadi: $a ($yer)"
    }
}

$kabuk = New-Object -ComObject WScript.Shell
$baslat = Join-Path ([Environment]::GetFolderPath('Programs')) 'Pusula'
$klasorler = @([Environment]::GetFolderPath('Desktop'), $baslat)
foreach ($k in $klasorler) {
    if (-not (Test-Path -LiteralPath $k)) { continue }
    foreach ($l in @(Get-ChildItem -LiteralPath $k -Filter 'Pusula*.lnk' -ErrorAction SilentlyContinue)) {
        $h = $kabuk.CreateShortcut($l.FullName).TargetPath
        if (Gosteriyor $h) {
            if ($Kuru) { Write-Host "Silinecek kisayol: $($l.FullName)"; continue }
            Remove-Item -LiteralPath $l.FullName -Force
            Write-Host "Kisayol silindi: $($l.FullName)"
        }
    }
}
if (-not $Kuru -and (Test-Path -LiteralPath $baslat) -and -not (Get-ChildItem -LiteralPath $baslat -Force)) { Remove-Item -LiteralPath $baslat -Force }
Write-Host 'Veri klasorune dokunulmadi.'
exit 0
