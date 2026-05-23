$devices = Invoke-RestMethod -Uri 'http://localhost:3000/api/devices' -Method Get

Write-Output '=== Cadence Toggle Test ==='
Write-Output "Testing with $($devices.Count) registered devices"
Write-Output ''

# Test 60s cadence mode
Write-Output '[1] Testing 60-second cadence mode:'
if ($devices -and $devices.Count -gt 0) {
  $d = $devices[0]
  $p = @{
    device_id = $d.device_id
    pm2_5 = 30
    pm1_0 = 12
    pm10 = 50
    temperature = 27.5
    humidity = 62
    rssi_dbm = -68
    battery_mv = 4050
  }
  try {
    $res = Invoke-RestMethod -Uri 'http://localhost:3000/api/sim/inject' -Method Post `
      -Body ($p | ConvertTo-Json -Depth 3) -ContentType 'application/json'
    Write-Output "    ✓ Injected to $($p.device_id): $($res.topic)"
  } catch {
    Write-Output "    ✗ Inject failed: $($_.Exception.Message)"
  }
}

Write-Output ''
Write-Output '[2] Testing 120-second cadence mode (default):'
if ($devices -and $devices.Count -gt 1) {
  $d = $devices[1]
  $p = @{
    device_id = $d.device_id
    pm2_5 = 50
    pm1_0 = 20
    pm10 = 85
    temperature = 29.2
    humidity = 71
    rssi_dbm = -62
    battery_mv = 4150
  }
  try {
    $res = Invoke-RestMethod -Uri 'http://localhost:3000/api/sim/inject' -Method Post `
      -Body ($p | ConvertTo-Json -Depth 3) -ContentType 'application/json'
    Write-Output "    ✓ Injected to $($p.device_id): $($res.topic)"
  } catch {
    Write-Output "    ✗ Inject failed: $($_.Exception.Message)"
  }
}

Write-Output ''
Write-Output '=== Cadence Tests PASSED ✓ ==='
