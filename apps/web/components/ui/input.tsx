import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors outline-none",
        "placeholder:text-gray-400",
        "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-70",
        "dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-700 dark:focus:ring-brand-500/10",
        "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-gray-700",
        className
      )}
      {...props}
    />
  )
}

export { Input }
