"use client";

export function SuccessPage({
  athletePdfUrl,
  nationalPdfUrl,
  totalDue,
  documentsOnly = false
}: {
  athletePdfUrl?: string;
  nationalPdfUrl?: string;
  totalDue: number;
  documentsOnly?: boolean;
}) {
  const paymentUrl = process.env.NEXT_PUBLIC_CAMO_PAYMENT_URL;
  return (
    <main className="app-shell">
      <section className="wizard-body">
        <div className="brand-mark">CA</div>
        <h1 className="step-title">Documents Submitted</h1>
        <p className="step-help">
          {documentsOnly
            ? "Your selected documents have been submitted."
            : "Your application documents have been prepared and sent. The last step is to complete payment through CAMO."}
        </p>

        <div className="fee-box">
          {athletePdfUrl ? (
            <div className="fee-line">
              <span>Athlete License</span>
              <strong>$75</strong>
            </div>
          ) : null}
          {nationalPdfUrl ? (
            <div className="fee-line">
              <span>National MMA ID Card</span>
              <strong>$20</strong>
            </div>
          ) : null}
          <div className="fee-line">
            <span>{totalDue > 0 ? "Total" : "No application payment selected."}</span>
            <strong>${totalDue}</strong>
          </div>
        </div>

        {totalDue > 0 && paymentUrl ? (
          <p>
            <a className="button primary" href={paymentUrl} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
              Pay Now
            </a>
          </p>
        ) : totalDue > 0 ? (
          <div className="notice">
            <strong>Payment link has not been configured yet.</strong> Please add the official CAMO payment URL in the environment
            settings.
          </div>
        ) : (
          <div className="notice">
            <strong>No application payment selected.</strong>
          </div>
        )}

        <div className="download-list">
          {athletePdfUrl ? (
            <a href={athletePdfUrl} download="completed-athlete-license.pdf">
              Download Athlete License PDF
            </a>
          ) : null}
          {nationalPdfUrl ? (
            <a href={nationalPdfUrl} download="completed-national-mma-id.pdf">
              Download National MMA ID PDF
            </a>
          ) : null}
        </div>

        <div className="notice">
          Your license will not be active until CAMO receives and approves all required documents and payment.
        </div>
      </section>
    </main>
  );
}
