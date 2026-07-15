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

const resources = { en: {}, 'zh-CN': {} };
for (const locale of Object.keys(resources)) {
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

const enNamespaces = Object.keys(resources.en).sort();
const zhNamespaces = Object.keys(resources['zh-CN']).sort();
if (enNamespaces.join('|') !== zhNamespaces.join('|')) {
  errors.push(`namespace mismatch: en=[${enNamespaces.join(', ')}], zh-CN=[${zhNamespaces.join(', ')}]`);
}

for (const namespace of enNamespaces) {
  const en = resources.en[namespace] ?? {};
  const zh = resources['zh-CN'][namespace] ?? {};
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zh).sort();
  for (const key of enKeys) {
    if (!(key in zh)) {
      errors.push(`zh-CN/${namespace}.json: missing key "${key}"`);
      continue;
    }
    const enPlaceholders = placeholders(en[key]);
    const zhPlaceholders = placeholders(zh[key]);
    if (enPlaceholders.join('|') !== zhPlaceholders.join('|')) {
      errors.push(
        `${namespace}:${key}: placeholder mismatch en=[${enPlaceholders.join(', ')}] zh-CN=[${zhPlaceholders.join(', ')}]`,
      );
    }
  }
  for (const key of zhKeys) {
    if (!(key in en)) errors.push(`zh-CN/${namespace}.json: extra key "${key}"`);
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
  if (!resources.en[namespace]) {
    errors.push(`${path.relative(appRoot, filePath)}:${line}: unknown namespace "${namespace}"`);
  } else if (!(key in resources.en[namespace])) {
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

const identicalValues = [];
for (const namespace of enNamespaces) {
  for (const [key, value] of Object.entries(resources.en[namespace] ?? {})) {
    if (
      typeof value === 'string' &&
      value === resources['zh-CN'][namespace]?.[key] &&
      /[A-Za-z]{3}/.test(value)
    ) {
      identicalValues.push(`${namespace}:${key}`);
    }
  }
}
if (identicalValues.length > 0) {
  warnings.push(`${identicalValues.length} values are identical in en and zh-CN (usually product names or technical terms)`);
}

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`i18n validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const keyCount = enNamespaces.reduce((count, namespace) => count + Object.keys(resources.en[namespace]).length, 0);
console.log(`i18n validation passed: ${enNamespaces.length} namespaces, ${keyCount} keys per locale.`);
