Short answer: not “anything,” but it now understands a lot more common variations (e.g., “I have completed…”, “I finished…”, “done …”, “completed the task …”). It still relies on pattern matching, so uncommon phrasing can miss.

If you want true “anything,” we can add a lightweight LLM‑intent fallback just for completion detection (only when the rule‑based parser returns unknown), but that would require a small model call.
