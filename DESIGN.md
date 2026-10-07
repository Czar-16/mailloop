# Mailloop Interface

Mailloop uses Geist Sans for headings, prose, and controls, with Geist Mono reserved for code and short section labels. Headings use weight 600 and restrained negative tracking. Body copy stays at 14–16px with generous line height.

The interface uses calm surfaces, thin borders, and restrained blue accents. The landing page and app share the same semantic tokens. Cards have 12px corners, controls 6px corners, and avatars are circular. Use blue for primary actions, links, focus, and progress; use semantic warning and error colors alongside explanatory text.

| Token              | Light   | Dark    |
| ------------------ | ------- | ------- |
| Background         | #f8fafc | #10141c |
| Card               | #ffffff | #181e29 |
| Foreground         | #171717 | #edf2fa |
| Body               | #475569 | #bac7db |
| Primary / link     | #1d4ed8 | #93b4ff |
| Primary foreground | #ffffff | #10141c |
| Muted surface      | #f2f2f2 | #222c3a |
| Border             | #dbe2ec | #3c495e |
| Warning            | #92400e | #ffc680 |
| Error              | #c50000 | #ff9d9d |

Theme defaults to System, with Light/Dark/System choices stored locally and applied before first paint. Explicit changes use a brief opacity transition. Reduced motion disables transitions and progress animation. Progress only animates after values change, with no decorative loop.

Use visible labels, native selects and checkboxes, keyboard focus rings, and at least 44px control targets. Account menus support keyboard arrows, Escape, Tab, and outside clicks. Keep long values wrapped, grid children shrinkable, and tables in scrolling containers on mobile. Dates render in the user's local timezone. Status labels explain uncertain delivery without implying completion from an estimate.

Contact names inferred from email addresses are editable suggestions. Companies are optional and manually supplied. Saved roles are shortcuts; batch role edits never modify contacts. Template placeholders are explicitly taught near the editor and Compose. Resume links appear only where the template requests them, while attaching a PDF is an independent batch choice.
