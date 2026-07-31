#!/usr/bin/env python3
"""
Generator for the "NLB Job Photos" Apple Shortcut.

Emits an UNSIGNED Shortcuts property list in both XML and binary form.

IMPORTANT HONESTY NOTE
----------------------
This script was authored and run on Linux. There is no Apple signing service,
no Shortcuts app, and no `shortcuts` CLI available here, so the output has NOT
been imported into or validated by Apple Shortcuts. It is a best-effort,
structurally self-validated artifact. The authoritative deliverable is
ACTION-BY-ACTION-BUILD.md. See LIMITATIONS.md.

Usage:
    python3 build_shortcut.py
"""

import plistlib
import re
import uuid
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent

# U+FFFC OBJECT REPLACEMENT CHARACTER -- the placeholder Shortcuts uses in a
# text field for each inline variable token.
OBJ = "￼"

SHORTCUT_NAME = "NLB Job Photos"
ALBUM_NAME = "NLB Job Photos"
DRIVE_MEDIA_PATH = "/NLB Home Services/03 Job Photos/Incoming/"
DRIVE_LOG_PATH = "/NLB Home Services/03 Job Photos/Job Logs/"
DRIVE_SENTINEL = "/NLB Home Services/03 Job Photos/Incoming/NLB-READY.txt"

PHOTO_TYPES = [
    "Estimate",
    "Before",
    "During",
    "After",
    "Damage",
    "Materials",
    "Receipt",
]

# WFCondition integer codes used by Shortcuts. These are the two highest-risk
# magic numbers in the whole file; they are called out in LIMITATIONS.md.
COND_EQUALS = 4
COND_HAS_ANY_VALUE = 100
COND_HAS_NO_VALUE = 101

# WFControlFlowMode
FLOW_START = 0
FLOW_MIDDLE = 1  # "Otherwise" / a menu item header
FLOW_END = 2


# --------------------------------------------------------------------------
# Token helpers
# --------------------------------------------------------------------------

def _var_value(name):
    """Build the inner dict describing one variable reference."""
    if name == "@input":
        return {"Type": "ExtensionInput"}
    if name in ("Repeat Item", "Repeat Index"):
        # Repeat magic variables are addressed by name like any other variable.
        return {"Type": "Variable", "VariableName": name}
    return {"Type": "Variable", "VariableName": name}


def text(template):
    """
    Build a text parameter from a template using {{Variable Name}} markers.

    Offsets in attachmentsByRange are measured in UTF-16 code units, which is
    why they are computed here rather than written by hand.
    """
    parts = re.split(r"\{\{(.*?)\}\}", template)
    string = ""
    attachments = {}
    for index, part in enumerate(parts):
        if index % 2 == 0:
            string += part
            continue
        offset = len(string.encode("utf-16-le")) // 2
        attachments["{%d, 1}" % offset] = _var_value(part)
        string += OBJ

    if not attachments:
        return string
    return {
        "Value": {"string": string, "attachmentsByRange": attachments},
        "WFSerializationType": "WFTextTokenString",
    }


def attach(name):
    """Build a parameter that is exactly one variable (no surrounding text)."""
    return {
        "Value": _var_value(name),
        "WFSerializationType": "WFTextTokenAttachment",
    }


def action(identifier, **params):
    return {
        "WFWorkflowActionIdentifier": identifier,
        "WFWorkflowActionParameters": params,
    }


def gid():
    return str(uuid.uuid4()).upper()


# --------------------------------------------------------------------------
# Convenience wrappers, one per Shortcuts action used
# --------------------------------------------------------------------------

def comment(body):
    return action("is.workflow.actions.comment", WFCommentActionText=body)


def ask(prompt, default=""):
    return action(
        "is.workflow.actions.ask",
        WFAskActionPrompt=prompt,
        WFInputType="Text",
        WFAskActionDefaultAnswer=default,
    )


def set_var(name, source=None):
    params = {"WFVariableName": name}
    if source is not None:
        params["WFInput"] = attach(source)
    return action("is.workflow.actions.setvariable", **params)


def get_text(template):
    return action("is.workflow.actions.gettext", WFTextActionText=text(template))


