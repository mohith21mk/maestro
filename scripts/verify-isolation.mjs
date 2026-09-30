#!/usr/bin/env node

/**
 * POWER HOUSE ↔ MINEGUARD AI - Automated Project Isolation Validator
 *
 * This script enforces permanent repository-level isolation rules.
 * It detects accidental cross-project imports, dependencies, API calls,
 * Git configurations, database strings, storage keys, and environment variables.
 *
 * SCOPE ARCHITECTURE:
 * - Category A: RUNTIME / SOURCE / CONFIGURATION
 *   Zero prohibited cross-project references allowed.
 * - Category B: ISOLATION POLICY / VALIDATOR
 *   Explicitly permitted to reference MINEGUARD AI because they define, test,
 *   and enforce the isolation boundary.
 * - Category C: BUILD ARTIFACTS / VIRTUAL ENVIRONMENTS
 *   Standard non-source directories and bytecode/binary artifacts.
 *
 * Exit code 0: Verification Passed (Complete Isolation)
 * Exit code 1: Violation Detected (Fails loudly during dev/commit/build/CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Prohibited terms for Category A (Runtime, Source, Configuration)
const FORBIDDEN_TERMS = [
  'mineguard',
  'mine_guard',
  'mine-guard',
  'mineguard-ai',
  'mineguard.db',
  'mineguard_',
  'mine manager',
  'coal mine',
  'coal-mine',
  'dgms',
];

// Patterns that indicate illegal cross-project imports or path links
const FORBIDDEN_IMPORT_PATTERNS = [
  /(?:import|require|from)\s+['"][^'"]*mineguard[^'"]*['"]/i,
  /(?:import|require|from)\s+['"]\.\.\/.*mineguard[^'"]*['"]/i,
  /file:\/\/.*mineguard/i,
];

/**
 * Category B: ISOLATION POLICY & VALIDATOR FILES
 * These files explicitly name MINEGUARD AI to document, test, and enforce the boundary.
 */
const CATEGORY_B_POLICY_EXCLUSIONS = new Map([
  ['PROJECT-ISOLATION.md', 'Architecture specification defining permanent isolation from MINEGUARD AI'],
  ['verify-isolation.mjs', 'Self - Validation engine containing forbidden keyword definitions'],
  ['test_isolation.py', 'Pytest isolation test suite asserting absence of cross-project references'],
  ['pre-commit', 'Git hook script invoking isolation validation prior to commit'],
]);

/**
 * Category C: BUILD ARTIFACTS & ENVIRONMENT
 * Generated caches, build targets, virtual environments, and binary database files.
 */
const CATEGORY_C_ENV_EXCLUSIONS = new Map([
  ['.git', 'Git version control internal database'],
  ['node_modules', 'Third-party npm dependency packages'],
  ['dist', 'Compiled Vite frontend distribution bundle'],
  ['build', 'Build output directory'],
  ['.pytest_cache', 'Pytest cache directory'],
  ['__pycache__', 'Python bytecode cache'],
  ['.venv', 'Python virtual environment directory'],
  ['venv', 'Python virtual environment directory'],
  ['coverage', 'Test coverage reports'],
  ['.idea', 'IDE workspace metadata'],
  ['.vscode', 'IDE workspace configuration'],
  ['package-lock.json', 'NPM dependency resolution lockfile'],
  ['powerhouse.db', 'SQLite application database binary'],
  ['test_powerhouse.db', 'SQLite test database binary'],
]);

// File extensions to scan in Category A
const SCANNABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.css',
  '.html',
  '.py',
  '.md',
  '.env',
  '.example',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
  '.ps1',
]);

const violations = [];
let scannedFileCount = 0;

function recordViolation(category, file, detail) {
  violations.push({
    category,
    file: file ? path.relative(REPO_ROOT, file) : 'Repository Config',
    detail,
  });
}

/**
 * 1. Check Git Remotes and Submodules
 */
function checkGitConfiguration() {
  try {
    const remotes = execSync('git remote -v', { cwd: REPO_ROOT, encoding: 'utf8' });
    if (/mineguard/i.test(remotes)) {
      recordViolation(
        'Git Remote Violation',
        null,
        'Found remote pointing to MineGuard repository: ' + remotes.trim()
      );
    }
  } catch {
    // If git command fails (e.g. non-git environment), continue safely
  }

  try {
    const submodules = execSync('git submodule status', { cwd: REPO_ROOT, encoding: 'utf8' });
    if (/mineguard/i.test(submodules)) {
      recordViolation(
        'Git Submodule Violation',
        null,
        'Found submodule referencing MineGuard: ' + submodules.trim()
      );
    }
  } catch {
    // No submodules configured
  }
}

/**
 * 2. Check Package Dependencies (package.json, requirements.txt)
 */
