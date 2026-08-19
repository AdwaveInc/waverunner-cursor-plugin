#!/usr/bin/env node

/**
 * Validates this single-plugin repo against Cursor Marketplace rules:
 * https://cursor.com/docs/reference/plugins
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const errors = [];
const warnings = [];

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const allowedVariableKeywords = new Set([
  "type",
  "title",
  "description",
  "default",
  "enum",
  "const",
  "properties",
  "required",
  "items",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, context) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    addError(`${context} is missing: ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
}

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n");
}

function parseFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return null;
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const fields = {};

  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    fields[key] = value;
  }

  return fields;
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true;
  }
  if (path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return !normalized.startsWith("../") && normalized !== "..";
}

function collectPlaceholders(value, found = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
      found.add(match[1]);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlaceholders(entry, found);
    }
    return found;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectPlaceholders(entry, found);
    }
  }
  return found;
}

function validateVariableSchema(schema, pathLabel) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    addError(`${pathLabel} must be a JSON Schema object.`);
    return;
  }

  for (const key of Object.keys(schema)) {
    if (!allowedVariableKeywords.has(key)) {
      addError(`${pathLabel} uses unsupported keyword "${key}".`);
    }
  }

  if (schema.type !== "object") {
    addError(`${pathLabel}.type must be "object".`);
  }
  if (!schema.properties || typeof schema.properties !== "object") {
    addError(`${pathLabel}.properties is required.`);
    return;
  }

  for (const [name, property] of Object.entries(schema.properties)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      addError(`${pathLabel}.properties.${name} should be an UPPER_SNAKE_CASE variable name.`);
    }
    if (!property || typeof property !== "object") {
      addError(`${pathLabel}.properties.${name} must be an object.`);
      continue;
    }
    for (const key of Object.keys(property)) {
      if (!allowedVariableKeywords.has(key)) {
        addError(`${pathLabel}.properties.${name} uses unsupported keyword "${key}".`);
      }
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string")) {
      addError(`${pathLabel}.required must be an array of strings.`);
    }
  }
}

async function main() {
  const marketplacePath = path.join(repoRoot, ".cursor-plugin", "marketplace.json");
  if (await pathExists(marketplacePath)) {
    addError(
      "This repo is a single Cursor Plugin. Remove .cursor-plugin/marketplace.json so marketplace publish treats the root plugin as the package."
    );
  }

  const manifestPath = path.join(repoRoot, ".cursor-plugin", "plugin.json");
  const manifest = await readJsonFile(manifestPath, "Cursor Plugin manifest");
  if (!manifest) {
    summarizeAndExit();
    return;
  }

  if (typeof manifest.name !== "string" || !pluginNamePattern.test(manifest.name)) {
    addError(
      '"name" must be lowercase kebab-case and start/end with an alphanumeric character (e.g. waverunner).'
    );
  } else if (manifest.name !== "waverunner") {
    addError(`Expected plugin name "waverunner", found "${manifest.name}".`);
  }

  if (typeof manifest.description !== "string" || manifest.description.trim().length < 20) {
    addError('"description" must clearly explain the plugin\'s purpose.');
  }

  if (!manifest.author || typeof manifest.author.name !== "string" || manifest.author.name.length === 0) {
    addError('"author.name" is required.');
  }

  if (manifest.license !== "MIT") {
    addError('"license" must be MIT.');
  }

  if (typeof manifest.homepage !== "string" || !manifest.homepage.startsWith("https://")) {
    addError('"homepage" must be an https URL.');
  }
  if (typeof manifest.repository !== "string" || !manifest.repository.startsWith("https://")) {
    addError('"repository" must be an https URL.');
  }

  if (typeof manifest.logo !== "string") {
    addError('"logo" is required and must be a relative path.');
  } else if (!isSafeRelativePath(manifest.logo) || manifest.logo.startsWith("http")) {
    addError('"logo" must be a committed relative path (no .., no absolute URL).');
  } else if (!(await pathExists(path.join(repoRoot, manifest.logo)))) {
    addError(`"logo" references a missing file: ${manifest.logo}`);
  }

  const pathFields = ["logo", "rules", "skills", "agents", "commands", "hooks", "mcpServers"];
  for (const field of pathFields) {
    const value = manifest[field];
    const candidates = [];
    if (typeof value === "string") {
      candidates.push(value);
    } else if (Array.isArray(value)) {
      candidates.push(...value.filter((entry) => typeof entry === "string"));
    }
    for (const candidate of candidates) {
      if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
        continue;
      }
      if (!isSafeRelativePath(candidate)) {
        addError(`Field "${field}" has an unsafe path "${candidate}".`);
        continue;
      }
      if (!(await pathExists(path.join(repoRoot, candidate)))) {
        addError(`Field "${field}" references a missing path "${candidate}".`);
      }
    }
  }

  if (!manifest.variables) {
    addError('"variables" must declare WAVERUNNER_API_KEY.');
  } else {
    validateVariableSchema(manifest.variables, "variables");
    const properties = manifest.variables.properties ?? {};
    if (!properties.WAVERUNNER_API_KEY) {
      addError("variables.properties must include WAVERUNNER_API_KEY.");
    }
    const required = manifest.variables.required ?? [];
    if (!required.includes("WAVERUNNER_API_KEY")) {
      addError("variables.required must include WAVERUNNER_API_KEY.");
    }
  }

  const mcpPath = path.join(repoRoot, "mcp.json");
  const mcp = await readJsonFile(mcpPath, "MCP config");
  if (mcp) {
    const servers = mcp.mcpServers;
    if (!servers || typeof servers !== "object" || !servers.waverunner) {
      addError('mcp.json must define mcpServers.waverunner.');
    } else {
      const server = servers.waverunner;
      if (server.url !== "https://waverunner.adwave.com/api/mcp") {
        addError(
          'mcpServers.waverunner.url must be the public HTTPS MCP: https://waverunner.adwave.com/api/mcp'
        );
      }
      if (server.command) {
        addError("mcpServers.waverunner must not use stdio/command; Grok Bot requires public HTTPS.");
      }
      if (typeof server.url === "string" && (server.url.includes("localhost") || server.url.startsWith("http://"))) {
        addError("MCP URL must be public HTTPS (no localhost, no http).");
      }
      const auth = server.headers?.Authorization;
      if (auth !== "Bearer ${WAVERUNNER_API_KEY}") {
        addError(
          'mcpServers.waverunner.headers.Authorization must be "Bearer ${WAVERUNNER_API_KEY}" with no hardcoded secret.'
        );
      }
    }

    const placeholders = collectPlaceholders(mcp);
    const declared = new Set(Object.keys(manifest.variables?.properties ?? {}));
    for (const name of placeholders) {
      if (!declared.has(name)) {
        addError(`mcp.json uses \${${name}} which is not declared in plugin.json variables.`);
      }
    }
  }

  const skillPath = path.join(repoRoot, "skills", "waverunner", "SKILL.md");
  if (!(await pathExists(skillPath))) {
    addError("Missing skills/waverunner/SKILL.md");
  } else {
    const content = await fs.readFile(skillPath, "utf8");
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      addError("skills/waverunner/SKILL.md is missing YAML frontmatter.");
    } else {
      if (parsed.name !== "waverunner") {
        addError('Skill frontmatter "name" must be waverunner.');
      }
      if (!parsed.description) {
        addError('Skill frontmatter "description" is required.');
      }
    }
    const lowered = content.toLowerCase();
    for (const tool of ["launch_campaign", "resume_campaign", "end_campaign"]) {
      if (!lowered.includes(tool)) {
        addError(`Skill must mention ${tool}.`);
      }
    }
    if (!lowered.includes("confirm")) {
      addError("Skill must tell agents to confirm before wallet spend.");
    }
  }

  for (const requiredFile of ["README.md", "LICENSE"]) {
    if (!(await pathExists(path.join(repoRoot, requiredFile)))) {
      addError(`Missing ${requiredFile}.`);
    }
  }

  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8").catch(() => "");
  if (readme && !readme.includes("Settings → API keys") && !readme.includes("Settings -> API keys")) {
    addError('README must tell users to create a key in Waverunner Settings → API keys.');
  }

  const secretPattern = /wr_[A-Za-z0-9]{8,}/g;
  const walkTargets = [repoRoot];
  while (walkTargets.length > 0) {
    const current = walkTargets.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walkTargets.push(entryPath);
        continue;
      }
      if (!/\.(json|md|mjs|js|txt|yml|yaml)$/i.test(entry.name)) {
        continue;
      }
      const text = await fs.readFile(entryPath, "utf8");
      const matches = text.match(secretPattern) ?? [];
      if (matches.length > 0) {
        addError(`Possible hardcoded API key in ${path.relative(repoRoot, entryPath)}: ${matches[0]}`);
      }
    }
  }

  summarizeAndExit();
}

function summarizeAndExit() {
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Validation passed.");
}

await main();
