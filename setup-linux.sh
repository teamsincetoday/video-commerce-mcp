#!/bin/bash
# Setup Video Commerce Intelligence MCP on Linux
# Run this on your Linux machine (jonathan@192.168.178.25)

set -e

echo "=== Video Commerce Intelligence MCP — Linux Setup ==="

# 1. Clone or pull the repo
REPO_DIR="$HOME/MyGardenShows"
if [ -d "$REPO_DIR" ]; then
  echo "Repo exists, pulling latest..."
  cd "$REPO_DIR" && git pull
else
  echo "Cloning repo..."
  git clone https://github.com/MyGardenShows/video-commerce-mcp.git "$REPO_DIR"
fi

# 2. Install dependencies for the MCP package
MCP_DIR="$REPO_DIR/packages/video-commerce-mcp"
echo "Installing dependencies..."
cd "$MCP_DIR" && npm install

# 3. Create .env file
if [ ! -f "$MCP_DIR/.env" ]; then
  echo "Creating .env file..."
  cp "$MCP_DIR/.env.example" "$MCP_DIR/.env"
  echo ""
  echo ">>> IMPORTANT: Edit $MCP_DIR/.env and add your OPENAI_API_KEY <<<"
  echo ""
fi

# 4. Test that the CLI works
echo "Testing CLI..."
npx tsx "$MCP_DIR/src/cli.ts" --help

# 5. Configure Claude Code MCP server
CLAUDE_SETTINGS_DIR="$REPO_DIR/.claude"
CLAUDE_SETTINGS="$CLAUDE_SETTINGS_DIR/settings.local.json"

# Read the OpenAI key from .env
OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$MCP_DIR/.env" | cut -d= -f2-)

if [ -z "$OPENAI_KEY" ] || [ "$OPENAI_KEY" = "sk-..." ]; then
  echo ""
  echo ">>> You need to set OPENAI_API_KEY in $MCP_DIR/.env first! <<<"
  echo ">>> Then re-run this script. <<<"
  exit 1
fi

# Create settings.local.json (not committed to git)
cat > "$CLAUDE_SETTINGS" << EOF
{
  "mcpServers": {
    "video-commerce-mcp": {
      "command": "npx",
      "args": ["tsx", "$MCP_DIR/src/cli.ts"],
      "env": {
        "OPENAI_API_KEY": "$OPENAI_KEY"
      }
    }
  }
}
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Claude Code MCP configured at: $CLAUDE_SETTINGS"
echo ""
echo "To use:"
echo "  1. cd $REPO_DIR"
echo "  2. claude"
echo "  3. Ask: 'Analyze this gardening video: https://youtube.com/watch?v=...'"
echo ""
echo "Claude will see the video-commerce-mcp tools automatically."
