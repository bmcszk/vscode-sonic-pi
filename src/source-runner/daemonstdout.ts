export type DaemonPorts = {
	daemonPort: number
	guiListenToServerPort: number
	serverSendToGuiPort: number
	token: number
}

// Order: daemon-keep-alive gui-listen-to-server gui-send-to-server scsynth osc-cues [tau-api tau-phx] token
// 4.x prints the two tau ports, 5.x does not, but the token is always the last value.
export function parseDaemonStdout(line: string): DaemonPorts | null {
	const parts = line.trim().split(/\s+/)
	const token = parseInt(parts[parts.length - 1])
	if (!Number.isInteger(token)) {
		return null
	}
	return {
		daemonPort: parseInt(parts[0]),
		guiListenToServerPort: parseInt(parts[1]),
		serverSendToGuiPort: parseInt(parts[2]),
		token: token,
	}
}
