#!/bin/sh

set -e

rsync -rPt --delete --exclude=.idea --exclude=.DS_Store ./ mediapig@staging.mediapig.io:/home/mediapig/node

ssh mediapig@staging.mediapig.io 'sudo /etc/init.d/node-mpig restart'
