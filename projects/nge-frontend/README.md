# NGE Frontend — NextGen Economy Platform UI

React single-page application for the [NextGen Economy](https://github.com/tcooksey1972/nextgen-economy) platform. Connects to NGE smart contracts via MetaMask and ethers.js. Part of Cloud Creations LLC.

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Platform overview — wallet balance, token supply, device count, quick actions |
| **Token** | NGE token management — transfer, delegate voting power, burn tokens |
| **Devices** | IoT device registry — browse devices, verify data anchors on-chain |
| **Governance** | Voting power delegation — activate, delegate, view governance stats |

## Project Structure

```
projects/nge-frontend/
├── public/
│   └── index.html
├── src/
│   ├── abi/                          # Contract ABI definitions (ethers.js human-readable)
│   │   ├── NGEToken.json
│   │   └── DeviceRegistry.json
│   ├── components/
│   │   └── Navbar.js                 # Navigation + wallet connect button
│   ├── hooks/
│   │   ├── useWallet.js              # MetaMask connection, chain validation, account state
│   │   └── useTokenContract.js       # NGE token read/write operations
│   ├── pages/
│   │   ├── Dashboard.js              # Platform overview
│   │   ├── Token.js                  # Token management (transfer, delegate, burn)
│   │   ├── Devices.js                # IoT device browser + data verification
│   │   └── Governance.js             # Voting power delegation
│   ├── utils/
│   │   └── config.js                 # Centralized config (env vars, helpers)
│   ├── App.js                        # Router + layout
│   ├── index.js                      # Entry point
│   └── index.css                     # Global styles (dark theme)
├── aws/cloudformation/
│   └── frontend-hosting.yaml         # S3 + CloudFront (free tier)
├── .env.example                      # Template for local development
└── package.json
```

## Quick Start

### Prerequisites

- Node.js >= 18
- MetaMask browser extension
- Deployed contracts (see deploy scripts in each project)

### Local Development

```bash
cd projects/nge-frontend
cp .env.example .env
# Edit .env with your deployed contract addresses

npm install
npm start
```

Opens at `http://localhost:3000`. Connect MetaMask to Sepolia testnet.

### Build for Production

```bash
npm run build
```

Output goes to `build/` — ready for S3 upload.

### Deploy to AWS

```bash
# 1. Deploy hosting infrastructure
aws cloudformation deploy \
  --template-file aws/cloudformation/frontend-hosting.yaml \
  --stack-name nge-frontend-dev \
  --parameter-overrides Environment=dev

# 2. Upload build to S3
BUCKET=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)
aws s3 sync build/ s3://$BUCKET --delete

# 3. Invalidate CloudFront cache
DIST=$(aws cloudformation describe-stacks --stack-name nge-frontend-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

Or use the GitHub Actions deploy workflow which handles all of this automatically.

## Configuration

All config uses `REACT_APP_` environment variables (Create React App convention):

| Variable | Description |
|----------|-------------|
| `REACT_APP_TOKEN_ADDRESS` | SimpleNGEToken contract address |
| `REACT_APP_IOT_ADDRESS` | AnchoredDeviceRegistry contract address |
| `REACT_APP_SENTINEL_ADDRESS` | FullSentinelVault contract address |
| `REACT_APP_TOKEN_API` | Token API Gateway endpoint |
| `REACT_APP_SENTINEL_API` | Sentinel Monitor API endpoint |
| `REACT_APP_CHAIN_ID` | Target chain ID (default: 11155111 = Sepolia) |
| `REACT_APP_CHAIN_NAME` | Display name for chain (default: Sepolia) |
| `REACT_APP_EXPLORER_URL` | Block explorer URL (default: sepolia.etherscan.io) |

## Wallet Integration

The `useWallet` hook manages MetaMask connection:
- Auto-connects if previously authorized
- Detects account and chain changes
- Validates correct network (prompts to switch)
- Provides ethers.js Provider (read) and Signer (write)

## AWS Cost (Free Tier)

| Service | Free Tier | Our Usage |
|---------|-----------|-----------|
| S3 | 5 GB storage | < 10 MB build |
| CloudFront | 1 TB transfer/mo *(12-month)* | < 1 GB |
| CloudFront | 10M requests/mo *(12-month)* | < 10K |

Estimated cost: **$0.00/month** on Free Tier.

## Tech Stack

- **React** 18 with React Router v6
- **ethers.js** v6 for blockchain interaction
- **MetaMask** for wallet connection
- CSS custom properties (no CSS framework — dark theme built-in)
- **AWS S3 + CloudFront** for hosting

## License

MIT — Cloud Creations LLC
