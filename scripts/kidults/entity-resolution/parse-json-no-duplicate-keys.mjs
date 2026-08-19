function pointer(path) {
  return `/${path.map((segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

export function parseJsonNoDuplicateKeys(text, sourceName = 'JSON') {
  if (typeof text !== 'string') throw new TypeError(`JSON_TEXT_REQUIRED:${sourceName}`);

  let index = 0;
  const fail = (code, path = []) => {
    const error = new SyntaxError(`${code}:${sourceName}:${pointer(path)}:offset=${index}`);
    error.code = code;
    throw error;
  };
  const skipWhitespace = () => {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1;
  };
  const parseString = (path) => {
    if (text[index] !== '"') fail('JSON_STRING_REQUIRED', path);
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      index += 1;
      if (character === '"') {
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail('JSON_STRING_INVALID', path);
        }
      }
      if (character === '\\') {
        if (index >= text.length) fail('JSON_STRING_ESCAPE_INVALID', path);
        const escape = text[index];
        index += 1;
        if (escape === 'u') {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('JSON_UNICODE_ESCAPE_INVALID', path);
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) {
          fail('JSON_STRING_ESCAPE_INVALID', path);
        }
      } else if (character.charCodeAt(0) < 0x20) {
        fail('JSON_STRING_CONTROL_CHARACTER_INVALID', path);
      }
    }
    fail('JSON_STRING_UNTERMINATED', path);
  };
  const parseLiteral = (literal, path) => {
    if (text.slice(index, index + literal.length) !== literal) fail('JSON_LITERAL_INVALID', path);
    index += literal.length;
  };
  const parseNumber = (path) => {
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail('JSON_NUMBER_INVALID', path);
    index += match[0].length;
  };
  const parseValue = (path) => {
    skipWhitespace();
    const character = text[index];
    if (character === '{') {
      parseObject(path);
    } else if (character === '[') {
      parseArray(path);
    } else if (character === '"') {
      parseString(path);
    } else if (character === 't') {
      parseLiteral('true', path);
    } else if (character === 'f') {
      parseLiteral('false', path);
    } else if (character === 'n') {
      parseLiteral('null', path);
    } else if (character === '-' || /[0-9]/.test(character || '')) {
      parseNumber(path);
    } else {
      fail('JSON_VALUE_INVALID', path);
    }
  };
  const parseArray = (path) => {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    let itemIndex = 0;
    while (index < text.length) {
      parseValue([...path, itemIndex]);
      itemIndex += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail('JSON_ARRAY_SEPARATOR_INVALID', path);
      index += 1;
      skipWhitespace();
    }
    fail('JSON_ARRAY_UNTERMINATED', path);
  };
  const parseObject = (path) => {
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    const keys = new Set();
    while (index < text.length) {
      skipWhitespace();
      const key = parseString(path);
      const keyPath = [...path, key];
      if (keys.has(key)) fail('DUPLICATE_JSON_MEMBER', keyPath);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') fail('JSON_OBJECT_COLON_REQUIRED', keyPath);
      index += 1;
      parseValue(keyPath);
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail('JSON_OBJECT_SEPARATOR_INVALID', path);
      index += 1;
      skipWhitespace();
    }
    fail('JSON_OBJECT_UNTERMINATED', path);
  };

  skipWhitespace();
  parseValue([]);
  skipWhitespace();
  if (index !== text.length) fail('JSON_TRAILING_CONTENT_INVALID');
  return JSON.parse(text);
}
