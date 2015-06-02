#!/bin/sh

set -e

rsync -rPt --delete --exclude=.idea --exclude=.DS_Store ./ mediapig@live.mediapig.io:/home/mediapig/node

ssh mediapig@live.mediapig.io 'sudo /etc/init.d/node-mpig restart'
