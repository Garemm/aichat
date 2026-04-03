// ── Admin Router — root ──────────────────────────────────────────────────────
const router      = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');

const authController      = require('../controllers/authController');
const businessController  = require('../controllers/businessController');
const productController   = require('../controllers/productController');
const serviceController   = require('../controllers/serviceController');
const promotionController = require('../controllers/promotionController');
const hoursController     = require('../controllers/hoursController');

// ── Auth (public) ─────────────────────────────────────────────────────────────
router.post('/login', authController.login);

// ── All routes below require auth ────────────────────────────────────────────
router.use(requireAuth);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get('/dashboard', businessController.getStats);

// ── Business info ─────────────────────────────────────────────────────────────
router.get('/business',  businessController.getInfo);
router.put('/business',  businessController.updateInfo);

// ── Categories (read-only helper for dropdowns) ───────────────────────────────
router.get('/categories', productController.listCategories);

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products',      productController.list);
router.get('/products/:id',  productController.getById);
router.post('/products',     productController.create);
router.put('/products/:id',  productController.update);
router.delete('/products/:id', productController.remove);

// ── Services ──────────────────────────────────────────────────────────────────
router.get('/services',      serviceController.list);
router.get('/services/:id',  serviceController.getById);
router.post('/services',     serviceController.create);
router.put('/services/:id',  serviceController.update);
router.delete('/services/:id', serviceController.remove);

// ── Promotions ────────────────────────────────────────────────────────────────
router.get('/promotions',      promotionController.list);
router.get('/promotions/:id',  promotionController.getById);
router.post('/promotions',     promotionController.create);
router.put('/promotions/:id',  promotionController.update);
router.delete('/promotions/:id', promotionController.remove);

// ── Business Hours ────────────────────────────────────────────────────────────
router.get('/hours',        hoursController.list);
router.post('/hours/bulk',  hoursController.bulkSave);
router.post('/hours',       hoursController.upsertOne);
router.delete('/hours/:id', hoursController.remove);

module.exports = router;
