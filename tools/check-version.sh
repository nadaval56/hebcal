#!/bin/sh
# בודק שמספר הגרסה זהה ב־js/app.js וב־sw.js.
# אם הם נפרדים, המטמון הישן אינו מתפנה ומספר הגרסה שמוצג בהגדרות אינו נכון.
set -e
cd "$(dirname "$0")/.."
app=$(sed -n "s/.*APP_VERSION = '\([0-9.]*\)'.*/\1/p" js/app.js | head -1)
sw=$(sed -n "s/^var VERSION = '\([0-9.]*\)'.*/\1/p" sw.js | head -1)
if [ -z "$app" ] || [ -z "$sw" ]; then
  echo "לא נמצא מספר גרסה (app='$app' sw='$sw')" >&2
  exit 1
fi
if [ "$app" != "$sw" ]; then
  echo "אי־התאמה: js/app.js=$app אך sw.js=$sw" >&2
  exit 1
fi
echo "גרסה $app — תואמת בשני הקבצים"
