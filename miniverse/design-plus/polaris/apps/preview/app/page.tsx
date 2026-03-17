import { normalizePage } from "@polaris/compiler"
import { PreviewPage } from "../components/PreviewPage"
import { loadProject } from "../lib/project-store"

interface HomePageProps {
  searchParams?: Promise<{
    project?: string
    page?: string
  }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {}
  const projectKey = params.project ?? "launch-kit"
  const project = await loadProject(projectKey)
  const activePageId = params.page ?? project.pages[0]?.id

  if (!activePageId) {
    throw new Error("Polaris project does not contain any pages")
  }

  return <PreviewPage page={normalizePage(project, activePageId)} />
}
