// Public privacy policy — required by Meta to switch the Instagram app to Live
// mode and pass App Review (the URL is set in App settings → Basic). Static,
// unauthenticated (allow-listed in middleware).

export const metadata = { title: "Privacy Policy · Etalon" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif", lineHeight: 1.65, color: "#111827" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Privacy Policy</h1>
      <p style={{ color: "#6b7280" }}>Etalon (etalontbm.uz) · Last updated: 10 June 2026</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Who we are</h2>
      <p>
        Etalon is a precast beam-and-block flooring and aerated-block (gazoblok) manufacturer in
        Namangan region, Uzbekistan. This site hosts our internal customer-relationship system
        (CRM) used by our own staff to answer customer enquiries and prepare price quotes.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>What data we process</h2>
      <ul>
        <li>
          <strong>Messages you send us</strong> on Telegram or Instagram Direct (text, photos such
          as floor-plan sketches, and voice notes), so our staff and automated assistant can reply
          and prepare your quote.
        </li>
        <li>
          <strong>Contact details you share</strong> (name, phone number, delivery address) — used
          only to prepare quotes, place orders you request, and arrange delivery.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>How we use it</h2>
      <ul>
        <li>Answering your enquiry and calculating price quotes you ask for.</li>
        <li>Processing orders you place and arranging delivery.</li>
        <li>An automated assistant may draft or send replies; our staff supervise it.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>What we do NOT do</h2>
      <ul>
        <li>We do not sell or share your personal data with third parties for marketing.</li>
        <li>We do not use your data for advertising.</li>
        <li>We only message you in reply to your own enquiry.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Storage & retention</h2>
      <p>
        Data is stored on our own server and kept only as long as needed to serve your enquiry,
        fulfil orders, and meet legal/accounting obligations. You may request deletion at any time
        — see <a href="/data-deletion">Data deletion</a>.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 28 }}>Contact</h2>
      <p>
        Questions or requests: <a href="mailto:adadabaev98@gmail.com">adadabaev98@gmail.com</a> ·
        +998 93 481 33 30
      </p>
    </main>
  );
}
