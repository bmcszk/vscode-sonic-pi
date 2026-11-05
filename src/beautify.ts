// Beautify apply-edit logic (pure): map the daemon's /buffer/replace reply —
// the RBeautify-aligned text plus its server-adjusted cursor (line, index) —
// onto a whole-document edit that preserves the cursor best-effort.
// Mirrors the daemon's __buffer_beautify reply contract
// (spider-server.rb "replace-buffer" -> gui.send("/buffer/replace", buf_id, content, line, index, first_line)).

export interface BeautifyCursor {
	line: number
	character: number
}

export interface BeautifyEditResult {
	// The aligned text to replace the whole document with, or undefined when the
	// reply is empty and the edit must be a no-op.
	newText: string | undefined
	cursor: BeautifyCursor
}

// Compute the whole-document replacement text and the cursor to restore.
// serverCursor is the daemon-adjusted (line, index) pair from /buffer/replace;
// when it is missing or out of bounds in the new text, fall back to preserving
// the line:character ratio of the original cursor.
export function computeBeautifyEdit(
	oldText: string,
	newText: string,
	oldCursor: BeautifyCursor,
	serverCursor: { line: number; index: number } | undefined,
): BeautifyEditResult {
	if (!newText) {
		// Empty reply: nothing to apply, keep the cursor where it was.
		return { newText: undefined, cursor: oldCursor }
	}

	const newLines = newText.split('\n')

	let cursor: BeautifyCursor
	if (
		serverCursor &&
		serverCursor.line >= 0 &&
		serverCursor.line < newLines.length &&
		serverCursor.index >= 0
	) {
		// Server cursor is usable: clamp the character within its line.
		const lineLength = newLines[serverCursor.line].length
		cursor = {
			line: serverCursor.line,
			character: Math.min(serverCursor.index, lineLength),
		}
	} else {
		// Ratio fallback: scale the old cursor position proportionally into the
		// new text so a cursor a third down stays roughly a third down.
		const ratio = oldText.length === 0 ? 0 : offsetOf(oldText, oldCursor) / oldText.length
		const targetOffset = Math.min(Math.round(ratio * newText.length), Math.max(newText.length - 1, 0))
		cursor = positionAt(newText, targetOffset)
	}

	return { newText, cursor }
}

function offsetOf(text: string, cursor: BeautifyCursor): number {
	let offset = 0
	const lines = text.split('\n')
	for (let i = 0; i < cursor.line && i < lines.length; i++) {
		offset += lines[i].length + 1
	}
	return offset + cursor.character
}

function positionAt(text: string, offset: number): BeautifyCursor {
	const upto = text.slice(0, offset).split('\n')
	return { line: upto.length - 1, character: upto[upto.length - 1].length }
}
