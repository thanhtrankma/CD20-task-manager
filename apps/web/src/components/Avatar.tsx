const COLORS = ['#2563eb', '#0891b2', '#059669', '#7c3aed', '#db2777', '#ea580c', '#4b5d2a', '#a3141b'];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Ảnh đại diện tròn; chưa có ảnh thì hiện chữ cái đầu trên nền màu theo người. */
export function Avatar({
  name,
  url,
  id = 0,
  size = 36,
}: {
  name: string;
  url?: string | null;
  id?: number;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url) return <img className="avatar-img" src={url} alt={name} style={style} loading="lazy" />;
  return (
    <span className="avatar-initials" style={{ ...style, background: COLORS[id % COLORS.length] }} aria-label={name}>
      {initials(name)}
    </span>
  );
}
