# Test Checklist

Run these before trusting the shortcut on a real job. Use disposable photos and
delete the results from Drive when finished.

For every test, the baseline pass condition is the same four checks:

- **N** — notification text is correct
- **A** — items appear in the `NLB Job Photos` Photos album
- **D** — correctly named files appear in Drive `Incoming/`
- **L** — a matching `_Log.txt` appears in Drive `Job Logs/`

Plus, always: **the originals are still in the camera roll, undeleted.**

---

## Media volume

### T1 — One photo
- [ ] Run, job `Test One`, category `Before`, select 1 photo
- [ ] N reads `NLB saved 1 items for Test One as Before.`
- [ ] D: exactly one file ending `_001.jpg` (or `_001.heic`)
- [ ] A, L pass

### T2 — Multiple photos
- [ ] Run, job `Test Multi`, category `During`, select 5 photos
- [ ] N reads `... 5 items ...`
- [ ] D: five files, sequence `_001` through `_005`, no gaps, no duplicates
- [ ] All five share the same `HH-mm-ss` segment
- [ ] A, L pass

### T3 — One video
- [ ] Run, job `Test Video`, category `Damage`, select 1 video
- [ ] D: file ends `_001.mov` (or `.mp4`) — **extension preserved**
- [ ] File size in Drive matches the original — **no recompression**
- [ ] Video plays back from Drive
- [ ] N, A, L pass

### T4 — Mixed photos and videos
- [ ] Run, job `Test Mixed`, category `After`, select 2 photos + 2 videos
- [ ] N reads `... 4 items ...`
- [ ] D: four files, sequence `_001`–`_004`, extensions preserved per item
- [ ] A, L pass

### T5 — Large batch
- [ ] Select 20+ items
- [ ] Sequence numbers stay zero-padded and correct past `_009` and `_010`
- [ ] Run completes without timing out

---

## Menu categories

Run once per category with 1 photo each. Confirm the category appears correctly
in **both** the filename and the log's `Category:` line.

- [ ] T6 — `Estimate`
- [ ] T7 — `Before`
- [ ] T8 — `During`
- [ ] T9 — `After`
- [ ] T10 — `Damage`
- [ ] T11 — `Materials`
- [ ] T12 — `Receipt`

---

## Naming and collisions

### T13 — Duplicate job name, same day
- [ ] Run twice with job `Repeat Job`, category `Before`, 1 photo each
- [ ] Both runs succeed
- [ ] Two distinct files in `Incoming/`, differing in the `HH-mm-ss` segment
- [ ] **Neither file was overwritten** — both are still present and openable
- [ ] Two distinct log files in `Job Logs/`

### T14 — Same job on multiple dates
- [ ] Run today with job `Ongoing Job`
- [ ] Change the device date to tomorrow (Settings → General → Date & Time), run again
- [ ] Filenames differ by the leading date
- [ ] Sorting `Incoming/` by name groups them chronologically
- [ ] **Set the device date back to automatic**

### T15 — Job name sanitization
Run with each of these job names, 1 photo each, and confirm the slug:

| Input | Expected filename slug |
| --- | --- |
| `Smith Residence` | `Smith-Residence` |
| `123 Main St. / Unit 4` | `123-Main-St.-Unit-4` |
| `Jones: "back deck"?` | `Jones-back-deck` |
| `  Extra   Spaces  ` | `Extra-Spaces` |

- [ ] No file has a name containing `/ \ : * ? " < > |`
- [ ] No file has doubled hyphens or a leading/trailing hyphen

### T16 — Empty job name
- [ ] Run and submit the job-name prompt empty
- [ ] Filename slug reads `Unnamed-Job`, not `__`

---

## Error handling

### T17 — No media selected
- [ ] Run, enter a job name, pick a category, then **cancel** the photo picker
      or select nothing and confirm
- [ ] Alert reads exactly `No photos or videos were selected.`
- [ ] Shortcut stops — **no** notification, **no** Drive file, **no** log
- [ ] Photos album is unchanged

### T18 — Google Drive offline
- [ ] Enable Airplane Mode
- [ ] Run the shortcut
- [ ] Either the preflight alert appears, or the run aborts at Save File
- [ ] **Nothing was deleted from the camera roll**
- [ ] Disable Airplane Mode, re-run, confirm a clean save

*Note: Drive may serve the sentinel from local cache while offline, so the
preflight can pass and the failure lands later at Save File. Both outcomes are
acceptable; a silent partial save is not — check `Incoming/` after reconnecting.*

### T19 — Google Drive unavailable / destination missing
- [ ] In Files → Browse → Edit, toggle **Google Drive off**
- [ ] Run the shortcut
- [ ] Preflight alert `Google Drive unavailable` appears and the run stops
      before asking for a job name
- [ ] Toggle Drive back on and confirm normal operation

### T20 — Missing sentinel file
- [ ] Rename `NLB-READY.txt` to `NLB-READY.bak`
- [ ] Run — preflight alert should fire
- [ ] Rename it back

### T21 — Photos permission
- [ ] Settings → Privacy & Security → Photos → Shortcuts → set to **None**
- [ ] Run — confirm it fails visibly rather than silently reporting success
- [ ] Restore to **All Photos**

### T22 — Cancellation
- [ ] Cancel at the job-name prompt → run ends, nothing written
- [ ] Cancel at the category menu → run ends, nothing written
- [ ] Cancel at the photo picker → covered by T17

---

## Devices and launch surfaces

### T23 — iPhone, Shortcuts app
- [ ] Full run from inside the Shortcuts app passes N/A/D/L

### T24 — iPhone, Home Screen icon
- [ ] Launches and completes; log `Device name:` shows the iPhone's name

### T25 — iPad, Shortcuts app
- [ ] Full run passes N/A/D/L
- [ ] Log `Device name:` shows the iPad's name

### T26 — iPad, Home Screen icon
- [ ] Launches and completes

### T27 — Shortcuts widget
- [ ] Tap from the widget
- [ ] Accept that it opens the Shortcuts app for the interactive prompts
- [ ] Run completes

### T28 — Share Sheet, photos
- [ ] Photos app → select 3 photos → Share → **NLB Job Photos**
- [ ] **The photo picker does NOT appear** — the shared items are used directly
- [ ] N reads `... 3 items ...`, D has three correctly named files
- [ ] A, L pass

### T29 — Share Sheet, video
- [ ] Share a single video into the shortcut
- [ ] Picker does not appear; extension preserved in Drive

### T30 — Share Sheet, from Files
- [ ] Share an image out of the Files app into the shortcut
- [ ] Completes without opening the picker

*If the picker opens during T28–T30, the Shortcut Input condition at position 46
is misconfigured — check that it reads `Shortcut Input` `has any value` and that
position 47's Set Variable input is explicitly `Shortcut Input`.*

---

## Data safety (run last, every time you change the shortcut)

- [ ] Camera roll count is unchanged after all of the above
- [ ] No test photo was deleted, moved out of Recents, or modified
- [ ] Photos in Drive open at full resolution and match the originals
- [ ] Videos in Drive match the original file size within rounding

---

## Sign-off

| Device | Tester | Date | Result |
| --- | --- | --- | --- |
| iPhone | | | |
| iPad | | | |
