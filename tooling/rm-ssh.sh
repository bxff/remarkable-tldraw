#!/usr/bin/env bash
# reMarkable 2 SSH connection helper
# Usage: source tooling/rm-ssh.sh
#
# WARNING: This file contains a plaintext password.
# Consider switching to SSH key-based authentication:
#   ssh-keygen -t ed25519 -f ~/.ssh/remarkable
#   ssh-copy-id -i ~/.ssh/remarkable root@10.11.99.1
#
# After setting up key auth, remove the password from this file
# and the sshpass dependency.

export RM_HOST="10.11.99.1"
export RM_USER="root"
export RM_PASS="htDoflTTZW"
export RM_XOCHITL_DIR="/home/root/.local/share/remarkable/xochitl"

# SSH/SCP with password auth
rm_ssh() {
    sshpass -p "${RM_PASS}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${RM_USER}@${RM_HOST}" "$@"
}

rm_scp_to() {
    # Usage: rm_scp_to <local_file> <remote_path>
    sshpass -p "${RM_PASS}" scp -o StrictHostKeyChecking=no "$1" "${RM_USER}@${RM_HOST}:$2"
}

rm_scp_from() {
    # Usage: rm_scp_from <remote_path> <local_file>
    sshpass -p "${RM_PASS}" scp -o StrictHostKeyChecking=no "${RM_USER}@${RM_HOST}:$1" "$2"
}

rm_scp_dir_from() {
    # Usage: rm_scp_dir_from <remote_dir> <local_dir>
    sshpass -p "${RM_PASS}" scp -o StrictHostKeyChecking=no -r "${RM_USER}@${RM_HOST}:$1" "$2"
}

export -f rm_ssh rm_scp_to rm_scp_from rm_scp_dir_from
