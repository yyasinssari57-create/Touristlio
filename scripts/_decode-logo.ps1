$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root '..\public\images\logo-transparent.png'
$chunks = @(
  'C:\Users\Yasin\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-06-02T20-01-13-521Z.json',
  'C:\Users\Yasin\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-06-02T20-01-08-103Z.json',
  'C:\Users\Yasin\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-06-02T20-01-08-274Z.json',
  'C:\Users\Yasin\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-06-02T20-01-08-471Z.json',
  'C:\Users\Yasin\.cursor\browser-logs\cdp-response-Runtime.evaluate-2026-06-02T20-01-08-622Z.json'
)
$b64 = ($chunks | ForEach-Object {
  if (-not (Test-Path $_)) { throw "Missing chunk: $_" }
  (Get-Content $_ -Raw | ConvertFrom-Json).result.result.value
}) -join ''
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($out)) | Out-Null
[IO.File]::WriteAllBytes($out, [Convert]::FromBase64String($b64))
Write-Output ((Get-Item $out).Length)
