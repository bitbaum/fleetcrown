"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { ProjectDetail } from "./ProjectDetail";

type Project = {
  id: string;
  name: string;
  description: string | null;
  attrs: Record<string, string>;
};

export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => setSelectedId(project.id)}
            className="rounded-md border border-white/5 bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.05] hover:border-white/10 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm md:text-base font-medium">{project.name}</div>
              {project.attrs["production_url"] && (
                <a
                  href={project.attrs["production_url"]}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-white/30 hover:text-white/60"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {project.description && (
              <div className="text-xs md:text-sm text-white/40 mt-1">{project.description}</div>
            )}
            {Object.keys(project.attrs).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(project.attrs)
                  .filter(([k]) => !k.startsWith("channel:") && k !== "production_url")
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="px-1.5 py-0.5 text-xs bg-white/5 rounded text-white/40"
                    >
                      {key}: {String(value).slice(0, 30)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedId && (
        <ProjectDetail
          projectId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
