#!/bin/sh
# Installs the folio command into ~/.local/bin (or $FOLIO_BIN_DIR) from the
# latest GitHub release. For machines without the Folio app: a server you
# review on over SSH, a container an agent runs in.
set -eu

os=$(uname -s)
arch=$(uname -m)
case "$os-$arch" in
  Darwin-arm64)  triple=aarch64-apple-darwin ;;
  Darwin-x86_64) triple=x86_64-apple-darwin ;;
  Linux-x86_64)  triple=x86_64-unknown-linux-gnu ;;
  Linux-aarch64) triple=aarch64-unknown-linux-gnu ;;
  *) echo "folio: no build for $os $arch" >&2; exit 1 ;;
esac

dir="${FOLIO_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$dir"
url="https://github.com/rahult/folio/releases/latest/download/folio-$triple.tar.gz"
curl -fsSL "$url" | tar xz -C "$dir"
chmod +x "$dir/folio"
echo "installed $dir/folio"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "add $dir to your PATH to use it" ;;
esac
