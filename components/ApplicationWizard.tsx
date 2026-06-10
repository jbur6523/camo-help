"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  fullName,
  paymentTotal,
  uploadLabels,
  type ApplicationData,
  type UploadKey,
  type UploadedFiles
} from "@/lib/types";
import { createSubmissionReferenceId } from "@/lib/submission/referenceId";

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
  generate: "Submit Documents"
};

type GeneratedPdfs = {
  athleteBlob?: Blob;
  nationalBlob?: Blob;
  athleteUrl?: string;
  nationalUrl?: string;
  email: string;
};

type ConfigStatus = {
  betaMode: boolean;
  emailConfigured: boolean;
};

type SubmissionFailure = {
  kind: "failed" | "partial";
  submissionId: string;
  reason?: "large-upload" | "unexpected-response";
};

type SubmissionFileSummary = {
  field: string;
  filename: string;
  size: number;
};

type SubmitApplicationResponse = {
  ok?: boolean;
  submissionId?: string;
  failureKind?: "failed" | "partial";
  fighterConfirmationRecipient?: string;
  error?: string;
  deliveryState?: SubmissionDeliveryState;
};

type SubmissionDeliveryState = {
  completedStep?: string;
  applicationEmailSent?: boolean;
  medicalEmailSent?: boolean;
  fighterConfirmationEmailSent?: boolean;
  supportNotificationAttempted?: boolean;
};

