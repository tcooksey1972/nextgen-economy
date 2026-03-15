# NextGen-Economy Deployment Playbook

**Cloud Creations LLC — Company Launch Guide**

This is the end-to-end playbook for deploying NextGen-Economy from zero to production. It covers account creation, infrastructure setup, smart contract deployment, AWS services, frontend hosting, monitoring, and ongoing operations.

---

## Table of Contents

1. [Company & Account Setup](#1-company--account-setup)
2. [Local Development Environment](#2-local-development-environment)
3. [Repository & CI/CD Setup](#3-repository--cicd-setup)
4. [Smart Contract Deployment](#4-smart-contract-deployment)
5. [AWS Infrastructure Deployment](#5-aws-infrastructure-deployment)
6. [Frontend Deployment](#6-frontend-deployment)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Ongoing Operations](#9-ongoing-operations)
10. [Rollback Procedures](#10-rollback-procedures)
11. [Security & Key Management](#11-security--key-management)
12. [Cost Management](#12-cost-management)
13. [Checklists](#13-checklists)

---

## 1. Company & Account Setup

Before touching any code, stand up the accounts and services the platform depends on.

### 1.1 AWS Account

1. Create an AWS account at https://aws.amazon.com
2. Enable MFA on the root account immediately
3. Create an IAM user `nge-deployer` with programmatic access
4. Attach these managed policies (or create a custom policy — see 1.1a):
   - `AWSCloudFormationFullAccess`
   - `AWSLambda_FullAccess`
   - `AmazonAPIGatewayAdministrator`
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `AWSIoTFullAccess`
   - `AmazonSSMFullAccess`
   - `AmazonSNSFullAccess`
   - `AmazonSQSFullAccess`
   - `SecretsManagerReadWrite`
   - `IAMFullAccess` (needed to create Lambda execution roles)
5. Save the Access Key ID and Secret Access Key securely
6. Install AWS CLI v2 and configure:
   ```bash
   aws configure
   # AWS Access Key ID: AKIA...
   # AWS Secret Access Key: ...
   # Default region: us-east-1
   # Default output format: json
   ```

#### 1.1a Custom IAM Policy (Least Privilege)

For tighter control, use this custom policy instead of the managed policies above:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "NGEDeployPermissions",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigateway:*",
        "dynamodb:*",
        "s3:*",
        "cloudfront:*",
        "iot:*",
        "ssm:PutParameter",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:DeleteParameter",
        "sns:*",
        "sqs:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole",
        "events:*",
        "secretsmanager:CreateSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DeleteSecret",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 1.2 Ethereum RPC Provider

You need an RPC endpoint to communicate with the Ethereum blockchain. Choose one:

| Provider | Free Tier | Sign Up |
|----------|-----------|---------|
| Infura | 100K requests/day | https://infura.io |
| Alchemy | 300M compute units/mo | https://alchemy.com |

1. Create an account
2. Create a new project/app for "Sepolia" testnet
3. Copy the RPC URL (looks like `https://sepolia.infura.io/v3/YOUR_PROJECT_ID`)
4. Later, create a separate project for Ethereum Mainnet

### 1.3 Ethereum Deployer Wallet

Generate a dedicated wallet for contract deployment. **Do not use a personal wallet.**

```bash
# Option A: Use Hardhat to generate
npx hardhat console
> const wallet = ethers.Wallet.createRandom()
> console.log("Address:", wallet.address)
> console.log("Private Key:", wallet.privateKey)
> console.log("Mnemonic:", wallet.mnemonic.phrase)
```

1. Save the private key and mnemonic in a password manager (1Password, Bitwarden, etc.)
2. For Sepolia testnet: get free test ETH from https://sepoliafaucet.com
3. For Mainnet: fund the wallet with real ETH for gas fees

**Never commit the private key to the repository.**

### 1.4 Email & Notifications

Set up an operations email (e.g., `ops@cloudcreationsllc.com`) to receive:
- AWS SNS alerts (Lambda errors, anomalies)
- Contract event notifications
- CloudWatch alarm emails

### 1.5 Domain Name (Optional)

If you want a custom domain (e.g., `app.nextgen-economy.com`):
1. Register domain via Route 53 or your registrar
2. Create a hosted zone in Route 53
3. Request an ACM certificate in `us-east-1` (required for CloudFront)
4. After frontend deploy, create a CNAME record pointing to the CloudFront distribution

---

## 2. Local Development Environment

### 2.1 Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 18.x | https://nodejs.org or `nvm install 18` |
| npm | >= 9.x | Comes with Node.js |
| Git | Latest | https://git-scm.com |
| AWS CLI | v2 | https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html |
| AWS SAM CLI | Latest | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |

### 2.2 Clone and Install

```bash
git clone https://github.com/tcooksey1972/nextgen-economy.git
cd nextgen-economy
```

Install dependencies for every project:

```bash
# Core smart contract projects
cd projects/nge-sentinel && npm install && cd ../..
cd projects/nge-token    && npm install && cd ../..
cd projects/nge-iot      && npm install && cd ../..

# Use-cases (shared Hardhat config)
cd use-cases && npm install && cd ..

# AWS serverless monitor
cd projects/nge-sentinel-monitor && npm install && cd ../..

# Frontend
cd projects/nge-frontend && npm install && cd ../..
```

### 2.3 Configure Environment Files

Each project has a `.env.example`. Copy and fill in:

```bash
# Smart contract projects (all need the same two vars)
for proj in projects/nge-sentinel projects/nge-token projects/nge-iot use-cases; do
  cp "$proj/.env.example" "$proj/.env"
done

# Sentinel monitor (needs deployed contract address — fill in after Phase 4)
cp projects/nge-sentinel-monitor/.env.example projects/nge-sentinel-monitor/.env

# Frontend (needs API endpoints — fill in after Phase 5)
cp projects/nge-frontend/.env.example projects/nge-frontend/.env
```

Edit each `.env` with your deployer key and RPC URL:

```bash
# projects/nge-sentinel/.env (same for nge-token, nge-iot, use-cases)
DEPLOYER_PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
```

### 2.4 Compile & Test Locally

```bash
# Compile all contracts (offline mode — no internet needed for solc)
cd projects/nge-sentinel && npm run compile:local && cd ../..
cd projects/nge-token    && npm run compile:local && cd ../..
cd projects/nge-iot      && npm run compile:local && cd ../..
cd use-cases             && npx hardhat compile    && cd ..

# Run all tests
cd projects/nge-sentinel && npm run test:local && cd ../..  # 135 tests
cd projects/nge-token    && npm run test:local && cd ../..  # 50+ tests
cd projects/nge-iot      && npm run test:local && cd ../..  # 43 tests
cd use-cases             && npx hardhat test    && cd ..    # 9 suites

# Sentinel monitor unit tests
cd projects/nge-sentinel-monitor && npm test && cd ../..    # 13 tests

# Frontend build check
cd projects/nge-frontend && npm run build && cd ../..
```

All tests should pass before proceeding to deployment.

---

## 3. Repository & CI/CD Setup

### 3.1 GitHub Repository

The repo should already be at `https://github.com/tcooksey1972/nextgen-economy`.

### 3.2 Configure GitHub Secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret Name | Value | Used By |
|-------------|-------|---------|
| `DEPLOYER_PRIVATE_KEY` | `0x...` (deployer wallet private key) | Contract deployment |
| `ETH_RPC_URL` | `https://sepolia.infura.io/v3/...` | All blockchain interactions |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | AWS deployments |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret key | AWS deployments |
| `AWS_REGION` | `us-east-1` | AWS resource location |
| `ALERT_EMAIL` | `ops@cloudcreationsllc.com` | SNS notifications |

### 3.3 CI Pipeline (Automatic)

The CI workflow (`.github/workflows/ci.yml`) runs automatically on every PR and push to `main`. It:

1. **test-sentinel** — Compiles + runs 135 Sentinel tests
2. **test-iot** — Compiles + runs 43 IoT tests
3. **test-token** — Compiles + runs 50+ Token tests
4. **test-monitor** — Runs 13 Lambda unit tests
5. **build-frontend** — Builds React app, uploads artifact

All five jobs run in parallel. PRs cannot merge if any job fails.

### 3.4 Deploy Pipeline (Manual)

The deploy workflow (`.github/workflows/deploy.yml`) is triggered manually via **Actions > Deploy > Run workflow**.

Inputs:
- **environment**: `dev`, `staging`, or `prod`
- **deploy_contracts**: Deploy smart contracts to Sepolia (default: true)
- **deploy_infrastructure**: Deploy AWS stacks (default: true)
- **deploy_frontend**: Build and deploy React app (default: true)

The pipeline runs in four sequential stages:
```
Stage 1: Deploy Contracts (parallel: sentinel, token, iot)
    |
Stage 2: Store addresses in AWS SSM Parameter Store
    |
Stage 3: Deploy AWS Infrastructure (parallel: monitor, token-api, iot-bridge)
    |
Stage 4: Deploy Frontend to S3 + CloudFront
```

---

## 4. Smart Contract Deployment

### 4.1 Deployment Order

The three core contracts are independent and can deploy in parallel:

| Contract | Project | What It Does |
|----------|---------|--------------|
| FullSentinelVault | nge-sentinel | Security modules (dead-man switch, rate limiter, break-glass, watchdog) |
| SimpleNGEToken (ERC-20) | nge-token | Platform fungible token with burn, pause, permit, votes |
| AnchoredDeviceRegistry (ERC-721) | nge-iot | IoT device NFT registry with data anchoring |

### 4.2 Manual Deployment (Testnet)

```bash
# Deploy Sentinel
cd projects/nge-sentinel
npx hardhat run scripts/deploy.js --network sepolia
# OUTPUT: FullSentinelVault deployed to: 0x<SENTINEL_ADDRESS>

# Deploy Token
cd ../nge-token
npx hardhat run scripts/deploy.js --network sepolia
# OUTPUT: SimpleNGEToken deployed to: 0x<TOKEN_ADDRESS>

# Deploy IoT
cd ../nge-iot
npx hardhat run scripts/deploy.js --network sepolia
# OUTPUT: AnchoredDeviceRegistry deployed to: 0x<IOT_ADDRESS>
```

**Record every address.** You will need them for the next step.

### 4.3 Store Addresses in AWS SSM

Contract addresses go into AWS SSM Parameter Store so CloudFormation stacks can reference them:

```bash
cd /path/to/nextgen-economy

# Store each contract address
node scripts/ssm-store.js --project sentinel --address 0x<SENTINEL_ADDRESS>
node scripts/ssm-store.js --project token    --address 0x<TOKEN_ADDRESS>
node scripts/ssm-store.js --project iot      --address 0x<IOT_ADDRESS>

# Store the shared RPC URL
node scripts/ssm-store.js --project token --address 0x0000000000000000000000000000000000000000 --rpc-url https://sepolia.infura.io/v3/YOUR_KEY
```

This creates SSM parameters:
| Parameter Path | Value |
|----------------|-------|
| `/nge/sentinel/contract-address` | Sentinel vault address |
| `/nge/token/contract-address` | NGE token address |
| `/nge/iot/contract-address` | IoT device registry address |
| `/nge/common/eth-rpc-url` | Shared RPC endpoint |
| `/nge/sentinel/eth-rpc-url` | Sentinel RPC (alias) |
| `/nge/token/eth-rpc-url` | Token RPC (alias) |
| `/nge/iot/eth-rpc-url` | IoT RPC (alias) |

### 4.4 Verify on Etherscan (Recommended)

```bash
cd projects/nge-token
npx hardhat verify --network sepolia 0x<TOKEN_ADDRESS> <constructor-args>

cd ../nge-sentinel
npx hardhat verify --network sepolia 0x<SENTINEL_ADDRESS> <constructor-args>

cd ../nge-iot
npx hardhat verify --network sepolia 0x<IOT_ADDRESS> <constructor-args>
```

Verified contracts build trust — anyone can read the source on Etherscan.

### 4.5 Interact & Smoke Test

Each project has an interaction script to verify the deployed contract works:

```bash
cd projects/nge-sentinel
npx hardhat run scripts/interact.js --network sepolia

cd ../nge-token
npx hardhat run scripts/interact.js --network sepolia

cd ../nge-iot
npx hardhat run scripts/interact.js --network sepolia
```

### 4.6 Use-Case Deployments (Optional)

The nine use-case contracts can be deployed independently for demos or specific customers:

```bash
cd use-cases

# Example: Deploy the DeFi Vault use-case
npx hardhat run defi-vault/scripts/deploy.js --network sepolia

# Example: Deploy the DAO Treasury use-case
npx hardhat run dao-treasury/scripts/deploy.js --network sepolia
```

Available use-cases:
1. `defi-vault` — DeFi Sentinel Vault Protection
2. `dao-treasury` — DAO Treasury Governance
3. `key-rotation` — Emergency Key Rotation
4. `cold-chain` — Cold Chain Compliance
5. `smart-grid` — Smart Grid Metering
6. `environmental` — Environmental Monitoring
7. `platform-governance` — Platform Governance (Governor + Token)
8. `device-certification` — Device Certification
9. `staking-rewards` — Staking & Validation

---

## 5. AWS Infrastructure Deployment

Deploy in this order. Each stack is independent once SSM parameters exist, but the frontend depends on all API stacks being up.

### 5.1 Frontend Hosting Stack (Deploy First)

Creates the S3 bucket and CloudFront distribution. Deploy this first so you have a bucket ready.

```bash
aws cloudformation deploy \
  --template-file projects/nge-frontend/aws/cloudformation/frontend-hosting.yaml \
  --stack-name nge-frontend-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

**Outputs to capture:**
```bash
# Get the S3 bucket name and CloudFront URL
aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs" --output table
```

| Output | Description |
|--------|-------------|
| `FrontendBucket` | S3 bucket for React build files |
| `FrontendUrl` | CloudFront domain (your site URL) |
| `DistributionId` | For cache invalidation |

### 5.2 Authentication Stack (Cognito)

Creates the Cognito User Pool, app client, tenant DynamoDB table, and post-confirmation Lambda for tenant auto-provisioning. Deploy this before the Token API and IoT Bridge if you want JWT-based multi-tenant auth.

```bash
aws cloudformation deploy \
  --template-file projects/nge-auth/aws/cloudformation/cognito-auth.yaml \
  --stack-name nge-auth-dev \
  --parameter-overrides \
    Environment=dev \
    CallbackUrl=http://localhost:3000 \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --region us-east-1
```

**What gets created:**
- Cognito User Pool (`nge-users-dev`) with email sign-up
- App client for the frontend (implicit OAuth flow)
- DynamoDB table `nge-tenants-dev` for tenant metadata
- Post-confirmation Lambda that auto-creates tenants on sign-up

**Capture the outputs — you'll need these for the Token API and IoT Bridge stacks:**
```bash
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name nge-auth-dev \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

CLIENT_ID=$(aws cloudformation describe-stacks --stack-name nge-auth-dev \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)

echo "User Pool ID: $USER_POOL_ID"
echo "Client ID:    $CLIENT_ID"
```

> **Note:** Auth is optional. If you skip this step, the Token API and IoT Bridge stacks deploy without JWT authorization (all routes are public). You can add auth later by redeploying with the `CognitoUserPoolId` and `CognitoClientId` parameters.

### 5.3 Token API Stack

Creates Lambda functions, DynamoDB tables, API Gateway, and an event poller for the NGE token.

```bash
aws cloudformation deploy \
  --template-file projects/nge-token/aws/cloudformation/token-api.yaml \
  --stack-name nge-token-api-dev \
  --parameter-overrides \
    Environment=dev \
    NotificationEmail=ops@cloudcreationsllc.com \
    CognitoUserPoolId=$USER_POOL_ID \
    CognitoClientId=$CLIENT_ID \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --region us-east-1
```

> Omit `CognitoUserPoolId` and `CognitoClientId` to deploy without auth.

**What gets created:**
- 3 DynamoDB tables: `nge-token-balances-dev`, `nge-token-transfers-dev`, `nge-token-metadata-dev`
- 4 Lambda functions: `get-balance`, `get-transfers`, `get-token-info`, `process-events`
- HTTP API Gateway with routes: `/balance`, `/transfers`, `/token-info`
- EventBridge rule polling blockchain events every 1 minute
- SNS topic for error alerts

**Capture the API endpoint:**
```bash
aws cloudformation describe-stacks --stack-name nge-token-api-dev \
  --query "Stacks[0].Outputs[?OutputKey=='TokenApiEndpoint'].OutputValue" \
  --output text
# Example: https://abc123.execute-api.us-east-1.amazonaws.com/dev
```

### 5.4 Sentinel Monitor Stack (SAM)

Creates the on-chain event monitor with a dashboard.

```bash
cd projects/nge-sentinel-monitor

# Build the SAM application
sam build

# Deploy
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
  --stack-name nge-sentinel-monitor-dev \
  --parameter-overrides \
    EthRpcUrl=https://sepolia.infura.io/v3/YOUR_KEY \
    ContractAddress=0x<SENTINEL_ADDRESS> \
    AlertEmail=ops@cloudcreationsllc.com \
    ChainId=11155111 \
    PollBlockRange=100 \
    HeartbeatWarningHours=48 \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

**What gets created:**
- 2 DynamoDB tables: `SentinelEvents`, `SentinelState`
- 3 Lambda functions: `event-poller` (1 min), `heartbeat-monitor` (1 hr), `api-handler`
- REST API Gateway with routes: `/status`, `/events`, `/proposals`, `/health`
- S3 bucket for static dashboard
- SNS topic for alerts

**Deploy the dashboard frontend:**
```bash
# Get the dashboard bucket name
DASHBOARD_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name nge-sentinel-monitor-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardBucketName'].OutputValue" \
  --output text)

# Upload dashboard files
aws s3 sync frontend/ s3://$DASHBOARD_BUCKET --delete
```

**Capture the API endpoint:**
```bash
aws cloudformation describe-stacks --stack-name nge-sentinel-monitor-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
```

### 5.5 IoT Bridge Stack

Creates the AWS IoT Core integration with the blockchain.

**First, store the IoT signer key in Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name nge-iot-signer \
  --secret-string '{"privateKey":"0xYOUR_IOT_SIGNER_KEY"}' \
  --region us-east-1

# Get the ARN
SIGNER_ARN=$(aws secretsmanager describe-secret \
  --secret-id nge-iot-signer \
  --query ARN --output text)
```

**Deploy the stack:**
```bash
aws cloudformation deploy \
  --template-file projects/nge-iot/aws/cloudformation/iot-blockchain-bridge.yaml \
  --stack-name nge-iot-bridge-dev \
  --parameter-overrides \
    Environment=dev \
    SignerSecretArn=$SIGNER_ARN \
    NotificationEmail=ops@cloudcreationsllc.com \
    CognitoUserPoolId=$USER_POOL_ID \
    CognitoClientId=$CLIENT_ID \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --region us-east-1
```

> Omit `CognitoUserPoolId` and `CognitoClientId` to deploy without auth.

**What gets created:**
- 2 DynamoDB tables: `nge-iot-devices-dev`, `nge-iot-anchors-dev`
- 3 Lambda functions: `register-device`, `anchor-data`, `verify-anchor`
- AWS IoT Core thing type, policy, and 3 topic rules
- HTTP API for data verification
- SQS dead-letter queue
- SNS error topic

### 5.6 Confirm All Stacks

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName,'nge-')].[StackName,StackStatus,CreationTime]" \
  --output table
```

Expected output:
```
| nge-frontend-dev          | CREATE_COMPLETE | 2026-... |
| nge-auth-dev              | CREATE_COMPLETE | 2026-... |
| nge-token-api-dev         | CREATE_COMPLETE | 2026-... |
| nge-sentinel-monitor-dev  | CREATE_COMPLETE | 2026-... |
| nge-iot-bridge-dev        | CREATE_COMPLETE | 2026-... |
```

---

## 6. Frontend Deployment

### 6.1 Configure Frontend Environment

After all API stacks are deployed, collect the endpoints and update the frontend `.env`:

```bash
# Gather endpoints
TOKEN_API=$(aws cloudformation describe-stacks --stack-name nge-token-api-dev \
  --query "Stacks[0].Outputs[?OutputKey=='TokenApiEndpoint'].OutputValue" --output text)

SENTINEL_API=$(aws cloudformation describe-stacks --stack-name nge-sentinel-monitor-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
```

Edit `projects/nge-frontend/.env`:
```bash
REACT_APP_TOKEN_ADDRESS=0x<TOKEN_ADDRESS>
REACT_APP_IOT_ADDRESS=0x<IOT_ADDRESS>
REACT_APP_SENTINEL_ADDRESS=0x<SENTINEL_ADDRESS>
REACT_APP_TOKEN_API=<TOKEN_API_ENDPOINT>
REACT_APP_SENTINEL_API=<SENTINEL_API_ENDPOINT>
REACT_APP_CHAIN_ID=11155111
REACT_APP_CHAIN_NAME=Sepolia
REACT_APP_EXPLORER_URL=https://sepolia.etherscan.io
```

### 6.2 Build

```bash
cd projects/nge-frontend
npm run build
```

This creates an optimized production bundle in `build/`.

### 6.3 Upload to S3

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)

aws s3 sync build/ s3://$BUCKET --delete
```

### 6.4 Invalidate CloudFront Cache

```bash
DISTRO=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

aws cloudfront create-invalidation --distribution-id $DISTRO --paths "/*"
```

### 6.5 Access the Site

```bash
SITE_URL=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text)

echo "Platform live at: https://$SITE_URL"
```

The site has 7 pages:
- **Landing** — Marketing page
- **Dashboard** — Platform overview
- **Token** — NGE token management (balances, transfers)
- **Devices** — IoT device browser
- **Governance** — Voting and delegation
- **Use Cases** — Scenario showcase
- **About** — Project information

Users connect their MetaMask wallet to interact with the contracts.

---

## 7. Post-Deployment Verification

Run through each of these to confirm the platform is live and healthy.

### 7.1 Smart Contracts

```bash
# Check contracts exist on Etherscan
open "https://sepolia.etherscan.io/address/0x<TOKEN_ADDRESS>"
open "https://sepolia.etherscan.io/address/0x<SENTINEL_ADDRESS>"
open "https://sepolia.etherscan.io/address/0x<IOT_ADDRESS>"
```

### 7.2 Token API

```bash
TOKEN_API=<your-token-api-endpoint>

# Should return token name, symbol, total supply
curl -s "$TOKEN_API/token-info" | jq .

# Should return balance for the deployer
curl -s "$TOKEN_API/balance?address=0x<DEPLOYER_ADDRESS>" | jq .

# Should return transfer history
curl -s "$TOKEN_API/transfers?address=0x<DEPLOYER_ADDRESS>&limit=5" | jq .
```

### 7.3 Sentinel Monitor API

```bash
SENTINEL_API=<your-sentinel-api-endpoint>

curl -s "$SENTINEL_API/health" | jq .
curl -s "$SENTINEL_API/status" | jq .
curl -s "$SENTINEL_API/events?limit=10" | jq .
```

### 7.4 IoT Verification API

```bash
IOT_API=<your-iot-api-endpoint>

# Verify an anchor (will return "not found" if no data anchored yet — that's OK)
curl -s "$IOT_API/verify?dataHash=0x0000000000000000000000000000000000000000000000000000000000000000" | jq .
```

### 7.5 Frontend

1. Open the CloudFront URL in a browser
2. Verify all 7 pages load without errors
3. Connect MetaMask (switch to Sepolia network)
4. Confirm token balance displays on the Dashboard page
5. Check browser console for any errors

### 7.6 Lambda Functions

```bash
# Invoke directly to test
aws lambda invoke --function-name nge-token-get-token-info-dev /tmp/response.json
cat /tmp/response.json | jq .
```

### 7.7 SNS Alerts

Check your email for SNS subscription confirmation requests — **you must confirm each one** or you won't receive alerts:
- Token API error topic
- Sentinel alert topic
- IoT bridge error topic

---

## 8. Monitoring & Alerting

### 8.1 CloudWatch Logs

Every Lambda function logs to CloudWatch automatically:

```bash
# Tail logs in real-time
aws logs tail /aws/lambda/nge-token-process-events-dev --follow
aws logs tail /aws/lambda/sentinel-event-poller --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/nge-token-process-events-dev \
  --filter-pattern "ERROR"
```

### 8.2 Event Pollers

Two event pollers run on schedules:
- **Token event poller**: Every 1 minute — scans for Transfer, Approval events
- **Sentinel event poller**: Every 1 minute — scans for security events
- **Sentinel heartbeat monitor**: Every 1 hour — checks dead-man switch status

Verify they're running:
```bash
# Check EventBridge rules
aws events list-rules --query "Rules[?starts_with(Name,'nge-')].[Name,State,ScheduleExpression]" --output table
```

### 8.3 DynamoDB Tables

Monitor table health and item counts:
```bash
for table in nge-token-balances-dev nge-token-transfers-dev nge-iot-devices-dev nge-iot-anchors-dev; do
  echo "--- $table ---"
  aws dynamodb describe-table --table-name $table \
    --query "Table.[TableName,TableStatus,ItemCount]" --output text 2>/dev/null || echo "  (not found)"
done
```

### 8.4 Sentinel Dashboard

Access the Sentinel monitoring dashboard at the S3 website URL:
```bash
aws cloudformation describe-stacks --stack-name nge-sentinel-monitor-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardUrl'].OutputValue" --output text
```

The dashboard auto-refreshes every 30 seconds and shows:
- Contract status
- Recent events
- Heartbeat status
- Active proposals

---

## 9. Ongoing Operations

### 9.1 Deploying Updates

**Code changes (contracts unchanged):**
1. Push to `main` — CI runs automatically
2. Go to **Actions > Deploy > Run workflow**
3. Set `deploy_contracts: false`, `deploy_infrastructure: true`, `deploy_frontend: true`

**Contract changes (new deployment):**
1. Push to `main` — CI runs automatically
2. Go to **Actions > Deploy > Run workflow**
3. Set all three to `true`
4. New contracts deploy, addresses update in SSM, infrastructure picks up new addresses

**Frontend-only changes:**
1. Set `deploy_contracts: false`, `deploy_infrastructure: false`, `deploy_frontend: true`

### 9.2 Environment Promotion

Deploy to each environment sequentially:

```
dev (Sepolia) → staging (Sepolia) → prod (Mainnet)
```

1. Deploy to `dev`, run verification checklist
2. Deploy to `staging` with same code, run verification checklist
3. When confident, deploy to `prod`

**Production differences:**
- `ETH_RPC_URL` points to mainnet (`https://mainnet.infura.io/v3/...`)
- Real ETH gas costs apply
- `DEPLOYER_PRIVATE_KEY` should be a hardware wallet or multisig-controlled key
- Consider a professional security audit before mainnet

### 9.3 Adding Use-Case Contracts

To deploy a specific use-case for a customer:

```bash
cd use-cases
npx hardhat run <use-case>/scripts/deploy.js --network sepolia
# Then interact:
npx hardhat run <use-case>/scripts/interact.js --network sepolia
```

### 9.4 Rotating Secrets

**Ethereum deployer key:**
1. Generate a new wallet
2. Transfer ownership of all contracts to the new address (if using Ownable)
3. Update `DEPLOYER_PRIVATE_KEY` in GitHub Secrets and local `.env`

**IoT signer key:**
```bash
aws secretsmanager update-secret \
  --secret-id nge-iot-signer \
  --secret-string '{"privateKey":"0xNEW_KEY"}'
```

**AWS IAM keys:**
1. Create new key pair in IAM console
2. Update GitHub Secrets
3. Update local `aws configure`
4. Delete old key pair

**RPC endpoint key:**
1. Rotate in Infura/Alchemy dashboard
2. Update `ETH_RPC_URL` in GitHub Secrets
3. Update SSM: `node scripts/ssm-store.js --project token --address 0x... --rpc-url NEW_URL`
4. Redeploy infrastructure stacks (they read from SSM on deploy)

---

## 10. Rollback Procedures

### 10.1 Smart Contract Rollback

Smart contracts are immutable. You cannot "undo" a deployment. Instead:

1. Deploy a new version of the contract
2. Update SSM Parameter Store with the new address
3. Redeploy AWS infrastructure (picks up new address)
4. Redeploy frontend (points to new contract)
5. If the old contract holds funds, transfer them to the new contract

### 10.2 AWS Stack Rollback

CloudFormation supports automatic rollback on failure:

```bash
# Check if a stack failed
aws cloudformation describe-stacks --stack-name nge-token-api-dev \
  --query "Stacks[0].[StackStatus,StackStatusReason]" --output text

# If stuck in UPDATE_ROLLBACK_FAILED:
aws cloudformation continue-update-rollback --stack-name nge-token-api-dev

# Nuclear option — delete and redeploy (DynamoDB data is lost):
aws cloudformation delete-stack --stack-name nge-token-api-dev
aws cloudformation wait stack-delete-complete --stack-name nge-token-api-dev
# Then redeploy from Phase 5
```

### 10.3 Frontend Rollback

```bash
# Re-deploy from a previous git commit
git checkout <previous-commit> -- projects/nge-frontend/
cd projects/nge-frontend
npm run build

BUCKET=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)
aws s3 sync build/ s3://$BUCKET --delete

DISTRO=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
aws cloudfront create-invalidation --distribution-id $DISTRO --paths "/*"
```

---

## 11. Security & Key Management

### 11.1 What Lives Where

| Secret | Storage | Access |
|--------|---------|--------|
| Deployer private key | GitHub Secrets + password manager | CI/CD pipeline, developer |
| IoT signer key | AWS Secrets Manager | Lambda functions only |
| AWS IAM credentials | GitHub Secrets + local `~/.aws` | CI/CD pipeline, developer |
| RPC API key | GitHub Secrets + SSM | CI/CD, Lambda functions |
| SNS alert email | GitHub Secrets | CI/CD pipeline |

### 11.2 What Must Never Be Committed

The `.gitignore` should already exclude these, but verify:
- `.env` files (contain private keys)
- `node_modules/`
- AWS credential files
- Private keys, mnemonics, seed phrases

### 11.3 Production Security Recommendations

Before going to mainnet:

- [ ] Professional smart contract audit (Trail of Bits, OpenZeppelin, Consensys Diligence)
- [ ] Deployer wallet is a multisig (Gnosis Safe) or hardware wallet
- [ ] AWS root account has MFA enabled
- [ ] IAM user has least-privilege permissions
- [ ] All SNS subscriptions confirmed
- [ ] CloudWatch alarms set for Lambda errors
- [ ] Consider a bug bounty program
- [ ] DynamoDB point-in-time recovery enabled for production tables
- [ ] S3 versioning enabled on frontend bucket
- [ ] CloudFront HTTPS-only (no HTTP)

---

## 12. Cost Management

### 12.1 Monthly Cost Breakdown

**Development environment (AWS Free Tier):**

| Service | Free Tier | Expected Usage | Monthly Cost |
|---------|-----------|----------------|-------------|
| Lambda | 1M requests, 400K GB-s | ~50K requests | $0.00 |
| DynamoDB | 25 GB, 200M on-demand req | ~100K requests | $0.00 |
| API Gateway (HTTP) | 1M calls (12-mo) | ~10K calls | $0.00 |
| S3 | 5 GB, 20K GET | < 1 GB | $0.00 |
| CloudFront | 1 TB transfer (12-mo) | < 10 GB | $0.00 |
| IoT Core | $200 credit (12-mo) | Minimal | $0.00 |
| SNS | 1M publishes | < 1K | $0.00 |
| Secrets Manager | N/A | 1 secret | $0.40 |
| **Total** | | | **~$0.40/mo** |

**Ethereum gas costs (separate from AWS):**
- Sepolia testnet: Free (use faucet)
- Mainnet: Varies by network congestion — budget $50-200 per deployment round

### 12.2 Scaling Costs

When traffic grows beyond free tier:
- Lambda: $0.20 per 1M requests
- DynamoDB on-demand: $1.25 per 1M write requests, $0.25 per 1M read requests
- API Gateway HTTP: $1.00 per 1M requests
- CloudFront: $0.085 per GB after 1 TB

### 12.3 Cost Monitoring

```bash
# Set up a billing alarm (recommended)
aws cloudwatch put-metric-alarm \
  --alarm-name "NGE-Monthly-Spend-Alert" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alerts
```

---

## 13. Checklists

### 13.1 First-Time Setup Checklist

- [ ] AWS account created with MFA
- [ ] IAM deployer user created with correct permissions
- [ ] AWS CLI installed and configured
- [ ] AWS SAM CLI installed
- [ ] Infura or Alchemy account created
- [ ] Sepolia RPC endpoint obtained
- [ ] Deployer wallet generated and funded (Sepolia ETH)
- [ ] GitHub Secrets configured (all 6 secrets)
- [ ] Operations email address ready
- [ ] Repository cloned locally
- [ ] All project dependencies installed (`npm install`)
- [ ] All `.env.example` files copied to `.env` and filled in
- [ ] All tests passing locally

### 13.2 Deployment Checklist

- [ ] All CI tests passing (check GitHub Actions)
- [ ] Smart contracts deployed to Sepolia
- [ ] Contract addresses stored in SSM Parameter Store
- [ ] RPC URL stored in SSM Parameter Store
- [ ] IoT signer key stored in Secrets Manager
- [ ] Frontend hosting stack deployed
- [ ] Auth (Cognito) stack deployed (optional, for multi-tenant)
- [ ] Token API stack deployed (with Cognito params if auth enabled)
- [ ] Sentinel Monitor stack deployed (SAM)
- [ ] IoT Bridge stack deployed (with Cognito params if auth enabled)
- [ ] Sentinel dashboard uploaded to S3
- [ ] Frontend `.env` updated with API endpoints and contract addresses
- [ ] Frontend built and uploaded to S3
- [ ] CloudFront cache invalidated
- [ ] SNS email subscriptions confirmed (check inbox)
- [ ] All API endpoints responding (token-info, health, verify)
- [ ] Frontend loads in browser
- [ ] MetaMask connects to Sepolia
- [ ] Token balance visible on Dashboard page

### 13.3 Go-to-Production Checklist

- [ ] Security audit completed
- [ ] Mainnet RPC endpoint configured
- [ ] Deployer wallet funded with real ETH
- [ ] Contracts deployed to mainnet
- [ ] Contracts verified on Etherscan (mainnet)
- [ ] All stacks deployed with `Environment=prod`
- [ ] Frontend `.env` updated for mainnet (chain ID: 1)
- [ ] Custom domain configured (if applicable)
- [ ] HTTPS enforced on CloudFront
- [ ] DynamoDB point-in-time recovery enabled
- [ ] CloudWatch alarms configured
- [ ] Billing alarm set
- [ ] Runbook shared with operations team
- [ ] Incident response plan documented

---

## Quick Reference: Stack Names by Environment

| Component | Dev | Staging | Prod |
|-----------|-----|---------|------|
| Frontend | `nge-frontend-dev` | `nge-frontend-staging` | `nge-frontend-prod` |
| Auth (Cognito) | `nge-auth-dev` | `nge-auth-staging` | `nge-auth-prod` |
| Token API | `nge-token-api-dev` | `nge-token-api-staging` | `nge-token-api-prod` |
| Sentinel Monitor | `nge-sentinel-monitor-dev` | `nge-sentinel-monitor-staging` | `nge-sentinel-monitor-prod` |
| IoT Bridge | `nge-iot-bridge-dev` | `nge-iot-bridge-staging` | `nge-iot-bridge-prod` |

## Quick Reference: SSM Parameters

| Parameter | Description |
|-----------|-------------|
| `/nge/sentinel/contract-address` | Sentinel vault contract |
| `/nge/token/contract-address` | NGE token contract |
| `/nge/iot/contract-address` | IoT registry contract |
| `/nge/common/eth-rpc-url` | Shared RPC endpoint |
| `/nge/{project}/eth-rpc-url` | Per-project RPC alias |

## Quick Reference: Key File Locations

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI test pipeline |
| `.github/workflows/deploy.yml` | Deployment pipeline |
| `scripts/ssm-store.js` | Store contract addresses in SSM |
| `projects/nge-sentinel/scripts/deploy.js` | Sentinel contract deployment |
| `projects/nge-token/scripts/deploy.js` | Token contract deployment |
| `projects/nge-iot/scripts/deploy.js` | IoT contract deployment |
| `projects/nge-auth/aws/cloudformation/cognito-auth.yaml` | Cognito auth stack |
| `projects/nge-auth/src/authMiddleware.js` | JWT tenant extraction middleware |
| `projects/nge-auth/src/tenantScope.js` | Tenant-scoped DynamoDB helpers |
| `projects/nge-token/aws/cloudformation/token-api.yaml` | Token API stack |
| `projects/nge-iot/aws/cloudformation/iot-blockchain-bridge.yaml` | IoT bridge stack |
| `projects/nge-sentinel-monitor/template.yaml` | Sentinel monitor stack |
| `projects/nge-frontend/aws/cloudformation/frontend-hosting.yaml` | Frontend hosting stack |
