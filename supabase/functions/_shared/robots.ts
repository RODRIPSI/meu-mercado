// Leitura mínima e conservadora de robots.txt (RFC 9309): grupos por User-agent, Allow/Disallow, vence a regra mais longa.
export function isAllowedByRobots(robotsTxt: string, path: string, userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  type Rule = { allow: boolean; pattern: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true;
    } else if ((k === 'allow' || k === 'disallow') && cur) {
      lastWasAgent = false;
      if (v) cur.rules.push({ allow: k === 'allow', pattern: v });   // "Disallow:" vazio = tudo liberado
    } else lastWasAgent = false;
  }
  // grupo mais específico: nome do agente contido no nosso UA; senão '*'
  let chosen = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  if (chosen.length === 0) chosen = groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!matches(r.pattern, path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}
