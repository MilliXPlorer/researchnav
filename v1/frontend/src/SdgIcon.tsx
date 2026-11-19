const icons = import.meta.glob<string>("./assets/sdgs/goal-*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Official artwork; the surrounding label supplies the goal's accessible name. */
export function SdgIcon({ id }: { id: number }) {
  const src = icons[`./assets/sdgs/goal-${String(id).padStart(2, "0")}.png`];
  if (!src) return <span className="sdg-icon-fallback">SDG {id}</span>;

  return (
    <img
      className="sdg-icon"
      src={src}
      width={64}
      height={64}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
