#!/bin/sh

set -e

rsync -rPt --delete --exclude=.idea --exclude=.DS_Store ./ mediapig@live.mediapig.co.uk:/home/mediapig/public_html

node --harmony server.js &
