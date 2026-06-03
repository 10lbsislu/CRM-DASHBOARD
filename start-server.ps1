# mezzeMarin CRM — Ağ (LAN) sunucusunu başlatır.
# Build edilmiş frontend backend tarafından servis edilir; tek port: 8000.
# Ağdaki diğer cihazlar:  http://<bu-bilgisayarin-IP>:8000

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Bu makinenin LAN IP'sini göster
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*" } |
    Where-Object { $_.InterfaceAlias -notlike "*VPN*" -and $_.InterfaceAlias -notlike "*Surfshark*" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host "============================================"
Write-Host " mezzeMarin CRM ag sunucusu basliyor..."
Write-Host " Bu cihazda:   http://localhost:8000"
if ($ip) { Write-Host " Agdaki cihazlar: http://${ip}:8000" }
Write-Host " Durdurmak icin: Ctrl+C"
Write-Host "============================================"

Set-Location "$root\backend"
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
