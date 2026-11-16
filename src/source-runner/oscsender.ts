// MIT License

// Copyright (c) 2020 Luis Lloret

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// OSC send socket. osc-js stays for message encoding, but delivery goes through our
// own dgram socket: a connected udp socket is the only way a dead destination becomes
// a visible error (ICMP port-unreachable -> 'error' event) instead of silent loss -
// that error signal is what daemon-liveness detection reads. osc-js's DatagramPlugin
// cannot do this (per-send host/port addressing is illegal on a connected socket).
import dgram from 'dgram'
import OSC from 'osc-js'

export class OscSender {
	private socket: dgram.Socket
	private errorHandlers: Array<(error: Error) => void> = []

	private connectReady = false
	private pending: Array<{ bytes: Buffer; callback?: (error?: Error | null) => void }> = []

	constructor(private port: number) {
		// Bind ephemeral: the library default ('localhost':41234) still binds when the
		// first send fires, which drops it (the first run after a cold boot vanished),
		// and 41234 can already belong to another window's sender.
		this.socket = dgram.createSocket('udp4')
		this.socket.bind(0, '127.0.0.1')
		this.socket.on('error', (error: Error) => {
			for (const handler of this.errorHandlers) {
				handler(error)
			}
		})
		// Sends are queued until connect completes: before that the socket cannot take
		// the connected-style send overload and a port-less send would throw.
		this.socket.connect(port, '127.0.0.1', () => {
			this.connectReady = true
			for (const item of this.pending.splice(0)) {
				this.deliver(item.bytes, item.callback)
			}
		})
	}

	private deliver(bytes: Buffer, callback?: (error?: Error | null) => void) {
		this.socket.send(bytes, 0, bytes.length, callback)
	}

	onError(callback: (error: Error) => void): void {
		this.errorHandlers.push(callback)
	}

	send(message: OSC.Message) {
		const bytes = Buffer.from(message.pack())
		const report = (error?: Error | null) => {
			if (error) {
				for (const handler of this.errorHandlers) {
					handler(error)
				}
			}
		}
		if (this.connectReady) {
			this.deliver(bytes, report)
		} else {
			this.pending.push({ bytes, callback: report })
		}
	}
}
