#!/usr/bin/env node
// Unit battery runner: enumerates every test/unit/*.test.js and runs each in a child
// process, failing on the first non-zero exit. Exists because the package.json chains
// grew long enough that a missing '&&' silently turned suites into argv (seven suites
// ran as arguments to cue-bench and nobody noticed). The directory listing is the
// source of truth: a new suite is in the battery because the file exists.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const unitDir = path.join(__dirname, 'unit')
const suites = fs
	.readdirSync(unitDir)
	.filter((file) => file.endsWith('.test.js') && !file.startsWith('.'))
	.sort()

const failed = []
for (const suite of suites) {
	const result = spawnSync(process.execPath, [path.join(unitDir, suite)], {
		stdio: 'inherit',
	})
	if (result.status !== 0) {
		failed.push(suite)
		console.error(`\n### ${suite} exited ${result.status}`)
	}
}

if (failed.length > 0) {
	console.error(`unit battery FAILED: ${failed.length} of ${suites.length} suites (${failed.join(', ')})`)
	process.exit(1)
}
console.log(`unit battery passed: ${suites.length} suites`)
