# NLB Job Photos — Action-by-Action Build

**This is the authoritative document.** The `.shortcut` file in `build/` is an
unsigned, unvalidated convenience artifact. If it fails to import, build from
this page — it is known-good logic expressed in stock Shortcuts actions.

Build time from scratch: roughly 25–35 minutes.

---

## Before you start

Complete `SETUP-CHECKLIST.md` first. In particular the Google Drive folders and
the `NLB-READY.txt` sentinel file must exist, or step 3 has nothing to point at.

---

## Shortcut-level settings

Open the shortcut's **Details** panel (the ⓘ / sliders icon at the top of the
editor) and set:

| Setting | Value |
| --- | --- |
| Name | `NLB Job Photos` |
| Icon | Camera glyph, any color (blue used in the generated file) |
| Show in Share Sheet | **On** |
| Accepted types | **Images**, **Media**, **Files** — turn everything else off |
| If there's no input | **Continue** |
| Pin to Home Screen / Add to Home Screen | do this after testing |

`Files` is enabled because some video containers arrive at the Share Sheet as a
generic file rather than as media. Leaving it off makes video sharing fail
intermittently.

---

## Conventions used below

- **Position** is the action's index in the finished shortcut, top to bottom.
- **Block** says whether the action sits at the top level or nested inside an
  If / Otherwise / Menu / Repeat body.
- **Input** is what feeds the action. "implicit" means it consumes the previous
  action's output automatically — do not set anything.
- **Output** is the variable the next action stores it into, where applicable.
- Comment actions (positions 1, 2, 36, 45) are documentation only. You may skip
  them, but then every later position number shifts down.

---

## Section 1 — Preflight: is Google Drive actually reachable? (1–8)

This runs before anything is asked of you, so an offline Drive costs zero taps.

### Position 1 — Comment
- **Block:** top level
- **Text:**
  ```
  NLB Job Photos
  Files field media into Apple Photos and Google Drive.
  Originals are never deleted or modified.
  Drive target: Google Drive/NLB Home Services/03 Job Photos/Incoming/
  ```

### Position 2 — Comment
- **Block:** top level
- **Text:** `PREFLIGHT - confirm Google Drive is mounted and online.`

### Position 3 — Get File
- **Block:** top level
- **Input:** none
- **Settings:**
  - **Show Document Picker:** Off
  - **File Path:** `/NLB Home Services/03 Job Photos/Incoming/NLB-READY.txt`
  - **Error If Not Found:** **Off** ← critical; if this is On the shortcut
    hard-aborts instead of showing your alert
  - Tap the service selector on the action and choose **Google Drive**
- **Output:** implicit, captured next

### Position 4 — Set Variable
- **Block:** top level
- **Input:** implicit (the Get File result)
- **Variable name:** `Drive Check`

### Position 5 — If
- **Block:** top level, **opens a block**
- **Input:** variable `Drive Check`
- **Condition:** `does not have any value`

### Position 6 — Show Alert
- **Block:** inside **If**
- **Title:** `Google Drive unavailable`
- **Message:**
  ```
  Google Drive is not reachable.

  Open the Files app, tap Browse, and make sure Google Drive is turned on
  and that this folder opens:

  Google Drive/NLB Home Services/03 Job Photos/Incoming/

  Nothing was saved. Your photos were not changed.
  ```
- **Show Cancel Button:** Off

### Position 7 — Stop This Shortcut
- **Block:** inside **If**

### Position 8 — End If
- **Block:** top level, closes position 5

---

## Section 2 — Job name (9–10)

### Position 9 — Ask for Input
- **Block:** top level
- **Input Type:** `Text`
- **Prompt:** `Customer, address, or job name?`
- **Default Answer:** empty

### Position 10 — Set Variable
- **Block:** top level
- **Input:** implicit (`Provided Input`)
- **Variable name:** `Job Name`

---

## Section 3 — Photo type menu (11–27)