def replace_text(find, replace, source=None, regex=True):
    params = {
        "WFReplaceTextFind": find,
        "WFReplaceTextReplace": replace,
        "WFReplaceTextRegularExpression": regex,
        "WFReplaceTextCaseSensitive": False,
    }
    if source is not None:
        params["WFInput"] = attach(source)
    return action("is.workflow.actions.text.replace", **params)


def current_date():
    return action("is.workflow.actions.date", WFDateActionMode="Current Date")


def format_date(fmt, source):
    return action(
        "is.workflow.actions.format.date",
        WFDateFormatStyle="Custom",
        WFDateFormat=fmt,
        WFDate=attach(source),
    )


def device_details(detail="Device Name"):
    return action("is.workflow.actions.getdevicedetails", WFDeviceDetail=detail)


def select_photos(multiple=True):
    return action(
        "is.workflow.actions.selectphoto", WFSelectMultiplePhotos=multiple
    )


def count_items(source):
    return action(
        "is.workflow.actions.count", WFCountType="Items", Input=attach(source)
    )


def save_to_album(album, source):
    return action(
        "is.workflow.actions.savetocameraroll",
        WFCameraRollSelectedGroup=album,
        WFInput=attach(source),
    )


def set_name(template, keep_original_extension=True, source=None):
    params = {
        "WFName": text(template),
        "WFDontIncludeFileExtension": not keep_original_extension,
    }
    if source is not None:
        params["WFInput"] = attach(source)
    return action("is.workflow.actions.setname", **params)


def save_file(destination, overwrite=False):
    return action(
        "is.workflow.actions.documentpicker.save",
        WFAskWhereToSave=False,
        WFFileDestinationPath=destination,
        WFSaveFileOverwrite=overwrite,
    )


def get_file(path, error_if_not_found=False):
    return action(
        "is.workflow.actions.documentpicker.open",
        WFGetFilePath=path,
        WFFileErrorIfNotFound=error_if_not_found,
        WFShowFilePicker=False,
    )


def show_alert(message, title="NLB Job Photos", cancel_button=False):
    return action(
        "is.workflow.actions.alert",
        WFAlertActionTitle=title,
        WFAlertActionMessage=message,
        WFAlertActionCancelButtonShown=cancel_button,
    )


def notify(template, title=SHORTCUT_NAME):
    return action(
        "is.workflow.actions.notification",
        WFNotificationActionTitle=title,
        WFNotificationActionBody=text(template),
        WFNotificationActionSound=True,
    )


def stop_shortcut():
    return action("is.workflow.actions.exit")


def if_start(group, source, condition, number=None, string=None):
    params = {
        "GroupingIdentifier": group,
        "WFControlFlowMode": FLOW_START,
        "WFCondition": condition,
        "WFInput": attach(source),
    }
    if number is not None:
        params["WFNumberValue"] = number
        params["WFConditionalActionString"] = str(number)
    if string is not None:
        params["WFConditionalActionString"] = string
    return action("is.workflow.actions.conditional", **params)


def if_otherwise(group):
    return action(
        "is.workflow.actions.conditional",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_MIDDLE,
    )


def if_end(group):
    return action(
        "is.workflow.actions.conditional",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_END,
    )


def menu_start(group, prompt, items):
    return action(
        "is.workflow.actions.choosefrommenu",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_START,
        WFMenuPrompt=prompt,
        WFMenuItems=items,
    )


def menu_item(group, title):
    return action(
        "is.workflow.actions.choosefrommenu",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_MIDDLE,
        WFMenuItemTitle=title,
    )


def menu_end(group):
    return action(
        "is.workflow.actions.choosefrommenu",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_END,
    )


def repeat_start(group, source):
    return action(
        "is.workflow.actions.repeat.each",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_START,
        WFInput=attach(source),
    )


def repeat_end(group):
    return action(
        "is.workflow.actions.repeat.each",
        GroupingIdentifier=group,
        WFControlFlowMode=FLOW_END,
    )


# --------------------------------------------------------------------------
# The workflow
# --------------------------------------------------------------------------

