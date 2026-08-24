import React from "react";
import { Globe, User, LogOut, Sun, Moon } from "lucide-react";
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

export const Header: React.FC = () => {
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
      className="fixed top-0 right-0 left-20 lg:left-64 z-30 glass-navbar-card rounded-none border-l-0 border-r-0 border-t-0 p-3"
      data-testid="header">
      <div className="flex items-center justify-between">
        <div></div>

        <div className="flex items-center space-x-4">
          {/* Offline Indicator */}
          <OfflineIndicator />

          {/* Language Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLanguage}
            className="glass-input rounded-xl hover:bg-accent transition-colors duration-200"
            data-testid="language-toggle">
            <Globe className="w-5 h-5" />
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="glass-input rounded-xl hover:bg-accent transition-colors duration-200"
            aria-label={t("toggleTheme")}
            data-testid="theme-toggle">
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center space-x-3 hover:bg-accent"
                data-testid="user-profile">
                <div className="w-10 h-10 bg-gradient-to-r from-primary to-chart-5 rounded-xl flex items-center justify-center">
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
