# Desktop touristlio7c.html -> logo.png + icon.svg + icon-white.svg
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$imgDir = Join-Path $root 'public\images'
New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

$logoOut = Join-Path $imgDir 'logo.png'
$iconOut = Join-Path $imgDir 'icon.svg'
$iconWhiteOut = Join-Path $imgDir 'icon-white.svg'

function Get-LogoBytes {
  if (Test-Path $logoOut) { return [IO.File]::ReadAllBytes($logoOut) }
  foreach ($p in @(
    'C:\Users\Yasin\Desktop\touristlio-logo.png',
    'C:\Users\Yasin\Desktop\logo.png'
  )) {
    if (Test-Path $p) { return [IO.File]::ReadAllBytes($p) }
  }
  $html = 'C:\Users\Yasin\Desktop\touristlio7c.html'
  if (-not (Test-Path $html)) { throw 'logo kaynagi bulunamadi' }
  $text = [IO.File]::ReadAllText($html)
  if ($text -match 'class="logo"[\s\S]*?<img src="data:image/jpeg;base64,([^"]+)"') {
    return [Convert]::FromBase64String($Matches[1])
  }
  throw 'HTML icinde logo base64 bulunamadi'
}

$buf = Get-LogoBytes
[IO.File]::WriteAllBytes($logoOut, $buf)
$b64 = [Convert]::ToBase64String($buf)
$mime = 'image/jpeg'

$iconSvg = @"
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 58" width="44" height="44" aria-hidden="true">
  <defs><clipPath id="markTop"><rect width="100" height="58"/></clipPath></defs>
  <g clip-path="url(#markTop)">
    <image xlink:href="data:$mime;base64,$b64" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMin meet"/>
  </g>
</svg>
"@

# White-on-black brand PNG/JPEG — same top-crop as icon.svg (no SVG/CSS invert)
$iconWhiteSvg = $iconSvg

[IO.File]::WriteAllText($iconOut, $iconSvg, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($iconWhiteOut, $iconWhiteSvg, [Text.UTF8Encoding]::new($false))
Write-Host "OK: $logoOut ($($buf.Length) bytes)"
Write-Host "OK: $iconOut"
Write-Host "OK: $iconWhiteOut"
