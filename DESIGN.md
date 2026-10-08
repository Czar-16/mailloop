# Mailloop Visual Design

## Purpose and reference

This file is the single source of truth for Mailloop's new visual design. It supersedes the previous visual direction and describes a target design; it does not mean the application has already implemented these changes. Existing behavior and security requirements remain authoritative.

Image #1 supplied with the redesign request is the primary visual and structural reference: a near-black workspace, persistent left navigation, compact account header, blue primary actions, numbered workflow, and bordered Compose panels. Adapt these patterns to Mailloop rather than reproducing the screenshot literally. Do not copy its personal data, purple avatar, fictional subscription state, or unsupported controls. The image is a reference, not a runtime asset.

The intended feeling is modern SaaS, email productivity, and a professional developer tool. Prioritize readable information, deliberate spacing, and clear actions. Use opaque charcoal surfaces, subtle borders, restrained shadows, and moderate corners. Keep application surfaces solid; gradients are optional and minimal on the public landing page only. Avoid glassmorphism, large glows, decorative blur, purple-heavy palettes, and ornamental dashboard widgets.

## Product boundaries

Preserve every existing capability while changing presentation. The implemented routes are Compose, Templates, Contacts, History, and Settings. Campaign records exist, but there is no standalone Campaigns page, Analytics page, saved Compose draft, subscription model, or upgrade flow.

| Requested design element | Treatment within current functionality |
| --- | --- |
| Compose Campaign | New page heading for the existing Compose route. |
| Send Campaign | Primary action for the existing individual-email campaign submission. Show the eligible recipient count alongside it. |
| Save Draft | Reserve a secondary action in the target header. Until draft persistence is separately implemented, show it disabled with visible “Draft saving is not available yet” help text; never imply a draft has been saved. |
| Message customization | Keep template placeholder insertion and subject/body editing in Templates; Compose customizes recipient values and batch roles. Display the selected template's subject/body read-only with an “Edit Template” link. Arbitrary batch subject/body overrides require separate implementation. |
| Campaigns and Analytics | Include disabled, visibly labeled “Not available yet” entries in the target navigation. Do not create routes or display fabricated reports. Existing campaign progress remains in History. |
| Plan information | Use the sidebar heading “Plan & Usage.” With no plan data, show “Plan information unavailable” and the actual sending limit. Do not label the user Free/Pro or display prices or Upgrade actions. |

These limitations must be explicit in design previews and future implementation. Enabling the reserved items requires a separately authorized feature change. Disabled items are not links to nonexistent destinations.

## Colors and themes

Design dark mode first, with an AMOLED-friendly near-black application canvas. Use charcoal elevation rather than bright outlines or translucent layers. Light mode is a complete supported theme using the same layout and semantics.

| Semantic token | Dark | Light | Purpose |
| --- | --- | --- | --- |
| Background | `#050709` | `#F8FAFC` | Application canvas |
| Sidebar | `#090C10` | `#FFFFFF` | Persistent navigation |
| Card | `#10151C` | `#FFFFFF` | Main panels |
| Elevated surface | `#161D27` | `#F1F5F9` | Menus, nested sections, hover surfaces |
| Input surface | `#0C1118` | `#FFFFFF` | Inputs and selectors |
| Foreground | `#F3F6FA` | `#111827` | Headings and primary text |
| Body | `#BBC6D6` | `#475569` | Supporting text |
| Muted foreground | `#8E9CAF` | `#5B6B80` | Metadata and helper text |
| Border | `#25303E` | `#DCE3EC` | Panels and separators |
| Control border | `#607088` | `#7B889C` | Identifiable input boundaries |
| Primary | `#155EEF` | `#1D4ED8` | Main action and selected controls |
| Primary hover | `#124FD1` | `#1E40AF` | Main action hover |
| Primary foreground | `#FFFFFF` | `#FFFFFF` | Text on primary actions |
| Link / ring | `#75B4FF` | `#1D4ED8` | Links and focus indicators |
| Accent soft | `#102A50` | `#E8F0FF` | Active navigation and blue badges |
| Success | `#6EE7B7` | `#166534` | Confirmed sent/new recipient labels |
| Success soft | `#092B22` | `#DCFCE7` | Success badge background |
| Warning | `#FBBF24` | `#92400E` | Queue, skipped, review states |
| Warning soft | `#332409` | `#FEF3C7` | Warning badge background |
| Destructive | `#FCA5A5` | `#B91C1C` | Error text and borders |
| Destructive soft | `#35171C` | `#FEE2E2` | Error badge background |
| Destructive action | `#B91C1C` | `#B91C1C` | Confirmed destructive button, white text |

