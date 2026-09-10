"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export interface ScrollRevealProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  delay?: number;
  duration?: number;
  yOffset?: number;
  className?: string;
  viewportAmount?: number;
}

/**
 * Single-element scroll reveal with smooth easing.
 */
export function ScrollReveal({
  children,
  delay = 0,
  duration = 0.5,
  yOffset = 22,
  className,
  viewportAmount = 0.15,
  ...props
}: ScrollRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: viewportAmount }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export interface ScrollStaggerListProps extends HTMLMotionProps<"ul"> {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

/**
 * Unordered list container that staggers its children on scroll.
 */
export function ScrollStaggerList({
  children,
  staggerDelay = 0.1,
  className,
  ...props
}: ScrollStaggerListProps) {
  return (
    <motion.ul
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.ul>
  );
}

export interface ScrollStaggerOrderedListProps extends HTMLMotionProps<"ol"> {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

/**
 * Ordered list container that staggers its children on scroll.
 */
export function ScrollStaggerOrderedList({
  children,
  staggerDelay = 0.1,
  className,
  ...props
}: ScrollStaggerOrderedListProps) {
  return (
    <motion.ol
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.ol>
  );
}

export interface ScrollStaggerItemProps extends HTMLMotionProps<"li"> {
  children: ReactNode;
  className?: string;
  yOffset?: number;
  enableHover?: boolean;
}

/**
 * List item child that animates as part of a staggered list reveal.
 */
export function ScrollStaggerItem({
  children,
  className,
  yOffset = 20,
  enableHover = true,
  ...props
}: ScrollStaggerItemProps) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: yOffset },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
      whileHover={enableHover ? { y: -4, transition: { duration: 0.2, ease: "easeOut" } } : undefined}
      className={cn("will-change-transform", className)}
      {...props}
    >
      {children}
    </motion.li>
  );
}
