export function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

export function Input({ name, type = "text", placeholder, defaultValue, error, ...rest }) {
  return (
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue}
      className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white transition ${
        error ? "border-red-300 bg-red-50/50 text-red-900" : "border-slate-300 text-slate-900"
      }`}
      {...rest}
    />
  );
}

export { default as UKAddressFields } from "./UKAddressFields.jsx";
