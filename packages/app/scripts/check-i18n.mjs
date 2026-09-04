import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(appRoot, 'src');
const localesRoot = path.join(sourceRoot, 'i18n', 'locales');
const errors = [];
const warnings = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const qualifiedKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, qualifiedKey, output);
    } else {
      output[qualifiedKey] = child;
    }
  }
  return output;
}

function placeholders(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}

const sourceLocale = 'en';
const localeNames = fs
  .readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const resources = Object.fromEntries(localeNames.map((locale) => [locale, {}]));

if (!localeNames.includes(sourceLocale)) {
  errors.push(`source locale directory "${sourceLocale}" is missing`);
}

for (const locale of localeNames) {
  const localeDirectory = path.join(localesRoot, locale);
  for (const fileName of fs.readdirSync(localeDirectory).filter((name) => name.endsWith('.json')).sort()) {
    const namespace = fileName.replace(/\.json$/, '');
    const filePath = path.join(localeDirectory, fileName);
    const source = fs.readFileSync(filePath, 'utf8');
    try {
      resources[locale][namespace] = flatten(JSON.parse(source));
    } catch (error) {
      errors.push(`${path.relative(appRoot, filePath)}: invalid JSON: ${error.message}`);
      continue;
    }
    if (/\?{3,}|\uFFFD|已完ae/.test(source)) {
      errors.push(`${path.relative(appRoot, filePath)}: contains likely encoding-corrupted text`);
    }
  }
}

const sourceResources = resources[sourceLocale] ?? {};
const sourceNamespaces = Object.keys(sourceResources).sort();

for (const locale of localeNames.filter((name) => name !== sourceLocale)) {
  const targetNamespaces = Object.keys(resources[locale] ?? {}).sort();
  if (sourceNamespaces.join('|') !== targetNamespaces.join('|')) {
    errors.push(
      `namespace mismatch: ${sourceLocale}=[${sourceNamespaces.join(', ')}], ${locale}=[${targetNamespaces.join(', ')}]`,
    );
  }

  for (const namespace of sourceNamespaces) {
    const source = sourceResources[namespace] ?? {};
    const target = resources[locale]?.[namespace] ?? {};
    const sourceKeys = Object.keys(source).sort();
    const targetKeys = Object.keys(target).sort();
    for (const key of sourceKeys) {
      if (!(key in target)) {
        errors.push(`${locale}/${namespace}.json: missing key "${key}"`);
        continue;
      }
      const sourcePlaceholders = placeholders(source[key]);
      const targetPlaceholders = placeholders(target[key]);
      if (sourcePlaceholders.join('|') !== targetPlaceholders.join('|')) {
        errors.push(
          `${namespace}:${key}: placeholder mismatch ${sourceLocale}=[${sourcePlaceholders.join(', ')}] ${locale}=[${targetPlaceholders.join(', ')}]`,
        );
      }
    }
    for (const key of targetKeys) {
      if (!(key in source)) errors.push(`${locale}/${namespace}.json: extra key "${key}"`);
    }
  }
}

function bindingContainsT(name) {
  return ts.isObjectBindingPattern(name) && name.elements.some((element) => element.name.getText() === 't');
}

function namespaceForCall(call) {
  for (let current = call.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current) || !current.body || !ts.isBlock(current.body)) continue;
    for (const statement of current.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!bindingContainsT(declaration.name) || !declaration.initializer) continue;
        if (!ts.isCallExpression(declaration.initializer)) continue;
        if (declaration.initializer.expression.getText() !== 'useTranslation') continue;
        const argument = declaration.initializer.arguments[0];
        return argument && ts.isStringLiteral(argument) ? argument.text : 'common';
      }
    }
  }
  return null;
}

function validateReference(filePath, sourceFile, call, rawKey) {
  let namespace;
  let key;
  const separator = rawKey.indexOf(':');
  if (separator >= 0) {
    namespace = rawKey.slice(0, separator);
    key = rawKey.slice(separator + 1);
  } else {
    namespace = namespaceForCall(call);
    key = rawKey;
  }
  if (!namespace) return;
  const line = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1;
  if (!sourceResources[namespace]) {
    errors.push(`${path.relative(appRoot, filePath)}:${line}: unknown namespace "${namespace}"`);
  } else if (!(key in sourceResources[namespace])) {
    errors.push(`${path.relative(appRoot, filePath)}:${line}: missing translation key "${namespace}:${key}"`);
  }
}

