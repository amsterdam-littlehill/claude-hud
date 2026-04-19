# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Claude HUD is a Claude Code plugin that displays a real-time multi-line statusline. It shows context health, stats, tool activity, agent status, todo progress, and a companion pet.

## Build Commands

```bash
npm ci               # Install dependencies
npm run build        # Build TypeScript to dist/

# Test with sample stdin data
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → render lines → stdout → Claude Code displays
           ↘ transcript_path → parse JSONL → tools/agents/todos
```

**Key insight**: The statusline is invoked every ~300ms by Claude Code. Each invocation:
1. Receives JSON via stdin (model, context, tokens - native accurate data)
2. Parses the transcript JSONL file for tools, agents, and todos
3. Renders multi-line output to stdout
4. Claude Code displays all lines

### Data Sources

**Native from stdin JSON** (accurate, no estimation):
- `model.display_name` - Current model
- `context_window.current_usage` - Token counts
- `context_window.context_window_size` - Max context
- `transcript_path` - Path to session transcript

**From transcript JSONL parsing**:
- `tool_use` blocks → tool name, input, start time
- `tool_result` blocks → completion, duration
- Running tools = `tool_use` without matching `tool_result`
- `TodoWrite` calls → todo list
- `Task` calls → agent info

**From config files**:
- MCP count from `~/.claude/settings.json` (mcpServers)
- Hooks count from `~/.claude/settings.json` (hooks)
- Rules count from CLAUDE.md files

**From Claude Code stdin rate limits**:
- `rate_limits.five_hour.used_percentage` - 5-hour subscriber usage percentage
- `rate_limits.five_hour.resets_at` - 5-hour reset timestamp
- `rate_limits.seven_day.used_percentage` - 7-day subscriber usage percentage
- `rate_limits.seven_day.resets_at` - 7-day reset timestamp

**From Claude Code stdin cost data**:
- `cost.total_cost_usd` - Native session cost (when available)
- `cost.total_lines_added` / `cost.total_lines_removed` - Cumulative lines changed
- `cost.total_duration_ms` / `cost.total_api_duration_ms` - Session timing

**From provider APIs** (when native rate_limits unavailable):
- **Kimi** (`kimi.com`) - coding plan usage via `/v1/usages`
- **GLM** (`bigmodel.cn`) - quota limits via `open.bigmodel.cn/api/monitor/usage/quota/limit`

### File Structure

```
src/
├── index.ts              # Entry point
├── stdin.ts              # Parse Claude's JSON input
├── transcript.ts         # Parse transcript JSONL
├── config-reader.ts      # Read MCP/rules configs
├── config.ts             # Load/validate user config
├── git.ts                # Git status (branch, dirty, ahead/behind)
├── types.ts              # TypeScript interfaces
├── provider-usage.ts     # Fetch usage from Kimi/GLM APIs
├── memory.ts             # System memory usage
├── version.ts            # Claude Code version detection
├── extra-cmd.ts          # Extra command label injection
├── cost.ts               # Cost estimation fallback
├── speed-tracker.ts      # Token speed tracking
├── constants.ts          # Shared constants
├── debug.ts              # Debug utilities
├── claude-config-dir.ts  # Claude config directory detection
├── i18n/                 # Internationalization
│   ├── index.ts
│   ├── types.ts
│   ├── en.ts
│   └── zh.ts
├── buddy/                # Companion pet system
│   ├── companion.ts
│   ├── state.ts
│   ├── sprites.ts
│   ├── shape-vectors.ts
│   └── types.ts
└── render/
    ├── index.ts          # Main render coordinator
    ├── session-line.ts   # Compact mode: single line with all info
    ├── stats-line.ts     # Working indicator + last skill + lines changed
    ├── tools-line.ts     # Tool activity (opt-in)
    ├── agents-line.ts    # Agent status (opt-in)
    ├── todos-line.ts     # Todo progress (opt-in)
    ├── colors.ts         # ANSI color helpers
    └── lines/
        ├── index.ts      # Barrel export
        ├── project.ts    # Line 1: model bracket + project + git
        ├── identity.ts   # Line 2a: context bar
        ├── usage.ts      # Line 2b: usage bar (combined with identity)
        ├── environment.ts # Config counts (opt-in)
        ├── memory.ts      # RAM usage line (opt-in)
        ├── session-tokens.ts # Cumulative token usage (opt-in)
        ├── cost.ts        # Cost display line (opt-in)
        └── buddy.ts       # Companion pet column rendering
```

### Output Format (default expanded layout)

```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

Lines 1-2 always shown. Additional lines are opt-in via config:
- Stats line (`showStats`): ◐ | skill: Edit | +12 -3
- Tools line (`showTools`): ◐ Edit: auth.ts | ✓ Read ×3
- Agents line (`showAgents`): ◐ explore [haiku]: Finding auth code
- Todos line (`showTodos`): ▸ Fix authentication bug (2/5)
- Environment line (`showConfigCounts`): 2 CLAUDE.md | 4 rules
- Session tokens line (`showSessionTokens`): in: 45k | out: 12k | cache: 8k
- Buddy column (`showBuddy`): 3D ASCII companion pet with idle animation

### Context Thresholds

| Threshold | Color | Action |
|-----------|-------|--------|
| <70% | Green | Normal |
| 70-85% | Yellow | Warning |
| >85% | Red | Show token breakdown |

## Plugin Configuration

The plugin manifest is in `.claude-plugin/plugin.json` (metadata only - name, description, version, author).

**StatusLine configuration** must be added to the user's `~/.claude/settings.json` via `/claude-hud:setup`.

The setup command adds an auto-updating command that finds the latest installed version at runtime.

Note: `statusLine` is NOT a valid plugin.json field. It must be configured in settings.json after plugin installation. Updates are automatic - no need to re-run setup.

## Dependencies

- **Runtime**: Node.js 18+ or Bun
- **Build**: TypeScript 5, ES2022 target, NodeNext modules
