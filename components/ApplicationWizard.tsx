"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { StepRequirementsNeeded } from "@/components/StepRequirementsNeeded";
import { StepApplicantInfo } from "@/components/StepApplicantInfo";
import { StepApplicationType } from "@/components/StepApplicationType";
import { StepFighterHistory } from "@/components/StepFighterHistory";
import { StepCommissionHistory } from "@/components/StepCommissionHistory";
import { StepLegalQuestions } from "@/components/StepLegalQuestions";
import { StepUploads } from "@/components/StepUploads";
import { StepReview } from "@/components/StepReview";
import { SuccessPage } from "@/components/SuccessPage";
import { WizardBottomNav } from "@/components/WizardBottomNav";
import { combatTrioPhoneDisplay, combatTrioPhoneHref } from "@/lib/medicalRequirements";
import { generateAthleteLicensePdf } from "@/lib/pdf/generateAthleteLicensePdf";
import { generateNationalIdPdf } from "@/lib/pdf/generateNationalIdPdf";
import { athleteLicenseTemplatePath, nationalIdTemplatePath } from "@/lib/pdf/pdfFieldNameMap";
import {
  calculateAge,
  defaultApplicationData,
  fightRecordTotal,
  formatBirthDateInput,
  paymentTotal,
  type ApplicationData,
  type UploadKey,
  type UploadedFiles
} from "@/lib/types";

const storageKey = "camo-help-application-v1";

type StepId =
  | "requirements"
  | "applicantInfo"
  | "applicationType"
  | "fighterHistory"
  | "commissionHistory"
  | "legal"
  | "uploads"
  | "review"
  | "generate";

const fullWorkflowSteps: StepId[] = [
  "requirements",
  "applicantInfo",
  "applicationType",
  "fighterHistory",
  "commissionHistory",
  "legal",
  "uploads",
  "review",
  "generate"
];

const documentsOnlySteps: StepId[] = ["requirements", "applicantInfo", "uploads", "review", "generate"];

const stepLabels: Record<StepId, string> = {
  requirements: "Requirements Needed",
  applicantInfo: "Applicant Info",
  applicationType: "Application Type",
  fighterHistory: "Fighter History",
  commissionHistory: "Prior Licenses",
  legal: "Legal",
  uploads: "Uploads",
  review: "Review",
  generate: "Generate PDFs"
};

type GeneratedPdfs = {
  athleteBlob?: Blob;
  nationalBlob?: Blob;
  athleteUrl?: string;
  nationalUrl?: string;
};

type ConfigStatus = {
  betaMode: boolean;
  paymentConfigured: boolean;
  emailConfigured: boolean;
};

