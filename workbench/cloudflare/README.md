# Cloudflare Workflow Demo

Interactive CLI demonstration of `@workflow/world-cloudflare` with live workflow execution.

## Quick Start

```bash
cd workbench/cloudflare
pnpm install
pnpm start
```

That's it. The CLI automatically:
- Starts the Cloudflare Worker dev server
- Connects to it
- Presents an interactive workflow demo

Press `Ctrl+C` to stop everything and exit.

## What It Does

The demo provides:

1. **Auto-Configuration**: Wrangler dev server starts automatically on an available port
2. **Interactive Workflow Selection**: Choose from pre-configured workflow templates:
   - **Random Sleep**: Single stage, always succeeds after random delay
   - **Flaky Step**: ~40% failure rate to demonstrate error handling
   - **Inspection Chain**: Three-stage workflow with detailed timeline
3. **Real-Time Monitoring**: Watch workflow execution with live status updates
4. **Detailed Inspection**: View steps, events timeline, and diagnostics

## Features

- ✅ **Zero Configuration**: No manual Wrangler setup needed
- ✅ **Self-Contained**: Manages worker lifecycle automatically
- ✅ **Port Detection**: Finds available port if default is in use
- ✅ **Graceful Shutdown**: Cleans up worker process on exit
- ✅ **Visual UI**: Orange/white Cloudflare-themed interface

## How It Works

```
pnpm start
    ↓
[Auto-starts Wrangler]
    ↓
[Detects worker URL]
    ↓
[Runs interactive demo]
    ↓
[User selects workflow]
    ↓
[Tracks execution in real-time]
    ↓
[Shows results & diagnostics]
```

## Architecture

- **Worker**: Cloudflare Worker with demo workflow templates
- **CLI**: Interactive client that:
  - Spawns Wrangler dev server
  - Makes HTTP requests to worker REST API
  - Polls for workflow status updates
  - Displays formatted results

## Workflow Templates

### Random Sleep
- **Stages**: 1
- **Failure Rate**: 0%
- **Duration**: 500-2500ms
- **Purpose**: Verify basic workflow execution

### Flaky Step
- **Stages**: 1
- **Failure Rate**: 40%
- **Duration**: 800-3000ms
- **Purpose**: Demonstrate retry logic and error handling

### Inspection Chain
- **Stages**: 3
- **Failure Rate**: 15% (varies by stage)
- **Duration**: 1900-6000ms total
- **Purpose**: Showcase event timeline and step tracking

## Development

```bash
# Start in watch mode
pnpm dev

# Build TypeScript
pnpm build
```

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)
- Wrangler 4+ (installed automatically via dependencies)

## Troubleshooting

**Server fails to start**
- Check if port 8787-8791 are available
- Ensure Wrangler is installed: `pnpm list wrangler`

**Connection errors**
- Wait for "Worker ready on..." message before demo starts
- Check firewall isn't blocking localhost connections

**Workflow failures**
- Some workflows are intentionally flaky (see template descriptions)
- Retry feature demonstrates error recovery

## Learn More

- [@workflow/world-cloudflare](../../packages/world-cloudflare) - Main package
- [Cloudflare Workers](https://workers.cloudflare.com/) - Deployment platform
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) - Development tool