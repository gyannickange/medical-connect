import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, useDayPicker, useNavigation, type CaptionProps } from "react-day-picker"
import { format, setMonth, setYear, startOfMonth } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * Replaces react-day-picker's built-in dropdown caption (which relies on a
 * visually-hidden label stacked behind a raw <select> — a CSS contract this
 * project's calendar styling doesn't implement) with our own Select, so
 * switching months/years never renders duplicated, unstyled controls.
 */
function CaptionDropdown({ displayMonth }: CaptionProps) {
  const { fromYear, toYear, locale } = useDayPicker()
  const { goToMonth } = useNavigation()
  const startYear = fromYear ?? displayMonth.getFullYear()
  const endYear = toYear ?? displayMonth.getFullYear()
  const months = Array.from({ length: 12 }, (_, i) => i)
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  // Normalize to the 1st before setMonth/setYear so a late day-of-month
  // (e.g. the 31st) can't roll the result into the wrong month.
  const anchor = startOfMonth(displayMonth)

  return (
    <div className="flex justify-center gap-2 pt-1">
      <Select
        value={String(displayMonth.getMonth())}
        onValueChange={(value) => goToMonth(setMonth(anchor, Number(value)))}
      >
        <SelectTrigger className="h-7 w-[124px] px-2 text-sm capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((month) => (
            <SelectItem key={month} value={String(month)} className="capitalize">
              {format(setMonth(anchor, month), "LLLL", { locale })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(displayMonth.getFullYear())}
        onValueChange={(value) => goToMonth(setYear(anchor, Number(value)))}
      >
        <SelectTrigger className="h-7 w-[84px] px-2 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        Caption: props.captionLayout ? CaptionDropdown : undefined,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
