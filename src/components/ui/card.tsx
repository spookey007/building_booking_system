"use client";

import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type CardProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  animate?: boolean;
};

export function Card({ children, className, animate = true, ...props }: CardProps) {
  if (!animate) {
    return <div className={cn("brand-card rounded-2xl p-5", className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={cn("brand-card rounded-2xl p-5", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