Map these semantic values to the existing CSS-variable and Tailwind v4 `@theme inline` system. Extend tokens only where needed. Use semantic utility classes instead of scattered hex values. Muted surfaces use the elevated-surface token. Error text and destructive-button fills have distinct tokens so both remain readable.

Use link/ring text on accent-soft backgrounds, success text on success-soft, warning text on warning-soft, and destructive text on destructive-soft. Neutral badges use body text on the elevated surface. Do not use primary blue as small text on dark cards or lower text opacity to create secondary labels. Keep blocked-recipient text at full contrast; dim only the checkbox or decorative icon. Progress fills and selected checkboxes use primary blue against the elevated surface. Use the control-border token for empty checkbox outlines and progress tracks whose boundary conveys information.

Retain Light/Dark/System selection, existing local storage persistence, system preference updates, cross-tab synchronization, and the pre-hydration theme script. Preserve the current System default and saved choices; dark-first refers to the design priority, not an automatic override of user preferences. Match native `color-scheme` and browser theme color to the resolved theme. Do not invert imagery or change information hierarchy between themes.

Verify actual text/background combinations during implementation: normal text must meet 4.5:1 contrast, large text 3:1, and meaningful control boundaries and focus indicators 3:1. Decorative panel dividers may remain subtle. Labels and icons must communicate status alongside color.

The specified opaque text/surface, button, and badge combinations have been checked using WCAG relative luminance: minimum text contrast is 5.41:1 in dark mode and 4.97:1 in light mode. Control borders against the specified neutral surfaces meet at least 3.37:1 dark and 3.28:1 light. These checks cover token pairs, not rendered-page accessibility; recheck any new combinations, opacity, or overlays during implementation.

## Typography

Retain Geist Sans through `next/font` for interface text and Geist Mono for placeholders and technical snippets. Do not introduce an additional font dependency. Use sentence case for supporting prose and concise action labels.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Desktop page title | 32px / 40px | 600 |
| Mobile page title | 26px / 34px | 600 |
| Section heading | 18px / 26px | 600 |
| Main body / email preview | 14–16px / 22–26px | 400 |
| Labels, navigation, buttons | 14px / 20px | 500; active navigation 600 |
| Editable control text | 16px / 24px | 400 |
| Short metadata and badges | 12px / 18px | 400–500 |
| Instructions, helper text, errors | 14px / 22px | 400–500 |
| Summary values | 24px / 32px | 600 |

Use restrained negative tracking on headings, balanced heading wrapping, and tabular numerals for usage, counts, and elapsed time. Wrap names and companies; allow email addresses and URLs to break. Avoid all-uppercase page headings and excessive monospace labels.

Use 16px / 26px for the personal email preview and 14px / 22px for ordinary supporting copy. Keep editable control text at 16px, including on mobile, to avoid automatic input zoom. Reserve 12px for short metadata and badges; instructions and blocking errors use at least 14px. Text must remain usable at 200% zoom without clipping or lost actions.

## Spacing, borders, radius, and shadows

Use a 4px spacing base: 4, 8, 12, 16, 20, 24, 32, 40, and 48px. Default field spacing is 16px, section spacing 24px, and page-group spacing 32px. Use 24px card padding and grid gaps on desktop; reduce padding to 16px on mobile.

- Borders: 1px solid semantic border for cards, shell divisions, and row separators; control-border for inputs. Use a 2px focus outline with 2–4px offset.
- Radius: 8px for inputs/buttons/navigation, 12px for cards, 16px for dialogs. Status pills and avatars may be fully rounded. Do not round the whole application into a screenshot-like frame.
- Shadows: cards use at most `0 2px 8px rgb(0 0 0 / 0.12)` in dark mode and `0 1px 3px rgb(15 23 42 / 0.06)` in light mode. Menus/dialogs use `0 12px 32px rgb(0 0 0 / 0.28)` dark or `0 12px 32px rgb(15 23 42 / 0.12)` light. Avoid shadows on every nested section.
- Interaction targets: minimum 44px height for controls and actionable rows; 20px visible checkbox inside a larger labeled hit area.

