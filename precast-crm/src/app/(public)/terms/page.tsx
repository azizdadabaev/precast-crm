// Public terms of service — referenced from the Meta app's Basic settings.

export const metadata = { title: "Terms of Service · Etalon" };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif", lineHeight: 1.65, color: "#111827" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Terms of Service</h1>
      <p style={{ color: "#6b7280" }}>Etalon (etalontbm.uz) · Last updated: 10 June 2026</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>The service</h2>
      <p>
        This site hosts Etalon&apos;s internal CRM. When you message us on Telegram or Instagram,
        our staff — assisted by an automated assistant — answer your questions and prepare
        beam-and-block flooring / gazoblok price quotes.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Quotes & orders</h2>
      <ul>
        <li>Price quotes are prepared from the dimensions you provide and are valid for a limited time.</li>
        <li>An order becomes binding only after confirmation by our staff.</li>
        <li>Delivery costs and dates are confirmed by our team separately.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Acceptable use</h2>
      <p>
        Please use our messaging channels for genuine enquiries. We may stop responding to abusive
        or fraudulent contacts.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Privacy</h2>
      <p>
        How we handle your data is described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Contact</h2>
      <p>
        <a href="mailto:adadabaev98@gmail.com">adadabaev98@gmail.com</a> · +998 93 481 33 30
      </p>
    </main>
  );
}
