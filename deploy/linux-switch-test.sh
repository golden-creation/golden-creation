#!/bin/bash
# Proves atomic symlink replacement and a /proc-style cwd check.
# It uses a private temporary directory and does not touch a live release.
set -euo pipefail

root=$(mktemp -d)
mkdir -p "$root/releases/previous" "$root/releases/next" "$root/proc/42"
printf 'previous\n' > "$root/releases/previous/marker"
printf 'next\n' > "$root/releases/next/marker"
ln -s "$root/releases/previous" "$root/current"
if [ ! -L "$root/current" ]; then
  echo "STOP: this environment cannot create a Linux symlink"
  rm -rf "$root"
  exit 1
fi
ln -s "$root/releases/next" "$root/proc/42/cwd"

switch() {
  local next="${root}/current.next"
  rm -f "$next"
  ln -s "$1" "$next"
  mv -Tf "$next" "${root}/current"
}

switch "$root/releases/next"
test "$(readlink -f "$root/current")" = "$root/releases/next"
test "$(cat "$root/current/marker")" = "next"
ln -sfn "$root/releases/next" "$root/proc/42/cwd"
test "$(readlink -f "$root/proc/42/cwd")" = "$(readlink -f "$root/current")"

switch "$root/releases/previous"
test "$(readlink -f "$root/current")" = "$root/releases/previous"
test "$(cat "$root/current/marker")" = "previous"
ln -sfn "$root/releases/previous" "$root/proc/42/cwd"
test "$(readlink -f "$root/proc/42/cwd")" = "$(readlink -f "$root/current")"
test ! -e "$root/current.next"

rm -rf "$root"
echo "linux_symlink=ok"
echo "linux_rollback=ok"
