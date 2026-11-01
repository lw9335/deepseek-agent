# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

dsh-superagent is a proactive coding agent for one GitHub repository (optionally Feishu too), packaged as a **DeepSeek Harness (DSH) bundle**: plugins that run inside a DSH host, not a standalone service. It is a research prototype published by DeepSeek. It is not identical to their internal version, and some designs in their super-agent essay are not implemented here.

## Commands

Requires Node `^22.19.0 || >=24`, pnpm 11. DSH packages (`@deepseek-ai/*`) are peer dependencies pinned in devDependencies.

```bash
pnpm install
pnpm check          # typecheck + tests + build; run this before considering a change done
pnpm typecheck      # tsc --noEmit (covers src, tests and tsdown.config.ts)
pnpm test           # vitest run, tests/**/*.spec.{ts,tsx}
pnpm build          # tsdown -> lib/
pnpm vitest run tests/core-engine.spec.ts            # one file
pnpm vitest run tests/core-engine.spec.ts -t "stop"  # one test by name
```

The build produces two bundles (`tsdown.config.ts`). The first is an ESM Node bundle for the host plugins: `index` plus the Source plugins `github-watch` and `feishu-watch`. The second is a CJS browser bundle `client.js` for the panel, wrapped in `window.__ModuleLoader__.load(...)`. `cordis.patch.yml` inserts the three host plugins into the DSH profile, with Feishu disabled by default. Setting up a real deployment follows `SETUP.md` and `docs/006-deployment.md`.

## Docs are the spec, and tests enforce them

Read `docs/000`–`008` in order. Each numbered doc may link only to earlier ones. `docs/001-domain.md` defines the vocabulary: Source, Trigger, Thread, Correlation, Channel, Policy, Eval, Mandate, Ticket, Assignment, Subscription. Code, tools, panel and prompts use **these terms and no others**. `docs/007-architecture.md` is the code index.

Several "meta" tests fail on changes that look harmless:

- `tests/docs.spec.ts`: the module and test tables in `docs/007-architecture.md` must list **every** file in `src/` and `tests/`. When you add, rename or remove a file, update 007 in the same change. Local doc links must also resolve.
- `tests/class-docs.spec.ts`: every class in `src` needs a JSDoc block directly before it.
- `tests/store.spec.ts`: every `kv` key is spelled only in `src/kv.ts`. Only migration code names older keys.
- `tests/model-surface.spec.ts`: everything models read (tool schemas, prompts, skills, inputs) is checked for consistency with the glossary and the execution environment, and against a per-role size budget.
- `tests/cards.spec.ts` checks the rules the built-in prompt text must state. `tests/locales.spec.ts` requires panel copy in both languages (`src/client/locales.ts`).

## Architecture (big picture)

**Flow:** a Source emits Triggers onto Threads. A Trigger fans out to the Tickets subscribed to its Threads. Otherwise it is batched into an Eval: a policy gate, then the main Session's assessment. An accept creates a Ticket with an immutable Mandate. An Assignment runs the Ticket in its own DSH Session and directory (the Executor). Replies go back through a Channel.

**Layers and import rules:**

- `src/core/`: the pure domain. It does no I/O and imports nothing outside itself except Node hashing. `Engine` (`engine.ts`) is the **only writer** of Triggers, Threads, Decisions, Tickets and Assignments. It delegates to the parts `Intake`, `Evals`, `Tickets`, `Assignments` and `Replies`, which all extend `EnginePart` and depend in one direction. Engine methods are synchronous, and each command runs in one transaction. External work goes through the ports in `ports.ts`.
- `src/app/`: adapters and glue. `runtime.ts` is the composition root and contains no domain rules. `store.ts` owns one SQLite DB. `effects.ts` is the durable side-effect queue. Effect kinds are `assessment`, `launch`, `delivery`, `relay`, `notice` and `reply`. Ports enqueue effects inside the Engine's transaction, and handlers run them only after commit, with retry and backoff. Never perform I/O directly from a command.
- `src/sources/`: Source kinds (`SourceKind` protocol in `kind.ts`; GitHub, Feishu). They must not import from `src/app`. A Source changes Tickets only via `SourceContext.tickets.bindThread` and `threadClosed`, and writes only its own Thread `meta` and read positions. The core never interprets `meta`.
- `src/executor/dsh.ts`: `DshExecutor`, one Session and directory per Ticket, plus `WorkerSlots` capacity.
- `src/client/`: the React panel. It may import only **types** from the host side, plus the plain values of a short allow-list (see "Dependency rules" in 007).
- `src/policy.ts`: settings schemas, the gate, Mandate revalidation and `policyEffects`. A Policy change notifies the affected Tickets. It never cancels them.

**Conventions to follow:**

- Each class receives a narrow `Pick<>`-style host interface, not the whole Runtime or Engine. Callers get a role-specific Engine type: `EngineForSources`, `EngineForMainSession`, `EngineForPeople`, `EngineForSettings` or `EngineForExecutor`.
- Name requests with imperative verbs (`stopTicket`, `bindThread`). These may be refused. Name facts reported by adapters in the past tense (`assignmentStarted`, `deliveryFailed`).
- Refusals a person or agent can cause are `UserError(code, values)` with codes in `USER_ERRORS` (`src/core/errors.ts`). The panel words them per language. Decision reasons are coded `Reason`s (`src/core/reasons.ts`).
- One writer per kind of state; the full table is in 007 under "Dependency rules".
- `SCHEMA_VERSION` only increases. `src/app/migration.ts` upgrades only from schema 10.

**Two agent roles:** the main Session (the "router"/orchestrator) routes and assesses, using its `orchestrator_*` tools (`src/app/tools/main.ts`). Executor Sessions do the work, using their own `orchestrator_*` tools (`src/app/tools/executor.ts`). Built-in prompt text lives in `prompts/*.md`, written **one sentence per line** (joined by `promptFile`). Assessment instructions live only in `prompts/admission.md`. Source skills live in `skills/dsh-superagent-*/SKILL.md`. Tool descriptions stay in code.

## Tests

The domain is tested on in-memory repositories (`src/core/memory.ts`, `tests/core-engine.spec.ts`). The whole app runs against a simulated DSH host (`tests/fixtures/host.ts`, `tests/runtime.spec.ts`). Panel pages run against a fake management API (`tests/fixtures/panel-server.ts`).
