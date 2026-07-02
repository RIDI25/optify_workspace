export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">
          이 화면은 <span className="font-medium text-accent-deep">{phase}</span>
          에서 구현됩니다.
        </p>
      </div>
    </section>
  );
}
