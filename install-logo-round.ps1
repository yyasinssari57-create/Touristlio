# Touristlio — siyah kare + beyaz T+pin (yazisiz) PNG -> public/images/logo-round.png
# Calistirma: PowerShell'de proje klasorunden:  .\install-logo-round.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $root 'public\images\logo-round.png'
$imgDir = Split-Path $dest -Parent

Write-Host ''
Write-Host '=== Touristlio logo-round kurulumu ===' -ForegroundColor Cyan
Write-Host "Hedef (tam yol): $dest"
Write-Host ''
Write-Host 'public\images icindeki dosyalar:'
if (Test-Path $imgDir) {
  Get-ChildItem $imgDir -File | ForEach-Object { Write-Host "  - $($_.Name)" }
} else {
  Write-Host '  (klasor yok — olusturulacak)'
}
Write-Host ''

if (Test-Path $dest) {
  $len = (Get-Item $dest).Length
  Write-Host "logo-round.png ZATEN VAR ($len bayt)." -ForegroundColor Green
  Write-Host 'Tarayicida ?v=6 kullanin; index.html nav satirinda v=5 -> v=6 yapin.'
  exit 0
}

New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

$sources = @(
  (Join-Path $imgDir 'logo-emblem.png'),
  (Join-Path $imgDir 'logo-nav.png'),
  'C:\Users\Yasin\Desktop\logo-round.png',
  'C:\Users\Yasin\Desktop\logo-emblem.png',
  'C:\Users\Yasin\Desktop\touristlio-logo.png',
  'C:\Users\Yasin\Downloads\logo-round.png',
  'C:\Users\Yasin\Downloads\logo-emblem.png',
  'C:\Users\Yasin\Downloads\logo.png'
)

$src = $sources | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $src) {
  Write-Host 'KAYNAK PNG BULUNAMADI.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Manuel kurulum (sohbetteki siyah kare + beyaz T+pin, yazisiz):' -ForegroundColor White
  Write-Host '  1) PNG dosyanizi Masaustune kaydedin (ornek: logo-round.png)'
  Write-Host '  2) Dosya adi tam olarak: logo-round.png  (logo-round.png.png OLMASIN)'
  Write-Host '  3) Windows Gezgininde dosyayi surukleyip su klasore birakin:'
  Write-Host "     $imgDir"
  Write-Host '  4) Hedef dosya adi (yeniden adlandirin): logo-round.png'
  Write-Host "     Tam hedef yol: $dest"
  Write-Host '  5) Sonra bu betigi tekrar calistirin VEYA dogrudan kopyalayin.'
  Write-Host ''
  Write-Host 'Gecici: ana sayfa nav logosu icon-white.svg ile dolar (index.html onerror).'
  Write-Host 'Gercek amblem gelince index.html icinde ?v=5 -> ?v=6 yapin.'
  exit 1
}

# Yanlislikla .png.png uzantisini uyar
$leaf = Split-Path $src -Leaf
if ($leaf -match '\.png\.png$') {
  Write-Host "UYARI: Dosya adi '$leaf' — Windows bazen .png.png ekler. Yeniden adlandirin: logo-round.png" -ForegroundColor Red
  exit 1
}

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
$w = $img.Width
$h = $img.Height
$cropH = if ($h -gt ($w * 1.05)) { [int][Math]::Round($w * 0.58) } else { $h }
$side = [Math]::Min($w, $cropH)
$bmp = New-Object System.Drawing.Bitmap $side, $side
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(10, 10, 10))
$srcRect = New-Object System.Drawing.Rectangle 0, 0 $w $cropH
$destRect = New-Object System.Drawing.Rectangle 0, 0 $side $side
$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "OK: $src -> $dest (${side}x${side})" -ForegroundColor Green
Write-Host 'Simdi public\index.html nav img satirinda ?v=5 degerini ?v=6 yapin.'
