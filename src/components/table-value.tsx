export function TableValue({
  value,
  missing = "—",
  singleLine = false,
}: {
  value: string | null;
  missing?: string;
  singleLine?: boolean;
}) {
  return value?.trim() ? (
    <span
      className={`table-value${singleLine ? " table-value-single-line" : ""}`}
    >
      {value}
    </span>
  ) : (
    <span className="text-body">{missing}</span>
  );
}
