# Changelog

## 0.1.0

Initial release.

Open a markdown file's Markwise previewer in an editor panel: the rendered document with an anchored
notes rail, comment / reply / suggest insert-replace-delete / resolve / discard, and the three
reading themes. Note edits persist to the file safely under concurrent writers; the panel refreshes
automatically when an agent edits the file; and **Hand to agent** composes the review briefing in
process and launches a fresh agent in a new terminal - no manual paste. The Markwise engine is
bundled, so the review loop needs no separately installed `markwise` CLI.
