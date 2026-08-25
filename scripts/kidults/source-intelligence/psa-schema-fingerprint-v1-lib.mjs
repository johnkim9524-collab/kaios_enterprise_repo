const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_NODES = 2048;

const scalarType = value => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
};

const pointerSegment = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const normalized = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

export function collectSchemaFingerprint(payload, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const observed = new Map();
  let visited = 0;

  const visit = (value, path, depth) => {
    visited += 1;
    if (visited > maxNodes) throw new Error('PSA_SCHEMA_NODE_LIMIT_EXCEEDED');
    if (depth > maxDepth) throw new Error('PSA_SCHEMA_DEPTH_LIMIT_EXCEEDED');

    const type = scalarType(value);
    const entry = observed.get(path) || { path, types: new Set(), nullable: false };
    entry.types.add(type);
    if (type === 'null') entry.nullable = true;
    observed.set(path, entry);

    if (type === 'array') {
      for (const item of value) visit(item, `${path}/*`, depth + 1);
      return;
    }
    if (type === 'object') {
      for (const key of Object.keys(value).sort()) {
        visit(value[key], `${path}/${pointerSegment(key)}`, depth + 1);
      }
    }
  };

  visit(payload, '$', 0);
  return [...observed.values()]
    .map(entry => ({
      path: entry.path,
      types: [...entry.types].sort(),
      nullable: entry.nullable
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function fieldPresenceFromSchema(schema) {
  const paths = schema.map(entry => normalized(entry.path));
  const hasAny = fragments => paths.some(path => fragments.some(fragment => path.includes(fragment)));
  return {
    certification_identifier: hasAny(['certnumber', 'certno', 'certificationnumber', 'certificationid']),
    grade: hasAny(['gradedescription', 'itemgrade', 'grade']),
    item_identity_or_reference: hasAny(['subject', 'spec', 'cardnumber', 'item', 'brand', 'year', 'category', 'variety', 'description']),
    population_context: hasAny(['population', 'pophigher', 'census']),
    alternate_identifier: hasAny(['barcode', 'reversecert', 'alternateidentifier', 'altid'])
  };
}

const caseInsensitiveValue = (payload, names) => {
  const wanted = new Set(names.map(normalized));
  for (const [key, value] of Object.entries(payload)) {
    if (wanted.has(normalized(key))) return value;
  }
  return undefined;
};

export function assertPsaSuccessEnvelope(payload, httpStatus) {
  if (httpStatus !== 200) throw new Error(`PSA_HTTP_${httpStatus}`);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('PSA_RESPONSE_ROOT_NOT_OBJECT');

  const isValid = caseInsensitiveValue(payload, ['IsValidRequest']);
  const serverMessage = caseInsensitiveValue(payload, ['ServerMessage', 'Message']);
  if (isValid !== true) throw new Error('PSA_INVALID_REQUEST_ENVELOPE');
  if (typeof serverMessage !== 'string' || !/\bsuccess(?:ful)?\b/i.test(serverMessage)) {
    throw new Error('PSA_NON_SUCCESS_ENVELOPE');
  }
  return true;
}
