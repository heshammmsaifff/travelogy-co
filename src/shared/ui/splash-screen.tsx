"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/shared/lib/cn";

export interface SplashScreenProps {
  className?: string;
}

/**
 * High-end loading splash screen displaying the Travelogy gold emblem,
 * wordmark, tagline, and animated shimmer indicator.
 */
export function SplashScreen({ className }: SplashScreenProps) {
  return (
    <motion.div
      key="splash-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.28, ease: "easeOut" } }}
      transition={{ duration: 0.2 }}
      className={cn(
        "fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#063B4A] select-none pointer-events-auto overflow-hidden",
        className
      )}
      role="status"
      aria-label="Loading"
      aria-live="polite"
    >
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0a4758_0%,_#063B4A_65%,_#03222a_100%)] pointer-events-none" />

      {/* Golden Ambient Halo */}
      <div className="absolute w-56 h-56 rounded-full bg-[#D8AE4A]/10 blur-3xl pointer-events-none" />

      {/* Center Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo Container with gentle breathing animation */}
        <motion.div
          animate={{
            scale: [1, 1.045, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: "easeInOut",
          }}
          className="relative flex items-center justify-center"
        >
          <div className="rounded-2xl bg-white/5 p-3.5 shadow-2xl border border-[#D8AE4A]/30 backdrop-blur-md">
            <Image
              src="/logo.png"
              alt="Travelogy"
              width={76}
              height={50}
              className="h-12 w-auto object-contain brightness-110 drop-shadow-[0_4px_16px_rgba(216,174,74,0.35)]"
              priority
            />
          </div>
        </motion.div>

        {/* Brand Name & Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3 }}
          className="mt-5 flex flex-col items-center text-center space-y-1"
        >
          <span className="text-2xl font-bold tracking-tight text-white font-sans">
            Travelogy
          </span>
          <span className="text-[9.5px] font-semibold tracking-[0.28em] text-[#D8AE4A] uppercase">
            BOOK · CONNECT · GROW
          </span>
        </motion.div>

        {/* Shimmer Loading Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="mt-6 h-1 w-36 overflow-hidden rounded-full bg-white/10 relative"
        >
          <motion.div
            className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#D8AE4A] to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "250%" }}
            transition={{
              repeat: Infinity,
              duration: 1.25,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
