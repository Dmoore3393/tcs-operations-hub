import TransportationOverlay from "./TransportationOverlay";

export default function TransportationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TransportationOverlay />
    </>
  );
}
