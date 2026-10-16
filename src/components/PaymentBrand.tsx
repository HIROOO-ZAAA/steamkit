type LogoProps = { className?: string };

export function AbaLogo({ className = "h-8 w-8" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/aba.png"
      alt="ABA PayWay"
      className={`rounded-lg object-cover ${className}`}
    />
  );
}

export function BakongLogo({ className = "h-8 w-8" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/bakong.png"
      alt="Bakong"
      className={`rounded-lg object-cover ${className}`}
    />
  );
}

export function MerchantLogo({
  src,
  className = "h-8 w-8",
}: LogoProps & { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`rounded-lg object-cover ${className}`}
    />
  );
}
