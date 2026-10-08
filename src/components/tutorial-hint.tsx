import {
  Check,
  ChevronDown,
  FileText,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import type { TutorialHint as Hint } from "@/components/tutorial-content";

function Field({
  children,
  dropdown = false,
}: {
  children: React.ReactNode;
  dropdown?: boolean;
}) {
  return (
    <div className="tutorial-mini-field">
      <span>{children}</span>
      {dropdown && <ChevronDown size={14} />}
    </div>
  );
}
function Chips() {
  return (
    <div className="tutorial-mini-chips">
      <span>Frontend Developer</span>
      <span>SDE Intern</span>
    </div>
  );
}
function ContactRow({ selectable = false }: { selectable?: boolean }) {
  return (
    <div className="tutorial-mini-row">
      {selectable && (
        <span className="tutorial-mini-check">
          <Check size={12} />
        </span>
      )}
      <div>
        <strong>Alex</strong>
        <small>Northstar · Frontend Developer</small>
      </div>
    </div>
  );
}

/** Decorative examples only: no inputs, links, handlers, or tab stops. */
export function TutorialHint({
  hint,
  draft = false,
}: {
  hint: Hint;
  draft?: boolean;
}) {
  let visual: React.ReactNode;
  switch (hint) {
    case "search":
      visual = (
        <>
          <small>Search recipients</small>
          <Field>
            <Search size={14} /> Name, email, or company…
          </Field>
        </>
      );
      break;
    case "template":
      visual = (
        <>
          <small>Template</small>
          <Field dropdown>A first introduction</Field>
          <span className="tutorial-mini-link">Manage Templates</span>
        </>
      );
      break;
    case "roles":
      visual = (
        <>
          <small>Role to Apply to Selected</small>
          <Field>Frontend Developer</Field>
          <Chips />
          <span className="tutorial-mini-primary">Apply Role to Selected</span>
        </>
      );
      break;
    case "shortlist":
      visual = (
        <>
          <small>Filter by Job Role · 1 / 15 selected</small>
          <Field dropdown>All Roles</Field>
          <span className="tutorial-mini-link">Select all</span>
          <ContactRow selectable />
          <span className="tutorial-mini-warning">Previously contacted</span>
        </>
      );
      break;
    case "resume":
      visual = (
        <>
          <small>Personal preview</small>
          <Field dropdown>Alex · Northstar</Field>
          <p>
            Hi Alex,
            <br />
            Exploring Frontend Developer opportunities…
          </p>
          <div className="tutorial-mini-row">
            <span className="tutorial-mini-check">
              <Check size={12} />
            </span>
            Attach Resume
          </div>
          <small>
            <FileText size={14} /> resume.pdf · uploaded in Settings
          </small>
        </>
      );
      break;
    case "queue":
      visual = (
        <div className="tutorial-mini-queue">
          <div className={`tutorial-mini-ring ${draft ? "is-draft" : ""}`}>
            <span>
              <strong>1:20</strong>
              <small>est. left</small>
            </span>
          </div>
          <div className="tutorial-mini-legend">
            <span>
              Sent <b>{draft ? 0 : 1}</b>
            </span>
            <span>
              {draft ? "Selected" : "Queued"} <b>2</b>
            </span>
            <span>
              Failed <b>{draft ? 0 : 1}</b>
            </span>
          </div>
        </div>
      );
      break;
    case "placeholders":
      visual = (
        <>
          <div className="tutorial-mini-chips tutorial-placeholder-chips">
            {["{{name}}", "{{company}}", "{{role}}"].map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <Field>{"Hi {{name}},"}</Field>
          <small>Insert at the message cursor</small>
        </>
      );
      break;
    case "editor":
      visual = (
        <>
          <small>Template name</small>
          <Field>A first introduction</Field>
          <small>Subject</small>
          <Field>{"Exploring {{role}} opportunities"}</Field>
          <small>Message</small>
          <Field>https://example.com/portfolio</Field>
        </>
      );
      break;
    case "preview":
      visual = (
        <>
          <small>Live preview · LIVE</small>
          <Field dropdown>Preview as · Alex</Field>
          <p>
            Hi <mark>Alex</mark>,<br />
            Exploring <mark>Frontend Developer</mark> opportunities at{" "}
            <mark>Northstar</mark>.
          </p>
          <small>All placeholders are valid</small>
        </>
      );
      break;
    case "saved":
      visual = (
        <>
          <small>Saved templates</small>
          <strong>A first introduction</strong>
          <span className="tutorial-mini-link">Edit · Delete</span>
          <Field dropdown>Compose · Template</Field>
        </>
      );
      break;
    case "totals":
      visual = (
        <div className="tutorial-mini-totals">
          {["Sent Today", "In queue", "Replies"].map((label, i) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{[3, 2, 1][i]}</strong>
            </div>
          ))}
        </div>
      );
      break;
    case "statuses":
      visual = (
        <>
          <Field>
            <Search size={14} /> Search recipients or companies…
          </Field>
          <Field dropdown>All Statuses</Field>
          <div className="tutorial-mini-chips">
            <span>Sent</span>
            <span className="tutorial-mini-warning">Queued</span>
            <span className="tutorial-mini-error">Failed</span>
          </div>
        </>
      );
      break;
    case "replies":
      visual = (
        <>
          <span className="tutorial-mini-primary">
            <RefreshCw size={14} /> Check Replies
          </span>
          <Field>Delivery needs review</Field>
          <small>Failed rows explain the reason</small>
        </>
      );
      break;
    case "contacts":
      visual = (
        <>
          <Field>
            <Search size={14} /> Search contacts…
          </Field>
          <ContactRow />
          <small>Company · Job Role · Last Sent</small>
        </>
      );
      break;
    case "contact-form":
      visual = (
        <>
          <small>Email</small>
          <Field>alex@example.com</Field>
          <small>Name · Company · Job Role</small>
          <Field>Alex · Northstar · Frontend Developer</Field>
          <span className="tutorial-mini-primary">Save Contact</span>
        </>
      );
      break;
    case "import":
      visual = (
        <>
          <div className="tutorial-mini-upload">
            <Upload size={20} />
            <span>Drag and drop your CSV here</span>
            <small>Or paste your list</small>
          </div>
          <Field>Bulk Job Role · Frontend Developer</Field>
          <span className="tutorial-mini-primary">Preview Import</span>
        </>
      );
      break;
    case "import-review":
      visual = (
        <>
          <small>Review your import</small>
          <ContactRow />
          <small>1 valid · 1 duplicate · 0 invalid</small>
          <span className="tutorial-mini-primary">Confirm import</span>
        </>
      );
      break;
    case "preferences":
      visual = (
        <>
          <small>Outreach Preferences · 1–5 roles</small>
          <Chips />
          <Field>Custom role</Field>
          <span className="tutorial-mini-primary">Save Preferences</span>
        </>
      );
      break;
    case "gmail":
      visual = (
        <>
          <small>Account · Gmail connection</small>
          <Field>you@example.com</Field>
          <small>Connected · sending and reply detection enabled</small>
          <span className="tutorial-mini-primary">Reconnect Gmail</span>
          <span className="tutorial-mini-link">Manage Access in Google</span>
        </>
      );
      break;
    case "pdf":
      visual = (
        <>
          <small>Resume PDF · up to 5 MB</small>
          <Field>
            <FileText size={16} /> resume.pdf
          </Field>
          <span className="tutorial-mini-link">Replace PDF · Remove</span>
          <span className="tutorial-mini-primary">
            <Upload size={14} /> Save Resume
          </span>
        </>
      );
      break;
    case "limits":
      visual = (
        <>
          <small>Sending</small>
          <Field>
            Selected recipients <b>15 / 15</b>
          </Field>
          <Field>
            Last 24 hours + queued <b>500</b>
          </Field>
          <small>20–60 seconds between sends</small>
        </>
      );
      break;
  }
  return (
    <div className="tutorial-hint" aria-hidden="true">
      {visual}
    </div>
  );
}
