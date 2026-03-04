# Launch Checklist — Video Commerce MCP v0.2.0

Everything is built, tested, and ready. Run these steps to go live.

## Status
- [x] Transcript fetching fixed (Python bridge + 2 fallbacks)
- [x] All 236 tests passing
- [x] End-to-end pipeline verified (vF3dK1TywAk: 2582 segments, 95K chars)
- [x] Package.json updated (v0.2.0, keywords, author)
- [x] Committed to local git
- [ ] Push to GitHub
- [ ] Publish to npm
- [ ] Deploy to Fly.io
- [ ] Register on MCP directories

## 1. GitHub Setup (2 min)

```bash
gh auth login
cd ~/video-commerce-mcp
gh repo create sincetoday/video-commerce-mcp --public --source=. --push
```

## 2. npm Publish (1 min)

```bash
cd ~/video-commerce-mcp
npm adduser
npm publish
```

After publish, anyone can: `npx video-commerce-mcp`

## 3. Fly.io Deploy (3 min)

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
cd ~/video-commerce-mcp
fly launch
fly secrets set OPENAI_API_KEY=sk-proj-... YOUTUBE_API_KEY=AIza...
fly deploy
```

## 4. Register on MCP Directories

- **Smithery.ai**: https://smithery.ai/submit
- **mcp.so**: https://mcp.so/submit
- **Glama.ai**: https://glama.ai/mcp/submit

## 5. First Users — Post to:

- r/ClaudeAI
- r/mcp
- X/Twitter @sincetoday
