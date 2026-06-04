"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/components/FormBits";
import type { ApplicationData, UploadedFiles } from "@/lib/types";
import { fullName, uploadLabels } from "@/lib/types";

export function StepReview({
  form,
  uploadFiles,
  onEdit
}: {
  form: UseFormReturn<ApplicationData>;
  uploadFiles: UploadedFiles;
  onEdit: (step: number) => void;
}) {
  const { register, watch, formState } = form;
  const data = watch();
  return (
    <>
      <h2 className="step-title">Review</h2>
      <p className="step-help">Check everything before the app generates PDFs and sends documents.</p>
      <div className="field-grid">
        <ReviewBlock title="Applicant info" onEdit={() => onEdit(0)}>
          <ReviewLine label="Name" value={fullName(data)} />
          <ReviewLine label="Birth date" value={`${data.birthDate} (${data.age || "age unknown"})`} />
          <ReviewLine label="Contact" value={`${data.email} / ${data.phone}`} />
          <ReviewLine label="Address" value={`${data.street}, ${data.city}, ${data.state} ${data.zip}, ${data.country}`} />
          <ReviewLine label="Height / weight" value={`${data.heightFeet}' ${data.heightInches}" / ${data.weight} lbs`} />
        </ReviewBlock>

        <ReviewBlock title="Application types" onEdit={() => onEdit(1)}>
          <ReviewLine label="Athlete License" value={data.athleteLicenseType} />
          <ReviewLine label="National MMA ID" value={data.nationalIdType} />
        </ReviewBlock>

        <ReviewBlock title="History" onEdit={() => onEdit(2)}>
          <ReviewLine label="Other names" value={data.otherNames === "yes" ? data.otherNamesList : "No"} />
          <ReviewLine label="Disqualified" value={data.disqualified === "yes" ? data.disqualifiedExplanation : "No"} />
          <ReviewLine label="Medical license issue" value={data.medicalLicenseIssue === "yes" ? data.medicalLicenseExplanation : "No"} />
          <ReviewLine
            label="Amateur record"
            value={`${data.recordWins}-${data.recordLosses}-${data.recordDraws}, ${data.recordNoContests} NC`}
          />
          <ReviewLine label="Listed fights" value={String(data.fights.length)} />
        </ReviewBlock>

        <ReviewBlock title="Commission history" onEdit={() => onEdit(3)}>
          <ReviewLine label="Prior licenses" value={data.licensedBefore === "yes" ? String(data.priorLicenses.length) : "No"} />
          <ReviewLine label="Discipline" value={data.commissionDiscipline === "yes" ? String(data.commissionActions.length) : "No"} />
          <ReviewLine
            label="Pending commission charges"
            value={data.pendingCommissionCharges === "yes" ? String(data.commissionCharges.length) : "No"}
          />
        </ReviewBlock>

        <ReviewBlock title="Criminal / legal" onEdit={() => onEdit(4)}>
          <ReviewLine label="Convictions" value={data.convictedCrime === "yes" ? String(data.convictions.length) : "No"} />
          <ReviewLine label="Pending charges" value={data.pendingLawCharges === "yes" ? String(data.pendingLawChargesList.length) : "No"} />
        </ReviewBlock>

        <ReviewBlock title="Uploaded files" onEdit={() => onEdit(5)}>
          {(Object.keys(uploadLabels) as Array<keyof typeof uploadLabels>).map((key) => (
            <ReviewLine
              key={key}
              label={uploadLabels[key]}
              value={(uploadFiles[key] || []).map((file) => file.name).join(", ") || data.uploads[key] || "Not selected"}
            />
          ))}
        </ReviewBlock>

        <div className="fee-box">
          <div className="fee-line">
            <span>Athlete License</span>
            <strong>$75</strong>
          </div>
          <div className="fee-line">
            <span>National MMA ID</span>
            <strong>$20</strong>
          </div>
          <div className="fee-line">
            <span>Total</span>
            <strong>$95</strong>
          </div>
        </div>

        <div className="notice">
          <strong>Privacy notice:</strong> This app will send your application documents and uploaded medical/ID documents to the
          configured recipients. Do not submit unless you are ready to share these documents for application processing.
        </div>

        <div className="review-block">
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
        </div>

        <Field label="Typed legal name" name="signatureName" register={register} errors={formState.errors} required />
        <Field label="Signature date" name="signatureDate" register={register} errors={formState.errors} required type="date" />
      </div>
    </>
  );
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
