#!/bin/sh
# Merakit folder "ninonime/" untuk ninokuu.site: aplikasi + halaman verifikasi + halaman reset password.
# Pemakaian:  sh scripts/rakit-situs.sh <folder-tujuan>     (hasil: <folder-tujuan>/ninonime/)
set -e
OUT="${1:?Isi folder tujuan, contoh: sh scripts/rakit-situs.sh ../ninokuu-site}/ninonime"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r index.html config.js manifest.webmanifest sw.js css js icons "$OUT"/
cp -r site/verified site/resetpassword "$OUT"/
echo "Selesai: $OUT"
