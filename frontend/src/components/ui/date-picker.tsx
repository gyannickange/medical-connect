import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, isValid, parseISO } from "date-fns"
import { enUS, fr } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DATE_FNS_LOCALE = { fr, en: enUS }
const DATE_PLACEHOLDER = { fr: "jj/mm/aaaa", en: "dd/mm/yyyy" }

export interface DatePickerProps {
  /** ISO date string ("yyyy-MM-dd"), matching what a native <input type="date"> stores. */
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** ISO date string; matches the native <input type="date"> min attribute. */
  minDate?: string
  /** ISO date string; matches the native <input type="date"> max attribute. */
  maxDate?: string
  /** Earliest year selectable from the year dropdown. Defaults to 1920 (birth-date friendly). */
  fromYear?: number
  /** Latest year selectable from the year dropdown. Defaults to the current year. */
  toYear?: number
  className?: string
  "data-testid"?: string
}

export function DatePicker({
  value,
  onValueChange,
  placeholder,
  disabled,
  minDate,
  maxDate,
  fromYear = 1920,
  toYear = new Date().getFullYear(),
  className,
  ...props
}: DatePickerProps) {
  const { language } = useTranslation()
  const locale = DATE_FNS_LOCALE[language]
  const [open, setOpen] = React.useState(false)
  const selected = value ? parseISO(value) : undefined
  const isValidSelection = !!selected && isValid(selected)
  const min = minDate ? parseISO(minDate) : undefined
  const max = maxDate ? parseISO(maxDate) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !isValidSelection && "text-muted-foreground", className)}
          data-testid={props["data-testid"]}
        >
          {isValidSelection ? format(selected, "dd/MM/yyyy") : placeholder ?? DATE_PLACEHOLDER[language]}
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidSelection ? selected : undefined}
          onSelect={(date) => {
            onValueChange(date ? format(date, "yyyy-MM-dd") : "")
            setOpen(false)
          }}
          locale={locale}
          captionLayout="dropdown"
          fromYear={fromYear}
          toYear={toYear}
          disabled={[min && { before: min }, max && { after: max }].filter((matcher): matcher is { before: Date } | { after: Date } => !!matcher)}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
