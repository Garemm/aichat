import { useEffect, useState, useCallback } from 'react';
import { getHours, saveHour, saveAllHours } from '../services/api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

const DAYS = [
  { value: 1, label: 'Lunes'      },
  { value: 2, label: 'Martes'     },
  { value: 3, label: 'Miércoles'  },
  { value: 4, label: 'Jueves'     },
  { value: 5, label: 'Viernes'    },
  { value: 6, label: 'Sábado'     },
  { value: 0, label: 'Domingo'    },
];

const DEFAULT_OPEN  = '09:00';
const DEFAULT_CLOSE = '18:00';

const buildTemplate = (dbRows) => {
  const map = Object.fromEntries(dbRows.map((r) => [r.day_of_week, r]));
  return DAYS.map(({ value, label }) => ({
    id:          map[value]?.id         ?? null,
    day_of_week: value,
    label,
    open_time:   map[value]?.open_time  ?? DEFAULT_OPEN,
    close_time:  map[value]?.close_time ?? DEFAULT_CLOSE,
    is_closed:   map[value]?.is_closed  ?? false,
    dirty:       false,
  }));
};

const Hours = () => {
  const { addToast }   = useToast();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({}); // { day_of_week: true }
  const [savingAll, setSavingAll] = useState(false);
  const [error,   setError]   = useState('');

  const loadHours = useCallback(() => {
    setLoading(true);
    getHours()
      .then((data) => setRows(buildTemplate(data)))
      .catch((err)  => setError(err.message))
      .finally(()   => setLoading(false));
  }, []);

  useEffect(() => { loadHours(); }, [loadHours]);

  const updateRow = (day_of_week, patch) => {
    setRows((prev) =>
      prev.map((r) => r.day_of_week === day_of_week ? { ...r, ...patch, dirty: true } : r)
    );
  };

  const handleSaveOne = async (row) => {
    setSaving((s) => ({ ...s, [row.day_of_week]: true }));
    try {
      const saved = await saveHour({
        day_of_week: row.day_of_week,
        open_time:   row.is_closed ? null : row.open_time,
        close_time:  row.is_closed ? null : row.close_time,
        is_closed:   row.is_closed,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.day_of_week === row.day_of_week
            ? { ...r, id: saved.id, open_time: saved.open_time ?? row.open_time, close_time: saved.close_time ?? row.close_time, dirty: false }
            : r
        )
      );
      addToast(`${row.label} guardado`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [row.day_of_week]: false }));
    }
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    try {
      await saveAllHours(
        rows.map((r) => ({
          day_of_week: r.day_of_week,
          open_time:   r.is_closed ? null : r.open_time,
          close_time:  r.is_closed ? null : r.close_time,
          is_closed:   r.is_closed,
        }))
      );
      setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
      addToast('Horario guardado correctamente', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingAll(false);
      loadHours();
    }
  };

  if (loading) return <div className="page page--center"><Spinner size={32} /></div>;
  if (error)   return <div className="page"><p className="page-error">{error}</p></div>;

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>Horario de atención</h2>
          <p className="text-muted">Configura los días y horas en que atiende tu negocio</p>
        </div>
        <button
          className="btn btn--primary"
          onClick={handleSaveAll}
          disabled={savingAll}
        >
          {savingAll ? <Spinner size={16} /> : <><Icon name="save" size={16} /> Guardar todo</>}
          {dirtyCount > 0 && !savingAll && <span className="badge badge--warn">{dirtyCount}</span>}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table hours-table">
          <thead>
            <tr>
              <th>Día</th>
              <th style={{ width: 110 }}>Cerrado</th>
              <th>Apertura</th>
              <th>Cierre</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day_of_week} className={row.dirty ? 'row--dirty' : ''}>
                <td>
                  <strong>{row.label}</strong>
                </td>
                <td>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={row.is_closed}
                      onChange={(e) => updateRow(row.day_of_week, { is_closed: e.target.checked })}
                    />
                    <span className="toggle__track" />
                  </label>
                </td>
                <td>
                  <input
                    type="time"
                    className="form-input form-input--time"
                    value={row.open_time ?? ''}
                    disabled={row.is_closed}
                    onChange={(e) => updateRow(row.day_of_week, { open_time: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="form-input form-input--time"
                    value={row.close_time ?? ''}
                    disabled={row.is_closed}
                    onChange={(e) => updateRow(row.day_of_week, { close_time: e.target.value })}
                  />
                </td>
                <td className="table-actions">
                  <button
                    className="btn btn--sm btn--primary"
                    onClick={() => handleSaveOne(row)}
                    disabled={saving[row.day_of_week]}
                  >
                    {saving[row.day_of_week] ? <Spinner size={14} /> : 'Guardar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Hours;
