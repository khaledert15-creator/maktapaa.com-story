import { useState } from "react";
import { Check, ChevronsUpDown, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CityOption = {
  id: number;
  nameAr: string;
  surcharge: number;
};

type CityComboboxProps = {
  cities?: CityOption[];
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function CityCombobox({ cities = [], value, onChange, disabled }: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = cities.find(item => item.nameAr === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="اختيار المدينة أو المركز"
          disabled={disabled || cities.length === 0}
          className="h-11 w-full justify-between bg-background px-3 font-normal"
        >
          <span className={cn("flex min-w-0 items-center gap-2", !selected && "text-muted-foreground")}>
            <MapPinned className="h-4 w-4 shrink-0 text-secondary" />
            <span className="truncate">{selected?.nameAr ?? (disabled ? "اختر المحافظة أولًا" : "اختر المدينة أو المركز")}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 shadow-xl">
        <Command dir="rtl">
          <CommandInput autoFocus aria-label="البحث باسم المدينة أو المركز" placeholder="اكتب اسم المدينة أو المركز..." className="text-right" />
          <CommandList className="max-h-72 overscroll-contain">
            <CommandEmpty>لا توجد مدينة أو مركز بهذا الاسم</CommandEmpty>
            <CommandGroup heading={`${cities.length} مدينة ومركز متاح`}>
              {cities.map(item => (
                <CommandItem
                  key={item.id}
                  value={item.nameAr}
                  onSelect={() => {
                    onChange(item.nameAr);
                    setOpen(false);
                  }}
                  className="min-h-10 cursor-pointer justify-between px-3"
                >
                  <span>{item.nameAr}</span>
                  <span className="flex items-center gap-2">
                    {item.surcharge > 0 && <small className="text-muted-foreground">+{item.surcharge} ج.م</small>}
                    <Check className={cn("h-4 w-4 text-secondary", item.nameAr === value ? "opacity-100" : "opacity-0")} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">اكتب جزءًا من الاسم، أو استخدم الأسهم ثم Enter</p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
