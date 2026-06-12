import Head from 'next/head';

const LAST_UPDATED = 'June 11, 2025';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — ARIZN</title>
        <meta name="description" content="ARIZN Privacy Policy — how we collect, use, and protect your data." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #ffffff;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #ffffff;
        }

        /* ── Header ── */
        header {
          border-bottom: 1px solid #e8e8e8;
          padding: 0 24px;
        }
        .header-inner {
          max-width: 760px;
          margin: 0 auto;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo {
          font-weight: 700;
          font-size: 18px;
          letter-spacing: 0.08em;
          color: #0a0a0a;
          text-decoration: none;
        }
        .logo span { color: #1A56FF; }
        .back-link {
          font-size: 14px;
          color: #666;
          text-decoration: none;
        }
        .back-link:hover { color: #1A56FF; }

        /* ── Content ── */
        main {
          max-width: 760px;
          margin: 0 auto;
          padding: 64px 24px 120px;
        }
        .eyebrow {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #1A56FF;
          margin-bottom: 16px;
        }
        h1 {
          font-size: 40px;
          font-weight: 700;
          line-height: 1.1;
          color: #0a0a0a;
          margin-bottom: 12px;
          letter-spacing: -0.02em;
        }
        .meta {
          font-size: 14px;
          color: #999;
          margin-bottom: 56px;
        }
        .divider {
          width: 48px;
          height: 3px;
          background: #1A56FF;
          border-radius: 2px;
          margin-bottom: 56px;
        }

        /* ── Sections ── */
        section {
          margin-bottom: 52px;
        }
        h2 {
          font-size: 20px;
          font-weight: 600;
          color: #0a0a0a;
          margin-bottom: 16px;
          letter-spacing: -0.01em;
        }
        p {
          font-size: 16px;
          line-height: 1.75;
          color: #444;
          margin-bottom: 14px;
        }
        p:last-child { margin-bottom: 0; }
        ul {
          margin: 12px 0 14px 0;
          padding-left: 20px;
        }
        li {
          font-size: 16px;
          line-height: 1.75;
          color: #444;
          margin-bottom: 6px;
        }
        a {
          color: #1A56FF;
          text-decoration: none;
        }
        a:hover { text-decoration: underline; }

        /* ── Info box ── */
        .info-box {
          background: #f5f5f7;
          border-left: 3px solid #1A56FF;
          border-radius: 0 8px 8px 0;
          padding: 20px 24px;
          margin: 20px 0;
        }
        .info-box p {
          font-size: 15px;
          color: #555;
          margin: 0;
        }

        /* ── Footer ── */
        footer {
          border-top: 1px solid #e8e8e8;
          padding: 32px 24px;
          text-align: center;
        }
        .footer-inner {
          max-width: 760px;
          margin: 0 auto;
        }
        footer p {
          font-size: 13px;
          color: #aaa;
          margin: 0;
        }
      `}</style>

      <div className="page">
        <header>
          <div className="header-inner">
            <a href="https://arizn.co" className="logo">ARIZN<span>.</span></a>
            <a href="https://arizn.co" className="back-link">← Back to arizn.co</a>
          </div>
        </header>

        <main>
          <p className="eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="meta">Last updated: {LAST_UPDATED}</p>
          <div className="divider" />

          <section>
            <h2>1. Who We Are</h2>
            <p>
              ARIZN ("we", "us", or "our") provides AI-powered automation and business infrastructure
              services for local businesses, including HVAC companies, dental practices, auto repair
              shops, and similar service businesses. Our registered contact email is{' '}
              <a href="mailto:arita.saas@gmail.com">arita.saas@gmail.com</a>.
            </p>
            <p>
              This Privacy Policy explains how ARIZN collects, uses, stores, and protects personal
              information when businesses and their customers interact with our services, including
              our Instagram AI Receptionist and carousel content tools.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>Depending on how you interact with our services, we may collect:</p>
            <ul>
              <li><strong>Instagram user ID</strong> — the unique identifier assigned by Instagram to your account</li>
              <li><strong>Instagram username</strong> — your public handle (e.g., @yourbusiness), when available</li>
              <li><strong>Direct message content</strong> — text messages sent to a business account powered by ARIZN's AI Receptionist</li>
              <li><strong>Business information</strong> — name, industry, services, and operating hours provided by business clients</li>
              <li><strong>Lead and inquiry data</strong> — messages expressing interest in services, pricing, or scheduling</li>
              <li><strong>Conversation history</strong> — prior messages in a thread, used to maintain context across a conversation</li>
            </ul>
            <div className="info-box">
              <p>We do not collect passwords, financial data, government IDs, or any sensitive personal
              categories as defined under GDPR or CCPA.</p>
            </div>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use the information collected for the following purposes:</p>
            <ul>
              <li><strong>AI-powered responses</strong> — processing your messages through a large language model (Groq / Meta Llama) to generate relevant, helpful replies on behalf of a business</li>
              <li><strong>Lead tracking</strong> — identifying potential customers and notifying business owners of high-intent inquiries</li>
              <li><strong>Conversation continuity</strong> — storing message history so follow-up replies remain contextually accurate</li>
              <li><strong>Business automation</strong> — routing, tagging, and organizing inquiries to help local businesses respond faster</li>
              <li><strong>Service improvement</strong> — monitoring system performance and fixing issues with our AI responses</li>
            </ul>
            <p>
              We do <strong>not</strong> sell, rent, or share your personal information with third parties for
              their own marketing purposes.
            </p>
          </section>

          <section>
            <h2>4. Third-Party Services</h2>
            <p>ARIZN uses the following third-party services to operate:</p>
            <ul>
              <li><strong>Meta / Instagram Graph API</strong> — to receive and send Instagram Direct Messages</li>
              <li><strong>Groq (Meta Llama models)</strong> — to process and generate AI responses</li>
              <li><strong>Supabase</strong> — to store conversation history and lead records in a secure cloud database</li>
              <li><strong>Resend</strong> — to send email notifications to business owners about high-intent inquiries</li>
              <li><strong>Anthropic Claude</strong> — for content generation features (carousel slides)</li>
              <li><strong>Vercel</strong> — to host our webhook infrastructure</li>
            </ul>
            <p>
              Each third-party provider processes data under their own privacy policies and security
              standards. We only share the minimum data required for each service to function.
            </p>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>
              We retain personal data only as long as necessary to provide our services:
            </p>
            <ul>
              <li><strong>Conversation messages</strong> — retained for up to 12 months from the date of the interaction, then deleted</li>
              <li><strong>Lead records</strong> — retained for up to 24 months, or until a business client requests deletion</li>
              <li><strong>Temporarily uploaded media</strong> (carousel images) — deleted immediately after use, typically within minutes of upload</li>
              <li><strong>Business client data</strong> — retained for the duration of the business relationship plus 90 days</li>
            </ul>
            <p>
              Business clients may request deletion of all associated data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2>6. Your Rights</h2>
            <p>
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul>
              <li><strong>Access</strong> — request a copy of the data we hold about you</li>
              <li><strong>Correction</strong> — request that inaccurate data be corrected</li>
              <li><strong>Deletion</strong> — request that your personal data be deleted ("right to be forgotten")</li>
              <li><strong>Restriction</strong> — request that we limit how we process your data</li>
              <li><strong>Portability</strong> — request your data in a portable, machine-readable format</li>
              <li><strong>Objection</strong> — object to processing based on our legitimate interests</li>
            </ul>
            <p>
              To exercise any of these rights, email us at{' '}
              <a href="mailto:arita.saas@gmail.com">arita.saas@gmail.com</a>. We will respond within
              30 days. For deletion requests, we will confirm completion within 7 business days.
            </p>
          </section>

          <section>
            <h2>7. Instagram Platform Compliance</h2>
            <p>
              Our Instagram AI Receptionist operates through the{' '}
              <a href="https://developers.facebook.com/docs/instagram-platform" target="_blank" rel="noopener noreferrer">
                Meta Instagram Platform
              </a>
              . By interacting with an Instagram Business account powered by ARIZN, you acknowledge
              that your messages are processed by our AI systems. Business owners using ARIZN are
              responsible for disclosing to their customers that automated AI responses may be in use.
            </p>
            <p>
              ARIZN complies with Meta's Platform Terms and Developer Policies. We do not use Instagram
              data to build user profiles for advertising, train generalized AI models, or transfer
              data outside the scope described in this policy.
            </p>
          </section>

          <section>
            <h2>8. Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including
              encrypted data transmission (TLS/HTTPS), encrypted storage, access controls, and
              regular security reviews. However, no system is completely secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2>9. Children's Privacy</h2>
            <p>
              Our services are not directed at children under the age of 13. We do not knowingly
              collect personal data from children. If you believe a child has provided us with
              personal information, please contact us immediately and we will delete it.
            </p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the
              "Last updated" date at the top of this page. We encourage you to review this page
              periodically. Continued use of our services after any changes constitutes acceptance
              of the updated policy.
            </p>
          </section>

          <section>
            <h2>11. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or your
              personal data, please contact us:
            </p>
            <div className="info-box">
              <p>
                <strong>ARIZN</strong><br />
                Website: <a href="https://arizn.co">arizn.co</a><br />
                Email: <a href="mailto:arita.saas@gmail.com">arita.saas@gmail.com</a><br />
                Response time: within 30 days
              </p>
            </div>
          </section>
        </main>

        <footer>
          <div className="footer-inner">
            <p>© {new Date().getFullYear()} ARIZN. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
