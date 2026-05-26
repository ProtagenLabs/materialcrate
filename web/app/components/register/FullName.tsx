import React from "react";
import ActionButton from "../ActionButton";

interface FullNameProps {
  displayName: string;
  setDisplayName: React.Dispatch<React.SetStateAction<string>>;
  fixedAction?: boolean;
  submitLabel?: string;
  error?: string | null;
}

export default function FullName({
  displayName,
  setDisplayName,
  fixedAction = false,
  submitLabel = "NEXT",
  error,
}: FullNameProps) {
  const isNextDisabled = displayName.trim().length < 2;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <div>
          <h4 className="font-medium text-ink">DISPLAY NAME</h4>
          <input
            type="text"
            value={displayName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDisplayName(e.target.value)
            }
            placeholder="e.g. John Doe"
            className="mt-2 w-full rounded-2xl border border-edge-mid bg-surface-high px-4 py-3.5 text-[16px] transition-all duration-200 focus:border-[#E1761F] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[#E1761F]/15"
            required
            minLength={2}
            maxLength={30}
          />
          {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
        </div>
      </div>
      <ActionButton
        type="submit"
        fixedBottom={fixedAction}
        className="mt-8 w-full"
        disabled={isNextDisabled}
      >
        {submitLabel}
      </ActionButton>
    </div>
  );
}
