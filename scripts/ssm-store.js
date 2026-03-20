/**
 * @file ssm-store.js
 * @description Stores deployed contract addresses in AWS SSM Parameter Store.
 *
 * Each project's CloudFormation/Lambda functions read their contract address
 * from SSM. This script writes those parameters after Hardhat deployment.
 *
 * Usage:
 *   node scripts/ssm-store.js --project sentinel --address 0x1234...
 *   node scripts/ssm-store.js --project iot --address 0x5678...
 *   node scripts/ssm-store.js --project token --address 0x9abc...
 *   node scripts/ssm-store.js --project governor --address 0xdef0...
 *   node scripts/ssm-store.js --project timelock --address 0x1111...
 *   node scripts/ssm-store.js --project sentinel --address 0x1234... --env staging
 *
 * Requires AWS CLI configured with appropriate IAM permissions.
 *
 * SSM parameter paths:
 *   /nge/sentinel/contract-address
 *   /nge/iot/contract-address
 *   /nge/token/contract-address
 *   /nge/governor/contract-address
 *   /nge/timelock/contract-address
 *   /nge/common/eth-rpc-url        (shared across projects)
 */
const { execSync } = require("child_process");

const SSM_PATHS = {
  sentinel: "/nge/sentinel/contract-address",
  iot: "/nge/iot/contract-address",
  token: "/nge/token/contract-address",
  governor: "/nge/governor/contract-address",
  timelock: "/nge/timelock/contract-address",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    parsed[key] = args[i + 1];
  }
  return parsed;
}

function ssmPut(name, value, description) {
  const cmd = [
    "aws ssm put-parameter",
    `--name "${name}"`,
    `--value "${value}"`,
    '--type "String"',
    `--description "${description}"`,
    "--overwrite",
  ].join(" ");

  console.log(`  Writing ${name} = ${value}`);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  const args = parseArgs();

  if (!args.project || !args.address) {
    console.error("Usage: node scripts/ssm-store.js --project <sentinel|iot|token|governor|timelock> --address <0x...>");
    console.error("       node scripts/ssm-store.js --rpc-url <https://...>  (to set shared RPC URL)");
    process.exit(1);
  }

  // Store RPC URL if provided
  if (args["rpc-url"]) {
    ssmPut("/nge/common/eth-rpc-url", args["rpc-url"], "Shared Ethereum RPC endpoint");

    // Also write project-specific aliases used by CloudFormation templates
    for (const project of Object.keys(SSM_PATHS)) {
      ssmPut(`/nge/${project}/eth-rpc-url`, args["rpc-url"], `Ethereum RPC endpoint for nge-${project}`);
    }
    console.log("\n  RPC URL stored for all projects.");
  }

  if (args.project && args.address) {
    const path = SSM_PATHS[args.project];
    if (!path) {
      console.error(`Unknown project: ${args.project}. Use: sentinel, iot, token, governor, or timelock`);
      process.exit(1);
    }

    if (!args.address.match(/^0x[0-9a-fA-F]{40}$/)) {
      console.error(`Invalid address: ${args.address}`);
      process.exit(1);
    }

    const env = args.env || "dev";
    ssmPut(path, args.address, `nge-${args.project} contract address (${env})`);
    console.log(`\n  Contract address stored for nge-${args.project}.`);
  }
}

main();
