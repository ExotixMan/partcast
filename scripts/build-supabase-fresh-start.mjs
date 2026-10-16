import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const requireServer = createRequire(new URL('apps/server/package.json', root));
const JSZip = requireServer('jszip');
const read = name => readFile(new URL(name, root), 'utf8');
const [first, second, guard, verification, instructions] = await Promise.all([
  'supabase/paste-ready/01_schema_and_roles.sql',
  'supabase/paste-ready/02_login_and_permissions.sql',
  'supabase/fresh-start/require_empty_project.sql',
  'supabase/fresh-start/verify_installation.sql',
  'docs/SUPABASE_FRESH_START.md'
].map(read));
const transactionStart = first.indexOf('\nbegin;\n');
if (transactionStart < 0) throw new Error('Cannot find Part 1 transaction; rebuild the canonical setup files first.');
const freshFirst = '-- PARTCAST FRESH PROJECT: PART 1 OF 2\n'
  + '-- Select your NEW empty Supabase project. This script does not reset an existing store.\n'
  + '-- Run the whole file as postgres. Run Part 2 separately after success.\n'
  + first.slice(transactionStart).replace('\nbegin;\n', `\nbegin;\n${guard}\n`);
const archive = new JSZip();
const timestamp = new Date('2026-10-16T00:00:00Z');
for (const [name, contents] of Object.entries({
  '01_schema_and_roles.sql': freshFirst,
  '02_login_and_permissions.sql': second,
  '03_verify_installation.sql': verification,
  'READ_FIRST.md': instructions
})) archive.file(name, contents, { date: timestamp });
const destination = new URL('downloads/setup/', root);
await mkdir(destination, { recursive: true });
await writeFile(new URL('PartCast_Fresh_Supabase_Setup.zip', destination),
  await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log('Built PartCast_Fresh_Supabase_Setup.zip from application setup SQL; no store data included.');
