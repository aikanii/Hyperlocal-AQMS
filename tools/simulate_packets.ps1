$ErrorActionPreference = 'Stop'

$devices = Invoke-RestMethod -Uri 'http://localhost:3000/api/devices' -Method Get
if (-not $devices) {
  Write-Output 'No devices found; aborting.'
  exit 0
}

$cycles = 3
for ($c = 1; $c -le $cycles; $c++) {
  Write-Output "=== Cycle $c/$cycles ($(Get-Date -Format o)) ==="
  foreach ($d in $devices) {
    $p = @{
      device_id = $d.device_id
      pm1_0 = [math]::Round(10 + (Get-Random -Minimum -2.0 -Maximum 2.0), 2)
      pm2_5 = [math]::Round(25.5 + (Get-Random -Minimum -5.0 -Maximum 5.0), 2)
      pm10 = [math]::Round(45 + (Get-Random -Minimum -8.0 -Maximum 8.0), 2)
      temperature = [math]::Round(28.5 + (Get-Random -Minimum -0.8 -Maximum 0.8), 2)
      humidity = [math]::Round(65 + (Get-Random -Minimum -3.0 -Maximum 3.0), 2)
      rssi_dbm = [int](-65 + (Get-Random -Minimum -4 -Maximum 4))
      battery_mv = [int](4100 + (Get-Random -Minimum -30 -Maximum 30))
    }
    try {
      $res = Invoke-RestMethod -Uri 'http://localhost:3000/api/sim/inject' -Method Post -Body ($p | ConvertTo-Json -Depth 3) -ContentType 'application/json'
      Write-Output "Published $($p.device_id) -> $($res.status) ($($res.topic))"
    } catch {
      Write-Output "ERROR $($p.device_id): $($_.Exception.Message)"
    }
  }
  if ($c -lt $cycles) {
    Write-Output 'Sleeping 60s...'
    Start-Sleep -Seconds 60
  }
}
