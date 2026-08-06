// components/evidence-vault/EvidenceVaultButton.jsx
// "Generate Evidence Bundle" button for the tenancy detail page.
// Uses useFetcher to POST to /tenancies/:id/evidence-bundle.
// Auto-triggers browser download when the presigned URL is returned.

import { useFetcher } from "react-router-dom";
import { useEffect } from "react";

export function EvidenceVaultButton({ tenancyId }) {
  const fetcher = useFetcher();
  const isGenerating = fetcher.state !== "idle";

  // Open the generated PDF in a new tab instead of forcing a local download
  useEffect(() => {
    if (fetcher.data?.downloadUrl) {
      window.open(fetcher.data.downloadUrl, '_self ');
    }
  }, [fetcher.data]);

  return (
    <div>
      {/* action URL matches the route: tenancies/:id/evidence-bundle */}
      <fetcher.Form
        method="POST"
        action={`/tenancies/${tenancyId}/evidence-bundle`}
      >
        <button
          id="btn-generate-evidence-bundle"
          type="submit"
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isGenerating ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12" cy="12" r="10"
                  stroke="currentColor"
                  strokeWidth={4}
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Generating bundle...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              Evidence Bundle
            </>
          )}
        </button>
      </fetcher.Form>

      {fetcher.data?.error && (
        <p className="text-red-600 text-xs mt-2">{fetcher.data.error}</p>
      )}
      {fetcher.data?.downloadUrl && (
        <p className="text-green-600 text-xs mt-2">
          ✓ Bundle ready — download starting...
        </p>
      )}
    </div>
  );
}
