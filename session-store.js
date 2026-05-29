const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

function decodeProjectName(encoded) {
  // Claude Code encodes "C:\Users\Tommy Ong\my-project" as "C--Users-Tommy-Ong-my-project"
  // We can only approximate the original — replace first three dashes back to ":\" + "\" + "\"
  // Simpler: just show the encoded name. User can recognize it.
  return encoded.replace(/^C--/, 'C:\\').replace(/-/g, '\\');
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');
  }
  return '';
}

function listSessions() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const sessions = [];

  for (const projectName of fs.readdirSync(PROJECTS_DIR)) {
    const projectPath = path.join(PROJECTS_DIR, projectName);
    let stat;
    try { stat = fs.statSync(projectPath); } catch { continue; }
    if (!stat.isDirectory()) continue;

    for (const entry of fs.readdirSync(projectPath)) {
      if (!entry.endsWith('.jsonl')) continue;
      const filePath = path.join(projectPath, entry);
      let fStat;
      try { fStat = fs.statSync(filePath); } catch { continue; }

      const sessionId = entry.replace(/\.jsonl$/, '');
      const preview = readFirstUserMessage(filePath);

      sessions.push({
        id: sessionId,
        project: decodeProjectName(projectName),
        projectRaw: projectName,
        lastModified: fStat.mtimeMs,
        preview: preview.slice(0, 80),
      });
    }
  }

  sessions.sort((a, b) => b.lastModified - a.lastModified);
  return sessions;
}

function readFirstUserMessage(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'user' && obj.message) {
          const text = extractTextContent(obj.message.content);
          if (text && !text.startsWith('<')) return text.replace(/\s+/g, ' ').trim();
        }
      } catch { /* skip malformed line */ }
    }
  } catch { /* skip unreadable file */ }
  return '(no preview)';
}

function loadSessionMessages(sessionId) {
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  // Find the file across all project folders
  for (const projectName of fs.readdirSync(PROJECTS_DIR)) {
    const filePath = path.join(PROJECTS_DIR, projectName, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const messages = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'user' && obj.type !== 'assistant') continue;
        if (!obj.message) continue;

        const text = extractTextContent(obj.message.content);
        if (!text) continue;
        // Skip system-injected user messages (often start with <)
        if (obj.type === 'user' && text.trim().startsWith('<')) continue;

        messages.push({
          role: obj.type === 'user' ? 'user' : 'claude',
          text,
        });
      } catch { /* skip malformed line */ }
    }

    return { project: decodeProjectName(projectName), messages };
  }

  return null;
}

module.exports = { listSessions, loadSessionMessages };
