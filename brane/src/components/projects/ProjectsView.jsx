import { FolderOpen } from "lucide-react";
import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";
import { Card } from "../ui/Card";
import { CategoryBadge } from "../feed/CategoryBadge";
import { EmptyState } from "../ui/EmptyState";

export function ProjectsView() {
  const { setActiveTab, setFilterProject } = useUI();
  const { instructions, projects } = useData();

  const goToProject = (project) => {
    setFilterProject(project);
    setActiveTab("feed");
  };

  if (projects.length === 0) {
    return (
      <div className="view-enter max-w-2xl">
        <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 mb-5">
          Projects
        </h2>
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          subtitle="Tag your scrapes with --project to organize them"
        />
      </div>
    );
  }

  return (
    <div className="view-enter max-w-2xl">
      <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 mb-5">
        Projects
      </h2>

      <div className="space-y-3">
        {projects.map((project) => {
          const projectInstructions = instructions.filter((i) => i.project === project);
          const totalBlockers = projectInstructions.reduce((s, i) => s + (i.stats.blockerCount || 0), 0);
          const totalRevisions = projectInstructions.reduce((s, i) => s + (i.stats.revisionCount || 0), 0);
          const totalImages = projectInstructions.reduce((s, i) => s + (i.stats.imageCount || 0), 0);
          const sources = [...new Set(projectInstructions.map((i) => i.source))];

          return (
            <Card key={project} onClick={() => goToProject(project)} className="p-5 card-hover">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-stone-900 font-mono uppercase tracking-wider">
                    {project}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {projectInstructions.length} instructions · {sources.join(", ")} · {totalImages} images
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {totalBlockers > 0 && <CategoryBadge category="blocker" count={totalBlockers} />}
                  {totalRevisions > 0 && <CategoryBadge category="revision" count={totalRevisions} />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