LOG_BODY = (
    "NLB FIELD MEDIA LOG\n"
    "\n"
    "Job: {{Job Name}}\n"
    "Category: {{Photo Type}}\n"
    "Date: {{Date Stamp}}\n"
    "Time: {{Time Stamp}}\n"
    "Items saved: {{Item Count}}\n"
    "Apple Photos album: " + ALBUM_NAME + "\n"
    "Google Drive location: Google Drive" + DRIVE_MEDIA_PATH + "\n"
    "Device name: {{Device Name}}\n"
    "\n"
    "Job label: {{Job Label}}\n"
    "Filename prefix: {{Date Stamp}}_{{Job Slug}}_{{Photo Type}}_{{Time Stamp}}\n"
)

DRIVE_UNAVAILABLE = (
    "Google Drive is not reachable.\n\n"
    "Open the Files app, tap Browse, and make sure Google Drive is turned on "
    "and that this folder opens:\n\n"
    "Google Drive/NLB Home Services/03 Job Photos/Incoming/\n\n"
    "Nothing was saved. Your photos were not changed."
)


def build_actions():
    grp_drive = gid()
    grp_menu = gid()
    grp_input = gid()
    grp_empty = gid()
    grp_repeat = gid()

    a = []

    a.append(comment(
        "NLB Job Photos\n"
        "Files field media into Apple Photos and Google Drive.\n"
        "Originals are never deleted or modified.\n"
        "Drive target: Google Drive" + DRIVE_MEDIA_PATH
    ))

    # -- Preflight: is Google Drive reachable? ---------------------------
    a.append(comment("PREFLIGHT - confirm Google Drive is mounted and online."))
    a.append(get_file(DRIVE_SENTINEL, error_if_not_found=False))
    a.append(set_var("Drive Check"))
    a.append(if_start(grp_drive, "Drive Check", COND_HAS_NO_VALUE))
    a.append(show_alert(DRIVE_UNAVAILABLE, title="Google Drive unavailable"))
    a.append(stop_shortcut())
    a.append(if_end(grp_drive))

    # -- Job name --------------------------------------------------------
    a.append(ask("Customer, address, or job name?"))
    a.append(set_var("Job Name"))

    # -- Photo type menu -------------------------------------------------
    a.append(menu_start(
        grp_menu, "What type of job photos are you filing?", PHOTO_TYPES
    ))
    for item in PHOTO_TYPES:
        a.append(menu_item(grp_menu, item))
        a.append(get_text(item))
    a.append(menu_end(grp_menu))
    a.append(set_var("Photo Type"))

    # -- Date and time ---------------------------------------------------
    a.append(current_date())
    a.append(set_var("Now"))
    a.append(format_date("yyyy-MM-dd", "Now"))
    a.append(set_var("Date Stamp"))
    a.append(format_date("HH-mm-ss", "Now"))
    a.append(set_var("Time Stamp"))

    # -- Human-readable job label ---------------------------------------
    a.append(get_text("{{Date Stamp}} - {{Job Name}} - {{Photo Type}}"))
    a.append(set_var("Job Label"))

    # -- Filename-safe job slug ------------------------------------------
    a.append(comment("Sanitize the job name for use inside filenames."))
    a.append(replace_text(r'[\\/:*?"<>|]', "", source="Job Name"))
    a.append(replace_text(r"\s+", "-"))
    a.append(replace_text(r"-{2,}", "-"))
    a.append(replace_text(r"^-+|-+$", ""))
    a.append(replace_text(r"^$", "Unnamed-Job"))
    a.append(set_var("Job Slug"))

    # -- Device name -----------------------------------------------------
    a.append(device_details("Device Name"))
    a.append(set_var("Device Name"))

    # -- Media: Share Sheet input, else Select Photos --------------------
    a.append(comment(
        "Use Share Sheet input when present, otherwise open the photo picker."
    ))
    a.append(if_start(grp_input, "@input", COND_HAS_ANY_VALUE))
    a.append(set_var("Media", source="@input"))
    a.append(if_otherwise(grp_input))
    a.append(select_photos(multiple=True))
    a.append(set_var("Media"))
    a.append(if_end(grp_input))

    a.append(count_items("Media"))
    a.append(set_var("Item Count"))

    # -- Guard: nothing selected -----------------------------------------
    a.append(if_start(grp_empty, "Item Count", COND_EQUALS, number=0))
    a.append(show_alert("No photos or videos were selected."))
    a.append(stop_shortcut())
    a.append(if_end(grp_empty))

    # -- Apple Photos album ----------------------------------------------
    a.append(save_to_album(ALBUM_NAME, "Media"))

    # -- Google Drive export ---------------------------------------------
    a.append(repeat_start(grp_repeat, "Media"))
    a.append(get_text("00{{Repeat Index}}"))
    a.append(replace_text(r"^\d+(\d{3})$", "$1"))
    a.append(set_var("Seq"))
    a.append(set_name(
        "{{Date Stamp}}_{{Job Slug}}_{{Photo Type}}_{{Time Stamp}}_{{Seq}}",
        keep_original_extension=True,
        source="Repeat Item",
    ))
    # Save File takes its input implicitly from the preceding Set Name, so the
    # renamed object is what lands in Drive. Do not bind Repeat Item here or
    # the rename is discarded.
    a.append(save_file(DRIVE_MEDIA_PATH, overwrite=False))
    a.append(repeat_end(grp_repeat))

    # -- Job log ----------------------------------------------------------
    a.append(get_text(LOG_BODY))
    a.append(set_name(
        "{{Date Stamp}}_{{Job Slug}}_{{Photo Type}}_{{Time Stamp}}_Log.txt",
        keep_original_extension=False,
    ))
    a.append(save_file(DRIVE_LOG_PATH, overwrite=False))

    # -- Done -------------------------------------------------------------
    a.append(notify(
        "NLB saved {{Item Count}} items for {{Job Name}} as {{Photo Type}}."
    ))

    return a