### Position 11 — Choose from Menu
- **Block:** top level, **opens a block**
- **Prompt:** `What type of job photos are you filing?`
- **Menu items, in this order:** `Estimate`, `Before`, `During`, `After`,
  `Damage`, `Materials`, `Receipt`

Each menu item then gets exactly one **Text** action inside it. The menu block's
output is whatever the taken branch produced, which is why a single Set Variable
after `End Menu` is enough.

| Position | Action | Block | Setting |
| --- | --- | --- | --- |
| 12 | *(menu item header)* `Estimate` | menu | — |
| 13 | Text | inside `Estimate` branch | `Estimate` |
| 14 | *(menu item header)* `Before` | menu | — |
| 15 | Text | inside `Before` branch | `Before` |
| 16 | *(menu item header)* `During` | menu | — |
| 17 | Text | inside `During` branch | `During` |
| 18 | *(menu item header)* `After` | menu | — |
| 19 | Text | inside `After` branch | `After` |
| 20 | *(menu item header)* `Damage` | menu | — |
| 21 | Text | inside `Damage` branch | `Damage` |
| 22 | *(menu item header)* `Materials` | menu | — |
| 23 | Text | inside `Materials` branch | `Materials` |
| 24 | *(menu item header)* `Receipt` | menu | — |
| 25 | Text | inside `Receipt` branch | `Receipt` |

### Position 26 — End Menu
- **Block:** top level, closes position 11

