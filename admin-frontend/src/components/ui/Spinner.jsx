const Spinner = ({ size = 24, className = '' }) => (
  <span
    className={`spinner ${className}`}
    style={{ width: size, height: size }}
    role="status"
    aria-label="Cargando"
  />
);

export default Spinner;
