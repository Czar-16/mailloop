export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel flex items-center gap-3 p-4 text-sm text-body sm:p-6"
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      Loading your workspace…
    </div>
  );
}
