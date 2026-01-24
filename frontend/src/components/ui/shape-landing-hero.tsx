"use client";

import { motion } from 'framer-motion';
import { Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = 'from-white/10',
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -150, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate: rotate }}
      transition={{ duration: 2.4, delay, ease: [0.23, 0.86, 0.39, 0.96], opacity: { duration: 1.2 } }}
      className={cn('absolute', className)}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={cn(
            'absolute inset-0 rounded-full bg-gradient-to-r to-transparent backdrop-blur-[2px] border border-white/20 shadow-[0_8px_32px_rgba(255,255,255,0.1)]',
            gradient,
            'after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.25),transparent_70%)]',
          )}
        />
      </motion.div>
    </motion.div>
  );
}

interface HeroGeometricProps {
  badge?: string;
  title1?: string;
  title2?: string;
  description?: string;
}

function HeroGeometric({
  badge = 'Tenax Execution',
  title1 = 'Elevate Your Digital Vision',
  title2 = 'Crafting Exceptional Workflows',
  description = 'Precision ops, adaptive reminders, and an execution copilot built for relentless teams.',
}: HeroGeometricProps) {
  const fadeUpVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 1, delay: 0.5 + i * 0.2, ease: [0.25, 0.4, 0.25, 1] },
    }),
  };

  return (
    <section className="relative w-full overflow-hidden rounded-3xl bg-[#030303] border border-white/5 px-6 py-20 text-center">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-rose-500/10 blur-3xl" />
      <div className="absolute inset-0 overflow-hidden">
        <ElegantShape delay={0.3} width={600} height={140} rotate={12} gradient="from-indigo-500/30" className="left-[-10%] md:left-[-5%] top-[15%] md:top-[20%]" />
        <ElegantShape delay={0.5} width={500} height={120} rotate={-15} gradient="from-rose-500/30" className="right-[-5%] md:right-[0%] top-[70%] md:top-[75%]" />
        <ElegantShape delay={0.4} width={300} height={80} rotate={-8} gradient="from-violet-500/30" className="left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]" />
        <ElegantShape delay={0.6} width={200} height={60} rotate={20} gradient="from-amber-500/30" className="right-[15%] md:right-[20%] top-[10%] md:top-[15%]" />
        <ElegantShape delay={0.7} width={150} height={40} rotate={-25} gradient="from-cyan-500/30" className="left-[20%] md:left-[25%] top-[5%] md:top-[10%]" />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl">
        <motion.div
          custom={0}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/5 border border-white/10 mb-8"
        >
          <Circle className="h-2 w-2 fill-rose-500/80" />
          <span className="text-sm text-white/70 tracking-wide">{badge}</span>
        </motion.div>
        <motion.div custom={1} variants={fadeUpVariants} initial="hidden" animate="visible">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">{title1}</span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-white/90 to-rose-300">{title2}</span>
          </h1>
        </motion.div>
        <motion.div custom={2} variants={fadeUpVariants} initial="hidden" animate="visible">
          <p className="text-base sm:text-lg md:text-xl text-white/60 mb-10 leading-relaxed font-light max-w-2xl mx-auto">
            {description}
          </p>
        </motion.div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-[#030303]/80 pointer-events-none" />
    </section>
  );
}

export { HeroGeometric };
