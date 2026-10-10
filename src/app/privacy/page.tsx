import { PolicyPage } from "@/components/policy-page";
export const metadata = { title: "Privacy Policy" };
export default function Privacy() {
  return (
    <PolicyPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>
          Mailloop helps job seekers send personalized, individual emails
          through their own Gmail account. Czar16 operates Mailloop. For privacy
          requests or support, contact{" "}
          <a href="mailto:czar16dev@proton.me">czar16dev@proton.me</a>.
        </p>
      </section>
      <section>
        <h2>Information we handle</h2>
        <p>
          Google sign-in supplies your Google account identifier, email address,
          and name. We store your account profile, preferred job roles, reminder
          preference, and an encrypted Google authorization refresh token.
          Session cookies keep you signed in. We do not receive your Google
          password.
        </p>
        <p>
          We store the contacts you enter or import, templates, campaign
          history, recipient and message snapshots, delivery outcomes, Gmail
          message and thread identifiers, and reply-check timestamps. Editing or
          archiving a contact or template does not erase historical message
          snapshots. Uploaded resume PDFs are kept in private storage and
          attached only when you choose to include them.
        </p>
      </section>
      <section>
        <h2>How Gmail access is used</h2>
        <p>
          We use Gmail sending permission to send each approved message
          individually from your account. Gmail read access checks tracked
          thread metadata for replies and searches sent-message metadata to
          resolve uncertain delivery. Reply detection reads sender headers,
          timestamps, labels, and message identifiers; it does not store
          incoming reply bodies. The readonly permission is broader than these
          checks, but Mailloop uses it for these features. Reminders never send
          email automatically.
        </p>
        <p>
          Mailloop’s use and transfer of information received from Google APIs
          adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>{" "}
          and{" "}
          <a href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy">
            Google Workspace API user data policy
          </a>
          , including their Limited Use requirements. Google user data is not
          sold, used for advertising, or used to train generalized AI or machine
          learning models. Human access is limited to circumstances allowed by
          those policies, such as your specific consent for support, security
          investigations, or legal requirements.
        </p>
      </section>
      <section>
        <h2>Processing and sharing</h2>
        <p>
          Hosting and PostgreSQL database providers process application data to
          operate the service. Private Vercel Blob storage processes uploaded
          PDFs in production; local development uses local files. Inngest
          processes account and send identifiers and background job outcomes for
          delivery, reply checks, and maintenance. Google processes emails,
          recipients, and attachments when sent through Gmail. Recipients
          receive the message and any attached PDF. These providers process data
          under their applicable terms. We may disclose data when required by
          law or to address abuse and protect the service.
        </p>
        <p>
          Server-side handling, encrypted authorization tokens, private PDF
          storage, and account-scoped access help protect your data. No system
          can guarantee absolute security.
        </p>
      </section>
      <section>
        <h2>Your controls and retention</h2>
        <p>
          Settings lets you download a JSON export of your profile, preferences,
          contacts, templates, message history, and attachment metadata. It
          excludes credentials and private storage locations. Your current
          resume can be downloaded separately. You can revoke Mailloop’s Google
          access through{" "}
          <a href="https://myaccount.google.com/connections">
            Google account connections
          </a>
          ; revocation does not delete your Mailloop data.
        </p>
        <p>
          Account deletion disables access immediately and cancels emails that
          have not begun delivery. Already sending or uncertain deliveries
          cannot be recalled. After a drain period of at least 15 minutes,
          background maintenance attempts Google authorization revocation and
          removes owned PDFs and database records. Cleanup failures are retried
          while the account remains disabled. Deleting Mailloop does not remove
          emails from Gmail or recipients’ inboxes. Provider-managed logs and
          backups follow the relevant provider’s retention practices; this
          policy does not promise a particular backup deletion deadline.
        </p>
        <p>
          We retain account data while your account exists. Older PDFs can be
          removed once replaced or removed from Settings and no pending or
          uncertain delivery needs them. Historical attachment metadata may
          remain until account deletion. Contact us for access, correction, or
          privacy questions.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          We will update this page when our practices change. Material changes
          to Google data use require appropriate notice and consent before that
          new use.
        </p>
      </section>
    </PolicyPage>
  );
}
