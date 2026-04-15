import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

/**
 * SubscriptionGate — shown in the main content area whenever the business's
 * subscription is inactive (is_active = false).  Replaces page children so
 * the admin can see the UI chrome but cannot interact with any feature.
 */
const SubscriptionGate = () => {
  const { signOut } = useAuth();

  return (
    <div className="gate">
      <motion.div
        className="gate__card"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Animated icon */}
        <motion.div
          className="gate__icon-wrap"
          animate={{ boxShadow: [
            '0 0 0 0px rgba(99,102,241,0)',
            '0 0 0 10px rgba(99,102,241,0.08)',
            '0 0 0 20px rgba(99,102,241,0)',
          ]}}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        >
          <svg
            className="gate__icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </motion.div>

        {/* Heading */}
        <h2 className="gate__title">Tu suscripción está pendiente</h2>

        {/* Body */}
        <p className="gate__body">
          Gracias por registrarte. Tu cuenta está lista, solo estamos esperando
          confirmar el pago de tu suscripción para darte acceso completo a la
          plataforma.
        </p>

        {/* Info strip */}
        <div className="gate__info-strip">
          <span className="gate__info-dot" />
          <span>
            Una vez procesado el pago, tu acceso se activará de forma automática.
            No es necesario que hagas nada más.
          </span>
        </div>

        {/* Actions */}
        <div className="gate__actions">
          <a
            href="mailto:soporte@saaschat.app"
            className="gate__btn gate__btn--primary"
          >
            Contactar soporte
          </a>
          <button
            type="button"
            className="gate__btn gate__btn--ghost"
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </div>

        {/* Footer note */}
        <p className="gate__footnote">
          Si ya realizaste el pago y el acceso no se ha activado en los próximos
          minutos, por favor contáctanos y lo resolveremos de inmediato.
        </p>
      </motion.div>
    </div>
  );
};

export default SubscriptionGate;
