// Static checks on supabase/migrations. Run: npm run verify:migrations
//
// These migrations are pasted into the Supabase SQL editor by hand, so nothing
// executes them before they reach the database. That is why the same class of
// bug appeared three separate times:
//
//   20261019000000_profiles_identity_columns.sql read profiles.full_name, a
//     column no file creates -> 42701, aborting the paste and every migration
//     after it.
//   20261019000011_voice_clones.sql built an RLS policy and a trigger on
//     voice_clones.user_id after three earlier migrations had renamed that
//     column to owner_id -> 42703 on every statement touching the table.
//   20261001160000_telegram_device_linking.sql indexed one column while its
//     ON CONFLICT clause named two -> 42P10 when a payment notification was
//     claimed.
//
// Each was invisible until something broke. This reads the SQL instead.
//
// SCOPE, stated plainly: this does NOT execute anything. There is no PostgreSQL
// in the development environment, so a PASS means "no defect of these classes is
// present in the text", never "the replay succeeds". Proving the replay needs a
// real database; the exact command is in docs/migrations.md.
//
// The checks are deliberately narrow. A verifier that cries wolf gets ignored,
// so anything this cannot decide confidently is reported as a note.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const SCHEMA_FILE = join(process.cwd(), "supabase_schema.sql");

const problems = [];
const notes = new Set();
const fail = (file, msg) => problems.push({ file, msg });
const note = (msg) => notes.add(msg);

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = new Map(files.map((f) => [f, readFileSync(join(DIR, f), "utf8")]));
const master = readFileSync(SCHEMA_FILE, "utf8");

// ── 1. Unique, sortable timestamps ────────────────────────────────────────────
// Two files sharing a stamp sort by description in some tools and by filesystem
// order in others, so "the order these run in" stops being a fact.
const byStamp = new Map();
for (const f of files) {
  const stamp = f.slice(0, 14);
  if (!/^\d{14}$/.test(stamp)) fail(f, `filename does not begin with a 14-digit timestamp: "${stamp}"`);
  byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), f]);
}
for (const [stamp, group] of byStamp) {
  if (group.length > 1) fail(group[0], `timestamp ${stamp} is shared by: ${group.join(", ")}`);
}

// ── Column inventory ──────────────────────────────────────────────────────────
// Includes the master schema, which is migration #0: it creates ten tables that
// no migration does, so a migrations-only replay cannot work without it.
const TYPE = String.raw`(?:uuid|text|integer|int|bigint|numeric|real|boolean|date|timestamptz|timestamp(?:\s+with(?:out)?\s+time\s+zone)?|jsonb|json|double\s+precision|bytea)`;
const columns = new Set();

function collectColumns(text, from) {
  for (const m of text.matchAll(
    new RegExp(
      String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);`,
      "gi",
    ),
  )) {
    for (const line of m[2].split("\n")) {
      const t = line.trim();
      if (!t || /^(constraint|primary|unique|foreign|check|exclude)\b/i.test(t)) continue;
      const col = t.match(new RegExp(String.raw`^(\w+)\s+${TYPE}\b`, "i"));
      if (col) columns.add(`${m[1]}.${col[1]}`.toLowerCase());
    }
  }
  for (const m of text.matchAll(
    new RegExp(
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)[\s\S]{0,600}?add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)`,
      "gi",
    ),
  )) {
    columns.add(`${m[1]}.${m[2]}`.toLowerCase());
  }
  noteFrom(from);
}
const noteFrom = () => {};

for (const [file, text] of sql) collectColumns(text, file);
collectColumns(master, "supabase_schema.sql");
for (const c of columns) if (c.startsWith(".")) columns.delete(c);

