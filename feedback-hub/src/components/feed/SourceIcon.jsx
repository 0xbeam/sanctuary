import { Hash, Twitter, Figma, Globe } from "lucide-react";

const SOURCE_ICONS = {
  slack: Hash,
  twitter: Twitter,
  figma: Figma,
  url: Globe,
};

const SOURCE_COLORS = {
  slack: "text-purple-600 bg-purple-50",
  twitter: "text-sky-600 bg-sky-50",
  figma: "text-pink-600 bg-pink-50",
  url: "text-stone-600 bg-stone-100",
};

export function SourceIcon({ source, size = "md" }) {
  const Icon = SOURCE_ICONS[source] || Globe;
  const color = SOURCE_COLORS[source] || SOURCE_COLORS.url;
  const sizeClass = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  return (
    <div className={`${sizeClass} rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
      <Icon className={iconSize} />
    </div>
  );
}
