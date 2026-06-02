Set-Location $PSScriptRoot\..
node scripts/make-logo-transparent.mjs
if (-not $?) {
  py -3 -m pip install Pillow numpy -q
  py -3 scripts/make-logo-transparent.py
}
if (Test-Path 'public\images\logo-transparent.png') {
  (Get-Item 'public\images\logo-transparent.png').Length
} else {
  node scripts/_write-logo-from-cdp.mjs
  if (Test-Path 'public\images\logo-transparent.png') {
    (Get-Item 'public\images\logo-transparent.png').Length
  } else {
    'MISSING'
  }
}
