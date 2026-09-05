import React from "react";
import { Globe, User, LogOut, Settings, Sun, Moon } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "../lib/i18n";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { OfflineIndicator } from "./OfflineIndicator";
import { NotificationBell } from "./NotificationBell";

export const Header: React.FC = () => {
  const [, setLocation] = useLocation();
  const { t, language, changeLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    await logout();
  };

  const toggleLanguage = () => {
    const newLanguage = language === "en" ? "fr" : "en";
    changeLanguage(newLanguage);

    toast({
      title: t("languageChanged"),
      description: `${t("languageChangedTo")} ${t(newLanguage === "en" ? "english" : "french")}`,
    });
  };

  return (
    <header
      className="fixed top-0 right-0 left-20 z-30 h-[73px] border-x-0 border-b border-t-0 border-border bg-card px-4 py-4 lg:left-[260px] lg:px-8"
      data-testid="header">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Medical Connect</div>

        <div className="flex items-center gap-2">
          {/* Offline Indicator */}
          <OfflineIndicator />

          <NotificationBell />

          {/* Language Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLanguage}
            className="hover:bg-accent"
            data-testid="language-toggle">
            <Globe className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="hover:bg-accent"
            aria-label={t("toggleTheme")}
            data-testid="theme-toggle">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Button variant="ghost" size="icon" className="hover:bg-accent" aria-label={t("settings")} onClick={() => setLocation("/settings")} data-testid="settings-shortcut">
            <Settings className="w-5 h-5" />
          </Button>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-10 items-center gap-2 px-2 hover:bg-accent"
                data-testid="user-profile">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                  <User className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-sm font-medium text-foreground">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.role}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{user?.username}
                  </p>
                  <Badge variant="outline" className="w-fit mt-1 capitalize">
                    {user?.role}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t("logout")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
