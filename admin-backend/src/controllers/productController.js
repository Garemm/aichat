// ── Product Controller ────────────────────────────────────────────────────────
const ProductModel  = require('../models/productModel');
const CategoryModel = require('../models/categoryModel');

const list = async (req, res, next) => {
  try {
    const products = await ProductModel.findAllByBusiness(req.businessId);
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const product = await ProductModel.findById(parseInt(req.params.id, 10), req.businessId);
    if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const product = await ProductModel.create(req.businessId, req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const product = await ProductModel.update(parseInt(req.params.id, 10), req.businessId, req.body);
    if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await ProductModel.delete(parseInt(req.params.id, 10), req.businessId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    res.json({ success: true });
  } catch (err) { next(err); }
};

const listCategories = async (req, res, next) => {
  try {
    const categories = await CategoryModel.findByBusiness(req.businessId);
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove, listCategories };
