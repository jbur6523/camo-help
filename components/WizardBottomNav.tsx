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
  const nextLabel = isBusy ? "Working..." : "Next";

  return (
    <nav className="wizard-bottom-nav" aria-label="Application step navigation">
      <div className="wizard-bottom-nav-row">
        <button className="button secondary" type="button" onClick={onBack} disabled={isFirstStep || isBusy}>
          Back
        </button>
        <button
          className="button primary"
          type="button"
          onClick={isLastStep ? onSubmit : onNext}
          disabled={isBusy}
        >
          {nextLabel}
        </button>
      </div>
    </nav>
  );
}
