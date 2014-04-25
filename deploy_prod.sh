#!/bin/sh

set -e

rsync -rPt --delete --exclude=.idea --exclude=.DS_Store ./ mediapig@live.mediapig.co.uk:/home/mediapig/public_html

ssh mediapig@live.mediapig.co.uk node --harmony /home/mediapig/public_html/server.js &
