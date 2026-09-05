import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationTitle, notificationBody } from "@/lib/notifications";
import { getNotificationSoundPreset, playNotificationSound, setNotificationSoundPreset, type NotificationSoundPreset } from "@/lib/notificationSound";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [soundPreset, setSoundPreset] = useState<NotificationSoundPreset>(() => getNotificationSoundPreset());

  const handleSoundChange = (value: string) => {
    if (!value) return;
    const preset = value as NotificationSoundPreset;
    setSoundPreset(preset);
    setNotificationSoundPreset(preset);
    playNotificationSound(preset);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-accent" aria-label={t("notifications")} data-testid="notification-bell">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
              data-testid="notification-unread-count">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">{t("noNotifications")}</div>
        )}
        {notifications.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className={notification.readAt ? "opacity-60" : undefined}
            onClick={() => {
              if (!notification.readAt) markRead(notification.id);
            }}
            data-testid={`notification-item-${notification.id}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{notificationTitle(t, notification)}</span>
              <span className="text-xs text-muted-foreground">{notificationBody(t, notification)}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <div className="mb-1.5 text-xs text-muted-foreground">{t("notificationSoundLabel")}</div>
          <ToggleGroup type="single" value={soundPreset} onValueChange={handleSoundChange} className="justify-start">
            <ToggleGroupItem value="default" size="sm" className="text-xs" data-testid="notification-sound-default">
              {t("notificationSoundDefault")}
            </ToggleGroupItem>
            <ToggleGroupItem value="chime" size="sm" className="text-xs" data-testid="notification-sound-chime">
              {t("notificationSoundChime")}
            </ToggleGroupItem>
            <ToggleGroupItem value="ping" size="sm" className="text-xs" data-testid="notification-sound-ping">
              {t("notificationSoundPing")}
            </ToggleGroupItem>
            <ToggleGroupItem value="none" size="sm" className="text-xs" data-testid="notification-sound-none">
              {t("notificationSoundNone")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
