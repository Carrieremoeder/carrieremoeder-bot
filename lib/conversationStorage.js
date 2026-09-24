// Explicit storage schema: attachment objects and unknown fields never enter history.
export function sanitizeConversations(conversations) {
  if (!Array.isArray(conversations) || conversations.length > 100) throw new TypeError('Ongeldige gespreksgeschiedenis.');
  return conversations.map(c => {
    if (!c || !['string', 'number'].includes(typeof c.id) || typeof c.title !== 'string' || typeof c.date !== 'string' || !Array.isArray(c.messages)) throw new TypeError('Ongeldig gesprek.');
    return {
      id: c.id, title: c.title, date: c.date,
      messages: c.messages.map(m => {
        if (!m || !['user', 'assistant'].includes(m.role)) throw new TypeError('Ongeldig bericht.');
        let text;
        if (typeof m.content === 'string') text = m.content;
        else if (m.role === 'user' && Array.isArray(m.content)) {
          text = m.content.filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') || '[afbeelding]';
        } else throw new TypeError('Ongeldige berichtinhoud.');
        return { role: m.role, content: text, display: text };
      })
    };
  });
}
