const CLOUDFLARE_ENDPOINT = /(?:https?:\/\/)?api\.cloudflare\.com(?:\/client\/v4)?|\b(?:CLOUDFLARE|CF)_API(?:_(?:BASE|URL|ENDPOINT|ROOT))?\b/i;
const MUTATING_HTTP_METHOD = /^(?:POST|PUT|PATCH|DELETE)$/i;
const READ_ONLY_HTTP_METHOD = /^(?:GET|HEAD|OPTIONS)$/i;

function indentation(line) {
  return line.match(/^ */)?.[0].length || 0;
}

function stripYamlComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index).trimEnd();
  }
  return line;
}

function withoutQuotedStrings(value) {
  let output = '';
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += "''";
      continue;
    }
    output += character;
  }
  return output;
}

function scalarContinuation(lines, index, parentIndent) {
  const values = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (lines[cursor].trim() && indentation(lines[cursor]) <= parentIndent) break;
    values.push(lines[cursor].trim());
  }
  return values.join(' ');
}

export function extractWorkflowJobBlocks(workflow) {
  const lines = workflow.split(/\r?\n/);
  const jobsIndex = lines.findIndex(line => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsIndex === -1) return [];
  const blocks = [];
  let current = null;
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && indentation(line) === 0) break;
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
    if (match) {
      if (current) blocks.push(current);
      current = {id: match[1], lines: [line], start_line: index + 1};
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map(block => ({...block, source: block.lines.join('\n')}));
}

export function hasLiteralFalseJobGate(jobSource) {
  const lines = jobSource.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^    if:\s*(.*?)\s*$/);
    if (!match) continue;
    let expression = stripYamlComment(match[1]).trim();
    if (/^[>|][-+]?\s*$/.test(expression)) expression = scalarContinuation(lines, index, 4);
    expression = withoutQuotedStrings(expression)
      .replace(/^\s*\$\{\{\s*/, '')
      .replace(/\s*\}\}\s*$/, '')
      .trim();
    if (/^\(*\s*false\s*\)*$/i.test(expression)) return true;
    if (expression.includes('||') || expression.includes('?')) continue;
    const operands = expression.split('&&')
      .map(value => value.trim().replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim());
    if (operands.some(value => /^false$/i.test(value))) return true;
  }
  return false;
}

