#! /usr/bin/env node
var shell = require("shelljs");

// shell.exec("github-pages-commit && github-pages-push");
shell.exec("echo " + process.argv[2] + process.argv[3]);