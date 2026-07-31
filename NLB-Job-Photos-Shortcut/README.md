# NLB Job Photos — Apple Shortcut

A field-service media filing shortcut for iPhone and iPad. One run captures a
job name and a category, files the selected photos and videos into an Apple
Photos album, exports renamed copies to Google Drive through the Files app, and
writes a plain-text job log.

**Built on:** Linux (Ubuntu 24.04). No macOS, no Shortcuts app, no `shortcuts`
CLI. See [Status](#status) for exactly what that means.

---

## Status

| Deliverable | State |
| --- | --- |
| Action-by-action build blueprint | ✅ Complete, authoritative |
| Machine-readable spec (YAML + JSON) | ✅ Complete, cross-checked against the plist |
| Unsigned `.shortcut` plist | ⚠️ Generated and structurally validated — **never imported into Shortcuts** |
| **Signed / directly importable shortcut** | ❌ **Not produced. Not possible on Linux.** |
| Setup checklist | ✅ Complete |
| Test checklist | ✅ Complete |

Apple signs shortcut files through the Shortcuts app or the macOS-only
`shortcuts sign` tool. Neither exists here. **Build from
[`ACTION-BY-ACTION-BUILD.md`](ACTION-BY-ACTION-BUILD.md)** — that is the real
deliverable. Details in [`LIMITATIONS.md`](LIMITATIONS.md) §1.

---

## Files

```
NLB-Job-Photos-Shortcut/
├── README.md                       this file
├── ACTION-BY-ACTION-BUILD.md       ← build from this (69 actions, exact settings)
├── SETUP-CHECKLIST.md              one-time device setup, both devices
├── TEST-CHECKLIST.md               30 tests before you trust it on a job
├── LIMITATIONS.md                  what Apple blocks, and what I could not verify
├── build/
│   ├── build_shortcut.py           generator + structural validator
│   ├── NLB Job Photos.plist        unsigned XML plist (readable)
│   └── NLB Job Photos.shortcut     unsigned binary plist (import attempt)
└── spec/
    ├── nlb-job-photos.yaml         machine-readable logic spec
    └── nlb-job-photos.json         same, generated from the YAML
```

Regenerate the shortcut files with:

```bash
cd build && python3 build_shortcut.py
```

---

## What it does

1. Preflights Google Drive — if it is unreachable you are told immediately,
   before being asked anything.
2. Asks for the customer, address, or job name → `Job Name`.
3. Menu: **What type of job photos are you filing?** → `Photo Type`
   (Estimate / Before / During / After / Damage / Materials / Receipt).
4. Captures the current date and time once → `yyyy-MM-dd` and `HH-mm-ss`.
5. Builds a job label: `2026-07-31 - Smith Residence - Before`.
6. Uses Share Sheet input if present, otherwise opens multi-select Select Photos.
7. Stops with an alert if nothing was selected.
8. Saves everything to the Apple Photos album **NLB Job Photos**.
9. Renames and exports each item to Google Drive.
10. Writes a job log.
11. Notifies: `NLB saved 5 items for Smith Residence as Before.`

Total taps on a typical run: job name, category, photo selection, done.

---

## Compact outline

```
 1. Comment
 2. Comment
 3. Get File                     (preflight sentinel, Error If Not Found OFF)
 4. Set Variable: Drive Check
 5. If  Drive Check has no value
 6.     Show Alert  (Google Drive unavailable)
 7.     Stop This Shortcut
 8. End If
 9. Ask for Input                (Customer, address, or job name?)
10. Set Variable: Job Name
11. Choose from Menu             (What type of job photos are you filing?)
       - Estimate    → Text: Estimate
       - Before      → Text: Before
       - During      → Text: During
       - After       → Text: After
       - Damage      → Text: Damage
       - Materials   → Text: Materials
       - Receipt     → Text: Receipt
26. End Menu
27. Set Variable: Photo Type
28. Date                         (Current Date)
29. Set Variable: Now
30. Format Date                  (Custom, yyyy-MM-dd)
31. Set Variable: Date Stamp
32. Format Date                  (Custom, HH-mm-ss)
33. Set Variable: Time Stamp
34. Text                         (Date Stamp - Job Name - Photo Type)
35. Set Variable: Job Label
36. Comment
37. Replace Text  regex  [\/:*?"<>|]  →  (empty)
38. Replace Text  regex  \s+          →  -
39. Replace Text  regex  -{2,}        →  -
40. Replace Text  regex  ^-+|-+$      →  (empty)
41. Replace Text  regex  ^$           →  Unnamed-Job
42. Set Variable: Job Slug
43. Get Device Details           (Device Name)
44. Set Variable: Device Name
45. Comment
46. If  Shortcut Input has any value
47.     Set Variable: Media  ← Shortcut Input
48. Otherwise
49.     Select Photos            (Select Multiple ON)
50.     Set Variable: Media
51. End If
52. Count                        (Items in Media)
53. Set Variable: Item Count
54. If  Item Count is 0
55.     Show Alert  "No photos or videos were selected."
56.     Stop This Shortcut
57. End If
58. Save to Photo Album          (NLB Job Photos)
59. Repeat with Each  Media
60.     Text                     (00 + Repeat Index)
61.     Replace Text  regex  ^\d+(\d{3})$  →  $1
62.     Set Variable: Seq
63.     Set Name                 (date_slug_type_time_seq, keep extension)
64.     Save File                (→ Drive Incoming/, Overwrite OFF)
65. End Repeat
66. Text                         (job log body)
67. Set Name                     (date_slug_type_time_Log.txt)
68. Save File                    (→ Drive Job Logs/, Overwrite OFF)
69. Show Notification            (NLB saved N items for Job as Type.)
```

---

## Google Drive layout

**Requested:**

```
03 Job Photos/
    2026-07-31 - Smith Residence/
        Before/  During/  After/  ...  Job Logs/
```

**Implemented:**

```
Google Drive/NLB Home Services/03 Job Photos/
├── Incoming/
│   ├── NLB-READY.txt                                      (preflight sentinel)
│   ├── 2026-07-31_Smith-Residence_Before_14-32-11_001.jpg
│   ├── 2026-07-31_Smith-Residence_Before_14-32-11_002.jpg
│   └── 2026-07-31_Smith-Residence_After_16-05-40_001.mov
└── Job Logs/
    └── 2026-07-31_Smith-Residence_Before_14-32-11_Log.txt
```

**Why flat:** native Shortcuts cannot reliably create nested folders inside
Google Drive through the Files provider — there is no Create Folder action, and
implicit creation via Save File is only dependable on Apple's own providers.
This is the fallback the brief specified, not a shortcut taken. Full reasoning
in [`LIMITATIONS.md`](LIMITATIONS.md) §2.

Nothing is lost: everything the tree would encode is in the filename.

```
2026-07-31_Smith-Residence_Before_14-32-11_001.jpg
└── date ──┘ └─── job ────┘ └type┘ └─time─┘ └seq┘
```

Search `Smith-Residence` for the job, `Smith-Residence_Before` for the category,
`2026-07-31` for the day.

If you would rather have the real folder tree, the blueprint's final section
gives an iCloud Drive variant where dynamic nested folders **do** work reliably.

---

## Guarantees

- **Originals are never deleted or modified.** No Delete Photos or Delete Files
  action appears anywhere in the shortcut — verified programmatically.
- **No quality loss.** No compress, resize or convert action is used. Files are
  written with their original extension and bytes.
- **No overwrites.** Save File has *Overwrite If File Exists* off, and filenames
  carry a per-second timestamp plus a sequence number.

---

## Start here

1. [`SETUP-CHECKLIST.md`](SETUP-CHECKLIST.md) — device prep (do this first)
2. [`ACTION-BY-ACTION-BUILD.md`](ACTION-BY-ACTION-BUILD.md) — build the shortcut
3. [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) — verify before real use
