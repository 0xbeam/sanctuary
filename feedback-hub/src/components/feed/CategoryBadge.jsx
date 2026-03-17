const CATEGORY_STYLES = {
  blocker: "bg-red-100 text-red-700 border border-red-200",
  revision: "bg-amber-100 text-amber-700 border border-amber-200",
  question: "bg-blue-100 text-blue-700 border border-blue-200",
  approval: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  context: "bg-stone-100 text-stone-600 border border-stone-200",
};

const CATEGORY_LABELS = {
  blocker: "Blocker",
  revision: "Change",
  question: "Question",
  approval: "Approved",
  context: "Context",
};

export function CategoryBadge({ category, count }) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.context;
  const label = CATEGORY_LABELS[category] || category;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
      {count > 0 && <span className="opacity-70">{count}</span>}
    </span>
  );
}
