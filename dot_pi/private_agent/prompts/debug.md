---
description: Systematic debugging — repro, isolate, root cause, fix
argument-hint: "<symptom>"
---
Debug systematically. Symptom: $@

Do NOT jump to a fix. Work in order:
1. Reproduce — exact steps/command that trigger it. State expected vs actual.
2. Isolate — narrow to smallest failing case. Add logging/asserts if needed.
3. Root cause — explain WHY it happens, with evidence (code path, value, log). One hypothesis at a time; verify before moving on.
4. Fix — minimal change targeting the root cause, not the symptom.
5. Verify — run the repro again; confirm fixed. Check for regressions.

Report each step's finding. If root cause stays unclear after one full cycle, say so and list what you ruled out.
