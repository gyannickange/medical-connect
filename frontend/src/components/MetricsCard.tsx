import React, { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { useCurrency } from "../hooks/useCurrency";
import { Badge } from "@/components/ui/badge";

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  description?: string;
  className?: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  description,
  className = "",
}) => {
  const { formatAmount } = useCurrency();

  const getChangeVariant = (): "success" | "danger" | "secondary" => {
    switch (changeType) {
      case "positive":
        return "success";
      case "negative":
        return "danger";
      default:
        return "secondary";
    }
  };

  const getIconBg = () => {
    switch (changeType) {
      case "positive":
        return "bg-chart-positive/15";
      case "negative":
        return "bg-chart-negative/15";
      default:
        return "bg-accent-primary/15";
    }
  };

  const getIconColor = () => {
    switch (changeType) {
      case "positive":
        return "text-chart-positive";
      case "negative":
        return "text-chart-negative";
      default:
        return "text-accent-primary";
    }
  };

  return (
    <div
      className={`metric-card ${className}`}
      data-testid={`metric-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between h-full">
        <div className="flex-1">
          <p className="text-text-secondary text-sm font-medium">{title}</p>
          <p className="text-xl font-display font-bold text-foreground mt-3 leading-tight">
            {value}
          </p>
          {(change || description) && (
            <div className="flex items-center mt-3">
              {change && (
                <Badge variant={getChangeVariant()}>{change}</Badge>
              )}
              {description && (
                <span className="text-xs text-text-tertiary ml-2">
                  {description}
                </span>
              )}
            </div>
          )}
        </div>
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center ${getIconBg()}`}>
          <Icon className={`w-7 h-7 ${getIconColor()}`} />
        </div>
      </div>
    </div>
  );
};
