# ---------------------------------------------------------------------------
#  Pusula - Windows etkin saatleri (69.3, PLAN-OZ-DENETIM / guclendirme raporu)
#
#  Windows Update, "etkin saatler" DISINDA kendiliginden yeniden baslatabilir. Pusula'nin gunluk karari
#  03:02 (TR) ve otomatik guncellemesi 12:00'de; ikisi de etkin saatlerin ICINDE olmali.
#  Bu betik etkin saatleri 21:00 -> 15:00 (Windows'un izin verdigi en genis aralik, 18 saat) olarak SABITLER:
#    - ilke (Group Policy karsiligi):  HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate
#        SetActiveHours=1, ActiveHoursStart=21, ActiveHoursEnd=15
#    - kullanici ayari:               HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings
#        ActiveHoursStart=21, ActiveHoursEnd=15, SmartActiveHoursState=0 (otomatik ayarlama kapali)
#  Boylece Windows yeniden baslatmayi yalniz 15:00-21:00 arasinda (siz basindayken) yapabilir.
#
#  Calistirma (sunucuda, YONETICI PowerShell):
#    powershell -ExecutionPolicy Bypass -File scripts\windows-etkin-saat.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\windows-etkin-saat.ps1 -Durum
#    powershell -ExecutionPolicy Bypass -File scripts\windows-etkin-saat.ps1 -Kaldir     (ilkeyi kaldirir)
#  Panel: Sistem > Saglik > "Windows yeniden baslatmasi" satiri 03:02'nin korundugunu gosterir.
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------
param([switch]$Durum, [switch]$Kaldir, [int]$Baslangic = 21, [int]$Bitis = 15)

$ErrorActionPreference = 'Stop'
$ilke = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
$ux = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'

function Goster {
  $p = Get-ItemProperty -Path $ilke -ErrorAction SilentlyContinue
  $u = Get-ItemProperty -Path $ux -ErrorAction SilentlyContinue
  if ($p -and $p.SetActiveHours -eq 1) { Write-Output ("Ilke: etkin saatler {0:00}:00 - {1:00}:00" -f $p.ActiveHoursStart, $p.ActiveHoursEnd) } else { Write-Output 'Ilke: tanimli degil' }
  if ($u) { Write-Output ("Kullanici ayari: {0:00}:00 - {1:00}:00 (otomatik ayarlama: {2})" -f $u.ActiveHoursStart, $u.ActiveHoursEnd, $(if ($u.SmartActiveHoursState -eq 0) { 'kapali' } else { 'acik' })) }
}

if ($Durum) { Goster; exit 0 }

$yonetici = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $yonetici) { Write-Error 'Bu betik YONETICI PowerShell ister (Baslat > PowerShell > sag tik > Yonetici olarak calistir).'; exit 1 }

if ($Kaldir) {
  foreach ($a in 'SetActiveHours', 'ActiveHoursStart', 'ActiveHoursEnd') { Remove-ItemProperty -Path $ilke -Name $a -ErrorAction SilentlyContinue }
  Write-Output 'Etkin saat ilkesi kaldirildi.'; Goster; exit 0
}

$aralik = ($Bitis - $Baslangic + 24) % 24
if ($aralik -eq 0 -or $aralik -gt 18) { Write-Error "Etkin saat araligi en cok 18 saat olabilir ($Baslangic -> $Bitis = $aralik saat)."; exit 1 }
$kapsar = { param($s) if ($Baslangic -lt $Bitis) { $s -ge $Baslangic -and $s -lt $Bitis } else { $s -ge $Baslangic -or $s -lt $Bitis } }
if (-not (& $kapsar 3)) { Write-Error 'Aralik 03:00-04:00 saatini kapsamiyor (gunluk karar 03:02).'; exit 1 }

New-Item -Path $ilke -Force | Out-Null
New-ItemProperty -Path $ilke -Name SetActiveHours -PropertyType DWord -Value 1 -Force | Out-Null
New-ItemProperty -Path $ilke -Name ActiveHoursStart -PropertyType DWord -Value $Baslangic -Force | Out-Null
New-ItemProperty -Path $ilke -Name ActiveHoursEnd -PropertyType DWord -Value $Bitis -Force | Out-Null
New-Item -Path $ux -Force | Out-Null
New-ItemProperty -Path $ux -Name ActiveHoursStart -PropertyType DWord -Value $Baslangic -Force | Out-Null
New-ItemProperty -Path $ux -Name ActiveHoursEnd -PropertyType DWord -Value $Bitis -Force | Out-Null
New-ItemProperty -Path $ux -Name SmartActiveHoursState -PropertyType DWord -Value 0 -Force | Out-Null
Write-Output ("Etkin saatler sabitlendi: {0:00}:00 - {1:00}:00. Windows yeniden baslatmayi yalniz {1:00}:00 - {0:00}:00 arasinda yapabilir." -f $Baslangic, $Bitis)
Goster
