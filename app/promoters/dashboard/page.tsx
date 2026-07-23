import { redirect } from "next/navigation";
import { PromoterLogoutButton } from "@/components/PromoterLogoutButton";
import { getCurrentPromoter } from "@/lib/promoters/currentPromoter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Promoter Dashboard | CAMO Fighter Application Helper"
};

export default async function PromoterDashboardPage() {
  const currentPromoter = await getCurrentPromoter();

  if (!currentPromoter.authenticated) {
    redirect("/promoters/login");
  }

  if (currentPromoter.access === "pending") {
    return (
      <PromoterAccessMessage>
        <h1 className="step-title">Promoter access pending</h1>
        <div className="notice">
          <p>Your promoter registration is pending approval.</p>
          <p>You will be able to access promoter tools after your registration has been approved.</p>
        </div>
      </PromoterAccessMessage>
    );
  }

  if (currentPromoter.access !== "approved" || !currentPromoter.profile) {
    return (
      <PromoterAccessMessage>
        <h1 className="step-title">Promoter access unavailable</h1>
        <div className="notice">
          <p>Promoter access is not currently available for this account.</p>
          <p>Contact CAMO-Help support if you believe this is an error.</p>
        </div>
      </PromoterAccessMessage>
    );
  }

  const profile = currentPromoter.profile;
  return (
    <main className="app-shell promoter-dashboard-shell">
      <section className="wizard-body promoter-dashboard">
        <div className="dashboard-heading">
          <div>
            <div className="brand-mark">CA</div>
            <h1 className="step-title">Promoter Dashboard</h1>
          </div>
          <PromoterLogoutButton />
        </div>
        <section className="review-block promoter-profile" aria-label="Promoter profile">
          <div className="review-line">
            <span>Promotion name</span>
            <strong>{profile.promotionName}</strong>
          </div>
          <div className="review-line">
            <span>Promoter name</span>
            <strong>{profile.promoterName}</strong>
          </div>
          <div className="review-line">
            <span>Promoter email</span>
            <strong>{profile.promoterEmail}</strong>
          </div>
          <div className="review-line">
            <span>Approval status</span>
            <strong>Approved and active</strong>
          </div>
        </section>
        <div className="dashboard-card-grid">
          <DashboardCard
            title="Fighter CAMO Submissions"
            description="View an ongoing record of fighters who have submitted CAMO paperwork through CAMO-Help."
          />
          <DashboardCard
            title="Generate Bout Agreement"
            description="Create event-based CAMO bout agreements, send signing links, and track completion."
          />
        </div>
      </section>
    </main>
  );
}

function PromoterAccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <section className="wizard-body registration-page auth-page">
        {children}
        <PromoterLogoutButton />
      </section>
    </main>
  );
}

function DashboardCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="review-block dashboard-card">
      <span className="status-pill">Coming soon</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}