## Shared components

### Buttons

Primary buttons use solid blue, white text, and optional 16–18px Lucide icons. “Send Campaign” is the dominant Compose action. Secondary buttons use a card/input surface and control border; ghost buttons serve low-emphasis actions. Destructive buttons appear in confirmation dialogs, not as a competing primary action on the page.

Provide visible hover, focus, disabled, and pending states. During requests, retain button width, disable repeat submission, and show a short pending label with a decorative spinner if useful. Disabled controls retain readable labels and a visible reason when their availability is consequential. Icon-only buttons need accessible names. Links navigate; buttons perform actions.

### Inputs and forms

Use the existing Input, Textarea, Button, and native selects/checkboxes as the starting point. Inputs use opaque input surfaces, 8px corners, 44–48px height, 12–16px horizontal padding, and persistent labels. Textareas use 12px padding and a practical editing height, without blocking resizing unnecessarily.

Place helper text directly below the relevant field. Errors use destructive text, `aria-invalid`, associated descriptions, and focus the first invalid field after submission. Preserve typed values on failure. Use email/URL input types where appropriate; disable spellcheck for email addresses. Placeholder text supplements labels. Keep placeholder insertion buttons compact and wrap them on small screens.

### Cards, lists, and tables

Cards are opaque bordered panels with a short heading, supporting information, and a clear action area. Prefer separators over cards nested inside cards. Use consistent card header spacing across pages. Top-level workflow sections use the card surface; recipient rows share that surface with separators and gain the elevated surface on hover/selection. The preview uses the same card surface, with a subject divider and a quiet attachment footer. Reserve raised surfaces and stronger shadows for menus/dialogs; do not give every section a different elevation or a primary-colored border.

Contact and History tables retain captions, clear column headings, and pagination. Provide a named, keyboard-focusable scrolling region when horizontal scrolling is required. On narrow screens, recipient summary rows may become stacked cards while retaining every field and action. Keep row actions visible or keyboard-accessible; do not add nonfunctional overflow menus.

Empty states explain what is missing and link to an existing next action. Distinguish an empty account from zero search/filter matches. Loading states follow the eventual content shape when practical and expose a status message. Errors provide a useful retry or reconnection action without telling users to administer the database or Inngest.

## Application shell, sidebar, and navigation

At desktop widths, use a persistent 240px sidebar spanning the viewport, separated by a 1px border. Place the Mailloop wordmark at the top, route navigation below, and Plan & Usage near the bottom. The sidebar scrolls independently when its content exceeds available height; the usage card must never overlap navigation. Keep the main document as the primary content scroll area.

The 240px includes 16px padding on each side, leaving 208px for navigation and the usage card. Use a flex column with the usage card pushed down by available space, not absolute positioning. Allow unavailable-entry explanations and usage labels to wrap below their titles. Use dynamic viewport height for the shell and drawer. At short heights the entire sidebar content may scroll rather than pinning the usage card over links.

The main area has a compact 64–72px account header with the theme selector, account email, circular initial avatar, and existing account menu. Use a neutral or blue avatar. Keep Settings and Sign Out in the account menu, preserving arrows, Escape, outside-click handling, and focus behavior.

Target navigation order:

1. Compose — `/compose`
2. Templates — `/templates`
3. Contacts — `/contacts`
4. Campaigns — unavailable entry until a real page exists
5. History — `/history`
6. Analytics — unavailable entry until a real page exists
7. Settings — `/settings`

Use existing Lucide icons consistently at 18–20px, 12px icon/text spacing, and rows at least 44px high. Active links use an accent-soft background, link/ring text and icon, font weight 600, and `aria-current="page"`. Hover uses the elevated surface. Unavailable entries have visible explanatory text and do not masquerade as active destinations. Render them as non-interactive list items with `aria-disabled="true"`, readable muted text, and no tab stop, pointer cursor, or activation handler.

The Plan & Usage card displays the real quota count as “Used or reserved · N / 500” and “Rolling 24 hours.” It includes a usage bar and the plan availability text defined above. Usage includes sent/replied emails within the window, queued reservations, and attempting/uncertain deliveries; never label the entire count “emails sent.” The current quota is an application sending limit, not proof of a subscription tier. If a page lacks quota data, show an explicit unavailable state rather than zero or a sample number. Shared usage data must use the authenticated, user-scoped existing quota calculation.

