import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type GovernorateOption = {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  isActive?: boolean;
};

type GovernorateComboboxProps = {
  governorates?: GovernorateOption[];
  value?: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function GovernorateCombobox({ governorates, value, onChange, disabled }: GovernorateComboboxProps) {
  const [open, setOpen] = useState(false);
  const activeGovernorates = useMemo(
    () => (governorates ?? []).filter(item => item.isActive !== false),
    [governorates],
  );
  const selected = activeGovernorates.find(item => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="اختيار المحافظة"
          disabled={disabled}
          className="h-11 w-full justify-between bg-background px-3 font-normal"
        >
          <span className={cn("flex min-w-0 items-center gap-2", !selected && "text-muted-foreground")}>
            <MapPin className="h-4 w-4 shrink-0 text-secondary" />
            <span className="truncate">{selected?.nameAr ?? "اختر المحافظة أو ابحث باسمها"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 shadow-xl"
      >
        <Command dir="rtl">
          <CommandInput
            autoFocus
            aria-label="البحث باسم المحافظة"
            placeholder="اكتب اسم المحافظة..."
            className="text-right"
          />
          <CommandList className="max-h-64 overscroll-contain">
            <CommandEmpty>لا توجد محافظة بهذا الاسم</CommandEmpty>
            <CommandGroup heading="المحافظات المتاحة">
              {activeGovernorates.map(item => (
                <CommandItem
                  key={item.id}
                  value={`${item.nameAr} ${item.nameEn ?? ""}`}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="min-h-10 cursor-pointer justify-between px-3"
                >
                  <span>{item.nameAr}</span>
                  <Check className={cn("h-4 w-4 text-secondary", item.id === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">استخدم الأسهم ثم Enter للاختيار</p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
