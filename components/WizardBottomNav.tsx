"use client";

export function WizardBottomNav({
  isBusy,
  isFirstStep,
  isLastStep,
  onBack,
  onNext
}: {
  isBusy: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const nextLabel = isBusy ? "Working..." : "Next";

  return (
    <nav className="wizard-bottom-nav" aria-label="Application step navigation">
      <div className="wizard-bottom-nav-row">
        <button className="button secondary" type="button" onClick={onBack} disabled={isFirstStep || isBusy}>
          Back
        </button>
        {isLastStep ? null : (
          <button className="button primary" type="button" onClick={onNext} disabled={isBusy}>
            {nextLabel}
          </button>
        )}
      </div>
    </nav>
  );
}
