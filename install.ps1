#Requires -Version 5.1
<#
.SYNOPSIS
    Tenax Installer for Windows
    Persistent project memory for Claude Code

.DESCRIPTION
    This script installs Tenax, a Claude Code plugin that provides
    persistent, searchable project knowledge across sessions.

.EXAMPLE
    irm https://raw.githubusercontent.com/Rab-crypto/tenax/master/install.ps1 | iex

.LINK
    https://github.com/Rab-crypto/tenax
#>

$ErrorActionPreference = "Stop"

# Check execution policy
$policy = Get-ExecutionPolicy
if ($policy -eq "Restricted") {
    Write-Host ""
    Write-Host "  PowerShell execution policy is Restricted." -ForegroundColor Red
    Write-Host "  Run this command as Administrator first:" -ForegroundColor Yellow
    Write-Host "    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Configuration
$TenaxRepo = if ($env:TENAX_REPO) { $env:TENAX_REPO } else { "https://github.com/Rab-crypto/tenax.git" }
$TenaxZip = if ($env:TENAX_ZIP) { $env:TENAX_ZIP } else { "https://github.com/Rab-crypto/tenax/archive/master.zip" }
$TenaxDir = "$env:USERPROFILE\.claude\plugins\tenax"
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"

function Write-Banner {
    Write-Host ""
    Write-Host "  Tenax Installer" -ForegroundColor Cyan
    Write-Host "  Persistent project memory for Claude Code" -ForegroundColor Gray
    Write-Host ""
}

function Write-Info { param([string]$Message); Write-Host "  > $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message); Write-Host "  + $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message); Write-Host "  ! $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message); Write-Host "  X $Message" -ForegroundColor Red }

function Test-Command { param([string]$Command); $null = Get-Command $Command -ErrorAction SilentlyContinue; return $? }

function Install-Bun {
    Write-Info "Installing Bun runtime..."

    if (Test-Command "bun") {
        $v = & bun --version 2>&1
        Write-Success "Bun is already installed ($v)"
        return
    }

    $bunExe = "$env:USERPROFILE\.bun\bin\bun.exe"
    if (Test-Path $bunExe) {
        $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
        Write-Success "Found Bun at $bunExe"
        return
    }

    try {
        irm bun.sh/install.ps1 | iex
        $env:BUN_INSTALL = "$env:USERPROFILE\.bun"
        $env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"

        if (Test-Command "bun") {
            $v = & bun --version 2>&1
            Write-Success "Bun installed ($v)"
        } else {
            throw "Bun not available after install"
        }
    } catch {
        Write-Err "Bun installation failed: $_"
        Write-Host "  Please install manually: irm bun.sh/install.ps1 | iex" -ForegroundColor Yellow
        exit 1
    }
}

function Install-Tenax {
    Write-Info "Installing Tenax..."

    $pluginsDir = "$env:USERPROFILE\.claude\plugins"
    if (-not (Test-Path $pluginsDir)) {
        New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
    }

    if (Test-Path $TenaxDir) {
        Write-Warn "Existing installation found, updating..."
        if (Test-Command "git") {
            try {
                Push-Location $TenaxDir
                & git pull origin master 2>&1 | Out-Null
                Pop-Location
                Write-Success "Tenax updated via git"
                return
            } catch {
                if ((Get-Location).Path -eq $TenaxDir) { Pop-Location }
                Write-Warn "Git pull failed, re-downloading..."
            }
        }
        Remove-Item -Path $TenaxDir -Recurse -Force
    }

    if (Test-Command "git") {
        try {
            & git clone $TenaxRepo $TenaxDir 2>&1 | Out-Null
            Write-Success "Tenax cloned to $TenaxDir"
            return
        } catch {
            Write-Warn "Git clone failed, downloading ZIP..."
            # Clean up any partial clone
            if (Test-Path $TenaxDir) { Remove-Item -Path $TenaxDir -Recurse -Force }
        }
    }

    $zipPath = "$env:TEMP\tenax.zip"
    $extractPath = "$env:TEMP\tenax-extract"

    try {
        Write-Info "Downloading Tenax..."
        Invoke-WebRequest -Uri $TenaxZip -OutFile $zipPath -UseBasicParsing
        if (Test-Path $extractPath) { Remove-Item -Path $extractPath -Recurse -Force }
        # Ensure target doesn't exist before move
        if (Test-Path $TenaxDir) { Remove-Item -Path $TenaxDir -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        $extractedDir = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
        Move-Item -Path $extractedDir.FullName -Destination $TenaxDir -Force
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Tenax downloaded to $TenaxDir"
    } catch {
        Write-Err "Download failed: $_"
        exit 1
    }
}

function Install-Dependencies {
    Write-Info "Installing dependencies..."
    $originalLocation = Get-Location
    try {
        Set-Location $TenaxDir
        $bunExe = "$env:USERPROFILE\.bun\bin\bun.exe"
        if (-not (Test-Path $bunExe)) { $bunExe = "bun" }
        # Run bun install - use Start-Process to avoid ErrorActionPreference issues
        $proc = Start-Process -FilePath $bunExe -ArgumentList "install" -Wait -PassThru -NoNewWindow
        if ($proc.ExitCode -ne 0) {
            throw "bun install failed with exit code $($proc.ExitCode)"
        }
        Write-Success "Dependencies installed"
    } catch {
        Write-Err "Failed to install dependencies: $($_.Exception.Message)"
        exit 1
    } finally {
        Set-Location $originalLocation
    }
}

function Configure-Claude {
    Write-Info "Configuring Claude Code..."

    $claudeDir = "$env:USERPROFILE\.claude"
    if (-not (Test-Path $claudeDir)) {
        New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    }

    if (Test-Path $SettingsFile) {
        $content = Get-Content $SettingsFile -Raw -ErrorAction SilentlyContinue
        # Check if local-plugins is already configured (simple string check to avoid parse issues)
        if ($content -and $content -match "local-plugins") {
            Write-Success "Claude Code already configured for local plugins"
            return
        }
        try {
            $settings = $content | ConvertFrom-Json
            Copy-Item $SettingsFile "$SettingsFile.backup" -Force
            Write-Warn "Settings backed up to $SettingsFile.backup"
            # extraKnownMarketplaces is an object with marketplace names as keys
            if (-not $settings.extraKnownMarketplaces) {
                $settings | Add-Member -NotePropertyName "extraKnownMarketplaces" -NotePropertyValue @{} -Force
            }
            $marketplaceSource = @{ source = "directory"; path = "~/.claude/plugins" }
            $settings.extraKnownMarketplaces | Add-Member -NotePropertyName "local-plugins" -NotePropertyValue @{ source = $marketplaceSource } -Force
            $json = $settings | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
            Write-Success "Claude Code configured"
        } catch {
            # Don't overwrite on parse error - just warn user
            Write-Warn "Could not parse existing settings.json"
            Write-Warn "Please manually add local-plugins marketplace to $SettingsFile"
            Write-Host ""
            Write-Host '  Add to extraKnownMarketplaces object:' -ForegroundColor Yellow
            Write-Host '    "local-plugins": {"source":{"source":"directory","path":"~/.claude/plugins"}}' -ForegroundColor Cyan
        }
    } else {
        # Create new settings with correct object format
        $json = @'
{
  "extraKnownMarketplaces": {
    "local-plugins": {
      "source": {
        "source": "directory",
        "path": "~/.claude/plugins"
      }
    }
  }
}
'@
        [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Success "Claude Code configured"
    }
}

function Configure-Permissions {
    Write-Info "Setting up Tenax permissions..."

    # Build permissions - no quotes around path, :* at end for prefix matching
    $bunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
    $escapedPath = $bunPath.Replace('\', '\\')
    $bunPerm = "Bash($escapedPath`:*)"
    $skillPerm = "Skill(tenax:*)"

    if (Test-Path $SettingsFile) {
        try {
            $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json
            if (-not $settings.permissions) {
                $settings | Add-Member -NotePropertyName "permissions" -NotePropertyValue @{}
            }
            if (-not $settings.permissions.allow) {
                $settings.permissions | Add-Member -NotePropertyName "allow" -NotePropertyValue @()
            }
            $added = $false
            if ($settings.permissions.allow -notcontains $bunPerm) {
                $settings.permissions.allow += $bunPerm
                $added = $true
            }
            if ($settings.permissions.allow -notcontains $skillPerm) {
                $settings.permissions.allow += $skillPerm
                $added = $true
            }
            if ($added) {
                $json = $settings | ConvertTo-Json -Depth 10
                [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
                Write-Success "Permissions configured (bun.exe + skills auto-approved)"
            } else {
                Write-Success "Permissions already configured"
            }
        } catch {
            Write-Warn "Could not update permissions: $_"
        }
    }
}

function Write-Done {
    Write-Host ""
    Write-Host "  Installation Complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. Start Claude Code: claude"
    Write-Host "    2. Verify: /tenax:status"
    Write-Host ""
    Write-Host "  Docs: https://github.com/Rab-crypto/tenax" -ForegroundColor Cyan
    Write-Host ""
}

# Main
Write-Banner
if (-not (Test-Command "claude")) {
    Write-Warn "Claude Code CLI not found - install from https://claude.ai/code"
}
Install-Bun
Install-Tenax
Install-Dependencies
Configure-Claude
Configure-Permissions
Write-Done
