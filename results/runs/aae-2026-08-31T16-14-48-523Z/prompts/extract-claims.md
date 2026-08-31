Extract `claims`: short prose statements that point at operations, facts,
dependencies, or workflows already supported by the digest. Return a JSON
array. No wrapper, no markdown, no commentary.

Each entry: `statement` (one sentence), optional `supports` (ids you do
not have yet — omit rather than guess), optional `confidence`, and a
non-empty `evidence` array.

One atomic statement per entry. Do not write the reconstruction here.
Only what was observed.
