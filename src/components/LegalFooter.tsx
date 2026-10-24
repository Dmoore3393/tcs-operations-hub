export default function LegalFooter() {
  return <footer className="legal-footer border-t border-emerald-900/15 bg-white px-4 py-5 text-center text-base text-emerald-950">
    <nav aria-label="Legal and account links" className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-1">
      <a href="/privacy" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Privacy</a>
      <a href="/terms" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Terms</a>
      <a href="/support" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Support</a>
      <a href="/account" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Account &amp; Privacy</a>
    </nav>
    <p className="mt-2 text-sm">Thomason Childcare Solutions · The Hub</p>
  </footer>;
}
