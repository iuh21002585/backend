# Tìm tất cả các quy trình node.js
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }

Write-Host "Các quy trình node.js đang chạy:"
foreach ($process in $nodeProcesses) {
    Write-Host "PID: $($process.Id), Memory: $($process.WorkingSet / 1MB) MB, StartTime: $($process.StartTime)"
}

Write-Host "`nĐể dừng một quy trình node.js, chạy: Stop-Process -Id <PID>"
