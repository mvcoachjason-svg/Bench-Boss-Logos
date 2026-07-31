# Limitations

Written from a Linux build machine. Everything below is either a documented
Apple platform constraint or an explicitly labelled uncertainty — nothing here
is a guess presented as a fact.

---

## 1. No importable, signed `.shortcut` file was produced

**This is the big one.**

Apple shortcuts distributed as files are signed by Apple's signing service. The
only supported ways to produce a signed shortcut are:

- the **Shortcuts app** on iOS / iPadOS / macOS (Share → Export / iCloud link), or
- the **`shortcuts sign`** command-line tool, which ships **only on macOS**.

This build environment is:

```
Linux vm 6.18.5 x86_64  /  Ubuntu 24.04.4 LTS
shortcuts CLI: not present
sw_vers: not macOS
```

There is no Apple signing service reachable from here and no Shortcuts runtime
to export from. **No signed shortcut file exists in this repository, and none
could have been created here.**

### What was produced instead

`build/NLB Job Photos.shortcut` — an **unsigned Shortcuts property list**.

What is actually verified about it:

| Check | Status |
| --- | --- |
| Valid binary plist, parses cleanly | ✅ verified |
| Round-trips XML ↔ binary identically | ✅ verified |
| All 69 actions present and ordered | ✅ verified |
| Control-flow blocks balanced (If/Menu/Repeat all open and close once) | ✅ verified |
| No variable is read before a Set Variable defines it | ✅ verified |
| Every variable token offset lands on a real U+FFFC placeholder | ✅ verified |
| Placeholder count equals attachment count in every text field | ✅ verified |
| Matches `spec/nlb-job-photos.yaml` step for step | ✅ verified |
| **Imports into Apple Shortcuts** | ❌ **NOT VERIFIED — impossible to test here** |
| **Signed by Apple** | ❌ **No** |

Unsigned shortcut files can sometimes be imported after enabling
**Settings → Shortcuts → Advanced → Allow Sharing Untrusted Shortcuts** (a
toggle that only appears after you have run at least one shortcut on the
device). Whether that path accepts this particular file is genuinely unknown to
me. Treat it as a lottery ticket, not a deliverable.

**Plan on building from `ACTION-BY-ACTION-BUILD.md`.** That document is the real
product.

### Known risk points if the file *does* import

Two families of magic values in the plist could not be checked against a real
Shortcuts build:

1. **`WFCondition` integer codes.** The file uses `4` (is / equals), `100`
   (has any value) and `101` (does not have any value). If the import succeeds
   but the If conditions read wrong in the editor, correct them by hand — the
   logic is in the blueprint.
2. **Save File destination bookmarks.** A Google Drive destination in Save File
   is stored partly as a security-scoped bookmark created when *you* tap the
   folder. A path string written by a generator cannot carry that bookmark. Even
   on a successful import, **you will have to re-select the destination folder
   in positions 64 and 68 by hand.** This is unavoidable and applies to any
   generated shortcut, not just this one.

---

## 2. Shortcuts cannot reliably create nested folders in Google Drive

This is the central design question in the brief, so here is the reasoning
rather than just the verdict.

**Verdict: it cannot. The flat-folder fallback is implemented.**

Why:

- **iOS Shortcuts has no "Create Folder" action.** There is no native action
  that makes a directory. The only way a folder gets created is as a side effect
  of Save File writing to a path that does not exist yet.
- **That side effect is only dependable on Apple's own providers** — iCloud
  Drive and On My iPhone/iPad. There, saving to
  `A/B/C/file.jpg` creates `A`, `B` and `C` as needed, and reuses them on the
  next run without overwriting.
- **Google Drive is a third-party File Provider extension**, not a real
  filesystem. It does not dependably support on-demand directory creation or
  path addressing of folders it has not already cached locally. A Save File to a
  not-yet-existing Drive subfolder can fail outright, appear to succeed but
  never sync, or land in a stale cached location.
- **Shortcuts has no error trapping** (see §3), so when it does fail, it fails
  mid-loop with a generic error and a partially exported batch.

