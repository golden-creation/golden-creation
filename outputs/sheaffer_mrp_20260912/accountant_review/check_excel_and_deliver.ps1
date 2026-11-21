$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'SHEAFFER MRP - Accountant Match and Review.xlsx'
$destination = 'C:\Users\My-PC-Win10\Downloads\SHEAFFER MRP - Accountant Match and Review.xlsx'
$data = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'review_data.json') -Raw | ConvertFrom-Json
$excel = $null
$book = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AutomationSecurity = 3
    $book = $excel.Workbooks.Open($source, 0, $true)
    if ($book.Worksheets.Count -ne 2) { throw 'Unexpected worksheet count.' }
    $manual = $book.Worksheets.Item('Manual Review').Range('A9:L123').Value2
    for ($i = 0; $i -lt $data.manual.Count; $i++) {
        $record = $data.manual[$i]
        $r = $i + 1
        if ([string]$manual[$r,2] -cne [string]$record.sku -or
            [string]$manual[$r,3] -cne [string]$record.name -or
            [double]$manual[$r,4] -ne [double]$record.new -or
            [string]$manual[$r,6] -cne [string]$record.review_reason -or
            $null -ne $manual[$r,8] -or $null -ne $manual[$r,9]) {
            throw "Manual Review validation failed at record $r."
        }
    }
    $all = $book.Worksheets.Item('All Matches').Range('A9:L225').Value2
    for ($i = 0; $i -lt $data.records.Count; $i++) {
        $record = $data.records[$i]
        $r = $i + 1
        if ([string]$all[$r,2] -cne [string]$record.sku -or
            [string]$all[$r,3] -cne [string]$record.name -or
            [double]$all[$r,5] -ne [double]$record.new -or
            [string]$all[$r,11] -cne [string]$record.review_reason) {
            throw "All Matches validation failed at record $r."
        }
    }
    Write-Output "Excel opened successfully: $($data.manual.Count) review rows and $($data.records.Count) complete-log rows verified."
} finally {
    if ($null -ne $book) { $book.Close($false) }
    if ($null -ne $excel) { $excel.Quit() }
    if ($null -ne $book) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book) }
    if ($null -ne $excel) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) }
}
if (Test-Path -LiteralPath $destination) {
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
        throw 'Destination exists with different content; it was not overwritten.'
    }
} else {
    Copy-Item -LiteralPath $source -Destination $destination
}
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
    throw 'Delivered file hash mismatch.'
}
Write-Output "Delivered verified report: $destination"
