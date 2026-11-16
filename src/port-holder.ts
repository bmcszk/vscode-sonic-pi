import * as fs from 'fs'

// Who owns the reply port when our bind fails: the real Sonic Pi app, another VS Code
// window, or some unrelated program. The deaf-window message must name the real holder,
// because "press Play again to bring the logs here" only makes sense if the user knows
// whose GUI the logs went to.
export type LogHolder = 'sonic-pi-app' | 'vscode-window' | 'another-program'

export const holderSubject = (holder: LogHolder): string => {
	if (holder === 'sonic-pi-app') return 'The Sonic Pi app'
	if (holder === 'vscode-window') return 'Another VS Code window'
	return 'Another program'
}

export const classifyLogHolder = (holderCmdline: string, selfCmdline: string): LogHolder => {
	const cmdline = holderCmdline.replace(/\0/g, ' ')
	if (cmdline.includes('/usr/bin/sonic-pi') || cmdline.endsWith('sonic-pi')) return 'sonic-pi-app'
	if (cmdline === selfCmdline.replace(/\0/g, ' ') || cmdline.includes('code')) return 'vscode-window'
	return 'another-program'
}

// Linux only: resolve the pid owning a local UDP port through /proc/net/udp + /proc/<pid>/fd,
// then read its cmdline. Any failure degrades to 'another-program' - a wrong guess about the
// holder is worse than the honest fallback.
export const classifyReplyPortHolder = (
	port: number,
	deps: {
		pid: number
		readFile: (path: string) => string
		readDir: (path: string) => string[]
		readLink: (path: string) => string
	} = {
		pid: process.pid,
		readFile: (p) => fs.readFileSync(p, 'utf8'),
		readDir: (p) => fs.readdirSync(p),
		readLink: (p) => fs.readlinkSync(p),
	},
): LogHolder => {
	try {
		const inode = findUdpInode(port, deps.readFile('/proc/net/udp'))
		if (!inode) return 'another-program'
		const pid = findPidOwningSocket(inode, deps)
		if (pid === undefined) return 'another-program'
		return classifyLogHolder(
			deps.readFile(`/proc/${pid}/cmdline`),
			deps.readFile(`/proc/${deps.pid}/cmdline`),
		)
	} catch {
		return 'another-program'
	}
}

const findUdpInode = (port: number, netUdp: string): string | undefined => {
	const hexPort = port.toString(16).toUpperCase().padStart(4, '0')
	for (const line of netUdp.split('\n')) {
		const columns = line.trim().split(/\s+/)
		if (columns[1] === `0100007F:${hexPort}`) return columns[9]
	}
	return undefined
}

const findPidOwningSocket = (
	inode: string,
	deps: { readDir: (path: string) => string[]; readLink: (path: string) => string },
): number | undefined => {
	for (const entry of deps.readDir('/proc')) {
		if (!/^\d+$/.test(entry)) continue
		try {
			for (const fd of deps.readDir(`/proc/${entry}/fd`)) {
				if (deps.readLink(`/proc/${entry}/fd/${fd}`) === `socket:[${inode}]`) return Number(entry)
			}
		} catch {
			// A process can vanish or hide its fd table between readdir and readlink: skip it.
		}
	}
	return undefined
}
