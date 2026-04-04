import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { importPreview, importConfirm, getCategories } from '../services/api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

// ── Template columns (CSV download) ──────────────────────────────────────────
const TEMPLATE_HEADERS = ['item_code', 'Nombre', 'Precio', 'Stock', 'Categoría', 'Descripción', 'Disponible'];
const TEMPLATE_EXAMPLE = ['PROD-001', 'Ejemplo de producto', '99.99', '10', 'Sin categoría', 'Descripción opcional', 'true'];

const downloadTemplate = () => {
  const rows = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE];
  const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_productos.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const downloadReport = (data) => {
  const header = ['item_code', 'Nombre', 'Resultado', 'Detalle'];
  const rows = [
    ...(data.added_list   || []).map((r) => [r.item_code, r.name, 'Agregado', '']),
    ...(data.updated_list || []).map((r) => [r.item_code, r.name, 'Actualizado', '']),
    ...(data.errors       || []).map((r) => [r.item_code, r.name, 'Error', r.reason]),
  ];
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'reporte_importacion.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    valid:   { cls: 'import-badge import-badge--valid',   label: '✓ Válido'  },
    warning: { cls: 'import-badge import-badge--warning', label: '⚠ Aviso'   },
    error:   { cls: 'import-badge import-badge--error',   label: '✗ Error'   },
  };
  const { cls, label } = map[status] || map.error;
  return <span className={cls}>{label}</span>;
};

