$ErrorActionPreference = 'Stop'
$stockRoot = 'C:\Users\My-PC-Win10\Desktop\Golden Creation\Stock Reconcilation Works'
$downloads = 'C:\Users\My-PC-Win10\Downloads'
$workspaceOutputs = 'D:\lekhanmart-backend-frontend-hostinger\outputs'
$sessionPath = 'D:\CodexData\.codex\sessions\2026\08\16\rollout-2026-08-16T02-16-00-01a0072c-a269-7243-a40a-26c029cfe4fc.jsonl'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$backupRoot = Join-Path $stockRoot "Chat Backup $stamp"
$zipPath = "$backupRoot.zip"
New-Item -ItemType Directory -Path $backupRoot | Out-Null

# Export only visible message events, not internal reasoning or account settings.
$messages = [System.Collections.Generic.List[object]]::new()
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# Golden Creation: Local Chat Transcript')
$lines.Add('')
$lines.Add("Exported $(Get-Date -Format o). User/assistant messages from the local conversation log, in recorded order. Attachments are separately backed up when available. Tool internals and internal reasoning are omitted.")
foreach ($raw in (Get-Content -LiteralPath $sessionPath)) {
    try { $event = $raw | ConvertFrom-Json } catch { throw "Unreadable session record: $($_.Exception.Message)" }
    if ($event.type -ne 'event_msg') { continue }
    if ($event.payload.type -notin @('user_message','agent_message')) { continue }
    $role = if ($event.payload.type -eq 'user_message') { 'User' } else { 'Assistant' }
    $body = [string]$event.payload.message
    if ([string]::IsNullOrWhiteSpace($body)) { continue }
    $messages.Add([pscustomobject]@{timestamp=$event.timestamp; role=$role; text=$body})
    $lines.Add('')
    $lines.Add("## $role | $($event.timestamp)")
    $lines.Add('')
    $lines.Add($body)
}
if ($messages.Count -lt 100) { throw 'Unexpectedly short transcript' }
[System.IO.File]::WriteAllLines((Join-Path $backupRoot 'CHAT TRANSCRIPT.md'), $lines, [System.Text.UTF8Encoding]::new($false))
$messages | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $backupRoot 'CHAT MESSAGES.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $workspaceOutputs 'CHAT_BACKUP_HANDOVER.md') -Destination (Join-Path $backupRoot 'START HERE.md')

$manifest = [System.Collections.Generic.List[object]]::new()
$seen = @{}
function Copy-BackupFile([string]$Source, [string]$Relative) {
    if ($seen.ContainsKey($Source)) { return }
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { return }
    $dest = Join-Path $backupRoot $Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
    $before = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    Copy-Item -LiteralPath $Source -Destination $dest
    $after = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
    if ($before -ne $after) { throw "Copy verification failed: $Source" }
    $manifest.Add([pscustomobject]@{Source=$Source; BackupPath=$Relative; Bytes=(Get-Item -LiteralPath $dest).Length; SHA256=$after})
    $seen[$Source] = $true
}

$stockFiles = Get-ChildItem -LiteralPath $stockRoot -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\Chat Backup ' -and $_.Extension -in @('.xlsx','.xls','.csv','.pdf','.jpeg','.jpg','.png')
}
foreach ($file in $stockFiles) {
    $relative = $file.FullName.Substring($stockRoot.Length + 1)
    Copy-BackupFile $file.FullName (Join-Path 'files\Stock Reconciliation Folder' $relative)
}

$downloadFiles = Get-ChildItem -LiteralPath $downloads -File | Where-Object {
    ($_.Extension -eq '.xlsx' -and ($_.Name -match 'Updated.*Stock|Updated Sum Duplicates|^website-products|^3M Products|^Addgel Products|^adnet products|^Shop Stock Reconciliation|^GOLDEN CRE_StockStatus|^Golden Creation Wordpress|^shop_stock_|^warehouse_')) -or
    ($_.Name -match '^c[1-8]\.jpeg$|^WhatsApp Image 2026-08-17 at 2\.15\.(19|20|21) AM.*\.jpeg$')
}
foreach ($file in $downloadFiles) { Copy-BackupFile $file.FullName (Join-Path 'files\Downloads' $file.Name) }

$supportFiles = Get-ChildItem -LiteralPath $workspaceOutputs -File | Where-Object {
    $_.Name -match 'shop_stock|shopify_shop_stock|website_stock|shopify_upload' -and $_.Extension -in @('.py','.mjs','.json')
}
foreach ($file in $supportFiles) { Copy-BackupFile $file.FullName (Join-Path 'files\Supporting Files' $file.Name) }
$manifest | Export-Csv -LiteralPath (Join-Path $backupRoot 'FILE MANIFEST.csv') -NoTypeInformation -Encoding utf8
$verification = [ordered]@{
    createdAt=(Get-Date -Format o)
    threadId='01a0072c-a269-7243-a40a-26c029cfe4fc'
    transcriptMessages=$messages.Count
    userMessages=@($messages | Where-Object role -eq 'User').Count
    assistantMessages=@($messages | Where-Object role -eq 'Assistant').Count
    copiedFiles=$manifest.Count
    copiedBytes=($manifest | Measure-Object Bytes -Sum).Sum
    allSourceAndCopyHashesMatch=$true
    transcriptFirstTimestamp=$messages[0].timestamp
    transcriptLastTimestamp=$messages[$messages.Count-1].timestamp
    excluded='Account credentials, settings, internal reasoning, tool internals, generated inspect sidecars, node_modules, unrelated files.'
}
$verification | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'BACKUP VERIFICATION.json') -Encoding utf8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($backupRoot, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $true)
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $onDisk = @(Get-ChildItem -LiteralPath $backupRoot -Recurse -File)
    $entries = @($archive.Entries | Where-Object { $_.Name -ne '' })
    if ($entries.Count -ne $onDisk.Count) { throw 'Archive file count differs' }
    foreach ($entry in $entries) {
        $relative = $entry.FullName.Substring((Split-Path -Leaf $backupRoot).Length+1)
        $disk = Join-Path $backupRoot $relative
        $stream = $entry.Open()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
        finally { $stream.Dispose(); $sha.Dispose() }
        if ($hash -ne (Get-FileHash -LiteralPath $disk -Algorithm SHA256).Hash) { throw "Archive hash mismatch: $relative" }
    }
} finally { $archive.Dispose() }
[pscustomobject]@{BackupFolder=$backupRoot; ZIP=$zipPath; Messages=$messages.Count; CopiedFiles=$manifest.Count; ArchiveFiles=$onDisk.Count; ZipBytes=(Get-Item -LiteralPath $zipPath).Length; ArchiveVerified=$true} | ConvertTo-Json
