"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { StepApplicantInfo } from "@/components/StepApplicantInfo";
import { StepApplicationType } from "@/components/StepApplicationType";
import { StepFighterHistory } from "@/components/StepFighterHistory";
import { StepCommissionHistory } from "@/components/StepCommissionHistory";
import { StepLegalQuestions } from "@/components/StepLegalQuestions";
import { StepUploads } from "@/components/StepUploads";
import { StepReview } from "@/components/StepReview";
import { SuccessPage } from "@/components/SuccessPage";
import { generateAthleteLicensePdf } from "@/lib/pdf/generateAthleteLicensePdf";
import { generateNationalIdPdf } from "@/lib/pdf/generateNationalIdPdf";
import { athleteLicenseFieldMap, nationalIdFieldMap } from "@/lib/pdf/pdfFieldMap";
import {
  calculateAge,
  defaultApplicationData,
  fightRecordTotal,
  fullName,
  type ApplicationData,
  type UploadKey,
  type UploadedFiles
} from "@/lib/types";

const storageKey = "camo-help-application-v1";

const steps = [
  "Applicant Info",
  "Application Type",
  "Fighter History",
  "Prior Licenses",
  "Legal",
  "Uploads",
  "Review",
  "Generate PDFs"
];

type GeneratedPdfs = {
  athleteBlob: Blob;
  nationalBlob: Blob;
  athleteUrl: string;
  nationalUrl: string;
};

type ConfigStatus = {
  betaMode: boolean;
  paymentConfigured: boolean;
  emailConfigured: boolean;
};

