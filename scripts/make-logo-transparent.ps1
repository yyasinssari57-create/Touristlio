# Touristlio — dark pixel → transparent → public/images/logo-transparent.png
# Usage: .\scripts\make-logo-transparent.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$imgDir = Join-Path $root 'public\images'
$out = Join-Path $imgDir 'logo-transparent.png'

$candidates = @('logo-round.png', 'logo.png', 'logo-emblem.png', 'logo-nav.png')
$src = $candidates | ForEach-Object { Join-Path $imgDir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $src) {
  Write-Host "Kaynak PNG yok: $imgDir" -ForegroundColor Red
  exit 1
}

Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $src))
$w = $bmp.Width
$h = $bmp.Height
$outBmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.R -lt 80 -and $c.G -lt 80 -and $c.B -lt 80) {
      $outBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    } else {
      $outBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $c.R, $c.G, $c.B))
    }
  }
}
$bmp.Dispose()
New-Item -ItemType Directory -Force -Path $imgDir | Out-Null
$outBmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Dispose()
Write-Host "OK: $src -> $out ($((Get-Item $out).Length) bytes)" -ForegroundColor Green
