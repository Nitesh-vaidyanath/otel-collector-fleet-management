const IDENT = '[A-Za-z_:][A-Za-z0-9_:]*';
const METRIC_ID = new RegExp(`^${IDENT}$`);
const LABEL_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

type MetricToken = { start: number; end: number; name: string };

function outsideStringPositions(query: string): boolean[] {
  const outside = new Array<boolean>(query.length).fill(true);
  let quote = '';
  let escaped = false;
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (quote) {
      outside[i] = false;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
      outside[i] = false;
    }
  }
  return outside;
}

function metricTokens(query: string): MetricToken[] {
  const trimmedStart = query.search(/\S/);
  const trimmed = query.trim();
  if (trimmedStart >= 0 && METRIC_ID.test(trimmed)) {
    return [{ start: trimmedStart, end: trimmedStart + trimmed.length, name: trimmed }];
  }

  const outside = outsideStringPositions(query);
  const tokens: MetricToken[] = [];
  const matcher = new RegExp(IDENT, 'g');
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(query)) !== null) {
    const start = match.index;
    if (!outside[start]) continue;
    let after = matcher.lastIndex;
    while (/\s/.test(query[after] || '')) after++;
    if (query[after] !== '{' && query[after] !== '[') continue;

    // Braced vector selectors are identifiable anywhere in the expression;
    // bare range selectors are supported only inside the common sum/rate form.
    const prefix = query.slice(0, start);
    if (query[after] === '[' && !/(?:rate|sum)\s*\(\s*(?:(?:rate|sum)\s*\(\s*)?$/.test(prefix)) continue;
    tokens.push({ start, end: matcher.lastIndex, name: match[0] });
  }
  if (tokens.length !== 1 || !isSupportedSingleSelector(query, tokens[0])) return [];
  return tokens;
}

function isSupportedSingleSelector(query: string, token: MetricToken): boolean {
  const prefix = query.slice(0, token.start);
  const wrappers = prefix.match(/^(\s*)(sum\s*\(\s*)?(rate\s*\(\s*)?$/);
  if (!wrappers) return false;
  const openCount = (wrappers[2] ? 1 : 0) + (wrappers[3] ? 1 : 0);
  let cursor = token.end;
  while (/\s/.test(query[cursor] || '')) cursor++;
  if (query[cursor] === '{') {
    cursor = matchingBrace(query, cursor) + 1;
    if (cursor === 0) return false;
  } else if (openCount === 0 && query[cursor] === '[') {
    return false;
  }
  while (/\s/.test(query[cursor] || '')) cursor++;
  if (query[cursor] === '[') {
    const close = query.indexOf(']', cursor + 1);
    if (close < 0) return false;
    cursor = close + 1;
  }
  const suffix = query.slice(cursor).replace(/\s/g, '');
  return suffix === ')'.repeat(openCount);
}

function matchingBrace(query: string, open: number): number {
  const outside = outsideStringPositions(query);
  let depth = 0;
  for (let i = open; i < query.length; i++) {
    if (!outside[i]) continue;
    if (query[i] === '{') depth++;
    else if (query[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export function insertMetricSuggestion(query: string, metric: string): { query: string; changed: boolean; hint?: string } {
  if (!METRIC_ID.test(metric)) return { query, changed: false, hint: 'Metric name is not a valid Prometheus identifier.' };
  if (!query.trim()) return { query: metric, changed: true };
  const tokens = metricTokens(query);
  if (tokens.length !== 1) return { query, changed: false, hint: 'Metric suggestion was not applied because the query is ambiguous.' };
  const token = tokens[0];
  return { query: query.slice(0, token.start) + metric + query.slice(token.end), changed: true };
}

export function insertLabelMatcher(query: string, label: string): { query: string; changed: boolean; hint?: string } {
  if (!LABEL_ID.test(label)) return { query, changed: false, hint: 'Label name is not a valid Prometheus identifier.' };
  const tokens = metricTokens(query);
  if (tokens.length !== 1) return { query, changed: false, hint: 'Label matcher was not added because the query is ambiguous.' };
  const token = tokens[0];
  let open = token.end;
  while (/\s/.test(query[open] || '')) open++;
  if (query[open] === '{') {
    const close = matchingBrace(query, open);
    if (close < 0) return { query, changed: false, hint: 'Label matcher was not added because the selector is incomplete.' };
    const body = query.slice(open + 1, close);
    const exists = new RegExp(`(?:^|,)\\s*${label}\\s*(?:=|!=|=~|!~)`).test(body);
    if (exists) return { query, changed: false, hint: `Selector already contains ${label}.` };
    const separator = body.trim().endsWith(',') ? ' ' : body.trim() ? ', ' : '';
    return { query: query.slice(0, close) + separator + `${label}=""` + query.slice(close), changed: true };
  }
  return { query: query.slice(0, token.end) + `{${label}=""}` + query.slice(token.end), changed: true };
}
