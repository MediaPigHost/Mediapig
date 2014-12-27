#!/bin/sh

set -e

rsync -rPt --delete --exclude=.idea --exclude=.DS_Store ./ mediapig@staging.mediapig.co.uk:/home/mediapig/node

ssh mediapig@staging.mediapig.co.uk 'sudo /etc/init.d/node-mpig restart'
