# Pusula klasor izinleri (69.6, guvenlik testi K3).
# Pusula program ve veri klasorlerinde mirasi kaldirir; yalniz SYSTEM, Administrators ve Pusula'yi calistiran kullanici kalir.
# Baska Windows hesaplari (ve onlarin altinda calisan programlar) sir dosyalarini okuyamaz, kodu degistiremez.
#
#   powershell -ExecutionPolicy Bypass -File scripts\klasor-izin.ps1 -Durum                 # yalniz okur
#   powershell -ExecutionPolicy Bypass -File scripts\klasor-izin.ps1                        # uygular (program + veri klasoru)
#   powershell -ExecutionPolicy Bypass -File scripts\klasor-izin.ps1 -Klasor C:\Pusula -Klasor C:\Pusula-Veri
#
# Cikti satirlari (makine okur, lib/klasorIzni.js):  KLASOR:<yol>  GENIS:<sid>:<haklar>  TAMAM  UYGULANDI  HATA:<metin>
# Genis sayilan: Everyone (S-1-1-0), Users (S-1-5-32-545), Authenticated Users (S-1-5-11), Guests (S-1-5-32-546).
# Yonetici izni gerekmez: klasorun sahibi izinlerini degistirebilir. Yalniz Pusula'nin kendi klasorlerine dokunur.
param(
  [string[]]$Klasor = @(),
  [switch]$Durum
)
$ErrorActionPreference = 'Stop'
$GENIS = @('S-1-1-0', 'S-1-5-32-545', 'S-1-5-11', 'S-1-5-32-546')

if ($Klasor.Count -eq 0) {
  $kok = Split-Path -Parent $PSScriptRoot
  $Klasor = @($kok)
  $isaret = Join-Path $kok 'PUSULA-KURULUM.json'
  if (Test-Path $isaret) {
    try { $j = Get-Content $isaret -Raw | ConvertFrom-Json; if ($j.veri) { $Klasor += $j.veri } } catch { }
  }
  if (Test-Path 'C:\Pusula-Veri') { $Klasor += 'C:\Pusula-Veri' }
  $Klasor = $Klasor | Select-Object -Unique
}

function Genisler([string]$yol) {
  $acl = Get-Acl -LiteralPath $yol
  $out = @()
  foreach ($a in $acl.Access) {
    if ($a.AccessControlType -ne 'Allow') { continue }
    try { $sid = $a.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $sid = [string]$a.IdentityReference }
    if ($GENIS -contains $sid) { $out += ('GENIS:' + $sid + ':' + $a.FileSystemRights) }
  }
  return $out
}

$benSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$hata = $false
foreach ($k in $Klasor) {
  if (-not (Test-Path -LiteralPath $k)) { continue }
  Write-Output ('KLASOR:' + $k)
  $g = @(Genisler $k)
  foreach ($x in $g) { Write-Output $x }
  if ($Durum) { if ($g.Count -eq 0) { Write-Output 'TAMAM' }; continue }
  if ($g.Count -eq 0) { Write-Output 'TAMAM'; continue }
  & icacls.exe $k /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' ('*' + $benSid + ':(OI)(CI)F') /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Output ('HATA:icacls cikis ' + $LASTEXITCODE + ' (' + $k + ')'); $hata = $true; continue }
  # Miras disi (acik) genis izinler de kaldirilir
  & icacls.exe $k /remove:g '*S-1-1-0' '*S-1-5-32-545' '*S-1-5-11' '*S-1-5-32-546' /Q | Out-Null
  $g2 = @(Genisler $k)
  if ($g2.Count -eq 0) { Write-Output 'UYGULANDI' } else { foreach ($x in $g2) { Write-Output $x }; Write-Output ('HATA:genis izin kaldi (' + $k + ')'); $hata = $true }
}
if ($hata) { exit 1 }
exit 0
