"use client";

import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/components/FormBits";
import { bloodTestRequirements, physicalMdDoAcknowledgement } from "@/lib/medicalRequirements";
import { independentPromoterId, independentPromotionName } from "@/lib/promoters/constants";
import type { ApplicationData, UploadedFiles } from "@/lib/types";
import { fullName, paymentTotal, requirementLabels, requirementOptions, uploadLabels } from "@/lib/types";

type PromoterOption = {
  id: string;
  promotionName: string;
};

export function StepReview({
  form,
  uploadFiles,
  documentsOnly,
  onEdit
}: {
  form: UseFormReturn<ApplicationData>;
  uploadFiles: UploadedFiles;
  documentsOnly: boolean;
  onEdit: (step: "requirements" | "applicantInfo" | "applicationType" | "fighterHistory" | "commissionHistory" | "legal" | "uploads") => void;
}) {
  const { register, watch, formState, setValue, getValues } = form;
  const [promoters, setPromoters] = useState<PromoterOption[]>([]);
  const [promotersLoaded, setPromotersLoaded] = useState(false);
  const [promoterLoadError, setPromoterLoadError] = useState("");
  const data = watch();
  const requirementsNeeded = data.requirementsNeeded || [];
  const submittingNow = requirementOptions.filter((key) => requirementsNeeded.includes(key));
  const alreadyCompleted = requirementOptions.filter((key) => !requirementsNeeded.includes(key));
  const needsBloodworkAcknowledgement = requirementsNeeded.includes("bloodwork");
  const needsPhysicalAcknowledgement = requirementsNeeded.includes("physical");
  const selectedPromoterId = data.selectedPromoterId || independentPromoterId;
  const selectedPromotionName = data.selectedPromotionName || independentPromotionName;

  useEffect(() => {
    let active = true;
    fetch("/api/promoters")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load approved promotions."))))
      .then((result: { promoters?: PromoterOption[] }) => {
        if (!active) return;
        const activePromoters = result.promoters || [];
        setPromoters(activePromoters);
        setPromotersLoaded(true);
        const currentPromoterId = getValues("selectedPromoterId") || independentPromoterId;
        if (
          currentPromoterId !== independentPromoterId &&
          !activePromoters.some((promoter) => promoter.id === currentPromoterId)
        ) {
          setValue("selectedPromoterId", independentPromoterId, { shouldDirty: true });
          setValue("selectedPromotionName", independentPromotionName, { shouldDirty: true });
        }
      })
      .catch(() => {
        if (!active) return;
        setPromotersLoaded(true);
        setPromoterLoadError("Could not load approved promotions. You can continue as Not listed / Independent.");
      });
    return () => {
      active = false;
    };
  }, [getValues, setValue]);

  return (
    <>
      <h2 className="step-title">Review</h2>
      <p className="step-help">Check everything before the app generates PDFs and sends documents.</p>
      <div className="field-grid">
        <ReviewBlock title="Requirements needed" onEdit={() => onEdit("requirements")}>
          <ReviewLine label="Submitting now" value={submittingNow.map((key) => requirementLabels[key]).join(", ")} />
          <ReviewLine
            label="Marked already completed"
            value={alreadyCompleted.map((key) => requirementLabels[key]).join(", ") || "None"}
          />
        </ReviewBlock>

        <ReviewBlock title="Applicant info" onEdit={() => onEdit("applicantInfo")}>
          <ReviewLine label="Name" value={fullName(data)} />
          <ReviewLine label="Birth date" value={`${data.birthDate} (${data.age || "age unknown"})`} />
          <ReviewLine label="Contact" value={`${data.email} / ${data.phone}`} />
          {documentsOnly ? null : <ReviewLine label="Address" value={`${data.street}, ${data.city}, ${data.state} ${data.zip}, ${data.country}`} />}
          {documentsOnly ? null : <ReviewLine label="Height / weight" value={`${data.heightFeet}' ${data.heightInches}" / ${data.weight} lbs`} />}
        </ReviewBlock>

        {documentsOnly ? null : (
          <ReviewBlock title="Application types" onEdit={() => onEdit("applicationType")}>
            <ReviewLine label="Athlete License" value={data.athleteLicenseType} />
            <ReviewLine label="National MMA ID" value={data.nationalIdType} />
          </ReviewBlock>
        )}

        {documentsOnly ? null : (
          <ReviewBlock title="History" onEdit={() => onEdit("fighterHistory")}>
            <ReviewLine label="Other names" value={data.otherNames === "yes" ? data.otherNamesList : "No"} />
            <ReviewLine label="Disqualified" value={data.disqualified === "yes" ? data.disqualifiedExplanation : "No"} />
            <ReviewLine label="Medical license issue" value={data.medicalLicenseIssue === "yes" ? data.medicalLicenseExplanation : "No"} />
            <ReviewLine
              label="Amateur record"
              value={`${data.recordWins}-${data.recordLosses}-${data.recordDraws}, ${data.recordNoContests} NC`}
            />
            <ReviewLine label="Listed fights" value={String(data.fights.length)} />
          </ReviewBlock>
        )}

        {documentsOnly ? null : (
          <ReviewBlock title="Commission history" onEdit={() => onEdit("commissionHistory")}>
            <ReviewLine label="Prior licenses" value={data.licensedBefore === "yes" ? String(data.priorLicenses.length) : "No"} />
            <ReviewLine label="Discipline" value={data.commissionDiscipline === "yes" ? String(data.commissionActions.length) : "No"} />
            <ReviewLine
              label="Pending commission charges"
              value={data.pendingCommissionCharges === "yes" ? String(data.commissionCharges.length) : "No"}
            />
          </ReviewBlock>
        )}

        {documentsOnly ? null : (
          <ReviewBlock title="Criminal / legal" onEdit={() => onEdit("legal")}>
            <ReviewLine label="Convictions" value={data.convictedCrime === "yes" ? String(data.convictions.length) : "No"} />
            <ReviewLine label="Pending charges" value={data.pendingLawCharges === "yes" ? String(data.pendingLawChargesList.length) : "No"} />
          </ReviewBlock>
        )}

        <ReviewBlock title="Uploaded files" onEdit={() => onEdit("uploads")}>
          {(Object.keys(uploadLabels) as Array<keyof typeof uploadLabels>).map((key) => (
            <ReviewLine
              key={key}
              label={uploadLabels[key]}
              value={(uploadFiles[key] || []).map((file) => file.name).join(", ") || data.uploads[key] || "Not selected"}
            />
          ))}
        </ReviewBlock>

        <div className="fee-box">
          {requirementsNeeded.includes("athleteLicenseApplication") ? (
            <div className="fee-line">
              <span>Athlete License</span>
              <strong>$75</strong>
            </div>
          ) : null}
          {requirementsNeeded.includes("nationalMmaIdApplication") ? (
            <div className="fee-line">
              <span>National MMA ID</span>
              <strong>$20</strong>
            </div>
          ) : null}
          <div className="fee-line">
            <span>{documentsOnly ? "No application payment selected." : "Total"}</span>
            <strong>{documentsOnly ? "$0" : `$${paymentTotal(requirementsNeeded)}`}</strong>
          </div>
        </div>

        <div className="notice">
          <strong>Privacy notice:</strong> This app will send your application documents to the intended recipients. Do not submit
          unless you are ready to share documents for application processing. No record of documents or personal data is stored by
          camo-help.com.
        </div>

        <div className="review-block">
          {documentsOnly ? (
            <>
              <label className="checkbox-line">
                <input type="checkbox" {...register("certifyHelperOnly", { required: "Confirmation is required." })} />I confirm the
                selected documents are ready to submit.
              </label>
              {formState.errors.certifyHelperOnly ? <div className="error">Confirmation is required.</div> : null}
            </>
          ) : (
            <>
              <label className="checkbox-line">
                <input type="checkbox" {...register("certifyTrue", { required: "Certification is required." })} />I certify that the
                information I provided is true and correct.
              </label>
              <label className="checkbox-line">
                <input type="checkbox" {...register("certifyConsequences", { required: "Certification is required." })} />I understand
                that false, incomplete, or inaccurate information may result in denial or revocation.
              </label>
              <label className="checkbox-line">
                <input type="checkbox" {...register("certifyHelperOnly", { required: "Certification is required." })} />I understand
                this app helps prepare and send documents but does not replace CAMO's official review or approval process.
              </label>
              <label className="checkbox-line">
                <input type="checkbox" {...register("certifyPaymentSeparate", { required: "Certification is required." })} />I understand
                payment must be completed separately through CAMO.
              </label>
              {formState.errors.certifyTrue || formState.errors.certifyConsequences || formState.errors.certifyHelperOnly || formState.errors.certifyPaymentSeparate ? (
                <div className="error">All confirmations are required.</div>
              ) : null}
            </>
          )}
          {needsPhysicalAcknowledgement ? (
            <>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  {...register("certifyPhysicalRequirements", { required: "Physical acknowledgement is required." })}
                />
                <span>{physicalMdDoAcknowledgement}</span>
              </label>
              {formState.errors.certifyPhysicalRequirements ? (
                <div className="error">Physical acknowledgement is required.</div>
              ) : null}
            </>
          ) : null}
          {needsBloodworkAcknowledgement ? (
            <>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  {...register("certifyBloodworkRequirements", { required: "Blood work acknowledgement is required." })}
                />
                <span>
                  I acknowledge the blood test must include {bloodTestRequirements[0]}, {bloodTestRequirements[1]}, and{" "}
                  {bloodTestRequirements[2]} <strong>Surface Antigen</strong>.
                </span>
              </label>
              {formState.errors.certifyBloodworkRequirements ? (
                <div className="error">Blood work acknowledgement is required.</div>
              ) : null}
            </>
          ) : null}
        </div>

        {documentsOnly ? null : (
          <>
            <Field label="Typed legal name" name="signatureName" register={register} errors={formState.errors} required />
            <Field label="Signature date" name="signatureDate" register={register} errors={formState.errors} required type="date" />
          </>
        )}

        <section className="review-block">
          <div className="review-header">
            <h3>Select Promotion</h3>
          </div>
          <div className="field">
            <label htmlFor="selectedPromoterId">Please Select Promotion</label>
            <select id="selectedPromoterId" value={selectedPromoterId} onChange={handlePromoterChange}>
              <option value={independentPromoterId}>{independentPromotionName}</option>
              {promoters.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.promotionName}
                </option>
              ))}
            </select>
            {promotersLoaded && !promoters.length ? (
              <small>No approved promotions are listed yet. You can continue as Not listed / Independent.</small>
            ) : null}
            {promoterLoadError ? <div className="error">{promoterLoadError}</div> : null}
          </div>
          <ReviewLine label="Selected promotion" value={selectedPromotionName} />
        </section>
      </div>
    </>
  );

  function handlePromoterChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const promoterId = event.currentTarget.value;
    if (promoterId === independentPromoterId) {
      setValue("selectedPromoterId", independentPromoterId, { shouldDirty: true });
      setValue("selectedPromotionName", independentPromotionName, { shouldDirty: true });
      return;
    }
    const promoter = promoters.find((option) => option.id === promoterId);
    if (!promoter) return;
    setValue("selectedPromoterId", promoter.id, { shouldDirty: true });
    setValue("selectedPromotionName", promoter.promotionName, { shouldDirty: true });
  }
}

function ReviewBlock({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <section className="review-block">
      <div className="review-header">
        <h3>{title}</h3>
        <button className="button ghost" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-line">
      <span>{label}</span>
      <strong>{value || "Not provided"}</strong>
    </div>
  );
}
