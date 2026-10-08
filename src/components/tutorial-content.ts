export type TutorialHint =
  | "search"
  | "template"
  | "roles"
  | "shortlist"
  | "resume"
  | "queue"
  | "placeholders"
  | "editor"
  | "preview"
  | "saved"
  | "totals"
  | "statuses"
  | "replies"
  | "contacts"
  | "contact-form"
  | "import"
  | "import-review"
  | "preferences"
  | "gmail"
  | "pdf"
  | "limits";

export type TutorialStep = { title: string; text: string; hint: TutorialHint };

export const tutorials: Record<string, readonly TutorialStep[]> = {
  "/compose": [
    {
      title: "Search recipients",
      text: "Search by name, email, or company to find people for your shortlist.",
      hint: "search",
    },
    {
      title: "Choose a template",
      text: "Choose a saved template for this introduction. Use Manage Templates to create or edit one.",
      hint: "template",
    },
    {
      title: "Apply a role",
      text: "Enter a role in Role to Apply to Selected, or choose a saved role chip, then click Apply Role to Selected. This changes the selected recipients’ roles for this batch.",
      hint: "roles",
    },
    {
      title: "Build your shortlist",
      text: "Use Filter by Job Role and Select all to choose up to 15 eligible contacts. Previously contacted people are skipped unless you allow a resend; queued or unconfirmed sends stay blocked.",
      hint: "shortlist",
    },
    {
      title: "Preview and attach",
      text: "Check each recipient’s Personal Preview before sending. Upload your PDF in Settings and select Attach Resume here—mentioning a PDF in the message does not attach it.",
      hint: "resume",
    },
    {
      title: "Read the Send Queue",
      text: "The ring shows sent, selected, and failed counts for your draft batch. Its estimate uses 20–60 seconds between sends and does not confirm delivery.",
      hint: "queue",
    },
  ],
  "/templates": [
    {
      title: "Personalize with placeholders",
      text: "Use {{name}}, {{company}}, and {{role}} for contact values; Compose can override the role. Insert buttons add a placeholder at the message cursor.",
      hint: "placeholders",
    },
    {
      title: "Write your template",
      text: "Give the template a name, subject, and message. Paste full URLs because emails are sent as plain text.",
      hint: "editor",
    },
    {
      title: "Check the live preview",
      text: "The preview updates as you type; use Preview as to check another recipient. Fix unknown or unclosed placeholders before saving.",
      hint: "preview",
    },
    {
      title: "Save for Compose",
      text: "Save the template to make it available in Compose’s template dropdown. Saved templates appear below the editor with Edit and Delete controls.",
      hint: "saved",
    },
  ],
  "/history": [
    {
      title: "Read your totals",
      text: "Sent Today uses the UTC day; In queue and Replies show your current totals. The cards also show reserved sending capacity and reply-check timing.",
      hint: "totals",
    },
    {
      title: "Follow the queue",
      text: "When a queue is active, its progress ring shows send statuses and estimated time remaining. The estimate does not confirm delivery.",
      hint: "queue",
    },
    {
      title: "Find a message",
      text: "Search recipients or companies and filter by Queued, Sent, Failed, or Replied. Each row shows the recipient, company, template, sent time, and status.",
      hint: "statuses",
    },
    {
      title: "Check replies and errors",
      text: "Check Replies queues a new reply check. Failed rows show a reason, and uncertain sends display Delivery needs review.",
      hint: "replies",
    },
  ],
  "/contacts": [
    {
      title: "Find your contacts",
      text: "Search names, emails, or companies. The table shows each person’s company, job role, and last sent time.",
      hint: "contacts",
    },
    {
      title: "Add or edit a person",
      text: "Use the contact form to enter an email, name, company, and job role. Company is optional; review any name suggested from the email address.",
      hint: "contact-form",
    },
    {
      title: "Preview an import",
      text: "Upload a CSV or paste your list, then review the import preview. Use Bulk Job Role to assign roles and correct missing names or invalid rows.",
      hint: "import",
    },
    {
      title: "Save your list",
      text: "Confirm the import to save valid contacts; duplicates are skipped. Existing contacts have Edit and Delete controls.",
      hint: "import-review",
    },
  ],
  "/settings": [
    {
      title: "Save role shortcuts",
      text: "Choose 1–5 preferred roles or add a custom role, then click Save Preferences. These shortcuts are available elsewhere in your outreach workflow.",
      hint: "preferences",
    },
    {
      title: "Connect Gmail",
      text: "Check the Gmail connection status and use Reconnect Gmail when permissions need refreshing. Manage Access in Google opens your Google connection settings.",
      hint: "gmail",
    },
    {
      title: "Manage your resume",
      text: "Upload one PDF up to 5 MB, then explicitly select Attach Resume in Compose. You can download, replace, or remove the saved PDF; queued emails keep their selected resume.",
      hint: "pdf",
    },
    {
      title: "Understand sending limits",
      text: "Select up to 15 recipients per batch, within 500 emails per rolling 24 hours including reserved queue capacity. Sends are spaced 20–60 seconds apart, and Gmail may apply additional limits.",
      hint: "limits",
    },
  ],
};
