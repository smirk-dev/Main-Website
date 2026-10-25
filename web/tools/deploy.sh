#!/bin/bash
# Production deploy of suryanshmishra.vercel.app (Vercel project suryanshmishra). The site is uploaded from this machine
# by the Vercel CLI, not built from Git: public/assets (~360 MB: the forest, the statues, the films) is gitignored, so a
# Git build would ship a site without its world. The repo root's vercel.json turns Git deployments off for that reason.
# Hobby refuses any single file over 100 MB, so the tour ships as its halves (tools/tour/encode.sh), never the whole films.
# usage: tools/deploy.sh [--preview]
set -e
cd "$(dirname "$0")/.."
npm run build
S=$(mktemp -d)
cp -r dist/. "$S/"
rm -f "$S/assets/tour/tour.mp4" "$S/assets/tour/tour_av1.mp4"
# no resume.pdf: it carries his address and phone number, so the site links his Linktree instead (2026-10-25)
mkdir -p "$S/.vercel"
echo '{"projectId":"prj_resCZlByDbg3eod9X1KZFFJmzbqm","orgId":"team_juHWX2jQoSjOygkgwSNXir9r","projectName":"suryanshmishra"}' > "$S/.vercel/project.json"
big=$(find "$S" -type f -size +99M)
if [ -n "$big" ]; then echo "over Vercel's 100 MB file limit: $big"; exit 1; fi
echo "deploying $(du -sh "$S" | cut -f1) in $(find "$S" -type f | wc -l) files"
cd "$S"
if [ "$1" = "--preview" ]; then vercel deploy --yes; else vercel deploy --prod --yes; fi
