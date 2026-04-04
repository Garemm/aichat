import { motion } from 'framer-motion';

/**
 * PageTransition — wraps every admin page with a smooth enter animation.
 *
 * variants:
 *   - default: gentle fade + tiny upward slide (most pages)
 *   No exit animation needed since route change unmounts instantly.
 */
const pageVariants = {
  hidden:  { opacity: 0, y: 14, filter: 'blur(3px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.28,
      ease: [0.25, 0.46, 0.45, 0.94],
      // stagger direct children so cards enter one by one
      staggerChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(2px)',
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

const PageTransition = ({ children, className = '' }) => (
  <motion.div
    className={`page-transition-wrapper ${className}`.trim()}
    variants={pageVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
  >
    {children}
  </motion.div>
);

export default PageTransition;
