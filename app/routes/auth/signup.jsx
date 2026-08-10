import { Link } from "react-router-dom";

// Book a Demo — public page replacing self-signup
// Proplet is invitation-only. Organizations must book a demo first.
const DEMO_URL = typeof process !== "undefined"
  ? (process.env.DEMO_BOOKING_URL || "mailto:hello@proplet.co.uk")
  : "mailto:hello@proplet.co.uk";

export default function BookDemo() {
  return (
    <div className="flex min-h-screen font-sans">
      {/* ── Left panel — branding ─────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 30%, #a855f7 55%, #6366f1 75%, #3b82f6 100%)",
        }}
      >
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-white font-bold text-xl tracking-tight drop-shadow">Proplet</span>
        </div>

        {/* Centre copy */}
        <div className="relative z-10">
          <h2 className="text-white text-4xl font-bold leading-tight mb-4 drop-shadow-sm">
            Smarter letting,<br />
            <span className="text-white/80">starts today.</span>
          </h2>
          <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
            Book a demo to see how Proplet can transform your property management workflow.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              { text: "End-to-end tenancy management" },
              { text: "Smart document intelligence" },
              { text: "Eliminate manual admin tasks" },
              { text: "Secure evidence vault with complete audit trails" },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-white text-xs font-bold mt-0.5">✓</span>
                <p className="text-indigo-100 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-indigo-200/70 text-xs">
          © {new Date().getFullYear()} Proplet · Smarter property management
        </p>
      </div>

      {/* ── Right panel ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Proplet</span>
        </div>

        <div className="w-full max-w-md text-center">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 mx-auto mb-6">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Book a Demo</h1>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">
            Proplet is available by invitation only for UK letting organizations.<br />
            Book a 30-minute demo to see how it can transform your organization.
          </p>

          {/* What to expect */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">What to expect</p>
            <ul className="space-y-2.5">
              {[
                "Live walkthrough of the Proplet platform",
                "See our document intelligence in action",
                "Q&A with the Proplet team",
                "Onboarding plan tailored to your portfolio",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                    <svg className="h-2.5 w-2.5 text-indigo-600" fill="currentColor" viewBox="0 0 8 8">
                      <path d="M6.41 1L3 4.41 1.59 3 0 4.59 3 7.59 8 2.59z" />
                    </svg>
                  </span>
                  <span className="text-sm text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={DEMO_URL}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
            Book Your Demo
          </a>

          <p className="mt-5 text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
