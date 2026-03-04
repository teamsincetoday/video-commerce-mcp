#!/bin/bash
# Deploy Video Commerce Intelligence MCP on Linux
# Run: ssh jonathan@192.168.178.25, then execute this script
#
# Claude Code on this Linux machine connects to the MCP server
# via stdio (local process, no network involved).

set -e

echo "=== Video Commerce Intelligence MCP — Linux Deploy ==="

MCP_DIR="$HOME/video-commerce-mcp"

# 1. Create directory
mkdir -p "$MCP_DIR"
cd "$MCP_DIR"

# 2. Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Install it:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
echo "Node.js: $(node --version)"

# 3. Check package files exist
if [ ! -f "package.json" ]; then
  echo ""
  echo "Package files not found. Copy them first from your Mac:"
  echo "  scp -r user@mac:~/path/packages/video-commerce-mcp/* jonathan@192.168.178.25:~/video-commerce-mcp/"
  exit 1
fi

# 4. Install dependencies
echo "Installing dependencies..."
npm install

# 5. Setup .env
if [ ! -f ".env" ]; then
  read -p "Enter your OpenAI API key: " OPENAI_KEY
  cat > .env << EOF
OPENAI_API_KEY=$OPENAI_KEY
FREE_TIER_DAILY_LIMIT=5
EOF
  echo ".env created"
fi

# Verify key
source .env
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sk-..." ]; then
  echo "ERROR: OPENAI_API_KEY not set in .env"
  exit 1
fi

# 6. Test CLI
echo "Testing CLI..."
npx tsx src/cli.ts --version && echo "CLI OK"

# 7. Configure Claude Code to use this MCP server
# Find the project directory where Claude Code runs
# (Could be this dir, or a project that references it)
CLAUDE_MCP="$MCP_DIR/.mcp.json"

cat > "$CLAUDE_MCP" << EOF
{
  "mcpServers": {
    "video-commerce-mcp": {
      "command": "npx",
      "args": ["tsx", "$MCP_DIR/src/cli.ts"],
      "env": {
        "OPENAI_API_KEY": "$OPENAI_API_KEY"
      }
    }
  }
}
EOF

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "To use with Claude Code:"
echo "  cd $MCP_DIR"
echo "  claude"
echo ""
echo "Claude will detect .mcp.json and offer to enable video-commerce-mcp."
echo "Then ask: \"Analyze this gardening video: https://youtube.com/watch?v=...\""
echo ""
echo "The 12 tools will be available directly in Claude Code."
