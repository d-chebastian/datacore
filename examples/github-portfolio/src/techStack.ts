/** Combines a repo's fetched manifest/config file contents into one bounded chunk for a prompt — real
 * declared dependencies/tooling (from package.json, pom.xml, Dockerfile, etc.), not a guess from `language`. */
export function summarizeKeyFiles(keyFiles: Record<string, string> | null | undefined): string | null {
  if (!keyFiles || Object.keys(keyFiles).length === 0) return null;

  const MAX_TOTAL_CHARS = 1200;
  let combined = '';
  for (const [name, content] of Object.entries(keyFiles)) {
    const chunk = `--- ${name} ---\n${content}\n`;
    if (combined.length + chunk.length > MAX_TOTAL_CHARS) break;
    combined += chunk;
  }
  return combined.trim() || null;
}
