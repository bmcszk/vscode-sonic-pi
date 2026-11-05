export type SpiderPorts = {
	// server-listen-to-gui (spider argv[1]): the port we send /run-code etc. to
	sendToServerPort: number
	// server-send-to-gui (spider argv[2]): the port we listen on for server messages
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
	const [sendToServerPort, listenFromServerPort, scsynthPort, , oscCuesPort, token] = numbers
	const ports = [sendToServerPort, listenFromServerPort, scsynthPort, oscCuesPort]
	if (ports.some((p) => p < 1 || p > 65535)) {
		return undefined
	}
	return { sendToServerPort, listenFromServerPort, oscCuesPort, token }
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

export type DaemonExitRoute = {
	// daemon-keep-alive port: /daemon/exit goes here
	daemonPort: number
	// the daemon's own token: /daemon/exit verifies args[0] against it
	token: number
}

// The daemon prints its selected ports and token at boot (and at exit):
// `Selected ports: {"spider-listen-to-gui" => .., .., "daemon" => 29822}` then `Token: -713811861`.
// The last entry with both values is the current daemon generation - that is the
// takeover route: /daemon/exit(token) to daemonPort ends the old daemon cleanly.
export function takeOverRoute(booterLog: string): DaemonExitRoute | undefined {
	const portMatches = [...booterLog.matchAll(/"daemon"\s*=>\s*(\d+)/g)]
	const tokenMatches = [...booterLog.matchAll(/Token:\s*(-?\d+)/g)]
	const lastPort = portMatches[portMatches.length - 1]
	const lastToken = tokenMatches[tokenMatches.length - 1]
	if (!lastPort || !lastToken) {
		return undefined
	}
	return { daemonPort: Number(lastPort[1]), token: Number(lastToken[1]) }
}

const fs = require('fs')

// Scans the real /proc for a running spider-server.rb
export function findRunningSpiderServer(): SpiderPorts | undefined {
	return findRunningServer(
		() => fs.readdirSync('/proc').filter((p: string) => /^\d+$/.test(p)),
		(path: string) => fs.readFileSync(path, 'utf8'),
	)
}

// Sends the daemon's own OSC exit command through an ephemeral sender. The daemon
// verifies the token, shuts down cleanly (audio server included), and frees its
// ports: the caller can then boot a fresh daemon and own the connection.
