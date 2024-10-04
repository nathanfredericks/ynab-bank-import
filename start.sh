#!/bin/bash

xvfb-run node dist/index.js --bank bmo
xvfb-run node dist/index.js --bank tangerine
xvfb-run node dist/index.js --bank manulife-bank
