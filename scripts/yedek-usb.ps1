# ---------------------------------------------------------------------------
#  Pusula - haftalik USB yedek kopyasi (A9, sunucuda yazildi 2026-10-18; depoya alindi)
#
#  Gunluk yedegin (PusulaYedek gorevi -> data\yedek-ayar.json "hedef", sunucuda E:\PusulaYedek\otomatik\<tarih>)
#  EN SONUNU USB'ye kopyalar: <Surucu>:\PusulaYedek\<tarih>. Sirlar KOPYALANMAZ (config.json ve lib\yedek.js
#  SIR_DOSYA: secrets.json, telefon-jeton.json, acil-pin.json, ev-baglanti.json): USB tasinabilir bellek.
#  USB takili degilse o hafta atlanir (log'a yazilir, hata degil).
#  Cikti: data\yedek-usb.log (eklenir).
#
#  68.1 (PLAN-TASIMA F3) YENI BICIM: yedek sifresi kaydedildiyse (Ayarlar > Yedek ve tasima ya da npm run yedek-sifre;
#  <veri>\gizli\yedek-sifre.json) ya da veri YENI duzendeyse (C:\Pusula-Veri) USB'ye tasima dosyasiyla AYNI bicimde
#  <Surucu>:\PusulaYedek\pusula-yedek-<tarih>.pusula yazilir (node scripts\tasima.js usb-yedek; son 8 kopya kalir).
#  Gizli bilgiler yalniz yedek sifresiyle sifreli girer; sifre yoksa GIRMEZ ve log bunu yazar. Karar: node scripts\tasima.js
#  usb-bicim ('pusula' | 'eski'). Sifre kaydedilmemis eski kurulumda (sunucu dahil) asagidaki ESKI davranis aynen surer.
#  Eski klasor yedekleri okunabilir kalir: npm run yedek -- --geri-yukle <tarih> --dizin <bos klasor> (Kilavuz > Yedek ve tasima).
#
#  Gorev: PusulaYedekUSB (scripts\install-yedek-usb-gorev.ps1; Pazar 06:00). Elle calistirma:
#    powershell -ExecutionPolicy Bypass -File scripts\yedek-usb.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\yedek-usb.ps1 -Surucu G
#  (Dosya bilerek ASCII: Windows PowerShell 5.1 BOM'suz UTF-8'i yanlis okur.)
# ---------------------------------------------------------------------------

param(
    [string]$Kaynak = '',
    [string]$Surucu = 'F'
)

$ErrorActionPreference = 'Stop'
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
$Log = Join-Path (Pusula-VeriDizini $ProjectRoot 'yedek-usb.log') 'yedek-usb.log'

function Yaz($m) {
    $satir = "[$((Get-Date).ToString('s'))] $m"
    Add-Content -Path $Log -Value $satir -Encoding ASCII
    Write-Host $satir
}

try {
    if (-not $Kaynak) {
        $ayar = Join-Path (Pusula-VeriDizini $ProjectRoot 'yedek-ayar.json') 'yedek-ayar.json'
        try { $Kaynak = ([System.IO.File]::ReadAllText($ayar) | ConvertFrom-Json).hedef } catch { $Kaynak = '' }
        if (-not $Kaynak) { $Kaynak = Join-Path $env:USERPROFILE 'PusulaYedek' }   # scripts\yedek.js varsayilani
    }

    $v = Get-Volume -DriveLetter $Surucu -ErrorAction SilentlyContinue
    if (-not $v -or $v.DriveType -ne 'Removable') { Yaz "USB ($Surucu`:) takili degil, atlandi"; exit 0 }

    # 68.1: yeni bicim (.pusula) yalniz yedek sifresi kayitliysa ya da yeni veri duzenindeyse; karar node'dan, hata -> eski bicim.
    $bicim = 'eski'
    try {
        $b = & node (Join-Path $ProjectRoot 'scripts\tasima.js') 'usb-bicim' 2>$null
        if ($LASTEXITCODE -eq 0 -and $b) { $bicim = ([string]($b | Select-Object -First 1)).Trim() }
    } catch { $bicim = 'eski' }
    if ($bicim -eq 'pusula') {
        $klasor = "$Surucu`:\PusulaYedek"
        New-Item -ItemType Directory -Force -Path $klasor | Out-Null
        $cikti = & node (Join-Path $ProjectRoot 'scripts\tasima.js') 'usb-yedek' '--klasor' $klasor 2>&1
        $kod = $LASTEXITCODE
        $son = [string](@($cikti) | Select-Object -Last 1)
        if ($kod -ne 0) { Yaz "HATA: usb .pusula yedegi (kod $kod): $son"; exit 1 }
        Yaz $son
        exit 0
    }

    $son = Get-ChildItem $Kaynak -Directory | Where-Object Name -match '^\d{4}-\d{2}-\d{2}$' | Sort-Object Name | Select-Object -Last 1
    if (-not $son) { Yaz "HATA: kaynakta yedek yok ($Kaynak)"; exit 1 }

    $hedef = "$Surucu`:\PusulaYedek\$($son.Name)"
    robocopy $son.FullName $hedef /E /XF config.json secrets.json telefon-jeton.json acil-pin.json ev-baglanti.json /R:1 /W:1 /NP /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { Yaz "HATA: robocopy kodu $LASTEXITCODE -> $hedef"; exit 1 }

    $d = Get-ChildItem $hedef -Recurse -File
    $mb = [math]::Round(($d | Measure-Object Length -Sum).Sum / 1MB, 1)
    Yaz "usb yedek tamam: $($d.Count) dosya, $mb MB -> $hedef (sirlar haric)"
    exit 0
} catch {
    Yaz "HATA: $($_.Exception.Message)"
    exit 1
}
