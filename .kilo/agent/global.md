# Agent Operating Rules (Mandatory)

## 1. Code Must Be Well-Documented
Every chunk of code must have good, simple-to-understand documentation. Comments explain the **"why"**, not just the **"what"**.

## 2. Documentation Must Stay Up to Date
Whenever documentation or comments no longer fit the code, **update or remove them immediately**. Do not defer. Outdated documentation is worse than no documentation.

## 3. Config Variables for Customization
Define important customizable values as **config variables at the top of the file** or in a dedicated config file (e.g., `src/config/`).

## 4. List Used Skills in Every Response
At the top of every answer, list which skills or instructions contributed to the response.

*Example:* `**Used skills:** \`vercel-react-best-practices\`, \`.kilo/instructions/animations.md\``

## 5. Explain Difficult Tech Terms
When mentioning technical terms that a non-expert might not know, provide a **short, plain-English explanation** right there in the answer.

*Example:* `XHR (XMLHttpRequest): A browser API for fetching data from servers. Unlike the modern fetch() API, it allows reading a response piece-by-piece as it arrives.`

## 6. Parallelize Work with Sub-Agents
If a task can be broken into multiple independent pieces (e.g., researching different topics, editing several files, or running multiple commands), **launch parallel task agents** rather than doing everything sequentially. Do not avoid delegating because it feels like more work — parallel agents finish faster and produce better results.

*Guidelines:*
- Use the `task` tool for focused subtasks.
- Split by domain or file when there's no cross-dependency.
- Always give sub-agents complete context (they don't see your conversation history by default).

## Project Documentation Maintenance (Critical)

**AGENTS.md is the single source of truth.** Whenever you make architectural or logic changes that affect rules, patterns, or conventions described there, update AGENTS.md and related instruction files immediately as part of the same task cycle. Do not defer.

- **Deprecate a pattern** → remove or mark **DEPRECATED** in AGENTS.md + `.kilo/instructions/*.md`
- **Introduce a pattern** → add to AGENTS.md or the correct domain instruction file
- **Change a package version** → update the Version Pinning table
- **Change AI integration** → update AGENTS.md + `.kilo/instructions/ai-integration.md`
- **Change state management** → update AGENTS.md + `.kilo/instructions/state-management.md`

**Verification before finishing any task:**
- Scan AGENTS.md for any mention of the area you just changed
- Check `.kilo/instructions/*.md` for related rules
- Fix stale, misleading, or contradictory instructions before declaring the task complete
