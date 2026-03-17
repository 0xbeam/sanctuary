import { StudioApp } from "../../../components/StudioApp"
import { loadProject } from "../../../lib/project-store"

export default async function StudioDebugPage() {
  const projectKey = "launch-kit"
  const project = await loadProject(projectKey)
  const firstPage = project.pages[0]

  if (!firstPage) {
    throw new Error("Polaris project does not contain any pages")
  }

  return <StudioApp initialProject={project} initialPageId={firstPage.id} projectKey={projectKey} />
}