For a field-service workflow where the cost of a silent failure is a lost
photo record on a job you have already left, that trade is not acceptable.

**Implemented instead:** every file goes to a single, known-good
`Incoming/` folder, and all the information the folder tree would have carried
is carried by the filename:

```
2026-07-31_Smith-Residence_Before_14-32-11_001.jpg
```

This is strictly more searchable than the tree, at the cost of not being
browsable as a tree. `ACTION-BY-ACTION-BUILD.md` includes an optional iCloud
Drive variant that *does* build the real tree, if you would rather have that
than Google Drive.

---

## 3. Shortcuts has no try / catch

There is no native error-trapping construct in Apple Shortcuts. An action that
errors aborts the whole run. This shapes all error handling in this shortcut:

- What **can** be handled is handled by **checking before acting** — the
  preflight sentinel read at positions 3–8, and the `Item Count is 0` guard at
  positions 54–57. Both use conditions rather than trapping failures.
- What **cannot** be handled is a mid-run Save File failure. If Drive drops
  offline between the preflight and the loop, the run aborts with a system
  error. Nothing is corrupted and nothing is deleted; re-running produces a new
  timestamp and a clean second batch.
- Partial batches are possible in that scenario: items 1–4 saved, items 5–9 not.
  The job log is written last precisely so that **a log file in `Job Logs/` means
  the whole batch completed.** A batch with no matching log is a batch to check.

---

## 4. Apple Photos albums cannot be created by a shortcut

There is no "Create Album" action. `Save to Photo Album` can only target an album
that already exists, and its picker only lists existing albums. The
`NLB Job Photos` album is therefore a one-time manual setup step
(`SETUP-CHECKLIST.md` step 6). This is a platform limitation, not an oversight.

---

## 5. Permission prompts cannot be pre-granted

Photos access, Files access and Google Drive access are granted by iOS through
system prompts on first use. A shortcut cannot request them ahead of time or
detect that they were denied — a denied Photos permission surfaces as an empty
picker or an aborted run, not as a catchable condition. Run the shortcut once
deliberately (setup step 10) so all prompts are answered before you are standing
in a customer's driveway.

---

## 6. Smaller behaviours worth knowing

| Behaviour | Detail |
| --- | --- |
| **Live Photos** | Export as a still image. The motion component is not written to Drive. The Photos album entry keeps the Live Photo intact. |
| **Sequence ceiling** | The zero-pad regex handles 1–999 items per run. At 1000+ the padding degrades (`1000` → `000`), though files still save and remain distinct by nothing but that number — avoid runs that large. |
| **Time in filenames** | `HH-mm-ss` is captured once per run, not per file, so every file in one batch shares a timestamp and is distinguished by the sequence number. That is deliberate — it makes a batch greppable. |
| **Empty job name** | Sanitizes to `Unnamed-Job` rather than producing a filename starting with `_`. |
| **Duplicate job names** | Fully supported. Same job on different dates differs by date; same job twice in one day differs by `HH-mm-ss`. |
| **Quality** | No compression, resize or format-conversion action is used anywhere. Files are written byte-for-byte with their original extension. |
| **Deletion** | No `Delete Photos` or `Delete Files` action exists anywhere in the shortcut. Originals cannot be removed by it. |
| **iCloud "Optimize Storage"** | If a selected photo is not downloaded locally, Shortcuts fetches it first, which makes large batches slow on cellular. Not an error, just latency. |
| **Widget runs** | Actions that need interaction (Ask for Input, the menu, the photo picker) will bounce a widget run into the Shortcuts app. Expected. |

---

## 7. What is genuinely unknown to me

Stated plainly rather than papered over:

- Whether the generated unsigned plist imports on your iOS version.
- Whether the three `WFCondition` codes render as the intended conditions.
- Whether your specific Google Drive app version exposes `Incoming/` to the
  Save File picker without first being opened once in the Files app. (Setup
  step 4 has you open it once, which resolves this in practice.)

None of these affect the hand-built version, which is why the blueprint is the
recommended path.