/** Tables that a file in this repository actually creates. */
const definedTables = new Set();
for (const key of columns) definedTables.add(key.split(".")[0]);
for (const [, text] of sql) {
  for (const m of text.matchAll(
    new RegExp(
      String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(`,
      "gi",
    ),
  )) {
    definedTables.add(m[1].toLowerCase());
  }
}
for (const m of master.matchAll(
  new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(`, "gi"),
)) {
  definedTables.add(m[1].toLowerCase());
}

// ── 2. RLS policies keyed on a column nothing creates ─────────────────────────
// Only the dominant shape is checked: `auth.uid() = <column>`. Anything more
// elaborate is left alone rather than guessed at.
const knownTables = new Set([...columns].map((k) => k.split(".")[0]));
// Deliberately narrow. `user_id` and `owner_id` are NOT excused: excusing them
// is what lets the exact bug that motivated this check -- a policy left keyed
// on `user_id` after three migrations renamed the column to `owner_id` -- pass
// unnoticed, which is how it shipped.

for (const [file, text] of sql) {
  for (const m of text.matchAll(
    /create\s+policy\s+(?:if\s+not\s+exists\s+)?"[^"]+"\s*\r?\n\s*on\s+(?:public\.)?(\w+)\s*\r?\n\s*for\s+\w+\s+to\s+[\w,\s]+([\s\S]{0,400}?);/gi,
  )) {
    const table = m[1];
    if (!knownTables.has(table)) {
      note(`${file}: policy on unknown table "${table}" — cannot verify, skipped`);
      continue;
    }
    for (const ref of m[2].matchAll(/auth\.uid\(\)\s*=\s*(?:\w+\.)?(\w+)/gi)) {
      const col = ref[1].toLowerCase();
      if (col === "id" || columns.has(`${table}.${col}`)) continue;
      fail(
        file,
        `policy on ${table} is keyed on ${table}.${col}, which no file creates. ` +
          `PostgreSQL raises 42703 on EVERY statement touching ${table}, not just on creation.`,
      );
    }
  }
}

// ── 2b. Columns read by an UPDATE that no file creates ───────────────────────
// This is the check that would have caught profiles.full_name, the bug that
// aborted a rebuild with 42701. An UPDATE on a table this repository defines may
// only reference columns that some file creates -- assigned or read.
//
// Narrow on purpose: only bare identifiers inside the SET/WHERE clause, with
// SQL keywords, function calls, type names and string literals excluded. An
// identifier it cannot confidently classify is left alone.
const SQL_WORDS = new Set([
  "select", "from", "where", "set", "and", "or", "not", "null", "is", "in", "as", "on",
  "case", "when", "then", "else", "end", "coalesce", "nullif", "trim", "lower", "upper",
  "length", "now", "true", "false", "default", "table", "public", "distinct", "limit",
  "exists", "between", "like", "ilike", "asc", "desc", "using", "cast", "array", "row",
  "interval", "date", "text", "integer", "numeric", "boolean", "timestamptz", "uuid",
  "jsonb", "greatest", "least", "concat", "substring", "position", "new", "old",
]);

/**
 * Removes dollar-quoted bodies -- every function body and every DO block.
 *
 * Those are procedural: they declare their own variables, branch on
 * information_schema, and build SQL at run time. `v_agent` is not a column,
 * `new` is a row variable, and an UPDATE guarded by an existence check is
 * correct precisely because the column may not be there. Checking them
 * statically produces confident nonsense, so they are skipped and counted.
 *
 * Everything this skips is drift-tolerance code written on purpose.
 */
function stripProcedural(text) {
  const blocks = [...text.matchAll(/\$(\w*)\$[\s\S]*?\$\1\$/g)];
  return { text: text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''"), blocks: blocks.length };
}

let proceduralBlocks = 0;

for (const [file, raw] of sql) {
  const { text: scanText, blocks } = stripProcedural(raw);
  proceduralBlocks += blocks;
  // Drop string literals too, so their contents are never read as identifiers.
  const text = scanText.replace(/'[^']*'/g, "''");
  // The optional alias matters: `update public.t as cts set ...` is the norm
  // here, and a pattern without it silently matches nothing on those statements.
  for (const m of text.matchAll(
    /update\s+(?:public\.)?(\w+)(?:\s+as\s+(\w+))?\s+set\s+([\s\S]*?)(?:;\s*$|;\r?\n)/gim,
  )) {
    const table = m[1].toLowerCase();
    if (!definedTables.has(table)) continue;
    const bare = m[3];
    // Aliases declared in this statement are not columns. The target's own alias
    // sits before SET, so it is captured separately; `from ... as p` names the
    // rest. A bare `p` or `cts` is otherwise indistinguishable from a typo'd column.
    const fromAliasRe = /\b(?:from|update|join)\s+(?:public\.)?(\w+)(?:\s+as\s+(\w+))?/gi;
    const aliases = new Set();
    if (m[2]) aliases.add(m[2].toLowerCase());
    for (const a of bare.matchAll(fromAliasRe)) {
      if (a[1]) aliases.add(a[1].toLowerCase());
      if (a[2]) aliases.add(a[2].toLowerCase());
    }
    // Assigned columns are NOT excused. `columns` is collected across every file
    // plus the master schema, so a column an earlier migration added is already
    // known; assigning to one that is in neither is a 42703 exactly like reading
    // one. Exempting them here is what hid `set definitely_not_a_column = ...`.
    // The lookahead rejects a word character as well as "(", so the match cannot
    // backtrack to a shorter prefix: without that, `coalesce(` matches as
    // `coalesc` and every UPDATE in the set reports a phantom column.
    for (const ident of bare.matchAll(/(?<![.\w$"])([a-z_][a-z0-9_]*)(?![\w(])/gi)) {
      const col = ident[1].toLowerCase();
      if (SQL_WORDS.has(col) || aliases.has(col)) continue;
      if (columns.has(`${table}.${col}`)) continue;
      fail(
        file,
        `UPDATE on ${table} references ${table}.${col}, which no file creates. ` +
          `PostgreSQL raises 42703 here, and a failed migration is a transaction ` +
          `that rolls back -- so this aborts the paste and every migration after it.`,
      );
      break; // one report per statement is enough to act on
    }
  }
}
note(
  `${proceduralBlocks} dollar-quoted blocks (function bodies, DO blocks) skipped by the ` +
    `column check -- they are procedural and cannot be verified from the text`,
);

// ── 3. ON CONFLICT must match a unique index or unique constraint ─────────────
// A mismatch is 42P10 at run time. For streamkit_claim_telegram_donation_notification
// that run time is when a real payment notification is being delivered.
//
// Unique constraints declared inside CREATE TABLE count, as do primary keys:
// most of this project's ON CONFLICT targets are those, not standalone indexes.
const uniqueKeys = new Map(); // "table:cols" -> file
const addKey = (table, cols, file) => uniqueKeys.set(`${table.toLowerCase()}:${cols.join(",").toLowerCase()}`, file);

/** Splits a column list, keeping `(expr)` as ONE entry. Strips one outer paren. */
function splitCols(src) {
  let s = src.trim();
  if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1);
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out
    .map((c) => c.replace(/\s+/g, " ").replace(/\(\s*(\w+)\s*->>\s*'([^']+)'\s*\)/g, "$1->>$2").trim())
    .filter(Boolean);
}

function collectUniqueKeys(text, file) {
  // Primary key / unique inside a CREATE TABLE body.
  for (const m of text.matchAll(
    new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);`, "gi"),
  )) {
    for (const line of m[2].split("\n")) {
      const t = line.trim().replace(/,$/, "");
      if (/^primary\s+key\s*\(/i.test(t)) {
        addKey(m[1], splitCols(t.replace(/^primary\s+key\s*/i, "")), file);
      } else if (/^unique\s*\(/i.test(t)) {
        addKey(m[1], splitCols(t.replace(/^unique\s*/i, "")), file);
      } else {
        // Inline form, the common one here:
        //   creator_id uuid primary key references ...
        //   code text not null unique
        //   fingerprint text primary key
        const inline = t.match(
          new RegExp(String.raw`^(\w+)\s+${TYPE}\b[\s\S]*?\b(primary\s+key|unique)\b`, "i"),
        );
        if (inline) addKey(m[1], [inline[1]], file);
      }
    }
  }
  // Standalone unique indexes. A partial index (WHERE ...) still satisfies an
  // ON CONFLICT that carries the same predicate.
  for (const m of text.matchAll(
    /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?(\w+)\s*\r?\n\s*on\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)(?:\s*\r?\n\s*where\b([\s\S]*?))?\s*;/gi,
  )) {
    addKey(m[2], splitCols(m[3]), file);
  }
}
for (const [file, text] of sql) collectUniqueKeys(text, file);
collectUniqueKeys(master, "supabase_schema.sql");

let conflictsChecked = 0;
for (const [file, text] of sql) {
  for (const m of text.matchAll(
    /insert\s+into\s+(?:public\.)?(\w+)\b[\s\S]{0,600}?on\s+conflict\s*\(([\s\S]*?)\)\s*(?:where\s+([\s\S]{0,160}?)\s*)?do\b/gi,
  )) {
    conflictsChecked++;
    const table = m[1];
    // storage.buckets and friends are managed by Supabase, not by any file here,
    // so there is nothing in this repository to check them against.
    if (!definedTables.has(table.toLowerCase())) {
      note(`${file}: ON CONFLICT on ${table}, a table no migration creates — not verifiable here`);
      continue;
    }
    const wanted = splitCols(m[2]);
    const key = `${table.toLowerCase()}:${wanted.join(",").toLowerCase()}`;
    if (!uniqueKeys.has(key)) {
      fail(
        file,
        `ON CONFLICT (${wanted.join(", ")}) on ${table} matches no unique index or constraint in any file. ` +
          `PostgreSQL raises 42P10 here AT RUN TIME.`,
      );
    }
  }
}

// ── 4. A destructive DELETE inside a client-callable function ─────────────────
// SECURITY DEFINER plus a grant to authenticated turns a DELETE into a tool any
// signed-in user can point at any row. "Clear" is meant to hide, not destroy.
//
// streamkit_import_share_code is deliberately destructive: importing a shared
// profile replaces the caller's rows with the snapshot's. That is its contract,
// so it is listed rather than reported.
const DELETE_OK = {
  streamkit_import_share_code:
    "by design: importing a share code replaces the caller's own rows with the snapshot's",
};

for (const [file, text] of sql) {
  // Bodies here are tagged dollar-quotes: $function$, $sql$, $migration$. A
  // pattern written for bare $$ matches nothing at all, which is how this check
  // managed to report "no destructive functions" while two of them existed.
  for (const m of text.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\4\$/gi,
  )) {
    const fn = m[1];
    if (!/\bdelete\s+from\b/i.test(m[5])) continue;
    const clientCallable = new RegExp(
      String.raw`grant\s+execute\s+on\s+function\s+(?:public\.)?${fn}\s*\([^)]*\)[^;]*;`,
      "i",
    ).test(text);
    if (!clientCallable) continue;
    if (DELETE_OK[fn]) note(`${file}: ${fn}() deletes rows — ${DELETE_OK[fn]}`);
    else fail(file, `${fn}() deletes rows and is granted to a client role. "Clear" must hide, not destroy.`);
  }
}

// ── 5. Pasted SQL must be BOM-free and free of mojibake ──────────────────────
// Non-ASCII has survived a paste through PowerShell as cp1252 mojibake, and a
// corrupted comment line is a syntax error. Non-ASCII inside a string literal is
// legitimate here (the Khmer message_template default) and is not flagged.
const MOJIBAKE = /[ÃÂÐÑ][-¿]|â€|ï¿½/;
for (const f of [...files, "supabase_schema.sql"]) {
  const bytes = readFileSync(f === "supabase_schema.sql" ? SCHEMA_FILE : join(DIR, f));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(f, "starts with a UTF-8 BOM; PowerShell writes these by default and the parser reads it as content");
  }
  const text = bytes.toString("utf8");
  text.split("\n").forEach((line, i) => {
    if (MOJIBAKE.test(line)) fail(f, `line ${i + 1} looks like mojibake: ${line.trim().slice(0, 70)}`);
    else if (/^\s*--/.test(line) && /[^\x00-\x7F]/.test(line)) {
      note(`${f}: non-ASCII in a comment (line ${i + 1}) — survives a paste as mojibake`);
    }
  });
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`migrations checked : ${files.length}`);
console.log(`columns known      : ${columns.size}`);
console.log(`unique keys known  : ${uniqueKeys.size}`);
console.log(`ON CONFLICT checked: ${conflictsChecked}`);

if (notes.size) {
  console.log(`\nnotes (${notes.size}) — review these, they are not failures:`);
  for (const n of [...notes].sort()) console.log(`  - ${n}`);
}

if (problems.length === 0) {
  console.log("\nPASS — none of these defect classes is present in the text.");
  console.log("      NOT proof the replay succeeds; only a real database can show that.");
  process.exit(0);
}
console.log(`\nFAIL — ${problems.length} problem(s):`);
const byFile = new Map();
for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p.msg]);
for (const [file, msgs] of [...byFile].sort()) {
  console.log(`\n  ${file}`);
  for (const m of msgs) console.log(`    - ${m}`);
}
process.exit(1);