def build_workflow():
    return {
        "WFWorkflowClientVersion": "2607.0.6",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 4282601983,
            "WFWorkflowIconGlyphNumber": 59511,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": ["NCWidget", "WatchKit"],
        "WFWorkflowInputContentItemClasses": [
            "WFImageContentItem",
            "WFAVAssetContentItem",
            "WFGenericFileContentItem",
        ],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowActions": build_actions(),
    }


# --------------------------------------------------------------------------
# Structural self-validation
# --------------------------------------------------------------------------

def validate(workflow):
    """Check the things that can actually be checked off-device."""
    problems = []
    actions = workflow["WFWorkflowActions"]

    # 1. Control flow blocks must be balanced per grouping identifier.
    groups = {}
    for i, act in enumerate(actions):
        params = act["WFWorkflowActionParameters"]
        if "GroupingIdentifier" not in params:
            continue
        groups.setdefault(params["GroupingIdentifier"], []).append(
            (i, act["WFWorkflowActionIdentifier"], params["WFControlFlowMode"])
        )

    for group, entries in groups.items():
        modes = [m for _, _, m in entries]
        if modes[0] != FLOW_START:
            problems.append("group %s does not begin with mode 0" % group)
        if modes[-1] != FLOW_END:
            problems.append("group %s does not end with mode 2" % group)
        if modes.count(FLOW_START) != 1 or modes.count(FLOW_END) != 1:
            problems.append("group %s has unbalanced start/end markers" % group)
        identifiers = {ident for _, ident, _ in entries}
        if len(identifiers) != 1:
            problems.append("group %s mixes action types: %s" % (group, identifiers))

    # 2. Every variable read must have been written by an earlier Set Variable
    #    (or be a builtin magic variable).
    builtin = {"Repeat Item", "Repeat Index", "Shortcut Input"}
    defined = set()

    def reads(value, sink):
        if isinstance(value, dict):
            if value.get("Type") == "Variable" and "VariableName" in value:
                sink.add(value["VariableName"])
            for sub in value.values():
                reads(sub, sink)
        elif isinstance(value, list):
            for sub in value:
                reads(sub, sink)

    for i, act in enumerate(actions):
        params = act["WFWorkflowActionParameters"]
        used = set()
        reads(params, used)
        for name in sorted(used):
            if name not in defined and name not in builtin:
                problems.append(
                    "action %d (%s) reads undefined variable %r"
                    % (i, act["WFWorkflowActionIdentifier"], name)
                )
        if act["WFWorkflowActionIdentifier"] == "is.workflow.actions.setvariable":
            defined.add(params["WFVariableName"])

    # 3. Every attachment offset must land on a U+FFFC placeholder.
    def check_tokens(value, path):
        if isinstance(value, dict):
            val = value.get("Value")
            if isinstance(val, dict) and "attachmentsByRange" in val:
                string = val.get("string", "")
                units = string.encode("utf-16-le")
                for rng in val["attachmentsByRange"]:
                    match = re.fullmatch(r"\{(\d+), (\d+)\}", rng)
                    if not match:
                        problems.append("bad range %r at %s" % (rng, path))
                        continue
                    off = int(match.group(1))
                    pair = units[off * 2:off * 2 + 2]
                    if pair.decode("utf-16-le", errors="replace") != OBJ:
                        problems.append(
                            "range %s at %s does not point at a placeholder"
                            % (rng, path)
                        )
            for key, sub in value.items():
                check_tokens(sub, "%s.%s" % (path, key))
        elif isinstance(value, list):
            for idx, sub in enumerate(value):
                check_tokens(sub, "%s[%d]" % (path, idx))

    for i, act in enumerate(actions):
        check_tokens(act["WFWorkflowActionParameters"], "action[%d]" % i)

    # 4. Placeholder count must equal attachment count in every text token.
    for i, act in enumerate(actions):
        def check_counts(value):
            if isinstance(value, dict):
                val = value.get("Value")
                if isinstance(val, dict) and "attachmentsByRange" in val:
                    n_ph = val.get("string", "").count(OBJ)
                    n_at = len(val["attachmentsByRange"])
                    if n_ph != n_at:
                        problems.append(
                            "action %d: %d placeholders but %d attachments"
                            % (i, n_ph, n_at)
                        )
                for sub in value.values():
                    check_counts(sub)
            elif isinstance(value, list):
                for sub in value:
                    check_counts(sub)
        check_counts(act["WFWorkflowActionParameters"])

    # 5. No destructive or quality-reducing action may ever appear.
    forbidden = {
        "is.workflow.actions.deletephotos": "deletes photos",
        "is.workflow.actions.file.delete": "deletes files",
        "is.workflow.actions.image.resize": "resizes images",
        "is.workflow.actions.image.convert": "converts/recompresses images",
        "is.workflow.actions.image.compress": "compresses images",
        "is.workflow.actions.encodemedia": "re-encodes media",
        "is.workflow.actions.trimvideo": "trims video",
    }
    for i, act in enumerate(actions):
        ident = act["WFWorkflowActionIdentifier"]
        if ident in forbidden:
            problems.append(
                "action %d uses %s, which %s" % (i, ident, forbidden[ident])
            )

    return problems


def main():
    workflow = build_workflow()

    xml_path = OUT_DIR / "NLB Job Photos.plist"
    bin_path = OUT_DIR / "NLB Job Photos.shortcut"

    xml_path.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML))
    bin_path.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))

    # Round-trip both formats to prove they parse.
    assert plistlib.loads(xml_path.read_bytes()) == workflow, "XML round-trip failed"
    assert plistlib.loads(bin_path.read_bytes()) == workflow, "binary round-trip failed"

    problems = validate(workflow)

    print("actions:            %d" % len(workflow["WFWorkflowActions"]))
    print("xml plist:          %s (%d bytes)" % (xml_path.name, xml_path.stat().st_size))
    print("binary plist:       %s (%d bytes)" % (bin_path.name, bin_path.stat().st_size))
    print("plist round-trip:   OK (both formats)")
    if problems:
        print("structural checks:  %d PROBLEM(S)" % len(problems))
        for problem in problems:
            print("  - %s" % problem)
        raise SystemExit(1)
    print("structural checks:  OK")
    print()
    print("NOT VALIDATED: never imported into Apple Shortcuts (no macOS/iOS here).")
    print("This file is unsigned. See LIMITATIONS.md.")


if __name__ == "__main__":
    main()
