# One-Time Setup Checklist

Do this once per device (iPhone, then iPad). Steps 1–7 are prerequisites for
building the shortcut at all — do not skip ahead.

---

## 1. Install and sign into Google Drive

- [ ] Install **Google Drive** from the App Store.
- [ ] Sign in with the NLB Home Services account.
- [ ] Open it once and let the initial sync finish.

## 2. Enable Google Drive inside the Files app

- [ ] Open **Files** → **Browse**.
- [ ] Tap **⋯** (top right) → **Edit**.
- [ ] Toggle **Google Drive** **on**.
- [ ] Confirm **Google Drive** now appears under *Locations* in Browse.

If Google Drive is not listed at all, open the Drive app once more and reopen
Files — the provider registers on first launch.

## 3. Create the Google Drive folders

In Files → Google Drive, create this structure exactly (names are
case-sensitive and the numeric prefixes matter):

```
Google Drive/
└── NLB Home Services/
    └── 03 Job Photos/
        ├── Incoming/
        └── Job Logs/
```

- [ ] `NLB Home Services`
- [ ] `NLB Home Services/03 Job Photos`
- [ ] `NLB Home Services/03 Job Photos/Incoming`
- [ ] `NLB Home Services/03 Job Photos/Job Logs`

> The per-job subfolders (`Estimate/`, `Before/`, …) from the original spec are
> **not** created — the shortcut files everything flat into `Incoming/` with the
> job, date and category encoded in each filename. `LIMITATIONS.md` §2 explains
> why. You can create them by hand later if you want to file batches manually.

## 4. Create the preflight sentinel file

The shortcut checks for one small file to decide whether Drive is reachable
before it asks you anything.

- [ ] In Files → Google Drive → `NLB Home Services/03 Job Photos/Incoming/`,
      create a text file named exactly:

      NLB-READY.txt

- [ ] Any content is fine — a single character, or the words
      `Do not delete. Used by the NLB Job Photos shortcut.`

Easiest way on iOS: long-press in the folder → **New Document**? If your Files
build has no text-creation option there, create it in Notes → share → **Save to
Files** into that folder, then rename it to `NLB-READY.txt`.

- [ ] Confirm the file is visible in Files, **not** greyed out or showing a
      cloud-download icon.

## 5. Force the folders to cache

- [ ] Tap into `Incoming/` and `Job Logs/` once each in the Files app.

This makes both folders selectable in the Save File picker. Third-party
providers sometimes hide folders that have never been opened.

## 6. Create the Apple Photos album

Shortcuts **cannot** create this for you — there is no Create Album action.

- [ ] Open **Photos** → **Albums** → **+** → **New Album**.
- [ ] Name it exactly: `NLB Job Photos`
- [ ] Tap **Save**, then **Done** without adding anything (an empty album is fine).

If the album does not exist, the Save to Photo Album action will have nothing to
select at build time.

## 7. Build the shortcut

- [ ] Follow `ACTION-BY-ACTION-BUILD.md` end to end, **or** attempt the unsigned
      file in `build/` (see `LIMITATIONS.md` §1 before you rely on it).
- [ ] Set the Details-panel options listed at the top of the blueprint.

## 8. Grant Photos access

- [ ] Run the shortcut once. When iOS asks for photo access, choose
      **Allow Access to All Photos**.
- [ ] Verify at **Settings → Privacy & Security → Photos → Shortcuts** that it
      reads **All Photos**.

*Limited access breaks multi-select in a way the shortcut cannot detect.*

## 9. Grant Files and Google Drive access

- [ ] On the first Save File, approve any access prompt.
- [ ] If a Google Drive sign-in sheet appears mid-run, complete it and re-run.

## 10. Test with one disposable photo

- [ ] Take a throwaway photo (a wall, your boot).
- [ ] Run **NLB Job Photos**.
- [ ] Job name: `Test Job`
- [ ] Category: `Before`
- [ ] Select the one photo.
- [ ] Confirm all four outcomes:
  - [ ] Notification reads `NLB saved 1 items for Test Job as Before.`
  - [ ] Photos → Albums → **NLB Job Photos** contains the photo.
  - [ ] Drive `Incoming/` contains
        `<today>_Test-Job_Before_<time>_001.jpg`
  - [ ] Drive `Job Logs/` contains
        `<today>_Test-Job_Before_<time>_Log.txt` with the right contents.
- [ ] Confirm the original is still in your camera roll and undeleted.
- [ ] Delete the test files from Drive afterwards.

## 11. Add to the Home Screen

- [ ] Shortcuts → long-press **NLB Job Photos** → **Details** →
      **Add to Home Screen**.
- [ ] Place it on the first page or the Dock.
- [ ] Repeat on the iPad.

## 12. Optional surfaces

- [ ] Add the Shortcuts widget to the Home Screen and pin `NLB Job Photos` to it.
- [ ] Verify Share Sheet: Photos → select 2 photos → Share → scroll to
      **NLB Job Photos**. If it is missing, re-check *Show in Share Sheet* and
      the accepted types in the Details panel.

---

## Repeat for the second device

Steps 1, 2, 5, 6, 8, 9, 10, 11 must be done again on the iPad. Steps 3 and 4
are server-side in Drive and only need doing once. Step 7 is unnecessary if you
sync shortcuts via iCloud — confirm the shortcut appeared on the iPad, then
**re-select the Save File destination folders in positions 64 and 68**, because
folder bookmarks do not always survive the sync between devices.
