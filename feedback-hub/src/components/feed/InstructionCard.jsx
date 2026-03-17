import { Image, MessageSquare, Clock } from "lucide-react";
import { Card } from "../ui/Card";
import { CategoryBadge } from "./CategoryBadge";
import { SourceIcon } from "./SourceIcon";

export function InstructionCard({ instruction, onClick }) {
  const { title, source, project, stats, scrapedAt } = instruction;
  const date = new Date(scrapedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card onClick={onClick} className="p-4 card-hover">
      <div className="flex items-start gap-3">
        <SourceIcon source={source} />
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-sm font-semibold text-stone-900 truncate leading-snug">
            {title}
          </h3>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
            {project && (
              <span className="font-mono text-accent font-medium uppercase tracking-wider text-[10px]">
                {project}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {stats.totalEntries}
            </span>
            {stats.imageCount > 0 && (
              <span className="flex items-center gap-1">
                <Image className="w-3 h-3" />
                {stats.imageCount}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {date}
            </span>
          </div>

          {/* Category badges */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {stats.blockerCount > 0 && (
              <CategoryBadge category="blocker" count={stats.blockerCount} />
            )}
            {stats.revisionCount > 0 && (
              <CategoryBadge category="revision" count={stats.revisionCount} />
            )}
            {(stats.categories?.question || 0) > 0 && (
              <CategoryBadge category="question" count={stats.categories.question} />
            )}
            {(stats.categories?.approval || 0) > 0 && (
              <CategoryBadge category="approval" count={stats.categories.approval} />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
