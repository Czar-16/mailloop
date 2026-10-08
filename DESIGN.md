# Mailloop Interface

Mailloop uses Inter (system sans fallback) for headings, prose, and controls, with a monospace stack reserved for section labels, placeholder chips, the template editor, and the timer digits. Headings use weight 700 with tight negative tracking (-0.03em); the page title is 34px. Body copy is 14px with a 1.5 line height.

The interface uses soft layered surfaces, thin borders, gentle shadows, and a violet-to-pink accent gradient. The landing page and app share the same semantic tokens. Cards have 20px corners, inputs and buttons 12px, chips and status pills are fully rounded, and avatars are circular. Use the accent gradient for primary buttons, the active theme thumb, and the logo mark. Use solid accent color for links, focus, labels, and active navigation. Use green, yellow, and red only for send status.

## Tokens

| Token            | Light                         | Dark                          |
| ---------------- | ----------------------------- | ----------------------------- |
| Background       | #f6f5fb                       | #0b0a14                       |
| Surface (inputs) | #eceaf7                       | #12101f                       |
| Card             | #ffffff                       | #15132a                       |
| Foreground       | #17142b                       | #ece9ff                       |
| Muted text       | #6b6788                       | #8f8aae                       |
| Border           | Accent 30% mixed with #e4e1f2 | Accent 40% mixed with #262245 |
| Accent           | #6d4aff                       | #8b6cff                       |
| Accent 2         | #b05cff                       | #d070ff                       |
| Accent soft      | #efeaff                       | #221c45                       |
| Success (sent)   | #16a34a                       | #34d399                       |
| Warning (queued) | #d99a00                       | #fbbf24                       |
| Error (failed)   | #e5484d                       | #fb7185                       |

- Accent gradient: `linear-gradient(135deg, Accent, Accent 2)`.
- Primary buttons match the logo's Accent-to-Accent 2 gradient in dark mode, with #17142b labels. Light mode uses slightly darker ends (#6441ed to #9746da) with white labels to maintain at least 4.5:1 contrast across the gradient. Two soft purple/pink shadows use 24% opacity in dark mode (32% on hover) and 16% in light mode (23% on hover), with a 16–18px blur.
- Cards, panels, and controls use the stronger purple Border token. Hover borders mix 55% Accent with Card; keyboard focus uses solid Accent, with `focus-within` on containers. Border changes take 150ms, and invalid controls retain their error border.
- Page background adds a faint radial glow of Accent at about 18% opacity in the top-right corner.
- Cards use a soft shadow (light: `0 8px 30px rgba(80,60,160,.08)`, dark: `0 8px 40px rgba(0,0,0,.45)`).
- Tinted status backgrounds use the status color at 15% opacity.

## Theme switch

- Replace the dropdown with a sun/moon pill: two icon buttons inside a rounded track, with a gradient thumb that slides under the active icon using a springy ease (`cubic-bezier(.5,1.6,.4,1)`, 450ms).
- Theme defaults to the system preference. Light and Dark choices are stored locally and applied before first paint.
- Switching themes runs a circular reveal using the View Transitions API: the new theme expands as a circle from the center of the clicked button until it covers the screen (about 750ms, `cubic-bezier(.65,0,.35,1)`). Disable the default cross-fade on the root transition.
- If View Transitions are unsupported, or the user prefers reduced motion, switch instantly with no animation.

## Navigation

- Primary navigation is a floating pill bar: a bordered card with a soft shadow and 14px corners.
- The active item gets the Accent soft background and Accent text. Inactive items use muted text and darken on hover.
- A single Accent soft highlight slides and resizes beneath the active tab over 300ms with ease-out; text color fades over the same duration. The bar scrolls horizontally on narrow screens, keeps the active tab visible, and supports native keyboard link navigation. Resize and font changes update the highlight's dimensions. Reduced motion switches instantly.
- Tabs: Compose, Templates, History, Contacts, Settings.
- Incoming page content fades in and slides upward by 8px over 300ms with ease-out. The navigation and account controls stay in place. Query changes and same-page updates do not restart the animation; reduced motion disables it.

