#!/bin/bash
#
# Tenax Installer for macOS/Linux
# Persistent project memory for Claude Code
#
# Usage: curl -fsSL https://raw.githubusercontent.com/Rab-crypto/tenax/main/install.sh | bash
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
# Override with TENAX_REPO environment variable if needed
TENAX_REPO="${TENAX_REPO:-https://github.com/Rab-crypto/tenax.git}"
TENAX_DIR="$HOME/.claude/plugins/tenax"
SETTINGS_FILE="$HOME/.claude/settings.json"

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}   ${BOLD}Tenax Installer${NC}                                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}   Persistent project memory for Claude Code              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                           ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

info() {
    echo -e "${BLUE}→${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}!${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos";;
        Linux*)     echo "linux";;
        *)          echo "unknown";;
    esac
}

install_bun() {
    info "Installing Bun runtime..."

    if check_command bun; then
        success "Bun is already installed ($(bun --version))"
        return 0
    fi

    # Check for curl
    if ! check_command curl; then
        error "curl is required but not installed."
        error "Install it with your package manager (apt, yum, brew, etc.)"
        exit 1
    fi

    curl -fsSL https://bun.sh/install | bash

    # Add to current session (sourcing shell rc files can fail when piped)
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if check_command bun; then
        success "Bun installed successfully ($(bun --version))"
    else
        error "Bun installation failed. Please install manually: https://bun.sh"
        exit 1
    fi
}

install_tenax() {
    info "Installing Tenax..."

    # Create plugins directory
    mkdir -p "$HOME/.claude/plugins"

    # Remove existing installation if present
    if [ -d "$TENAX_DIR" ]; then
        warn "Existing Tenax installation found, updating..."
        if check_command git; then
            (cd "$TENAX_DIR" && git pull origin main 2>/dev/null) || {
                warn "Git pull failed, removing and re-cloning..."
                rm -rf "$TENAX_DIR"
                git clone "$TENAX_REPO" "$TENAX_DIR"
            }
        else
            warn "Git not available, removing and re-downloading..."
            rm -rf "$TENAX_DIR"
        fi
    fi

    if [ ! -d "$TENAX_DIR" ]; then
        if check_command git; then
            git clone "$TENAX_REPO" "$TENAX_DIR"
        else
            warn "Git not found, downloading ZIP instead..."
            if ! check_command unzip; then
                error "unzip is required but not installed."
                error "Install it with: apt install unzip (Debian/Ubuntu) or brew install unzip (macOS)"
                exit 1
            fi
            TENAX_ZIP="${TENAX_ZIP:-https://github.com/Rab-crypto/tenax/archive/main.zip}"
            curl -fsSL "$TENAX_ZIP" -o /tmp/tenax.zip
            unzip -q /tmp/tenax.zip -d /tmp
            mv /tmp/tenax-main "$TENAX_DIR"
            rm /tmp/tenax.zip
        fi
    fi

    success "Tenax downloaded to $TENAX_DIR"
}

install_dependencies() {
    info "Installing dependencies..."

    (cd "$TENAX_DIR" && bun install)

    success "Dependencies installed"
}

configure_claude() {
    info "Configuring Claude Code..."

    # Create .claude directory if it doesn't exist
    mkdir -p "$HOME/.claude"

    # Check if settings file exists
    if [ -f "$SETTINGS_FILE" ]; then
        # Check if extraKnownMarketplaces already configured
        if grep -q "local-plugins" "$SETTINGS_FILE" 2>/dev/null; then
            success "Claude Code already configured for local plugins"
            return 0
        fi

        # Backup existing settings
        cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup"
        warn "Existing settings backed up to ${SETTINGS_FILE}.backup"

        # Try to merge settings using jq if available
        if check_command jq; then
            local new_marketplace='{"name":"local-plugins","source":{"type":"directory","path":"~/.claude/plugins"}}'

            # Check if extraKnownMarketplaces exists
            if jq -e '.extraKnownMarketplaces' "$SETTINGS_FILE" >/dev/null 2>&1; then
                # Add to existing array
                jq ".extraKnownMarketplaces += [$new_marketplace]" "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
            else
                # Create new array
                jq ". + {extraKnownMarketplaces: [$new_marketplace]}" "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
            fi
            mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        else
            warn "jq not found. Please manually add local-plugins marketplace to $SETTINGS_FILE"
            echo ""
            echo "Add this to your settings.json:"
            echo '  "extraKnownMarketplaces": ['
            echo '    {'
            echo '      "name": "local-plugins",'
            echo '      "source": {'
            echo '        "type": "directory",'
            echo '        "path": "~/.claude/plugins"'
            echo '      }'
            echo '    }'
            echo '  ]'
            return 0
        fi
    else
        # Create new settings file
        cat > "$SETTINGS_FILE" << 'EOF'
{
  "extraKnownMarketplaces": [
    {
      "name": "local-plugins",
      "source": {
        "type": "directory",
        "path": "~/.claude/plugins"
      }
    }
  ]
}
EOF
    fi

    success "Claude Code configured"
}

configure_permissions() {
    info "Setting up Tenax permissions..."

    # Note: Claude Code permissions don't support :* wildcards with full paths
    # Users will need to approve bun commands on first use
    local skill_permission='Skill(tenax:*)'

    if [ -f "$SETTINGS_FILE" ]; then
        if check_command jq; then
            # Check if permissions.allow exists
            if jq -e '.permissions.allow' "$SETTINGS_FILE" >/dev/null 2>&1; then
                # Add skill permission
                jq --arg skill "$skill_permission" \
                    '.permissions.allow += [$skill] | .permissions.allow |= unique' \
                    "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
                mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
                success "Skill permissions configured"
            else
                # Create permissions structure
                jq --arg skill "$skill_permission" \
                    '. + {permissions: {allow: [$skill]}}' \
                    "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
                mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
                success "Skill permissions configured"
            fi
        else
            warn "jq not found. You may need to manually approve Tenax commands on first use."
        fi
    fi
}

print_success() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}   ${BOLD}${GREEN}Installation Complete!${NC}                                ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo ""
    echo -e "  1. Start Claude Code:"
    echo -e "     ${CYAN}claude${NC}"
    echo ""
    echo -e "  2. Verify Tenax is loaded:"
    echo -e "     ${CYAN}/tenax:status${NC}"
    echo ""
    echo -e "  3. Start capturing knowledge:"
    echo -e "     Use markers like ${CYAN}[D] topic: decision${NC} in your conversations"
    echo ""
    echo -e "  ${BOLD}Documentation:${NC} https://github.com/Rab-crypto/tenax#readme"
    echo -e "  ${BOLD}Commands:${NC}      https://github.com/Rab-crypto/tenax#commands"
    echo ""
}

main() {
    print_banner

    OS=$(detect_os)
    if [ "$OS" = "unknown" ]; then
        error "Unsupported operating system. Please install manually."
        exit 1
    fi

    info "Detected OS: $OS"
    echo ""

    # Check for Claude Code
    if ! check_command claude; then
        warn "Claude Code CLI not found in PATH"
        warn "Make sure Claude Code is installed: https://claude.ai/code"
        echo ""
    fi

    install_bun
    echo ""

    install_tenax
    echo ""

    install_dependencies
    echo ""

    configure_claude
    echo ""

    configure_permissions

    print_success
}

main "$@"
