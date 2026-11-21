import React from "react";

export default function ConfirmDialog({
  open,
  title = "Confirm changes",
  message = "Do you want to continue?",
  confirmLabel = "Yes",
  discardLabel = "Discard",
  tone = "default",
  onConfirm,
  onDiscard,
}) {
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-red-700 text-white hover:bg-red-800"
      : "bg-[#A68B5B] text-white hover:bg-[#8E7448]";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs text-gray-400 underline-offset-4 hover:text-gray-600 hover:underline"
          >
            {discardLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-5 py-2 text-sm font-semibold shadow ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

