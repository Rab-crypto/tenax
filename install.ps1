#Requires -Version 5.1
<#
.SYNOPSIS
    Tenax Installer for Windows
    Persistent project memory for Claude Code

.DESCRIPTION
    This script installs Tenax, a Claude Code plugin that provides
    persistent, searchable project knowledge across sessions.

.EXAMPLE
    irm https://tenax.dev/install.ps1 | iex

.LINK
    https://tenax.dev
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
# TODO: Update these URLs when the official repository is published
$TenaxRepo = if ($env:TENAX_REPO) { $env:TENAX_REPO } else { "https://github.com/anthropics/tenax.git" }
$TenaxZip = if ($env:TENAX_ZIP) { $env:TENAX_ZIP } else { "https://github.com/anthropics/tenax/archive/main.zip" }
$TenaxDir = "$env:USERPROFILE\.claude\plugins\tenax"
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"

function Write-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║                                                           ║" -ForegroundColor Cyan
    Write-Host "  ║   " -ForegroundColor Cyan -NoNewline
    Write-Host "Tenax Installer" -ForegroundColor White -NoNewline
    Write-Host "                                       ║" -ForegroundColor Cyan
    Write-Host "  ║   Persistent project memory for Claude Code              ║" -ForegroundColor Cyan
    Write-Host "  ║                                                           ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info {
    param([string]$Message)
    Write-Host "  > " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "  + " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-WarningMessage {
    param([string]$Message)
    Write-Host "  ! " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-ErrorMessage {
    param([string]$Message)
    Write-Host "  X " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Install-Bun {
    Write-Info "Installing Bun runtime..."

    # Check if Bun is already installed
    if (Test-Command "bun") {
        $version = & bun --version 2>&1
        Write-Success "Bun is already installed ($version)"
        return
    }

    # Check common Bun installation paths
    $bunPaths = @(
        "$env:USERPROFILE\.bun\bin\bun.exe",
        "$env:BUN_INSTALL\bin\bun.exe"
    )

    foreach ($path in $bunPaths) {
        if (Test-Path $path) {
            $env:PATH = "$([System.IO.Path]::GetDirectoryName($path));$env:PATH"
            Write-Success "Found Bun at $path"
            return
        }
    }

    # Install Bun
    try {
        irm bun.sh/install.ps1 | iex

        # Add to current session PATH
        $env:BUN_INSTALL = "$env:USERPROFILE\.bun"
        $env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"

        if (Test-Command "bun") {
            $version = & bun --version 2>&1
            Write-Success "Bun installed successfully ($version)"
        } else {
            throw "Bun command not available after installation"
        }
    } catch {
        Write-ErrorMessage "Bun installation failed: $_"
        Write-Host ""
        Write-Host "  Please install Bun manually:" -ForegroundColor Yellow
        Write-Host "  irm bun.sh/install.ps1 | iex" -ForegroundColor Cyan
        Write-Host ""
        exit 1
    }
}

function Install-Tenax {
    Write-Info "Installing Tenax..."

    # Create plugins directory
    $pluginsDir = "$env:USERPROFILE\.claude\plugins"
    if (-not (Test-Path $pluginsDir)) {
        New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
    }

    # Check for existing installation
    if (Test-Path $TenaxDir) {
        Write-WarningMessage "Existing Tenax installation found, updating..."

        # Try git pull if git is available
        if (Test-Command "git") {
            try {
                Push-Location $TenaxDir
                $null = & git pull origin main 2>&1
                Pop-Location
                Write-Success "Tenax updated via git"
                return
            } catch {
                if ((Get-Location).Path -eq $TenaxDir) { Pop-Location }
                Write-WarningMessage "Git pull failed, removing and re-downloading..."
            }
        }

        # Remove and re-download
        Remove-Item -Path $TenaxDir -Recurse -Force
    }

    # Clone or download
    if (Test-Command "git") {
        try {
            $null = & git clone $TenaxRepo $TenaxDir 2>&1
            Write-Success "Tenax cloned to $TenaxDir"
            return
        } catch {
            Write-WarningMessage "Git clone failed, downloading ZIP instead..."
        }
    }

    # Download ZIP
    $zipPath = "$env:TEMP\tenax.zip"
    $extractPath = "$env:TEMP\tenax-extract"

    try {
        Write-Info "Downloading Tenax..."
        Invoke-WebRequest -Uri $TenaxZip -OutFile $zipPath -UseBasicParsing

        # Extract
        if (Test-Path $extractPath) {
            Remove-Item -Path $extractPath -Recurse -Force
        }
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

        # Move to final location
        $extractedDir = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
        Move-Item -Path $extractedDir.FullName -Destination $TenaxDir -Force

        # Cleanup
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue

        Write-Success "Tenax downloaded to $TenaxDir"
    } catch {
        Write-ErrorMessage "Failed to download Tenax: $_"
        exit 1
    }
}

function Install-Dependencies {
    Write-Info "Installing dependencies..."

    try {
        Push-Location $TenaxDir

        # Get bun path
        $bunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
        if (-not (Test-Path $bunPath)) {
            $bunPath = "bun"
        }

        $null = & $bunPath install 2>&1

        Pop-Location
        Write-Success "Dependencies installed"
    } catch {
        if ((Get-Location).Path -eq $TenaxDir) { Pop-Location }
        Write-ErrorMessage "Failed to install dependencies: $_"
        exit 1
    }
}

function Configure-Claude {
    Write-Info "Configuring Claude Code..."

    # Create .claude directory
    $claudeDir = "$env:USERPROFILE\.claude"
    if (-not (Test-Path $claudeDir)) {
        New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    }

    $marketplace = @{
        name = "local-plugins"
        source = @{
            type = "directory"
            path = "~/.claude/plugins"
        }
    }

    if (Test-Path $SettingsFile) {
        try {
            $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json

            # Check if already configured
            if ($settings.extraKnownMarketplaces) {
                $existing = $settings.extraKnownMarketplaces | Where-Object { $_.name -eq "local-plugins" }
                if ($existing) {
                    Write-Success "Claude Code already configured for local plugins"
                    return
                }
            }

            # Backup existing settings
            Copy-Item $SettingsFile "$SettingsFile.backup"
            Write-WarningMessage "Existing settings backed up to $SettingsFile.backup"

            # Add marketplace
            if (-not $settings.extraKnownMarketplaces) {
                $settings | Add-Member -NotePropertyName "extraKnownMarketplaces" -NotePropertyValue @()
            }
            $settings.extraKnownMarketplaces += $marketplace

            $json = $settings | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
        } catch {
            Write-WarningMessage "Could not parse existing settings, creating new file..."
            $newSettings = @{
                extraKnownMarketplaces = @($marketplace)
            }
            $json = $newSettings | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
        }
    } else {
        # Create new settings file
        $settings = @{
            extraKnownMarketplaces = @($marketplace)
        }
        $json = $settings | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($SettingsFile, $json, [System.Text.UTF8Encoding]::new($false))
    }

    Write-Success "Claude Code configured"
}

function Write-SuccessBanner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║                                                           ║" -ForegroundColor Green
    Write-Host "  ║   " -ForegroundColor Green -NoNewline
    Write-Host "Installation Complete!" -ForegroundColor White -NoNewline
    Write-Host "                                ║" -ForegroundColor Green
    Write-Host "  ║                                                           ║" -ForegroundColor Green
    Write-Host "  ╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. Start Claude Code:"
    Write-Host "     " -NoNewline
    Write-Host "claude" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Verify Tenax is loaded:"
    Write-Host "     " -NoNewline
    Write-Host "/tenax:status" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. Start capturing knowledge:"
    Write-Host "     Use markers like " -NoNewline
    Write-Host "[D] topic: decision" -ForegroundColor Cyan -NoNewline
    Write-Host " in your conversations"
    Write-Host ""
    Write-Host "  Documentation: " -NoNewline
    Write-Host "https://tenax.dev/docs" -ForegroundColor Cyan
    Write-Host "  Commands:      " -NoNewline
    Write-Host "https://tenax.dev/docs/commands.html" -ForegroundColor Cyan
    Write-Host ""
}

function Main {
    Write-Banner

    # Check for Claude Code
    if (-not (Test-Command "claude")) {
        Write-WarningMessage "Claude Code CLI not found in PATH"
        Write-WarningMessage "Make sure Claude Code is installed: https://claude.ai/code"
        Write-Host ""
    }

    Install-Bun
    Write-Host ""

    Install-Tenax
    Write-Host ""

    Install-Dependencies
    Write-Host ""

    Configure-Claude

    Write-SuccessBanner
}

# Run main
Main
