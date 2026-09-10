"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { LuX } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";

interface SheetOpenContextType {
  open: boolean;
}

const SheetOpenContext = React.createContext<SheetOpenContextType>({ open: false });

function Sheet({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: SheetPrimitive.DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return (
    <SheetOpenContext.Provider value={{ open }}>
      <SheetPrimitive.Root open={open} onOpenChange={handleOpenChange} {...props}>
        {children}
      </SheetPrimitive.Root>
    </SheetOpenContext.Provider>
  );
}

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

type SheetSide = "top" | "bottom" | "left" | "right";

interface SheetContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, "children"> {
  side?: SheetSide;
  showClose?: boolean;
  children?: React.ReactNode;
}

const getSlideAnimation = (side: SheetSide) => {
  switch (side) {
    case "right":
      return {
        initial: { x: "100%", opacity: 0.8 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "100%", opacity: 0.8 },
      };
    case "left":
      return {
        initial: { x: "-100%", opacity: 0.8 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "-100%", opacity: 0.8 },
      };
    case "top":
      return {
        initial: { y: "-100%", opacity: 0.8 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "-100%", opacity: 0.8 },
      };
    case "bottom":
      return {
        initial: { y: "100%", opacity: 0.8 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "100%", opacity: 0.8 },
      };
  }
};

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, showClose = true, ...props }, ref) => {
  const { open } = React.useContext(SheetOpenContext);
  const slideAnim = getSlideAnimation(side);

  return (
    <SheetPortal forceMount>
      <AnimatePresence mode="wait">
        {open && (
          <>
            {/* Smooth animated overlay backdrop */}
            <SheetPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs"
              />
            </SheetPrimitive.Overlay>

            {/* Smooth animated drawer content */}
            <SheetPrimitive.Content asChild forceMount ref={ref} {...props}>
              <motion.div
                initial={slideAnim.initial}
                animate={slideAnim.animate}
                exit={slideAnim.exit}
                transition={{
                  type: "spring",
                  damping: 26,
                  stiffness: 260,
                  mass: 0.85,
                }}
                className={cn(
                  "fixed z-50 gap-4 bg-surface p-6 shadow-2xl focus:outline-hidden",
                  side === "right" &&
                    "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-border",
                  side === "left" &&
                    "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r border-border",
                  side === "top" && "inset-x-0 top-0 border-b border-border",
                  side === "bottom" && "inset-x-0 bottom-0 border-t border-border",
                  className,
                )}
              >
                {children}
                {showClose && (
                  <SheetPrimitive.Close className="absolute end-4 top-4 rounded-control p-1.5 text-ink-muted opacity-70 transition-opacity hover:opacity-100 hover:bg-neutral-200/50 focus:outline-hidden focus:ring-2 focus:ring-[#D8AE4A] disabled:pointer-events-none">
                    <LuX className="size-4" />
                    <span className="sr-only">Close</span>
                  </SheetPrimitive.Close>
                )}
              </motion.div>
            </SheetPrimitive.Content>
          </>
        )}
      </AnimatePresence>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-start", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-ink", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-ink-muted", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
