"use client";

import { useEffect, useState } from "react";
import { formatPacificDateTime } from "@/lib/dates";
import type { PromoterAdminAction } from "@/lib/promoters/statusTransitions";
import type { PromoterStatus } from "@/lib/supabase/database.types";

type AdminPromoter = {
  id: string;
  promotionName: string;
  lastPromotionDate: string;
  promoterEmail: string;
  contactName: string;
  governmentIdFileName: string;
  websiteUrl: string | null;
  status: PromoterStatus;
  createdAt: string;
};

const actionLabels: Record<PromoterAdminAction, string> = {
  approve: "Approve",
  deny: "Deny",
  disable: "Disable",
  reactivate: "Re-activate"
};

export function AdminPromotersDashboard() {
  const [promoters, setPromoters] = useState<AdminPromoter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPromoterId, setBusyPromoterId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPromoters();
  }, []);

  const pendingPromoters = promoters.filter((promoter) => promoter.status === "pending");

  return (
    <main className="app-shell">
      <section className="wizard-body admin-page">
        <a className="button ghost" href="/">
          Back to application
        </a>
        <h1 className="step-title">Promoter Approvals</h1>
        <p className="step-help">Review promoter registrations and control which promotions appear for fighters.</p>
        {message ? (
          <div className="notice">
            <strong>Update:</strong> {message}
          </div>
        ) : null}
        {isLoading ? <div className="notice">Loading promoters...</div> : null}
        {!isLoading && pendingPromoters.length ? (
          <div className="notice">
            <strong>Pending review:</strong> {pendingPromoters.length} promoter{pendingPromoters.length === 1 ? "" : "s"} waiting.
          </div>
        ) : null}
        {!isLoading && !promoters.length ? <div className="notice">No promoter registrations found.</div> : null}
        <div className="admin-promoter-list">
          {promoters.map((promoter) => (
            <article className="review-block admin-promoter-card" key={promoter.id}>
              <div className="review-header">
                <h3>{promoter.promotionName}</h3>
                <span className={`status-pill status-${promoter.status}`}>{promoter.status}</span>
              </div>
              <div className="review-line">
                <span>Date of last promotion</span>
                <strong>{promoter.lastPromotionDate}</strong>
              </div>
              <div className="review-line">
                <span>Promoter name</span>
                <strong>{promoter.contactName}</strong>
              </div>
              <div className="review-line">
                <span>Email</span>
                <strong>{promoter.promoterEmail}</strong>
              </div>
              <div className="review-line">
                <span>Government ID file</span>
                <strong>{promoter.governmentIdFileName}</strong>
              </div>
              <div className="review-line">
                <span>Website/social</span>
                <strong>{promoter.websiteUrl || "Not provided"}</strong>
              </div>
              <div className="review-line">
                <span>Created</span>
                <strong>{formatDate(promoter.createdAt)}</strong>
              </div>
              <div className="admin-actions">
                {actionsForStatus(promoter.status).map((action) => (
                  <button
                    className={action === "deny" || action === "disable" ? "button secondary" : "button primary"}
                    key={action}
                    type="button"
                    disabled={busyPromoterId === promoter.id}
                    onClick={() => updatePromoterStatus(promoter.id, action)}
                  >
                    {busyPromoterId === promoter.id ? "Updating..." : actionLabels[action]}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );

  async function loadPromoters() {
    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/promoters");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load promoters.");
      setPromoters(result.promoters || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load promoters.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updatePromoterStatus(promoterId: string, action: PromoterAdminAction) {
    setBusyPromoterId(promoterId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/promoters/${promoterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update promoter.");
      setMessage("Promoter status updated.");
      await loadPromoters();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update promoter.");
    } finally {
      setBusyPromoterId("");
    }
  }
}

function actionsForStatus(status: PromoterStatus): PromoterAdminAction[] {
  if (status === "pending") return ["approve", "deny"];
  if (status === "active") return ["disable"];
  if (status === "disabled" || status === "denied") return ["reactivate"];
  return [];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatPacificDateTime(date);
}
