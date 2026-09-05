# Graph Report - /Users/dzakwanirfanramdhani/Documents/projects/wa-bot-lokal  (2026-09-05)

## Corpus Check
- Corpus is ~1,587 words - fits in a single context window. You may not need a graph.

## Summary
- 94 nodes · 123 edges · 9 communities
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.81)
- Token cost: 544 input · 0 output

## Community Hubs (Navigation)
- Bot Overview and Lifecycle
- TypeScript Compiler Configuration
- Routing and Conversation Memory
- Package Scripts and Metadata
- Gemini Reply Service
- Bot Startup and WhatsApp Client
- Runtime Dependencies
- Development Tooling
- Environment Configuration

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `createMessageRouter()` - 6 edges
3. `scripts` - 5 edges
4. `normalizePhoneNumber()` - 4 edges
5. `parseTargetPhoneNumbers()` - 4 edges
6. `loadConfig()` - 4 edges
7. `Local WhatsApp Gemini Bot` - 4 edges
8. `Google Gemini` - 4 edges
9. `isTransient()` - 3 edges
10. `withTransientRetry()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `whatsapp-web.js Puppeteer Override` --conceptually_related_to--> `whatsapp-web.js`  [INFERRED]
  pnpm-workspace.yaml → README.md
- `safePhoneNumber()` --calls--> `normalizePhoneNumber()`  [EXTRACTED]
  src/router.ts → src/config.ts
- `createWhatsAppClient()` --references--> `client`  [EXTRACTED]
  src/whatsapp.ts → src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Targeted Contextual AI Reply Flow** — readme_whitelisted_direct_text_routing, readme_in_memory_conversation_context, readme_google_gemini [INFERRED 0.95]
- **Disabled Dependency Build Scripts** — pnpm_workspace_google_genai_build_script, pnpm_workspace_protobufjs_build_script, pnpm_workspace_puppeteer_build_script [EXTRACTED 1.00]

## Communities (9 total, 0 thin omitted)

### Community 0 - "Bot Overview and Lifecycle"
Cohesion: 0.14
Nodes (15): @google/genai Build Script, Dependency Lifecycle Script Policy, protobufjs Build Script, puppeteer Build Script, whatsapp-web.js Puppeteer Override, Environment Configuration, Gemini Retry Policy, Google Gemini (+7 more)

### Community 1 - "TypeScript Compiler Configuration"
Cohesion: 0.13
Nodes (14): src/**/*.ts, compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, outDir (+6 more)

### Community 2 - "Routing and Conversation Memory"
Cohesion: 0.24
Nodes (11): ChatTurn, ConversationMemory, createConversationMemory(), CommandHandler, createMessageRouter(), errorSummary(), isDirectChatId(), RouteCandidate (+3 more)

### Community 3 - "Package Scripts and Metadata"
Cohesion: 0.17
Nodes (11): engines, node, name, private, scripts, build, check, start (+3 more)

### Community 4 - "Gemini Reply Service"
Cohesion: 0.28
Nodes (7): createGeminiService(), GeminiService, isTransient(), RETRY_DELAYS_MS, statusCode(), SYSTEM_INSTRUCTION, withTransientRetry()

### Community 5 - "Bot Startup and WhatsApp Client"
Cohesion: 0.28
Nodes (6): client, config, gemini, memory, routeMessage, createWhatsAppClient()

### Community 6 - "Runtime Dependencies"
Cohesion: 0.29
Nodes (7): @google/genai, dependencies, @google/genai, qrcode-terminal, whatsapp-web.js, qrcode-terminal, whatsapp-web.js

### Community 7 - "Development Tooling"
Cohesion: 0.29
Nodes (7): devDependencies, @types/node, @types/qrcode-terminal, typescript, @types/node, @types/qrcode-terminal, typescript

### Community 8 - "Environment Configuration"
Cohesion: 0.53
Nodes (5): AppConfig, loadConfig(), normalizePhoneNumber(), parseTargetPhoneNumbers(), requireEnv()

## Knowledge Gaps
- **43 isolated node(s):** `name`, `version`, `private`, `type`, `node` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Runtime Dependencies` to `Package Scripts and Metadata`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Development Tooling` to `Package Scripts and Metadata`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bot Overview and Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._