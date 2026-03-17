export function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm ${onClick ? "cursor-pointer hover:shadow-md" : ""} transition-shadow ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, valueColor = "text-stone-900", subColor = "text-stone-500" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-stone-500 font-medium mb-1">{label}</div>
      <div className={`text-3xl font-black mb-1 ${valueColor}`}>{value}</div>
      {sub && <div className={`text-xs ${subColor}`}>{sub}</div>}
    </Card>
  );
}
