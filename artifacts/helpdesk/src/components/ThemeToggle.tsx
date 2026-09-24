import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          className={cn(!collapsed && "w-full justify-start gap-2")}
          aria-label={`Appearance: ${current.label}. Change appearance mode.`}
        >
          <CurrentIcon className="h-4 w-4" aria-hidden="true" />
          {!collapsed && <span className="text-sm">{mounted ? current.label : "Appearance"}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              aria-current={isActive ? "true" : undefined}
              className={cn("gap-2", isActive && "font-medium text-accent-foreground bg-accent")}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
