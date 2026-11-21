import React, { useEffect, useState } from "react";
import { getAdminLookup } from "../lib/adminApi";

export default function RemoteLookup({
  type,
  catalog,
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || disabled) return undefined;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const payload = await getAdminLookup(type, { q: query, catalog, limit: 20 });
        setOptions(payload.results || payload.options || []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [catalog, disabled, open, query, type]);

  return (
    <div className="relative">
      <input
        value={open ? query : value?.label || ""}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setOpen(true);
          setQuery(event.target.value);
        }}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600"
      />
      {value && !open && (
        <button
          type="button"
          aria-label="Clear selection"
          className="absolute right-2 top-2 text-gray-500"
          onClick={() => onChange(null)}
        >
          x
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-gray-500">Searching...</p>}
          {!loading && !options.length && <p className="px-3 py-2 text-xs text-gray-500">No matches</p>}
          {options.map((option) => (
            <button
              key={option.value || option.id}
              type="button"
              className="block w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-amber-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="block text-sm font-medium text-gray-900">{option.label}</span>
              {option.subtitle && <span className="block text-xs text-gray-500">{option.subtitle}</span>}
            </button>
          ))}
        </div>
      )}
      {open && <button type="button" aria-label="Close search" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />}
    </div>
  );
}