Use 24–32px main-content padding and a centered inner width up to 1280px. Preserve the skip-to-content link and authenticated layout. The public landing page remains a public layout using the same visual tokens, typography, and theme behavior; it does not acquire the authenticated sidebar.

## Status badges and progress indicators

Badges use 12px text, a short label, 6–8px horizontal padding, and subtle semantic backgrounds. Add a dot or icon only when it helps scanning; decorative icons are hidden from assistive technology.

| State | Label and appearance | Meaning |
| --- | --- | --- |
| No prior confirmed send | No confirmed send, neutral | No known SENT/REPLIED outcome; may include earlier failed attempts |
| Prior sent/replied contact | Previously contacted, neutral | Skipped unless explicit resend consent is given |
| Queued | Queued, warning soft | Reserved and blocked from another send |
| Attempting | Sending, accent soft | Delivery attempt in progress; blocked |
| Uncertain | Delivery needs review, warning soft | Not confirmed; remains reserved and blocked |
| Sent | Sent, success soft | Service-confirmed sending outcome |
| Replied | Replied, accent soft | Existing reply detection confirmed a matching reply |
| Failed | Failed, destructive soft | Known failure with explanatory text |

Show last-sent time, resend consent, and blocking explanations beside the relevant recipient. A badge must not replace the existing safeguards.

Delivery state takes precedence over the broad send status: UNCERTAIN → Delivery needs review, then ATTEMPTING → Sending, then QUEUED/SENT/REPLIED/FAILED. Never show a failed or successful badge as the main outcome of an uncertain attempt. Compose currently receives only blocked/prior-send flags, not detailed delivery states: retain “Queued or awaiting confirmation” for its blocked badge unless the existing server query is later extended to return those real states. Do not guess the specific state from a boolean. Use “Previously contacted” next, and “No confirmed send” only when neither flag applies. Green is reserved for confirmed outcomes rather than a recipient's eligibility.

Usage bars are 6–8px high with an elevated-surface track, a control-border outline, and solid-blue fill. Derive fill from real used/reserved quota, clamp its visual width to 0–100%, and retain the exact count in text. Use warning color at 90% and above, and an explicit limit-reached message at 100%; color alone is insufficient. Show the prospective campaign count separately from already reserved usage. Use a labeled native progress element or an equivalent accessible progressbar with actual min/max/value; unavailable usage has no numeric bar. Workflow position, quota usage, and delivery completion are separate indicators and must never share a percentage.

Campaign delivery uses the existing resolved-delivery progress semantics: confirmed sent plus failed outcomes over the campaign total, with queued and review counts shown separately. A completed bar does not imply every email succeeded. Keep elapsed time, queue-wide remaining estimates, pending-service explanations, and uncertainty warnings. Completion comes from confirmed states, never from an elapsed countdown. Announce meaningful count changes politely; do not announce every timer tick.

## Compose Campaign layout

### Header and workflow

Use “Compose Campaign” as the page heading with the description “Send personalized emails to multiple people with one click.” Place Save Draft as the secondary reserved action and Send Campaign as the primary action, following the product boundaries above. Keep Gmail reconnection and prerequisite feedback visible near submission.

Below the header, present an ordered four-step workflow:

1. **Message** — choose a template and customize recipient values.
2. **Recipients** — select up to 15 people and review eligibility.
3. **Preview** — inspect each person's rendered email.
4. **Send** — review attachment and quota, then queue the campaign.

Use numbered 32–36px circles inside anchor targets at least 44px high, subdued decorative connectors, and concise descriptions. Each step links to its corresponding section with suitable scroll margins. The workflow organizes existing controls on one page; it is not a mandatory wizard and does not track completion or enforce a preview acknowledgment. Keep numbers visible rather than adding inferred completion checks. If a current step is shown, it means the last activated section anchor and uses blue plus `aria-current="step"`; it never means the campaign is ready or sent. Do not add scroll tracking or a workflow state machine. Anchor navigation within Compose must preserve selection and must not trigger a discard-changes warning.

### Desktop content

At wide desktop sizes, use two flexible columns with a 24px gap: Message on the left; Recipients, Personal Preview, and Campaign Limits on the right. Allow each column to shrink with `minmax(0, 1fr)` and avoid fixed widths that compress the email text. Keep related recipient role edits and resend permissions with the recipient section. Keep these panels in normal flow; sticky panels are unnecessary for the initial redesign.