const safeResponsePreviewLength = 180;
const maxSingleOutgoingFileBytes = 4 * 1024 * 1024;
const identityImageCompression: Record<Extract<UploadKey, "headshot" | "photoId">, { maxDimension: number; quality: number; filenamePrefix: string }> = {
  headshot: { maxDimension: 1200, quality: 0.82, filenamePrefix: "headshot-selfie" },
  photoId: { maxDimension: 1600, quality: 0.82, filenamePrefix: "driver-license-state-id" }
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
  const [finalEmailError, setFinalEmailError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [submittedSubmissionId, setSubmittedSubmissionId] = useState("");
  const [fighterConfirmationEmailSent, setFighterConfirmationEmailSent] = useState(false);
  const [pendingSubmissionId, setPendingSubmissionId] = useState("");
  const [submissionFailure, setSubmissionFailure] = useState<SubmissionFailure | null>(null);
  const submissionInFlightRef = useRef(false);

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

  if (submissionFailure) {
    return <SubmissionFailurePage failure={submissionFailure} />;
  }

  if (submitted && pdfs) {
    return (
      <SuccessPage
        athletePdfUrl={pdfs.athleteUrl}
        nationalPdfUrl={pdfs.nationalUrl}
        totalDue={paymentTotal(data.requirementsNeeded || defaultApplicationData.requirementsNeeded)}
        documentsOnly={documentsOnly}
        fighterEmail={submittedEmail || data.email}
        submissionId={submittedSubmissionId}
        fighterConfirmationEmailSent={fighterConfirmationEmailSent}
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
          </div>
          <div className="landing-actions">
            <button className="button primary" type="button" onClick={() => setStarted(true)}>
              Start Application
            </button>
            <a className="button promoter-registration-button" href="/promoter-registration">
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
            email={data.email}
            emailError={finalEmailError}
            onEmailChange={handleFinalEmailChange}
            onGenerate={confirmEmailAndGenerateForms}
            onSubmit={submitDocuments}
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
      />
    </main>
  );

  async function handleFilesAdd(key: UploadKey, files: File[], options?: { replace?: boolean }) {
    setGlobalError("");
    let preparedFiles: File[];
    try {
      preparedFiles = await prepareUploadFiles(key, files);
    } catch {
      fail("We could not prepare that image. Please try taking the photo again or upload a smaller screenshot instead.");
      return;
    }
    if (!preparedFiles.length) return;
    const oversizedFile = preparedFiles.find((file) => file.size > maxSingleOutgoingFileBytes);
    if (oversizedFile) {
      fail(fileTooLargeMessage(oversizedFile.name));
      return;
    }
    setUploadFiles((current) => {
      const nextFiles = options?.replace ? preparedFiles : [...(current[key] || []), ...preparedFiles];
      setValue(`uploads.${key}` as any, nextFiles.map((file) => file.name).join(", "), { shouldDirty: true });
      return { ...current, [key]: nextFiles };
    });
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
    if (currentStep === "review" && (values.requirementsNeeded || []).includes("bloodwork")) {
      requireFields.push("certifyBloodworkRequirements");
    }
    if (currentStep === "review" && (values.requirementsNeeded || []).includes("physical")) {
      requireFields.push("certifyPhysicalRequirements");
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
      if (!documentsOnly && !isValidHeightInches(values.heightInches)) return fail("Height inches must be between 0 and 12.");
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

  async function generatePdfs({ manageBusy = true, submissionId }: { manageBusy?: boolean; submissionId?: string } = {}) {
    if (manageBusy) setIsBusy(true);
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
        nationalUrl: nationalBlob ? URL.createObjectURL(nationalBlob) : undefined,
        email: values.email
      };
      setPdfs(generated);
      console.info("PDF generation completed.", {
        submissionId: submissionId || "not assigned",
        athletePdfGenerated: Boolean(athleteBlob),
        nationalIdPdfGenerated: Boolean(nationalBlob)
      });
      return generated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate PDFs.";
      console.error("PDF generation failed.", { submissionId: submissionId || "not assigned", error: message });
      if (submissionId) {
        await notifyClientSupportError({
          submissionId,
          errorType: "PDF Generation Failure",
          source: "components/ApplicationWizard.generatePdfs",
          message,
          operation: "Generate selected application PDFs",
          userShownOutcome: "failure",
          fighterName: fullName(form.getValues()),
          fighterEmail: form.getValues("email")
        });
      }
      setGlobalError("We were unable to generate your forms at this time.");
      return null;
    } finally {
      if (manageBusy) setIsBusy(false);
    }
  }

  async function submitDocuments() {
    if (submissionInFlightRef.current) {
      console.info("Submission ignored because one is already in progress.", { isBusy });
      return;
    }

    const submissionId = pendingSubmissionId || createSubmissionId();
    setPendingSubmissionId(submissionId);
    submissionInFlightRef.current = true;
    setIsBusy(true);
    setGlobalError("");
    console.info("Frontend submission started.", {
      submissionId,
      submitButtonDisabled: true
    });

    if (!(await validateStep("review"))) {
      console.info("Frontend submission stopped during review validation.", { submissionId });
      submissionInFlightRef.current = false;
      setIsBusy(false);
      setStep("review");
      return;
    }

    try {
      const finalEmail = form.getValues("email").trim();
      if (!isValidEmail(finalEmail)) {
        setFinalEmailError("Enter a valid email address.");
        setGlobalError("Confirm a valid email address and generate forms before submitting.");
        submissionInFlightRef.current = false;
        setIsBusy(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setFinalEmailError("");
      setValue("email", finalEmail, { shouldValidate: true, shouldDirty: true });

      const generated = pdfs?.email === finalEmail ? pdfs : null;
      if (!generated) {
        setSubmissionFailure({ kind: "failed", submissionId });
        return;
      }
      const values = form.getValues();
      const formData = new FormData();
      formData.append("submissionId", submissionId);
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

      const outgoingFiles = collectSubmissionFileSummaries(generated, uploadFiles);
      const sizeProblem = submissionSizeProblem(outgoingFiles);
      if (sizeProblem) {
        console.warn("Frontend submission blocked because outgoing files are too large.", {
          submissionId,
          fileCount: outgoingFiles.length,
          totalBytes: totalFileBytes(outgoingFiles)
        });
        setGlobalError(sizeProblem);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const response = await fetch("/api/submit-application", {
        method: "POST",
        body: formData
      });
      const parsedResponse = await readSubmitApplicationResponse(response);
      const result: SubmitApplicationResponse = parsedResponse.json || {};
      if (!response.ok) {
        const largeUploadRejection = isLargeUploadRejection(response.status, parsedResponse.text);
        if (!parsedResponse.json) {
          void notifyClientSupportError({
            submissionId,
            errorType: largeUploadRejection ? "Upload Request Too Large" : "Non-JSON Submission Response",
            source: "components/ApplicationWizard.submitDocuments",
            message: parsedResponse.text || `Non-JSON response returned with HTTP ${response.status}.`,
            operation: "Submit documents from browser",
            details: buildClientSubmissionErrorDetails({
              status: response.status,
              contentType: parsedResponse.contentType,
              responsePreview: parsedResponse.text,
              files: outgoingFiles,
              deliveryState: result.deliveryState
            }),
            userShownOutcome: "failure",
            fighterName: fullName(form.getValues()),
            fighterEmail: form.getValues("email")
          });
        }
        setSubmissionFailure({
          kind: result.failureKind === "partial" ? "partial" : "failed",
          submissionId: result.submissionId || submissionId,
          reason: largeUploadRejection ? "large-upload" : !parsedResponse.json ? "unexpected-response" : undefined
        });
        return;
      }
      if (!parsedResponse.json) {
        void notifyClientSupportError({
          submissionId,
          errorType: "Unexpected Submission Response",
          source: "components/ApplicationWizard.submitDocuments",
          message: parsedResponse.text || "Submission succeeded but returned a non-JSON response.",
          operation: "Read submit documents response",
          details: buildClientSubmissionErrorDetails({
            status: response.status,
            contentType: parsedResponse.contentType,
            responsePreview: parsedResponse.text,
            files: outgoingFiles,
            deliveryState: result.deliveryState
          }),
          userShownOutcome: "failure",
          fighterName: fullName(form.getValues()),
          fighterEmail: form.getValues("email")
        });
        setSubmissionFailure({ kind: "failed", submissionId, reason: "unexpected-response" });
        return;
      }
      window.localStorage.removeItem(storageKey);
      setSubmittedEmail(values.email);
      setSubmittedSubmissionId(result.submissionId || submissionId);
      setFighterConfirmationEmailSent(Boolean(result.fighterConfirmationRecipient));
      setSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed.";
      console.error("Frontend submission failed.", { submissionId, error: message });
      void notifyClientSupportError({
        submissionId,
        errorType: "Client Submission Failure",
        source: "components/ApplicationWizard.submitDocuments",
        message,
        operation: "Submit documents from browser",
        userShownOutcome: "failure",
        fighterName: fullName(form.getValues()),
        fighterEmail: form.getValues("email")
      });
      setSubmissionFailure({ kind: "failed", submissionId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      submissionInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  function handleFinalEmailChange(email: string) {
    setValue("email", email, { shouldValidate: true, shouldDirty: true });
    setFinalEmailError("");
    if (pdfs) {
      if (pdfs.athleteUrl) URL.revokeObjectURL(pdfs.athleteUrl);
      if (pdfs.nationalUrl) URL.revokeObjectURL(pdfs.nationalUrl);
      setPdfs(null);
    }
  }

  async function confirmEmailAndGenerateForms() {
    const email = form.getValues("email").trim();
    const submissionId = pendingSubmissionId || createSubmissionId();
    setPendingSubmissionId(submissionId);
    if (!isValidEmail(email)) {
      setFinalEmailError("Enter a valid email address.");
      setGlobalError("Enter a valid email address before generating forms.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setFinalEmailError("");
    setGlobalError("");
    setValue("email", email, { shouldValidate: true, shouldDirty: true });
    const generated = await generatePdfs({ submissionId });
    if (!generated) {
      setSubmissionFailure({ kind: "failed", submissionId });
    }
  }
}

function SubmissionFailurePage({ failure }: { failure: SubmissionFailure }) {
  const isPartial = failure.kind === "partial";
  const isLargeUpload = failure.reason === "large-upload";
  const isUnexpectedResponse = failure.reason === "unexpected-response";
  return (
    <main className="app-shell">
      <section className="wizard-body submission-failure-page">
        <div className="brand-mark">CA</div>
        <h1 className="step-title">{isPartial ? "Submission Incomplete" : "Submission Failed"}</h1>
        <div className="notice submission-failure-notice">
          {isLargeUpload ? (
            <>
              <p>One or more uploaded files may be too large to submit.</p>
              <p>Please reduce the file size, retake photos at a lower resolution, or upload smaller PDF/image files, then try again.</p>
            </>
          ) : isUnexpectedResponse ? (
            <>
              <p>The server rejected the submission before delivery could be confirmed.</p>
              <p>Please do not submit multiple times.</p>
              <p>Take a screenshot of this page and contact support@camo-help.com.</p>
            </>
          ) : isPartial ? (
            <>
              <p>Some of your documents may not have been delivered successfully.</p>
              <p>Please take a screenshot of this page and contact support@camo-help.com.</p>
            </>
          ) : (
            <>
              <p>We were unable to submit your documents at this time.</p>
              <p>Please do not submit multiple times.</p>
              <p>Take a screenshot of this page and contact support@camo-help.com.</p>
            </>
          )}
          <p>
            <strong>Reference ID: {failure.submissionId}</strong>
          </p>
        </div>
      </section>
    </main>
  );
}

function GenerateStep({
  pdfs,
  isBusy,
  email,
  emailError,
  onEmailChange,
  onGenerate,
  onSubmit,
  documentsOnly
}: {
  pdfs: GeneratedPdfs | null;
  isBusy: boolean;
  email: string;
  emailError: string;
  onEmailChange: (email: string) => void;
  onGenerate: () => Promise<void>;
  onSubmit: () => Promise<void>;
  documentsOnly: boolean;
}) {
  const hasCurrentGeneratedForms = Boolean(pdfs && pdfs.email === email.trim());

  return (
    <>
      <h2 className="step-title">Submit Documents</h2>
      <p className="step-help">
        {documentsOnly
          ? "Confirm your email, then submit your selected documents by email."
          : "Confirm your email, generate your completed forms, then submit your documents by email."}
      </p>
      <div className="field-grid">
        <section className="final-email-confirmation" aria-labelledby="confirm-email-heading">
          <h3 id="confirm-email-heading">Confirm Email</h3>
          <p>
            This email will be used for your submission confirmation and included as your contact email on your CAMO paperwork in case
            there are any issues with your application. Please make sure it is entered correctly.
          </p>
          <div className="field">
            <label htmlFor="final-email">Email Address</label>
            <input
              id="final-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => onEmailChange(event.currentTarget.value)}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "final-email-error" : undefined}
            />
            {emailError ? <div className="error" id="final-email-error">{emailError}</div> : null}
          </div>
        </section>
        {!hasCurrentGeneratedForms ? (
          <button className="button primary" type="button" onClick={onGenerate} disabled={isBusy}>
            {isBusy ? "Working..." : "Confirm Email & Generate Forms"}
          </button>
        ) : null}
        {hasCurrentGeneratedForms ? (
          <>
            {pdfs?.athleteUrl || pdfs?.nationalUrl ? (
              <div className="download-list">
                {pdfs.athleteUrl ? (
                  <a href={pdfs.athleteUrl} download="completed-athlete-license.pdf">
                    Download Athlete License PDF
                  </a>
                ) : null}
                {pdfs.nationalUrl ? (
                  <a href={pdfs.nationalUrl} download="completed-national-mma-id.pdf">
                    Download National MMA ID PDF
                  </a>
                ) : null}
              </div>
            ) : null}
            <button className="button primary submit-documents-button" type="button" onClick={onSubmit} disabled={isBusy}>
              {isBusy ? "Working..." : "Submit Documents"}
            </button>
          </>
        ) : null}
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

function isValidHeightInches(heightInches: string) {
  const value = Number(heightInches);
  return Number.isInteger(value) && value >= 0 && value <= 12;
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

async function prepareUploadFiles(key: UploadKey, files: File[]) {
  if (key !== "headshot" && key !== "photoId") return files;

  const config = identityImageCompression[key];
  return Promise.all(
    files.map(async (file) => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Identity uploads must be image files.");
      }
      try {
        return await compressIdentityImage(file, config);
      } catch {
        return file;
      }
    })
  );
}

async function compressIdentityImage(
  file: File,
  {
    maxDimension,
    quality,
    filenamePrefix
  }: {
    maxDimension: number;
    quality: number;
    filenamePrefix: string;
  }
) {
  const image = await loadImage(file);
  const { width, height } = fitWithinMaxDimension(image.naturalWidth, image.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image.");
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToJpegBlob(canvas, quality);
  URL.revokeObjectURL(image.src);
  return new File([blob], compressedIdentityFilename(file.name, filenamePrefix), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error("Could not read image."));
    };
    image.src = URL.createObjectURL(file);
  });
}

function fitWithinMaxDimension(width: number, height: number, maxDimension: number) {
  const longEdge = Math.max(width, height);
  if (!longEdge || longEdge <= maxDimension) return { width, height };
  const scale = maxDimension / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not compress image."));
      },
      "image/jpeg",
      quality
    );
  });
}

function compressedIdentityFilename(originalName: string, prefix: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${prefix}${baseName ? `-${baseName}` : ""}.jpg`;
}

function collectSubmissionFileSummaries(generated: GeneratedPdfs, uploadFiles: UploadedFiles): SubmissionFileSummary[] {
  const files: SubmissionFileSummary[] = [];
  if (generated.athleteBlob) {
    files.push({
      field: "Athlete License PDF",
      filename: "completed-athlete-license.pdf",
      size: generated.athleteBlob.size
    });
  }
  if (generated.nationalBlob) {
    files.push({
      field: "National MMA ID PDF",
      filename: "completed-national-mma-id.pdf",
      size: generated.nationalBlob.size
    });
  }
  (Object.entries(uploadFiles) as Array<[UploadKey, File[] | undefined]>).forEach(([key, uploadFilesForKey]) => {
    (uploadFilesForKey || []).forEach((file) => {
      files.push({
        field: uploadLabels[key],
        filename: file.name || key,
        size: file.size
      });
    });
  });
  return files;
}

function totalFileBytes(files: SubmissionFileSummary[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

function submissionSizeProblem(files: SubmissionFileSummary[]) {
  const oversizedFile = files.find((file) => file.size > maxSingleOutgoingFileBytes);
  if (oversizedFile) {
    return fileTooLargeMessage(oversizedFile.filename);
  }

  return "";
}

function fileTooLargeMessage(filename: string) {
  return [
    `This file is too large to submit: ${filename}.`,
    "Please upload a smaller image or PDF.",
    "If you are uploading a full-resolution phone photo, try taking a screenshot of the image/document and uploading the screenshot instead. Screenshots are usually much smaller and are often easier to submit.",
    "For lab results, physical forms, or document images, you can also try saving the document as a smaller PDF, retaking the photo closer to the document, or cropping out unnecessary background before uploading."
  ].join(" ");
}

async function readSubmitApplicationResponse(response: Response): Promise<{
  json: SubmitApplicationResponse | null;
  text: string;
  contentType: string;
}> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text().catch(() => "");
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return { json: JSON.parse(text) as SubmitApplicationResponse, text, contentType };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse JSON response.";
      return { json: null, text: text || message, contentType };
    }
  }

  return { json: null, text, contentType };
}

function isLargeUploadRejection(status: number, responseText: string) {
  const normalized = responseText.trim().toLowerCase();
  return status === 413 || normalized.startsWith("request entity too large") || normalized.startsWith("request body too large");
}

function buildClientSubmissionErrorDetails({
  status,
  contentType,
  responsePreview,
  files,
  deliveryState
}: {
  status?: number;
  contentType?: string;
  responsePreview?: string;
  files: SubmissionFileSummary[];
  deliveryState?: SubmissionDeliveryState;
}) {
  return [
    ...(typeof status === "number" ? [`HTTP status code: ${status}`] : []),
    `Content-Type response header: ${contentType || "Not available"}`,
    `Safe response preview: ${safeResponsePreview(responsePreview || "") || "Not available"}`,
    ...submissionDeliveryStateDetails(deliveryState),
    `Outgoing file count: ${files.length}`,
    `Outgoing total file size: ${formatBytes(totalFileBytes(files))} (${totalFileBytes(files)} bytes)`,
    ...files.map((file) => `${file.field}: ${file.filename} - ${formatBytes(file.size)} (${file.size} bytes)`)
  ];
}

function submissionDeliveryStateDetails(deliveryState?: SubmissionDeliveryState) {
  if (!deliveryState) {
    return [
      "Email step completed before failure: unknown",
      "CAMO application email sent: unknown",
      "CAMO medical email sent: unknown",
      "Fighter confirmation email sent: unknown",
      "Support notification email attempted: unknown"
    ];
  }

  return [
    `Email step completed before failure: ${deliveryState.completedStep || "unknown"}`,
    `CAMO application email sent: ${deliveryState.applicationEmailSent ? "yes" : "no"}`,
    `CAMO medical email sent: ${deliveryState.medicalEmailSent ? "yes" : "no"}`,
    `Fighter confirmation email sent: ${deliveryState.fighterConfirmationEmailSent ? "yes" : "no"}`,
    `Support notification email attempted: ${deliveryState.supportNotificationAttempted ? "yes" : "no"}`
  ];
}

function safeResponsePreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, safeResponsePreviewLength);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function createSubmissionId() {
  return createSubmissionReferenceId();
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

async function notifyClientSupportError({
  submissionId,
  errorType,
  source,
  message,
  operation,
  details,
  userShownOutcome,
  fighterName,
  fighterEmail
}: {
  submissionId: string;
  errorType: string;
  source: string;
  message: string;
  operation: string;
  details?: string[];
  userShownOutcome: "none" | "failure" | "partial";
  fighterName?: string;
  fighterEmail?: string;
}) {
  try {
    await fetch("/api/support-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        errorType,
        source,
        message,
        operation,
        details,
        userShownOutcome,
        fighterName,
        fighterEmail
      })
    });
  } catch {
    console.warn("Client support error notification failed.", { submissionId, source });
  }
}
