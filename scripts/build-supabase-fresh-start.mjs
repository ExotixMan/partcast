import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = new URL('../', import.meta.url);
const requireServer = createRequire(new URL('apps/server/package.json', root));
const JSZip = requireServer('jszip');
const read = name => readFile(new URL(name, root), 'utf8');

export async function buildSupabaseFreshStart({ outputDirectory = fileURLToPath(new URL('dist/setup/', root)) } = {}) {
  const [first, second, guard, verification, instructions] = await Promise.all([
    'supabase/paste-ready/01_schema_and_roles.sql',
    'supabase/paste-ready/02_login_and_permissions.sql',
    'supabase/fresh-start/require_empty_project.sql',
    'supabase/fresh-start/verify_installation.sql',
    'docs/SUPABASE_FRESH_START.md'
  ].map(read));
  const transactionStart = first.search(/^begin;[ \t]*\r?$/m);
  if (transactionStart < 0) throw new Error('Cannot find Part 1 transaction; rebuild the canonical setup files first.');
  const freshFirst = first.slice(transactionStart).replace(/^begin;[ \t]*\r?\n/, `begin;\n${guard}\n`);
  const archive = new JSZip();
  const timestamp = new Date('2026-10-16T00:00:00Z');
  for (const [name, contents] of Object.entries({
    '01_schema_and_roles.sql': freshFirst,
    '02_login_and_permissions.sql': second,
    '03_verify_installation.sql': verification,
    'READ_FIRST.md': instructions
  })) archive.file(name, contents, { date: timestamp });
  const destination = resolve(outputDirectory);
  await mkdir(destination, { recursive: true });
  const archivePath = resolve(destination, 'PartCast_Fresh_Supabase_Setup.zip');
  await writeFile(archivePath,
    await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
  return archivePath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { output: { type: 'string' } } });
  const archivePath = await buildSupabaseFreshStart(values.output ? { outputDirectory: values.output } : {});
  console.log(`Built ${archivePath} from application setup SQL; no store data included.`);
}