Keep the four sections in Message → Recipients → Preview → Send DOM order at every width. At the wide breakpoint, CSS grid places Message in the left column spanning the three right-hand rows. Do not duplicate or reorder controls for mobile. At 1280px, a 240px sidebar, 32px main padding, and 24px gap leave roughly 476px per column before card padding; below this breakpoint stack the panels. This keeps the reference's structure without requiring its large fixed screenshot dimensions.

**Message panel**

- Template selector and Manage Templates link, plus a useful empty state linking to Templates.
- Read-only subject and plain-text body from the selected template, with an Edit Template link to the existing template editor. Do not render editable fields that submission ignores.
- Supported placeholder guidance: `{{name}}`, `{{company}}`, `{{role}}`, and body-only `{{resume_link}}`. Subject/body editing and cursor insertion remain in Templates.
- Preferred role shortcuts, Apply Role to Selected, and batch-only role customization. Show that applying a role affects selected recipients and does not update saved contacts.
- Existing resume filename and attachment state. Attach Resume controls the batch independently from the saved resume URL; global upload/removal remains in Settings.

**Recipients panel**

- Search by name, email, or company; preserve URL-driven search and pagination.
- An “Import Contacts” link may open the existing Contacts route, where CSV and pasted imports already work. Do not imply inline Compose import exists.
- Job-role filter, selected count “N / 15,” and compact recipient rows with a labeled checkbox, name, company when supplied, email, role, last-sent time, and status badge.
- Keep selection across search/pagination. Make off-page selections visible through a selected-recipient summary with removal controls and per-recipient batch roles.
- Previously contacted recipients require explicit resend consent. Queued/attempting/uncertain recipients remain blocked. A filter with zero matches needs its own empty message.

**Personal Preview panel**

- Recipient selector, destination email, rendered subject, and complete plain-text body with preserved line breaks.
- Render the actual values using the existing template renderer, including each recipient's batch role. Render HTTPS resume links only where requested by the template.
- Show whether a PDF is attached and whether the selected recipient will be skipped.
- Keep the full preview available on the page. Do not add a nonfunctional “View full email” button, open tracking, or a rich-text editor.

**Campaign Limits and send summary**

- Eligible individual-email count, selected/skipped counts when relevant, and “Used or reserved · N / 500” for the rolling 24-hour limit.
- Usage progress and truthful Plan & Usage information, consistent with the sidebar.
- Attachment toggle and a clear distinction between PDF attachment and template resume link; mention missing prerequisites with Settings links.
- Explain that every recipient receives a separate email from the user's Gmail and sends are normally spaced 20–60 seconds apart. Service delays and retries may extend timing.
- Keep quota, recipient-role, template, and resume-link validation. The server remains authoritative for eligibility and limits.
- Use one Send Campaign submission handler and one visible primary send button per viewport: in the header at 1280px and above, and after the send summary below 1280px. The compact header keeps Save Draft and may link to “Review & Send” instead of duplicating the primary action. Provide the eligible count alongside the button; pending state reads “Queuing…”. Preserve prerequisite checks, idempotency, and the existing Gmail/pending disabled states. Validation feedback must be visible near the active button, and invalid submission should focus or scroll to the first relevant error. Redirect successful submission to the existing focused History campaign view. Never call a queued result “Sent.”

## Other pages

**Templates:** retain paginated saved templates, create/edit forms, the reference example, subject/body limits, cursor placeholder insertion, plain-text messages, and validation. Use concise card summaries with clearly placed Edit/Delete actions. Give the editor adequate width; on small screens show the selected editor in normal document flow. Confirm replacing an unsaved message with the example.

**Contacts:** retain search, pagination, optional company, required role, manual correction of inferred names, preferred-role shortcuts, create/edit, and archive confirmation. Make import a clearly labeled section with CSV upload and pasted-list alternatives, bulk role, editable preview, duplicate/error states, and current 1 MB/1,000-row limits. Preserve preview pagination and block imports with unresolved invalid rows.

**History:** retain Sent Today, Total Sent, Replies, filters, pagination, manual reply checking, and visibility-aware refresh. Clarify that Sent Today uses a UTC calendar day while quota uses a rolling 24-hour window. Keep focused campaign progress and delivery errors prominent. Do not imply opens, clicks, or reply rates are measured. Scheduled checks run every 15 minutes; avoid implying immediate reply detection.