## Compose

- Page opens with a monospace eyebrow, a large title, and one line of supporting copy.
- Layout is two columns (message and shortlist on the left, preview and send panel on the right), stacking on narrow screens.
- Template placeholders are taught in the Role field hint: `{{name}}`, `{{company}}`, `{{role}}`, `{{resume_link}}`. Saved roles appear as dashed chips. Role overrides apply only to the batch and never modify contacts.
- Shortlist rows are rounded surface cards with a checkbox, name, company, email, role, and a warning tag such as "Previously contacted" for skipped people.
- The preview card shows the email the selected recipient will receive: a subject header and body. Resume attachment is an independent choice from the resume link, which appears only when the template contains `{{resume_link}}`.

## Templates

- The editor and a live preview sit side by side. The preview updates on every keystroke and is sticky while scrolling.
- The preview has a green pulsing "LIVE" indicator and a "Preview as" selector so the user can check different recipients.
- Placeholders that resolve are highlighted with a soft Accent background. Unknown placeholders such as a misspelled `{{nmae}}` are highlighted in Error color with a dashed outline.
- A hint line under the preview reports the state in words: a green check when everything is valid, or a red warning naming the unknown placeholder or an unclosed `{{ }}` bracket.
- Insert chips (`{{name}}`, `{{company}}`, `{{role}}`, `{{resume_link}}`) insert at the cursor position in the message field.

## Send progress and status

- Replace the plain counter with a circular progress ring (170px, 12px stroke, rounded caps) that shows the estimated time remaining in the center in monospace (`m:ss`), with the label "est. left". When finished it reads "Done / all sent".
- The ring is split into arc segments sized by count: Success for sent, Warning for queued, Error for failed, with small gaps between segments. A legend beside it lists each status with its count.
- The default Compose ring, before any recipients are selected, uses a purple-to-pink gradient with a soft glow. Once recipients are selected, the ring and legend use the original Warning yellow; actual delivery segments retain the original Success green, Warning yellow, and Error red tokens. The track behind status segments is #9c83d3 in light mode and #725cab in dark mode. Estimates, segment proportions, and status meanings are unchanged.
- Segments animate only when values change (about 600ms). No decorative looping animation, except the small pulsing dot on "LIVE" and on queued pills, which is disabled for reduced motion.
- The estimate is based on queued emails and the 20 to 60 second spacing between sends. It is an estimate and must never be presented as proof of delivery.
- Status pills in History use a tinted background, a leading dot, and a text label: Sent (green), Queued (yellow), Failed (red). Color is never the only signal; failed rows explain the reason.
- Stat cards at the top of History show Sent today, In queue, and Replies. The batch ring sits above the table.

## Accessibility and behavior

- Use visible labels, native selects and checkboxes, and keyboard focus rings (accent colored, with a 4px soft glow on inputs).
- Account menus support keyboard arrows, Escape, Tab, and outside clicks.
- Keep long values wrapped, grid children shrinkable, and tables in horizontally scrolling containers on mobile.
- Dates render in the user's local timezone.
- Respect `prefers-reduced-motion`: disable the circular reveal, the thumb spring, ring transitions, and pulses.
- Contact names inferred from email addresses are editable suggestions. Companies are optional and manually supplied.

## Loading

- Each app page has a skeleton matching its heading, grids, controls, cards, and list/table rows. The existing header and navigation remain mounted during tab changes; initial workspace loading uses matching header and navigation placeholders.
- Route loading and server data Suspense fallbacks share the same skeleton components, including shortlist rows and history/contact tables. Placeholder controls are decorative and cannot be focused; a single screen-reader status announces loading.
- Skeletons use a soft tinted surface with a subtle 1.8s shimmer in both themes. Reduced motion removes the shimmer entirely.
