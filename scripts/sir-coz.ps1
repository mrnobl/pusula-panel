# ---------------------------------------------------------------------------
#  Pusula - sifreli sir dosyalarini BIR KEZ duz hale cevirir (69.9)
#
#  69.4-69.8 API anahtarlarini Windows DPAPI ile sifreliyordu; Pusula bunu arka planda PowerShell acarak yapiyordu ve
#  sunucudaki Kaspersky bunu virus davranisi sayip server.js'i sildi. 69.9'dan beri Pusula PowerShell ACMAZ ve sir
#  dosyalarini duz okur. Bu betik mevcut sifreli dosyalari (secrets.json, telefon-jeton.json, ev-baglanti.json,
#  yedek-sifre.json ve .yedek kopyalari) BU Windows kullanicisiyla cozer ve duz JSON olarak yazar.
#  Her dosyanin sifreli hali yanina <ad>.dpapi-yedek olarak kopyalanir (hicbir sey silinmez).
#
#  Calistirma (sunucuda, Pusula'yi calistiran kullaniciyla; yonetici GEREKMEZ):
#    powershell -ExecutionPolicy Bypass -File C:\Pusula\scripts\sir-coz.ps1
#    powershell -ExecutionPolicy Bypass -File C:\Pusula\scripts\sir-coz.ps1 -Durum     (yalniz listeler)
# ---------------------------------------------------------------------------
param([switch]$Durum, [string]$Program = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if (-not $Program) { $Program = Split-Path -Parent $PSScriptRoot }

$kokler = @((Join-Path $Program 'data'))
$yer = Join-Path $Program 'veri-yeri.json'
if (Test-Path $yer) {
  try { $k = (Get-Content $yer -Raw | ConvertFrom-Json).kok; if ($k) { $kokler += $k } } catch { }
}
if ($env:PUSULA_VERI) { $kokler += $env:PUSULA_VERI }
$adlar = @('secrets.json', 'secrets.json.yedek', 'telefon-jeton.json', 'telefon-jeton.json.yedek', 'ev-baglanti.json', 'ev-baglanti.json.yedek', 'yedek-sifre.json', 'yedek-sifre.json.yedek')
$entropi = [Text.Encoding]::UTF8.GetBytes('pusula-sir-kasasi')
$utf8 = New-Object Text.UTF8Encoding $false

$dosyalar = @()
foreach ($kok in ($kokler | Select-Object -Unique)) {
  if (Test-Path $kok) { $dosyalar += Get-ChildItem -Path $kok -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Where-Object { $adlar -contains $_.Name } }
}
if (-not $dosyalar) { Write-Host "Sir dosyasi bulunamadi (aranan: $($kokler -join ', '))."; exit 0 }

$cozulen = 0; $duz = 0; $hata = 0
foreach ($d in $dosyalar) {
  $metin = [IO.File]::ReadAllText($d.FullName)
  try { $j = $metin | ConvertFrom-Json } catch { Write-Host "ATLANDI (JSON degil): $($d.FullName)"; $hata++; continue }
  if (-not $j._pusulaDpapi) { Write-Host "duz (islem yok): $($d.FullName)"; $duz++; continue }
  $kapsam = if ($j.kapsam -eq 'CurrentUser') { [Security.Cryptography.DataProtectionScope]::CurrentUser } else { [Security.Cryptography.DataProtectionScope]::LocalMachine }
  if ($Durum) { Write-Host "SIFRELI ($kapsam): $($d.FullName)"; continue }
  try {
    $acik = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($j._pusulaDpapi), $entropi, $kapsam)
    $icerik = [Text.Encoding]::UTF8.GetString($acik)
    $null = $icerik | ConvertFrom-Json
    Copy-Item -LiteralPath $d.FullName -Destination ($d.FullName + '.dpapi-yedek') -Force
    [IO.File]::WriteAllText($d.FullName, $icerik, $utf8)
    Write-Host "COZULDU: $($d.FullName)"
    $cozulen++
  } catch {
    Write-Host "COZULEMEDI: $($d.FullName) - $($_.Exception.Message)"
    Write-Host "  (Baska bir Windows kullanicisiyla sifrelenmis olabilir: Pusula'yi calistiran kullaniciyla yeniden deneyin.)"
    $hata++
  }
}
Write-Host ""
if ($Durum) { Write-Host "Yalniz listelendi. Cevirmek icin -Durum olmadan calistirin."; exit 0 }
Write-Host "Bitti: $cozulen cozuldu, $duz zaten duzdu, $hata hata."
if ($cozulen -gt 0) { Write-Host "Simdi Pusula'yi yeniden baslatin (masaustundeki Pusula kisayolu)." }
if ($hata -gt 0) { exit 1 }
