#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SSH_PUBLIC_KEY:-}" ]]; then
  echo "SSH_PUBLIC_KEY is not set. Add it to your .env file before running this script." >&2
  exit 1
fi

if [[ ! "$SSH_PUBLIC_KEY" =~ ^ssh- ]]; then
  echo "SSH_PUBLIC_KEY does not look like a valid SSH public key." >&2
  exit 1
fi

SSH_DIR="$HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [[ -f "$AUTHORIZED_KEYS" ]] && rg -q --fixed-strings "$SSH_PUBLIC_KEY" "$AUTHORIZED_KEYS"; then
  echo "SSH public key already present in $AUTHORIZED_KEYS."
  exit 0
fi

touch "$AUTHORIZED_KEYS"
chmod 600 "$AUTHORIZED_KEYS"

echo "$SSH_PUBLIC_KEY" >> "$AUTHORIZED_KEYS"

echo "Added SSH public key to $AUTHORIZED_KEYS."