**Settings:** group preferred roles, optional HTTPS resume link, PDF resume, Gmail connection, and appearance clearly. Preserve 1–5 role shortcuts, reconnect/Google access management, PDF upload/download/replacement/removal, and the 5 MiB upload limit. Explain that queued emails retain their selected attachment and rendered content after later changes.

## Responsive behavior

| Width | Shell and content behavior |
| --- | --- |
| 1280px and above | Persistent 240px sidebar, full account header, two-column Compose, 24–32px content padding. |
| 1024–1279px | Persistent 240px sidebar; Compose stacks to protect readable panel width. Other pages use two columns only when controls fit comfortably. |
| 640–1023px | Sidebar becomes an explicitly toggled navigation drawer; use a compact header, single-column Compose, and 24px content padding. |
| Below 640px | Single-column layout, 16px content/card padding, wrapping header actions, full-width primary action, and compact two-row step layout. |

Mobile Compose follows Message → Recipients → Preview → Send in document order. Collapse optional explanations with native disclosures if useful, but keep validation, selection counts, and sending constraints visible. Below 640px, Contacts and History use labeled, complete stacked rows with visible actions and delivery explanations; retain table semantics and column headers for assistive technology. At larger widths, tables scroll inside their own named containers when needed. The editable CSV preview remains a named scrolling table at every width. The whole page must not overflow horizontally. Test 320px widths and long names, emails, URLs, and filenames.

The navigation drawer carries the same routes and Plan & Usage information. Implement it with a styled native modal dialog, building on the application's existing dialog pattern; a new drawer library is not required. It must support Escape, focus containment while open, focus return to its trigger, background inertness, route-selection dismissal, and a labeled close action. Contain drawer scrolling. Keep existing account access and theme switching available at all widths. Avoid an unlabeled icon-only sidebar on intermediate screens.

Account email may truncate visually in the compact header, but remains fully readable in the account menu. Respect safe-area insets. Keep the mobile send action in normal flow after the summary for the initial redesign; no sticky mobile action bar is required. At 200% zoom, allow responsive breakpoints to switch to the stacked layout and drawer naturally.

## Accessibility, motion, and implementation guidance

Preserve semantic headings, labels, table captions, navigation landmarks, skip links, visible keyboard focus, and live feedback. Native confirmation dialogs remain acceptable. Destructive changes require confirmation, and unsaved edits retain navigation warnings. Disabled future features need a visible explanation, not a hover-only tooltip.

Use short 120–180ms color/opacity transitions. Respect `prefers-reduced-motion` in CSS and theme-switch animation. Progress changes may animate briefly after real data changes; no continuous shimmer, pulsing navigation, or decorative animation. Avoid `transition: all`.

Implement the future redesign incrementally through existing components and centralized tokens: shell/theme first, shared controls second, then individual pages. Reuse Button/Input/Textarea, feedback, pagination, local DateTime rendering, account behavior, preferences, imports, resume lifecycle, and campaign progress logic. Add small presentation components only where repeated markup benefits from them; do not adopt a new UI framework or build an abstraction layer for this redesign.

The existing shadcn-style primitives use CVA, Radix Slot, and `cn()` and can support this specification through variant and token updates. Map radius-sm/md/lg to 8/12/16px. Preserve text-body, text-link, text-error-deep, panel, and page-container semantics while updating their underlying values/layout use; account for page-container's current 1200px cap and 24px padding rather than stacking a second wrapper's padding on top. Update native select and dialog styles alongside the primitives. Existing destructive buttons use the destructive token as a fill, so the target variant must explicitly switch to destructive-action with white text. Apply explicit primary-hover colors instead of whole-button opacity. Tailwind's existing sm/md/lg/xl breakpoints cover the specified ranges without new configuration; use xl for two-column Compose and lg for the persistent sidebar.

Preserve authentication, user-scoped server fetching and mutations, server-only Gmail/secrets, UUIDs, individual sending, quotas, explicit resend consent, uncertain-delivery blocks, immutable campaign snapshots, and archive behavior. No database migrations or new feature contracts are implied by this document. Future verification should cover both themes, desktop/mobile layouts, keyboard navigation, contrast, empty/error/pending states, and existing browser workflows. This documentation update does not implement the redesign.
