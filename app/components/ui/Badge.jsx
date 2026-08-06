/**
 * Badge Component - Reusable status indicator
 * Variants: success, warning, danger, info
 */

export default function Badge({ children, variant = "info", className = "" }) {
  const variants = {
    success: "bg-green-100 text-green-700 border border-green-200",
    warning: "bg-amber-100 text-amber-700 border border-amber-200",
    danger: "bg-red-100 text-red-700 border border-red-200",
    info: "bg-purple-100 text-purple-700 border border-purple-200",
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
