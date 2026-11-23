import React, { useState } from "react";

export default function CancelOrderDialog({ title, detail, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const confirm = () => {
    const clean = reason.trim();
    if (!clean) {
      setError("Enter a cancellation reason.");
      return;
    }
    onConfirm(clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{detail}</p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Cancellation reason"
          className="mt-4 h-24 w-full rounded-lg border px-3 py-2 text-sm"
        />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm">Back</button>
          <button type="button" onClick={confirm} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Confirm</button>
        </div>
      </div>
    </div>
  );
}
