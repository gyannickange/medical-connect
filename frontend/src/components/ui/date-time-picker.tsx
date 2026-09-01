import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, isValid, parse } from "date-fns"
import { enUS, fr } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const DATE_FNS_LOCALE = { fr, en: enUS }
const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm"
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))

export interface DateTimePickerProps {
  /** Local datetime string ("yyyy-MM-ddTHH:mm"), matching what a native <input type="datetime-local"> stores. */
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  "data-testid"?: string
}

export function DateTimePicker({ value, onValueChange, placeholder, disabled, className, ...props }: DateTimePickerProps) {
  const { language } = useTranslation()
  const locale = DATE_FNS_LOCALE[language]
  const [open, setOpen] = React.useState(false)
  const selected = value ? parse(value, DATETIME_FORMAT, new Date()) : undefined
  const isValidSelection = !!selected && isValid(selected)
  const hour = isValidSelection ? format(selected, "HH") : "00"
  const minute = isValidSelection ? format(selected, "mm") : "00"

  function commit(date: Date) {
    onValueChange(format(date, DATETIME_FORMAT))
  }

  function handleDaySelect(date: Date | undefined) {
    if (!date) return
    const next = new Date(date)
    next.setHours(Number(hour), Number(minute), 0, 0)
    commit(next)
  }

  function handleTimeChange(nextHour: string, nextMinute: string) {
    const base = isValidSelection ? selected : new Date()
    const next = new Date(base)
    next.setHours(Number(nextHour), Number(nextMinute), 0, 0)
    commit(next)
  }

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
          {isValidSelection ? format(selected, "dd/MM/yyyy HH:mm") : placeholder ?? "dd/mm/yyyy --:--"}
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidSelection ? selected : undefined}
          onSelect={handleDaySelect}
          locale={locale}
          captionLayout="dropdown"
          fromYear={new Date().getFullYear() - 1}
          toYear={new Date().getFullYear() + 2}
          initialFocus
        />
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Select value={hour} onValueChange={(nextHour) => handleTimeChange(nextHour, minute)}>
            <SelectTrigger className="h-8 w-[70px] text-sm" data-testid="select-scheduled-hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">:</span>
          <Select value={minute} onValueChange={(nextMinute) => handleTimeChange(hour, nextMinute)}>
            <SelectTrigger className="h-8 w-[70px] text-sm" data-testid="select-scheduled-minute">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
