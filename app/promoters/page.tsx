import Link from "next/link";

export const metadata = {
  title: "Promoter Access | CAMO Fighter Application Helper"
};

export default function PromoterAccessPage() {
  return (
    <main className="app-shell">
      <section className="wizard-body promoter-access-page">
        <Link className="button ghost" href="/">
          Back to fighter application
        </Link>
        <div className="brand-mark">CA</div>
        <h1 className="step-title">Promoter Login / Registration</h1>
        <div className="promoter-access-options">
          <article className="review-block promoter-access-card">
            <h2>Existing promoter account?</h2>
            <p>Log in to access promoter tools.</p>
            <Link className="button primary" href="/promoters/login">
              Login
            </Link>
          </article>
          <article className="review-block promoter-access-card">
            <h2>New promoter?</h2>
            <p>Register for approval.</p>
            <Link className="button secondary" href="/promoter-registration">
              Register
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
