/**
 * Sync current project dist/ + commands/ to the local Claude plugin cache.
 * Supports Windows, macOS, Linux.
 *
 * Usage: node scripts/sync-to-plugin.js
 */

import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function getClaudeDir() {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir) return envDir;

  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error('Cannot determine home directory. Set CLAUDE_CONFIG_DIR or HOME.');
  }

  return join(home, '.claude');
}

function findPluginDir(claudeDir) {
  const pluginBase = join(claudeDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  if (!existsSync(pluginBase)) {
    throw new Error(`Plugin not installed: ${pluginBase}\nRun: /plugin install claude-hud`);
  }

  const entries = readdirSync(pluginBase, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d+\.\d+(\.\d+)?/.test(e.name))
    .map(e => ({
      name: e.name,
      path: join(pluginBase, e.name),
      mtime: statSync(join(pluginBase, e.name)).mtime,
    }));

  if (entries.length === 0) {
    throw new Error(`No version directories found in ${pluginBase}`);
  }

  // Pick latest by semver or fallback to mtime
  entries.sort((a, b) => {
    const va = a.name.split('.').map(Number);
    const vb = b.name.split('.').map(Number);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const na = va[i] || 0;
      const nb = vb[i] || 0;
      if (na !== nb) return nb - na;
    }
    return b.mtime - a.mtime;
  });

  return entries[0].path;
}

function syncDir(src, dst) {
  if (!existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}\nRun: npm run build`);
  }

  cpSync(src, dst, { recursive: true, force: true, dereference: true });
}

function main() {
  const claudeDir = getClaudeDir();
  const pluginDir = findPluginDir(claudeDir);

  console.log(`Target: ${pluginDir}`);

  const dirs = ['dist', 'commands'];
  for (const dir of dirs) {
    const src = join(PROJECT_ROOT, dir);
    const dst = join(pluginDir, dir);
    syncDir(src, dst);
    console.log(`  Synced ${dir}/ -> ${dst}`);
  }

  console.log('Done. Restart Claude Code to see changes.');
}

main();
