# Launch Checklist

Everything is built. You just need credentials and publish commands.

## Step 1: Git + GitHub (5 min)

```bash
cd ~/video-commerce-mcp

# Install GitHub CLI
sudo apt install gh  # or: brew install gh

# Authenticate
gh auth login

# Create repo and push
gh repo create MyGardenShows/video-commerce-mcp --public --source=. --push

# Verify
gh repo view --web
```

## Step 2: npm Publish (2 min)

```bash
# Login to npm (use team@sincetoday.com)
npm login

# Publish
npm publish --access public

# Verify
npm info video-commerce-mcp
npx video-commerce-mcp --version
```

## Step 3: Add NPM_TOKEN to GitHub (1 min)

```bash
# Generate npm automation token at https://www.npmjs.com/settings/tokens
# Then add it as a GitHub secret:
gh secret set NPM_TOKEN
# Paste the token when prompted
```

Future releases: create a GitHub release → auto-publishes to npm.

## Step 4: Marketplace Listings (15 min, browser)

### MCP.so
1. Go to https://mcp.so/submit
2. Name: `Video Commerce Intelligence`
3. npm package: `video-commerce-mcp`
4. GitHub: `https://github.com/MyGardenShows/video-commerce-mcp`
5. Description: see `docs/marketplace-listing.md`

### Smithery
1. Go to https://smithery.ai/submit
2. Same details as above
3. Category: Analytics / Commerce / Video

### Official MCP Registry
1. Open a PR to https://github.com/modelcontextprotocol/servers
2. Add entry under "Community Servers"
3. See PR template in `docs/mcp-registry-pr.md`

### x402 Bazaar
1. Go to https://x402.org/ecosystem/submit
2. Add as x402-enabled MCP server

### npm "mcp" keyword
Already set in package.json — discoverable via `npm search mcp video commerce`

## Step 5: x402 Wallet (optional, 5 min)

Only needed if you want to accept real payments:

1. Create or use a Coinbase wallet on Base network
2. Copy wallet address
3. Set in `.env`:
   ```
   X402_ENABLED=true
   X402_WALLET_ADDRESS=0x-your-address
   ```

Without this, the free tier (5 calls/day) and API key auth still work.

## Verification

After publishing, verify from any machine:

```bash
# Should print version
npx video-commerce-mcp --version

# Should start and respond to MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | OPENAI_API_KEY=test npx video-commerce-mcp
```

## Status

- [x] Payment middleware wired (x402 + API key + free tier)
- [x] Rate limiting enforced (30/min, 500/hr, 5000/day)
- [x] 236 tests passing
- [x] Clean typecheck
- [x] npm package configured (name, bin, keywords)
- [x] Git repo initialized
- [x] CI/CD workflows (test + auto-publish)
- [x] README with config snippets
- [x] Marketplace listing copy prepared
- [ ] **YOU**: Git push + npm publish + marketplace submissions
