# Cloudflare Workflow Demo

<img width="990" height="558" alt="image" src="https://github.com/user-attachments/assets/769c23cc-7618-4679-890a-3fe006cbd765" />


Interactive CLI for demonstrating [@workflow/world-cloudflare](../../packages/world-cloudflare) with live workflow execution.

## Quick Start

```bash
cd workbench/cloudflare
pnpm install
pnpm start
```

The CLI automatically starts the Cloudflare Worker dev server and presents an interactive menu-driven interface.

## Features

- **Zero Configuration** - Auto-starts Wrangler dev server
- **Interactive Menu** - Interactive navigation with @inquirer/prompts
- **Real-Time Updates** - Background polling keeps run status current
- **Self-Contained** - No manual server management needed
- **Clean Architecture** - Feature-based modular structure
- **Cloudflare Theme** - Orange/white/gray color scheme
- **Clean UI** - Suppresses noisy dev server logs for smooth navigation
- **ASCII Art Intro** - Animated Cloudflare logo with shadow effects

### Flow

```
pnpm start
    ↓
index.ts → Starts Wrangler server
    ↓
cli.ts → Initializes app context
    ↓
setup/initialize.ts → Loads templates & runs
    ↓
[Menu Loop] → User selects action
    ↓
actions/* → Executes feature
    ↓
[Return to menu]
```

## User Experience

### Main Menu

```
╔══════════════════════════════════════════════╗
║  ☁️  Cloudflare Workflow Demo               ║
║  Connected to http://localhost:8787          ║
╚══════════════════════════════════════════════╝

? What would you like to do?
  ❯ 🚀 Create New Run
    📊 View Recent Runs (5)
    🔍 Inspect Run Details
    🔄 Refresh Status
    ❌ Exit
```

### Create Run Flow

1. Select workflow template
2. Auto-tracks execution progress
3. Displays detailed results
4. Returns to menu

### Inspect Run Flow

1. Select from recent runs
2. Shows overview, steps, events
3. Displays diagnostics for failures
4. Returns to menu

## Workflow Templates

### Random Sleep
- **Purpose**: Basic execution verification
- **Stages**: 1
- **Duration**: 500-2500ms
- **Failure Rate**: 0%

### Flaky Step
- **Purpose**: Error handling demonstration
- **Stages**: 1  
- **Duration**: 800-3000ms
- **Failure Rate**: 40%

### Inspection Chain
- **Purpose**: Multi-stage timeline showcase
- **Stages**: 3 (prepare → execute → finalize)
- **Duration**: 1900-6000ms total
- **Failure Rate**: 15% (varies by stage)

## Development

### Adding New Actions

1. Create `src/actions/my-action.ts`:
```typescript
import type { ActionContext } from './types.js';

export async function myAction(ctx: ActionContext): Promise<void> {
  // Your logic here
}
```

2. Add to `src/setup/cli.ts`:
```typescript
case 'myAction':
  await myAction(ctx);
  break;
```

3. Add to menu in `src/core/menu.ts`

### Running in Development

```bash
# Watch mode
pnpm dev

# Build
pnpm build

# Type check
pnpm typecheck
```

## Technical Details

### State Management

Immutable state updates using reducer pattern:

```typescript
interface ActionContext {
  state: CLIState;      // Current app state
  client: WorkerClient; // HTTP client
  poller: BackgroundPoller; // Background updates
}
```

### Background Polling

- Polls every 2 seconds
- Updates run status automatically
- Pauses during run creation
- Resumes after completion
- Silent operation with no UI interference

### Server Management

- Auto-finds available port (8787-8791)
- Graceful shutdown on Ctrl+C
- Process cleanup on exit
- Startup timeout protection
- Clean log filtering (suppresses HTTP request spam)
- Optional file logging via `WORKBENCH_WRANGLER_LOG=file`

### Visual Polish

- ASCII art introduction with Cloudflare and Workflow logos
- Shadow effects using ANSI cursor positioning
- Smooth animations and transitions
- Consistent orange/white/gray color scheme

### Error Handling

- Network errors: Displayed with retry option
- Server failures: Clear error messages
- Graceful degradation: Continues without run history if needed

## Requirements

- Node.js 18+
- pnpm (or npm/yarn/bun)
- Wrangler 4+ (auto-installed)
- Clean ports 8787-8791 (or just pkill them)
- Terminal with ANSI support for colors and cursor positioning

## Troubleshooting

**"Failed to start worker"**
- Check ports 8787-8791 are available
- Verify Wrangler installed: `pnpm list wrangler`
- Check firewall settings

**"Failed to connect to worker"**
- Wait for "Worker ready" message
- Server may still be starting
- Check wrangler.json configuration

**Polling not working**
- Server must be running
- Check browser console for errors
- Verify network connectivity

**ASCII art not displaying correctly**
- Terminal must support ANSI color codes and cursor positioning
- Try in a different terminal (VS Code, iTerm2, Terminal.app)
- Avoid terminals that don't support full ANSI features

**Noisy logs appearing during navigation**
- Logs are automatically filtered; only critical startup messages shown
- Set `WORKBENCH_WRANGLER_LOG=file` to capture all logs to `.logs/wrangler-dev.log`

## Learn More
- 
- [@workflow/world-cloudflare](../../packages/world-cloudflare) - Core package
