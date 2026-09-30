"use client";

import { ReactNode, useEffect, useState } from "react";

type SafeImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
  loading?: "eager" | "lazy";
};

export default function SafeImage({
  src,
  alt,
  className,
  fallback,
  loading = "lazy",
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
