import dgram from 'dgram'
import OSC from 'osc-js'

// Pure argument parser: infers int/float/string from string arguments.
// Rules: integer (optional - + digits), float (optional - + digits . digits), otherwise string.
export function parseArgs(args: string[]): (number | string)[] {
	return args.map((arg) => {
		// Integer: optional sign followed by digits only
		if (/^[+-]?\d+$/.test(arg)) {
			return parseInt(arg, 10)
		}
		// Float: optional sign followed by digits, dot, digits
		if (/^[+-]?\d+\.\d+$/.test(arg)) {
			return parseFloat(arg)
		}
		// Everything else is a string
		return arg
	})
}

// UDP sender to the serverOscCuesPort.
// Packs an OSC message with address, guiUuid (token), and typed args, then sends via connected UDP socket.
export class CueBenchSender {
	private socket: dgram.Socket
	private connectReady = false
	private pending: Array<{
		bytes: Buffer
		resolve: (value: void) => void
		reject: (reason: Error) => void
	}> = []

	constructor(private port: number) {
		this.socket = dgram.createSocket('udp4')
		this.socket.bind(0, '127.0.0.1')
		this.socket.on('error', (error: Error) => {
			for (const item of this.pending.splice(0)) {
				item.reject(error)
			}
		})
		if (port > 0) {
			this.socket.connect(port, '127.0.0.1', () => {
				this.connectReady = true
				for (const item of this.pending.splice(0)) {
					this.deliver(item.bytes, item.resolve, item.reject)
				}
			})
		}
	}

	private deliver(bytes: Buffer, resolve: (value: void) => void, reject: (reason: Error) => void) {
		this.socket.send(bytes, 0, bytes.length, (error) => {
			if (error) {
				reject(error)
			} else {
				resolve()
			}
		})
	}

	// Sends a test cue to the cue port.
	// address: OSC address (e.g., '/foo/orca')
	// args: string arguments that will be type-inferred (int/float/string)
	// Returns a promise that resolves when the datagram is sent.
	async sendTestCue(address: string, args: string[]): Promise<void> {
		if (this.port <= 0) {
			throw new Error(`cue port unresolved (port=${this.port}); cannot send test cue`)
		}
		const typedArgs = parseArgs(args)
		// OSC message format: address, guiUuid (token), then typed args
		// The guiUuid is not known here - we use 0 as placeholder, the daemon will echo it back
		// with the proper token. For the round-trip test, we just need the message to reach the daemon.
		const message = new OSC.Message(address, 0, ...typedArgs)
		const bytes = Buffer.from(message.pack())

		return new Promise((resolve, reject) => {
			if (this.connectReady) {
				this.deliver(bytes, resolve, reject)
			} else {
				this.pending.push({ bytes, resolve, reject })
			}
		})
	}
}