function checkPackageDependencies() {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      for (const [dep, ver] of Object.entries(allDeps)) {
        if (/mineguard/i.test(dep) || /mineguard/i.test(String(ver))) {
          recordViolation(
            'Package Dependency Violation',
            pkgPath,
            `Prohibited package dependency found: "${dep}": "${ver}"`
          );
        }
      }
    } catch (err) {
      recordViolation('Package Config Error', pkgPath, err.message);
    }
  }

  const reqPath = path.join(REPO_ROOT, 'backend', 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    const lines = fs.readFileSync(reqPath, 'utf8').split('\n');
    for (const line of lines) {
      if (/mineguard/i.test(line)) {
        recordViolation(
          'Python Dependency Violation',
          reqPath,
          `Prohibited Python package/requirement found: ${line.trim()}`
        );
      }
    }
  }
}

/**
 * 3. Recursive File Scan for Category A (Runtime, Source, Configuration)
 */
function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relName = entry.name;

    // Check Category B and C exclusions
    if (CATEGORY_B_POLICY_EXCLUSIONS.has(relName) || CATEGORY_C_ENV_EXCLUSIONS.has(relName)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SCANNABLE_EXTENSIONS.has(ext) && !entry.name.startsWith('.env')) {
        continue;
      }

      scannedFileCount++;

      // Check file name itself for contamination
      for (const term of FORBIDDEN_TERMS) {
        if (entry.name.toLowerCase().includes(term)) {
          recordViolation(
            'File Name Contamination',
            fullPath,
            `File name contains prohibited cross-project term "${term}"`
          );
        }
      }

      // Read file content
      try {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for forbidden import patterns
        for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
          const match = content.match(pattern);
          if (match) {
            recordViolation(
              'Cross-Project Import',
              fullPath,
              `Found illegal cross-project import: ${match[0]}`
            );
          }
        }

        // Check line by line for forbidden terms
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const lower = line.toLowerCase();
          for (const term of FORBIDDEN_TERMS) {
            if (lower.includes(term)) {
              recordViolation(
                'Cross-Project Reference',
                fullPath,
                `Line ${idx + 1}: Found prohibited reference to "${term}"`
              );
            }
          }
        });
      } catch {
        // Binary or unreadable file - skip
      }
    }
  }
}

/**
 * 4. Check Browser Storage Namespaces
 */
function checkBrowserStorage() {
  const srcDir = path.join(REPO_ROOT, 'src');
  if (!fs.existsSync(srcDir)) return;

  function scanStorageInDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanStorageInDir(fullPath);
      } else if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const storageRegex = /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = storageRegex.exec(content)) !== null) {
          const key = match[1];
          if (/mineguard/i.test(key)) {
            recordViolation(
              'Storage Namespace Violation',
              fullPath,
              `Illegal storage key "${key}" detected. Must use powerhouse namespace.`
            );
          }
        }
      }
    }
  }

  scanStorageInDir(srcDir);
}

/**
 * 5. Check Environment & Database Config
 */
function checkEnvironmentAndConfig() {
  const backendConfig = path.join(REPO_ROOT, 'backend', 'app', 'core', 'config.py');
  if (fs.existsSync(backendConfig)) {
    const content = fs.readFileSync(backendConfig, 'utf8');
    if (/mineguard/i.test(content)) {
      recordViolation(
        'Backend Configuration Violation',
        backendConfig,
        'backend/app/core/config.py references prohibited cross-project values.'
      );
    }
  }
}

/**
 * Main Execution
 */
console.log('======================================================================');
console.log(' POWER HOUSE ↔ MINEGUARD AI - Isolation Guardrail Verification');
console.log('======================================================================');
console.log('[Scope Architecture]');
console.log('  Category A: RUNTIME / SOURCE / CONFIGURATION (Strict Zero-Tolerance)');
console.log('  Category B: ISOLATION POLICY / VALIDATOR (Allowed policy documentation):');
for (const [file, reason] of CATEGORY_B_POLICY_EXCLUSIONS.entries()) {
  console.log(`    • ${file}: ${reason}`);
}
console.log('  Category C: BUILD ARTIFACTS / VIRTUAL ENVIRONMENTS (Standard exclusions):');
console.log(`    • ${Array.from(CATEGORY_C_ENV_EXCLUSIONS.keys()).join(', ')}`);
console.log('----------------------------------------------------------------------');

checkGitConfiguration();
checkPackageDependencies();
scanDirectory(REPO_ROOT);
checkBrowserStorage();
checkEnvironmentAndConfig();

console.log(`[Scan Completed] Analyzed ${scannedFileCount} source/runtime files in Category A.`);

if (violations.length === 0) {
  console.log('\n[PASS] Repository Isolation Status: 100% CLEAN');
  console.log('Zero cross-project dependencies, imports, or coupling with MINEGUARD AI.');
  console.log('======================================================================\n');
  process.exit(0);
} else {
  console.error(`\n[FAIL] Isolation Violations Detected (${violations.length} issue(s)):\n`);
  violations.forEach((v, i) => {
    console.error(`  ${i + 1}. [${v.category}] ${v.file}`);
    console.error(`     ${v.detail}`);
  });
  console.error('\nHard Error: Cross-project coupling with MINEGUARD AI is strictly prohibited.');
  console.error('Please eliminate all cross-project references before committing or building.\n');
  process.exit(1);
}