for (const filePath of walk(sourceRoot).filter((file) => /\.(ts|tsx)$/.test(file))) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const expression = node.expression;
      const isTranslationCall =
        (ts.isIdentifier(expression) && expression.text === 't') ||
        (ts.isPropertyAccessExpression(expression) && expression.name.text === 't');
      const firstArgument = node.arguments[0];
      if (isTranslationCall && ts.isStringLiteral(firstArgument)) {
        validateReference(filePath, sourceFile, node, firstArgument.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// ---- Hardcoded user-visible literal detection (.tsx only) ------------------
// Flags JSX text nodes, visible JSX attributes (title/placeholder/aria-label/
// label/alt) and toast() messages that are still plain English literals. The
// allowlist covers product names and technical terms; ordinary sentences must
// go through t(). New hits fail the check, so this also guards regressions.
const HARDCODED_ALLOWLIST = [
  'WarpCore', 'warpdrv', 'WarpDrv', 'Kokoro', 'Whisper', 'whisper', 'llama', 'LLAMA',
  'GGUF', 'gguf', 'MCP', 'mcp', 'JSON', 'SQLite', 'sqlite', 'HuggingFace', 'Hugging Face',
  'Hub', 'TTS', 'PTT', 'Flash Attention', 'MTP', 'Ngram', 'ngram', 'DFlash', 'DSpark',
  'Inter', 'Dracula', 'Nord', 'Tokyo Night', 'Gruvbox', 'Rose Pine', 'Catppuccin',
  'Solarized', 'Kimbie', 'Everforest', 'Monokai', 'Palenight', 'Obsidian', 'Kanagawa',
  'Vesper', 'Min', 'Amoled', 'Same as target', 'Jinja', 'jinja', 'FFmpeg', 'ffmpeg',
  'mmproj', 'callers', 'callees', 'truncated', 'Open in browser', 'To-Do', 'Mirostat',
  'KV Cache', 'Wrench', 'Draft Model', 'Tools Off', 'esc', 'ngl', 'mmproj.GGUF',
  'WarpDrv', 'Hub', 'Code Graph', 'N-gram', 'M-Gram',
  'Port', 'guide', '/path/to/llama-server', '--custom-flag', 'Strix Halo', 'ROCm',
  'e.g. ROCm 7.2 — Strix Halo', '/path/to/models', '{"temperature": 0.7, "topP": 0.9}',
  'wc_', 'px', 'MB', 'GB', 'KB', 'grep', '~90 MB',
  'N-Match', 'N-Min', 'N-Max', 'GPU', 'Preserve Thinking', '--some-flag value',
  'e.g. whisper-large, stt-primary', 'sample', 'exit', 'Active', 'results', 'found', 'tok', 'backends',
  'GPU Layers', 'auto',
];
const VISIBLE_JSX_PROPS = new Set(['title', 'placeholder', 'aria-label', 'label', 'alt', 'description', 'defaultValue']);

const hasLetters = (value) => (value.match(/[A-Za-z]/g) || []).length >= 2;

// Match longest entries first: a short entry like 'llama' would otherwise
// consume the match for a longer one like '/path/to/llama-server' and leave
// letter fragments behind.
const HARDCODED_ALLOWLIST_SORTED = [...HARDCODED_ALLOWLIST].sort((a, b) => b.length - a.length);

function isAllowedLiteral(value) {
  let rest = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const allowed of HARDCODED_ALLOWLIST_SORTED) {
      if (rest.includes(allowed)) {
        rest = rest.split(allowed).join(' ');
        changed = true;
      }
    }
  }
  return !/[A-Za-z]/.test(rest);
}

function flagLiteral(filePath, sourceFile, node, value, kind) {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  errors.push(`${path.relative(appRoot, filePath)}:${line}: untranslated ${kind} literal ${JSON.stringify(value.slice(0, 80))}`);
}

for (const filePath of walk(sourceRoot).filter((file) => file.endsWith('.tsx'))) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (ts.isJsxText(node)) {
      // Strip HTML entities (&nbsp; &amp; …) and @handles before judging —
      // neither is a translatable sentence.
      const text = node.text.replace(/&[a-z]+;/g, ' ').replace(/@[\w-]+/g, ' ');
      if (hasLetters(text) && !isAllowedLiteral(text)) flagLiteral(filePath, sourceFile, node, text, 'JSX text');
    } else if (ts.isJsxAttribute(node) && VISIBLE_JSX_PROPS.has(node.name.text)) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init) && hasLetters(init.text) && !isAllowedLiteral(init.text)) {
        flagLiteral(filePath, sourceFile, node, init.text, `prop ${node.name.text}`);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const expression = node.expression;
      const isToastCall =
        (ts.isIdentifier(expression) && expression.text === 'toast') ||
        (ts.isPropertyAccessExpression(expression) && expression.name.text === 'toast');
      if (isToastCall) {
        // toast('error', message) / toast.toast('success', message): the
        // message is the LAST argument; a leading variant string must not be
        // mistaken for a translatable message.
        const candidate = [...node.arguments].reverse().find((arg) => ts.isStringLiteral(arg));
        const args = node.arguments;
        const messageIndex = args.length >= 2 && ts.isStringLiteral(args[0]) ? args.length - 1 : 0;
        const message = args[messageIndex];
        if (candidate && message && ts.isStringLiteral(message) && hasLetters(message.text) && !isAllowedLiteral(message.text)) {
          flagLiteral(filePath, sourceFile, node, message.text, 'toast');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

for (const locale of localeNames.filter((name) => name !== sourceLocale)) {
  const identicalValues = [];
  for (const namespace of sourceNamespaces) {
    for (const [key, value] of Object.entries(sourceResources[namespace] ?? {})) {
      if (
        typeof value === 'string' &&
        value === resources[locale]?.[namespace]?.[key] &&
        /[A-Za-z]{3}/.test(value)
      ) {
        identicalValues.push(`${namespace}:${key}`);
      }
    }
  }
  if (identicalValues.length > 0) {
    warnings.push(
      `${identicalValues.length} values are identical in ${sourceLocale} and ${locale} (usually product names or technical terms)`,
    );
  }
}

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`i18n validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const keyCount = sourceNamespaces.reduce(
  (count, namespace) => count + Object.keys(sourceResources[namespace]).length,
  0,
);
console.log(
  `i18n validation passed: ${localeNames.length} locales, ${sourceNamespaces.length} namespaces, ${keyCount} keys per locale.`,
);
