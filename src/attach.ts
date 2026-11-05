export type SpiderPorts = {
	// daemon-keep-alive: the daemon's own port; keep-alive pings go here
	daemonPort: number
	// gui-send-to-server: the port we send /run-code etc. to (args[2])
	sendToServerPort: number
	// gui-listen-to-server: the port we listen on for server messages (args[1])
	listenFromServerPort: number
	oscCuesPort: number
	token: number
}

const SPIDER_SCRIPT_SUFFIX = '/spider-server.rb'
const ARGS_AFTER_U = 6

// Pure: parses the NUL-separated /proc/<pid>/cmdline shape
// `... spider-server.rb -u <server_port> <gui_port> <scsynth_port> <scsynth_send_port> <osc_cues_port> <token>`
export function parseSpiderCmdline(cmdline: string): SpiderPorts | undefined {
	const args = cmdline.split('\0').filter((a) => a !== '')
	const scriptIndex = args.findIndex((a) => a.endsWith(SPIDER_SCRIPT_SUFFIX))
	if (scriptIndex === -1 || args[scriptIndex + 1] !== '-u') {
		return undefined
	}
	const values = args.slice(scriptIndex + 2)
	if (values.length !== ARGS_AFTER_U) {
		return undefined
	}
	const numbers = values.map((v) => Number(v))
	if (numbers.some((n) => !Number.isInteger(n))) {
		return undefined
	}
	const [daemonPort, listenFromServerPort, sendToServerPort, scsynthPort, oscCuesPort, token] = numbers
	const ports = [daemonPort, listenFromServerPort, sendToServerPort, scsynthPort, oscCuesPort]
	if (ports.some((p) => p < 1 || p > 65535)) {
		return undefined
	}
	return { daemonPort, sendToServerPort, listenFromServerPort, oscCuesPort, token }
}

// Mechanism wrapper with injected fs so tests never touch /proc
export function findRunningServer(
	readDirFn: () => string[],
	readFileFn: (path: string) => string,
): SpiderPorts | undefined {
	let pids: string[]
	try {
		pids = readDirFn()
	} catch {
		return undefined
	}
	for (const pid of pids) {
		let cmdline: string
		try {
			cmdline = readFileFn(`/proc/${pid}/cmdline`)
		} catch {
			continue
		}
		const ports = parseSpiderCmdline(cmdline)
		if (ports) {
			return ports
		}
	}
	return undefined
}

const fs = require('fs')

// Scans the real /proc for a running spider-server.rb
export function findRunningSpiderServer(): SpiderPorts | undefined {
	return findRunningServer(
		() => fs.readdirSync('/proc').filter((p: string) => /^\d+$/.test(p)),
		(path: string) => fs.readFileSync(path, 'utf8'),
	)
}
