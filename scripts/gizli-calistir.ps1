# ---------------------------------------------------------------------------
#  Pusula - gorev baslaticisi (gizli pencere) - 2026-10-18
#
#  install-guncelleme-gorev.ps1 / install-yedek-gorev.ps1 / install-dikkat-gorev.ps1 -Oturum kipinde
#  gorevi su sekilde kaydeder:
#    powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass
#                   -File scripts\gizli-calistir.ps1 -Cmd data\gorevler\<GorevAdi>.cmd
#  Bu betik .cmd dosyasini gizli cmd penceresinde calistirir, bitmesini bekler ve cikis kodunu aynen dondurur.
#  Neden: Interactive gorevde cmd penceresi masaustunde gorunur, kapatilirsa is yarida kalir (0xC000013A);
#  -EncodedCommand ile gizli PowerShell ise Kaspersky tarafindan engellendi (0x80070005, sunucu 2026-10-18).
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [Parameter(Mandatory = $true)][string]$Cmd
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Cmd)) { Write-Error "Gorev dosyasi yok: $Cmd (install-*-gorev.ps1 ile yeniden kurun)"; exit 2 }
$CmdTam = (Resolve-Path -LiteralPath $Cmd).Path
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList ('/d /c ""' + $CmdTam + '""') -WorkingDirectory (Split-Path -Parent $PSScriptRoot) `
    -WindowStyle Hidden -PassThru -Wait
exit $p.ExitCode
