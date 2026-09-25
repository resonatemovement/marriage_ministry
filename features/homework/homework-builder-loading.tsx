export function HomeworkBuilderLoading() {
  return <section aria-labelledby="homework-builder-heading" aria-busy="true" className="mt-6">
    <h2 id="homework-builder-heading" className="font-heading text-xl font-bold text-text-primary">Homework</h2>
    <div role="status" className="mt-5 rounded-md border border-dashed border-border p-6 text-sm text-text-muted">
      Loading Homework Draft…
    </div>
  </section>;
}
