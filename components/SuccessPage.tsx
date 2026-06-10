"use client";

import { camoPaymentUrl } from "@/lib/camoPayment";

export function SuccessPage({
  athletePdfUrl,
  nationalPdfUrl,
  totalDue,
  documentsOnly = false,
  fighterEmail,
  submissionId,
  fighterConfirmationEmailSent
}: {
  athletePdfUrl?: string;
  nationalPdfUrl?: string;
  totalDue: number;
  documentsOnly?: boolean;
  fighterEmail: string;
  submissionId: string;
  fighterConfirmationEmailSent: boolean;
}) {
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
        <div className="notice confirmation-email-notice">
          {fighterConfirmationEmailSent ? (
            <p>
              A confirmation email was sent to:
              <br />
              <strong>{fighterEmail}</strong>
            </p>
          ) : (
            <>
              <p>Your documents were submitted to CAMO.</p>
              <p>We were unable to send your confirmation email. Please save this reference ID:</p>
            </>
          )}
          <p>
            Reference ID:
            <br />
            <strong>{submissionId}</strong>
          </p>
          {fighterConfirmationEmailSent ? (
            <p>If you do not receive it within a few minutes, check your spam folder or contact support@camo-help.com.</p>
          ) : null}
        </div>

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

        <div className="notice activation-warning">
          Your license will not be active until CAMO receives and approves all required documents and payment.
        </div>

        {totalDue > 0 ? (
          <p className="payment-action">
            <a className="button primary" href={camoPaymentUrl} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
              Pay CAMO Fees
            </a>
          </p>
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
      </section>
    </main>
  );
}
