#!/usr/bin/env bun

const DECISION_MARKER_SINGLE = /\[DECISION:\s*([^\]]+)\]\s*(.+[^:\s])$/gim;

const text = `[DECISION: runtime] Using Bun for fast TypeScript execution

[DECISION: framework] Going with Hono for lightweight API routing

[DECISION: database]
Using PostgreSQL for the database because:
- Strong ACID compliance
[/]`;

console.log("Source:", DECISION_MARKER_SINGLE.source);
console.log("Flags:", DECISION_MARKER_SINGLE.flags);
console.log();

const re = new RegExp(DECISION_MARKER_SINGLE.source, "gim");
let m;
while ((m = re.exec(text)) !== null) {
  console.log("Match:", m[1], "->", m[2]);
}
