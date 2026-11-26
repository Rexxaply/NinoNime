#!/bin/sh
# Merakit folder aplikasi NinoNime di ninokuu.site: <tujuan>/ninonime/app/ (+ verified, resetpassword).
# Halaman unduh (ninonime/index.html) dan update (ninonime/update/) dikelola langsung di repo ninokuu-site, tidak ditimpa.
# Pemakaian:  sh scripts/rakit-situs.sh <folder-tujuan>
set -e
DEST="${1:?Isi folder tujuan, contoh: sh scripts/rakit-situs.sh ../ninokuu-site}/ninonime"
mkdir -p "$DEST"
rm -rf "$DEST/app" "$DEST/verified" "$DEST/resetpassword"
mkdir -p "$DEST/app"
cp -r index.html config.js manifest.webmanifest sw.js css js icons "$DEST/app"/
cp -r site/verified site/resetpassword "$DEST"/
sed -i 's#\.\./icons/#../app/icons/#g; s#"\.\./\#/akun"#"../app/\#/akun"#g' "$DEST/verified/index.html" "$DEST/resetpassword/index.html"
echo "Selesai: $DEST/app"
