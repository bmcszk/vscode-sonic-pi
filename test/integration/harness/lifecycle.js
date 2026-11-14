// Runs before the suites (mochaGlobalSetup) and after them (mochaGlobalTeardown) inside the
// Extension Development Host. The daemons the extension boots are detached on purpose, so the
// teardown is what guarantees no fake Sonic Pi outlives a failed suite.

const fs = require('fs')
const path = require('path')

function readEvents() {
	const eventsPath = path.join(process.env.SONIC_PI_FAKE_DIR, 'events.ndjson')
	let raw
	try {
		raw = fs.readFileSync(eventsPath, 'utf8')
	} catch {
		return []
	}
	return raw
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line))
}

exports.mochaGlobalSetup = async function () {
	for (const name of ['SONIC_PI_FAKE_DIR', 'SONIC_PI_IT_WORKSPACE', 'SONIC_PI_IT_REPO', 'HOME']) {
		if (!process.env[name]) throw new Error(`integration harness requires ${name}`)
	}
}

exports.mochaGlobalTeardown = async function () {
	const events = readEvents()
	const exited = new Set(events.filter((entry) => entry.event === 'exit').map((entry) => entry.pid))
	for (const boot of events.filter((entry) => entry.event === 'boot')) {
		if (exited.has(boot.pid)) continue
		try {
			process.kill(boot.pid, 'SIGTERM')
		} catch {
			// already gone
		}
	}
}
