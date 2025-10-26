export type LocalProject = {
  id: string;
  title: string;
  updatedAt: number; // Date.now()
  data?: any;        // indhold til editoren (senere)
};

const KEY = "dissk_local_projects";

export function getLocalProjects(): LocalProject[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveLocalProjects(list: LocalProject[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertLocalProject(p: LocalProject) {
  const list = getLocalProjects();
  const i = list.findIndex(x => x.id === p.id);
  if (i >= 0) list[i] = p; else list.unshift(p);
  saveLocalProjects(list);
}

export function getLocalProject(id: string): LocalProject | undefined {
  return getLocalProjects().find(p => p.id === id);
}

export function createLocalProject(title = "Ny DISSK"): LocalProject {
  const id = crypto.randomUUID();
  const p: LocalProject = { id, title, updatedAt: Date.now(), data: {} };
  upsertLocalProject(p);
  return p;
}

export function removeLocalProject(id: string) {
  const list = getLocalProjects().filter(p => p.id !== id);
  saveLocalProjects(list);
}