export function ApplicationWizard() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<StepId>("requirements");
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
  const documentsOnly = isDocumentsOnly(data);
  const activeSteps = documentsOnly ? documentsOnlySteps : fullWorkflowSteps;
  const activeStepIndex = Math.max(activeSteps.indexOf(step), 0);

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
    const formattedBirthDate = formatBirthDateInput(data.birthDate);
    if (formattedBirthDate && formattedBirthDate !== data.birthDate) {
      setValue("birthDate", formattedBirthDate, { shouldValidate: true, shouldDirty: true });
      return;
    }
    const age = calculateAge(formattedBirthDate);
    if (age && age !== data.age) {
      setValue("age", age, { shouldValidate: true, shouldDirty: true });
    }
  }, [data.birthDate, data.age, setValue]);

  useEffect(() => {
    return () => {
      if (pdfs) {
        if (pdfs.athleteUrl) URL.revokeObjectURL(pdfs.athleteUrl);
        if (pdfs.nationalUrl) URL.revokeObjectURL(pdfs.nationalUrl);
      }
    };
  }, [pdfs]);

  const progress = useMemo(() => Math.round(((activeStepIndex + 1) / activeSteps.length) * 100), [activeStepIndex, activeSteps.length]);

  if (submitted && pdfs) {
    return (
      <SuccessPage
        athletePdfUrl={pdfs.athleteUrl}
        nationalPdfUrl={pdfs.nationalUrl}
        totalDue={paymentTotal(data.requirementsNeeded || defaultApplicationData.requirementsNeeded)}
        documentsOnly={documentsOnly}
      />
    );
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
            <div className="notice">
              <p>
                <strong>Need blood work?</strong> Call Request A Test and ask to book the Combat Trio Blood Test for your CAMO
                blood work.
              </p>
              <a className="notice-link" href={combatTrioPhoneHref}>
                Call Now To Book Your Blood Work - Combat Trio Blood Test: {combatTrioPhoneDisplay}
              </a>
            </div>
            <ul className="plain-list">
              <li>Fill out your information once.</li>
              <li>Upload your medicals, physical, headshot, and ID.</li>
              <li>Generate your completed PDFs.</li>
              <li>Submit documents and finish payment through CAMO.</li>
            </ul>
            {configStatus ? (
              <div className="config-strip" aria-label="Deployment configuration status">
                <span>{configStatus.emailConfigured ? "Email ready" : "Email not configured"}</span>
                <span>{configStatus.paymentConfigured ? "Payment link ready" : "Payment link pending"}</span>
              </div>
            ) : null}
          </div>
          <div className="landing-actions">
            <button className="button primary" type="button" onClick={() => setStarted(true)}>
              Start Application
            </button>
            <a className="button secondary" href="/promoter-registration">
              Promoter Registration
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="wizard-header">
        <div className="step-kicker">
          <span>Step {activeStepIndex + 1} of {activeSteps.length}</span>
          <span>{documentsOnly && step === "generate" ? "Submit" : stepLabels[step]}</span>
        </div>
        <div className="progress-track" aria-label="Application progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <form className="wizard-body" onFocusCapture={scrollFocusedFieldIntoView} onSubmit={(event) => event.preventDefault()}>
        {globalError ? <div className="notice" style={{ marginBottom: 16 }}><strong>Check this:</strong> {globalError}</div> : null}
        {step === "requirements" ? <StepRequirementsNeeded form={form} /> : null}
        {step === "applicantInfo" ? <StepApplicantInfo form={form} short={documentsOnly} /> : null}
        {step === "applicationType" ? <StepApplicationType form={form} /> : null}
        {step === "fighterHistory" ? <StepFighterHistory form={form} /> : null}
        {step === "commissionHistory" ? <StepCommissionHistory form={form} /> : null}
        {step === "legal" ? <StepLegalQuestions form={form} /> : null}
        {step === "uploads" ? (
          <StepUploads form={form} uploadFiles={uploadFiles} onFilesAdd={handleFilesAdd} onFileRemove={handleFileRemove} />
        ) : null}
        {step === "review" ? <StepReview form={form} uploadFiles={uploadFiles} documentsOnly={documentsOnly} onEdit={setStep} /> : null}
        {step === "generate" ? (
          <GenerateStep
            pdfs={pdfs}
            isBusy={isBusy}
            onGenerate={generatePdfs}
            onSubmit={submitDocuments}
            paymentConfigured={Boolean(process.env.NEXT_PUBLIC_CAMO_PAYMENT_URL)}
            documentsOnly={documentsOnly}
          />
        ) : null}
      </form>

      <WizardBottomNav
        isBusy={isBusy}
        isFirstStep={activeStepIndex === 0}
        isLastStep={activeStepIndex === activeSteps.length - 1}
        onBack={goBack}
        onNext={goNext}
        onSubmit={submitDocuments}
      />
    </main>
  );

  function handleFilesAdd(key: UploadKey, files: File[], options?: { replace?: boolean }) {
    setUploadFiles((current) => {
      const nextFiles = options?.replace ? files : [...(current[key] || []), ...files];
      setValue(`uploads.${key}` as any, nextFiles.map((file) => file.name).join(", "), { shouldDirty: true });
      return { ...current, [key]: nextFiles };
    });
    setGlobalError("");
  }

  function handleFileRemove(key: UploadKey, index: number) {
    setUploadFiles((current) => {
      const nextFiles = (current[key] || []).filter((_, fileIndex) => fileIndex !== index);
      setValue(`uploads.${key}` as any, nextFiles.map((file) => file.name).join(", "), { shouldDirty: true });
      return { ...current, [key]: nextFiles };
    });
    setGlobalError("");
  }

  async function goNext() {
    const valid = await validateStep(step);
    if (!valid) return;
    setGlobalError("");
    setStep(activeSteps[Math.min(activeStepIndex + 1, activeSteps.length - 1)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setGlobalError("");
    setStep(activeSteps[Math.max(activeStepIndex - 1, 0)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function validateStep(currentStep: StepId) {
    const values = form.getValues();
    const requireFields: Array<keyof ApplicationData> =
      currentStep === "requirements"
        ? ["requirementsNeeded"]
        : currentStep === "applicantInfo"
          ? documentsOnly
            ? ["firstName", "lastName", "birthDate", "phone", "email"]
            : [
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
        : currentStep === "applicationType"
          ? ["athleteLicenseType", "nationalIdType"]
        : currentStep === "review"
          ? documentsOnly
            ? ["certifyHelperOnly"]
            : [
                "certifyTrue",
                "certifyConsequences",
                "certifyHelperOnly",
                "certifyPaymentSeparate",
                "signatureName",
                "signatureDate"
              ]
          : [];
    const needsMedicalAcknowledgement =
      currentStep === "review" &&
      ((values.requirementsNeeded || []).includes("bloodwork") || (values.requirementsNeeded || []).includes("physical"));
    if (needsMedicalAcknowledgement) {
      requireFields.push("certifyMedicalRequirements");
    }

    if (requireFields.length && !(await form.trigger(requireFields))) {
      setGlobalError("Please complete the required fields before continuing.");
      return false;
    }

    if (currentStep === "requirements") {
      if (!(values.requirementsNeeded || []).length) return fail("Select at least one item to submit now.");
    }

    if (currentStep === "applicantInfo") {
      if (!calculateAge(values.birthDate)) return fail("Enter a real birth date as MM/DD/YYYY.");
      if (!documentsOnly && !isValidAge(values.age)) return fail("Enter a valid age.");
      if (!/^\S+@\S+\.\S+$/.test(values.email)) return fail("Enter a valid email address.");
      if (!documentsOnly && /p\.?\s*o\.?\s*box/i.test(values.street)) return fail("Street address cannot be a PO Box.");
      if (!documentsOnly && !/^\d{4}$/.test(values.ssnLast4)) return fail("Enter exactly the last 4 digits of SSN.");
    }

    if (currentStep === "fighterHistory") {
      if (values.otherNames === "yes" && !values.otherNamesList.trim()) return fail("List the other name(s) used.");
      if (values.disqualified === "yes" && !values.disqualifiedExplanation.trim()) return fail("Explain the disqualification.");
      if (values.medicalLicenseIssue === "yes" && !values.medicalLicenseExplanation.trim()) return fail("Explain the medical license issue.");
      const requiredFightCount = fightRecordTotal(values);
      const requiredFightFields = Array.from({ length: requiredFightCount }).flatMap((_, index) => [
        `fights.${index}.promoter`,
        `fights.${index}.state`,
        `fights.${index}.date`,
        `fights.${index}.opponent`,
        `fights.${index}.outcome`
      ]);
      if (requiredFightFields.length && !(await form.trigger(requiredFightFields as never[]))) {
        return fail("Complete the missing fight details before continuing.");
      }
      if (
        requiredFightCount > 0 &&
        (values.fights.length < requiredFightCount || hasMissing(values.fights.slice(0, requiredFightCount)))
      ) {
        return fail("List complete verifiable amateur event details for your non-zero record.");
      }
    }

    if (currentStep === "commissionHistory") {
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

    if (currentStep === "legal") {
      if (values.convictedCrime === "yes" && (!values.convictions.length || hasMissing(values.convictions))) {
        return fail("Add complete conviction entries.");
      }
      if (values.pendingLawCharges === "yes" && (!values.pendingLawChargesList.length || hasMissing(values.pendingLawChargesList))) {
        return fail("Add complete pending charge entries.");
      }
    }

    if (currentStep === "uploads") {
      const uploadRequirements: Array<Extract<UploadKey, "bloodwork" | "physical" | "headshot" | "photoId">> = [
        "bloodwork",
        "physical",
        "headshot",
        "photoId"
      ];
      const requirementsNeeded = values.requirementsNeeded || defaultApplicationData.requirementsNeeded;
      const requiredUploads: UploadKey[] = uploadRequirements.filter((key) =>
        requirementsNeeded.includes(key)
      );
      const missing = requiredUploads.filter((key) => !(uploadFiles[key] || []).length);
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
      const values = form.getValues();
      const requirementsNeeded = values.requirementsNeeded || defaultApplicationData.requirementsNeeded;
      const needsAthleteLicense = requirementsNeeded.includes("athleteLicenseApplication");
      const needsNationalId = requirementsNeeded.includes("nationalMmaIdApplication");
      const [athleteBytes, nationalBytes] = await Promise.all([
        needsAthleteLicense
          ? fetch(athleteLicenseTemplatePath)
              .then((response) => response.arrayBuffer())
              .then((template) => generateAthleteLicensePdf(template, values))
          : Promise.resolve(undefined),
        needsNationalId
          ? fetch(nationalIdTemplatePath)
              .then((response) => response.arrayBuffer())
              .then((template) => generateNationalIdPdf(template, values))
          : Promise.resolve(undefined)
      ]);
      if (pdfs) {
        if (pdfs.athleteUrl) URL.revokeObjectURL(pdfs.athleteUrl);
        if (pdfs.nationalUrl) URL.revokeObjectURL(pdfs.nationalUrl);
      }
      const athleteBlob = athleteBytes ? new Blob([toArrayBuffer(athleteBytes)], { type: "application/pdf" }) : undefined;
      const nationalBlob = nationalBytes ? new Blob([toArrayBuffer(nationalBytes)], { type: "application/pdf" }) : undefined;
      const generated = {
        athleteBlob,
        nationalBlob,
        athleteUrl: athleteBlob ? URL.createObjectURL(athleteBlob) : undefined,
        nationalUrl: nationalBlob ? URL.createObjectURL(nationalBlob) : undefined
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
    if (!(await validateStep("review"))) {
      setStep("review");
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
      if (generated.athleteBlob) {
        formData.append("athletePdf", new File([generated.athleteBlob], "completed-athlete-license.pdf", { type: "application/pdf" }));
      }
      if (generated.nationalBlob) {
        formData.append("nationalIdPdf", new File([generated.nationalBlob], "completed-national-mma-id.pdf", { type: "application/pdf" }));
      }
      (Object.entries(uploadFiles) as Array<[UploadKey, File[] | undefined]>).forEach(([key, files]) => {
        (files || []).forEach((file) => formData.append(key, file));
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
  paymentConfigured,
  documentsOnly
}: {
  pdfs: GeneratedPdfs | null;
  isBusy: boolean;
  onGenerate: () => Promise<GeneratedPdfs | null>;
  onSubmit: () => Promise<void>;
  paymentConfigured: boolean;
  documentsOnly: boolean;
}) {
  return (
    <>
      <h2 className="step-title">{documentsOnly ? "Submit Documents" : "Generate PDFs"}</h2>
      <p className="step-help">
        {documentsOnly
          ? "Send the selected documents to CAMO."
          : "Create the completed CAMO PDFs, preview or download them, then submit documents by email."}
      </p>
      <div className="field-grid">
        {documentsOnly ? null : (
          <button className="button primary" type="button" onClick={onGenerate} disabled={isBusy}>
            {isBusy ? "Generating..." : "Generate Completed PDFs"}
          </button>
        )}
        {pdfs ? (
          <div className="download-list">
            {pdfs.athleteUrl ? (
              <>
                <a href={pdfs.athleteUrl} target="_blank" rel="noreferrer">
                  Preview Athlete License PDF
                </a>
                <a href={pdfs.athleteUrl} download="completed-athlete-license.pdf">
                  Download Athlete License PDF
                </a>
              </>
            ) : null}
            {pdfs.nationalUrl ? (
              <>
                <a href={pdfs.nationalUrl} target="_blank" rel="noreferrer">
                  Preview National MMA ID PDF
                </a>
                <a href={pdfs.nationalUrl} download="completed-national-mma-id.pdf">
                  Download National MMA ID PDF
                </a>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="notice">
          {documentsOnly
            ? "Selected documents will be sent to the configured beta or production recipients."
            : "Emails will be sent to the configured beta or production recipients. Payment is not collected in this app."}
        </div>
        {!documentsOnly && !paymentConfigured ? (
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

function isValidAge(age: string) {
  const value = Number(age);
  return Number.isInteger(value) && value >= 0 && value < 120;
}

function isDocumentsOnly(data: Pick<ApplicationData, "requirementsNeeded">) {
  const requirementsNeeded = data.requirementsNeeded || defaultApplicationData.requirementsNeeded;
  return !requirementsNeeded.includes("athleteLicenseApplication") && !requirementsNeeded.includes("nationalMmaIdApplication");
}

function scrollFocusedFieldIntoView(event: React.FocusEvent<HTMLFormElement>) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  window.setTimeout(() => {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 260);
}
