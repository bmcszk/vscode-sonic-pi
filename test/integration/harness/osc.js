// Minimal OSC 1.0 message codec: the fake daemon and the attach-mode probes speak the same
// wire format the extension sends (int32, float32, string), without pulling osc-js into a
// temp-dir script. Encode and decode are inverse for that subset.

const TYPE_INT = 0x69
const TYPE_FLOAT = 0x66

function padTo4(bytes) {
	const missing = (4 - (bytes.length % 4)) % 4
	return Buffer.concat([bytes, Buffer.alloc(missing)])
}

function encodeString(value) {
	return padTo4(Buffer.from(value + '\0', 'utf8'))
}

function typeTagOf(arg) {
	if (typeof arg === 'number') {
		return Number.isInteger(arg) ? 'i' : 'f'
	}
	return 's'
}

function encodeArgument(arg) {
	if (typeTagOf(arg) === 'i') {
		const buffer = Buffer.alloc(4)
		buffer.writeInt32BE(arg)
		return buffer
	}
	if (typeTagOf(arg) === 'f') {
		const buffer = Buffer.alloc(4)
		buffer.writeFloatBE(arg)
		return buffer
	}
	return encodeString(String(arg))
}

function encodeMessage(address, args) {
	return Buffer.concat([
		encodeString(address),
		encodeString(',' + args.map(typeTagOf).join('')),
		...args.map(encodeArgument),
	])
}

function readString(buffer, offset) {
	const end = buffer.indexOf(0, offset)
	if (end === -1) {
		throw new Error('unterminated OSC string')
	}
	const value = buffer.toString('utf8', offset, end)
	return { value, next: offset + Math.ceil((end - offset + 1) / 4) * 4 }
}

function decodeMessage(buffer) {
	const address = readString(buffer, 0)
	const tags = readString(buffer, address.next)
	if (!tags.value.startsWith(',')) {
		throw new Error('OSC type tag string must start with a comma')
	}
	const args = []
	let offset = tags.next
	for (const tag of tags.value.slice(1)) {
		if (tag === 'i') {
			args.push(buffer.readInt32BE(offset))
			offset += 4
		} else if (tag === 'f') {
			args.push(buffer.readFloatBE(offset))
			offset += 4
		} else if (tag === 's') {
			const string = readString(buffer, offset)
			args.push(string.value)
			offset = string.next
		} else {
			throw new Error('unsupported OSC type tag: ' + tag)
		}
	}
	return { address: address.value, args }
}

module.exports = { encodeMessage, decodeMessage, TYPE_INT, TYPE_FLOAT }