function extractRunScripts(jobSource) {
  const lines = jobSource.split(/\r?\n/);
  const scripts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s+)run:\s*(.*?)\s*$/);
    if (!match) continue;
    const parentIndent = match[1].length;
    const scalar = stripYamlComment(match[2]).trim();
    if (/^[>|][-+]?\s*$/.test(scalar)) {
      const values = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim() && indentation(lines[cursor]) <= parentIndent) break;
        values.push(lines[cursor].slice(Math.min(lines[cursor].length, parentIndent + 2)));
      }
      scripts.push(values.join('\n'));
    } else if (scalar) {
      scripts.push(scalar.replace(/^(['"])([\s\S]*)\1$/, '$2'));
    }
  }
  return scripts;
}

function extractWranglerActionCommands(jobSource) {
  const lines = jobSource.split(/\r?\n/);
  const steps = [];
  let current = null;
  for (const line of lines) {
    if (/^      -\s+/.test(line)) {
      if (current) steps.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) steps.push(current.join('\n'));
  const commands = [];
  for (const step of steps) {
    if (!/^\s*-\s*uses:\s*cloudflare\/wrangler-action@/mi.test(step)) continue;
    const stepLines = step.split(/\r?\n/);
    const commandIndex = stepLines.findIndex(line => /^\s*command:\s*/i.test(line));
    if (commandIndex === -1) continue;
    const match = stepLines[commandIndex].match(/^(\s*)command:\s*(.*?)\s*$/i);
    let command = match[2];
    if (/^[>|][-+]?\s*$/.test(command)) command = scalarContinuation(stepLines, commandIndex, match[1].length);
    if (command) commands.push(`wrangler ${command.replace(/^(['"])([\s\S]*)\1$/, '$2')}`);
  }
  return commands;
}

function sanitizeShellScript(script) {
  return script
    .split(/\r?\n/)
    .map(stripYamlComment)
    .filter(line => !/^\s*#/.test(line))
    .join('\n')
    .replace(/\\\r?\n/g, ' ');
}

function splitShellCommands(script) {
  const commands = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];
    if (quote) {
      current += character;
      if (character === quote && script[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    const pair = script.slice(index, index + 2);
    if (character === '\n' || character === ';' || pair === '&&' || pair === '||') {
      if (current.trim()) commands.push(current.trim());
      current = '';
      if (pair === '&&' || pair === '||') index += 1;
      continue;
    }
    current += character;
  }
  if (current.trim()) commands.push(current.trim());
  return commands;
}

function directWranglerArguments(command) {
  const prefix = /(?:^|\b(?:then|do)\s+)(?:&\s*)?(?:(?:sudo|env|command|exec)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*(?:(?:npx|bunx)\s+(?:--yes\s+)?|(?:pnpm|yarn)\s+(?:exec|dlx)\s+|npm\s+exec\s+(?:--\s+)?|(?:\.\/)?node_modules\/\.bin\/)?wrangler(?:\.cmd)?\s+(.+)$/i;
  return command.match(prefix)?.[1]?.trim() || null;
}

function nestedShellCommands(command) {
  const values = [];
  const matcher = /\b(?:ba|z|k)?sh\s+(?:-[A-Za-z]+\s+)*-c\s+(['"])([\s\S]*?)\1|\b(?:eval|Invoke-Expression)\s+(['"])([\s\S]*?)\3/gi;
  for (const match of command.matchAll(matcher)) values.push(match[2] || match[4]);
  return values;
}

function readOnlyD1Execute(argumentsText) {
  if (/--file(?:=|\s)/i.test(argumentsText)) return false;
  const match = argumentsText.match(/--command(?:=|\s+)(['"])([\s\S]*?)\1/i);
  if (!match) return false;
  const sql = match[2].trim().replace(/;\s*$/, '');
  if (sql.includes(';')) return false;
  return /^(?:SELECT\b|PRAGMA\b|EXPLAIN(?:\s+QUERY\s+PLAN)?\b)/i.test(sql)
    && !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(sql);
}

function wranglerMutationKinds(script) {
  const findings = [];
  const queue = splitShellCommands(sanitizeShellScript(script));
  for (let index = 0; index < queue.length; index += 1) {
    const command = queue[index];
    queue.push(...nestedShellCommands(command));
    const argumentsText = directWranglerArguments(command);
    if (!argumentsText) continue;
    const commandArguments = argumentsText.replace(/^(?:(?:--(?:cwd|config|env|experimental-json-config))(?:=\S+|\s+\S+)\s+)*/i, '');
    if (/^(?:deploy\b|pages\s+deploy\b|versions\s+deploy\b)/i.test(commandArguments)) {
      if (!/(?:^|\s)--dry-run(?:=true)?(?=\s|$)/i.test(commandArguments)) findings.push('wrangler-deploy');
      continue;
    }
    const d1 = commandArguments.match(/^d1\s+([\s\S]+)$/i)?.[1];
    if (!d1 || !/(?:^|\s)--remote(?:\s|=|$)/i.test(d1)) continue;
    if (/^execute\b/i.test(d1) && !readOnlyD1Execute(d1)) findings.push('wrangler-d1-remote-mutation');
    else if (/^(?:migrations\s+apply|create|delete|time-travel\s+restore)\b/i.test(d1)) findings.push('wrangler-d1-remote-mutation');
  }
  return findings;
}

function cloudflareRestMutationKinds(script) {
  const sanitized = sanitizeShellScript(script);
  if (!CLOUDFLARE_ENDPOINT.test(sanitized)) return [];
  const findings = [];
  for (const command of splitShellCommands(sanitized)) {
    if (!CLOUDFLARE_ENDPOINT.test(command)) continue;
    if (/^(?:echo|printf|Write-(?:Output|Host))\b/i.test(command.trim())) continue;
    const curlMethod = command.match(/(?:^|\s)(?:-X|--request(?:=|\s+))\s*['"]?([^\s'"]+)/i)?.[1];
    if (curlMethod && MUTATING_HTTP_METHOD.test(curlMethod)) findings.push('cloudflare-rest-mutation');
    else if (curlMethod && !READ_ONLY_HTTP_METHOD.test(curlMethod)) findings.push('cloudflare-rest-dynamic-method');
    if (/\bcurl\b/i.test(command) && /(?:^|\s)(?:--data(?:-[a-z]+)?|-d)(?:=|\s)/i.test(command)) findings.push('cloudflare-rest-mutation');
  }
  for (const match of sanitized.matchAll(/\bmethod\s*:\s*([^,}\n]+)/gi)) {
    const raw = match[1].trim();
    const literal = raw.match(/^['"]([A-Za-z]+)['"]$/)?.[1];
    if (literal && MUTATING_HTTP_METHOD.test(literal)) findings.push('cloudflare-rest-mutation');
    else if (!literal || !READ_ONLY_HTTP_METHOD.test(literal)) findings.push('cloudflare-rest-dynamic-method');
  }
  if (/\b(?:axios|requests?)\.(?:post|put|patch|delete)\s*\(/i.test(sanitized)) findings.push('cloudflare-rest-mutation');
  if (/\bInvoke-RestMethod\b[\s\S]*?(?:-Method\s+)(?:Post|Put|Patch|Delete)\b/i.test(sanitized)) findings.push('cloudflare-rest-mutation');
  return findings;
}

export function inspectWorkflowCloudflareMutations(workflow) {
  const jobs = [];
  for (const job of extractWorkflowJobBlocks(workflow)) {
    const scripts = [...extractRunScripts(job.source), ...extractWranglerActionCommands(job.source)];
    const mutationKinds = [...new Set(scripts.flatMap(script => [
      ...wranglerMutationKinds(script),
      ...cloudflareRestMutationKinds(script),
    ]))].sort();
    if (mutationKinds.length) jobs.push({
      job_id: job.id,
      start_line: job.start_line,
      literal_false_job_gate: hasLiteralFalseJobGate(job.source),
      mutation_kinds: mutationKinds,
    });
  }
  return jobs;
}

export function cloudflareRemoteMutationViolations(workflow) {
  return inspectWorkflowCloudflareMutations(workflow)
    .filter(job => !job.literal_false_job_gate)
    .flatMap(job => job.mutation_kinds.map(kind => `cloudflare-remote-mutation-without-literal-false-job-gate:${job.job_id}:${kind}`));
}