// ── Category confirmation modal ───────────────────────────────────────────────
const CategoryConfirmModal = ({ categories, onConfirm, onSkip, loading }) => (
  <div className="import-modal-overlay" role="dialog" aria-modal="true">
    <div className="import-modal">
      <div className="import-modal__header">
        <Icon name="warning" size={20} />
        <h3>Categorías no encontradas</h3>
      </div>
      <p className="import-modal__body">
        Las siguientes categorías no existen en tu base de datos. ¿Deseas crearlas automáticamente?
      </p>
      <ul className="import-modal__list">
        {categories.map((c) => (
          <li key={c}><span className="import-badge import-badge--warning">{c}</span></li>
        ))}
      </ul>
      <div className="import-modal__actions">
        <button className="btn btn--ghost btn--sm" onClick={onSkip} disabled={loading}>
          Omitir y continuar sin categoría
        </button>
        <button className="btn btn--primary btn--sm" onClick={onConfirm} disabled={loading}>
          {loading ? <><Spinner size={14} />&nbsp;Creando…</> : <>
            <Icon name="check" size={14} /> Crear categorías e importar
          </>}
        </button>
      </div>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const Import = () => {
  const { addToast } = useToast();
  const navigate     = useNavigate();
  const fileInputRef = useRef(null);

  // phase: 'upload' | 'preview' | 'result'
  const [phase,            setPhase]            = useState('upload');
  const [dragging,         setDragging]         = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [rows,             setRows]             = useState([]);
  const [summary,          setSummary]          = useState(null);
  const [missingCategories,setMissingCategories]= useState([]);
  const [categories,       setCategories]       = useState([]);
  const [results,          setResults]          = useState(null);
  const [confirming,       setConfirming]       = useState(false);
  const [showCatModal,     setShowCatModal]     = useState(false);
  const [catModalLoading,  setCatModalLoading]  = useState(false);

  // ── Load categories for dropdowns ─────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    try { setCategories(await getCategories()); } catch { /* non-fatal */ }
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────
  const processFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      addToast('Solo se permiten archivos .csv, .xlsx o .xls', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('El archivo supera el límite de 5 MB', 'error'); return;
    }
    setLoading(true);
    try {
      await loadCategories();
      const { rows: previewRows, summary: ps, missingCategories: mc = [] } = await importPreview(file);
      setRows(previewRows);
      setSummary(ps);
      setMissingCategories(mc);
      setPhase('preview');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };
  const handleFileInput = (e) => processFile(e.target.files[0]);

  // ── Row editing ────────────────────────────────────────────────────────────
  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = prev.map((r, i) => i === index ? { ...r, [field]: value } : r);
      const r = next[index];
      const errors   = [];
      const warnings = (r._warnings || []).filter((w) => !w.includes('no existe') && !w.includes('inválido'));
      if (!r.item_code?.trim())  errors.push('item_code es obligatorio');
      if (!r.name?.trim())       errors.push('Nombre es obligatorio');
      const p = parseFloat(String(r.price).replace(',', '.'));
      if (isNaN(p) || p < 0)    errors.push('Precio inválido');
      next[index]._errors   = errors;
      next[index]._warnings = warnings;
      next[index]._status   = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
      // Recalculate summary
      const total   = next.length;
      const valid   = next.filter((r) => r._status === 'valid').length;
      const warning = next.filter((r) => r._status === 'warning').length;
      const error   = next.filter((r) => r._status === 'error').length;
      setSummary({ total, valid, warning, error });
      return next;
    });
  };

  const removeRow = (index) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setSummary({
        total:   next.length,
        valid:   next.filter((r) => r._status === 'valid').length,
        warning: next.filter((r) => r._status === 'warning').length,
        error:   next.filter((r) => r._status === 'error').length,
      });
      return next;
    });
  };

  // ── Confirm import — with optional createMissingCategories ─────────────────
  const runConfirm = async (createMissingCategories = false) => {
    const validRows = rows.filter((r) => r._status !== 'error');
    if (validRows.length === 0) {
      addToast('No hay filas válidas para importar. Corrija los errores primero.', 'error');
      return;
    }

    setConfirming(true);
    if (createMissingCategories) setCatModalLoading(true);
    try {
      const data = await importConfirm(rows, createMissingCategories);

      if (data.needsCategoryConfirm) {
        // Backend asked us to confirm category creation
        setMissingCategories(data.missingCategories || []);
        setShowCatModal(true);
        return;
      }

      setResults(data);
      setPhase('result');
      setShowCatModal(false);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setConfirming(false);
      setCatModalLoading(false);
    }
  };

  const handleConfirm       = () => runConfirm(false);
  const handleCreateCatsAndImport = () => runConfirm(true);
  const handleSkipCats            = () => { setShowCatModal(false); runConfirm(/* skip, proceed with nulls */ false); };

  const reset = () => {
    setPhase('upload'); setRows([]); setSummary(null);
    setResults(null); setMissingCategories([]); setShowCatModal(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE: upload
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="page">
        <div className="page__header">
          <div>
            <h2>Importar Productos</h2>
            <p className="text-muted">Carga masiva desde un archivo CSV o Excel</p>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={downloadTemplate}>
            <Icon name="download" size={15} />
            Descargar plantilla
          </button>
        </div>

        {loading ? (
          <div className="page--center" style={{ minHeight: 280 }}>
            <div style={{ textAlign: 'center' }}>
              <Spinner size={32} className="spinner--dark" />
              <p style={{ marginTop: 12, color: 'var(--text-2)' }}>Analizando archivo…</p>
            </div>
          </div>
        ) : (
          <div
            className={`import-dropzone${dragging ? ' import-dropzone--active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Zona de subida de archivo"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <div className="import-dropzone__icon">
              <Icon name="upload" size={36} />
            </div>
            <p className="import-dropzone__title">
              {dragging ? 'Suelta el archivo aquí' : 'Arrastra tu archivo aquí'}
            </p>
            <p className="import-dropzone__sub">
              o <span className="import-dropzone__link">haz clic para seleccionar</span>
            </p>
            <div className="import-dropzone__formats">
              <span className="badge badge--muted">.CSV</span>
              <span className="badge badge--muted">.XLSX</span>
              <span className="badge badge--muted">.XLS</span>
              <span className="import-dropzone__limit">Máx. 5 MB</span>
            </div>
          </div>
        )}

        <div className="import-hint">
          <p><strong>Columnas requeridas:</strong> <code>item_code</code>, <code>Nombre</code>, <code>Precio</code>, <code>Stock</code></p>
          <p><strong>Comportamiento de importación:</strong></p>
          <ul>
            <li>Si el <code>item_code</code> ya existe para tu empresa → el producto se <strong>actualiza</strong></li>
            <li>Si no existe → se <strong>inserta</strong> como nuevo producto</li>
            <li>Si una <strong>categoría</strong> no existe, se te pedirá confirmación para crearla</li>
          </ul>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE: preview
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === 'preview') {
    const validCount = rows.filter((r) => r._status !== 'error').length;

    return (
      <div className="page import-page--wide">
        {/* Category confirm modal */}
        {showCatModal && (
          <CategoryConfirmModal
            categories={missingCategories}
            onConfirm={handleCreateCatsAndImport}
            onSkip={handleSkipCats}
            loading={catModalLoading}
          />
        )}

        <div className="page__header">
          <div>
            <h2>Revisar Importación</h2>
            <p className="text-muted">Edita las filas antes de confirmar • {rows.length} filas cargadas</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn--ghost btn--sm" onClick={reset}>
              <Icon name="x" size={15} /> Cancelar
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={handleConfirm}
              disabled={confirming || validCount === 0}
            >
              {confirming
                ? <><Spinner size={14} />&nbsp;Importando…</>
                : <><Icon name="check" size={15} /> Confirmar ({validCount})</>}
            </button>
          </div>
        </div>

        {/* Summary pills */}
        {summary && (
          <div className="import-summary-bar">
            <div className="import-summary-pill import-summary-pill--total">
              <span className="import-summary-pill__value">{summary.total}</span><span>Total</span>
            </div>
            <div className="import-summary-pill import-summary-pill--valid">
              <span className="import-summary-pill__value">{summary.valid}</span><span>Válidos</span>
            </div>
            <div className="import-summary-pill import-summary-pill--warning">
              <span className="import-summary-pill__value">{summary.warning}</span><span>Avisos</span>
            </div>
            <div className="import-summary-pill import-summary-pill--error">
              <span className="import-summary-pill__value">{summary.error}</span><span>Errores</span>
            </div>
          </div>
        )}

        {/* Missing categories banner */}
        {missingCategories.length > 0 && (
          <div className="import-info-banner import-info-banner--warn">
            <Icon name="warning" size={15} />
            <div>
              <strong>Categorías no encontradas:</strong>{' '}
              {missingCategories.join(', ')}.{' '}
              Al confirmar, se te preguntará si deseas crearlas automáticamente.
            </div>
          </div>
        )}

        {summary?.error > 0 && (
          <div className="import-info-banner import-info-banner--danger">
            <Icon name="x" size={15} />
            Las filas con errores serán omitidas. Corrígelas en la tabla o elimínalas.
          </div>
        )}

        {/* Preview table */}
        <div className="import-table-wrap">
          <table className="import-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Estado</th>
                <th>item_code</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Disp.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`import-table__row import-table__row--${row._status}`}>
                  <td className="import-table__cell--num">{row._rowIndex ?? i + 2}</td>
                  <td>
                    <StatusBadge status={row._status} />
                    {((row._errors?.length ?? 0) + (row._warnings?.length ?? 0)) > 0 && (
                      <div className="import-row-hints">
                        {(row._errors   || []).map((e, j) => <span key={`e${j}`} className="import-row-hint import-row-hint--error">{e}</span>)}
                        {(row._warnings || []).map((w, j) => <span key={`w${j}`} className="import-row-hint import-row-hint--warning">{w}</span>)}
                      </div>
                    )}
                  </td>
                  <td>
                    <input className="import-cell-input" value={row.item_code || ''} onChange={(e) => updateRow(i, 'item_code', e.target.value)} />
                  </td>
                  <td>
                    <input className="import-cell-input" value={row.name || ''} onChange={(e) => updateRow(i, 'name', e.target.value)} />
                  </td>
                  <td>
                    <input className="import-cell-input import-cell-input--num" type="number" min="0" step="0.01" value={row.price ?? ''} onChange={(e) => updateRow(i, 'price', e.target.value)} />
                  </td>
                  <td>
                    <input className="import-cell-input import-cell-input--num" type="number" min="0" step="1" value={row.stock_quantity ?? 0} onChange={(e) => updateRow(i, 'stock_quantity', parseInt(e.target.value, 10) || 0)} />
                  </td>
                  <td>
                    <select
                      className="import-cell-select"
                      value={row.category_id ?? ''}
                      onChange={(e) => updateRow(i, 'category_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                    >
                      <option value="">— Sin categoría —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {row.missingCategory && !row.category_id && (
                      <span className="import-row-hint import-row-hint--warning" style={{ display: 'block', marginTop: 2 }}>
                        "{row.missingCategory}" no existe aún
                      </span>
                    )}
                  </td>
                  <td>
                    <input className="import-cell-input" value={row.description || ''} onChange={(e) => updateRow(i, 'description', e.target.value)} />
                  </td>
                  <td className="import-table__cell--center">
                    <input type="checkbox" checked={row.is_available ?? true} onChange={(e) => updateRow(i, 'is_available', e.target.checked)} className="import-checkbox" />
                  </td>
                  <td>
                    <button className="btn btn--danger btn--sm import-remove-btn" onClick={() => removeRow(i)} title="Eliminar fila">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
            No quedan filas.{' '}
            <button className="import-text-btn" onClick={reset}>Cargar otro archivo</button>
          </p>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE: result
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>Importación Completada</h2>
          <p className="text-muted">Resumen del proceso de carga masiva</p>
        </div>
      </div>

      <div className="import-result-grid">
        <div className="import-result-card import-result-card--success">
          <div className="import-result-card__icon"><Icon name="plus" size={28} /></div>
          <div className="import-result-card__value">{results?.added ?? 0}</div>
          <div className="import-result-card__label">Productos agregados</div>
        </div>
        <div className="import-result-card import-result-card--info">
          <div className="import-result-card__icon"><Icon name="edit" size={28} /></div>
          <div className="import-result-card__value">{results?.updated ?? 0}</div>
          <div className="import-result-card__label">Productos actualizados</div>
        </div>
        <div className="import-result-card import-result-card--danger">
          <div className="import-result-card__icon"><Icon name="x" size={28} /></div>
          <div className="import-result-card__value">{results?.errors?.length ?? 0}</div>
          <div className="import-result-card__label">Errores</div>
        </div>
      </div>

      {results?.errors?.length > 0 && (
        <div className="import-error-list">
          <h4 style={{ marginBottom: 10, color: 'var(--danger)' }}>Filas con errores</h4>
          <div className="import-table-wrap" style={{ marginBottom: 0 }}>
            <table className="import-table import-table--compact">
              <thead>
                <tr><th>item_code</th><th>Nombre</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {results.errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.item_code}</td>
                    <td>{e.name}</td>
                    <td style={{ color: 'var(--danger)' }}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="import-result-actions">
        <button className="btn btn--ghost" onClick={() => downloadReport(results ?? {})}>
          <Icon name="download" size={15} /> Descargar reporte
        </button>
        <button className="btn btn--ghost" onClick={reset}>
          <Icon name="upload" size={15} /> Importar otro archivo
        </button>
        <button className="btn btn--primary" onClick={() => navigate('/products')}>
          <Icon name="products" size={15} /> Ir a Productos
        </button>
      </div>
    </div>
  );
};

export default Import;