### Position 27 — Set Variable
- **Block:** top level
- **Input:** implicit (the menu's result)
- **Variable name:** `Photo Type`

> If your build ever shows `Photo Type` as empty, move a `Set Variable: Photo
> Type` inside each of the seven branches directly after its Text action and
> delete position 27. That is more actions but immune to output propagation
> quirks.

---

## Section 4 — Date and time (28–33)

### Position 28 — Date
- **Block:** top level
- **Setting:** `Current Date` (the default)

### Position 29 — Set Variable
- **Block:** top level
- **Input:** implicit
- **Variable name:** `Now`

### Position 30 — Format Date
- **Block:** top level
- **Input:** variable `Now`
- **Date Format:** `Custom`
- **Format String:** `yyyy-MM-dd`

### Position 31 — Set Variable
- **Block:** top level
- **Variable name:** `Date Stamp`

### Position 32 — Format Date
- **Block:** top level
- **Input:** variable `Now`
- **Date Format:** `Custom`
- **Format String:** `HH-mm-ss`

### Position 33 — Set Variable
- **Block:** top level
- **Variable name:** `Time Stamp`

> Both Format Date actions read `Now`, not the previous action, so the date and
> the time are guaranteed to come from the same instant even if the run
> straddles midnight.

---

## Section 5 — Job label (34–35)

### Position 34 — Text
- **Block:** top level
- **Text:** `[Date Stamp] - [Job Name] - [Photo Type]`

  Type the literal spaces and hyphens; insert the three variables from the
  variable bar. Result looks like `2026-07-31 - Smith Residence - Before`.

### Position 35 — Set Variable
- **Block:** top level
- **Variable name:** `Job Label`

---

## Section 6 — Filename-safe job slug (36–42)

All five Replace Text actions have **Regular Expression: On**.

### Position 36 — Comment
- **Text:** `Sanitize the job name for use inside filenames.`

### Position 37 — Replace Text
- **Block:** top level
- **Input:** variable `Job Name` ← the only one in this chain with an explicit input
- **Regular Expression:** On
- **Find:** `[\\/:*?"<>|]`
- **Replace With:** *(leave empty)*
- Removes backslash, slash, colon, asterisk, question mark, quotation mark,
  angle brackets and pipe.

### Position 38 — Replace Text
- **Block:** top level
- **Input:** implicit
- **Regular Expression:** On
- **Find:** `\s+`
- **Replace With:** `-`

### Position 39 — Replace Text
- **Block:** top level
- **Input:** implicit
- **Regular Expression:** On
- **Find:** `-{2,}`
- **Replace With:** `-`

### Position 40 — Replace Text
- **Block:** top level
- **Input:** implicit
- **Regular Expression:** On
- **Find:** `^-+|-+$`
- **Replace With:** *(leave empty)*

### Position 41 — Replace Text
- **Block:** top level
- **Input:** implicit
- **Regular Expression:** On
- **Find:** `^$`
- **Replace With:** `Unnamed-Job`

### Position 42 — Set Variable
- **Block:** top level
- **Variable name:** `Job Slug`

Worked example: `Smith Residence // Back Deck?` → `Smith-Residence-Back-Deck`

---

## Section 7 — Device name (43–44)

### Position 43 — Get Device Details
- **Block:** top level
- **Detail:** `Device Name`

### Position 44 — Set Variable
- **Block:** top level
- **Variable name:** `Device Name`

---

## Section 8 — Media source: Share Sheet or picker (45–53)

### Position 45 — Comment
- **Text:** `Use Share Sheet input when present, otherwise open the photo picker.`

### Position 46 — If
- **Block:** top level, **opens a block**
- **Input:** variable `Shortcut Input`
- **Condition:** `has any value`

### Position 47 — Set Variable
- **Block:** inside **If**
- **Input:** variable `Shortcut Input` ← set this explicitly
- **Variable name:** `Media`

### Position 48 — Otherwise
- **Block:** top level marker, opens the Otherwise body

### Position 49 — Select Photos
- **Block:** inside **Otherwise**
- **Select Multiple:** **On**
- **Include:** leave at `All` so videos are offered alongside photos

### Position 50 — Set Variable
- **Block:** inside **Otherwise**
- **Input:** implicit
- **Variable name:** `Media`

### Position 51 — End If
- **Block:** top level, closes position 46

### Position 52 — Count
- **Block:** top level
- **Input:** variable `Media`
- **Count:** `Items`

### Position 53 — Set Variable
- **Block:** top level
- **Variable name:** `Item Count`

---

## Section 9 — Empty-selection guard (54–57)

### Position 54 — If
- **Block:** top level, **opens a block**
- **Input:** variable `Item Count`
- **Condition:** `is` → `0`

### Position 55 — Show Alert
- **Block:** inside **If**
- **Title:** `NLB Job Photos`
- **Message:** `No photos or videos were selected.`
- **Show Cancel Button:** Off

### Position 56 — Stop This Shortcut
- **Block:** inside **If**

### Position 57 — End If
- **Block:** top level, closes position 54

---

## Section 10 — Apple Photos album (58)

### Position 58 — Save to Photo Album
- **Block:** top level
- **Input:** variable `Media`
- **Album:** `NLB Job Photos`

> The album picker only lists albums that already exist. Shortcuts has no
> "Create Album" action, so the album must be created by hand once — see
> `SETUP-CHECKLIST.md` step 6. This adds a reference to the existing asset; it
> does not duplicate or move the original.

---

## Section 11 — Google Drive export loop (59–65)

### Position 59 — Repeat with Each
- **Block:** top level, **opens a block**
- **Input:** variable `Media`

### Position 60 — Text
- **Block:** inside **Repeat**
- **Text:** `00[Repeat Index]` — literal `00` then the Repeat Index variable

### Position 61 — Replace Text
- **Block:** inside **Repeat**
- **Input:** implicit
- **Regular Expression:** On
- **Find:** `^\d+(\d{3})$`
- **Replace With:** `$1`

  Zero-pads to three digits: index 1 → `001`, 10 → `010`, 100 → `100`.

### Position 62 — Set Variable
- **Block:** inside **Repeat**
- **Variable name:** `Seq`

### Position 63 — Set Name
- **Block:** inside **Repeat**
- **Input:** variable `Repeat Item` ← **set this explicitly.** If you leave it
  implicit it renames the sequence number instead of the photo.
- **Name:** `[Date Stamp]_[Job Slug]_[Photo Type]_[Time Stamp]_[Seq]`
- **Don't Include File Extension:** **Off**

  With the toggle off and no extension typed, Shortcuts keeps the original
  extension. That is what preserves `.jpg` / `.heic` / `.mov` untouched.

### Position 64 — Save File
- **Block:** inside **Repeat**
- **Input:** implicit ← **leave it implicit** so it saves the *renamed* item
  from position 63
- **Ask Where to Save:** **Off**
- **Destination:** tap the folder field, browse to
  `Google Drive → NLB Home Services → 03 Job Photos → Incoming`, and select it.
  The action should then display
  `/NLB Home Services/03 Job Photos/Incoming/`
- **Overwrite If File Exists:** **Off**

### Position 65 — End Repeat
- **Block:** top level, closes position 59

Result: `2026-07-31_Smith-Residence_Before_14-32-11_001.jpg`

---

## Section 12 — Job log (66–68)

### Position 66 — Text
- **Block:** top level
- **Text:** (insert variables where bracketed)
  ```
  NLB FIELD MEDIA LOG

  Job: [Job Name]
  Category: [Photo Type]
  Date: [Date Stamp]
  Time: [Time Stamp]
  Items saved: [Item Count]
  Apple Photos album: NLB Job Photos
  Google Drive location: Google Drive/NLB Home Services/03 Job Photos/Incoming/
  Device name: [Device Name]

  Job label: [Job Label]
  Filename prefix: [Date Stamp]_[Job Slug]_[Photo Type]_[Time Stamp]
  ```

  The last two lines are not required by the spec but make a log searchable
  against the files it describes — searching the filename prefix in Drive
  returns exactly that batch.

### Position 67 — Set Name
- **Block:** top level
- **Input:** implicit
- **Name:** `[Date Stamp]_[Job Slug]_[Photo Type]_[Time Stamp]_Log.txt`
- **Don't Include File Extension:** **On** ← the text object has no original
  extension, so `.txt` is typed into the name instead

### Position 68 — Save File
- **Block:** top level
- **Input:** implicit
- **Ask Where to Save:** Off
- **Destination:** browse to
  `Google Drive → NLB Home Services → 03 Job Photos → Job Logs`, displaying
  `/NLB Home Services/03 Job Photos/Job Logs/`
- **Overwrite If File Exists:** Off

---

## Section 13 — Completion (69)

### Position 69 — Show Notification
- **Block:** top level
- **Title:** `NLB Job Photos`
- **Body:** `NLB saved [Item Count] items for [Job Name] as [Photo Type].`
- **Play Sound:** On

---

## Why the folder tree is flat

The requested tree —
`03 Job Photos/<date - job>/<Photo Type>/` — is not built, because native
Shortcuts cannot reliably create nested folders inside Google Drive through the
Files provider. `LIMITATIONS.md` explains the reasoning in full.

Everything the tree would have encoded is encoded in the filename instead, so
nothing is lost:

```
2026-07-31_Smith-Residence_Before_14-32-11_001.jpg
└── date ──┘ └─── job ────┘ └type┘ └─time─┘ └seq┘
```

Searching Google Drive for `Smith-Residence` returns that job; searching
`Smith-Residence_Before` returns that category; searching `2026-07-31` returns
that day. If you later want the tree, sort `Incoming/` by name and drag batches
— they group naturally because the date leads the filename.

---

## Optional: dynamic folders on iCloud Drive instead

If you would rather have the real folder tree and can accept iCloud Drive as the
destination, implicit folder creation *does* work reliably there. Change only
position 64 and 68:

- Position 64 Save File → **Destination:** `iCloud Drive` and set the path field
  to `Shortcuts/NLB Home Services/03 Job Photos/[Job Label]/[Photo Type]/`
- Position 68 Save File → path
  `Shortcuts/NLB Home Services/03 Job Photos/[Job Label]/Job Logs/`

Saving to a path that does not exist creates the intervening folders, and saving
again reuses them without overwriting. Do **not** apply this to the Google Drive
destination — that is the combination that fails.
