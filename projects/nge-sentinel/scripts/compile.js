/**
 * Standalone compile script using the bundled solcjs.
 * Bypasses Hardhat's compiler download when network is unavailable.
 *
 * Usage: node scripts/compile.js
 */
const solc = require("solc");
const fs = require("fs");
const path = require("path");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");
const NODE_MODULES = path.join(__dirname, "..", "node_modules");

function findImport(importPath) {
  // Try node_modules first (for @openzeppelin imports)
  const nmPath = path.join(NODE_MODULES, importPath);
  if (fs.existsSync(nmPath)) {
    return { contents: fs.readFileSync(nmPath, "utf8") };
  }
  // Try relative to contracts dir
  const localPath = path.join(CONTRACTS_DIR, importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

function collectSolFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir.toString(), entry.name);
    if (entry.isDirectory()) {
      collectSolFiles(full, files);
    } else if (entry.name.endsWith(".sol")) {
      files.push(full);
    }
  }
  return files;
}

// Collect all .sol files
const solFiles = collectSolFiles(CONTRACTS_DIR);
const sources = {};
for (const file of solFiles) {
  const rel = path.relative(CONTRACTS_DIR, file);
  sources[rel] = { content: fs.readFileSync(file, "utf8") };
}

console.log(`Compiling ${Object.keys(sources).length} Solidity files...`);
console.log(`Compiler: solc ${solc.version()}`);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode"],
        "": ["ast"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

// Check for errors
if (output.errors) {
  let hasError = false;
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.error(`\n  ERROR: ${err.formattedMessage}`);
    } else {
      console.warn(`\n  WARNING: ${err.formattedMessage}`);
    }
  }
  if (hasError) {
    process.exit(1);
  }
}

// Write artifacts
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

let contractCount = 0;
for (const [sourceName, contracts] of Object.entries(output.contracts || {})) {
  for (const [contractName, artifact] of Object.entries(contracts)) {
    const outDir = path.join(ARTIFACTS_DIR, sourceName);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${contractName}.json`);
    fs.writeFileSync(
      outFile,
      JSON.stringify(
        {
          contractName,
          sourceName,
          abi: artifact.abi,
          bytecode: artifact.evm?.bytecode?.object
            ? `0x${artifact.evm.bytecode.object}`
            : "0x",
          deployedBytecode: artifact.evm?.deployedBytecode?.object
            ? `0x${artifact.evm.deployedBytecode.object}`
            : "0x",
        },
        null,
        2
      )
    );
    contractCount++;
  }
}

console.log(`\nCompiled ${contractCount} contracts successfully.`);
console.log(`Artifacts written to ${ARTIFACTS_DIR}/`);
