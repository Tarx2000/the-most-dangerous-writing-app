# Maintain one catalog, generate task-specific views

## Files and authority

`DESIGN_RESOURCES.md` in this directory is the single authoritative resource catalog. The root project's `DESIGN_RESOURCES.md` is a symbolic link to that same file. Provider profiles, source indexes and D-profiles are generated views, not independently maintained facts.

Provider details live in `providers/<stable-id>/README.md`; additional Designeer sources in `designeer/D001.md` through `D137.md`. These folders let an agent load only selected sources. The short SKILL.md defines behavior; it does not repeat the catalog.

## Update a source

1. Find/deduplicate its existing ID, preserving user's preferences and useful deep links.
2. Verify official overview and relevant examples. Record **component types** explicitly: forms, buttons, overlays, navigation, cards, charts, text transitions, sounds etc., according to actual evidence. Describe what the source does not provide. For small libraries list all useful available components; for large ones record category coverage plus 3–8 strong deep links. Expand individual component detail when used.
3. Check official license text: free scope, commercial use, attribution, copyright/notice retention, asset rights and redistribution limits. Preserve unresolved contradictions and check date. Do not generalize one license to the whole marketplace.
4. Always check official links for a free MCP, CLI, registry, API, llms.txt or direct source. Record fastest practical access, exact documented endpoint/command, auth/cost requirements, fallback and whether merely documented or live tested. An llms.txt or CLI is not a MCP server.
5. Update the canonical profile and its existing task/access/license indexes. Use source links and separate provider claims, user preferences and observed evidence. No need to recheck unrelated sites.
6. Run `python3 <skill-dir>/scripts/build_references.py`. Generated files are overwritten from the catalog. Review changed output; do not manually patch generated profiles.

The generator currently expects the catalog's 33 detailed profiles and 137 D-rows. When adding/removing providers, update the explicit count guards and corresponding index rows as part of the same change. The guards prevent silent omission, not new additions.

## Verification

Check that each profile has an offering, free/rights status and usable access/fallback. Check all relative links, source counts, task search and SKILL.md metadata. Keep the entry file concise; add detail to the relevant reference rather than repeating instructions.

Behavior evaluation prompts live in `../evals/evals.json`. Evaluate routing, rights and adaptation decisions separately from actual UI integration. A search/structural check is not a with-skill benchmark or proof that third-party tools run. Do not copy Claude-specific execution helpers into the skill; use the host's supported evaluation tools.

Research snapshots are historical evidence in the source project's `research/` folder. Normal use and a copied skill folder require only bundled references; evidence snapshots are not needed to select a source. Update them only when new research is conducted.
