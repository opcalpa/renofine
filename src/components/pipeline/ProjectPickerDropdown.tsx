import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, ChevronDown, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DEMO_PROJECT_TYPE } from "@/constants/publicDemo";
import { isDemoProject } from "@/services/demoProjectService";

interface Project {
  id: string;
  name: string;
  project_type: string | null;
}

interface ProjectPickerDropdownProps {
  onSelectProject: (projectId: string) => void;
  disabled?: boolean;
}

export function ProjectPickerDropdown({
  onSelectProject,
  disabled,
}: ProjectPickerDropdownProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_type")
        .is("deleted_at", null)
        .neq("project_type", PUBLIC_DEMO_PROJECT_TYPE)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch projects:", error);
        setLoading(false);
        return;
      }

      // Never offer any demo (public or personal) as a quote/pipeline
      // target — selecting one would attach billing data to demo data.
      const filteredProjects = (data || []).filter(
        (p) => !isDemoProject(p.project_type)
      );
      setProjects(filteredProjects);
      setLoading(false);
    };

    if (open && projects.length === 0) {
      fetchProjects();
    }
  }, [open, projects.length]);

  const handleSelect = (projectId: string) => {
    setOpen(false);
    onSelectProject(projectId);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled} className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">{t("pipeline.createQuote")}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="px-2 py-4 text-sm text-center text-muted-foreground">
            {t("projects.noProjects")}
          </div>
        ) : (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t("pipeline.selectProject")}
            </div>
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className="cursor-pointer"
              >
                <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
