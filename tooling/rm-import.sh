#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# rm-import.sh — Safely import a .rm file to a reMarkable 2 tablet
# ============================================================================
#
# Usage:
#   ./tooling/rm-import.sh <path-to-file.rm> [document-name]
#   ./tooling/rm-import.sh --dry-run <path-to-file.rm> [document-name]
#   ./tooling/rm-import.sh --backup-only
#
# Examples:
#   ./tooling/rm-import.sh rmc/tests/rm/writing_tools.rm "My Notebook"
#   ./tooling/rm-import.sh --dry-run rmc/tests/rm/writing_tools.rm
#   ./tooling/rm-import.sh --backup-only
#
# Safety features:
#   - Always backs up xochitl data before any modification
#   - Stops xochitl before writing (per official reMarkable docs)
#   - Validates .rm file header before uploading
#   - Verifies file permissions match existing documents
#   - Restarts xochitl even if the script fails (trap handler)
#   - Dry-run mode to preview actions without modifying the device
#
# Requirements:
#   - sshpass (brew install sshpass)
#   - USB connection to reMarkable at 10.11.99.1
#
# References:
#   - https://developer.remarkable.com/documentation/xochitl
#   - Xochitl must be stopped when modifying documents
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load SSH config
source "${SCRIPT_DIR}/rm-ssh.sh"

# Defaults
DRY_RUN=false
BACKUP_ONLY=false
BACKUP_DIR="${PROJECT_DIR}/backups"

# Colors (if terminal supports it)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

log()   { echo -e "${GREEN}[OK]${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()  { echo -e "${BLUE}[INFO]${NC} $*" >&2; }
step()  { echo -e "${BLUE}[STEP]${NC} $*" >&2; }

# ---- Argument parsing ------------------------------------------------------

usage() {
    echo "Usage: $0 [--dry-run] <file.rm> [document-name]"
    echo "       $0 --backup-only"
    echo ""
    echo "Options:"
    echo "  --dry-run       Preview actions without modifying the device"
    echo "  --backup-only   Only backup the xochitl directory, then exit"
    echo "  -h, --help      Show this help"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)    DRY_RUN=true; shift ;;
        --backup-only) BACKUP_ONLY=true; shift ;;
        -h|--help)    usage ;;
        -*)           err "Unknown option: $1"; usage ;;
        *)            break ;;
    esac
done

