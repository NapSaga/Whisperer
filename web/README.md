# web/ — owner: Giovanni

The dashboard **is** the demo. Single page, dark-only, no auth, no routing.

- Start from the sample's **frontend** or a fresh Next.js + `shadcn` + `ai-elements`.
- Renders: split-screen **base vs suggeritore** transcript · live **memory HUD**
  (`state.json` row-by-row) · diverging **cost counter** (`cost_event`).
- **Runs entirely on `spec/fixtures/` — finished look by 13:00.** Wire to the server
  (poll/WS) only after.
- Green (`emerald-500`) appears ONLY at the recall moment. Kickoff prompt: `spec/PROMPTS.md §3`.

```bash
npx shadcn@latest init
npx shadcn@latest add card badge button table tabs separator progress skeleton sonner scroll-area collapsible
npx ai-elements@latest add conversation message response
```
