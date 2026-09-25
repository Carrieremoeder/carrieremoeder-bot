// Decode SSE across arbitrary network and UTF-8 chunk boundaries.
export async function* readEvents(body) {
  if (!body) throw new Error('Antwoordverbinding ontbreekt.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) yield JSON.parse(data);
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function readCoachReply(response, onText) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'De coach is tijdelijk niet beschikbaar.');
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Er is geen antwoord ontvangen. Probeer opnieuw.');
    return text;
  }
  let text = '';
  for await (const event of readEvents(response.body)) {
    if (event.type === 'error') throw new Error('Het antwoord is onderbroken. Probeer opnieuw.');
    if (event.type === 'text' && typeof event.text === 'string') { text += event.text; onText(text); }
    if (event.type === 'done') {
      if (!text.trim()) throw new Error('Er is geen antwoord ontvangen. Probeer opnieuw.');
      return text;
    }
  }
  throw new Error('Het antwoord is onderbroken. Probeer opnieuw.');
}
