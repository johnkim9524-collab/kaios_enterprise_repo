// JSON.parse silently accepts duplicate keys. Registry authority must not depend
// on which conflicting declaration happens to be last in a source file.
export function parseRegistryJson(source) {
  const value = JSON.parse(source);
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  const scopes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '{') scopes.push(new Set());
    else if (token === '[') scopes.push(null);
    else if (token === '}' || token === ']') scopes.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':') {
      const keys = scopes.at(-1);
      const key = JSON.parse(token);
      if (keys.has(key)) throw new Error(`REGISTRY_DUPLICATE_JSON_KEY:${key}`);
      keys.add(key);
    }
  }
  return value;
}
