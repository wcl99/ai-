[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [Uri]$BaseUrl
)

$ErrorActionPreference = "Stop"

function Invoke-SmokeRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedContentType
    )

    $target = [Uri]::new($BaseUrl, $Path)
    $response = Invoke-WebRequest -Uri $target -Method Get -UseBasicParsing
    if ($response.StatusCode -ne 200) {
        throw "$Path returned HTTP $($response.StatusCode)"
    }
    if ($response.Headers["Content-Type"] -notlike "$ExpectedContentType*") {
        throw "$Path returned unexpected Content-Type: $($response.Headers['Content-Type'])"
    }
    Write-Host "PASS $Path"
}

Invoke-SmokeRequest -Path "/health/live" -ExpectedContentType "application/json"
Invoke-SmokeRequest -Path "/health/ready" -ExpectedContentType "application/json"
Invoke-SmokeRequest -Path "/" -ExpectedContentType "text/html"
Invoke-SmokeRequest -Path "/openapi.json" -ExpectedContentType "application/json"
