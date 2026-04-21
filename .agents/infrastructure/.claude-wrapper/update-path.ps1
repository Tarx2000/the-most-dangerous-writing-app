$p = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($p -notmatch 'C:\\Users\\Tarik\\\.claude-wrapper') {
    [Environment]::SetEnvironmentVariable('Path', 'C:\Users\Tarik\.claude-wrapper;' + $p, 'User')
    Write-Host "Path updated"
} else {
    Write-Host "Path already set"
}