export function ApplicationWizard() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<UploadedFiles>({});
  const [globalError, setGlobalError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [pdfs, setPdfs] = useState<GeneratedPdfs | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);

  const form = useForm<ApplicationData>({
    mode: "onBlur",
    defaultValues: defaultApplicationData
  });

  const { watch, setValue, reset } = form;
  const data = watch();

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      reset({ ...defaultApplicationData, ...JSON.parse(saved) });
    }
  }, [reset]);

  useEffect(() => {
    fetch("/api/config-status")
      .then((response) => (response.ok ? response.json() : null))
      .then((status: ConfigStatus | null) => setConfigStatus(status))
      .catch(() => setConfigStatus(null));
  }, []);

  useEffect(() => {
    const subscription = watch((value) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  useEffect(() => {
    const age = calculateAge(data.birthDate);
    if (age && age !== data.age) {
      setValue("age", age, { shouldValidate: true, shouldDirty: true });
    }
  }, [data.birthDate, data.age, setValue]);

  useEffect(() => {
    return () => {
      if (pdfs) {
        URL.revokeObjectURL(pdfs.athleteUrl);
        URL.revokeObjectURL(pdfs.nationalUrl);
      }
    };
  }, [pdfs]);

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  if (submitted && pdfs) {
    return <SuccessPage athletePdfUrl={pdfs.athleteUrl} nationalPdfUrl={pdfs.nationalUrl} />;
  }

  if (!started) {
    return (
      <main className="app-shell">
        <section className="landing">
          <div>
            <div className="brand-mark">CA</div>
            {configStatus?.betaMode ? <div className="beta-pill">Beta Mode</div> : null}
            <h1>CAMO Fighter Application Helper</h1>
            <p>Complete your Athlete License and National MMA ID paperwork from your phone.</p>
            <ul className="plain-list">
              <li>Fill out your information once.</li>
              <li>Upload your medicals, physical, headshot, and ID.</li>
              <li>Generate your completed PDFs.</li>
              <li>Submit documents and finish payment through CAMO.</li>
            </ul>
            <div className="notice">
              This app never asks for your CAMO username or password and does not attempt automated CAMO login.
            </div>
            {configStatus ? (
              <div className="config-strip" aria-label="Deployment configuration status">
                <span>{configStatus.emailConfigured ? "Email ready" : "Email not configured"}</span>
                <span>{configStatus.paymentConfigured ? "Payment link ready" : "Payment link pending"}</span>
              </div>
            ) : null}
          </div>
          <button className="button primary" type="button" onClick={() => setStarted(true)}>
            Start Application
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="wizard-header">
        <div className="step-kicker">
          <span>Step {step + 1} of {steps.length}</span>
          <span>{steps[step]}</span>
        </div>
        <div className="progress-track" aria-label="Application progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <form className="wizard-body" onSubmit={(event) => event.preventDefault()}>
        {globalError ? <div className="notice" style={{ marginBottom: 16 }}><strong>Check this:</strong> {globalError}</div> : null}
        {step === 0 ? <StepApplicantInfo form={form} /> : null}
        {step === 1 ? <StepApplicationType form={form} /> : null}
        {step === 2 ? <StepFighterHistory form={form} /> : null}
        {step === 3 ? <StepCommissionHistory form={form} /> : null}
        {step === 4 ? <StepLegalQuestions form={form} /> : null}
        {step === 5 ? <StepUploads form={form} uploadFiles={uploadFiles} onFileChange={handleFileChange} /> : null}
        {step === 6 ? <StepReview form={form} uploadFiles={uploadFiles} onEdit={setStep} /> : null}
        {step === 7 ? (
          <GenerateStep
            pdfs={pdfs}
            isBusy={isBusy}
            onGenerate={generatePdfs}
            onSubmit={submitDocuments}
            paymentConfigured={Boolean(process.env.NEXT_PUBLIC_CAMO_PAYMENT_URL)}
          />
        ) : null}
      </form>

      <div className="sticky-actions">
        <button className="button secondary" type="button" onClick={goBack} disabled={step === 0 || isBusy}>
          Back
        </button>
        {step < steps.length - 1 ? (
          <button className="button primary" type="button" onClick={goNext} disabled={isBusy}>
            Next
          </button>
        ) : (
          <button className="button primary" type="button" onClick={submitDocuments} disabled={isBusy}>
            {isBusy ? "Working..." : "Submit Documents"}
          </button>
        )}
      </div>
    </main>
  );

  function handleFileChange(key: UploadKey, file?: File) {
    setUploadFiles((current) => ({ ...current, [key]: file }));
    setValue(`uploads.${key}` as any, file?.name || "", { shouldDirty: true });
    setGlobalError("");
  }

  async function goNext() {
    const valid = await validateStep(step);
    if (!valid) return;
    setGlobalError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setGlobalError("");
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function validateStep(currentStep: number) {
    const values = form.getValues();
    const requireFields: Array<keyof ApplicationData> =
      currentStep === 0
        ? [
            "firstName",
            "lastName",
            "birthDate",
            "age",
            "sex",
            "phone",
            "email",
            "street",
            "city",
            "state",
            "zip",
            "country",
            "ssnLast4",
            "heightFeet",
            "heightInches",
            "weight"
          ]
        : currentStep === 1
          ? ["athleteLicenseType", "nationalIdType"]
          : currentStep === 6
            ? [
                "certifyTrue",
                "certifyConsequences",
                "certifyHelperOnly",
                "certifyPaymentSeparate",
                "signatureName",
                "signatureDate"
              ]
            : [];

    if (requireFields.length && !(await form.trigger(requireFields))) {
      setGlobalError("Please complete the required fields before continuing.");
      return false;
    }

    if (currentStep === 0) {
      if (!calculateAge(values.birthDate)) return fail("Enter birth date as MM/DD/YYYY.");
      if (!/^\S+@\S+\.\S+$/.test(values.email)) return fail("Enter a valid email address.");
      if (/p\.?\s*o\.?\s*box/i.test(values.street)) return fail("Street address cannot be a PO Box.");
      if (!/^\d{4}$/.test(values.ssnLast4)) return fail("Enter exactly the last 4 digits of SSN.");
    }

    if (currentStep === 2) {
      if (values.otherNames === "yes" && !values.otherNamesList.trim()) return fail("List the other name(s) used.");
      if (values.disqualified === "yes" && !values.disqualifiedExplanation.trim()) return fail("Explain the disqualification.");
      if (values.medicalLicenseIssue === "yes" && !values.medicalLicenseExplanation.trim()) return fail("Explain the medical license issue.");
      if (fightRecordTotal(values) > 0 && (!values.fights.length || hasMissing(values.fights))) {
        return fail("List complete verifiable amateur event details for your non-zero record.");
      }
    }

    if (currentStep === 3) {
      if (values.licensedBefore === "yes" && (!values.priorLicenses.length || hasMissing(values.priorLicenses))) {
        return fail("Add complete prior license entries.");
      }
      if (values.commissionDiscipline === "yes" && (!values.commissionActions.length || hasMissing(values.commissionActions))) {
        return fail("Add complete commission action entries.");
      }
      if (values.pendingCommissionCharges === "yes" && (!values.commissionCharges.length || hasMissing(values.commissionCharges))) {
        return fail("Add complete pending commission charge entries.");
      }
    }

    if (currentStep === 4) {
      if (values.convictedCrime === "yes" && (!values.convictions.length || hasMissing(values.convictions))) {
        return fail("Add complete conviction entries.");
      }
      if (values.pendingLawCharges === "yes" && (!values.pendingLawChargesList.length || hasMissing(values.pendingLawChargesList))) {
        return fail("Add complete pending charge entries.");
      }
    }

    if (currentStep === 5) {
      const requiredUploads: UploadKey[] = Number(values.age || 0) >= 40
        ? ["bloodwork", "physical", "headshot", "photoId", "cardio"]
        : ["bloodwork", "physical", "headshot", "photoId"];
      const missing = requiredUploads.filter((key) => !uploadFiles[key]);
      if (missing.length) return fail(`Missing required upload: ${missing.join(", ")}.`);
    }

    return true;
  }

  function fail(message: string) {
    setGlobalError(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return false;
  }

  async function generatePdfs() {
    setIsBusy(true);
    setGlobalError("");
    try {
      const [athleteTemplate, nationalTemplate] = await Promise.all([
        fetch(athleteLicenseFieldMap.templatePath).then((response) => response.arrayBuffer()),
        fetch(nationalIdFieldMap.templatePath).then((response) => response.arrayBuffer())
      ]);
      const values = form.getValues();
      const [athleteBytes, nationalBytes] = await Promise.all([
        generateAthleteLicensePdf(athleteTemplate, values),
        generateNationalIdPdf(nationalTemplate, values)
      ]);
      if (pdfs) {
        URL.revokeObjectURL(pdfs.athleteUrl);
        URL.revokeObjectURL(pdfs.nationalUrl);
      }
      const athleteBlob = new Blob([toArrayBuffer(athleteBytes)], { type: "application/pdf" });
      const nationalBlob = new Blob([toArrayBuffer(nationalBytes)], { type: "application/pdf" });
      const generated = {
        athleteBlob,
        nationalBlob,
        athleteUrl: URL.createObjectURL(athleteBlob),
        nationalUrl: URL.createObjectURL(nationalBlob)
      };
      setPdfs(generated);
      return generated;
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not generate PDFs.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function submitDocuments() {
    if (!(await validateStep(6))) {
      setStep(6);
      return;
    }

    setIsBusy(true);
    setGlobalError("");
    try {
      const generated = pdfs || (await generatePdfs());
      if (!generated) throw new Error("Generate the PDFs before submitting.");
      const values = form.getValues();
      const formData = new FormData();
      formData.append("application", JSON.stringify(values));
      formData.append("athletePdf", new File([generated.athleteBlob], "completed-athlete-license.pdf", { type: "application/pdf" }));
      formData.append("nationalIdPdf", new File([generated.nationalBlob], "completed-national-mma-id.pdf", { type: "application/pdf" }));
      (Object.entries(uploadFiles) as Array<[UploadKey, File | undefined]>).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });

      const response = await fetch("/api/submit-application", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Submission failed.");
      window.localStorage.removeItem(storageKey);
      setSubmitted(true);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Submission failed.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsBusy(false);
    }
  }
}

function GenerateStep({
  pdfs,
  isBusy,
  onGenerate,
  onSubmit,
  paymentConfigured
}: {
  pdfs: GeneratedPdfs | null;
  isBusy: boolean;
  onGenerate: () => Promise<GeneratedPdfs | null>;
  onSubmit: () => Promise<void>;
  paymentConfigured: boolean;
}) {
  return (
    <>
      <h2 className="step-title">Generate PDFs</h2>
      <p className="step-help">Create the completed CAMO PDFs, preview or download them, then submit documents by email.</p>
      <div className="field-grid">
        <button className="button primary" type="button" onClick={onGenerate} disabled={isBusy}>
          {isBusy ? "Generating..." : "Generate Completed PDFs"}
        </button>
        {pdfs ? (
          <div className="download-list">
            <a href={pdfs.athleteUrl} target="_blank" rel="noreferrer">
              Preview Athlete License PDF
            </a>
            <a href={pdfs.athleteUrl} download="completed-athlete-license.pdf">
              Download Athlete License PDF
            </a>
            <a href={pdfs.nationalUrl} target="_blank" rel="noreferrer">
              Preview National MMA ID PDF
            </a>
            <a href={pdfs.nationalUrl} download="completed-national-mma-id.pdf">
              Download National MMA ID PDF
            </a>
          </div>
        ) : null}
        <div className="notice">
          Emails will be sent to the configured beta or production recipients. Payment is not collected in this app.
        </div>
        {!paymentConfigured ? (
          <div className="notice">
            <strong>Payment link has not been configured yet.</strong> Add the official CAMO payment URL as
            NEXT_PUBLIC_CAMO_PAYMENT_URL before using the Pay Now button in production.
          </div>
        ) : null}
        <button className="button primary" type="button" onClick={onSubmit} disabled={isBusy}>
          {isBusy ? "Submitting..." : "Submit Documents"}
        </button>
      </div>
    </>
  );
}

function hasMissing(entries: Array<Record<string, unknown>>) {
  return entries.some((entry) => Object.values(entry).some((value) => !String(value || "").trim()));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
