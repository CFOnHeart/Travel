# Local-first validation for Trip generation

Trip generation today always enters an LLM validate/repair loop (up to three rounds) after the initial parse, which can mean five to seven model calls and long blocking waits on the home page. We will run **local-first validation** instead: after the first generation call, normalize structure and run deterministic local checks; only when those fail do we call LLM validate/repair as a fallback. Fast-path trips should typically complete in one LLM call. We rejected "always validate with LLM" (too slow/costly) and "local-only with no repair loop" (too risky for messy inputs).

**Considered options:** (1) keep current always-validate loop; (2) local-first with repair fallback (**chosen**); (3) single-shot generation with no repair.

**Consequences:** Response metadata (`generationProfile`, `stages`) becomes the contract for tests and future observability; generation regression tests must mock LLM deps at the `generateValidatedTrip` seam, mirroring chat-cases.
