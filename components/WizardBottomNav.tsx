"use client";

export function WizardBottomNav({
  isBusy,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  onSubmit
}: {
  isBusy: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <nav className="wizard-bottom-nav" aria-label="Application step navigation">
      <button className="button secondary" type="button" onClick={onBack} disabled={isFirstStep || isBusy}>
        Back
      </button>
      {isLastStep ? (
        <button className="button primary" type="button" onClick={onSubmit} disabled={isBusy}>
          {isBusy ? "Working..." : "Submit Documents"}
        </button>
      ) : (
        <button className="button primary" type="button" onClick={onNext} disabled={isBusy}>
          Next
        </button>
      )}
    </nav>
  );
}
