import { PolicyPage } from "@/components/policy-page";
export const metadata = { title: "Terms of Service" };
export default function Terms() {
  return (
    <PolicyPage title="Terms of Service">
      <section>
        <h2>Using Mailloop</h2>
        <p>
          Mailloop is operated by Czar16. By using the service, you agree to
          these terms and acknowledge the <a href="/privacy">Privacy Policy</a>.
          Use a Google account you control and have authority to authorize. You
          are responsible for your recipients, message content, attachments, and
          compliance with applicable laws and Google’s policies. Contact{" "}
          <a href="mailto:czar16dev@proton.me">czar16dev@proton.me</a> for help.
        </p>
      </section>
      <section>
        <h2>Acceptable outreach</h2>
        <p>
          Use Mailloop for lawful, relevant, personalized outreach. Do not send
          spam, deceptive messages, phishing, malware, harassment, or unlawful
          content. Do not impersonate others, misuse contact information, evade
          limits, or attempt unauthorized access. Respect requests to stop
          contacting a recipient. You must have the rights and legal basis
          needed to use the contact information and content you provide. Access
          may be restricted or suspended for abuse or security reasons.
        </p>
      </section>
      <section>
        <h2>Approval, limits, and delivery</h2>
        <p>
          You approve campaigns in Compose. Each recipient receives their own
          email; batches do not use CC or BCC. Mailloop limits sending to 500
          emails in a rolling 24-hour period, including queued reservations, and
          up to 15 recipients per batch. Sends are normally spaced 20–60 seconds
          apart. Google may apply additional limits or deny delivery.
        </p>
        <p>
          Queued emails can be cancelled only before delivery begins. Actively
          sending and uncertain deliveries cannot be stopped or recalled. A
          successful Gmail API response does not guarantee arrival, inbox
          placement, a reply, or a job opportunity. Timings are estimates. Reply
          detection can miss replies, and uncertain delivery requires checking
          Gmail Sent before sending again. Follow-up reminders are suggestions
          and never automatically send messages.
        </p>
      </section>
      <section>
        <h2>Service limitations</h2>
        <p>
          The service depends on Google, hosting, storage, database, and
          background processing providers. It may be unavailable, delayed,
          changed, or discontinued. To the extent allowed by applicable law, it
          is provided as available without warranties of uninterrupted operation
          or guaranteed results. Czar16 is not responsible for indirect losses
          or missed opportunities arising from use of the service, to the extent
          permitted by law. These terms do not limit rights or liabilities that
          applicable law does not allow us to exclude.
        </p>
      </section>
      <section>
        <h2>Your data and ending use</h2>
        <p>
          You retain rights to your content and authorize the processing needed
          to provide the features you request. You can export your data, revoke
          Google access, or delete your account in Settings. Deletion
          immediately disables access and starts background cleanup after at
          least 15 minutes; failures are retried. Account deletion cannot be
          undone and does not delete emails from Gmail or recipients’ inboxes.
          Download any data you need before requesting deletion.
        </p>
      </section>
      <section>
        <h2>Updates and questions</h2>
        <p>
          We may update these terms as the service changes and will identify the
          effective date on this page. For questions or to raise a concern,
          email <a href="mailto:czar16dev@proton.me">czar16dev@proton.me</a>.
        </p>
      </section>
    </PolicyPage>
  );
}
