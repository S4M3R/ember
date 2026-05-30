// The Y Combinator mark: orange rounded square with a serif "Y".
export function YcLogo({ size = 18 }: { size?: number }) {
  return (
    <span
      className="yc-logo"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.66) }}
      aria-label="Y Combinator"
      title="Y Combinator"
    >
      Y
    </span>
  );
}
