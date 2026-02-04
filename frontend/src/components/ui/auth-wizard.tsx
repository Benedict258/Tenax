import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

type WizardProps = {
  step: number;
  direction: 'forward' | 'backward';
  steps: React.ReactNode[];
  className?: string;
};

const variants = {
  enter: (direction: 'forward' | 'backward') => ({
    x: direction === 'forward' ? 120 : -120,
    opacity: 0
  }),
  center: {
    x: 0,
    opacity: 1
  },
  exit: (direction: 'forward' | 'backward') => ({
    x: direction === 'forward' ? -120 : 120,
    opacity: 0
  })
};

const AuthWizard: React.FC<WizardProps> = ({ step, direction, steps, className }) => (
  <div className={cn('relative overflow-hidden', className)}>
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={step}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.35, ease: 'easeInOut' }}
      >
        {steps[step]}
      </motion.div>
    </AnimatePresence>
  </div>
);

export default AuthWizard;