if [[ "${BACKUP_ONLY}" == false ]]; then
    if [[ $# -lt 1 ]]; then
        err "Missing required argument: path to .rm file"
        usage
    fi
    RM_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
    DOC_NAME="${2:-$(basename "$1" .rm)}"
fi

# ---- Preflight checks ------------------------------------------------------

preflight() {
    step "Running preflight checks..."

    # Check sshpass
    if ! command -v sshpass &>/dev/null; then
        err "sshpass is not installed. Install with: brew install sshpass"
        exit 1
    fi

    # Check connectivity
    if ! ping -c 1 -t 3 "${RM_HOST}" &>/dev/null; then
        err "Cannot reach reMarkable at ${RM_HOST}"
        err "Make sure the tablet is connected via USB and powered on."
        exit 1
    fi

    # Check SSH
    if ! rm_ssh 'echo ok' &>/dev/null; then
        err "SSH connection failed. Check password in tooling/rm-ssh.sh"
        exit 1
    fi

    log "Device reachable via SSH"

    # Get device info
    local fw_version
    fw_version=$(rm_ssh 'cat /etc/version 2>/dev/null || echo "unknown"')
    local device
    device=$(rm_ssh 'cat /sys/devices/soc0/machine 2>/dev/null || echo "unknown"')
    info "Device: ${device}, Firmware: ${fw_version}"

    if [[ "${BACKUP_ONLY}" == false ]]; then
        # Check .rm file exists
        if [[ ! -f "${RM_FILE}" ]]; then
            err "File not found: ${RM_FILE}"
            exit 1
        fi

        # Validate .rm header
        local header
        header=$(dd if="${RM_FILE}" bs=1 count=43 2>/dev/null | strings)
        if [[ "${header}" != *"reMarkable .lines file"* ]]; then
            err "Invalid .rm file: header does not match reMarkable format"
            err "Got: ${header}"
            exit 1
        fi

        local version
        version=$(echo "${header}" | grep -o 'version=[0-9]*' || echo "unknown")
        log "Valid .rm file: ${version} ($(stat -f%z "${RM_FILE}" 2>/dev/null || stat -c%s "${RM_FILE}" 2>/dev/null) bytes)"
    fi
}

# ---- Backup ----------------------------------------------------------------

backup_xochitl() {
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local dest="${BACKUP_DIR}/remarkable-${timestamp}"
    mkdir -p "${dest}"

    step "Backing up xochitl to ${dest}/ ..."
    rm_scp_dir_from "${RM_XOCHITL_DIR}/" "${dest}/xochitl/"

    local file_count
    file_count=$(find "${dest}" -type f | wc -l | tr -d ' ')
    local size
    size=$(du -sh "${dest}" | cut -f1 | tr -d ' ')
    log "Backup complete: ${file_count} files, ${size}"
    echo "${dest}"
}

# ---- xochitl lifecycle -----------------------------------------------------

XOCHITL_WAS_STOPPED=false

stop_xochitl() {
    step "Stopping xochitl..."
    if rm_ssh 'systemctl is-active xochitl' 2>/dev/null | grep -q 'active'; then
        if [[ "${DRY_RUN}" == true ]]; then
            info "[DRY RUN] Would stop xochitl"
        else
            rm_ssh 'systemctl stop xochitl'
            sleep 1
            if rm_ssh 'systemctl is-active xochitl' 2>/dev/null | grep -q 'inactive'; then
                log "xochitl stopped"
                XOCHITL_WAS_STOPPED=true
            else
                err "Failed to stop xochitl!"
                exit 1
            fi
        fi
    else
        warn "xochitl is already stopped"
    fi
}

start_xochitl() {
    step "Starting xochitl..."
    if [[ "${DRY_RUN}" == true ]]; then
        info "[DRY RUN] Would start xochitl"
        return
    fi

    rm_ssh 'systemctl start xochitl'
    sleep 2

    if rm_ssh 'systemctl is-active xochitl' 2>/dev/null | grep -q 'active'; then
        log "xochitl started and active"
    else
        err "xochitl failed to start! Check the device."
        err "You may need to SSH in and run: systemctl start xochitl"
        exit 1
    fi
}

# Ensure xochitl is restarted even on failure
cleanup() {
    if [[ "${XOCHITL_WAS_STOPPED}" == true ]]; then
        warn "Ensuring xochitl is restarted after error..."
        rm_ssh 'systemctl start xochitl' 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---- Import ----------------------------------------------------------------

import_rm_file() {
    local doc_uuid page_uuid now_ms file_size

    doc_uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
    page_uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
    now_ms=$(python3 -c "import time; print(int(time.time()*1000))")
    file_size=$(stat -f%z "${RM_FILE}" 2>/dev/null || stat -c%s "${RM_FILE}" 2>/dev/null)

    info "Document UUID: ${doc_uuid}"
    info "Page UUID:     ${page_uuid}"
    info "Document name: ${DOC_NAME}"
    info "File size:     ${file_size} bytes"

    if [[ "${DRY_RUN}" == true ]]; then
        info "[DRY RUN] Would create the following on device:"
        info "  ${RM_XOCHITL_DIR}/${doc_uuid}/${page_uuid}.rm"
        info "  ${RM_XOCHITL_DIR}/${doc_uuid}.metadata"
        info "  ${RM_XOCHITL_DIR}/${doc_uuid}.content"
        info "  ${RM_XOCHITL_DIR}/${doc_uuid}.thumbnails/"
        return
    fi

    # Create directories
    step "Creating document structure..."
    rm_ssh "mkdir -p '${RM_XOCHITL_DIR}/${doc_uuid}' '${RM_XOCHITL_DIR}/${doc_uuid}.thumbnails'"

    # Copy .rm file
    step "Uploading .rm file..."
    rm_scp_to "${RM_FILE}" "${RM_XOCHITL_DIR}/${doc_uuid}/${page_uuid}.rm"

    # Create .metadata
    step "Creating metadata..."
    rm_ssh "cat > '${RM_XOCHITL_DIR}/${doc_uuid}.metadata'" <<EOF
{
    "createdTime": "${now_ms}",
    "lastModified": "${now_ms}",
    "lastOpened": "${now_ms}",
    "lastOpenedPage": 0,
    "new": true,
    "parent": "",
    "pinned": false,
    "source": "",
    "type": "DocumentType",
    "visibleName": "${DOC_NAME}"
}
EOF

    # Create .content (formatVersion 2 with cPages — matches firmware 20251130+)
    step "Creating content descriptor..."
    rm_ssh "cat > '${RM_XOCHITL_DIR}/${doc_uuid}.content'" <<EOF
{
    "cPages": {
        "lastOpened": {
            "timestamp": "0:0",
            "value": ""
        },
        "original": {
            "timestamp": "0:0",
            "value": -1
        },
        "pages": [
            {
                "id": "${page_uuid}",
                "idx": {
                    "timestamp": "1:1",
                    "value": "ba"
                },
                "template": {
                    "timestamp": "1:1",
                    "value": "Blank"
                }
            }
        ],
        "uuids": []
    },
    "coverPageNumber": -1,
    "customZoomCenterX": 0,
    "customZoomCenterY": 936,
    "customZoomOrientation": "portrait",
    "customZoomPageHeight": 1872,
    "customZoomPageWidth": 1404,
    "customZoomScale": 1,
    "documentMetadata": {
    },
    "extraMetadata": {
    },
    "fileType": "notebook",
    "fontName": "",
    "formatVersion": 2,
    "lineHeight": -1,
    "orientation": "portrait",
    "pageCount": 1,
    "pageTags": [
    ],
    "sizeInBytes": "${file_size}",
    "tags": [
    ],
    "textAlignment": "justify",
    "textScale": 1,
    "zoomMode": "bestFit"
}
EOF

    # Verify permissions
    step "Verifying file permissions..."
    local perms
    perms=$(rm_ssh "ls -la '${RM_XOCHITL_DIR}/${doc_uuid}.metadata' '${RM_XOCHITL_DIR}/${doc_uuid}.content' '${RM_XOCHITL_DIR}/${doc_uuid}/${page_uuid}.rm'" 2>&1)

    if echo "${perms}" | grep -q "^-rw-r--r--"; then
        log "Permissions verified (644)"
    else
        warn "Unexpected permissions detected:"
        echo "${perms}"
        warn "Fixing permissions..."
        rm_ssh "chmod 644 '${RM_XOCHITL_DIR}/${doc_uuid}.metadata' '${RM_XOCHITL_DIR}/${doc_uuid}.content' '${RM_XOCHITL_DIR}/${doc_uuid}/${page_uuid}.rm'"
        rm_ssh "chmod 755 '${RM_XOCHITL_DIR}/${doc_uuid}' '${RM_XOCHITL_DIR}/${doc_uuid}.thumbnails'"
    fi

    log "Document '${DOC_NAME}' created as ${doc_uuid}"
}

# ---- Main ------------------------------------------------------------------

main() {
    echo "============================================"
    echo "  reMarkable .rm File Importer"
    if [[ "${DRY_RUN}" == true ]]; then
        echo "  *** DRY RUN MODE ***"
    fi
    echo "============================================"
    echo ""

    preflight

    if [[ "${BACKUP_ONLY}" == true ]]; then
        backup_xochitl
        log "Backup-only mode complete."
        exit 0
    fi

    # Always backup first (skip in dry-run to avoid wasting disk)
    if [[ "${DRY_RUN}" == true ]]; then
        info "[DRY RUN] Would backup xochitl before import"
    else
        step "Creating backup before import..."
        local backup_path
        backup_path=$(backup_xochitl)
        info "Restore with: sshpass -p '${RM_PASS}' scp -r '${backup_path}/xochitl/' root@${RM_HOST}:${RM_XOCHITL_DIR}/"
    fi

    echo ""

    # Stop xochitl (required per official docs)
    stop_xochitl

    # Import
    import_rm_file

    # Restart xochitl
    XOCHITL_WAS_STOPPED=false  # Prevent double-start from trap
    start_xochitl

    echo ""
    log "Import complete! Check your tablet for '${DOC_NAME}'."
}

main
