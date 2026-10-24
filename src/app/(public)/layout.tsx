// Public information must render on the server without auth, session checks,
// application providers, or client animations. Keep this layout server-only.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="public-information">{children}<LegalFooter /></div>;
}
import LegalFooter from "@/components/LegalFooter";
