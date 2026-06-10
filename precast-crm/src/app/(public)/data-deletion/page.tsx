// Public data-deletion instructions — Meta requires this URL (App settings →
// Basic → User data deletion) to switch the app Live / pass App Review.

export const metadata = { title: "Data Deletion · Etalon" };

export default function DataDeletionPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif", lineHeight: 1.65, color: "#111827" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Data Deletion Instructions</h1>
      <p style={{ color: "#6b7280" }}>Etalon (etalontbm.uz) · Last updated: 10 June 2026</p>

      <p style={{ marginTop: 20 }}>
        If you have messaged Etalon on Instagram or Telegram and want your data (messages, shared
        contact details, quotes) deleted from our systems, you can request it in either way:
      </p>

      <ol>
        <li>
          <strong>Message us</strong> in the same chat (Instagram Direct or Telegram) and write
          “Please delete my data”, or
        </li>
        <li>
          <strong>Email us</strong> at <a href="mailto:adadabaev98@gmail.com">adadabaev98@gmail.com</a>{" "}
          from any address, naming the Instagram username or phone number you contacted us with.
        </li>
      </ol>

      <p>
        We will delete your conversation history and contact details within <strong>30 days</strong>,
        except records we must keep for completed orders under accounting and tax law. We will
        confirm once the deletion is done.
      </p>

      <p>
        See also our <a href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
